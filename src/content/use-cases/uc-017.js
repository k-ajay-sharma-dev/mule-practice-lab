import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-017',
  category: 'use-cases',
  title: 'Online Returns and Refunds',
  level: 'INTERMEDIATE',
  tags: ['returns', 'refunds', 'orchestration', 'idempotency', 'retail'],
  estMinutes: 25,
  diagram: {
    task: 'draw the returns process: Shopify starting a return, the Returns Process API with its RMA store, the 3PL inspection-file job, refunds through Shopify, credit notes to D365 via a queue, and the daily reconciliation.',
    checks: [
      { label: 'Returns from Shopify reach a Returns Process API', rule: { type: 'path', from: { type: ['saas', 'web-app'], label: ['shopify', 'shop'] }, to: 'process-api' } },
      { label: 'The RMA state is persisted in one place', rule: { type: 'edge', from: 'process-api', to: { type: ['database', 'cache'], label: ['rma', 'return', 'state'] } } },
      { label: 'A job picks up inspection CSVs from the 3PL SFTP', rule: { type: 'edge', from: ['batch-job', 'process-api', 'system-api'], to: 'file-store' } },
      { label: 'Inspection results feed the Returns Process API', rule: { type: 'path', from: 'batch-job', to: 'process-api' } },
      { label: 'D365 is reached only through a System API', rule: { type: 'only-via', target: 'erp', from: 'system-api' } },
      { label: 'Credit notes go to D365 through a queue (retried if D365 is down)', rule: { type: 'path', from: 'process-api', via: 'queue', to: 'erp' } },
      { label: 'Refunds and gift cards are issued only through a System API', rule: { type: 'only-via', target: { type: ['saas', 'payment'], label: ['shopify', 'payment', 'psp'] }, from: 'system-api' } },
      { label: 'A daily job reconciles refunds against credit notes', rule: { type: 'edge', from: 'batch-job', to: 'system-api', min: 2 } },
    ],
    reference: diagram(
      {
        shop: ['saas', 'Shopify Plus'],
        e: ['experience-api', 'exp-returns-api'],
        p: ['process-api', 'prc-returns-api'],
        rma: ['database', 'RMA state store'],
        sd365: ['system-api', 'sys-d365-api'],
        d365: ['erp', 'Dynamics 365 F&O'],
        scar: ['system-api', 'sys-carrier-label-api'],
        car: ['external-api', 'Carrier label API'],
        job: ['batch-job', 'Inspection file processor (every 2 h)'],
        sftp: ['file-store', '3PL SFTP (inspection CSV)'],
        sshop: ['system-api', 'sys-shopify-api (refunds, gift cards)'],
        cnq: ['queue', 'credit-note-q'],
        cn: ['process-api', 'prc-credit-note'],
        recon: ['batch-job', 'Daily refund ↔ credit note reconciliation'],
      },
      [
        'shop -> e', 'e -> p', 'p -> rma', 'p -> sd365', 'p -> scar', 'scar -> car', 'sd365 -> d365', 'job -> sftp', 'job -> p',
        'p -> sshop', 'sshop -> shop', 'p ~> cnq', 'cnq ~> cn', 'cn -> sd365', 'recon -> sshop', 'recon -> sd365',
      ],
    ),
  },
  description: `
A sportswear brand sells online and is introducing a new returns process.

Systems:
- **Shopify Plus**: the online shop.
- **Microsoft Dynamics 365 Finance & Operations (D365)**: orders and invoices.
- **3PL warehouse**: has its own WMS, reachable via SFTP files and a REST API.
- **Payment provider** (cards, PayPal): refunds go back through it, or are paid as store credit (gift card in Shopify).

The new returns process:
1. Customer starts a return in the web shop (within 30 days), chooses items and reason, and gets a **return label**.
2. The 3PL receives the parcel and **inspects** each item (OK / damaged / wrong item).
3. Only inspected-OK items are **refunded**, to the original payment method or as store credit (customer's choice, +10% bonus for store credit).
4. D365 must get a **credit note** and the stock must be updated.

Facts:
- ~2,000 returns/day, 4,000 after Christmas.
- The 3PL sends inspection results as a **CSV file every 2 hours**.
- Customers complain today about refunds taking 3 weeks and about being refunded twice by mistake.

**Describe your solution:**
- Which steps and events, and which system owns the return state?
- How do you process the inspection files?
- How do you guarantee a refund is issued once and only for accepted items?
- How do you keep Shopify, D365 and the payment provider consistent if one step fails?
`,
  answerTemplate: `## Process and ownership

## Return creation

## Inspection files

## Refund and credit note

## Consistency and failure handling
`,
  keyPoints: [
    'A return record (RMA) with a state machine (Requested → LabelIssued → Received → Inspected → Refunded/Rejected) owned by one system — D365 or a Returns Process API store.',
    'Inspection CSV picked up from SFTP, validated, split per return line, and processed idempotently (file name + line or RMA + line as key; files archived after processing).',
    'Refund amount calculated from inspected-OK lines only, using original paid prices (discounts, shipping rules) and never above the remaining refundable amount.',
    'Refund call uses an idempotency key per RMA/refund attempt and checks the remaining refundable amount on the order before issuing.',
    'Steps are retried independently and tracked: refund to customer first, then credit note in D365; failures alert and are resumable, with a daily reconciliation between refunds and credit notes.',
  ],
  solution: `
**Process and ownership.** Create a **Returns Process API** that orchestrates the steps and keeps the **RMA state**. Alternatively, it uses D365 return orders as the system of record if the business already works there. States: *Requested → LabelIssued → InTransit → Received → Inspected → Refunded / PartiallyRefunded / Rejected*. Each step publishes an event (Anypoint MQ) so Shopify status, customer emails and reporting can follow.

**Return creation.** The Shopify return request (app/webhook or a custom returns page) calls \`POST /returns\`: validate the order is within 30 days and the items were delivered and not already returned. Then create the RMA in D365 (return order), request a return label from the carrier API, and email it to the customer. Store the mapping Shopify order ↔ D365 sales order ↔ RMA.

**Inspection files.** An SFTP listener (or scheduled poll) picks up the 3PL CSV every 2 hours:
- Move the file to a *processing* folder, parse it with DataWeave, validate (known RMA, known SKU, quantity ≤ returned quantity).
- Process each line; key = \`RMA + line number\` so reprocessing the same file (or a resent one) changes nothing.
- Invalid lines go to an exception report for the 3PL/customer-service team; the file is archived with a result summary.
- When all lines of an RMA are inspected, the RMA moves to *Inspected* and triggers the refund step.

**Refund and credit note.**
- Calculate the amount in DataWeave from **accepted lines only**, using the price actually paid (after order-level discounts, per agreed rules for shipping and the store-credit bonus).
- **Original payment method:** call Shopify's refund API (which refunds via the gateway) or the payment provider directly, with an **idempotency key** = RMA ID + attempt purpose. Before calling, read the order's already-refunded amount and never exceed what remains.
- **Store credit:** issue a Shopify gift card for amount × 1.10.
- Then create the **credit note** in D365 referencing the original invoice, and post stock movements (OK items back to sellable stock, damaged to a quarantine location).

**Consistency and failure handling.** This is a small **saga**: each step is idempotent and its result stored in the RMA record, so a failed step can be retried without repeating completed ones. The refund to the customer is the critical step for satisfaction; if D365 is down, the credit note is retried later from a queue. Nothing is "compensated" by refunding twice — the RMA state guards it. A **daily reconciliation** compares refunds in the payment provider/Shopify with credit notes in D365 and lists differences to finance. Dashboards show RMAs stuck in a state beyond SLA (e.g. *Received* but not refunded after 48 hours) — directly addressing the 3-week complaint.
`,
  followUps: [
    { q: 'The 3PL sends the same CSV twice with one corrected line. What happens?', a: 'Unchanged lines are skipped by the line key; a changed result for an already refunded line is not auto-applied but sent to customer service as an exception.' },
    { q: 'Could the 3PL send events instead of a file every 2 hours?', a: 'Yes, if their API supports it, an event per inspected parcel shortens refund time; the same idempotent processing applies, the file becomes a fallback.' },
    { q: 'How do you avoid a refund when the payment provider times out but the refund actually succeeded?', a: 'Retry with the same idempotency key (the provider returns the original result), or query refunds on the order before retrying; never generate a new key for a retry.' },
  ],
}
