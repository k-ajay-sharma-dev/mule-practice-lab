import { diagram } from '../../arch/dsl.js'

export default {
  id: 'cs-064',
  category: 'case-studies',
  title: 'Apparel Retailer Unifying Online and In-Store Returns and Refunds',
  level: 'INTERMEDIATE',
  tags: ['retail', 'e-commerce', 'omnichannel', 'returns', 'events', 'idempotency', 'sap', 'wms'],
  estMinutes: 45,
  diagram: {
    task: 'draw the returns design: the returns portal and store POS using one returns Experience API, a returns Process API that checks the original order and books a carrier label, a return-received event from the DC or store, and a refunds Process API that pays through the payment provider, posts to SAP and dead-letters failures.',
    checks: [
      { label: 'The returns portal and the store POS both use a returns Experience API', rule: { type: 'each', of: ['web-app', 'pos'], min: 2, edgeTo: 'experience-api' } },
      { label: 'The returns Process API checks the original order in Commerce Cloud', rule: { type: 'path', from: 'experience-api', to: 'saas', via: { type: 'process-api', label: 'return' } } },
      { label: 'A received return is published as an event', rule: { type: 'edge', from: ['system-api', 'wms', 'process-api'], to: ['topic', 'event-stream'], kind: 'async' } },
      { label: 'No synchronous route from the returns portal reaches the payment provider', rule: { type: 'no-path', from: 'web-app', to: 'payment', kind: 'sync' } },
      { label: 'A refunds Process API acts on the event and pays the refund', rule: { type: 'path', from: ['topic', 'event-stream'], to: 'payment', via: { type: 'process-api', label: 'refund' } } },
      { label: 'The payment provider is reached only through a System API', rule: { type: 'only-via', target: 'payment', from: 'system-api' } },
      { label: 'Every refund also reaches SAP for the credit note', rule: { type: 'path', from: { type: 'process-api', label: 'refund' }, to: 'erp', via: 'system-api' } },
      { label: 'SAP is reached only through a System API', rule: { type: 'only-via', target: 'erp', from: 'system-api' } },
      { label: 'Refunds that keep failing go to a dead-letter queue', rule: { type: 'edge', from: { type: 'process-api', label: 'refund' }, to: 'dlq' } },
    ],
    reference: diagram(
      {
        portal: ['web-app', 'Returns portal'],
        pos: ['pos', 'Xstore POS (450 stores)'],
        eret: ['experience-api', 'exp-returns-api'],
        prc: ['process-api', 'prc-returns'],
        pref: ['process-api', 'prc-refunds'],
        rec: ['topic', 'return-received'],
        dlq: ['dlq', 'refunds DLQ'],
        sord: ['system-api', 'sys-order-api'],
        scar: ['system-api', 'sys-carrier-api'],
        swms: ['system-api', 'sys-wms-api'],
        spay: ['system-api', 'sys-payment-api'],
        ssap: ['system-api', 'sys-sap-finance-api'],
        sfcc: ['saas', 'Salesforce Commerce Cloud (orders)'],
        car: ['external-api', 'Carrier label API'],
        wms: ['wms', 'Manhattan WMS (returns DC)'],
        pay: ['payment', 'Adyen'],
        sap: ['erp', 'SAP S/4HANA'],
      },
      [
        'portal -> eret', 'pos -> eret', 'eret -> prc', 'prc -> sord', 'sord -> sfcc', 'prc -> scar', 'scar -> car',
        'wms -> swms', 'swms ~> rec', 'prc ~> rec', 'rec ~> pref', 'pref -> spay', 'spay -> pay', 'pref -> ssap', 'ssap -> sap',
        'pref ~> dlq',
      ],
    ),
  },
  description: `
**Context.** A fashion retailer sells through 450 stores and a website in 6 countries. Online return rates are about 30%. In the week after Christmas the business handles up to 25,000 returns a day.

**How returns work today**
- **Online returns** are posted to one returns DC. Staff key the return into a custom Access database, and finance refunds the card in Adyen by hand within 10 to 14 days.
- **Store returns** of online orders are refused, because the Oracle Xstore POS cannot see online orders.
- Complaints about slow refunds are the top reason for contacting customer service.

**Goals**
- A self-service returns portal: the customer picks items, gets a QR code or a carrier label, and drops the parcel at a store or a parcel shop.
- Stores can accept any return, online or in-store, and refund at the till when the item is in front of them.
- Online refunds are paid within 24 hours of the parcel being scanned at the DC, never before.
- Every refund must post a credit note to SAP S/4HANA, and stock must go back to sellable when it passes inspection.

**Systems**
| System | Role |
|---|---|
| Salesforce Commerce Cloud | Online orders and customers |
| Oracle Xstore POS | Store sales, store returns, card terminal |
| Manhattan WMS | Returns DC, scans and grades returned items |
| Adyen | Card and wallet payments and refunds |
| SAP S/4HANA | Finance (credit notes) and stock valuation |
| Carrier API | Return labels and drop-off codes |

**Constraints**
- A refund must never be paid twice, even if an event is delivered twice.
- Finance must reconcile Adyen refunds with SAP credit notes every day.

**Your task.** Design the returns and refunds integration.
`,
  answerTemplate: `## Starting a return (portal and store)

## Return received: the event

## Refunds: who pays, when, exactly once

## Finance and stock updates

## Errors, reconciliation and monitoring
`,
  keyPoints: [
    'One returns Experience API serves the portal and the POS, and a returns Process API checks the original order and books the carrier label.',
    'The refund is triggered by a return-received event (DC scan or store acceptance), so the portal request never pays money.',
    'A refunds Process API pays through a payment System API with an idempotency key per return line, so a repeated event cannot pay twice.',
    'Every refund posts a credit note to SAP through a System API; a daily reconciliation compares Adyen and SAP.',
    'Refunds that keep failing are dead-lettered and worked by finance, not retried forever.',
  ],
  solution: `
**Starting a return.** The portal and the POS both call \`exp-returns-api\`.
- \`prc-returns\` reads the original order through \`sys-order-api\` (Commerce Cloud) and checks eligibility: within 30 days, item not final sale, not already returned.
- It creates a return authorisation (RMA) with one line per item.
- For a parcel return, it books a label through \`sys-carrier-api\` and returns a QR code.

**Return received.**
- At the DC, the WMS scans the parcel and calls \`sys-wms-api\`, which publishes \`return-received\` with the RMA number and lines.
- In a store, the POS accepts the item and \`prc-returns\` publishes the same event with \`refundedAtTill: true\`, because the card terminal has already refunded the shopper.

**Refunds.** \`prc-refunds\` subscribes to \`return-received\`.
- For DC returns it calls \`sys-payment-api\`, which calls the Adyen refund API with the idempotency key \`RMA + line\`. A duplicate event gets the same answer back and pays nothing extra.
- For store returns it skips the payment.
- In both cases it posts a credit note through \`sys-sap-finance-api\`.
- Failures are retried 5 times with backoff, then go to the refunds DLQ, which finance works from a dashboard.

**Stock.** The WMS grade (A sellable, B outlet, C scrap) goes to SAP with the credit note, so stock and valuation stay right.

**Reconciliation.** A daily job compares Adyen refund reports with SAP credit notes and raises any mismatch.
`,
  followUps: [
    { q: 'Why not refund when the customer starts the return in the portal?', a: 'Nothing has come back yet, so the retailer would pay for parcels that never arrive. The refund waits for the DC scan or the store acceptance event.' },
    { q: 'How do you stop a refund being paid twice?', a: 'Use an idempotency key per return line on the Adyen refund call and record processed lines. A repeated event then returns the earlier result instead of a new refund.' },
    { q: 'Why publish return-received as an event instead of calling refunds directly?', a: 'Refunds, SAP, stock and customer emails all react to the same fact. An event lets each consumer retry on its own without blocking the WMS scan.' },
    { q: 'What does finance see when a refund fails?', a: 'The failed refund lands in a dead-letter queue with the reason. A dashboard lets finance fix the data and replay it.' },
  ],
}
