import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-008',
  category: 'use-cases',
  title: 'Monthly Payroll Export to an External Provider',
  level: 'BEGINNER',
  tags: ['sftp', 'pgp', 'flat-file', 'workday', 'pii'],
  estMinutes: 15,
  diagram: {
    task: 'draw the payroll export: the monthly job that reads Workday and the time-tracking system, the provider SFTP it delivers the encrypted file to, and the second flow that picks up the response file and alerts payroll.',
    checks: [
      { label: 'A scheduled job builds the monthly file', rule: { type: 'node', match: 'batch-job' } },
      { label: 'Workers, salary and bank data are read from Workday', rule: { type: 'path', from: 'batch-job', to: { type: ['saas', 'erp', 'database'], label: ['workday', 'hr'] } } },
      { label: 'Hours are read from the time-tracking system', rule: { type: 'path', from: 'batch-job', to: { type: ['saas', 'external-api', 'database'], label: ['time', 'hours'] } } },
      { label: "The PGP-encrypted file is delivered to the provider's SFTP", rule: { type: 'edge', from: ['batch-job', 'process-api', 'system-api'], to: 'file-store' } },
      { label: 'A separate flow also uses the SFTP to pick up the response file', rule: { type: 'edge', from: ['batch-job', 'process-api', 'system-api'], to: 'file-store', min: 2 } },
      { label: 'Rejected lines are reported to the payroll team', rule: { type: 'edge', from: ['batch-job', 'process-api', 'system-api'], to: 'notification' } },
    ],
    reference: diagram(
      {
        job: ['batch-job', 'Payroll export (cron on the 20th)'],
        swd: ['system-api', 'sys-workday-workers-api'],
        wd: ['saas', 'Workday'],
        stime: ['system-api', 'sys-time-tracking-api'],
        time: ['saas', 'Time-tracking system'],
        sftp: ['file-store', 'Provider SFTP (PGP-encrypted fixed-width file)'],
        resp: ['batch-job', 'Response file poller'],
        mail: ['notification', 'Payroll team alert'],
      },
      ['job -> swd', 'swd -> wd', 'job -> stime', 'stime -> time', 'job -> sftp', 'resp -> sftp', 'resp -> mail'],
    ),
  },
  description: `
A retail company with **6,000 employees** keeps HR data in **Workday**. Payroll is outsourced to an external provider that only accepts a **fixed-width file** delivered by **SFTP**, encrypted with the provider's **PGP public key**.

Requirements:
- On the 20th of each month, export all active employees with salary, bank details, hours worked (from a separate **time-tracking system**, REST API) and deductions.
- The provider publishes a strict file spec: header record, one detail record per employee, trailer with record count and total gross amount.
- The provider drops a **response file** (accepted/rejected lines) in an outbound SFTP folder within 2 hours.
- Payroll data is highly sensitive (salary, bank account numbers).

**Describe your solution:**
- How do you build and deliver the file?
- How do you protect the data in transit, at rest and in logs?
- How do you know the provider accepted it, and what do you do with rejected lines?
`,
  answerTemplate: `## Collecting the data

## Building the file

## Security

## Confirmation and rejects
`,
  keyPoints: [
    'Scheduler (cron for the 20th) pulls active workers from Workday (connector or report-as-a-service) and hours from the time system, joined on employee ID in DataWeave.',
    'Fixed-width file produced with DataWeave flat file format (schema/copybook-style definition) including header and trailer with count and total.',
    'File PGP-encrypted (Cryptography module) before upload over SFTP; temporary local files avoided or deleted.',
    'No salary or bank fields in logs; secrets and keys in secure properties; access to the app and its logs restricted.',
    'SFTP listener/poller picks up the response file, parses rejected lines and alerts HR/payroll with the reasons; accepted file is never re-sent blindly.',
  ],
  solution: `
**Collecting the data.** A Scheduler with a cron expression for the 20th (e.g. \`0 0 6 20 * ?\`) starts the flow. It reads active workers with compensation and bank data from **Workday** (Workday connector against the HR web services, or a custom Workday report exposed as a REST/RaaS endpoint — a common choice because it returns exactly the fields needed). Hours for the period come from the time-tracking API. DataWeave joins both on employee ID (\`groupBy\` the hours, then map workers) and computes gross amounts where needed.

**Building the file.** Use DataWeave's **flat file** output with a schema describing each record type (header, detail, trailer) — fixed field lengths, padding, numeric formats with implied decimals. The trailer contains the **record count** and the **sum of gross pay**, computed from the same payload so they always match. Validate before sending: no employee without bank details, totals non-zero, count equals the number of active workers.

**Security.**
- **In transit:** SFTP, with the provider's host key pinned.
- **Payload:** encrypt with the provider's PGP public key using the **Cryptography module (PGP encrypt)** before writing to SFTP. Optionally sign with our private key.
- **At rest:** do not write plain files to local disk; stream from DataWeave to encryption to SFTP. Keys and passwords live in **secure properties**/a vault, never in code.
- **Logs:** log only counts, file name and a correlation ID — never salary or IBANs. Restrict who can see the app's logs in Runtime Manager.

**Confirmation and rejects.** A second flow polls the provider's outbound SFTP folder (SFTP *On New or Updated File*) for the response file, decrypts it, and parses accepted/rejected lines. If rejects exist, it creates a task/email for the payroll team with employee ID and reason (e.g. invalid IBAN). Corrections are sent as a small **correction file** per the provider's process — not by resending the whole month, which could pay people twice. If no response arrives within 2 hours, alert.
`,
  followUps: [
    { q: 'The file upload failed halfway. What now?', a: 'Upload to a temporary name and rename after a complete write (or use the provider\'s "ready" marker convention), so the provider never processes a partial file. Retry the whole upload; keep a record of the file sent so you never send two different files for the same run.' },
    { q: 'How do you rotate the provider\'s PGP key?', a: 'Keep the key outside the code (secure property or vault, referenced by name), coordinate a date with the provider, and switch configuration without a redeploy of logic. Test with a dummy file first.' },
    { q: 'How do you test this without exposing real payroll data?', a: 'Use masked or synthetic employees in lower environments, MUnit tests for the DataWeave mapping (header/trailer totals, padding), and a test file exchange with the provider\'s test SFTP.' },
  ],
}
