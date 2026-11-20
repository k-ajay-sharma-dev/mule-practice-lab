import { design, flow, handler, scope, source, step } from '../../flow/dsl.js'

const file = '/plan/po/PO_PLAN_20261113_R2210.json'
const plan = {
  run_id: 'R2210',
  orders: [
    { po_number: 'PO-77310', supplier_id: 'SUP-HAYDEN', dc: 'DC-EAST', lines: [{ line_no: 1, sku: '4410021', qty: 480 }, { line_no: 2, sku: '4410187', qty: 96 }] },
    { po_number: 'PO-77311', supplier_id: 'SUP-ORCHARD', dc: 'DC-WEST', lines: [{ line_no: 1, sku: '4410300', qty: 120 }, { line_no: 2, sku: '4410411', qty: null }] },
    { po_number: 'PO-77312', supplier_id: 'SUP-ORCHARD', dc: 'DC-WEST', lines: [{ line_no: 1, sku: '4410411', qty: 60 }] },
  ],
}
const tables = {
  po_header: { key: 'po_number', columns: ['po_number', 'supplier_id', 'dc', 'run_id'], rows: [] },
  po_line: { key: ['po_number', 'line_no'], columns: ['po_number', 'line_no', 'sku', { name: 'qty', notNull: true }], rows: [] },
  po_reject: { columns: ['po_number', 'run_id', 'reason'], rows: [] },
}

export default {
  id: 'fl-215',
  category: 'flows',
  title: 'Purchase Orders From the Planning Platform Into SQL Server: Header and Lines in One Transaction per Order, and a Reject Row When an Order Fails',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'sql-server', 'transaction', 'header-lines', 'reject-table', 'plans', 'sftp'],
  estMinutes: 35,
  flowChecks: [
    { label: 'Each order is handled on its own in a For Each', rule: { type: 'inside', component: 'db-insert', within: 'foreach', where: { sql: 'po_header' } } },
    {
      label: 'The header and its lines are written in one transaction',
      rule: {
        type: 'all',
        rules: [
          { type: 'inside', component: 'db-insert', within: 'try', withinWhere: { transactionalAction: 'ALWAYS_BEGIN' }, where: { sql: 'po_header' } },
          { type: 'inside', component: 'db-bulk-insert', within: 'try', withinWhere: { transactionalAction: 'ALWAYS_BEGIN' }, where: { sql: 'po_line' } },
        ],
      },
    },
    { label: 'A failed order is written to dbo.po_reject and the loop goes on', rule: { type: 'inside', component: 'db-insert', within: 'on-error-continue', where: { sql: 'po_reject' } } },
    { label: 'The plan file is archived after the loop', rule: { type: 'before', first: 'foreach', then: 'sftp-move', thenWhere: { targetPath: '/plan/po/archive' } } },
  ],
  simulation: {
    systems: { files: { [file]: JSON.stringify(plan) }, db: { tables } },
    tests: [
      {
        name: 'One order has a line with no quantity',
        about: 'PO-77310 and PO-77312 load with their lines. PO-77311 fails on its second line: its header and first line are rolled back, and a reject row says why.',
        trigger: { file: { path: file } },
        expect: {
          noError: true,
          db: {
            po_header: { count: 2, has: [{ po_number: 'PO-77310', run_id: 'R2210' }, { po_number: 'PO-77312' }], lacks: [{ po_number: 'PO-77311' }] },
            po_line: { count: 3, lacks: [{ po_number: 'PO-77311' }] },
            po_reject: { count: 1, has: [{ po_number: 'PO-77311', run_id: 'R2210' }] },
          },
          files: { '/plan/po/archive/PO_PLAN_20261113_R2210.json': { exists: true } },
        },
      },
    ],
  },
  referenceFlow: design(
    flow('po-plans-into-erp', source('sftp-listener', { directory: '/plan/po', matcher: 'PO_PLAN_*.json', postAction: 'none', timeBetweenSizeCheck: 10000 }), [
      step('set-variable', { variableName: 'filePath', value: '#[attributes.path]' }),
      step('set-variable', { variableName: 'runId', value: '#[payload.run_id]' }),
      scope('foreach', { collection: '#[payload.orders]' }, [
        step('set-variable', { variableName: 'order', value: '#[payload]' }),
        scope(
          'try',
          {},
          [
            scope('try', { transactionalAction: 'ALWAYS_BEGIN' }, [
              step('db-insert', {
                database: 'SQL Server',
                sql: 'INSERT INTO dbo.po_header (po_number, supplier_id, dc, run_id) VALUES (:poNumber, :supplierId, :dc, :runId)',
                inputParameters: '#[{ poNumber: vars.order.po_number, supplierId: vars.order.supplier_id, dc: vars.order.dc, runId: vars.runId }]',
                target: 'header',
              }),
              step('set-payload', { value: '#[vars.order.lines map ((l) -> { po_number: vars.order.po_number, line_no: l.line_no, sku: l.sku, qty: l.qty })]' }),
              step('db-bulk-insert', { database: 'SQL Server', sql: 'INSERT INTO dbo.po_line (po_number, line_no, sku, qty) VALUES (:po_number, :line_no, :sku, :qty)' }),
            ]),
          ],
          {
            errorHandlers: [
              handler('on-error-continue', { type: 'ANY' }, [
                step('db-insert', {
                  database: 'SQL Server',
                  sql: 'INSERT INTO dbo.po_reject (po_number, run_id, reason) VALUES (:poNumber, :runId, :reason)',
                  inputParameters: '#[{ poNumber: vars.order.po_number, runId: vars.runId, reason: error.description }]',
                }),
              ]),
            ],
          },
        ),
      ]),
      step('sftp-move', { sourcePath: '#[vars.filePath]', targetPath: '/plan/po/archive', overwrite: 'true' }),
    ]),
  ),
  description: `
Larkfield Grocers, a fictional grocery chain, creates purchase orders from the planning platform's plans. Each planning run writes one JSON file to Larkfield's **SFTP server**, folder \`/plan/po\`:

\`\`\`json
{ "run_id": "R2210",
  "orders": [ { "po_number": "PO-77310", "supplier_id": "SUP-HAYDEN", "dc": "DC-EAST",
                "lines": [ { "line_no": 1, "sku": "4410021", "qty": 480 } ] } ] }
\`\`\`

The ERP reads orders from SQL Server: \`dbo.po_header\` (\`po_number\` key, \`supplier_id\`, \`dc\`, \`run_id\`) and \`dbo.po_line\` (\`po_number\` + \`line_no\` key, \`sku\`, \`qty\` NOT NULL). It picks up any header it finds.

Last month a line failed halfway through an order. The header and the first lines stayed, and the ERP sent the supplier half an order.

**Requirements**
- An order's header and lines are written together or not at all.
- One bad order must not stop the others. Write \`po_number\`, \`run_id\` and the reason to \`dbo.po_reject\`.
- Archive the file to \`/plan/po/archive\` when every order has been handled.

**Facts**
- Use the SFTP listener on \`/plan/po\`, \`PO_PLAN_*.json\`, with a size check wait. Archive the file under its own name.
- Handle each order in a **For Each**. Insert the header, then bulk insert its lines, in a **Try** with the transactional action \`ALWAYS_BEGIN\`.
- A line with no \`qty\` fails on the NOT NULL column. The reject \`reason\` is the error description.
- A failed order must not fail the run: catch it with On Error Continue and write the reject row.

**Design the flow.** Explain where the transaction starts and ends, and why the error handler is where it is.
`,
  answerTemplate: `## One order at a time

## The transaction

## Where the handler goes

## Archiving
`,
  keyPoints: [
    'The transaction belongs to one order: header plus lines. A file wide transaction would let one bad order block all the others.',
    'The inner Try begins the transaction and has no On Error Continue, so an error rolls it back and carries on outward.',
    'The outer Try catches it with On Error Continue, writes the reject row and lets the loop go on. On Error Continue in the transactional Try itself would commit the half order.',
    'The reject insert runs outside the rolled back transaction, so it stays.',
    'Keep the order in a variable before Set Payload replaces it with the lines.',
  ],
  solution: `
1. **SFTP On New or Updated File** on \`/plan/po\`, \`PO_PLAN_*.json\`, size check wait 10 seconds.
2. **Set Variable** \`filePath\` and \`runId\`.
3. **For Each** \`payload.orders\`:
   - **Set Variable** \`order\`.
   - **Try** (no transaction), with **On Error Continue**: **Insert** into \`dbo.po_reject\` with \`error.description\`.
     - **Try** ALWAYS_BEGIN: **Insert** the header (target variable), **Set Payload** the lines with \`po_number\`, **Bulk Insert** into \`dbo.po_line\`.
4. **SFTP Move** to \`/plan/po/archive\`.

**Identity keys.** If the header key were an identity column, return it with \`OUTPUT INSERTED.po_id\` or from a procedure, and put it on each line before the bulk insert.
`,
  followUps: [
    {
      q: 'The ERP picks up a header the moment it is committed. Is that a problem here?',
      a: 'No, because the header and lines commit together. Without the transaction the ERP could read the header before the lines arrive.',
    },
    {
      q: 'Thousands of orders per file: one transaction each is slow. What then?',
      a: 'Bulk insert all headers and lines into staging tables, check them in SQL, and move complete orders into the real tables with one set based statement in a procedure. Orders with errors stay in staging with a reason.',
    },
  ],
}
