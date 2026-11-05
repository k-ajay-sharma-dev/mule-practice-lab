export default {
  id: 'ar-031',
  category: 'architecture',
  title: 'Canonical Data Model vs Pass-Through',
  level: 'INTERMEDIATE',
  tags: ['canonical-model', 'data-modeling', 'bounded-context', 'api-led'],
  estMinutes: 25,
  quiz: [
    {
      type: 'single',
      prompt: 'With 4 source systems and 6 consumers, how many mappings does a common model need compared with point-to-point?',
      options: [
        '10 instead of 24 (N + M instead of N × M)',
        '24 instead of 10',
        '4 in both cases',
        'It makes no difference',
      ],
      answer: 0,
      explain: 'Each system and each consumer maps once to the shared model, instead of every pair having its own mapping.',
    },
    {
      type: 'multi',
      prompt: 'What are the real costs of one enterprise-wide Canonical Customer?',
      options: [
        'Agreeing one definition for B2B accounts, individuals and billing entities is slow and political',
        'The model grows to the union of all fields, mostly optional, with unclear semantics',
        'Every change needs cross-team coordination, so teams start bypassing it',
        'It makes replacing a backend impossible',
      ],
      answer: [0, 1, 2],
      explain: 'A shared model actually makes backend replacement easier. Its costs are governance and bloat, especially with no data team to own it.',
    },
    {
      type: 'single',
      prompt: 'The Experience API returns SAP fields such as KUNNR and partner functions as they are. What is the risk?',
      options: [
        'The response is too small',
        'Consumers become coupled to SAP, so replacing SAP breaks every consumer and mapping logic is duplicated in each one',
        'SAP fields cannot be serialised to JSON',
        'There is no risk if it is documented',
      ],
      answer: 1,
      explain: 'Pass-through leaks system details upward; the whole point of the layers is that a backend change stops at its System API.',
    },
    {
      type: 'match',
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
      prompt: 'How are KUNNR, the Salesforce Account Id and customer_ref linked to one customer?',
      options: [
        'Each consumer keeps its own mapping table',
        'A cross-reference store/MDM maps customerId to every system key, owned explicitly',
        'By matching on customer name at runtime',
        'They cannot be linked',
      ],
      answer: 1,
      explain: 'The cross-reference is needed whichever model you choose; owning it explicitly avoids each flow inventing its own.',
    },
    {
      type: 'single',
      prompt: 'The billing team wants to rename a field in the published Customer domain type. How is that handled?',
      options: [
        'Rename it in place as a minor version',
        'It is a breaking change: new major version with a deprecation period; additive changes would be minor versions',
        'Rename it silently; consumers will notice',
        'Create a second Customer type with the new name',
      ],
      answer: 1,
      explain: 'Removing or renaming fields breaks consumers. Publish the type in Exchange with semantic versioning and keep it lean.',
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
- **Camp B:** "Canonical models become huge committee-owned schemas nobody can change. Just pass system data through and map at the edges."

Constraints: 12 integration flows exist today, 25 more planned; three delivery teams; the enterprise data team has no capacity to own a global model.

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
  ],
  solution: `
**Canonical model — benefits.**
- With N producers and M consumers, mapping through a common model needs N+M mappings rather than N×M.
- Consumers do not see \`KUNNR\` or SAP partner functions; replacing the billing SaaS affects only its System API mapping.
- Shared vocabulary for events and APIs.

**Costs.**
- Agreeing one "Customer" for B2B accounts, individuals and billing entities is slow and political.
- The model grows to the union of all fields, most optional, semantics unclear.
- Every change needs coordination; teams start bypassing it.

**Pass-through problems.** If the Experience API returns SAP fields, the mobile app is coupled to SAP. Swapping SAP for S/4 or another ERP means changing every consumer. It also pushes mapping logic into many consumers, duplicating it.

**Recommendation — "canonical per domain, not per enterprise".**
- **System APIs:** expose each system's data in a cleaned, documented form close to the source (readable names, standard date/currency formats) — but still system-shaped. Do not force a global model here.
- **Process API (Customer domain):** owns the **Customer domain model** — a bounded-context model of what "customer" means for this company's processes, with a stable \`customerId\` and a cross-reference to system keys.
- **Experience APIs:** shape the domain model for each channel (mobile needs 8 fields, partner portal 20).
- **Events:** use the domain model for business events (CustomerUpdated), so consumers do not depend on the source system.
- **Identifiers:** a cross-reference store/MDM maps \`customerId\` ↔ KUNNR ↔ Account Id ↔ customer_ref.

**Governance and versioning.**
- Publish the domain types as a RAML library / JSON Schema / OAS component in **Exchange**, owned by the Customer domain team.
- Rules: additive changes are minor versions; removing/renaming fields is a major version with a deprecation period.
- Keep it **lean**: add a field when a real consumer needs it, not "just in case".
`,
  followUps: [
    { q: 'Is a canonical model required by API-led connectivity?', a: 'No. API-led connectivity defines layers and reuse; it does not mandate an enterprise canonical model. Many teams use domain-level models at the Process layer instead.' },
    { q: 'How do you handle a field that only one system has, e.g. SAP credit block?', a: 'If it is meaningful to the business process, add it to the domain model with a business name (creditBlocked) and documented semantics; if it is purely technical, keep it inside the System API.' },
    { q: 'Where does MDM fit?', a: 'MDM decides the golden record and owns cross-references; MuleSoft APIs then read from or publish to MDM rather than reimplementing matching and survivorship rules in flows.' },
  ],
}
