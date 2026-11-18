import { design, flow, route, router, source, step } from '../../flow/dsl.js'

const dir = '/mnt/scm-share/onhand/in'
const data = `${dir}/ONHAND_20261113.csv`
const ctl = `${dir}/ONHAND_20261113.ctl`
const csv = 'store,sku,on_hand,as_of\n0412,4410021,36,2026-11-13T05:00\n0412,4410187,8,2026-11-13T05:00\n0415,4410021,51,2026-11-13T05:00'

export default {
  id: 'fl-181',
  category: 'flows',
  title: 'On Hand Stock to the Planning Platform: Start From the Control File on the Azure File Share, Count the Rows, and Send Only a Complete File',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'azure-file-share', 'smb', 'control-file', 'record-count', 'sftp', 'inventory', 'planning'],
  estMinutes: 30,
  flowChecks: [
    { label: 'The flow starts from .ctl control files in /mnt/scm-share/onhand/in', rule: { type: 'source', component: 'file-listener', where: { directory: dir, matcher: '.ctl' } } },
    { label: 'The data file named by the control file is read', rule: { type: 'exists', component: 'file-read', where: { outputMimeType: 'csv' } } },
    { label: 'The row count is compared with the control file before anything is sent', rule: { type: 'before', first: 'file-read', then: 'choice' } },
    { label: 'Only a complete file is written to the platform\'s /inbound/onhand folder', rule: { type: 'inside', component: 'sftp-write', within: 'choice', where: { path: '/inbound/onhand/' } } },
    { label: 'A short file and its control file go to the error folder', rule: { type: 'inside', component: 'file-move', within: 'choice', inSlot: 'otherwise', where: { targetPath: 'error' }, min: 2 } },
  ],
  simulation: {
    systems: { files: { [data]: csv, [ctl]: '3' } },
    tests: [
      {
        name: 'The counts match',
        about: 'The control file says 3 and the data file has 3 rows. The file is sent, and both files are archived.',
        trigger: { file: { path: ctl } },
        expect: {
          noError: true,
          files: {
            '/inbound/onhand/ONHAND_20261113.csv': { exists: true, has: '4410187' },
            '/mnt/scm-share/onhand/archive/ONHAND_20261113.csv': { exists: true },
            '/mnt/scm-share/onhand/archive/ONHAND_20261113.ctl': { exists: true },
          },
        },
      },
      {
        name: 'The data file is short',
        about: 'The control file says 4 but the file has 3 rows: the copy was cut short. Nothing is sent, and both files go to the error folder for the stock team.',
        trigger: { file: { path: ctl } },
        overrides: { systems: { files: { [ctl]: '4' } } },
        expect: {
          files: {
            '/inbound/onhand/*': { count: 0 },
            '/mnt/scm-share/onhand/error/ONHAND_20261113.csv': { exists: true },
            '/mnt/scm-share/onhand/error/ONHAND_20261113.ctl': { exists: true },
          },
          logs: [{ level: 'ERROR' }],
        },
      },
    ],
  },
  referenceFlow: design(
    flow(
      'onhand-to-planning',
      source('file-listener', { directory: dir, matcher: '*.ctl', postAction: 'none', timeBetweenSizeCheck: 0, watermarkMode: 'DISABLED' }),
      [
        step('set-variable', { variableName: 'ctlPath', value: '#[attributes.path]' }),
        step('set-variable', { variableName: 'expected', value: '#[trim(payload as String) as Number]' }),
        step('set-variable', { variableName: 'dataPath', value: '#[attributes.path replace /\\.ctl$/ with ".csv"]' }),
        step('set-variable', { variableName: 'dataName', value: '#[attributes.fileName replace /\\.ctl$/ with ".csv"]' }),
        step('file-read', { path: '#[vars.dataPath]', outputMimeType: 'application/csv' }),
        router(
          'choice',
          {},
          [
            route({ expression: '#[sizeOf(payload) == vars.expected]' }, [
              step('sftp-write', { path: '#["/inbound/onhand/" ++ vars.dataName]', mode: 'OVERWRITE' }),
              step('file-move', { sourcePath: '#[vars.dataPath]', targetPath: '/mnt/scm-share/onhand/archive' }),
              step('file-move', { sourcePath: '#[vars.ctlPath]', targetPath: '/mnt/scm-share/onhand/archive' }),
            ]),
          ],
          {
            otherwise: [
              step('logger', { level: 'ERROR', message: '#[vars.dataName ++ " has " ++ (sizeOf(payload) as String) ++ " rows, the control file says " ++ (vars.expected as String)]' }),
              step('file-move', { sourcePath: '#[vars.dataPath]', targetPath: '/mnt/scm-share/onhand/error' }),
              step('file-move', { sourcePath: '#[vars.ctlPath]', targetPath: '/mnt/scm-share/onhand/error' }),
            ],
          },
        ),
      ],
    ),
  ),
  description: `
Larkfield Grocers, a fictional grocery chain, sends on hand stock to the planning platform every morning. The stock system writes two files to an **Azure File Share**, mounted over SMB on the integration host at \`/mnt/scm-share\`:

- \`onhand/in/ONHAND_20261113.csv\`, one row a store and item:
\`\`\`
store,sku,on_hand,as_of
0412,4410021,36,2026-11-13T05:00
\`\`\`
- then \`onhand/in/ONHAND_20261113.ctl\`, which holds one number: how many data rows the CSV should have.

The planning platform takes the file from its SFTP server, folder \`/inbound/onhand\`, with the same name. A short file is worse than a late one: the platform would treat missing rows as zero stock and order too much.

**Requirements**
- Start from the control file, not the data file.
- Read the data file it names, count the rows and compare.
- If the counts match, send the CSV to \`/inbound/onhand\`, then move both files to \`/mnt/scm-share/onhand/archive\`.
- If they do not, send nothing, log an error, and move both files to \`/mnt/scm-share/onhand/error\`.

**Design the flow.**
`,
  answerTemplate: `## Why a control file

## Reading and counting

## A complete file

## A short file
`,
  keyPoints: [
    'The control file is written last, so it doubles as a "the data file is finished" marker.',
    'The count catches what a marker alone cannot: a copy that was cut short, or an export that crashed after writing part of the rows.',
    'Read the CSV as CSV so the payload is a list of rows. sizeOf then counts data rows, not lines, so the header is not counted.',
    'Archive both files together, and send both to error together. A control file left behind would trigger the flow again on every poll.',
    'Nothing is sent when the counts differ. The platform keeps yesterday\'s stock, which is far less harmful than a day of zeros.',
  ],
  solution: `
1. **File On New or Updated File** on \`/mnt/scm-share/onhand/in\`, pattern \`*.ctl\`, no post action.
2. **Set Variable** \`ctlPath\`, \`expected\` (the number in the file), \`dataPath\` and \`dataName\` (the same name with \`.csv\`).
3. **File Read** \`vars.dataPath\` as \`application/csv\`.
4. **Choice**:
   - \`sizeOf(payload) == vars.expected\`: **SFTP Write** to \`/inbound/onhand/<dataName>\`, then **File Move** both files to \`archive\`.
   - Otherwise: ERROR log, **File Move** both files to \`error\`.

**Writing the CSV back out.** The payload is now rows, so the SFTP Write renders it as CSV again. If the platform is strict about quoting or line endings, read the file a second time as text for the write, or keep the raw text in a variable.

**A missing data file.** The read raises \`FILE:ILLEGAL_PATH\`. Add a handler that moves the control file to \`error\`, the same as a short file.
`,
  followUps: [
    {
      q: 'The control file also carries a total of on_hand. Worth checking?',
      a: 'Yes. A count catches missing rows; a sum also catches a row whose numbers were damaged. Both are cheap to compare in DataWeave.',
    },
    {
      q: 'The stock team asks for the platform to get the file even when it is short, with a warning. What would you say?',
      a: 'Ask the planning team first. If the platform reads missing rows as zero stock, a short file causes wrong orders. A late but complete file is usually the safer choice.',
    },
  ],
}
