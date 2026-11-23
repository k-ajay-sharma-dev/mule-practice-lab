import { design, flow, handler, route, router, scope, source, step } from '../../flow/dsl.js'

const probe = (name, call) =>
  route({}, [
    scope('try', {}, [call, step('set-payload', { value: `#[output application/json --- { name: "${name}", status: "UP" }]` })], {
      errorHandlers: [
        handler('on-error-continue', { type: 'ANY' }, [
          step('logger', { level: 'WARN', message: `#["Readiness probe ${name} failed: " ++ error.description]` }),
          step('set-payload', { value: `#[output application/json --- { name: "${name}", status: "DOWN", reason: error.errorType.identifier }]` }),
        ]),
      ],
    }),
  ])

export default {
  id: 'fl-028',
  category: 'flows',
  title: 'Liveness and Readiness Health Check Endpoints',
  level: 'BEGINNER',
  tags: ['health-check', 'readiness', 'liveness', 'try', 'on-error-continue', 'monitoring'],
  estMinutes: 20,
  flowChecks: [
    { label: 'Health endpoints are exposed through an HTTP Listener', rule: { type: 'source', component: 'http-listener' } },
    { label: 'Liveness and readiness are separate flows / endpoints', rule: { type: 'flows', kind: 'flow', min: 2 } },
    {
      label: 'Readiness checks the database with a lightweight query',
      rule: { type: 'exists', component: 'db-select', where: { sql: 'select' } },
    },
    {
      label: 'Liveness does not call the database or the Customer API',
      rule: {
        type: 'all',
        rules: [
          { type: 'source', component: 'http-listener', where: { path: 'live' } },
          { type: 'absent', component: 'db-select', inFlowWith: { component: 'http-listener', where: { path: 'live' } } },
          { type: 'absent', component: 'http-request', inFlowWith: { component: 'http-listener', where: { path: 'live' } } },
        ],
      },
    },
    {
      label: 'The downstream dependency probe has a response timeout inside the 3 s budget',
      rule: { type: 'exists', component: 'http-request', where: { responseTimeout: { gte: 1, lte: 3000 } } },
    },
    {
      label: 'Both dependency probes (database and Customer API) are wrapped in a Try',
      rule: {
        type: 'all',
        rules: [
          { type: 'inside', component: 'db-select', within: 'try' },
          { type: 'inside', component: 'http-request', within: 'try' },
        ],
      },
    },
    {
      label: 'Each probe catches its own failure with On Error Continue and reports DOWN',
      rule: {
        type: 'all',
        rules: [
          { type: 'inside', component: 'on-error-continue', within: 'try', min: 2 },
          {
            type: 'any',
            rules: [
              { type: 'inside', component: 'set-payload', where: { value: 'DOWN' }, within: 'on-error-continue' },
              { type: 'inside', component: 'transform', where: { script: 'DOWN' }, within: 'on-error-continue' },
              { type: 'inside', component: 'set-variable', where: { value: 'DOWN' }, within: 'on-error-continue' },
            ],
          },
        ],
      },
    },
    {
      label: 'A Choice returns 503 when any dependency is down',
      rule: { type: 'inside', component: 'set-variable', within: 'choice', where: { value: '503' } },
    },
    {
      label: 'The status is decided after all probes have run',
      rule: { type: 'before', first: ['scatter-gather', 'try'], then: 'choice', outside: true },
    },
  ],
  simulation: {
    systems: {
      db: { tables: { customers: { key: 'customer_id', rows: [{ customer_id: 1, name: 'Aroha Ltd' }] } }, latencyMs: 6 },
      http: [{ method: 'GET', path: '/ping', latencyMs: 40, respond: { status: 200, body: { status: 'ok' } } }],
    },
    tests: [
      {
        name: 'Everything is up',
        about: 'The database and the Customer API both answer, so the replica is ready.',
        trigger: { http: { method: 'GET', path: '/health/ready' } },
        expect: { status: 200, calls: [{ method: 'GET', path: '/ping', count: 1 }], maxMs: 3000 },
      },
      {
        name: 'The database is down',
        about: 'No connection can be made to the database, so readiness answers 503.',
        trigger: { http: { method: 'GET', path: '/health/ready' } },
        overrides: { systems: { db: { fault: 'CONNECTIVITY' } } },
        expect: { status: 503, maxMs: 3000 },
      },
      {
        name: 'The Customer API hangs',
        about: 'The Customer API takes 20 seconds to answer. Readiness still answers 503 inside the 3 second budget.',
        trigger: { http: { method: 'GET', path: '/health/ready' } },
        overrides: { systems: { http: [{ method: 'GET', path: '/ping', latencyMs: 20000, respond: { status: 200, body: { status: 'ok' } } }] } },
        expect: { status: 503, maxMs: 3000 },
      },
      {
        name: 'Liveness during an outage',
        about: 'The database and the Customer API are both down, but liveness still answers 200, so Kubernetes does not restart the pod.',
        trigger: { http: { method: 'GET', path: '/health/live' } },
        overrides: { systems: { db: { fault: 'CONNECTIVITY' }, http: [{ method: 'GET', path: '/ping', respond: { fault: 'CONNECTIVITY' } }] } },
        expect: { status: 200, calls: [{ path: '/ping', count: 0 }] },
      },
    ],
  },
  referenceFlow: design(
    flow('health-live', source('http-listener', { path: '/health/live', allowedMethods: 'GET' }), [
      step('set-payload', { value: '#[output application/json --- { status: "UP", app: app.name }]' }),
    ]),
    flow('health-ready', source('http-listener', { path: '/health/ready', allowedMethods: 'GET' }), [
      router('scatter-gather', { timeout: 3000 }, [
        probe('database', step('db-select', { sql: 'SELECT 1 FROM dual' })),
        probe('customer-api', step('http-request', { method: 'GET', path: '/ping', responseTimeout: 2000 })),
      ]),
      step('transform', {
        script:
          '%dw 2.0\nimport some from dw::core::Arrays\noutput application/json\nvar checks = valuesOf(payload) map $.payload\n---\n{ status: if (checks some ($.status == "DOWN")) "DOWN" else "UP", checks: checks }',
      }),
      router(
        'choice',
        {},
        [route({ expression: '#[payload.status == "DOWN"]' }, [step('set-variable', { variableName: 'httpStatus', value: '#[503]' })])],
        { otherwise: [step('set-variable', { variableName: 'httpStatus', value: '#[200]' })] },
      ),
    ]),
  ),
  description: `
Your **Customer System API** runs on Runtime Fabric (Kubernetes) with 3 replicas. The platform team wants two probes:

- **Liveness** \`GET /health/live\`: "is the Mule app process alive?" Kubernetes restarts the pod if it fails. It must **not** depend on external systems.
- **Readiness** \`GET /health/ready\`: "can this replica serve traffic?" It must check the **database** and the downstream **Customer API**, which offers a cheap \`GET /ping\`. If either is down, return **503** so the load balancer takes the replica out of rotation.
- Probes run every 10 s and must answer within **3 s**. The response body lists each dependency as \`UP\` / \`DOWN\`.

**What each system sends back**
- A light Database Select such as \`SELECT 1 FROM dual\` answers with a list of one row. The probe only needs it to succeed.
- The Customer API answers \`GET /ping\` with 200 and \`{ "status": "ok" }\`.

**What failures look like**
- The database cannot be reached: the Database Select raises \`DB:CONNECTIVITY\`. Readiness answers **503**.
- The Customer API hangs for 20 s: the HTTP Request raises \`HTTP:TIMEOUT\` once its response timeout passes. Readiness answers **503** inside the 3 s budget.
- Set the status with the variable \`httpStatus\`. The HTTP Listener answers with \`vars.httpStatus\`.

**Design the flow(s):**
- Why should liveness and readiness be different endpoints?
- How do you check each dependency without one failure crashing the whole response?
- How do you decide between 200 and 503?
- How do you keep the probe cheap and within the time budget?
`,
  answerTemplate: `## Liveness endpoint

## Readiness endpoint and dependency probes

## Isolating failures

## 200 vs 503

## Time budget
`,
  keyPoints: [
    'Liveness only proves the app responds and never calls dependencies; otherwise a database outage would make Kubernetes restart every pod in a loop.',
    'Readiness probes each dependency with the cheapest possible call (SELECT 1, GET /ping) and a short response timeout.',
    'Each probe sits in its own Try with On Error Continue, so a failure becomes a DOWN entry instead of an error for the whole request.',
    'Scatter-Gather (or sequential steps) runs the probes; a Choice then sets httpStatus 503 if any check is DOWN, otherwise 200.',
    'Health endpoints should be excluded from API policies and verbose logging so frequent probes do not create noise.',
  ],
  solution: `
**Flow \`health-live\`**: HTTP Listener \`GET /health/live\` → Set Payload \`{ status: "UP" }\`. Nothing else. If Mule can answer, the process is alive.

**Flow \`health-ready\`**: HTTP Listener \`GET /health/ready\`:
1. **Scatter-Gather** (timeout 3000 ms) with one route per dependency, so the probes run in parallel:
   - Try → **Database Select** \`SELECT 1 FROM dual\` → payload \`{ name: "database", status: "UP" }\`
   - Try → **HTTP Request** \`GET /ping\` with \`responseTimeout = 2000\` → \`{ name: "customer-api", status: "UP" }\`
   - Each Try has **On Error Continue** (ANY) that logs a WARN and returns \`{ status: "DOWN", reason: error.errorType.identifier }\`. The route therefore never fails, and Scatter-Gather never raises \`MULE:COMPOSITE_ROUTING\`.
2. **Transform** the Scatter-Gather result (\`valuesOf(payload) map $.payload\`) into \`{ status, checks: [...] }\`.
3. **Choice**: any DOWN → \`vars.httpStatus = 503\`, otherwise 200. The listener uses \`#[vars.httpStatus default 200]\`.

With only two probes, sequential Try blocks are also fine. Scatter-Gather keeps the worst-case time at max(probe) instead of sum(probes).
`,
  followUps: [
    {
      q: 'Should readiness fail when an optional dependency (e.g. a cache) is down?',
      a: 'No. Only hard dependencies should make a replica not-ready. Report optional ones as DEGRADED in the body but still return 200; otherwise one optional outage removes every replica at once.',
    },
    {
      q: 'Why not use On Error Propagate inside the probe?',
      a: 'The error would fail the Scatter-Gather route and the whole request would end in a 500 error instead of a structured 503 that says which dependency is down.',
    },
    {
      q: 'How would you protect the database from probe traffic?',
      a: 'Keep the query trivial, reuse the pooled connection, and optionally cache the readiness result for a few seconds (e.g. in an Object Store with a short TTL) so 3 replicas × several probers do not each hit the DB.',
    },
  ],
}
