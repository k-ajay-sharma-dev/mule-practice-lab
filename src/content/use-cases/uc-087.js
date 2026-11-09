import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-087',
  category: 'use-cases',
  title: 'Pre-Orders with Card Tokens and Allocation on Arrival',
  level: 'ADVANCED',
  tags: ['e-commerce', 'pre-orders', 'payments', 'allocation', 'throttling', 'retail', 'event-driven'],
  estMinutes: 35,
  diagram: {
    task: 'draw the pre-order design: web and app through an Experience API, the pre-order store and the card token, goods receipts from the WMS starting allocation, a queue of payment requests in front of a throttled payment Process API, the OMS, customer messages, and the job that releases expired holds.',
    checks: [
      { label: 'Web and app place pre-orders through an Experience API', rule: { type: 'each', of: ['web-app', 'mobile-app'], min: 2, edgeTo: 'experience-api' } },
      { label: 'The payment provider is reached only through a System API', rule: { type: 'only-via', target: 'payment', from: 'system-api' } },
      { label: 'The WMS sends goods receipts as async messages', rule: { type: 'each', of: 'wms', edgeTo: ['queue', 'topic', 'event-stream', 'cloud-queue'], kind: 'async' } },
      { label: 'Allocation never charges cards in its own sync chain', rule: { type: 'no-path', from: { type: 'process-api', label: 'alloc' }, to: 'payment', kind: 'sync' } },
      { label: 'The pre-order database is reached only through a System API', rule: { type: 'only-via', target: 'database', from: 'system-api' } },
      { label: 'Paid pre-orders are created in the OMS', rule: { type: 'path', from: 'process-api', to: 'erp' } },
      { label: 'A scheduled job releases holds after 48 hours', rule: { type: 'edge', from: 'batch-job', to: ['system-api', 'process-api'] } },
      { label: 'Payments that keep failing end in a dead-letter queue', rule: { type: 'edge', from: ['queue', 'cloud-queue'], to: 'dlq' } },
    ],
    reference: diagram(
      {
        web: ['web-app', 'Website'],
        mob: ['mobile-app', 'Mobile app'],
        exp: ['experience-api', 'exp-storefront'],
        pre: ['process-api', 'prc-preorders'],
        spre: ['system-api', 'sys-preorders'],
        db: ['database', 'Pre-orders (sequence, status, token)'],
        spay: ['system-api', 'sys-payments'],
        pay: ['payment', 'Payment provider (vault tokens)'],
        wms: ['wms', 'DC WMS (goods receipts)'],
        rq: ['queue', 'goods-receipts'],
        alloc: ['process-api', 'prc-allocation'],
        pq: ['queue', 'preorder-payments'],
        pdlq: ['dlq', 'preorder-payments-dlq'],
        payp: ['process-api', 'prc-preorder-payment (100 TPS)'],
        soms: ['system-api', 'sys-oms'],
        oms: ['erp', 'OMS'],
        snot: ['system-api', 'sys-notifications'],
        msg: ['notification', 'Email and push'],
        job: ['batch-job', 'Hold expiry (hourly)'],
      },
      [
        'web -> exp', 'mob -> exp', 'exp -> pre', 'pre -> spre', 'spre -> db', 'pre -> spay', 'spay -> pay',
        'wms ~> rq', 'rq ~> alloc', 'alloc -> spre', 'alloc ~> pq', 'pq ~> payp', 'pq ~> pdlq', 'payp -> spay', 'payp -> spre',
        'payp -> soms', 'soms -> oms', 'payp -> snot', 'snot -> msg', 'job -> spre', 'job -> alloc', 'job -> snot',
      ],
    ),
  },
  description: `
A games retailer opens **pre-orders** for a new console. It expects **120,000 pre-orders in the first 48 hours**. Stock arrives in **three waves of 40,000** over six weeks, and nobody knows the exact dates.

Rules:
- Strictly **first come, first served**: the oldest pre-order gets the first unit.
- The customer is **not charged** until a unit is allocated to them.
- Card authorisations **expire after about 7 days**, so an authorisation at pre-order time would be gone before stock arrives.
- When the card is declined at allocation, the customer gets **48 hours** to update it. Then the unit passes to the next in line.
- Customers can see their position in the queue in their account.

Facts:
- The payment provider can **store a card as a token** (vault) after a zero-value check, and charge it later as a merchant initiated payment.
- The provider limit for this merchant is **100 transactions a second**.
- The DC WMS publishes a **goods receipt** message when a delivery is booked in.
- The OMS creates the fulfilment order and the WMS ships it.

**Questions:**
1. What happens at pre-order time?
2. How does the arrival of stock trigger allocation, and how do you keep the order fair?
3. How do you charge 40,000 cards without breaking the provider limit?
4. What happens on declines and expired holds?
`,
  answerTemplate: `## Pre-order placement

## Allocation on goods receipt

## Charging allocated pre-orders

## Declines, holds and reallocation

## Customer communication
`,
  keyPoints: [
    'At pre-order the card is checked and stored as a token; the pre-order gets a sequence number from a database sequence.',
    'A goods receipt message starts prc-allocation, which marks the N oldest pending pre-orders as allocated in one transaction.',
    'Allocation publishes one payment request per pre-order to a queue; a throttled consumer charges the token and creates the OMS order.',
    'A decline sets a 48 hour hold and emails an update link; the hourly job releases expired holds and allocates the unit to the next in line.',
    'Each payment request carries the pre-order ID as idempotency key, so a redelivered message never charges twice.',
  ],
  solution: `
**Pre-order placement.** exp-storefront calls prc-preorders. It runs a zero-value card check through sys-payments and stores the card as a **vault token**. It then inserts the pre-order through sys-preorders; the **sequence number** comes from a database sequence, so the order is decided by the database and not by clocks on several servers. The customer sees "you are number 48,213".

**Allocation on goods receipt.** The WMS publishes a goods receipt to **goods-receipts**. prc-allocation reads the quantity for the console SKU and, in one database transaction, marks the oldest N PENDING pre-orders as ALLOCATED (select by sequence, for update, skip locked). It then publishes one message per allocated pre-order to **preorder-payments**. Allocation does not call the payment provider, so it finishes in seconds for 40,000 rows.

**Charging.** prc-preorder-payment consumes with a fixed number of threads, sized to stay under **100 transactions a second**. 40,000 charges take about 7 minutes. For each message:
1. charge the token through sys-payments with the pre-order ID as **idempotency key**;
2. success: mark PAID, create the order in the OMS, email "your console is on its way";
3. decline: mark ON_HOLD with an expiry 48 hours later, email a link to update the card.
Technical errors (timeouts, 5xx) are retried by redelivery; after 5 tries the message goes to the DLQ for a person to check, because a charge may or may not have happened. The idempotency key makes a manual retry safe.

**Holds and reallocation.** The hourly job finds ON_HOLD pre-orders past their expiry. It sets them back to PENDING at the end of the line (or cancels them, by policy) and asks prc-allocation to allocate the freed units to the next oldest pre-orders. If the customer updates the card in time, the pre-order goes back to the payment queue.

**Customer communication.** Every status change sends an email or push through sys-notifications. Queue position is read from the database: count of PENDING pre-orders with a lower sequence.
`,
  followUps: [
    { q: 'Why not authorise the card at pre-order time?', a: 'Authorisations expire after about 7 days, and stock arrives weeks later. A stored token lets the merchant charge at allocation instead.' },
    { q: 'Why does allocation publish messages instead of charging cards itself?', a: 'Charging 40,000 cards takes minutes and must respect the provider limit. Allocation stays quick and atomic, and the queue spreads the charges.' },
    { q: 'How do you keep the order fair when two goods receipts arrive at once?', a: 'Both allocations lock rows in sequence order with skip locked. Each takes the oldest free rows, so no pre-order is skipped or taken twice.' },
    { q: 'What do you do with a message in the payment DLQ?', a: 'Check with the provider whether the charge happened, using the idempotency key. Then mark the pre-order paid or send the message again.' },
  ],
}
