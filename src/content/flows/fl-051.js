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
  simulation: {
    systems: {
      http: [
        { method: 'GET', path: '/sys-core-banking/v1/accounts', latencyMs: 800, respond: { status: 200, body: { totalBalance: 18420.55, accounts: [{ iban: 'DE89370400440532013000', type: 'CURRENT', balance: 2420.55 }, { iban: 'DE02120300000000202051', type: 'SAVINGS', balance: 16000 }] } } },
        { method: 'GET', path: '/sys-cards/v1/cards', latencyMs: 1200, respond: { status: 200, body: [{ cardId: 'tok_4f9a', last4: '4417', status: 'ACTIVE' }] } },
        { method: 'GET', path: '/sys-loans/v1/loans', latencyMs: 900, respond: { status: 200, body: [{ loanId: 'MTG-20931', type: 'MORTGAGE', outstanding: 212000 }] } },
        { method: 'GET', path: '/card-processor/api/v3/cardholders/cards', latencyMs: 700, respond: { status: 200, body: { cards: [{ token: 'tok_4f9a', pan_last4: '4417', state: 'ACTIVE' }] } } },
        { method: 'GET', path: '/prc-accounts/v1/customers/{customerId}/overview', latencyMs: 1300, respond: { status: 200, body: { accounts: { totalBalance: 18420.55 }, cards: [{ cardId: 'tok_4f9a', last4: '4417', status: 'ACTIVE' }], loans: null, unavailable: ['loans'], complete: false } } },
      ],
    },
    tests: [
      {
        name: 'Every source answers',
        about: 'Accounts, cards and loans all come back, in parallel, inside the 2.5 s budget.',
        trigger: { http: { method: 'GET', path: '/prc-accounts/v1/customers/CU-310877/overview' } },
        expect: {
          status: 200,
          maxMs: 2500,
          calls: [
            { method: 'GET', path: '/sys-core-banking/v1/accounts', count: 1 },
            { method: 'GET', path: '/sys-cards/v1/cards', count: 1 },
            { method: 'GET', path: '/sys-loans/v1/loans', count: 1 },
          ],
        },
      },
      {
        name: 'The cards vendor is down',
        about: 'Cards fail, but the customer still gets the overview with accounts and loans.',
        trigger: { http: { method: 'GET', path: '/prc-accounts/v1/customers/CU-310877/overview' } },
        overrides: { systems: { http: [{ method: 'GET', path: '/sys-cards/v1/cards', respond: { status: 503, body: { message: 'Vendor maintenance' } } }] } },
        expect: { status: 200, maxMs: 2500, calls: [{ method: 'GET', path: '/sys-loans/v1/loans', count: 1 }] },
      },
      {
        name: 'The cards vendor hangs',
        about: 'A slow cards call is cut off by its timeout, so the overview still answers inside 2.5 s.',
        trigger: { http: { method: 'GET', path: '/prc-accounts/v1/customers/CU-310877/overview' } },
        overrides: { systems: { http: [{ method: 'GET', path: '/sys-cards/v1/cards', latencyMs: 30000, respond: { status: 200, body: [] } }] } },
        expect: { status: 200, maxMs: 2500 },
      },
      {
        name: 'Cards and loans are both down',
        about: 'Both optional sources fail. The accounts still come back with 200.',
        trigger: { http: { method: 'GET', path: '/prc-accounts/v1/customers/CU-310877/overview' } },
        overrides: {
          systems: {
            http: [
              { method: 'GET', path: '/sys-cards/v1/cards', respond: { fault: 'CONNECTIVITY' } },
              { method: 'GET', path: '/sys-loans/v1/loans', respond: { status: 500, body: { message: 'Internal error' } } },
            ],
          },
        },
        expect: { status: 200 },
      },
      {
        name: 'Core banking is down',
        about: 'Without balances the overview is useless, so the Process API answers 503.',
        trigger: { http: { method: 'GET', path: '/prc-accounts/v1/customers/CU-310877/overview' } },
        overrides: { systems: { http: [{ method: 'GET', path: '/sys-core-banking/v1/accounts', respond: { fault: 'CONNECTIVITY' } }] } },
        expect: { status: 503 },
      },
      {
        name: 'Core banking hangs',
        about: 'Core banking does not answer at all. The app must hear 503 inside the 2.5 s budget, not wait.',
        trigger: { http: { method: 'GET', path: '/prc-accounts/v1/customers/CU-310877/overview' } },
        overrides: { systems: { http: [{ method: 'GET', path: '/sys-core-banking/v1/accounts', latencyMs: 60000, respond: { status: 200, body: {} } }] } },
        expect: { status: 503, maxMs: 2500 },
      },
      {
        name: 'The app opens its home screen',
        about: 'The Experience API gets the overview from the Process API within its 3 s budget.',
        trigger: { http: { method: 'GET', path: '/exp-mobile-banking/v1/me/overview', headers: { 'x-customer-id': 'CU-310877' } } },
        expect: { status: 200, maxMs: 3000, calls: [{ method: 'GET', path: '/prc-accounts/v1/customers/CU-310877/overview', count: 1 }, { method: 'GET', path: '/sys-core-banking/v1/accounts', count: 0 }] },
      },
      {
        name: 'The app during a core banking outage',
        about: 'The Process API answers 503, and the Experience API passes the 503 on to the app.',
        trigger: { http: { method: 'GET', path: '/exp-mobile-banking/v1/me/overview', headers: { 'x-customer-id': 'CU-310877' } } },
        overrides: { systems: { http: [{ method: 'GET', path: '/prc-accounts/v1/customers/{customerId}/overview', respond: { status: 503, body: { code: 'CORE_UNAVAILABLE' } } }] } },
        expect: { status: 503 },
      },
    ],
  },
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
        // The JWT policy on this API has validated the token and passes its subject on as a header.
        step('set-variable', { variableName: 'customerId', value: '#[attributes.headers."x-customer-id"]' }),
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
- If core banking fails or does not answer in time, the overview is useless: return a clear **503** inside the same 2.5 s.

**Facts**
- Experience API: \`GET /exp-mobile-banking/v1/me/overview\`. The gateway passes the customer id in the \`X-Customer-Id\` header. It passes a 503 from the Process API on to the app.
- Process API: \`GET /prc-accounts/v1/customers/{customerId}/overview\`, answering \`{ accounts, cards, loans, unavailable, complete }\`, where \`unavailable\` lists the missing parts, such as \`["cards"]\`.
- System APIs: \`GET /sys-core-banking/v1/accounts?customerId=...\`, \`GET /sys-cards/v1/cards?customerId=...\` and \`GET /sys-loans/v1/loans?customerId=...\`.
- Behind \`sys-cards\`, the card processor's vendor API is \`GET /card-processor/api/v3/cardholders/cards\`. It answers \`{ cards: [{ token, pan_last4, state }] }\`.

**What each system sends back**
- Core banking: **200** \`{ "totalBalance": 18420.55, "accounts": [ { "iban": "DE89370400440532013000", "type": "CURRENT", "balance": 2420.55 } ] }\`.
- Cards: **200** \`[ { "cardId": "tok_4f9a", "last4": "4417", "status": "ACTIVE" } ]\`. Loans: **200** \`[ { "loanId": "MTG-20931", "type": "MORTGAGE", "outstanding": 212000 } ]\`.
- A Scatter-Gather gives an object with one entry per route, in route order; each entry has its own \`payload\`, so \`valuesOf(payload) map $.payload\` lists the three results.

**What failures look like**
- Cards answers **503** (\`HTTP:SERVICE_UNAVAILABLE\`) or is down (\`HTTP:CONNECTIVITY\`); loans answers **500** (\`HTTP:INTERNAL_SERVER_ERROR\`); a slow call passes its response timeout (\`HTTP:TIMEOUT\`). For cards and loans, catch the error inside the route and return a marker, so the overview still answers **200** and lists the part in \`unavailable\`.
- Core banking is down or hangs: its route fails, and the Scatter-Gather raises \`MULE:COMPOSITE_ROUTING\`. Answer **503** \`{ "code": "CORE_UNAVAILABLE" }\` inside 2.5 s.
- The Experience API's HTTP Request sees that 503 as \`HTTP:SERVICE_UNAVAILABLE\` and answers the app **503**.

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
    'Scatter-Gather fails with MULE:COMPOSITE_ROUTING if any route fails: so optional routes are wrapped in Try + On Error Continue that returns a marker payload.',
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
2. Routes 2 and 3 are wrapped in **Try** with **On Error Continue** that logs a WARN and sets \`{ source: "cards", unavailable: true }\`: the route "succeeds" with a marker.
3. Transform: \`valuesOf(payload) map $.payload\` gives the three results in route order; build \`{ accounts, cards, loans, unavailable, complete }\`.
4. Error handler: \`MULE:COMPOSITE_ROUTING\` (only reachable when core banking fails, since the others cannot throw) → 503 \`CORE_UNAVAILABLE\`.

**exp-mobile-banking-overview**: calls the Process API, shapes the screen model and turns \`unavailable\` into user-facing notices.

**sys-cards**: wraps the card processor's vendor API and maps it to a clean card model.

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
      q: 'What status should the response have when cards are missing: 200 or 206?',
      a: 'Usually 200 with an explicit "unavailable"/"complete: false" field in the body; 206 Partial Content is meant for byte ranges. Document the partial-response contract in the API spec.',
    },
  ],
}
