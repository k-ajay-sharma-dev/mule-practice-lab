import { design, flow, route, router, source, step } from '../../flow/dsl.js'

const name = 'DDI_BUR7_20261113_01.txt'
const file = `/bureau/in/${name}`
const good = 'HDR|BUREAU7|20261113|01\nDTL|DD-551201|MANDATE-88120|42.50\nDTL|DD-551202|MANDATE-88121|18.00\nDTL|DD-551203|MANDATE-88140|99.99\nTRL|3'
const short = 'HDR|BUREAU7|20261113|01\nDTL|DD-551201|MANDATE-88120|42.50\nDTL|DD-551202|MANDATE-88121|18.00\nTRL|3'
const cut = 'HDR|BUREAU7|20261113|01\nDTL|DD-551201|MANDATE-88120|42.50\nDTL|DD-551202|MANDATE-88121|18.00'
const tables = { dd_instructions: { columns: ['instruction_id', 'mandate_ref', 'amount', 'file_name'], rows: [] } }

export default {
  id: 'fl-196',
  category: 'flows',
  title: 'Direct Debit Files With a Header, Detail Lines and a Trailer Over SFTP: Check the Trailer Count, Load Only a Whole File, and Write an ACK File Back',
  level: 'ADVANCED',
  tags: ['myproject', 'sftp', 'trailer', 'record-count', 'ack-file', 'validation', 'banking'],
  estMinutes: 40,
  flowChecks: [
    { label: 'Bureau files are picked up from /bureau/in', rule: { type: 'source', component: 'sftp-listener', where: { directory: '/bureau/in' } } },
    { label: 'The detail lines are counted against the trailer before any load', rule: { type: 'all', rules: [{ type: 'exists', component: 'transform', where: { script: { all: ['TRL', 'DTL'] } } }, { type: 'before', first: 'transform', then: 'choice' }] } },
    { label: 'A whole file is loaded into dd_instructions', rule: { type: 'inside', component: 'db-bulk-insert', within: 'choice', where: { sql: 'dd_instructions' } } },
    { label: 'An ACK file is written to /bureau/ack for both outcomes', rule: { type: 'all', rules: [{ type: 'inside', component: 'sftp-write', within: 'choice', where: { path: '/bureau/ack/' } }, { type: 'inside', component: 'sftp-write', within: 'choice', inSlot: 'otherwise', where: { path: '/bureau/ack/' } }] } },
    { label: 'A rejected file is moved to /bureau/error and nothing is loaded', rule: { type: 'inside', component: 'sftp-move', within: 'choice', inSlot: 'otherwise', where: { targetPath: '/bureau/error' } } },
    { label: 'An accepted file is moved to /bureau/done after the load', rule: { type: 'before', first: 'db-bulk-insert', then: 'sftp-move', thenWhere: { targetPath: '/bureau/done' } } },
  ],
  simulation: {
    systems: { files: { [file]: good }, db: { tables } },
    tests: [
      {
        name: 'A whole file',
        about: 'Three detail lines and a trailer that says 3. All three are loaded, the ACK says ACCEPTED, and the file moves to done.',
        trigger: { file: { path: file } },
        expect: {
          noError: true,
          db: { dd_instructions: { count: 3, has: [{ instruction_id: 'DD-551203', mandate_ref: 'MANDATE-88140', file_name: name }] } },
          files: { [`/bureau/ack/${name}.ack`]: { exists: true, has: 'ACCEPTED|3' }, [`/bureau/done/${name}`]: { exists: true } },
        },
      },
      {
        name: 'The trailer disagrees',
        about: 'The trailer says 3 but there are two detail lines. Nothing is loaded, the ACK says REJECTED with both numbers, and the file goes to the error folder.',
        trigger: { file: { path: file } },
        overrides: { systems: { files: { [file]: short } } },
        expect: { db: { dd_instructions: { count: 0 } }, files: { [`/bureau/ack/${name}.ack`]: { has: 'REJECTED' }, [`/bureau/error/${name}`]: { exists: true } } },
      },
      {
        name: 'The file has no trailer',
        about: 'The upload was cut off before the trailer. That is a reject too, never a load of what arrived.',
        trigger: { file: { path: file } },
        overrides: { systems: { files: { [file]: cut } } },
        expect: { db: { dd_instructions: { count: 0 } }, files: { [`/bureau/ack/${name}.ack`]: { has: 'REJECTED' }, [`/bureau/error/${name}`]: { exists: true } } },
      },
    ],
  },
  referenceFlow: design(
    flow('bureau-dd-files', source('sftp-listener', { directory: '/bureau/in', matcher: 'DDI_*.txt', postAction: 'none', timeBetweenSizeCheck: 5000 }), [
      step('set-variable', { variableName: 'filePath', value: '#[attributes.path]' }),
      step('set-variable', { variableName: 'fileName', value: '#[attributes.fileName]' }),
      step('transform', {
        target: 'variable',
        variableName: 'parsed',
        script:
          '%dw 2.0\noutput application/java\nvar lines = (payload as String) splitBy "\\n"\nvar details = lines filter ($ startsWith "DTL|")\nvar trailer = (lines filter ($ startsWith "TRL|"))[0]\nvar expected = if (trailer == null) -1 else ((trailer splitBy "|")[1] as Number)\n---\n{\n  expected: expected,\n  found: sizeOf(details),\n  ok: trailer != null and expected == sizeOf(details),\n  rows: details map ((d) -> do { var f = d splitBy "|" --- { instruction_id: f[1], mandate_ref: f[2], amount: f[3] as Number, file_name: vars.fileName } })\n}',
      }),
      router(
        'choice',
        {},
        [
          route({ expression: '#[vars.parsed.ok]' }, [
            step('set-payload', { value: '#[vars.parsed.rows]' }),
            step('db-bulk-insert', { database: 'Oracle', sql: 'INSERT INTO dd_instructions (instruction_id, mandate_ref, amount, file_name) VALUES (:instruction_id, :mandate_ref, :amount, :file_name)' }),
            step('set-payload', { value: '#["ACCEPTED|" ++ (vars.parsed.found as String)]' }),
            step('sftp-write', { path: '#["/bureau/ack/" ++ vars.fileName ++ ".ack"]', mode: 'OVERWRITE' }),
            step('sftp-move', { sourcePath: '#[vars.filePath]', targetPath: '/bureau/done' }),
          ]),
        ],
        {
          otherwise: [
            step('logger', { level: 'ERROR', message: '#[vars.fileName ++ " rejected: trailer " ++ (vars.parsed.expected as String) ++ ", detail lines " ++ (vars.parsed.found as String)]' }),
            step('set-payload', { value: '#["REJECTED|trailer=" ++ (vars.parsed.expected as String) ++ "|found=" ++ (vars.parsed.found as String)]' }),
            step('sftp-write', { path: '#["/bureau/ack/" ++ vars.fileName ++ ".ack"]', mode: 'OVERWRITE' }),
            step('sftp-move', { sourcePath: '#[vars.filePath]', targetPath: '/bureau/error' }),
          ],
        },
      ),
    ]),
  ),
  description: `
Moorcroft Building Society, a fictional lender, collects mortgage payments by direct debit. A payments bureau sends the day's instructions as a pipe separated text file to Moorcroft's **SFTP server**, folder \`/bureau/in\`:

\`\`\`
HDR|BUREAU7|20261113|01
DTL|DD-551201|MANDATE-88120|42.50
DTL|DD-551202|MANDATE-88121|18.00
TRL|2
\`\`\`

One header, one \`DTL\` line per instruction (\`instruction_id\`, \`mandate_ref\`, \`amount\`), and a trailer with the number of \`DTL\` lines. Instructions go into the Oracle table \`dd_instructions\` (\`instruction_id\`, \`mandate_ref\`, \`amount\`, \`file_name\`).

The bureau reads an ACK file from \`/bureau/ack\`, named after the file plus \`.ack\`: \`ACCEPTED|<count>\`, or \`REJECTED|<reason>\`. Folders \`/bureau/done\` and \`/bureau/error\` exist.

**Requirements**
- Pick up each \`DDI_*.txt\` once the upload has finished.
- Count the \`DTL\` lines and compare with the trailer. A missing trailer is a reject.
- A file that matches: load every instruction, write \`ACCEPTED|<count>\`, move the file to \`done\`.
- A file that does not: load nothing, write \`REJECTED\` with the trailer count and the lines found, move the file to \`error\`.

**What each system sends back**
- The SFTP listener gives the whole file as text in the payload. Split it into lines and parse the record types in DataWeave. The name is in \`attributes.fileName\` and the full path in \`attributes.path\`.

**Design the flow.**
`,
  answerTemplate: `## Reading the layout

## The trailer check

## Accepting a file

## Rejecting a file, and telling the bureau
`,
  keyPoints: [
    'A trailer count proves the file arrived whole. A file cut short in transfer has fewer lines, or no trailer at all.',
    'Check before loading. A partial load of a payments file is worse than none: some customers are charged and others are not.',
    'A missing trailer is a reject, not a pass. Never treat "no count" as "count matches".',
    'The ACK closes the loop: the bureau learns at once whether to resend, instead of finding out from a customer.',
    'Read the file as text and parse the record types in DataWeave. The detail lines become the rows; the header and trailer are checks.',
  ],
  solution: `
1. **SFTP On New or Updated File** on \`/bureau/in\`, \`DDI_*.txt\`, size check wait 5 seconds.
2. **Set Variable** \`filePath\` and \`fileName\`.
3. **Transform** into \`vars.parsed\`: split into lines, keep \`DTL\` lines, read the count from the \`TRL\` line, and build \`{ expected, found, ok, rows }\`.
4. **Choice**:
   - \`ok\`: **Set Payload** the rows, **Database Bulk Insert**, **Set Payload** \`ACCEPTED|<found>\`, **SFTP Write** \`/bureau/ack/<file>.ack\`, **SFTP Move** to \`/bureau/done\`.
   - Otherwise: ERROR log, **Set Payload** \`REJECTED|trailer=<n>|found=<m>\`, **SFTP Write** the ACK, **SFTP Move** to \`/bureau/error\`.

**Line endings.** Bureau files often use CRLF. Split on \`\\n\` and trim each line, or the last field carries a stray carriage return.

**A load that fails after the check.** Put the insert in a transaction, and on failure write a REJECTED ACK with "retry later" so the bureau knows the file did not land.
`,
  followUps: [
    {
      q: 'The bureau also puts a total amount in the trailer. What would you add?',
      a: 'Sum the DTL amounts as decimals and compare with the trailer total. A count catches missing lines, a sum catches a damaged amount.',
    },
    {
      q: 'Why write the ACK before moving the file?',
      a: 'If the move fails, the bureau already has the answer and the file can be moved by hand. If the ACK were last and failed, the bureau would wait for an answer that never comes.',
    },
  ],
}
