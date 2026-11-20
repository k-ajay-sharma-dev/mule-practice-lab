import { design, flow, handler, route, router, scope, source, step } from '../../flow/dsl.js'
import { HANDLERS, handlerStatus } from '../../flow/rules.js'

// A job that already ran: two chunks landed and one failed.
const jobTables = {
  bulk_job: {
    key: 'job_id',
    columns: ['job_id', 'client_id', 'total_chunks', 'status', 'created_at'],
    rows: [{ job_id: 'JOB-7731', client_id: 'partner-outdoorco', total_chunks: 3, status: 'ACCEPTED', created_at: '2026-11-13T08:00:00Z' }],
  },
  bulk_chunk: {
    key: ['job_id', 'chunk_no'],
    columns: ['job_id', 'chunk_no', 'status', 'ok_count', 'error_json'],
    rows: [
      { job_id: 'JOB-7731', chunk_no: 1, status: 'DONE', ok_count: 500, error_json: null },
      { job_id: 'JOB-7731', chunk_no: 2, status: 'FAILED', ok_count: null, error_json: 'HTTP:SERVICE_UNAVAILABLE' },
      { job_id: 'JOB-7731', chunk_no: 3, status: 'DONE', ok_count: 200, error_json: null },
    ],
  },
}
const items = (n, prefix) => Array.from({ length: n }, (_, i) => ({ sku: `${prefix}-${1000 + i}`, name: `${prefix} model ${i + 1}`, price: 49 + (i % 40) }))

export default {
  id: 'fl-043',
  category: 'flows',
  title: 'Asynchronous Bulk API: 10k Records in Chunks with Job Status',
  level: 'ADVANCED',
  tags: ['myproject', 'bulk-api', 'async', 'chunking', 'anypoint-mq', 'job-status'],
  estMinutes: 35,
  flowChecks: [
    { label: 'Bulk submissions arrive through an HTTP Listener', rule: { type: 'source', component: 'http-listener' } },
    {
      label: 'The request size limit (max 10,000 records) is enforced up front',
      rule: { type: 'before', first: 'validation', firstWhere: { expression: '10000' }, then: ['db-insert', 'os-store', 'mq-publish', 'vm-publish'] },
    },
    {
      label: 'A request outside the size limit is rejected with 413 or 400',
      rule: handlerStatus('VALIDATION', { oneOf: ['413', '400'] }),
    },
    {
      label: 'The submit API answers with a job ID and never calls the PIM core itself',
      rule: {
        type: 'all',
        rules: [
          { type: 'before', first: 'http-listener', then: ['mq-publish', 'vm-publish'] },
          { type: 'absent', component: ['http-request', 'until-successful'], inFlowWith: { component: 'http-listener' } },
        ],
      },
    },
    {
      label: 'A job record is created before any chunk is dispatched',
      rule: { type: 'before', first: ['db-insert', 'os-store'], then: ['mq-publish', 'vm-publish'] },
    },
    {
      label: 'Records are split into chunks and each chunk is queued',
      rule: { type: 'inside', component: ['mq-publish', 'vm-publish'], within: ['foreach', 'parallel-foreach', 'batch-job'] },
    },
    { label: 'Worker flows consume chunks from the queue', rule: { type: 'source', component: ['mq-subscriber', 'vm-listener'] } },
    {
      label: 'A separate status endpoint lets clients poll job progress',
      rule: {
        type: 'all',
        rules: [
          { type: 'exists', component: 'http-listener', min: 2 },
          { type: 'before', first: 'http-listener', firstWhere: { allowedMethods: 'GET' }, then: ['db-select', 'os-retrieve'] },
        ],
      },
    },
    {
      label: 'A failed chunk is recorded in the job status instead of being lost',
      rule: { type: 'inside', component: ['db-insert', 'db-update', 'os-store'], within: ['on-error-continue', 'on-error-propagate'] },
    },
    {
      label: 'Each chunk message is acked once its result is recorded, on success and on failure',
      rule: {
        type: 'any',
        rules: [
          { type: 'exists', component: 'mq-ack', min: 2 },
          // Nacking a failed chunk and letting the DLQ policy decide is also fine.
          { type: 'all', rules: [{ type: 'exists', component: 'mq-ack' }, { type: 'inside', component: 'mq-nack', within: HANDLERS }] },
          // A VM queue has no ack: the message is taken once the flow ends, or returned when a transaction rolls back.
          { type: 'all', rules: [{ type: 'source', component: 'vm-listener' }, { type: 'absent', component: 'mq-subscriber' }] },
        ],
      },
    },
    {
      label: 'An unknown job ID returns 404',
      rule: {
        type: 'any',
        rules: [
          { type: 'inside', component: 'set-variable', where: { value: '404' }, within: 'choice' },
          handlerStatus('NOT_FOUND', '404'),
        ],
      },
    },
  ],
  simulation: {
    systems: {
      http: [{ method: 'POST', path: '/pim-core/products/batch', latencyMs: 8000, respond: { status: 200, body: { okCount: 500, errors: [] } } }],
      db: { tables: { bulk_job: { ...jobTables.bulk_job, rows: [] }, bulk_chunk: { ...jobTables.bulk_chunk, rows: [] } } },
    },
    tests: [
      {
        name: 'A catalogue of 1,200 records',
        about: 'The partner gets 202 at once, and the records reach the PIM core in three calls of at most 500.',
        trigger: { http: { method: 'POST', path: '/pim/v1/bulk/products', headers: { client_id: 'partner-outdoorco' }, body: { items: items(1200, 'TENT') } } },
        expect: {
          status: 202,
          maxMs: 3000,
          calls: [{ method: 'POST', path: '/pim-core/products/batch', count: 3 }],
          db: { bulk_job: { count: 1 }, bulk_chunk: { count: 3, has: [{ chunk_no: 1, status: 'DONE' }, { chunk_no: 3, status: 'DONE' }], lacks: { status: 'FAILED' } } },
        },
      },
      {
        name: 'More than 10,000 records',
        about: 'The request is refused up front, and nothing is queued or sent to the PIM core.',
        trigger: { http: { method: 'POST', path: '/pim/v1/bulk/products', headers: { client_id: 'partner-outdoorco' }, body: { items: items(10001, 'MAT') } } },
        expect: { bodyLacks: '~No listener for endpoint', notSent: ['pim-bulk-chunks'], calls: [{ method: 'POST', path: '/pim-core/products/batch', count: 0 }], db: { bulk_job: { count: 0 } } },
      },
      {
        name: 'The PIM core answers 503 once',
        about: 'A short outage is retried, so every chunk still lands.',
        trigger: { http: { method: 'POST', path: '/pim/v1/bulk/products', headers: { client_id: 'partner-outdoorco' }, body: { items: items(700, 'STOVE') } } },
        overrides: { systems: { http: [{ method: 'POST', path: '/pim-core/products/batch', latencyMs: 6000, responses: [{ status: 503, body: { message: 'PIM busy' } }, { status: 200, body: { okCount: 500, errors: [] } }] }] } },
        expect: { status: 202, db: { bulk_chunk: { count: 2, has: [{ chunk_no: 1, status: 'DONE' }, { chunk_no: 2, status: 'DONE' }] } } },
      },
      {
        name: 'The PIM core stays down',
        about: 'Each chunk that cannot be delivered is recorded as failed, so the partner can see it.',
        trigger: { http: { method: 'POST', path: '/pim/v1/bulk/products', headers: { client_id: 'partner-outdoorco' }, body: { items: items(700, 'STOVE') } } },
        overrides: { systems: { http: [{ method: 'POST', path: '/pim-core/products/batch', respond: { status: 503, body: { message: 'PIM down for maintenance' } } }] } },
        expect: { status: 202, db: { bulk_chunk: { count: 2, has: [{ chunk_no: 1, status: 'FAILED' }, { chunk_no: 2, status: 'FAILED' }] } } },
      },
      {
        name: 'A partner checks a finished job',
        about: 'The status answer names the job, worked out from its chunk rows.',
        trigger: { http: { method: 'GET', path: '/pim/v1/bulk/jobs/JOB-7731' } },
        overrides: { systems: { db: { tables: jobTables } } },
        expect: { status: 200, bodyHas: { jobId: 'JOB-7731' } },
      },
      {
        name: 'An unknown job ID',
        about: 'A status request for a job that does not exist gets 404.',
        trigger: { http: { method: 'GET', path: '/pim/v1/bulk/jobs/JOB-0000' } },
        overrides: { systems: { db: { tables: jobTables } } },
        // The status flow must give the 404 itself, not a missing endpoint.
        expect: { status: 404, bodyLacks: '~No listener for endpoint' },
      },
    ],
  },
  referenceFlow: design(
    flow(
      'bulk-submit-api',
      source('http-listener', { path: '/pim/v1/bulk/products', allowedMethods: 'POST' }),
      [
        step('validation', {
          check: 'is-true',
          expression: '#[(not isEmpty(payload.items default [])) and sizeOf(payload.items default []) <= 10000]',
          message: 'items must contain between 1 and 10000 records',
        }),
        step('set-variable', { variableName: 'jobId', value: '#[uuid()]' }),
        step('set-variable', { variableName: 'clientId', value: '#[attributes.headers.client_id default "unknown"]' }),
        step('transform', {
          script:
            '%dw 2.0\nimport divideBy from dw::core::Arrays\noutput application/java\n---\n(payload.items divideBy 500) map ((chunk, i) -> {\n  jobId: vars.jobId,\n  chunkNo: i + 1,\n  items: chunk\n})',
        }),
        step('set-variable', { variableName: 'chunks', value: '#[payload]' }),
        step('set-variable', { variableName: 'chunkCount', value: '#[sizeOf(payload)]' }),
        step('db-insert', {
          sql: "INSERT INTO bulk_job (job_id, client_id, total_chunks, status, created_at) VALUES (:jobId, :clientId, :chunkCount, 'ACCEPTED', CURRENT_TIMESTAMP)",
        }),
        // Database Insert replaces the payload, so iterate the saved chunks. MQ bodies must serialise to text: publish JSON.
        scope('foreach', { collection: '#[vars.chunks]', batchSize: 1 }, [
          step('transform', { script: '%dw 2.0\noutput application/json\n---\npayload' }),
          step('mq-publish', { destination: 'pim-bulk-chunks' }),
        ]),
        step('set-variable', { variableName: 'httpStatus', value: '202' }),
        step('set-payload', {
          value: '#[output application/json --- { jobId: vars.jobId, status: "ACCEPTED", statusUrl: "/pim/v1/bulk/jobs/" ++ vars.jobId }]',
        }),
      ],
      [
        handler('on-error-propagate', { type: 'VALIDATION:INVALID_BOOLEAN' }, [
          step('set-variable', { variableName: 'httpStatus', value: '413' }),
          step('set-payload', { value: '#[output application/json --- { message: error.description }]' }),
        ]),
      ],
    ),
    flow(
      'bulk-chunk-worker',
      source('mq-subscriber', { destination: 'pim-bulk-chunks', acknowledgementMode: 'MANUAL' }),
      [
        step('set-variable', { variableName: 'ackToken', value: '#[attributes.ackToken]' }),
        // The PIM answer replaces the payload, so the chunk's keys are kept for the result row.
        step('set-variable', { variableName: 'jobId', value: '#[payload.jobId]' }),
        step('set-variable', { variableName: 'chunkNo', value: '#[payload.chunkNo]' }),
        scope('until-successful', { maxRetries: 3, millisBetweenRetries: 5000 }, [
          step('http-request', { method: 'POST', path: '/pim-core/products/batch', responseTimeout: 30000 }),
        ]),
        step('db-insert', {
          sql: "INSERT INTO bulk_chunk (job_id, chunk_no, status, ok_count, error_json) VALUES (:jobId, :chunkNo, 'DONE', :okCount, :errors) ON CONFLICT (job_id, chunk_no) DO NOTHING",
        }),
        step('mq-ack', { ackToken: '#[vars.ackToken]' }),
      ],
      [
        handler('on-error-continue', { type: 'ANY' }, [
          step('set-variable', { variableName: 'error', value: '#[error.description]' }),
          step('db-insert', {
            sql: "INSERT INTO bulk_chunk (job_id, chunk_no, status, error_json) VALUES (:jobId, :chunkNo, 'FAILED', :error) ON CONFLICT (job_id, chunk_no) DO NOTHING",
          }),
          step('mq-ack', { ackToken: '#[vars.ackToken]' }),
        ]),
      ],
    ),
    flow(
      'bulk-status-api',
      source('http-listener', { path: '/pim/v1/bulk/jobs/{jobId}', allowedMethods: 'GET' }),
      [
        step('db-select', {
          sql: "SELECT j.job_id, j.total_chunks, COUNT(c.chunk_no) FILTER (WHERE c.status = 'DONE') AS done, COUNT(c.chunk_no) FILTER (WHERE c.status = 'FAILED') AS failed FROM bulk_job j LEFT JOIN bulk_chunk c ON c.job_id = j.job_id WHERE j.job_id = :jobId GROUP BY j.job_id, j.total_chunks",
        }),
        router(
          'choice',
          {},
          [
            route({ expression: '#[isEmpty(payload)]' }, [
              step('set-variable', { variableName: 'httpStatus', value: '404' }),
              step('set-payload', { value: '#[output application/json --- { message: "Unknown job" }]' }),
            ]),
          ],
          {
            otherwise: [
              step('transform', {
                script:
                  '%dw 2.0\noutput application/json\nvar j = payload[0]\nvar finished = j.done + j.failed\n---\n{\n  jobId: j.job_id,\n  status: if (finished < j.total_chunks) "IN_PROGRESS" else if (j.failed > 0) "COMPLETED_WITH_ERRORS" else "COMPLETED",\n  chunks: { total: j.total_chunks, done: j.done, failed: j.failed }\n}',
              }),
            ],
          },
        ),
      ],
    ),
  ),
  description: `
A **Product Information (PIM) API** must let retail partners submit catalogue updates in bulk. Partners send \`POST /pim/v1/bulk/products\` with a body \`{ "items": [ ... ] }\`.

- A request carries **up to 10,000 product records** (about 15 MB of JSON).
- The PIM core takes records at \`POST /pim-core/products/batch\`. It accepts at most **500 records per call**, takes 5 to 20 s per call, and sometimes returns 503.
- Partners' HTTP clients time out after **30 s**.
- About 200 bulk jobs a day, with bursts when a partner resends its whole catalogue.
- Partners need to know whether **all** records landed, and which chunks failed, without calling support.
- Mule runs on 2 CloudHub workers. A restart must not lose accepted work.

Two tables hold the job state:
- \`bulk_job\` (\`job_id\`, \`client_id\`, \`total_chunks\`, \`status\`, \`created_at\`): one row per accepted request.
- \`bulk_chunk\` (\`job_id\`, \`chunk_no\`, \`status\`, \`ok_count\`, \`error_json\`): one row per chunk result, with status \`DONE\` or \`FAILED\`. The key is (\`job_id\`, \`chunk_no\`).

**Requirements**
- Check the size first. A request with no records or more than 10,000 is rejected with **413** (or 400), and nothing is stored or queued.
- Answer **202** at once with the \`jobId\`. The submit flow never calls the PIM core itself.
- Write the \`bulk_job\` row before any chunk is queued. Then split the records into chunks of 500 and queue each chunk.
- Workers take chunks from the queue and call the PIM core, retrying a short outage.
- Record every chunk result in \`bulk_chunk\`, \`DONE\` or \`FAILED\`. A chunk that keeps failing is recorded as \`FAILED\`, never lost.
- Acknowledge a chunk message only after its result is recorded.
- \`GET /pim/v1/bulk/jobs/{jobId}\` returns the job's progress, worked out from its chunk rows. An unknown job returns **404**.

**Design the flows.**
`,
  answerTemplate: `## API contract (submit and status)

## Validation and limits

## Job creation and chunking

## Chunk workers

## Failures and retries

## Status calculation
`,
  keyPoints: [
    'Submit endpoint validates size (≤10k) and returns 202 Accepted with a jobId and status URL. Processing 20 chunks while the partner waits would blow the 30 s timeout.',
    'A job record is persisted first, then DataWeave splits the items (divideBy 500) and each chunk is published to a persistent queue (Anypoint MQ / persistent VM).',
    'Worker flows consume chunks with manual ack, call PIM with bounded retries, and record a per-chunk result idempotently keyed by (jobId, chunkNo).',
    'A chunk that still fails is recorded as FAILED (with the error), never dropped, and the message is acked or dead-lettered deliberately.',
    'The status endpoint derives job status from chunk rows (ACCEPTED / IN_PROGRESS / COMPLETED / COMPLETED_WITH_ERRORS) instead of a shared counter, avoiding race conditions between workers.',
  ],
  solution: `
**Submit API:** \`POST /pim/v1/bulk/products\`
1. **Validate** \`1 ≤ sizeOf(items) ≤ 10000\` (413/400 otherwise).
2. Generate \`jobId\`; DataWeave \`divideBy 500\` from \`dw::core::Arrays\` → list of \`{ jobId, chunkNo, items }\`.
3. **Insert** \`bulk_job\` (jobId, client, total_chunks, ACCEPTED) **before** publishing. Otherwise a fast worker could report on a job that does not exist yet.
4. **For Each** chunk (saved in a variable first, because the Insert replaces the payload) → Transform to JSON → **Anypoint MQ Publish** \`pim-bulk-chunks\` (persistent, survives restarts, spreads across both workers).
5. Return **202** \`{ jobId, statusUrl }\`.

**Chunk worker:** MQ Subscriber (MANUAL ack, prefetch tuned to the PIM's capacity)
- Save \`jobId\` and \`chunkNo\` in variables first: the PIM answer replaces the payload, and the result row needs them.
- **Until Successful** (3 × 5 s) around the PIM call for 503s.
- Insert a \`bulk_chunk\` row (DONE + per-record errors returned by PIM), keyed on (jobId, chunkNo) so a redelivery does not double-count, then **Ack**.
- **On Error Continue**: insert the chunk as FAILED with the error, then Ack (or Nack to let the queue's DLQ policy decide, and record FAILED from the DLQ consumer).

**Status API:** \`GET /pim/v1/bulk/jobs/{jobId}\`: one SQL aggregate over chunk rows; DataWeave derives status. Optionally \`GET .../errors\` returns the failed records so the partner can resubmit only those.

**Why rows per chunk rather than a counter in Object Store?** Two workers incrementing the same counter race (read, modify, write); inserting immutable rows and counting them is naturally concurrency-safe.
`,
  followUps: [
    {
      q: 'Why not use a Batch Job inside the submit request?',
      a: 'It would also work (batch is asynchronous and persistent), but batch queues are local to one worker, and per-job status/failed-record reporting to the client still has to be built. MQ chunks spread load across workers and give DLQ behaviour for free.',
    },
    {
      q: 'The partner retries the POST because its connection dropped after you accepted the job. How do you avoid processing 10k records twice?',
      a: 'Require an Idempotency-Key header (or hash of the body) and store it with the job; a repeated key returns the original jobId and 202 without publishing again.',
    },
    {
      q: 'How would you notify the partner when the job completes instead of polling?',
      a: 'Let them register a callback URL; when the last chunk row is written (done + failed = total), publish a job-completed event and a webhook flow POSTs the summary, with retries.',
    },
  ],
}
