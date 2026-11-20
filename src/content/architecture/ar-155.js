import { diagram } from '../../arch/dsl.js'

const portal = { name: 'portal refunds', from: 'web-app', rps: 70, to: 'payment', kind: 'write' }
const desk = { name: 'desk refunds', from: 'internal-app', rps: 10, to: 'payment', kind: 'write' }
const refunds = { type: 'process-api', label: 'refund' }

export default {
  id: 'ar-155',
  category: 'architecture',
  title: 'Refund Requests Must Survive a Broker Restart: a Persistent Queue Between the Returns Channels and the Payment Provider',
  level: 'BEGINNER',
  tags: ['myproject', 'activemq', 'jms', 'persistence', 'queue', 'dlq', 'refunds', 'retail'],
  estMinutes: 20,
  diagram: {
    task: 'draw the online returns portal and the returns desk app calling one refunds Process API, which puts each refund on a queue with a dead-letter queue. A refund worker takes refunds from the queue and calls the payment provider through a System API.',
    checks: [
      { label: 'The returns portal calls the refunds Process API', rule: { type: 'edge', from: 'web-app', to: refunds } },
      { label: 'The returns desk calls the same refunds Process API', rule: { type: 'edge', from: 'internal-app', to: refunds } },
      { label: 'Refunds wait on a queue before they reach the payment provider', rule: { type: 'path', from: refunds, via: 'queue', to: 'payment' } },
      { label: 'No returns channel waits on the payment provider', rule: { type: 'no-path', from: ['web-app', 'internal-app'], to: 'payment', kind: 'sync' } },
      { label: 'The payment provider is reached only through a System API', rule: { type: 'only-via', target: 'payment', from: 'system-api' } },
      { label: 'The queue has a dead-letter queue', rule: { type: 'each', of: 'queue', edgeTo: 'dlq' } },
      { label: 'Every line to or from a queue is an async message', rule: { type: 'lines', touching: ['queue', 'dlq'], kind: 'async' } },
    ],
    reference: diagram(
      {
        web: ['web-app', 'Online returns portal'],
        desk: ['internal-app', 'Returns desk app'],
        prc: ['process-api', 'prc-refunds', { vCores: '0.5' }],
        q: ['queue', 'refund-requests', { persistent: 'yes', maxRedelivery: 60 }],
        dlq: ['dlq', 'refund-requests DLQ'],
        wrk: ['process-api', 'prc-refund-worker', { vCores: '0.5' }],
        sys: ['system-api', 'sys-payments', { vCores: '0.5' }],
        pay: ['payment', 'Payment provider'],
      },
      ['web -> prc', 'desk -> prc', 'prc ~> q', 'q ~> wrk', 'q ~> dlq', 'wrk -> sys', 'sys -> pay'],
    ),
    simulation: {
      systems: [{ match: 'payment', latencyMs: 400, maxRps: 150 }],
      tests: [
        {
          name: 'The January returns peak',
          about: 'The portal sends 70 refunds a second and the desks 10. Both get an answer at once, and every refund reaches the payment provider.',
          traffic: [portal, desk],
          durationMin: 30,
          expect: { answers: [{ minSuccess: 0.99, maxMs: 300 }], delivered: [{ to: 'payment', min: 0.99 }], lost: { max: 0 } },
        },
        {
          name: 'The broker restarts while the provider is down',
          about: 'The payment provider is down for 20 minutes, so refunds wait on the queue. Ten minutes in, the broker is restarted for a patch. No waiting refund is lost, and all of them are paid once the provider is back.',
          traffic: [{ ...portal, rps: 20 }, desk],
          incidents: [{ down: 'payment', at: 5, forMin: 20 }, { restart: 'queue', at: 15 }],
          durationMin: 60,
          expect: { lost: { max: 0 }, delivered: [{ to: 'payment', min: 0.99 }], backlog: [{ queue: 'queue', maxEnd: 0 }] },
        },
        {
          name: 'A card that was closed',
          about: 'One refund in 100 goes to a card the provider refuses every time. Those refunds move to the dead-letter queue for the finance team, and the rest are paid.',
          traffic: [{ ...portal, rps: 20, poison: 0.01 }, desk],
          durationMin: 120,
          expect: { delivered: [{ to: 'payment', min: 0.98 }], dlq: { min: 50 }, lost: { max: 0 } },
        },
      ],
    },
  },
  description: `
A department store takes returns in two ways: the **online returns portal** and the **returns desk app** in each store. Both raise a refund to the customer's card through the **payment provider**.

The integration team built a first version on the company's **ActiveMQ** broker. To make it faster, the developer published with **persistent delivery turned off**. In testing, the broker was restarted during a provider outage and 3,000 waiting refunds were gone. Nobody knew which customers had not been paid.

**Numbers**
- In January the portal sends about **70 refunds a second** and the desks about **10**.
- The payment provider takes about 400 ms per refund and up to 150 a second.
- Its outages last up to about 20 minutes.
- About 1 refund in 100 goes to a card that has since been closed. The provider refuses it every time. Finance wants those set aside within about an hour.
- The broker tries a failed refund again about **once a minute**.

**Questions:**
- Draw the design. Where do refunds wait while the provider is down?
- What does persistent delivery change, and what does it cost?
- What happens to a refund the provider refuses every time?
`,
  answerTemplate: `## Design

## Persistent delivery

## Provider outages

## Refunds that never go through
`,
  keyPoints: [
    'A persistent message is written to the broker\'s store before the broker accepts it, so it survives a broker restart. A non-persistent message lives in memory and is lost.',
    'Money, orders and anything you cannot rebuild go on persistent queues. Persistence costs some speed, which is a small price here.',
    'Both channels call one refunds Process API that answers once the refund is on the queue, so nobody waits on the provider.',
    'A worker takes refunds at the pace the provider can take, through one System API that holds the provider\'s credentials.',
    'A redelivery limit and a dead-letter queue stop a refused refund from being tried for ever, and keep it for the finance team.',
    'Size the APIs for the peak: 80 refunds a second is more than the smallest size takes in this model.',
  ],
  solution: `
**Design**
\`\`\`
Online returns portal ─┐
                       ├─► prc-refunds ~► refund-requests (persistent) ~► prc-refund-worker ─► sys-payments ─► Payment provider
Returns desk app ──────┘                        ~► DLQ
\`\`\`

**Persistent delivery.** On the JMS Publish, the delivery mode is persistent. The broker writes each message to its store before it confirms it, so a restart, a patch or a crash keeps every waiting refund. In this model a non-persistent queue loses what it holds when the broker restarts.

**Provider outages.** \`prc-refunds\` answers as soon as the refund is on the queue. The worker fails to reach the provider and the broker delivers the refund again later. In this model a failed delivery is tried again about once a minute, so a limit of 60 deliveries covers an outage of about an hour.

**Refunds that never go through.** After 60 failed deliveries a refund moves to the DLQ. The finance team pays it another way, for example as store credit.

**Sizing.** 80 refunds a second at peak is more than one 0.1 vCore replica takes in this model, so the Process API, the worker and the System API each get half a vCore.
`,
  followUps: [
    {
      q: 'Is persistence enough to say no refund is ever lost?',
      a: 'It covers the broker. The worker must also acknowledge a refund only after the provider has accepted it, or a crash between the two loses it. And the refund needs an idempotency key, so a redelivery after a timeout does not pay twice.',
    },
    {
      q: 'When is non-persistent delivery a good choice?',
      a: 'For data that is replaced every few seconds and worthless when old, such as live positions or a dashboard tick. Losing a few is fine, and the speed helps.',
    },
  ],
}
