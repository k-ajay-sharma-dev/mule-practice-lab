import { design, flow, handler, scope, source, step } from '../../flow/dsl.js'

const growers = [
  { grower_id: 'GR-ASHMEAD', active: 1 },
  { grower_id: 'GR-BRYNFORD', active: 1 },
  { grower_id: 'GR-CALLOW', active: 0 },
]
const files = {
  '/growers/GR-ASHMEAD/out/STOCK_20261113.csv': 'variety,lot,qty\nTOMATO-SUNGOLD,L-4411,1200\nBASIL-GENOVESE,L-4415,800',
  '/growers/GR-BRYNFORD/out/STOCK_20261113.csv': 'variety,lot,qty\nPEPPER-PADRON,L-0921,350',
  '/growers/GR-CALLOW/out/STOCK_20261113.csv': 'variety,lot,qty\nLEEK-MUSSEL,L-1001,90',
}
const tables = { growers: { key: 'grower_id', rows: growers }, grower_stock: { rows: [] } }

export default {
  id: 'fl-191',
  category: 'flows',
  title: 'One SFTP Server, a Folder per Grower: Loop Over the Active Growers, Tag Each Row With the Grower From Its Folder, and Keep One Bad File From Stopping the Rest',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'sftp', 'per-partner-folders', 'scheduler', 'foreach', 'error-handling', 'agriculture'],
  estMinutes: 30,
  flowChecks: [
    { label: 'The active growers are read from the growers table', rule: { type: 'exists', component: 'db-select', where: { sql: { all: ['growers', 'active'] } } } },
    { label: 'Each grower\'s own folder is listed inside a loop over the growers', rule: { type: 'inside', component: 'sftp-list', within: 'foreach', where: { directoryPath: 'growers' } } },
    { label: 'Rows are tagged with the grower and bulk inserted into grower_stock', rule: { type: 'inside', component: 'db-bulk-insert', within: 'foreach', where: { sql: 'grower_stock' } } },
    { label: 'A loaded file is moved to the grower\'s archive folder', rule: { type: 'before', first: 'db-bulk-insert', then: 'sftp-move', thenWhere: { targetPath: 'archive' }, outside: true } },
    { label: 'A bad file goes to the grower\'s error folder and the loop goes on', rule: { type: 'inside', component: 'sftp-move', within: 'on-error-continue', where: { targetPath: 'error' } } },
  ],
  simulation: {
    systems: { files, db: { tables } },
    tests: [
      {
        name: 'Two active growers have sent stock',
        about: 'Each grower\'s rows are loaded with its own ID, and each file moves to that grower\'s archive. The inactive grower\'s folder is not read.',
        trigger: { schedule: {} },
        expect: {
          noError: true,
          db: { grower_stock: { count: 3, has: [{ grower_id: 'GR-BRYNFORD', variety: 'PEPPER-PADRON' }, { grower_id: 'GR-ASHMEAD', lot: 'L-4415' }], lacks: [{ grower_id: 'GR-CALLOW' }] } },
          files: { '/growers/GR-ASHMEAD/archive/STOCK_20261113.csv': { exists: true }, '/growers/GR-BRYNFORD/archive/STOCK_20261113.csv': { exists: true }, '/growers/GR-CALLOW/out/STOCK_20261113.csv': { exists: true } },
        },
      },
      {
        name: 'One grower sends a bad quantity',
        about: 'Ashmead writes "twelve hundred" in a quantity. Its file goes to its error folder. Brynford\'s file still loads.',
        trigger: { schedule: {} },
        overrides: { systems: { files: { '/growers/GR-ASHMEAD/out/STOCK_20261113.csv': 'variety,lot,qty\nTOMATO-SUNGOLD,L-4411,twelve hundred' } } },
        expect: {
          noError: true,
          db: { grower_stock: { count: 1, has: [{ grower_id: 'GR-BRYNFORD' }] } },
          files: { '/growers/GR-ASHMEAD/error/STOCK_20261113.csv': { exists: true }, '/growers/GR-BRYNFORD/archive/STOCK_20261113.csv': { exists: true } },
        },
      },
    ],
  },
  referenceFlow: design(
    flow('grower-stock-collect', source('scheduler', { strategy: 'cron', expression: '0 0 6-18 * * ?' }), [
      step('db-select', { database: 'PostgreSQL', sql: 'SELECT grower_id FROM growers WHERE active = 1 ORDER BY grower_id' }),
      scope('foreach', { collection: '#[payload]' }, [
        step('set-variable', { variableName: 'growerId', value: '#[payload.grower_id]' }),
        step('sftp-list', { directoryPath: '#["/growers/" ++ vars.growerId ++ "/out"]', matcher: '*.csv', recursive: 'false' }),
        scope('foreach', { collection: '#[payload]' }, [
          step('set-variable', { variableName: 'file', value: '#[payload.attributes]' }),
          scope(
            'try',
            {},
            [
              step('transform', {
                script: '%dw 2.0\noutput application/java\n---\nread(payload.payload as String, "application/csv") map ((r) -> { grower_id: vars.growerId, variety: r.variety, lot: r.lot, qty: r.qty as Number, file_name: vars.file.fileName })',
              }),
              step('db-bulk-insert', { database: 'PostgreSQL', sql: 'INSERT INTO grower_stock (grower_id, variety, lot, qty, file_name) VALUES (:grower_id, :variety, :lot, :qty, :file_name)' }),
              step('sftp-move', { sourcePath: '#[vars.file.path]', targetPath: '#["/growers/" ++ vars.growerId ++ "/archive"]' }),
            ],
            {
              errorHandlers: [
                handler('on-error-continue', { type: 'ANY' }, [
                  step('logger', { level: 'ERROR', message: '#["Stock file " ++ vars.file.path ++ " failed: " ++ error.description]' }),
                  step('sftp-move', { sourcePath: '#[vars.file.path]', targetPath: '#["/growers/" ++ vars.growerId ++ "/error"]' }),
                ]),
              ],
            },
          ),
        ]),
      ]),
    ]),
  ),
  description: `
Coldharbour Seeds, a fictional plant nursery group, buys young plants from growers. Each grower uploads a stock file to Coldharbour's **SFTP server**, into its own folder: \`/growers/<grower_id>/out\`. Each grower has its own login and can only see its folder. Folders \`archive\` and \`error\` sit next to \`out\` for each grower.

A file looks like:

\`\`\`
variety,lot,qty
TOMATO-SUNGOLD,L-4411,1200
\`\`\`

The grower is not in the file. It is known only from the folder. The PostgreSQL table \`growers\` lists the growers, with \`active\` set to 1 for those Coldharbour still buys from. Rows go to \`grower_stock\` (\`grower_id\`, \`variety\`, \`lot\`, \`qty\`, \`file_name\`).

New growers are added every month, and the team does not want a new flow or listener for each one.

**Requirements**
- Every hour from 06:00 to 18:00, look in the \`out\` folder of every active grower.
- Load each file's rows with the grower ID from its folder.
- Move a loaded file to that grower's \`archive\`, a file that fails to that grower's \`error\`.
- A bad file from one grower must not stop the others.

**Facts**
- Read the growers with \`active = 1\`. Take every \`*.csv\` in each grower's \`out\` folder.
- \`qty\` must be stored as a number. A file whose quantity is not a number is a bad file.
- \`file_name\` is the file's own name. Files keep their names when moved to \`/growers/<grower_id>/archive\` or \`/growers/<grower_id>/error\`.
- Wrap each file's load and move in a Try with On Error Continue. The run must not fail because of one file.

**What each system sends back**
- The Database Select gives \`[ { "grower_id": "GR-ASHMEAD" }, { "grower_id": "GR-BRYNFORD" } ]\`.
- SFTP List gives one item a file. Each item has \`payload\` (the content as text, so read it as CSV) and \`attributes\` with \`fileName\` and \`path\`.

**What failures look like**
- A quantity such as \`twelve hundred\` cannot become a number, so the Transform raises a DataWeave error (\`MULE:EXPRESSION\`). Catch it in the file's Try.

**Design the flow.**
`,
  answerTemplate: `## One flow for every grower

## Where the grower comes from

## Loading and moving

## One bad file
`,
  keyPoints: [
    'A table of partners drives the loop, so adding a grower is a row, not a deployment.',
    'The folder is the identity. Tag every row with the grower from the loop variable, never from something in the file a grower could change.',
    'Paths are built from the loop variable, so archive and error folders always belong to the right grower.',
    'A Try around each file\'s work keeps one bad file from ending the loop for everyone after it.',
    'One listener per grower would need a deployment for each new grower. A Scheduler with a list keeps the flow count at one.',
  ],
  solution: `
1. **Scheduler**, cron \`0 0 6-18 * * ?\`.
2. **Database Select** active growers.
3. **For Each** grower: **Set Variable** \`growerId\`, **SFTP List** \`/growers/<growerId>/out\`, \`*.csv\`.
4. **For Each** file: **Set Variable** \`file\`, then a **Try**:
   - **Transform** the rows with \`grower_id\` and \`file_name\`.
   - **Database Bulk Insert** into \`grower_stock\`.
   - **SFTP Move** to \`/growers/<growerId>/archive\`.
   - **On Error Continue** (ANY): ERROR log, **SFTP Move** to \`/growers/<growerId>/error\`.

**The service account.** Mule's SFTP user needs read and move rights in every grower's folders, while each grower sees only its own. Set that up on the server, and test it when a grower is added.

**A grower with a missing folder.** If a new grower's folder does not exist yet, the list fails. Put a Try around each grower's list too, so one grower's setup problem does not stop the others.
`,
  followUps: [
    {
      q: 'One grower sends 200 files at once. What changes?',
      a: 'The loop takes longer for everyone after it. Cap the files taken per grower per run, or move to a queue per file so growers do not wait on each other.',
    },
    {
      q: 'Why not let each grower log in as the same user?',
      a: 'Then growers could read each other\'s stock files, and a file\'s folder would no longer prove who sent it.',
    },
  ],
}
