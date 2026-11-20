import { design, flow, route, router, scope, source, step } from '../../flow/dsl.js'

const dir = '/plan/out/alloc'
const ctlName = 'ALLOC_20261113.ctl'
const ctl = `${dir}/${ctlName}`
const p1 = 'store,sku,qty\n0412,4410021,12\n0415,4410187,6'
const p2 = 'store,sku,qty\n0420,4410300,9'
const files = {
  [ctl]: 'ALLOC_20261113_1.csv|2|712cab8c25ad6c202bbb8320848b0ed6\nALLOC_20261113_2.csv|1|1687524973ec1bd996cf893858310f33',
  [`${dir}/ALLOC_20261113_1.csv`]: p1,
  [`${dir}/ALLOC_20261113_2.csv`]: p2,
}
const tables = { file_set_log: { key: 'set_name', columns: ['set_name', 'status', 'parts'], rows: [{ set_name: 'ALLOC_20261112.ctl', status: 'RELEASED', parts: 3 }] } }
const released = { file_set_log: { ...tables.file_set_log, rows: [{ set_name: ctlName, status: 'RELEASED', parts: 2 }] } }

export default {
  id: 'fl-266',
  category: 'flows',
  title: 'Allocation Parts With MD5 Checksums: Verify Every Part Against the Control File Before the Loader Sees It, Hold Back a Garbled Set, and Never Release the Same Set Twice',
  level: 'ADVANCED',
  tags: ['myproject', 'large-files', 'checksum', 'md5', 'control-file', 'split-files', 'ftp', 'sql-server', 'planning'],
  estMinutes: 45,
  flowChecks: [
    { label: 'The flow starts when a control file appears in /plan/out/alloc', rule: { type: 'source', component: 'ftp-listener', where: { directory: '/plan/out/alloc', matcher: '.ctl' } } },
    { label: 'The set is looked up in dbo.file_set_log before any part is read', rule: { type: 'before', first: 'db-select', firstWhere: { sql: 'file_set_log' }, then: 'ftp-read' } },
    { label: 'Each part is read as text inside a For Each and its MD5 worked out', rule: { type: 'all', rules: [{ type: 'inside', component: 'ftp-read', within: 'foreach', where: { outputMimeType: 'text/plain' } }, { type: 'inside', component: 'set-variable', within: 'foreach', where: { value: 'Crypto::MD5' } }] } },
    { label: 'A released set is recorded in dbo.file_set_log', rule: { type: 'inside', component: 'db-insert', within: 'choice', where: { sql: { all: ['file_set_log', 'RELEASED'] } } } },
    { label: 'A bad set goes to /plan/error and is emailed', rule: { type: 'all', rules: [{ type: 'inside', component: 'ftp-move', within: 'choice', where: { targetPath: '/plan/error' } }, { type: 'inside', component: 'email-send', within: 'choice' }] } },
  ],
  simulation: {
    systems: { files, db: { tables } },
    tests: [
      {
        name: 'A good set',
        about: 'Both parts match their row count and MD5. They move to /plan/ready with the control file last, and the set is recorded as RELEASED.',
        trigger: { file: { path: ctl } },
        expect: {
          noError: true,
          files: { '/plan/ready/ALLOC_20261113_1.csv': { exists: true }, '/plan/ready/ALLOC_20261113_2.csv': { exists: true }, [`/plan/ready/${ctlName}`]: { exists: true } },
          db: { file_set_log: { has: [{ set_name: ctlName, status: 'RELEASED', parts: 2 }] } },
          noEmails: true,
        },
      },
      {
        name: 'A garbled part',
        about: 'Part 2 says 8 where the platform wrote 9. The row count still matches, but the MD5 does not. Nothing is released, the control file goes to /plan/error and support is told which part.',
        trigger: { file: { path: ctl } },
        overrides: { systems: { files: { [`${dir}/ALLOC_20261113_2.csv`]: 'store,sku,qty\n0420,4410300,8' } } },
        expect: {
          files: { '/plan/ready/*': { count: 0 }, [`/plan/error/${ctlName}`]: { exists: true } },
          db: { file_set_log: { count: 1 } },
          emails: [{ to: 'planning-support@larkfield.example', has: 'ALLOC_20261113_2.csv', count: 1 }],
        },
      },
      {
        name: 'The same set again',
        about: 'The platform wrote the control file a second time. The set is already RELEASED, so the flow logs a WARN, moves the control file to /plan/duplicate and reads no part.',
        trigger: { file: { path: ctl } },
        overrides: { systems: { db: { tables: released } } },
        expect: { noError: true, files: { '/plan/ready/*': { count: 0 }, [`/plan/duplicate/${ctlName}`]: { exists: true } }, logs: [{ level: 'WARN', has: ctlName }], noEmails: true },
      },
    ],
  },
  referenceFlow: design(
    flow('allocation-parts-check', source('ftp-listener', { directory: '/plan/out/alloc', matcher: 'ALLOC_*.ctl', postAction: 'none', timeBetweenSizeCheck: 10000 }), [
      step('set-variable', { variableName: 'ctlPath', value: '#[attributes.path]' }),
      step('set-variable', { variableName: 'setName', value: '#[attributes.fileName]' }),
      step('set-variable', { variableName: 'parts', value: '#[(payload splitBy "\\n") map ((l) -> { name: (l splitBy "|")[0], rows: (l splitBy "|")[1] as Number, md5: (l splitBy "|")[2] })]' }),
      step('db-select', { database: 'SQL Server', sql: 'SELECT status FROM dbo.file_set_log WHERE set_name = :setName', inputParameters: '#[{ setName: vars.setName }]', target: 'known' }),
      router(
        'choice',
        {},
        [
          route({ expression: '#[not isEmpty(vars.known)]' }, [
            step('logger', { level: 'WARN', message: '#["Set " ++ vars.setName ++ " was released before, skipped"]' }),
            step('ftp-move', { sourcePath: '#[vars.ctlPath]', targetPath: '/plan/duplicate', overwrite: 'true' }),
          ]),
        ],
        {
          otherwise: [
            step('set-variable', { variableName: 'bad', value: '#[[]]' }),
            scope('foreach', { collection: '#[vars.parts]' }, [
              step('set-variable', { variableName: 'part', value: '#[payload]' }),
              step('ftp-read', { path: '#["/plan/out/alloc/" ++ vars.part.name]', outputMimeType: 'text/plain' }),
              step('set-variable', { variableName: 'md5', value: '#[dw::Crypto::MD5(payload as Binary)]' }),
              step('set-variable', { variableName: 'rows', value: '#[sizeOf((payload splitBy "\\n") filter (not isBlank($))) - 1]' }),
              router('choice', {}, [
                route({ expression: '#[vars.md5 != vars.part.md5 or vars.rows != vars.part.rows]' }, [
                  step('set-variable', { variableName: 'bad', value: '#[vars.bad ++ [vars.part.name ++ ": rows " ++ (vars.rows as String) ++ "/" ++ (vars.part.rows as String) ++ ", md5 " ++ vars.md5 ++ "/" ++ vars.part.md5]]' }),
                ]),
              ]),
            ]),
            router(
              'choice',
              {},
              [
                route({ expression: '#[isEmpty(vars.bad)]' }, [
                  scope('foreach', { collection: '#[vars.parts]' }, [step('ftp-move', { sourcePath: '#["/plan/out/alloc/" ++ payload.name]', targetPath: '/plan/ready', overwrite: 'true' })]),
                  step('ftp-move', { sourcePath: '#[vars.ctlPath]', targetPath: '/plan/ready', overwrite: 'true' }),
                  step('db-insert', { database: 'SQL Server', sql: "INSERT INTO dbo.file_set_log (set_name, status, parts) VALUES (:setName, 'RELEASED', :parts)", inputParameters: '#[{ setName: vars.setName, parts: sizeOf(vars.parts) }]' }),
                ]),
              ],
              {
                otherwise: [
                  step('ftp-move', { sourcePath: '#[vars.ctlPath]', targetPath: '/plan/error', overwrite: 'true' }),
                  step('email-send', {
                    toAddresses: 'planning-support@larkfield.example',
                    subject: '#["Allocation set " ++ vars.setName ++ " held back"]',
                    content: '#[vars.bad joinBy "\\n"]',
                    contentType: 'text/plain',
                  }),
                ],
              },
            ),
          ],
        },
      ),
    ]),
  ),
  description: `
Larkfield Grocers, a fictional grocery chain, gets store allocations back from the planning platform. The platform writes the parts and then a control file to its **FTP server**, folder \`/plan/out/alloc\`. Each control line is \`<part>|<rows>|<MD5 of the part file>\`:

\`\`\`
ALLOC_20261113_1.csv|2|712cab8c25ad6c202bbb8320848b0ed6
ALLOC_20261113_2.csv|1|1687524973ec1bd996cf893858310f33
\`\`\`

A part is a CSV with a header line, up to **1 million rows**. The warehouse loader picks up what is in \`/plan/ready\`.

Two incidents:
- A proxy between the sites rewrote some bytes of a part. The row count was right, the quantities were not, and stores got the wrong deliveries.
- The platform rewrote a control file after a restart, and the same allocation was released and shipped twice.

\`dbo.file_set_log\` (\`set_name\`, \`status\`, \`parts\`) in SQL Server records released sets.

**Requirements**
- Start when a control file appears. If its name is already in \`dbo.file_set_log\`, log a WARN, move it to \`/plan/duplicate\` and stop.
- For each part: read it as text, work out its MD5 and its row count, and compare both with the control line.
- All parts good: move them, then the control file, to \`/plan/ready\`, and insert the set as \`RELEASED\`.
- Any part bad: release nothing, move the control file to \`/plan/error\`, and email \`planning-support@larkfield.example\` a line per bad part.

**Facts**
- Control files match \`ALLOC_*.ctl\`. The parts are in the same folder.
- \`set_name\` is the control file's name, such as \`ALLOC_20261113.ctl\`, and \`parts\` is the number of parts. The duplicate WARN names it.
- Work out the MD5 with \`dw::Crypto::MD5(payload as Binary)\`. It returns lowercase hex, as in the control file.
- The row count leaves out the header line and blank lines.
- Each email line names the part.

**Design the flow.**
`,
  answerTemplate: `## A set seen before

## Checking each part

## Releasing the set

## Holding it back
`,
  keyPoints: [
    'A checksum catches changed bytes that a row count cannot: a 9 that became an 8 keeps the count right.',
    'MD5 is fine for spotting accidents in transit. If someone could change the file on purpose, use SHA-256 and a signed control file.',
    'Compute the checksum on the bytes exactly as written. Reading the part as text with the right encoding keeps them as they are; a CSV reader would not.',
    'The set log makes a release idempotent: a control file written twice is noticed and parked.',
    'Hashing a 1 GB part reads it once from start to end. Check that your version hashes a stream without loading it whole.',
  ],
  solution: `
1. **FTP On New or Updated File** on \`/plan/out/alloc\`, \`ALLOC_*.ctl\`.
2. **Set Variable** \`ctlPath\`, \`setName\`, \`parts\` (\`{ name, rows, md5 }\` per line).
3. **Database Select** \`dbo.file_set_log\` by \`setName\` (target \`known\`).
4. **Choice**:
   - known: **Logger** WARN, **FTP Move** to \`/plan/duplicate\`.
   - otherwise: **Set Variable** \`bad\` = \`[]\`; **For Each** part: **FTP Read** as \`text/plain\`, **Set Variable** \`md5\` = \`dw::Crypto::MD5(payload as Binary)\` and \`rows\`, **Choice** mismatch: add to \`bad\`. Then **Choice**:
     - no bad part: **For Each** **FTP Move** to ready, **FTP Move** the control file, **Database Insert** RELEASED.
     - otherwise: **FTP Move** the control file to \`/plan/error\`, **Email Send** the list.
`,
  followUps: [
    {
      q: 'Why not compute the checksum while the loader reads the file, and roll back if it does not match?',
      a: 'It is possible but costly: a 12 million row load undone at the end. Checking first costs one extra read and keeps the loader simple.',
    },
    {
      q: 'Two control files arrive at the same moment on two replicas. Can both be released?',
      a: 'Both can pass the select. Make set_name the primary key: the second insert fails, but by then its parts were moved. Insert the log row first as CHECKING and update it to RELEASED, so the key stops the second flow before it moves anything.',
    },
  ],
}
