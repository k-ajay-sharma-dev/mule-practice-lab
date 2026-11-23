import { design, flow, handler, scope, source, step } from '../../flow/dsl.js'

const order = (order_id, supplier_id, sku, qty, status = 'READY') => ({ order_id, supplier_id, sku, qty, status })
const orders = [order('SO-30011', 'SUP-ORCHARD', 'APL-GALA-1KG', 240), order('SO-30012', 'SUP-ORCHARD', 'PEAR-CONF-1KG', 120), order('SO-29990', 'SUP-ORCHARD', 'APL-GALA-1KG', 200, 'SENT')]
const tables = {
  supplier_orders: { key: 'order_id', rows: orders },
  job_log: { columns: ['job_id', 'job_name', 'status', 'detail'], key: 'job_id', rows: [] },
}

export default {
  id: 'fl-205',
  category: 'flows',
  title: 'Orders to a Supplier\'s FTP Server That Has a Nightly Maintenance Window: Retry for Long Enough, Then Park the File Locally and Log the Failure',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'ftp', 'maintenance-window', 'reconnection', 'until-successful', 'job-log', 'supplier'],
  estMinutes: 30,
  flowChecks: [
    { label: 'Orders still READY are read from dbo.supplier_orders', rule: { type: 'exists', component: 'db-select', where: { sql: { all: ['supplier_orders', 'READY'] } } } },
    { label: 'The FTP write is retried at least 3 times, a minute or more apart', rule: { type: 'inside', component: 'ftp-write', within: 'until-successful', withinWhere: { maxRetries: { gte: 3 }, millisBetweenRetries: { gte: 60000 } } } },
    { label: 'Orders are marked SENT and a SENT job log row is written after the upload', rule: { type: 'all', rules: [{ type: 'before', first: 'ftp-write', then: 'db-bulk-update', thenWhere: { sql: 'SENT' } }, { type: 'before', first: 'ftp-write', then: 'db-insert', thenWhere: { sql: 'job_log' } }] } },
    { label: 'When the retries run out, the file is parked in /data/outbox/pending', rule: { type: 'inside', component: 'file-write', within: 'on-error-continue', withinWhere: { type: 'RETRY_EXHAUSTED' }, where: { path: '/data/outbox/pending/' } } },
  ],
  simulation: {
    systems: { db: { tables } },
    tests: [
      {
        name: 'A normal night',
        about: 'The two READY orders go out in one file. They are marked SENT and the job log says SENT.',
        trigger: { schedule: {} },
        expect: {
          noError: true,
          files: { '/supplier/in/ORDERS_*.csv': { count: 1, has: 'PEAR-CONF-1KG' } },
          db: { supplier_orders: { has: [{ order_id: 'SO-30011', status: 'SENT' }, { order_id: 'SO-30012', status: 'SENT' }] }, job_log: { has: [{ job_name: 'SUPPLIER_ORDERS', status: 'SENT' }] } },
        },
      },
      {
        name: 'The server stays in maintenance',
        about: 'Every try fails. After the retries the file waits in the local pending folder, the orders stay READY, and the job log says FAILED for the morning check.',
        trigger: { schedule: {} },
        overrides: { systems: { files: { fault: true, faultOn: 'ftp' } } },
        expect: {
          noError: true,
          files: { '/data/outbox/pending/ORDERS_*.csv': { count: 1 } },
          db: { supplier_orders: { has: [{ order_id: 'SO-30011', status: 'READY' }] }, job_log: { has: [{ job_name: 'SUPPLIER_ORDERS', status: 'FAILED' }] } },
        },
      },
      {
        name: 'SQL Server is down',
        about: 'Nothing can be read, so there is nothing to send or park. The run fails and no pending file appears.',
        trigger: { schedule: {} },
        overrides: { systems: { db: { fault: 'CONNECTIVITY' } } },
        expect: { error: 'DB:CONNECTIVITY', files: { '/data/outbox/pending/*': { count: 0 } } },
      },
    ],
  },
  referenceFlow: design(
    flow(
      'orders-to-supplier-ftp',
      source('scheduler', { strategy: 'cron', expression: '0 50 0 * * ?' }),
      [
        step('db-select', { database: 'SQL Server', sql: "SELECT order_id, supplier_id, sku, qty FROM dbo.supplier_orders WHERE status = 'READY' ORDER BY order_id" }),
        step('set-variable', { variableName: 'orders', value: '#[payload]' }),
        step('set-variable', { variableName: 'fileName', value: '#["ORDERS_" ++ (now() as String {format: "yyyyMMddHHmm"}) ++ ".csv"]' }),
        step('transform', { script: '%dw 2.0\noutput application/csv\n---\npayload' }),
        scope('until-successful', { maxRetries: 4, millisBetweenRetries: 300000 }, [step('ftp-write', { path: '#["/supplier/in/" ++ vars.fileName]', mode: 'OVERWRITE' })]),
        step('set-payload', { value: '#[vars.orders]' }),
        step('db-bulk-update', { database: 'SQL Server', sql: "UPDATE dbo.supplier_orders SET status = 'SENT' WHERE order_id = :order_id" }),
        step('db-insert', {
          database: 'SQL Server',
          sql: "INSERT INTO dbo.job_log (job_name, status, detail) VALUES ('SUPPLIER_ORDERS', 'SENT', :detail)",
          inputParameters: '#[{ detail: vars.fileName ++ " with " ++ (sizeOf(vars.orders) as String) ++ " orders" }]',
        }),
      ],
      [
        handler('on-error-continue', { type: 'MULE:RETRY_EXHAUSTED' }, [
          step('file-write', { path: '#["/data/outbox/pending/" ++ vars.fileName]', mode: 'OVERWRITE' }),
          step('db-insert', {
            database: 'SQL Server',
            sql: "INSERT INTO dbo.job_log (job_name, status, detail) VALUES ('SUPPLIER_ORDERS', 'FAILED', :detail)",
            inputParameters: '#[{ detail: vars.fileName ++ " parked: " ++ error.description }]',
          }),
        ]),
      ],
    ),
  ),
  description: `
Larkfield Grocers, a fictional grocery chain, sends fresh produce orders to a fruit supplier each night. The supplier takes them only on its own **FTP server**, folder \`/supplier/in\`, as \`ORDERS_<yyyyMMddHHmm>.csv\`.

Orders wait in the SQL Server table \`dbo.supplier_orders\` (\`order_id\`, \`supplier_id\`, \`sku\`, \`qty\`, \`status\`) with status \`READY\`. Every run writes a row to \`dbo.job_log\` (\`job_id\`, \`job_name\`, \`status\`, \`detail\`), which the morning support check reads.

The supplier's server has a **maintenance window** from 00:45 to about 01:05, and it sometimes runs late. The send runs at 00:50 because the supplier's pickers start at 02:00. Last week the job failed once in the window, and nobody knew until the fruit did not arrive.

**Requirements**
- Send every READY order in one file.
- Keep trying the upload for about 20 minutes.
- On success, mark those orders \`SENT\` and log \`SENT\`.
- If it still fails, keep the file in \`/data/outbox/pending\` on the Mule host, leave the orders READY, and log \`FAILED\`.

**Facts**
- Run at 00:50 each night. Write \`job_log\` rows with \`job_name\` \`SUPPLIER_ORDERS\` and \`status\` \`SENT\` or \`FAILED\`. \`detail\` is free text, such as the file name.
- Retry the FTP Write in an **Until Successful** at least 3 times, a minute or more apart. Together they must cover about 20 minutes.
- When the retries run out, Mule raises \`MULE:RETRY_EXHAUSTED\`. Catch only that, with On Error Continue, and park the file under the same name.
- A database failure is not caught. The run fails and nothing is parked.

**What each system sends back**
- The select of READY orders answers a list of rows: \`[ { "order_id": "SO-30011", "supplier_id": "SUP-ORCHARD", "sku": "APL-GALA-1KG", "qty": 240 } ]\`. Keep this list, because the payload becomes CSV text for the write.

**What failures look like**
- The FTP server is in maintenance: each FTP Write raises \`FTP:CONNECTIVITY\`. When the last retry fails, Until Successful raises \`MULE:RETRY_EXHAUSTED\` and the handler parks the file.
- SQL Server is down: the select raises \`DB:CONNECTIVITY\`. The run fails before any file exists.

**Design the flow.**
`,
  answerTemplate: `## Reading the orders

## Riding out the maintenance window

## Success

## When it never comes back
`,
  keyPoints: [
    'Until Successful retries the write only. 4 retries 5 minutes apart cover a window that runs 20 minutes late.',
    'Keep the rows in a variable before the Transform, so the bulk update marks exactly the orders that were in the file.',
    'Mark orders SENT only after the upload. A failure then leaves them READY for the next try.',
    'Handle MULE:RETRY_EXHAUSTED, not ANY. A database failure is a different problem and must not park an empty file.',
    'A job log row on both paths gives support one place to look in the morning.',
  ],
  solution: `
1. **Scheduler**, cron \`0 50 0 * * ?\`.
2. **Database Select** READY orders; **Set Variable** \`orders\` and \`fileName\`.
3. **Transform** to CSV.
4. **Until Successful** (4 retries, 300000 ms): **FTP Write** \`/supplier/in/<fileName>\`.
5. **Set Payload** \`vars.orders\`, **Bulk Update** status \`SENT\` by \`order_id\`.
6. **Database Insert** a \`SENT\` row into \`dbo.job_log\`.
7. **On Error Continue** (MULE:RETRY_EXHAUSTED): **File Write** to \`/data/outbox/pending/<fileName>\`, insert a \`FAILED\` job log row.

**Reconnection.** The FTP connection can also have a reconnection strategy. It helps when the connection drops, but a refused login during maintenance still needs the retry around the operation.

**Sending parked files.** A second scheduled flow can list \`/data/outbox/pending\`, upload each file and move it to \`sent\`. Support can also send it by hand.
`,
  followUps: [
    {
      q: 'Why not one long retry, every minute for an hour?',
      a: 'The supplier needs the file before 02:00. An hour of retries holds a thread and still ends too late. Fail in time for a person to act, and alert.',
    },
    {
      q: 'What if the write succeeded but the bulk update failed?',
      a: 'The orders stay READY and go again the next night. The supplier would see them twice, so give each order a stable ID the supplier can de-duplicate, or check job_log before the next send.',
    },
  ],
}
