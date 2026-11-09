import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-085',
  category: 'use-cases',
  title: 'Split Orders across Two DCs and a 3PL with One Customer Status',
  level: 'ADVANCED',
  tags: ['order-to-cash', 'wms', '3pl', 'edi', 'event-driven', 'retail', 'refunds', 'aggregation'],
  estMinutes: 35,
  diagram: {
    task: 'draw the fulfilment design: released orders as events, a router that sends each node its own queue, two WMSs and a 3PL behind System APIs, shipment events back to a status Process API with a line status store, the OMS, the customer message and refunds.',
    checks: [
      { label: 'The OMS publishes released orders as async events', rule: { type: 'each', of: 'erp', edgeTo: ['topic', 'queue', 'event-stream'], kind: 'async' } },
      { label: 'The router sends each node its own queue (3 nodes)', rule: { type: 'each', of: 'process-api', edgeTo: 'queue', kind: 'async', count: 3, some: true } },
      { label: 'All three fulfilment nodes are reached', rule: { type: 'path', from: 'erp', to: ['wms', 'sftp-server', 'external-api'], min: 3 } },
      { label: 'Warehouses and the 3PL are reached only through System APIs', rule: { type: 'only-via', target: ['wms', 'sftp-server', 'external-api'], from: 'system-api' } },
      { label: 'Both warehouses report shipments as async messages', rule: { type: 'each', of: 'wms', min: 2, edgeTo: ['queue', 'topic', 'event-stream'], kind: 'async' } },
      { label: 'Line status is kept per order line to build one customer status', rule: { type: 'edge', from: 'process-api', to: ['database', 'cache'] } },
      { label: 'Cancelled lines are refunded through a System API', rule: { type: 'only-via', target: 'payment', from: 'system-api' } },
      { label: 'No Process API calls a warehouse in a sync chain', rule: { type: 'no-path', from: 'process-api', to: ['wms', 'sftp-server', 'external-api'], kind: 'sync' } },
    ],
    reference: diagram(
      {
        oms: ['erp', 'OMS'],
        top: ['topic', 'orders-released'],
        rt: ['process-api', 'prc-fulfilment-router'],
        qn: ['queue', 'fulfil-north'],
        qs: ['queue', 'fulfil-south'],
        q3: ['queue', 'fulfil-3pl'],
        sn: ['system-api', 'sys-wms-north'],
        ss: ['system-api', 'sys-wms-south'],
        s3pl: ['system-api', 'sys-3pl-edi'],
        wn: ['wms', 'DC North WMS'],
        wsouth: ['wms', 'DC South WMS'],
        sftp: ['sftp-server', '3PL SFTP (940 out, 945 in)'],
        ev: ['queue', 'shipment-events'],
        st: ['process-api', 'prc-order-status'],
        sdb: ['database', 'Line status store (order + line, version)'],
        soms: ['system-api', 'sys-oms'],
        snot: ['system-api', 'sys-notifications'],
        msg: ['notification', 'Customer email and push'],
        spay: ['system-api', 'sys-payments'],
        pay: ['payment', 'Payment provider'],
      },
      [
        'oms ~> top', 'top ~> rt', 'rt ~> qn', 'rt ~> qs', 'rt ~> q3', 'qn ~> sn', 'qs ~> ss', 'q3 ~> s3pl',
        'sn -> wn', 'ss -> wsouth', 's3pl -> sftp', 'wn ~> ev', 'wsouth ~> ev', 's3pl ~> ev',
        'ev ~> st', 'st -> sdb', 'st -> soms', 'soms -> oms', 'st -> snot', 'snot -> msg', 'st -> spay', 'spay -> pay',
      ],
    ),
  },
  description: `
A home and garden retailer takes **25,000 online orders a day**. The OMS decides, line by line, where each item ships from:
- **DC North** (WMS with a REST API),
- **DC South** (a different WMS product, also REST),
- a **3PL** for bulky items such as sheds and furniture, which only speaks **EDI**: 940 warehouse orders in and 945 shipping advices out, over SFTP.

About **30 % of orders are split** across two or three nodes. Customers complain that the website shows "Shipped" when only one of three parcels left.

Requirements:
- Each node gets **only its lines**, within **10 minutes** of release.
- A slow or broken node must not delay the others. The 3PL picks up files every 30 minutes.
- The customer sees **one order** with a status per shipment, and "Complete" only when every line is shipped or cancelled.
- A line a node cannot fulfil is **cancelled and refunded** on its own.
- Shipment messages can arrive twice or out of order (a 945 can arrive before the WMS confirms a sibling line).

The OMS publishes an **order released** event with the sourcing decision per line.

**Questions:**
1. Draw the routing and the way back.
2. How do you keep nodes independent of each other?
3. How do you build one customer status from several shipment events?
4. How are cancelled lines refunded, and how do you avoid refunding twice?
`,
  answerTemplate: `## Routing to nodes

## Node adapters

## Shipment events

## One customer status

## Cancellations and refunds

## Monitoring
`,
  keyPoints: [
    'The OMS publishes order released; prc-fulfilment-router splits the lines by node and publishes one message per node queue.',
    'Each node has its own queue and System API, so a 3PL backlog never delays the DCs.',
    'The 3PL System API batches 940s to SFTP and turns 945s back into canonical shipment events.',
    'prc-order-status keeps a row per order line with a version, ignores older or repeated events, and derives the order status from all lines.',
    'A cancelled line is refunded once, with the order line ID as the idempotency key.',
  ],
  solution: `
\`\`\`
OMS ~> [orders-released] ~> prc-fulfilment-router ~> [fulfil-north] ~> sys-wms-north -> DC North
                                                   ~> [fulfil-south] ~> sys-wms-south -> DC South
                                                   ~> [fulfil-3pl]   ~> sys-3pl-edi   -> 3PL SFTP
DC North, DC South, sys-3pl-edi ~> [shipment-events] ~> prc-order-status -> line status store
                                                                         -> sys-oms, sys-notifications, sys-payments
\`\`\`

**Routing.** prc-fulfilment-router consumes order released, groups lines by node and publishes one message per node: order ID, node, its lines, delivery address. It never calls a WMS itself, so the router finishes in milliseconds whatever the nodes are doing.

**Node adapters.**
- sys-wms-north and sys-wms-south consume their queues and call their WMS APIs. Each WMS order reference is order ID plus node, so a redelivered message is rejected as a duplicate and treated as success.
- sys-3pl-edi collects 3PL messages and writes one **940 file every 15 minutes**, under the 3PL pickup interval. It polls the SFTP outbound folder for **945** files, maps them to the canonical shipment event and publishes to shipment-events.

**Shipment events.** Every node publishes the same canonical event: order ID, line IDs, node, status (shipped, cancelled), carrier, tracking, event time.

**One customer status.** prc-order-status keeps one row per order line: status, tracking, last event time. An event older than the stored time, or with the same event ID, is ignored. After each update it derives the order status:
- all lines shipped or cancelled: Complete;
- some shipped: Partly shipped, with each parcel and tracking;
- none: Processing.
It updates the OMS through sys-oms and sends the customer one message per new parcel, not one per line.

**Cancellations and refunds.** A cancelled line triggers a refund of that line through sys-payments. The **order line ID is the idempotency key**, so a repeated cancel event never refunds twice.

**Monitoring.** Alert when a node queue is older than 10 minutes, and when a 940 has no 997 acknowledgement after 1 hour.
`,
  followUps: [
    { q: 'Why not one queue for all nodes with a selector?', a: 'One queue shares one backlog. A 3PL message stuck in redelivery would sit in front of DC messages, while separate queues keep each node independent.' },
    { q: 'How do you handle a 945 that arrives before the router message is processed by the status API?', a: 'The status store creates the line row from whichever event arrives first. Later events fill in the rest, so arrival order does not matter.' },
    { q: 'Why does the OMS not track parcel status itself?', a: 'It may, if it can consume shipment events. Many OMSs only hold order status, so a small status Process API fills the gap.' },
    { q: 'What if the OMS changes the sourcing after release?', a: 'It publishes a reallocation event. The router cancels the line at the old node and sends it to the new one, and the status API records both.' },
  ],
}
