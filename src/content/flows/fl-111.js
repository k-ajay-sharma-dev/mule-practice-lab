import { design, flow, handler, scope, source, step } from '../../flow/dsl.js'

export default {
  id: 'fl-111',
  category: 'flows',
  title: 'Order Confirmation: Protect the Loyalty Call with a Try Scope',
  level: 'BEGINNER',
  tags: ['try', 'on-error-continue', 'error-handling', 'http', 'database', 'loyalty', 'retail'],
  estMinutes: 10,
  flowChecks: [
    {
      label: 'The order is saved with Database Insert before the Try',
      rule: { type: 'before', first: 'db-insert', then: 'try' },
    },
    {
      label: 'The loyalty call is inside a Try scope',
      rule: { type: 'inside', component: 'http-request', within: 'try', where: { path: '/loyalty' } },
    },
    {
      label: 'The Try has its own On Error Continue',
      rule: { type: 'handler', component: 'on-error-continue', within: 'try' },
    },
    {
      label: 'The handler logs the failure',
      rule: { type: 'inside', component: 'logger', within: 'on-error-continue' },
    },
    {
      label: 'The reply is set after the Try',
      rule: { type: 'before', first: 'on-error-continue', then: ['set-payload', 'transform'] },
    },
  ],
  referenceFlow: design(
    flow('confirm-order', source('http-listener', { path: '/orders', allowedMethods: 'POST' }), [
      step('set-variable', { variableName: 'order', value: '#[payload]' }),
      step('db-insert', {
        database: 'MySQL',
        sql: 'INSERT INTO orders (order_id, customer_id, total) VALUES (:orderId, :customerId, :total)',
      }),
      step('transform', {
        script: '%dw 2.0\noutput application/json\n---\n{\n  customerId: vars.order.customerId,\n  amount: vars.order.total\n}',
      }),
      scope('try', {}, [step('http-request', { method: 'POST', path: '/loyalty/points', responseTimeout: 2000 })], {
        errorHandlers: [
          handler('on-error-continue', { type: 'ANY' }, [
            step('logger', { level: 'WARN', message: '#["Loyalty points not added for order " ++ vars.order.orderId]' }),
          ]),
        ],
      }),
      step('set-payload', { value: '#[output application/json --- { orderId: vars.order.orderId, status: "CONFIRMED" }]' }),
    ]),
  ),
  description: `
A retailer's \`POST /orders\` API does two things with each order:

1. Saves it in the \`orders\` table. This must work, or the order does not exist.
2. Adds loyalty points by calling \`/loyalty/points\`. This is a nice extra. The points can be added by hand later.

Last week the loyalty service was down for an hour and every order failed, even though the orders themselves were fine. A failed loyalty call must no longer fail the order.

A **Try scope** is a box around one or more steps with its own error handlers. An error inside it can be dealt with there, and the flow carries on with the step **after** the Try.

**Requirements**
- Save the whole order in a variable called \`order\`, because later steps replace the payload.
- Insert the order into the database.
- Build the loyalty request with \`customerId\` and \`amount\` (the order \`total\`).
- Call the loyalty service inside a Try, with an On Error Continue that logs a warning.
- Always finish with the reply \`{ "orderId": "...", "status": "CONFIRMED" }\`.

**Design the flow.**
`,
  answerTemplate: `## Saving the order

## What goes inside the Try

## What happens when the loyalty call fails

## The reply
`,
  keyPoints: [
    'A Try scope limits error handling to the steps inside it. Only the loyalty call is protected.',
    'The Database Insert stays outside the Try, so a failed insert still fails the request.',
    'On Error Continue inside a Try ends the Try as a success, and the flow carries on with the next step after it.',
    'A flow level On Error Continue would end the whole flow at that point, and the steps after the failure would be skipped.',
    'The Insert and the HTTP Request both replace the payload, so the order is kept in a variable and the reply is set at the end.',
  ],
  solution: `
1. **HTTP Listener**: \`POST /orders\`.
2. **Set Variable** \`order\`: \`#[payload]\`.
3. **Database Insert**: the order row. If this fails, the error is not caught and the caller gets an error response, which is correct.
4. **Transform Message**: builds the loyalty request from \`vars.order\`.
5. **Try**
   - **HTTP Request**: \`POST /loyalty/points\`.
   - **On Error Continue** with type \`ANY\` and a **Logger** at WARN level, including the order ID so the points can be added later. \`ANY\` is safe here because the loyalty call is the only step in the Try. A 500 from the loyalty service must not fail the order either.
6. **Set Payload**: \`#[output application/json --- { orderId: vars.order.orderId, status: "CONFIRMED" }]\`.

**Both paths meet at step 6:**
- Loyalty works: the Try ends normally and the flow moves on.
- Loyalty fails: the handler logs, the Try ends as a success, and the flow moves on.

The payload differs between the two paths, which is why the reply is built from the variable and not from the payload.
`,
  followUps: [
    {
      q: 'What if the handler inside the Try were On Error Propagate?',
      a: 'The Try would end with the error, and it would pass up to the flow. With no other handler, the request would fail and the reply step would not run. That is the old problem again.',
    },
    {
      q: 'Why not put the Database Insert inside the Try too?',
      a: 'The On Error Continue would then cover the insert as well, and the caller could get CONFIRMED for an order that was never saved. Keep the Try around only the step that is allowed to fail.',
    },
    {
      q: 'How could the missed points be added later without reading logs?',
      a: 'In the handler, publish the failed request to a queue or write it to a table, and let a separate flow retry it. The Logger is the simplest first step.',
    },
  ],
}
