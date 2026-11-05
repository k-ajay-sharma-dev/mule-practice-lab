import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-057',
  category: 'use-cases',
  title: 'API-Led after a Merger: Rationalising Two Application Networks',
  level: 'EXPERT',
  tags: ['api-led', 'application-network', 'merger', 'mdm', 'governance', 'versioning'],
  estMinutes: 50,
  diagram: {
    task: 'draw the target (month 18) application network for customer and loyalty: both brands\' channels and the trade portal, their Experience APIs, the unified customer, loyalty and trade-account Process APIs, and the System APIs over Salesforce, the cross-reference store and the loyalty SaaS.',
    checks: [
      { label: 'HomeCo channels, the BuildIt app and the trade portal each call an Experience API', rule: { type: 'each', of: ['mobile-app', 'web-app', 'internal-app', 'device'], min: 3, edgeTo: 'experience-api' } },
      { label: 'Every Experience API goes through a Process API', rule: { type: 'each', of: 'experience-api', edgeTo: 'process-api' } },
      { label: 'Experience APIs never call System APIs directly', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
      { label: 'Both brands share one unified customer-profile Process API', rule: { type: 'edge', from: 'experience-api', to: { type: 'process-api', label: ['customer', 'profile'] }, min: 2 } },
      { label: 'Both brands share one loyalty Process API', rule: { type: 'edge', from: 'experience-api', to: { type: 'process-api', label: ['loyalty', 'reward'] }, min: 2 } },
      { label: 'Legacy BuildIt IDs are resolved through a cross-reference System API', rule: { type: 'edge', from: 'process-api', to: { type: 'system-api', label: ['xref', 'cross', 'mapping'] } } },
      { label: 'B2B trade accounts are a distinct Process API capability', rule: { type: 'node', match: { type: 'process-api', label: ['trade'] } } },
      { label: 'Salesforce, the xref store and the loyalty SaaS are reached only through System APIs', rule: { type: 'only-via', target: ['crm', 'saas', 'database', 'erp'], from: 'system-api' } },
    ],
    reference: diagram(
      {
        happ: ['mobile-app', 'HomeCo app'],
        hpos: ['internal-app', 'HomeCo store POS'],
        bapp: ['mobile-app', 'BuildIt app'],
        trade: ['web-app', 'Trade portal'],
        eh: ['experience-api', 'exp-homeco-app'],
        ep: ['experience-api', 'exp-homeco-pos'],
        eb: ['experience-api', 'exp-buildit-app (same contract)'],
        et: ['experience-api', 'exp-trade-portal'],
        pcust: ['process-api', 'prc-customer-profile v3'],
        ploy: ['process-api', 'prc-loyalty v2'],
        ptrade: ['process-api', 'prc-trade-accounts'],
        ssf: ['system-api', 'sys-salesforce-customers v3'],
        sxref: ['system-api', 'sys-customer-xref'],
        sloy: ['system-api', 'sys-loyalty-engine'],
        sf: ['crm', 'Salesforce (customer master)'],
        xref: ['database', 'Legacy ID ↔ golden ID store'],
        loy: ['saas', 'Loyalty SaaS'],
      },
      [
        'happ -> eh', 'hpos -> ep', 'bapp -> eb', 'trade -> et', 'eh -> pcust', 'eh -> ploy', 'ep -> pcust', 'ep -> ploy', 'eb -> pcust', 'eb -> ploy', 'et -> ptrade',
        'pcust -> ssf', 'pcust -> sxref', 'ploy -> sloy', 'ploy -> sxref', 'ptrade -> ssf', 'ssf -> sf', 'sxref -> xref', 'sloy -> loy',
      ],
    ),
  },
  description: `
**HomeCo**, a home-improvement retailer, has acquired its competitor **BuildIt**. Both were MuleSoft customers with their own Anypoint organisations and API-led networks. The board wants **one customer and loyalty experience within 18 months**, while both brands keep trading during the transition.

**HomeCo network (relevant part)**

| Layer | API | Backed by / consumers |
|---|---|---|
| Experience | exp-homeco-app, exp-homeco-web, exp-homeco-pos | HomeCo app, web, 300 stores' POS |
| Process | prc-customer-profile (v2) | Customer view + loyalty balance |
| Process | prc-loyalty (v1) | Earn/burn points |
| Process | prc-orders (v3) | Online orders |
| System | sys-salesforce-customers (v2) | Salesforce (B2C customers, 9 M) |
| System | sys-loyalty-engine (v1) | SaaS loyalty platform |
| System | sys-sap-orders (v2) | SAP S/4HANA |

**BuildIt network (relevant part)**

| Layer | API | Backed by / consumers |
|---|---|---|
| Experience | buildit-mobile-api, buildit-trade-portal-api | BuildIt app; trade (B2B builders) portal |
| Process | customer-api (v1, mixes process + system logic) | Customer + trade-account view |
| Process | rewards-api (v1) | Points |
| System | dynamics-customer-sapi (v1) | Dynamics 365 (B2C 4 M + 60 k trade accounts) |
| System | rewards-db-sapi (v1) | In-house loyalty DB (SQL Server) |
| System | sap-ecc-orders-sapi (v1) | SAP ECC |

Facts:
- **~1.5 M customers exist in both** companies (same person, different IDs, often different emails/addresses).
- Target state: Salesforce is the customer master, HomeCo's loyalty SaaS the loyalty platform; BuildIt's trade accounts (B2B) have no HomeCo equivalent.
- Dynamics and the BuildIt rewards DB are decommissioned at month 15. SAP ECC stays until a later ERP project.
- Different naming conventions, different error models, different security (HomeCo: OAuth via Okta; BuildIt: client ID/secret only), and two Anypoint orgs.
- Brand apps must keep working throughout; app releases need ~6 weeks for store approval and user adoption.

**Questions:**
1. Describe the **target** application network for customer and loyalty (APIs per layer).
2. How do you handle the overlapping customer System APIs and the duplicate customers?
3. Give a **phased migration** that keeps both brands' channels working. Which contracts stay stable, which get new major versions?
4. How do you merge platform governance (orgs, Exchange, naming, security, error model)?
`,
  answerTemplate: `## Target state: Experience / Process / System APIs

## Overlapping System APIs and duplicate customers (identity resolution)

## Phased migration

## Contract stability and versioning

## Platform and governance consolidation

## Risks and NFRs
`,
  keyPoints: [
    'Target: one Process API per business capability (prc-customer-profile v3, prc-loyalty v2), System APIs per system of record (sys-salesforce-customers, sys-loyalty-engine), brand-specific Experience APIs kept where the channels differ.',
    'Process APIs are the stable seam: during transition they route to either back end (Salesforce or Dynamics, loyalty SaaS or rewards DB) behind one canonical customer model — channels don\'t care which system answers.',
    'Duplicates are resolved with an identity/MDM step (match/merge, golden record in Salesforce) and a cross-reference service (sys-customer-xref) mapping legacy BuildIt IDs to the golden ID.',
    'BuildIt\'s customer-api mixes layers: wrap and replace it rather than reuse it; trade accounts (B2B) become a distinct capability (prc-trade-accounts) modelled as Salesforce business accounts.',
    'Versioning: keep existing Experience contracts stable (brand apps unaffected). Introduce new majors only where the canonical model changes (prc-customer-profile v3 with golden ID and brand memberships), and run old/new in parallel with deprecation dates.',
    'Governance: one Anypoint org with business groups per brand during transition, a single Exchange catalogue with naming/API standards, Okta as one IdP, shared error model and policy templates (automated policies).',
  ],
  solution: `
**Target state (month 18)**

| Layer | API | Resources | Responsibility | Consumers |
|---|---|---|---|---|
| Experience | **exp-homeco-app / -web / -pos** (existing) | unchanged contracts | HomeCo channels | HomeCo channels |
| Experience | **exp-buildit-app** (replaces buildit-mobile-api, same contract) | unchanged contract | BuildIt brand app | BuildIt app |
| Experience | **exp-trade-portal** (replaces buildit-trade-portal-api) | \`GET /accounts/{id}\`, \`GET /accounts/{id}/orders\` | B2B trade portal | Trade portal |
| Process | **prc-customer-profile v3** | \`GET /customers/{goldenId}\`, \`GET /customers?email=\`, \`POST /customers/{id}/brand-memberships\` | Unified B2C customer, brand memberships, consent per brand | all B2C Experience APIs |
| Process | **prc-loyalty v2** | \`GET /members/{goldenId}/balance\`, \`POST /members/{id}/transactions\` | One loyalty programme, brand-aware earn rules | all B2C Experience APIs |
| Process | **prc-trade-accounts** (new) | \`GET /trade-accounts/{id}\`, credit limit, users | B2B capability | exp-trade-portal |
| Process | prc-orders v3 (+ BuildIt routing) | unchanged | Orders across SAP S/4 and ECC | Experience APIs |
| System | **sys-salesforce-customers v3** | persons + business accounts + brand memberships | Customer master | Process APIs |
| System | **sys-customer-xref** (new) | \`GET /xref?system=BUILDIT&id=\` → goldenId | Legacy ID mapping | Process APIs |
| System | **sys-loyalty-engine** | unchanged | Loyalty platform | prc-loyalty |
| System | sys-sap-orders, **sys-sap-ecc-orders** (renamed from sap-ecc-orders-sapi) | unchanged | ERPs | prc-orders |
| Retired | dynamics-customer-sapi, rewards-db-sapi, customer-api, rewards-api | — | decommissioned month 15–18 | — |

\`\`\`
  HomeCo app/web/POS        BuildIt app        Trade portal
         |                      |                   |
  exp-homeco-*         exp-buildit-app       exp-trade-portal          Experience
         |                      |                   |
         +-----------+----------+                   |
                     v                              v
   prc-customer-profile v3   prc-loyalty v2   prc-trade-accounts   prc-orders   Process
         |        |               |                 |               |     |
 sys-salesforce-  sys-customer-  sys-loyalty-   (sys-salesforce-  sys-sap-  sys-sap-ecc-  System
 customers v3     xref           engine          customers v3)    orders    orders
\`\`\`

**Overlapping System APIs and duplicates.**
- Do **not** merge sys-salesforce-customers and dynamics-customer-sapi into one "super System API" — System APIs map to systems of record. Instead the **Process layer** owns the unified view.
- **Identity resolution**: one-off + continuous matching (deterministic on verified email/phone/loyalty card, probabilistic on name + address) in an MDM tool or Salesforce matching/duplicate rules, with a stewardship queue for uncertain matches. Result: a **golden ID** in Salesforce; sys-customer-xref stores BuildIt Dynamics ID ↔ golden ID (and rewards member ID ↔ loyalty SaaS member ID).
- Merged customers get **brand memberships** and **consent per brand** (marketing consent given to BuildIt does not automatically transfer to HomeCo — legal review).

**Phased migration**

| Phase | Months | What happens | Channels affected |
|---|---|---|---|
| 0. Platform | 0–3 | Move BuildIt apps into the HomeCo Anypoint org as a business group; Okta federation for BuildIt; apply standard policies; inventory and classify BuildIt APIs in Exchange | None |
| 1. Façade | 2–6 | Build **prc-customer-profile v3** with canonical model; implement it with **routing**: HomeCo IDs → Salesforce, BuildIt IDs → Dynamics (via existing dynamics-customer-sapi) + xref. Re-point buildit-mobile-api from customer-api to prc-customer-profile v3 **behind its unchanged contract** (it becomes exp-buildit-app) | None visible |
| 2. Identity merge | 4–9 | Match & merge; load BuildIt customers into Salesforce; sys-customer-xref populated; dual-write or CDC Dynamics → Salesforce to keep data in sync while BuildIt systems still take updates | None visible |
| 3. Loyalty | 8–14 | prc-loyalty v2 routes by member; migrate balances from rewards DB to loyalty SaaS in waves, with a freeze window per wave; combined balances for merged customers per business rules | Apps get "your points are now combined" via minor release |
| 4. Switch-over | 12–15 | Route all BuildIt reads/writes to Salesforce; Dynamics read-only then retired; trade accounts served by prc-trade-accounts on Salesforce business accounts | Trade portal moves to exp-trade-portal (contract kept or v2 with migration window) |
| 5. Clean-up | 15–18 | Remove legacy APIs; deprecate prc-customer-profile v2 after HomeCo Experience APIs migrate to v3 | None |

**Contract stability and versioning.**
- **Experience contracts stay stable** (brand apps cannot be changed quickly): the change happens underneath — the strongest argument for the Experience/Process split.
- **prc-customer-profile v3** is a new **major** version (golden ID, brand memberships, per-brand consent) deployed alongside v2; HomeCo Experience APIs migrate on their own schedule.
- **prc-loyalty v2** major (brand-aware rules, merged balances); v1 kept until HomeCo channels migrate.
- Additive changes to sys-salesforce-customers (business accounts, memberships) are minor if existing fields keep meaning — otherwise v3.
- IDs: v3 responses include \`goldenId\` and \`legacyIds[]\`; v3 accepts legacy IDs and resolves via xref so old app versions keep working.

**Governance consolidation.**
- One Anypoint **org**, business groups per domain (not per brand) at the end; environments aligned; one **Exchange** with renamed assets following the exp-/prc-/sys- convention; old names kept as deprecated aliases during transition.
- One **error model** (e.g. RFC 7807 style) and common libraries/policies via **automated policies** (logging, client ID, JWT) per environment.
- Security: BuildIt's client-ID-only APIs move to Okta OAuth + JWT validation; consumer contracts re-issued per app.
- Architecture board decides ownership: customer domain team owns prc-customer-profile + sys-salesforce-customers.

**Risks and NFRs.** Data-migration reconciliation (counts, balances) per wave; rollback plan per phase (routing switch in the Process API config); dual-run monitoring comparing responses from old and new paths; GDPR basis for merging profiles; capacity for 13 M customers on Salesforce APIs (API limits — cache reads, bulk loads via Bulk API).
`,
  followUps: [
    { q: 'Why not just keep both networks and integrate them via a few bridge APIs?', a: 'That leaves two sources of truth for customers and loyalty, which contradicts the business goal and doubles run cost. Bridges are fine as a temporary step (phase 1 routing), not as the target.' },
    { q: 'BuildIt\'s customer-api mixes process and system logic. Reuse it?', a: 'Treat it as legacy: keep it running while consumers move, but don\'t build on it. Its logic is re-implemented properly in prc-customer-profile v3 and sys APIs, then it is retired.' },
    { q: 'How does the Process API know whether an ID is HomeCo or BuildIt during transition?', a: 'Via sys-customer-xref (or ID format/prefix): it resolves any incoming ID to the golden ID and to the system currently authoritative for that customer, a routing rule that changes per migration phase.' },
    { q: 'What is the biggest non-technical risk?', a: 'Ownership and consent: deciding which team owns the merged customer domain and whether customers\' marketing consents can be combined. Both must be settled early or the technical plan stalls.' },
  ],
}
