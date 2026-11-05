export default {
  id: 'ar-063',
  category: 'architecture',
  title: 'Deployment and Sizing per API-led Layer',
  level: 'ADVANCED',
  tags: ['api-led', 'deployment', 'sizing', 'vcores', 'cloudhub'],
  estMinutes: 30,
  quiz: [
    {
      type: 'match',
      prompt: 'Match each layer to its typical sizing characteristic (to be confirmed by load tests).',
      pairs: [
        ['System APIs', 'Mostly I/O wait; capacity limited by backend concurrency and quotas'],
        ['Process APIs', 'CPU and memory for parallel calls, merging and DataWeave'],
        ['Experience APIs', 'Often thin but take consumer spikes; scale horizontally and cache'],
      ],
      explain: 'Bigger replicas do not make Salesforce faster — size System APIs against the backend limits, and Process APIs against CPU/heap.',
    },
    {
      type: 'single',
      prompt: 'What is the current spend (7 apps at 2 × 1.0 vCore, 2 apps at 2 × 0.5)?',
      options: ['9 vCores', '14 vCores', '16 vCores', '18 vCores'],
      answer: 2,
      explain: '7 × 2 × 1.0 = 14, plus 2 × 2 × 0.5 = 2, giving 16 vCores.',
    },
    {
      type: 'single',
      prompt: 'prc-customer-360-api handles 125 TPS at 250 ms p95. Roughly how many requests are in flight (Little\'s law)?',
      options: ['~5', '~31', '~125', '~500'],
      answer: 1,
      explain: 'Concurrency ≈ rate × latency = 125 × 0.25 ≈ 31 — easily handled; the real question is CPU per request.',
    },
    {
      type: 'multi',
      needsScenario: true,
      prompt: 'Which APIs should keep at least 2 replicas regardless of load?',
      options: [
        'exp-mobile-api',
        'exp-partner-api (99.9% SLA)',
        'prc-customer-360-api',
        'sys-billing-account-api (on the critical path of prc-customer-360-api)',
        'exp-callcenter-api (internal, 3 TPS)',
      ],
      answer: [0, 1, 2, 3],
      explain: 'Customer-facing and SLA-bound APIs, and everything on their critical path, need high availability. A chain is only as available as its weakest single-replica member. The internal call-centre API may run on one replica if the business agrees.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'exp-mobile-api has campaign spikes. Vertical or horizontal scaling?',
      options: [
        'Vertical: one large replica',
        'Horizontal: more replicas during campaigns, scaled back afterwards',
        'Neither — rate limit the campaign',
        'Move it into the Process API',
      ],
      answer: 1,
      explain: 'More replicas add capacity and resilience; one large replica is still a single point of failure with diminishing returns.',
    },
    {
      type: 'single',
      prompt: 'Which APIs are good candidates to share one Mule application?',
      options: [
        'exp-mobile-api and sys-kyc-vendor-api',
        'Two small, low-traffic System APIs over reference data, owned by the same team with the same release cadence',
        'prc-customer-360-api and prc-customer-onboarding-api, regardless of load',
        'Any APIs, as long as they are in the same business group',
      ],
      answer: 1,
      explain: 'Co-location saves the per-app baseline but couples deployment, scaling and failure; group only APIs with the same owner, cadence, criticality and low traffic.',
    },
  ],
  description: `
A customer domain has 9 APIs on CloudHub 2.0. Licensing/capacity is tight and finance wants to cut vCore spend by ~40%.

| API | Layer | Peak TPS | p95 | Replicas × size | Notes |
|---|---|---|---|---|---|
| exp-mobile-api | Exp | 120 | 300 ms | 2 × 1.0 | Customer-facing, spiky (campaigns) |
| exp-partner-api | Exp | 5 | 400 ms | 2 × 1.0 | Contractual SLA 99.9% |
| exp-callcenter-api | Exp | 3 | 500 ms | 2 × 0.5 | Internal |
| prc-customer-360-api | Proc | 125 | 250 ms | 2 × 1.0 | Aggregates 3 System APIs |
| prc-customer-onboarding-api | Proc | 1 | 2 s | 2 × 1.0 | Business hours only |
| sys-sfdc-customer-api | Sys | 130 | 150 ms | 2 × 1.0 | Salesforce API quota |
| sys-billing-account-api | Sys | 125 | 120 ms | 2 × 1.0 | |
| sys-loyalty-api | Sys | 60 | 80 ms | 2 × 0.5 | |
| sys-kyc-vendor-api | Sys | 1 | 3 s | 2 × 1.0 | External vendor |

**Questions:**
1. How do sizing needs typically differ between layers?
2. Propose a new deployment layout (sizes, replicas, possible co-location) and explain the trade-offs.
3. Which APIs must keep 2+ replicas regardless of load, and why?
4. When does merging several APIs into one Mule application make sense, and when is it dangerous?
`,
  answerTemplate: `## Sizing characteristics per layer

## Proposed layout

## Minimum replicas

## Shared vs separate apps
`,
  keyPoints: [
    'Size from measured load (TPS × latency, CPU and memory under test), not by layer; typically System APIs are I/O-bound, Process APIs doing aggregation and DataWeave are more CPU/memory heavy, and Experience APIs scale with consumer spikes.',
    'Low-traffic APIs (1–5 TPS) rarely need 1 vCore; fractional sizes and fewer replicas, or co-location in one app, cut cost.',
    'High-availability needs (SLA, customer-facing, critical path) dictate ≥ 2 replicas; internal low-criticality APIs may accept 1 replica with fast restart.',
    'Co-locating APIs in one app saves capacity but couples deployment, scaling, failure and memory; group only APIs with the same owner, layer/domain, release cadence and criticality.',
    'Horizontal scaling (replicas, autoscaling where available) handles spikes better than oversized single replicas; verify with load tests and monitoring before and after.',
  ],
  solution: `
**Sizing characteristics (general tendencies — confirm with load tests).**
- **System:** mostly I/O wait on backends; modest CPU; capacity often limited by backend concurrency (connection pools, SaaS quotas) rather than Mule. Bigger replicas do not make Salesforce faster.
- **Process:** parallel calls, merging and DataWeave transformations → CPU and memory; threads waiting on several downstreams.
- **Experience:** often thin, but takes consumer spikes; benefits from horizontal scaling and caching.
- Little's law sanity check: concurrent in-flight requests ≈ TPS × latency. 125 TPS × 0.25 s ≈ 31 concurrent — easily handled; the question is CPU per request.

**Current spend:** 7 × 2 × 1.0 + 2 × 2 × 0.5 = **16 vCores**.

**Proposed layout (example; sizes per the platform's available replica sizes).**

| App | Hosts | Replicas × size | Reason |
|---|---|---|---|
| exp-mobile-api | — | 2 × 0.5 (+ scale out during campaigns) | Spiky; horizontal scaling; HTTP caching |
| exp-partner-api | — | 2 × 0.2 | 5 TPS, but SLA requires 2 replicas |
| exp-callcenter-api | — | 1–2 × 0.2 | Internal, low TPS |
| prc-customer-360-api | — | 2 × 1.0 | Hot path, CPU-heavy merging — keep |
| prc-customer-onboarding-api | — | 2 × 0.2 | 1 TPS; long latency is waiting, not CPU |
| sys-sfdc-customer-api | — | 2 × 0.5 | I/O bound; quota is the real limit |
| sys-billing-account-api | — | 2 × 0.5 | I/O bound |
| sys-loyalty + sys-kyc-vendor | co-located? (see below) | 2 × 0.2 each or one app 2 × 0.5 | Low traffic |

≈ 7–8 vCores — roughly a 50% reduction, **subject to load testing** (watch CPU, heap, GC and p95 under peak + headroom).

**Minimum replicas.** Keep ≥ 2 (ideally across availability zones) for: \`exp-mobile-api\`, \`exp-partner-api\` (SLA 99.9%), and everything on their critical path (\`prc-customer-360\`, \`sys-sfdc\`, \`sys-billing\`). A chain is only as available as its weakest single-replica member. \`exp-callcenter-api\` could run 1 replica if the business accepts minutes of downtime during restarts.

**Shared vs separate apps.**
- Merging several APIs into one Mule app (multiple APIkit routers / listeners, each with its own API Manager instance via autodiscovery) saves the per-app overhead. Each Mule runtime has a fixed memory/CPU baseline.
- **Good candidates:** same layer and domain, same owning team, same release cadence, similar criticality, low traffic — e.g. two small System APIs over reference data.
- **Dangerous:** mixing a critical hot-path API with a slow/heavy one (one memory leak or thread exhaustion takes both down); different owners (deploy conflicts); different scaling needs; mixing layers across ownership boundaries.
- \`sys-kyc-vendor-api\` (3 s external calls) and \`sys-loyalty-api\` share an app only if thread/connection pools are isolated and both are low-criticality — otherwise keep them apart.
- Remember: co-location is a **physical** choice; each API keeps its own spec, contract and policies (logical API-led stays intact).
`,
  followUps: [
    { q: 'Why not run every API on 0.1 vCore to save money?', a: 'The smallest sizes have limited CPU and memory; DataWeave-heavy or high-TPS apps will have high latency, GC pressure or out-of-memory errors. Small sizes suit low-traffic, light APIs only.' },
    { q: 'Vertical or horizontal scaling for exp-mobile-api campaigns?', a: 'Horizontal: more replicas add capacity and resilience, and can be scaled back after the campaign; a larger single replica is still a single point of failure and has diminishing returns.' },
    { q: 'How does Runtime Fabric or on-prem change this discussion?', a: 'The same principles apply, but you size against your own cluster capacity and licensing model rather than CloudHub replica sizes, and you can tune CPU/memory reservations and limits more finely.' },
  ],
}
