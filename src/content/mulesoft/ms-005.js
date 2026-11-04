export default {
  id: 'ms-005',
  category: 'mulesoft',
  title: 'Batch Job Phases, Accept Policies and maxFailedRecords',
  level: 'ADVANCED',
  tags: ['batch', 'error-handling', 'performance'],
  estMinutes: 30,
  quiz: [
    {
      type: 'single',
      prompt: 'The job used default settings and stopped after the **first** bad record. Why?',
      options: [
        'The default `maxFailedRecords` is 0, so the first failure stops the job',
        'The default `maxFailedRecords` is -1, which means stop immediately',
        'Batch jobs always stop on the first error; this cannot be changed',
        'The default accept policy is ALL, which aborts on failure',
      ],
      answer: 0,
      explain: 'Default `maxFailedRecords` is **0**. `-1` means unlimited (never stop). The default accept policy is NO_FAILURES, which only controls which records enter a step.',
    },
    {
      type: 'single',
      prompt: 'How do you implement "stop if more than 2% of 1.2M records fail"?',
      options: [
        'Set `maxFailedRecords="2%"`',
        'Set `maxFailedRecords` to an absolute count, about 24000',
        'Set `maxFailedRecords="-1"` and check the percentage in On Complete',
        'Use an ONLY_FAILURES step that throws after 2%',
      ],
      answer: 1,
      explain: '`maxFailedRecords` takes an **absolute number**, not a percentage — compute it from the input size (2% of 1.2M ≈ 24,000). Checking in On Complete would be too late to stop the job.',
    },
    {
      type: 'order',
      prompt: 'Put the batch job phases in execution order.',
      items: ['Load and Dispatch', 'Process (batch steps)', 'On Complete'],
      explain: 'Load and Dispatch splits the input into records and queues them, Process runs records through the steps in blocks, and On Complete gets a `BatchJobResult` with the counts.',
    },
    {
      type: 'match',
      prompt: 'Match each batch step to the accept policy it needs.',
      pairs: [
        ['Commerce Cloud step — skip records that failed SAP', 'NO_FAILURES'],
        ['Collect failures for the S3 CSV', 'ONLY_FAILURES'],
        ['Audit step that must see every record, failed or not', 'ALL'],
      ],
      explain: 'NO_FAILURES (the default) only admits records that have not failed; ONLY_FAILURES admits only failed records; ALL admits both.',
    },
    {
      type: 'single',
      prompt: 'The calling flow logged "job finished" right after the Batch Job scope. Why was that wrong?',
      options: [
        'The Batch Job runs asynchronously; the flow continues immediately with a `BatchJobInstance`',
        'The Logger runs before the Batch Job because of the processing strategy',
        'Batch jobs block the flow, so the log was correct',
        'The Logger was inside the Load and Dispatch phase',
      ],
      answer: 0,
      explain: 'Batch execution is asynchronous to the caller. The Slack summary and the S3 upload belong in **On Complete**, whose payload is the `BatchJobResult`.',
    },
    {
      type: 'multi',
      prompt: 'Which settings are real throughput / memory levers for this job?',
      options: [
        '`blockSize` (default 100)',
        '`maxConcurrency` on the batch job',
        'Batch Aggregator `size` aligned with the SAP limit of 500',
        'Setting `maxFailedRecords` to -1',
        'Mapping records to only the needed fields before the batch',
      ],
      answer: [0, 1, 2, 4],
      explain: '`maxFailedRecords` controls when the job stops, not how fast it runs. Block size, concurrency, aggregator size and smaller records all affect throughput and queue/memory cost.',
    },
  ],
  description: `
Every night, **1.2 million** product price records are read from a Snowflake export and pushed to **SAP S/4HANA** (OData, max 500 records per call) and **Commerce Cloud**. Requirements:

- Records with an invalid currency or negative price are **rejected** but must be reported, not sent anywhere.
- A failure updating SAP for a record must **not** send that record to Commerce Cloud.
- If **more than 2%** of records fail, the job must stop — something systemic is wrong.
- At the end, a summary (total / successful / failed) goes to a Slack webhook and a CSV of failures is written to S3.
- The window is 2 hours.

Last week the job was configured with defaults and stopped after the **first** bad record. The caller flow also logged "job finished" right after the Batch Job scope although nothing was finished.

**Questions**
- Describe the batch phases and what the payload looks like in each.
- Design the batch steps with their accept policies / accept expressions.
- How do you configure the 2% threshold, and why did the job stop after one failure?
- Why was "job finished" logged too early?
- Which settings affect throughput (and memory) for 1.2M records?
`,
  answerTemplate: `## Phases

## Steps and accept policies

## Failure threshold

## "Job finished" too early

## Throughput settings
`,
  keyPoints: [
    'Phases: Load and Dispatch (splits input into records, persists them to queues), Process (records flow through steps in blocks), On Complete (payload is a BatchJobResult with counts).',
    'Default maxFailedRecords is 0, so the first failed record stops the job; -1 means unlimited. A 2% threshold must be calculated (≈24,000) and set as an absolute number.',
    'Accept policies: NO_FAILURES (default), ONLY_FAILURES, ALL; plus acceptExpression to filter records per step.',
    'SAP step with Batch Aggregator size ≤ 500; Commerce step with NO_FAILURES so SAP failures are skipped; a final ONLY_FAILURES step collects rejects.',
    'Batch Job execution is asynchronous: the flow continues immediately with a BatchJobInstance, so completion work belongs in On Complete.',
    'Throughput levers: blockSize, maxConcurrency, aggregator size/streaming, and keeping per-record payloads small.',
  ],
  solution: `
**Phases**
1. **Load and Dispatch** (implicit): the input collection is split into records and persisted to the batch queues; a batch job instance ID is created. Payload is the full input.
2. **Process**: records move through batch steps in blocks (\`blockSize\`, default 100), processed concurrently. Payload = one record (or an array inside a Batch Aggregator). Record variables (\`vars\` set in a step) stay with the record.
3. **On Complete**: payload is a \`BatchJobResult\` — \`totalRecords\`, \`successfulRecords\`, \`failedRecords\`, \`loadedRecords\`, per-step results, etc. Individual records are no longer available.

**Steps**
- **Validate** (accept \`NO_FAILURES\`): check currency against an allow-list and price ≥ 0; raise an error (e.g. \`raise error\` \`APP:INVALID_PRICE\`) to mark the record failed.
- **SAP** (\`NO_FAILURES\`): Batch Aggregator \`size="500"\` → build OData batch / bulk payload with DataWeave → SAP call. Decide how a failed call maps to its aggregated records (the docs do not spell out aggregator failure behaviour, so test it); handle partial responses by raising per-record failures in a follow-up if needed.
- **Commerce Cloud** (\`NO_FAILURES\`): only records that passed validation and SAP reach here. Aggregate as the API allows.
- **Collect failures** (\`ONLY_FAILURES\`): aggregator writes failed record + reason (from the step exception) to a staging file/S3 multipart or an Object Store chunk.

**Failure threshold:** \`maxFailedRecords\` default is **0** → the job stops after the first failure (that's what happened). It takes an absolute count, not a percentage: 2% of 1.2M ≈ \`24000\` (compute from the input size if it varies, e.g. via a property set per run). \`-1\` = never stop. When exceeded, remaining records are not processed and On Complete still runs.

**"Job finished" too early:** the Batch Job scope is **asynchronous** — the triggering flow gets a \`BatchJobInstance\` back immediately and continues. Put the Slack summary and S3 CSV upload in **On Complete**.

**Throughput:**
- \`blockSize\` (bigger blocks = fewer queue round-trips but more memory per block),
- \`maxConcurrency\` on the job,
- Aggregator \`size\` aligned to target limits (500 for SAP) or streaming aggregator for files,
- Map records to only the fields you need before the batch to keep queue persistence cheap,
- Make sure SAP and Commerce Cloud can absorb the parallel calls (rate limits) — more concurrency than the targets allow just creates failures.

Quick math: 1.2M records / 500 per SAP call = 2,400 calls; at ~2 s each that's 80 minutes sequential, so some concurrency is needed to fit 2 hours with headroom.
`,
}
