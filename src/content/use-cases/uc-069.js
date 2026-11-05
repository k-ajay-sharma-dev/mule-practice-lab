import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-069',
  category: 'use-cases',
  title: 'Buy Online, Pick Up in Store (BOPIS) with Store Stock and Pick Confirmation',
  level: 'INTERMEDIATE',
  tags: ['retail', 'bopis', 'click-and-collect', 'omnichannel', 'store-inventory', 'activemq', 'oracle', 'payments', 'api-led'],
  estMinutes: 30,
  diagram: {
    task: 'draw the BOPIS architecture: web and app through a storefront Experience API, store availability with a cache, the BOPIS order Process API with OMS and payment System APIs, pick tasks delivered asynchronously to the store associate app, and the customer "ready for pickup" notification.',
    checks: [
      { label: 'Website and mobile app call an Experience API', rule: { type: 'each', of: ['web-app', 'mobile-app'], edgeTo: 'experience-api' } },
      { label: 'The store associate app has its own Experience API', rule: { type: 'each', of: 'internal-app', edgeTo: 'experience-api' } },
      { label: 'Store availability is cached to protect the stock database', rule: { type: 'edge', from: ['process-api', 'system-api'], to: 'cache' } },
      { label: 'The store stock database is reached only through a System API', rule: { type: 'only-via', target: 'database', from: 'system-api' } },
      { label: 'Pick tasks are sent to stores asynchronously', rule: { type: 'edge', from: 'process-api', to: ['queue', 'topic'], kind: 'async' } },
      { label: 'The payment provider is reached only through a System API', rule: { type: 'only-via', target: 'payment', from: 'system-api' } },
      { label: 'The customer is notified when the order is ready', rule: { type: 'path', from: 'process-api', to: 'notification' } },
      { label: 'Experience APIs never call System APIs directly', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
    ],
    reference: diagram(
      {
        web: ['web-app', 'Website'],
        mob: ['mobile-app', 'Mobile app'],
        app: ['internal-app', 'Store associate app'],
        exps: ['experience-api', 'exp-storefront'],
        expst: ['experience-api', 'exp-store-ops'],
        prca: ['process-api', 'prc-store-availability'],
        prco: ['process-api', 'prc-bopis-order'],
        q: ['queue', 'STORE.PICK.TASKS (ActiveMQ)'],
        ssi: ['system-api', 'sys-store-inventory'],
        soms: ['system-api', 'sys-oms'],
        spay: ['system-api', 'sys-payments'],
        snot: ['system-api', 'sys-notifications'],
        cache: ['cache', 'Availability cache (60 s)'],
        ora: ['database', 'Store stock (Oracle)'],
        oms: ['erp', 'OMS'],
        pay: ['payment', 'Payment provider'],
        notif: ['notification', 'Email / SMS / push'],
      },
      [
        'web -> exps', 'mob -> exps', 'exps -> prca', 'exps -> prco', 'prca -> cache', 'prca -> ssi', 'ssi -> ora',
        'prco -> ssi', 'prco -> soms', 'prco -> spay', 'prco ~> q', 'q ~> expst', 'app -> expst', 'expst -> prco',
        'soms -> oms', 'spay -> pay', 'prco -> snot', 'snot -> notif',
      ],
    ),
  },
  description: `
An electronics retailer with **180 stores** launches **click-and-collect**: customers see which nearby stores have the item, order online, and collect within 2 hours.

Systems:
- **Store stock** in an Oracle database, updated in near-real time from POS sales (through ActiveMQ) and deliveries. Accuracy is ~95 %.
- **OMS** for orders; **payment provider** (card authorisation and capture).
- **Store associate app** on store tablets (new; you design its back end).

Requirements:
- Product page: "In stock at 3 stores near you" in **< 300 ms p95**; ~800 availability lookups/second at peak.
- Order: reserve the stock in the store, **authorise** the payment, send a pick task to the store.
- Store must pick within **2 hours**: confirm *picked*, *partial* or *not found*.
- Customer gets "ready for pickup" with a QR code; payment is **captured at pickup** (or on pick, depending on policy).
- Not collected within **5 days** → back to shelf, authorisation released / refund.

Volumes: ~9,000 BOPIS orders/day, peaks of 1,500/hour.

**Questions:**
1. Draw the APIs and messaging.
2. How do you show availability fast and avoid promising stock that is not there?
3. How do tasks reach stores and how does the pick confirmation flow back?
4. What happens on partial picks, items not found and uncollected orders?
`,
  answerTemplate: `## APIs per layer

## Availability

## Order placement

## Store pick tasks and confirmation

## Pickup, partial picks and no-shows

## NFRs
`,
  keyPoints: [
    'Availability: prc-store-availability reads store stock via sys-store-inventory with a short-TTL cache and applies a safety buffer (e.g. show available only if stock ≥ 2).',
    'Order placement: reserve stock in the store DB, authorise payment, create the OMS order, then publish a pick task — a reservation expires if the flow fails.',
    'Pick tasks go asynchronously to the store app (ActiveMQ queue with storeId selector or one queue per store); confirmations come back through exp-store-ops.',
    'Partial / not-found picks: offer substitution or re-route to another store, release the reservation and adjust the authorisation.',
    'Capture at pickup on QR scan; a nightly job handles 5-day no-shows (restock, void authorisation).',
  ],
  solution: `
\`\`\`
 Web/App -> exp-storefront -> prc-store-availability -> cache / sys-store-inventory -> Oracle
                          -> prc-bopis-order -> sys-store-inventory (reserve) / sys-payments / sys-oms
                                             ~> [STORE.PICK.TASKS] ~> exp-store-ops -> store app
 Store app -> exp-store-ops -> prc-bopis-order (picked / partial / not found / collected) -> sys-notifications
\`\`\`

**Availability.** \`GET /availability?sku=&lat=&lon=\` → prc-store-availability finds the nearest stores (store list cached) and reads stock for the SKU in those stores through sys-store-inventory. It caches the result for 60 seconds and applies a **safety buffer** because store stock is only ~95 % accurate. 800 lookups/s mostly hit the cache.

**Order placement** (prc-bopis-order):
1. Reserve stock in the store: \`UPDATE store_stock SET reserved = reserved + :qty WHERE store_id = :s AND sku = :sku AND on_hand - reserved >= :qty\` — 0 rows updated means no stock → offer another store.
2. Authorise payment through sys-payments (idempotency key = order ID).
3. Create the order in the OMS.
4. Publish a pick task (persistent) to the store's queue. If step 2 or 3 fails, release the reservation (compensation).

**Store tasks.** The store app receives tasks through exp-store-ops (it consumes the store queue / selector and pushes to the tablets; tablets also poll as a fallback). Associates post \`picked\`, \`partial\` or \`not-found\`. exp-store-ops calls prc-bopis-order which updates OMS, reservations and notifies the customer.

**Partial / not found.** Partial → customer asked to accept partial or cancel; not found → try another nearby store or cancel; release the reservation and adjust the authorisation (partial capture later).

**Pickup and no-shows.** At the counter the QR code is scanned → capture payment → order completed, stock decremented. A nightly job finds orders READY for 5 days → restock task, void authorisation, customer email.

**SLA.** A watchdog alerts store managers when a task is not picked within 90 minutes.
`,
  followUps: [
    { q: 'Why a safety buffer on store availability?', a: 'Store stock is never perfectly accurate (theft, misplaced items). Showing "available" only above a small threshold reduces "not found" picks and disappointed customers.' },
    { q: 'How do you make sure only the right store gets a pick task?', a: 'One queue per store, or a shared queue with a JMS message selector on a storeId property; each store\'s consumer only receives its own tasks.' },
    { q: 'Why capture payment at pickup instead of at order?', a: 'If items are not found or not collected, nothing needs refunding — only the authorisation is voided. Many card schemes require capture only when goods are handed over.' },
  ],
}
