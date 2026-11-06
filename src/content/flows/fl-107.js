import { design, flow, handler, source, step } from '../../flow/dsl.js'

export default {
  id: 'fl-107',
  category: 'flows',
  title: 'Money Transfer API: Return 503 When Core Banking Is Down',
  level: 'BEGINNER',
  tags: ['http', 'error-handling', 'on-error-propagate', 'http-status', 'banking'],
  estMinutes: 10,
  flowChecks: [
    {
      label: 'The API is a POST on /transfers',
      rule: { type: 'source', component: 'http-listener', where: { path: '/transfers', allowedMethods: 'POST' } },
    },
    {
      label: 'The transfer is sent to core banking with an HTTP Request',
      rule: { type: 'exists', component: 'http-request', where: { method: 'POST', path: '/core-banking' } },
    },
    {
      label: 'An unreachable core banking system is handled with On Error Propagate (HTTP:CONNECTIVITY)',
      rule: { type: 'handler', component: 'on-error-propagate', errorType: 'HTTP:CONNECTIVITY' },
    },
    {
      label: 'The handler sets vars.httpStatus to 503',
      rule: { type: 'inside', component: 'set-variable', within: 'on-error-propagate', where: { variableName: 'httpStatus', value: '503' } },
    },
    {
      label: 'The handler builds a clear error body',
      rule: { type: 'inside', component: ['set-payload', 'transform'], within: 'on-error-propagate' },
    },
  ],
  referenceFlow: design(
    flow(
      'money-transfer',
      source('http-listener', { path: '/transfers', allowedMethods: 'POST' }),
      [
        step('http-request', { method: 'POST', path: '/core-banking/transfers', responseTimeout: 5000 }),
        step('transform', {
          script: '%dw 2.0\noutput application/json\n---\n{\n  transferId: payload.transferId,\n  status: "COMPLETED"\n}',
        }),
      ],
      [
        handler('on-error-propagate', { type: 'HTTP:CONNECTIVITY, HTTP:TIMEOUT' }, [
          step('logger', { level: 'ERROR', message: '#["Transfer failed: " ++ error.description]' }),
          step('set-variable', { variableName: 'httpStatus', value: '503' }),
          step('set-payload', { value: '#[output application/json --- { code: "SERVICE_UNAVAILABLE", message: "The transfer was not confirmed. Please try again later." }]' }),
        ]),
      ],
    ),
  ),
  description: `
A bank's mobile app sends money transfers to \`POST /transfers\`. Your flow passes each one to the core banking system at \`/core-banking/transfers\`, which replies with \`{ "transferId": "T-1001" }\`.

A substitute answer is not acceptable here. If core banking is down, the app must not tell the customer that the money was sent.

**Requirements**
- Expose \`POST /transfers\` with an HTTP Listener.
- Send the transfer to core banking.
- On success, return \`{ "transferId": "T-1001", "status": "COMPLETED" }\`.
- If core banking cannot be reached or does not answer in time, log the error and return HTTP status **503** with a short JSON error body. 503 means "service unavailable, try later".

**On Error Propagate** is the handler that runs its steps and then lets the error carry on, so the flow ends as failed.

**How the status gets out:** the listener has an Error Response setting that is not shown on the canvas. Assume its status code is \`#[vars.httpStatus default 500]\` and its body is \`#[payload]\`. Your handler only needs to set the variable \`httpStatus\` and the payload.

**Design the flow.**
`,
  answerTemplate: `## Normal path

## Which errors are handled

## What the handler does

## What the caller sees
`,
  keyPoints: [
    'On Error Propagate runs its steps and then ends the flow as failed, so the listener sends its error response.',
    'The handler does not hide the failure. It only controls how the failure looks to the caller.',
    'The listener Error Response reads vars.httpStatus and the payload, which is why the handler sets both.',
    '503 tells the caller the problem is temporary and on the server side.',
    'The Logger records the real error. The caller gets a short message with no internal detail.',
  ],
  solution: `
1. **HTTP Listener**: \`POST /transfers\`. Its Error Response uses \`#[vars.httpStatus default 500]\` for the status and \`#[payload]\` for the body.
2. **HTTP Request**: \`POST /core-banking/transfers\`.
3. **Transform Message**: builds \`{ transferId, status: "COMPLETED" }\`.

**Error handling on the flow:** one **On Error Propagate** with type \`HTTP:CONNECTIVITY, HTTP:TIMEOUT\`.
- **Logger** at ERROR level with \`error.description\`.
- **Set Variable** \`httpStatus\` to \`503\`.
- **Set Payload** with a short JSON error.

When the request fails, Mule skips the Transform and runs the handler. The error then continues, the flow ends as failed, and the listener sends its Error Response with status 503.

**Compare with On Error Continue:** that handler would end the flow as a success, and the normal response would go out. For a payment, a failure that looks like a success is the worst result.
`,
  followUps: [
    {
      q: 'Why does the status come from a variable and not from the handler itself?',
      a: 'The handler has no status setting. The listener builds the response, so the handler leaves a value in vars.httpStatus and the listener reads it.',
    },
    {
      q: 'Why is the default in the listener expression 500?',
      a: 'Errors that no handler dealt with never set the variable. The default gives those a general server error status.',
    },
    {
      q: 'After a timeout, can you be sure the money did not move?',
      a: 'No. A timeout only means no answer arrived in time. Core banking may still have done the work, which is why the message says "not confirmed". A safe retry needs a unique request ID so core banking can spot a repeat.',
    },
  ],
}
