import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-142',
  category: 'architecture',
  title: 'Urgent Pharmacy Orders Stuck Behind a Bulk Drop: Separate Queues and Consumers for Each Priority',
  level: 'ADVANCED',
  tags: ['anypoint-mq', 'priority', 'bulkhead', 'load-levelling', 'dlq', 'healthcare'],
  estMinutes: 40,
  diagram: {
    task: 'draw the order intake for a pharmacy wholesaler: the pharmacy app and its Experience API, the nightly bulk loader for hospital files, one queue for urgent orders and one for bulk orders, each with its own consumer Process API and dead-letter queue, and the System API in front of the WMS that both consumers call.',
    checks: [
      { label: 'There is a queue for urgent orders and a separate queue for bulk orders', rule: { type: 'node', match: 'queue', min: 2 } },
      { label: 'The Experience API publishes urgent orders to the urgent queue', rule: { type: 'edge', from: 'experience-api', to: { type: 'queue', label: ['urgent', 'express', 'priority'] }, kind: 'async' } },
      { label: 'The Experience API never puts orders on the bulk queue', rule: { type: 'no-edge', from: 'experience-api', to: { type: 'queue', label: 'bulk' } } },
      { label: 'The bulk loader publishes to the bulk queue', rule: { type: 'edge', from: 'batch-job', to: { type: 'queue', label: 'bulk' }, kind: 'async' } },
      { label: 'The bulk loader never puts orders on the urgent queue', rule: { type: 'no-edge', from: 'batch-job', to: { type: 'queue', label: ['urgent', 'express', 'priority'] } } },
      { label: 'Each queue is drained by exactly one consumer Process API', rule: { type: 'each', of: 'queue', min: 2, edgeTo: 'process-api', kind: 'async', max: 1 } },
      { label: 'No consumer reads both queues, so a bulk backlog cannot hold up urgent orders', rule: { type: 'each', of: 'process-api', edgeFrom: 'queue', max: 1, count: 0 } },
      { label: 'Every queue has a dead-letter queue', rule: { type: 'each', of: 'queue', edgeTo: 'dlq' } },
      { label: 'The bulk loader never calls the WMS with sync calls', rule: { type: 'no-path', from: 'batch-job', to: 'wms', kind: 'sync' } },
      { label: 'The WMS is reached only through the System API', rule: { type: 'only-via', target: 'wms', from: 'system-api' } },
      { label: 'Every consumer calls the System API', rule: { type: 'each', of: 'process-api', edgeTo: 'system-api' } },
      { label: 'Every line to or from a queue is an async message', rule: { type: 'lines', touching: ['queue', 'dlq'], kind: 'async' } },
    ],
    reference: diagram(
      {
        app: ['mobile-app', 'Pharmacy ordering app'],
        exp: ['experience-api', 'exp-pharmacy-orders'],
        load: ['batch-job', 'Hospital bulk file loader (06:00)', { vCores: '0.5' }],
        qU: ['queue', 'orders-urgent', { maxRedelivery: 10 }],
        qB: ['queue', 'orders-bulk', { maxRedelivery: 10 }],
        dlqU: ['dlq', 'orders-urgent DLQ'],
        dlqB: ['dlq', 'orders-bulk DLQ'],
        prcU: ['process-api', 'prc-urgent-fulfilment'],
        prcB: ['process-api', 'prc-bulk-fulfilment'],
        sys: ['system-api', 'sys-wms-orders'],
        wms: ['wms', 'Warehouse management system'],
      },
      ['app -> exp', 'exp ~> qU', 'load ~> qB', 'qU ~> prcU', 'qB ~> prcB', 'qU ~> dlqU', 'qB ~> dlqB', 'prcU -> sys', 'prcB -> sys', 'sys -> wms'],
    ),
    simulation: {
      systems: [{ match: 'wms', latencyMs: 200, maxRps: 40 }],
      tests: [
        {
          name: 'The 06:00 bulk drop',
          about: 'The loader puts 100 hospital order lines a second on the bulk queue for 10 minutes, while pharmacies send 5 urgent orders a second. Urgent orders do not queue up, and the bulk backlog is cleared within the hour.',
          traffic: [
            { name: 'urgent orders', from: 'mobile-app', rps: 5, to: 'wms', kind: 'write' },
            { name: 'bulk lines', from: 'batch-job', rps: 100, forMin: 10, to: 'wms', kind: 'write' },
          ],
          durationMin: 60,
          expect: {
            answers: [{ flow: 'urgent orders', minSuccess: 0.99, maxMs: 500 }],
            delivered: [{ flow: 'urgent orders', to: 'wms', min: 0.99 }, { flow: 'bulk lines', to: 'wms', min: 0.99 }],
            backlog: [{ queue: { type: 'queue', label: ['urgent', 'express', 'priority'] }, maxPeak: 60 }, { queue: { type: 'queue', label: 'bulk' }, maxEnd: 0 }],
            lost: { max: 0 },
          },
        },
        {
          name: 'Some hospital lines are rejected',
          about: 'One bulk line in 100 has a product code the WMS rejects every time. Those lines go to the bulk DLQ after their tries, and the rest of the file and every urgent order still reach the WMS.',
          traffic: [
            { name: 'urgent orders', from: 'mobile-app', rps: 5, to: 'wms', kind: 'write' },
            { name: 'bulk lines', from: 'batch-job', rps: 20, forMin: 30, to: 'wms', kind: 'write', poison: 0.01 },
          ],
          durationMin: 60,
          expect: {
            delivered: [{ flow: 'urgent orders', to: 'wms', min: 0.99 }, { flow: 'bulk lines', to: 'wms', min: 0.98 }],
            dlq: { min: 100 },
            lost: { max: 0 },
          },
        },
      ],
    },
  },
  description: `
A pharmacy wholesaler takes orders from two very different sources:
- **Pharmacies** order through a mobile app. These are urgent: a line that reaches the warehouse management system (WMS) within **2 minutes** makes the same-day courier. About **5 orders a second** during the day.
- **Hospital groups** send replenishment files overnight. At 06:00 a loader reads them and publishes about **60,000 order lines** in 10 minutes, about **100 a second**. They are due by the next day.

Today both go onto one Anypoint MQ queue, \`orders-to-wms\`, and one consumer app sends each order to the WMS through \`sys-wms-orders\`. The WMS accepts at most **40 orders a second**.

Every morning between 06:00 and 06:30, urgent orders wait behind the hospital lines for up to **25 minutes**. Pharmacies miss the courier and phone the call centre. Someone suggested giving the consumer more vCores. The WMS limit would not change.

About 1 hospital line in 100 has an old product code that the WMS rejects every time.

**Questions:**
- Draw a design where a bulk drop can never delay urgent orders.
- Why does more consumer capacity not fix this?
- How do the two consumers share the WMS limit?
- What happens to the lines the WMS rejects?
`,
  answerTemplate: `## Why urgent orders wait

## Design

## Sharing the WMS

## Rejected lines

## Sizing
`,
  keyPoints: [
    'One queue serves messages roughly in arrival order, so 60,000 bulk lines that arrive first are in front of every urgent order.',
    'More consumer capacity does not help when the WMS is the limit. The queue only drains at the rate the WMS accepts.',
    'Give each priority its own queue and its own consumer. The urgent queue is then never behind the bulk queue.',
    'The bulk consumer must leave room at the WMS for urgent orders: cap its rate or its concurrency below the WMS limit.',
    'The bulk loader publishes to a queue and never calls the WMS itself, so a big file is levelled out over time.',
    'Each queue gets its own dead-letter queue and a redelivery limit, so a rejected line stops after a few tries and never blocks the file.',
    'The loader itself needs capacity for its burst, or it drops lines before they reach the queue.',
  ],
  solution: `
**Why urgent orders wait.** At 06:00 the loader puts 60,000 lines on the shared queue in 10 minutes. The consumer can only deliver 40 a second, because that is all the WMS takes. Urgent orders arriving at 06:05 sit behind about 30,000 bulk lines: more than 12 minutes of WMS time, and it gets worse until the drop ends. Doubling the consumer's vCores changes nothing, since the WMS sets the pace.

**Design**
\`\`\`
Pharmacy app ─► exp-pharmacy-orders ~► orders-urgent ~► prc-urgent-fulfilment ─┐
                                              ~► DLQ                          ├─► sys-wms-orders ─► WMS
Bulk loader (06:00)                 ~► orders-bulk   ~► prc-bulk-fulfilment  ─┘
                                              ~► DLQ
\`\`\`

**Sharing the WMS.** The urgent consumer needs about 5 a second. The bulk consumer is capped at about 30 a second, with a fixed number of consumers on its subscriber and a pause between batches, or a rate limit on its calls. 5 plus 30 stays under the WMS's 40. During the drop the bulk queue grows to tens of thousands of lines and drains in about 35 minutes, which the hospitals accept. The urgent queue stays near empty.

**Rejected lines.** Each queue redelivers a failing message up to 10 times, then moves it to its own DLQ. About 600 lines a morning go to \`orders-bulk DLQ\`. A support team corrects the product codes and replays them. A rejected urgent order goes to the urgent DLQ and raises an alert at once, because a pharmacy is waiting.

**Sizing.**
- The loader publishes 100 lines a second in its burst. It needs 0.5 vCore, or about half the lines are refused before they reach the queue.
- Each consumer can stay small. The WMS limits them, not their CPU.
- \`sys-wms-orders\` is shared by both consumers and carries at most 40 calls a second.
`,
  followUps: [
    {
      q: 'Could you keep one queue and give urgent orders a message priority?',
      a: 'Only if the broker supports priorities and the consumer reads in priority order, and even then bulk lines already being processed hold the WMS. Two queues with their own consumers are simpler to reason about and to monitor.',
    },
    {
      q: 'Why not let the bulk loader call the System API directly in the middle of the night?',
      a: 'The loader would send 100 a second to a WMS that takes 40, and most calls would fail. A queue levels the burst to what the WMS can take.',
    },
    {
      q: 'What would you monitor?',
      a: 'The age of the oldest message in the urgent queue, with an alert at one minute. Depth and DLQ count for both queues. WMS call rate against its limit of 40.',
    },
  ],
}
