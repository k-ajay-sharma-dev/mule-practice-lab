import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-048',
  category: 'architecture',
  title: 'Responsibilities of System, Process and Experience Layers',
  level: 'INTERMEDIATE',
  tags: ['api-led', 'layers', 'system-api', 'process-api', 'experience-api'],
  estMinutes: 35,
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
        em: ['experience-api', 'exp-mobile-api', { auth: 'jwt' }],
        ep: ['experience-api', 'exp-partner-api', { auth: 'oauth2', rateLimit: 20 }],
        po: ['process-api', 'prc-order-api', { vCores: '0.2' }],
        pc: ['process-api', 'prc-customer-api'],
        ssap: ['system-api', 'sys-sap-order-api', { vCores: '0.2' }],
        swms: ['system-api', 'sys-wms-stock-api', { vCores: '0.2', retries: 2 }],
        ssf: ['system-api', 'sys-sfdc-customer-api'],
        sap: ['erp', 'SAP (orders, materials)'],
        wms: ['legacy', 'WMS (SOAP)'],
        sfdc: ['crm', 'Salesforce (customers)'],
      },
      ['mob -> em', 'mkt -> ep', 'em -> po', 'em -> pc', 'ep -> po', 'po -> ssap', 'po -> swms', 'pc -> ssf', 'ssap -> sap', 'swms -> wms', 'ssf -> sfdc'],
    ),
    simulation: {
      systems: [
        { match: 'erp', latencyMs: 300, maxRps: 60 },
        { match: 'legacy', latencyMs: 400, errorRate: 0.1 },
        { match: 'crm', latencyMs: 200 },
      ],
      tests: [
        {
          name: 'WMS SOAP calls time out',
          about: 'The mobile app places 30 order requests a second, and about 1 in 10 WMS SOAP calls times out. Retrying in the WMS System API must hide these failures from the app.',
          traffic: [{ name: 'mobile', from: 'mobile-app', rps: 30, to: ['erp', 'legacy'] }],
          expect: { answers: [{ minSuccess: 0.98 }] },
        },
        {
          name: 'Partner goes over its contract',
          about: 'The marketplace partner sends 60 order requests a second against a contract of 20, while the mobile app sends 30. The partner gets 429 for the extra calls, the mobile app is not affected, and SAP stays under its 60 a second.',
          traffic: [
            { name: 'mobile', from: 'mobile-app', rps: 30, to: ['erp', 'legacy'] },
            { name: 'partner', from: 'partner', rps: 60, to: ['erp', 'legacy'] },
          ],
          expect: {
            answers: [{ flow: 'mobile', minSuccess: 0.98 }, { flow: 'partner', minLimited: 0.5 }],
            peakRps: [{ node: 'erp', max: 60 }],
          },
        },
        {
          name: 'Partner calls without a token',
          about: 'A partner integration calls without an OAuth token, next to normal partner calls with one. The partner Experience API must refuse the calls without a token and answer the others.',
          traffic: [
            { name: 'with token', from: 'partner', rps: 10, to: ['erp', 'legacy'] },
            { name: 'no token', from: 'partner', rps: 5, to: ['erp', 'legacy'], auth: 'none' },
          ],
          expect: { answers: [{ flow: 'with token', minSuccess: 0.98 }, { flow: 'no token', minRefused: 0.99 }] },
        },
      ],
    },
  },
  description: `
An interviewer says: *"Walk me through the three layers. For each one, tell me what it is responsible for — and, just as important, what must **not** go in it."*

Use this example domain: an e-commerce company with **SAP** (orders, materials), **Salesforce** (customers), a **warehouse management system** (stock, via SOAP) and two consumers: a **mobile app** and a **marketplace partner**.

For the diagram's Run tab: the mobile app sends about 30 order requests a second. The partner's contract allows **20 a second** with an OAuth token, and it has sent bursts of 60. SAP answers in about 300 ms and takes at most **60 calls a second**. The WMS answers in about 400 ms, and about **1 in 10** of its SOAP calls times out.

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
    'In settings: 2 retries on the WMS System API, an OAuth policy and a 20 a second rate limit on the partner Experience API, JWT validation on the mobile one, and 0.2 vCore for the order Process API and the SAP and WMS System APIs.',
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

**The same placement as settings.**
- **System:** \`sys-wms-stock-api\` retries a failed SOAP call **twice**. With 1 call in 10 timing out, about 1 in 1,000 still fails after the retries, and no other layer needs to know.
- **Experience:** \`exp-partner-api\` has an **OAuth 2.0 policy** and a **rate limit of 20 a second**, the partner's contract. Calls without a token are refused there, and a burst of 60 gets 429 for the extra calls. Without the limit the burst would reach the shared \`prc-order-api\` and SAP, and mobile customers would get errors too. \`exp-mobile-api\` validates the customer's JWT.
- **Sizing:** \`prc-order-api\` and the SAP and WMS System APIs carry both channels, about 50 calls a second, so each gets 0.2 vCore. SAP then stays under its 60 a second.
`,
  followUps: [
    { q: 'Can a System API call another System API?', a: 'Generally no; that creates hidden coupling between systems and is really orchestration. If two systems must be combined, that belongs in a Process API.' },
    { q: 'Can a Process API call another Process API?', a: 'Yes, composing processes is valid (e.g. Order process calling a Pricing process), but watch for deep chains that add latency and circular dependencies.' },
    { q: 'Where does data validation go?', a: 'Structural/schema validation happens at every API via its spec (APIkit validates against RAML/OAS). Business validation (e.g. credit limit) lives in the Process layer; backend constraint errors are translated by the System layer.' },
  ],
}
