export default {
  id: 'ar-006',
  category: 'architecture',
  title: 'Multi-Region DR with RPO/RTO Targets',
  level: 'EXPERT',
  tags: ['disaster-recovery', 'high-availability', 'rpo-rto', 'multi-region'],
  estMinutes: 40,
  quiz: [
    {
      type: 'match',
      prompt: 'Match each tier to the DR pattern that fits its targets and the limited budget.',
      pairs: [
        ['Tier 1 order capture (RTO 15 min, RPO ≈ 0)', 'Hot standby (or active-active) in the second region'],
        ['Tier 2 event flows (RTO 2 h, RPO 5 min)', 'Warm standby / pilot light'],
        ['Tier 3 nightly batch (RTO 24 h, rerunnable)', 'Backup and redeploy from CI/CD'],
      ],
      explain: 'Spend follows the targets: only Tier 1 needs running capacity in the second region; Tier 3 can be redeployed from the pipeline and rerun because it is idempotent.',
    },
    {
      type: 'single',
      prompt: 'One replica of an order API crashes in EU-West. What covers this?',
      options: [
        'A DR failover to EU-Central',
        'In-region HA: several replicas spread across availability zones',
        'Restoring from the nightly backup',
        'Nothing; it is an accepted outage',
      ],
      answer: 1,
      explain: 'DR is for losing the region or a critical dependency. Losing a replica is handled by running ≥ 2 replicas across availability zones inside the region.',
    },
    {
      type: 'single',
      prompt: 'How does traffic for `api.distributor.eu` move to the DR region?',
      options: [
        'Runtime Manager automatically moves the hostname to another region',
        'A global traffic manager / DNS failover with health checks in front of both regions, with a low TTL and a defined trigger',
        'Clients are emailed the new region URL',
        'Anypoint MQ forwards the HTTP traffic',
      ],
      answer: 1,
      explain: 'A DNS/global traffic manager points to each region\'s ingress (custom domain and certificates present in both). Failover is either automatic on health checks or a runbook decision; failback is planned.',
    },
    {
      type: 'multi',
      prompt: 'Which statements about state during a region loss are true?',
      options: [
        'Object Store v2 is regional, so watermarks and idempotency keys do not follow to the DR region automatically',
        'Anypoint MQ messages in the lost region may be unavailable until it recovers, so producers should be able to replay from the source of truth (e.g. an outbox)',
        'With asynchronous cross-region DB replication, the last seconds of orders can be lost — state this gap explicitly',
        'CloudHub 2.0 replicates all application state to every region by default',
      ],
      answer: [0, 1, 2],
      explain: 'State does not follow the app. DR-critical keys belong in the replicated DB (or the design must tolerate a reset), and an outbox lets you meet the Tier 2 RPO by replay rather than by the queue.',
    },
    {
      type: 'single',
      prompt: 'How do you come close to RPO ≈ 0 for accepted orders?',
      options: [
        'Acknowledge the order with 201 first and persist it asynchronously',
        'Acknowledge only after the order is committed to a store whose replication meets the RPO, plus client retries with idempotency keys',
        'Keep accepted orders in an in-memory queue',
        'Run a nightly export of the order DB',
      ],
      answer: 1,
      explain: 'RPO is about what is lost once the client was told "accepted". Persist before acknowledging; if cross-region replication is async, resubmission with idempotency keys covers the small gap.',
    },
    {
      type: 'single',
      prompt: 'SAP fails over to its own DR site, which takes ~30 minutes. What does that mean for Tier 2 order-to-ERP flows?',
      options: [
        'Mule should fail all orders immediately',
        'Flows must buffer (queue/outbox) during the SAP failover; the effective RTO is bounded by SAP, not by Mule',
        'Mule must call the SAP DR site and the primary in parallel',
        'Nothing changes because SAP failover is instant',
      ],
      answer: 1,
      explain: 'An end-to-end RTO cannot be better than the slowest dependency. Buffering lets orders wait and be processed once SAP is back.',
    },
    {
      type: 'multi',
      prompt: 'What keeps the two regions consistent and proves the DR plan works?',
      options: [
        'One CI/CD pipeline deploying the same artifact and API Manager config to both regions',
        'Secrets and client contracts present in both regions',
        'Regular DR drills that measure the actual RTO and data loss',
        'Manually copying settings to the DR region when an outage happens',
      ],
      answer: [0, 1, 2],
      explain: 'Configuration as code and drills turn DR from a document into a tested capability. Manual copying during an outage is exactly when drift and mistakes happen.',
    },
  ],
  description: `
A pharmaceutical distributor runs its integration platform on **CloudHub 2.0** in one region (EU-West). It has about 60 Mule apps:

- **Tier 1: order capture APIs** used by pharmacies (≈ 200 orders/min at peak). Business target: **RTO 15 min, RPO ≈ 0** for accepted orders.
- **Tier 2: event-driven flows** on Anypoint MQ (order → ERP, shipping notifications). Target: **RTO 2 h, RPO 5 min**.
- **Tier 3: nightly batch** (price lists, reports). Target: **RTO 24 h**, rerunnable.

Backends:
- SAP S/4HANA, with its own DR site in EU-Central (~30 min failover).
- A PostgreSQL order DB (managed, cross-region replica available).
- Salesforce (SaaS).

Other facts:
- Apps use **Object Store v2** for watermarks and idempotency keys.
- Secrets are in secure properties.
- Consumers reach APIs through a single hostname \`api.distributor.eu\`.
- Budget is limited. The CFO will not pay for a fully active-active second region for everything.

**Design the DR strategy:**
- What is the deployment topology per tier (active-active, warm standby, pilot light, backup & redeploy)?
- How does traffic fail over, and who/what decides to fail over?
- How do you handle state: queues, Object Store, the order DB? Where can data be lost, and does that meet the RPO?
- How do you keep both regions in sync (code, config, policies, secrets)?
- How do you prove it works?
`,
  answerTemplate: `## Topology per tier

## Traffic failover

## State and data (MQ, Object Store, DB)

## Keeping regions in sync

## Testing and runbooks

## Trade-offs / risks
`,
  keyPoints: [
    'Tiered approach: active-active or hot standby only for Tier 1, warm standby / pilot light for Tier 2, redeploy-from-pipeline for Tier 3 — cost matched to RTO/RPO.',
    'HA inside a region first (multiple replicas across availability zones) — DR is for region loss, not a single replica failure.',
    'Global traffic manager / DNS failover (e.g. Route 53, Akamai, Cloudflare) with health checks in front of both regions\' ingress; short TTLs and a defined manual or automated trigger.',
    'Object Store v2 and Anypoint MQ are regional: state does not follow automatically; idempotency keys/watermarks need a replicated store (e.g. the DB) or a documented tolerance for re-processing.',
    'RPO ≈ 0 for orders requires synchronous persistence to a replicated store before acknowledging the order; async DB replication alone implies some loss — the gap is stated explicitly.',
    'Infrastructure/config as code via CI/CD (Maven/Mule deploy, API Manager config, secrets per region) and regular DR drills that measure the actual RTO/RPO.',
  ],
  solution: `
**Start with in-region HA.** Every Tier 1/2 app runs **≥ 2 replicas** (CloudHub 2.0 spreads replicas across availability zones in a region), with rolling updates for zero-downtime deployments. Many "outages" are covered here; DR is only for losing the region or a critical dependency.

**Topology per tier.**
| Tier | Pattern | Second region (EU-Central) |
|---|---|---|
| 1 Order capture | Active-passive **hot standby** (or active-active if budget allows) | Apps deployed and running, scaled down; same API Manager config |
| 2 Event flows | **Warm standby / pilot light** | Apps deployed with 0–1 replicas or deployable in minutes from the pipeline |
| 3 Batch | **Backup & redeploy** | Nothing running; redeploy from CI/CD, rerun job (idempotent, watermark-based) |

**Traffic failover.** Put a **global traffic manager / DNS failover** (Route 53, Akamai, Cloudflare, etc.) in front of \`api.distributor.eu\`. It points to each region's ingress (custom domain + TLS certs present in both Private Spaces). Health checks hit a deep health endpoint (app + DB reachability). Use a low DNS TTL (≈ 60 s) — clients that cache DNS longer will fail over more slowly. Decide explicitly: automatic failover for Tier 1 health-check failures, or a **manual, runbook-driven decision** by an incident commander to avoid flapping and split-brain. Failback is a planned, manual operation.

**State and data.**
- **Order DB:** for RPO ≈ 0, an order is only acknowledged (HTTP 201) after it is committed to a store whose replication meets the RPO. That means synchronous/multi-zone commit in the primary plus a cross-region replica. If cross-region replication is asynchronous, state honestly that region loss can lose the last seconds of orders; mitigate with client retries using idempotency keys (pharmacies resend, duplicates are rejected).
- **Anypoint MQ:** queues are regional. In-flight messages in a lost region may be unavailable until it recovers. Options: check whether Anypoint MQ's cross-region failover feature fits your queue types and region pair; otherwise make producers able to **republish from the source of truth** (e.g. an outbox table in the order DB with a "sent" flag) so the RPO of 5 min is met by replay, not by the queue.
- **Object Store v2:** regional and not replicated to the DR region. Watermarks and idempotency keys used for DR-critical flows should live in the replicated DB, or the design must tolerate a reset (start from a safe earlier watermark, rely on idempotent targets).
- **SAP:** its own DR takes ~30 min, so Tier 2 flows to SAP must **buffer** (queue/outbox) during SAP failover; the effective RTO of order-to-ERP is bounded by SAP, not by Mule.

**Keeping regions in sync.** Everything through **CI/CD**: one pipeline deploys the same artifact to both regions (Mule Maven plugin / Anypoint CLI), API Manager instances and policies managed as code (e.g. via the API Manager REST APIs or Terraform-style tooling), region-specific properties files, secrets present in both regions' secret stores. Client applications/contracts must be valid in both environments. Drift checks after each release.

**Testing.** Quarterly **DR drills**: fail Tier 1 over in a scheduled window, measure the actual RTO and data loss, run Tier 3 redeploy from scratch. Runbooks with owners, contact lists, and the decision criteria. Monitoring (Anypoint Monitoring + external synthetic checks) must itself be region-independent.

**Trade-offs.** Active-active everywhere would meet all targets but doubles cost and forces conflict handling for writes; the tiered model concentrates spend on Tier 1. True RPO 0 across regions needs synchronous cross-region writes (latency cost) — usually the business accepts "near zero" plus client resubmission.
`,
}
