import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-024',
  category: 'use-cases',
  title: 'GDPR Right to Erasure across 15 Systems',
  level: 'EXPERT',
  tags: ['gdpr', 'privacy', 'saga', 'governance', 'audit'],
  estMinutes: 45,
  diagram: {
    task: 'draw the erasure orchestration: the privacy portal, the DSR Process API with its state, retention policy, identity cross-reference and audit stores, the queued erasure tasks, DSR System APIs per system and the manual-task route for systems without an API.',
    checks: [
      { label: 'The privacy portal hands requests to a DSR Process API', rule: { type: 'edge', from: { type: ['saas', 'web-app', 'internal-app'], label: ['privacy', 'portal', 'onetrust', 'dsr'] }, to: ['process-api', 'experience-api'] } },
      { label: 'CRM, ERP and warehouse are reached only through DSR System APIs (common contract)', rule: { type: 'only-via', target: ['crm', 'erp', 'data-warehouse'], from: 'system-api' } },
      { label: 'Identity resolution uses an MDM / cross-reference', rule: { type: 'edge', from: ['process-api', 'system-api'], to: { type: ['database', 'cache', 'system-api'], label: ['mdm', 'xref', 'cross', 'identity'] } } },
      { label: 'Retention decisions come from a policy table maintained by legal', rule: { type: 'edge', from: 'process-api', to: { type: ['database', 'cache'], label: ['retention', 'policy', 'rule'] } } },
      { label: 'Saga state is persisted per request and per system', rule: { type: 'edge', from: 'process-api', to: { type: 'database', label: ['state', 'saga', 'request'] } } },
      { label: 'Erasure tasks are queued and throttled per system', rule: { type: 'path', from: 'process-api', via: ['queue', 'topic'], to: ['crm', 'erp', 'data-warehouse'] } },
      { label: 'Systems without a delete API get manual tasks', rule: { type: 'path', from: 'process-api', to: { type: ['saas', 'internal-app'], label: ['ticket', 'task', 'manual'] } } },
      { label: 'Evidence is kept in an audit log without personal data', rule: { type: 'edge', from: 'process-api', to: { type: ['database', 'file-store', 'data-warehouse'], label: ['audit', 'evidence'] } } },
    ],
    reference: diagram(
      {
        portal: ['saas', 'Privacy portal (OneTrust-like)'],
        p: ['process-api', 'prc-dsr-api'],
        state: ['database', 'DSR state per request/system'],
        pol: ['database', 'Retention policy table'],
        audit: ['database', 'Audit log (no personal data)'],
        mdm: ['database', 'MDM / customer cross-reference'],
        q: ['queue', 'erasure-tasks-q'],
        ssf: ['system-api', 'sys-dsr-salesforce'],
        sf: ['crm', 'Salesforce'],
        ssap: ['system-api', 'sys-dsr-sap'],
        sap: ['erp', 'SAP S/4HANA (anonymise)'],
        sdw: ['system-api', 'sys-dsr-warehouse'],
        dw: ['data-warehouse', 'Snowflake / data lake'],
        stask: ['system-api', 'sys-dsr-manual-tasks'],
        tick: ['saas', 'Ticketing (manual tasks)'],
      },
      [
        'portal -> p', 'p -> state', 'p -> pol', 'p -> audit', 'p -> mdm', 'p -> ssf', 'p -> ssap', 'p -> sdw', 'p ~> q', 'q ~> ssf',
        'q ~> ssap', 'q ~> sdw', 'q ~> stask', 'ssf -> sf', 'ssap -> sap', 'sdw -> dw', 'stask -> tick',
      ],
    ),
  },
  description: `
A European online travel and insurance group must handle **data subject requests (DSRs)**, especially the **right to erasure** (GDPR Art. 17). Customer data is spread over ~15 systems:

- **Salesforce** (CRM), **SFMC** (marketing), **Zendesk** (support), **Shopify-like web shop**, **SAP S/4HANA** (invoices), a policy administration system (insurance policies, on-prem Oracle DB), a **data warehouse** (Snowflake), **S3 data lake**, call recordings in a telephony SaaS, and several smaller apps.
- Requests come from a **privacy portal** (OneTrust-like) — ~1,500 erasure requests/month.
- Legal must respond within **one month** (extendable in some cases), and must prove what was erased and where.
- Some data must be **retained**: invoices (10 years for tax law), active insurance policies and claims, records under fraud investigation or litigation hold.
- Some systems support deletion via API, some only **anonymisation**, some (backups, data lake files) neither in real time.
- The integration platform itself (logs, queues, Object Stores) also contains personal data.

**Design the solution:**
- How do you find all of a person's records across systems with different identifiers?
- How do you orchestrate erasure over many systems with different capabilities and partial failures?
- How do you apply retention exceptions correctly?
- How do you deal with the warehouse, data lake, backups and Mule's own data?
- How do you prove completion to auditors without keeping the personal data you just erased?
`,
  answerTemplate: `## Architecture and request intake

## Identity resolution

## Retention rules and decisions

## Erasure orchestration

## Analytics, backups and platform data

## Evidence and audit

## Governance
`,
  keyPoints: [
    'Privacy portal is the system of record for the request; Mule exposes a DSR Process API that orchestrates per-system System APIs implementing a common contract (find, erase/anonymise, status).',
    'Identity resolution via a cross-reference (MDM/customer key map) plus search by verified identifiers (email, customer number); matches below certainty go to human review rather than auto-delete.',
    'Retention decided per record type by a rules engine/policy table (tax, active contract, legal hold) producing per-system actions: delete, anonymise, restrict, retain with reason.',
    'Long-running saga with persisted state per request and per system, idempotent steps, retries, and manual tasks for systems without APIs; SLA tracking against the one-month deadline.',
    'Downstream copies covered: warehouse/data lake deletion or pseudonymised keys with periodic purge jobs, backups expiring by retention with re-deletion on restore, and Mule logs/queues/Object Stores minimised and TTL-bound.',
    'Evidence stored as a non-personal audit record (request ID, hashed identifier, system, action, timestamp, result) so proof remains after erasure.',
  ],
  solution: `
**Architecture and request intake.** The **privacy portal** verifies the requester's identity and owns the request lifecycle. It calls (or publishes an event to) the **DSR Process API**. Behind it, each system has a **DSR System API/adapter** implementing the same contract:
- \`POST /subject-search\` → records found (IDs, record types, created dates)
- \`POST /erasure\` (action per record: delete, anonymise, restrict) → job ID
- \`GET /erasure/{jobId}\` → status, counts
Some adapters wrap APIs (Salesforce, Zendesk, SFMC), some run SQL against databases (policy system via DB connector), some create **manual tasks** (telephony SaaS without delete API) in a ticketing tool. New systems join by implementing the contract — that is the main architectural win.

**Identity resolution.** Start from verified identifiers (email, customer number, phone). Use the **MDM/customer cross-reference** to collect system-specific IDs (Salesforce Contact ID, SAP business partner, policy number, Zendesk user ID). Run \`subject-search\` in parallel across systems. Fuzzy matches (same name, different email) are **never auto-erased** — they go to a privacy analyst for confirmation. Store the resolved identity graph only for the life of the request.

**Retention rules and decisions.** A policy table maintained by legal/DPO (not hard-coded) defines per record type: retention basis and duration (e.g. invoices 10 years), conditions (active policy, open claim, legal hold flag, fraud case). The Process API evaluates every found record and produces a **decision list**: *delete*, *anonymise* (keep the invoice, remove contact details not needed for tax), *restrict* (keep but block marketing/processing), or *retain with reason*. The response to the data subject explains retained categories. Rule versions are recorded with each decision.

**Erasure orchestration.** This is a **long-running saga** (days to weeks):
- State per request and per system in a DSR database: *Searching → Decided → Erasing → Verified → Completed/Exception*.
- Execution order matters: first stop new processing (marketing suppression in SFMC with a hashed suppression entry so the person is not re-imported), then operational systems, then analytics.
- Steps are **idempotent** (erasing an already-erased record succeeds), retried with backoff; failures after retries become **exceptions** with owners. Asynchronous adapters report completion via callback or polling.
- **Verification**: after erasure, re-run \`subject-search\` to confirm nothing remains (except retained records).
- SLA tracking: alert at day 20 if not complete; extension handling per legal process.
- Throttling per system (e.g. Salesforce API limits) via queues.

**Analytics, backups and platform data.**
- **Warehouse/data lake**: prefer designs where analytics use **pseudonymous keys** and a separate identity table. Erasure deletes the mapping/identity rows, and scheduled jobs purge or rewrite affected partitions (immutable files in a lake need rewrite/compaction jobs).
- **Backups**: usually not edited; documented approach accepted by the DPO — backups expire by retention, and a **re-erasure list** (hashed IDs) is applied after any restore.
- **Mule itself**: no personal data in logs (log masking, IDs only) and short TTLs on Object Stores and queue messages. DLQ contents are purged within a defined period, and the identity graph of a request is deleted after completion.

**Evidence and audit.** Keep an **audit record without personal data**: request ID, a salted hash of the identifier (to detect repeat requests), list of systems, actions taken, rule version, timestamps, results and exceptions. The portal holds the closure letter. This proves compliance without re-creating the dataset that was erased.

**Governance.** A system inventory (records of processing) drives which adapters must exist; a new system cannot go live without a DSR adapter. Quarterly tests with synthetic subjects run end to end and report gaps.
`,
  followUps: [
    { q: 'A customer requests erasure but has an open claim. What do you do?', a: 'Retain the claim and policy data with the legal basis recorded. Erase or restrict everything else (marketing, support history not needed for the claim). Inform the customer, and schedule re-evaluation when the claim closes.' },
    { q: 'How do you stop the person reappearing via a nightly CRM import from the web shop?', a: 'Erase in source systems first or in the right order, and keep a hashed suppression list checked by imports and marketing so a re-created record is blocked or flagged.' },
    { q: 'How do you test this safely?', a: 'Create synthetic data subjects across all systems in test environments, run the full saga including retention exceptions and failures, and verify with the search step that only allowed records remain.' },
    { q: 'Would you build or buy the orchestration?', a: 'Privacy platforms often include DSR workflow and some connectors; Mule adds value for systems those connectors miss and for a consistent API contract. Evaluate the platform first and integrate rather than duplicate.' },
  ],
}
