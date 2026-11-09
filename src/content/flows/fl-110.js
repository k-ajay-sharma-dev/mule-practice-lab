import { design, flow, source, step } from '../../flow/dsl.js'

export default {
  id: 'fl-110',
  category: 'flows',
  title: 'Order Intake API: Publish Each Order to an Anypoint MQ Queue',
  level: 'BEGINNER',
  tags: ['anypoint-mq', 'messaging', 'http', 'retail', 'event-driven'],
  estMinutes: 10,
  flowChecks: [
    {
      label: 'The API is a POST on /orders',
      rule: { type: 'source', component: 'http-listener', where: { path: '/orders', allowedMethods: 'POST' } },
    },
    {
      label: 'The order ID is saved in vars.orderId before the payload is replaced',
      rule: { type: 'before', first: 'set-variable', firstWhere: { variableName: 'orderId', value: 'payload.orderId' }, then: ['transform', 'set-payload'], every: true },
    },
    {
      label: 'A message with the orderId and items is built before it is published',
      rule: {
        type: 'any',
        rules: [
          { type: 'before', first: 'transform', firstWhere: { script: 'items' }, then: 'mq-publish' },
          { type: 'before', first: 'set-payload', firstWhere: { value: 'items' }, then: 'mq-publish' },
        ],
      },
    },
    {
      label: 'The message is published to the warehouse-orders queue',
      rule: { type: 'exists', component: 'mq-publish', where: { destination: 'warehouse-orders' } },
    },
    {
      label: 'The RECEIVED reply is set after the publish, on the main path',
      rule: {
        type: 'any',
        rules: [
          { type: 'before', first: 'mq-publish', then: 'set-payload', thenWhere: { value: 'RECEIVED' }, outside: true },
          { type: 'before', first: 'mq-publish', then: 'transform', thenWhere: { script: 'RECEIVED' }, outside: true },
        ],
      },
    },
  ],
  referenceFlow: design(
    flow('order-intake', source('http-listener', { path: '/orders', allowedMethods: 'POST' }), [
      step('set-variable', { variableName: 'orderId', value: '#[payload.orderId]' }),
      step('transform', {
        script: '%dw 2.0\noutput application/json\n---\n{\n  orderId: payload.orderId,\n  items: payload.items\n}',
      }),
      step('mq-publish', { destination: 'warehouse-orders' }),
      step('set-payload', { value: '#[output application/json --- { orderId: vars.orderId, status: "RECEIVED" }]' }),
    ]),
  ),
  description: `
A web shop sends each new order to \`POST /orders\`. The order has an \`orderId\`, a list of \`items\`, and payment details. The warehouse system must get the order, but it is slow at busy times and is restarted every night.

The shop should not have to wait for the warehouse. So the flow puts each order on a queue. A **queue** is a store of messages that sit waiting until another application reads them. **Anypoint MQ** is MuleSoft's cloud messaging service, and **publish** means putting a message on a queue.

**Requirements**
- Expose \`POST /orders\` with an HTTP Listener.
- Save \`orderId\` in a variable called \`orderId\`.
- Build a message that holds only \`orderId\` and \`items\`. The warehouse must not receive payment details.
- Publish it to the queue \`warehouse-orders\`.
- Reply with \`{ "orderId": "...", "status": "RECEIVED" }\`, but only after the publish worked.

Reading from the queue is the warehouse team's job. You design the sending side only.

**Design the flow.**
`,
  answerTemplate: `## Saving what the reply needs

## Building the message

## Publishing

## The reply
`,
  keyPoints: [
    'A queue separates the two systems. The shop gets its reply even when the warehouse is busy or offline.',
    'Anypoint MQ Publish sends the payload as the message body by default, so the Transform comes first.',
    'The Transform removes the payment details before the message leaves the flow.',
    'The order ID is saved first, because the Transform replaces the payload.',
    'Set Payload comes after Publish. If the publish fails, the flow stops and the shop never gets a false RECEIVED.',
  ],
  solution: `
1. **HTTP Listener**: \`POST /orders\`.
2. **Set Variable** \`orderId\`: \`#[payload.orderId]\`.
3. **Transform Message**: keeps only \`orderId\` and \`items\`, as JSON.
4. **Anypoint MQ Publish**: destination \`warehouse-orders\`. The body defaults to \`#[payload]\`.
5. **Set Payload**: \`#[output application/json --- { orderId: vars.orderId, status: "RECEIVED" }]\`.

**Why the order of steps matters:** a failed publish raises an error such as \`ANYPOINT-MQ:CONNECTIVITY\`. The flow stops before Set Payload, so the shop gets an error response and knows to try again.

The reply is built from the variable, so it does not depend on what is in the payload after the publish.

**RECEIVED, not SHIPPED:** the reply only promises that the order is safely on the queue. The warehouse has not seen it yet.
`,
  followUps: [
    {
      q: 'Why not call the warehouse directly with an HTTP Request?',
      a: 'Then the shop waits for the warehouse every time, and orders fail whenever the warehouse is slow or restarting. With a queue, orders wait until the warehouse is ready.',
    },
    {
      q: 'How would a Mule application read these messages?',
      a: 'With an Anypoint MQ Subscriber as the source of a separate flow. It starts the flow for each message that arrives on the queue.',
    },
    {
      q: 'Later the finance system needs every order too. Do you publish twice?',
      a: 'No. Publish once to an exchange, which delivers a copy of each message to every queue bound to it. The warehouse and finance each read from their own queue.',
    },
  ],
}
