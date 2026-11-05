import { design, flow, handler, route, router, scope, source, step } from '../../flow/dsl.js'

export default {
  id: 'fl-010',
  category: 'flows',
  title: 'Retrying Flaky Outbound Calls with Until Successful',
  level: 'INTERMEDIATE',
  tags: ['retry', 'until-successful', 'reconnection', 'http', 'error-handling'],
  estMinutes: 20,
  flowChecks: [
    { label: 'The Order Process API is exposed through an HTTP Listener', rule: { type: 'source', component: 'http-listener' } },
    {
      label: 'The Inventory API call is wrapped in Until Successful',
      rule: { type: 'inside', component: 'http-request', within: 'until-successful' },
    },
    {
      label: 'Retries are bounded (a few attempts, so the 10 s caller budget holds)',
      rule: { type: 'exists', component: 'until-successful', where: { maxRetries: { gte: 1, lte: 5 } } },
    },
    {
      label: 'The outbound call has a response timeout configured',
      rule: { type: 'exists', component: 'http-request', where: { responseTimeout: { gte: 1 } } },
    },
    {
      label: 'Non-retryable 400s are caught inside the retry scope so they do not trigger retries',
      rule: { type: 'handler', component: 'on-error-continue', errorType: 'HTTP:BAD_REQUEST', within: 'until-successful' },
    },
    {
      label: 'A permanent failure is raised as a custom error after the retry scope',
      rule: { type: 'before', first: 'until-successful', then: 'raise-error' },
    },
    {
      label: 'Exhausted retries (MULE:RETRY_EXHAUSTED) are mapped to an error response',
      rule: { type: 'handler', component: ['on-error-propagate', 'on-error-continue'], errorType: 'MULE:RETRY_EXHAUSTED' },
    },
  ],
  referenceFlow: design(
    flow(
      'reserve-stock-api',
      source('http-listener', { path: '/orders/*/reservations', allowedMethods: 'POST' }),
      [
        step('set-variable', { variableName: 'idempotencyKey', value: '#[payload.orderId]' }),
        step('set-variable', { variableName: 'permanentError', value: '#[false]' }),
        scope('until-successful', { maxRetries: 3, millisBetweenRetries: 1000 }, [
          scope(
            'try',
            {},
            [step('http-request', { method: 'POST', path: '/reservations', responseTimeout: 1500 })],
            {
              errorHandlers: [
                handler('on-error-continue', { type: 'HTTP:BAD_REQUEST, HTTP:NOT_FOUND' }, [
                  step('set-variable', { variableName: 'permanentError', value: '#[true]' }),
                ]),
              ],
            },
          ),
        ]),
        router(
          'choice',
          {},
          [
            route({ expression: '#[vars.permanentError == true]' }, [
              step('raise-error', { type: 'APP:INVALID_SKU', description: 'Inventory rejected the reservation (unknown SKU)' }),
            ]),
          ],
          {
            otherwise: [
              step('transform', {
                script: '%dw 2.0\noutput application/json\n---\n{ orderId: vars.idempotencyKey, reservationId: payload.id, status: "RESERVED" }',
              }),
            ],
          },
        ),
      ],
      [
        handler('on-error-propagate', { type: 'MULE:RETRY_EXHAUSTED' }, [
          step('set-variable', { variableName: 'httpStatus', value: '#[503]' }),
          step('transform', {
            script: '%dw 2.0\noutput application/json\n---\n{ code: "INVENTORY_UNAVAILABLE", correlationId: correlationId }',
          }),
        ]),
        handler('on-error-propagate', { type: 'APP:INVALID_SKU' }, [
          step('set-variable', { variableName: 'httpStatus', value: '#[400]' }),
          step('transform', {
            script: '%dw 2.0\noutput application/json\n---\n{ code: "INVALID_SKU", message: error.description, correlationId: correlationId }',
          }),
        ]),
      ],
    ),
  ),
  description: `
Your **Order Process API** calls a partner **Inventory API** to reserve stock. The partner is flaky:
- ~2% of calls fail with **503** or **socket timeouts** and succeed if retried a second later.
- Bad requests return **400** (e.g. unknown SKU) — retrying will never help.
- The calling UI times out after **10 s**.

**Design the flow(s):**
- How do you retry only transient failures, how many times and how far apart?
- What is the difference between a connector **reconnection strategy** and **Until Successful**?
- What error does the caller get when retries are exhausted, and how is it mapped to an HTTP response?
- How do you make sure retries don't create duplicate reservations?
`,
  answerTemplate: `## Retry mechanism

## Retry only transient errors

## Retry budget vs caller timeout

## Exhausted retries

## Duplicate protection
`,
  keyPoints: [
    'Until Successful wraps the HTTP Request with maxRetries and millisBetweenRetries sized so total time stays under the 10 s caller timeout.',
    'Non-retryable errors (HTTP:BAD_REQUEST) are prevented from triggering retries, e.g. by a Try inside Until Successful that handles them and flags the result.',
    'When retries run out, Until Successful raises MULE:RETRY_EXHAUSTED, which the error handler maps to a 502/503 response.',
    'Reconnection strategy only retries establishing a connection (connectivity errors), not failed requests on a working connection.',
    'An idempotency key (e.g. orderId as reservation reference / header) makes retried calls safe.',
  ],
  solution: `
1. **Retry scope:** HTTP Request \`POST /reservations\` inside **Until Successful** with \`maxRetries="3"\` and \`millisBetweenRetries="1000"\`. HTTP \`responseTimeout\` 2000 ms → worst case ≈ 4 attempts × 2 s + 3 s waits ≈ 11 s; tune (e.g. 1500 ms timeout) to fit the 10 s budget.
2. **Only transient errors retried:** Until Successful retries on *any* error. Inside it, put a **Try** with **On Error Continue** for \`HTTP:BAD_REQUEST\` / \`HTTP:NOT_FOUND\` that sets \`vars.permanentError\` and ends the attempt "successfully". After the scope, a Choice raises a custom error (Raise Error \`APP:INVALID_SKU\`) when the flag is set. \`HTTP:SERVICE_UNAVAILABLE\`, \`HTTP:TIMEOUT\` and \`HTTP:CONNECTIVITY\` still propagate and trigger a retry.
3. **Reconnection strategy** on the HTTP Request config (\`reconnection\` with a count/frequency) only handles failing to *connect* — it complements, not replaces, Until Successful.
4. **Exhausted:** Until Successful raises \`MULE:RETRY_EXHAUSTED\`. In the flow error handler, an On Error Propagate for that type sets \`httpStatus = 503\` and an error body \`{ code: "INVENTORY_UNAVAILABLE", correlationId }\`. \`APP:INVALID_SKU\` maps to 400.
5. **Idempotency:** send \`orderId\` as an idempotency key header / reservation reference so if a timed-out call actually succeeded, the retry is recognised by the partner instead of reserving twice.
`,
  followUps: [
    { q: 'How would you implement exponential backoff?', a: 'Until Successful uses a fixed delay. For backoff, use a custom loop that tracks an attempt counter and waits an increasing delay. Or move retries off the request path by re-queuing the message with a growing delivery delay on a broker.' },
    { q: 'Why not retry 10 times?', a: 'Retries in the request path add latency, hold threads and can amplify load on an already struggling partner. Keep in-line retries small and push longer retry windows to asynchronous processing.' },
    { q: 'Is retrying a POST always safe?', a: 'Only if the operation is idempotent or carries an idempotency key; otherwise a timeout after a successful call leads to duplicates.' },
  ],
}
