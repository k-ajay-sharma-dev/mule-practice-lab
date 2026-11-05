import { design, flow, handler, source, step } from '../../flow/dsl.js'

export default {
  id: 'fl-038',
  category: 'flows',
  title: 'Outbound Payment File with Header/Trailer and Safe SFTP Hand-off',
  level: 'INTERMEDIATE',
  tags: ['sftp', 'file', 'flat-file', 'scheduler', 'dataweave'],
  estMinutes: 20,
  flowChecks: [
    { label: 'The export runs on a schedule', rule: { type: 'source', component: 'scheduler' } },
    { label: 'Approved payments are read from the database', rule: { type: 'exists', component: 'db-select' } },
    {
      label: 'DataWeave builds the file (header, detail lines, trailer) before it is written',
      rule: { type: 'before', first: 'transform', then: 'sftp-write' },
    },
    {
      label: 'The file is written to a temporary name/location first, then moved into the pickup folder',
      rule: { type: 'before', first: 'sftp-write', then: 'sftp-move' },
    },
    {
      label: 'Payments are marked as exported only after the file is published',
      rule: { type: 'before', first: 'sftp-move', then: ['db-update', 'db-bulk-update'] },
    },
    {
      label: 'A failure alerts the payments team from an error handler',
      rule: { type: 'inside', component: 'email-send', within: ['on-error-propagate', 'on-error-continue'] },
    },
  ],
  referenceFlow: design(
    flow(
      'payments-file-export',
      source('scheduler', { strategy: 'cron', expression: '0 30 1 * * ?' }),
      [
        step('set-variable', { variableName: 'fileName', value: '#["PAY_" ++ (now() as String {format: "yyyyMMdd"}) ++ ".txt"]' }),
        step('db-select', {
          sql: "SELECT payment_id, beneficiary_iban, amount, currency FROM payments WHERE status = 'APPROVED' ORDER BY payment_id",
        }),
        step('set-variable', { variableName: 'paymentIds', value: '#[payload.payment_id]' }),
        step('transform', {
          script:
            '%dw 2.0\noutput application/csv header=false, separator="|"\nvar total = if (isEmpty(payload)) 0 else sum(payload map ($.amount as Number))\n---\n[{ rec: "H", a: "ACME-CORP", b: now() as String {format: "yyyyMMdd"}, c: "" }]\n  ++ (payload map { rec: "D", a: $.payment_id, b: $.beneficiary_iban, c: $.amount })\n  ++ [{ rec: "T", a: sizeOf(payload), b: total, c: "" }]',
        }),
        step('sftp-write', { path: '#["/outbound/staging/" ++ vars.fileName]', mode: 'CREATE_NEW' }),
        step('sftp-move', { sourcePath: '#["/outbound/staging/" ++ vars.fileName]', targetPath: '/outbound/payments' }),
        step('set-payload', { value: '#[vars.paymentIds map { paymentId: $, fileName: vars.fileName }]' }),
        step('db-bulk-update', {
          sql: "UPDATE payments SET status = 'EXPORTED', export_file = :fileName WHERE payment_id = :paymentId",
        }),
        step('logger', { level: 'INFO', message: '#["Exported " ++ vars.fileName]' }),
      ],
      [
        handler('on-error-propagate', { type: 'ANY' }, [
          step('logger', { level: 'ERROR', message: '#["Payment export failed: " ++ error.description]' }),
          step('email-send', { toAddresses: 'payments-ops@example.com', subject: 'Payment file export FAILED' }),
        ]),
      ],
    ),
  ),
  description: `
Every night at **01:30** the finance system must send the bank a payment file over **SFTP**.

- Source: \`payments\` table, rows with \`status = 'APPROVED'\` (typically 2,000–15,000 rows).
- Format: pipe-delimited flat file named \`PAY_yyyyMMdd.txt\`:
  - **Header** \`H|ACME-CORP|20261103|\`
  - **Detail** \`D|paymentId|IBAN|amount\` per payment
  - **Trailer** \`T|recordCount|totalAmount|\` — the bank rejects the file if counts or totals do not match.
- The bank **polls \`/outbound/payments\` every minute** and picks up any file it sees — a half-written file would be processed and rejected.
- A payment must never be sent twice, and must not be marked exported if the upload failed.
- If anything fails, the payments team must be emailed before 06:00.

**Design the flow(s):** trigger, query, file layout, how the upload is made safe, status update, and error handling.
`,
  answerTemplate: `## Trigger

## Reading payments

## Building header, detail and trailer

## Safe upload

## Marking payments exported

## Error handling
`,
  keyPoints: [
    'Scheduler with a cron expression (and primary-node-only in a cluster) triggers the export.',
    'One DataWeave script outputs CSV with header=false and a custom separator, concatenating a header record, the detail records and a trailer computed with sizeOf/sum.',
    'Write to a temporary name or staging folder, then rename/move into the pickup folder — the rename is atomic, so the bank never sees a partial file.',
    'Payments are marked EXPORTED only after the file is safely in place (and could be locked/marked IN_PROGRESS first to avoid double export).',
    'Flow-level On Error Propagate logs and emails the team; the payments stay APPROVED so the next run (or a manual rerun) picks them up.',
  ],
  solution: `
1. **Scheduler** — cron \`0 30 1 * * ?\` (runs on the primary node only in a cluster, or on CloudHub 2.0 with clustering enabled).
2. **Database Select** approved payments, ordered for a stable file.
3. **Transform Message** — \`output application/csv header=false, separator="|"\`, building one array: header row ++ detail rows ++ trailer row (\`sizeOf(payload)\`, \`sum(amounts)\`). Totals come from the same data that goes into the file, so they always match.
4. **SFTP Write** to \`/outbound/staging/PAY_yyyyMMdd.txt\` with \`CREATE_NEW\` (fails if a file for today is already in staging).
5. **SFTP Move** into \`/outbound/payments\`. Target Path is a directory and the file keeps its name unless you set Rename To, which is why staging already uses the final name. With Overwrite false (the default) the move fails if today's file is still in the pickup folder, a cheap guard against double runs. A rename on the same server is atomic, so the bank's poller sees either nothing or the complete file. (Alternative: write \`PAY_...txt.tmp\` in the pickup folder and use the SFTP *Rename* operation, if the bank ignores \`*.tmp\`.)
6. **Database Bulk Update** — \`status = 'EXPORTED', export_file = ...\` for the exported IDs only, one parameter set per payment (a single bind parameter cannot hold a list for \`IN (:ids)\`). For extra safety, mark rows \`IN_PROGRESS\` before building the file and roll them back to \`APPROVED\` in the error handler.
7. **On Error Propagate (ANY)** — log with the correlation ID and **Email Send** to payments-ops. Nothing is marked exported, so a rerun is safe.

For very large volumes, stream the query result into the DataWeave script (deferred output) instead of building the whole file in memory.
`,
  followUps: [
    {
      q: 'Why not just write the file directly with its final name?',
      a: 'SFTP writes are not atomic: the bank can poll while the file is half-written and either reject it or, worse, process a truncated file. Writing under a temp name and renaming makes the file appear all at once.',
    },
    {
      q: 'The database update fails after the file was delivered. What happens next run?',
      a: 'The same payments would be exported again. Mitigate by marking rows IN_PROGRESS with the file name before writing, making the update idempotent, and having the bank reject duplicate file names / payment IDs.',
    },
    {
      q: 'How would you add a SHA-256 checksum file the bank asks for?',
      a: 'Compute it in DataWeave with dw::Crypto::hashWith(content, "SHA-256") and dw::core::Binaries::toHex from the generated content, write PAY_yyyyMMdd.txt.sha256 the same safe way, and move the checksum file last so its presence signals the pair is complete.',
    },
  ],
}
