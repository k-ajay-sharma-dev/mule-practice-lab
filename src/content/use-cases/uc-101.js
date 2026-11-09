import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-101',
  category: 'use-cases',
  title: 'Daily Order-to-Cash Reconciliation across Salesforce, SAP and Stripe',
  level: 'ADVANCED',
  tags: ['reconciliation', 'salesforce', 'sap', 'payments', 'data-warehouse', 'batch', 'finance'],
  estMinutes: 40,
  diagram: {
    task: 'draw the daily reconciliation run: the job, the three sources behind their System APIs, the staging database where matching happens, the exception report, the data warehouse and the finance dashboard that reads it.',
    checks: [
      { label: 'A scheduled run does the reconciliation', rule: { type: 'node', match: 'batch-job' } },
      { label: 'The run extracts from Salesforce, SAP and Stripe', rule: { type: 'path', from: 'batch-job', to: ['crm', 'erp', 'payment'], min: 3 } },
      { label: 'Every source is reached only through a System API', rule: { type: 'only-via', target: ['crm', 'erp', 'payment'], from: 'system-api' } },
      { label: 'Extracts are staged in a database for matching', rule: { type: 'edge', from: ['batch-job', 'process-api'], to: 'database' } },
      { label: 'Finance receives the exception report', rule: { type: 'edge', from: ['batch-job', 'process-api'], to: 'notification' } },
      { label: 'Matched results feed the data warehouse', rule: { type: 'path', from: 'batch-job', to: 'data-warehouse' } },
      { label: 'The warehouse is not loaded straight from the sources', rule: { type: 'no-path', from: ['crm', 'erp', 'payment'], to: 'data-warehouse' } },
      { label: 'The finance dashboard never queries the source systems', rule: { type: 'no-path', from: 'internal-app', to: ['crm', 'erp', 'payment'] } },
    ],
    reference: diagram(
      {
        job: ['batch-job', 'Reconciliation run (daily 05:00)'],
        ssf: ['system-api', 'sys-salesforce-api (Bulk API 2.0)'],
        sf: ['crm', 'Salesforce (orders)'],
        ssap: ['system-api', 'sys-sap-billing-api'],
        sap: ['erp', 'SAP S/4HANA (billing)'],
        sstr: ['system-api', 'sys-stripe-api'],
        stripe: ['payment', 'Stripe (charges and payouts)'],
        stage: ['database', 'Reconciliation staging (PostgreSQL)'],
        dw: ['data-warehouse', 'Snowflake finance mart'],
        mail: ['notification', 'Exception report to finance'],
        ui: ['internal-app', 'Finance dashboard'],
      },
      [
        'job -> ssf', 'ssf -> sf', 'job -> ssap', 'ssap -> sap', 'job -> sstr', 'sstr -> stripe',
        'job -> stage', 'job -> dw', 'job -> mail', 'ui -> dw',
      ],
    ),
  },
  description: `
An online training company sells subscriptions and courses. Orders are captured in **Salesforce**, card payments run through **Stripe**, and invoices and revenue are booked in **SAP S/4HANA**. Each night several integrations move data between them. Auditors found that about **0.4% of orders** had no invoice or no payment, and nobody noticed for weeks.

Finance wants a **daily reconciliation**:
- Every closed order in Salesforce has an SAP invoice with the same amount and currency.
- Every SAP invoice paid by card has a Stripe charge, and every Stripe charge belongs to an invoice.
- Every Stripe payout matches the sum of its charges minus fees, and is booked in SAP.

Facts:
- About **20,000 orders, 22,000 invoices and 25,000 Stripe balance transactions** a day; month end is three times that.
- Salesforce allows a limited number of API calls per day; SAP is busy with the bill run until 04:30.
- Keys: the Salesforce order number is on the SAP invoice as an external reference; the SAP invoice number is in the Stripe charge metadata.
- The report must be in finance's inbox at **07:00**. Controllers also want trends over months in the finance dashboard.
- The reconciliation must never change data in the sources. Fixing breaks stays a human decision.

**Questions:**
1. How do you extract from three systems without hurting them?
2. Where and how do you match?
3. What does the exception report contain?
4. How do the dashboards get the data?
`,
  answerTemplate: `## Extraction

## Staging and matching

## Exception report

## Warehouse and dashboard
`,
  keyPoints: [
    'One run after the bill run extracts the previous day plus a look-back window from each source through its System API, using bulk or paged read-only calls.',
    'Raw extracts land in staging tables; matching is set-based SQL joins on the business keys, not record-by-record API calls.',
    'Breaks are classified (missing invoice, amount difference, orphan charge, payout gap) with an age, and open breaks roll forward until they clear.',
    'The exception report goes to finance; match results and breaks are loaded to the data warehouse for trend dashboards.',
    'Nothing writes back to the sources, and the dashboard reads the warehouse, never the live systems.',
  ],
  solution: `
\`\`\`
Reconciliation run --> sys-salesforce-api (Bulk API 2.0 query) --> Salesforce
                   --> sys-sap-billing-api (OData, paged)      --> SAP
                   --> sys-stripe-api (balance transactions)   --> Stripe
                   --> staging DB (match in SQL) --> exception report, Snowflake finance mart <-- finance dashboard
\`\`\`

**Extraction.** At 05:00, after the bill run, the job extracts the last day plus a **3 day look-back**, because late payments and invoices arrive after the order. Salesforce is read with one **Bulk API 2.0** query job, which costs a handful of API calls for 20,000 rows. SAP is read through a paged OData service. Stripe balance transactions and payouts are read with cursor paging. Each extract is streamed straight into its staging table with a bulk insert, tagged with the run id.

**Matching.** Matching runs as SQL in the staging database, which joins 70,000 rows in seconds:
1. orders ↔ invoices on order number, comparing amount and currency;
2. invoices ↔ charges on invoice number;
3. payouts ↔ the sum of their charges minus fees, and ↔ the SAP bank posting.

Every row that does not match becomes a **break** with a type, the amounts on each side and the first day it was seen. Breaks from earlier days are checked again; a break that now matches is closed.

**Report.** A CSV and a short summary email go to finance at 07:00: counts and amounts per break type, new breaks first, and breaks older than 5 days highlighted.

**Warehouse.** The match results and breaks are loaded into the **Snowflake finance mart**. The finance dashboard reads only the warehouse, so a controller's query never adds load to Salesforce, SAP or Stripe.

**Read-only.** The System APIs used here expose read operations only. A break is fixed by a person in the source system, and the next run closes it.
`,
  followUps: [
    { q: 'Why match in a database instead of in DataWeave?', a: 'Set-based joins on indexed keys are fast and the staged data stays for audit. Holding 70,000 rows from three sources in Mule memory is fragile.' },
    { q: 'Why look back three days instead of one?', a: 'Payments and invoices often arrive a day or two after the order. A short look-back avoids false breaks that clear themselves.' },
    { q: 'How do you avoid hitting the Salesforce API limit?', a: 'Use one Bulk API 2.0 query job per run. It returns all rows for a few calls instead of thousands of REST calls.' },
  ],
}
