import { diagram } from '../../arch/dsl.js'

export default {
  id: 'cs-037',
  category: 'case-studies',
  title: 'Fashion Retailer Building Omnichannel Order Management',
  level: 'INTERMEDIATE',
  tags: ['retail', 'omnichannel', 'inventory', 'order-routing', 'events'],
  estMinutes: 40,
  diagram: {
    task: 'draw the omnichannel integration: orders from the web shop and marketplaces buffered into one orders Process API, store stock deltas via store-and-forward, the OMS behind a System API, status events fanned out, and returns from any store.',
    checks: [
      { label: 'The OMS is reached only through a System API (which protects its rate limits)', rule: { type: 'only-via', target: 'saas', from: 'system-api' } },
      { label: 'Orders from web and marketplaces are buffered on a queue before the OMS', rule: { type: 'edge', from: ['experience-api', 'system-api', 'process-api'], to: 'queue', kind: 'async', min: 2 } },
      { label: 'One orders Process API creates the OMS orders', rule: { type: 'path', from: 'queue', to: 'saas', via: { type: 'process-api', label: ['order'] } } },
      { label: 'Store stock movements are sent as events (store-and-forward), not a nightly batch', rule: { type: 'edge', to: { type: ['queue', 'topic', 'event-stream'], label: ['stock', 'inventory'] }, kind: 'async' } },
      { label: 'An inventory Process API aggregates stock deltas', rule: { type: 'edge', from: ['queue', 'topic', 'event-stream'], to: { type: 'process-api', label: ['inventory', 'stock'] } } },
      { label: 'Order status is published once and fanned out to several consumers', rule: { type: 'edge', from: 'topic', min: 2, kind: 'async' } },
      { label: 'Customers are notified from the status events', rule: { type: 'path', from: 'topic', to: 'notification' } },
      { label: 'Any store can process a return through a Process API', rule: { type: 'path', from: 'internal-app', to: 'saas', via: 'process-api' } },
    ],
    reference: diagram(
      {
        web: ['web-app', 'Web shop (commerce SaaS)'],
        agent: ['device', 'Store-side agent (store-and-forward)'],
        store: ['internal-app', 'Store POS (returns)'],
        eweb: ['experience-api', 'exp-web-orders-api', { vCores: '0.5' }],
        estore: ['experience-api', 'exp-store-api'],
        ord: ['process-api', 'prc-orders-api'],
        inv: ['process-api', 'prc-inventory-api'],
        ret: ['process-api', 'prc-returns-api'],
        nf: ['process-api', 'prc-customer-notify'],
        oq: ['queue', 'order-submissions'],
        sq: ['queue', 'stock-movements'],
        ex: ['topic', 'order-status'],
        smk: ['system-api', 'sys-marketplace-api'],
        soms: ['system-api', 'sys-oms-api'],
        mk: ['external-api', 'Marketplaces'],
        oms: ['saas', 'OMS (routing, ATP)'],
        notif: ['notification', 'Customer email / SMS'],
      },
      [
        'web -> eweb', 'eweb ~> oq', 'smk -> mk', 'smk ~> oq', 'oq ~> ord', 'ord -> soms', 'soms -> oms',
        'agent ~> sq', 'sq ~> inv', 'inv -> soms', 'store -> estore', 'estore -> ret', 'ret -> soms',
        'soms ~> ex', 'ex ~> nf', 'nf -> notif', 'ex ~> smk',
      ],
    ),
    simulation: {
      systems: [{ match: 'saas', latencyMs: 300, maxRps: 50 }],
      tests: [
        {
          name: 'Orders at a sale peak',
          about: 'The web shop takes 10 orders a second, and for 10 minutes of a sale that jumps to 100 a second. The OMS takes 50 a second. Every order is accepted at once, the queue holds the rest, and the OMS is never over its limit.',
          traffic: [{ name: 'web orders', from: 'web-app', rps: 10, to: 'saas', kind: 'write', spikes: [{ at: 2, forMin: 10, rps: 100 }] }],
          durationMin: 40,
          expect: { answers: [{ minSuccess: 0.99, maxMs: 1000 }], peakRps: [{ node: 'saas', max: 50 }], lost: { max: 0 }, backlog: [{ queue: { label: 'order-submissions' }, maxEnd: 0 }] },
        },
        {
          name: 'The OMS is down for 30 minutes',
          about: 'Store agents send 10 stock movements a second while the OMS is down for 30 minutes. The movements wait in the stock queue and reach the OMS once it is back, so none is lost.',
          traffic: [{ name: 'stock movements', from: 'device', rps: 10, to: 'saas', kind: 'write' }],
          incidents: [{ down: 'saas', at: 5, forMin: 30 }],
          durationMin: 90,
          expect: { delivered: [{ to: 'saas', min: 0.99 }], lost: { max: 0 }, backlog: [{ queue: { label: 'stock-movements' }, maxEnd: 0 }] },
        },
      ],
    },
  },
  description: `
**Context.** A fashion retailer with 180 stores, a web shop and two marketplace channels wants to offer:
- click-and-collect
- ship-from-store
- endless aisle (order in store for home delivery)

It has bought a SaaS order management system (OMS) to decide where each order is fulfilled.

**Current systems**
- Store stock lives in a point-of-sale (POS) system that syncs to head office overnight.
- Warehouse stock is in a WMS.
- The web shop is a commerce SaaS platform.

**Goals**
- Near-real-time available-to-promise (ATP) stock across stores and warehouse.
- All channels send orders to the OMS; OMS routes them to a store or the warehouse.
- Customers see consistent order status and can return in any store.

**Constraints**
- POS is on-premises in each store; store connectivity is unreliable at times.
- Stock accuracy in stores is ~90% (theft, mis-scans).
- Peak sale events generate 8x normal orders.
- The OMS vendor provides REST APIs and webhooks, with rate limits.
- The web shop takes about 10 orders a second, up to 100 at a sale peak, and the OMS takes 50 calls a second. Stores send about 10 stock movements a second, and the OMS can be down for 30 minutes.
- Web and marketplace orders wait on an \`order-submissions\` queue, store movements on a \`stock-movements\` queue, and OMS status changes go to an \`order-status\` topic.
- Name the APIs exp-web-orders-api, exp-store-api, prc-orders-api, prc-inventory-api, prc-returns-api, prc-customer-notify, sys-marketplace-api and sys-oms-api. Give exp-web-orders-api 0.5 vCore so it can accept 100 orders a second.

**Your task.** Propose the integration architecture for inventory, orders, fulfilment status and returns.
`,
  answerTemplate: `## Systems of record and responsibilities

## Inventory flow (stores, warehouse, ATP)

## Order capture and routing

## Fulfilment status and customer communication

## Returns

## Peak readiness and risks
`,
  keyPoints: [
    'Clear responsibilities: OMS decides routing and owns order state; POS and WMS own physical stock; commerce and marketplaces are channels.',
    'Store stock moves from nightly batch to event-based deltas (sales, receipts, adjustments) with store-side buffering for connectivity loss.',
    'Safety stock/buffers per store compensate for imperfect accuracy, and store staff can reject a pick, which triggers re-routing.',
    'All channels submit orders through one Order API with idempotency; marketplace orders are adapted into the same model.',
    'Order status changes are events fanned out to customers, channels and finance, so every channel shows the same status.',
  ],
  solution: `
**Responsibilities.** OMS: order lifecycle, routing, ATP calculation. POS/WMS: stock movements. Commerce/marketplaces: capture. Mule: connectivity, transformation, event distribution, and protecting the OMS rate limits.

**Inventory.**
- Stores publish stock movements (sale, return, receipt, adjustment) to the \`stock-movements\` queue. Where POS cannot push, a store-side agent batches deltas every few minutes and holds them locally when offline (store-and-forward), then sends in order.
- Warehouse stock deltas come from WMS events or frequent polling through a WMS System API.
- \`prc-inventory-api\` aggregates deltas and updates the OMS in batches that respect its rate limits; a nightly full snapshot reconciles drift.
- ATP shown to channels comes from the OMS (cached for a short time at the Experience layer for browse pages).

**Orders.** \`exp-web-orders-api\` and \`sys-marketplace-api\` (polling or webhooks from marketplaces) → \`order-submissions\` queue → \`prc-orders-api\` → \`sys-oms-api\` → OMS create order with the channel order ID as idempotency key. Payment is authorised in the channel; capture happens on shipment.

**Fulfilment.** OMS routes an order to a store; the store app shows a pick list (via OMS or a store Experience API). If a picker cannot find the item, they reject → OMS re-routes. Status webhooks from OMS → \`sys-oms-api\` → \`order-status\` exchange in Anypoint MQ → notifications, commerce platform, marketplace status updates, finance.

**Returns.** Any store can accept a return: POS calls \`exp-store-api\` and \`prc-returns-api\`, which looks up the order in OMS, records the return, triggers refund via the original channel's payment provider and restocks the store inventory.

**Peak.** Queue order submissions between channels and OMS to absorb 8x spikes. Ten minutes at 100 orders a second against an OMS limit of 50 leaves about 30,000 orders queued, which drain in about 12 minutes at 40 a second of spare OMS capacity; load test against the OMS sandbox limits; pre-scale replicas.

**Risks.** Overselling from inaccurate store stock (buffers, pick rejection), OMS rate limits (batching, queues), store offline (store-and-forward, reconciliation), and status mismatches across marketplaces (single status event source).
`,
  followUps: [
    { q: 'Why not make store stock real time via direct POS calls on each web page view?', a: 'Hundreds of stores with unreliable links cannot serve web traffic. Pushing deltas to a central ATP source and caching gives fast reads and isolates stores from web load.' },
    { q: 'How do you avoid duplicate orders from marketplace polling?', a: 'Use the marketplace order ID as the idempotency key when creating the OMS order, and store a processed marker so repeated polls do not create new orders.' },
    { q: 'Who decides safety stock levels?', a: 'The merchandising/operations team, using pick-rejection and accuracy data; the integration exposes the data and the OMS applies the configured buffers.' },
  ],
}
