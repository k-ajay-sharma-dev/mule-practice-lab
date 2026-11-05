import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-030',
  category: 'use-cases',
  title: 'Approved Expense Reports to Finance',
  level: 'BEGINNER',
  tags: ['scheduler', 'erp', 'journal-entries', 'mapping', 'finance'],
  estMinutes: 15,
  diagram: {
    task: 'draw the integration that picks up approved expense reports, books them in Dynamics 365 Finance and marks them Exported, including where the GL mapping lives and how finance hears about failures.',
    checks: [
      { label: 'A scheduled job picks up approved reports', rule: { type: 'node', match: 'batch-job' } },
      { label: 'The job reads approved reports from the expense tool', rule: { type: 'path', from: 'batch-job', to: ['saas', 'external-api'] } },
      { label: 'The job posts journals and payables to the ERP', rule: { type: 'path', from: 'batch-job', to: 'erp' } },
      { label: 'The ERP is reached only through a System API', rule: { type: 'only-via', target: 'erp', from: 'system-api' } },
      { label: 'The expense tool is reached only through a System API', rule: { type: 'only-via', target: 'saas', from: 'system-api' } },
      { label: 'The category → GL mapping is read from a store outside the code', rule: { type: 'edge', from: ['batch-job', 'process-api', 'system-api'], to: ['database', 'cache', 'file-store'] } },
      { label: 'Finance receives the list of failed reports', rule: { type: 'edge', from: ['batch-job', 'process-api', 'system-api'], to: 'notification' } },
    ],
    reference: diagram(
      {
        job: ['batch-job', 'Approved-expense poller (hourly)'],
        sexp: ['system-api', 'sys-expense-tool-api'],
        serp: ['system-api', 'sys-d365-finance-api'],
        exp: ['saas', 'Expense management tool'],
        erp: ['erp', 'Dynamics 365 Finance'],
        map: ['database', 'Category → GL mapping table'],
        mail: ['notification', 'Daily error list to finance'],
      },
      ['job -> sexp', 'sexp -> exp', 'job -> map', 'job -> serp', 'serp -> erp', 'job -> mail'],
    ),
  },
  description: `
A consulting firm with 1,200 employees uses a SaaS **expense management tool**. When a manager approves an expense report, finance must **book it in the ERP** (Microsoft Dynamics 365 Finance) and **reimburse the employee** in the next payment run.

Facts:
- The expense tool has a REST API: list reports by status and approval date; each report has lines (category, amount, currency, VAT, project code, receipt URL).
- ~250 approved reports/week, average 6 lines; month end can see 600 in two days.
- Finance wants: one **journal** per report (expense accounts by category, VAT, cost centre/project) and one **vendor invoice / employee payable** so the employee is paid in the Thursday payment run.
- Expense categories must be mapped to general-ledger accounts; finance changes this mapping a few times a year.
- After posting, the expense tool should show the report as **"Exported"** so it cannot be edited.

**Describe your solution:**
- How do you pick up approved reports?
- How do you map categories to GL accounts without redeploying?
- How do you prevent double booking?
- What happens if a report fails in the ERP (e.g. closed project code)?
`,
  answerTemplate: `## Trigger

## Mapping

## Posting and status update

## Errors and duplicates
`,
  keyPoints: [
    'Scheduler (e.g. hourly, or a webhook if available) fetches reports with status Approved and not yet exported.',
    'Category to GL-account mapping kept outside the code (lookup table/config file/ERP table) and loaded at runtime.',
    'One journal per report built in DataWeave, with expense lines, VAT and balancing payable line to the employee vendor.',
    'Report ID used as external reference in the ERP; check before posting so reruns do not double book.',
    'Report set to Exported only after the ERP confirms; failures returned to finance with the reason and left in a retry/error state.',
  ],
  solution: `
**Trigger.** A Scheduler every hour (more often at month end) calls the expense API for reports with status **Approved** that are not yet exported. If the tool offers an "approved" webhook, use it and keep the scheduled poll as a safety net.

**Mapping.** DataWeave builds one journal per report:
- one debit line per expense line: GL account looked up from the **category → account mapping**, dimensions = cost centre of the employee and project code, amount in company currency;
- VAT lines where VAT is reclaimable;
- one credit line to the **employee's vendor account** (employees exist as vendors in the ERP, looked up by employee number).

The mapping table lives outside the code: a small database table, a CSV in a config location, or a custom table in the ERP. It is loaded and cached at the start of the run. Finance can change it without a deployment. Unknown category → report goes to the error list, it is not posted to a "suspense" account silently.

**Posting and status update.**
1. Search the ERP for an existing document with external reference = **expense report ID**; if found, skip posting (already booked).
2. Post the journal / vendor invoice via the ERP's OData API.
3. On success, mark the report **Exported** in the expense tool and store the ERP document number on it.

Because of step 1, if the flow crashes between steps 2 and 3, the next run just marks it exported — no double booking.

**Errors.** Business errors from the ERP (closed project, blocked vendor) are not retried; the report is flagged with the error message and finance receives a daily list. Technical errors (timeouts, 5xx) are retried on the next run. Receipts stay in the expense tool; the journal carries the receipt URL for auditors.
`,
  followUps: [
    { q: 'How do foreign-currency expenses work?', a: 'The expense tool usually stores the original and converted amount; book the company-currency amount (with the rate used) so the reimbursement matches what the employee was promised.' },
    { q: 'How would you test the mapping?', a: 'MUnit tests with sample reports covering each category, multi-line VAT, unknown category and an already-posted report; mock the ERP and expense API.' },
  ],
}
