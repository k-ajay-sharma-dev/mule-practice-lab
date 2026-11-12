import { design, flow, handler, route, router, source, step } from '../../flow/dsl.js'
import { handlerStatus } from '../../flow/rules.js'

export default {
  id: 'fl-017',
  category: 'flows',
  title: 'Long-Running Report Job: 202 Accepted and Status Polling',
  level: 'INTERMEDIATE',
  tags: ['async-api', '202-accepted', 'polling', 'object-store', 'vm'],
  estMinutes: 35,
  flowChecks: [
    { label: 'POST /statements is exposed through an HTTP Listener', rule: { type: 'source', component: 'http-listener' } },
    {
      label: 'A separate GET endpoint reports job status',
      rule: { type: 'all', rules: [{ type: 'exists', component: 'http-listener', min: 2 }, { type: 'source', component: 'http-listener', where: { allowedMethods: 'GET' } }] },
    },
    {
      label: 'The submit call answers 202 Accepted with the job id',
      rule: {
        type: 'any',
        rules: [
          { type: 'before', first: 'http-listener', firstWhere: { allowedMethods: 'POST' }, then: 'set-variable', thenWhere: { value: '202' } },
          { type: 'before', first: 'http-listener', firstWhere: { allowedMethods: 'POST' }, then: 'transform', thenWhere: { script: '202' } },
        ],
      },
    },
    {
      label: 'The warehouse query runs in the worker, not in the API flows',
      rule: {
        type: 'all',
        rules: [
          { type: 'exists', component: 'db-select' },
          { type: 'absent', component: 'db-select', inFlowWith: { component: 'http-listener' } },
        ],
      },
    },
    {
      label: 'Duplicate submissions are looked up before a new job is queued',
      rule: { type: 'before', first: ['os-retrieve', 'idempotent'], then: ['vm-publish', 'mq-publish', 'jms-publish'] },
    },
    {
      label: 'A new job saves its PENDING state and the dedupe key that points to it',
      rule: {
        type: 'any',
        rules: [
          { type: 'inside', component: ['os-store', 'db-insert', 'db-update'], within: 'choice', min: 2 },
          { type: 'exists', component: 'idempotent' },
        ],
      },
    },
    {
      label: 'The status endpoint reads the job state from the store',
      rule: { type: 'before', first: 'http-listener', firstWhere: { allowedMethods: 'GET' }, then: 'os-retrieve' },
    },
    {
      label: 'The job is recorded as PENDING before it is queued',
      rule: {
        type: 'any',
        rules: [
          { type: 'before', first: 'os-store', firstWhere: { value: 'PENDING' }, then: ['vm-publish', 'mq-publish', 'jms-publish'] },
          { type: 'before', first: ['db-insert', 'db-update'], firstWhere: { sql: 'PENDING' }, then: ['vm-publish', 'mq-publish', 'jms-publish'] },
        ],
      },
    },
    {
      label: 'A worker flow consumes jobs from a queue, decoupled from the API',
      rule: { type: 'source', component: ['vm-listener', 'mq-subscriber', 'jms-listener'] },
    },
    {
      label: 'Job state is updated as it progresses (store shared by all replicas)',
      rule: { type: 'exists', component: ['os-store', 'db-insert', 'db-update'], min: 3 },
    },
    {
      label: 'The job is marked COMPLETED only after the PDF is uploaded',
      rule: {
        type: 'any',
        rules: [
          { type: 'before', first: 'http-request', firstWhere: { method: 'PUT' }, then: 'os-store', thenWhere: { value: 'COMPLETED' }, outside: true },
          { type: 'before', first: 'http-request', firstWhere: { method: 'PUT' }, then: 'db-update', thenWhere: { sql: 'COMPLETED' }, outside: true },
          { type: 'before', first: 's3-put', then: 'os-store', thenWhere: { value: 'COMPLETED' }, outside: true },
          { type: 'before', first: 's3-put', then: 'db-update', thenWhere: { sql: 'COMPLETED' }, outside: true },
        ],
      },
    },
    {
      label: 'Worker failures mark the job FAILED instead of losing it',
      rule: {
        type: 'any',
        rules: [
          { type: 'inside', component: 'os-store', where: { value: 'FAILED' }, within: ['on-error-continue', 'on-error-propagate'] },
          { type: 'inside', component: 'db-update', where: { sql: 'FAILED' }, within: ['on-error-continue', 'on-error-propagate'] },
        ],
      },
    },
    {
      label: 'An unknown job id returns 404',
      rule: {
        type: 'any',
        rules: [handlerStatus('NOT_FOUND', '404'), { type: 'inside', component: 'set-variable', where: { value: '404' }, within: 'choice' }],
      },
    },
  ],
  optionalSteps: [
    {
      type: 'os-store',
      flow: 'statement-worker',
      why: 'The scenario lists only PENDING, COMPLETED and FAILED, so a RUNNING status while the worker runs is a nicety.',
    },
  ],
  referenceFlow: design(
    flow(
      'submit-statement',
      source('http-listener', { path: '/statements', allowedMethods: 'POST' }),
      [
        step('validation', { check: 'is-not-blank-string', expression: '#[payload.accountId]', message: 'accountId is required' }),
        step('set-variable', { variableName: 'request', value: '#[payload]' }),
        step('set-variable', {
          variableName: 'dedupeKey',
          value: '#[dw::Crypto::SHA1((payload.accountId ++ "|" ++ payload.from ++ "|" ++ payload.to) as Binary)]',
        }),
        // A null default counts as no default: Retrieve would raise OS:KEY_NOT_FOUND on a miss.
        step('os-retrieve', { key: '#["dedupe-" ++ vars.dedupeKey]', defaultValue: '#[""]', objectStore: 'statement-dedupe' }),
        router(
          'choice',
          {},
          [route({ expression: '#[not isEmpty(payload)]' }, [step('set-variable', { variableName: 'jobId', value: '#[payload]' })])],
          {
            otherwise: [
              step('set-variable', { variableName: 'jobId', value: '#[uuid()]' }),
              step('os-store', {
                key: '#[vars.jobId]',
                value: '#[{ status: "PENDING", createdAt: now() }]',
                objectStore: 'statement-jobs',
              }),
              step('os-store', { key: '#["dedupe-" ++ vars.dedupeKey]', value: '#[vars.jobId]', objectStore: 'statement-dedupe' }),
              step('set-payload', { value: '#[output application/json --- { jobId: vars.jobId, params: vars.request }]' }),
              step('vm-publish', { queueName: 'statement-jobs' }),
            ],
          },
        ),
        step('set-variable', { variableName: 'httpStatus', value: '#[202]' }),
        step('set-variable', { variableName: 'location', value: '#["/statements/jobs/" ++ vars.jobId]' }),
        step('set-payload', { value: '#[output application/json --- { jobId: vars.jobId, status: "PENDING" }]' }),
      ],
    ),
    flow(
      'statement-job-status',
      source('http-listener', { path: '/statements/jobs/{jobId}', allowedMethods: 'GET' }),
      [
        // Retrieve replaces the attributes, so read the URI parameter first.
        step('set-variable', { variableName: 'jobId', value: '#[attributes.uriParams.jobId]' }),
        step('os-retrieve', { key: '#[vars.jobId]', objectStore: 'statement-jobs' }),
        step('transform', {
          script:
            '%dw 2.0\noutput application/json\n---\n{\n  jobId: vars.jobId,\n  status: payload.status,\n  (resultUrl: payload.resultUrl) if (payload.status == "COMPLETED")\n}',
        }),
      ],
      [
        handler('on-error-continue', { type: 'OS:KEY_NOT_FOUND' }, [
          step('set-variable', { variableName: 'httpStatus', value: '#[404]' }),
          step('set-payload', { value: '#[output application/json --- { code: "JOB_NOT_FOUND" }]' }),
        ]),
      ],
    ),
    flow(
      'statement-worker',
      source('vm-listener', { queueName: 'statement-jobs' }),
      [
        step('set-variable', { variableName: 'job', value: '#[payload]' }),
        step('os-store', { key: '#[vars.job.jobId]', value: '#[{ status: "RUNNING", startedAt: now() }]', objectStore: 'statement-jobs' }),
        step('db-select', {
          sql: 'SELECT txn_date, description, amount FROM statement_lines WHERE account_id = :accountId AND txn_date BETWEEN :fromDate AND :toDate ORDER BY txn_date',
        }),
        step('transform', {
          script:
            '%dw 2.0\noutput application/json\n---\n{ accountId: vars.job.params.accountId, lines: payload, total: sum(payload.amount default []) }',
        }),
        step('http-request', { method: 'POST', path: '/pdf/render', responseTimeout: 300000 }),
        step('http-request', { method: 'PUT', path: '/statements-bucket/#[vars.job.jobId].pdf', responseTimeout: 60000 }),
        step('os-store', {
          key: '#[vars.job.jobId]',
          value: '#[{ status: "COMPLETED", resultUrl: "/statements/jobs/" ++ vars.job.jobId ++ "/file", completedAt: now() }]',
          objectStore: 'statement-jobs',
        }),
      ],
      [
        handler('on-error-continue', { type: 'ANY' }, [
          step('os-store', {
            key: '#[vars.job.jobId]',
            value: '#[{ status: "FAILED", errorCode: error.errorType.identifier, failedAt: now() }]',
            objectStore: 'statement-jobs',
          }),
        ]),
      ],
    ),
  ),
  description: `
A **Reporting API** generates a customer statement PDF by querying a data warehouse (Snowflake) and rendering a PDF. Generation takes **30 s to 8 min**. The API gateway and clients time out at **60 s**.

**Requirements**
- \`POST /statements\` with \`{ accountId, from, to }\` starts a job.
- Clients can check progress and download the file when ready.
- Duplicate submissions of the same request within 10 minutes should return the existing job.
- Max 5 jobs run concurrently (warehouse cost), others wait.
- Finished files are kept 24 h.
- The worker uploads each finished PDF to the statements bucket with \`PUT /statements-bucket/{jobId}.pdf\`.

**Facts**
- A job status is one of \`PENDING\`, \`COMPLETED\` or \`FAILED\`.

**Design the API and flow(s):** endpoints, status codes, job state storage, worker flow, concurrency limit and cleanup.
`,
  answerTemplate: `## API contract

## Submitting a job

## Job state store

## Worker flow and concurrency

## Status and download

## Duplicates and cleanup
`,
  keyPoints: [
    'POST returns 202 Accepted with a jobId and a Location header pointing to GET /statements/jobs/{jobId}.',
    'Job state (PENDING, RUNNING, COMPLETED, FAILED) is kept in a persistent store (Object Store or DB) shared by all replicas.',
    'The worker is decoupled via a queue (VM persistent or Anypoint MQ) and its concurrency is limited to 5 (e.g. maxConcurrency on the worker flow / subscriber).',
    'Status endpoint returns 200 with the state; when completed it gives a download link (or 303 to the result resource).',
    'A hash of the request parameters is used as a dedupe key for 10 minutes; a TTL/scheduled cleanup removes results after 24 h.',
  ],
  solution: `
1. **Contract:**
   - \`POST /statements\` → **202** \`{ jobId, status: "PENDING" }\` + \`Location: /statements/jobs/{jobId}\`.
   - \`GET /statements/jobs/{jobId}\` → 200 \`{ status, progress, resultUrl? }\`, 404 if unknown.
   - \`GET /statements/jobs/{jobId}/file\` → 200 PDF, 409 if not ready.
2. **Submit flow:** validate → DataWeave computes \`dedupeKey\` = hash of \`accountId|from|to\` (e.g. \`dw::Crypto::SHA1\`) → Object Store Retrieve; if a job exists and is younger than 10 min return it. Otherwise generate \`jobId\` (\`uuid()\`), **Object Store Store** \`{ status: PENDING, createdAt }\` and **Publish** \`{ jobId, params }\` to a queue → respond 202 (status code set via a variable on the listener response).
3. **Job store:** persistent Object Store (Object Store v2 on CloudHub) or a DB table — must be shared so any replica can answer status calls. Entry TTL 24 h.
4. **Worker flow:** VM Listener (persistent queue) or **Anypoint MQ Subscriber**; flow \`maxConcurrency="5"\` (or subscriber concurrency 5 per app, divided by replicas) → update status RUNNING → Snowflake query (Snowflake/Database connector) → render PDF (e.g. via a PDF service) → upload to S3 → status COMPLETED with \`resultUrl\` (pre-signed URL).
5. **Failure:** On Error Continue in the worker sets status FAILED with an error code; the client sees it on the next poll. Optionally a webhook/callback URL supplied at submit time is called on completion so clients don't need to poll.
6. **Cleanup:** Object Store TTL expires metadata; S3 lifecycle rule deletes files after 24 h. A scheduled flow marks jobs stuck in RUNNING beyond 15 min as FAILED.
`,
  followUps: [
    { q: 'Why not just raise the HTTP timeout to 10 minutes?', a: 'Gateways, load balancers and clients will still cut long connections, threads are held for minutes, and a retry by the client starts a duplicate job. Async with polling is the standard pattern.' },
    { q: 'How often should clients poll?', a: 'Return a Retry-After header (e.g. 10 s) on status responses and document a backoff; or offer a callback/webhook to remove polling.' },
    { q: 'What happens if the worker replica crashes mid-job?', a: 'With a broker and manual ack, the message is redelivered and the job restarts; the stuck-job sweeper covers the case where status was left at RUNNING.' },
  ],
}
