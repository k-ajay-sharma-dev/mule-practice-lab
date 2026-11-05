export default {
  id: 'ar-065',
  category: 'architecture',
  title: 'API-led at Enterprise Scale: Domains, Business Groups and Composability',
  level: 'EXPERT',
  tags: ['api-led', 'enterprise-architecture', 'domain-driven-design', 'business-groups', 'composable-enterprise'],
  estMinutes: 45,
  quiz: [
    {
      type: 'single',
      prompt: 'There are seven Customer System APIs over SAP. How do you fix ownership?',
      options: [
        'Let each business unit keep its own',
        'One owning team per shared system of record publishes the sys-sap-* APIs to all business groups through Exchange, with a backlog that accepts requests from every BU; duplicates are consolidated',
        'The C4E builds and owns every System API',
        'Whoever needed the API first owns it',
      ],
      answer: 1,
      explain: '"Owned by whoever needed it first" is how duplicates appear. A shared system needs one accountable owner run as an internal product.',
    },
    {
      type: 'match',
      prompt: 'Match each API-led layer to what its ownership aligns with.',
      pairs: [
        ['System layer', 'Systems of record (technical boundary), split per domain where one system serves several'],
        ['Process layer', 'Bounded contexts owned by domain teams'],
        ['Experience layer', 'Channels and consumer journeys owned by channel teams'],
      ],
      explain: 'Assigning every Process API to a domain fixes the "dumping ground"; an API no domain wants to own is a design smell.',
    },
    {
      type: 'match',
      prompt: 'Match each concept to its concern.',
      pairs: [
        ['API-led connectivity', 'Operational, real-time and event interfaces between applications'],
        ['Data mesh', 'Domain-owned analytical data products'],
        ['Composable enterprise', 'Business framed as reusable packaged business capabilities'],
      ],
      explain: 'They are complementary: API-led implements the capabilities a composable enterprise talks about, while data mesh governs analytical data rather than operational integration.',
    },
    {
      type: 'multi',
      prompt: 'A large company has a central platform team and many domain teams that build APIs in one Anypoint organisation. Which three should the platform team govern centrally?',
      options: [
        'The identity provider and mandatory security policies',
        'Naming, versioning and error-contract standards',
        'Shared runtimes, networking and CI/CD templates',
        'The data models used inside each business domain',
        'The release cadence of each domain team',
      ],
      answer: [0, 1, 2],
      explain: 'Centralise what must be consistent; federate delivery, domain models and release cadence. Central governance also covers OAuth setup, policies such as client-id enforcement, TLS and threat protection, spec rulesets, observability and an ownership registry where every API has an owner. Automated rulesets and templates keep central control from becoming a bottleneck.',
    },
    {
      type: 'single',
      prompt: 'What do Anypoint business groups give the business units?',
      options: [
        'Completely separate organisations with their own identity providers',
        'Their own environments, capacity allocation and role-based access under a root org that enforces shared standards',
        'Separate copies of Exchange that cannot share assets',
        'Exemption from central security policies',
      ],
      answer: 1,
      explain: 'Business groups balance BU autonomy with central control, and Exchange assets can still be shared so reuse crosses BG boundaries.',
    },
    {
      type: 'single',
      prompt: 'Is one enterprise canonical data model a good idea at this scale?',
      options: [
        'Yes — one Customer model for all 400 APIs',
        'Prefer canonical models per bounded context plus shared primitive types (address, money, codes), with explicit translation at boundaries',
        'No — every API should invent its own types',
        'Only for System APIs',
      ],
      answer: 1,
      explain: 'A single model for everything tends to bloat and change slowly; per-context models with an anti-corruption layer scale better.',
    },
  ],
  description: `
A global manufacturer (5 business units, 40 integration developers across 8 teams, ~400 APIs) runs one Anypoint organisation. Problems:

- Every team creates its own \`sys-sap-*\` APIs; there are **seven** different Customer System APIs.
- The "Process layer" has become a dumping ground with no clear ownership.
- Business units want autonomy (own budgets, release cadence, environments), but security wants central control.
- The CDO is promoting **data mesh** and the CIO talks about a **composable enterprise** with "packaged business capabilities". Someone asks whether API-led is now obsolete.

**Questions:**
1. How do you organise ownership: Anypoint **business groups**, teams and API-led layers? Who owns System APIs over shared systems like SAP?
2. How do **domain-driven design** ideas (bounded contexts, domain ownership) map to the three layers?
3. How do API-led, **data mesh** and the **composable enterprise** relate — complementary or competing?
4. What is governed **centrally** vs **federated**?
`,
  answerTemplate: `## Organisation and ownership

## DDD mapped to layers

## API-led vs data mesh vs composable enterprise

## Central vs federated governance
`,
  keyPoints: [
    'Use business groups to give business units autonomy (environments, capacity allocation, permissions) under a root org that owns shared standards, policies and identity.',
    'Shared systems of record get one owning platform/system team per system (e.g. SAP integration team) publishing System APIs to all business groups through Exchange; duplicates are consolidated.',
    'Domain-driven boundaries organise the Process layer: each bounded context (Order, Customer, Product) owns its Process APIs and events with one accountable team; Experience APIs are owned by channel teams.',
    'API-led, data mesh and composable enterprise are complementary: API-led governs operational/transactional interfaces, data mesh governs analytical data products, composability is the business framing of reusable capabilities that API-led implements.',
    'Centralise what must be consistent (security policies, identity, naming, error contracts, platform, observability); federate delivery, domain models and release cadence.',
  ],
  solution: `
**Organisation and ownership.**
\`\`\`
Anypoint root org  (platform team + C4E: standards, identity, shared policies, Exchange curation)
 ├─ BG: Shared Systems   -> SAP team (sys-sap-*), CRM team (sys-crm-*), MDM team
 ├─ BG: Sales & Orders   -> Order domain team (prc-order-*), Pricing team
 ├─ BG: Manufacturing    -> Production domain team
 ├─ BG: Aftermarket      -> Service domain team
 └─ BG: Digital Channels -> exp-web-*, exp-mobile-*, exp-dealer-*
\`\`\`
- **Business groups** give BUs their own environments, capacity allocation and role-based access while the root org enforces shared standards. Exchange assets can be shared across the org so reuse crosses BG boundaries.
- **Shared SoR (SAP):** exactly **one** owning team publishes \`sys-sap-*\` APIs, run as an internal product with a backlog that accepts requests from all BUs. Seven Customer System APIs → consolidate to one per system (and one Customer Process API owned by the Customer domain, ideally backed by MDM).
- **Avoid** "System APIs owned by whoever needed them first" — that is how duplicates appear.

**DDD mapped to layers.**
- **Bounded contexts** (Order, Customer, Product, Service) define **Process-layer ownership**: each domain team owns its Process APIs, its business events (\`OrderPlaced\`) and its canonical model *within* the context. No enterprise-wide canonical model forced on everyone — translation happens at context boundaries (anti-corruption layer).
- **System layer** aligns to systems of record (technical boundary), but can be split per context when one system (SAP) serves multiple domains: \`sys-sap-order-api\` vs \`sys-sap-material-api\`, each with clear owners.
- **Experience layer** aligns to channels/consumer journeys and is owned by channel teams.
- The "dumping ground" Process layer is fixed by assigning every Process API to a domain; an API that no domain wants to own is a design smell.

**API-led vs data mesh vs composable enterprise.**

| Concept | Concern | Relationship to API-led |
|---|---|---|
| API-led | Operational integration: real-time and event interfaces between apps | The integration architecture |
| Data mesh | Analytical data: domain-owned data products, self-serve data platform, federated governance | Complementary. Shares principles (domain ownership, product thinking, federated governance). System-layer CDC and Process-layer events can feed data products; API-led should not become the analytics pipeline |
| Composable enterprise | Business framed as interchangeable "packaged business capabilities" | API-led is one way to implement it: Process APIs + events are the capabilities' interfaces; Experience APIs compose them into new journeys |

So API-led is not obsolete; the answer is to position it correctly and borrow the **domain ownership** and **product thinking** ideas these movements emphasise.

**Central vs federated governance.**

| Central (platform/C4E) | Federated (domain/BU teams) |
|---|---|
| Identity provider, OAuth setup, mandatory policies (client-id enforcement, TLS, threat protection) | API design within the domain, domain models, release cadence |
| Naming, versioning, error contracts, spec rulesets | Which Process/Experience APIs to build |
| Platform: runtimes, networking, CI/CD templates, observability, logging standards | Capacity within their BG allocation |
| Exchange taxonomy, deprecation policy | Their own on-call and SLOs |
| Ownership registry: every API has an owner | Contributing to shared System APIs (inner source) |

Automate governance (rulesets, pipeline checks, templates) so central control does not mean central bottleneck.
`,
  followUps: [
    { q: 'Should each business unit have its own SAP System API if they use different SAP company codes?', a: 'Usually no; one SAP System API parameterised by company code/sales org avoids duplicated connectivity and mappings. Split only when the SAP instances or data models are genuinely different and separately owned.' },
    { q: 'Is an enterprise canonical data model a good idea at this scale?', a: 'A single canonical model for everything tends to become bloated and slow to change. Prefer canonical models per bounded context plus shared primitive types (address, money, codes), with explicit translation at boundaries.' },
    { q: 'How do you stop teams bypassing Exchange and building duplicates?', a: 'Make discovery simple (taxonomy, good docs), make reuse the default in project intake and design review, and measure duplicates. Give shared-API owners capacity to accept change requests quickly, because slow owners cause duplication.' },
  ],
}
