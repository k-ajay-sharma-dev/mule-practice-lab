import { diagram } from '../../arch/dsl.js'

const students = (rps, spike) => [
  { name: 'portal', from: 'web-app', rps, to: { type: 'database', label: 'results' }, ...(spike ? { spikes: [{ at: 5, forMin: 10, rps: spike }] } : {}) },
  { name: 'app', from: 'mobile-app', rps, to: { type: 'database', label: 'results' }, ...(spike ? { spikes: [{ at: 5, forMin: 10, rps: spike }] } : {}) },
]

export default {
  id: 'uc-124',
  category: 'use-cases',
  title: 'Exam Results Day: 15,000 Students at 09:00 Against a Student System That Takes 50 Requests a Second',
  level: 'ADVANCED',
  tags: ['peak-load', 'read-models', 'pre-staging', 'jwt', 'notifications', 'education'],
  estMinutes: 45,
  diagram: {
    task: 'draw the results day design: the student portal and app calling through an API gateway that validates tokens from the identity provider, an Experience and a Process API that read a results read store, a loader job that fills the store from the SIS through a System API the night before, and a release notifier that queues a message per student for a notification Process API and the email and SMS provider.',
    checks: [
      { label: 'Students come in through the API gateway', rule: { type: 'each', of: ['web-app', 'mobile-app'], min: 2, edgeTo: 'api-gateway' } },
      { label: 'The gateway validates tokens issued by the identity provider', rule: { type: 'edge', from: 'api-gateway', to: 'identity-provider' } },
      { label: 'The results APIs read a results read store', rule: { type: 'path', from: 'experience-api', via: 'process-api', to: { type: 'database', label: 'results' } } },
      { label: 'No student request reaches the SIS', rule: { type: 'no-path', from: ['web-app', 'mobile-app'], to: 'legacy' } },
      { label: 'A loader job reads the SIS through a System API', rule: { type: 'path', from: 'batch-job', via: 'system-api', to: 'legacy' } },
      { label: 'The loader writes the results read store', rule: { type: 'edge', from: { type: 'batch-job', label: 'loader' }, to: { type: 'database', label: 'results' } } },
      { label: 'The SIS is reached only through the System API', rule: { type: 'only-via', target: 'legacy', from: 'system-api' } },
      { label: 'Release notifications go through a queue', rule: { type: 'path', from: 'batch-job', via: 'queue', to: 'notification' } },
      { label: 'No job calls the email and SMS provider directly', rule: { type: 'no-path', from: 'batch-job', to: 'notification', kind: 'sync' } },
      { label: 'The notification queue has a dead-letter queue', rule: { type: 'each', of: 'queue', edgeTo: 'dlq' } },
      { label: 'Every line to or from a queue is an async message', rule: { type: 'lines', touching: ['queue', 'dlq'], kind: 'async' } },
    ],
    reference: diagram(
      {
        web: ['web-app', 'Student portal'],
        mob: ['mobile-app', 'Student app'],
        idp: ['identity-provider', 'University identity provider'],
        gw: ['api-gateway', 'API gateway (JWT validation)', { auth: 'jwt' }],
        exp: ['experience-api', 'exp-student-results-api', { replicas: 2, vCores: '1' }],
        prc: ['process-api', 'prc-results', { replicas: 2, vCores: '1' }],
        store: ['database', 'Results read store (published results)'],
        load: ['batch-job', 'Results loader (runs the night before)'],
        sys: ['system-api', 'sys-sis-results'],
        sis: ['legacy', 'Student information system (SIS)'],
        note: ['batch-job', 'Release notifier (09:00)', { vCores: '0.5' }],
        q: ['queue', 'results-released', { maxRedelivery: 10 }],
        dlq: ['dlq', 'results-released DLQ'],
        ntf: ['process-api', 'prc-student-notifications'],
        msg: ['notification', 'Email and SMS provider'],
      },
      [
        'web -> idp', 'mob -> idp', 'web -> gw', 'mob -> gw', 'gw -> idp', 'gw -> exp', 'exp -> prc', 'prc -> store',
        'load -> sys', 'sys -> sis', 'load -> store',
        'note -> store', 'note ~> q', 'q ~> ntf', 'q ~> dlq', 'ntf -> msg',
      ],
    ),
    simulation: {
      systems: [
        { match: 'legacy', latencyMs: 400, maxRps: 50 },
        { match: 'database', latencyMs: 10 },
        { match: 'notification', latencyMs: 300, maxRps: 100 },
      ],
      tests: [
        {
          name: 'Results go live at 09:00',
          about: 'Students check now and then before 09:00. From minute 5, the portal and the app each get 400 requests a second for 10 minutes. Every request is answered quickly and none reaches the SIS.',
          traffic: students(20, 400),
          durationMin: 20,
          expect: { answers: [{ minSuccess: 0.99, maxMs: 300 }], notReached: [{ node: 'legacy' }] },
        },
        {
          name: 'The SIS is down on results morning',
          about: 'The SIS fails at 08:00 and stays down for two hours. Students read their results all the same, because they were loaded the night before.',
          traffic: students(20, 400),
          incidents: [{ down: 'legacy', at: 0, forMin: 120 }],
          durationMin: 30,
          expect: { answers: [{ minSuccess: 0.99 }] },
        },
        {
          name: 'Every student is told',
          about: 'At 09:00 the notifier queues a message for each of 15,000 students, 250 a second for a minute. The provider takes 100 a second, so the queue holds the rest, and every student gets a message within minutes.',
          traffic: [{ name: 'notices', from: { type: 'batch-job', label: 'notifier' }, rps: 250, forMin: 1, to: 'notification', kind: 'write' }],
          durationMin: 15,
          expect: { answers: [{ minSuccess: 0.99 }], delivered: [{ to: 'notification', min: 0.99 }], backlog: [{ queue: 'queue', maxEnd: 0 }], lost: { max: 0 } },
        },
      ],
    },
  },
  description: `
A university publishes final exam results to **15,000 students** at **09:00** on results day. Students sign in to the student portal or the student app with the university's identity provider, and see only their own results.

Last year the portal asked the **student information system** (SIS) for each student's results when they opened the page. At 09:00 about **800 requests a second** arrived. The SIS answers about **50 a second** and takes about 400 ms. It stopped answering at 09:02, and the portal was down until 11:30. Students posted screenshots of the error page.

Facts:
- Results are final and approved by the exam board the evening before. Nothing changes overnight.
- Results must not be visible to anyone before 09:00.
- Each student also gets an email and a text when results go live. The provider takes **100 messages a second**.
- The SIS has a maintenance window most Saturday mornings, and results day this year is a Saturday.
- Before 09:00 a few students check every minute, about 20 requests a second from each channel. From 09:00, plan for 400 requests a second from each channel for 10 minutes.
- Every request carries the student's token (a JWT), and each must be answered within 300 ms. A Mule replica answers about 500 simple requests a second per vCore.

**Questions:**
- Draw a design where the 09:00 peak never reaches the SIS.
- How do the results get from the SIS to where students read them, and how do you keep them hidden until 09:00?
- How do students get their own results and nobody else's?
- How are 15,000 notifications sent without overloading the provider?
`,
  answerTemplate: `## Design

## Loading the results

## Releasing at 09:00

## Who can see what

## Notifications

## Sizing for the peak
`,
  keyPoints: [
    'The results are fixed the night before, so load them ahead into a read store built for the peak. Do the slow work when nobody is waiting.',
    'Students read only from the read store. The SIS sees one gentle loader run, not 800 requests a second.',
    'A release time on the published results, checked by the Process API, keeps them hidden until 09:00 without a deployment at 09:00.',
    'The gateway validates the JWT locally with the identity provider\'s published keys, and the API returns only the results for the student ID in the token.',
    'Size the read path for the peak, with headroom: 800 requests a second needs about 2 vCores each for the Experience and Process API in this model.',
    'Queue one message per student and let a consumer send them at the provider\'s rate. The burst is levelled over about two and a half minutes.',
    'Test the peak with a load test the week before, and do a dry run of the release with test data.',
  ],
  solution: `
**Design**
\`\`\`
Student portal ─┐                                   ┌─► identity provider (signing keys)
Student app    ─┴─► API gateway (JWT validation) ───┘
                        └─► exp-student-results-api ─► prc-results ─► Results read store
Results loader (night before) ─► sys-sis-results ─► SIS
                              └─► Results read store
Release notifier (09:00) ─► Results read store (who to tell)
                         ~► results-released ~► prc-student-notifications ─► Email and SMS provider
                                     ~► DLQ
\`\`\`

**Loading the results.** At 22:00, once the board has signed off, the loader asks \`sys-sis-results\` for the results page by page, at about 20 calls a second, well under what the SIS can take. It writes them to the read store with a \`releaseAt\` of 09:00 the next day. A check counts the rows against the SIS before midnight.

**Releasing at 09:00.** \`prc-results\` returns results only when the current time is past their \`releaseAt\`. Before that it answers "Results will be available at 09:00". Nobody has to deploy or flip a switch at 09:00, and an early request sees nothing.

**Who can see what.** The gateway validates each JWT with the identity provider's published signing keys, so a token check does not call the identity provider at 09:00. The Process API takes the student ID from the token, never from the URL, and reads only that student's rows.

**Notifications.** At 09:00 the notifier reads the list of students from the read store and queues one message each, about 250 a second for a minute. \`prc-student-notifications\` sends them at the provider's 100 a second, so all 15,000 go out in about two and a half minutes. Failures are retried, and a bad address ends in the DLQ.

**Sizing for the peak.** 800 requests a second for 10 minutes. The Experience and Process APIs each run 2 replicas of 1 vCore, about 1,000 requests a second for each API in this model. The notifier queues 250 messages a second, so it runs on 0.5 vCore. The read store answers by primary key in milliseconds. The results are also small enough to cache in the Process API once released.

**The Saturday maintenance window.** The SIS can be down all morning. Nothing on the read path needs it.
`,
  followUps: [
    {
      q: 'Why not put a cache in front of the SIS?',
      a: 'Each student reads their own results once or twice, so a cache has almost nothing to reuse at 09:00. Every first read would still go to the SIS. Loading every result ahead is the cache that works here.',
    },
    {
      q: 'What if the exam board corrects one result after the load?',
      a: 'Run the loader for that student, or publish the change through the same System API. The read store is the copy students see, so it must be updated the same way, never by hand.',
    },
    {
      q: 'Why validate the JWT at the gateway instead of asking the identity provider about each token?',
      a: 'Asking about each token would send 800 calls a second to the identity provider at 09:00. A signed JWT can be checked locally with the provider\'s keys.',
    },
  ],
}
