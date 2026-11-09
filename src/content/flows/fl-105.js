import { design, flow, scope, source, step } from '../../flow/dsl.js'

export default {
  id: 'fl-105',
  category: 'flows',
  title: 'Reserve Stock per Order Line with For Each',
  level: 'BEGINNER',
  tags: ['foreach', 'for-each', 'http', 'retail'],
  estMinutes: 10,
  flowChecks: [
    { label: 'An HTTP Listener receives the order', rule: { type: 'source', component: 'http-listener' } },
    { label: 'For Each loops over payload.lines', rule: { type: 'exists', component: 'foreach', where: { collection: 'lines' } } },
    {
      label: 'The inventory call POST /inventory/reservations is inside the For Each',
      rule: { type: 'inside', component: 'http-request', within: 'foreach', where: { method: 'POST', path: '/inventory/reservations' } },
    },
    { label: 'The SKU of each line is logged inside the For Each', rule: { type: 'inside', component: 'logger', within: 'foreach', where: { message: 'sku' } } },
    { label: 'The response is built once, after the For Each and not inside it', rule: { type: 'before', first: 'foreach', then: 'transform', outside: true } },
    {
      label: 'The response holds the orderId, the status RESERVED and the number of lines',
      rule: {
        type: 'all',
        rules: [
          { type: 'exists', component: 'transform', where: { script: 'orderId' } },
          { type: 'exists', component: 'transform', where: { script: 'RESERVED' } },
          { type: 'exists', component: 'transform', where: { script: { oneOf: ['sizeOf', 'counter'] } } },
        ],
      },
    },
  ],
  referenceFlow: design(
    flow('reserve-order-lines', source('http-listener', { path: '/orders/lines/reserve', allowedMethods: 'POST' }), [
      scope('foreach', { collection: '#[payload.lines]' }, [
        step('logger', { level: 'INFO', message: '#["Reserving stock for " ++ payload.sku]' }),
        step('http-request', { method: 'POST', path: '/inventory/reservations' }),
      ]),
      step('transform', {
        script: '%dw 2.0\noutput application/json\n---\n{ orderId: payload.orderId, status: "RESERVED", lineCount: sizeOf(payload.lines) }',
      }),
    ]),
  ),
  description: `
A web shop sends each order with its **order lines**. A line is one product and its quantity.

The shop calls \`POST /orders/lines/reserve\` with this body:

\`\`\`json
{
  "orderId": "ORD-7001",
  "lines": [
    { "sku": "TEA-100", "quantity": 2 },
    { "sku": "MUG-220", "quantity": 1 }
  ]
}
\`\`\`

The inventory system accepts **one line per call**: \`POST /inventory/reservations\` with a body like \`{ "sku": "TEA-100", "quantity": 2 }\`.

**For Each** is a scope, a component that holds its own steps. It runs those steps once for each item in a list, one item at a time. Inside the scope, the payload is the current item.

**Requirements**
- Log the SKU of each line.
- Call the inventory system once per line.
- After all lines are done, answer with the \`orderId\`, the status \`RESERVED\` and the number of lines.

**Design the flow.** What is the payload after the For Each finishes?
`,
  answerTemplate: `## Trigger

## The collection

## Steps inside the loop

## The payload after the loop

## Building the response
`,
  keyPoints: [
    'The For Each collection is #[payload.lines], because the loop runs over the lines and not the whole order.',
    'Inside the scope, the payload is one line, so payload.sku works and the HTTP Request sends that line as its body.',
    'For Each does not change the payload outside the scope. After it, the payload is the original order again.',
    'That is why the final Transform Message can still read payload.orderId and payload.lines.',
    'If one line fails, For Each stops and the remaining lines are not processed.',
  ],
  solution: `
1. **HTTP Listener**, path \`/orders/lines/reserve\`, allowed method \`POST\`.
2. **For Each** with the collection \`#[payload.lines]\`. Inside it:
   - **Logger** with \`#["Reserving stock for " ++ payload.sku]\`.
   - **HTTP Request**, \`POST /inventory/reservations\`. Its body is the current payload, which is the current line.
3. **Transform Message** after the scope:

\`\`\`
%dw 2.0
output application/json
---
{ orderId: payload.orderId, status: "RESERVED", lineCount: sizeOf(payload.lines) }
\`\`\`

The answers from the inventory system are not kept. If you need them, collect them in a variable inside the loop, because changes to variables stay available after the scope.
`,
  followUps: [
    {
      q: 'The second of three lines fails. What happens to the others?',
      a: 'For Each stops and the error handling takes over, so the third line is not processed. The first line stays reserved, because the inventory system does not know about the failure. A real design needs a way to release it.',
    },
    {
      q: 'How do you know which line you are on inside the loop?',
      a: 'For Each keeps a counter in a variable, called counter by default. Read it as vars.counter.',
    },
    {
      q: 'When would Parallel For Each fit better?',
      a: 'When the lines are independent and the calls take a long time, because it processes them at the same time. For Each keeps the order and handles one item at a time.',
    },
  ],
}
