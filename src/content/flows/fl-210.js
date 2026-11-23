import { design, flow, route, router, scope, source, step } from '../../flow/dsl.js'

const sale = (sale_id, store, sku, units, sent_file = null) => ({ sale_id, business_date: '2026-11-12', store, sku, units, sent_file })
const sales = [sale(9001, '0101', 'JKT-RAIN-M', 4), sale(9002, '0102', 'SOCK-WOOL-L', 9), sale(9003, '0103', 'BOTTLE-1L', 6), sale(8990, '0101', 'TENT-2P-OLV', 1, 'SALES_202611120200.csv')]
const sent = 'SALES_202611130730.csv'
const log = [
  { file_name: sent, row_count: 3, status: 'SENT', sent_at: '2026-11-13T07:30:00' },
  { file_name: 'SALES_202611120200.csv', row_count: 1, status: 'ACKED', sent_at: '2026-11-12T02:00:00' },
]
const tables = { daily_sales: { key: 'sale_id', rows: sales }, file_send_log: { key: 'file_name', rows: log } }
const ackPath = `/outbound/ack/ACK_${sent}`
const ack = (status, rows) => `file_name,status,rows_loaded\n${sent},${status},${rows}`

export default {
  id: 'fl-210',
  category: 'flows',
  title: 'Daily Sales to the Planning Platform Over FTP and Load Acknowledgements Back: a Send Log, Row Count Reconciliation, and an Alert When No ACK Arrives',
  level: 'EXPERT',
  tags: ['myproject', 'ftp', 'acknowledgement', 'reconciliation', 'send-log', 'outbound', 'sql-server', 'planning'],
  estMinutes: 60,
  flowChecks: [
    { label: 'Unsent sales are read and written under a .tmp name, then renamed', rule: { type: 'all', rules: [{ type: 'exists', component: 'db-select', where: { sql: { all: ['daily_sales', 'sent_file IS NULL'] } } }, { type: 'before', first: 'ftp-write', firstWhere: { path: '.tmp' }, then: 'ftp-rename' }] } },
    {
      label: 'The send log row and the sales marked sent are committed together, after the rename',
      rule: {
        type: 'all',
        rules: [
          { type: 'inside', component: 'db-insert', within: 'try', withinWhere: { transactionalAction: 'ALWAYS_BEGIN' }, where: { sql: 'file_send_log' } },
          { type: 'inside', component: 'db-bulk-update', within: 'try', withinWhere: { transactionalAction: 'ALWAYS_BEGIN' }, where: { sql: 'sent_file' } },
          { type: 'before', first: 'ftp-rename', then: 'try' },
        ],
      },
    },
    { label: 'ACK files are picked up from /outbound/ack', rule: { type: 'source', component: 'ftp-listener', where: { directory: '/outbound/ack' } } },
    { label: 'An ACK marks the file ACKED only when its row count matches the send log', rule: { type: 'inside', component: 'db-update', within: 'choice', routeWhere: { expression: 'row_count' }, where: { sql: 'ACKED' } } },
    { label: 'A count that does not match marks the file MISMATCH and emails support', rule: { type: 'all', rules: [{ type: 'inside', component: 'db-update', within: 'choice', where: { sql: 'MISMATCH' } }, { type: 'inside', component: 'email-send', within: 'choice', routeWhere: { expression: 'vars.sent' } }] } },
    { label: 'A second schedule finds files still SENT after two hours and emails support', rule: { type: 'all', rules: [{ type: 'flows', kind: 'flow', min: 3 }, { type: 'exists', component: 'db-select', where: { sql: { all: ['file_send_log', 'SENT', ':cutoff'] } } }] } },
  ],
  simulation: {
    systems: { files: { [ackPath]: ack('LOADED', 3) }, db: { tables } },
    tests: [
      {
        name: 'The nightly send',
        about: 'The three unsent sales go out in one file. The send log says SENT with 3 rows, and each sale now carries the file name.',
        trigger: { schedule: { flow: 'sales-send' } },
        expect: {
          noError: true,
          files: { '/inbound/sales/SALES_*.csv': { count: 1, has: 'SOCK-WOOL-L' }, '/inbound/sales/*.tmp': { count: 0 } },
          db: { file_send_log: { count: 3, has: [{ status: 'SENT', row_count: 3 }] }, daily_sales: { lacks: [{ sent_file: null }] } },
        },
      },
      {
        name: 'A good ACK',
        about: 'The platform loaded all 3 rows. The send log says ACKED and the ACK file is archived. Nobody is emailed.',
        trigger: { file: { path: ackPath } },
        expect: { db: { file_send_log: { has: [{ file_name: sent, status: 'ACKED' }] } }, files: { [`/outbound/ack/archive/ACK_${sent}`]: { exists: true } }, noEmails: true },
      },
      {
        name: 'An ACK with fewer rows',
        about: 'The platform says LOADED but only 2 rows. That is a lost row, so the log says MISMATCH and support is emailed.',
        trigger: { file: { path: ackPath } },
        overrides: { systems: { files: { [ackPath]: ack('LOADED', 2) } } },
        expect: { db: { file_send_log: { has: [{ file_name: sent, status: 'MISMATCH' }] } }, emails: [{ to: 'planning-support@brindle.example', has: sent, count: 1 }] },
      },
      {
        name: 'No ACK after two hours',
        about: 'The 07:30 file is still SENT at 10:00. Support is emailed about it. The file acknowledged yesterday is not mentioned.',
        trigger: { schedule: { flow: 'ack-overdue' } },
        expect: { emails: [{ to: 'planning-support@brindle.example', has: sent, count: 1 }] },
      },
    ],
  },
  referenceFlow: design(
    flow('sales-send', source('scheduler', { strategy: 'cron', expression: '0 0 2 * * ?' }), [
      step('db-select', { database: 'SQL Server', sql: 'SELECT sale_id, business_date, store, sku, units FROM dbo.daily_sales WHERE sent_file IS NULL ORDER BY sale_id' }),
      router('choice', {}, [route({ expression: '#[isEmpty(payload)]' }, [step('logger', { level: 'INFO', message: 'No unsent sales' })])], {
        otherwise: [
          step('set-variable', { variableName: 'rows', value: '#[payload]' }),
          step('set-variable', { variableName: 'fileName', value: '#["SALES_" ++ (now() as String {format: "yyyyMMddHHmm"}) ++ ".csv"]' }),
          step('transform', { script: '%dw 2.0\noutput application/csv\n---\npayload' }),
          step('ftp-write', { path: '#["/inbound/sales/" ++ vars.fileName ++ ".tmp"]', mode: 'OVERWRITE' }),
          step('ftp-rename', { path: '#["/inbound/sales/" ++ vars.fileName ++ ".tmp"]', to: '#[vars.fileName]' }),
          scope('try', { transactionalAction: 'ALWAYS_BEGIN' }, [
            step('db-insert', {
              database: 'SQL Server',
              sql: "INSERT INTO dbo.file_send_log (file_name, row_count, status, sent_at) VALUES (:fileName, :rowCount, 'SENT', :sentAt)",
              inputParameters: '#[{ fileName: vars.fileName, rowCount: sizeOf(vars.rows), sentAt: (now() >> "UTC") as String {format: "yyyy-MM-dd\'T\'HH:mm:ss"} }]',
              target: 'logged',
            }),
            step('set-payload', { value: '#[vars.rows map ((r) -> { sale_id: r.sale_id, sent_file: vars.fileName })]' }),
            step('db-bulk-update', { database: 'SQL Server', sql: 'UPDATE dbo.daily_sales SET sent_file = :sent_file WHERE sale_id = :sale_id' }),
          ]),
        ],
      }),
    ]),
    flow('ack-in', source('ftp-listener', { directory: '/outbound/ack', matcher: 'ACK_*.csv', postAction: 'none', timeBetweenSizeCheck: 5000 }), [
      step('set-variable', { variableName: 'ackPath', value: '#[attributes.path]' }),
      step('set-variable', { variableName: 'ack', value: '#[payload[0]]' }),
      step('db-select', { database: 'SQL Server', sql: 'SELECT file_name, row_count, status FROM dbo.file_send_log WHERE file_name = :fileName', inputParameters: '#[{ fileName: vars.ack.file_name }]', target: 'sent' }),
      router(
        'choice',
        {},
        [
          route({ expression: '#[(not isEmpty(vars.sent)) and vars.ack.status == "LOADED" and (vars.ack.rows_loaded as Number) == vars.sent[0].row_count]' }, [
            step('db-update', { database: 'SQL Server', sql: "UPDATE dbo.file_send_log SET status = 'ACKED' WHERE file_name = :fileName", inputParameters: '#[{ fileName: vars.ack.file_name }]' }),
          ]),
          route({ expression: '#[not isEmpty(vars.sent)]' }, [
            step('db-update', { database: 'SQL Server', sql: "UPDATE dbo.file_send_log SET status = 'MISMATCH' WHERE file_name = :fileName", inputParameters: '#[{ fileName: vars.ack.file_name }]' }),
            step('email-send', {
              toAddresses: 'planning-support@brindle.example',
              subject: 'Sales file not fully loaded by the planning platform',
              content: '#[vars.ack.file_name ++ ": sent " ++ (vars.sent[0].row_count as String) ++ " rows, platform says " ++ vars.ack.status ++ " " ++ vars.ack.rows_loaded]',
              contentType: 'text/plain',
            }),
          ]),
        ],
        { otherwise: [step('logger', { level: 'WARN', message: '#["ACK for unknown file " ++ vars.ack.file_name]' })] },
      ),
      step('ftp-move', { sourcePath: '#[vars.ackPath]', targetPath: '/outbound/ack/archive', overwrite: 'true' }),
    ]),
    flow('ack-overdue', source('scheduler', { strategy: 'fixed-frequency', frequency: 30, timeUnit: 'MINUTES' }), [
      step('set-variable', { variableName: 'cutoff', value: '#[((now() >> "UTC") as LocalDateTime - |PT2H|) as String {format: "yyyy-MM-dd\'T\'HH:mm:ss"}]' }),
      step('db-select', { database: 'SQL Server', sql: "SELECT file_name, sent_at FROM dbo.file_send_log WHERE status = 'SENT' AND sent_at < :cutoff", inputParameters: '#[{ cutoff: vars.cutoff }]' }),
      router('choice', {}, [
        route({ expression: '#[not isEmpty(payload)]' }, [
          step('email-send', {
            toAddresses: 'planning-support@brindle.example',
            subject: 'Sales files with no ACK after two hours',
            content: '#[(payload map ((f) -> f.file_name ++ " sent at " ++ f.sent_at)) joinBy "\\n"]',
            contentType: 'text/plain',
          }),
        ]),
      ]),
    ]),
  ),
  description: `
Brindle Outdoor, a fictional outdoor gear retailer, sends yesterday's store sales to the planning platform each night. The platform reads \`SALES_<yyyyMMddHHmm>.csv\` from its **FTP server**, folder \`/inbound/sales\`, and ignores \`.tmp\` files.

After loading a file the platform writes an acknowledgement to \`/outbound/ack\`, named \`ACK_<data file name>\`:

\`\`\`
file_name,status,rows_loaded
SALES_202611130730.csv,LOADED,3
\`\`\`

SQL Server tables:
- \`dbo.daily_sales\` (\`sale_id\`, \`business_date\`, \`store\`, \`sku\`, \`units\`, \`sent_file\`). \`sent_file\` is null until the row is sent.
- \`dbo.file_send_log\` (\`file_name\` key, \`row_count\`, \`status\`, \`sent_at\` as UTC text).

Twice last quarter the platform dropped rows during a load and still wrote \`LOADED\`. Once it wrote no ACK at all, and nobody noticed for two days. Support is \`planning-support@brindle.example\`.

**Requirements**
- Send unsent sales at 02:00 under a \`.tmp\` name and rename. Then, together, log the file as \`SENT\` with its row count and mark the sales with the file name.
- For each ACK: if the file is known and the platform loaded every row, mark it \`ACKED\`. If it is known but the count differs or the status is not \`LOADED\`, mark it \`MISMATCH\` and email support. Archive every ACK to \`/outbound/ack/archive\`.
- Every 30 minutes, email support about files still \`SENT\` two hours after sending.

**Facts**
- Name the flows \`sales-send\`, \`ack-in\` and \`ack-overdue\`.
- Write \`/inbound/sales/SALES_<yyyyMMddHHmm>.csv.tmp\`, then rename it. No \`.tmp\` file may be left.
- \`sent_at\` is UTC text such as \`2026-11-13T07:30:00\`. Put the log insert and the bulk update of \`sent_file\` in a **Try** with the transactional action \`ALWAYS_BEGIN\`.
- In \`ack-in\`, read the send log row into \`vars.sent\`. A **Choice** compares \`rows_loaded\` with \`vars.sent[0].row_count\`. An ACK for an unknown file is logged at WARN and archived.
- The MISMATCH email and the overdue email name the data file. In \`ack-overdue\`, pass now minus two hours, in UTC, as the parameter \`:cutoff\`.

**What each system sends back**
- The unsent sales select answers a list of rows: \`{ "sale_id": 9001, "business_date": "2026-11-12", "store": "0101", "sku": "JKT-RAIN-M", "units": 4 }\`.
- The FTP listener gives the ACK as a list of CSV rows, with every value as text: \`[ { "file_name": "SALES_202611130730.csv", "status": "LOADED", "rows_loaded": "3" } ]\`. Read \`payload[0]\` and turn \`rows_loaded\` into a number before comparing. The path is in \`attributes.path\`.
- The send log select answers \`[ { "file_name": "SALES_202611130730.csv", "row_count": 3, "status": "SENT" } ]\`, or \`[]\` for an unknown file. \`row_count\` is a number.
- The overdue select answers rows with \`file_name\` and \`sent_at\`, or \`[]\` when nothing is late.

**Design the flows.**
`,
  answerTemplate: `## Sending

## The send log

## Reading ACKs

## When no ACK comes
`,
  keyPoints: [
    'Log and mark only after the rename. A failed upload then leaves the sales unsent for the next run.',
    'The log insert and the sales update commit together, so the log never claims rows that were not marked, or the reverse.',
    'Trust the count, not the word LOADED. Comparing rows_loaded with row_count catches silent drops.',
    'An ACK that never comes is the hardest failure to see. A separate schedule looks for what did not happen.',
    'Keep times in UTC text in one format, so "older than two hours" is a plain comparison.',
  ],
  solution: `
**sales-send** (cron 02:00): **Select** unsent sales. **Choice**: none, log. Otherwise keep \`rows\` and \`fileName\`, **Transform** to CSV, **FTP Write** \`.tmp\`, **FTP Rename**, then **Try** ALWAYS_BEGIN: **Insert** into \`file_send_log\`, **Set Payload** \`{ sale_id, sent_file }\` rows, **Bulk Update** \`daily_sales\`.

**ack-in** (FTP listener on \`/outbound/ack\`): keep the path and the ACK row, **Select** the send log row into \`vars.sent\`. **Choice**:
- known, LOADED and counts equal: **Update** to \`ACKED\`.
- known: **Update** to \`MISMATCH\`, **Email Send**.
- otherwise: WARN log.
Then **FTP Move** the ACK to \`archive\`.

**ack-overdue** (every 30 minutes): **Set Variable** \`cutoff\` = now minus 2 hours, **Select** \`SENT\` rows older than it, **Choice** not empty: **Email Send** the list.

**Repeat alerts.** The overdue mail repeats every 30 minutes until someone acts. Add an \`alerted_at\` column if support wants one mail per file.
`,
  followUps: [
    {
      q: 'The upload succeeds but the transaction fails. What does the platform see, and what happens next?',
      a: 'The platform loads the file, but the sales stay unsent and no log row exists. The next night sends them again. Its ACK then names a file the log does not know, so the WARN shows it. The platform must accept a repeat, or the send must check the FTP folder first.',
    },
    {
      q: 'Why archive the ACK even when the file is unknown?',
      a: 'Leaving it would make the listener read it again on every poll. Archiving with a WARN keeps the evidence and keeps the folder clean.',
    },
  ],
}
