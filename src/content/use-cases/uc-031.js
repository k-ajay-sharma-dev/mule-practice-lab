import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-031',
  category: 'use-cases',
  title: 'Purchase Requisitions from Procurement Tool to SAP',
  level: 'INTERMEDIATE',
  tags: ['sap', 'procurement', 'approval-workflow', 'status-sync', 'idempotency'],
  estMinutes: 25,
  diagram: {
    task: 'draw the integration between the procurement tool and SAP: the approved-PR webhook path, the Process API with the PO/requisition rules, the System APIs, and the scheduled master-data and PO-status syncs.',
    checks: [
      { label: 'The approved-PR webhook lands on a thin listener API that publishes to a queue asynchronously', rule: { type: 'edge', from: 'experience-api', to: ['queue', 'topic', 'event-stream'], kind: 'async' } },
      { label: 'A Process API consumes the queued PRs and owns the routing rules', rule: { type: 'edge', from: ['queue', 'topic', 'event-stream'], to: 'process-api', kind: 'async' } },
      { label: 'The Process API orchestrates both the SAP and the procurement System APIs', rule: { type: 'edge', from: 'process-api', to: 'system-api', min: 2 } },
      { label: 'SAP is reached only through a System API', rule: { type: 'only-via', target: 'erp', from: 'system-api' } },
      { label: 'The webhook listener never calls System APIs directly', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
      { label: 'A scheduled job syncs master data and PO status from SAP back to the procurement tool', rule: { type: 'path', from: 'batch-job', to: 'saas' } },
      { label: 'Messages that keep failing go to a dead-letter queue', rule: { type: 'edge', from: ['queue', 'process-api'], to: 'dlq' } },
    ],
    reference: diagram(
      {
        proc: ['saas', 'Procurement tool (webhook + REST)'],
        hook: ['experience-api', 'exp-procurement-webhook'],
        q: ['queue', 'approved-prs'],
        dlq: ['dlq', 'approved-prs-dlq'],
        prc: ['process-api', 'prc-procurement-api'],
        job: ['batch-job', 'Master data + PO status sync'],
        ssap: ['system-api', 'sys-sap-purchasing-api'],
        sproc: ['system-api', 'sys-procurement-tool-api'],
        sap: ['erp', 'SAP S/4HANA (on-prem)'],
      },
      ['proc -> hook', 'hook ~> q', 'q ~> prc', 'q ~> dlq', 'prc -> ssap', 'prc -> sproc', 'ssap -> sap', 'sproc -> proc', 'job -> ssap', 'job -> sproc'],
    ),
  },
  description: `
A manufacturer uses a cloud **procurement/spend tool** where employees raise purchase requisitions (PRs) and managers approve them. Purchase orders (POs), goods receipts and invoices live in **SAP S/4HANA**.

Facts:
- ~1,800 approved PRs/week, 1–40 lines each. The procurement tool sends an **"approved" webhook** and has a REST API.
- In SAP, an approved PR must become a **purchase order** (for catalog items with a contracted supplier) or a **SAP purchase requisition** for the buying team (for free-text items).
- Master data (suppliers, material groups, cost centres, GL accounts) is owned by SAP and must be **valid in the procurement tool** before employees can select it.
- Users want to see the **PO number and status** (ordered, partially received, invoiced) back in the procurement tool within **15 minutes**.
- SAP is reachable only from the on-premises network; the procurement tool is SaaS.

| Flow | Direction | Volume |
|---|---|---|
| Master data | SAP → procurement tool | Daily delta, ~2,000 records |
| Approved PRs | Procurement tool → SAP | ~1,800/week |
| PO status | SAP → procurement tool | ~5,000 events/week |

**Describe your solution:**
- What APIs and layers would you build?
- How do you decide PO vs requisition and map lines/accounting?
- How do you guarantee one PR creates exactly one PO, even with webhook retries?
- How do you send status back?
`,
  answerTemplate: `## Architecture and connectivity

## Master data sync

## PR to PO/requisition

## Idempotency

## Status back-flow

## Errors
`,
  keyPoints: [
    'API-led layers: SAP System API (on-prem runtime or secure connectivity), procurement System API, a Procurement Process API owning the rules.',
    'Master data synced from SAP to the procurement tool so PRs only reference valid suppliers, cost centres and accounts.',
    'Routing rule: catalog item with contracted supplier → PO (BAPI/OData), free-text → SAP requisition for buyers.',
    'Idempotency: PR ID stored in SAP (e.g. tracking/reference field) and checked before create; webhook acknowledged quickly and processed from a queue.',
    'Status back-flow from SAP events (IDoc/output messages or polling changed POs) mapped to the procurement tool within 15 minutes.',
    'Business errors (blocked supplier, closed cost centre) returned to the requisitioner/buyer instead of being retried blindly.',
  ],
  solution: `
**Architecture and connectivity.**
- **SAP System API** deployed on a runtime that can reach SAP (Mule runtime on-prem/hybrid, or CloudHub with a VPN/private connection). Uses the SAP connector (BAPIs/IDocs) or S/4HANA OData APIs.
- **Procurement System API** wrapping the SaaS REST API.
- **Procurement Process API** with the routing and mapping rules. Webhooks land on a thin Experience/listener API that validates the signature, returns 200 and publishes to **Anypoint MQ**.

**Master data sync.** A nightly Scheduler reads changed suppliers, cost centres, material groups and GL accounts from SAP (change pointers/IDocs or "changed since" queries) and upserts them in the procurement tool. Blocked suppliers and closed cost centres are deactivated there, preventing most posting errors upstream.

**PR to PO/requisition.** For each approved PR line:
- catalog item + contracted supplier + price → **PO** (create PO BAPI or OData Purchase Order API);
- free-text or unknown supplier → **SAP purchase requisition** for the buying team.

A PR can split into several POs (one per supplier). DataWeave groups lines by supplier and maps accounting (cost centre, GL account, WBS element), delivery address, and units of measure (lookup table where codes differ).

**Idempotency.** Webhooks may be delivered twice. The queue consumer checks SAP for an existing PO/requisition carrying the **PR ID + supplier** as reference (e.g. a header text or a custom field) before creating. An Object Store entry with the PR ID marks "in progress" to avoid two consumers racing.

**Status back-flow.** SAP emits PO change/output messages (IDoc ORDERS/ORDCHG output, or a scheduled query for POs changed in the last 10 minutes). The Process API maps SAP statuses to the tool's statuses and updates the PR with **PO number, ordered, received, invoiced** quantities. Run every 5–10 minutes to meet the 15-minute target.

**Errors.** Business errors (blocked supplier, price missing) → update the PR in the procurement tool with an "integration error" status and message, plus notify the buyer; no automatic retry. Technical errors → retry with backoff, then DLQ and alert. A daily reconciliation compares approved PRs with SAP documents to catch anything missing.
`,
  followUps: [
    { q: 'Why not let the procurement tool call SAP directly?', a: 'SAP is on-prem and its BAPIs are not designed for SaaS callers; the System API hides SAP specifics, adds security and lets other consumers reuse PO creation.' },
    { q: 'A PR is approved, then cancelled after the PO was sent to the supplier. What happens?', a: 'Cancellation becomes a PO change (delete/block lines) only if not yet confirmed or received; otherwise it goes to the buyer for manual handling with the supplier.' },
    { q: 'How do you size it?', a: '1,800 PRs/week is low volume; a small worker with modest concurrency is enough. The constraint is SAP throughput and locking, so keep concurrency to SAP limited.' },
  ],
}
