import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-014',
  category: 'use-cases',
  title: 'Loyalty Points Accrual and Redemption',
  level: 'INTERMEDIATE',
  tags: ['loyalty', 'idempotency', 'ledger', 'concurrency', 'retail'],
  estMinutes: 25,
  diagram: {
    task: 'draw both paths into the loyalty engine: asynchronous accrual from the store POS hub through a queue, and real-time redemption from web and mobile checkout.',
    checks: [
      { label: 'Store baskets are queued; stores never wait for the loyalty engine', rule: { type: 'path', from: ['device', 'internal-app', 'legacy'], via: ['queue', 'event-stream'], to: ['saas', 'external-api'] } },
      { label: 'An accrual consumer reads the basket queue', rule: { type: 'edge', from: ['queue', 'event-stream'], to: ['process-api', 'system-api', 'batch-job'] } },
      { label: 'Basket keys (store + till + txn) are de-duplicated', rule: { type: 'edge', from: ['process-api', 'system-api'], to: { type: ['cache', 'database'], label: ['key', 'dedup', 'idempot', 'processed', 'basket'] } } },
      { label: 'Web shop and mobile app redeem through an Experience API', rule: { type: 'each', of: ['web-app', 'mobile-app'], min: 2, edgeTo: 'experience-api' } },
      { label: 'Redemption reaches the loyalty engine in real time (reserve / confirm)', rule: { type: 'path', from: 'experience-api', to: ['saas', 'external-api'] } },
      { label: 'The loyalty engine is reached only through a System API', rule: { type: 'only-via', target: ['saas', 'external-api'], from: 'system-api' } },
      { label: 'Malformed baskets go to a DLQ', rule: { type: 'edge', to: 'dlq' } },
    ],
    reference: diagram(
      {
        pos: ['device', 'Store POS hub (400 stores)'],
        web: ['web-app', 'Web shop'],
        mob: ['mobile-app', 'Mobile app'],
        eck: ['experience-api', 'exp-checkout-loyalty-api'],
        p: ['process-api', 'prc-loyalty-api'],
        q: ['queue', 'basket-accrual-q'],
        dlq: ['dlq', 'basket-accrual-dlq'],
        acc: ['process-api', 'prc-accrual-consumer (< 200 req/s)'],
        keys: ['cache', 'Processed basket keys'],
        sl: ['system-api', 'sys-loyalty-engine-api'],
        le: ['saas', 'Loyalty engine'],
      },
      ['pos -> p', 'p ~> q', 'q ~> acc', 'q ~> dlq', 'acc -> keys', 'acc -> sl', 'web -> eck', 'mob -> eck', 'eck -> p', 'p -> sl', 'sl -> le'],
    ),
  },
  description: `
A supermarket chain is launching a loyalty programme. A SaaS **loyalty engine** holds member accounts and point balances (REST API). Points are earned and spent in:

- **400 stores** — POS sends each finished basket (with member card number) to a central hub; stores sometimes go offline and send backlogs later.
- **Web shop and mobile app** — points can be **redeemed at checkout** (1 point = €0.01) in real time.

Rules and facts:
- 1 point per €1 spent, excluding tobacco and gift cards; double points on promoted products.
- ~1.2 million baskets/day, ~60% with a loyalty card. Peak Saturday mornings: 120 baskets/second.
- Returns must **reverse** the points earned on the returned items.
- A member must never be able to spend the same points twice (two devices checking out at once).
- The loyalty engine API allows 200 requests/second and is unavailable ~1 hour/month for maintenance.

**Describe your solution:**
- How do points get from POS baskets into the loyalty engine?
- How does real-time redemption work at checkout?
- How do you prevent double accrual and double spending?
- What happens during the loyalty engine's maintenance window?
`,
  answerTemplate: `## Accrual flow

## Points calculation

## Real-time redemption

## Duplicates and concurrency

## Downtime
`,
  keyPoints: [
    'Accrual is asynchronous: baskets queued (Anypoint MQ or Kafka) and posted by throttled consumers below 200 req/s; stores never wait for the loyalty engine.',
    'Accrual idempotency key = store + till + transaction number, so re-sent store backlogs never award points twice.',
    'Points rules (exclusions, promos) applied in one place — preferably the loyalty engine, otherwise a Process API with rules from configuration.',
    'Redemption uses a reserve/hold then confirm or release pattern tied to the order, so concurrent checkouts cannot spend the same balance.',
    'Returns post negative transactions referencing the original basket; maintenance window handled by queueing accruals and degrading redemption gracefully.',
  ],
  solution: `
**Accrual flow.** POS hub → **Loyalty Process API** \`POST /baskets\` (or the hub drops baskets onto a queue directly). The API validates and **enqueues** to Anypoint MQ (or Kafka if the hub already uses it) and returns 202. Consumers post accrual transactions to the loyalty engine via a **Loyalty System API**, throttled to stay under the 200 req/s limit (e.g. fixed number of consumers × \`maxConcurrency\`). 120 baskets/s × 60% ≈ 72/s at peak — within limits, but the queue protects against bursts when offline stores reconnect with hours of backlog.

**Points calculation.** Prefer configuring earning rules (exclusions, double-points promos) **in the loyalty engine** — that is its job. If it cannot, calculate in the Process API with DataWeave using rule tables (excluded categories, promo SKUs with multipliers and dates) loaded from a config store and cached. Send line-level detail so returns can be reversed per line.

**Real-time redemption.** At checkout the web shop calls \`POST /members/{id}/redemptions\` with order ID and points:
1. **Reserve (hold)** the points in the loyalty engine — balance check and hold in one atomic operation on the engine side. Return a redemption ID.
2. On successful payment/order confirmation, **confirm** the redemption.
3. On abandoned checkout or payment failure, **release** it; holds also expire automatically after e.g. 30 minutes.

If the engine has no native hold, implement the hold where the balance lives (never by "read balance, then write" in Mule, which races).

**Duplicates and concurrency.**
- Accrual idempotency key: \`storeId-tillId-txnNo-date\`. Pass it to the engine as the external transaction ID (if supported) and keep a processed-keys record (Object Store/DB with TTL) to skip duplicates from store backlogs.
- Redemption idempotency key: order ID — a retried call returns the existing reservation.
- Two devices at once: the atomic reserve on the engine guarantees only one succeeds when the balance is insufficient for both.

**Returns.** The return transaction references the original basket; Mule posts a **negative accrual** for the returned lines (and if points were redeemed on that order, refunds them as per policy). Balance may go negative if points were already spent — a business decision to agree.

**Downtime.** Accruals simply wait in the queue and drain afterwards. Redemption cannot work without the balance: the web shop shows "points temporarily unavailable" and lets the customer pay normally (fast-fail with circuit breaker, not timeouts). Schedule maintenance outside peak hours.
`,
  followUps: [
    { q: 'How do customers see their balance in the app if accruals are delayed?', a: 'Show the balance from the engine plus a "pending points" figure, and set expectations ("points appear within X minutes"). The queue lag is monitored against that promise.' },
    { q: 'What if a basket message is malformed?', a: 'Validate on intake; malformed messages go to a DLQ/error table with the store ID so the store team can resend, without blocking other baskets.' },
    { q: 'How do you test the double-spend case?', a: 'A concurrency test firing two redemptions for the same member at once against the engine sandbox, asserting one succeeds and one is rejected; plus MUnit tests for idempotent retries.' },
  ],
}
