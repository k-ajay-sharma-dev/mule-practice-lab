import { diagram } from '../../arch/dsl.js'

export default {
  id: 'cs-084',
  category: 'case-studies',
  title: 'Payments Company Reconciling Its Ledger Against Bank Statements Every Morning',
  level: 'INTERMEDIATE',
  tags: ['payments', 'fintech', 'reconciliation', 'batch', 'sftp', 'iso-20022', 'file-transfer'],
  estMinutes: 45,
  diagram: {
    task: 'draw the morning reconciliation: a scheduled job collects camt.053 statements from the bank SFTP, archives them unchanged, matches them against the ledger through a System API, sends unmatched lines through an exceptions queue to the reconciliation workbench, and feeds totals to the finance warehouse.',
    checks: [
      { label: 'The job collects statement files from the bank SFTP server', rule: { type: 'link', from: 'batch-job', to: 'sftp-server' } },
      { label: 'Raw statement files are archived unchanged', rule: { type: 'edge', from: 'batch-job', to: ['s3-bucket', 'azure-blob', 'file-store'] } },
      { label: 'The ledger database is reached only through a System API', rule: { type: 'only-via', target: 'database', from: 'system-api' } },
      { label: 'The job reads ledger entries through the System API', rule: { type: 'path', from: 'batch-job', via: 'system-api', to: 'database' } },
      { label: 'Unmatched lines go through an exceptions queue to the workbench', rule: { type: 'path', from: 'batch-job', via: ['queue', 'cloud-queue'], to: 'saas' } },
      { label: 'The workbench is reached only through a System API', rule: { type: 'only-via', target: 'saas', from: 'system-api' } },
      { label: 'Every line into or out of a queue is an async message', rule: { type: 'lines', touching: ['queue', 'cloud-queue'], kind: 'async' } },
      { label: 'Daily matched totals reach the finance data warehouse', rule: { type: 'path', from: 'batch-job', to: 'data-warehouse' } },
    ],
    reference: diagram(
      {
        job: ['batch-job', 'prc-statement-recon (06:00 and on file arrival)'],
        bank: ['sftp-server', 'Bank SFTP (camt.053 statements)'],
        arch: ['s3-bucket', 'Raw statement archive (7 years)'],
        sled: ['system-api', 'sys-ledger-api'],
        led: ['database', 'Ledger (PostgreSQL)'],
        q: ['queue', 'recon.exceptions'],
        sbl: ['system-api', 'sys-recon-workbench-api'],
        bl: ['saas', 'Reconciliation workbench (BlackLine)'],
        dw: ['data-warehouse', 'Finance data warehouse'],
      },
      ['job -> bank', 'job -> arch', 'job -> sled', 'sled -> led', 'job ~> q', 'q ~> sbl', 'sbl -> bl', 'job ~> dw'],
    ),
  },
  description: `
**Context.** A payments company runs merchant accounts for 25,000 online merchants. It holds client money at four banks and keeps its own ledger in PostgreSQL. Every day about 900,000 ledger entries must match the movements on the bank accounts.

**The problem today**
- Each bank sends an end-of-day statement. Three send ISO 20022 camt.053 XML over SFTP; one still sends MT940.
- Two analysts download the files, open them in spreadsheets and match by amount and date. It takes until 14:00, so finance reports to the safeguarding auditor late.
- Last quarter a 48,000 EUR difference sat unexplained for 11 days because nobody saw it.

**Requirements**
- Statements arrive between 01:00 and 05:00. Reconciliation results must be ready by 08:00.
- Matching rules: by end-to-end ID where the bank returns it, otherwise by amount, value date and remittance reference within a 2 day window.
- Every unmatched item goes to the reconciliation workbench (BlackLine) with the evidence.
- Raw files are kept unchanged for 7 years for audit.
- The ledger team does not allow other teams to query its database directly.

**Volumes.** The largest daily camt.053 file is 450 MB with 600,000 entries.

**Your task.** Design the reconciliation integration.
`,
  answerTemplate: `## Collecting and keeping the files

## Parsing large statements

## Reading the ledger

## Matching

## Exceptions and the workbench

## Reporting, monitoring and late files

## Risks
`,
  keyPoints: [
    'A scheduled job (plus a file-arrival trigger) collects statements from each bank SFTP and archives the raw file unchanged before any parsing.',
    'Large camt.053 files are streamed and processed in batches, not loaded into memory; MT940 is converted to the same canonical statement line.',
    'Ledger entries are read through sys-ledger-api by value date range, because the ledger team owns the database.',
    'Matching runs in passes: end-to-end ID, then amount plus value date plus reference within 2 days; each unmatched line goes to an exceptions queue.',
    'A consumer sends exceptions to the workbench through its System API; daily totals and match rates go to the warehouse, and a missing statement by 05:30 raises an alert.',
  ],
  solution: `
**Collecting.** \`prc-statement-recon\` polls each bank SFTP from 01:00 and also runs at 06:00 as a backstop. It moves each file to a \`processing\` folder at the bank side when allowed, or tracks file names it has processed in an Object Store. The raw file is copied to the archive bucket (object lock, 7 years) before parsing, with its SHA-256 hash.

**Parsing.** camt.053 is streamed with \`streaming=true\` and split per \`Ntry\` element, processed in batch blocks of 1,000. MT940 goes through a separate parser into the same canonical line: account, booking date, value date, amount, credit or debit, end-to-end ID, remittance information.

**Ledger.** \`sys-ledger-api\` offers \`GET /entries?account=&valueDateFrom=&valueDateTo=\` with paging, and \`POST /entries/match\` to mark entries as reconciled with the statement reference. The job never opens a connection to PostgreSQL.

**Matching.** Pass 1 on end-to-end ID (about 85% match). Pass 2 on amount, value date and reference within 2 days. Pass 3 groups many ledger entries against one bank line for batched payouts. Matches are written back through the System API.

**Exceptions.** Every unmatched line, and every ledger entry older than 2 days with no bank line, goes to \`recon.exceptions\`. A consumer creates the item in BlackLine through \`sys-recon-workbench-api\`. Failed creations retry, then go to a DLQ.

**Reporting.** Totals per account (opening balance, credits, debits, closing balance against the bank's closing balance) go to the warehouse. If the totals do not tie, the run is marked failed and finance is alerted at once.

**Late or missing files.** A check at 05:30 alerts if any bank file is missing. A file that arrives twice is detected by name and hash and not processed again.

**Risks.** Memory on the 450 MB file (streaming, batch blocks, load tested with production size), banks changing the camt.053 variant (validate against the XSD and alert on new elements), and value date differences around weekends (the 2 day window and holiday calendars).
`,
  followUps: [
    { q: 'Why archive the raw file before parsing?', a: 'Auditors need the exact file the bank sent. If parsing fails or a mapping bug is found later, the original can be processed again.' },
    { q: 'How do you process a 450 MB camt.053 file in Mule without running out of memory?', a: 'Stream the XML, split it per entry, and process in batch blocks so only a small part is in memory at any time.' },
    { q: 'How do you avoid processing the same statement twice?', a: 'Record each file name and its hash after processing. A file seen before is skipped and reported, not matched again.' },
    { q: 'Why check that the closing balances tie, if every line is matched?', a: 'Line matching can hide a missing or extra entry on either side. Comparing opening plus movements with the closing balance proves the statement is complete.' },
  ],
}
