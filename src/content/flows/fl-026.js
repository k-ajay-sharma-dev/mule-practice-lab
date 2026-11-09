import { design, flow, handler, route, router, scope, source, step } from '../../flow/dsl.js'

// One worker per target system: own queue, manual ack, idempotent action, Nack on failure (DLQ after max deliveries).
const worker = (system, steps) =>
  flow(
    `gdpr-${system}-worker`,
    source('mq-subscriber', { destination: `gdpr.${system}`, acknowledgementMode: 'MANUAL' }),
    [step('set-variable', { variableName: 'ackToken', value: '#[attributes.ackToken]' }), ...steps, step('mq-ack', { ackToken: '#[vars.ackToken]' })],
    [
      handler('on-error-continue', { type: 'ANY' }, [
        step('logger', { level: 'ERROR', message: `#["${system} erasure task " ++ (payload.taskId default "") ++ " failed: " ++ error.errorType.identifier]` }),
        step('mq-nack', { ackToken: '#[vars.ackToken]' }),
      ]),
    ],
  )

export default {
  id: 'fl-026',
  category: 'flows',
  title: 'GDPR Right-to-Erasure Across Multiple Systems',
  level: 'EXPERT',
  tags: ['gdpr', 'privacy', 'orchestration', 'audit', 'compliance'],
  estMinutes: 65,
  flowChecks: [
    { label: 'Erasure requests arrive through an HTTP Listener (intake API)', rule: { type: 'source', component: 'http-listener' } },
    {
      label: 'Legal hold / open claims are looked up before the accept-or-reject decision',
      rule: { type: 'before', first: ['db-select', 'sf-query', 'http-request'], then: 'choice' },
    },
    {
      label: 'Accepted requests fan out one task per system through a queue',
      rule: { type: 'exists', component: ['mq-publish', 'vm-publish', 'jms-publish'] },
    },
    {
      label: 'Tasks are published only on the accepted branch of the legal hold check',
      rule: { type: 'inside', component: ['mq-publish', 'vm-publish', 'jms-publish'], within: 'choice' },
    },
    {
      label: 'Each target system has its own worker flow (at least four)',
      rule: { type: 'exists', component: ['mq-subscriber', 'vm-listener', 'jms-listener'], min: 4 },
    },
    {
      label: 'Policy DB records are anonymised with an UPDATE inside a transaction',
      rule: { type: 'inside', component: 'db-update', within: 'try', withinWhere: { transactionalAction: 'BEGIN' } },
    },
    {
      label: 'Policy records are anonymised, never deleted (no Database Delete)',
      rule: { type: 'all', rules: [{ type: 'exists', component: 'db-update' }, { type: 'absent', component: 'db-delete' }] },
    },
    {
      label: 'A worker acknowledges its task only after the erasure call',
      rule: { type: 'before', first: ['http-request', 'db-update', 'sf-query'], then: 'mq-ack', outside: true },
    },
    {
      label: 'Failed worker tasks are returned to the queue for retry',
      rule: { type: 'inside', component: 'mq-nack', within: ['on-error-continue', 'on-error-propagate'] },
    },
    {
      label: 'A Scheduler tracks asynchronous erasure jobs and completion',
      rule: { type: 'before', first: 'scheduler', then: 'http-request', thenWhere: { method: 'GET' } },
    },
    {
      label: 'No Logger writes personal data (the whole payload, customerId or email)',
      rule: {
        type: 'all',
        rules: [
          { type: 'source', component: 'http-listener' },
          { type: 'absent', component: 'logger', where: { message: { oneOf: ['#[payload]', 'customerId', 'email'] } } },
        ],
      },
    },
    {
      label: 'An audit evidence record is written when a request completes',
      rule: { type: 'exists', component: ['db-insert', 'os-store'], where: { sql: 'audit' } },
    },
  ],
  referenceFlow: design(
    flow(
      'erasure-intake-api',
      source('http-listener', { path: '/erasure-requests', allowedMethods: 'POST' }),
      [
        step('validation', { check: 'is-not-blank-string', expression: '#[payload.customerId]', message: 'customerId is required' }),
        step('set-variable', { variableName: 'request', value: '#[payload]' }),
        step('db-select', {
          sql: "SELECT COUNT(*) AS blockers FROM customer_flags WHERE customer_id = :customerId AND (legal_hold = 'Y' OR open_claims > 0)",
        }),
        router(
          'choice',
          {},
          [
            route({ expression: '#[payload[0].BLOCKERS > 0]' }, [
              step('db-insert', {
                sql: "INSERT INTO erasure_request (request_id, customer_hash, status, reason) VALUES (:requestId, :customerHash, 'REJECTED', 'LEGAL_HOLD_OR_OPEN_CLAIM')",
              }),
              step('set-variable', { variableName: 'httpStatus', value: '422' }),
              step('transform', {
                script: '%dw 2.0\noutput application/json\n---\n{\n  requestId: vars.request.requestId,\n  status: "REJECTED"\n}',
              }),
            ]),
          ],
          {
            otherwise: [
              step('db-insert', {
                sql: "INSERT INTO erasure_request (request_id, customer_hash, status, received_at) VALUES (:requestId, :customerHash, 'ACCEPTED', CURRENT_TIMESTAMP)",
              }),
              step('transform', {
                script:
                  '%dw 2.0\noutput application/json\n---\n["salesforce", "policydb", "marketing", "datalake"] map ((system) -> {\n  taskId: vars.request.requestId ++ "-" ++ system,\n  requestId: vars.request.requestId,\n  customerId: vars.request.customerId,\n  system: system\n})',
              }),
              scope('foreach', { collection: '#[payload]', batchSize: 1 }, [
                step('db-insert', {
                  sql: "INSERT INTO erasure_task (task_id, request_id, system, status) VALUES (:taskId, :requestId, :system, 'PENDING')",
                }),
                step('mq-publish', { destination: '#["gdpr." ++ payload.system]' }),
              ]),
              step('set-variable', { variableName: 'httpStatus', value: '202' }),
              step('transform', {
                script: '%dw 2.0\noutput application/json\n---\n{\n  requestId: vars.request.requestId,\n  status: "ACCEPTED"\n}',
              }),
            ],
          },
        ),
      ],
      [
        handler('on-error-propagate', { type: 'VALIDATION:BLANK_STRING' }, [
          step('set-variable', { variableName: 'httpStatus', value: '400' }),
        ]),
      ],
    ),
    worker('salesforce', [
      step('sf-query', { soql: 'SELECT Id FROM Contact WHERE Customer_Id__c = :customerId' }),
      scope('foreach', { collection: '#[payload]', batchSize: 1 }, [
        step('http-request', { method: 'DELETE', path: '/services/data/v60.0/sobjects/Contact/{id}' }),
      ]),
      step('db-update', { sql: "UPDATE erasure_task SET status = 'DONE', done_at = CURRENT_TIMESTAMP WHERE task_id = :taskId" }),
    ]),
    worker('policydb', [
      step('transform', {
        script:
          '%dw 2.0\nimport dw::Crypto\noutput application/java\n---\n{\n  customerId: payload.customerId,\n  pseudonym: Crypto::SHA1(payload.customerId as Binary),\n  name: "ANONYMISED",\n  email: null,\n  phone: null\n}',
      }),
      scope('try', { transactionalAction: 'ALWAYS_BEGIN' }, [
        step('db-update', {
          sql: 'UPDATE policy_holder SET name = :name, email = :email, phone = :phone, pseudonym = :pseudonym WHERE customer_id = :customerId',
        }),
        step('db-update', { sql: "UPDATE erasure_task SET status = 'DONE', done_at = CURRENT_TIMESTAMP WHERE task_id = :taskId" }),
      ]),
    ]),
    worker('marketing', [
      step('http-request', { method: 'POST', path: '/marketing/bulk-deletes' }),
      step('db-update', { sql: "UPDATE erasure_task SET status = 'IN_PROGRESS', job_id = :jobId WHERE task_id = :taskId" }),
    ]),
    worker('datalake', [
      step('http-request', { method: 'POST', path: '/datalake/erasures' }),
      step('db-update', { sql: "UPDATE erasure_task SET status = 'IN_PROGRESS', job_id = :jobId WHERE task_id = :taskId" }),
    ]),
    flow('gdpr-async-job-poller', source('scheduler', { strategy: 'fixed-frequency', frequency: 15, timeUnit: 'MINUTES' }), [
      step('db-select', { sql: "SELECT task_id, system, job_id FROM erasure_task WHERE status = 'IN_PROGRESS'" }),
      scope('foreach', { collection: '#[payload]', batchSize: 1 }, [
        step('http-request', { method: 'GET', path: '/{system}/jobs/{jobId}' }),
        router('choice', {}, [
          route({ expression: '#[payload.status == "COMPLETED"]' }, [
            step('db-update', { sql: "UPDATE erasure_task SET status = 'DONE', done_at = CURRENT_TIMESTAMP WHERE task_id = :taskId" }),
          ]),
        ]),
      ]),
    ]),
    flow('gdpr-completion-check', source('scheduler', { strategy: 'cron', expression: '0 0 * * * ?' }), [
      step('db-select', {
        sql: "SELECT r.request_id FROM erasure_request r WHERE r.status = 'ACCEPTED' AND NOT EXISTS (SELECT 1 FROM erasure_task t WHERE t.request_id = r.request_id AND t.status <> 'DONE')",
      }),
      scope('foreach', { collection: '#[payload]', batchSize: 1 }, [
        step('db-insert', {
          sql: 'INSERT INTO erasure_audit (request_id, customer_hash, system, action, result, done_at) SELECT t.request_id, r.customer_hash, t.system, t.action, t.status, t.done_at FROM erasure_task t JOIN erasure_request r ON r.request_id = t.request_id WHERE t.request_id = :requestId',
        }),
        step('db-update', { sql: "UPDATE erasure_request SET status = 'COMPLETED', completed_at = CURRENT_TIMESTAMP WHERE request_id = :requestId" }),
        step('http-request', { method: 'POST', path: '/privacy-portal/erasure-requests/{requestId}/completed' }),
      ]),
    ]),
  ),
  description: `
An insurer must honour GDPR **erasure requests** ("right to be forgotten") within **30 days**. A customer's personal data lives in:

- **Salesforce** (Contact, Cases, Emails)
- **Policy DB** (Oracle) — but policies must be **retained 7 years** for legal reasons, so personal fields must be **anonymised**, not deleted.
- **Marketing platform** (REST API, async bulk delete with job IDs)
- **Data lake** (S3 Parquet files, handled by a separate data team via their API)
- **Mule logs and Anypoint MQ messages** that may contain PII

Requests arrive from a privacy portal: \`POST /erasure-requests\` with \`{ requestId, customerId, email }\`. Legal requires **proof** of what was erased where and when, and some requests must be **blocked** (open claim, legal hold).

**Design the solution:** intake and checks, orchestration across systems, delete vs anonymise, async systems, retries/partial failures, audit evidence, and how the integration layer itself avoids keeping PII.
`,
  answerTemplate: `## Intake and eligibility checks

## Orchestration pattern

## Per-system actions

## Async systems and tracking

## Partial failures and retries

## Audit evidence

## PII in the integration layer
`,
  keyPoints: [
    'Intake API validates, checks legal hold/open claims, persists the request and returns 202 with a tracking id.',
    'An orchestrator tracks a per-system task list (Salesforce, Policy DB, Marketing, Data lake) with independent status and retries.',
    'Policy DB records are anonymised (personal fields overwritten/pseudonymised) rather than deleted to meet retention rules.',
    'Async systems (marketing bulk job, data lake) are tracked by job id and polled or called back until complete.',
    'Each task is idempotent; failures are retried and escalated, and the request completes only when all tasks succeed (or are explicitly waived).',
    'An audit record proves what was done (system, action, timestamp, result) without storing the erased PII itself; logs/messages avoid or mask PII.',
  ],
  solution: `
1. **Intake (Process API):** HTTP Listener → validate → **eligibility checks**: Policy DB query for open claims / legal hold flag. If blocked → store request as \`REJECTED\` with reason and return 200/422 to the portal. Otherwise store request \`ACCEPTED\` (DB table \`erasure_request\`) with a **hashed** identifier and return **202** \`{ requestId }\`.
2. **Fan-out tasks:** create one row per target system in \`erasure_task\` (\`PENDING\`) and publish a message per task to Anypoint MQ queues (\`gdpr.salesforce\`, \`gdpr.policydb\`, \`gdpr.marketing\`, \`gdpr.datalake\`), each with its own DLQ. Messages carry \`requestId\` + system-specific keys, not more PII than needed.
3. **Per-system workers:**
   - **Salesforce:** Query Contact/Cases by external ID → **Delete** (or anonymise fields where cases must remain). Deleted records sit in the Recycle Bin, so agree with the Salesforce admins how they are purged (e.g. hard delete or an emptying job) if policy requires it.
   - **Policy DB:** single DB transaction: \`UPDATE\` personal columns to anonymised values (DataWeave builds the pseudonymised values) keyed by customerId; policy numbers and amounts stay.
   - **Marketing:** HTTP Request to start a bulk delete → store returned \`jobId\` on the task → task status \`IN_PROGRESS\`.
   - **Data lake:** call the data team's erasure API; they own Parquet rewrites; track their ticket/job id.
4. **Async tracking:** a **Scheduler** flow polls \`IN_PROGRESS\` tasks (marketing job status, data lake job status) and updates them; or expose a callback endpoint.
5. **Failures:** workers Nack transient errors; after max deliveries the DLQ alerts the privacy ops team. A daily job flags requests approaching the 30-day deadline. All operations are idempotent ("already deleted" = success).
6. **Completion:** when all tasks are \`DONE\`, mark request \`COMPLETED\`, notify the portal (callback/email), and write a final **evidence record**: per system action, timestamp, result, operator/app — stored in a tamper-evident audit store. Keep only a hashed customer key to prove the request was honoured without retaining PII.
7. **Integration hygiene:** don't log payloads containing PII (mask with DataWeave before logging), short TTLs on queues and Object Stores used here, and backups addressed by policy (e.g. re-apply erasures on restore from a suppression list).
`,
  followUps: [
    { q: 'Why not delete everything synchronously in one API call?', a: 'Some systems are async, slow or temporarily down, and the portal cannot wait. Persisted tasks with independent retries make progress traceable and robust within the 30-day SLA.' },
    { q: 'How do you handle backups that still contain the customer?', a: 'Keep a suppression list of erased (hashed) IDs and re-apply erasure after any restore; backups expire per their retention policy.' },
    { q: 'What if the customer is recreated later by a sync from another system?', a: 'Check the suppression list in inbound sync flows, and make sure all source systems are covered by the erasure so the data is not re-propagated.' },
  ],
}
