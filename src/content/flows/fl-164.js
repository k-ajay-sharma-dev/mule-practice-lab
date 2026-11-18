import { design, flow, source, step } from '../../flow/dsl.js'

const csv = 'sort_code,account,name,amount\n401122,00418822,J SMITH,1840.22\n401122,00418839,A PATEL,2012.50'

export default {
  id: 'fl-164',
  category: 'flows',
  title: 'Payroll File to the Bank: Download It From Azure Blob Storage and Put It on the Bank\'s SFTP Server Every Night',
  level: 'BEGINNER',
  tags: ['myproject', 'azure-blob', 'download', 'sftp', 'scheduler', 'payroll'],
  estMinutes: 15,
  flowChecks: [
    { label: 'The transfer runs at 01:30 every night', rule: { type: 'source', component: 'scheduler', where: { strategy: 'cron', expression: '30 1' } } },
    { label: 'The file is downloaded from payroll-out', rule: { type: 'exists', component: 'azure-download-blob', where: { container: 'payroll-out', fileName: 'payments-latest.csv' } } },
    { label: 'The downloaded file is written to the bank\'s /inbound folder', rule: { type: 'before', first: 'azure-download-blob', then: 'sftp-write', thenWhere: { path: '/inbound/' } } },
  ],
  simulation: {
    systems: { calls: { 'azure-download-blob': { payload: csv } } },
    tests: [
      {
        name: 'The nightly transfer',
        about: 'The payroll file is copied, unchanged, to the bank\'s SFTP server.',
        trigger: { schedule: {} },
        expect: { noError: true, files: { '/inbound/FENWICK-PAYROLL.csv': { exists: true, has: '401122,00418839,A PATEL,2012.50' } } },
      },
      {
        name: 'Blob storage cannot be reached',
        about: 'The download fails. Nothing is written to the bank, so it never gets a half file, and the run ends with an error that alerting picks up.',
        trigger: { schedule: {} },
        overrides: { systems: { calls: { 'azure-download-blob': { fault: { type: 'AZURE-STORAGE:CONNECTIVITY', description: 'Unable to reach the storage account' } } } } },
        expect: { error: 'AZURE-STORAGE:CONNECTIVITY', files: { '/inbound/FENWICK-PAYROLL.csv': { exists: false } } },
      },
    ],
  },
  referenceFlow: design(
    flow('payroll-file-to-bank', source('scheduler', { strategy: 'cron', expression: '0 30 1 * * ?' }), [
      step('azure-download-blob', { container: 'payroll-out', fileName: 'bacs/payments-latest.csv' }),
      step('sftp-write', { path: '/inbound/FENWICK-PAYROLL.csv', mode: 'OVERWRITE' }),
      step('logger', { level: 'INFO', message: 'Payroll file sent to the bank' }),
    ]),
  ),
  description: `
Fenwick Consulting (fictional) runs payroll in a cloud HR system. Each night at 01:00 the HR system writes the payment file to the Azure Blob Storage container \`payroll-out\`, as the blob \`bacs/payments-latest.csv\`.

The bank collects payment files from its own SFTP server. Fenwick must put the file in the folder \`/inbound\` with the name \`FENWICK-PAYROLL.csv\` before 02:00. Today someone in finance does this by hand, and missed it once during a holiday.

**Requirements**
- Every night at 01:30, download \`bacs/payments-latest.csv\` from \`payroll-out\`.
- Write it, unchanged, to \`/inbound/FENWICK-PAYROLL.csv\` on the bank's SFTP server.
- If the download fails, write nothing to the bank.

**Design the flow.**
`,
  answerTemplate: `## When it runs

## Download and write

## When something fails
`,
  keyPoints: [
    'A Scheduler with a cron expression runs at a fixed time of day: 0 30 1 * * ? is 01:30:00 every day.',
    'Download Blob makes the file content the payload, and SFTP Write writes the payload. Nothing in between changes it.',
    'Leave the file as it is. The bank checks the format strictly, and a Transform could change line endings or quoting.',
    'If the download fails, the flow stops before the write, so the bank never sees a partial file.',
    'A failed run must reach someone. Alert on the error in Anypoint Monitoring or with a log based alert.',
  ],
  solution: `
1. **Scheduler**, cron \`0 30 1 * * ?\`.
2. **Download Blob**: container \`payroll-out\`, blob \`bacs/payments-latest.csv\`.
3. **SFTP Write**: path \`/inbound/FENWICK-PAYROLL.csv\`, mode OVERWRITE.
4. **Logger** INFO.

**Time zone.** Mule runs cron in the time zone of the runtime unless the Scheduler sets one. On CloudHub that is usually UTC, so set the time zone to the bank's if it matters.

**Yesterday's file.** If HR did not run, the blob still holds yesterday's payments. Check the blob's last modified time, or a date in the file, before sending, so the bank never pays the same salaries twice.
`,
  followUps: [
    {
      q: 'The bank wants a file name with the date in it. What changes?',
      a: 'The path becomes an expression, such as #["/inbound/FENWICK-PAYROLL-" ++ (now() as String {format: "yyyyMMdd"}) ++ ".csv"].',
    },
    {
      q: 'Why not let the bank read from Azure directly?',
      a: 'It could, with a read link that expires. Many banks only accept files on their own SFTP server, so Mule delivers there.',
    },
  ],
}
