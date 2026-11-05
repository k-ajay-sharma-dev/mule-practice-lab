import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-027',
  category: 'use-cases',
  title: 'Daily Currency Rates Distribution',
  level: 'INTERMEDIATE',
  tags: ['scheduler', 'fx-rates', 'fan-out', 'object-store', 'finance'],
  estMinutes: 15,
  diagram: {
    task: 'draw the rates job: fetching once from the provider, the stored copy, the fan-out to SAP, the e-commerce platform and S3, and the treasury alert.',
    checks: [
      { label: 'A scheduled job fetches rates from the provider', rule: { type: 'path', from: 'batch-job', to: 'external-api' } },
      { label: 'Rates are stored once so each target can be re-delivered', rule: { type: 'edge', from: ['batch-job', 'process-api'], to: ['cache', 'database'] } },
      { label: 'Rates reach SAP', rule: { type: 'path', from: 'batch-job', to: 'erp' } },
      { label: 'Rates (with markup) reach the e-commerce platform', rule: { type: 'path', from: 'batch-job', to: ['saas', 'web-app'] } },
      { label: 'All pairs land as CSV for the warehouse', rule: { type: 'path', from: 'batch-job', to: ['file-store', 'data-warehouse'] } },
      { label: 'SAP is reached only through a System API', rule: { type: 'only-via', target: 'erp', from: 'system-api' } },
      { label: 'Treasury is alerted about missing or suspicious rates', rule: { type: 'edge', from: ['batch-job', 'process-api', 'system-api'], to: 'notification' } },
    ],
    reference: diagram(
      {
        job: ['batch-job', 'FX rates job (17:05 CET, retries to 18:00)'],
        sfx: ['system-api', 'sys-fx-provider-api'],
        fx: ['external-api', 'Market-data FX provider'],
        os: ['cache', 'Rates by date (persistent Object Store)'],
        ssap: ['system-api', 'sys-sap-fx-api'],
        sap: ['erp', 'SAP S/4HANA'],
        secom: ['system-api', 'sys-ecommerce-pricelist-api'],
        ecom: ['saas', 'E-commerce platform'],
        s3: ['file-store', 'S3 (warehouse CSV)'],
        alert: ['notification', 'Treasury alert / daily summary'],
      },
      ['job -> sfx', 'sfx -> fx', 'job -> os', 'job -> ssap', 'ssap -> sap', 'job -> secom', 'secom -> ecom', 'job -> s3', 'job -> alert'],
    ),
  },
  description: `
A retail group sells in 14 currencies. Treasury buys a **foreign-exchange rates feed** from a market-data provider (REST API, JSON). Several internal systems need the rates every business day.

| System | Needs | How it accepts data |
|---|---|---|
| **SAP S/4HANA** (ERP) | ~30 currency pairs, end-of-day rate | Inbound IDoc / OData API |
| **E-commerce platform** | 14 display currencies, with a 2% markup | REST API (bulk price-list endpoint) |
| **Data warehouse** | All ~170 pairs, full history | Files on S3 (CSV) |

Facts:
- The provider publishes end-of-day rates at **17:00 CET**; the API is sometimes late by up to an hour and has a limit of **100 calls/day**.
- ERP must have the rates **before 18:30 CET**, when the nightly invoicing run starts.
- If today's rate is missing, finance prefers to **keep yesterday's rate** rather than fail invoicing — but they must know about it.

**Describe your solution:**
- How do you trigger the job and handle a late feed?
- How do you fetch once and deliver to three systems with different formats?
- What happens if one target system is down?
- How do you avoid using a bad rate (e.g. 0 or a 50% jump)?
`,
  answerTemplate: `## Trigger and retries

## Fetch once, fan out

## Mapping per target

## Validation of rates

## Error handling and alerting
`,
  keyPoints: [
    'Scheduler (cron, CET timezone) polls after 17:00 with a bounded retry window, well inside the 100 calls/day limit.',
    'Rates fetched once and stored (Object Store / staging) so each target can be delivered or re-delivered independently.',
    'Separate mappings per target: ERP pairs, e-commerce with markup, full CSV for the warehouse.',
    'Sanity checks before distribution: non-zero, positive, and within a tolerance of yesterday (e.g. 10%), else hold and alert.',
    'Failure of one target does not block the others; failed deliveries are retried and treasury is alerted when yesterday\'s rate stays in force.',
  ],
  solution: `
**Trigger and retries.** A Scheduler with a cron expression (timezone **Europe/Paris**) fires at 17:05 on business days. If the provider responds without today's date, the flow waits and retries every 10 minutes until 18:00 (about 6–7 calls, far below the 100/day limit). After 18:00 the job gives up, keeps yesterday's rates in all systems and sends an alert to treasury.

**Fetch once, fan out.** One System API call to the provider gets all ~170 pairs. The validated payload is stored in a **persistent Object Store** (key = rate date) and then distributed. A **Scatter-Gather** (or three independent flows triggered by a VM/Anypoint MQ message) delivers to the targets in parallel. Keeping the stored copy means a failed target can be re-sent later without calling the provider again.

**Mapping per target (DataWeave).**
- **ERP**: filter to the ~30 configured pairs (list in properties), map to the exchange-rate structure the ERP expects (rate type, from/to currency, valid-from date, rate), sent via the SAP connector or OData API.
- **E-commerce**: filter to the 14 display currencies, apply the 2% markup and round to 4 decimals; send as one bulk call.
- **Warehouse**: all pairs as CSV (\`output application/csv\`) written to S3 with the date in the file name.

**Validation of rates.** Before fan-out: every rate > 0, all required pairs present, and change vs yesterday below a threshold (e.g. 10%). A suspicious rate stops distribution of that pair and alerts treasury, who can approve it manually (e.g. a small approval endpoint or a re-run with an override flag).

**Error handling.** Each target branch has its own error handler with retry (Until Successful, 3 attempts with backoff). In Scatter-Gather, catch errors per route so that a down warehouse does not prevent ERP from getting rates before 18:30. A summary (pairs loaded, targets OK/failed) goes to the treasury mailbox or Slack channel daily.
`,
  followUps: [
    { q: 'Why not let each system call the rates provider itself?', a: 'That triples the calls against a limited quota, spreads the credentials and gives three slightly different rates. Fetching once makes the ERP, shop and warehouse consistent and gives one place to validate.' },
    { q: 'How would you handle a bank holiday when the provider publishes nothing?', a: 'Use a business calendar (property list or a small lookup) to skip the run, or treat "no new date" as normal on holidays without raising a critical alert.' },
    { q: 'How do you reload last Tuesday\'s rates into ERP only?', a: 'Expose a small admin endpoint or parameterised run: date + target. It reads the stored copy (or re-fetches the historical date) and replays only that branch.' },
  ],
}
