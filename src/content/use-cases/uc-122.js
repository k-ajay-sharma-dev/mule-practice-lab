import { diagram } from '../../arch/dsl.js'

const evening = { name: 'sessions', from: 'saas', rps: 12, forMin: 120, to: ['payment', 'erp'], kind: 'write' }

export default {
  id: 'uc-122',
  category: 'use-cases',
  title: 'EV Charging Sessions to Billing: Capture the Payment First, Post to the ERP in a Second Stage',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'webhook', 'anypoint-mq', 'payments', 'erp', 'load-levelling', 'energy'],
  estMinutes: 35,
  diagram: {
    task: 'draw the billing flow for completed charging sessions: the charge point management system calling an Experience API, a queue of completed sessions, a billing Process API that prices each session from a tariff cache and captures the payment through a System API, a second queue of charged sessions, an invoicing Process API that posts to the ERP through its own System API, and a dead-letter queue for each queue.',
    checks: [
      { label: 'The charge point management system sends completed sessions to an Experience API', rule: { type: 'edge', from: 'saas', to: 'experience-api' } },
      { label: 'The Experience API puts each session on a queue', rule: { type: 'edge', from: 'experience-api', to: 'queue', kind: 'async' } },
      { label: 'The Experience API never waits for the payment provider or the ERP', rule: { type: 'no-path', from: 'experience-api', to: ['payment', 'erp'], kind: 'sync' } },
      { label: 'The billing Process API reads the tariffs from a cache', rule: { type: 'edge', from: 'process-api', to: { type: 'cache', label: 'tariff' } } },
      { label: 'The payment provider is reached only through a System API', rule: { type: 'only-via', target: 'payment', from: 'system-api' } },
      { label: 'The ERP is reached only through a System API', rule: { type: 'only-via', target: 'erp', from: 'system-api' } },
      { label: 'Charged sessions reach the ERP through a second queue', rule: { type: 'path', from: 'process-api', via: 'queue', to: 'erp' } },
      {
        label: 'The billing Process API never calls the ERP with sync calls, so an ERP outage cannot stop captures',
        rule: { type: 'no-path', from: { type: 'process-api', label: ['billing', 'charge', 'capture'] }, to: 'erp', kind: 'sync' },
      },
      { label: 'Every queue has a dead-letter queue', rule: { type: 'each', of: 'queue', min: 2, edgeTo: 'dlq' } },
      { label: 'Every line to or from a queue is an async message', rule: { type: 'lines', touching: ['queue', 'dlq'], kind: 'async' } },
    ],
    reference: diagram(
      {
        cpms: ['saas', 'Charge point management system (CPMS)'],
        exp: ['experience-api', 'exp-cpms-events'],
        q1: ['queue', 'sessions-completed', { maxRedelivery: 30 }],
        dlq1: ['dlq', 'sessions-completed DLQ'],
        bill: ['process-api', 'prc-session-billing'],
        tar: ['cache', 'Tariff cache', { ttlSec: 3600 }],
        sysPay: ['system-api', 'sys-payments'],
        psp: ['payment', 'Payment provider'],
        q2: ['queue', 'sessions-charged', { maxRedelivery: 120 }],
        dlq2: ['dlq', 'sessions-charged DLQ'],
        inv: ['process-api', 'prc-session-invoicing'],
        sysErp: ['system-api', 'sys-erp-invoices'],
        erp: ['erp', 'ERP (billing and general ledger)'],
      },
      [
        'cpms -> exp', 'exp ~> q1', 'q1 ~> bill', 'q1 ~> dlq1',
        'bill -> tar', 'bill -> sysPay', 'sysPay -> psp', 'bill ~> q2',
        'q2 ~> inv', 'q2 ~> dlq2', 'inv -> sysErp', 'sysErp -> erp',
      ],
    ),
    simulation: {
      systems: [
        { match: 'payment', latencyMs: 600, maxRps: 15 },
        { match: 'erp', latencyMs: 800, maxRps: 10 },
      ],
      tests: [
        {
          name: 'Evening peak',
          about: 'Drivers finish 12 sessions a second for two hours. Every webhook is answered at once, every payment is captured, and the ERP, which takes 10 a second, works through its queue within the run.',
          traffic: [evening],
          durationMin: 180,
          expect: {
            answers: [{ minSuccess: 0.99, maxMs: 500 }],
            delivered: [{ to: 'payment', min: 0.99 }, { to: 'erp', min: 0.99 }],
            backlog: [{ queue: 'queue', maxEnd: 0 }],
            lost: { max: 0 },
          },
        },
        {
          name: 'The ERP is down for an hour',
          about: 'The ERP stops for an hour in the middle of the evening peak. Payments are still captured as sessions end. Charged sessions wait in their queue, none goes to a DLQ, and all reach the ERP once it is back.',
          traffic: [evening],
          incidents: [{ down: 'erp', at: 30, forMin: 60 }],
          durationMin: 240,
          expect: {
            delivered: [{ to: 'payment', min: 0.99 }, { to: 'erp', min: 0.99 }],
            dlq: { max: 0 },
            lost: { max: 0 },
          },
        },
        {
          name: 'Some payments are declined',
          about: 'About 1 session in 100 has a card that the provider declines every time. Those sessions stop in the DLQ for the collections team, and the rest are billed.',
          traffic: [{ ...evening, poison: 0.01 }],
          durationMin: 180,
          expect: { delivered: [{ to: 'payment', min: 0.98 }], dlq: { min: 100 }, lost: { max: 0 } },
        },
      ],
    },
  },
  description: `
A company runs a network of **public EV chargers**. Its charge point management system (**CPMS**), a SaaS product, sends a webhook to Mule when a charging session ends: charger, start and end time, energy in kWh, the driver's account and a payment token from the start of the session.

For each session Mule must:
1. Work out the price from the **tariff** for that charger and time of day. Tariffs change a few times a month.
2. **Capture the payment** with the payment provider, against the amount held when the session started.
3. Post an **invoice line** to the ERP for accounting.

Facts:
- Evening peak: about **12 sessions a second** for two hours.
- The payment provider allows **15 captures a second** on the company's contract and answers in about 600 ms.
- The ERP takes at most **10 postings a second** and has a monthly maintenance hour, which sometimes falls in the evening.
- The CPMS retries a webhook only three times in one minute.
- About **1 session in 100** has a card that is declined at capture, every time.
- Today one flow does all three steps in the webhook call. When the ERP is down, payments are not captured either, and the CPMS gives up on many webhooks.

**Questions:**
- Draw a design where an ERP outage does not stop payments, and no session is lost.
- In which order do the steps run, and why?
- Where do the tariffs come from at the moment of pricing?
- What happens to declined payments?
`,
  answerTemplate: `## Design

## Order of the steps

## Tariffs

## ERP outages and peaks

## Declined payments
`,
  keyPoints: [
    'The Experience API only accepts the webhook and queues it. The CPMS is answered in milliseconds and never gives up on a session.',
    'Capture the money first, in its own stage. The payment is time-sensitive and its hold expires. Accounting can wait.',
    'A second queue of charged sessions decouples the ERP. An ERP outage only grows that queue.',
    'Each stage runs at the pace of its own system: 15 a second for payments, 10 a second for the ERP.',
    'Tariffs change rarely, so the billing API reads them from a cache instead of asking a tariff system for every session.',
    'Each queue needs a redelivery limit that fits its system: longer for the ERP queue, which must survive a maintenance hour.',
    'A declined capture goes to the DLQ for the collections team, and the other sessions carry on.',
    'Use the session ID as the idempotency key in both stages, so a redelivered message never captures or posts twice.',
  ],
  solution: `
**Design**
\`\`\`
CPMS ─► exp-cpms-events ~► sessions-completed ~► prc-session-billing ─► Tariff cache
                                  ~► DLQ                  ─► sys-payments ─► Payment provider
                                                          ~► sessions-charged ~► prc-session-invoicing ─► sys-erp-invoices ─► ERP
                                                                     ~► DLQ
\`\`\`

**Order of the steps.**
1. \`exp-cpms-events\` checks the webhook and publishes it to \`sessions-completed\`. It answers 200 at once.
2. \`prc-session-billing\` prices the session from the tariff cache and captures the payment through \`sys-payments\`, sending the session ID as the idempotency key. Then it publishes the charged session, with the amount and the payment reference, to \`sessions-charged\`.
3. \`prc-session-invoicing\` posts the invoice line through \`sys-erp-invoices\`, again keyed by session ID so a repeat is ignored.

The payment comes first because the amount held at the start of the session is only kept for a limited time. A late capture can fail. A late invoice line costs nothing.

**Tariffs.** The billing API keeps tariffs in a cache with a one hour time to live, refreshed from the tariff tables in the ERP. A tariff change is published with a start time well ahead, so a cache that is an hour old is never wrong.

**ERP outages and peaks.** During the evening peak, 12 sessions a second arrive. Payments run at 12 a second, under the provider's 15. The ERP takes 10 a second, so \`sessions-charged\` grows by about 2 a second and empties after the peak. During an ERP maintenance hour, \`sessions-charged\` grows by about 43,000 messages and payments carry on. The ERP queue allows 120 tries, one a minute or so, so no good posting is sent to its DLQ during the hour.

**Declined payments.** A declined capture fails every time, so after 30 tries it moves to \`sessions-completed DLQ\`. The collections team works from there: they contact the driver and replay the session when it is paid.
`,
  followUps: [
    {
      q: 'Why not capture the payment and post to the ERP in one consumer?',
      a: 'Then the slower system sets the pace for both, and an ERP outage stops captures while holds expire. Two stages let each system fail or slow down on its own.',
    },
    {
      q: 'What if the provider captured the payment but its answer was lost?',
      a: 'The message is redelivered and the capture is sent again with the same idempotency key. The provider returns the first result, so the driver is charged once.',
    },
    {
      q: 'Should a declined capture retry 30 times?',
      a: 'A clear decline will not change on a retry. A better consumer checks the decline reason and sends a hard decline to the DLQ at once, keeping retries for timeouts and outages.',
    },
  ],
}
