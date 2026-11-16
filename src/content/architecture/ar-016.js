import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-016',
  category: 'architecture',
  title: 'System of Record and Data Ownership',
  level: 'INTERMEDIATE',
  tags: ['system-of-record', 'data-ownership', 'master-data', 'sync'],
  estMinutes: 25,
  diagram: {
    task: 'draw the hub that replaces the six pairwise syncs: how each owner system publishes its changes, who applies them to the other systems, and where the global customer ID cross-reference lives.',
    checks: [
      { label: 'No direct system-to-system syncs remain', rule: { type: 'no-edge', from: ['crm', 'erp', 'saas'], to: ['crm', 'erp', 'saas'] } },
      { label: 'Salesforce, SAP and the web shop are each reached only through a System API', rule: { type: 'only-via', target: ['crm', 'erp', 'saas'], from: 'system-api' } },
      { label: 'Every system publishes its owned changes as events', rule: { type: 'each', of: 'system-api', min: 3, edgeTo: ['topic', 'event-stream', 'queue'], kind: 'async' } },
      { label: 'A Customer Process API (the hub) consumes the change events', rule: { type: 'edge', from: ['topic', 'event-stream', 'queue'], to: 'process-api' } },
      { label: 'Salesforce, SAP and the web shop each receive changes from their System API', rule: { type: 'each', of: ['crm', 'erp', 'saas'], min: 3, edgeFrom: 'system-api' } },
      { label: 'The hub applies owned attributes to all three systems via their System APIs', rule: { type: 'edge', from: 'process-api', to: 'system-api', min: 3 } },
      { label: 'Changes reach the hub through events, never by a System API calling it', rule: { type: 'no-edge', from: 'system-api', to: 'process-api' } },
      { label: 'System APIs never sync with each other directly', rule: { type: 'no-edge', from: 'system-api', to: 'system-api' } },
      { label: 'A cross-reference store maps the global customer ID to each local ID', rule: { type: 'edge', from: 'process-api', to: ['database', 'cache'] } },
      { label: 'The hub calls System APIs with sync calls. Async work goes through a broker', rule: { type: 'lines', from: 'process-api', to: 'system-api', kind: 'sync' } },
      { label: 'Every line to or from a queue or topic is an async message', rule: { type: 'lines', touching: ['queue', 'topic', 'event-stream', 'cloud-queue', 'dlq'], kind: 'async' } },
      { label: 'Reads and writes to a data store are sync calls', rule: { type: 'lines', to: ['database', 'oracle-db', 'sql-server', 'cache'], kind: 'sync' } },
    ],
    reference: diagram(
      {
        sf: ['crm', 'Salesforce (sales data owner)'],
        sap: ['erp', 'SAP ERP (credit, billing owner)'],
        ecom: ['saas', 'E-commerce (delivery address, email owner)'],
        ssf: ['system-api', 'sys-salesforce-customer-api', { vCores: '0.5' }],
        ssap: ['system-api', 'sys-sap-customer-api', { vCores: '0.5', rateLimit: 80 }],
        secom: ['system-api', 'sys-ecommerce-customer-api', { vCores: '0.5' }],
        ev: ['topic', 'customer-change-events'],
        hub: ['process-api', 'prc-customer-sync', { vCores: '0.2' }],
        xref: ['database', 'Customer cross-reference (global ID)'],
      },
      [
        'sf ~> ssf', 'sap ~> ssap', 'ecom ~> secom',
        'ssf ~> ev', 'ssap ~> ev', 'secom ~> ev',
        'ev ~> hub', 'hub -> xref',
        'hub -> ssf', 'hub -> ssap', 'hub -> secom',
        'ssf -> sf', 'ssap -> sap', 'secom -> ecom',
      ],
    ),
    simulation: {
      systems: [
        { match: 'erp', latencyMs: 300, maxRps: 100 },
        { match: 'crm', latencyMs: 200 },
        { match: 'saas', latencyMs: 150 },
        { match: ['database', 'cache'], latencyMs: 10 },
      ],
      tests: [
        {
          name: 'SAP is down for an hour',
          about: 'Salesforce and the web shop each send 5 customer changes a second, and SAP is down from minute 10 to minute 70. The changes wait for the hub, SAP gets every one of them once it is back, and none is lost.',
          durationMin: 120,
          traffic: [
            { name: 'Salesforce changes', from: { type: 'system-api', label: 'salesforce' }, rps: 5, kind: 'write', to: ['crm', 'erp', 'saas'] },
            { name: 'web shop changes', from: { type: 'system-api', label: 'ecommerce' }, rps: 5, kind: 'write', to: ['crm', 'erp', 'saas'] },
          ],
          incidents: [{ down: 'erp', at: 10, forMin: 60 }],
          expect: {
            answers: [{ minSuccess: 0.99 }],
            delivered: [
              { to: 'erp', min: 0.99 },
              { to: 'crm', min: 0.99 },
              { to: 'saas', min: 0.99 },
            ],
            backlog: [{ queue: ['topic', 'event-stream', 'queue'], maxEnd: 0 }],
            lost: { max: 0 },
          },
        },
        {
          name: 'A bulk load in Salesforce',
          about: 'Sales ops load 150 changed contacts a second into Salesforce for ten minutes, while SAP and the web shop send 5 a second each. SAP must never get more than its 100 calls a second, and the backlog is gone within the hour.',
          durationMin: 90,
          traffic: [
            { name: 'Salesforce changes', from: { type: 'system-api', label: 'salesforce' }, rps: 5, kind: 'write', to: ['crm', 'erp', 'saas'], spikes: [{ at: 5, forMin: 10, rps: 150 }] },
            { name: 'SAP changes', from: { type: 'system-api', label: 'sap' }, rps: 5, kind: 'write', to: ['crm', 'erp', 'saas'] },
            { name: 'web shop changes', from: { type: 'system-api', label: 'ecommerce' }, rps: 5, kind: 'write', to: ['crm', 'erp', 'saas'] },
          ],
          expect: {
            answers: [{ minSuccess: 0.99 }],
            peakRps: [{ node: 'erp', max: 100 }],
            delivered: [{ to: 'erp', min: 0.99 }],
            backlog: [{ queue: ['topic', 'event-stream', 'queue'], maxEnd: 0 }],
          },
        },
      ],
    },
  },
  description: `
A B2B distributor stores **customer** data in three systems:

- **Salesforce** — sales reps create prospects and edit contacts, phone numbers, sales territory.
- **SAP ERP** — customers become "real" when an account with credit limit and payment terms is created by finance; SAP is used for invoicing.
- **E-commerce platform** — customers self-register, update delivery addresses and email.

Today there are **bi-directional syncs** between every pair of systems (6 Mule flows). Incidents:
- An address changed in the web shop was overwritten an hour later by an older value from SAP.
- The same customer exists 3 times in Salesforce.
- Nobody can answer "which phone number is correct?".

Numbers for sizing: each system produces about 5 customer changes a second. SAP answers in about 300 ms and takes at most 100 calls a second. Sales ops sometimes bulk load contacts into Salesforce at 150 changes a second for ten minutes, and that backlog should be gone within the hour. SAP has maintenance windows of up to an hour.

**Questions:**
- How do you decide the system of record — per entity or per attribute? Produce an ownership table.
- How should data flow between systems once ownership is defined?
- How do you handle the customer's identity across systems (IDs, duplicates)?
- Who in the organisation must agree on this, and what is MuleSoft's role vs a dedicated MDM tool?
`,
  answerTemplate: `## Ownership model

## Data flows

## Identity and duplicates

## Governance and the role of MDM
`,
  keyPoints: [
    'Ownership is defined per attribute group, not only per entity: e.g. credit limit/payment terms → SAP, sales data → Salesforce, self-service delivery addresses/email → e-commerce.',
    'Only the system of record (owner) may change an attribute; other systems get read-only copies, which removes bi-directional overwrite conflicts.',
    'Changes flow one way from owner to consumers, preferably as events via a Customer System/Process API, replacing the pairwise point-to-point syncs.',
    'A cross-reference (global customer ID mapped to each system\'s local ID) is maintained, and duplicates are prevented by matching before create.',
    'Data owners in the business sign off the ownership table; complex matching/merging and golden-record management is a job for an MDM tool, with MuleSoft integrating around it.',
    'Settings that matter: changes wait on the topic while SAP is down (no delivery limit that drops them, and the hub fails instead of skipping SAP); a rate limit of 80 a second on the SAP System API keeps bulk loads under SAP\'s 100; System APIs that take bursts get 0.5 vCore.',
  ],
  solution: `
**Ownership model (attribute level).**
| Attribute group | System of record | Others |
|---|---|---|
| Legal name, tax ID, credit limit, payment terms, billing address | **SAP** | read-only |
| Sales territory, account owner, sales contacts | **Salesforce** | read-only |
| Login email, delivery addresses, marketing preferences | **E-commerce** | read-only |
| Global customer ID | **Integration cross-reference / MDM** | everyone stores it |

The key insight: there is rarely *one* owner of "the customer". Defining owners per attribute group turns "which value wins?" into a rule rather than a race.

**Data flows.**
- Replace 6 pairwise syncs with a **hub**: each owner publishes changes (CDC/platform events from Salesforce, IDoc or change pointers from SAP, webhooks from e-commerce) → a **Customer Process API/event flow** → applies them to subscribing systems for **owned attributes only**.
- Non-owners that need to *request* a change (sales rep wants to change a credit limit) do it through a **workflow/API on the owner system**, not by editing locally.
- Updates carry a timestamp/version; consumers ignore stale events (fixes the "old SAP value overwrote web address" incident — which happened because SAP was not the owner of delivery addresses but was still syncing them).

**Sizing and failure handling.**
- While SAP is down, the hub cannot apply a change to all three systems, so the delivery fails and the change waits on the topic. It is tried again each minute and reaches SAP once it is back. Applying changes must be idempotent, because the other two systems get the same change again on each try. Do not let the hub answer with a partial result here: SAP would miss those changes for good. And do not set a low delivery limit with no DLQ, or an hour of outage drops them.
- A Salesforce bulk load of 150 changes a second is more than SAP can take. The topic absorbs it, and a rate limit of 80 a second on the SAP System API keeps SAP under its 100. The hub works through the backlog at that pace and is done in about 20 minutes.
- The Salesforce System API takes 150 changes a second during the load, so it needs 0.5 vCore; the SAP and web shop System APIs get the same. The hub at 0.2 vCore already moves more than SAP can take. In all 1.7 vCores.

**Identity and duplicates.**
- Maintain a **cross-reference table**: global customer ID ↔ Salesforce Account ID ↔ SAP customer number ↔ e-commerce user ID.
- On create, **match first** (tax ID, normalised email/domain) before creating a new record; for B2B, tax ID/DUNS is a strong key.
- Clean existing duplicates as a one-off data-quality project with business review.

**Governance and MDM.**
- A **data governance group** (finance, sales ops, e-commerce owners) signs off the ownership table and change process. Architects propose; the business decides.
- MuleSoft is the **integration layer**: moves, transforms, routes, maintains cross-references for simple cases.
- When matching rules, survivorship, stewardship UIs and golden-record history become complex (many sources, fuzzy matching), introduce a **dedicated MDM tool** and integrate it with Mule. Don't build an MDM inside Mule flows.

**Trade-off:** strict ownership adds process (requests must go to the owner system) and may frustrate users who were used to editing everywhere; in return data conflicts disappear.
`,
  followUps: [
    { q: 'Sales insists they must edit billing addresses in Salesforce. What do you do?', a: 'Offer an edit screen in Salesforce that calls an API on SAP (the owner) synchronously or via a request workflow, then reflects SAP\'s confirmed value back. Users get convenience while SAP stays the owner.' },
    { q: 'Isn\'t "last write wins" good enough?', a: 'Only if clocks and delivery order are reliable and all systems are equally trusted, which is rarely true. It silently loses valid updates; ownership rules make conflicts impossible instead of resolving them randomly.' },
    { q: 'How do you handle the initial load when the three systems disagree today?', a: 'Run a one-time reconciliation: match records, apply ownership rules to pick each attribute, have data stewards resolve exceptions, then load cross-references before turning on the new event flows.' },
  ],
}
