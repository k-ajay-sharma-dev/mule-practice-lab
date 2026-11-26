import { diagram } from '../../arch/dsl.js'

const BROKER = ['topic', 'queue', 'event-stream', 'cloud-queue']
const SYSTEMS = ['erp', 'crm', 'saas', 'legacy', 'database', 'oracle-db', 'sql-server']
const XREF = { label: ['cross-ref', 'cross ref', 'xref', 'mdm', 'key map', 'id map'] }
const APIS = ['experience-api', 'process-api', 'system-api']
const SUPPORT = { type: 'saas', label: 'support' }

export default {
  id: 'ar-031',
  category: 'architecture',
  title: 'Canonical Data Model vs Pass-Through',
  level: 'INTERMEDIATE',
  tags: ['canonical-model', 'data-modeling', 'bounded-context', 'api-led'],
  estMinutes: 35,
  diagram: {
    task: 'draw where each model lives. One System API for each of SAP, Salesforce, the billing SaaS and the support tool, one Customer Process API that owns the domain model and the customer cross-reference, and an Experience API for each channel.',
    checks: [
      { label: 'Every channel calls its own Experience API', rule: { type: 'each', of: ['mobile-app', 'web-app', 'partner', 'internal-app'], min: 2, edgeTo: 'experience-api' } },
      { label: 'At least two Experience APIs, each shaping the model for its channel', rule: { type: 'node', match: 'experience-api', min: 2 } },
      { label: 'Every Experience API calls the Customer Process API, never passing system data through', rule: { type: 'each', of: 'experience-api', edgeTo: 'process-api' } },
      { label: 'Experience APIs never call System APIs directly', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
      { label: 'One Customer Process API reads all four System APIs', rule: { type: 'each', of: 'process-api', edgeTo: 'system-api', count: 4, some: true } },
      { label: 'The Customer Process API owns the cross-reference of customer keys', rule: { type: 'edge', from: 'process-api', to: XREF } },
      { label: 'Every System API is called by the Process API', rule: { type: 'each', of: 'system-api', edgeFrom: 'process-api' } },
      { label: 'Each System API fronts exactly one system, still system-shaped', rule: { type: 'each', of: 'system-api', min: 4, edgeTo: SYSTEMS, count: 1, max: 1 } },
      { label: 'SAP, Salesforce, billing and support are reached only through System APIs', rule: { type: 'only-via', target: ['erp', 'crm', 'saas', 'legacy'], from: 'system-api' } },
      { label: 'APIs call each other, Salesforce and the SaaS tools with sync calls. Async work goes through a broker', rule: { type: 'lines', from: ['mobile-app', 'web-app', 'partner', 'internal-app', ...APIS], to: [...APIS, 'crm', 'saas', 'database', 'cache'], kind: 'sync' } },
      { label: 'Every line to or from a queue or topic is an async message', rule: { type: 'lines', touching: [...BROKER, 'dlq'], kind: 'async' } },
    ],
    reference: diagram(
      {
        mob: ['mobile-app', 'Mobile app'],
        ptl: ['partner', 'Partner portal'],
        emob: ['experience-api', 'exp-customer-mobile (8 fields)', { vCores: '0.2' }],
        eptl: ['experience-api', 'exp-customer-partner (20 fields)'],
        prc: ['process-api', 'prc-customer (Customer domain model, customerId)', { vCores: '0.5', calls: 'in parallel', onFailure: 'partial answer', timeoutMs: 3000 }],
        xref: ['database', 'Customer cross-reference (customerId to KUNNR, Account Id, customer_ref, email)'],
        ev: ['topic', 'CustomerUpdated (domain model)'],
        ssap: ['system-api', 'sys-sap-customer (cleaned, SAP-shaped)', { vCores: '0.2' }],
        ssf: ['system-api', 'sys-salesforce-account', { vCores: '0.2' }],
        sbil: ['system-api', 'sys-billing-customer', { vCores: '0.2' }],
        ssup: ['system-api', 'sys-support-contact', { vCores: '0.2' }],
        sap: ['erp', 'SAP (KUNNR)'],
        sf: ['crm', 'Salesforce (Account Id)'],
        bil: ['saas', 'Billing SaaS (customer_ref)'],
        sup: ['saas', 'Support tool (email)'],
      },
      [
        'mob -> emob', 'ptl -> eptl', 'emob -> prc', 'eptl -> prc', 'prc -> xref', 'prc ~> ev',
        'prc -> ssap', 'prc -> ssf', 'prc -> sbil', 'prc -> ssup', 'ssap -> sap', 'ssf -> sf', 'sbil -> bil', 'ssup -> sup',
      ],
    ),
    simulation: {
      systems: [
        { match: 'erp', latencyMs: 800 },
        { match: 'crm', latencyMs: 300 },
        { match: 'saas', latencyMs: 300 },
      ],
      tests: [
        {
          name: 'Customer lookups at peak',
          about: 'The mobile app looks up 60 customers a second and the partner portal 20. Each lookup reads all four systems, and the answer must take under 1.2 s on average within the 2 vCore budget.',
          traffic: [
            { name: 'mobile', from: 'mobile-app', rps: 60, to: ['erp', 'crm', 'saas'] },
            { name: 'partners', from: 'partner', rps: 20, to: ['erp', 'crm', 'saas'] },
          ],
          expect: { answers: [{ minSuccess: 0.99, maxDegraded: 0.01, maxMs: 1200 }], vCores: { max: 2 } },
        },
        {
          name: 'The support tool is down',
          about: 'The support tool is down for the whole run. Customers are still answered from the other three systems, without the support contacts.',
          traffic: [{ name: 'mobile', from: 'mobile-app', rps: 60, to: ['erp', 'crm', 'saas'] }],
          incidents: [{ down: SUPPORT }],
          expect: { answers: [{ minSuccess: 0.99, minDegraded: 0.9 }] },
        },
      ],
    },
  },
  quiz: [
    {
      type: 'single',
      prompt: 'With 4 source systems and 6 consumers, how many mappings does a common model need compared with point-to-point?',
      options: [
        '10 instead of 24 (N + M instead of N × M)',
        '6 instead of 24 (only the M consumers map to the model)',
        '4 instead of 24 (only the N sources map to the model)',
        '24 in both cases (each pair still needs its own mapping)',
      ],
      answer: 0,
      explain: 'Each system and each consumer maps once to the shared model, instead of every pair having its own mapping.',
    },
    {
      type: 'single',
      prompt: 'An architect proposes one enterprise-wide Canonical Customer, a shared data model that every API must speak. B2B accounts, individuals and billing entities all count as customers in different systems. What is the main risk of this proposal?',
      options: [
        'Consumers become coupled to the field names of each backend',
        'The model fills up with optional fields of unclear meaning',
        'Replacing a backend system becomes impossible',
        'Mappings multiply, because each pair of systems needs its own',
      ],
      answer: 1,
      explain: 'The costs of one enterprise model are governance and bloat. Agreeing one definition is slow and political, the model grows to the union of all fields, most of them optional, and every change needs cross-team coordination, so teams start bypassing it. A shared model actually makes backend replacement cheaper, reduces mappings and hides system fields from consumers.',
    },
    {
      type: 'single',
      prompt: 'The Experience API returns SAP fields such as KUNNR and partner functions as they are. What is the risk?',
      options: [
        'The response becomes too large for the mobile app',
        'Consumers become coupled to SAP, so replacing SAP breaks every one of them',
        'APIkit rejects the response, since SAP names break RAML types',
        'No risk, as long as the SAP fields are documented in Exchange',
      ],
      answer: 1,
      explain: 'Pass-through leaks system details upward, and the mapping logic is duplicated in each consumer. The whole point of the layers is that a backend change stops at its System API.',
    },
    {
      type: 'match',
      needsScenario: true,
      prompt: 'Match each layer to the model it exposes in the "canonical per domain" recommendation.',
      pairs: [
        ['System APIs', 'Each system\'s data, cleaned but still system-shaped'],
        ['Customer Process API', 'The Customer domain (bounded-context) model with a stable customerId'],
        ['Experience APIs', 'The domain model shaped for each channel'],
      ],
      explain: 'No global model is forced at the System layer; the domain model lives where the business process lives, and channels get only what they need.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'How are KUNNR, the Salesforce Account Id and customer_ref linked to one customer?',
      options: [
        'Each consumer keeps its own mapping table of system keys',
        'A cross-reference store or MDM maps customerId to every system key',
        'By matching on customer name and email at runtime',
        'KUNNR is copied into every other system as the shared key',
      ],
      answer: 1,
      explain: 'The cross-reference is needed whichever model you choose; owning it explicitly avoids each flow inventing its own.',
    },
    {
      type: 'single',
      prompt: 'The billing team wants to rename a field in the published Customer domain type. How is that handled?',
      options: [
        'Rename it in place and publish a minor version',
        'Treat it as breaking: a new major version with a deprecation period',
        'Rename it in place; consumers will see the change in Exchange',
        'Create a second Customer type with the new field name',
      ],
      answer: 1,
      explain: 'Removing or renaming fields breaks consumers; additive changes are minor versions. Publish the type in Exchange with semantic versioning and keep it lean.',
    },
  ],
  description: `
A manufacturer has **Customer** data in SAP, Salesforce, a billing SaaS and a support tool. Each system has its own customer shape:

| System | Key | Notable differences |
|---|---|---|
| SAP | \`KUNNR\` (10 chars) | Addresses as partner functions, German field names |
| Salesforce | Account Id (18 chars) | B2B accounts with contacts |
| Billing SaaS | \`customer_ref\` | Only billing address, currency per customer |
| Support tool | email | Individuals only |

Two camps in the architecture team:
- **Camp A:** "Define one enterprise Canonical Customer model; every API speaks it."
- **Camp B:** "Canonical models become huge committee-owned schemas nobody can change. Pass system data through as it is and map at the edges."

Constraints: 12 integration flows exist today, 25 more planned; three delivery teams; the enterprise data team has no capacity to own a global model.

Load: the mobile app looks up about **60 customers a second** and the partner portal about **20**. A full customer view reads all four systems. SAP answers in about 800 ms, Salesforce, billing and support in about 300 ms. A lookup must take under **1.2 s** on average, and still answer when one source such as the support tool is down. The budget for the APIs is **2 vCores**.

**Questions:**
- What are the real benefits and costs of a canonical model?
- What is the problem with pure pass-through in API-led connectivity?
- What would you recommend for this company, and at which API layer does each model live?
- How would you govern and version the shared model?
`,
  answerTemplate: `## Benefits and costs of a canonical model

## Risks of pass-through

## Recommendation per layer

## Governance and versioning
`,
  keyPoints: [
    'A canonical model reduces point-to-point mappings (N×M → N+M) and decouples consumers from system-specific fields and keys.',
    'An enterprise-wide canonical model tends to grow into a bloated, slow-to-change schema with optional fields that mean different things to different teams.',
    'Pure pass-through leaks system details (SAP field names, IDs) into consumers, so replacing a backend breaks every consumer.',
    'A pragmatic approach is a domain (bounded-context) model owned by the Process API of that domain. System APIs expose a cleaned version of each system, and Experience APIs shape for the channel.',
    'Cross-reference of identifiers (SAP KUNNR ↔ Salesforce Id ↔ customer_ref) is needed regardless and should be owned explicitly (e.g. an MDM or cross-reference service).',
    'Shared models are published as versioned fragments/types in Exchange with additive, backward-compatible change rules.',
    'The Customer Process API that owns the domain model reads the four System APIs in parallel (about 870 ms, not 1.8 s one after another) and gives a partial answer when one source is down, with 0.5 vCore for itself and 0.2 for each System API.',
  ],
  solution: `
**Canonical model: benefits.**
- With N producers and M consumers, mapping through a common model needs N+M mappings rather than N×M.
- Consumers do not see \`KUNNR\` or SAP partner functions; replacing the billing SaaS affects only its System API mapping.
- Shared vocabulary for events and APIs.

**Costs.**
- Agreeing one "Customer" for B2B accounts, individuals and billing entities is slow and political.
- The model grows to the union of all fields, most optional, semantics unclear.
- Every change needs coordination; teams start bypassing it.

**Pass-through problems.** If the Experience API returns SAP fields, the mobile app is coupled to SAP. Swapping SAP for S/4 or another ERP means changing every consumer. It also pushes mapping logic into many consumers, duplicating it.

**Recommendation: "canonical per domain, not per enterprise".**
- **System APIs:** expose each system's data in a cleaned, documented form close to the source (readable names, standard date/currency formats), but still system-shaped. Do not force a global model here.
- **Process API (Customer domain):** owns the **Customer domain model**: a bounded-context model of what "customer" means for this company's processes, with a stable \`customerId\` and a cross-reference to system keys.
- **Experience APIs:** shape the domain model for each channel (mobile needs 8 fields, partner portal 20).
- **Events:** use the domain model for business events (CustomerUpdated), so consumers do not depend on the source system.
- **Identifiers:** a cross-reference store/MDM maps \`customerId\` ↔ KUNNR ↔ Account Id ↔ customer_ref.

**Sizing and failure handling.** Building the domain model means one call to each of the four System APIs per lookup. One after another that is about 1.8 s; the Customer Process API makes them **in parallel** (Scatter-Gather), so a lookup takes about as long as SAP, around 870 ms. It has a 3 s timeout for its calls and gives a **partial answer** when one source fails: with the support tool down, customers still get the SAP, Salesforce and billing data. At 80 lookups a second the Process API gets 0.5 vCore, the mobile Experience API and each System API 0.2, and the partner Experience API 0.1. That is 1.6 vCores, inside the 2 vCore budget.

**Governance and versioning.**
- Publish the domain types as a RAML library / JSON Schema / OAS component in **Exchange**, owned by the Customer domain team.
- Rules: additive changes are minor versions; removing/renaming fields is a major version with a deprecation period.
- Keep it **lean**: add a field when a real consumer needs it, not on a guess about future needs.
`,
  followUps: [
    { q: 'Is a canonical model required by API-led connectivity?', a: 'No. API-led connectivity defines layers and reuse; it does not mandate an enterprise canonical model. Many teams use domain-level models at the Process layer instead.' },
    { q: 'How do you handle a field that only one system has, e.g. SAP credit block?', a: 'If it is meaningful to the business process, add it to the domain model with a business name (creditBlocked) and documented semantics; if it is purely technical, keep it inside the System API.' },
    { q: 'Where does MDM fit?', a: 'MDM decides the golden record and owns cross-references; MuleSoft APIs then read from or publish to MDM rather than reimplementing matching and survivorship rules in flows.' },
  ],
}
