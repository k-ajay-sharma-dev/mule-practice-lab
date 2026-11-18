export default {
  id: 'dw-196',
  category: 'dataweave',
  title: 'Turn the Batch Job Result Into a Job Log Row With Fallback Rejects',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'batch', 'on-complete', 'job-log', 'rejects', 'json'],
  estMinutes: 20,
  description: `
Larkfield Grocers loads supplier items with a batch job. A batch aggregator does a bulk insert into a staging table. When a block fails, a row by row fallback loads the good rows and sends the bad ones to a reject table. The batch job still counts those bad rows as successful, because the aggregator handled the error.

In On Complete, \`payload\` holds the batch job result fields. \`vars.fallbackRejects\` holds the number of rows the fallback rejected, \`vars.runId\` the run and \`vars.tableName\` the staging table.

Build the job log row:

- \`RUN_ID\` and \`JOB_INSTANCE\` (the \`batchJobInstanceId\`)
- \`TOTAL\`: \`totalRecords\`
- \`LOADED\`: successful records minus fallback rejects
- \`REJECTED\`: failed records plus fallback rejects
- \`NOT_PROCESSED\`: total minus processed records, for a job that stopped early
- \`STATUS\`: \`EMPTY\` when the total is 0, \`FAILED\` when nothing loaded, \`SUCCESS\` when nothing was rejected or left, otherwise \`PARTIAL\`
- \`DURATION_SEC\`: elapsed time in seconds, rounded to 1 decimal
- \`ROWS_PER_SEC\`: loaded rows per second, rounded to a whole number, 0 when no time passed
- \`LOG_TEXT\`: \`Run RUN_ID TABLE: L loaded, R rejected, N not processed of T\`
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{
  "batchJobInstanceId": "c41f7a20-supplier-item",
  "totalRecords": 12000,
  "loadedRecords": 12000,
  "processedRecords": 12000,
  "successfulRecords": 11950,
  "failedRecords": 50,
  "elapsedTimeInMillis": 95400
}`,
    },
    {
      name: 'vars',
      mime: 'application/json',
      content: `{ "runId": 9105, "tableName": "STG_SUPPLIER_ITEM", "fallbackRejects": 7 }`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "RUN_ID": 9105,
  "JOB_INSTANCE": "c41f7a20-supplier-item",
  "TOTAL": 12000,
  "LOADED": 11943,
  "REJECTED": 57,
  "NOT_PROCESSED": 0,
  "STATUS": "PARTIAL",
  "DURATION_SEC": 95.4,
  "ROWS_PER_SEC": 125,
  "LOG_TEXT": "Run 9105 STG_SUPPLIER_ITEM: 11943 loaded, 57 rejected, 0 not processed of 12000"
}`,
  },
  starterCode: `%dw 2.0
output application/json
---
{
  RUN_ID: vars.runId,
  TOTAL: payload.totalRecords,
  LOADED: payload.successfulRecords
}
`,
  hints: [
    'Work out `loaded`, `rejected` and `left` in `var`s first. Every other field uses them.',
    'Check the status rules in order: empty, then failed, then success, then partial.',
    'Round to 1 decimal with `round(x * 10) / 10`.',
  ],
  solution: `%dw 2.0
output application/json

var total = payload.totalRecords
var loaded = payload.successfulRecords - vars.fallbackRejects
var rejected = payload.failedRecords + vars.fallbackRejects
var left = total - payload.processedRecords
var seconds = payload.elapsedTimeInMillis / 1000
---
{
  RUN_ID: vars.runId,
  JOB_INSTANCE: payload.batchJobInstanceId,
  TOTAL: total,
  LOADED: loaded,
  REJECTED: rejected,
  NOT_PROCESSED: left,
  STATUS:
    if (total == 0) "EMPTY"
    else if (loaded <= 0) "FAILED"
    else if (rejected == 0 and left == 0) "SUCCESS"
    else "PARTIAL",
  DURATION_SEC: round(seconds * 10) / 10,
  ROWS_PER_SEC: if (seconds > 0) round(loaded / seconds) else 0,
  LOG_TEXT: "Run $(vars.runId) $(vars.tableName): $(loaded) loaded, $(rejected) rejected, $(left) not processed of $(total)"
}`,
  explanation: `
**Batch counts are not the whole story.** The batch job counts records, not rows in the database. When the aggregator catches a block error and the fallback rejects rows, the job still sees those records as successful. Subtract the fallback rejects to get rows that are really in staging.

**Not processed is its own number.** When \`maxFailedRecords\` stops a job, some records never run. They are neither loaded nor rejected, and the run needs a rerun, not a reject report.

**One line for support.** The log text has the run, table and all counts. Support can match it to the job log row.
`,
  tests: [
    {
      name: 'Clean run',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '{ "batchJobInstanceId": "a1-barcode", "totalRecords": 4000, "loadedRecords": 4000, "processedRecords": 4000, "successfulRecords": 4000, "failedRecords": 0, "elapsedTimeInMillis": 20000 }',
        },
        { name: 'vars', mime: 'application/json', content: '{ "runId": 9106, "tableName": "STG_BARCODE", "fallbackRejects": 0 }' },
      ],
      expected:
        '{ "RUN_ID": 9106, "JOB_INSTANCE": "a1-barcode", "TOTAL": 4000, "LOADED": 4000, "REJECTED": 0, "NOT_PROCESSED": 0, "STATUS": "SUCCESS", "DURATION_SEC": 20, "ROWS_PER_SEC": 200, "LOG_TEXT": "Run 9106 STG_BARCODE: 4000 loaded, 0 rejected, 0 not processed of 4000" }',
    },
    {
      name: 'Empty file',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '{ "batchJobInstanceId": "a2-item", "totalRecords": 0, "loadedRecords": 0, "processedRecords": 0, "successfulRecords": 0, "failedRecords": 0, "elapsedTimeInMillis": 0 }',
        },
        { name: 'vars', mime: 'application/json', content: '{ "runId": 9107, "tableName": "STG_ITEM", "fallbackRejects": 0 }' },
      ],
      expected:
        '{ "RUN_ID": 9107, "JOB_INSTANCE": "a2-item", "TOTAL": 0, "LOADED": 0, "REJECTED": 0, "NOT_PROCESSED": 0, "STATUS": "EMPTY", "DURATION_SEC": 0, "ROWS_PER_SEC": 0, "LOG_TEXT": "Run 9107 STG_ITEM: 0 loaded, 0 rejected, 0 not processed of 0" }',
    },
    {
      name: 'Job stopped early',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '{ "batchJobInstanceId": "a3-item", "totalRecords": 5000, "loadedRecords": 5000, "processedRecords": 3000, "successfulRecords": 2900, "failedRecords": 100, "elapsedTimeInMillis": 12500 }',
        },
        { name: 'vars', mime: 'application/json', content: '{ "runId": 9108, "tableName": "STG_ITEM", "fallbackRejects": 0 }' },
      ],
      expected:
        '{ "RUN_ID": 9108, "JOB_INSTANCE": "a3-item", "TOTAL": 5000, "LOADED": 2900, "REJECTED": 100, "NOT_PROCESSED": 2000, "STATUS": "PARTIAL", "DURATION_SEC": 12.5, "ROWS_PER_SEC": 232, "LOG_TEXT": "Run 9108 STG_ITEM: 2900 loaded, 100 rejected, 2000 not processed of 5000" }',
    },
  ],
  followUps: [
    {
      q: 'How does On Complete get the fallback reject count?',
      a: 'Record variables do not reach On Complete. Count rejects in the reject table by run ID, or keep a counter in an object store keyed by the job instance.',
    },
    {
      q: 'Why store the job instance ID in the job log?',
      a: 'It links the log row to batch log lines and to the runtime, which helps when two runs overlap.',
    },
    {
      q: 'What would you alert on from this row?',
      a: 'A FAILED status, any NOT_PROCESSED count, or a reject rate above an agreed share of the total.',
    },
  ],
}
