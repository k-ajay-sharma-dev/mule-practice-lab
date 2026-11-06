import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-032',
  category: 'architecture',
  title: 'Designing Around SaaS API Rate Limits',
  level: 'INTERMEDIATE',
  tags: ['rate-limits', 'salesforce', 'bulk-api', 'queuing', 'throttling'],
  estMinutes: 25,
  diagram: {
    task: 'draw how orders, nightly invoices and customer updates reach Salesforce without exhausting the API allocation: where bursts are buffered, how calls are grouped, and how usage is watched.',
    checks: [
      { label: 'Real-time order and customer events are buffered in queues', rule: { type: 'edge', to: 'queue', kind: 'async', min: 2 } },
      { label: 'Every queue is drained by a consumer at a controlled rate', rule: { type: 'each', of: 'queue', edgeTo: ['process-api', 'system-api', 'batch-job'] } },
      { label: 'Salesforce is reached only through a System API', rule: { type: 'only-via', target: 'crm', from: 'system-api' } },
      { label: 'The nightly invoice load is a scheduled bulk job', rule: { type: 'edge', from: 'batch-job', to: 'system-api' } },
      { label: 'Source systems never call Salesforce once per event', rule: { type: 'no-edge', from: ['saas', 'erp'], to: ['system-api', 'crm'] } },
      { label: 'Reference data and the throttle flag are cached', rule: { type: 'edge', from: ['process-api', 'system-api'], to: 'cache' } },
      { label: 'API allocation usage is monitored and alerted', rule: { type: 'edge', to: 'monitoring' } },
      { label: 'Every line to or from a queue or topic is an async message', rule: { type: 'lines', touching: ['queue', 'topic', 'event-stream', 'cloud-queue', 'dlq'], kind: 'async' } },
      { label: 'Reads and writes to a data store are sync calls', rule: { type: 'lines', to: ['database', 'oracle-db', 'sql-server', 'cache'], kind: 'sync' } },
    ],
    reference: diagram(
      {
        ecom: ['saas', 'E-commerce platform'],
        sup: ['saas', 'Support tool'],
        bil: ['erp', 'Billing system'],
        oq: ['queue', 'order-events-q'],
        cq: ['queue', 'customer-updates-q'],
        oc: ['process-api', 'prc-order-sync (batches via Collections)'],
        cc: ['process-api', 'prc-customer-sync (upsert by external ID)'],
        job: ['batch-job', 'Nightly invoice load (Bulk API 2.0)'],
        ssf: ['system-api', 'sys-salesforce-api'],
        sf: ['crm', 'Salesforce'],
        c: ['cache', 'Reference data + throttle flag'],
        mon: ['monitoring', 'Limits usage alerts (60% / 80%)'],
      },
      [
        'ecom ~> oq', 'sup ~> cq', 'oq ~> oc', 'cq ~> cc',
        'oc -> ssf', 'cc -> ssf', 'job -> bil', 'job -> ssf',
        'ssf -> sf', 'oc -> c', 'cc -> c', 'ssf -> mon',
      ],
    ),
  },
  description: `
A subscription business syncs data into **Salesforce** from several sources through Mule:

| Flow | Volume | Timing |
|---|---|---|
| Order events from e-commerce | 30,000/day, peaks of 50/s during sales | Real time |
| Nightly invoice update from billing | 200,000 records | 01:00 |
| Customer updates from support tool | 5,000/day | Real time |
| Ad-hoc data fixes by admins | unpredictable | Any time |

The org has a **daily API request allocation** and concurrency limits on long-running requests (exact numbers depend on edition and licences). Last month the allocation was exhausted at 16:00 on a sale day; all integrations — including the critical order flow — started failing with \`REQUEST_LIMIT_EXCEEDED\`.

**Questions:**
- How do you reduce the number of API calls for each flow?
- How do you protect the critical order flow from less important consumers of the same allocation?
- How do you handle bursts that exceed what Salesforce should receive per second?
- What do you monitor so you see the problem before 16:00?
`,
  answerTemplate: `## Reduce API calls per flow

## Prioritise critical traffic

## Absorb bursts

## Monitoring and alerting
`,
  keyPoints: [
    'Choose the API by volume: Bulk API (2.0) for large nightly loads, composite/collection calls (sObject Collections, Composite) to group up to many records per request for near-real-time flows.',
    'Buffer real-time events in a queue and consume them in small batches at a controlled rate instead of one Salesforce call per event.',
    'Separate allocation budgets per integration (e.g. distinct integration users and internal quotas), with the critical order flow getting priority and less critical flows throttled first.',
    'Handle limit errors explicitly: classify them as retryable-later, back off, and do not hammer the API with immediate retries.',
    'Monitor remaining allocation (Salesforce returns limit usage; the Limits REST resource exposes it) and alert at thresholds like 60% and 80%.',
    'Avoid needless calls: upsert by external ID instead of query-then-update, cache reference data, skip unchanged records.',
  ],
  solution: `
**Reduce calls per flow.**
- **Invoices (200k nightly):** Salesforce **Bulk API 2.0** via the Salesforce connector — processed asynchronously in Salesforce and far more efficient in API requests than 200k single calls. Schedule outside business peaks.
- **Orders (30k/day):** do not call per event. Put events on a queue (Anypoint MQ), consume and group, e.g. every few seconds or every 200 records, then use **sObject Collections / Composite** requests (many records per call). Thousands of calls instead of 30,000.
- **Customer updates:** **upsert by External ID** — one call, no prior query. Skip records whose relevant fields did not change (compare hash).
- Cache picklists/record types/lookups in an Object Store with TTL instead of querying each time.

**Prioritise critical traffic.**
- Use separate **integration users / connected apps** per flow so usage is attributable.
- Define an internal budget: e.g. orders may use up to X% per day; nightly batch Y%; ad-hoc admin tools must use Bulk API or run off-peak.
- When usage passes a threshold, a "throttle" flag (in config/Object Store) **pauses non-critical consumers** (support sync goes to queue-only), protecting orders.

**Absorb bursts.**
- The queue is the shock absorber: producers publish at 50/s, the consumer drains at a safe rate with limited concurrency (e.g. \`maxConcurrency\` on the consuming flow, limited prefetch).
- On \`REQUEST_LIMIT_EXCEEDED\` or 429/503-like responses: stop consuming (or nack with delay), back off exponentially, let messages wait in the queue — **do not** retry immediately.
- Make processing idempotent (upsert by external ID) so redelivery is safe.

**Monitoring.**
- Poll Salesforce's **Limits** resource (or read limit info in response headers) every few minutes; publish as a custom metric.
- Alert at 60% / 80% of daily allocation, and on queue depth/age growing.
- Dashboard of calls per integration user to find the noisy consumer.

**Result:** a sale-day burst becomes a longer queue, not an outage, and the critical flow keeps its budget.
`,
  followUps: [
    { q: 'Why not just buy more API capacity?', a: 'Sometimes it is the right answer, but it raises cost every year and hides inefficient design. Batching and Bulk API usually reduce calls by an order of magnitude first; buy capacity for genuine growth.' },
    { q: 'Does Bulk API make the data appear instantly?', a: 'No, bulk jobs are asynchronous; you submit, Salesforce processes, and you poll job status and fetch failed records. It suits large volumes where minutes of delay are acceptable.' },
  ],
}
