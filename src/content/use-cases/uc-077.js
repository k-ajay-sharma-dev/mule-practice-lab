import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-077',
  category: 'use-cases',
  title: 'Weekly Promotion Prices from SAP to the Online Store',
  level: 'BEGINNER',
  tags: ['pricing', 'scheduler', 'sap', 'e-commerce', 'watermark', 'retail'],
  estMinutes: 15,
  diagram: {
    task: 'draw the price job: SAP behind a System API, the online store behind its own System API, the record of last sent prices, and the report to the merchandising team.',
    checks: [
      { label: 'A scheduled job reads the promotions from SAP', rule: { type: 'path', from: 'batch-job', to: 'erp' } },
      { label: 'SAP is reached only through a System API', rule: { type: 'only-via', target: 'erp', from: 'system-api' } },
      { label: 'Prices reach the online store', rule: { type: 'path', from: 'batch-job', to: 'saas' } },
      { label: 'The online store is reached only through a System API', rule: { type: 'only-via', target: 'saas', from: 'system-api' } },
      { label: 'Only changed prices are sent (last sent price kept per SKU)', rule: { type: 'edge', from: ['batch-job', 'process-api'], to: { type: ['cache', 'database'], label: ['last', 'sent', 'watermark', 'previous', 'history'] } } },
      { label: 'The merchandising team gets a report of updated and failed SKUs', rule: { type: 'path', from: 'batch-job', to: 'notification' } },
      { label: 'System APIs do not call each other; the job does the mapping', rule: { type: 'no-edge', from: 'system-api', to: 'system-api' } },
    ],
    reference: diagram(
      {
        job: ['batch-job', 'Promo price job (Fri 00:00 and Thu 23:59)'],
        serp: ['system-api', 'sys-sap-pricing'],
        sap: ['erp', 'SAP S/4HANA (promotion conditions)'],
        last: ['cache', 'Last sent price per SKU'],
        sshop: ['system-api', 'sys-store-catalog (bulk)'],
        shop: ['saas', 'Online store platform'],
        mail: ['notification', 'Merchandising report email'],
      },
      ['job -> serp', 'serp -> sap', 'job -> last', 'job -> sshop', 'sshop -> shop', 'job -> mail'],
    ),
  },
  description: `
A fashion retailer plans a **weekly promotion** in SAP S/4HANA: sale prices with a valid-from and valid-to date. Promotions run **Friday 00:00 to Thursday 23:59**.

The online store runs on a hosted platform. Today a merchandiser exports a spreadsheet from SAP and uploads it to the store on Thursday night, which fails often and is never on time.

Facts:
- Each promotion changes **8,000 to 15,000 SKUs** out of 60,000.
- The store platform has a product API limited to **4 calls a second**, and a **bulk operation** that takes one file of changes and finishes in a few minutes.
- The store shows the old price crossed out ("compare at" price) next to the sale price.
- SAP exposes the price conditions through an OData service that the team already wraps in a System API.
- The merchandising team wants an email each Friday morning: how many SKUs changed, and which failed.

**Questions:**
1. When does the job run, and what does it send?
2. How do you avoid sending 60,000 prices every week?
3. How do you stay within the store API limit?
4. How do prices go back when the promotion ends?
`,
  answerTemplate: `## Schedule

## Reading SAP

## Delta against last sent prices

## Updating the store

## End of promotion and report
`,
  keyPoints: [
    'A Scheduler at Friday 00:00 reads the prices valid that day from SAP through the pricing System API.',
    'The job compares each SKU with the last price it sent (Object Store) and sends only the changes.',
    'Changes go to the store as one bulk operation through a store System API, not one call per SKU.',
    'The sale price and the compare-at price are set together, so the store shows the saving.',
    'A second run at Thursday 23:59 sends the regular prices back; the report email lists updated and failed SKUs.',
  ],
  solution: `
**Schedule.** A Scheduler with a cron expression starts the job at **Friday 00:00** (store time zone set explicitly). A second run at **Thursday 23:59** handles the end of the promotion. Both runs use the same logic: "send the price that is valid at this moment".

**Reading SAP.** The job calls sys-sap-pricing with the date, and gets the effective price per SKU: the promotion price where one is valid, otherwise the regular price. It also gets the regular price, which becomes the compare-at price.

**Delta.** The job keeps the **last sent price per SKU** in a persistent Object Store. It compares each SKU with that value and keeps only the ones that changed. A normal promotion week sends about 15,000 changes instead of 60,000.

**Updating the store.** DataWeave builds one file of changes in the bulk format of the platform (SKU, price, compare-at price). sys-store-catalog uploads it as a **bulk operation** and polls its status until it finishes. 15,000 single calls at 4 a second would take more than an hour and run past midnight. The bulk operation takes a few minutes. When the result file comes back, the job stores the new prices for the SKUs that succeeded only. Failed SKUs keep their old value, so the next run tries them again.

**End of promotion and report.** At Thursday 23:59 the effective price is the regular price again. The delta finds the promoted SKUs and sends them back, with an empty compare-at price. After each run the job emails merchandising: number of SKUs changed, number failed, and the list of failures with the reason from the platform.
`,
  followUps: [
    { q: 'Why keep the last sent price instead of asking the store for its current price?', a: 'Reading 60,000 prices from the store would cost thousands of calls against a limit of 4 a second. A local copy answers the same question for free.' },
    { q: 'What if someone changes a price by hand in the store?', a: 'The local copy no longer matches the store. A weekly full comparison against a store export finds such drift and corrects it.' },
    { q: 'Why does the job run at midnight and not on Thursday evening?', a: 'The store shows whatever price it holds. Sending early would show sale prices before the promotion starts.' },
  ],
}
