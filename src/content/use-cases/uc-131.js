import { diagram } from '../../arch/dsl.js'

const positions = { type: 'database', label: 'position' }
const buses = { name: 'bus positions', from: 'device', rps: 30, to: positions, kind: 'write' }
const parents = { name: 'parents', from: 'mobile-app', rps: 400, to: positions }

export default {
  id: 'uc-131',
  category: 'use-cases',
  title: 'Where Is the School Bus? GPS Positions In Through a Queue, Parents Read the Latest One From the District\'s Own Copy',
  level: 'BEGINNER',
  tags: ['iot', 'gps', 'anypoint-mq', 'experience-api', 'read-model', 'education'],
  estMinutes: 20,
  diagram: {
    task: 'draw two paths: the GPS trackers on the buses send positions to an Experience API that puts them on a queue, and a Process API saves the latest position of each bus in a database. The parents\' app calls its own Experience API, which reads the latest positions through a System API.',
    checks: [
      { label: 'The trackers send positions to an Experience API', rule: { type: 'edge', from: 'device', to: 'experience-api' } },
      { label: 'Positions wait on a queue before they are saved', rule: { type: 'path', from: 'device', via: 'queue', to: positions } },
      { label: 'The parents\' app reads the latest positions', rule: { type: 'path', from: 'mobile-app', via: 'system-api', to: positions } },
      { label: 'The trackers and the parents\' app each have their own Experience API', rule: { type: 'each', of: 'experience-api', min: 2, edgeFrom: ['device', 'mobile-app'], max: 1 } },
      { label: 'A parent\'s request never goes through the queue', rule: { type: 'no-path', from: 'mobile-app', to: 'queue' } },
      { label: 'Every line to or from a queue is an async message', rule: { type: 'lines', touching: 'queue', kind: 'async' } },
    ],
    reference: diagram(
      {
        bus: ['device', 'GPS trackers on 150 buses'],
        expT: ['experience-api', 'exp-bus-trackers'],
        q: ['queue', 'bus-positions'],
        prc: ['process-api', 'prc-bus-positions'],
        db: ['database', 'Latest position per bus'],
        app: ['mobile-app', 'Parents\' app'],
        expP: ['experience-api', 'exp-parents-app', { vCores: '1' }],
        sys: ['system-api', 'sys-bus-positions', { vCores: '1' }],
      },
      ['bus -> expT', 'expT ~> q', 'q ~> prc', 'prc -> db', 'app -> expP', 'expP -> sys', 'sys -> db'],
    ),
    simulation: {
      systems: [{ match: 'database', latencyMs: 10, maxRps: 2000 }],
      tests: [
        {
          name: 'The morning school run',
          about: '150 buses send a position every 5 seconds, and 400 parents a second open the app between 07:30 and 08:15. Every position is saved and every parent gets an answer quickly.',
          traffic: [buses, parents],
          durationMin: 45,
          expect: { answers: [{ minSuccess: 0.99 }, { flow: 'parents', maxMs: 300 }], delivered: [{ flow: 'bus positions', to: positions, min: 0.99 }], lost: { max: 0 } },
        },
        {
          name: 'The position saver restarts',
          about: 'The Process API that saves positions is down for 5 minutes during a release. Trackers keep sending, positions wait on the queue, and none is lost.',
          traffic: [buses, { ...parents, rps: 50 }],
          incidents: [{ down: { type: 'process-api', label: 'positions' }, at: 5, forMin: 5 }],
          durationMin: 30,
          expect: { answers: [{ flow: 'bus positions', minSuccess: 0.99 }], lost: { max: 0 }, backlog: [{ queue: 'queue', maxEnd: 0 }] },
        },
      ],
    },
  },
  description: `
A school district runs **150 school buses**. Each has a **GPS tracker** that sends its position every 5 seconds over the mobile network. The district wants a **parents' app** that shows where their child's bus is.

The tracker vendor offers a live map API, but its contract allows a few calls a minute, and the district does not want 10,000 parents to depend on it. The trackers can instead post each position to an address the district gives them.

**Numbers**
- 150 buses, one position every 5 seconds: about **30 positions a second**.
- Between 07:30 and 08:15 parents open the app about **400 times a second**.
- Parents only ever need the **latest** position of one bus.

**Questions:**
- Draw the design. Where do positions go, and where do parents read from?
- Why put a queue between the trackers and the database?
- Why does the parents' app have its own Experience API?
`,
  answerTemplate: `## Design

## Positions in

## Parents read

## Sizing
`,
  keyPoints: [
    'Trackers post positions to an Experience API made for them, which puts each position on a queue and answers at once.',
    'A Process API takes positions from the queue and keeps only the latest one per bus in a database.',
    'Parents read that latest position through their own Experience API and a System API. They never touch the queue or the tracker vendor.',
    'The queue keeps positions safe while the saver restarts or the database is busy.',
    'Each channel gets its own Experience API: trackers and parents have different security, traffic and change rates.',
    'Size the parents\' path for the morning peak. In this model 400 reads a second is more than the smallest size takes.',
  ],
  solution: `
**Design**
\`\`\`
GPS trackers ─► exp-bus-trackers ~► bus-positions ~► prc-bus-positions ─► Latest position per bus
Parents' app ─► exp-parents-app ─► sys-bus-positions ──────────────────────┘
\`\`\`

**Positions in.** The trackers authenticate to \`exp-bus-trackers\`, which checks the message and publishes it. \`prc-bus-positions\` writes one row per bus, replacing the older position. A position older than the stored one is ignored.

**Parents read.** \`exp-parents-app\` checks that the parent is linked to a child on that bus, then reads one row through \`sys-bus-positions\`. That is a small, fast query, however many parents ask.

**Sizing.** The tracker path carries 30 messages a second, which the smallest size takes. The parents' path carries 400 reads a second, so one vCore each for its Experience and System API in this model.
`,
  followUps: [
    {
      q: 'Should a parent see every bus?',
      a: 'No. The Experience API must only return the bus of the parent\'s own child, during the school run. Bus positions are children\'s locations and need the same care as any personal data.',
    },
    {
      q: 'How would you add "the bus is 5 minutes away" alerts?',
      a: 'Let the Process API publish an event when a bus passes a point near each stop, and have a notification service send a push message to the parents who asked for it.',
    },
  ],
}
