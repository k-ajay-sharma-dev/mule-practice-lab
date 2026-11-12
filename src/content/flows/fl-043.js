import { design, flow, handler, route, router, scope, source, step } from '../../flow/dsl.js'
import { HANDLERS, handlerStatus } from '../../flow/rules.js'

export default {
  id: 'fl-043',
  category: 'flows',
  title: 'Asynchronous Bulk API: 10k Records in Chunks with Job Status',
  level: 'ADVANCED',
  tags: ['bulk-api', 'async', 'chunking', 'anypoint-mq', 'job-status'],
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
  referenceFlow: design(
    flow(
      'bulk-submit-api',
      source('http-listener', { path: '/pim/v1/bulk/products', allowedMethods: 'POST' }),
      [
        step('validation', {
          check: 'is-true',
          expression: '#[not isEmpty(payload.items default []) and sizeOf(payload.items default []) <= 10000]',
          message: 'items must contain between 1 and 10000 records',
        }),
        step('set-variable', { variableName: 'jobId', value: '#[uuid()]' }),
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
        step('set-variable', { variableName: 'chunk', value: '#[payload]' }),
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
A **Product Information (PIM) API** must let retail partners submit catalogue updates in bulk.

- A request carries **up to 10,000 product records** (≈15 MB JSON).
- The downstream PIM core accepts at most **500 records per call** and takes 5–20 s per call; it occasionally returns 503.
- Partners' HTTP clients time out after **30 s**, and the gateway rejects payloads over 20 MB.
- ~200 bulk jobs/day, with bursts when a partner re-sends its whole catalogue.
- Partners need to know whether **all** records landed, and which chunks failed, without calling support.
- Mule runs on 2 CloudHub workers; a restart must not lose accepted work.
- A request outside the size limit is rejected with **413** (or 400). A status request for an unknown job returns **404**.

**Design the flow(s):** request contract, validation, chunking, asynchronous processing, failure handling per chunk and the status API.
`,
  answerTemplate: `## API contract (submit and status)

## Validation and limits

## Job creation and chunking

## Chunk workers

## Failures and retries

## Status calculation
`,
  keyPoints: [
    'Submit endpoint validates size (≤10k) and returns 202 Accepted with a jobId and status URL — processing 20 chunks synchronously would blow the 30 s timeout.',
    'A job record is persisted first, then DataWeave splits the items (divideBy 500) and each chunk is published to a persistent queue (Anypoint MQ / persistent VM).',
    'Worker flows consume chunks with manual ack, call PIM with bounded retries, and record a per-chunk result idempotently keyed by (jobId, chunkNo).',
    'A chunk that still fails is recorded as FAILED (with the error) — never silently dropped — and the message is acked or dead-lettered deliberately.',
    'The status endpoint derives job status from chunk rows (ACCEPTED / IN_PROGRESS / COMPLETED / COMPLETED_WITH_ERRORS) instead of a shared counter, avoiding race conditions between workers.',
  ],
  solution: `
**Submit API** — \`POST /pim/v1/bulk/products\`
1. **Validate** \`1 ≤ sizeOf(items) ≤ 10000\` (413/400 otherwise).
2. Generate \`jobId\`; DataWeave \`divideBy 500\` from \`dw::core::Arrays\` → list of \`{ jobId, chunkNo, items }\`.
3. **Insert** \`bulk_job\` (jobId, client, total_chunks, ACCEPTED) **before** publishing — otherwise a fast worker could report on a job that does not exist yet.
4. **For Each** chunk (saved in a variable first, because the Insert replaces the payload) → Transform to JSON → **Anypoint MQ Publish** \`pim-bulk-chunks\` (persistent, survives restarts, spreads across both workers).
5. Return **202** \`{ jobId, statusUrl }\`.

**Chunk worker** — MQ Subscriber (MANUAL ack, prefetch tuned to the PIM's capacity)
- **Until Successful** (3 × 5 s) around the PIM call for 503s.
- Insert a \`bulk_chunk\` row (DONE + per-record errors returned by PIM), keyed on (jobId, chunkNo) so a redelivery does not double-count, then **Ack**.
- **On Error Continue**: insert the chunk as FAILED with the error, then Ack (or Nack to let the queue's DLQ policy decide, and record FAILED from the DLQ consumer).

**Status API** — \`GET /pim/v1/bulk/jobs/{jobId}\`: one SQL aggregate over chunk rows; DataWeave derives status. Optionally \`GET .../errors\` returns the failed records so the partner can resubmit only those.

**Why rows per chunk rather than a counter in Object Store?** Two workers incrementing the same counter race (read–modify–write); inserting immutable rows and counting them is naturally concurrency-safe.
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
