import { design, flow, handler, route, router, scope, source, step } from '../../flow/dsl.js'

const dir = '/plan/out/fcst'
const ctl = `${dir}/FCST_20261113.ctl`
const part1 = `${dir}/FCST_20261113_1.csv`
const part2 = `${dir}/FCST_20261113_2.csv`
const files = {
  [ctl]: 'FCST_20261113_1.csv|3\nFCST_20261113_2.csv|2\nTOTAL|5',
  [part1]: 'store,sku,week,qty\n0101,TENT-2P-OLV,2026W47,6\n0101,JKT-RAIN-M,2026W47,9\n0102,TENT-2P-OLV,2026W47,4',
  [part2]: 'store,sku,week,qty\n0102,BOTTLE-1L,2026W47,30\n0103,STOVE-GAS-1B,2026W47,2',
}
const short = 'store,sku,week,qty\n0102,BOTTLE-1L,2026W47,30'

export default {
  id: 'fl-263',
  category: 'flows',
  title: 'Forecast Parts From the Planning Platform: Start From the Control File, Check That Every Part Is There With the Row Count It Promises, and Release Nothing Until All Parts Agree',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'large-files', 'control-file', 'split-files', 'ftp', 'validation', 'planning'],
  estMinutes: 40,
  flowChecks: [
    { label: 'The flow starts when a control file appears in /plan/out/fcst', rule: { type: 'source', component: 'ftp-listener', where: { directory: '/plan/out/fcst', matcher: '.ctl' } } },
    { label: 'Each part named in the control file is read inside a For Each', rule: { type: 'inside', component: 'ftp-read', within: 'foreach' } },
    { label: 'A missing part is caught and recorded, not left to fail the flow', rule: { type: 'handler', component: 'on-error-continue', errorType: 'FTP:ILLEGAL_PATH', within: 'foreach' } },
    { label: 'Parts are moved to /plan/ready only on a route of a Choice', rule: { type: 'inside', component: 'ftp-move', within: 'choice', where: { targetPath: '/plan/ready' } } },
    { label: 'A bad set is reported by email', rule: { type: 'inside', component: 'email-send', within: 'choice' } },
  ],
  simulation: {
    systems: { files },
    tests: [
      {
        name: 'A complete set',
        about: 'Both parts are there with 3 and 2 rows, as the control file says. The parts and the control file move to /plan/ready for the loader.',
        trigger: { file: { path: ctl } },
        expect: {
          noError: true,
          files: { '/plan/ready/FCST_20261113_1.csv': { exists: true }, '/plan/ready/FCST_20261113_2.csv': { exists: true }, '/plan/ready/FCST_20261113.ctl': { exists: true } },
          noEmails: true,
        },
      },
      {
        name: 'A part is short',
        about: 'Part 2 has 1 row but the control file says 2: the platform\'s upload was cut off. Nothing moves to ready, the control file goes to /plan/error, and planning support is told which part.',
        trigger: { file: { path: ctl } },
        overrides: { systems: { files: { [part2]: short } } },
        expect: {
          files: { '/plan/ready/*': { count: 0 }, '/plan/error/FCST_20261113.ctl': { exists: true } },
          emails: [{ to: 'planning-support@brindle.example', has: 'FCST_20261113_2.csv', count: 1 }],
        },
      },
      {
        name: 'A part is missing',
        about: 'Part 2 never arrived. The read fails, the gap is recorded, and the set is reported the same way.',
        trigger: { file: { path: ctl } },
        overrides: { systems: { files: { [part2]: null } } },
        expect: { files: { '/plan/ready/*': { count: 0 }, '/plan/error/FCST_20261113.ctl': { exists: true } }, emails: [{ to: 'planning-support@brindle.example', has: 'missing', count: 1 }] },
      },
    ],
  },
  referenceFlow: design(
    flow('forecast-parts-check', source('ftp-listener', { directory: '/plan/out/fcst', matcher: 'FCST_*.ctl', postAction: 'none', timeBetweenSizeCheck: 10000 }), [
      step('set-variable', { variableName: 'ctlPath', value: '#[attributes.path]' }),
      step('set-variable', { variableName: 'parts', value: '#[((payload splitBy "\\n") filter (not ($ startsWith "TOTAL"))) map ((l) -> { name: (l splitBy "|")[0], rows: (l splitBy "|")[1] as Number })]' }),
      step('set-variable', { variableName: 'bad', value: '#[[]]' }),
      scope('foreach', { collection: '#[vars.parts]' }, [
        step('set-variable', { variableName: 'part', value: '#[payload]' }),
        scope(
          'try',
          {},
          [
            step('ftp-read', { path: '#["/plan/out/fcst/" ++ vars.part.name]', outputMimeType: 'application/csv' }),
            router('choice', {}, [
              route({ expression: '#[sizeOf(payload) != vars.part.rows]' }, [
                step('set-variable', { variableName: 'bad', value: '#[vars.bad ++ [vars.part.name ++ " has " ++ (sizeOf(payload) as String) ++ " rows, the control file says " ++ (vars.part.rows as String)]]' }),
              ]),
            ]),
          ],
          { errorHandlers: [handler('on-error-continue', { type: 'FTP:ILLEGAL_PATH' }, [step('set-variable', { variableName: 'bad', value: '#[vars.bad ++ [vars.part.name ++ " is missing"]]' })])] },
        ),
      ]),
      router(
        'choice',
        {},
        [
          route({ expression: '#[isEmpty(vars.bad)]' }, [
            scope('foreach', { collection: '#[vars.parts]' }, [step('ftp-move', { sourcePath: '#["/plan/out/fcst/" ++ payload.name]', targetPath: '/plan/ready', overwrite: 'true' })]),
            step('ftp-move', { sourcePath: '#[vars.ctlPath]', targetPath: '/plan/ready', overwrite: 'true' }),
          ]),
        ],
        {
          otherwise: [
            step('ftp-move', { sourcePath: '#[vars.ctlPath]', targetPath: '/plan/error', overwrite: 'true' }),
            step('email-send', {
              toAddresses: 'planning-support@brindle.example',
              subject: '#["Forecast set " ++ attributes.fileName ++ " held back"]',
              content: '#[vars.bad joinBy "\\n"]',
              contentType: 'text/plain',
            }),
          ],
        },
      ),
    ]),
  ),
  description: `
Brindle Outdoor, a fictional outdoor gear retailer, gets weekly store forecasts back from the planning platform. The platform writes the forecast in parts to its **FTP server**, folder \`/plan/out/fcst\`, and a control file last:

\`\`\`
FCST_20261113.ctl
FCST_20261113_1.csv|3
FCST_20261113_2.csv|2
TOTAL|5
\`\`\`

Each part is a CSV with a header line (\`store,sku,week,qty\`). A full forecast is about **12 parts of a million rows**. A separate loader picks up whatever is in \`/plan/ready\`.

Twice the platform's upload was cut off: part 9 arrived with half its rows, and the loader planned the stores with half a forecast.

**Requirements**
- Start when a control file appears.
- For each part it names: check the part exists and has exactly the rows the control file says.
- All good: move every part, then the control file, to \`/plan/ready\`.
- Anything wrong: move nothing to ready, move the control file to \`/plan/error\`, and email \`planning-support@brindle.example\` a line per problem.

**Facts**
- Control files match \`FCST_*.ctl\`. The parts are in the same folder.
- Reading a part that is not there raises \`FTP:ILLEGAL_PATH\`. Catch it so the other parts are still checked.
- Each email line names the part. A part that is not there gets the word \`missing\`.

**Design the flow.**
`,
  answerTemplate: `## Reading the control file

## Checking each part

## Releasing the set

## Holding it back
`,
  keyPoints: [
    'The control file names the set. Starting from it means the flow never works on a half written part.',
    'A count check catches a cut off upload, which a size check on the listener cannot see once the upload has stopped.',
    'Collect every problem in a list before deciding, so support gets the whole picture in one email.',
    'A missing part raises an error on read. On Error Continue in a Try records it and the loop goes on.',
    'Move the control file last into ready, so the loader also sees a whole set or nothing.',
  ],
  solution: `
1. **FTP On New or Updated File** on \`/plan/out/fcst\`, \`FCST_*.ctl\`.
2. **Set Variable** \`ctlPath\`, \`parts\` (the lines without TOTAL, as \`{ name, rows }\`), \`bad\` = \`[]\`.
3. **For Each** \`vars.parts\`: **Set Variable** \`part\`; **Try** { **FTP Read** the part as CSV; **Choice** count differs: add a line to \`bad\` } with **On Error Continue** (FTP:ILLEGAL_PATH): add "missing".
4. **Choice**:
   - \`isEmpty(vars.bad)\`: **For Each** part **FTP Move** to \`/plan/ready\`; **FTP Move** the control file.
   - otherwise: **FTP Move** the control file to \`/plan/error\`; **Email Send** the list.

**Counting a million rows.** Reading a part as CSV to count it streams through the file once. For very large parts, count the lines with a streaming read, and keep the parts on a fast network path to the worker.
`,
  followUps: [
    {
      q: 'The platform resends the missing part an hour later. How does the set get released?',
      a: 'Support moves the control file back from /plan/error to /plan/out/fcst, which starts the check again. Or ask the platform to write a new control file when it resends.',
    },
    {
      q: 'Row counts match but a part was garbled in transit. How would you catch that?',
      a: 'Ask the platform for a checksum per part in the control file, such as MD5 or SHA-256, and compare it after the download.',
    },
  ],
}
