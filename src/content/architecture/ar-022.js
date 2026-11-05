import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-022',
  category: 'architecture',
  title: 'Read Models and CQRS for Heavy Reads',
  level: 'ADVANCED',
  tags: ['cqrs', 'read-model', 'caching', 'performance'],
  estMinutes: 30,
  diagram: {
    task: 'draw the CQRS design: the home-screen query side served from a read model, how the read model is kept current from core banking, cards and CRM, and the payment command side.',
    checks: [
      { label: 'The mobile app calls an Experience API', rule: { type: 'each', of: 'mobile-app', edgeTo: 'experience-api' } },
      { label: 'Home-screen reads are served from a read store', rule: { type: 'path', from: 'mobile-app', to: 'database' } },
      { label: 'Core banking is reached only through a System API (commands, reconciliation)', rule: { type: 'only-via', target: 'legacy', from: 'system-api' } },
      { label: 'Source systems publish changes as events/CDC', rule: { type: 'edge', from: ['legacy', 'saas', 'crm'], to: ['event-stream', 'queue', 'topic'], kind: 'async', min: 2 } },
      { label: 'A projector consumes the events and upserts the read model', rule: { type: 'path', from: ['event-stream', 'queue', 'topic'], to: 'database' } },
      { label: 'Payments (commands) go to core banking via a System API', rule: { type: 'path', from: 'process-api', to: 'legacy', via: 'system-api' } },
      { label: 'The read store is read by the home API and written by the projector and the payment command (read-your-own-writes)', rule: { type: 'edge', from: ['process-api', 'experience-api', 'batch-job'], to: 'database', min: 3 } },
      { label: 'A reconciliation job checks the read store against the system of record', rule: { type: 'edge', from: 'batch-job', to: ['database', 'system-api'] } },
    ],
    reference: diagram(
      {
        mob: ['mobile-app', 'Mobile banking app'],
        eh: ['experience-api', 'exp-mobile-home-api'],
        ph: ['process-api', 'prc-customer-home-api (query)'],
        pp: ['process-api', 'prc-payments-api (command)'],
        rs: ['database', 'Customer home read store'],
        proj: ['process-api', 'prc-read-model-projector'],
        recon: ['batch-job', 'Nightly reconciliation'],
        ev: ['event-stream', 'Account / card / CRM change events'],
        score: ['system-api', 'sys-core-banking-api'],
        core: ['legacy', 'Core banking'],
        card: ['saas', 'Card management'],
        crm: ['crm', 'CRM'],
      },
      [
        'mob -> eh', 'eh -> ph', 'ph -> rs', 'eh -> pp', 'pp -> score', 'pp -> rs', 'score -> core',
        'core ~> ev', 'card ~> ev', 'crm ~> ev', 'ev ~> proj', 'proj -> rs',
        'recon -> score', 'recon -> rs',
      ],
    ),
  },
  description: `
A bank exposes a **Customer Accounts** API used by mobile banking (3 million users). The home screen shows: account list, balances, last 10 transactions, and card status.

Today the Process API fans out on each request to:
- **Core banking** (on-prem, ~400 ms, licence-limited to 300 calls/s),
- **Card management** SaaS (~250 ms),
- **CRM** (customer segment, ~300 ms).

Problems:
- On salary day morning, home-screen traffic hits **2,500 requests/s**.
- Core banking throttles, p95 latency is 4 s, and the app shows errors.

Writes (payments, card block) are much rarer than reads (≈ 1:50).

**Questions:**
- Would a simple cache (Object Store with TTL) solve this? Why or why not?
- Design a read model (CQRS-style): what is stored, where, how is it kept up to date, and how fresh is it?
- What does the API return when the read model is behind or unavailable?
- How do you handle "I just paid a bill, why is my balance not updated?"
`,
  answerTemplate: `## Cache vs read model

## Read model design

## Keeping it up to date

## Degraded behaviour

## Read-your-own-writes
`,
  keyPoints: [
    'A TTL cache helps for repeated reads but each user\'s first read (cache miss) still fans out to core banking, so salary-day peaks with many distinct users still exceed the 300 calls/s limit.',
    'A read model is a query-optimised store (e.g. a document DB or key/value store per customer) pre-computed from the source systems, so reads never call core banking synchronously.',
    'The read model is updated by events/CDC from the systems of record (balance and transaction changes), with an initial bulk load and periodic reconciliation.',
    'Writes still go to the system of record (command side); the read side is eventually consistent, with freshness exposed (e.g. asOf timestamp).',
    'Read-your-own-writes is handled by updating the read model or overlaying the pending change after a successful write, and the API can fall back to a live call for a single customer if data is stale.',
  ],
  solution: `
**Cache vs read model.** An Object Store/TTL cache is **cache-aside**: the first request per customer still triggers the fan-out. On salary day, hundreds of thousands of distinct users open the app in a short window → mostly cache **misses** → core banking still sees > 300 calls/s. Also a TTL forces a trade-off between freshness and hit rate. A cache is good for reference data; it does not change *where the load lands*.

**Read model design.**
- A **Customer Home Read Store**: one document per customer (\`customerId → { accounts[], balances, last10Tx[], cards[], segment, asOf }\`) in a database built for high read throughput (document DB / key-value store, replicated for HA).
- The Home Experience/Process API reads **one document by key** — single-digit-ms lookups, no fan-out. Scale is now limited by the store, which scales horizontally, not by core banking licences.
- The System APIs are still used for **commands** (payments, card block) and detailed history queries beyond the last 10.

**Keeping it up to date.**
- **Events/CDC** from core banking (posting events or CDC on transaction tables), card management webhooks, CRM change events → Mule consumers (Anypoint MQ/Kafka) → **upsert** the customer document. Consumers are idempotent (transaction ID) and order-aware (event sequence/timestamp per account; ignore older updates).
- **Initial bulk load** and a **nightly reconciliation** comparing balances with core banking to catch missed events.
- Freshness target: seconds; monitor **lag** (event time vs applied time) and alert.

**Degraded behaviour.**
- Responses include \`asOf\`; the app shows "updated 2 minutes ago" when lag is high.
- If the read store is down: fall back to a **rate-limited live path** (for a small share of traffic) or return the last known data with a warning — decided with the business, as banking UX rules may require it.

**Read-your-own-writes.** After a payment succeeds, the Payment Process API **updates the read model immediately** (write-through of the pending transaction and new available balance) or returns the new balance in the payment response so the app shows it. When the core's posting event arrives, it overwrites with the authoritative state.

**Trade-offs.** CQRS adds a datastore, event pipelines, reconciliation and the complexity of eventual consistency. It is justified here by a 50:1 read/write ratio, a hard licence limit and salary-day peaks; for a low-traffic API, a cache or direct calls are simpler.
`,
  followUps: [
    { q: 'Why not just buy more core banking licence capacity?', a: 'That may be possible but is usually expensive and scales the most costly component for read traffic that does not need it. Compare the licence increase with the cost of the read store and pipelines; the read model also reduces latency.' },
    { q: 'Traffic grows 10x. What changes?', a: 'Reads scale with read-store replicas/partitions and stateless API replicas; the source systems are unaffected. Event throughput grows only with business transactions, not with app opens.' },
    { q: 'How do you make sure the read model never shows wrong balances permanently?', a: 'Idempotent, order-aware event handling plus nightly reconciliation against the system of record, with alerts on differences; the read model can be rebuilt from scratch from a bulk load if needed.' },
  ],
}
