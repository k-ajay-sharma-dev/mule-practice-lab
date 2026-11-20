import { diagram } from '../../arch/dsl.js'

const national = { type: 'external-api', label: 'national' }
const updates = { name: 'bed updates', from: 'internal-app', rps: 10, to: ['database', national], kind: 'write' }
const screens = { name: 'bed board screens', from: 'web-app', rps: 300, to: 'database' }

export default {
  id: 'uc-145',
  category: 'use-cases',
  title: 'A Hospital Bed Board: Ward Tablets Publish Each Change Once, the Board Reads From a Cache, and the National Reporting Service May Lag Without Holding Anyone Up',
  level: 'INTERMEDIATE',
  tags: ['healthcare', 'topic', 'cache', 'read-write-split', 'event-driven', 'reporting'],
  estMinutes: 30,
  diagram: {
    task: 'draw the ward tablets calling a bed status Experience API, which publishes each change to a topic. One subscriber writes the change to the bed board database through a System API; another sends it to the national bed reporting service through a System API. Draw the bed board screens calling their own Experience API, which reads a cache and otherwise the bed board database through a System API.',
    checks: [
      { label: 'The ward tablets call an Experience API', rule: { type: 'edge', from: 'internal-app', to: 'experience-api' } },
      { label: 'Bed changes are published to a topic', rule: { type: 'path', from: 'internal-app', via: 'topic', to: 'database' } },
      { label: 'The national service gets the changes from the same topic', rule: { type: 'path', from: 'internal-app', via: 'topic', to: national } },
      { label: 'The screens call their own Experience API, which reads a cache', rule: { type: 'path', from: 'web-app', via: 'experience-api', to: 'cache' } },
      { label: 'The screens never wait on the national service', rule: { type: 'no-path', from: 'web-app', to: national } },
      { label: 'The national service is reached only through a System API', rule: { type: 'only-via', target: national, from: 'system-api' } },
    ],
    reference: diagram(
      {
        ward: ['internal-app', 'Ward tablets'],
        expW: ['experience-api', 'exp-bed-status'],
        t: ['topic', 'bed-status-changes'],
        sysB: ['system-api', 'sys-bed-board'],
        sysN: ['system-api', 'sys-national-beds'],
        db: ['database', 'Bed board database'],
        nat: ['external-api', 'National bed reporting service'],
        scr: ['web-app', 'Bed board screens'],
        expB: ['experience-api', 'exp-bed-board', { replicas: 2, vCores: '1' }],
        c: ['cache', 'Bed board cache', { ttlSec: 10 }],
        sysR: ['system-api', 'sys-bed-board-read', { replicas: 2 }],
      },
      ['ward -> expW', 'expW ~> t', 't ~> sysB', 't ~> sysN', 'sysB -> db', 'sysN -> nat', 'scr -> expB', 'expB -> c', 'expB -> sysR', 'sysR -> db'],
    ),
    simulation: {
      systems: [
        { match: 'database', latencyMs: 30, maxRps: 80 },
        { match: national, latencyMs: 900 },
      ],
      cache: { hitRatio: 0.95, atTtlSec: 10 },
      tests: [
        {
          name: 'A busy winter morning',
          about: 'Wards send 10 bed changes a second while 300 screens refresh every second. The screens are answered fast, and every change reaches the board and the national service.',
          traffic: [updates, screens],
          durationMin: 30,
          expect: {
            answers: [{ flow: 'bed board screens', minSuccess: 0.99, maxMs: 200 }, { flow: 'bed updates', minSuccess: 0.99, maxMs: 300 }],
            delivered: [{ flow: 'bed updates', to: 'database', min: 0.99 }, { flow: 'bed updates', to: national, min: 0.99 }],
            peakRps: [{ node: 'database', max: 80 }],
          },
        },
        {
          name: 'The national service is down for two hours',
          about: 'The national service has a long outage. The bed board is not affected at all. The national copies wait and all arrive once it is back.',
          traffic: [updates, screens],
          incidents: [{ down: national, at: 5, forMin: 120 }],
          durationMin: 180,
          expect: {
            answers: [{ flow: 'bed board screens', minSuccess: 0.99 }, { flow: 'bed updates', minSuccess: 0.99 }],
            delivered: [{ flow: 'bed updates', to: 'database', min: 0.99 }, { flow: 'bed updates', to: national, min: 0.99 }],
            lost: { max: 0 },
          },
        },
        {
          name: 'An availability zone goes down',
          about: 'One zone fails. The bed board screens keep working from the replica in the other zone.',
          traffic: [screens],
          incidents: [{ zone: true, at: 5, forMin: 10 }],
          durationMin: 20,
          expect: { answers: [{ flow: 'bed board screens', minSuccess: 0.99 }] },
        },
      ],
    },
  },
  description: `
A hospital trust shows a live **bed board**: large screens in the control room and on every ward show which beds are free, being cleaned or taken. Nurses update a bed's status on **ward tablets**. The trust must also send every change to a **national bed reporting service**.

Today each tablet update calls Mule, which writes the **bed board database** and then calls the national service. The national service is slow and sometimes down for hours. When it is, tablet updates fail and the board goes out of date at the worst moment. Each of the **bed board screens** also queries the database every second, and the database is struggling.

**Numbers**
- About **10 bed changes a second** at the busiest.
- About **300 screen refreshes a second**.
- The bed board database takes about **80 calls a second**.
- The national service answers in about 900 ms and has had outages of two hours.
- Clinicians accept a board up to **10 seconds** old.
- A screen must be answered within **200 ms** and a tablet within **300 ms**. No bed change may be lost, for the board or for the national service.
- The screens must keep working if one availability zone of the cloud fails.

**Questions:**
- Draw the design.
- How do bed changes reach two places without the slow one holding up the other?
- How do 300 refreshes a second fit a database that takes 80?
- What happens during a national service outage?
`,
  answerTemplate: `## Design

## Publishing each change once

## The screens

## When the national service is down
`,
  keyPoints: [
    'Publish each bed change once to a topic. The bed board and the national service each have their own subscriber, so neither waits for the other.',
    'The tablet is answered as soon as the change is published. The national service is not on that path.',
    'The screens have their own Experience API with a cache of 10 seconds, the age clinicians accept. Most refreshes never reach the database.',
    'Keep the screens\' reads apart from the tablets\' writes, so a flood of refreshes cannot slow the updates.',
    'During a national outage the national copies wait on the broker and arrive later. The bed board does not notice.',
  ],
  solution: `
**Design**
\`\`\`
Ward tablets ─► exp-bed-status ~► bed-status-changes (topic) ~► sys-bed-board ──► Bed board database
                                                         ~► sys-national-beds ─► National bed reporting service
Bed board screens ─► exp-bed-board ─► Bed board cache (10 s)
                                 └─► sys-bed-board-read ─► Bed board database
\`\`\`

**Publishing each change once.** On Anypoint MQ the topic is an exchange bound to two queues. The bed board subscriber keeps up in seconds. The national subscriber is as slow as the national service and may fall behind.

**The screens.** About 95 in 100 refreshes are answered from the cache, so the database sees about 15 reads a second plus the writes. Two replicas of the screens API keep the board up through a zone outage. Each replica gets 1 vCore, so one of them alone can take all 300 refreshes a second while the other zone is down. The read System API behind it has two replicas too.

**When the national service is down.** Its copies wait on its queue. With no redelivery limit on that queue, they wait until the service is back. A national copy that is two hours late still has its original timestamp, which the national service uses.
`,
  followUps: [
    {
      q: 'Should the screens get changes pushed to them instead of refreshing every second?',
      a: 'It would cut the load further, for example with a websocket or server sent events from a small service fed by the topic. The cache is the smaller first step and may be enough.',
    },
    {
      q: 'Two nurses change the same bed within a second. Which change wins?',
      a: 'The board should apply changes by the time they were made on the tablet, and ignore one older than what it holds, since messages for one bed can arrive out of order.',
    },
  ],
}
