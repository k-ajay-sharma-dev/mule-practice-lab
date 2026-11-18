import { diagram } from '../../arch/dsl.js'

const planning = { type: 'saas', label: 'planning' }
const moves = { name: 'stock movements', from: 'pos', rps: 20, to: planning, kind: 'write', spikes: [{ at: 10, forMin: 10, rps: 1200 }] }

export default {
  id: 'uc-154',
  category: 'use-cases',
  title: 'Six Hundred Stores Close at 21:00 and Send Their Stock Movements at Once: Queue Them for a Planning Platform That Takes 150 a Second, and Survive a Zone Outage at the Peak',
  level: 'ADVANCED',
  tags: ['myproject', 'queues', 'burst', 'load-levelling', 'sizing', 'availability', 'dlq', 'retail'],
  estMinutes: 45,
  diagram: {
    task: 'draw the store systems calling an API gateway that checks client IDs, then a stock movements Experience API. It puts each movement on a queue with a dead-letter queue. A stock movements Process API reads the queue and sends each movement to the supply chain planning platform through a System API.',
    checks: [
      { label: 'The stores come in through the API gateway', rule: { type: 'edge', from: 'pos', to: 'api-gateway' } },
      { label: 'The Experience API is reached only through the gateway', rule: { type: 'only-via', target: 'experience-api', from: 'api-gateway' } },
      { label: 'Movements wait on a queue before they reach the planning platform', rule: { type: 'path', from: 'pos', via: 'queue', to: planning } },
      { label: 'The stores never wait on the planning platform', rule: { type: 'no-path', from: 'pos', to: planning, kind: 'sync' } },
      { label: 'The queue has a dead-letter queue', rule: { type: 'each', of: 'queue', edgeTo: 'dlq' } },
      { label: 'The planning platform is reached only through a System API', rule: { type: 'only-via', target: planning, from: 'system-api' } },
    ],
    reference: diagram(
      {
        pos: ['pos', 'Store systems'],
        gw: ['api-gateway', 'API gateway', { auth: 'client-id' }],
        exp: ['experience-api', 'exp-stock-movements', { replicas: 2, vCores: '4' }],
        q: ['queue', 'stock-movements', { maxRedelivery: 45 }],
        dlq: ['dlq', 'stock-movements DLQ'],
        prc: ['process-api', 'prc-stock-movements', { replicas: 2, vCores: '0.2' }],
        sys: ['system-api', 'sys-planning-platform', { replicas: 2, vCores: '0.2' }],
        plan: ['saas', 'Supply chain planning platform'],
      },
      ['pos -> gw', 'gw -> exp', 'exp ~> q', 'q ~> prc', 'q ~> dlq', 'prc -> sys', 'sys -> plan'],
    ),
    simulation: {
      systems: [{ match: planning, latencyMs: 200, maxRps: 150 }],
      tests: [
        {
          name: 'Closing time',
          about: 'Through the evening about 20 movements a second arrive. At 21:00 the stores send 1,200 a second for ten minutes. Every store is answered at once, the planning platform never gets more than 150 a second, and the backlog is gone within two hours.',
          traffic: [moves],
          durationMin: 120,
          expect: { answers: [{ minSuccess: 0.99, maxMs: 500 }], peakRps: [{ node: planning, max: 150 }], backlog: [{ queue: 'queue', minPeak: 100000, maxEnd: 0 }], lost: { max: 0 } },
        },
        {
          name: 'A zone fails at 21:00',
          about: 'An availability zone goes down a minute before closing and stays down for the rush. The replicas in the other zone take all 1,200 a second.',
          traffic: [moves],
          incidents: [{ zone: true, at: 9, forMin: 12 }],
          durationMin: 30,
          expect: { answers: [{ minSuccess: 0.99 }], lost: { max: 0 } },
        },
        {
          name: 'Planning platform maintenance',
          about: 'The planning platform is down for 30 minutes on a quiet evening. Movements wait and are all delivered afterwards. None goes to the dead-letter queue.',
          traffic: [{ ...moves, spikes: undefined }],
          incidents: [{ down: planning, at: 5, forMin: 30 }],
          durationMin: 60,
          expect: { delivered: [{ to: planning, min: 0.99 }], dlq: { max: 0 }, lost: { max: 0 } },
        },
        {
          name: 'A movement for an unknown store',
          about: 'One movement in 1,000 is for a store code the planning platform does not know, and it is refused every time. Those end on the dead-letter queue.',
          traffic: [{ ...moves, spikes: undefined, poison: 0.001 }],
          durationMin: 90,
          expect: { dlq: { min: 20 }, lost: { max: 0 } },
        },
      ],
    },
  },
  description: `
Copperline Home Supply (fictional) runs 600 stores. At closing time each **store system** sends the day's stock movements (InventoryTransaction messages: sales, returns, transfers, write offs) so that the **supply chain planning platform**, a SaaS product, can plan the night's replenishment.

Most stores close at 21:00, so most movements arrive in the ten minutes after. Last month the platform was swamped, stores got errors, and the night's orders were planned on yesterday's stock.

**Numbers**
- About **20 movements a second** through the evening, then about **1,200 a second for 10 minutes** after 21:00.
- The planning platform answers in about 200 ms and takes up to **150 a second**.
- The platform is sometimes down for maintenance for up to **30 minutes**.
- About 1 movement in 1,000 is for a store code the platform does not know.
- In this model one vCore serves about 500 requests a second, and a failed delivery is tried again about once a minute.

**Questions:**
- Draw the design.
- How do stores get an answer at once at 1,200 a second?
- How big must the Experience API be so that one zone alone takes the rush?
- How long until the platform has everything, and what decides it?
- Choose a redelivery limit that survives maintenance but still moves refused movements to the DLQ.
`,
  answerTemplate: `## Design

## Answering the stores

## Sizing for a zone outage

## Draining the backlog

## The redelivery limit
`,
  keyPoints: [
    'The queue takes the burst and the consumer feeds the platform at its pace, so the stores never wait on it.',
    'One zone must take the whole rush: 1,200 a second needs about 2.4 vCores, so two replicas of 4 vCores leave room even when one is gone.',
    'Ten minutes at 1,200 a second is 720,000 movements. At 150 a second that takes about 80 minutes. The platform decides the drain time, not Mule.',
    'Size the consumers to reach the platform\'s 150 a second, and no more.',
    'A limit of 45 tries outlasts 30 minutes of maintenance, and a refused movement still reaches the DLQ within the hour.',
  ],
  solution: `
**Design**
\`\`\`
Store systems ─► API gateway (client ID) ─► exp-stock-movements ~► stock-movements ~► prc-stock-movements ─► sys-planning-platform ─► Planning platform
                                                                         ~► DLQ
\`\`\`

**Answering the stores.** The Experience API (2 replicas of 4 vCores) puts each movement on the queue and answers 202. With one zone down, one replica of 4 vCores still serves about 2,000 a second.

**Draining.** The Process API and System API run on 2 replicas of 0.2 vCore, about 200 a second, a little over the platform's 150. The platform's limit sets the pace: the backlog is gone about 80 minutes after the rush.

**The limit.** 45 deliveries, about 45 minutes, covers maintenance. A refused movement is in the DLQ within the hour, for the store systems team.

**Ask the platform.** If the planners need the stock by 22:00, ask whether the platform has a bulk load. One file of 720,000 movements loaded in one call may be faster than 150 calls a second.
`,
  followUps: [
    {
      q: 'Why not spread the stores\' send times instead?',
      a: 'It would help, and is worth asking for. But it depends on 600 store systems behaving. The queue protects the platform whatever the stores do.',
    },
    {
      q: 'Does the order of movements for one product matter?',
      a: 'It can: a sale and a return for the same product. Either the platform applies them by timestamp, or the consumer keeps one product\'s movements in order, for example with a FIFO queue grouped by store and product.',
    },
  ],
}
