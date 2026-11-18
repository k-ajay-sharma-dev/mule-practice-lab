import { diagram } from '../../arch/dsl.js'

const invoices = (rps, forMin, extra = {}) => ({ name: 'invoices', from: { type: 'batch-job', label: 'poller' }, rps, forMin, to: ['external-api', 'notification'], kind: 'write', ...extra })

export default {
  id: 'uc-125',
  category: 'use-cases',
  title: 'E-Invoice Clearance With a Tax Authority: No Invoice Reaches a Customer Before It Is Cleared, and Month End Still Fits in the Day',
  level: 'EXPERT',
  tags: ['myproject', 'e-invoicing', 'compliance', 'anypoint-mq', 'rate-limits', 'event-driven', 'erp'],
  estMinutes: 60,
  diagram: {
    task: 'draw the clearance flow: a poller job that reads new invoices from the ERP through a System API and queues them, a clearance Process API that submits each invoice to the tax authority through its own System API and records the status, a topic of cleared invoices with two subscribers (one that delivers the invoice to the customer, one that writes the clearance ID back to the ERP), and a dead-letter queue for the clearance queue.',
    checks: [
      { label: 'The tax authority is reached only through a System API', rule: { type: 'only-via', target: 'external-api', from: 'system-api' } },
      { label: 'A poller job reads new invoices from the ERP through a System API', rule: { type: 'path', from: 'batch-job', via: 'system-api', to: 'erp' } },
      { label: 'The poller queues each invoice for clearance', rule: { type: 'edge', from: 'batch-job', to: 'queue', kind: 'async' } },
      { label: 'A clearance Process API takes invoices from the queue', rule: { type: 'edge', from: 'queue', to: 'process-api', kind: 'async' } },
      { label: 'The clearance Process API records each invoice\'s status', rule: { type: 'edge', from: 'process-api', to: { type: 'database', label: ['status', 'clearance'] } } },
      { label: 'Cleared invoices are published on a topic', rule: { type: 'edge', from: 'process-api', to: { type: 'topic', label: 'cleared' }, kind: 'async' } },
      { label: 'Two subscribers get every cleared invoice', rule: { type: 'each', of: { type: 'topic', label: 'cleared' }, edgeTo: 'process-api', kind: 'async', count: 2 } },
      {
        label: 'Every route to the customer passes the cleared invoices topic, so nothing is sent before clearance',
        rule: { type: 'no-path', from: ['erp', 'batch-job', 'queue'], to: 'notification', unless: { type: 'topic', label: 'cleared' } },
      },
      { label: 'The clearance ID goes back to the ERP through a System API', rule: { type: 'path', from: { type: 'topic', label: 'cleared' }, via: 'system-api', to: 'erp' } },
      { label: 'The clearance queue has a dead-letter queue', rule: { type: 'each', of: 'queue', edgeTo: 'dlq' } },
      { label: 'Every line to or from a queue or topic is an async message', rule: { type: 'lines', touching: ['queue', 'topic', 'dlq'], kind: 'async' } },
    ],
    reference: diagram(
      {
        erp: ['erp', 'ERP (billing)'],
        poll: ['batch-job', 'New invoice poller (every minute)'],
        sysE: ['system-api', 'sys-erp-invoices'],
        q: ['queue', 'invoices-to-clear', { maxRedelivery: 120 }],
        dlq: ['dlq', 'invoices-to-clear DLQ'],
        clr: ['process-api', 'prc-invoice-clearance'],
        sysT: ['system-api', 'sys-tax-clearance'],
        tax: ['external-api', 'Tax authority clearance platform'],
        st: ['database', 'Invoice clearance status'],
        topic: ['topic', 'invoices-cleared'],
        dlv: ['process-api', 'prc-invoice-delivery'],
        cust: ['notification', 'Customer delivery (email and e-invoice network)'],
        upd: ['process-api', 'prc-erp-clearance-update'],
      },
      [
        'poll -> sysE', 'sysE -> erp', 'poll ~> q', 'q ~> clr', 'q ~> dlq',
        'clr -> sysT', 'sysT -> tax', 'clr -> st', 'clr ~> topic',
        'topic ~> dlv', 'dlv -> cust', 'topic ~> upd', 'upd -> sysE',
      ],
    ),
    simulation: {
      systems: [
        { match: 'external-api', latencyMs: 1500, maxRps: 20 },
        { match: 'erp', latencyMs: 300 },
        { match: 'notification', latencyMs: 200 },
      ],
      tests: [
        {
          name: 'Month-end billing run',
          about: 'The ERP issues 40 invoices a second for an hour, twice what the tax authority accepts. Every invoice is queued, cleared at 20 a second, and delivered to its customer within the run.',
          traffic: [invoices(40, 60)],
          durationMin: 200,
          expect: {
            delivered: [{ to: 'external-api', min: 0.99 }, { to: 'notification', min: 0.99 }],
            backlog: [{ queue: 'queue', maxEnd: 0 }],
            lost: { max: 0 },
          },
        },
        {
          name: 'The clearance platform is down for an hour',
          about: 'The tax authority\'s platform stops for an hour while invoices keep coming at 10 a second. They wait in the queue, none is given up to the DLQ, and all are cleared once the platform is back.',
          traffic: [invoices(10, 120, { to: 'external-api' })],
          incidents: [{ down: 'external-api', at: 30, forMin: 60 }],
          durationMin: 220,
          expect: {
            delivered: [{ to: 'external-api', min: 0.99 }],
            dlq: { max: 0 },
            lost: { max: 0 },
          },
        },
        {
          name: 'Invoices with bad master data',
          about: 'About 1 invoice in 200 has a customer tax ID the platform refuses every time. Those invoices stop in the DLQ for finance to fix, and the rest are cleared and delivered.',
          traffic: [invoices(10, 120, { poison: 0.005 })],
          durationMin: 240,
          expect: { delivered: [{ to: 'notification', min: 0.99 }], dlq: { min: 100 }, lost: { max: 0 } },
        },
      ],
    },
  },
  description: `
A building materials wholesaler sells in a country that has moved to **e-invoice clearance**. Every business invoice must be sent to the **tax authority's clearance platform** first. The platform checks it and returns a **clearance ID**. Only a cleared invoice is legally issued, and only then may it be sent to the customer. The rules allow an invoice to be cleared up to **48 hours** after the sale.

Facts:
- The ERP issues about **150,000 invoices a month**. Most days are quiet, about 10 a second in office hours. The month-end billing run issues about **40 a second for an hour**.
- The platform accepts at most **20 submissions a second** per company and takes about 1.5 seconds per invoice. More than that gets HTTP 429.
- The platform has had outages of up to an hour, announced or not.
- About **1 invoice in 200** has customer master data the platform refuses every time, such as a wrong tax ID.
- Customers receive invoices by email or through an e-invoice network.
- Finance wants to see, for each invoice: queued, submitted, cleared or refused, with the clearance ID.
- The ERP cannot call out to APIs. It can be read through a System API, and it can take the clearance ID back the same way.

The first version called the platform from the ERP's own nightly export. At month end it hit the 429 limit, and invoices that failed were sent to customers anyway, without a clearance ID.

**Questions:**
- Draw the clearance flow.
- How do you make sure no invoice reaches a customer before it is cleared?
- How does month end fit under the platform's limit?
- What happens during a platform outage, and to invoices that are always refused?
- Where does finance see the status of each invoice?
`,
  answerTemplate: `## Design

## Nothing before clearance

## Month end and the platform limit

## Outages

## Refused invoices

## Status for finance
`,
  keyPoints: [
    'Make clearance a gate: the only way to the customer is through the "invoices cleared" topic, which only the clearance API publishes to.',
    'A queue in front of the clearance API absorbs month end. The API submits at the platform\'s 20 a second and the backlog clears in about two hours.',
    'Keep the submission rate under the platform limit in one place, the clearance System API, so 429s are rare and are retried, not lost.',
    'During an outage invoices wait in the queue. The redelivery limit must outlast an hour of failures, and the 48 hour rule gives plenty of room.',
    'Invoices refused for bad master data stop in the DLQ after their tries, so they do not block the others. Finance fixes the data and replays them.',
    'A status store records each step with the invoice number, so finance can see what is queued, cleared or stuck.',
    'Cleared events fan out on a topic: one subscriber delivers to the customer, another writes the clearance ID back to the ERP. Neither waits for the other.',
    'Use the invoice number as the key for the platform and for each subscriber, so a redelivered message never clears, sends or posts twice.',
  ],
  solution: `
**Design**
\`\`\`
ERP ◄─ sys-erp-invoices ◄─ New invoice poller (every minute)
                                 ~► invoices-to-clear ~► prc-invoice-clearance ─► sys-tax-clearance ─► Tax authority platform
                                          ~► DLQ                 ─► Invoice clearance status
                                                                 ~► invoices-cleared ~► prc-invoice-delivery ─► customer (email, e-invoice network)
                                                                                     ~► prc-erp-clearance-update ─► sys-erp-invoices ─► ERP
\`\`\`

**Nothing before clearance.** Only \`prc-invoice-clearance\` publishes to \`invoices-cleared\`, and only after the platform returned a clearance ID. \`prc-invoice-delivery\` subscribes to that topic and nothing else. There is no other route from the ERP or the poller to customers. The delivered invoice carries the clearance ID, as the rules require.

**Month end and the platform limit.** The poller reads new invoices each minute and queues them, so the ERP is never held up. At month end, 40 a second arrive and 20 a second are cleared. The queue grows to about 72,000 invoices in the hour and clears about an hour after the run ends, long inside the 48 hours. \`sys-tax-clearance\` keeps a fixed number of calls in flight to stay under 20 a second. A 429 that still happens is treated like any other temporary failure: the message is not acknowledged and is tried again.

**Outages.** Submissions fail, so messages go back to the queue. With a redelivery limit of 120 tries, an hour long outage does not push good invoices to the DLQ. The status store shows them as \`QUEUED\` with the last error, and an alert fires when the oldest message is more than an hour old.

**Refused invoices.** A wrong tax ID fails on every try. After its tries it moves to the DLQ and its status becomes \`REFUSED\` with the platform's reason. Finance corrects the customer in the ERP and replays the invoice from the DLQ. An invoice the platform rejects with a clear business reason can also be marked \`REFUSED\` at once, without using up its tries.

**Status for finance.** \`prc-invoice-clearance\` writes each step to the status store: queued, submitted, cleared with the clearance ID, or refused with the reason. A small report or dashboard reads it. \`prc-erp-clearance-update\` also writes the clearance ID onto the invoice in the ERP, so the ERP stays the record of what was issued.
`,
  followUps: [
    {
      q: 'Why not submit invoices to the platform from the ERP export directly, with retries?',
      a: 'The export would have to slow itself to 20 a second, hold failed invoices somewhere and keep their status. That is what the queue and the clearance API do, in a way that survives restarts and outages.',
    },
    {
      q: 'Why a topic for cleared invoices and not two queues written by the clearance API?',
      a: 'A topic lets the clearance API publish once, and each subscriber gets its own copy. A third subscriber, such as a tax reporting feed, can be added without touching the clearance API.',
    },
    {
      q: 'What if the platform cleared an invoice but the answer was lost?',
      a: 'The message is redelivered and the invoice is submitted again with the same invoice number. Check whether the platform treats a repeat as the same invoice. If it does not, query the platform for that invoice number before submitting again.',
    },
  ],
}
