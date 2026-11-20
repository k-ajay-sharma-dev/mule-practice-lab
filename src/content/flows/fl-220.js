import { design, flow, route, router, scope, source, step } from '../../flow/dsl.js'

const oh = (store, sku, on_hand) => ({ store, sku, on_hand })
const rows = [oh('0101', 'LAMP-OAK-S', 7), oh('0101', 'RUG-JUTE-L', 3), oh('0102', 'LAMP-OAK-S', 11), oh('0102', 'VASE-GLS-M', 0), oh('0103', 'RUG-JUTE-L', 5)]
const tables = { store_on_hand: { key: ['store', 'sku'], rows } }

export default {
  id: 'fl-220',
  category: 'flows',
  title: 'A Heavy Stock Snapshot From a SQL Server Read Replica to the Planning Platform Over FTP: Read in Ordered Pages, Append Each Page, and Rename at the End',
  level: 'ADVANCED',
  tags: ['myproject', 'sql-server', 'read-replica', 'paging', 'large-files', 'ftp', 'outbound', 'planning'],
  estMinutes: 40,
  flowChecks: [
    { label: 'Rows are counted first to work out the pages', rule: { type: 'exists', component: 'db-select', where: { sql: { all: ['COUNT', 'store_on_hand'] } } } },
    { label: 'Each page is read in a For Each with a stable ORDER BY and OFFSET ... FETCH', rule: { type: 'inside', component: 'db-select', within: 'foreach', where: { sql: { all: ['ORDER BY store, sku', 'OFFSET', 'FETCH NEXT'] } } } },
    { label: 'Each page is appended to the .tmp file', rule: { type: 'inside', component: 'ftp-write', within: 'foreach', where: { mode: 'APPEND', path: '.tmp' } } },
    { label: 'The header is written once, before the pages', rule: { type: 'before', first: 'ftp-write', firstWhere: { mode: 'OVERWRITE' }, then: 'foreach' } },
    { label: 'The file is renamed after the last page', rule: { type: 'before', first: 'foreach', then: 'ftp-rename' } },
  ],
  simulation: {
    properties: { 'extract.pageSize': '2' },
    systems: { db: { tables } },
    tests: [
      {
        name: 'Five rows in pages of two',
        about: 'Three pages are read and appended in order under one header. The first and the last row are both in the final file, and no .tmp file is left.',
        trigger: { schedule: {} },
        expect: {
          noError: true,
          files: {
            '/inbound/onhand/ONHAND_*.csv': { count: 1, has: 'store,sku,on_hand\n0101,LAMP-OAK-S,7\n0101,RUG-JUTE-L,3\n0102,LAMP-OAK-S,11\n0102,VASE-GLS-M,0\n0103,RUG-JUTE-L,5\n' },
            '/inbound/onhand/*.tmp': { count: 0 },
          },
        },
      },
      {
        name: 'The FTP server refuses the writes',
        about: 'A write fails, so the flow stops before the rename. No file with the final name appears, and the platform never loads a snapshot with pages missing.',
        trigger: { schedule: {} },
        overrides: { systems: { files: { fault: true, faultOn: 'ftp' } } },
        expect: { error: 'FTP:CONNECTIVITY', files: { '/inbound/onhand/*.csv': { count: 0 } } },
      },
    ],
  },
  referenceFlow: design(
    flow('onhand-snapshot-to-planning', source('scheduler', { strategy: 'cron', expression: '0 0 3 * * ?' }), [
      step('db-select', { database: 'SQL Server', sql: 'SELECT COUNT(*) AS n FROM dbo.store_on_hand', target: 'total' }),
      step('set-variable', { variableName: 'pageSize', value: '#[p("extract.pageSize") as Number]' }),
      step('set-variable', { variableName: 'fileName', value: '#["ONHAND_" ++ (now() as String {format: "yyyyMMdd"}) ++ ".csv"]' }),
      router('choice', {}, [route({ expression: '#[vars.total[0].n == 0]' }, [step('logger', { level: 'WARN', message: 'Stock snapshot is empty, nothing sent' })])], {
        otherwise: [
          step('set-payload', { value: '#["store,sku,on_hand\\n"]' }),
          step('ftp-write', { path: '#["/inbound/onhand/" ++ vars.fileName ++ ".tmp"]', mode: 'OVERWRITE' }),
          scope('foreach', { collection: '#[(0 to (ceil(vars.total[0].n / vars.pageSize) - 1)) map ((i) -> i * vars.pageSize)]' }, [
            step('db-select', {
              database: 'SQL Server',
              sql: 'SELECT store, sku, on_hand FROM dbo.store_on_hand ORDER BY store, sku OFFSET :skip ROWS FETCH NEXT :take ROWS ONLY',
              inputParameters: '#[{ skip: payload, take: vars.pageSize }]',
            }),
            step('transform', { script: '%dw 2.0\noutput text/plain\n---\n((payload map ((r) -> r.store ++ "," ++ r.sku ++ "," ++ (r.on_hand as String))) joinBy "\\n") ++ "\\n"' }),
            step('ftp-write', { path: '#["/inbound/onhand/" ++ vars.fileName ++ ".tmp"]', mode: 'APPEND' }),
          ]),
          step('ftp-rename', { path: '#["/inbound/onhand/" ++ vars.fileName ++ ".tmp"]', to: '#[vars.fileName]' }),
        ],
      }),
    ]),
  ),
  description: `
Marrow & Pine Home, a fictional homewares retailer, sends a full stock snapshot to the planning platform every night: every store and SKU with its on hand quantity, about **30 million rows** from the SQL Server table \`dbo.store_on_hand\` (\`store\`, \`sku\`, \`on_hand\`, key \`store\` + \`sku\`).

The first version ran one big select against the primary database at 03:00. It ran out of memory in Mule, and while it ran, the stores' tills slowed down.

The database runs in an **Always On availability group** with a readable secondary. The DBA asks for the extract to read the secondary, through the listener with \`ApplicationIntent=ReadOnly\`.

The platform reads \`ONHAND_<yyyyMMdd>.csv\` from its **FTP server**, folder \`/inbound/onhand\`, with a header line \`store,sku,on_hand\`, and ignores \`.tmp\` files.

**Requirements**
- Read the table in pages. The page size comes from the property \`extract.pageSize\` (50,000 in production).
- Write the header once, then append each page, in a file named \`.tmp\` until the end.
- Rename it to its final name after the last page.
- If the table is empty, send nothing and log a warning.

**Facts**
- Run at 03:00 every night. Name the work file \`ONHAND_<yyyyMMdd>.csv.tmp\`.
- Order the pages by \`store, sku\`. Each line is \`store,sku,on_hand\` with no spaces and ends with a newline, the header too.
- A failed write must fail the run. Do not catch it.

**Design the flow.**
`,
  answerTemplate: `## Reading the replica

## Pages

## Building one file

## When it breaks halfway
`,
  keyPoints: [
    'A readable secondary takes the heavy read off the primary, so tills are not slowed. Connect through the listener with ApplicationIntent=ReadOnly; the secondary may lag the primary a little.',
    'OFFSET ... FETCH needs an ORDER BY on a unique key, or a row can appear on two pages or on none.',
    'Count first, then make a list of page starts for the For Each. Each page is a short query and a small payload.',
    'Append each page to the .tmp file, then rename once. The platform never sees a file with pages missing.',
    'OFFSET reads and skips the earlier rows, so late pages get slower. Keyset paging (WHERE (store, sku) > last seen) stays fast; it needs a loop instead of a For Each.',
  ],
  solution: `
1. **Scheduler**, cron \`0 0 3 * * ?\`. The database config points at the AG listener with \`ApplicationIntent=ReadOnly\` and \`MultiSubnetFailover=True\`.
2. **Database Select** \`COUNT(*)\` into \`vars.total\`. **Set Variable** \`pageSize\` and \`fileName\`.
3. **Choice** count is 0: WARN log. Otherwise:
   - **Set Payload** the header line, **FTP Write** \`<fileName>.tmp\` (OVERWRITE).
   - **For Each** page start: **Select** \`... ORDER BY store, sku OFFSET :skip ROWS FETCH NEXT :take ROWS ONLY\`, **Transform** to lines, **FTP Write** APPEND.
   - **FTP Rename** to \`<fileName>\`.

**A consistent snapshot.** Pages read at different moments can mix states. On a readable secondary, reads run under snapshot isolation; take one snapshot for the whole run, or copy the table to a dated snapshot table first.
`,
  followUps: [
    {
      q: 'Why not stream one big select instead of pages?',
      a: 'That also works: a select with a fetch size streams rows, and a streaming Transform writes them out. It holds one long query on the replica; pages hold many short ones and can restart from a page. Both keep memory flat.',
    },
    {
      q: 'The replica is 10 minutes behind tonight. Does it matter?',
      a: 'For a nightly snapshot taken at 03:00, a few minutes of lag rarely matters, but it should be known. Check the lag before the run and alert if it is above an agreed limit.',
    },
  ],
}
