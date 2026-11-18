import { design, flow, route, router, source, step } from '../../flow/dsl.js'

const order = (orderId, channel) => ({ message: { kind: 'jms', destination: 'ORDERS.IN', payload: { orderId, channel, customerId: 'C-20871', total: 412.5 } } })

export default {
  id: 'fl-152',
  category: 'flows',
  title: 'One Inbound Order Queue, Three Teams: Route Each JMS Message to the Queue for Its Sales Channel',
  level: 'BEGINNER',
  tags: ['myproject', 'queues', 'jms', 'activemq', 'content-based-router', 'choice', 'retail'],
  estMinutes: 15,
  flowChecks: [
    { label: 'Orders are read from the JMS queue ORDERS.IN', rule: { type: 'source', component: 'jms-listener', where: { destination: 'ORDERS.IN' } } },
    { label: 'A Choice router picks the queue by channel', rule: { type: 'routes', component: 'choice', min: 2, routeWhere: { expression: 'channel' } } },
    { label: 'B2B orders go to ORDERS.B2B', rule: { type: 'inside', component: 'jms-publish', within: 'choice', where: { destination: 'ORDERS.B2B' } } },
    { label: 'Web orders go to ORDERS.WEB', rule: { type: 'inside', component: 'jms-publish', within: 'choice', where: { destination: 'ORDERS.WEB' } } },
    {
      label: 'Any other channel goes to ORDERS.UNKNOWN with a WARN',
      rule: {
        type: 'all',
        rules: [
          { type: 'inside', component: 'jms-publish', within: 'choice', inSlot: 'otherwise', where: { destination: 'ORDERS.UNKNOWN' } },
          { type: 'inside', component: 'logger', within: 'choice', inSlot: 'otherwise', where: { level: 'WARN' } },
        ],
      },
    },
  ],
  simulation: {
    tests: [
      {
        name: 'A B2B order',
        about: 'An order from the trade portal goes to the B2B team\'s queue and nowhere else.',
        trigger: order('SO-50021', 'B2B'),
        expect: { sent: [{ destination: 'ORDERS.B2B', count: 1, has: { orderId: 'SO-50021' } }], notSent: ['ORDERS.WEB', 'ORDERS.UNKNOWN'], ack: 'acked' },
      },
      {
        name: 'A web order',
        about: 'An order from the web shop goes to the web team\'s queue.',
        trigger: order('SO-50022', 'WEB'),
        expect: { sent: [{ destination: 'ORDERS.WEB', count: 1 }], notSent: ['ORDERS.B2B', 'ORDERS.UNKNOWN'] },
      },
      {
        name: 'A channel in lower case',
        about: 'An older till sends "b2b". It is still a B2B order.',
        trigger: order('SO-50023', 'b2b'),
        expect: { sent: [{ destination: 'ORDERS.B2B', count: 1 }], notSent: ['ORDERS.UNKNOWN'] },
      },
      {
        name: 'An unknown channel',
        about: 'A new phone sales app sends "PHONE". The order is kept on ORDERS.UNKNOWN and a WARN is logged, so it is not lost.',
        trigger: order('SO-50024', 'PHONE'),
        expect: { sent: [{ destination: 'ORDERS.UNKNOWN', count: 1, has: { orderId: 'SO-50024' } }], notSent: ['ORDERS.B2B', 'ORDERS.WEB'], logs: [{ level: 'WARN' }] },
      },
    ],
  },
  referenceFlow: design(
    flow('route-orders-by-channel', source('jms-listener', { destination: 'ORDERS.IN', ackMode: 'AUTO' }), [
      step('set-variable', { variableName: 'channel', value: '#[upper(payload.channel default "")]' }),
      router(
        'choice',
        {},
        [
          route({ expression: '#[vars.channel == "B2B"]' }, [step('jms-publish', { destination: 'ORDERS.B2B', destinationType: 'QUEUE', persistentDelivery: 'true' })]),
          route({ expression: '#[vars.channel == "WEB"]' }, [step('jms-publish', { destination: 'ORDERS.WEB', destinationType: 'QUEUE', persistentDelivery: 'true' })]),
        ],
        {
          otherwise: [
            step('logger', { level: 'WARN', message: '#["Order " ++ (payload.orderId default "?") ++ " has unknown channel " ++ vars.channel]' }),
            step('jms-publish', { destination: 'ORDERS.UNKNOWN', destinationType: 'QUEUE', persistentDelivery: 'true' }),
          ],
        },
      ),
    ]),
  ),
  description: `
Kestrel Office Supplies, a fictional wholesaler, receives every order on one ActiveMQ queue, \`ORDERS.IN\`. Each message carries a \`channel\`:

\`{ "orderId": "SO-50021", "channel": "B2B", "customerId": "C-20871", "total": 412.5 }\`

Two teams now run their own order apps. The trade team reads \`ORDERS.B2B\`, the web team reads \`ORDERS.WEB\`. Neither wants the other's orders.

**Requirements**
- Read \`ORDERS.IN\` with a JMS listener.
- Send B2B orders to \`ORDERS.B2B\` and WEB orders to \`ORDERS.WEB\`, unchanged.
- Some older tills send the channel in lower case. Treat \`b2b\` as \`B2B\`.
- An order with any other channel, or none, goes to \`ORDERS.UNKNOWN\` with a WARN log. It must never be dropped.

**Design the flow.**
`,
  answerTemplate: `## Reading the inbound queue

## Choosing the queue

## Unknown channels
`,
  keyPoints: [
    'This is a content based router: one inbound queue, and a Choice that picks the outbound queue from a field in the message.',
    'Normalise the field once (upper case, with a default for a missing value) and route on that.',
    'The otherwise branch catches everything the routes do not. Without it, an order with a new channel is consumed and lost.',
    'JMS Publish sends the payload as it is, so the teams get the original order.',
    'With AUTO acknowledgement the inbound message is acknowledged when the flow ends well. If a publish fails, the flow fails and the broker redelivers the order.',
  ],
  solution: `
1. **JMS On New Message** on \`ORDERS.IN\`.
2. **Set Variable** \`channel\` = \`#[upper(payload.channel default "")]\`.
3. **Choice**:
   - \`#[vars.channel == "B2B"]\`: **JMS Publish** \`ORDERS.B2B\`.
   - \`#[vars.channel == "WEB"]\`: **JMS Publish** \`ORDERS.WEB\`.
   - Otherwise: **Logger** WARN with the order ID and channel, then **JMS Publish** \`ORDERS.UNKNOWN\`.

**Persistent delivery.** Publish with persistent delivery on, so a broker restart does not lose orders that are waiting.

**A new channel later.** When the phone sales app gets a team, add one route. Orders that arrived before that are waiting on \`ORDERS.UNKNOWN\` and can be moved over.
`,
  followUps: [
    {
      q: 'Could the teams use message selectors on ORDERS.IN instead?',
      a: 'Yes, if the channel were a JMS property. Each team would read ORDERS.IN with a selector such as channel = \'B2B\'. But a message no selector matches waits for ever, and lower case values would not match. The router keeps that logic in one place.',
    },
    {
      q: 'Why not a topic, so both teams see everything and pick what they need?',
      a: 'Each team would receive and throw away the other\'s orders, and an order neither wants would vanish. A queue per team gives each one only its own work.',
    },
  ],
}
