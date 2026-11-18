import { diagram } from '../../arch/dsl.js'

const centres = { type: 'internal-app', label: 'counting' }
const submissions = { name: 'result submissions', from: centres, rps: 5, to: 'database', kind: 'write' }
const readers = { name: 'public reads', from: 'web-app', rps: 600, to: 'database' }
const publicApi = { type: 'experience-api', label: 'public' }

export default {
  id: 'ar-169',
  category: 'architecture',
  title: 'Election Night Results: Counting Centres Submit Through Mutual TLS and a Queue That Loses Nothing, While a Cached Public Site Takes 1,500 Reads a Second Without Touching the Database',
  level: 'EXPERT',
  tags: ['myproject', 'read-write-split', 'cache', 'mtls', 'queue', 'dlq', 'availability', 'public-sector'],
  estMinutes: 55,
  diagram: {
    task: 'draw the counting centre app calling an API gateway, which calls a submissions Experience API. That API puts each result on a queue with a dead-letter queue; a results Process API reads the queue and writes to the results database through a System API. Draw the public results website calling a public Experience API that reads a cache and otherwise the results database through a read System API.',
    checks: [
      { label: 'Counting centres come in through the API gateway', rule: { type: 'edge', from: centres, to: 'api-gateway' } },
      { label: 'Submissions wait on a queue before they reach the database', rule: { type: 'path', from: centres, via: 'queue', to: 'database' } },
      { label: 'The submissions queue has a dead-letter queue', rule: { type: 'each', of: 'queue', edgeTo: 'dlq' } },
      { label: 'The public site calls its own Experience API', rule: { type: 'edge', from: 'web-app', to: publicApi } },
      { label: 'The public Experience API reads a cache', rule: { type: 'edge', from: publicApi, to: 'cache' } },
      { label: 'The public site never reaches the submissions path', rule: { type: 'no-path', from: 'web-app', to: 'queue' } },
      { label: 'The results database is reached only through System APIs', rule: { type: 'only-via', target: 'database', from: 'system-api' } },
    ],
    reference: diagram(
      {
        cc: ['internal-app', 'Counting centre app'],
        gw: ['api-gateway', 'API gateway (mutual TLS)', { auth: 'mtls' }],
        expS: ['experience-api', 'exp-result-submissions', { replicas: 2, vCores: '0.1' }],
        q: ['queue', 'result-submissions', { maxRedelivery: 120 }],
        dlq: ['dlq', 'result-submissions DLQ'],
        prc: ['process-api', 'prc-results', { replicas: 2 }],
        sysW: ['system-api', 'sys-results-write', { replicas: 2 }],
        web: ['web-app', 'Public results website'],
        expP: ['experience-api', 'exp-public-results', { replicas: 2, vCores: '2', rateLimit: 2000 }],
        c: ['cache', 'Results cache', { ttlSec: 30 }],
        sysR: ['system-api', 'sys-results-read', { replicas: 2, vCores: '0.2' }],
        db: ['database', 'Results database'],
      },
      ['cc -> gw', 'gw -> expS', 'expS ~> q', 'q ~> prc', 'q ~> dlq', 'prc -> sysW', 'sysW -> db', 'web -> expP', 'expP -> c', 'expP -> sysR', 'sysR -> db'],
    ),
    simulation: {
      systems: [{ match: 'database', latencyMs: 60, maxRps: 100 }],
      cache: { hitRatio: 0.98, atTtlSec: 30 },
      tests: [
        {
          name: 'Results night',
          about: 'Counting centres submit 5 results a second while the public reads 600 a second, rising to 1,500 when the big seats declare. Every read is answered, every result is stored, and the database never sees more than 100 calls a second.',
          traffic: [submissions, { ...readers, spikes: [{ at: 20, forMin: 15, rps: 1500 }] }],
          durationMin: 60,
          expect: {
            answers: [{ flow: 'public reads', minSuccess: 0.99, maxMs: 300 }, { flow: 'result submissions', minSuccess: 0.99 }],
            delivered: [{ flow: 'result submissions', to: 'database', min: 0.99 }],
            peakRps: [{ node: 'database', max: 100 }],
            lost: { max: 0 },
          },
        },
        {
          name: 'A submission without a certificate',
          about: 'Someone who is not a counting centre tries to post results. The gateway refuses every one, and nothing reaches the queue or the database.',
          traffic: [{ ...submissions, name: 'no certificate', auth: 'none' }],
          durationMin: 10,
          expect: { answers: [{ flow: 'no certificate', minRefused: 0.99 }], notReached: [{ flow: 'no certificate', node: 'queue' }] },
        },
        {
          name: 'The database fails over',
          about: 'The results database is down for 10 minutes while it fails over. Results wait on the queue and none is lost. The public site keeps answering from the cache.',
          traffic: [submissions, readers],
          incidents: [{ down: 'database', at: 10, forMin: 10 }],
          durationMin: 40,
          expect: { answers: [{ flow: 'public reads', minSuccess: 0.95 }], delivered: [{ flow: 'result submissions', to: 'database', min: 0.99 }], lost: { max: 0 }, dlq: { max: 0 } },
        },
        {
          name: 'An availability zone goes down',
          about: 'One zone fails during the evening. Every API has a replica in the other zone, so reads and submissions carry on.',
          traffic: [submissions, readers],
          incidents: [{ zone: true, at: 5, forMin: 15 }],
          durationMin: 30,
          expect: { answers: [{ flow: 'public reads', minSuccess: 0.99 }], delivered: [{ flow: 'result submissions', to: 'database', min: 0.99 }] },
        },
      ],
    },
  },
  description: `
A national electoral body publishes **election night results**. Staff at about 600 **counting centres** submit each declared result through the **counting centre app**. The **public results website** shows the results as they come in, and news sites read it all night.

Two things went wrong at the last election. The website went down at 23:00 when the big seats declared, because every page view queried the **results database**. And during a database failover, 14 submissions failed and had to be typed in again by phone.

**Numbers**
- About **5 submissions a second** at the busiest, each a few kilobytes.
- Public reads: about **600 a second**, rising to **1,500 a second** for 15 minutes around 23:00.
- The results database takes about **100 calls a second** before it slows down. A failover takes up to 10 minutes.
- About 98% of reads are for results that have not changed in the last 30 seconds.
- Only counting centres may submit. Each centre's app has a client certificate.

**Questions:**
- Draw the design.
- How are the write path and the read path kept apart, and why?
- How does the public site take 1,500 reads a second against a database that takes 100?
- What happens to submissions during a failover, and to a submission that can never be stored?
- How do you stop anyone else from submitting results?
`,
  answerTemplate: `## Design

## Two paths

## The read path

## The write path

## Who may submit
`,
  keyPoints: [
    'Split the writes from the reads. They have different users, different numbers and different failure rules, and one must not hurt the other.',
    'Writes are few and must never be lost: a persistent queue between the submissions API and the database, with a redelivery limit long enough for a failover and a dead-letter queue for the rest.',
    'Reads are many and can be 30 seconds old: a cache in the public Experience API answers most of them, so the database sees a small share.',
    'Mutual TLS at the gateway lets only apps with a certificate the body issued submit anything. A rate limit on the public API protects it from a flood.',
    'Size the public API for the 23:00 spike, with replicas in two zones. Size the write path for its small, steady load, also with two replicas.',
    'Each submission carries a centre and seat ID, so a repeat after a timeout overwrites the same row instead of adding a second result.',
  ],
  solution: `
**Design**
\`\`\`
Counting centre app ─► API gateway (mTLS) ─► exp-result-submissions ~► result-submissions ~► prc-results ─► sys-results-write ─┐
                                                                         ~► DLQ                                                ├─► Results database
Public results website ─► exp-public-results ─► sys-results-read ─────────────────────────────────────────────────────────────┘
                                   └─► Results cache (30 s)
\`\`\`

**The read path.** \`exp-public-results\` keeps each answer for 30 seconds. About 98 in 100 reads come from the cache, so at 1,500 a second about 30 a second reach the database. Two replicas of 2 vCores take the spike and survive a zone outage. A rate limit of 2,000 a second stops a scraper from using up that room.

**The write path.** The centre gets "received" as soon as the result is on the queue. \`prc-results\` writes it. During a 10 minute failover the writes fail and are delivered again; in this model about once a minute, so 120 deliveries cover two hours. A result that fails every time, such as one for a seat that does not exist, ends on the DLQ for the duty team.

**Who may submit.** The gateway requires a client certificate signed by the body's own certificate authority. A stolen laptop's certificate can be revoked on the night.

**Why not one API for both.** A read spike would then share threads with submissions, and a failover would make the website fail with it.
`,
  followUps: [
    {
      q: 'A result is corrected after it was published. How does the public site show it within a minute?',
      a: 'The correction goes through the same queue and overwrites the row. The cache keeps the old value for at most 30 seconds. If that is too long for corrections, prc-results can clear that seat\'s cache entry after it writes.',
    },
    {
      q: 'News sites want every result as soon as it is stored, not by polling. What would you add?',
      a: 'An event after each write, on a topic the news partners subscribe to, or a webhook service. It sits beside the public site and does not change the write path.',
    },
  ],
}
