import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-066',
  category: 'use-cases',
  title: 'Product Recall: Lot Traceability to DCs, Trucks, Stores and Customers',
  level: 'EXPERT',
  tags: ['supply-chain', 'retail', 'recall', 'traceability', 'wms', 'tms', 'pos', 'activemq', 'oracle', 'notifications', 'audit'],
  estMinutes: 45,
  diagram: {
    task: 'draw the recall platform: the QA console and its Experience API, the recall orchestrator with its Oracle case and acknowledgement tracker, one recall event fanned out over a topic to the WMS, TMS and store POS System APIs, store acknowledgements coming back on a queue, affected customers found in sales history, and throttled customer notifications through a queue.',
    checks: [
      { label: 'The QA team raises a recall through an Experience API', rule: { type: 'each', of: 'internal-app', edgeTo: 'experience-api' } },
      { label: 'One recall event fans out over a topic to the WMS, TMS and POS System APIs', rule: { type: 'edge', from: ['topic', 'event-stream'], to: 'system-api', kind: 'async', min: 3 } },
      { label: 'WMS, TMS and store POS are reached only through System APIs', rule: { type: 'only-via', target: ['wms', 'tms', 'pos'], from: 'system-api' } },
      { label: 'Store acknowledgements flow back to the orchestrator', rule: { type: 'path', from: 'pos', to: 'process-api' } },
      { label: 'Recall cases and every acknowledgement are tracked in a database', rule: { type: 'edge', from: 'process-api', to: 'database' } },
      { label: 'Affected customers are found from sales and loyalty history', rule: { type: 'path', from: 'process-api', to: 'data-warehouse' } },
      { label: 'Customer notifications are decoupled and throttled through a queue', rule: { type: 'path', from: 'process-api', via: 'queue', to: 'notification' } },
      { label: 'The email/SMS provider is reached only through a System API', rule: { type: 'only-via', target: 'notification', from: 'system-api' } },
    ],
    reference: diagram(
      {
        qa: ['internal-app', 'Recall console (QA)'],
        expr: ['experience-api', 'exp-recall-console'],
        prc: ['process-api', 'prc-recall-orchestrator'],
        prcc: ['process-api', 'prc-recall-customer-notify'],
        t: ['topic', 'RECALL.EVENTS (virtual topic)'],
        qack: ['queue', 'RECALL.STORE.ACK'],
        qcust: ['queue', 'RECALL.CUSTOMER.NOTIFY'],
        dlq: ['dlq', 'DLQ.RECALL'],
        swms: ['system-api', 'sys-wms'],
        stms: ['system-api', 'sys-tms'],
        spos: ['system-api', 'sys-store-pos'],
        stx: ['system-api', 'sys-sales-history'],
        snot: ['system-api', 'sys-notifications'],
        state: ['database', 'Recall case & ack tracker (Oracle)'],
        wms: ['wms', 'WMS (4 DCs)'],
        tms: ['tms', 'TMS'],
        pos: ['pos', 'Store POS (900 stores)'],
        dw: ['data-warehouse', 'Sales & loyalty history'],
        notif: ['notification', 'Email / SMS provider'],
      },
      [
        'qa -> expr', 'expr -> prc', 'prc -> state', 'prc ~> t', 't ~> swms', 't ~> stms', 't ~> spos', 'swms -> wms', 'stms -> tms', 'spos -> pos',
        'pos ~> qack', 'qack ~> prc', 'prc -> stx', 'stx -> dw', 'prc ~> qcust', 'qcust ~> prcc', 'qcust ~> dlq', 'prcc -> snot', 'snot -> notif',
      ],
    ),
  },
  description: `
A national grocery retailer (**900 stores, 4 DCs, 6 million loyalty members**) must be able to execute a **food-safety recall** in hours, not days. Today recalls are run by phone and email and a recent audit found recalled product still on shelves 3 days later.

A recall is defined by **item(s) + lot/batch numbers + date range** (or "all lots"). The integration must:

| Step | Target system | SLA from recall approval |
|---|---|---|
| Block sale at the till | Store **POS** (item block flag) | **1 hour** |
| Quarantine stock in the DCs, stop picking | **WMS** (lot-level hold) | 1 hour |
| Stop or redirect in-transit loads | **TMS** | 2 hours |
| Store teams remove product and **acknowledge** with counts | Store POS back-office / handheld | 4 hours, escalation for non-responders |
| Notify customers who bought affected lots | Email / SMS, using loyalty purchase history | 24 hours |
| Report to the regulator: quantities shipped, recovered, sold | Recall report | daily until closed |

Facts:
- Lots are captured at goods receipt in the WMS; stores only know item level, so **customer matching** uses item + store + date window from the sales history (Oracle data warehouse fed nightly by POS).
- ActiveMQ Artemis is the enterprise broker; stores connect over unreliable links; up to 5 % of stores are offline at any time.
- A recall can be **extended** (more lots) or **withdrawn** while in progress.
- Every action must be **auditable** (who, what, when) for the regulator.
- Customer contact must respect marketing consent rules — recall notices are a legal/safety exception, but only for customers whose contact details may be used for safety notices.

**Questions:**
1. Describe the end-to-end architecture and the recall event model.
2. How do you guarantee every store and DC receives and acknowledges the recall, including offline stores?
3. How do you notify up to 500,000 customers without overwhelming the provider or contacting the wrong people?
4. How do you handle recall extensions and withdrawals?
5. How do you produce the regulator report and the audit trail?
`,
  answerTemplate: `## Architecture and event model

## Distribution to DCs, transport and stores

## Acknowledgements and escalation

## Customer identification and notification

## Extensions and withdrawals

## Audit and regulator reporting

## NFRs and failure modes
`,
  keyPoints: [
    'A recall is a case with versions (created, extended, withdrawn, closed) in an Oracle tracker; each version emits one RecallEvent on an ActiveMQ topic consumed by WMS, TMS and POS System APIs.',
    'Each target acknowledges per recall version (system ack + store human ack with counts); the tracker shows who has not acknowledged and escalation jobs chase them.',
    'Offline stores get the event from their durable queue when they reconnect; persistent messages, no expiry for recall events.',
    'Customer matching from sales history (item + store + date window, refined by lot where possible), consent check, de-duplication, then a throttled notification queue with DLQ and replay.',
    'Idempotency by recall ID + version everywhere; withdrawals and extensions are new versions, never edits in place.',
    'Immutable audit trail and a daily regulator report derived from the tracker (shipped, quarantined, removed, sold, notified).',
  ],
  solution: `
\`\`\`
 QA console -> exp-recall-console -> prc-recall-orchestrator -> Recall tracker (Oracle)
                                          ~> [RECALL.EVENTS topic] ~> sys-wms   -> WMS (lot hold)
                                                                   ~> sys-tms   -> TMS (load hold)
                                                                   ~> sys-store-pos -> POS (item block)
 POS ~> [RECALL.STORE.ACK] ~> prc-recall-orchestrator
 prc -> sys-sales-history -> DW (affected customers)
 prc ~> [RECALL.CUSTOMER.NOTIFY] ~> prc-recall-customer-notify -> sys-notifications -> email/SMS
\`\`\`

**Event model.** \`RecallEvent { recallId, version, action: CREATE|EXTEND|WITHDRAW|CLOSE, items[], lots[], dateRange, severity, instructions, approvedBy, approvedAt }\`. The orchestrator writes the version to the tracker **in the same local transaction** as an outbox row; an outbox publisher sends it to the topic, so an event is never lost and never sent for a version that was not saved.

**Distribution.**
- Topic → one queue per consumer (virtual topic pattern), so each target has its own backlog, redelivery and DLQ.
- **sys-wms** places a lot-level hold in each DC WMS and returns quarantined quantities. **sys-tms** finds loads containing the lots (via WMS shipment data) and flags them for return or redirection.
- **sys-store-pos** pushes the item block to the central POS item master, which syncs to tills; stores also get a task for the shelf team. Persistent messages, no TTL: an offline store gets the block when it reconnects; a store not acknowledging within 1 hour triggers a phone escalation to the area manager.

**Acknowledgements.** Two levels: *system ack* (block applied on store server) and *human ack* (team removed N units, photo optional). Both arrive on \`RECALL.STORE.ACK\` and update the tracker by (recallId, version, storeId) with a MERGE so duplicates are harmless. An escalation job runs every 15 minutes against the tracker.

**Customer notification.**
1. sys-sales-history queries the warehouse for loyalty purchases of the items in the affected stores and date window (lot-level where stores scan lots via GS1 DataMatrix, otherwise item level = over-notify, which is accepted for safety).
2. De-duplicate per customer, apply the "safety notice" contact permission, choose channel.
3. Publish one message per customer to \`RECALL.CUSTOMER.NOTIFY\`; prc-recall-customer-notify consumes with limited concurrency matching the provider's rate limit (e.g. 200/s), retries 429/5xx with back-off, and records each send in the tracker. Poison messages → DLQ, replayable. 500,000 notices at 200/s ≈ 42 minutes, well inside 24 h.

**Extensions and withdrawals.** Always a new version. EXTEND adds lots — consumers apply the delta. WITHDRAW releases holds and blocks; customer notices already sent are followed by an "all clear" only if QA requests it. Consumers ignore versions lower than the one they have applied.

**Audit and reporting.** The tracker is append-only (version rows, ack rows, notification rows with timestamps and user IDs). The daily regulator report is generated from it: quantities received per lot (WMS), shipped to stores, quarantined, removed by stores, sold before block (from sales history), customers notified.

**NFRs and failure modes.**
- Recall path isolated from day-to-day traffic: dedicated queues and Mule workers so a busy Black Friday cannot delay a recall.
- Broker HA (Artemis primary/backup pair, called live/backup in older versions); Oracle tracker on a highly available database.
- Tested quarterly with a **mock recall** (a fake item) end to end — regulators often require this.
- Security: only QA managers can approve (OAuth scope on the Experience API, four-eyes approval in the console).
`,
  followUps: [
    { q: 'Why an outbox instead of publishing to ActiveMQ inside the flow?', a: 'Without XA, saving to Oracle and publishing to the broker are two separate commits; a crash between them loses or duplicates the event. The outbox makes the database the single source and the publisher retries until sent.' },
    { q: 'Could you use XA transactions instead?', a: 'Mule 4 supports XA with the Bitronix transaction manager across JMS and Database, but it adds latency and operational complexity; for a low-volume, high-importance event the outbox is simpler and easier to reason about.' },
    { q: 'How do you prove to the regulator that the block reached every till?', a: 'The tracker holds a system acknowledgement per store with timestamp; stores missing it are listed with the escalation actions taken until they confirmed.' },
    { q: 'What if the recall must also reach online orders not yet shipped?', a: 'Add the OMS as another subscriber: it cancels or holds open lines containing the items and triggers its own customer messages — no change to the publisher.' },
  ],
}
