import { diagram } from '../../arch/dsl.js'

const checkout = { name: 'checkouts', from: 'web-app', rps: 20, to: ['database', 'notification'], kind: 'write' }

export default {
  id: 'uc-193',
  category: 'use-cases',
  title: 'Order Confirmation Emails Off the Checkout Path: a Queue to the Mailer So a Slow or Down Mail Relay Never Slows a Checkout',
  level: 'BEGINNER',
  tags: ['myproject', 'email', 'smtp', 'queues', 'dlq', 'checkout'],
  estMinutes: 25,
  diagram: {
    task: 'draw the web shop calling a checkout Experience API, which saves the order through an orders System API and puts a confirmation request on a queue with a dead-letter queue. A mailer Process API reads the queue and sends the email through the mail relay.',
    checks: [
      { label: 'The checkout saves the order through a System API', rule: { type: 'path', from: 'web-app', via: 'system-api', to: 'database' } },
      { label: 'Confirmations wait on a queue before the mail relay', rule: { type: 'path', from: 'web-app', via: 'queue', to: 'notification' } },
      { label: 'A checkout never waits on the mail relay', rule: { type: 'no-path', from: 'web-app', to: 'notification', kind: 'sync' } },
      { label: 'The queue has a dead-letter queue', rule: { type: 'each', of: 'queue', edgeTo: 'dlq' } },
    ],
    reference: diagram(
      {
        web: ['web-app', 'Web shop'],
        exp: ['experience-api', 'exp-checkout'],
        sys: ['system-api', 'sys-orders'],
        db: ['database', 'Orders database'],
        q: ['queue', 'order.confirmations', { maxRedelivery: 45 }],
        dlq: ['dlq', 'order.confirmations.dlq'],
        prc: ['process-api', 'prc-mailer'],
        mail: ['notification', 'Mail relay'],
      },
      ['web -> exp', 'exp -> sys', 'sys -> db', 'exp ~> q', 'q ~> prc', 'q ~> dlq', 'prc -> mail'],
    ),
    simulation: {
      systems: [
        { match: 'database', latencyMs: 40 },
        { match: 'notification', latencyMs: 400 },
      ],
      tests: [
        {
          name: 'A normal evening',
          about: 'About 20 checkouts a second. Each is answered quickly and every confirmation is sent.',
          traffic: [checkout],
          durationMin: 20,
          expect: { answers: [{ minSuccess: 0.99, maxMs: 500 }], delivered: [{ to: 'notification', min: 0.99 }] },
        },
        {
          name: 'The relay is slow',
          about: 'Each send takes 8 seconds for 20 minutes. Checkouts are not slowed at all.',
          traffic: [checkout],
          incidents: [{ slow: 'notification', latencyMs: 8000, at: 0, forMin: 20 }],
          durationMin: 20,
          expect: { answers: [{ minSuccess: 0.99, maxMs: 500 }] },
        },
        {
          name: 'The relay is down for half an hour',
          about: 'Confirmations wait on the queue and all go out afterwards. None ends on the dead-letter queue.',
          traffic: [checkout],
          incidents: [{ down: 'notification', at: 5, forMin: 30 }],
          durationMin: 60,
          expect: { answers: [{ minSuccess: 0.99 }], delivered: [{ to: 'notification', min: 0.99 }], dlq: { max: 0 } },
        },
        {
          name: 'Addresses the relay refuses',
          about: 'One order in 500 has an address the relay refuses every time. Those go to the dead-letter queue, and the queue does not keep growing.',
          traffic: [{ ...checkout, poison: 0.002 }],
          durationMin: 120,
          expect: { dlq: { min: 1 }, backlog: [{ queue: 'queue', maxEnd: 150 }] },
        },
      ],
    },
  },
  description: `
Larkfield Grocers, a fictional grocery chain, sends a confirmation email for every web shop order. The checkout API sent the email itself, through the company **mail relay** (SMTP), before answering the shopper.

When the relay was slow one evening, every checkout waited for it. When it was down for maintenance, checkouts failed although the orders were fine.

**Numbers**
- About **20 checkouts a second** in the evening.
- A send normally takes 400 ms. The relay can be slow (about **8 seconds**) or down for maintenance (up to **30 minutes**).
- About **1 order in 500** has an email address the relay refuses every time.
- In this model a failed delivery is tried again about once a minute, and a limit of 0 means no limit.

**Questions:**
- Draw the design.
- What does the shopper see when the relay is slow or down?
- Choose a redelivery limit for the confirmation queue, and say what goes wrong with 5 and with no limit.
- Who looks at the dead-letter queue?
`,
  answerTemplate: `## Design

## The shopper's view

## The redelivery limit

## The dead-letter queue
`,
  keyPoints: [
    'The order is the shopper\'s business; the email is a notice about it. Saving the order and queueing the email lets the checkout answer without the relay.',
    'A persistent queue keeps confirmations through a relay outage and sends them when it is back.',
    '30 minutes down at about one try a minute needs more than 30 deliveries. 45 leaves room; 5 sends good confirmations to the DLQ; no limit lets a refused address circle for ever.',
    'Customer service looks at the DLQ: a typo in an address is fixed with the shopper, and the request is moved back.',
    'Queue the request after the order is saved, so a confirmation never goes out for an order that failed.',
  ],
  solution: `
**Design**
\`\`\`
Web shop ─► exp-checkout ─► sys-orders ─► Orders database
                         ~► order.confirmations ~► prc-mailer ─► Mail relay
                                               ~► order.confirmations.dlq
\`\`\`

**Settings.** \`order.confirmations\`: 45 deliveries before the DLQ.

**What goes on the queue.** The order ID and the template name. The mailer reads the details it needs, so personal data is not copied into the broker.
`,
  followUps: [
    {
      q: 'The order save works, then the queue publish fails. What then?',
      a: 'The shopper has an order but no email. Either fail the checkout and roll back, or write an outbox row in the same database transaction and let a relay publish it.',
    },
    {
      q: 'Would an Async scope in the checkout API do the same job?',
      a: 'It takes the wait away, but the email lives only in memory. A restart or an outage of the relay loses it. The queue keeps it.',
    },
  ],
}
