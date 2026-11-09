import { design, flow, handler, route, router, scope, source, step } from '../../flow/dsl.js'

// One parallel provisioning branch: call the SaaS system, and turn any failure into a status object.
const provision = (system, method, path) =>
  route({}, [
    scope('try', { transactionalAction: 'INDIFFERENT' }, [
      step('http-request', { method, path, responseTimeout: 10000 }),
      step('set-payload', { value: `#[output application/json --- { system: "${system}", status: "OK", reference: payload.id default null }]` }),
    ], {
      errorHandlers: [
        handler('on-error-continue', { type: 'ANY' }, [
          step('set-payload', { value: `#[output application/json --- { system: "${system}", status: "FAILED", error: error.description }]` }),
        ]),
      ],
    }),
  ])

export default {
  id: 'fl-040',
  category: 'flows',
  title: 'Employee Onboarding Across Four SaaS Systems with Partial-Failure Reporting',
  level: 'INTERMEDIATE',
  tags: ['orchestration', 'scatter-gather', 'partial-failure', 'saas', 'error-handling'],
  estMinutes: 40,
  flowChecks: [
    { label: 'Onboarding starts from the HR hire event (HTTP webhook or queue)', rule: { type: 'source', component: ['http-listener', 'mq-subscriber'] } },
    {
      label: 'The identity account is created first, before the dependent systems',
      rule: { type: 'before', first: ['http-request', 'flow-ref'], then: ['scatter-gather', 'parallel-foreach'] },
    },
    { label: 'The independent systems are provisioned in parallel', rule: { type: 'routes', component: 'scatter-gather', min: 3 } },
    {
      label: 'A failing system is captured with On Error Continue so the others still complete',
      rule: { type: 'handler', component: 'on-error-continue', within: ['scatter-gather', 'parallel-foreach'] },
    },
    {
      label: 'Every parallel route catches its own failure, so one system down never hides the others',
      rule: {
        type: 'any',
        rules: [
          { type: 'inside', component: 'on-error-continue', within: 'scatter-gather', min: 3 },
          { type: 'inside', component: 'on-error-continue', within: 'parallel-foreach' },
        ],
      },
    },
    {
      label: 'A resent hire event cannot create duplicate accounts',
      rule: {
        type: 'any',
        rules: [
          { type: 'before', first: ['idempotent', 'os-retrieve'], then: 'http-request' },
          { type: 'before', first: 'http-request', firstWhere: { method: 'GET' }, then: 'http-request', thenWhere: { method: 'POST' } },
        ],
      },
    },
    { label: 'Per-system onboarding status is persisted', rule: { type: 'exists', component: ['db-insert', 'db-update', 'os-store'] } },
    {
      label: 'Only partial failures are reported / queued for retry',
      rule: { type: 'inside', component: ['email-send', 'mq-publish', 'vm-publish', 'sf-create'], within: 'choice' },
    },
  ],
  referenceFlow: design(
    flow(
      'onboarding-orchestrator',
      source('http-listener', { path: '/hr/v1/hires', allowedMethods: 'POST' }),
      [
        step('validation', { check: 'is-not-blank-string', expression: '#[payload.employeeId]', message: 'employeeId is required' }),
        step('idempotent', { idExpression: '#[payload.employeeId]', objectStore: 'onboarding-started' }),
        step('set-variable', { variableName: 'hire', value: '#[payload]' }),
        step('http-request', { method: 'POST', path: '/okta/api/v1/users?activate=true', responseTimeout: 10000 }),
        step('set-variable', { variableName: 'login', value: '#[payload.profile.login]' }),
        router('scatter-gather', { timeout: 30000, maxConcurrency: 3 }, [
          provision('M365', 'POST', '/graph/v1.0/users/{login}/assignLicense'),
          provision('ServiceNow', 'POST', '/servicenow/api/now/table/sc_request'),
          provision('Slack', 'POST', '/slack/scim/v2/Users'),
        ]),
        step('transform', {
          script:
            '%dw 2.0\noutput application/json\nvar results = valuesOf(payload) map $.payload\n---\n{\n  employeeId: vars.hire.employeeId,\n  login: vars.login,\n  results: [{ system: "Okta", status: "OK" }] ++ results,\n  failed: results filter ($.status == "FAILED")\n}',
        }),
        step('set-variable', { variableName: 'outcome', value: '#[payload]' }),
        step('db-insert', {
          sql: 'INSERT INTO onboarding_status (employee_id, login, result_json, created_at) VALUES (:employeeId, :login, :resultJson, CURRENT_TIMESTAMP)',
        }),
        // Database Insert replaces the payload with its statement result.
        step('set-payload', { value: '#[vars.outcome]' }),
        router(
          'choice',
          {},
          [
            route({ expression: '#[not isEmpty(payload.failed)]' }, [
              step('mq-publish', { destination: 'onboarding-retry' }),
              step('email-send', { toAddresses: 'it-onboarding@example.com', subject: 'Onboarding partially failed' }),
              step('set-variable', { variableName: 'httpStatus', value: '207' }),
            ]),
          ],
          { otherwise: [step('set-variable', { variableName: 'httpStatus', value: '201' })] },
        ),
      ],
      [
        handler('on-error-continue', { type: 'MULE:DUPLICATE_MESSAGE' }, [
          step('set-variable', { variableName: 'httpStatus', value: '200' }),
          step('set-payload', { value: '#[output application/json --- { message: "Onboarding already in progress" }]' }),
        ]),
        handler('on-error-propagate', { type: 'ANY' }, [
          step('logger', { level: 'ERROR', message: '#["Onboarding failed before provisioning: " ++ error.description]' }),
          step('email-send', { toAddresses: 'it-onboarding@example.com', subject: 'Onboarding FAILED (identity not created)' }),
        ]),
      ],
    ),
  ),
  description: `
When HR records a new hire in **Workday**, a webhook posts \`{ employeeId, name, department, startDate, manager }\` to Mule. The new starter must be set up in four SaaS systems:

1. **Okta** — create and activate the user; returns the \`login\` that every other system needs.
2. **Microsoft 365** — assign mailbox/licences for that login.
3. **ServiceNow** — raise a laptop + access request.
4. **Slack** — provision the user via SCIM.

Volumes are small (≈50 hires/day, peaks of 300 during graduate intake) but each SaaS call can take up to 10 s and any one of them is occasionally down. Requirements:

- One system failing must **not** block the others; the employee should get as much as possible on day one.
- IT must be told **exactly which systems failed** for which employee, and failed steps should be retryable.
- Workday may resend the same webhook; it must not create duplicate accounts.

**Design the flow(s):** ordering/dependencies, parallelism, how partial failures are captured and reported, status persistence and duplicate protection.
`,
  answerTemplate: `## Trigger and duplicate protection

## Dependencies and ordering

## Parallel provisioning

## Capturing partial failures

## Status, reporting and retry
`,
  keyPoints: [
    'Okta is called first and on its own because the other systems need the login; if it fails, nothing else runs and the whole request fails.',
    'Microsoft 365, ServiceNow and Slack are independent, so they run in a Scatter-Gather (or Parallel For Each) to fit the time budget.',
    'Each route wraps its call in a Try with On Error Continue that returns a status object, so Scatter-Gather never throws a composite error and every result is visible.',
    'DataWeave aggregates per-system results; the outcome is persisted per employee and a Choice routes partial failures to an email + retry queue.',
    'Idempotency on employeeId (and idempotent SaaS calls, e.g. lookup-before-create) protects against Workday resending the webhook.',
  ],
  solution: `
1. **HTTP Listener** \`POST /hr/v1/hires\` → validate → **Idempotent Message Validator** on \`employeeId\` (duplicate → 200 "already in progress").
2. **Okta first** (HTTP Request): creating the identity is the dependency for everything else. If it fails, the flow-level On Error Propagate alerts IT and returns an error so Workday retries. The docs do not say the validator releases the ID when a flow fails. So remove \`employeeId\` from the \`onboarding-started\` store in that handler, or the retry may be answered as a duplicate.
3. **Scatter-Gather** (timeout 30 s) with three routes — M365, ServiceNow, Slack. Each route is a **Try** whose **On Error Continue** sets \`{ system, status: "FAILED", error }\` and on success \`{ system, status: "OK", reference }\`. Because no route throws, there is no \`MULE:COMPOSITE_ROUTING\` error and you always get all three outcomes.
4. **Transform** aggregates the route results into \`{ results, failed }\`.
5. **Persist** the outcome per employee (\`onboarding_status\`) — the source of truth for IT dashboards.
6. **Choice**: if \`failed\` is not empty → publish \`{ employeeId, systems: failed }\` to an **Anypoint MQ retry queue** (worker retries with backoff, DLQ after N attempts) and **email** IT with the list; respond **207 Multi-Status**. Otherwise respond 201.

**Alternative:** without catching errors in routes, handle \`MULE:COMPOSITE_ROUTING\` in the flow and read \`error.errorMessage.payload.failures\` / \`results\` — works, but catching per route keeps the logic simpler and the result shape uniform.
`,
  followUps: [
    {
      q: 'What happens with your design if the Scatter-Gather timeout fires?',
      a: 'A route that has not finished throws MULE:TIMEOUT, which Scatter-Gather treats like any other route error, so you get MULE:COMPOSITE_ROUTING. The docs do not say whether a Try inside the route catches that timeout, so do not rely on it: keep the timeout above the longest route (routes run in parallel) and handle MULE:COMPOSITE_ROUTING as a fallback.',
    },
    {
      q: 'How do you make the retry worker safe?',
      a: 'Each SaaS call becomes idempotent: look the user up by login/employeeId before creating, use SCIM upserts, or keep a per-system status so the worker only retries the systems still marked FAILED.',
    },
    {
      q: 'Would you use a Batch Job here?',
      a: 'No — it is a low-volume, per-employee orchestration that needs an immediate per-request result. Batch suits large record sets; here Scatter-Gather plus a retry queue is the right size.',
    },
  ],
}
