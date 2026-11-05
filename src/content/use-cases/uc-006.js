import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-006',
  category: 'use-cases',
  title: 'Order-to-Cash across E-commerce, ERP and Payments',
  level: 'EXPERT',
  tags: ['order-to-cash', 'saga', 'orchestration', 'reconciliation'],
  estMinutes: 45,
  diagram: {
    task: 'draw the order-to-cash integration: SFCC order intake into a queue, the orchestrator with its tracking store, System APIs for SAP, Adyen and SFCC, SAP events flowing back, and the reconciliation job.',
    checks: [
      { label: 'SFCC orders are queued before they are posted to SAP', rule: { type: 'path', from: ['saas', 'web-app'], via: 'queue', to: 'erp' } },
      { label: 'An order-to-cash Process API orchestrates the SAP, Adyen and SFCC System APIs', rule: { type: 'edge', from: 'process-api', to: 'system-api', min: 3 } },
      { label: 'SAP is reached only through a System API', rule: { type: 'only-via', target: 'erp', from: 'system-api' } },
      { label: 'Adyen is reached only through a System API', rule: { type: 'only-via', target: 'payment', from: 'system-api' } },
      { label: 'SAP fulfilment events (goods issue) come back asynchronously', rule: { type: 'edge', from: 'system-api', to: ['queue', 'topic', 'event-stream'], kind: 'async' } },
      { label: 'An order tracking store keeps the correlation and saga state', rule: { type: 'edge', from: 'process-api', to: { type: ['database', 'cache'], label: ['track', 'state', 'correlation', 'order'] } } },
      { label: 'A reconciliation job uses both the Adyen and SAP System APIs', rule: { type: 'edge', from: 'batch-job', to: 'system-api', min: 2 } },
      { label: 'Status updates flow back to SFCC', rule: { type: 'path', from: 'process-api', to: ['saas', 'web-app'] } },
    ],
    reference: diagram(
      {
        sfcc: ['saas', 'Salesforce Commerce Cloud'],
        eord: ['experience-api', 'exp-order-intake-api'],
        oq: ['queue', 'order-placed-q'],
        orch: ['process-api', 'prc-order-to-cash (saga)'],
        track: ['database', 'Order tracking store'],
        ssap: ['system-api', 'sys-sap-orders-api (≤ 15/s)'],
        sap: ['erp', 'SAP S/4HANA'],
        sapev: ['queue', 'sap-order-events-q'],
        sady: ['system-api', 'sys-adyen-api'],
        adyen: ['payment', 'Adyen'],
        ssfcc: ['system-api', 'sys-sfcc-orders-api'],
        recon: ['batch-job', 'Daily settlement reconciliation'],
      },
      [
        'sfcc -> eord', 'eord -> track', 'eord ~> oq', 'oq ~> orch', 'orch -> track', 'orch -> ssap', 'ssap -> sap', 'ssap ~> sapev',
        'sapev ~> orch', 'orch -> sady', 'sady -> adyen', 'orch -> ssfcc', 'ssfcc -> sfcc', 'recon -> sady', 'recon -> ssap',
      ],
    ),
  },
  description: `
A consumer electronics brand sells through **Salesforce Commerce Cloud (SFCC)**. Orders must flow to **SAP S/4HANA** (sales order, delivery, billing) and payments are handled by **Adyen** (card authorisation at checkout, **capture on shipment**).

Current pain (point-to-point scripts):
- Orders sometimes exist in SFCC but never reach SAP; nobody notices for days.
- Customers were charged for items that were later cancelled as out of stock.
- Finance spends 2 days each month reconciling Adyen settlements against SAP invoices.

Facts and constraints:
- 25k orders/day, Black Friday peak **10×** for 48 hours. SAP can take ~15 orders/second.
- Card authorisations **expire after ~7 days**; some items are pre-orders shipping in 3–4 weeks.
- Partial shipments are common (multiple deliveries per order) and each must capture only its share.
- Order status must be visible to customers in SFCC within 15 minutes of each change.
- Adyen sends webhooks (authorisation, capture, refund, chargeback) and daily settlement reports.

**Design the end-to-end order-to-cash integration:**
- Process steps and which system owns each state.
- Orchestration vs choreography — how do you coordinate SFCC, SAP and Adyen, and how do you compensate when a step fails (e.g. SAP rejects an order, stock-out after authorisation)?
- How do you handle captures for partial shipments and expiring authorisations for pre-orders?
- How do you survive the Black Friday peak without losing orders?
- How do you make "lost orders" impossible to miss and automate reconciliation?
`,
  answerTemplate: `## Process and system of record

## Coordination pattern

## Compensation scenarios

## Payments: partial capture and pre-orders

## Peak handling

## Monitoring and reconciliation
`,
  keyPoints: [
    'Clear ownership: SFCC owns the cart/order capture, SAP owns the sales order, fulfilment and invoice, Adyen owns payment state; Mule keeps a correlation (orderNo ↔ SAP order ↔ PSP reference).',
    'Order intake is decoupled: SFCC order event persisted to a queue/outbox immediately, then posted to SAP by a throttled consumer (≤ 15/s) with idempotent create (external order number).',
    'Saga-style coordination with explicit compensations: SAP rejection or stock-out → cancel/void the remaining authorisation or refund, update SFCC status, notify customer.',
    'Capture triggered by SAP goods-issue/delivery events, per delivery, for that delivery\'s amount (partial capture), using an idempotency key per delivery.',
    'Pre-orders: no long-lived auth — re-authorise (e.g. stored card / tokenised payment with consent) or capture/authorise close to the ship date, since auths expire in ~7 days.',
    'End-to-end monitoring: per-order state tracker with alerts for orders stuck beyond SLA; automated daily reconciliation of Adyen settlement report vs SAP billing with exceptions to finance.',
  ],
  solution: `
**Process and ownership.**
1. *Order placed* (SFCC) — card **authorised** in Adyen at checkout.
2. *Order created* (SAP) — availability check, sales order number returned.
3. *Delivery / goods issue* (SAP) — per shipment.
4. *Capture* (Adyen) — per shipment.
5. *Invoice* (SAP billing) and *settlement* (Adyen report) — reconciled.
System of record: SFCC for order capture, SAP for order/fulfilment/invoicing, Adyen for payment state. An **order tracking store** in the integration layer keeps the correlation \`sfccOrderNo ↔ sapOrderNo ↔ pspReference\` and the current step.

**Coordination.** Use a **hybrid**: events between domains (choreography), with an **Order Process API / orchestrator** owning the order-to-cash saga state and its compensations.
- SFCC publishes \`OrderPlaced\` (via an order export/webhook to a Mule Experience/System API) → stored in the tracking store **and** an Anypoint MQ queue before acknowledging. Nothing is lost if SAP is slow.
- A consumer creates the SAP sales order via the SAP System API with the SFCC order number as the **external reference**. That way a retry finds the existing order instead of creating a second.
- SAP events (order confirmed, delivery created, goods issued, cancelled) come back through a SAP System API (IDoc/OData/events) and drive the next steps.

**Compensation scenarios.**
- *SAP rejects the order* (invalid address, blocked customer): after retries for technical errors, mark the order failed, **cancel the Adyen authorisation**, set SFCC status *Cancelled*, notify the customer and customer service.
- *Stock-out after authorisation (line cancelled in SAP)*: no capture for that line — capture only shipped amounts; when the order completes, **cancel the remaining authorisation**. If something was already captured, issue a **refund**. Never capture up front for unshipped goods (this is the root cause of today's complaints).
- All compensations are idempotent and logged in the tracking store.

**Payments.**
- *Partial shipments:* each SAP goods-issue event triggers a **partial capture** for that delivery's value (lines + share of shipping/tax as agreed with finance). It uses an idempotency key such as \`sapDeliveryNo\` so a replayed event cannot capture twice. Adyen webhooks confirm the capture; failed captures go to an exception queue.
- *Pre-orders:* a 7-day authorisation will expire. Options: authorise a small amount/zero-value to verify the card and tokenise it (with the shopper's consent for later charges), then authorise and capture the full amount close to the ship date; or re-authorise before expiry. Handle a declined re-authorisation with a customer notification and an order hold.
- Adyen webhooks are verified (HMAC), queued, deduplicated by event code + PSP reference.

**Peak handling.** The intake path only persists and queues (fast, horizontally scaled replicas). SAP posting is a **throttled consumer** (≤ 15/s); 10× peak = ~250k orders/day ≈ 3/s average with bursts much higher, so the queue absorbs bursts and drains within hours. Communicate an expected delay on SAP order numbers during the peak; customer-facing status comes from the tracking store ("Order received") so SFCC is still updated within 15 minutes. Load-test the path at 10× before November and pre-scale.

**Monitoring and reconciliation.**
- The tracking store makes "lost orders" visible: scheduled checks flag orders stuck in a state beyond its SLA (e.g. *placed* but not in SAP after 30 min, *shipped* but not captured after 2 h) and alert with order numbers. Dashboards in Anypoint Monitoring / the ops tool on queue depth, DLQs and error rates; correlation ID = SFCC order number across all logs.
- **Automated reconciliation:** a daily job loads the Adyen settlement report and matches lines to SAP billing documents by PSP reference / order number and amount. It posts matched items (or clears them in SAP) and creates an exception list for finance (unmatched captures, fees, chargebacks, amount differences). Finance handles only the exceptions instead of everything.
`,
}
