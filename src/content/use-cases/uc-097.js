import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-097',
  category: 'use-cases',
  title: 'General Ledger Journal Batches from Subledgers into Oracle EBS',
  level: 'INTERMEDIATE',
  tags: ['oracle-ebs', 'oracle', 'stored-procedure', 'journal-entries', 'sftp', 'sql-server', 'validation', 'finance'],
  estMinutes: 30,
  diagram: {
    task: 'draw the nightly journal load: the collector job, the billing database and the payroll SFTP drop behind their System APIs, the Process API that maps and balances every batch, the segment mapping table, the GL System API and the alert to the GL team.',
    checks: [
      { label: 'A scheduled job collects the day\'s journals', rule: { type: 'node', match: 'batch-job' } },
      { label: 'The billing database is read only through a System API', rule: { type: 'only-via', target: 'sql-server', from: 'system-api' } },
      { label: 'Payroll journal files are read only through a System API', rule: { type: 'only-via', target: 'sftp-server', from: 'system-api' } },
      { label: 'Journals reach the GL through a validating Process API', rule: { type: 'path', from: 'batch-job', via: 'process-api', to: 'erp' } },
      { label: 'Nothing reaches the GL without passing the balance check', rule: { type: 'no-path', from: 'batch-job', to: 'erp', unless: 'process-api' } },
      { label: 'Oracle EBS GL is reached only through a System API', rule: { type: 'only-via', target: 'erp', from: 'system-api' } },
      { label: 'Account segments are mapped from a table, not hard-coded', rule: { type: 'edge', from: 'process-api', to: ['database', 'cache'] } },
      { label: 'The GL team hears about unbalanced or rejected batches', rule: { type: 'edge', from: ['batch-job', 'process-api'], to: 'notification' } },
    ],
    reference: diagram(
      {
        job: ['batch-job', 'Journal collector (daily 22:00)'],
        sbill: ['system-api', 'sys-billing-db-api'],
        bill: ['sql-server', 'Billing database'],
        sfile: ['system-api', 'sys-payroll-sftp-api'],
        sftp: ['sftp-server', 'Payroll journal drop (SFTP)'],
        prc: ['process-api', 'prc-gl-journal-load'],
        map: ['database', 'Segment mapping table'],
        sgl: ['system-api', 'sys-oracle-ebs-gl-api'],
        ebs: ['erp', 'Oracle EBS General Ledger'],
        mail: ['notification', 'Batch errors to GL team'],
      },
      ['job -> sbill', 'sbill -> bill', 'job -> sfile', 'sfile -> sftp', 'job -> prc', 'prc -> map', 'prc -> sgl', 'sgl -> ebs', 'prc -> mail'],
    ),
  },
  description: `
A healthcare services group closes its books in **Oracle E-Business Suite 12.2 General Ledger**. Three subledgers outside EBS produce journals every day:

| Source | How it arrives | Daily volume |
|---|---|---|
| Patient billing (in-house) | Journal view in a **SQL Server** database | ~45,000 lines |
| Payroll (ADP) | CSV journal file on an **SFTP** drop at 21:00 | ~12,000 lines, twice a month |
| Fixed assets tool | REST API, depreciation once a month | ~3,000 lines |

Rules from the GL team:
- Each source sends its own **chart of accounts**. Accounts must be mapped to the EBS 6-segment combination (company, cost centre, account, product, intercompany, future). The mapping changes a few times per quarter.
- A **batch must balance** (debits = credits per company and currency) before it is loaded. An unbalanced batch is rejected as a whole; it must never be loaded partly.
- The GL period must be **open** for the journal date.
- Loading goes through the open interface \`GL_INTERFACE\` and the **Journal Import** concurrent program, never into \`GL_JE_LINES\` directly.
- Journals must be in EBS by 06:00 for the daily flash report.

**Questions:**
1. How do you collect from three different kinds of source?
2. Where do mapping and balancing happen?
3. How do you load into EBS and know that Journal Import succeeded?
4. How do you stop a batch being loaded twice?
`,
  answerTemplate: `## Collecting

## Mapping and validation

## Loading and Journal Import

## Duplicates and errors
`,
  keyPoints: [
    'A nightly job collects from the billing database, the payroll SFTP drop and the asset API, each through its own System API.',
    'One Process API maps accounts with a mapping table, checks the period is open and checks each batch balances per company and currency.',
    'Valid batches are inserted into GL_INTERFACE with a GROUP_ID, and Journal Import is submitted through FND_REQUEST.SUBMIT_REQUEST in a PL/SQL wrapper.',
    'The job polls the concurrent request status and reads GL_INTERFACE errors back; failures and unbalanced batches are mailed to the GL team.',
    'A batch key (source + business date + file name) recorded in a control table blocks loading the same batch twice.',
  ],
  solution: `
**Collecting.** At 22:00 the job calls **sys-billing-db-api** (a parameterised select on the journal view for the business date) and **sys-payroll-sftp-api** (lists and reads the payroll file, then moves it to a processed folder). On the first working day it also calls the asset System API. Each source becomes one batch in a canonical journal format.

**Mapping and validation.** **prc-gl-journal-load** loads the **segment mapping table** once per run. For each batch it:
1. maps every source account to the 6-segment combination; an unknown account rejects the batch;
2. checks the GL period is open for the journal date;
3. sums debits and credits per company and currency; any difference rejects the whole batch.

**Loading.** For a valid batch **sys-oracle-ebs-gl-api** inserts the lines into \`GL_INTERFACE\` with one \`GROUP_ID\` per batch, using a bulk insert in one transaction. It then calls a PL/SQL wrapper that submits **Journal Import** with \`FND_REQUEST.SUBMIT_REQUEST\` and returns the request id. The Process API polls the request status every minute. When it completes, any rows left in \`GL_INTERFACE\` with a status code are errors; they are read back and sent to the GL team.

**Duplicates.** A control table holds one row per batch key (source, business date, file name) with its status. If the key is already LOADED, the batch is skipped. If the run crashed after the insert but before import, the leftover \`GROUP_ID\` rows are deleted before the batch is loaded again.

**Alerts.** Rejected batches, Journal Import errors and a missing payroll file on payroll day each send a message to the GL team before 06:00.
`,
  followUps: [
    { q: 'Why reject the whole batch instead of loading the lines that are fine?', a: 'A partial batch leaves the ledger out of balance. The GL team would then hunt for the missing half by hand.' },
    { q: 'Why use GL_INTERFACE instead of inserting journal lines directly?', a: 'Journal Import runs the same validation as manual entry, including cross-validation rules and security. Oracle supports only the open interface for loads.' },
    { q: 'How would you handle a new subledger next year?', a: 'Add a System API for the source and rows in the mapping table. The Process API rules and the GL load stay the same.' },
  ],
}
