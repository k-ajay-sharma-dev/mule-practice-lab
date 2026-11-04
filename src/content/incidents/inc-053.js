export default {
  id: 'inc-053',
  category: 'incidents',
  title: 'New Partner Portal Starves the Shared Pricing Process API',
  level: 'ADVANCED',
  tags: ['api-led', 'rate-limiting', 'sla-tiers', 'noisy-neighbour', 'capacity-planning'],
  estMinutes: 40,
  investigation: {
    logs: [
      { text: '06:04:10.102 INFO  [prc-pricing-api] GET /api/prices/100233 client=exp-partner-portal-api corrId=pp-0001a', relevant: true, why: 'Single-SKU calls from the new partner portal: one of ~40,000 fired from 06:00 with 50 parallel threads.' },
      { text: '06:04:10.103 INFO  [prc-pricing-api] GET /api/prices/100234 client=exp-partner-portal-api corrId=pp-0001b', relevant: false },
      { text: '06:04:11.500 INFO  [prc-pricing-api] GET /api/prices/552019 client=exp-pos-api corrId=pos-77c1', relevant: false },
      { text: "06:04:12.880 WARN  [prc-pricing-api] Flow 'get-price-flow' is unable to accept new events at this time (maxConcurrency reached)", relevant: true, why: 'The shared Process API is saturated: new requests from every consumer are rejected with 503 while in-flight ones wait behind the bulk workload.' },
      { text: "06:04:14.512 ERROR [exp-pos-api]     HTTP:TIMEOUT HTTP GET on resource 'https://prc-pricing-api.internal/api/prices/552019' failed: Timeout exceeded. corrId=pos-77c1", relevant: true, why: 'A critical channel (POS) times out although its own traffic is normal: a noisy-neighbour symptom.' },
      { text: "06:04:15.020 ERROR [exp-web-api]     HTTP:SERVICE_UNAVAILABLE HTTP GET on resource 'https://prc-pricing-api.internal/api/prices/300871' failed: service unavailable (503). corrId=web-41ba", relevant: false },
      { text: '06:04:15.311 WARN  [sys-sap-pricing-api] SAP response time p95=2.9s (normal 0.3s)', relevant: true, why: 'The load also reaches SAP, ~10x slower; scaling the Process API alone would just move the queue.' },
      { text: '[analytics] 06:00-07:30 prc-pricing-api calls by client: exp-partner-portal-api 70%, exp-web-api 17%, exp-pos-api 9%, exp-mobile-api 4% (all on default tier, no limit)', relevant: true, why: 'One consumer dominates and nothing limits it: all contracts share one unlimited tier.' },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Why can one consumer hurt all the others?',
        options: [
          'They share the Process API replicas, concurrency and SAP backend, and all contracts are on one unlimited tier, so the bulk workload consumes the shared capacity',
          'The partner portal sends malformed requests that crash prc-pricing-api',
          'The POS and web shop use outdated client credentials',
          'SAP has a nightly batch at 06:00',
        ],
        answer: 0,
        explain: 'A bulk batch disguised as interactive traffic fills the shared queues. Without SLA tiers nothing prioritises POS and web.',
      },
      {
        type: 'multi',
        prompt: 'Which are good **immediate** mitigations?',
        options: [
          'Ask the portal team to pause or reschedule the 06:00 job today',
          'Move the portal contract to a restricted SLA tier with Rate Limiting - SLA based (e.g. 20 req/s)',
          'Revoke all contracts and re-approve them one by one',
          'Scale prc-pricing-api to 10 replicas and change nothing else',
        ],
        answer: [0, 1],
        explain: 'Limit the noisy consumer. Scaling the middle layer pushes even more load onto an already slow SAP; revoking everyone causes a bigger outage.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the **permanent fix**?',
        options: [
          'SLA tiers (Critical, Standard, Bulk) with manual approval for high tiers',
          'A bulk endpoint (POST /prices/search, up to ~500 SKUs) or a nightly price file / price-changed event feed',
          'Caching in prc-pricing-api and a separate bulk deployment (bulkhead) if bulk API traffic must remain',
          'Removing the single-SKU GET endpoint for all consumers',
        ],
        answer: [0, 1, 2],
        explain: 'Govern consumption, give bulk use cases the right interface and isolate them. The single-SKU GET is right for interactive POS and web use.',
      },
      {
        type: 'single',
        prompt: 'What should change in **consumer onboarding**?',
        options: [
          'Contract requests for shared APIs declare volume, peak time, call pattern and criticality; high-volume requests are reviewed and load-tested',
          'Keep auto-approval but email the API owner',
          'Block all new consumers of shared APIs',
          'Only allow consumers from the same business group',
        ],
        answer: 0,
        explain: 'Capacity planning becomes part of approval, so success (more consumers) does not cause outages.',
      },
    ],
  },
  description: `
## Symptoms
- \`prc-pricing-api\` is reused by the web shop (\`exp-web-api\`), the mobile app (\`exp-mobile-api\`) and the in-store POS (\`exp-pos-api\`). It has been stable for a year: p95 ~150 ms.
- Since Wednesday, between **06:00 and 07:30** p95 jumps to 4–8 s, the POS shows prices slowly, and the web shop sees **503** errors.
- API analytics show one client application, \`exp-partner-portal-api\`, making **~70% of all calls** in that window.

## Change / Context
- On Monday, a new B2B partner portal went live. Its Experience API fetches prices for each partner's full catalogue (~40,000 SKUs) at 06:00, calling \`GET /prices/{sku}\` **one SKU at a time** with 50 parallel threads.
- \`prc-pricing-api\` runs on 2 replicas and calls \`sys-sap-pricing-api\` and \`sys-promo-api\`. Its only policy is Client ID Enforcement; all consumers have contracts on the same default tier with no limits.
- The partner portal team asked for access through a self-service contract request, which was approved automatically.

## Logs
\`\`\`
06:04:10.102 INFO  [prc-pricing-api] GET /api/prices/100233 client=exp-partner-portal-api corrId=pp-0001a
06:04:10.103 INFO  [prc-pricing-api] GET /api/prices/100234 client=exp-partner-portal-api corrId=pp-0001b
06:04:12.880 WARN  [prc-pricing-api] Flow 'get-price-flow' is unable to accept new events at this time (maxConcurrency reached)
06:04:14.512 ERROR [exp-pos-api]     HTTP:TIMEOUT HTTP GET on resource 'https://prc-pricing-api.internal/api/prices/552019' failed: Timeout exceeded. corrId=pos-77c1
06:04:15.020 ERROR [exp-web-api]     HTTP:SERVICE_UNAVAILABLE HTTP GET on resource 'https://prc-pricing-api.internal/api/prices/300871' failed: service unavailable (503). corrId=web-41ba
06:04:15.311 WARN  [sys-sap-pricing-api] SAP response time p95=2.9s (normal 0.3s)
\`\`\`

## Your tasks
1. Diagnose the problem and explain why one consumer can hurt all the others.
2. What is the immediate mitigation that protects stores and the web shop?
3. What is the root cause?
4. Design a permanent fix (policies, API design, and capacity).
5. What should change in the consumer onboarding process?
`,
  answerTemplate: `## Diagnosis

## Immediate mitigation

## Root cause

## Permanent fix

## Prevention
`,
  keyPoints: [
    'Identifies a noisy-neighbour problem on a reused Process API: one new consumer\'s bulk, chatty workload consumes shared capacity (replicas, concurrency, downstream SAP) and degrades critical channels.',
    'Notes that reuse without consumption governance is the risk: all consumers on one unlimited tier, auto-approved contracts, no capacity check.',
    'Immediate: apply rate limiting for the partner portal\'s client (SLA-based tier or a limit keyed on client ID) and/or ask the team to pause the 06:00 job, prioritising POS and web.',
    'Permanent fix: SLA tiers with Rate Limiting – SLA based policy and manual approval for high tiers; a bulk/batch pricing endpoint or an event/file feed for full-catalogue needs; caching; separate deployment or capacity for bulk traffic.',
    'Capacity planning per consumer: expected volume and pattern are part of contract approval, and load is tested before go-live.',
    'Prevention: per-client analytics and alerts, consumer onboarding checklist, and design guidance discouraging N+1 call patterns for bulk use cases.',
  ],
  solution: `
**Diagnosis.** \`prc-pricing-api\` is a shared resource. The new portal fires 40,000 single-SKU calls with 50 parallel threads every morning — a **bulk batch workload disguised as interactive traffic**. It saturates the Process API's concurrency (maxConcurrency reached → back-pressure 503s for new requests, while in-flight ones wait) and pushes \`sys-sap-pricing-api\` to 10x normal latency. POS and web traffic sit in the same queues, so they time out. All consumers share one unlimited tier, so nothing prioritises or limits anyone.

\`\`\`
exp-pos-api   ----\\
exp-web-api   -----+--> prc-pricing-api (2 replicas, shared) --> sys-sap-pricing-api --> SAP
exp-mobile-api ---/            ^
exp-partner-portal-api ========+  40k calls @ 06:00, 50 threads
\`\`\`

**Immediate mitigation.**
- Ask the portal team to pause/reschedule the 06:00 job today (fastest).
- In API Manager, apply a limit to the portal's client: move its contract to a restricted **SLA tier** with Rate Limiting – SLA based (e.g. 20 req/s), or as a quick measure a Rate Limiting policy keyed on client ID, with a limit that POS and web stay well below. Give the other consumers a tier with a high limit for now.
- Temporarily add a replica to \`prc-pricing-api\` if SAP can take it — but SAP is also degraded, so limiting is the real fix.

**Root cause.** The API was reused (good) but **consumption was not governed**: contracts auto-approved, no SLA tiers, no capacity check of the new consumer's pattern, and an API design (single-SKU GET) that invites N+1 calls for a bulk use case.

**Permanent fix.**
1. **SLA tiers** on \`prc-pricing-api\`: e.g. *Critical* (POS, web — high limits, manual approval), *Standard* (100 req/s), *Bulk* (20 req/s, off-peak). Apply **Rate Limiting – SLA based**; client ID required. Throttled clients get 429 and must back off.
2. **Right API for the job**: add \`POST /prices/search\` accepting up to e.g. 500 SKUs per call, or better, a nightly **price file / event feed** (price-changed events) that the portal stores locally. The full catalogue then never goes through the interactive path.
3. **Caching**: prices change rarely within a day; a cache in \`prc-pricing-api\` (TTL aligned with price updates) cuts SAP calls for all consumers.
4. **Bulkhead**: if bulk access must stay as API calls, deploy a separate instance (\`prc-pricing-api-bulk\`) or route the bulk tier to separate replicas so it can't starve critical channels.

**Prevention — consumer onboarding.** Contract requests for shared Process APIs require: expected volume, peak times, call pattern, and criticality; C4E reviews high-volume requests; new consumers load-test against a perf environment; per-client dashboards and alerts on sudden share-of-traffic changes; reuse metrics include "who consumes how much".
`,
  followUps: [
    { q: 'What happens to a client that exceeds its SLA tier limit?', a: 'The gateway rejects the extra requests with 429 Too Many Requests (with rate-limit headers when enabled). The client should back off and retry later; the API itself never sees the excess load.' },
    { q: 'Why not simply autoscale prc-pricing-api?', a: 'The bottleneck moves downstream: SAP pricing slows down too, and SAP does not autoscale. Scaling a middle layer without protecting the backend just shifts the queue.' },
    { q: 'Is the single-SKU GET endpoint a bad design?', a: 'Not for interactive use — it is ideal for the shop and POS. It is the wrong interface for a 40,000-SKU batch; adding a bulk endpoint or a feed gives each consumer type an appropriate contract.' },
    { q: 'How does this relate to the value of API-led reuse?', a: 'Reuse concentrates load and risk on shared APIs. Without SLA tiers and capacity planning, success (more consumers) becomes the cause of outages.' },
  ],
}
