import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-023',
  category: 'use-cases',
  title: 'Field-Service Work Orders between SAP and Salesforce',
  level: 'ADVANCED',
  tags: ['field-service', 'sap', 'salesforce', 'bidirectional-sync', 'utilities'],
  estMinutes: 35,
  diagram: {
    task: 'draw both directions between SAP PM and Salesforce Field Service: SAP orders and equipment flowing to work orders, Salesforce work-order events flowing back as SAP postings, the step-tracking store, the technician app and the bulk/reconciliation jobs.',
    checks: [
      { label: 'SAP orders reach Salesforce asynchronously through a queue', rule: { type: 'path', from: 'erp', via: ['queue', 'topic', 'event-stream'], to: 'crm' } },
      { label: 'Work-order events from Salesforce reach SAP asynchronously', rule: { type: 'path', from: 'crm', via: ['queue', 'topic', 'event-stream'], to: 'erp' } },
      { label: 'SAP is reached only through a System API', rule: { type: 'only-via', target: 'erp', from: 'system-api' } },
      { label: 'Technicians work in the Field Service mobile app (dispatch never waits for SAP)', rule: { type: 'edge', from: 'mobile-app', to: 'crm' } },
      { label: 'Salesforce is written only by a System API or its own mobile app', rule: { type: 'only-via', target: 'crm', from: ['system-api', 'mobile-app'] } },
      { label: 'Completion postings are tracked per step for idempotency', rule: { type: 'edge', from: 'process-api', to: { type: ['database', 'cache'], label: ['track', 'step', 'status'] } } },
      { label: 'Batch jobs handle the equipment initial load and reconciliation', rule: { type: 'path', from: 'batch-job', to: 'crm' } },
    ],
    reference: diagram(
      {
        sap: ['erp', 'SAP S/4HANA PM'],
        ssap: ['system-api', 'sys-sap-pm-api (IDoc / BAPI)'],
        ord: ['queue', 'sap-orders-q'],
        pfs: ['process-api', 'prc-field-service-api'],
        ssf: ['system-api', 'sys-salesforce-fs-api'],
        sf: ['crm', 'Salesforce Field Service'],
        tech: ['mobile-app', 'Field Service mobile app (offline)'],
        wq: ['queue', 'work-order-events-q (emergency lane)'],
        pwo: ['process-api', 'prc-work-order-to-sap'],
        track: ['database', 'Completion step tracking'],
        load: ['batch-job', 'Equipment initial load (Bulk API)'],
        recon: ['batch-job', 'Nightly reconciliation'],
      },
      [
        'sap ~> ssap', 'ssap ~> ord', 'ord ~> pfs', 'pfs -> ssf', 'ssf -> sf', 'tech -> sf', 'sf ~> wq', 'wq ~> pwo', 'pwo -> ssap',
        'ssap -> sap', 'pwo -> track', 'pwo -> ssf', 'load -> ssap', 'load -> ssf', 'recon -> ssap', 'recon -> ssf',
      ],
    ),
  },
  description: `
An elevator maintenance company has **1,800 technicians**. Asset and maintenance planning lives in **SAP S/4HANA Plant Maintenance (PM)** (equipment, maintenance plans, maintenance orders, spare parts stock, costs). Technicians use **Salesforce Field Service** (mobile app, scheduling and dispatch).

Flows required:
- SAP generates **preventive maintenance orders** (~3,000/day) from maintenance plans; breakdown calls are logged in Salesforce by the call centre (~600/day) and need an SAP order for cost collection.
- Orders must appear in Field Service as **work orders** with the equipment, location, operations and planned parts, so dispatchers can schedule them.
- Technicians record **time, parts used, readings and completion notes** — sometimes offline in elevator shafts — and the data must flow back to SAP (confirmations, goods issues, measurement documents).
- **Emergency (people trapped)** calls: SAP order must exist and technician dispatched within **5 minutes**.
- Equipment master (~250,000 elevators) changes slowly but must be in sync.

**Design the integration:**
- APIs/flows per object and direction, with the system of record for each.
- How do you handle breakdowns created in Salesforce that need an SAP order quickly?
- How do completions with time and parts get into SAP reliably (offline, duplicates, partial failures)?
- How do you keep the equipment master in sync and handle the initial load?
`,
  answerTemplate: `## Systems of record

## SAP to Salesforce (orders and master data)

## Breakdowns and emergencies

## Completions back to SAP

## Initial load and reconciliation
`,
  keyPoints: [
    'Ownership defined per object: SAP owns equipment, maintenance orders and costs; Salesforce owns scheduling, assignment and field execution data until completion.',
    'SAP changes published as events (e.g. IDocs or business events) or picked up incrementally and mapped to Salesforce work orders/assets via upsert on SAP external IDs.',
    'Emergency path: work order created in Salesforce immediately and dispatched; SAP order creation happens asynchronously in parallel with retries, never blocking the technician.',
    'Completion posts split into idempotent SAP steps (time confirmation, goods issue, measurement documents, technical completion) each tracked with its own status and key.',
    'Offline handled by the Field Service mobile app; integration reacts to synced records and uses work order + line identifiers to avoid duplicate postings.',
    'Equipment initial load via Salesforce Bulk API in batches, then delta sync; periodic reconciliation of counts and statuses.',
  ],
  solution: `
**Systems of record.**
- **SAP PM**: functional locations/equipment, maintenance plans, maintenance orders, costs, spare parts stock.
- **Salesforce Field Service**: service appointments, scheduling, assignment, technician execution (time, parts consumed, notes, checklists) until completion.
- Every Salesforce record carries the SAP key as an **external ID** (\`SAP_Order_No__c\`, \`SAP_Equipment_No__c\`), so all writes are upserts.

**SAP to Salesforce.**
- SAP emits order and equipment changes — e.g. **IDocs** received by the Mule SAP connector (or SAP business events / an OData delta query on the S/4HANA side). A **SAP System API** converts IDoc/BAPI structures to canonical *MaintenanceOrder* and *Equipment* models.
- A **Field Service Process API** maps to WorkOrder, WorkOrderLineItem (operations), ProductRequired (planned parts) and Asset/Location, and upserts via the Salesforce connector (composite/bulk for volume).
- Preventive orders (~3,000/day) flow continuously from a queue; dispatchers see them within minutes.

**Breakdowns and emergencies.**
- The call centre creates the work order in Salesforce. For **emergencies**, Salesforce schedules and dispatches immediately — **dispatch does not wait for SAP**.
- A Platform Event/CDC on WorkOrder triggers Mule to create the **SAP maintenance order** (BAPI \`BAPI_ALM_ORDER_MAINTAIN\` or the S/4HANA maintenance order API) with the work order ID as reference; the SAP order number is written back. Priority queue for emergencies, retries with backoff, alert if not created within 5 minutes — but the technician is already on the way.

**Completions back to SAP.**
- The Field Service mobile app handles **offline** work and syncs when connectivity returns; the integration only sees records once they reach Salesforce.
- On *work order completed* (event), Mule runs a sequence of SAP postings: **time confirmations** per operation, **goods issue** for parts used (movement against the order), **measurement documents** for readings, then **technical completion** (TECO) if required.
- Each step is **idempotent and tracked** (status per work order step in a tracking table or fields on the work order): a goods issue that succeeded is never re-posted when a later step fails. Use work order line IDs as references in SAP documents and check for existing postings before retrying.
- Business errors from SAP (period closed, stock shortage on the van's storage location) → work order flagged *Sync error* with the message for back-office to fix; technical errors → retry.

**Initial load and reconciliation.** 250,000 equipment records and locations: extract from SAP (report/extract or OData paging), transform, and load with the **Salesforce Bulk API** (Bulk API 2.0 via the connector) in parallel batches during a weekend; then switch to delta events. A nightly reconciliation compares counts and key statuses (open orders in SAP vs open work orders in Salesforce) and reports mismatches.
`,
  followUps: [
    { q: 'An equipment record changes in SAP while a technician is working on that elevator. Conflict?', a: 'No, because ownership is per field/object: SAP owns equipment master data and the technician cannot edit it in Salesforce; readings go to SAP as measurement documents instead of overwriting master data.' },
    { q: 'How do you keep IDoc processing reliable?', a: 'Acknowledge to SAP only after the IDoc is persisted (queue/DB), handle status/ALE monitoring on the SAP side, and process from the queue with retries and DLQ.' },
    { q: 'How would you test it?', a: 'SAP QA client + Salesforce full/partial sandbox with representative data, MUnit for the mappings and step tracking, and end-to-end scenarios including offline completion and SAP posting failures.' },
  ],
}
