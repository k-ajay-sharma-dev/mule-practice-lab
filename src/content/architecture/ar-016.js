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
      { label: 'The hub applies owned attributes to all three systems via their System APIs', rule: { type: 'edge', from: 'process-api', to: 'system-api', min: 3 } },
      { label: 'A cross-reference store maps the global customer ID to each local ID', rule: { type: 'edge', from: 'process-api', to: ['database', 'cache'] } },
    ],
    reference: diagram(
      {
        sf: ['crm', 'Salesforce (sales data owner)'],
        sap: ['erp', 'SAP ERP (credit, billing owner)'],
        ecom: ['saas', 'E-commerce (delivery address, email owner)'],
        ssf: ['system-api', 'sys-salesforce-customer-api'],
        ssap: ['system-api', 'sys-sap-customer-api'],
        secom: ['system-api', 'sys-ecommerce-customer-api'],
        ev: ['topic', 'customer-change-events'],
        hub: ['process-api', 'prc-customer-sync'],
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
