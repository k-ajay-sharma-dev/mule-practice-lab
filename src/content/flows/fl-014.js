import { design, flow, handler, route, router, source, step } from '../../flow/dsl.js'

export default {
  id: 'fl-014',
  category: 'flows',
  title: 'File-to-File ETL with Validation and a Reject File',
  level: 'INTERMEDIATE',
  tags: ['file', 'etl', 'validation', 'csv', 'fixed-width'],
  estMinutes: 25,
  flowChecks: [
    { label: 'Triggered by a File listener on the input folder', rule: { type: 'source', component: 'file-listener' } },
    {
      label: 'A file is never read twice (moved, deleted or renamed after reading, or a watermark)',
      rule: {
        type: 'any',
        rules: [
          { type: 'source', component: 'file-listener', where: { postAction: { oneOf: ['move', 'delete', 'rename'] } } },
          { type: 'source', component: 'file-listener', where: { watermarkMode: { oneOf: ['MODIFIED', 'CREATED'] } } },
        ],
      },
    },
    {
      label: 'The fixed-width file is parsed with DataWeave using a flat-file schema',
      rule: { type: 'exists', component: 'transform', where: { script: 'flatfile' } },
    },
    {
      label: 'Header/trailer totals are validated before any output is written',
      rule: {
        type: 'any',
        rules: [
          { type: 'before', first: 'raise-error', then: 'file-write', every: true },
          { type: 'before', first: 'validation', then: 'file-write', every: true },
        ],
      },
    },
    {
      label: 'Valid rows are converted to CSV before the output file is written',
      rule: { type: 'before', first: 'transform', firstWhere: { script: 'application/csv' }, then: 'file-write' },
    },
    {
      label: 'Finance never sees a half-written file in /data/out (write to a temporary name, then rename or move)',
      rule: {
        type: 'any',
        rules: [
          { type: 'before', first: 'file-write', firstWhere: { path: '/data/out' }, then: 'file-rename' },
          { type: 'before', first: 'file-write', then: 'file-move', thenWhere: { targetPath: '/data/out' }, outside: true },
        ],
      },
    },
    {
      label: 'Invalid rows are written to /data/reject',
      rule: { type: 'exists', component: 'file-write', where: { path: '/data/reject' } },
    },
    {
      label: 'Each rejected row carries a reason column',
      rule: { type: 'exists', component: 'transform', where: { script: 'reason' } },
    },
    {
      label: 'A flow error handler deals with rejected or unparseable files',
      rule: { type: 'handler', component: ['on-error-propagate', 'on-error-continue'] },
    },
    {
      label: 'The team is alerted when a file is rejected',
      rule: { type: 'inside', component: 'email-send', within: ['on-error-propagate', 'on-error-continue'] },
    },
  ],
  referenceFlow: design(
    flow(
      'payroll-file-etl',
      // applyPostActionWhenFailed="false" on the listener (not on the canvas): a rejected file goes to /data/error instead.
      source('file-listener', { directory: '/data/in', matcher: 'PAYROLL_*.txt', postAction: 'move', moveTo: '/data/archive', timeBetweenSizeCheck: 5000 }),
      [
        step('set-variable', { variableName: 'sourcePath', value: '#[attributes.path]' }),
        step('set-variable', { variableName: 'baseName', value: '#[attributes.fileName replace ".txt" with ""]' }),
        step('transform', {
          script: '%dw 2.0\ninput payload application/flatfile schemaPath="payroll.ffd"\noutput application/java\n---\npayload',
        }),
        router(
          'choice',
          {},
          [
            route(
              {
                expression:
                  '#[sizeOf(payload.details) != payload.trailer.recordCount or sum(payload.details.amount) != payload.trailer.totalAmount]',
              },
              [step('raise-error', { type: 'APP:FILE_REJECTED', description: 'Trailer count/total does not match detail lines' })],
            ),
          ],
          { otherwise: [] },
        ),
        step('transform', {
          target: 'variable',
          variableName: 'partitioned',
          script:
            '%dw 2.0\noutput application/java\nfun reasons(d) =\n  (if (isEmpty(d.employeeId)) ["Missing employee ID"] else []) ++\n  (if ((d.amount default 0) <= 0) ["Amount must be > 0"] else [])\n---\n{\n  valid: payload.details filter (d) -> isEmpty(reasons(d)),\n  invalid: (payload.details filter (d) -> not isEmpty(reasons(d))) map (d) -> d ++ { reason: reasons(d) joinBy "; " }\n}',
        }),
        step('transform', { script: '%dw 2.0\noutput application/csv\n---\nvars.partitioned.valid' }),
        step('file-write', { path: '#["/data/out/" ++ vars.baseName ++ ".csv.tmp"]', mode: 'OVERWRITE' }),
        step('file-rename', { path: '#["/data/out/" ++ vars.baseName ++ ".csv.tmp"]', to: '#[vars.baseName ++ ".csv"]' }),
        step('transform', { script: '%dw 2.0\noutput application/csv\n---\nvars.partitioned.invalid' }),
        step('file-write', { path: '#["/data/reject/" ++ vars.baseName ++ "_reject.csv"]', mode: 'OVERWRITE' }),
        step('logger', {
          level: 'INFO',
          message:
            '#["Payroll " ++ vars.baseName ++ ": valid=" ++ (sizeOf(vars.partitioned.valid) as String) ++ ", invalid=" ++ (sizeOf(vars.partitioned.invalid) as String)]',
        }),
      ],
      [
        handler('on-error-propagate', { type: 'ANY' }, [
          step('logger', { level: 'ERROR', message: '#["Payroll file rejected: " ++ error.description]' }),
          step('file-move', { sourcePath: '#[vars.sourcePath]', targetPath: '/data/error' }),
          step('email-send', { toAddresses: 'payroll-support@example.com', subject: 'Payroll file rejected' }),
        ]),
      ],
    ),
  ),
  description: `
A payroll provider drops a **fixed-width** file \`PAYROLL_YYYYMMDD.txt\` (20k–80k lines, header + detail + trailer record) into a shared folder \`/data/in\` every Friday. Downstream, the finance system imports a **CSV** from \`/data/out\`.

**Requirements**
- Validate: the trailer's record count and total amount must match the detail lines; each detail needs a valid employee ID and amount > 0.
- If header/trailer validation fails → reject the **whole file**.
- If only some detail lines fail → write good lines to the output CSV and bad lines (with a reason column) to \`/data/reject/\`.
- Never process the same file twice; never let finance pick up a half-written output file.

**Design the flow(s):** trigger, parsing, validation layers, writing output/reject files, and file lifecycle.
`,
  answerTemplate: `## Trigger and file lifecycle

## Parsing the fixed-width file

## File-level validation

## Record-level validation

## Writing output and reject files

## Errors and alerts
`,
  keyPoints: [
    'File On New or Updated File listener with a matcher, a minimum-age/size-check to avoid reading files still being written, and move-to (archive) after processing.',
    'Fixed-width parsed with DataWeave flatfile format using a schema (.ffd) that defines header, detail and trailer segments.',
    'File-level check (count and total vs trailer) runs first; on failure the whole file is moved to an error folder and an alert raised.',
    'DataWeave partitions details into valid and invalid sets with reasons; valid rows written as CSV, invalid rows written to the reject file.',
    'Output is written to a temp name and then renamed/moved so finance never reads a partial file.',
  ],
  solution: `
1. **Trigger:** File connector **On New or Updated File** on \`/data/in\` with a matcher \`filenamePattern="PAYROLL_*.txt"\` and a **time between size checks** setting so files still being copied are skipped. Post-processing \`moveToDirectory="/data/archive"\` (with \`renameTo\` adding a timestamp) prevents re-processing. **Apply Post Action When Failed** defaults to true, so set it to false when a failed file must go to \`/data/error\` instead.
2. **Parse:** Transform Message with \`input payload application/flatfile schemaPath="payroll.ffd"\` (header/detail/trailer segments) → structured object. The docs state a limit of 15 MB for fixed-width files and memory use of roughly 40 times the file size, so confirm the real file size: 80k lines of up to ~180 characters stay under that limit.
3. **File-level validation:** DataWeave computes \`sizeOf(details)\` and \`sum(details.amount)\` and compares to the trailer. A Choice (or Validation module \`is-true\`) raises \`APP:FILE_REJECTED\` on mismatch.
4. **Record-level validation:** one DataWeave script returns \`{ valid: [...], invalid: [...] }\` using a \`reasons\` function per line (missing employee ID, amount <= 0, bad date). Store both in variables.
5. **Write output:** File **Write** valid rows as \`application/csv\` to \`/data/out/PAYROLL_YYYYMMDD.csv.tmp\`, then File **Rename** to \`.csv\` (atomic hand-off). Write invalid rows plus a \`reason\` column to \`/data/reject/PAYROLL_YYYYMMDD_reject.csv\`.
6. **Errors:** On Error Propagate for \`APP:FILE_REJECTED\` and parsing errors → File **Move** source to \`/data/error\`, send alert email with the reason. Log counts (read/valid/invalid) with the correlation ID.
`,
  followUps: [
    { q: 'What if the file is 5 GB?', a: 'The fixed-width format is documented for files up to 15 MB, and the docs describe no streaming reader for it. Split the file into small pieces before parsing (for example a line-based pre-processing step). Process the pieces in chunks (For Each batchSize or Batch Job). Compute trailer totals incrementally or in a second pass.' },
    { q: 'How do you avoid double processing when two replicas watch the same NFS folder?', a: 'Both may see the same file. Use a single poller (primary node in a cluster), or a lock/idempotent filter on file name plus checksum in a shared Object Store.' },
    { q: 'Why validate file-level totals before record-level checks?', a: 'A count/total mismatch means the file is incomplete or corrupt, so partial processing would produce wrong payroll; rejecting early is the safe, cheap check.' },
  ],
}
