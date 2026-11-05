export default {
  id: 'ar-017',
  category: 'architecture',
  title: 'Zero-Downtime and Blue-Green Deployments',
  level: 'INTERMEDIATE',
  tags: ['zero-downtime', 'blue-green', 'rolling-update', 'deployment'],
  estMinutes: 25,
  quiz: [
    {
      type: 'single',
      prompt: 'The business wants v1.9 on 5% of real traffic with instant rollback. Which strategy fits?',
      options: [
        'A CloudHub 2.0 rolling update',
        'A canary: deploy v1.9 as a second app and split traffic by weight at the layer in front',
        'Stop the app, deploy, start it again',
        'Deploy v1.9 to one of the three replicas manually',
      ],
      answer: 1,
      explain: 'A rolling update gives zero downtime but no traffic-percentage control. A canary needs two deployments and a weighted routing layer, and rollback is setting the weight back to 0%.',
    },
    {
      type: 'order',
      prompt: 'Order the expand/contract steps for renaming `pax_count` to `passenger_count`.',
      items: [
        'Add passenger_count (and nullable loyalty_tier); write both columns; backfill',
        'Deploy v1.9, which reads passenger_count and still writes both',
        'Retire v1.8 and close the rollback window',
        'Stop writing pax_count, then drop it in a later release',
      ],
      explain: 'Both versions must work against the same schema while they run together. A direct rename would break v1.8 the moment the migration ran.',
    },
    {
      type: 'single',
      prompt: 'Blue and green both run during the canary. What happens to the 10-minute reminder Scheduler?',
      options: [
        'Only blue runs it automatically',
        'Both fire, causing duplicate reminder emails, unless green\'s scheduler is disabled, a lock is used, or the job is idempotent',
        'CloudHub merges the two schedulers',
        'Schedulers are paused during deployments',
      ],
      answer: 1,
      explain: 'Two separate apps each run their own Scheduler. Clustering (primary node only) helps within one app, not across two deployments.',
    },
    {
      type: 'single',
      prompt: 'Both versions consume the same payment-confirmation queue. When is that safe?',
      options: [
        'Never; a queue can only have one consumer app',
        'When both versions understand the message format — format changes also need expand/contract',
        'Only if the queue is FIFO',
        'Only if the messages are larger than 1 MB',
      ],
      answer: 1,
      explain: 'Competing consumers are normal. The risk is a format change one version cannot read, so consumers must accept old and new formats before producers switch.',
    },
    {
      type: 'multi',
      prompt: 'Which statements about rollback are true here?',
      options: [
        'Canary rollback = set green\'s traffic weight back to 0%',
        'Rolling-update rollback = redeploy the previous artifact version through the pipeline',
        'Rollback is safe only because the schema change stayed backward compatible',
        'Rollback restores the old database column names automatically',
      ],
      answer: [0, 1, 2],
      explain: 'The deployment tool switches code; it does not undo schema changes. Backward-compatible changes are what make the switch back safe.',
    },
    {
      type: 'single',
      prompt: 'How does CloudHub 2.0 avoid sending traffic to a new replica that is not ready?',
      options: [
        'It waits a fixed 5 minutes',
        'It routes only to replicas that pass readiness, and keeps old replicas serving until new ones are healthy',
        'It does not; some requests always fail',
        'The load balancer retries every failed request',
      ],
      answer: 1,
      explain: 'Readiness gates the rollout: a failing new version stops it before the old replicas are removed.',
    },
  ],
  description: `
An online travel agency deploys its **Booking Process API** on CloudHub 2.0 with 3 replicas. Requirements:

- No failed customer requests during deployments (it runs 24×7; peak 150 requests/s).
- The new release (v1.9) **adds a column** \`loyalty_tier\` to the bookings table and **renames** the \`pax_count\` column to \`passenger_count\`.
- The app also has a **Scheduler** that sends booking reminder emails every 10 minutes, and an **Anypoint MQ** listener that processes payment confirmations.
- The business wants to test v1.9 with **5% of real traffic** before full rollout, and roll back instantly if errors rise.

**Questions:**
- Rolling update vs blue-green vs canary: what does each give you here, and which do you choose?
- How do you handle the database change so both old and new versions can run at the same time?
- What can go wrong with the scheduler and the queue listener when two versions run simultaneously?
- How does rollback work?
`,
  answerTemplate: `## Deployment strategy

## Database changes

## Schedulers and listeners

## Rollback
`,
  keyPoints: [
    'CloudHub 2.0 rolling update replaces replicas gradually and keeps old replicas serving until new ones are ready — zero downtime for compatible changes, but no traffic percentage control.',
    'Canary/blue-green needs two separately deployed versions plus a traffic-splitting layer (e.g. external load balancer/edge or gateway routing) to send 5% to v1.9.',
    'Database changes use expand/contract: add the new column/keep the old one, write both during the transition, drop the old column only after the old version is gone.',
    'Two versions running together means duplicate scheduler runs and competing queue consumers; scheduler work must be singleton (cluster primary/lock) or idempotent, and message handling must be compatible across versions.',
    'Rollback is safe only because the schema stays backward compatible; rollback = shift traffic back to blue or redeploy the previous artifact version.',
  ],
  solution: `
**Deployment strategy.**
- **Rolling update** (CloudHub 2.0 default for multi-replica apps): new replicas start, pass readiness, old ones drain. Zero downtime if the app starts healthy and is backward compatible, cheap, simple. But you cannot say "5% only" and rollback means another rolling deploy.
- **Blue-green:** deploy v1.9 as a second app (green) next to v1.8 (blue), switch traffic at a routing layer; instant switch back. Costs double capacity during the window.
- **Canary:** blue-green with a gradual traffic split (5% → 25% → 100%) while watching error rate and latency.

**Choice:** the business asked for 5% real traffic and instant rollback → **canary using two app deployments**. Traffic is split at the layer in front (the company's edge load balancer/CDN with weighted routing, or a gateway that can route by weight/header). For routine releases without that requirement, rolling update is enough.

**Database — expand/contract.**
1. *Expand (before v1.9):* add \`loyalty_tier\` (nullable) and add \`passenger_count\`; a trigger or the app writes **both** \`pax_count\` and \`passenger_count\`. Backfill existing rows.
2. *Deploy v1.9:* reads \`passenger_count\`, still writes both.
3. *Contract (after v1.8 is fully retired and rollback window closed):* stop writing \`pax_count\`, then drop it in a later release.
A direct rename would break v1.8 the moment the migration runs — no zero downtime and no rollback.

**Schedulers and listeners.**
- **Scheduler:** with two apps (blue + green), both schedulers fire → **duplicate reminder emails**. Options: disable the scheduler in green until cut-over (property flag), use a distributed lock/"last run" record in the DB, and make the job idempotent (mark reminders as sent). Within one app with several replicas, enable clustering so only the primary node runs it, or use a lock.
- **MQ listener:** both versions consume from the same queue — fine *if* both understand the message format. Message format changes also need expand/contract (consumers accept old and new formats before producers switch).

**Rollback.** Watch canary metrics (5xx, p95, business errors) for an agreed period. If bad → set the weight back to 0% for green: instant. Because the schema change is backward compatible, v1.8 keeps working. For rolling deployments, rollback = redeploy the previous artifact version from the pipeline.

**Trade-offs:** canary/blue-green needs extra capacity and a traffic-splitting component; rolling update is cheaper but less controlled. Both require backward-compatible DB and message changes — that discipline matters more than the deployment tool.
`,
  followUps: [
    { q: 'How do you make sure a new replica only gets traffic when it is truly ready?', a: 'Use a health/readiness endpoint that checks the app has started and key dependencies are reachable; the platform only routes to replicas that are ready, and a failing new version stops the rollout before old replicas are removed.' },
    { q: 'Traffic grows 10x and you cannot afford double capacity for blue-green. What then?', a: 'Use rolling updates with a small surge (one extra replica at a time) or canary with only a few green replicas; capacity is added gradually rather than doubling the whole fleet.' },
    { q: 'What about long-running requests during the switch?', a: 'Old replicas must drain in-flight requests before termination (graceful shutdown), and clients should use idempotent retries so the rare cut request can be retried safely.' },
  ],
}
