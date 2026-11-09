import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-048',
  category: 'architecture',
  title: 'Responsibilities of System, Process and Experience Layers',
  level: 'INTERMEDIATE',
  tags: ['api-led', 'layers', 'system-api', 'process-api', 'experience-api'],
  estMinutes: 20,
  diagram: {
    task: 'draw the three API-led layers for the e-commerce example: both consumers, their Experience APIs, the Process APIs, one System API per backend, and SAP, Salesforce and the WMS.',
    checks: [
      { label: 'The mobile app and the marketplace partner each call an Experience API', rule: { type: 'each', of: ['mobile-app', 'partner'], min: 2, edgeTo: 'experience-api' } },
      { label: 'Each consumer gets its own Experience API (at least two)', rule: { type: 'node', match: 'experience-api', min: 2 } },
      { label: 'The marketplace partner has its own Experience API', rule: { type: 'each', of: { type: 'experience-api', label: ['partner', 'marketplace'] }, edgeFrom: 'partner' } },
      { label: 'The mobile app never uses the partner Experience API', rule: { type: 'no-edge', from: 'mobile-app', to: { type: 'experience-api', label: ['partner', 'marketplace'] } } },
      { label: 'No Experience API is shared by the two consumers', rule: { type: 'each', of: 'experience-api', edgeFrom: ['mobile-app', 'partner'], count: 0, max: 1 } },
      { label: 'Every Experience API calls a Process API', rule: { type: 'each', of: 'experience-api', edgeTo: 'process-api' } },
      { label: 'Experience APIs never call System APIs directly', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
      { label: 'Every System API is called by a Process API', rule: { type: 'each', of: 'system-api', edgeFrom: 'process-api' } },
      { label: 'System APIs never call other System APIs (cross-system logic belongs in Process)', rule: { type: 'no-edge', from: 'system-api', to: 'system-api' } },
      { label: 'Every System API unlocks a system of record', rule: { type: 'each', of: 'system-api', edgeTo: ['erp', 'crm', 'legacy', 'wms', 'saas', 'database'] } },
      { label: 'SAP, Salesforce and the WMS each have a System API', rule: { type: 'each', of: ['erp', 'crm', 'legacy', 'wms', 'saas', 'database'], min: 3, edgeFrom: 'system-api' } },
      { label: 'SAP, Salesforce and the WMS are reached only through System APIs', rule: { type: 'only-via', target: ['erp', 'crm', 'legacy', 'wms', 'saas', 'database'], from: 'system-api' } },
      { label: 'APIs call each other with sync calls. Async work goes through a broker', rule: { type: 'lines', from: ['mobile-app', 'partner', 'experience-api', 'process-api'], to: ['experience-api', 'process-api', 'system-api'], kind: 'sync' } },
    ],
    reference: diagram(
      {
        mob: ['mobile-app', 'Mobile app'],
        mkt: ['partner', 'Marketplace partner'],
        em: ['experience-api', 'exp-mobile-api'],
        ep: ['experience-api', 'exp-partner-api'],
        po: ['process-api', 'prc-order-api'],
        pc: ['process-api', 'prc-customer-api'],
        ssap: ['system-api', 'sys-sap-order-api'],
        swms: ['system-api', 'sys-wms-stock-api'],
        ssf: ['system-api', 'sys-sfdc-customer-api'],
        sap: ['erp', 'SAP (orders, materials)'],
        wms: ['legacy', 'WMS (SOAP)'],
        sfdc: ['crm', 'Salesforce (customers)'],
      },
      ['mob -> em', 'mkt -> ep', 'em -> po', 'em -> pc', 'ep -> po', 'po -> ssap', 'po -> swms', 'pc -> ssf', 'ssap -> sap', 'swms -> wms', 'ssf -> sfdc'],
    ),
  },
  description: `
An interviewer says: *"Walk me through the three layers. For each one, tell me what it is responsible for — and, just as important, what must **not** go in it."*

Use this example domain: an e-commerce company with **SAP** (orders, materials), **Salesforce** (customers), a **warehouse management system** (stock, via SOAP) and two consumers: a **mobile app** and a **marketplace partner**.

**Questions:**
1. For each layer give: purpose, typical owner, typical consumers, and 3 responsibilities.
2. For each layer list things that do **not** belong there (anti-patterns you have seen or would reject in a code review).
3. Where would each of these live? *(a)* converting SAP date format \`YYYYMMDD\` to ISO-8601, *(b)* "a VIP customer gets free shipping", *(c)* removing fields the mobile app does not display, *(d)* retrying a WMS SOAP call on a timeout, *(e)* the partner's OAuth scopes.
`,
  answerTemplate: `## System layer

## Process layer

## Experience layer

## Placement of (a)–(e)
`,
  keyPoints: [
    'System APIs expose one system of record (or one system + entity area), hide its protocol, auth and data quirks, and contain no cross-system business rules.',
    'Process APIs implement business processes and rules by composing System APIs; they are channel-agnostic and should not talk to backends directly or format data for one UI.',
    'Experience APIs adapt data and security to one consumer type; they contain no core business rules and no direct backend access.',
    'Technical normalisation (dates, codes, retries on the backend) goes in the System layer; business rules (VIP free shipping) in Process; field trimming and channel auth in Experience.',
    'A good test: if you replace the backend only System APIs change; if you add a channel only an Experience API is added; if a rule changes only a Process API changes.',
  ],
  solution: `
\`\`\`
   Mobile app        Marketplace partner
        |                    |
 [exp-mobile-api]    [exp-partner-api]      <- shape + channel security
         \\              /
        [prc-order-api]  [prc-customer-api]  <- business process / rules
        /      |       \\         |
[sys-sap-order] [sys-wms-stock] [sys-sfdc-customer]   <- unlock systems
      SAP          WMS (SOAP)       Salesforce
\`\`\`

| | System | Process | Experience |
|---|---|---|---|
| Purpose | Unlock a system of record; stable contract over a volatile backend | Orchestrate/compose data and enforce business rules | Deliver data in the format and security model a consumer needs |
| Typical owner | Team close to the backend (e.g. SAP integration team) | Domain/LOB integration team | Channel team (mobile, partner) |
| Consumers | Process APIs (sometimes Experience) | Experience APIs, other Process APIs, batch jobs | External apps, UIs, partners |
| Responsibilities | Connectivity, protocol mediation (SOAP/BAPI/JDBC → REST/JSON), backend auth, data normalisation, backend-specific retries/timeouts, rate protection | Orchestration, aggregation, business validation, routing, enrichment, cross-system consistency (saga) | Channel-specific payload shaping, pagination tuned to the device, consumer auth (OAuth), SLA tiers, response caching |

**Does NOT belong:**
- **System:** business rules ("VIP gets free shipping"), calls to *other* System APIs, consumer-specific fields, UI formatting. A System API that joins SAP and Salesforce is really a Process API in disguise.
- **Process:** direct JDBC/SOAP/SAP connector calls (bypasses System layer), mobile-specific field trimming, consumer OAuth flows, one Process API per consumer (that is an Experience concern).
- **Experience:** business rules, direct backend calls, data persistence, orchestration across many System APIs. Heavy logic here duplicates when a second channel appears.

**Placement:**
- (a) SAP date → ISO-8601: **System** (hide SoR quirks).
- (b) VIP free shipping: **Process** (business rule, all channels must get the same answer).
- (c) Remove unused fields: **Experience** (mobile-specific).
- (d) Retry WMS SOAP timeout: **System** (backend-specific resilience; the Process layer may also have an overall timeout budget).
- (e) Partner OAuth scopes: **Experience** — enforced by API Manager policy on the partner Experience API.

**Rule of thumb:** each layer has one reason to change — backend change → System; rule change → Process; channel change → Experience.
`,
  followUps: [
    { q: 'Can a System API call another System API?', a: 'Generally no; that creates hidden coupling between systems and is really orchestration. If two systems must be combined, that belongs in a Process API.' },
    { q: 'Can a Process API call another Process API?', a: 'Yes, composing processes is valid (e.g. Order process calling a Pricing process), but watch for deep chains that add latency and circular dependencies.' },
    { q: 'Where does data validation go?', a: 'Structural/schema validation happens at every API via its spec (APIkit validates against RAML/OAS). Business validation (e.g. credit limit) lives in the Process layer; backend constraint errors are translated by the System layer.' },
  ],
}
