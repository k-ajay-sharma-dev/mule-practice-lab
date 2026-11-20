import { design, flow, handler, route, router, scope, source, step } from '../../flow/dsl.js'
import { HANDLERS, handlerStatus } from '../../flow/rules.js'

export default {
  id: 'fl-010',
  category: 'flows',
  title: 'Retrying Flaky Outbound Calls with Until Successful',
  level: 'INTERMEDIATE',
  tags: ['retry', 'until-successful', 'reconnection', 'http', 'error-handling'],
  estMinutes: 20,
  flowChecks: [
    {
      label: 'The Order Process API is exposed through an HTTP Listener',
      rule: { type: 'source', component: 'http-listener' },
    },
    {
      label: 'The Inventory API call is wrapped in Until Successful',
      rule: { type: 'inside', component: 'http-request', within: 'until-successful' },
    },
    {
      label: 'Retries are bounded and about a second apart, so the 10 s caller budget holds',
      rule: {
        type: 'exists',
        component: 'until-successful',
        where: { maxRetries: { gte: 1, lte: 5 }, millisBetweenRetries: { gte: 100, lte: 3000 } },
      },
    },
    {
      label: 'The outbound call has a response timeout that fits the budget',
      rule: { type: 'exists', component: 'http-request', where: { responseTimeout: { gte: 1, lte: 5000 } } },
    },
    {
      label: 'Only non-retryable 400s are caught inside the retry scope, so other failures still retry',
      rule: {
        type: 'all',
        rules: [
          { type: 'inside', component: 'on-error-continue', where: { type: 'HTTP:BAD_REQUEST' }, within: 'until-successful' },
          {
            type: 'absent',
            component: 'on-error-continue',
            within: 'until-successful',
            where: { type: { oneOf: ['ANY', 'HTTP:SERVICE_UNAVAILABLE', 'HTTP:TIMEOUT', 'HTTP:CONNECTIVITY'] } },
          },
        ],
      },
    },
    {
      label: 'A permanent failure is raised behind a condition, after the retry scope',
      rule: {
        type: 'all',
        rules: [
          { type: 'before', first: 'until-successful', then: 'raise-error', outside: true },
          { type: 'inside', component: 'raise-error', within: 'choice' },
        ],
      },
    },
    {
      label: 'Exhausted retries (MULE:RETRY_EXHAUSTED) are mapped to a 5xx response',
      rule: handlerStatus('RETRY_EXHAUSTED', { oneOf: ['502', '503', '504'] }),
    },
    {
      label: 'The error raised for an unknown SKU is mapped to a 400 response',
      rule: {
        type: 'linked',
        from: { component: 'raise-error', key: 'type' },
        to: { component: HANDLERS, key: 'type', holding: { component: 'set-variable', where: { value: '400' } } },
        as: 'errorType',
      },
    },
  ],
  simulation: {
    systems: {
      http: [{ method: 'POST', path: '/reservations', latencyMs: 250, respond: { status: 201, body: { id: 'RSV-7781', orderId: 'ORD-4410', status: 'HELD' } } }],
    },
    tests: [
      {
        name: 'Stock is reserved',
        about: 'The partner answers at once and the caller gets the reservation.',
        trigger: { http: { method: 'POST', path: '/orders/ORD-4410/reservations', body: { orderId: 'ORD-4410', lines: [{ sku: 'SKU-1001', quantity: 2 }] } } },
        expect: { status: 200, bodyHas: { reservationId: 'RSV-7781' }, calls: [{ method: 'POST', path: '/reservations', count: 1 }] },
      },
      {
        name: 'One 503 and then success',
        about: 'The first call gets 503 Service Unavailable. A second try a moment later works.',
        trigger: { http: { method: 'POST', path: '/orders/ORD-4411/reservations', body: { orderId: 'ORD-4411', lines: [{ sku: 'SKU-1001', quantity: 1 }] } } },
        overrides: {
          systems: { http: [{ method: 'POST', path: '/reservations', responses: [{ status: 503, body: { message: 'Service Unavailable' } }, { status: 201, body: { id: 'RSV-7782', orderId: 'ORD-4411', status: 'HELD' } }] }] },
        },
        expect: { status: 200, bodyHas: { reservationId: 'RSV-7782' }, calls: [{ method: 'POST', path: '/reservations', count: 2 }], maxMs: 10000 },
      },
      {
        name: 'A socket timeout and then success',
        about: 'The first call hangs for 30 seconds. The call gives up in time, tries again and still answers within 10 seconds.',
        trigger: { http: { method: 'POST', path: '/orders/ORD-4412/reservations', body: { orderId: 'ORD-4412', lines: [{ sku: 'SKU-1001', quantity: 1 }] } } },
        overrides: {
          systems: {
            http: [{ method: 'POST', path: '/reservations', responses: [{ latencyMs: 30000, status: 201, body: { id: 'RSV-0000' } }, { latencyMs: 250, status: 201, body: { id: 'RSV-7783', orderId: 'ORD-4412', status: 'HELD' } }] }],
          },
        },
        expect: { status: 200, bodyHas: { reservationId: 'RSV-7783' }, maxMs: 10000 },
      },
      {
        name: 'An unknown SKU',
        about: 'The partner answers 400. Retrying cannot help, so it is called once and the caller gets 400.',
        trigger: { http: { method: 'POST', path: '/orders/ORD-4413/reservations', body: { orderId: 'ORD-4413', lines: [{ sku: 'SKU-NOPE', quantity: 1 }] } } },
        overrides: { systems: { http: [{ method: 'POST', path: '/reservations', respond: { status: 400, body: { message: 'Unknown SKU SKU-NOPE' } } }] } },
        expect: { status: 400, bodyLacks: { status: 'RESERVED' }, calls: [{ method: 'POST', path: '/reservations', count: 1 }] },
      },
      {
        name: 'The partner stays down',
        about: 'Every call gets 503. The retries stop in time and the caller does not get a reservation.',
        trigger: { http: { method: 'POST', path: '/orders/ORD-4414/reservations', body: { orderId: 'ORD-4414', lines: [{ sku: 'SKU-1001', quantity: 1 }] } } },
        overrides: { systems: { http: [{ method: 'POST', path: '/reservations', respond: { status: 503, body: { message: 'Service Unavailable' } } }] } },
        expect: { bodyLacks: { status: 'RESERVED' }, calls: [{ method: 'POST', path: '/reservations', min: 2 }], maxMs: 10000 },
      },
    ],
  },
  referenceFlow: design(
    flow(
      'reserve-stock-api',
      source('http-listener', { path: '/orders/{orderId}/reservations', allowedMethods: 'POST' }),
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
Your **Order Process API** (\`POST /orders/{orderId}/reservations\`) calls a partner **Inventory API** (\`POST /reservations\`) to reserve stock. The partner answers with the reservation \`id\`, and your API returns \`{ orderId, reservationId, status: "RESERVED" }\`. The partner is flaky:
- ~2% of calls fail with **503** or **socket timeouts** and succeed if retried a second later.
- Bad requests return **400** (e.g. unknown SKU). Retrying will never help, so the caller gets **400** at once.
- The calling UI times out after **10 s**. If the partner stays down, answer with a 5xx before that.

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
3. **Reconnection strategy** on the HTTP Request config (\`reconnection\` with a count/frequency) only handles failing to *connect*. It complements, not replaces, Until Successful.
4. **Exhausted:** Until Successful raises \`MULE:RETRY_EXHAUSTED\`. In the flow error handler, an On Error Propagate for that type sets \`httpStatus = 503\` and an error body \`{ code: "INVENTORY_UNAVAILABLE", correlationId }\`. \`APP:INVALID_SKU\` maps to 400.
5. **Idempotency:** send \`orderId\` as an idempotency key header / reservation reference so if a timed-out call actually succeeded, the retry is recognised by the partner instead of reserving twice.
`,
  followUps: [
    { q: 'How would you implement exponential backoff?', a: 'Until Successful uses a fixed delay. For backoff, use a custom loop that tracks an attempt counter and waits an increasing delay. Or move retries off the request path by re-queuing the message with a growing delivery delay on a broker.' },
    { q: 'Why not retry 10 times?', a: 'Retries in the request path add latency, hold threads and can amplify load on an already struggling partner. Keep in-line retries small and push longer retry windows to asynchronous processing.' },
    { q: 'Is retrying a POST always safe?', a: 'Only if the operation is idempotent or carries an idempotency key; otherwise a timeout after a successful call leads to duplicates.' },
  ],
}
