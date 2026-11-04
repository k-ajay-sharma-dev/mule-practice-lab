import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-038',
  category: 'use-cases',
  title: 'Real-Time Fraud Check during Checkout',
  level: 'ADVANCED',
  tags: ['latency', 'fail-open', 'circuit-breaker', 'e-commerce', 'fraud'],
  estMinutes: 30,
  diagram: {
    task: 'draw the fraud check inside checkout: the Checkout Process API, the Fraud System API, the precomputed risk-profile store and how it is fed, the externalised rules, and the async re-score path for unscored orders.',
    checks: [
      { label: 'The checkout service calls the Checkout Process API', rule: { type: 'edge', from: ['web-app', 'mobile-app', 'internal-app'], to: ['process-api', 'experience-api'] } },
      { label: 'The fraud vendor is reached only through a System API', rule: { type: 'only-via', target: 'external-api', from: 'system-api' } },
      { label: 'The synchronous path reads a precomputed customer risk profile from a fast store', rule: { type: 'edge', from: 'process-api', to: 'cache' } },
      { label: 'The risk profile is updated asynchronously from order and chargeback events', rule: { type: 'path', from: ['event-stream', 'topic', 'queue'], to: 'cache' } },
      { label: 'Thresholds live in an external rules store, not in code', rule: { type: 'edge', from: 'process-api', to: { type: ['database', 'cache', 'file-store'], label: ['rule', 'threshold', 'config'] } } },
      { label: 'Unscored orders are published asynchronously for re-scoring', rule: { type: 'edge', from: 'process-api', to: ['queue', 'topic', 'event-stream'], kind: 'async' } },
      { label: 'Review holds are set in order management through a System API', rule: { type: 'path', from: 'process-api', via: 'system-api', to: ['erp', 'database', 'saas'] } },
    ],
    reference: diagram(
      {
        chk: ['web-app', 'Checkout microservice'],
        prc: ['process-api', 'prc-checkout-api'],
        sfr: ['system-api', 'sys-fraud-api'],
        fv: ['external-api', 'Fraud vendor POST /score'],
        prof: ['cache', 'Customer risk profile store'],
        rules: ['database', 'Fraud rules / thresholds'],
        q: ['queue', 'unscored-orders'],
        rs: ['process-api', 'prc-fraud-rescore'],
        ev: ['event-stream', 'order + chargeback events'],
        pu: ['process-api', 'prc-risk-profile-updater'],
        soms: ['system-api', 'sys-order-mgmt-api'],
        oms: ['erp', 'Order management (holds)'],
      },
      [
        'chk -> prc', 'prc -> sfr', 'sfr -> fv', 'prc -> prof', 'prc -> rules', 'prc ~> q', 'q ~> rs', 'rs -> sfr', 'rs -> soms',
        'prc -> soms', 'soms -> oms', 'ev ~> pu', 'pu -> prof',
      ],
    ),
  },
  description: `
A fashion e-commerce company (≈ €600M/year online) wants every order checked by an external **fraud-scoring service** before payment is captured.

Facts:
- Checkout is a microservice that calls a **Checkout Process API** in Mule. The fraud vendor exposes \`POST /score\` (order, device fingerprint, customer history, shipping/billing addresses) and returns a score 0–100 plus reasons.
- Peak: **150 orders/second** on Black Friday; normal 10–20/s.
- **Latency budget:** the fraud step may add at most **300 ms at p99** to checkout. The vendor's p99 is ~180 ms but has had **30-minute outages**.
- Decision rules: score < 40 → approve; 40–80 → approve but **hold shipment for manual review**; > 80 → decline.
- The business rule for vendor failure: **"never block checkout because of the fraud vendor"**, but orders above **€1,000** placed while the vendor was unavailable must be reviewed manually.
- Customer history (orders, chargebacks) lives in the order database and the CRM; fetching it is slow (~400 ms).
- Fraud analysts change thresholds several times a month.

**Describe your solution:**
- Where does the fraud check sit in the checkout sequence?
- How do you meet the latency budget, including the customer-history data?
- What happens when the vendor is slow or down?
- How do you handle the review queue and later chargeback feedback?
`,
  answerTemplate: `## Placement in the flow

## Data for scoring

## Latency and timeouts

## Failure modes (fail-open with controls)

## Decisions and review

## Feedback loop and monitoring
`,
  keyPoints: [
    'Fraud check runs after payment authorisation and before capture (or before authorisation, per vendor guidance), returning a decision the checkout service can act on.',
    'Customer-history features pre-computed and cached (event-driven profile store) so the synchronous path does not query slow systems.',
    'Strict timeout (~250 ms) on the vendor call, no blocking retries in the synchronous path, circuit breaker to skip the vendor fast during outages.',
    'Fail-open with a flag: unscored orders approved but marked; high-value unscored orders held for review and re-scored asynchronously when the vendor recovers.',
    'Thresholds and rules externalised (config/rules table), changeable by analysts without redeploy, with audit of every decision.',
    'Chargebacks and review outcomes sent back to the vendor to improve the model; latency, timeout rate and decision mix monitored.',
  ],
  solution: `
**Placement.** Common sequence: cart → **payment authorisation** (funds reserved) → **fraud check** → capture/ship decision. Scoring after authorisation lets the vendor use AVS/3-D Secure results and avoids paying for scores on failed payments. The Checkout Process API calls a **Fraud System API** and returns \`APPROVE\`, \`REVIEW\` or \`DECLINE\`; declines void the authorisation.

**Data for scoring.** Fetching history at 400 ms would blow the budget. Instead maintain a **customer risk profile** (order count, last 90 days spend, chargebacks, account age) updated asynchronously from order and chargeback events into a fast key-value store (Redis/Object Store/DB with an index). The synchronous call does a single key lookup (< 10 ms). The device fingerprint comes from the checkout frontend.

**Latency and timeouts.**
- HTTP requester with connection pooling (persistent connections) and a **response timeout of ~250 ms**.
- **No retry** in the synchronous path (a retry would exceed the budget).
- DataWeave mapping is small; whole step stays within 300 ms p99.
- Size workers for 150 req/s with headroom (load test on Black Friday volumes).

**Failure modes.** A **circuit breaker** (custom with Object Store counters, or a resilience policy where available) opens after e.g. 20% timeouts in 30 s, so calls are skipped immediately instead of each waiting 250 ms. When unscored:
- order ≤ €1,000 → **approve** with flag \`fraudStatus=UNSCORED\`;
- order > €1,000 → **REVIEW** (approve payment but hold shipment).

All unscored orders are published to a queue and **re-scored asynchronously** when the vendor recovers; a high score at that point moves the order to review before shipping.

**Decisions and review.** Thresholds (40/80, €1,000) live in a rules config (DB table or properties reloaded via an admin API) with change history. REVIEW orders go to the order management system's hold status and a case/queue for analysts. Every decision is stored with score, reasons, rule version and latency for audit.

**Feedback loop and monitoring.** Analyst decisions and **chargeback** events (from the payment provider) are sent to the vendor's feedback API. Dashboards: p50/p99 latency, timeout rate, circuit state, approve/review/decline mix; alert when unscored orders exceed a threshold.
`,
  followUps: [
    { q: 'Why not retry the fraud call once on timeout?', a: 'A second attempt adds another 250 ms and breaks the budget; the async re-score handles the miss without hurting the customer.' },
    { q: 'Could you call the fraud vendor asynchronously for all orders?', a: 'Yes if shipment can always wait for the result — then checkout is never affected. The trade-off is that declines happen after the customer sees a confirmation, which needs a clear cancellation process.' },
    { q: 'How do you protect PII sent to the vendor?', a: 'Send only required fields, over TLS with OAuth/mTLS, under a data processing agreement; hash emails where the vendor supports it and never log the full payload.' },
  ],
}
