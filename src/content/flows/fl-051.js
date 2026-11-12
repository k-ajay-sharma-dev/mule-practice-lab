import { design, flow, handler, route, router, scope, source, step } from '../../flow/dsl.js'
import { handlerStatus } from '../../flow/rules.js'

const softFail = (name) =>
  handler('on-error-continue', { type: 'ANY' }, [
    step('logger', { level: 'WARN', message: `#["${name} unavailable: " ++ error.description]` }),
    step('set-payload', { value: `#[output application/json --- { source: "${name}", unavailable: true }]` }),
  ])

export default {
  id: 'fl-051',
  category: 'flows',
  title: 'Process API Aggregating System APIs in Parallel with Partial Results',
  level: 'INTERMEDIATE',
  tags: ['api-led', 'process-api', 'scatter-gather', 'partial-failure', 'aggregation'],
  estMinutes: 30,
  flowChecks: [
    {
      label: 'The aggregation lives in a Process API listener (/prc-...)',
      rule: { type: 'source', component: 'http-listener', where: { path: 'prc-' } },
    },
    {
      label: 'The Experience API consumes the Process API over HTTP Request',
      rule: { type: 'exists', component: 'http-request', where: { path: 'prc-' } },
    },
    {
      label: 'Three independent System APIs are called in parallel (Scatter-Gather, 3+ routes)',
      rule: { type: 'routes', component: 'scatter-gather', min: 3 },
    },
    {
      label: 'Each parallel route calls a System API over HTTP Request, with a timeout below the scope timeout',
      rule: {
        type: 'inside',
        component: 'http-request',
        within: 'scatter-gather',
        where: { path: 'sys-', responseTimeout: { gte: 1, lte: 2500 } },
        min: 3,
      },
    },
    {
      label: 'The Scatter-Gather has a timeout inside the 2.5 s SLA',
      rule: { type: 'exists', component: 'scatter-gather', where: { timeout: { gte: 1, lte: 2500 } } },
    },
    {
      label: 'Cards and loans fail softly (Try + On Error Continue inside the route)',
      rule: {
        type: 'all',
        rules: [
          { type: 'handler', component: 'on-error-continue', within: 'try' },
          { type: 'inside', component: ['set-payload', 'transform'], within: 'on-error-continue', min: 2 },
          { type: 'inside', component: 'http-request', where: { path: 'sys-cards' }, within: 'try' },
          { type: 'inside', component: 'http-request', where: { path: 'sys-loans' }, within: 'try' },
        ],
      },
    },
    {
      label: 'Core banking is not soft-failed, so its failure still fails the overview',
      rule: {
        type: 'all',
        rules: [
          { type: 'inside', component: 'http-request', where: { path: 'sys-core' }, within: 'scatter-gather' },
          { type: 'absent', component: 'http-request', where: { path: 'sys-core' }, within: 'try' },
        ],
      },
    },
    {
      label: 'Route results are merged into one response with DataWeave',
      rule: { type: 'before', first: 'scatter-gather', then: 'transform' },
    },
    {
      label: 'A failure of the mandatory source (MULE:COMPOSITE_ROUTING) is mapped to 503',
      rule: {
        type: 'all',
        rules: [
          { type: 'exists', component: ['on-error-propagate', 'on-error-continue'], where: { type: 'COMPOSITE_ROUTING' } },
          handlerStatus('COMPOSITE_ROUTING', '503'),
        ],
      },
    },
    {
      label: 'The Experience API passes the 503 on to the app',
      rule: { type: 'any', rules: [handlerStatus('ANY', '503'), handlerStatus('SERVICE_UNAVAILABLE', '503')] },
    },
  ],
  optionalSteps: [
    {
      type: 'on-error-propagate',
      flow: 'prc-account-overview',
      why: 'The catch-all handler only sets 500, which Mule answers by default for an unhandled error.',
    },
  ],
  referenceFlow: design(
    flow(
      'exp-mobile-banking-overview',
      source('http-listener', { path: '/exp-mobile-banking/v1/me/overview', allowedMethods: 'GET' }),
      [
        step('http-request', { method: 'GET', path: '/prc-accounts/v1/customers/{customerId}/overview', responseTimeout: 3000 }),
        step('transform', {
          script:
            '%dw 2.0\noutput application/json\n---\n{\n  balance: payload.accounts.totalBalance,\n  cards: payload.cards default [],\n  loans: payload.loans default [],\n  notices: (payload.unavailable default []) map ("Your " ++ $ ++ " details are temporarily unavailable")\n}',
        }),
      ],
      [handler('on-error-propagate', { type: 'ANY' }, [step('set-variable', { variableName: 'httpStatus', value: '503' })])],
    ),
    flow(
      'prc-account-overview',
      source('http-listener', { path: '/prc-accounts/v1/customers/{customerId}/overview', allowedMethods: 'GET' }),
      [
        router('scatter-gather', { timeout: 2500, maxConcurrency: 3 }, [
          route({}, [step('http-request', { method: 'GET', path: '/sys-core-banking/v1/accounts?customerId={customerId}', responseTimeout: 2000 })]),
          route({}, [
            scope('try', {}, [step('http-request', { method: 'GET', path: '/sys-cards/v1/cards?customerId={customerId}', responseTimeout: 2000 })], {
              errorHandlers: [softFail('cards')],
            }),
          ]),
          route({}, [
            scope('try', {}, [step('http-request', { method: 'GET', path: '/sys-loans/v1/loans?customerId={customerId}', responseTimeout: 2000 })], {
              errorHandlers: [softFail('loans')],
            }),
          ]),
        ]),
        step('transform', {
          script:
            '%dw 2.0\noutput application/json\nvar results = valuesOf(payload) map $.payload\nvar failed = results filter ($ is Object and $.unavailable == true)\n---\n{\n  accounts: results[0],\n  cards: if (results[1] is Array) results[1] else null,\n  loans: if (results[2] is Array) results[2] else null,\n  unavailable: failed map $.source,\n  complete: isEmpty(failed)\n}',
        }),
      ],
      [
        handler('on-error-propagate', { type: 'MULE:COMPOSITE_ROUTING' }, [
          step('logger', { level: 'ERROR', message: '#["Core banking failed: " ++ error.description]' }),
          step('set-variable', { variableName: 'httpStatus', value: '503' }),
          step('set-payload', { value: '#[output application/json --- { code: "CORE_UNAVAILABLE", message: "Account data is unavailable" }]' }),
        ]),
        handler('on-error-propagate', { type: 'ANY' }, [step('set-variable', { variableName: 'httpStatus', value: '500' })]),
      ],
    ),
    flow(
      'sys-cards',
      source('http-listener', { path: '/sys-cards/v1/cards', allowedMethods: 'GET' }),
      [
        step('http-request', { method: 'GET', path: '/card-processor/api/v3/cardholders/cards', responseTimeout: 1800 }),
        step('transform', {
          script: '%dw 2.0\noutput application/json\n---\npayload.cards map { cardId: $.token, last4: $.pan_last4, status: $.state }',
        }),
      ],
    ),
  ),
  description: `
A bank's mobile app home screen shows a customer's **account overview** in one call. The data comes from three independent systems, each already behind a System API:

| System API | Data | Importance | p95 |
|---|---|---|---|
| \`sys-core-banking\` | accounts and balances | **mandatory** | 800 ms |
| \`sys-cards\` | credit cards | optional | 1.2 s (vendor, flaky) |
| \`sys-loans\` | loans and mortgages | optional | 900 ms |

Requirements:
- The Process API answers within **2.5 s**; the Experience API within 3 s. ~150 req/s at 9 a.m.
- If cards or loans are down or slow, still return the overview with what is available and say **which parts are missing**.
- If core banking fails, the overview is useless — return a clear **503**.

**Convention for API-led problems:** one canvas holds the whole application network. Draw each API as a separate flow whose name starts with its layer prefix (\`exp-\`, \`prc-\`, \`sys-\`), give it an HTTP Listener whose path shows the API (e.g. \`/prc-accounts/v1/customers/{customerId}/overview\`), and let layers call each other with HTTP Request pointing at the lower API's path.

**Design the flow(s):** the Process API aggregation (parallelism, timeouts, partial failures, merging), the Experience API on top, and at least one System API.
`,
  answerTemplate: `## Layers

## Parallel calls

## Timeouts

## Optional vs mandatory sources

## Merging and signalling missing parts

## Errors
`,
  keyPoints: [
    'Aggregation of independent sources is a Process-layer job; the calls are independent, so Scatter-Gather runs them in parallel (latency ≈ slowest call, not the sum).',
    'Scatter-Gather fails with MULE:COMPOSITE_ROUTING if any route fails — so optional routes are wrapped in Try + On Error Continue that returns a marker payload.',
    'The mandatory route has no Try: its failure still raises COMPOSITE_ROUTING, which the Process API maps to 503.',
    'Per-request timeouts (2 s) sit below the Scatter-Gather timeout (2.5 s), which sits below the Experience timeout (3 s).',
    'The merged response says what is missing (unavailable: ["cards"]), so the Experience API can show a notice instead of an error.',
  ],
  solution: `
\`\`\`
           exp-mobile-banking-overview              EXPERIENCE (3 s)
                       |  GET /prc-accounts/.../overview
                       v
 +--------------------------------------------------------+
 | prc-account-overview                  PROCESS (2.5 s)  |
 |   Scatter-Gather (timeout 2500, maxConcurrency 3)      |
 |     route 1: sys-core-banking          (mandatory)     |
 |     route 2: Try[ sys-cards ]  On Error Continue -> {unavailable}
 |     route 3: Try[ sys-loans ]  On Error Continue -> {unavailable}
 |   DataWeave merge + "unavailable" list                 |
 |   COMPOSITE_ROUTING -> 503                             |
 +--------------------------------------------------------+
        |                  |                 |
 sys-core-banking      sys-cards         sys-loans        SYSTEM (2 s each)
\`\`\`

**prc-account-overview**
1. **Scatter-Gather**, timeout 2500 ms, three routes, each an HTTP Request (2 s timeout) to a System API.
2. Routes 2 and 3 are wrapped in **Try** with **On Error Continue** that logs a WARN and sets \`{ source: "cards", unavailable: true }\` — the route "succeeds" with a marker.
3. Transform: \`valuesOf(payload) map $.payload\` gives the three results in route order; build \`{ accounts, cards, loans, unavailable, complete }\`.
4. Error handler: \`MULE:COMPOSITE_ROUTING\` (only reachable when core banking fails, since the others cannot throw) → 503 \`CORE_UNAVAILABLE\`.

**exp-mobile-banking-overview** — calls the Process API, shapes the screen model and turns \`unavailable\` into user-facing notices.

**sys-cards** — wraps the card processor's vendor API and maps it to a clean card model.

Note: a route that outlasts the Scatter-Gather timeout throws \`MULE:TIMEOUT\`, which is handled like any other route error. The docs do not say whether a Try inside the route catches it, so do not rely on that: the 2 s request timeouts sit below the 2.5 s scope timeout, so a slow vendor fails with \`HTTP:TIMEOUT\` first, which the Try does catch.
`,
  followUps: [
    {
      q: 'Why not call the three System APIs from the Experience API in parallel instead?',
      a: 'Then every channel would re-implement the merge and the mandatory/optional rules. Aggregation with business meaning is reusable process logic; the Experience API should only reshape the result.',
    },
    {
      q: 'Cards is down for an hour. How do you avoid waiting 2 s on every request?',
      a: 'Add a circuit breaker in front of the cards call (e.g. failure counter in Object Store, skip the call while open) or cache the last good card list with a short TTL, so the route returns the fallback immediately.',
    },
    {
      q: 'What status should the response have when cards are missing — 200 or 206?',
      a: 'Usually 200 with an explicit "unavailable"/"complete: false" field in the body; 206 Partial Content is meant for byte ranges. Document the partial-response contract in the API spec.',
    },
  ],
}
