import { design, flow, handler, route, router, scope, source, step } from '../../flow/dsl.js'

export default {
  id: 'fl-072',
  category: 'flows',
  title: 'Polling a Bank SFTP Folder Safely: Half-Written Files and Several Workers',
  level: 'ADVANCED',
  tags: ['sftp', 'scheduler', 'file-polling', 'claim', 'cluster', 'idempotency', 'archive'],
  estMinutes: 40,
  flowChecks: [
    { label: 'The job is driven by a Scheduler, not a file listener', rule: { type: 'source', component: 'scheduler' } },
    { label: 'The remote directory is listed and the files are processed one by one', rule: { type: 'before', first: 'sftp-list', then: 'foreach' } },
    {
      label: 'Files that changed in the last minutes (still being uploaded) are filtered out by their timestamp',
      rule: { type: 'exists', component: 'transform', where: { script: 'timestamp' } },
    },
    { label: 'Each file is claimed with a rename before it is read', rule: { type: 'before', first: 'sftp-rename', then: 'sftp-read' } },
    {
      label: 'A failed claim (another worker took the file) is handled inside a Try and skipped',
      rule: { type: 'handler', component: 'on-error-continue', within: 'try' },
    },
    { label: 'Reading the file happens inside the loop', rule: { type: 'inside', component: 'sftp-read', within: 'foreach' } },
    { label: 'Processed files are moved to an archive folder', rule: { type: 'exists', component: 'sftp-move', where: { targetPath: 'archive' } } },
  ],
  referenceFlow: design(
    flow(
      'bank-remittance-poll',
      source('scheduler', { strategy: 'cron', expression: '0 0/10 6-20 ? * MON-FRI' }),
      [
        step('sftp-list', { directoryPath: '/outbound/remittance', matcher: 'REM_*.csv', recursive: 'false' }),
        // List returns messages; only keep files that have not changed for 3 minutes and are not empty.
        // The docs do not say which zone attributes.timestamp is in. This assumes UTC: confirm it against a real file.
        step('transform', {
          script:
            '%dw 2.0\noutput application/java\nvar cutoff = (now() >> "UTC") as LocalDateTime - |PT3M|\n---\n(payload\n  filter ((f) -> f.attributes.size > 0 and f.attributes.timestamp < cutoff)\n  map ((f) -> { path: f.attributes.path, fileName: f.attributes.fileName })\n) orderBy $.fileName',
        }),
        scope('foreach', { collection: '#[payload]' }, [
          step('set-variable', { variableName: 'file', value: '#[payload]' }),
          step('set-variable', { variableName: 'claimed', value: '#[false]' }),
          scope(
            'try',
            {},
            [
              // Only one worker should manage to move REM_x.csv to REM_x.csv.processing. That relies on the SFTP server, not the connector.
              step('sftp-rename', { path: '#[vars.file.path]', to: '#[vars.file.fileName ++ ".processing"]' }),
              step('set-variable', { variableName: 'claimed', value: '#[true]' }),
            ],
            {
              errorHandlers: [
                handler('on-error-continue', { type: 'SFTP:ILLEGAL_PATH, SFTP:FILE_ALREADY_EXISTS' }, [
                  step('logger', { level: 'DEBUG', message: '#["Skipping " ++ vars.file.fileName ++ ", claimed by another worker"]' }),
                ]),
              ],
            },
          ),
          router('choice', {}, [
            route({ expression: '#[vars.claimed]' }, [
              step('set-variable', { variableName: 'workPath', value: '#["/outbound/remittance/" ++ vars.file.fileName ++ ".processing"]' }),
              scope(
                'try',
                {},
                [
                  step('sftp-read', { path: '#[vars.workPath]', outputMimeType: 'application/csv' }),
                  step('transform', {
                    script:
                      '%dw 2.0\noutput application/json\n---\n{\n  sourceFile: vars.file.fileName,\n  remittances: payload map {\n    invoiceNo: $.INVOICE_NO,\n    amount: $.AMOUNT as Number,\n    currency: $.CCY,\n    valueDate: $.VALUE_DATE as Date {format: "yyyyMMdd"}\n  }\n}',
                  }),
                  // Treasury API is idempotent on sourceFile (409 = already booked).
                  step('http-request', { method: 'POST', path: '/treasury/v1/remittance-files', responseTimeout: 30000 }),
                  step('set-variable', { variableName: 'archiveName', value: '#[vars.file.fileName ++ "." ++ (now() as String {format: "yyyyMMddHHmmss"}) ++ ".done"]' }),
                  step('sftp-rename', { path: '#[vars.workPath]', to: '#[vars.archiveName]' }),
                  step('sftp-move', { sourcePath: '#["/outbound/remittance/" ++ vars.archiveName]', targetPath: '/archive/remittance' }),
                ],
                {
                  errorHandlers: [
                    handler('on-error-continue', { type: 'ANY' }, [
                      step('sftp-move', { sourcePath: '#[vars.workPath]', targetPath: '/error/remittance' }),
                      step('logger', { level: 'ERROR', message: '#["Remittance file " ++ vars.file.fileName ++ " failed: " ++ error.description]' }),
                    ]),
                  ],
                },
              ),
            ]),
          ]),
        ]),
      ],
    ),
  ),
  description: `
A bank delivers **remittance files** (\`REM_<account>_<seq>.csv\`, 5–80 MB) to its SFTP server in \`/outbound/remittance\`. You may read, rename and move files there, and \`/archive/remittance\` and \`/error/remittance\` exist. The files must be posted to the internal **Treasury API** during business hours.

**What went wrong last month**
- The bank's upload of an 80 MB file takes up to two minutes and the file is written **under its final name**. The old integration read a file halfway through and booked only part of the payments.
- After scaling to **two workers**, several files were posted **twice**, once by each worker.
- The bank cannot change its upload process this quarter.

**Requirements**
- Poll every 10 minutes, Monday to Friday 06:00–20:00.
- Each file is processed **exactly once**, even with several workers and after a crash.
- Processed files are archived with a timestamp in the name; failed files go to the error folder.

**Design the flow.** Explain why you chose a Scheduler + List over the SFTP listener, or when you would choose the listener instead.
`,
  answerTemplate: `## Trigger and listing

## Skipping half-written files

## Claiming a file across workers

## Processing and archiving

## Failures and crash recovery
`,
  keyPoints: [
    'A Scheduler (cron, business hours) + SFTP List gives control over which files are taken; the listener would also work with a matcher, timeBetweenSizeCheck (a listener setting, not a matcher one), primaryNodeOnly and a post action.',
    'Skip files whose modification timestamp is newer than a few minutes (or whose size changed between two checks) — the bank writes under the final name, so a stable timestamp is the only signal.',
    'Claim each file with a rename (to .processing) before reading; a worker whose rename fails because the file is gone skips it. This works with replicas that are not a Mule cluster. The connector docs do not call rename atomic, so the claim relies on the SFTP server letting only one rename succeed: test that on the bank server.',
    'Process inside a per-file Try; on success rename with a timestamp and move to the archive, on failure move to the error folder and continue with the next file.',
    'Crash recovery: a .processing file older than N minutes was abandoned; a sweeper renames it back. The Treasury API is idempotent on the file name, so a re-run after a lost response is safe.',
  ],
  solution: `
1. **Scheduler** cron \`0 0/10 6-20 ? * MON-FRI\` (set the time zone). In a Mule cluster the scheduler runs on the primary node only, but separate replicas each run it — so the design must be safe without relying on that.
2. **SFTP List** \`/outbound/remittance\`, \`REM_*.csv\`, not recursive. Listing returns attributes (path, size, timestamp) per file.
3. **Transform**: keep files with \`size > 0\` and \`attributes.timestamp\` older than 3 minutes, sorted by name. Watch the time zone: the reference does not say which zone the timestamp is in, so compare a real file's value with the clock before you rely on the cutoff.
4. **For Each** file:
   - **Try → SFTP Rename** \`REM_x.csv\` → \`REM_x.csv.processing\`. The claim relies on the server: once the first rename is done the source name is gone, so the second worker's rename should fail. The docs list \`SFTP:ILLEGAL_PATH\` and \`SFTP:FILE_ALREADY_EXISTS\` for Rename, but they do not say which one a missing source gives and they do not call rename atomic, so test it with two workers on the bank's server. **On Error Continue** for both types sets nothing and the file is skipped.
   - **Choice** claimed → **Try**: **SFTP Read** the \`.processing\` file (CSV), **Transform** to the Treasury JSON, **HTTP POST** (idempotency key = file name), compute the archive name \`REM_x.csv.<yyyyMMddHHmmss>.done\` once into a variable, **Rename** to it and **Move** to \`/archive/remittance\`.
   - Error → **SFTP Move** to \`/error/remittance\`, log, continue with the next file.
5. **Sweeper**: a second scheduled flow (or the same one at start) renames \`.processing\` files older than 30 minutes back to their original name, so a crashed worker does not strand a file.

**Listener alternative:** \`sftp:listener\` with a size check (\`timeBetweenSizeCheck\`), \`primaryNodeOnly="true"\` and \`moveToDirectory\`/\`renameTo\` post actions. Fine in a single runtime or a real Mule cluster; with independent replicas the rename claim is still needed.
`,
  followUps: [
    {
      q: 'Why is a watermark not enough to avoid double processing?',
      a: 'A watermark is tracked by each application; it skips files that did not change since the last poll on that worker, but two independent workers each have their own view and both process a new file. A server-side claim (rename or move) is the shared lock.',
    },
    {
      q: 'What if the bank later agrees to upload as REM_x.csv.tmp and rename when finished?',
      a: 'Then match only *.csv and drop the timestamp filter — the final name only appears once the upload is complete. That is the most reliable fix for half-written files.',
    },
    {
      q: 'Why is the archive name stored in a variable instead of computing now() in both the rename and the move?',
      a: 'Two evaluations of now() can fall on different seconds, so the move would look for a name that does not exist. Compute it once and use it for both steps (or use Move with renameTo in one operation).',
    },
    {
      q: 'How do you notice a file that keeps failing?',
      a: 'Files in /error/remittance trigger an alert (log-based or a daily List of the error folder), and the Treasury API rejection reason is logged with the file name and correlation ID.',
    },
  ],
}
