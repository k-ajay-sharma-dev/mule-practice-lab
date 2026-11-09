import { design, flow, scope, source, step } from '../../flow/dsl.js'

export default {
  id: 'fl-113',
  category: 'flows',
  title: 'Parcel Return API: Send the Confirmation Email in an Async Scope',
  level: 'BEGINNER',
  tags: ['async', 'email', 'notifications', 'database', 'retail'],
  estMinutes: 10,
  flowChecks: [
    {
      label: 'The API is a POST on /returns',
      rule: { type: 'source', component: 'http-listener', where: { path: '/returns', allowedMethods: 'POST' } },
    },
    {
      label: 'The whole request is saved in vars.returnRequest before the insert replaces the payload',
      rule: { type: 'before', first: 'set-variable', firstWhere: { variableName: 'returnRequest', value: 'payload]' }, then: 'db-insert' },
    },
    {
      label: 'The return is inserted into parcel_returns before the Async scope',
      rule: { type: 'before', first: 'db-insert', firstWhere: { sql: 'parcel_returns' }, then: 'async' },
    },
    {
      label: 'The insert stays outside the Async scope, because the reply promises the return is saved',
      rule: {
        type: 'all',
        rules: [
          { type: 'exists', component: 'db-insert' },
          { type: 'absent', component: 'db-insert', within: 'async' },
        ],
      },
    },
    {
      label: 'The email to the customer is sent inside the Async scope',
      rule: { type: 'inside', component: 'email-send', within: 'async', where: { toAddresses: 'email' } },
    },
    {
      label: 'The RECEIVED reply is set on the main path after the return is saved',
      rule: {
        type: 'any',
        rules: [
          { type: 'before', first: 'db-insert', then: 'set-payload', thenWhere: { value: 'RECEIVED' }, outside: true },
          { type: 'before', first: 'db-insert', then: 'transform', thenWhere: { script: 'RECEIVED' }, outside: true },
        ],
      },
    },
    {
      label: 'The reply is not built inside the Async scope',
      rule: {
        type: 'all',
        rules: [
          { type: 'exists', component: 'async' },
          { type: 'absent', component: 'set-payload', within: 'async', where: { value: 'RECEIVED' } },
          { type: 'absent', component: 'transform', within: 'async', where: { script: 'RECEIVED' } },
        ],
      },
    },
  ],
  referenceFlow: design(
    flow('create-return', source('http-listener', { path: '/returns', allowedMethods: 'POST' }), [
      step('set-variable', { variableName: 'returnRequest', value: '#[payload]' }),
      step('db-insert', {
        database: 'MySQL',
        sql: 'INSERT INTO parcel_returns (return_id, order_id, email) VALUES (:returnId, :orderId, :email)',
      }),
      scope('async', {}, [
        step('email-send', {
          toAddresses: '#[vars.returnRequest.email]',
          subject: 'We received your return request',
          content: '#["Your return " ++ vars.returnRequest.returnId ++ " is booked."]',
        }),
      ]),
      step('set-payload', { value: '#[output application/json --- { returnId: vars.returnRequest.returnId, status: "RECEIVED" }]' }),
    ]),
  ),
  description: `
A shipping company lets customers book a parcel return on its website with \`POST /returns\`. The body has \`returnId\`, \`orderId\` and \`email\`.

The flow saves the return, then emails the customer. The mail server is often slow, so the web page sits there spinning. The customer does not need to wait for the email. They only need to know the return is booked.

An **Async scope** is a box of steps that runs alongside the main flow. The main flow does not wait for it, and moves straight to the next step.

**Requirements**
- Expose \`POST /returns\` with an HTTP Listener.
- Save the whole request in a variable called \`returnRequest\`, because the Insert replaces the payload.
- Insert the return into the \`parcel_returns\` table.
- Send the email to the customer inside an Async scope.
- Reply with \`{ "returnId": "...", "status": "RECEIVED" }\` without waiting for the email.

**Design the flow.**
`,
  answerTemplate: `## Saving the return

## What goes inside the Async scope

## The reply

## If the email fails
`,
  keyPoints: [
    'The main flow does not wait for the Async scope, so a slow mail server no longer delays the reply.',
    'Only the step the caller need not wait for goes inside the Async scope. The Insert stays outside, because the reply promises the return is saved.',
    'The scope gets its own copy of the message, so it can read the variable that was set before it.',
    'Results from the Async scope do not come back to the main flow, so the reply cannot depend on the email.',
    'The caller is not told if the email fails, because the reply may already be gone.',
  ],
  solution: `
1. **HTTP Listener**: \`POST /returns\`.
2. **Set Variable** \`returnRequest\`: \`#[payload]\`.
3. **Database Insert**: the return row. If it fails, the flow stops and the caller gets an error.
4. **Async**
   - **Email Send** to \`#[vars.returnRequest.email]\`, with the return ID in the body.
5. **Set Payload**: \`#[output application/json --- { returnId: vars.returnRequest.returnId, status: "RECEIVED" }]\`.

**What happens at step 4:** one copy of the message goes into the scope and another carries on to step 5. Both run at the same time, so the listener replies while the email is still being sent.

**The trade-off:** this is often called "fire and forget". The Async scope sends nothing back, so the flow cannot report whether the email was sent. That is fine for a courtesy email. It would be wrong for a step the reply depends on.
`,
  followUps: [
    {
      q: 'How would you record a failed email?',
      a: 'The Async scope does not use the flow\'s error handlers. Put a Try scope inside the Async scope, around the Email Send, with an On Error Continue that logs the failure.',
    },
    {
      q: 'If a step inside the Async scope sets the payload, does the reply change?',
      a: 'No. Results from the scope do not return to the main flow, so the reply is built from what the main flow already holds.',
    },
    {
      q: 'The company now says no email may ever be lost. Is Async still enough?',
      a: 'No. If the application stops, work running in the scope can be lost, and nothing retries it. Publish the email request to a queue, and let a separate flow read the queue and send it.',
    },
  ],
}
