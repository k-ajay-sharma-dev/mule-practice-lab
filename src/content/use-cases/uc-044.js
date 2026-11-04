import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-044',
  category: 'use-cases',
  title: 'Event Ticketing with Seat Holds for a High-Demand On-Sale',
  level: 'EXPERT',
  tags: ['high-concurrency', 'seat-holds', 'saga', 'queueing', 'payments', 'scalability'],
  estMinutes: 45,
  diagram: {
    task: 'draw the on-sale architecture from waiting room to ticket issue: edge protection, Experience APIs, the Hold and Purchase Process APIs, the cache, the System APIs for the core and PSP, and the asynchronous issuing path.',
    checks: [
      { label: 'Fans pass through a waiting room / edge gateway before reaching the Experience APIs', rule: { type: 'path', from: ['web-app', 'mobile-app'], via: ['api-gateway', 'load-balancer'], to: 'experience-api' } },
      { label: 'Experience APIs never call System APIs directly', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
      { label: 'The ticketing core is reached only through a (rate-limited) System API', rule: { type: 'only-via', target: 'legacy', from: 'system-api' } },
      { label: 'The PSP is reached only through a System API', rule: { type: 'only-via', target: 'payment', from: 'system-api' } },
      { label: 'Seat availability and the 6-ticket counters are served from a cache', rule: { type: 'edge', from: 'process-api', to: 'cache' } },
      { label: 'The cache is refreshed from seat events', rule: { type: 'path', from: ['topic', 'queue', 'event-stream'], to: 'cache' } },
      { label: 'The purchase saga persists its state', rule: { type: 'edge', from: 'process-api', to: 'database' } },
      { label: 'Ticket issuing happens asynchronously after the sale', rule: { type: 'edge', from: 'process-api', to: ['queue', 'topic', 'event-stream'], kind: 'async' } },
    ],
    reference: diagram(
      {
        web: ['web-app', 'Seat map (web / app)'],
        wr: ['api-gateway', 'Waiting room + bot management'],
        exp: ['experience-api', 'exp-shop-api (admission token)'],
        hold: ['process-api', 'prc-hold-api'],
        po: ['process-api', 'prc-purchase-orchestrator'],
        cu: ['process-api', 'prc-availability-updater'],
        cache: ['cache', 'Seat availability + per-customer counters'],
        state: ['database', 'Saga state per order'],
        t: ['topic', 'seat-events'],
        q: ['queue', 'order-confirmed'],
        score: ['system-api', 'sys-ticketing-core-api'],
        spsp: ['system-api', 'sys-psp-api'],
        siss: ['system-api', 'sys-ticket-issuing-api'],
        core: ['legacy', 'Ticketing core (≈400 req/s)'],
        psp: ['payment', 'PSP (3-D Secure)'],
        iss: ['saas', 'Ticket issuing service'],
      },
      [
        'web -> wr', 'wr -> exp', 'exp -> hold', 'exp -> po', 'hold -> cache', 'hold -> score', 'po -> score', 'po -> spsp', 'po -> state',
        'po ~> q', 'q ~> siss', 'siss -> iss', 'score -> core', 'spsp -> psp', 'score ~> t', 't ~> cu', 'cu -> cache',
      ],
    ),
  },
  description: `
A ticketing company sells concerts and sports events. For a stadium tour on-sale, **400,000 fans** are expected in the first 10 minutes for **60,000 seats per show**.

Facts:
- **Seat inventory** is owned by a legacy **ticketing core** (on-prem, relational DB, REST API) that safely handles about **400 seat-reservation calls/second**.
- Customers pick seats on a seat map (web/app), get a **hold for 8 minutes**, then pay through a **payment service provider (PSP)** with 3-D Secure.
- Rules: **max 6 tickets per customer** per show; a seat must never be sold twice; held seats that are not paid must return to sale promptly.
- Tickets are issued as **mobile tickets** (barcode) by a separate ticket-issuing service and emailed.
- Bots and resellers aggressively try to buy; the business wants a **fair virtual waiting room**.
- Today's architecture: the web app calls the ticketing core directly; it **crashed during the last big on-sale**.
- Integration platform: Anypoint Platform (CloudHub 2.0), API Manager, Anypoint MQ; a managed Redis-compatible cache is available.

**Describe your solution:**
- What is the end-to-end architecture from waiting room to ticket issue?
- How do you protect the ticketing core while serving 400,000 users?
- How do you implement holds, expiry and the 6-ticket limit without double selling?
- How do you make hold → payment → issue consistent when steps fail?
- How do you test and operate this for on-sale day?
`,
  answerTemplate: `## Architecture overview

## Waiting room and admission

## Seat availability and holds

## Purchase saga

## Protecting the core

## Bots and fairness

## Testing and on-sale operations
`,
  keyPoints: [
    'Virtual waiting room (CDN/edge or dedicated service) admits users at a rate the backend can serve; admission token required by the APIs.',
    'Read traffic (seat maps, availability) served from a cache updated by inventory events, not from the ticketing core.',
    'Holds created atomically in the ticketing core (single source of truth for seats) with a TTL; the 6-ticket limit enforced per customer + show with an atomic counter or the core.',
    'Purchase as a saga: hold → payment authorise → confirm sale in core → capture → issue tickets, with compensations (release hold, void/refund) and idempotency keys at every step.',
    'Core protected by rate limiting/spike control in API Manager, bounded worker concurrency and fast rejection rather than queuing beyond the hold window.',
    'Bot mitigation (WAF/bot management, CAPTCHA at queue entry, per-account limits), load tests at 2× expected peak, runbook and live dashboards.',
  ],
  solution: `
**Architecture overview.**
- **Waiting room** at the edge (CDN/bot-management product or dedicated queue service) in front of the shop.
- **Experience APIs** (Mule on CloudHub 2.0, horizontally scaled): seat map, holds, checkout.
- **Process APIs**: Hold API, Purchase Orchestrator.
- **System APIs**: Ticketing Core, PSP, Ticket Issuing, Customer.
- **Cache** (Redis-compatible) for seat availability; **Anypoint MQ** for asynchronous steps (issuing, emails, hold expiry events).

**Waiting room and admission.** Fans join a queue before on-sale time; at start they are given **random positions** (fairness) and admitted at a controlled rate (e.g. 2,000 users/minute, tuned from load tests so hold traffic stays below ~400 req/s at the core). Admitted users receive a signed, short-lived **admission token**; the Experience APIs reject calls without it. This is the main protection — the integration layer cannot make the core faster.

**Seat availability.** Seat maps are **read-heavy**: serve them from the cache, updated by events from the core (seat held/released/sold) or short-interval snapshots. The cache may be a second stale; the hold call is the authoritative check, and UI handles "seat just taken" gracefully.

**Holds and limits.** \`POST /holds\` → Hold Process API:
1. Check and increment the customer's count for the show atomically (cache \`INCR\` with TTL, or in the core) — reject if > 6.
2. Call the core to **reserve seats atomically** (the core's DB transaction guarantees no double hold; seats either all held or none).
3. Return hold ID and **expiry = now + 8 min**.

Expiry: the core's own hold TTL is the source of truth; an expiry job releases seats and publishes "released" events to refresh the cache and decrement the customer count. Never rely only on the client to release.

**Purchase saga (Purchase Orchestrator).** With an **idempotency key** per checkout:
1. Validate hold still valid (enough time left for payment).
2. **Authorise** payment at the PSP (3-D Secure via the frontend redirect/SDK).
3. **Confirm sale** in the core (hold → sold). If the hold expired meanwhile and seats are gone → **void the authorisation** (compensation) and tell the customer.
4. **Capture** payment.
5. Publish "order confirmed" → issuing service creates barcodes → email/app delivery (async, retried; a failure here never undoes the sale).

Saga state persisted per order (DB) so a crashed worker can resume; a reconciliation job compares PSP authorisations/captures with sold seats every few minutes during the on-sale (orphan authorisations voided, sold-without-capture investigated).

**Protecting the core.** API Manager **rate limiting / spike control** on the Ticketing Core System API at a safe threshold; Mule workers use bounded concurrency to the core and short timeouts. When the core is saturated, return **"try again"** quickly to admitted users rather than queuing requests longer than the hold window. Circuit breaker on core errors pauses admissions in the waiting room (feedback loop).

**Bots and fairness.** Bot management/WAF at the edge, CAPTCHA at queue entry, one queue position per verified account, per-account and per-card limits, device fingerprinting; suspicious orders flagged before tickets are issued.

**Testing and on-sale operations.** Load tests at ≥ 2× expected peak against a production-like core (or a well-calibrated stub), chaos tests (PSP slow, core errors). Pre-scale workers before on-sale (no reliance on reactive autoscaling only). Live dashboard: admission rate, hold success, core latency, payment failures, queue depth; runbook with clear levers (slow admission rate, pause sales).
`,
  followUps: [
    { q: 'Why not hold seats only in Redis and sync to the core later?', a: 'Two sources of truth for seats risks double selling if sync fails. Keep the core authoritative for holds; Redis is a read cache and limit counter only — unless the business moves seat inventory ownership to a new, scalable service.' },
    { q: 'How do you choose the waiting-room admission rate?', a: 'Measure core capacity under load: holds/second per admitted user (seat map browsing, retries), then set the rate with headroom; adjust live using core latency and error rate.' },
    { q: 'What if the PSP is down during the on-sale?', a: 'Pause admissions and extend holds of users in checkout (if the core allows), show a clear message, and resume; a long outage means releasing holds and rescheduling, which is a business decision.' },
  ],
}
