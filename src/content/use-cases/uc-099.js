import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-099',
  category: 'use-cases',
  title: 'Intercompany Invoices between NetSuite Subsidiaries and the SAP Parent',
  level: 'INTERMEDIATE',
  tags: ['netsuite', 'sap', 'intercompany', 'idempotency', 'reconciliation', 'api-led', 'finance'],
  estMinutes: 30,
  diagram: {
    task: 'draw the intercompany integration: the poller, one Process API that owns the matching rules, a System API per ERP, the pair table that records each invoice pair, and the daily mismatch report to group accounting.',
    checks: [
      { label: 'Both ERPs are reached only through System APIs', rule: { type: 'only-via', target: 'erp', from: 'system-api' } },
      { label: 'Each System API serves exactly one ERP', rule: { type: 'each', of: 'system-api', edgeTo: 'erp', count: 1, max: 1, min: 2 } },
      { label: 'One Process API between the poller and both ERPs owns the intercompany rules', rule: { type: 'path', from: 'batch-job', via: 'process-api', to: 'erp', min: 2 } },
      { label: 'Each invoice pair is recorded, so a rerun does not post it twice', rule: { type: 'edge', from: 'process-api', to: 'database' } },
      { label: 'The two System APIs do not call each other', rule: { type: 'no-edge', from: 'system-api', to: 'system-api' } },
      { label: 'The System APIs do not write the pair table', rule: { type: 'no-edge', from: 'system-api', to: 'database' } },
      { label: 'Group accounting gets the daily mismatch report', rule: { type: 'path', from: 'batch-job', to: 'notification' } },
    ],
    reference: diagram(
      {
        job: ['batch-job', 'Intercompany poller (every 30 min)', { timeoutMs: 30000 }],
        prc: ['process-api', 'prc-intercompany', { timeoutMs: 30000 }],
        sns: ['system-api', 'sys-netsuite-api'],
        ns: ['erp', 'NetSuite (US subsidiaries)'],
        ssap: ['system-api', 'sys-sap-finance-api', { timeoutMs: 30000, retries: 2 }],
        sap: ['erp', 'SAP S/4HANA (parent)'],
        pair: ['database', 'Intercompany pair table'],
        rec: ['batch-job', 'Daily mismatch report (07:00)'],
        mail: ['notification', 'Mismatch report to group accounting'],
      },
      ['job -> prc', 'prc -> sns', 'sns -> ns', 'prc -> ssap', 'ssap -> sap', 'prc -> pair', 'rec -> pair', 'rec -> mail'],
    ),
    simulation: {
      systems: [
        { match: 'erp', latencyMs: 600 },
        { match: 'database', latencyMs: 20 },
      ],
      tests: [
        {
          name: 'SAP posts slowly at month end',
          about: 'At month end the poller sends 1 IC invoice a second for 30 minutes, and SAP takes 15 seconds to post each vendor invoice. Every invoice must still reach both sides.',
          traffic: [{ name: 'IC invoices', from: { type: 'batch-job', label: 'poller' }, rps: 1, forMin: 30, to: 'erp', kind: 'write' }],
          incidents: [{ slow: { type: 'erp', label: 'SAP' }, latencyMs: 15000 }],
          durationMin: 40,
          expect: { answers: [{ minSuccess: 0.99 }] },
        },
        {
          name: 'SAP fails some postings',
          about: 'The poller sends 1 IC invoice a second for 30 minutes, and SAP fails 1 posting in 10. The pair table makes a retry safe, so almost every invoice is posted once.',
          traffic: [{ name: 'IC invoices', from: { type: 'batch-job', label: 'poller' }, rps: 1, forMin: 30, to: 'erp', kind: 'write' }],
          incidents: [{ errors: { type: 'erp', label: 'SAP' }, rate: 0.1 }],
          durationMin: 40,
          expect: { answers: [{ minSuccess: 0.99 }] },
        },
      ],
    },
  },
  description: `
A European parent company runs **SAP S/4HANA**. It bought four US companies that stay on **NetSuite** as subsidiaries. They trade with each other: the parent ships goods to the US companies and charges a monthly management fee; the US companies charge the parent for shared services.

Every intercompany (IC) invoice must exist on **both sides**: as a sales invoice in the seller's ERP and as a matching vendor invoice in the buyer's ERP. Today both sides key them by hand and the month-end elimination is off by about 300,000 EUR every month.

Facts:
- About **1,500 IC invoices a month**, both directions. Invoices are in USD or EUR; the seller's currency is used on both sides.
- An IC invoice is flagged by the customer: in SAP a trading partner on the customer, in NetSuite an intercompany customer record.
- The buyer side must use the **same invoice number, amount, currency and date**. Only the accounts differ, from an IC mapping table.
- Credit notes follow the same rules.
- In the tests the poller sends 1 IC invoice a second at month end. SAP can take 15 seconds per posting or fail 1 posting in 10.
- Group accounting wants a **daily list of mismatches**: invoices on one side only, or with different amounts.

**Questions:**
1. How do you detect new IC invoices on each side?
2. Where do the rules live, and how do you keep the two ERPs from knowing about each other?
3. How do you stop the buyer invoice from being posted twice?
4. How is the mismatch report built?
`,
  answerTemplate: `## Detection

## Rules and layering

## Duplicates

## Mismatch report
`,
  keyPoints: [
    'A poller reads new IC invoices from both ERPs through their System APIs, using a watermark per side.',
    'One Process API owns the IC rules (which entity buys, account mapping, currency) and posts the buyer invoice through the other ERP System API.',
    'The System APIs only speak to their own ERP; they never call each other or hold business state.',
    'A pair table keyed by seller entity and invoice number records each pair and its status, so reruns do not post twice.',
    'A daily job reads the pair table and lists one-sided or unequal pairs for group accounting.',
  ],
  solution: `
**Detection.** Every 30 minutes the poller calls **prc-intercompany**. It asks **sys-netsuite-api** for invoices to intercompany customers created since the NetSuite watermark, and **sys-sap-finance-api** for billing documents with a trading partner since the SAP watermark.

**Rules.** The Process API decides for each invoice:
- which entity is the buyer (from the IC customer or trading partner);
- the buyer accounts from the IC mapping table (expense or inventory account, IC payable account);
- the amount and currency, unchanged from the seller.

It then posts a vendor invoice through the buyer's System API: \`sys-sap-finance-api\` (supplier invoice API) or \`sys-netsuite-api\` (vendor bill). The System APIs only translate to their own ERP. They do not know the other ERP exists, so either side can be replaced later.

**Duplicates.** Before posting, the Process API inserts a row in the **pair table** with a unique key on seller entity plus invoice number, status \`POSTING\`. If the row already exists with \`POSTED\`, the invoice is skipped. After posting, it stores the buyer document number and sets \`POSTED\`. If a run crashed during posting, the next run searches the buyer ERP by external reference before trying again.

**Mismatch report.** At 07:00 a job reads the pair table and lists:
- seller invoices with no buyer document after 24 hours;
- pairs whose amounts differ (for example a buyer edited the bill);
- credit notes without their invoice.

The report goes to group accounting by email, and the same rows feed the month-end elimination check.
`,
  followUps: [
    { q: 'Why not let sys-netsuite-api call sys-sap-finance-api directly?', a: 'Then the NetSuite System API would hold intercompany rules and depend on SAP. Keeping the rules in the Process API leaves each System API reusable and replaceable.' },
    { q: 'What do you do if the buyer period is already closed?', a: 'Post with the first open date and record both dates in the pair table. The mismatch report flags it so accounting can agree the cut-off.' },
    { q: 'How would you handle exchange differences at month end?', a: 'Both sides carry the seller currency, so the invoice itself matches. Revaluation differences are handled by the consolidation tool, not by the integration.' },
  ],
}
