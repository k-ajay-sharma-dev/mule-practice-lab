import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-076',
  category: 'use-cases',
  title: 'POS End-of-Day Totals to the General Ledger',
  level: 'BEGINNER',
  tags: ['retail', 'pos', 'sftp', 'scheduler', 'journal-entries', 'finance', 'csv'],
  estMinutes: 15,
  diagram: {
    task: 'draw the nightly flow: the store POS servers dropping their end-of-day files, the scheduled job that reads them, the record of files already posted, the ERP behind a System API, and the finance email.',
    checks: [
      { label: 'Stores drop their end-of-day files on the SFTP server', rule: { type: 'edge', from: 'pos', to: 'sftp-server' } },
      { label: 'The scheduled job and the SFTP server are connected', rule: { type: 'link', from: 'batch-job', to: 'sftp-server' } },
      { label: 'Journals reach the ERP general ledger', rule: { type: 'path', from: 'batch-job', to: 'erp' } },
      { label: 'The ERP is reached only through a System API', rule: { type: 'only-via', target: 'erp', from: 'system-api' } },
      { label: 'Posted store and day pairs are recorded, so a file is never posted twice', rule: { type: 'edge', from: 'batch-job', to: { type: ['cache', 'database'], label: ['posted', 'processed', 'done', 'store'] } } },
      { label: 'Finance is told about cash variances and missing stores', rule: { type: 'edge', from: 'batch-job', to: 'notification' } },
      { label: 'Store systems never post to the ERP directly', rule: { type: 'no-path', from: 'pos', to: 'erp', unless: ['sftp-server', 'batch-job'] } },
    ],
    reference: diagram(
      {
        pos: ['pos', 'Store POS servers (120 stores)'],
        sftp: ['sftp-server', 'SFTP /eod/inbound'],
        job: ['batch-job', 'Nightly EOD job (02:00)'],
        done: ['cache', 'Posted files (store + business date)'],
        serp: ['system-api', 'sys-erp-gl'],
        erp: ['erp', 'Oracle EBS General Ledger'],
        mail: ['notification', 'Finance email (variances, missing stores)'],
      },
      ['pos -> sftp', 'job -> sftp', 'job -> done', 'job -> serp', 'serp -> erp', 'job -> mail'],
    ),
  },
  description: `
A pet supplies chain has **120 stores**. When a store closes, its POS server builds an **end-of-day (Z report) file** and uploads it to a central SFTP server between 21:00 and 23:30.

Each file is a CSV with one row per total:
- sales, returns and discounts, by VAT rate;
- takings by tender: cash, card, gift card, voucher;
- the cash counted in the drawers and the cash the POS expected.

Finance wants:
- **One summarised journal per store per business day** in the Oracle EBS General Ledger, ready by 06:00.
- An email listing stores whose **cash variance is above £20**, and stores whose file is **missing** by 02:00.

Today a clerk keys the totals by hand, which takes three hours each morning and makes mistakes.

Facts:
- Oracle EBS has a GL interface (journal import) that the integration team already wraps in a System API.
- A store can upload its file twice (the manager presses "send" again), and a late store can upload at 03:00.

**Questions:**
1. How do you pick up the files and post the journals?
2. How do you avoid posting the same store and day twice?
3. How do you check a file before posting it?
4. What does finance receive in the morning?
`,
  answerTemplate: `## Trigger and pickup

## Validation

## Journal posting

## Duplicates and late files

## Report to finance
`,
  keyPoints: [
    'A Scheduler at 02:00 lists the SFTP inbound folder and reads each file; files are moved to archive or error folders after processing.',
    'Each file is validated: totals by tender must equal net sales, and the business date and store number must be present.',
    'The journal is built in DataWeave with balanced debit and credit lines and posted through the GL System API.',
    'Posted store and business date pairs are kept in a persistent Object Store, so a resent file is skipped.',
    'Finance receives one email with variances above £20, missing stores and rejected files; late files are picked up by a 05:00 rerun.',
  ],
  solution: `
**Trigger and pickup.** A Scheduler runs at 02:00 and again at 05:00. It lists /eod/inbound on the SFTP server and reads each file. The file name carries the store number and the business date, for example EOD_0457_20261108.csv.

**Validation.** DataWeave checks each file before anything is posted:
- the store number and business date are present and match the file name;
- the sum of tenders equals net sales (sales minus returns minus discounts);
- amounts are numbers and the VAT rates are known.
A file that fails is moved to /eod/error and listed in the email. It is never half posted.

**Journal posting.** For each good file the job builds one journal: debit cash, card clearing, gift card liability and vouchers; credit sales by VAT rate and VAT payable. Debits must equal credits, or the file is rejected. The job sends the journal to **sys-erp-gl**, which loads the GL interface table and starts the journal import. The journal reference is store number plus business date.

**Duplicates and late files.** Before posting, the job looks up store plus business date in a **persistent Object Store**. If it is there, the file is archived as a duplicate and nothing is posted. After a successful post, the pair is stored. The same reference in Oracle gives a second line of defence. Files that arrive after 02:00 are picked up by the 05:00 run.

**Report to finance.** At the end of the 05:00 run the job emails finance one summary:
- stores with a cash variance above £20 (counted minus expected);
- stores with no file yet;
- files in the error folder and the reason.
Processed files are moved to /eod/archive/yyyy/mm so the inbound folder only holds new work.
`,
  followUps: [
    { q: 'Why one summarised journal instead of every sale?', a: 'The general ledger needs totals by account, not baskets. Line-level sales belong in the sales data warehouse. Summaries keep the GL small and quick to reconcile.' },
    { q: 'What if the POS writes the file while the job reads it?', a: 'Ask the stores to upload under a temporary name and rename when complete. Alternatively, skip files whose size changed in the last minute.' },
    { q: 'How would you correct a store day that was posted with wrong totals?', a: 'Post a reversing journal for the original reference, then post the corrected file under a new version suffix. Never edit a posted journal.' },
  ],
}
