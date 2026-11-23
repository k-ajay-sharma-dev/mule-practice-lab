import { design, flow, route, router, scope, source, step } from '../../flow/dsl.js'

const name = 'ASN_20261113_04.csv'
const file = `/outbound/asn/${name}`
const clean = 'asn,sku,qty\nASN-7781,PIPE-22MM-3M,120\nASN-7781,ELBOW-22MM,400\nASN-7782,VALVE-ISO-15,60'
const oneBad = 'asn,sku,qty\nASN-7781,PIPE-22MM-3M,120\nASN-7781,ELBOW-22MM,0\nASN-7782,VALVE-ISO-15,60'
const tables = {
  asn_line: { columns: ['file_name', 'asn', 'sku', 'qty'], rows: [] },
  asn_reject: { columns: ['file_name', 'asn', 'sku'], rows: [] },
}
const trigger = { file: { path: file } }
const ack = `/inbound/asn-ack/${name}.ack`

export default {
  id: 'fl-278',
  category: 'flows',
  title: 'Ship Notices From a Supplier\'s SFTP Server Through a Batch Job, With an ACK File Back: Stage the Good Lines, Write Rejects From an ONLY_FAILURES Step, and Build the ACK in On Complete From the Counts and the Reject Table',
  level: 'ADVANCED',
  tags: ['myproject', 'sftp', 'batch', 'ack-file', 'oracle', 'reject-table', 'on-complete'],
  estMinutes: 45,
  flowChecks: [
    { label: 'Ship notice files are picked up from /outbound/asn on the supplier\'s server', rule: { type: 'source', component: 'sftp-listener', where: { directory: '/outbound/asn' } } },
    { label: 'A Batch Aggregator bulk inserts the good lines into asn_line', rule: { type: 'inside', component: 'db-bulk-insert', within: 'batch-aggregator', where: { sql: 'asn_line' } } },
    { label: 'An ONLY_FAILURES step writes asn_reject', rule: { type: 'inside', component: 'db-insert', within: 'batch-job', routeWhere: { acceptPolicy: 'ONLY_FAILURES' }, where: { sql: 'asn_reject' } } },
    { label: 'On Complete reads the rejects back from asn_reject', rule: { type: 'inside', component: 'db-select', within: 'batch-job', inSlot: 'onComplete', where: { sql: 'asn_reject' } } },
    { label: 'On Complete writes the ACK file to /inbound/asn-ack', rule: { type: 'inside', component: 'sftp-write', within: 'batch-job', inSlot: 'onComplete', where: { path: 'asn-ack' } } },
  ],
  simulation: {
    systems: { db: { tables }, files: { [file]: clean } },
    tests: [
      {
        name: 'A clean file',
        about: 'All three lines are staged. The ACK says ACCEPTED with 3 and 0, and the file moves to done on the supplier\'s server.',
        trigger,
        expect: {
          noError: true,
          db: { asn_line: { count: 3, has: [{ file_name: name, asn: 'ASN-7782', qty: 60 }] }, asn_reject: { count: 0 } },
          files: { [ack]: { has: `${name}|ACCEPTED|3|0` }, [`/outbound/asn/done/${name}`]: { exists: true }, [file]: { exists: false } },
        },
      },
      {
        name: 'A line with a quantity of 0',
        about: 'ELBOW-22MM has quantity 0 and fails its check. The other two are staged, the reject table holds it, and the ACK says PARTIAL and names it.',
        trigger,
        overrides: { systems: { files: { [file]: oneBad } } },
        expect: {
          db: { asn_line: { count: 2 }, asn_reject: { count: 1, has: [{ file_name: name, asn: 'ASN-7781', sku: 'ELBOW-22MM' }] } },
          files: { [ack]: { has: `${name}|PARTIAL|2|1` }, [`/inbound/asn-ack/*.ack`]: { has: 'REJECT|ASN-7781|ELBOW-22MM' } },
        },
      },
      {
        name: 'Oracle refuses the group',
        about: 'The bulk insert fails, so every line of the group fails. All three go to the reject table and the ACK says REJECTED, so the supplier knows to resend.',
        trigger,
        overrides: { systems: { db: { failWhen: [{ match: 'INSERT INTO asn_line', fault: 'QUERY_EXECUTION' }] } } },
        expect: { db: { asn_reject: { count: 3 } }, files: { [ack]: { has: `${name}|REJECTED|0|3` } } },
      },
    ],
  },
  referenceFlow: design(
    flow('asn-in', source('sftp-listener', { directory: '/outbound/asn', matcher: 'ASN_*.csv', postAction: 'none', timeBetweenSizeCheck: 10000 }), [
      step('set-variable', { variableName: 'fileName', value: '#[attributes.fileName]' }),
      step('set-variable', { variableName: 'filePath', value: '#[attributes.path]' }),
      router(
        'batch-job',
        { jobName: 'asn-in', blockSize: 200, maxFailedRecords: -1 },
        [
          route({ name: 'stage', acceptPolicy: 'NO_FAILURES' }, [
            step('transform', { script: '%dw 2.0\noutput application/java\n---\n{ file_name: vars.fileName, asn: payload.asn, sku: payload.sku, qty: payload.qty as Number }' }),
            step('validation', { check: 'is-true', expression: '#[payload.qty > 0]', message: 'BAD_QTY' }),
            scope('batch-aggregator', { size: 500, streaming: 'false' }, [step('db-bulk-insert', { database: 'Oracle', sql: 'INSERT INTO asn_line (file_name, asn, sku, qty) VALUES (:file_name, :asn, :sku, :qty)' })]),
          ]),
          route({ name: 'reject', acceptPolicy: 'ONLY_FAILURES' }, [
            step('db-insert', {
              database: 'Oracle',
              sql: 'INSERT INTO asn_reject (file_name, asn, sku) VALUES (:fileName, :asn, :sku)',
              inputParameters: '#[{ fileName: vars.fileName, asn: payload.asn, sku: payload.sku }]',
            }),
          ]),
        ],
        {
          onComplete: [
            step('db-select', { database: 'Oracle', sql: 'SELECT asn, sku FROM asn_reject WHERE file_name = :fileName ORDER BY asn, sku', inputParameters: '#[{ fileName: vars.fileName }]', target: 'rejects' }),
            step('set-payload', {
              value:
                '#[([vars.fileName ++ "|" ++ (if (payload.failedRecords == 0) "ACCEPTED" else if (payload.successfulRecords == 0) "REJECTED" else "PARTIAL") ++ "|" ++ (payload.successfulRecords as String) ++ "|" ++ (payload.failedRecords as String)] ++ (vars.rejects map ("REJECT|" ++ $.asn ++ "|" ++ $.sku))) joinBy "\\n"]',
            }),
            step('sftp-write', { path: '#["/inbound/asn-ack/" ++ vars.fileName ++ ".ack"]', mode: 'OVERWRITE' }),
            step('sftp-move', { sourcePath: '#[vars.filePath]', targetPath: '/outbound/asn/done' }),
          ],
        },
      ),
    ]),
  ),
  description: `
Fenwick Supply, a fictional builders' merchant, receives advance ship notices from a plumbing supplier. The supplier puts \`ASN_<date>_<nn>.csv\` files in \`/outbound/asn\` on **its own SFTP server**:

\`\`\`
asn,sku,qty
ASN-7781,PIPE-22MM-3M,120
\`\`\`

A file can hold **150,000 lines** at season start. The lines go to Oracle \`asn_line\` (\`file_name\`, \`asn\`, \`sku\`, \`qty\`). A line whose quantity is not above 0 is refused and recorded in \`asn_reject\` (\`file_name\`, \`asn\`, \`sku\`).

The supplier wants an **ACK file** in \`/inbound/asn-ack\` on its server, named \`<file>.ack\`:

\`\`\`
ASN_20261113_04.csv|PARTIAL|2|1
REJECT|ASN-7781|ELBOW-22MM
\`\`\`

The first line is \`<file>|<status>|<loaded>|<rejected>\`, with status \`ACCEPTED\` (nothing rejected), \`REJECTED\` (nothing loaded) or \`PARTIAL\`. Then one \`REJECT\` line per refused line. After the ACK, move the file to \`/outbound/asn/done\` on the supplier's server.

**Requirements**
- Load through a Batch Job: check each line, bulk insert the good ones in groups.
- Every refused line, whether it failed its check or its group failed in Oracle, goes to \`asn_reject\`.
- Write the ACK only when every line is done, with the real counts and the refused lines.

**Facts**
- \`file_name\` is the file's own name, such as \`ASN_20261113_04.csv\`. Store \`qty\` as a number.
- Let the job go on after failed lines: set the Batch Job's max failed records to -1. Otherwise it stops at the first refused line.
- The reject lines of the ACK come from \`asn_reject\`, read back by \`file_name\`. Put each ACK line on its own line.
- Files keep their names when moved.

**What each system sends back**
- The SFTP listener gives the CSV with \`attributes.fileName\` and \`attributes.path\`. The Batch Job gets one record per line with string values: \`{ "asn": "ASN-7781", "sku": "ELBOW-22MM", "qty": "0" }\`.
- In On Complete the payload is the job result, with the counts in \`payload.successfulRecords\` and \`payload.failedRecords\`.
- The reject select gives rows such as \`[ { "asn": "ASN-7781", "sku": "ELBOW-22MM" } ]\`.

**What failures look like**
- A quantity of 0 fails the line's check, and the line goes to the ONLY_FAILURES step.
- Oracle refuses a group: the Bulk Insert raises \`DB:QUERY_EXECUTION\` and every line of that group fails, so all of them reach the ONLY_FAILURES step. With 3 lines and none loaded the ACK says \`REJECTED|0|3\`.

**Design the flow.**
`,
  answerTemplate: `## The Batch Job

## Rejects

## The ACK file
`,
  keyPoints: [
    'A step with ONLY_FAILURES gets every failed record, whether it failed its own check or its whole group failed in the aggregator.',
    'Shape the record before the check, so a failed record has the same fields in the reject step whichever way it failed.',
    'On Complete has only counts. The reject lines come from the table the ONLY_FAILURES step filled, read back by file name.',
    'Variables set before the Batch Job, such as the file name, are there in On Complete. Variables set inside a step stay with that record.',
    'Write the ACK first and move the file second. If the move fails, a rerun overwrites the same ACK.',
  ],
  solution: `
1. **SFTP On New or Updated File** on \`/outbound/asn\`, \`ASN_*.csv\`, size check 10 seconds.
2. **Set Variable** \`fileName\`, \`filePath\`.
3. **Batch Job** (max failed records -1):
   - Step \`stage\`: **Transform** (with \`file_name\`, \`qty\` as a number), **Validate** \`qty > 0\`, **Batch Aggregator** (500) with **Bulk Insert** into \`asn_line\`.
   - Step \`reject\` (ONLY_FAILURES): **Insert** into \`asn_reject\`.
   - **On Complete**: **Select** the rejects of this file (target \`rejects\`), **Set Payload** the ACK text, **SFTP Write** \`/inbound/asn-ack/<file>.ack\`, **SFTP Move** the file to \`/outbound/asn/done\`.

**A failed group.** When Oracle refuses a group, all its lines are rejected, good ones too. A row by row fallback inside the aggregator would reject only the bad line; whether that is worth it depends on how often groups fail.
`,
  followUps: [
    {
      q: 'The same file is picked up twice after a crash. What does the supplier see?',
      a: 'Lines are staged twice and rejects counted twice, so the ACK is wrong. Delete the file\'s rows from asn_line and asn_reject before the Batch Job, or keep a processed files table and skip a known file.',
    },
    {
      q: 'Why not keep the rejects in a variable and write them in On Complete?',
      a: 'A variable set in a step belongs to that record, so On Complete never sees it. And 150,000 lines with many rejects would not fit well in memory. The table holds them safely.',
    },
  ],
}
