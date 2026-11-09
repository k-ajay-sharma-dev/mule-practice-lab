import { design, flow, handler, source, step } from '../../flow/dsl.js'

export default {
  id: 'fl-106',
  category: 'flows',
  title: 'Delivery Estimate API: Return a Standard Answer When the Carrier Is Down',
  level: 'BEGINNER',
  tags: ['http', 'error-handling', 'fallback', 'on-error-continue', 'retail'],
  estMinutes: 10,
  flowChecks: [
    {
      label: 'The API is a GET on /delivery-estimate',
      rule: { type: 'source', component: 'http-listener', where: { path: '/delivery-estimate', allowedMethods: 'GET' } },
    },
    {
      label: 'The carrier call waits at most 2 seconds',
      rule: { type: 'exists', component: 'http-request', where: { responseTimeout: { gte: 1, lte: 2000 } } },
    },
    {
      label: 'An unreachable carrier is handled with On Error Continue (HTTP:CONNECTIVITY)',
      rule: { type: 'handler', component: 'on-error-continue', errorType: 'HTTP:CONNECTIVITY' },
    },
    {
      label: 'A slow carrier is handled with On Error Continue (HTTP:TIMEOUT)',
      rule: { type: 'handler', component: 'on-error-continue', errorType: 'HTTP:TIMEOUT' },
    },
    {
      label: 'No catch-all On Error Continue turns other failures into a made up estimate',
      rule: {
        type: 'all',
        rules: [
          { type: 'exists', component: 'on-error-continue' },
          { type: 'absent', component: 'on-error-continue', where: { type: 'ANY' } },
        ],
      },
    },
    {
      label: 'The handler logs a warning',
      rule: { type: 'inside', component: 'logger', within: 'on-error-continue', where: { level: 'WARN' } },
    },
    {
      label: 'The fallback answer, marked as source standard, is built inside the handler',
      rule: {
        type: 'any',
        rules: [
          { type: 'inside', component: 'set-payload', within: 'on-error-continue', where: { value: 'standard' } },
          { type: 'inside', component: 'transform', within: 'on-error-continue', where: { script: 'standard' } },
        ],
      },
    },
    {
      label: 'On success the answer uses the carrier number and source carrier',
      rule: {
        type: 'any',
        rules: [
          { type: 'before', first: 'http-request', then: 'transform', thenWhere: { script: 'estimatedDays' }, outside: true },
          { type: 'before', first: 'http-request', then: 'set-payload', thenWhere: { value: 'estimatedDays' }, outside: true },
        ],
      },
    },
  ],
  referenceFlow: design(
    flow(
      'delivery-estimate',
      source('http-listener', { path: '/delivery-estimate', allowedMethods: 'GET' }),
      [
        step('http-request', { method: 'GET', path: '/carrier/estimate', responseTimeout: 2000 }),
        step('transform', {
          script: '%dw 2.0\noutput application/json\n---\n{\n  days: payload.estimatedDays,\n  source: "carrier"\n}',
        }),
      ],
      [
        handler('on-error-continue', { type: 'HTTP:CONNECTIVITY, HTTP:TIMEOUT' }, [
          step('logger', { level: 'WARN', message: '#["Carrier unavailable, using the standard estimate: " ++ error.description]' }),
          step('set-payload', { value: '#[output application/json --- { days: 5, source: "standard" }]' }),
        ]),
      ],
    ),
  ),
  description: `
An online shop shows "arrives in N days" on the checkout page. The number comes from a carrier API at \`/carrier/estimate\`, which returns JSON such as \`{ "estimatedDays": 2 }\`.

The carrier API goes down now and then. The shop does not want checkout to break because of it. A rough answer is good enough.

**Requirements**
- Expose \`GET /delivery-estimate\` with an HTTP Listener.
- Call the carrier and wait at most **2 seconds**.
- On success, return \`{ "days": 2, "source": "carrier" }\`, using the carrier's number.
- If the carrier cannot be reached or does not answer in time, log a warning and return \`{ "days": 5, "source": "standard" }\`.
- The caller must get a normal success response in both cases.

An **error handler** is a set of steps that runs when a step in the flow fails. **On Error Continue** is the handler that treats the error as dealt with, so the caller sees a success.

**Design the flow.**
`,
  answerTemplate: `## Normal path

## Which errors are handled

## What the handler does

## What the caller sees
`,
  keyPoints: [
    'On Error Continue runs its steps and then ends the flow as a success, so the listener sends its normal response.',
    'The payload set in the handler becomes the response body.',
    'The handler is on the flow, so the steps after the failed one do not run. The Transform is skipped when the carrier fails.',
    'Naming HTTP:CONNECTIVITY and HTTP:TIMEOUT keeps other problems visible. A bug in the Transform is not hidden behind a made up estimate.',
    'The Logger keeps a record, because the caller will not know that anything went wrong.',
  ],
  solution: `
1. **HTTP Listener**: \`GET /delivery-estimate\`.
2. **HTTP Request**: \`GET /carrier/estimate\` with a response timeout of 2000 ms.
3. **Transform Message**: builds \`{ days, source: "carrier" }\` from the carrier's reply.

**Error handling on the flow:** one **On Error Continue** with type \`HTTP:CONNECTIVITY, HTTP:TIMEOUT\`.
- **Logger** at WARN level, so the support team can see how often the fallback is used.
- **Set Payload** with \`#[output application/json --- { days: 5, source: "standard" }]\`.

When the request fails, Mule skips the Transform and runs the handler. On Error Continue then ends the flow as a success, and the listener returns the handler's payload as a normal response.

The \`source\` field lets the shop tell a real estimate from the standard one.
`,
  followUps: [
    {
      q: 'What would the caller see if you used On Error Propagate here instead?',
      a: 'The flow would end as failed and the listener would send its error response. Checkout would have to deal with an error, which is what the shop wants to avoid.',
    },
    {
      q: 'Why not set the handler type to ANY?',
      a: 'ANY would also catch mistakes that have nothing to do with the carrier, such as a bug in the Transform. Those would turn into a quiet "5 days" answer and be hard to notice.',
    },
    {
      q: 'Is On Error Continue always the right choice for a failed call?',
      a: 'No. It suits cases where a substitute answer is acceptable, like an estimate. If the caller must know the work did not happen, such as a payment, the error has to reach the caller.',
    },
  ],
}
