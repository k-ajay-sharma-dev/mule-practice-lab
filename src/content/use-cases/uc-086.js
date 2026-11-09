import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-086',
  category: 'use-cases',
  title: 'Chargebacks and Disputes from the Payment Provider',
  level: 'ADVANCED',
  tags: ['payments', 'webhooks', 'e-commerce', 'salesforce', 'scatter-gather', 'idempotency', 'human-in-the-loop'],
  estMinutes: 35,
  diagram: {
    task: 'draw the dispute design: provider webhooks into a queue, a Process API that de-duplicates and gathers evidence from the OMS and the carrier, analyst cases in Salesforce with decisions coming back as events, evidence submitted to the provider, and a deadline watchdog.',
    checks: [
      { label: 'Dispute webhooks land on an API you expose', rule: { type: 'edge', from: 'payment', to: ['experience-api', 'api-gateway'] } },
      { label: 'The webhook API queues the event and replies at once', rule: { type: 'edge', from: 'experience-api', to: ['queue', 'cloud-queue'], kind: 'async' } },
      { label: 'Evidence is gathered from the OMS and the carrier', rule: { type: 'path', from: 'process-api', to: ['erp', 'external-api'], min: 2 } },
      { label: 'Evidence goes back to the provider only through a System API', rule: { type: 'only-via', target: 'payment', from: 'system-api' } },
      { label: 'Large disputes become analyst cases in Salesforce', rule: { type: 'path', from: 'process-api', to: 'crm' } },
      { label: 'Analyst decisions come back from Salesforce as async events', rule: { type: 'each', of: 'crm', edgeTo: ['queue', 'topic', 'cloud-queue', 'event-stream'], kind: 'async' } },
      { label: 'A watchdog job warns analysts about close deadlines', rule: { type: 'path', from: 'batch-job', to: 'notification' } },
      { label: 'Event IDs are de-duplicated', rule: { type: 'edge', from: 'process-api', to: { type: ['cache', 'database'], label: ['processed', 'event', 'dedup', 'idempot'] } } },
    ],
    reference: diagram(
      {
        pp: ['payment', 'Payment provider (dispute webhooks, evidence API)'],
        wh: ['experience-api', 'exp-payment-webhooks (signature check)'],
        q: ['queue', 'dispute-events'],
        dlq: ['dlq', 'dispute-events-dlq'],
        prc: ['process-api', 'prc-disputes'],
        seen: ['cache', 'Processed event IDs'],
        soms: ['system-api', 'sys-oms'],
        oms: ['erp', 'OMS'],
        scar: ['system-api', 'sys-carrier-tracking'],
        car: ['external-api', 'Carrier API (proof of delivery)'],
        scrm: ['system-api', 'sys-salesforce-cases'],
        crm: ['crm', 'Salesforce (analyst cases)'],
        files: ['file-store', 'Evidence packs (PDF)'],
        spay: ['system-api', 'sys-payments-disputes'],
        job: ['batch-job', 'Deadline watchdog (hourly)'],
        alert: ['notification', 'Analyst alerts'],
      },
      [
        'pp -> wh', 'wh ~> q', 'q ~> prc', 'q ~> dlq', 'prc -> seen', 'prc -> soms', 'soms -> oms', 'prc -> scar', 'scar -> car',
        'prc -> scrm', 'scrm -> crm', 'crm ~> q', 'prc -> files', 'prc -> spay', 'spay -> pp', 'job -> scrm', 'job -> alert',
      ],
    ),
  },
  description: `
An online electronics retailer takes **400,000 card payments a month** and receives about **1,200 disputes** (chargebacks) a month. Today an analyst gathers evidence by hand. The retailer wins **35 %** of disputes and misses the deadline on **9 %**, which loses them automatically.

The payment provider (Stripe style):
- sends **webhooks**: dispute.created, dispute.updated, dispute.closed; signed, retried for 3 days, sometimes duplicated;
- gives each dispute a **due date** for evidence, usually **7 days** away;
- has an evidence API: text fields plus uploaded files (receipt, proof of delivery, customer emails).

Evidence lives in:
- the **OMS**: order, items, billing and delivery address, IP address and device of the checkout;
- the **carrier API**: proof of delivery with signature and GPS;
- **Salesforce Service Cloud**: customer contact history.

Policy:
- Under **£15**: accept the dispute automatically (fighting costs more).
- **£15 to £500** with confirmed delivery: build the evidence and **submit automatically**.
- Over **£500**, or no delivery proof: create a **case** for an analyst, who approves or edits the evidence in Salesforce.
- Evidence for every dispute must be **ready within 1 hour** of the webhook.

**Questions:**
1. Draw the design.
2. How do you gather the evidence quickly?
3. How does the analyst decision come back and get submitted?
4. How do you make sure no deadline is missed?
`,
  answerTemplate: `## Webhook intake

## Evidence gathering

## Decision rules

## Analyst cases and decisions

## Deadlines and monitoring
`,
  keyPoints: [
    'exp-payment-webhooks verifies the signature, queues the event and replies 200; prc-disputes de-duplicates by event ID.',
    'Evidence is gathered in parallel (scatter-gather) from the OMS, the carrier and Salesforce, and stored as a PDF pack.',
    'Rules by amount and delivery proof decide: accept, submit automatically, or open an analyst case.',
    'Salesforce publishes the analyst decision as an event to the same queue; prc-disputes then submits the evidence through a System API.',
    'An hourly watchdog alerts on disputes due within 48 hours without submitted evidence.',
  ],
  solution: `
**Webhook intake.** The provider calls exp-payment-webhooks. It verifies the signature, publishes to **dispute-events** and replies 200. prc-disputes consumes the queue and checks the **event ID** in a processed store, so a duplicate webhook does nothing. Events for one dispute are handled in order of their created time; an older update than the stored one is ignored.

**Evidence gathering.** For dispute.created, prc-disputes runs a **scatter-gather** with a 20 second timeout per route:
- sys-oms: order, items, addresses, checkout IP and device;
- sys-carrier-tracking: proof of delivery;
- sys-salesforce-cases: contact history for the customer.
A route that fails does not stop the others; the pack is marked incomplete and the dispute goes to an analyst. DataWeave builds the evidence text, and a PDF pack is stored in the file store with the dispute ID as name.

**Decision rules.**
- Under £15: accept through sys-payments-disputes.
- £15 to £500 with proof of delivery: submit the evidence at once.
- Otherwise: create a case in Salesforce with the pack attached and the due date.

**Analyst cases and decisions.** The analyst reviews the case and clicks Submit or Accept. Salesforce publishes a **platform event**, which an event listener app forwards to dispute-events. prc-disputes handles it like any other event: it uploads the files and submits the evidence. Nothing calls back into a waiting flow, so a case can take days.

**Deadlines.** The watchdog runs hourly. It asks Salesforce for open dispute cases due within 48 hours and alerts the analyst team; within 12 hours it alerts the team lead. Auto submitted disputes are submitted on day one, far from the deadline.

**Monitoring.** Alert on any DLQ message: a dispute stuck there can be lost. A weekly report shows win rate by reason code.
`,
  followUps: [
    { q: 'Why gather evidence at dispute.created and not when the analyst opens the case?', a: 'Carrier proof of delivery can expire after 30 to 90 days, and analysts need it ready. Gathering at once also lets small disputes go out without an analyst.' },
    { q: 'How do you handle a dispute.closed event that arrives before dispute.created?', a: 'Store the event against the dispute ID. When created arrives later, the stored closed status wins and no evidence is gathered.' },
    { q: 'Why put the analyst decision on the same queue?', a: 'All changes to a dispute then go through one consumer and one set of rules. Ordering and duplicate checks apply to them too.' },
    { q: 'What is the risk of automatic acceptance under £15?', a: 'Fraudsters may learn the threshold. Track disputes per customer and card, and send repeat cases to an analyst whatever the amount.' },
  ],
}
