import { design, flow, route, router, scope, source, step } from '../../flow/dsl.js'

const file = '/settlement/in/TXN_20261112_ALL.csv'
const csv = 'txn_id,card_suffix,merchant_id,amount,currency,txn_time\nT-90000001,4417,M-2201,18.40,GBP,2026-11-12T08:01:12\nT-90000002,0932,M-2201,7.10,GBP,2026-11-12T08:01:40\nT-90000003,5521,M-3409,112.00,GBP,2026-11-12T08:02:03'
const tables = { card_txn_staging: { columns: [{ name: 'txn_id', notNull: true }, 'card_suffix', 'merchant_id', 'amount', 'currency', 'txn_time'], rows: [] } }

export default {
  id: 'fl-194',
  category: 'flows',
  title: 'A Multi Gigabyte Settlement File From SFTP Into the Database: Stream It, Load It in a Batch Job With Bulk Inserts, and Never Hold It in Memory',
  level: 'ADVANCED',
  tags: ['myproject', 'sftp', 'large-files', 'streaming', 'batch', 'bulk-insert', 'payments'],
  estMinutes: 40,
  flowChecks: [
    { label: 'Settlement files are picked up from /settlement/in once their size is stable', rule: { type: 'source', component: 'sftp-listener', where: { directory: '/settlement/in', timeBetweenSizeCheck: { gte: 1 } } } },
    { label: 'The listener does not keep the whole file in memory', rule: { type: 'source', component: 'sftp-listener', where: { streamingStrategy: { oneOf: ['file-store', 'non-repeatable'] } } } },
    { label: 'A Batch Job loads the rows, with a Batch Aggregator bulk inserting into card_txn_staging', rule: { type: 'inside', component: 'db-bulk-insert', within: 'batch-aggregator', where: { sql: 'card_txn_staging' } } },
    { label: 'On Complete logs the loaded and failed counts', rule: { type: 'inside', component: 'logger', within: 'batch-job', inSlot: 'onComplete' } },
    { label: 'The file is moved to /settlement/done after the Batch Job has taken its records', rule: { type: 'before', first: 'batch-job', then: 'sftp-move', thenWhere: { targetPath: '/settlement/done' }, outside: true } },
  ],
  simulation: {
    systems: { files: { [file]: csv }, db: { tables } },
    tests: [
      {
        name: 'A settlement file',
        about: 'Every transaction is loaded through the batch job, the counts are logged, and the file moves to done.',
        trigger: { file: { path: file } },
        expect: {
          noError: true,
          db: { card_txn_staging: { count: 3, has: [{ txn_id: 'T-90000003', merchant_id: 'M-3409' }] } },
          files: { '/settlement/done/TXN_20261112_ALL.csv': { exists: true }, [file]: { exists: false } },
          logs: [{ level: 'INFO', has: 'failed=0' }],
        },
      },
      {
        name: 'The database refuses a group',
        about: 'The bulk insert for the group fails, so the job counts its records as failed, and On Complete reports that for the finance team.',
        trigger: { file: { path: file } },
        overrides: { systems: { db: { failWhen: [{ match: 'INSERT INTO card_txn_staging', fault: 'QUERY_EXECUTION' }] } } },
        expect: { logs: [{ level: 'INFO', has: 'failed=3' }] },
      },
    ],
  },
  referenceFlow: design(
    flow(
      'settlement-file-load',
      source('sftp-listener', { directory: '/settlement/in', matcher: 'TXN_*.csv', postAction: 'none', timeBetweenSizeCheck: 15000, streamingStrategy: 'repeatable-file-store-stream' }),
      [
        step('set-variable', { variableName: 'filePath', value: '#[attributes.path]' }),
        step('set-variable', { variableName: 'fileName', value: '#[attributes.fileName]' }),
        router(
          'batch-job',
          { jobName: 'settlement-load', blockSize: 500, maxFailedRecords: -1 },
          [
            route({ name: 'stage-transactions', acceptPolicy: 'NO_FAILURES' }, [
              scope('batch-aggregator', { size: 1000, streaming: 'false' }, [
                step('db-bulk-insert', {
                  database: 'Oracle',
                  sql: 'INSERT INTO card_txn_staging (txn_id, card_suffix, merchant_id, amount, currency, txn_time) VALUES (:txn_id, :card_suffix, :merchant_id, :amount, :currency, :txn_time)',
                }),
              ]),
            ]),
          ],
          {
            onComplete: [
              step('logger', { level: 'INFO', message: '#["Settlement load done: total=" ++ (payload.totalRecords as String) ++ " loaded=" ++ (payload.successfulRecords as String) ++ " failed=" ++ (payload.failedRecords as String)]' }),
            ],
          },
        ),
        step('sftp-move', { sourcePath: '#[vars.filePath]', targetPath: '/settlement/done' }),
      ],
    ),
  ),
  description: `
Harbourgate Payments, a fictional card acquirer's processing partner, receives a settlement file from each card scheme every morning on its **SFTP server**, folder \`/settlement/in\`. A busy day's \`TXN_<date>_ALL.csv\` is **several gigabytes**, tens of millions of rows:

\`\`\`
txn_id,card_suffix,merchant_id,amount,currency,txn_time
T-90000001,4417,M-2201,18.40,GBP,2026-11-12T08:01:12
\`\`\`

The rows go into the Oracle table \`card_txn_staging\` with the same columns. Reconciliation starts at 07:00.

The Mule app runs on workers with a few gigabytes of memory. The first version read the file into a variable, logged it, and mapped it in one Transform. It ran out of memory on the first busy day.

**Requirements**
- Pick up each \`TXN_*.csv\` once the upload has finished.
- Never hold the whole file in memory.
- Load the rows in a **Batch Job**, inserting groups of rows with a bulk insert.
- When the job is done, log the total, loaded and failed counts.
- Move the file to \`/settlement/done\` once the job has its records.

**Design the flow.** Say which settings and habits keep memory flat.
`,
  answerTemplate: `## Waiting for the upload

## Streaming the file

## The Batch Job

## Counts and moving the file

## What not to do
`,
  keyPoints: [
    'A repeatable file store stream keeps a small part in memory and the rest in a temporary file. A non repeatable stream is lighter still, but can be read only once.',
    'The Batch Job reads the stream once, splits it into records, and keeps them in its own queues on disk. The flow never builds the full list in memory.',
    'A Batch Aggregator hands a group of records to the bulk insert. Group size is a trade: bigger is faster per row and costs more memory per group.',
    'Do not log the payload, put it in a variable, or call sizeOf on it. Each of those reads the whole stream.',
    'Batch work runs on after the flow moves on. Report from On Complete, not from the flow that started the job.',
  ],
  solution: `
1. **SFTP On New or Updated File** on \`/settlement/in\`, \`TXN_*.csv\`, size check wait 15 seconds, streaming strategy repeatable file store.
2. **Set Variable** \`filePath\` and \`fileName\` (attributes only, never the payload).
3. **Batch Job** \`settlement-load\`, block size 500, max failed records -1:
   - Step \`stage-transactions\` with a **Batch Aggregator** of 1,000: **Database Bulk Insert** into \`card_txn_staging\`.
   - **On Complete**: **Logger** with \`totalRecords\`, \`successfulRecords\` and \`failedRecords\`.
4. **SFTP Move** to \`/settlement/done\`.

**When is it safe to move the file?** The Batch Job's load phase reads the input and stores the records before the job runs its steps. Confirm in your runtime version that the flow continues only after that phase; if in doubt, move the file in On Complete with the path kept in the job's variables.

**A failed group.** One bad row fails its whole group of 1,000 in a bulk insert. Use a row by row fallback for failed groups, as in a staging load, when every good row must land.
`,
  followUps: [
    {
      q: 'Why not split the file into smaller files first?',
      a: 'It adds a step and disk space for no gain. Streaming into a Batch Job already handles the file in small pieces.',
    },
    {
      q: 'The SFTP connection drops halfway through the read. What happens?',
      a: 'The read fails and the job does not get all its records. Make the load restartable: truncate the day\'s staging rows, or load into a fresh table, and leave the file in place so the next poll starts again.',
    },
  ],
}
