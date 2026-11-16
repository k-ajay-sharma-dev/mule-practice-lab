import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-067',
  category: 'use-cases',
  title: 'Store POS Sales to the Merchandising System via ActiveMQ',
  level: 'INTERMEDIATE',
  tags: ['retail', 'pos', 'activemq', 'jms', 'oracle', 'bulk-insert', 'merchandising', 'reconciliation'],
  estMinutes: 20,
  diagram: {
    task: 'draw how store sales reach the merchandising system: the store POS publishing to an ActiveMQ queue, the sales Process API, a System API writing to the Oracle staging tables, the DLQ, and the end-of-day reconciliation job.',
    checks: [
      { label: 'Store POS publishes sales to a queue asynchronously', rule: { type: 'edge', from: 'pos', to: ['queue', 'topic'], kind: 'async' } },
      { label: 'A Mule app consumes the sales from the queue', rule: { type: 'edge', from: ['queue', 'topic'], to: 'process-api', kind: 'async' } },
      { label: 'The Oracle staging tables are written only through a System API', rule: { type: 'only-via', target: 'database', from: 'system-api' } },
      { label: 'Messages that keep failing go to a dead-letter queue', rule: { type: 'edge', from: 'queue', to: 'dlq' } },
      { label: 'The integration never calls the store POS directly', rule: { type: 'no-edge', from: ['process-api', 'system-api', 'batch-job'], to: 'pos' } },
      { label: 'An end-of-day job reconciles store totals', rule: { type: 'edge', from: 'batch-job', to: ['system-api', 'process-api'] } },
    ],
    reference: diagram(
      {
        pos: ['pos', 'Store POS servers (350 stores)'],
        q: ['queue', 'POS.SALES (ActiveMQ Artemis)', { maxRedelivery: 5 }],
        dlq: ['dlq', 'DLQ.POS.SALES'],
        prc: ['process-api', 'prc-pos-sales', { vCores: '0.5' }],
        eod: ['batch-job', 'End-of-day totals check (23:30)'],
        sys: ['system-api', 'sys-merch-sales', { vCores: '0.5' }],
        stg: ['database', 'Oracle SALES_STG tables'],
        merch: ['erp', 'Merchandising system (Oracle)'],
      },
      ['pos ~> q', 'q ~> prc', 'q ~> dlq', 'prc -> sys', 'sys -> stg', 'stg -> merch', 'eod -> sys'],
    ),
    simulation: {
      systems: [{ match: 'database', latencyMs: 40 }],
      tests: [
        {
          name: 'Saturday afternoon peak',
          about: 'The stores publish 150 sales a second for 2 hours. The sales consumers and the staging API keep up, so the queue never holds more than 2 minutes of sales and every sale reaches the staging tables.',
          traffic: [{ name: 'sales', from: 'pos', rps: 150, to: 'database', kind: 'write' }],
          durationMin: 120,
          expect: { delivered: [{ to: 'database', min: 0.99 }], backlog: [{ queue: 'queue', maxPeak: 20000 }], lost: { max: 0 } },
        },
        {
          name: 'Sales the staging tables reject',
          about: 'The stores publish 20 sales a second, and 1 in 1,000 has data the staging tables reject every time. Those go to the DLQ after 5 tries, and the other sales keep flowing.',
          traffic: [{ name: 'sales', from: 'pos', rps: 20, to: 'database', kind: 'write', poison: 0.001 }],
          durationMin: 60,
          expect: { dlq: { min: 50 }, lost: { max: 0 }, backlog: [{ queue: 'queue', maxEnd: 1500 }] },
        },
      ],
    },
  },
  description: `
A fashion retailer has **350 stores**. Each store server runs the POS and already publishes every completed transaction (sale, return, void) as an XML message to the central **ActiveMQ Artemis** broker on the queue \`POS.SALES\`. Messages are queued locally in the store when the WAN link is down and forwarded later.

The **merchandising system** (on Oracle 19c) needs the sales to update stock, open-to-buy and sales reports. It imports from staging tables (\`SALES_STG_HEADER\`, \`SALES_STG_LINE\`) every 15 minutes.

Facts:
- ~1.2 million transactions/day; peak Saturday 14:00–16:00: **150 messages/second**.
- Average 3 lines per transaction.
- About 1 sale in 1,000 has data the staging tables reject every time.
- A store can come back online after an outage and forward **thousands** of messages at once.
- Stores send an end-of-day total (count and amount per register) at closing.
- Finance must be able to prove that every store's sales reached the merchandising system.

**Questions:**
1. Describe the Mule flows.
2. How do you write to Oracle efficiently?
3. How do you handle duplicates and bad messages?
4. How do you reconcile?
`,
  answerTemplate: `## Consuming from ActiveMQ

## Mapping

## Writing to Oracle

## Duplicates and bad messages

## Reconciliation
`,
  keyPoints: [
    'jms:listener on POS.SALES in a transaction with several concurrent consumers; the store queue-and-forward already covers WAN outages.',
    'DataWeave maps the POS XML to header and line rows; returns and voids keep their transaction type and link to the original sale.',
    'sys-merch-sales writes with parameterised inserts — db:bulk-insert for the lines — inside one local transaction per message (or small batch).',
    'Unique key (store, register, business date, transaction number) makes redelivered or re-forwarded messages harmless.',
    'Poison messages go to DLQ.POS.SALES after the Artemis max-delivery-attempts; the end-of-day check compares store totals with staged totals.',
  ],
  solution: `
\`\`\`
 Store POS ~> [POS.SALES] ~> prc-pos-sales -> sys-merch-sales -> Oracle SALES_STG_* -> Merchandising import (15 min)
                  \\--> [DLQ.POS.SALES]          EOD job (23:30) -> sys-merch-sales (compare totals)
\`\`\`

**Consuming.** \`jms:listener\` on \`POS.SALES\`, \`transactionalAction="ALWAYS_BEGIN"\`, ~8 concurrent consumers (enough for 150 msg/s with fast inserts; tune after load testing). The message is only removed from the queue when the flow completes.

**Mapping.** DataWeave converts the POS XML into one header row and N line rows. Amounts as decimals, business date and timestamp with the store's time zone, transaction type SALE / RETURN / VOID, original transaction reference for returns.

**Writing.** The Process API calls **sys-merch-sales** (\`POST /sales-transactions\`). The System API inserts the header with \`db:insert\` and lines with \`db:bulk-insert\` using bind parameters. A unique constraint on (store, register, business date, transaction number) on the header table makes the insert idempotent: a duplicate raises a constraint violation which the flow treats as "already processed" and acknowledges.

**Bad messages.**
- Oracle down → \`DB:CONNECTIVITY\` → rollback → Artemis redelivers with a delay. Messages wait safely; nothing is lost.
- Invalid XML or unknown item → after the configured max delivery attempts Artemis moves the message to its dead-letter address (\`DLQ.POS.SALES\`). Alert on DLQ depth; a support flow lets corrected messages be replayed.

**Reconciliation.** Stores publish an EOD total message. At 23:30 a job compares, per store and register, the POS totals with the sum in staging. Differences → report to the store operations team (most often a store still offline). A store that is offline is re-checked the next morning.

**NFRs.** Correlation ID = store + register + transaction number in every log line. Monitor queue depth and age of the oldest message; after a store reconnects, a burst of thousands of messages is absorbed by the queue.
`,
  followUps: [
    { q: 'Why insert into staging tables rather than calling a merchandising API per sale?', a: 'The merchandising system is built for batch imports; staging decouples Mule from its import cycle and handles 1.2 million rows/day efficiently.' },
    { q: 'How do you handle the burst when a store comes back online?', a: 'The queue absorbs it; the listener\'s concurrency limits how fast Oracle is hit. If needed, prefetch and consumer count are tuned so other stores\' messages are not starved.' },
    { q: 'What does maxDeliveryAttempts do in Artemis?', a: 'It is the address setting that limits redeliveries; once reached the message is sent to the configured dead-letter address instead of being redelivered again.' },
  ],
}
