import { design, flow, route, router, scope, source, step } from '../../flow/dsl.js'

const name = 'PO_PLAN_20261113_R2210.csv'
const file = `/outbound/po/${name}`
const mixed = 'plan_line,supplier_id,sku,dc,qty,need_date\n1,SUP-HAYDEN,4410021,DC-EAST,480,2026-11-19\n2,SUP-HAYDEN,4410187,DC-EAST,0,2026-11-19\n3,SUP-NOBODY,4410300,DC-WEST,120,2026-11-20\n4,SUP-ORCHARD,4410411,DC-WEST,96,2026-11-20'
const allBad = 'plan_line,supplier_id,sku,dc,qty,need_date\n1,SUP-NOBODY,4410300,DC-WEST,120,2026-11-20\n2,SUP-HAYDEN,4410187,DC-EAST,0,2026-11-19'
const tables = {
  suppliers: { key: 'supplier_id', rows: [{ supplier_id: 'SUP-HAYDEN', active: 1 }, { supplier_id: 'SUP-ORCHARD', active: 1 }, { supplier_id: 'SUP-OLDMILL', active: 0 }] },
  po_staging: { rows: [] },
  po_files: { key: 'file_name', rows: [] },
}
const resp = `/inbound/po_response/${name.replace('.csv', '.resp.csv')}`

export default {
  id: 'fl-197',
  category: 'flows',
  title: 'Purchase Order Plans From the Planning Platform Over SFTP: Check Every Line, Stage the Good Ones in One Transaction, and Send a Line by Line Response File Back',
  level: 'EXPERT',
  tags: ['myproject', 'sftp', 'plans', 'validation', 'transaction', 'response-file', 'erp', 'planning'],
  estMinutes: 55,
  flowChecks: [
    { label: 'PO plan files are picked up from /outbound/po once their size is stable', rule: { type: 'source', component: 'sftp-listener', where: { directory: '/outbound/po', timeBetweenSizeCheck: { gte: 1 } } } },
    { label: 'Active suppliers are read to check each line', rule: { type: 'exists', component: 'db-select', where: { sql: { all: ['suppliers', 'active'] } } } },
    {
      label: 'Good lines and the file record are written in one transaction',
      rule: {
        type: 'all',
        rules: [
          { type: 'inside', component: 'db-bulk-insert', within: 'try', withinWhere: { transactionalAction: 'ALWAYS_BEGIN' }, where: { sql: 'po_staging' } },
          { type: 'inside', component: 'db-insert', within: 'try', withinWhere: { transactionalAction: 'ALWAYS_BEGIN' }, where: { sql: 'po_files' } },
        ],
      },
    },
    { label: 'An empty list of good lines is not bulk inserted', rule: { type: 'inside', component: 'db-bulk-insert', within: 'choice' } },
    { label: 'The response file goes to /inbound/po_response after the commit', rule: { type: 'before', first: 'try', then: 'sftp-write', thenWhere: { path: '/inbound/po_response/' } } },
    { label: 'The plan file is archived after the response is written', rule: { type: 'before', first: 'sftp-write', then: 'sftp-move', thenWhere: { targetPath: '/outbound/po/archive' } } },
  ],
  simulation: {
    systems: { files: { [file]: mixed }, db: { tables } },
    tests: [
      {
        name: 'Good and bad lines',
        about: 'Lines 1 and 4 are staged. Line 2 has a zero quantity and line 3 an unknown supplier. The response file gives each line its status and reason, and the file is archived.',
        trigger: { file: { path: file } },
        expect: {
          noError: true,
          db: {
            po_staging: { count: 2, has: [{ plan_line: '1', supplier_id: 'SUP-HAYDEN' }, { plan_line: '4', supplier_id: 'SUP-ORCHARD' }] },
            po_files: { count: 1, has: [{ file_name: name, accepted: 2, rejected: 2 }] },
          },
          files: { [resp]: { exists: true, has: 'UNKNOWN_SUPPLIER' }, [`/outbound/po/archive/${name}`]: { exists: true } },
        },
      },
      {
        name: 'Every line is bad',
        about: 'No line passes. Nothing is staged, the file is still recorded with 0 accepted, and the response tells the planners why.',
        trigger: { file: { path: file } },
        overrides: { systems: { files: { [file]: allBad } } },
        expect: { db: { po_staging: { count: 0 }, po_files: { has: [{ file_name: name, accepted: 0, rejected: 2 }] } }, files: { [resp]: { has: 'QTY_NOT_POSITIVE' } } },
      },
      {
        name: 'The ERP database is down',
        about: 'Nothing can be checked or staged. No response is sent, because it would promise lines that never landed, and the plan file stays for the next poll.',
        trigger: { file: { path: file } },
        overrides: { systems: { db: { fault: 'CONNECTIVITY' } } },
        expect: { files: { [resp]: { exists: false }, [file]: { exists: true } } },
      },
    ],
  },
  referenceFlow: design(
    flow('po-plans-from-planning', source('sftp-listener', { directory: '/outbound/po', matcher: 'PO_PLAN_*.csv', postAction: 'none', timeBetweenSizeCheck: 10000 }), [
      step('set-variable', { variableName: 'filePath', value: '#[attributes.path]' }),
      step('set-variable', { variableName: 'fileName', value: '#[attributes.fileName]' }),
      step('set-variable', { variableName: 'rows', value: '#[payload]' }),
      step('db-select', { database: 'Oracle', sql: 'SELECT supplier_id FROM suppliers WHERE active = 1', target: 'suppliers' }),
      step('transform', {
        target: 'variable',
        variableName: 'checked',
        script:
          '%dw 2.0\noutput application/java\nvar known = vars.suppliers map $.supplier_id\n---\nvars.rows map ((r) -> r ++ {\n  reason: if (not (known contains r.supplier_id)) "UNKNOWN_SUPPLIER" else if ((r.qty as Number default 0) <= 0) "QTY_NOT_POSITIVE" else ""\n})',
      }),
      step('set-variable', { variableName: 'good', value: '#[vars.checked filter ($.reason == "") map ($ - "reason" ++ { file_name: vars.fileName })]' }),
      scope('try', { transactionalAction: 'ALWAYS_BEGIN' }, [
        router('choice', {}, [
          route({ expression: '#[not isEmpty(vars.good)]' }, [
            step('set-payload', { value: '#[vars.good]' }),
            step('db-bulk-insert', { database: 'Oracle', sql: 'INSERT INTO po_staging (file_name, plan_line, supplier_id, sku, dc, qty, need_date) VALUES (:file_name, :plan_line, :supplier_id, :sku, :dc, :qty, :need_date)' }),
          ]),
        ]),
        step('db-insert', {
          database: 'Oracle',
          sql: 'INSERT INTO po_files (file_name, accepted, rejected) VALUES (:fileName, :accepted, :rejected)',
          inputParameters: '#[{ fileName: vars.fileName, accepted: sizeOf(vars.good), rejected: sizeOf(vars.checked) - sizeOf(vars.good) }]',
        }),
      ]),
      step('transform', {
        script: '%dw 2.0\noutput application/csv\n---\nvars.checked map ((r) -> { plan_line: r.plan_line, status: if (r.reason == "") "ACCEPTED" else "REJECTED", reason: r.reason })',
      }),
      step('sftp-write', { path: '#["/inbound/po_response/" ++ (vars.fileName replace ".csv" with ".resp.csv")]', mode: 'OVERWRITE' }),
      step('sftp-move', { sourcePath: '#[vars.filePath]', targetPath: '/outbound/po/archive' }),
    ]),
  ),
  description: `
Larkfield Grocers, a fictional grocery chain, lets the planning platform propose purchase orders. Each planning run puts a CSV on Larkfield's **SFTP server**, folder \`/outbound/po\`, named \`PO_PLAN_<date>_<run>.csv\`:

\`\`\`
plan_line,supplier_id,sku,dc,qty,need_date
1,SUP-HAYDEN,4410021,DC-EAST,480,2026-11-19
\`\`\`

The ERP raises real orders from the Oracle table \`po_staging\` (\`file_name\`, \`plan_line\`, \`supplier_id\`, \`sku\`, \`dc\`, \`qty\`, \`need_date\`). Every file is recorded in \`po_files\` (\`file_name\` primary key, \`accepted\`, \`rejected\`). Active suppliers are in \`suppliers\` (\`supplier_id\`, \`active\`).

The planners want to know what happened to each line. The platform reads a response file from \`/inbound/po_response\`, named like the plan file with \`.resp.csv\` instead of \`.csv\`, with \`plan_line\`, \`status\` (\`ACCEPTED\` or \`REJECTED\`) and \`reason\`.

**Requirements**
- Pick up each \`PO_PLAN_*.csv\` once the upload has finished.
- A line is rejected if its supplier is not active (\`UNKNOWN_SUPPLIER\`) or its quantity is not above zero (\`QTY_NOT_POSITIVE\`). The other lines go on.
- Stage the good lines and record the file, with its counts, in one transaction.
- Then write the response file and move the plan file to \`/outbound/po/archive\`.
- If the database cannot be reached, send no response and leave the plan file for the next poll.

**Facts**
- Read the active suppliers (\`active = 1\`) once per file. Test the supplier first: a line with both faults gets \`UNKNOWN_SUPPLIER\`. An accepted line has an empty \`reason\`.
- Stage the lines as they are in the file, with \`file_name\`. \`accepted\` and \`rejected\` are the line counts.
- Put the staging and the \`po_files\` insert in a **Try** with the transactional action \`ALWAYS_BEGIN\`. When no line is good, skip the bulk insert with a **Choice**, but still record the file.
- The plan file keeps its name in the archive. Do not catch a database error: the run fails.

**Design the flow.**
`,
  answerTemplate: `## Picking up the plan

## Checking each line

## Staging in one transaction

## The response file

## When the ERP database is down
`,
  keyPoints: [
    'Line level rules give line level answers. One bad supplier must not hold back 400 good lines.',
    'Load the reference data (active suppliers) once per file, not once per line.',
    'The good lines and the file record commit together. po_files then never claims a file whose lines are missing, and its primary key stops a second load of the same file.',
    'Write the response only after the commit. A response that says ACCEPTED must be true.',
    'An all bad file is still a processed file: record it and answer it. Only a failure to process leaves the file for another try.',
  ],
  solution: `
1. **SFTP On New or Updated File** on \`/outbound/po\`, \`PO_PLAN_*.csv\`, size check wait 10 seconds.
2. **Set Variable** \`filePath\`, \`fileName\` and \`rows\`.
3. **Database Select** active suppliers into \`vars.suppliers\`.
4. **Transform** into \`vars.checked\`: each line plus a \`reason\` (empty when good). **Set Variable** \`good\`: the lines with no reason, plus \`file_name\`.
5. **Try** ALWAYS_BEGIN:
   - **Choice** \`good\` not empty: **Set Payload** and **Bulk Insert** into \`po_staging\`.
   - **Insert** into \`po_files\` with the accepted and rejected counts.
6. **Transform** the response CSV, **SFTP Write** \`/inbound/po_response/<name>.resp.csv\`.
7. **SFTP Move** the plan file to \`/outbound/po/archive\`.

No handler: a database failure ends the flow, nothing is written to the platform, and the file stays where it is.

**A plan resent with the same name.** The po_files insert fails on its key and the transaction rolls back. Check po_files first, and answer a repeat with the stored counts, so the platform still gets a response.

**A file that will never load.** A broken file fails on every poll. Count the tries per file name, and after a few move it to an error folder and alert.
`,
  followUps: [
    {
      q: 'Why not reject the whole file when one line is bad?',
      a: 'Planners would have to fix and resend 400 lines to correct one. Line level answers let them act on what failed, while good orders go out on time.',
    },
    {
      q: 'The response must reach the platform before its next run at 14:00. How do you make sure?',
      a: 'Alert if a plan file is older than a set time without an archive entry, and check the response folder from the platform side. A late answer should be visible before it matters.',
    },
  ],
}
