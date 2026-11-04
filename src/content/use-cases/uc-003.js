import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-003',
  category: 'use-cases',
  title: 'Real-Time Inventory to Sales Channels',
  level: 'INTERMEDIATE',
  tags: ['inventory', 'pub-sub', 'rate-limits', 'event-driven'],
  estMinutes: 25,
  diagram: {
    task: 'draw how WMS stock changes fan out to Shopify and Amazon through one queue per channel, where the latest stock is stored, and how the kiosk reads stock without touching the WMS.',
    checks: [
      { label: 'Inventory changes are published asynchronously to a topic/exchange', rule: { type: 'edge', to: ['topic', 'event-stream'], kind: 'async' } },
      { label: 'Each channel gets its own queue bound to the exchange', rule: { type: 'edge', from: ['topic', 'event-stream'], to: 'queue', kind: 'async', min: 2 } },
      { label: 'Shopify is reached only through a System API', rule: { type: 'only-via', target: { type: ['saas', 'external-api'], label: 'shopify' }, from: 'system-api' } },
      { label: 'Amazon is reached only through a System API', rule: { type: 'only-via', target: { type: ['saas', 'external-api'], label: 'amazon' }, from: 'system-api' } },
      { label: 'The latest stock per SKU is kept in an inventory store or cache', rule: { type: 'edge', from: ['system-api', 'process-api', 'batch-job'], to: ['database', 'cache'] } },
      { label: 'The kiosk calls an Experience API', rule: { type: 'each', of: 'device', edgeTo: 'experience-api' } },
      { label: 'The kiosk reads stock from the store, not the WMS', rule: { type: 'path', from: 'device', to: ['database', 'cache'] } },
    ],
    reference: diagram(
      {
        wms: ['legacy', 'Manhattan WMS'],
        wq: ['topic', 'WMS inventory topic'],
        cap: ['system-api', 'sys-wms-inventory-api'],
        ex: ['topic', 'inventory-changed exchange'],
        qs: ['queue', 'shopify-inv-q'],
        qa: ['queue', 'amazon-inv-q'],
        ps: ['process-api', 'prc-shopify-inventory-sync (coalesce, throttle)'],
        pa: ['batch-job', 'Amazon feed builder (every 1-2 min)'],
        ss: ['system-api', 'sys-shopify-api'],
        sa: ['system-api', 'sys-amazon-feeds-api'],
        shop: ['saas', 'Shopify'],
        amz: ['external-api', 'Amazon marketplace'],
        store: ['database', 'Inventory store (latest per SKU+warehouse)'],
        kiosk: ['device', 'In-store kiosk'],
        ek: ['experience-api', 'exp-kiosk-api'],
        pinv: ['process-api', 'prc-inventory-api'],
      },
      [
        'wms ~> wq', 'wq ~> cap', 'cap ~> ex', 'cap -> store', 'ex ~> qs', 'ex ~> qa', 'qs ~> ps', 'qa ~> pa',
        'ps -> ss', 'pa -> sa', 'ss -> shop', 'sa -> amz', 'kiosk -> ek', 'ek -> pinv', 'pinv -> store',
      ],
    ),
  },
  description: `
A sporting goods retailer runs a **Manhattan-style WMS** in two warehouses. Stock must be visible on three sales channels:

- **Shopify** storefront — REST/GraphQL Admin API with strict **API rate limits** (leaky-bucket; bursts get 429).
- **Amazon marketplace** — accepts inventory feeds; updates take minutes to apply and bulk feeds are preferred.
- **In-store kiosk app** — calls an internal API on demand.

Facts:
- The WMS emits an inventory change message (SKU, warehouse, on-hand qty, timestamp) to a JMS/MQ topic on every pick, receipt or adjustment: **~300k messages/day**, peaks of 50/s during morning picking.
- A single hot SKU can change 20 times in a minute.
- The business wants channels updated **within 2 minutes** and to sell no more than **available-to-sell = on-hand − safety stock (per channel)**.

**Design the integration:**
- How do you fan out the changes to each channel independently?
- How do you deal with Shopify rate limits and Amazon's preference for bulk feeds?
- How do you avoid sending stale quantities when messages arrive out of order?
- How does the kiosk get stock data?
`,
  answerTemplate: `## Capturing WMS changes

## Fan-out per channel

## Rate limits and batching

## Out-of-order / stale updates

## Kiosk access
`,
  keyPoints: [
    'A System API/consumer turns WMS messages into a canonical InventoryChanged event published to an exchange/topic with one queue per channel.',
    'Updates are sent as absolute quantities (set on-hand/available), not deltas, so retries and duplicates are harmless.',
    'Per-channel consumers coalesce rapid changes for the same SKU (e.g. keep latest per SKU over a short window) to cut call volume.',
    'Shopify consumer throttles to the API limit and backs off on 429 (respecting Retry-After/rate headers); Amazon consumer builds periodic bulk feeds within the 2-minute target.',
    'Event timestamp/sequence compared to the last applied value per SKU+warehouse so older events are ignored.',
    'Available-to-sell calculated per channel (on-hand minus channel safety stock), and the kiosk reads from a Process/Experience API backed by a cache or inventory store rather than hitting the WMS per request.',
  ],
  solution: `
**Capture.** A Mule app subscribes to the WMS topic, maps the message to a canonical \`InventoryChanged\` event (\`sku\`, \`warehouse\`, \`onHand\`, \`eventTime\`) and publishes it to an **Anypoint MQ exchange** (or keeps using the existing broker). It also upserts the latest value into an **inventory store** (DB table keyed on SKU + warehouse) — only if \`eventTime\` is newer than the stored one.

**Fan-out.** One queue per channel bound to the exchange: \`shopify-inv-q\`, \`amazon-inv-q\`. Each channel consumer scales and fails independently; an Amazon outage does not slow Shopify.

**Rate limits and batching.**
- Messages carry **absolute** quantities, so a channel only needs the *latest* value per SKU. Consumers **coalesce**: collect events for ~30–60 s, keep the newest per SKU+warehouse, then send. A SKU that changed 20 times becomes one call.
- *Shopify:* limit concurrency (e.g. \`maxConcurrency\` on the flow) to stay under the bucket, read the rate-limit response headers, back off on **429**, and use bulk/multi-item mutations where available.
- *Amazon:* build an inventory **feed** every 1–2 minutes from the coalesced set and submit it; poll the feed result and re-queue failed SKUs.
- Compute **available-to-sell** per channel in DataWeave: available = max of 0 and (total on-hand across warehouses − the channel's safety stock).

**Out-of-order updates.** Keep "last applied eventTime" per SKU+warehouse (Object Store or DB). A consumer drops an event older than what was already applied. Because quantities are absolute, a duplicate just re-sends the same number.

**Kiosk.** An Inventory Process/Experience API reads from the inventory store (fast, no WMS load), optionally with a short cache TTL. If exact real-time stock is required for a specific SKU, it can fall back to a WMS query, protected by rate limiting.

**Monitoring.** Alert on queue depth / age of oldest message per channel to catch breaches of the 2-minute target.
`,
}
