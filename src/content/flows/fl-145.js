import { design, flow, route, router, source, step } from '../../flow/dsl.js'

const completed = (extra = {}) => ({
  orderId: 'BK-77120',
  orderedAt: '2026-11-18T10:42:00Z',
  total: 41.5,
  customer: { customerId: 'C-5531', name: 'Hana Ito', email: 'hana.ito@example.com', phone: '07700 900555', testAccount: false, ...extra.customer },
  delivery: { street: '14 Cardigan Road', city: 'Leeds', postcode: 'LS6 1LF' },
  payment: { cardLast4: '4421', cardHolder: 'H ITO' },
  giftMessage: 'Happy birthday Mum, love from Hana',
  lines: [
    { sku: 'BK-1984', title: 'A novel', qty: 1, price: 9.99 },
    { sku: 'BK-2210', title: 'A cookbook', qty: 1, price: 31.51 },
  ],
  ...extra.order,
})
const msg = (payload) => ({ message: { kind: 'mq', destination: 'orders-completed', payload } })
const noPersonalData = { customer: undefined, delivery: undefined, payment: undefined, giftMessage: undefined, name: undefined, email: undefined, phone: undefined }

export default {
  id: 'fl-145',
  category: 'flows',
  title: 'Order Events for the Analytics Team Without Personal Data: Build the Event From an Allow List, Keep Only the Postcode Area, Leave Test Orders Out',
  level: 'INTERMEDIATE',
  tags: ['gdpr', 'data-minimisation', 'dataweave', 'anypoint-mq', 'analytics', 'e-commerce'],
  estMinutes: 30,
  flowChecks: [
    { label: 'Completed orders are read from the orders-completed queue', rule: { type: 'source', component: 'mq-subscriber', where: { destination: 'orders-completed' } } },
    {
      label: 'The analytics event is built field by field before it is published',
      rule: {
        type: 'any',
        rules: [
          { type: 'before', first: 'transform', firstWhere: { script: { all: ['orderId', 'postcode'] } }, then: 'mq-publish', thenWhere: { destination: 'analytics-orders' } },
          { type: 'before', first: 'set-payload', firstWhere: { value: { all: ['orderId', 'postcode'] } }, then: 'mq-publish', thenWhere: { destination: 'analytics-orders' } },
        ],
      },
    },
    {
      label: 'No part of the order is removed with the minus operator, which would let new fields through',
      rule: {
        type: 'all',
        rules: [
          { type: 'exists', component: 'mq-publish', where: { destination: 'analytics-orders' } },
          { type: 'absent', component: 'transform', where: { script: ' - "' } },
          { type: 'absent', component: 'set-payload', where: { value: ' - "' } },
        ],
      },
    },
    { label: 'Test orders are filtered out by a Choice before the publish', rule: { type: 'inside', component: 'mq-publish', within: 'choice', where: { destination: 'analytics-orders' } } },
  ],
  simulation: {
    systems: {},
    tests: [
      {
        name: 'A normal order',
        about: 'A customer in Leeds buys two books. Analytics gets the order ID, the customer ID, the postcode area LS6, the total and the lines.',
        trigger: msg(completed()),
        expect: {
          sent: [{ destination: 'analytics-orders', count: 1, has: { orderId: 'BK-77120', customerId: 'C-5531', postcodeArea: 'LS6', total: 41.5, lines: [{ sku: 'BK-1984', qty: 1 }] } }],
          ack: 'acked',
        },
      },
      {
        name: 'No personal data leaves',
        about: 'The event has no name, email, phone, street, card or gift message in it, at any level.',
        trigger: msg(completed()),
        expect: { sent: [{ destination: 'analytics-orders', count: 1, has: { ...noPersonalData, postcodeArea: 'LS6' } }] },
      },
      {
        name: 'A new field appears upstream',
        about: 'The shop starts sending the customer\'s date of birth in the order. Nobody told the integration team, and it still does not reach analytics.',
        trigger: msg(completed({ customer: { dateOfBirth: '1958-03-02' }, order: { loyaltyNotes: 'Asked about large print editions' } })),
        expect: { sent: [{ destination: 'analytics-orders', count: 1, has: { ...noPersonalData, dateOfBirth: undefined, loyaltyNotes: undefined, orderId: 'BK-77120' } }] },
      },
      {
        name: 'A test order from staff',
        about: 'A staff member places a test order from a test account. Nothing is sent to analytics, and the message is still acknowledged.',
        trigger: msg(completed({ customer: { testAccount: true } })),
        expect: { notSent: ['analytics-orders'], ack: 'acked' },
      },
    ],
  },
  referenceFlow: design(
    flow('orders-to-analytics', source('mq-subscriber', { destination: 'orders-completed' }), [
      router(
        'choice',
        {},
        [route({ expression: '#[payload.customer.testAccount == true]' }, [step('logger', { level: 'DEBUG', message: '#["Test order " ++ payload.orderId ++ " not sent to analytics"]' })])],
        {
          otherwise: [
            step('transform', {
              script:
                '%dw 2.0\noutput application/json\n---\n{\n  orderId: payload.orderId,\n  customerId: payload.customer.customerId,\n  postcodeArea: (payload.delivery.postcode splitBy " ")[0],\n  orderedAt: payload.orderedAt,\n  total: payload.total,\n  lines: payload.lines map { sku: $.sku, qty: $.qty, price: $.price }\n}',
            }),
            step('mq-publish', { destination: 'analytics-orders' }),
            step('logger', { level: 'INFO', message: '#["Order " ++ payload.orderId ++ " sent to analytics"]' }),
          ],
        },
      ),
    ]),
  ),
  description: `
An online bookshop publishes every completed order on the Anypoint MQ queue **\`orders-completed\`**:

\`\`\`json
{
  "orderId": "BK-77120", "orderedAt": "2026-11-18T10:42:00Z", "total": 41.50,
  "customer": { "customerId": "C-5531", "name": "Hana Ito", "email": "hana.ito@example.com", "phone": "07700 900555", "testAccount": false },
  "delivery": { "street": "14 Cardigan Road", "city": "Leeds", "postcode": "LS6 1LF" },
  "payment": { "cardLast4": "4421", "cardHolder": "H ITO" },
  "giftMessage": "Happy birthday Mum, love from Hana",
  "lines": [ { "sku": "BK-1984", "title": "A novel", "qty": 1, "price": 9.99 } ]
}
\`\`\`

The analytics team wants each order on the queue **\`analytics-orders\`** to study sales by area. The data protection officer has agreed to it on these terms:

**Requirements**
- Send only \`{ "orderId", "customerId", "postcodeArea", "orderedAt", "total", "lines": [ { "sku", "qty", "price" } ] }\`.
- \`postcodeArea\` is the first part of the postcode, such as \`LS6\`. The full postcode with the street can point at one house.
- No name, email, phone, street, card detail or gift message. Gift messages are free text and often hold names.
- When the shop adds a field to the order later, it must **not** reach analytics until someone decides it should.
- Orders from staff test accounts (\`testAccount: true\`) are not sent.

**Design the flow.**
`,
  answerTemplate: `## Allow list or deny list

## Building the event

## Test orders

## What else to check
`,
  keyPoints: [
    'Build the outgoing event from an allow list: name each field that may go. Every other field is left behind, today and after any change upstream.',
    'A deny list, such as payload - "giftMessage", removes what you thought of. A field added upstream next year goes straight through.',
    'Reduce what is sent, not only what is shown: the postcode area answers the analytics question, the full postcode is not needed.',
    'Free text is personal data until proven otherwise. A gift message or a delivery note often holds names.',
    'Filter test orders with a Choice, and acknowledge them like any other message, so they do not come back.',
    'Log the order ID, not the order. A Logger with #[payload] would copy the personal data into the logs.',
  ],
  solution: `
1. **Anypoint MQ Subscriber** on \`orders-completed\`.
2. **Choice**:
   - \`#[payload.customer.testAccount == true]\`: log at DEBUG and stop.
   - Otherwise:
     - **Transform Message**:
       \`\`\`dataweave
       %dw 2.0
       output application/json
       ---
       {
         orderId: payload.orderId,
         customerId: payload.customer.customerId,
         postcodeArea: (payload.delivery.postcode splitBy " ")[0],
         orderedAt: payload.orderedAt,
         total: payload.total,
         lines: payload.lines map { sku: $.sku, qty: $.qty, price: $.price }
       }
       \`\`\`
     - **Anypoint MQ Publish** to \`analytics-orders\`.
     - **Logger** with the order ID only.

**Is the customer ID personal data?** It does not name anyone on its own, but the shop can link it back to a person, so it is pseudonymous data and still covered by data protection law. The DPO agreed to it here. If analytics only needs to count repeat buyers, a salted hash of the ID, with the salt kept by the shop, is a further step.

**Lines.** The titles are left out too. A book title can say a lot about a reader, and the SKU is enough for sales figures.
`,
  followUps: [
    {
      q: 'A postcode area with very few customers can still point at a person. What then?',
      a: 'Group small areas into a larger one, or have analytics report only on groups above a minimum size. That rule belongs with the analytics team and the DPO, and the integration can apply a lookup table for it.',
    },
    {
      q: 'Analytics later needs the city too. How should that change happen?',
      a: 'Someone with the DPO agrees it, then the field is added to the allow list in the Transform and released. The change is visible in a review, which is the point of an allow list.',
    },
  ],
}
