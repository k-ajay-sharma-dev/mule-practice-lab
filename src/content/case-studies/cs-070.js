import { diagram } from '../../arch/dsl.js'

export default {
  id: 'cs-070',
  category: 'case-studies',
  title: 'Sporting Goods Retailer Promising Click-and-Collect Stock Across 600 Stores',
  level: 'ADVANCED',
  tags: ['retail', 'omnichannel', 'inventory', 'kafka', 'events', 'caching', 'reconciliation', 'peak-traffic'],
  estMinutes: 55,
  diagram: {
    task: 'draw the store availability design: web and app calling an availability Experience API, an availability Process API reading a cache and an availability store, a reservations Process API, POS stock movements streamed into an updater that maintains the store, order events that confirm reservations, a job that releases expired reservations, and a nightly reconciliation with SIM through a System API.',
    checks: [
      { label: 'A shopper\'s availability request never waits on SIM or the POS', rule: { type: 'no-path', from: 'experience-api', to: ['legacy', 'pos'], kind: 'sync' } },
      { label: 'Availability is answered from a store or cache kept by the integration', rule: { type: 'path', from: 'experience-api', to: ['database', 'cache'], via: { type: 'process-api', label: 'availab' } } },
      { label: 'POS stock movements leave the stores as events', rule: { type: 'edge', from: 'pos', to: ['event-stream', 'topic', 'queue'], kind: 'async' } },
      { label: 'An updater consumes the stock events and writes the availability store', rule: { type: 'path', from: { type: ['event-stream', 'topic', 'queue'], label: ['stock', 'movement'] }, to: 'database', via: 'process-api' } },
      { label: 'Both the reservations and the updater Process APIs write the availability store', rule: { type: 'each', of: { type: 'process-api', label: ['reserv', 'updat'] }, min: 2, edgeTo: 'database' } },
      { label: 'A scheduled job releases expired reservations', rule: { type: 'edge', from: { type: 'batch-job', label: ['expir', 'release'] }, to: 'database' } },
      { label: 'Placed orders confirm reservations through an event', rule: { type: 'path', from: 'saas', to: { type: 'process-api', label: 'reserv' }, via: ['topic', 'queue', 'event-stream'] } },
      { label: 'SIM is reached only through a System API', rule: { type: 'only-via', target: 'legacy', from: 'system-api' } },
      { label: 'A nightly job reconciles the availability store with SIM', rule: { type: 'path', from: 'batch-job', to: 'legacy', via: 'system-api' } },
    ],
    reference: diagram(
      {
        web: ['web-app', 'Web shop (SFCC)'],
        mob: ['mobile-app', 'Mobile app'],
        exp: ['experience-api', 'exp-store-availability-api'],
        pav: ['process-api', 'prc-availability'],
        pres: ['process-api', 'prc-reservations'],
        cache: ['cache', 'Availability cache (30 s)'],
        avs: ['database', 'Availability store (stock minus reservations)'],
        pos: ['pos', 'POS (600 stores)'],
        es: ['event-stream', 'store-stock-movements (Kafka)'],
        pupd: ['process-api', 'prc-availability-updater'],
        oms: ['saas', 'Order management (OMS)'],
        ord: ['topic', 'order-placed'],
        expj: ['batch-job', 'Reservation expiry (every minute)'],
        rec: ['batch-job', 'Nightly reconciliation with SIM'],
        ssim: ['system-api', 'sys-sim-api'],
        sim: ['legacy', 'Oracle Retail SIM'],
      },
      [
        'web -> exp', 'mob -> exp', 'exp -> pav', 'exp -> pres', 'pav -> cache', 'pav -> avs', 'pres -> avs', 'pos ~> es', 'es ~> pupd',
        'pupd -> avs', 'oms ~> ord', 'ord ~> pres', 'expj -> avs', 'rec -> ssim', 'ssim -> sim', 'rec -> avs',
      ],
    ),
  },
  description: `
**Context.** A sporting goods retailer has 600 stores in 5 countries and a busy website and app. It wants to offer "collect in 1 hour" for any store that has the item. Today the website shows store stock from a nightly file, and 14% of click-and-collect orders are cancelled because the item is not there.

**Volumes**
| Item | Number |
|---|---|
| Products per store | up to 40,000 (sizes and colours) |
| Store stock movements (sales, returns, transfers, counts) | about 9 million a day; 600 per second at peak |
| Availability lookups (product page, store picker, basket) | 3,000 per second normal; 15,000 per second on launch days for limited trainers |
| Click-and-collect orders | 35,000 a day |

**Systems**
- **POS** in every store. A new POS release can publish each stock movement as an event.
- **Oracle Retail SIM** (Store Inventory Management), on-premises, the official stock book. Its API handles about 50 requests per second.
- **Salesforce Commerce Cloud** for web and app.
- **Order management (OMS)**, a SaaS that routes click-and-collect orders to stores and publishes order events.

**Rules from the business**
- When a shopper starts checkout for click-and-collect, hold the items for 20 minutes. If checkout does not finish, release them.
- Keep a safety buffer per product and store (for example, never promise the last 2 pairs).
- Store staff must see the pick list within 5 minutes of the order.

**Constraints**
- SIM cannot take more than 50 requests per second and is down for 30 minutes every night.
- Stock movements can arrive late or twice when a store's network drops.

**Your task.** Design the availability and reservation integration.
`,
  answerTemplate: `## Where availability is answered from

## Keeping the availability store up to date

## Reservations: hold, confirm, expire

## Reconciliation with SIM

## Launch-day traffic and failure modes
`,
  keyPoints: [
    'Answer availability from an availability store (stock minus reservations minus safety buffer) plus a short cache, never from SIM or the POS at request time.',
    'POS stock movements stream into Kafka keyed by store and product; an updater applies them in order and ignores duplicates by movement ID.',
    'A reservations Process API holds stock for 20 minutes; order-placed events confirm the hold, and a job releases expired holds.',
    'A nightly job reconciles the availability store with SIM through a System API to correct drift.',
    'Launch days are handled by caching and by a per-product hot-key strategy; the Experience API degrades to "check in store" rather than failing.',
  ],
  solution: `
**Availability store.** A database (for example PostgreSQL or a key value store) with one row per store and product: on hand, reserved, safety buffer and available. \`prc-availability\` reads it, with a 30 second cache for hot products. SIM and the POS are never called by a shopper's request.

**Updates.** The POS publishes stock movements to \`store-stock-movements\` in Kafka, keyed by store + product so each key stays in order. \`prc-availability-updater\` applies each movement, records the movement ID and ignores ones it has seen. Late movements are applied by their own timestamp, not arrival time.

**Reservations.** \`prc-reservations\`:
- **Hold.** At checkout it adds the quantity to \`reserved\` with a 20 minute expiry, using a conditional update so two shoppers cannot take the last unit.
- **Confirm.** On \`order-placed\` from the OMS, it marks the hold as confirmed. The store pick list comes from the OMS.
- **Expire.** A job every minute releases unconfirmed holds older than 20 minutes.

**Reconciliation.** Every night after SIM's downtime, a job reads SIM's stock per store through \`sys-sim-api\` (paced at 40 requests per second) and corrects the availability store. Drift is reported per store so bad movements can be fixed at the source.

**Launch days.** Limited products are pre-warmed in the cache. Hold requests for hot products are rate limited per shopper. If the availability store is slow, the API returns "check in store" instead of an error.
`,
  followUps: [
    { q: 'Why not read stock from SIM when the shopper opens the product page?', a: 'SIM handles about 50 requests per second against peaks of 15,000. It is also down every night, so the website would fail with it.' },
    { q: 'How do you stop two shoppers reserving the last pair?', a: 'The hold is a conditional update that only succeeds if available stock is still enough. The second shopper gets a fresh answer showing none left.' },
    { q: 'What if stock events arrive twice after a store network drop?', a: 'Each movement has an ID and the updater records the IDs it applied. A repeated movement is skipped.' },
    { q: 'Why still reconcile with SIM every night?', a: 'Events can be lost or wrong at the source. A nightly comparison with the stock book corrects drift and shows which stores have problems.' },
  ],
}
