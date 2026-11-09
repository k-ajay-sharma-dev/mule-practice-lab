import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-083',
  category: 'use-cases',
  title: 'Endless Aisle: Selling Stock from Other Stores at the Till',
  level: 'INTERMEDIATE',
  tags: ['retail', 'inventory', 'store-inventory', 'omnichannel', 'event-driven', 'pos', 'api-led'],
  estMinutes: 30,
  diagram: {
    task: 'draw the endless aisle: stock movements from stores and the DC flowing as events into a central inventory, the staff tablet through its Experience API, the order in the OMS, and the pick task sent to the fulfilling store.',
    checks: [
      { label: 'Stock changes from stores and the DC arrive as async events', rule: { type: 'each', of: ['pos', 'wms'], min: 2, edgeTo: ['queue', 'topic', 'event-stream'], kind: 'async' } },
      { label: 'Stock lookups read the central inventory, not 220 stores', rule: { type: 'no-path', from: 'internal-app', to: 'pos', kind: 'sync' } },
      { label: 'The staff tablet uses an Experience API', rule: { type: 'edge', from: 'internal-app', to: 'experience-api' } },
      { label: 'The inventory database is reached only through a System API', rule: { type: 'only-via', target: 'database', from: 'system-api' } },
      { label: 'The order is created in the OMS', rule: { type: 'path', from: 'internal-app', to: 'erp' } },
      { label: 'The fulfilling store receives its pick task asynchronously', rule: { type: 'path', from: 'process-api', via: ['queue', 'topic'], to: 'pos' } },
      { label: 'Experience APIs never call System APIs directly', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
      { label: 'Every line into or out of a queue is async', rule: { type: 'lines', touching: 'queue', kind: 'async' } },
    ],
    reference: diagram(
      {
        pos: ['pos', 'Store systems (220 stores)'],
        wms: ['wms', 'DC WMS'],
        q: ['queue', 'stock-movements'],
        sync: ['process-api', 'prc-inventory-sync'],
        sinv: ['system-api', 'sys-inventory'],
        db: ['database', 'Central inventory (by store and DC)'],
        tab: ['internal-app', 'Store staff tablet'],
        exp: ['experience-api', 'exp-store-assist'],
        ea: ['process-api', 'prc-endless-aisle'],
        soms: ['system-api', 'sys-oms'],
        oms: ['erp', 'OMS'],
        tq: ['queue', 'store-pick-tasks'],
      },
      [
        'pos ~> q', 'wms ~> q', 'q ~> sync', 'sync -> sinv', 'sinv -> db', 'tab -> exp', 'exp -> ea', 'ea -> sinv',
        'ea -> soms', 'soms -> oms', 'ea ~> tq', 'tq ~> pos',
      ],
    ),
  },
  description: `
A sports retailer has **220 stores** and one DC. Customers often find the shoe they want, but not in their size. Staff should be able to sell it anyway:
- look up the size in **nearby stores and the DC** on a tablet, in **under 1 second**;
- take payment at the till in the current store;
- have the other store or the DC send it to the customer's home.

Facts:
- Each store has its own **store system** on site (POS and stock). Stock changes there with every sale, return and delivery: about **2 million movements a day** across the chain.
- Store systems can publish messages to the head-office broker; store WAN links drop a few times a month.
- The DC runs a WMS that publishes stock changes as messages.
- The **OMS** creates customer orders and knows how to ship from a store or the DC.
- Store stock should be accurate to **5 minutes** for this feature.

**Questions:**
1. Where does the tablet read stock from, and why not ask the stores live?
2. How does stock in the central view stay current?
3. How is the order placed and the stock held?
4. How does the fulfilling store learn it has to pick and ship?
`,
  answerTemplate: `## Central inventory

## Keeping it current

## Lookup from the tablet

## Order and reservation

## Task to the fulfilling store
`,
  keyPoints: [
    'Stores and the DC publish stock movements as messages; prc-inventory-sync applies them to a central inventory table.',
    'The tablet reads the central inventory through exp-store-assist and prc-endless-aisle, never the 220 store systems.',
    'Movements carry a sequence per store and SKU, so late or repeated messages do not move stock backwards.',
    'The order is created in the OMS and the stock is reserved in the central table in the same Process API call.',
    'The pick task goes to the fulfilling store as a message, so a store with a WAN outage gets it when the link returns.',
  ],
  solution: `
**Central inventory.** One table holds on-hand and reserved quantity per location (store or DC) and SKU. It is reached only through sys-inventory.

**Keeping it current.** Each store system publishes a stock movement for every sale, return and delivery to **stock-movements** (persistent). The DC WMS does the same. prc-inventory-sync consumes the queue and applies each movement through sys-inventory. Every movement carries a **sequence number per store**; a message older than the last one applied for that store and SKU is ignored. 2 million movements a day is about 25 a second on average and a few hundred at peak, which one consumer group with batching handles. Once a night each store also sends a full snapshot that corrects drift.

**Lookup from the tablet.** The staff tablet calls exp-store-assist, which calls prc-endless-aisle. The Process API finds stores within 30 km of the current store and reads their stock and the DC stock in one query. Asking 220 stores live would be slow, and any store with a WAN outage would make the lookup fail.

**Order and reservation.** When the customer pays at the till, the tablet calls exp-store-assist with the chosen location. prc-endless-aisle:
1. reserves the stock in the central table (update only when on-hand minus reserved is enough);
2. creates the order in the OMS through sys-oms with the fulfilling location;
3. publishes a pick task.
If step 2 fails, the reservation is released.

**Task to the fulfilling store.** The task goes to **store-pick-tasks** with the store number as a message property; each store reads only its own tasks. A store with a broken WAN link receives the task when the link returns. The OMS gets the shipment confirmation from the store and emails tracking to the customer.
`,
  followUps: [
    { q: 'Why not let each store system answer stock queries live?', a: 'A lookup across 30 stores would take as long as the slowest store, and any outage breaks it. A central copy fed by events answers in milliseconds.' },
    { q: 'What if a movement message is lost?', a: 'Persistent messages make loss rare. The nightly snapshot per store corrects any drift that remains.' },
    { q: 'How do you stop two tablets selling the last pair at the same time?', a: 'The reservation is one conditional update on the central row. Only one update succeeds, and the other tablet is asked to choose again.' },
    { q: 'Why does the reservation sit in the central table and not in the store?', a: 'The store may be offline. The central table is the place every channel checks, so it must know about the hold at once.' },
  ],
}
