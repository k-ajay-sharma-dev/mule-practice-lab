import { design, flow, handler, route, router, scope, source, step } from '../../flow/dsl.js'
import { HANDLERS, handlerStatus } from '../../flow/rules.js'

const CB_STORE = 'merchant-circuit-breaker'
const TRANSIENT = ['TIMEOUT', 'CONNECTIVITY', 'SERVICE_UNAVAILABLE', 'INTERNAL_SERVER_ERROR', 'BAD_GATEWAY']

export default {
  id: 'fl-036',
  category: 'flows',
  title: 'Webhook Relay with Retries and a Per-Merchant Circuit Breaker',
  level: 'EXPERT',
  tags: ['circuit-breaker', 'object-store', 'webhook', 'anypoint-mq', 'retry', 'dlq', 'resilience'],
  estMinutes: 45,
  flowChecks: [
    { label: 'Provider webhooks are received through an HTTP Listener', rule: { type: 'source', component: 'http-listener' } },
    {
      label: 'The webhook is handed to a queue instead of calling the merchant in-line',
      rule: {
        type: 'all',
        rules: [
          { type: 'before', first: 'http-listener', then: 'mq-publish' },
          { type: 'absent', component: ['http-request', 'until-successful'], inFlowWith: { component: 'http-listener' } },
        ],
      },
    },
    { label: 'A webhook with an invalid signature is rejected with 401', rule: handlerStatus('VALIDATION', '401') },
    {
      label: 'A worker consumes the relay queue with manual acknowledgement',
      rule: { type: 'source', component: 'mq-subscriber', where: { acknowledgementMode: 'MANUAL' } },
    },
    {
      label: 'The circuit state is read from Object Store before calling the merchant',
      rule: { type: 'before', first: 'os-retrieve', then: 'http-request' },
    },
    {
      label: 'The merchant is only called when the circuit is not open (call sits inside a Choice)',
      rule: { type: 'inside', component: 'http-request', within: 'choice' },
    },
    {
      label: 'The merchant call has a short response timeout',
      rule: { type: 'exists', component: 'http-request', where: { responseTimeout: { gte: 1, lte: 10000 } } },
    },
    {
      label: 'A successful call closes the circuit again in Object Store',
      rule: { type: 'before', first: 'http-request', then: 'os-store', outside: true },
    },
    {
      label: 'A transient failure (timeout, connectivity, 5xx) updates the failure count in Object Store',
      rule: {
        type: 'inside',
        component: 'os-store',
        within: ['on-error-continue', 'on-error-propagate'],
        withinWhere: { type: { oneOf: TRANSIENT } },
      },
    },
    {
      label: 'Transient failures are retried by re-queuing the event, not by holding a thread in Until Successful',
      rule: {
        type: 'all',
        rules: [
          {
            type: 'inside',
            component: 'mq-publish',
            where: { destination: { not: 'dlq' } },
            within: ['on-error-continue', 'on-error-propagate'],
            withinWhere: { type: { oneOf: TRANSIENT } },
          },
          { type: 'absent', component: 'until-successful' },
        ],
      },
    },
    {
      label: 'Non-retryable merchant errors (400, 404) go straight to the DLQ',
      rule: {
        type: 'inside',
        component: 'mq-publish',
        within: ['on-error-continue', 'on-error-propagate'],
        where: { destination: 'dlq' },
        withinWhere: { type: { oneOf: ['BAD_REQUEST', 'NOT_FOUND'] } },
      },
    },
    {
      label: 'Webhooks that run out of retries are dead-lettered too',
      rule: {
        type: 'inside',
        component: 'mq-publish',
        within: ['on-error-continue', 'on-error-propagate'],
        where: { destination: 'dlq' },
        withinWhere: { type: { oneOf: TRANSIENT } },
      },
    },
    {
      label: 'The message is acked on every handled path: parked, delivered, dead-lettered and re-queued',
      rule: { type: 'exists', component: 'mq-ack', min: 4 },
    },
    {
      label: 'An unexpected error nacks the message so the broker redelivers it',
      rule: { type: 'inside', component: 'mq-nack', within: HANDLERS },
    },
    {
      label: 'An admin endpoint resets a merchant circuit by removing its Object Store entry',
      rule: { type: 'exists', component: 'os-remove' },
    },
  ],
  optionalSteps: [
    {
      type: 'on-error-continue',
      flow: 'circuit-breaker-admin',
      why: 'This handler only lets the reset succeed when no circuit is stored for the merchant. Answering with an error in that case is also fine.',
    },
  ],
  referenceFlow: design(
    flow(
      'webhook-intake',
      source('http-listener', { path: '/webhooks/{merchantId}', allowedMethods: 'POST' }),
      [
        step('set-variable', {
          variableName: 'signatureValid',
          value:
            '#[(attributes.headers."x-signature" default "") == dw::Crypto::HMACWith(p("provider.secret") as Binary, payload.^raw as Binary, "HmacSHA256")]',
        }),
        step('validation', {
          check: 'is-true',
          expression: '#[vars.signatureValid default false]',
          message: 'Invalid webhook signature',
        }),
        step('transform', {
          script:
            '%dw 2.0\noutput application/json\n---\n{ merchantId: attributes.uriParams.merchantId, eventId: payload.id, attempt: 1, body: payload }',
        }),
        step('mq-publish', { destination: 'webhook-relay' }),
        step('set-variable', { variableName: 'httpStatus', value: '#[202]' }),
      ],
      [
        handler('on-error-propagate', { type: 'VALIDATION:INVALID_BOOLEAN' }, [
          step('set-variable', { variableName: 'httpStatus', value: '#[401]' }),
        ]),
      ],
    ),
    flow(
      'webhook-relay-worker',
      source('mq-subscriber', { destination: 'webhook-relay', acknowledgementMode: 'MANUAL' }),
      [
        step('set-variable', { variableName: 'ackToken', value: '#[attributes.ackToken]' }),
        step('set-variable', { variableName: 'msg', value: '#[payload]' }),
        step('os-retrieve', {
          key: '#["cb-" ++ vars.msg.merchantId]',
          defaultValue: '#[{ state: "CLOSED", failures: 0, openUntil: null }]',
          objectStore: CB_STORE,
        }),
        step('set-variable', { variableName: 'circuit', value: '#[payload]' }),
        router(
          'choice',
          {},
          [
            route({ expression: '#[vars.circuit.state == "OPEN" and (vars.circuit.openUntil as DateTime) > now()]' }, [
              step('logger', { level: 'INFO', message: '#["Circuit open for " ++ vars.msg.merchantId ++ ", parking event " ++ vars.msg.eventId]' }),
              step('set-payload', { value: '#[vars.msg]' }),
              step('mq-publish', { destination: 'webhook-relay' }),
              step('mq-ack', { ackToken: '#[vars.ackToken]' }),
            ]),
          ],
          {
            otherwise: [
              step('set-payload', { value: '#[vars.msg.body]' }),
              step('http-request', { method: 'POST', path: '/merchant-webhook', responseTimeout: 5000 }),
              step('os-store', {
                key: '#["cb-" ++ vars.msg.merchantId]',
                value: '#[{ state: "CLOSED", failures: 0, openUntil: null }]',
                objectStore: CB_STORE,
              }),
              step('mq-ack', { ackToken: '#[vars.ackToken]' }),
            ],
          },
        ),
      ],
      [
        handler('on-error-continue', { type: 'HTTP:BAD_REQUEST, HTTP:UNAUTHORIZED, HTTP:FORBIDDEN, HTTP:NOT_FOUND' }, [
          step('set-payload', { value: '#[output application/json --- vars.msg ++ { error: error.description, reason: "NON_RETRYABLE" }]' }),
          step('mq-publish', { destination: 'webhook-relay-dlq' }),
          step('mq-ack', { ackToken: '#[vars.ackToken]' }),
        ]),
        handler('on-error-continue', { type: 'HTTP:CONNECTIVITY, HTTP:TIMEOUT, HTTP:SERVICE_UNAVAILABLE, HTTP:INTERNAL_SERVER_ERROR, HTTP:BAD_GATEWAY' }, [
          step('transform', {
            target: 'variable',
            variableName: 'circuit',
            script:
              '%dw 2.0\noutput application/java\nvar failures = (vars.circuit.failures default 0) + 1\n---\nif (failures >= 5) { state: "OPEN", failures: failures, openUntil: now() + |PT5M| } else { state: "CLOSED", failures: failures, openUntil: null }',
          }),
          step('os-store', { key: '#["cb-" ++ vars.msg.merchantId]', value: '#[vars.circuit]', objectStore: CB_STORE }),
          router(
            'choice',
            {},
            [
              route({ expression: '#[vars.msg.attempt >= 12]' }, [
                step('set-payload', { value: '#[output application/json --- vars.msg ++ { error: error.description, reason: "RETRIES_EXHAUSTED" }]' }),
                step('mq-publish', { destination: 'webhook-relay-dlq' }),
              ]),
            ],
            {
              otherwise: [
                step('set-payload', { value: '#[output application/json --- vars.msg update { case a at .attempt -> a + 1 }]' }),
                step('mq-publish', { destination: 'webhook-relay' }),
              ],
            },
          ),
          step('mq-ack', { ackToken: '#[vars.ackToken]' }),
        ]),
        handler('on-error-continue', { type: 'ANY' }, [
          step('logger', { level: 'ERROR', message: '#["Unexpected relay failure, returning message: " ++ error.description]' }),
          step('mq-nack', { ackToken: '#[vars.ackToken]' }),
        ]),
      ],
    ),
    flow('circuit-breaker-admin', source('http-listener', { path: '/admin/circuits/{merchantId}', allowedMethods: 'DELETE' }), [
      scope('try', {}, [step('os-remove', { key: '#["cb-" ++ attributes.uriParams.merchantId]', objectStore: CB_STORE })], {
        errorHandlers: [handler('on-error-continue', { type: 'OS:KEY_NOT_FOUND' }, [])],
      }),
      step('set-variable', { variableName: 'httpStatus', value: '#[204]' }),
    ]),
  ),
  description: `
You operate a **payment-event relay**. The payment provider POSTs webhooks (payment succeeded, refund, chargeback) to \`/webhooks/{merchantId}\`; the relay forwards each event to the merchant's own HTTPS endpoint.

- ~**300 events/s** across **2,000 merchants**. The provider expects a response within **1 s**. If it gets no response, it disables the webhook after repeated timeouts.
- Merchant endpoints are unreliable: some are down for **hours**. Others return 400/404 because they are misconfigured.
- Delivery must be **at least once**. Retries should continue for up to ~1 hour with growing gaps, then go to a DLQ that the merchant can replay from the portal.
- A dead merchant must **not** consume worker threads or slow down the others. After **5 consecutive failures**, stop calling that merchant for **5 minutes** (circuit open). After that, let traffic through again: success closes the circuit, and failure opens it again.
- The relay runs on 3 CloudHub 2.0 replicas. The circuit state must be shared.
- Each webhook carries an HMAC signature. Reject a webhook with a bad signature with **401**.
- Operations need an admin endpoint to reset a merchant's circuit by hand.

**Design the flow(s):**
- How do you acknowledge the provider within 1 s while keeping at-least-once delivery?
- Where is the circuit-breaker state kept, what does it contain, and when is it read and written?
- How do retries with growing gaps work without blocking threads?
- How do you treat non-retryable merchant errors versus transient ones?
`,
  answerTemplate: `## Intake and acknowledgement

## Circuit-breaker state

## Worker logic: closed, open, half-open

## Retries and back-off

## Dead-lettering and replay

## Concurrency between replicas
`,
  keyPoints: [
    'The intake flow verifies the signature, publishes to an Anypoint MQ queue and returns 202, so the provider gets a fast answer and the event is durable.',
    'Circuit state per merchant ({ state, failures, openUntil }) lives in a persistent Object Store shared by all replicas, keyed by merchantId.',
    'The worker reads the circuit first: while OPEN and openUntil is in the future, the event is re-queued with a delay and the merchant is not called; after openUntil a trial call acts as half-open.',
    'Success resets the circuit; transient errors (timeout, 5xx, connectivity) increment failures and open the circuit at 5, while 4xx misconfiguration errors go straight to the DLQ.',
    'Retries are re-publications with an attempt counter and a growing delivery delay (never Until Successful in the worker), so no thread waits and other merchants are unaffected.',
    'After the maximum attempts, the event goes to a DLQ with the error reason for replay; the circuit can be reset manually through an admin endpoint.',
  ],
  solution: `
**Flow \`webhook-intake\`**: HTTP Listener \`POST /webhooks/{merchantId}\`:
- Verify the HMAC signature over the raw request bytes (\`payload.^raw\`; re-serialising the JSON would change them), with a 401 on failure, wrap the event as \`{ merchantId, eventId, attempt: 1, body }\` → **MQ Publish \`webhook-relay\`** → **202**. Total latency is about 50 ms.

**Flow \`webhook-relay-worker\`**: **MQ Subscriber** \`webhook-relay\`, **MANUAL** ack, bounded concurrency:
1. **Object Store Retrieve** \`cb-<merchantId>\` from the persistent store \`merchant-circuit-breaker\` (default \`{ CLOSED, 0, null }\`).
2. **Choice**
   - **OPEN and \`openUntil > now()\`** → do **not** call. Re-publish the event with a delivery delay of about \`openUntil - now()\` (Anypoint MQ allows up to 15 min) and **ack**.
   - **Otherwise** (CLOSED, or OPEN past \`openUntil\` = **half-open trial**) → **HTTP Request** to the merchant with \`responseTimeout 5000\` → on success **Object Store Store** \`{ CLOSED, 0 }\` → **ack**.
3. **Error handlers**
   - \`HTTP:BAD_REQUEST / UNAUTHORIZED / FORBIDDEN / NOT_FOUND\` → non-retryable → **MQ Publish \`webhook-relay-dlq\`** with the reason → ack. These do not count against the circuit (the merchant is up, just misconfigured).
   - \`HTTP:CONNECTIVITY / TIMEOUT / 5xx\` → Transform \`failures + 1\`. At 5, set \`OPEN, openUntil = now() + 5 min\` → **Object Store Store**. Then, if \`attempt >= 12\` → DLQ, else re-publish with \`attempt + 1\` and a growing delivery delay (30 s, 1 min, 2 min, 5 min ... about 1 h in total) → ack.
   - \`ANY\` → **nack** (the broker redelivers; the queue's max-deliveries + DLQ catch bugs).

**Flow \`circuit-breaker-admin\`**: \`DELETE /admin/circuits/{merchantId}\` → Object Store Remove → 204. Operations can close a circuit by hand after a merchant confirms a fix.

**Shared state across replicas:** the Object Store is shared, but read-modify-write is not atomic. Two replicas can both count failure #4 → 5. For a circuit breaker this is acceptable, because it is a heuristic. If exact counts matter, use a database row with \`UPDATE ... SET failures = failures + 1\`.
`,
  followUps: [
    {
      q: 'Why not use Until Successful for the retries?',
      a: 'Until Successful retries in-thread: a down merchant would hold worker threads for the whole retry window and starve deliveries to healthy merchants. Re-queuing with a delay frees the thread immediately and survives restarts.',
    },
    {
      q: 'How would you limit half-open to a single trial call?',
      a: 'When the open period expires, the first worker takes a short trial lease: an Object Store Store with failIfPresent="true" on a lease key in a store with a short TTL, where OS:KEY_ALREADY_EXISTS means another worker holds it. Other workers that find the lease taken keep parking events until the trial succeeds or fails.',
    },
    {
      q: 'How do you preserve per-merchant ordering?',
      a: 'Re-queuing breaks ordering. If ordering matters, use a FIFO queue / message group per merchant and park the whole merchant stream while the circuit is open. Or have merchants handle events idempotently by eventId and timestamp.',
    },
    {
      q: 'What metrics would you expose?',
      a: 'Open circuits per merchant, delivery latency, attempts per event, DLQ depth and rate. Alert on DLQ growth and on many merchants opening at once, which usually means a problem on our side (e.g. outbound network/DNS).',
    },
  ],
}
