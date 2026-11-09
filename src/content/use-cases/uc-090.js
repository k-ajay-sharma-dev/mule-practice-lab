import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-090',
  category: 'use-cases',
  title: 'Replatforming the Online Store without Losing Orders',
  level: 'EXPERT',
  tags: ['migration', 'strangler-fig', 'e-commerce', 'canonical-model', 'publish-subscribe', 'sap', 'wms', 'webhooks'],
  estMinutes: 50,
  diagram: {
    task: 'draw the migration design: country routing in front of the old and new platforms, orders from both into one queue and a normaliser with an order origin map, one canonical topic feeding SAP and the WMS through System APIs, and shipment updates routed back to the platform that took each order.',
    checks: [
      { label: 'Country routing sits in front of both platforms, so a country can be switched back', rule: { type: 'each', of: ['legacy', 'saas'], min: 2, edgeFrom: ['load-balancer', 'api-gateway'] } },
      { label: 'Orders from the new platform reach SAP and the WMS', rule: { type: 'path', from: 'saas', to: ['erp', 'wms'], min: 2 } },
      { label: 'Orders from the old platform reach SAP and the WMS', rule: { type: 'path', from: 'legacy', to: ['erp', 'wms'], min: 2 } },
      { label: 'Downstream systems hear about orders only through the canonical topic', rule: { type: 'no-path', from: ['legacy', 'saas'], to: ['erp', 'wms'], unless: ['topic', 'event-stream'] } },
      { label: 'SAP and the WMS are reached only through System APIs', rule: { type: 'only-via', target: ['erp', 'wms'], from: 'system-api' } },
      { label: 'Shipment updates go back to both platforms', rule: { type: 'path', from: 'wms', to: ['legacy', 'saas'], min: 2 } },
      { label: 'The order origin is recorded so updates find the right platform', rule: { type: 'edge', from: 'process-api', to: { type: ['database', 'cache'], label: ['origin', 'map', 'platform'] } } },
      { label: 'Integrations write to each platform only through a System API', rule: { type: 'only-via', target: ['legacy', 'saas'], from: ['system-api', 'load-balancer', 'api-gateway'] } },
    ],
    reference: diagram(
      {
        web: ['web-app', 'Shoppers (12 country sites)'],
        lb: ['load-balancer', 'CDN routing by country (rollback switch)'],
        mag: ['legacy', 'Magento 2 (old platform)'],
        saas: ['saas', 'SaaS commerce platform (new)'],
        smag: ['system-api', 'sys-magento'],
        wh: ['experience-api', 'exp-commerce-webhooks'],
        inq: ['queue', 'orders-inbound'],
        norm: ['process-api', 'prc-order-normaliser'],
        map: ['database', 'Order origin map (order number to platform)'],
        top: ['topic', 'orders.v1 (canonical)'],
        erpP: ['process-api', 'prc-order-to-erp'],
        ssap: ['system-api', 'sys-sap-orders'],
        sap: ['erp', 'SAP S/4HANA'],
        wmsP: ['process-api', 'prc-order-to-wms'],
        swms: ['system-api', 'sys-wms'],
        wms: ['wms', 'WMS'],
        ship: ['queue', 'shipment-events'],
        stat: ['process-api', 'prc-status-router'],
        ssaas: ['system-api', 'sys-commerce-platform'],
      },
      [
        'web -> lb', 'lb -> mag', 'lb -> saas', 'mag ~> inq', 'saas -> wh', 'wh ~> inq', 'inq ~> norm', 'norm -> map', 'norm ~> top',
        'top ~> erpP', 'top ~> wmsP', 'erpP -> ssap', 'ssap -> sap', 'wmsP -> swms', 'swms -> wms', 'wms ~> ship', 'ship ~> stat',
        'stat -> map', 'stat -> ssaas', 'ssaas -> saas', 'stat -> smag', 'smag -> mag',
      ],
    ),
  },
  description: `
A fashion retailer runs **12 country sites** on a self-hosted **Magento 2**. It is moving to a **SaaS commerce platform** over four months, one country at a time: UK first, then Germany and France, then the other nine.

Today about **35 point-to-point integrations** hang off Magento: a cron job that exports orders to SAP, scripts that push orders to the WMS, a CRM sync, an email platform feed, and more. Several read the Magento MySQL database directly.

Requirements:
- During the move **both platforms take orders**. Peak is **2,500 orders an hour** across all countries.
- **SAP S/4HANA** and the **WMS** must not care which platform an order came from.
- Order numbers must be unique across both platforms (the new platform uses a different prefix).
- Shipment and cancellation updates must reach the **platform that took the order**, so the customer sees them in "My orders".
- A country must be **switched back** to Magento within **1 hour** if the new platform fails.
- Returns for orders placed on Magento must still work after the country has moved.

Facts:
- The new platform sends signed webhooks for orders and offers an Admin API.
- Magento has a message queue framework; a small extension can publish an event for each order placed.

**Questions:**
1. Draw the target design for the migration period.
2. How do you keep SAP and the WMS unaware of the platform?
3. How do updates find the right platform?
4. How do you move a country, and how do you move it back?
5. What do you do with the 35 old integrations?
`,
  answerTemplate: `## Strategy

## Order intake from both platforms

## Canonical order and downstream

## Updates back to the right platform

## Moving and rolling back a country

## Retiring the old integrations
`,
  keyPoints: [
    'A strangler approach: both platforms publish orders into one inbound queue; a normaliser turns them into one canonical order on a topic.',
    'SAP and the WMS consume only the canonical topic through their own Process and System APIs, so they never learn which platform was used.',
    'The normaliser records order number to platform in an origin map; the status router reads it to update the right platform.',
    'Country routing at the CDN decides which platform serves a country, and switching it back takes minutes.',
    'Old integrations move one by one onto the canonical topic and are switched off; nothing reads the Magento database any more.',
  ],
  solution: `
\`\`\`
Shoppers -> CDN (country routing) -> Magento | SaaS platform
Magento ~> [orders-inbound];  SaaS -> exp-commerce-webhooks ~> [orders-inbound]
[orders-inbound] ~> prc-order-normaliser -> origin map
                                         ~> [orders.v1] ~> prc-order-to-erp -> sys-sap-orders -> SAP
                                                        ~> prc-order-to-wms -> sys-wms -> WMS
WMS ~> [shipment-events] ~> prc-status-router -> origin map
                                              -> sys-commerce-platform -> SaaS
                                              -> sys-magento -> Magento
\`\`\`

**Strategy.** This is a **strangler fig** migration. Instead of moving 35 integrations with each country, the integrations move once onto a canonical layer. After that, moving a country only changes where its orders come from.

**Order intake.** A Magento extension publishes an event for each order placed to **orders-inbound**. The new platform calls exp-commerce-webhooks, which checks the signature and publishes to the same queue. Both messages carry the source platform.

**Canonical order.** prc-order-normaliser maps each source format to **orders.v1**: order number, country, customer, lines, tenders, delivery. It writes order number and platform to the **origin map**, then publishes to the canonical topic. prc-order-to-erp and prc-order-to-wms each consume their own subscription and call their System APIs. SAP and the WMS only ever see orders.v1. Order numbers stay unique because each platform has its own prefix, and the normaliser rejects a clash to the DLQ.

**Updates back.** The WMS publishes shipments and cancellations to shipment-events. prc-status-router looks up the order number in the origin map and calls sys-commerce-platform or sys-magento. A Magento order placed before the move still updates Magento, so the customer sees it.

**Moving a country.** Before the switch: customers and open carts are migrated, and customers are asked to reset their password at first login. On the day, the CDN routing for that country moves to the new platform. Rolling back is the same switch in reverse. Orders taken on the new platform during the incident stay valid, because the origin map routes their updates correctly.

**Old integrations.** Each of the 35 integrations is rebuilt as a subscriber on orders.v1 or retired. A list tracks each one with its owner and switch-off date. The goal is that nothing reads the Magento MySQL database when the last country moves, so Magento can be switched off.

**Returns.** Returns for old Magento orders are created in SAP against the canonical order number; the status router updates whichever platform the origin map names.
`,
  followUps: [
    { q: 'Why not migrate all 12 countries in one weekend?', a: 'A big bang puts every country at risk at once, with no way back. Moving one country at a time limits the damage and lets the team learn before the largest markets.' },
    { q: 'Why keep a canonical order instead of mapping each platform directly to SAP?', a: 'Direct mappings double the work during the move and must be rewritten when Magento is retired. The canonical model makes the platform change invisible downstream.' },
    { q: 'What goes wrong if the origin map is lost?', a: 'Updates cannot find their platform. The order number prefix is a fallback rule, and the map is a replicated database with backups.' },
    { q: 'How do you keep customer accounts in step while both platforms run?', a: 'Migrate accounts per country at switch time and keep the CRM as the master. Changes made on the old site after the move are blocked, since its country routing no longer reaches it.' },
  ],
}
