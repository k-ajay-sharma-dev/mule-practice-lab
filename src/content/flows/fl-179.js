import { design, flow, handler, route, router, scope, source, step } from '../../flow/dsl.js'

const dir = '/mnt/labshare/results/in'
const done = `${dir}/RUN_7741.csv`
const copying = `${dir}/RUN_7742.csv`
const empty = `${dir}/RUN_7743.csv`
const csv = (run) => `sample_id,test_code,value,unit\nS-${run}-01,GLU,5.4,mmol/L\nS-${run}-02,GLU,6.1,mmol/L`
const lims = (respond) => [{ method: 'POST', path: '/lims/v1/results', respond }]

export default {
  id: 'fl-179',
  category: 'flows',
  title: 'Polling Analyser Results on a Mounted Azure File Share: Skip Files Still Being Copied, Set Aside Empty Ones, and Post the Rest',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'azure-file-share', 'smb', 'polling', 'partial-files', 'zero-byte', 'healthcare'],
  estMinutes: 30,
  flowChecks: [
    { label: 'A Scheduler lists the results folder and handles the files one by one', rule: { type: 'before', first: 'file-list', firstWhere: { directoryPath: dir }, then: 'foreach' } },
    { label: 'Empty files are moved to the empty folder', rule: { type: 'inside', component: 'file-move', within: 'choice', where: { targetPath: 'empty' } } },
    { label: 'A file changed in the last two minutes is skipped by its timestamp', rule: { type: 'routes', component: 'choice', routeWhere: { expression: 'timestamp' } } },
    { label: 'A finished file is posted and then moved to processed', rule: { type: 'before', first: 'http-request', then: 'file-move', thenWhere: { targetPath: 'processed' }, outside: true } },
    { label: 'A file the LIMS rejects goes to the error folder, and the loop goes on', rule: { type: 'inside', component: 'file-move', within: 'on-error-continue', where: { targetPath: 'error' } } },
  ],
  simulation: {
    systems: {
      files: { [done]: csv(7741), [copying]: csv(7742), [empty]: '' },
      fileTimes: { [done]: '2026-11-13T09:41:00Z', [copying]: '2026-11-13T09:59:30Z', [empty]: '2026-11-13T09:30:00Z' },
      http: lims({ status: 201, body: { accepted: 2 } }),
    },
    tests: [
      {
        name: 'One finished, one copying, one empty',
        about: 'The finished file is posted and moved to processed. The file changed 30 seconds ago is left for the next poll. The empty file goes to the empty folder and is not posted.',
        trigger: { schedule: {} },
        expect: {
          noError: true,
          calls: [{ method: 'POST', path: '/lims/v1/results', count: 1, has: { runId: 'RUN_7741' } }],
          files: {
            '/mnt/labshare/results/processed/RUN_7741.csv': { exists: true },
            [copying]: { exists: true },
            '/mnt/labshare/results/empty/RUN_7743.csv': { exists: true },
          },
        },
      },
      {
        name: 'The LIMS rejects a file',
        about: 'The LIMS answers 400 for the finished file. It goes to the error folder, the run ends cleanly, and the empty file is still set aside.',
        trigger: { schedule: {} },
        overrides: { systems: { http: lims({ status: 400, body: { message: 'Unknown test code' } }) } },
        expect: {
          noError: true,
          files: { '/mnt/labshare/results/error/RUN_7741.csv': { exists: true }, '/mnt/labshare/results/processed/*': { count: 0 }, '/mnt/labshare/results/empty/RUN_7743.csv': { exists: true } },
        },
      },
    ],
  },
  referenceFlow: design(
    flow('lab-results-poll', source('scheduler', { strategy: 'fixed-frequency', frequency: 2, timeUnit: 'MINUTES' }), [
      step('file-list', { directoryPath: dir, matcher: '*.csv', recursive: 'false' }),
      scope('foreach', { collection: '#[payload]' }, [
        step('set-variable', { variableName: 'file', value: '#[payload.attributes]' }),
        router(
          'choice',
          {},
          [
            route({ expression: '#[vars.file.size == 0]' }, [
              step('logger', { level: 'WARN', message: '#["Empty results file " ++ vars.file.fileName]' }),
              step('file-move', { sourcePath: '#[vars.file.path]', targetPath: '/mnt/labshare/results/empty' }),
            ]),
            route({ expression: '#[(vars.file.timestamp as LocalDateTime) > ((now() >> "UTC") as LocalDateTime - |PT2M|)]' }, [
              step('logger', { level: 'DEBUG', message: '#[vars.file.fileName ++ " is still changing, next poll"]' }),
            ]),
          ],
          {
            otherwise: [
              scope(
                'try',
                {},
                [
                  step('transform', {
                    script: '%dw 2.0\noutput application/json\n---\n{ runId: vars.file.fileName replace ".csv" with "", results: read(payload.payload as String, "application/csv") }',
                  }),
                  step('http-request', { method: 'POST', path: '/lims/v1/results', responseTimeout: 30000 }),
                  step('file-move', { sourcePath: '#[vars.file.path]', targetPath: '/mnt/labshare/results/processed' }),
                ],
                {
                  errorHandlers: [
                    handler('on-error-continue', { type: 'ANY' }, [
                      step('logger', { level: 'ERROR', message: '#["Results file " ++ vars.file.fileName ++ " failed: " ++ error.description]' }),
                      step('file-move', { sourcePath: '#[vars.file.path]', targetPath: '/mnt/labshare/results/error' }),
                    ]),
                  ],
                },
              ),
            ],
          },
        ),
      ]),
    ]),
  ),
  description: `
Hollowbrook Labs, a fictional clinical lab, has analysers that save each run's results as a CSV on an **Azure File Share**. The share is mounted over SMB on a Linux integration worker at \`/mnt/labshare\`. New files land in \`/mnt/labshare/results/in\`:

\`\`\`
sample_id,test_code,value,unit
S-7741-01,GLU,5.4,mmol/L
\`\`\`

Mule posts each run to the lab system: \`POST /lims/v1/results\` with \`{ "runId": "RUN_7741", "results": [ ... ] }\`.

What the analysers do:
- They write the file under its final name, and a long run takes up to a minute to copy. Nobody can change that.
- When a run is aborted, they leave an empty file.

The folders \`processed\`, \`error\` and \`empty\` exist next to \`in\`.

**Requirements**
- Every two minutes, look at \`in\` and handle each file on its own.
- An empty file goes to \`empty\` and is not posted.
- Skip any file that changed in the last two minutes. The next poll will see it.
- Post each finished file, then move it to \`processed\`.
- If the LIMS rejects a file, move it to \`error\` and carry on with the others.

**Design the flow.**
`,
  answerTemplate: `## Listing and looping

## Empty files

## Files still being copied

## Posting, and when the LIMS says no
`,
  keyPoints: [
    'File List returns each file with its attributes: name, path, size and last modified time. The loop decides what to do with each one.',
    'When the writer uses the final name from the start, the last modified time is the only signal. A file that has not changed for a while is very likely complete.',
    'Compare the time in one zone. Check what zone the timestamp comes in on your host before you trust a cutoff of two minutes.',
    'A zero byte file is a fact to report, not a run to post. Moving it away keeps it from being listed on every poll.',
    'A Try around each file\'s work keeps one rejected file from stopping the rest of the loop.',
  ],
  solution: `
1. **Scheduler** every 2 minutes.
2. **File List** \`/mnt/labshare/results/in\`, \`*.csv\`.
3. **For Each** file, **Set Variable** \`file\` = its attributes, then **Choice**:
   - \`size == 0\`: WARN and **File Move** to \`/mnt/labshare/results/empty\`.
   - Changed in the last 2 minutes: DEBUG log only.
   - Otherwise a **Try**: **Transform** to the LIMS JSON, **HTTP Request** POST \`/lims/v1/results\`, **File Move** to \`processed\`. **On Error Continue**: ERROR log and **File Move** to \`error\`.

**The size check alternative.** The File connector can also wait between two size readings (timeBetweenSizeCheck on the List or Read). It is the same idea measured another way, and it slows each read by the wait.

**Two workers.** If two hosts mount the same share and both poll, they may both post the same run. Run the poll on one host, or claim each file with a rename first.
`,
  followUps: [
    {
      q: 'An analyser stalls for three minutes in the middle of a copy. What happens?',
      a: 'The file looks finished and is posted half done. The LIMS should reject a run with a missing trailer or count, and the file goes to error. The real fix is a temporary name or a marker from the writer.',
    },
    {
      q: 'Why post a file\'s content from the list instead of reading it again?',
      a: 'The list already holds it, so a second read is extra work. For very large files, list only the attributes and read each file inside the loop, so the list stays small.',
    },
  ],
}
