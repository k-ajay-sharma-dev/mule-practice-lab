import { design, flow, source, step } from '../../flow/dsl.js'

export default {
  id: 'fl-100',
  category: 'flows',
  title: 'Stock Reservation: Keep the Order ID with Set Variable',
  level: 'BEGINNER',
  tags: ['set-variable', 'http-listener', 'http', 'retail'],
  estMinutes: 10,
  flowChecks: [
    { label: 'An HTTP Listener receives the POST request', rule: { type: 'source', component: 'http-listener', where: { allowedMethods: 'POST' } } },
    { label: 'Set Variable stores the order ID in a variable called orderId', rule: { type: 'exists', component: 'set-variable', where: { variableName: 'orderId', value: 'payload.orderId' } } },
    { label: 'The order ID is stored before the warehouse call replaces the payload', rule: { type: 'before', first: 'set-variable', then: 'http-request' } },
    { label: 'The response is built after the warehouse call', rule: { type: 'before', first: 'http-request', then: 'transform' } },
    { label: 'The response reads the stored value with vars.orderId', rule: { type: 'exists', component: 'transform', where: { script: 'vars.orderId' } } },
  ],
  referenceFlow: design(
    flow('reserve-stock', source('http-listener', { path: '/orders/reserve', allowedMethods: 'POST' }), [
      step('set-variable', { variableName: 'orderId', value: '#[payload.orderId]' }),
      step('http-request', { method: 'POST', path: '/warehouse/reservations' }),
      step('transform', {
        script: '%dw 2.0\noutput application/json\n---\n{ orderId: vars.orderId, reservationId: payload.reservationId }',
      }),
      step('logger', { level: 'INFO', message: '#["Stock reserved for order " ++ vars.orderId]' }),
    ]),
  ),
  description: `
A web shop reserves stock in the warehouse system when a customer places an order.

The shop sends \`POST /orders/reserve\` with this body:

\`\`\`json
{ "orderId": "ORD-5521", "sku": "TEA-100", "quantity": 2 }
\`\`\`

The flow forwards that body to the warehouse system with an **HTTP Request** (\`POST /warehouse/reservations\`). The warehouse answers with:

\`\`\`json
{ "reservationId": "RES-880" }
\`\`\`

Here is the problem. The warehouse answer **replaces the payload**, so the order ID is gone after the call.

A **variable** is a named value that travels with the message and is not touched when the payload changes. You create one with **Set Variable** and read it with \`vars.\` and its name.

**Requirements**
- Keep the order ID in a variable called \`orderId\`.
- Answer the shop with both the \`orderId\` and the \`reservationId\`.
- Log a line that contains the order ID.

**Design the flow.**
`,
  answerTemplate: `## Trigger

## Storing the order ID

## Calling the warehouse

## Building the response
`,
  keyPoints: [
    'Set Variable must come before the warehouse call. After the call, payload.orderId no longer exists.',
    'The HTTP Request replaces the payload with the warehouse answer.',
    'A variable is read later as vars.orderId in any expression or DataWeave script.',
    'The final Transform Message combines the variable and the new payload into one response.',
  ],
  solution: `
1. **HTTP Listener**, path \`/orders/reserve\`, allowed method \`POST\`.
2. **Set Variable** \`orderId\` with the value \`#[payload.orderId]\`.
3. **HTTP Request**, \`POST /warehouse/reservations\`. It sends the current payload as the body. Afterwards the payload is the warehouse answer.
4. **Transform Message** with this script:

\`\`\`
%dw 2.0
output application/json
---
{ orderId: vars.orderId, reservationId: payload.reservationId }
\`\`\`

5. **Logger** with \`#["Stock reserved for order " ++ vars.orderId]\`.

The order of steps 2 and 3 is the whole point. If they were swapped, \`payload.orderId\` would be empty when the variable is set.
`,
  followUps: [
    {
      q: 'Why not save the whole payload in a variable?',
      a: 'You can, and that is useful when many fields are needed later. Here one field is enough, and a small variable makes the intent clear to the next reader.',
    },
    {
      q: 'What would the flow return if the Set Variable came after the HTTP Request?',
      a: 'The warehouse answer has no orderId field, so the variable would hold null and the order ID would be lost.',
    },
    {
      q: 'What is the difference between a variable and the payload?',
      a: 'The payload is the main data, and most connectors replace it with their result. A variable is a side value that stays the same until you change it.',
    },
  ],
}
