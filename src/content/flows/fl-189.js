import { design, flow, route, router, source, step } from '../../flow/dsl.js'

const file = '/audit/in/NA_HGF01_20261112.csv'
const csv = 'hotel,business_date,room,charge_code,amount\nHGF01,2026-11-12,214,ROOM,129.00\nHGF01,2026-11-12,214,BAR,18.50'

export default {
  id: 'fl-189',
  category: 'flows',
  title: 'Night Audit Files Over SFTP: Load the Rows, but Set Aside an Empty File Instead of Treating It as a Quiet Night',
  level: 'BEGINNER',
  tags: ['myproject', 'sftp', 'sftp-listener', 'zero-byte', 'bulk-insert', 'hospitality'],
  estMinutes: 15,
  flowChecks: [
    { label: 'Audit files are picked up from /audit/in', rule: { type: 'source', component: 'sftp-listener', where: { directory: '/audit/in' } } },
    { label: 'The file size is tested before anything is loaded', rule: { type: 'routes', component: 'choice', routeWhere: { expression: 'size' } } },
    { label: 'An empty file is moved to /audit/empty', rule: { type: 'inside', component: 'sftp-move', within: 'choice', where: { targetPath: '/audit/empty' } } },
    { label: 'Rows are bulk inserted into night_audit, then the file moves to /audit/done', rule: { type: 'before', first: 'db-bulk-insert', firstWhere: { sql: 'night_audit' }, then: 'sftp-move', thenWhere: { targetPath: '/audit/done' } } },
  ],
  simulation: {
    systems: { files: { [file]: csv }, db: { tables: { night_audit: { rows: [] } } } },
    tests: [
      {
        name: 'A normal night',
        about: 'Both charges are loaded and the file moves to done.',
        trigger: { file: { path: file } },
        expect: { noError: true, db: { night_audit: { count: 2, has: [{ room: '214', charge_code: 'BAR' }] } }, files: { '/audit/done/NA_HGF01_20261112.csv': { exists: true } } },
      },
      {
        name: 'An empty file',
        about: 'The hotel system crashed during the audit and left a zero byte file. Nothing is loaded, a warning names the file, and it goes to the empty folder.',
        trigger: { file: { path: file } },
        overrides: { systems: { files: { [file]: '' } } },
        expect: { db: { night_audit: { count: 0 } }, files: { '/audit/empty/NA_HGF01_20261112.csv': { exists: true } }, logs: [{ level: 'WARN', has: 'NA_HGF01_20261112' }] },
      },
    ],
  },
  referenceFlow: design(
    flow('night-audit-load', source('sftp-listener', { directory: '/audit/in', matcher: 'NA_*.csv', postAction: 'none', timeBetweenSizeCheck: 5000 }), [
      step('set-variable', { variableName: 'filePath', value: '#[attributes.path]' }),
      router(
        'choice',
        {},
        [
          route({ expression: '#[attributes.size == 0]' }, [
            step('logger', { level: 'WARN', message: '#["Empty night audit file " ++ attributes.fileName]' }),
            step('sftp-move', { sourcePath: '#[vars.filePath]', targetPath: '/audit/empty' }),
          ]),
        ],
        {
          otherwise: [
            step('db-bulk-insert', { database: 'PostgreSQL', sql: 'INSERT INTO night_audit (hotel, business_date, room, charge_code, amount) VALUES (:hotel, :business_date, :room, :charge_code, :amount)' }),
            step('sftp-move', { sourcePath: '#[vars.filePath]', targetPath: '/audit/done' }),
          ],
        },
      ),
    ]),
  ),
  description: `
Greyfriars Hotels, a fictional hotel group, runs a night audit in each hotel's property system. At the end of it the system uploads a CSV of the day's charges to the group's **SFTP server**, folder \`/audit/in\`:

\`\`\`
hotel,business_date,room,charge_code,amount
HGF01,2026-11-12,214,ROOM,129.00
\`\`\`

Finance loads the files into the PostgreSQL table \`night_audit\` with the same columns.

When a property system crashes during the audit, it sometimes leaves an **empty file**. Last month one was loaded as "no charges", and the hotel's revenue for the night showed as zero for a week before anyone asked.

**Requirements**
- Pick up each \`NA_*.csv\` in \`/audit/in\`.
- An empty file must not be loaded. Log a warning with its name and move it to \`/audit/empty\`.
- Otherwise bulk insert the rows into \`night_audit\` and move the file to \`/audit/done\`.

**Facts**
- The SFTP listener gives the file's size in bytes in \`attributes.size\` and its name in \`attributes.fileName\`. Test the size in a **Choice**.
- The warning is a WARN log whose message contains the file name, such as \`NA_HGF01_20261112.csv\`.
- Keep the file names when moving. Move to \`/audit/done\` only after the insert.

**Design the flow.**
`,
  answerTemplate: `## Picking up the file

## Spotting an empty file

## Loading the rows

## Where each file ends up
`,
  keyPoints: [
    'A zero byte file is a signal that something broke, not a night with no sales. Treat it as an exception.',
    'The listener gives the file size in attributes.size, so the test costs nothing.',
    'Moving the empty file away stops it being picked up again and gives support one place to look.',
    'A bulk insert sends the rows in batches, which is far faster than one insert per row.',
    'Move to done only after the insert. A failed insert leaves the file in place for another try.',
  ],
  solution: `
1. **SFTP On New or Updated File** on \`/audit/in\`, \`NA_*.csv\`, size check wait 5 seconds.
2. **Set Variable** \`filePath\`.
3. **Choice**:
   - \`attributes.size == 0\`: WARN with the file name, **SFTP Move** to \`/audit/empty\`.
   - Otherwise: **Database Bulk Insert** into \`night_audit\`, **SFTP Move** to \`/audit/done\`.

**A header only file.** A file with the header and no rows is not zero bytes. If that can happen too, test \`isEmpty(payload)\` as well.

**Alerting.** A file in \`/audit/empty\` needs a person. Send the WARN to the alerting tool, or list the folder each morning and email finance.
`,
  followUps: [
    {
      q: 'A hotel genuinely had no charges, for example while closed. How would you tell?',
      a: 'Agree that the property system always writes the header and a trailer with a count, even when the count is 0. Then an empty file is always a fault.',
    },
    {
      q: 'Where is the size check wait set, and what does it cost?',
      a: 'On the listener (or the config). The connector waits that long and compares the size twice before reading, so each file takes a little longer to start.',
    },
  ],
}
