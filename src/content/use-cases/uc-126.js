import { diagram } from '../../arch/dsl.js'

const updates = { name: 'room updates', from: 'internal-app', rps: 25, to: 'saas', kind: 'write' }

export default {
  id: 'uc-126',
  category: 'use-cases',
  title: 'Housekeeping Marks Rooms Clean: Updates Reach the Hotel System Even During Its Night Audit',
  level: 'BEGINNER',
  tags: ['myproject', 'anypoint-mq', 'dlq', 'saas', 'store-and-forward', 'hospitality'],
  estMinutes: 20,
  diagram: {
    task: 'draw the room status path: the housekeeping tablets call an Experience API, which puts each update on a queue with a dead-letter queue. A room status Process API takes the updates from the queue and sends them to the property management system through a System API.',
    checks: [
      { label: 'The housekeeping tablets call an Experience API', rule: { type: 'edge', from: 'internal-app', to: 'experience-api' } },
      { label: 'The Experience API puts each update on a queue', rule: { type: 'edge', from: 'experience-api', to: 'queue', kind: 'async' } },
      { label: 'A tablet never waits on the property management system', rule: { type: 'no-path', from: 'internal-app', to: 'saas', kind: 'sync' } },
      { label: 'The property management system is reached only through a System API', rule: { type: 'only-via', target: 'saas', from: 'system-api' } },
      { label: 'The queue has a dead-letter queue', rule: { type: 'each', of: 'queue', edgeTo: 'dlq' } },
      { label: 'Every line to or from a queue is an async message', rule: { type: 'lines', touching: ['queue', 'dlq'], kind: 'async' } },
    ],
    reference: diagram(
      {
        tab: ['internal-app', 'Housekeeping tablets'],
        exp: ['experience-api', 'exp-housekeeping'],
        q: ['queue', 'room-status-updates', { maxRedelivery: 60 }],
        dlq: ['dlq', 'room-status-updates DLQ'],
        prc: ['process-api', 'prc-room-status'],
        sys: ['system-api', 'sys-pms-rooms'],
        pms: ['saas', 'Property management system (PMS)'],
      },
      ['tab -> exp', 'exp ~> q', 'q ~> prc', 'q ~> dlq', 'prc -> sys', 'sys -> pms'],
    ),
    simulation: {
      systems: [{ match: 'saas', latencyMs: 400, maxRps: 40 }],
      tests: [
        {
          name: 'The morning checkout rush',
          about: 'Housekeepers mark 25 rooms a second across the group. Each tablet gets its answer at once, and every update reaches the property management system.',
          traffic: [updates],
          durationMin: 30,
          expect: { answers: [{ minSuccess: 0.99, maxMs: 300 }], delivered: [{ to: 'saas', min: 0.99 }], lost: { max: 0 } },
        },
        {
          name: 'The night audit',
          about: 'The property management system is offline for 30 minutes during its night audit. Tablets keep working, the updates wait in the queue, and all of them arrive once it is back.',
          traffic: [{ ...updates, rps: 5 }],
          incidents: [{ down: 'saas', at: 5, forMin: 30 }],
          durationMin: 60,
          expect: { answers: [{ minSuccess: 0.99 }], lost: { max: 0 }, dlq: { max: 0 }, backlog: [{ queue: 'queue', maxEnd: 0 }] },
        },
        {
          name: 'A room number the hotel system does not know',
          about: 'One update in 100 is for a room that was renumbered, and the hotel system refuses it every time. Those updates go to the dead-letter queue, and the rest arrive.',
          traffic: [{ ...updates, poison: 0.01 }],
          durationMin: 120,
          expect: { delivered: [{ to: 'saas', min: 0.98 }], dlq: { min: 100 }, lost: { max: 0 } },
        },
      ],
    },
  },
  description: `
A group of 12 hotels uses a cloud **property management system (PMS)** for rooms and guests. When a housekeeper finishes a room, they tap "clean" on a **housekeeping tablet**, and the front desk can give the room to a waiting guest.

Today the tablet app calls the PMS's API directly. Two things go wrong:
- Every night the PMS runs its **night audit** and is offline for about **30 minutes**. Night-shift housekeepers see an error and write room numbers on paper.
- In the morning rush the group marks about **25 rooms a second**. The PMS sometimes takes several seconds to answer, and the tablets hang.

About 1 update in 100 is for a room number the PMS does not know, after rooms were renumbered in one hotel. The PMS refuses those every time.

Requirements:
- A tablet gets its answer within 300 ms, even when the PMS is slow or offline.
- No update may be lost.
- The queue redelivers a failed update about once a minute, and every delivery counts toward its redelivery limit. No good update may reach the DLQ because of the night audit, and refused updates must reach the DLQ.

**Questions:**
- Draw a design where a tablet never waits on the PMS.
- What happens to updates sent during the night audit?
- What happens to an update the PMS refuses every time?
`,
  answerTemplate: `## Design

## During the night audit

## Refused updates
`,
  keyPoints: [
    'Put a queue between the tablets and the PMS. The tablet gets its answer once the update is safely on the queue.',
    'A consumer sends the updates to the PMS at the pace it can take, through a System API that knows the PMS.',
    'During the night audit the updates wait on the queue and arrive once the PMS is back.',
    'Set a redelivery limit above what the audit needs, and draw a dead-letter queue, so a refused update stops being tried and is kept for someone to fix.',
    'The tablet only says "saved". The room becomes ready in the PMS a moment later.',
  ],
  solution: `
**Design**
\`\`\`
Housekeeping tablets ─► exp-housekeeping ~► room-status-updates ~► prc-room-status ─► sys-pms-rooms ─► PMS
                                                 ~► DLQ
\`\`\`

**During the night audit.** The tablets still get an answer from \`exp-housekeeping\` as soon as the update is on the queue. \`prc-room-status\` fails to reach the PMS, and the queue delivers the update again later. When the PMS is back, the waiting updates go through in a few seconds.

**Refused updates.** The queue tries each update up to 60 times, about an hour, which is more than the audit takes. An update for an unknown room fails every time and then moves to the DLQ. The front office manager gets a daily list and fixes the room numbers.
`,
  followUps: [
    {
      q: 'What if two updates for the same room arrive out of order, such as "dirty" after "clean"?',
      a: 'Send the time of the tap with each update, and have the Process API ignore an update older than the one the PMS already has for that room.',
    },
    {
      q: 'Why a System API for one PMS?',
      a: 'The guest app and the revenue system will call the PMS too. The System API keeps its login, its limits and its quirks in one place.',
    },
  ],
}
