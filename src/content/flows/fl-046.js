import { design, flow, handler, route, router, scope, source, step, subFlow } from '../../flow/dsl.js'

const BREAKER_KEY = 'cb:credit-bureau'

export default {
  id: 'fl-046',
  category: 'flows',
  title: 'Hand-built Circuit Breaker with Object Store and Fallback',
  level: 'EXPERT',
  tags: ['circuit-breaker', 'resilience', 'object-store', 'fallback', 'sla'],
  estMinutes: 45,
  flowChecks: [
    { label: 'Breaker state is read from an Object Store before calling the bureau', rule: { type: 'exists', component: 'os-retrieve' } },
    { label: 'A Choice short-circuits to the fallback while the circuit is open', rule: { type: 'exists', component: 'choice' } },
    { label: 'The bureau call is isolated in a Try scope', rule: { type: 'inside', component: 'http-request', within: 'try' } },
    {
      label: 'The bureau call has a response timeout within the 2 s SLA',
      rule: { type: 'exists', component: 'http-request', where: { responseTimeout: { gte: 1, lte: 2000 } } },
    },
    {
      label: 'Only connectivity/timeout-type HTTP errors trip the breaker and fall back (On Error Continue for HTTP:… types)',
      rule: {
        type: 'all',
        rules: [
          { type: 'handler', component: 'on-error-continue', within: 'try', where: { type: { oneOf: ['TIMEOUT', 'CONNECTIVITY', 'SERVICE_UNAVAILABLE'] } } },
          { type: 'absent', component: 'on-error-continue', within: 'try', where: { type: { oneOf: ['ANY', 'BAD_REQUEST'] } } },        ],
      },
    },
    { label: 'State transitions (and the last good score) are written back to the Object Store', rule: { type: 'exists', component: 'os-store', min: 2 } },
    {
      label: 'A bureau outage counts as a failure: the handler writes the breaker state',
      rule: { type: 'inside', component: 'os-store', within: 'on-error-continue' },
    },
    {
      label: 'The fallback answer is given both on the open-circuit route and from the Try handler',
      rule: {
        type: 'all',
        rules: [
          {
            type: 'any',
            rules: [
              { type: 'inside', component: 'transform', where: { script: 'MANUAL_REVIEW' }, within: 'choice', routeWhere: { expression: 'OPEN' } },
              { type: 'inside', component: 'set-payload', where: { value: 'MANUAL_REVIEW' }, within: 'choice', routeWhere: { expression: 'OPEN' } },
            ],
          },
          {
            type: 'any',
            rules: [
              { type: 'inside', component: 'transform', where: { script: 'MANUAL_REVIEW' }, within: 'on-error-continue', withinWhere: { type: 'HTTP:' } },
              { type: 'inside', component: 'set-payload', where: { value: 'MANUAL_REVIEW' }, within: 'on-error-continue', withinWhere: { type: 'HTTP:' } },
            ],
          },
        ],
      },
    },
    { label: 'Breaker logic lives in reusable flows reached via Flow Reference', rule: { type: 'refs' } },
  ],
  referenceFlow: design(
    flow(
      'credit-check-api',
      source('http-listener', { path: '/risk/v1/credit-checks', allowedMethods: 'POST' }),
      [
        step('set-variable', { variableName: 'customerId', value: '#[payload.customerId]' }),
        step('set-variable', { variableName: 'request', value: '#[payload]' }),
        step('flow-ref', { name: 'cb-get-state', target: 'cb' }),
        router(
          'choice',
          {},
          [
            route({ expression: '#[vars.cb.state == "OPEN" and ((vars.cb.openedAt as DateTime) + |PT30S|) > now()]' }, [
              step('logger', { level: 'DEBUG', message: '#["Circuit open, skipping bureau for " ++ vars.customerId]' }),
              step('flow-ref', { name: 'credit-fallback' }),
            ]),
          ],
          {
            otherwise: [
              scope('try', { transactionalAction: 'INDIFFERENT' }, [
                step('set-payload', { value: '#[vars.request]' }),
                step('http-request', { method: 'POST', path: '/bureau/v2/scores', responseTimeout: 1500 }),
                step('os-store', { key: '#["score:" ++ vars.customerId]', value: '#[payload]', objectStore: 'last-good-scores' }),
                step('flow-ref', { name: 'cb-record-success' }),
                step('transform', {
                  script: '%dw 2.0\noutput application/json\n---\n{\n  customerId: vars.customerId,\n  score: payload.score,\n  source: "BUREAU"\n}',
                }),
              ], {
                errorHandlers: [
                  handler('on-error-continue', { type: 'HTTP:TIMEOUT, HTTP:CONNECTIVITY, HTTP:SERVICE_UNAVAILABLE, HTTP:INTERNAL_SERVER_ERROR' }, [
                    step('flow-ref', { name: 'cb-record-failure' }),
                    step('flow-ref', { name: 'credit-fallback' }),
                  ]),
                ],
              }),
            ],
          },
        ),
      ],
      [
        handler('on-error-propagate', { type: 'HTTP:BAD_REQUEST' }, [
          step('set-variable', { variableName: 'httpStatus', value: '400' }),
          step('set-payload', { value: '#[output application/json --- { message: "Invalid credit check request" }]' }),
        ]),
      ],
    ),
    subFlow('cb-get-state', [
      step('os-retrieve', {
        key: BREAKER_KEY,
        defaultValue: '#[{ state: "CLOSED", failures: 0, openedAt: null }]',
        objectStore: 'circuit-breakers',
      }),
    ]),
    subFlow('cb-record-failure', [
      step('flow-ref', { name: 'cb-get-state', target: 'cbNow' }),
      step('transform', {
        target: 'variable',
        variableName: 'cbNext',
        script:
          '%dw 2.0\noutput application/java\nvar failures = (vars.cbNow.failures default 0) + 1\n---\nif (vars.cbNow.state == "OPEN" or failures >= 5)\n  { state: "OPEN", failures: failures, openedAt: now() }\nelse\n  { state: "CLOSED", failures: failures, openedAt: null }',
      }),
      step('os-store', { key: BREAKER_KEY, value: '#[vars.cbNext]', objectStore: 'circuit-breakers' }),
      router(
        'choice',
        {},
        [
          route({ expression: '#[vars.cbNow.state != "OPEN" and vars.cbNext.state == "OPEN"]' }, [
            step('logger', { level: 'WARN', message: '#["Circuit OPENED for credit bureau after " ++ (vars.cbNext.failures as String) ++ " failures"]' }),
            step('mq-publish', { destination: 'ops-alerts' }),
          ]),
        ],
        { otherwise: [step('logger', { level: 'DEBUG', message: '#["Bureau failure " ++ (vars.cbNext.failures as String)]' })] },
      ),
    ]),
    subFlow('cb-record-success', [
      step('flow-ref', { name: 'cb-get-state', target: 'cbNow' }),
      router(
        'choice',
        {},
        [
          route({ expression: '#[vars.cbNow.state != "CLOSED" or vars.cbNow.failures > 0]' }, [
            step('os-store', { key: BREAKER_KEY, value: '#[{ state: "CLOSED", failures: 0, openedAt: null }]', objectStore: 'circuit-breakers' }),
            step('logger', { level: 'INFO', message: 'Circuit CLOSED for credit bureau' }),
          ]),
        ],
        { otherwise: [step('logger', { level: 'DEBUG', message: 'Circuit already closed' })] },
      ),
    ]),
    subFlow('credit-fallback', [
      // A null default counts as no default (OS:KEY_NOT_FOUND), so use an empty object.
      step('os-retrieve', { key: '#["score:" ++ vars.customerId]', defaultValue: '#[{}]', objectStore: 'last-good-scores' }),
      step('transform', {
        script:
          '%dw 2.0\noutput application/json\n---\nif (payload.score != null)\n  { customerId: vars.customerId, score: payload.score, source: "CACHED", scoredAt: payload.scoredAt }\nelse\n  { customerId: vars.customerId, decision: "MANUAL_REVIEW", source: "FALLBACK" }',
      }),
    ]),
  ),
  description: `
A lender's **Credit Check API** (\`POST /risk/v1/credit-checks\`) is called by the loan application journey ~30 times/s at peak. It calls an external **credit bureau** that normally answers in 300 ms but, a few times a month, degrades for 10–40 minutes: calls hang for 30 s or fail with 503.

During the last incident every request waited for the bureau's timeout, Mule threads piled up, the loan journey's **2 s SLA** was missed everywhere, and the bureau's recovery was slowed by the retry storm.

The business agreed on degraded behaviour:
- If a **score for the customer from the last 30 days** is known, return it marked \`CACHED\`.
- Otherwise return \`MANUAL_REVIEW\` (an underwriter follows up) — never an error page.
- Client errors (400 from the bureau for bad input) must **not** count as bureau outages.

There is no circuit-breaker policy available on this deployment. Mule runs on **3 replicas**.

**Design the flow(s):** a circuit breaker (closed / open / half-open), where its state lives, which errors trip it, the fallback, and how operations are alerted.
`,
  answerTemplate: `## Breaker states and thresholds

## Where the state lives

## Request flow

## Which errors count

## Fallback

## Half-open and recovery

## Alerting and limitations
`,
  keyPoints: [
    'Three states: CLOSED (call bureau, count failures), OPEN (skip the bureau and use the fallback for a cool-down period), HALF-OPEN (after the cool-down let calls through; success closes, failure re-opens).',
    'State lives in a persistent/shared Object Store so all 3 replicas see the same breaker; reads happen before the call, writes only on state change to limit OS traffic.',
    'A short response timeout (≈1.5 s) inside the 2 s SLA bounds the worst case even while the breaker is still closed.',
    'Only infrastructure errors (HTTP:TIMEOUT, CONNECTIVITY, 5xx) increment the failure counter and fall back via On Error Continue; 4xx client errors propagate as errors without tripping the breaker.',
    'Fallback returns the last good score (cached in Object Store with a 30-day TTL) or MANUAL_REVIEW; opening the circuit alerts ops.',
    'Acknowledges limits: Object Store updates are not atomic, so counts are approximate under concurrency — acceptable for a breaker; an API Gateway / service mesh breaker is preferable if available.',
  ],
  solution: `
**State** — key \`cb:credit-bureau\` in a persistent Object Store (shared across replicas on CloudHub): \`{ state, failures, openedAt }\`.

**credit-check-api**
1. Save the request; **Flow Reference** \`cb-get-state\` with **target** \`cb\` (reads the Object Store without overwriting the payload).
2. **Choice**
   - \`OPEN\` and opened < 30 s ago → **fallback** immediately (no thread waits on the bureau).
   - Otherwise (CLOSED, or OPEN with the cool-down elapsed = **half-open trial**) → **Try**:
     - HTTP Request to the bureau with **responseTimeout 1500 ms**.
     - Store the score in \`last-good-scores\` (entry TTL 30 days) for future fallbacks.
     - \`cb-record-success\` → resets to CLOSED only if it was not already (avoids a write per request).
     - **On Error Continue** for \`HTTP:TIMEOUT, HTTP:CONNECTIVITY, HTTP:SERVICE_UNAVAILABLE, HTTP:INTERNAL_SERVER_ERROR\` → \`cb-record-failure\` → fallback.
3. \`HTTP:BAD_REQUEST\` is **not** caught there; it propagates to a flow handler → 400, and does not touch the breaker.

**cb-record-failure** — increment failures; at 5 consecutive failures (or any failure during half-open) → \`OPEN\` with \`openedAt = now\`. On the CLOSED→OPEN transition, log WARN and publish an ops alert.

**credit-fallback** — last good score (\`CACHED\`) or \`MANUAL_REVIEW\`.

**Limitations and refinements**
- Read–modify–write on the Object Store is not atomic: several replicas may count the same burst, so the threshold is approximate. That is acceptable; a failure-rate window (failures in the last N seconds) is more robust than a consecutive counter.
- In half-open, many requests may trial at once; allow just one trial by storing a \`trialUntil\` timestamp, or accept a short burst.
- If Anypoint Flex Gateway / a service mesh is available, prefer its built-in circuit breaking and keep this as application-level fallback logic.
`,
  followUps: [
    {
      q: 'Why is a timeout alone not enough?',
      a: 'A 1.5 s timeout still makes every request wait 1.5 s and keeps hammering a struggling bureau at 30 req/s. The breaker turns that into an immediate fallback and gives the bureau room to recover.',
    },
    {
      q: 'Why should a 400 from the bureau not open the circuit?',
      a: 'It signals bad input from one caller, not an unhealthy dependency; counting it would let one buggy client switch the bureau off for everyone.',
    },
    {
      q: 'Would you keep breaker state in memory per replica instead?',
      a: 'An in-memory (non-persistent) Object Store per replica is faster and avoids shared-write contention; each replica then learns about the outage on its own after a few failures. That is often fine — choose shared state when you need consistent behaviour and alerting across replicas.',
    },
    {
      q: 'How do you test the breaker?',
      a: 'Use MUnit with the HTTP Request mocked to throw HTTP:TIMEOUT N times. Assert that the Object Store state goes OPEN, the bureau mock is not called while open, and a success after the cool-down closes it.',
    },
  ],
}
