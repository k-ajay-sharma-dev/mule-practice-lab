import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-074',
  category: 'use-cases',
  title: 'Flash Sale with Inventory Reservations in Oracle',
  level: 'EXPERT',
  tags: ['retail', 'flash-sale', 'inventory', 'reservations', 'oracle', 'activemq', 'scalability', 'concurrency', 'bot-protection'],
  estMinutes: 45,
  diagram: {
    task: 'draw the flash-sale architecture: web and app through bot protection and the gateway, a checkout Experience API reading from a cache, the reservation Process API with Oracle behind a System API, payment through a System API, confirmed orders handed to the OMS asynchronously through a queue with a DLQ, and the reservation-expiry sweeper.',
    checks: [
      { label: 'Web and app traffic passes bot protection / load balancer first', rule: { type: 'each', of: ['web-app', 'mobile-app'], edgeTo: ['load-balancer', 'api-gateway'] } },
      { label: 'Channels reach the checkout Experience API through the gateway', rule: { type: 'path', from: ['web-app', 'mobile-app'], via: 'api-gateway', to: 'experience-api' } },
      { label: 'Read-heavy product and stock-count traffic is served from a cache', rule: { type: 'edge', from: ['experience-api', 'process-api'], to: 'cache' } },
      { label: 'Oracle reservations are reached only through a System API', rule: { type: 'only-via', target: 'database', from: 'system-api' } },
      { label: 'The payment provider is reached only through a System API', rule: { type: 'only-via', target: 'payment', from: 'system-api' } },
      { label: 'Confirmed orders reach the OMS asynchronously through a queue', rule: { type: 'path', from: 'process-api', via: 'queue', to: 'erp' } },
      { label: 'Orders that keep failing go to a dead-letter queue', rule: { type: 'edge', from: 'queue', to: 'dlq' } },
      { label: 'A sweeper job releases expired reservations', rule: { type: 'edge', from: 'batch-job', to: ['system-api', 'process-api'] } },
    ],
    reference: diagram(
      {
        web: ['web-app', 'Website'],
        mob: ['mobile-app', 'Mobile app'],
        lb: ['load-balancer', 'CDN / WAF / bot protection'],
        gw: ['api-gateway', 'Gateway (spike control, rate limit)'],
        exp: ['experience-api', 'exp-flash-checkout'],
        prc: ['process-api', 'prc-flash-reservation'],
        prco: ['process-api', 'prc-order-submit'],
        job: ['batch-job', 'Reservation expiry sweeper (30 s)'],
        q: ['queue', 'FLASH.ORDERS (ActiveMQ)'],
        dlq: ['dlq', 'DLQ.FLASH.ORDERS'],
        sres: ['system-api', 'sys-inventory-reservations'],
        spay: ['system-api', 'sys-payments'],
        soms: ['system-api', 'sys-oms'],
        cache: ['cache', 'Product & stock-count cache'],
        ora: ['database', 'Oracle (bucketed stock rows)'],
        pay: ['payment', 'Payment provider'],
        oms: ['erp', 'OMS'],
      },
      [
        'web -> lb', 'mob -> lb', 'lb -> gw', 'gw -> exp', 'exp -> cache', 'exp -> prc', 'prc -> sres', 'prc -> spay', 'prc ~> q',
        'q ~> prco', 'q ~> dlq', 'prco -> soms', 'sres -> ora', 'spay -> pay', 'soms -> oms', 'job -> sres',
      ],
    ),
  },
  description: `
A sneaker retailer runs monthly **flash drops**: a limited edition (e.g. **5,000 pairs** across 12 sizes) goes on sale at **12:00:00**. Last time the site crashed, 700 pairs were **oversold**, and bots bought a third of the stock.

Constraints and targets:
- **200,000 users** waiting at 12:00; ~**30,000 "add to cart / reserve" requests in the first minute**.
- **Zero overselling.** A unit is reserved when the customer enters checkout and held for **10 minutes**; if not paid, it goes back to the pool.
- Max **1 pair per customer** per drop.
- Stock of record is in **Oracle 19c**; the OMS creates fulfilment orders after payment (OMS cannot take more than 50 orders/second).
- Checkout must still feel fast: reservation answer in **< 500 ms p95**.
- The rest of the website (normal products) must not be affected.
- Payments: card authorisation through the PSP (3-D Secure possible, may take a minute).

**Questions:**
1. Draw the architecture and the request path from "Reserve" to "Order confirmed".
2. How do you implement the reservation in Oracle so it is correct **and** fast under heavy contention?
3. How do you protect the platform and the stock from bots and spikes?
4. How do reservations expire and how is the OMS protected?
5. How do you test this before the next drop?
`,
  answerTemplate: `## Architecture and request path

## Reservation design in Oracle

## Protection: bots, spikes, fairness

## Expiry and order hand-off

## Failure modes

## Testing and go-live
`,
  keyPoints: [
    'Edge: CDN/WAF bot protection and a waiting room in front, then gateway spike control and per-customer rate limits; flash traffic isolated on its own Mule workers.',
    'Reservation is an atomic conditional update in Oracle (decrement only if available ≥ qty), with stock split into buckets/rows per size to reduce row-lock contention; one active reservation per customer enforced by a unique constraint.',
    'Read traffic (product page, "almost sold out" counters) served from a cache refreshed every few seconds — never from Oracle.',
    'Reservations have an expiry timestamp; a sweeper releases expired ones atomically; payment confirmation converts a reservation to sold only if it is still active.',
    'Paid orders are queued (ActiveMQ) and fed to the OMS at its 50/s limit, with DLQ and replay; the customer gets the confirmation without waiting for the OMS.',
    'Load-test the whole path with production-like data and contention; rehearse the drop with a dummy product.',
  ],
  solution: `
\`\`\`
 Web/App -> CDN/WAF/bot protection (waiting room) -> gateway (spike control) -> exp-flash-checkout -> cache (product, counters)
                                                                          -> prc-flash-reservation -> sys-inventory-reservations -> Oracle
                                                                                                   -> sys-payments -> PSP
                                                                                                   ~> [FLASH.ORDERS] ~> prc-order-submit -> sys-oms -> OMS
 Sweeper (30 s) -> sys-inventory-reservations (release expired)
\`\`\`

**Request path.**
1. Waiting room issues signed, time-limited tokens in random order at 12:00 (fairness, smooths the spike).
2. \`POST /drops/{dropId}/reservations\` (token + customer) → exp-flash-checkout → prc-flash-reservation → sys-inventory-reservations.
3. Success → 10-minute reservation ID; checkout page shows the timer.
4. \`POST /reservations/{id}/payment\` → authorise via sys-payments (idempotency key = reservation ID) → mark reservation SOLD (only if still ACTIVE) → publish the order to \`FLASH.ORDERS\` → confirm to the customer.
5. prc-order-submit consumes at a controlled rate (limited listener concurrency) and creates OMS orders.

**Reservation in Oracle.**
- Stock split into **buckets**: e.g. size 42 = 400 units spread over 10 rows of 40. A request picks a random bucket with stock: \`UPDATE flash_stock SET available = available - 1 WHERE drop_id = :d AND sku = :sku AND bucket = :b AND available >= 1\`. 1 row → reserved; 0 rows → try another bucket; none left → sold out. Buckets reduce lock contention on a single hot row.
- Insert into \`FLASH_RESERVATION (drop_id, customer_id, sku, bucket, expires_at, status)\` in the **same transaction**, with a unique constraint on (drop_id, customer_id) → "one pair per customer" is enforced by the database, not by code.
- Everything in a stored procedure called with \`db:stored-procedure\` (one round trip, IN: drop, sku, customer; OUT: result code, reservation ID), using a dedicated connection pool sized for the expected concurrency.

**Protection.** Bot management and device fingerprinting at the CDN/WAF; verified account required (account age, payment card on file); gateway **spike control** and **rate limiting** per client and per customer; flash APIs deployed on separate workers so normal shopping is unaffected. The product page and "x left" counters come from the cache (refreshed every 2–5 s from Oracle sums), so 200,000 users refreshing never reach the database.

**Expiry and OMS.** The sweeper runs every 30 seconds: in one transaction per batch it marks ACTIVE reservations with \`expires_at < SYSTIMESTAMP\` as EXPIRED and adds their units back to their buckets. Payment confirmation checks status = ACTIVE in the same UPDATE, so a payment arriving after expiry fails cleanly (authorisation voided, customer told). 3-D Secure delays: the reservation timer starts at checkout and can be extended once while a payment is pending. The OMS is protected by the queue: 5,000 orders at 50/s drain in under 2 minutes; poison messages → DLQ with replay.

**Failure modes.** Oracle unavailable → reservations fail fast with "try again" (no queueing of reservations — fairness matters more than throughput). PSP slow → reservation keeps the unit until expiry. Broker down → paid orders are written to an outbox table in the same transaction as SOLD, and published when the broker returns.

**Testing.** Load test with realistic contention (30,000 requests/minute on 12 SKUs), and verify sold + reserved + available = initial stock after every run. Run chaos tests (kill a worker mid-test, slow the PSP) and a public rehearsal drop with a low-value product.
`,
  followUps: [
    { q: 'Why not keep the stock counter only in a cache like Redis?', a: 'It can be faster, but the stock of record and the one-per-customer rule must survive crashes and be auditable. Many teams use a cache counter as a first gate and Oracle as the final atomic check; for 5,000 units Oracle with buckets is usually enough.' },
    { q: 'What is wrong with SELECT available, then UPDATE in two steps?', a: 'Two concurrent requests read the same value and both decrement — classic overselling. The check and the decrement must be one atomic conditional UPDATE (or SELECT ... FOR UPDATE inside one transaction).' },
    { q: 'How do you stop one person with 50 accounts?', a: 'Combine account verification, device and payment-card fingerprinting, address de-duplication after the sale (cancel duplicates), and rate limits per device/IP — no single control is enough.' },
    { q: 'Why does the customer not wait for the OMS order?', a: 'The sale is decided in Oracle and the payment is authorised; the OMS order is a downstream fulfilment step. Queuing it protects the OMS limit and keeps checkout fast.' },
  ],
}
