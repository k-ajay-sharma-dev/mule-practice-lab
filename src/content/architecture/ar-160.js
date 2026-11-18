import { diagram } from '../../arch/dsl.js'

const orders = { name: 'shop orders', from: 'web-app', rps: 40, to: 'erp', kind: 'write' }

export default {
  id: 'ar-160',
  category: 'architecture',
  title: 'An Online Shop on AWS Hands Orders to Mule Through an SQS Queue: Orders Wait There While the ERP Is Down, and a Bad Order Moves Aside',
  level: 'BEGINNER',
  tags: ['myproject', 'amazon-sqs', 'cloud-queue', 'hybrid-cloud', 'dlq', 'erp', 'e-commerce'],
  estMinutes: 20,
  diagram: {
    task: 'draw the online shop sending each order to an SQS queue, with a dead-letter queue drawn from it. A Mule order intake Process API reads the queue and creates the order in the ERP through a System API.',
    checks: [
      { label: 'The shop sends each order to the SQS queue', rule: { type: 'edge', from: 'web-app', to: 'cloud-queue', kind: 'async' } },
      { label: 'Orders reach the ERP through the SQS queue', rule: { type: 'path', from: 'web-app', via: 'cloud-queue', to: 'erp' } },
      { label: 'The shop never waits on the ERP', rule: { type: 'no-path', from: 'web-app', to: 'erp', kind: 'sync' } },
      { label: 'A Process API reads the SQS queue', rule: { type: 'edge', from: 'cloud-queue', to: 'process-api', kind: 'async' } },
      { label: 'The ERP is reached only through a System API', rule: { type: 'only-via', target: 'erp', from: 'system-api' } },
      { label: 'The SQS queue has a dead-letter queue', rule: { type: 'each', of: 'cloud-queue', edgeTo: 'dlq' } },
    ],
    reference: diagram(
      {
        shop: ['web-app', 'Online shop on AWS'],
        sqs: ['cloud-queue', 'shop-orders (SQS)', { maxRedelivery: 60 }],
        dlq: ['dlq', 'shop-orders-dlq (SQS)'],
        prc: ['process-api', 'prc-order-intake', { vCores: '0.5' }],
        sys: ['system-api', 'sys-erp-orders', { vCores: '0.5' }],
        erp: ['erp', 'ERP'],
      },
      ['shop ~> sqs', 'sqs ~> prc', 'sqs ~> dlq', 'prc -> sys', 'sys -> erp'],
    ),
    simulation: {
      systems: [{ match: 'erp', latencyMs: 300, maxRps: 100 }],
      tests: [
        {
          name: 'A normal afternoon',
          about: 'The shop sends 40 orders a second. It is done as soon as SQS has each order, and every order reaches the ERP.',
          traffic: [orders],
          durationMin: 30,
          expect: { answers: [{ minSuccess: 0.99, maxMs: 200 }], delivered: [{ to: 'erp', min: 0.99 }], lost: { max: 0 } },
        },
        {
          name: 'The ERP is down for 30 minutes',
          about: 'The ERP has a patch window. Customers can still order, the orders wait in SQS, and all of them are created once the ERP is back.',
          traffic: [orders],
          incidents: [{ down: 'erp', at: 5, forMin: 30 }],
          durationMin: 90,
          expect: { answers: [{ minSuccess: 0.99 }], delivered: [{ to: 'erp', min: 0.99 }], lost: { max: 0 }, backlog: [{ queue: 'cloud-queue', maxEnd: 0 }] },
        },
        {
          name: 'An order the ERP refuses',
          about: 'One order in 200 has a product code the ERP does not know, and it fails every time. Those orders move to the dead-letter queue, and the queue does not fill up with them.',
          traffic: [{ ...orders, rps: 20, poison: 0.005 }],
          durationMin: 120,
          expect: { delivered: [{ to: 'erp', min: 0.99 }], dlq: { min: 100 }, lost: { max: 0 }, backlog: [{ queue: 'cloud-queue', maxEnd: 500 }] },
        },
      ],
    },
  },
  description: `
A garden supplies retailer runs its **online shop on AWS**. Its **ERP** runs in the retailer's own data centre and is reached through Mule. Today the shop calls a Mule API for each order and waits for the ERP to create it. When the ERP is patched on a Sunday afternoon, the checkout fails.

The shop team already uses **Amazon SQS** and can send to a queue with a few lines of code. The integration team can read an SQS queue from Mule with the Amazon SQS connector.

**Numbers**
- About **40 orders a second** on a busy afternoon.
- The ERP takes about 300 ms per order and up to 100 orders a second.
- Patch windows last up to **30 minutes**.
- About 1 order in 200 has a product code the ERP does not know yet. It fails every time until someone fixes the product.

**Questions:**
- Draw the design.
- Why does an SQS queue suit the hand-off between AWS and Mule here?
- What happens to orders during a patch window?
- What happens to an order the ERP refuses every time?
`,
  answerTemplate: `## Design

## Why SQS

## Patch windows

## Orders that always fail
`,
  keyPoints: [
    'The shop is done when SQS has the order. It no longer depends on the ERP, or on Mule, being up at that moment.',
    'SQS is already in the shop team\'s cloud and their skills. Mule reads it with the Amazon SQS connector, so neither side runs a broker for the other.',
    'An order stays in SQS until Mule deletes it after the ERP has accepted it. If the ERP call fails, the message becomes visible again after its visibility timeout and is tried again.',
    'A redrive policy with a maximum receive count moves an order that keeps failing to a dead-letter queue, so it is not tried for ever.',
    'Set the queue\'s retention well above the longest outage. SQS keeps messages for 4 days by default and up to 14.',
    'The ERP still sees each order through one System API, which holds its credentials and its quirks.',
    'Size the consumer for the catch up, not only for the normal rate. After a 30 minute window, 72,000 orders wait, and the smallest size has little room to spare above 40 a second.',
  ],
  solution: `
**Design**
\`\`\`
Online shop on AWS ~► shop-orders (SQS) ~► prc-order-intake ─► sys-erp-orders ─► ERP
                              ~► shop-orders-dlq (SQS)
\`\`\`

**Why SQS.** The shop already runs in AWS and SQS needs no servers. The shop sends the order and shows "order received". Mule reads the queue from its own side, so the shop never needs a network path to the data centre.

**Patch windows.** \`prc-order-intake\` fails to create the order and does not delete the message. After the visibility timeout it is visible again and is read again. Orders build up in the queue for 30 minutes, about 72,000 of them, then drain once the ERP is back. The ERP takes up to 100 a second, so the consumer and the System API get half a vCore each: on the smallest size they would have only about 10 a second to spare above the new orders, and the backlog would take two hours to clear.

**Orders that always fail.** The redrive policy on \`shop-orders\` moves a message to \`shop-orders-dlq\` after it has been received a set number of times. In this model a failed order is tried about once a minute, so 60 receives cover about an hour, well beyond a patch window. The product team fixes the product code and sends the order again from the DLQ.

**Repeats.** SQS standard queues deliver at least once, so the same order can arrive twice. The ERP call should be keyed by the shop's order number, so a repeat finds the order already there.
`,
  followUps: [
    {
      q: 'Should this be an SQS FIFO queue?',
      a: 'Only if the order of messages matters, such as a create and then a cancel for the same order. A FIFO queue with the order number as message group ID keeps those in order. It has lower throughput limits, so check them against the peak.',
    },
    {
      q: 'How does the customer learn the ERP order number?',
      a: 'Later, by another route: Mule publishes an "order created" event or updates the shop through its API once the ERP has answered. The shop shows "processing" until then.',
    },
  ],
}
