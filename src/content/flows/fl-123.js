import { design, flow, handler, route, router, source, step } from '../../flow/dsl.js'

const topUp = { cardId: 'TC-88104', amount: 20, currency: 'EUR' }
const post = (key, body = topUp) => ({ http: { method: 'POST', path: '/top-ups', headers: key ? { 'idempotency-key': key } : {}, body } })
const KEY = '7f3e9c2a-51d4-4b8e-9a61-0c2d8e4f1b77'

export default {
  id: 'fl-123',
  category: 'flows',
  title: 'Transit Card Top-Ups With an Idempotency-Key: Replay the Stored Answer, Refuse a Reused Key, Never Charge Twice',
  level: 'ADVANCED',
  tags: ['idempotency', 'object-store', 'payments', 'retries', 'http-status', 'mobile'],
  estMinutes: 35,
  flowChecks: [
    { label: 'The API is a POST on /top-ups', rule: { type: 'source', component: 'http-listener', where: { path: '/top-ups', allowedMethods: 'POST' } } },
    {
      label: 'A request without an Idempotency-Key header is refused with 400',
      rule: {
        type: 'all',
        rules: [
          { type: 'any', rules: [{ type: 'exists', component: 'validation', where: { expression: 'idempotency-key' } }, { type: 'routes', component: 'choice', routeWhere: { expression: 'idempotency-key' } }] },
          { type: 'exists', component: 'set-variable', where: { variableName: 'httpStatus', value: '400' } },
        ],
      },
    },
    { label: 'The key is looked up in the Object Store before the payment provider is called', rule: { type: 'before', first: 'os-retrieve', then: 'http-request' } },
    {
      label: 'A PROCESSING marker is stored under the key before the payment provider is called',
      rule: { type: 'before', first: 'os-store', firstWhere: { value: 'PROCESSING' }, then: 'http-request' },
    },
    {
      label: 'After the charge, the answer itself is stored under the key, on the main path',
      rule: { type: 'before', first: 'http-request', then: 'os-store', thenWhere: { value: 'response' }, outside: true },
    },
    {
      label: 'The charge sent to the payment provider carries the key as its requestId',
      rule: {
        type: 'any',
        rules: [
          { type: 'exists', component: 'transform', where: { script: { all: ['requestId', 'idempotencyKey'] } } },
          { type: 'exists', component: 'set-payload', where: { value: { all: ['requestId', 'idempotencyKey'] } } },
        ],
      },
    },
    { label: 'A Choice compares the stored request with this one', rule: { type: 'routes', component: 'choice', routeWhere: { expression: 'request' } } },
    {
      label: 'A reused key with a different body gets 422, and a request still in progress gets 409',
      rule: {
        type: 'all',
        rules: [
          { type: 'inside', component: 'set-variable', within: 'choice', where: { variableName: 'httpStatus', value: '422' } },
          { type: 'inside', component: 'set-variable', within: 'choice', where: { variableName: 'httpStatus', value: '409' } },
        ],
      },
    },
    {
      label: 'When the provider times out or cannot be reached, the marker is removed and the answer is 503',
      rule: {
        type: 'all',
        rules: [
          { type: 'inside', component: 'os-remove', within: ['on-error-propagate', 'on-error-continue'], withinWhere: { type: { oneOf: ['TIMEOUT', 'CONNECTIVITY', 'ANY'] } } },
          { type: 'inside', component: 'set-variable', within: ['on-error-propagate', 'on-error-continue'], where: { variableName: 'httpStatus', value: '503' } },
        ],
      },
    },
  ],
  simulation: {
    systems: {
      http: [
        {
          method: 'POST',
          path: '/psp/v1/charges',
          latencyMs: 900,
          respond: { status: 200, body: { chargeId: 'CH-40917', status: 'CAPTURED', amount: 20, currency: 'EUR' } },
        },
      ],
      objectStore: { topUpIdempotency: {} },
    },
    tests: [
      {
        name: 'A new top-up',
        about: 'The app sends a top-up with a fresh key. The card is charged once, the answer is 201, and the answer is kept under the key.',
        trigger: post(KEY),
        expect: {
          status: 201,
          bodyHas: { topUpId: 'CH-40917', status: 'COMPLETED' },
          calls: [{ method: 'POST', path: '/psp/v1/charges', count: 1, has: { requestId: KEY } }],
          stored: [{ key: `topup-${KEY}`, has: { state: 'DONE', status: 201 } }],
        },
      },
      {
        name: 'The app retries after a lost answer',
        about: 'The first answer never reached the phone, so the app sends the same request with the same key. It gets the same 201 answer, and the card is charged only once.',
        triggers: [post(KEY), { ...post(KEY), afterMs: 15000 }],
        expect: { status: 201, bodyHas: { topUpId: 'CH-40917' }, calls: [{ method: 'POST', path: '/psp/v1/charges', count: 1 }] },
      },
      {
        name: 'The same key with a different amount',
        about: 'A bug in the app reuses a key for a 50 euro top-up. It is refused with 422 and nothing is charged for it.',
        triggers: [post(KEY), { ...post(KEY, { ...topUp, amount: 50 }), afterMs: 60000 }],
        expect: { status: 422, calls: [{ method: 'POST', path: '/psp/v1/charges', count: 1 }] },
      },
      {
        name: 'A retry while the first request is still running',
        about: 'The key already holds a PROCESSING marker from a request that has not finished. The retry gets 409 and the provider is not called again.',
        trigger: post(KEY),
        overrides: { systems: { objectStore: { topUpIdempotency: { [`topup-${KEY}`]: { state: 'PROCESSING', request: topUp } } } } },
        expect: { status: 409, calls: [{ method: 'POST', path: '/psp/v1/charges', count: 0 }] },
      },
      {
        name: 'The provider times out, then the app retries',
        about: 'The first charge call gets no answer in time, so the caller gets 503 and the marker is removed. The retry with the same key goes to the provider again with the same requestId, and the provider returns the one charge.',
        triggers: [post(KEY), { ...post(KEY), afterMs: 30000 }],
        overrides: {
          systems: {
            http: [
              {
                method: 'POST',
                path: '/psp/v1/charges',
                responses: [
                  { latencyMs: 25000, status: 200, body: { chargeId: 'CH-40917', status: 'CAPTURED' } },
                  { latencyMs: 300, status: 200, body: { chargeId: 'CH-40917', status: 'CAPTURED' } },
                ],
              },
            ],
          },
        },
        expect: {
          status: 201,
          bodyHas: { topUpId: 'CH-40917' },
          calls: [{ method: 'POST', path: '/psp/v1/charges', count: 2, has: { requestId: KEY } }],
          stored: [{ key: `topup-${KEY}`, has: { state: 'DONE' } }],
        },
      },
      {
        name: 'No Idempotency-Key header',
        about: 'An old app version sends no key. The top-up is refused with 400 and nothing is charged.',
        trigger: post(null),
        expect: { status: 400, calls: [{ method: 'POST', path: '/psp/v1/charges', count: 0 }] },
      },
    ],
  },
  referenceFlow: design(
    flow(
      'create-top-up',
      source('http-listener', { path: '/top-ups', allowedMethods: 'POST' }),
      [
        step('validation', { check: 'is-not-blank-string', expression: "#[attributes.headers['idempotency-key']]", message: 'The Idempotency-Key header is required.' }),
        step('set-variable', { variableName: 'idempotencyKey', value: "#[attributes.headers['idempotency-key']]" }),
        step('set-variable', { variableName: 'request', value: '#[payload]' }),
        step('os-retrieve', { key: '#["topup-" ++ vars.idempotencyKey]', defaultValue: '#[null]', objectStore: 'topUpIdempotency' }),
        router(
          'choice',
          {},
          [
            route({ expression: '#[payload == null]' }, [
              step('os-store', { key: '#["topup-" ++ vars.idempotencyKey]', value: '#[{ state: "PROCESSING", request: vars.request }]', objectStore: 'topUpIdempotency' }),
              step('transform', {
                script:
                  '%dw 2.0\noutput application/json\n---\n{ cardId: vars.request.cardId, amount: vars.request.amount, currency: vars.request.currency, requestId: vars.idempotencyKey }',
              }),
              step('http-request', { method: 'POST', path: '/psp/v1/charges', responseTimeout: 10000 }),
              step('transform', {
                script: '%dw 2.0\noutput application/json\n---\n{ topUpId: payload.chargeId, cardId: vars.request.cardId, amount: vars.request.amount, status: "COMPLETED" }',
              }),
              step('os-store', {
                key: '#["topup-" ++ vars.idempotencyKey]',
                value: '#[{ state: "DONE", request: vars.request, status: 201, response: payload }]',
                objectStore: 'topUpIdempotency',
              }),
              step('set-variable', { variableName: 'httpStatus', value: '201' }),
            ]),
            route({ expression: '#[payload.request != vars.request]' }, [
              step('set-variable', { variableName: 'httpStatus', value: '422' }),
              step('set-payload', { value: '#[output application/json --- { code: "IDEMPOTENCY_KEY_REUSED", message: "This key was already used for a different top-up." }]' }),
            ]),
            route({ expression: '#[payload.state == "PROCESSING"]' }, [
              step('set-variable', { variableName: 'httpStatus', value: '409' }),
              step('set-payload', { value: '#[output application/json --- { code: "REQUEST_IN_PROGRESS", message: "This top-up is still being processed. Try again in a few seconds." }]' }),
            ]),
          ],
          {
            otherwise: [
              step('set-variable', { variableName: 'httpStatus', value: '#[payload.status]' }),
              step('set-payload', { value: '#[output application/json --- payload.response]' }),
            ],
          },
        ),
      ],
      [
        handler('on-error-propagate', { type: 'VALIDATION:BLANK_STRING' }, [
          step('set-variable', { variableName: 'httpStatus', value: '400' }),
          step('set-payload', { value: '#[output application/json --- { code: "IDEMPOTENCY_KEY_REQUIRED", message: "Send a unique Idempotency-Key header with every top-up." }]' }),
        ]),
        handler('on-error-propagate', { type: 'HTTP:TIMEOUT, HTTP:CONNECTIVITY' }, [
          step('os-remove', { key: '#["topup-" ++ vars.idempotencyKey]', objectStore: 'topUpIdempotency' }),
          step('logger', { level: 'WARN', message: '#["Top-up " ++ vars.idempotencyKey ++ " not confirmed by the provider: " ++ error.description]' }),
          step('set-variable', { variableName: 'httpStatus', value: '503' }),
          step('set-payload', { value: '#[output application/json --- { code: "NOT_CONFIRMED", message: "The top-up was not confirmed. Retry with the same Idempotency-Key." }]' }),
        ]),
      ],
    ),
  ),
  description: `
A city transport authority sells top-ups for its contactless travel cards through a mobile app. The app calls \`POST /top-ups\` with a body such as \`{ "cardId": "TC-88104", "amount": 20, "currency": "EUR" }\`. Mule charges the customer through the payment provider at \`POST /psp/v1/charges\`, which answers with a \`chargeId\` after about a second.

Riders top up on trains and in tunnels. When the phone loses signal after the request was sent, the app never sees the answer and sends the request again. Support handles about **40 double charges a week**.

The app team will now send an **Idempotency-Key** header: a new UUID for each top-up the rider starts, and the same UUID on every retry of that top-up.

The payment provider supports the same idea: a charge with a \`requestId\` it has seen before returns the original charge and does not charge again.

**Requirements**
- A top-up with a new key charges the card once and answers **201** with \`{ "topUpId": <chargeId>, "cardId", "amount", "status": "COMPLETED" }\`.
- A retry with the same key and the same body gets the **same answer** again, without a new charge.
- The same key with a **different** body is a client bug: answer **422** and do not charge.
- A retry that arrives while the first request with that key is still running gets **409**.
- If the provider times out or cannot be reached, answer **503**. The rider must be able to retry with the same key, and still be charged at most once.
- A request with no Idempotency-Key is refused with **400**.
- Keep the keys in a persistent Object Store named \`topUpIdempotency\`, under \`topup-<key>\`, for 24 hours. The Object Store's own time to live removes them.

**Facts**
- The header is \`Idempotency-Key\` (Mule reads it as \`attributes.headers['idempotency-key']\`).
- The charge call is \`POST /psp/v1/charges\` with the body \`{ "cardId", "amount", "currency", "requestId" }\`. Send the Idempotency-Key as \`requestId\`. It answers \`{ "chargeId", "status": "CAPTURED", "amount", "currency" }\`.
- Give the charge call a response timeout of **10 seconds**. A call that takes longer counts as a timeout.
- Before the charge, store \`{ "state": "PROCESSING", "request": <the body> }\` under the key. After the charge, replace it with \`{ "state": "DONE", "request": <the body>, "status": 201, "response": <the answer> }\`.

**How the status gets out:** assume the listener's response and error response both use \`#[vars.httpStatus default 200]\` for the status and \`#[payload]\` for the body.

**Design the flow.**
`,
  answerTemplate: `## Why riders were charged twice

## Reading the key

## The first request with a key

## Retries and reused keys

## When the provider does not answer

## Where the keys live
`,
  keyPoints: [
    'The client creates the key once per top-up and sends it on every retry. The server cannot tell a retry from a new top-up without it.',
    'Store a PROCESSING marker before the charge, so a retry that arrives during the call gets 409 and not a second charge.',
    'After the charge, store the full answer and its status. A retry gets exactly what the first request would have returned.',
    'Keep the original request with the key. The same key with a different body is a client bug and gets 422.',
    'Pass the key on to the payment provider as its requestId. That covers the case Mule cannot know: a timeout where the charge did happen.',
    'Because the provider removes duplicates too, Mule can drop the marker after a timeout and let the rider retry safely.',
    'Use a persistent Object Store with a time to live, so keys survive a restart and do not pile up for ever.',
  ],
  solution: `
**Why riders were charged twice.** Each retry looked like a new top-up, so Mule charged again. Mule had no way to tell them apart.

**Flow: create-top-up**
1. **HTTP Listener** \`POST /top-ups\`.
2. **Validation** \`is-not-blank-string\` on the \`idempotency-key\` header.
3. **Set Variable** \`idempotencyKey\` from the header, and \`request\` = the body.
4. **Object Store Retrieve** \`topup-<key>\` from \`topUpIdempotency\`, default \`null\`.
5. **Choice**:
   - **Nothing stored**: **Store** \`{ state: "PROCESSING", request }\`. **Transform** the charge with \`requestId: vars.idempotencyKey\`. **HTTP Request** \`POST /psp/v1/charges\`, timeout 10 seconds. **Transform** the answer. **Store** \`{ state: "DONE", request, status: 201, response }\`. Set \`httpStatus\` 201.
   - **Stored request differs from this one**: 422 \`IDEMPOTENCY_KEY_REUSED\`.
   - **State is PROCESSING**: 409 \`REQUEST_IN_PROGRESS\`.
   - **Otherwise** (DONE): set \`httpStatus\` from the stored status and return the stored response.
6. **On Error Propagate** \`VALIDATION:BLANK_STRING\`: 400.
7. **On Error Propagate** \`HTTP:TIMEOUT, HTTP:CONNECTIVITY\`: **Remove** the key, log a warning, 503 \`NOT_CONFIRMED\`.

**The timeout case.** After a timeout, Mule does not know if the card was charged. Removing the marker lets the rider retry, and the retry sends the same \`requestId\`. If the first charge went through, the provider returns it and does not charge again. If it did not, the provider charges now. Either way there is one charge.

**The Object Store.** \`topUpIdempotency\` is persistent, with an entry time to live of 24 hours. On CloudHub with several replicas, use Object Store v2, which all replicas share. A key stored on one replica must be seen by a retry that lands on another.

**One limit.** Retrieve and Store are two operations, so two copies of a request that arrive in the same few milliseconds can both find nothing. The provider's \`requestId\` still stops the second charge. If that matters for other side effects, store the marker with an operation that fails when the key is already there.
`,
  followUps: [
    {
      q: 'Why store the whole answer and not only "done"?',
      a: 'The retry must get the same answer as the first request: the same status and the same topUpId. The app can then show the rider one top-up, whichever answer arrives.',
    },
    {
      q: 'What if the payment provider did not support a requestId?',
      a: 'Then a timeout is a real unknown. Keep the marker, answer 503 or 202, and check the charge status with the provider before allowing another charge for that key.',
    },
    {
      q: 'Why not use the Idempotent Message Validator?',
      a: 'It only says "seen before" and raises MULE:DUPLICATE_MESSAGE. It cannot return the stored answer, tell a reused key from a retry, or tell a running request from a finished one.',
    },
    {
      q: 'Why 24 hours?',
      a: 'It covers every retry the app makes, with a wide margin. Keys kept longer only fill the store, since the app never reuses a key after the top-up is finished.',
    },
  ],
}
