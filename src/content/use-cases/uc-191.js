import { diagram } from '../../arch/dsl.js'

const checkout = { name: 'checkouts', from: 'web-app', rps: 40, to: 'oracle-db', kind: 'write' }

export default {
  id: 'uc-191',
  category: 'use-cases',
  title: 'Checkouts Keep Working While Oracle Switches to Its Standby: Accept the Order Onto a Queue, Write It When Oracle Is Back, and Survive a Zone Outage Too',
  level: 'ADVANCED',
  tags: ['myproject', 'oracle', 'queues', 'failover', 'availability', 'replicas', 'dlq'],
  estMinutes: 45,
  diagram: {
    task: 'draw the web shop calling a checkout Experience API. It checks the order and puts it on an orders queue with a dead-letter queue, then answers. An order writer Process API reads the queue and writes the order through an Oracle System API.',
    checks: [
      { label: 'The web shop calls the checkout Experience API', rule: { type: 'edge', from: 'web-app', to: 'experience-api' } },
      { label: 'Orders wait on a queue before they reach Oracle', rule: { type: 'path', from: 'web-app', via: 'queue', to: 'oracle-db' } },
      { label: 'A checkout never waits on Oracle', rule: { type: 'no-path', from: 'web-app', to: 'oracle-db', kind: 'sync' } },
      { label: 'The queue has a dead-letter queue', rule: { type: 'each', of: 'queue', edgeTo: 'dlq' } },
      { label: 'Oracle is reached only through a System API', rule: { type: 'only-via', target: 'oracle-db', from: 'system-api' } },
    ],
    reference: diagram(
      {
        web: ['web-app', 'Web shop'],
        exp: ['experience-api', 'exp-checkout', { replicas: 2 }],
        q: ['queue', 'orders.accepted', { maxRedelivery: 40 }],
        dlq: ['dlq', 'orders.accepted.dlq'],
        prc: ['process-api', 'prc-order-writer', { replicas: 2, vCores: '0.5' }],
        sys: ['system-api', 'sys-orders-oracle', { replicas: 2, vCores: '0.5' }],
        ora: ['oracle-db', 'Orders Oracle'],
      },
      ['web -> exp', 'exp ~> q', 'q ~> prc', 'q ~> dlq', 'prc -> sys', 'sys -> ora'],
    ),
    simulation: {
      systems: [{ match: 'oracle-db', latencyMs: 60 }],
      tests: [
        {
          name: 'A normal evening',
          about: 'About 40 checkouts a second. Each is answered at once and written to Oracle shortly after.',
          traffic: [checkout],
          durationMin: 30,
          expect: { answers: [{ minSuccess: 0.99, maxMs: 500 }], delivered: [{ to: 'oracle-db', min: 0.99 }], lost: { max: 0 } },
        },
        {
          name: 'Oracle switches to its standby',
          about: 'Oracle is unavailable for 25 minutes during the switchover. Shoppers still check out, orders wait on the queue, and every one is written afterwards with none on the dead-letter queue.',
          traffic: [checkout],
          incidents: [{ down: 'oracle-db', at: 5, forMin: 25 }],
          durationMin: 60,
          expect: { answers: [{ minSuccess: 0.99 }], delivered: [{ to: 'oracle-db', min: 0.99 }], dlq: { max: 0 }, lost: { max: 0 } },
        },
        {
          name: 'A zone goes down',
          about: 'One availability zone fails for 20 minutes. The checkout API and the writer keep a replica in the other zone, so checkouts carry on.',
          traffic: [checkout],
          incidents: [{ zone: true, at: 5, forMin: 20 }],
          durationMin: 40,
          expect: { answers: [{ minSuccess: 0.99 }], delivered: [{ to: 'oracle-db', min: 0.99 }] },
        },
      ],
    },
  },
  description: `
Marrow & Pine Home, a fictional homewares retailer, writes web shop orders into an **Oracle** database. Once a month Oracle switches to its standby (Data Guard switchover) for patching; the database is unavailable for up to **25 minutes**, and so far the shop has shown "try again later" for that time.

The shop also runs in two availability zones, and last quarter one zone failed for 20 minutes.

**Numbers**
- About **40 checkouts a second** in the evening.
- Oracle answers in about 60 ms.
- In this model the smallest API (0.1 vCore) serves about 50 requests a second, one zone going down takes away the replicas in it, and a failed delivery is tried again about once a minute.

**Questions:**
- Draw the design.
- What does the shopper see during a switchover, and what has to be true for "order accepted" to be an honest answer?
- Set the redelivery limit and the replicas, and say why.
- What does the order writer have to do so that a redelivery never writes an order twice?
`,
  answerTemplate: `## Design

## Accepting an order without Oracle

## Settings

## Writing each order once
`,
  keyPoints: [
    'The checkout checks the order, puts it on a persistent queue and answers "accepted". Oracle can be away for half an hour without the shopper knowing.',
    '"Accepted" is honest only when the queue is persistent and the order can no longer fail for a reason the shopper could fix. Check prices and stock before queueing, not after.',
    '25 minutes at a try about once a minute needs more than 25 deliveries. 40 leaves room.',
    'Two replicas of each API let one zone fail without stopping checkout or the writer.',
    'After the switchover the writer has about 60,000 orders to catch up on while new ones keep coming. It needs room well above 40 a second, or the backlog lasts for hours.',
    'The writer uses the order ID as a key (MERGE or a unique constraint and "already there" as success), so a redelivery after a slow success writes nothing new.',
  ],
  solution: `
**Design**
\`\`\`
Web shop ─► exp-checkout ~► orders.accepted ~► prc-order-writer ─► sys-orders-oracle ─► Orders Oracle
                                         ~► orders.accepted.dlq
\`\`\`

**Settings.** \`exp-checkout\` and \`prc-order-writer\`: 2 replicas. \`orders.accepted\`: 40 deliveries before the DLQ.

**Order status page.** It reads Oracle, so during the switchover it cannot show a new order. Show "order received, details shortly" from what the checkout returned, not an error.
`,
  followUps: [
    {
      q: 'How long can orders wait on the queue before it is a problem?',
      a: 'Until the next step needs them: picking in the warehouse, say at 05:00. Alert if the queue is older than an hour, so a long outage is noticed well before that.',
    },
    {
      q: 'Why not two Oracle databases in active-active?',
      a: 'Two writable copies of an order database bring conflicts and a much harder recovery. A standby plus a queue in front covers a short switchover at a fraction of the cost.',
    },
  ],
}
