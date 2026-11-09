import { design, flow, handler, route, router, scope, source, step } from '../../flow/dsl.js'

export default {
  id: 'fl-087',
  category: 'flows',
  title: 'Splitting a Daily Sales CSV into Per-Region Files in Dated Folders with a Control Count',
  level: 'INTERMEDIATE',
  tags: ['file', 'csv', 'retail', 'control-total', 'foreach', 'data-formats'],
  estMinutes: 30,
  flowChecks: [
    {
      label: 'The sales file is picked up by a File Listener with a size check',
      rule: { type: 'source', component: 'file-listener', where: { timeBetweenSizeCheck: { gte: 1 } } },
    },
    { label: 'The control count is checked before anything is written', rule: { type: 'before', first: 'choice', then: 'file-create-directory' } },
    {
      label: 'No region file is written before the control count check',
      rule: { type: 'before', first: 'choice', then: 'file-write', every: true },
    },
    { label: 'A count mismatch raises an error', rule: { type: 'inside', component: 'raise-error', within: 'choice' } },
    {
      label: 'The trailer is split off from the data rows, so it appears in no output',
      rule: { type: 'exists', component: 'transform', where: { script: 'TRAILER' } },
    },
    { label: 'The dated folder is created before the region files', rule: { type: 'before', first: 'file-create-directory', then: 'file-write' } },
    {
      label: 'A rerun does not fail when the folder exists (FILE:FILE_ALREADY_EXISTS handled in a Try)',
      rule: { type: 'handler', component: 'on-error-continue', errorType: 'FILE:FILE_ALREADY_EXISTS', within: 'try' },
    },
    { label: 'Each region file is written inside a For Each', rule: { type: 'inside', component: 'file-write', within: 'foreach', where: { path: 'region' } } },
    {
      label: 'A rerun replaces the region files instead of adding to them (no APPEND)',
      rule: {
        type: 'all',
        rules: [
          { type: 'inside', component: 'file-write', within: 'foreach' },
          { type: 'absent', component: 'file-write', where: { mode: 'APPEND' } },
        ],
      },
    },
    {
      label: 'The source file is archived after the region files are written',
      rule: { type: 'before', first: 'file-write', then: 'file-move', thenWhere: { targetPath: 'archive' }, outside: true },
    },
    {
      label: 'The archived copy gets a unique name, so a rerun of the same file does not clash in the archive',
      rule: { type: 'exists', component: 'file-move', where: { targetPath: 'archive', renameTo: { set: true } } },
    },
    {
      label: 'A file that fails the control check is moved to a rejected folder',
      rule: { type: 'inside', component: 'file-move', within: 'on-error-continue', where: { targetPath: 'rejected' } },
    },
    {
      label: 'The sales data team is emailed when a file is rejected',
      rule: { type: 'inside', component: 'email-send', within: ['on-error-continue', 'on-error-propagate'] },
    },
  ],
  referenceFlow: design(
    flow(
      'daily-sales-splitter',
      source('file-listener', { directory: '/data/sales/in', matcher: 'sales_*.csv', postAction: 'none', timeBetweenSizeCheck: 5000, watermarkMode: 'DISABLED' }),
      [
        step('set-variable', { variableName: 'fileName', value: '#[attributes.fileName]' }),
        step('set-variable', { variableName: 'filePath', value: '#[attributes.path]' }),
        step('set-variable', {
          variableName: 'runDate',
          value: '#[do { var m = attributes.fileName match /sales_(\\d{4})(\\d{2})(\\d{2})\\.csv/ --- m[1] ++ "-" ++ m[2] ++ "-" ++ m[3] }]',
        }),
        step('transform', {
          target: 'variable',
          variableName: 'sales',
          script:
            '%dw 2.0\noutput application/java\nvar all = read(payload.^raw, "application/csv")\nvar trailer = (all filter ($.region == "TRAILER"))[0]\nvar rows = all filter ($.region != "TRAILER")\n---\n{\n  expected: trailer.storeId as Number default -1,\n  actual: sizeOf(rows),\n  regions: (rows groupBy $.region) pluck ((regionRows, region) -> { region: region as String, rows: regionRows })\n}',
        }),
        router(
          'choice',
          {},
          [
            route({ expression: '#[vars.sales.expected != vars.sales.actual]' }, [
              step('raise-error', { type: 'APP:CONTROL_COUNT_MISMATCH', description: '#["Trailer says " ++ vars.sales.expected ++ ", file has " ++ vars.sales.actual]' }),
            ]),
          ],
          { otherwise: [] },
        ),
        step('set-variable', { variableName: 'outDir', value: '#["/data/sales/regional/" ++ vars.runDate]' }),
        scope('try', {}, [step('file-create-directory', { directoryPath: '#[vars.outDir]' })], {
          errorHandlers: [
            handler('on-error-continue', { type: 'FILE:FILE_ALREADY_EXISTS' }, [step('logger', { level: 'INFO', message: '#["Folder already exists, reusing " ++ vars.outDir]' })]),
          ],
        }),
        step('set-variable', { variableName: 'written', value: '#[0]' }),
        scope('foreach', { collection: '#[vars.sales.regions]' }, [
          step('set-variable', { variableName: 'regionName', value: '#[payload.region]' }),
          step('set-variable', { variableName: 'written', value: '#[vars.written + sizeOf(payload.rows)]' }),
          step('transform', { script: '%dw 2.0\noutput application/csv\n---\npayload.rows' }),
          // OVERWRITE: a rerun replaces yesterday's attempt instead of adding to it.
          step('file-write', { path: '#[vars.outDir ++ "/" ++ vars.regionName ++ ".csv"]', mode: 'OVERWRITE' }),
        ]),
        // Timestamped name: Overwrite is false by default, so a rerun of the same file would otherwise clash in the archive.
        step('file-move', {
          sourcePath: '#[vars.filePath]',
          targetPath: '/data/sales/archive',
          renameTo: '#[(now() as String {format: "yyyyMMddHHmmss"}) ++ "-" ++ vars.fileName]',
        }),
        step('logger', { level: 'INFO', message: '#["Split " ++ vars.fileName ++ ": " ++ vars.written ++ " rows into " ++ sizeOf(vars.sales.regions) ++ " region files"]' }),
      ],
      [
        handler('on-error-continue', { type: 'APP:CONTROL_COUNT_MISMATCH' }, [
          step('logger', { level: 'ERROR', message: '#["Rejected " ++ vars.fileName ++ ": " ++ error.description]' }),
          step('file-move', {
            sourcePath: '#[vars.filePath]',
            targetPath: '/data/sales/rejected',
            renameTo: '#[(now() as String {format: "yyyyMMddHHmmss"}) ++ "-" ++ vars.fileName]',
          }),
          step('email-send', { toAddresses: 'sales-data@company.example', subject: 'Daily sales file rejected', content: '#[error.description]', contentType: 'text/plain' }),
        ]),
      ],
    ),
  ),
  description: `
A retail group's point of sale platform drops one file a day, \`sales_YYYYMMDD.csv\`, into \`/data/sales/in\`. The file has about **400,000 rows** (roughly 60 MB) from **9 regions**. Columns are \`region,storeId,saleDate,sku,qty,amount\`.

The last line is a control record that holds the number of data rows in the second column:

\`\`\`
TRAILER,412385,,,,
\`\`\`

Each regional finance team loads only its own data, from a folder per day:

\`\`\`
/data/sales/regional/2026-11-03/NORTH.csv
/data/sales/regional/2026-11-03/SOUTH.csv
\`\`\`

Last month a transfer was cut off halfway. Nobody noticed, and three regions reported low sales for a day.

**Requirements**
- Do not produce any region file unless the row count matches the trailer.
- Create the dated folder, and write one CSV per region with a header row. The trailer must not appear in any output.
- Rejected files go to \`/data/sales/rejected\` and the sales data team gets an email.
- Operations reruns the job sometimes by putting the same file back. A rerun must succeed and must not leave doubled data.
- Archive the source file to \`/data/sales/archive\` when finished.

**Design the flow.**
`,
  answerTemplate: `## Picking up the file

## The control count

## Dated folder

## Writing the region files

## Reruns

## Rejected files
`,
  keyPoints: [
    'The size check protects against reading a file that is still arriving, and the trailer protects against a file that was cut off before it arrived. They catch different failures.',
    'The trailer is separated from the data with a filter, compared with sizeOf(rows), and removed from the output.',
    'The check runs before any output is written, so a bad file produces no region files at all.',
    'A missing trailer must also fail. The default value makes that a mismatch rather than a null comparison.',
    'groupBy gives one entry per region, and pluck turns it into a list that For Each can loop over.',
    'The docs disagree on file:write: the reference lists Create Parent Directories as true by default, while the File Write page says a write fails by default if directories are missing. The explicit Create Directory step removes the doubt and makes the folder part of the contract, and FILE:FILE_ALREADY_EXISTS is handled for reruns.',
    'OVERWRITE mode makes a rerun replace the files. APPEND would double the data, and CREATE_NEW would fail on the existing file.',
  ],
  solution: `
1. **File Listener** on \`/data/sales/in\`, \`sales_*.csv\`, \`timeBetweenSizeCheck\` of 5 seconds, no post action.
2. **Set Variables** for the file name and path, plus \`runDate\` taken from the file name, so a late file still lands in the correct day's folder. Do not use \`now()\` for this.
3. **Transform** to \`vars.sales\`: read the CSV with \`read(payload.^raw, "application/csv")\`. A \`.csv\` file may already be typed from its extension, and \`read\` accepts only a String or Binary. Find the trailer row, filter it out, and build \`{ expected, actual, regions }\`. The trailer has the same number of columns as the data, so the CSV reader treats it as an ordinary row with \`storeId\` holding the count.
4. **Choice**: if \`expected\` differs from \`actual\`, **Raise Error** \`APP:CONTROL_COUNT_MISMATCH\`. A missing trailer gives \`-1\`, which never matches.
5. **Try** with **File Create Directory**. On Error Continue for \`FILE:FILE_ALREADY_EXISTS\` lets a rerun carry on. The rest of the flow continues after the Try.
6. **For Each** region: add to the \`written\` counter, **Transform** to \`application/csv\` (the header is included by default) and **File Write** with mode OVERWRITE.
7. **File Move** the source to the archive with a timestamped Rename To, and log the totals.

**Rejected files.** The On Error Continue for \`APP:CONTROL_COUNT_MISMATCH\` moves the file to \`rejected\` and sends the email. Nothing was written, so finance sees an empty day and not a wrong one.

**Other failures.** With no handler for them, a disk error during the region writes leaves the source file in the folder, where operations can rerun it. OVERWRITE replaces any region files from the failed attempt. The listener documentation does not spell out what happens to a file left in place, so confirm in a test whether it is picked up again on its own.

**A rerun of the same file.** Three steps have to tolerate it: Create Directory (the Try), File Write (OVERWRITE) and the archive move. File Move has Overwrite false by default and can raise \`FILE:FILE_ALREADY_EXISTS\`, so the timestamp in Rename To keeps both copies without a clash.

**Memory.** At 60 MB the file can be handled in memory, and \`groupBy\` needs all the rows anyway. For a much larger file, use the chunked approach of the streaming problems (fl-018, fl-033) and append to part files, then rename them at the end.
`,
  followUps: [
    {
      q: 'Is the Create Directory step needed, given that File Write can create parent directories?',
      a: 'Not strictly, if Create Parent Directories is on. Set it explicitly, because the reference lists the default as true while the File Write page says a write fails by default. The step earns its place if the folder must exist even when no region has data, or if you want to create it before the writes for a clear failure point. Without that need, removing it also removes the Try.',
    },
    {
      q: 'What if a region is missing from the file on a given day?',
      a: 'groupBy only produces regions that have rows, so no file appears for it. If finance needs a file every day, compare the output with a reference list of regions and write a header-only file for each missing one.',
    },
    {
      q: 'Finance reads files while they are being written. How would you avoid that?',
      a: 'Write to a temporary name such as NORTH.csv.tmp, then File Rename to the final name. Consumers then only see complete files. A marker file such as _DONE written after the last region tells them the whole set is ready.',
    },
    {
      q: 'Should the control check also compare amounts?',
      a: 'If the source can provide it, yes. A hash total such as the sum of amount in the trailer catches changed rows, which a row count cannot detect.',
    },
  ],
}
