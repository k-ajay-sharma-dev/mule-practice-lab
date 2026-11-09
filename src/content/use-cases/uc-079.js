import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-079',
  category: 'use-cases',
  title: 'Online Orders from Store Webhooks to the ERP and Warehouse',
  level: 'INTERMEDIATE',
  tags: ['e-commerce', 'webhooks', 'order-to-cash', 'wms', 'erp', 'idempotency', 'anypoint-mq'],
  estMinutes: 30,
  diagram: {
    task: 'draw order capture and fulfilment: store webhooks into a queue, the capture Process API with its duplicate check against a store of processed order IDs, the ERP and WMS behind System APIs, shipment confirmations coming back from the WMS, and the tracking update to the store platform.',
    checks: [
      { label: 'Webhooks are acknowledged fast and queued', rule: { type: 'edge', from: ['experience-api', 'api-gateway'], to: ['queue', 'cloud-queue'], kind: 'async' } },
      { label: 'The webhook API never calls the ERP or WMS synchronously', rule: { type: 'no-path', from: 'experience-api', to: ['erp', 'wms'], kind: 'sync' } },
      { label: 'Duplicate webhooks are filtered by order ID', rule: { type: 'edge', from: 'process-api', to: { type: ['cache', 'database'], label: ['processed', 'order id', 'dedup', 'idempot', 'seen'] } } },
      { label: 'Every order reaches both the ERP and the WMS', rule: { type: 'path', from: 'saas', to: ['erp', 'wms'], min: 2 } },
      { label: 'ERP and WMS are reached only through System APIs', rule: { type: 'only-via', target: ['erp', 'wms'], from: 'system-api' } },
      { label: 'The WMS sends shipment confirmations as async messages', rule: { type: 'each', of: 'wms', edgeTo: ['queue', 'topic', 'event-stream', 'cloud-queue'], kind: 'async' } },
      { label: 'The store platform is updated only through a System API', rule: { type: 'only-via', target: 'saas', from: 'system-api' } },
      { label: 'Orders that keep failing go to a dead-letter queue', rule: { type: 'edge', from: ['queue', 'cloud-queue'], to: 'dlq' } },
    ],
    reference: diagram(
      {
        shop: ['saas', 'Online store platform'],
        wh: ['experience-api', 'exp-commerce-webhooks (HMAC)'],
        qo: ['queue', 'orders-in'],
        dlq: ['dlq', 'orders-in-dlq'],
        cap: ['process-api', 'prc-order-capture'],
        seen: ['cache', 'Processed order IDs'],
        serp: ['system-api', 'sys-erp-orders'],
        erp: ['erp', 'ERP (sales orders, invoices)'],
        swms: ['system-api', 'sys-wms'],
        wms: ['wms', 'Warehouse WMS'],
        qs: ['queue', 'shipments'],
        ful: ['process-api', 'prc-fulfilment-update'],
        sshop: ['system-api', 'sys-store-platform'],
      },
      [
        'shop -> wh', 'wh ~> qo', 'qo ~> cap', 'qo ~> dlq', 'cap -> seen', 'cap -> serp', 'serp -> erp', 'cap -> swms', 'swms -> wms',
        'wms ~> qs', 'qs ~> ful', 'ful -> serp', 'ful -> sshop', 'sshop -> shop',
      ],
    ),
  },
  description: `
A direct-to-consumer sportswear brand sells on a hosted store platform: **6,000 orders a day**, and up to **40 orders a second** in the first minutes of a product drop.

Systems:
- The platform sends an **orders/paid webhook** (HMAC signed) and expects a 200 within 5 seconds. It retries for 48 hours, and duplicates happen.
- The **ERP** (NetSuite style) needs a sales order for every order, and later an item fulfilment and an invoice. Its API allows **10 concurrent requests** for this integration.
- The **WMS** in the brand's warehouse picks and ships. Orders that reach the WMS by **15:00** ship the same day.
- When a parcel ships, the WMS publishes a **shipment confirmed** message with the carrier and tracking number.
- The customer must see the tracking number in the store's order page, and the platform then emails the customer.

**Questions:**
1. Draw the integration from webhook to shipment.
2. How do you survive a product drop with 40 orders a second and an ERP that takes 10 concurrent requests?
3. How do you stop a duplicate webhook from creating a second sales order or a second pick?
4. In which order do you create the sales order and the WMS order, and what if one fails?
5. How does the tracking number get back to the customer?
`,
  answerTemplate: `## Webhook intake

## Order capture

## Duplicates

## ERP and WMS

## Shipments back to the store

## Errors and monitoring
`,
  keyPoints: [
    'exp-commerce-webhooks checks the HMAC, publishes to the orders-in queue and replies 200; the drop peak waits in the queue.',
    'prc-order-capture consumes with a fixed concurrency of 8 so the ERP limit of 10 is never exceeded.',
    'The platform order ID is the key: Object Store check first, and the ERP external ID and WMS order reference repeat it.',
    'Sales order first, then WMS order; if the WMS call fails the message is retried, and the ERP upsert by external ID makes the retry safe.',
    'WMS shipment messages go to a queue; prc-fulfilment-update creates the item fulfilment in the ERP and the fulfilment with tracking in the store platform.',
  ],
  solution: `
\`\`\`
Store -> exp-commerce-webhooks ~> [orders-in] ~> prc-order-capture -> sys-erp-orders -> ERP
                                                                   -> sys-wms -> WMS
WMS ~> [shipments] ~> prc-fulfilment-update -> sys-erp-orders (fulfilment, invoice)
                                            -> sys-store-platform (tracking) -> Store
\`\`\`

**Webhook intake.** exp-commerce-webhooks validates the HMAC on the raw body and publishes the order to **orders-in** (Anypoint MQ). It replies 200 in well under a second. During a drop, 40 orders a second pile up in the queue, which is what queues are for.

**Order capture.** prc-order-capture consumes with **maxConcurrency 8**. The ERP never sees more than 8 parallel calls, under its limit of 10. 6,000 orders a day is about 4 a minute on average, so the backlog after a drop clears in minutes.

**Duplicates.** The platform order ID is the idempotency key:
1. The consumer looks it up in the processed order IDs store. If found, it acknowledges and stops.
2. The ERP sales order is an **upsert by external ID** (the platform order ID), so a retry updates instead of creating.
3. The WMS order reference is the same ID; the WMS rejects a second order with that reference, and the API treats that reply as success.
The ID is written to the store only after both calls succeed.

**ERP and WMS.** The sales order comes first, because finance needs every shipped order in the ERP. Then the WMS order. If the WMS call fails, the message is not acknowledged and is redelivered. Step 2 then finds the existing sales order and moves on. After 5 deliveries the message goes to **orders-in-dlq** and an alert fires, since an order stuck before 15:00 misses same-day dispatch.

**Shipments.** The WMS publishes to **shipments**. prc-fulfilment-update creates the item fulfilment and invoice in the ERP, and calls sys-store-platform to create the fulfilment with carrier and tracking number. The platform then emails the customer, so no separate email service is needed.

**Monitoring.** Alert on queue depth above 500 for more than 10 minutes, on any DLQ message, and on orders paid more than 30 minutes ago with no WMS reference.
`,
  followUps: [
    { q: 'Why not let the WMS read orders from the ERP instead?', a: 'That works when the ERP already feeds the WMS. Here a direct WMS order saves the ERP round trip and keeps the 15:00 cut-off safe.' },
    { q: 'What if a shipment message arrives before the sales order exists?', a: 'The ERP call fails with not found. The message is retried with backoff until the order exists, and it lands in the DLQ only after many tries.' },
    { q: 'How do you handle an order cancelled after it reached the WMS?', a: 'An orders/cancelled webhook follows the same queue. The capture API asks the WMS to cancel; if picking already started, it raises a task for the warehouse.' },
    { q: 'Why is the order ID stored only after both calls succeed?', a: 'Storing it earlier would make a retry skip the WMS call that failed. Each call is idempotent on its own, so a retry repeats safely.' },
  ],
}
