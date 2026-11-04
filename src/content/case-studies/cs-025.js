export default {
  id: 'cs-025',
  category: 'case-studies',
  title: 'Global Retailer Meeting Data Residency Requirements Across Regions',
  level: 'EXPERT',
  tags: ['data-residency', 'multi-region', 'control-plane', 'runtime-fabric', 'privacy'],
  estMinutes: 60,
  quiz: [
    {
      type: 'order',
      prompt: 'Order the migration steps.',
      items: [
        'Classify data, inventory every API/flow and agree the per-country legal matrix',
        'Stand up regional runtimes (and an EU control plane/organisation if decided) and extend CI/CD for multi-region config',
        'Migrate data stores and APIs region by region, highest-risk countries first, switching consumers via DNS/gateway',
        'Remove personal data from central stores, with evidence for auditors',
      ],
      explain: 'The legal matrix drives every later decision, so it comes first; the platform must exist before workloads move; central copies are deleted only after migration is proven.',
    },
    {
      type: 'single',
      prompt: 'Which statement about the control plane and runtime plane is correct?',
      options: [
        'Payloads are processed in the runtime plane, so regional runtimes keep personal data in-region — but you must also keep personal data out of what reaches the control plane (logs, analytics, monitoring)',
        'Moving the control plane to the EU automatically makes every runtime compliant',
        'The control plane processes every API request payload',
        'Runtime location does not matter as long as the control plane is regional',
      ],
      answer: 0,
      explain: 'Residency of payload processing is decided by where runtimes run; the control plane holds metadata, analytics and possibly logs, so personal data must not leak into those. A regional control plane alone does not move processing.',
    },
    {
      type: 'single',
      prompt: 'Some countries require in-country processing but have no suitable cloud region. What runtime do you use there?',
      options: [
        'Runtime Fabric or customer-hosted runtimes in-country',
        'CloudHub 2.0 in the nearest other country',
        'The existing US CloudHub workers with encryption',
        'No runtime — call the US APIs over a VPN',
      ],
      answer: 0,
      explain: 'Runtime Fabric (or customer-hosted Mule) lets you process data in-country when no cloud region fits. Encryption or a VPN does not change where the data is processed.',
    },
    {
      type: 'single',
      prompt: 'A loyalty member from the EU shops in an APAC store. How is the visit handled?',
      options: [
        'The visited region calls a global loyalty router with a pseudonymous member token; the home region does the lookup/earn and returns only what is needed (points, tier)',
        'Replicate every loyalty profile to every region nightly',
        'Refuse loyalty for members shopping abroad',
        'Move the member’s full profile to the visited region for the visit',
      ],
      answer: 0,
      explain: 'A minimal, pseudonymised, just-in-time exchange keeps global features working with approved transfers only. Global replication of profiles is exactly the transfer the laws restrict.',
    },
    {
      type: 'multi',
      prompt: 'Where can hidden copies of personal data survive and must be checked?',
      options: [
        'Application logs (e.g. emails and phone numbers)',
        'Caches and Object Stores',
        'Backups and test environments',
        'API analytics custom fields and monitoring dimensions',
        'RAML type definitions in Exchange',
      ],
      answer: [0, 1, 2, 3],
      explain: 'Logs, caches, backups, test copies and analytics/monitoring data can all hold personal data. A RAML type describes the shape of data, not actual customer values.',
    },
    {
      type: 'multi',
      prompt: 'Which governance measures give auditors clear evidence?',
      options: [
        'Residency check as part of API design review',
        'Exchange metadata tags for data classification and region',
        'Automated scans for PII in logs',
        'Data-flow diagrams kept current, with DPO/legal sign-off per cross-region flow',
        'A single verbal approval from the CIO for all flows',
      ],
      answer: [0, 1, 2, 3],
      explain: 'Reviews, tags, automated scans and maintained data-flow documentation create repeatable, auditable evidence. A verbal approval leaves nothing for an auditor to inspect.',
    },
  ],
  description: `
**Context.** A global retailer operates in North America, the EU, and several Asia-Pacific countries. It uses Anypoint Platform with the US control plane and CloudHub workers in a US region. New and existing privacy laws in several countries (keep them generic) require that customer personal data be stored and processed within the country/region, with limited, approved transfers. Logs and monitoring data containing personal data are in scope too.

**Current state**
- Customer, loyalty and order APIs run centrally in the US; EU and APAC stores call them.
- Logs include customer emails and phone numbers in places.
- A central data warehouse in the US receives all customer data.

**Goals**
- Compliance in all regions within 12 months without breaking global features (e.g. a loyalty member shopping abroad).
- Keep one integration practice and as much reuse as possible.
- Clear evidence for auditors about where data flows.

**Constraints**
- Some countries require in-country processing; others allow regional processing.
- Latency-sensitive store checkout must not slow down.
- Budget does not allow a full separate team per region.

**Your task.** Propose the target architecture (control plane, runtime plane, data flows), the migration approach and the governance needed.
`,
  answerTemplate: `## Requirements analysis (what data, where, which flows)

## Control plane and runtime plane decisions

## Regional API and data architecture

## Cross-region use cases (e.g. loyalty abroad)

## Logs, monitoring and metadata

## Migration plan

## Governance, evidence and risks
`,
  keyPoints: [
    'Starts with data classification and a data-flow inventory: which fields are personal data, where they are stored/processed/logged, and the residency rule per country.',
    'Distinguishes control plane (management, metadata, analytics) from runtime plane (where payloads are processed), and chooses per region: e.g. an EU control plane where needed, and regional runtimes (CloudHub 2.0 regions/private spaces or Runtime Fabric in-country).',
    'Personal data is stored and processed in-region by regional System/Process APIs; global APIs handle only non-personal or pseudonymised data.',
    'Cross-region scenarios use minimal, approved transfers (e.g. tokenised IDs, consent-based just-in-time lookups) instead of replicating customer data globally.',
    'Logs and monitoring are checked: personal data masked or removed, log forwarding to regional log stores, and awareness of what the platform\'s telemetry contains.',
    'Governance: residency rules as policies/standards in the API lifecycle, design reviews, automated checks, and auditable documentation of data flows.',
  ],
  solution: `
**Requirements first.** Classify data (personal, sensitive, pseudonymised, non-personal). Inventory every API/flow: data fields, source and target regions, logging. Legal defines rules per country: in-country, in-region, or transfer allowed with safeguards. This produces a matrix that drives design.

**Control plane vs runtime plane.**
- The **control plane** holds API definitions, policies, analytics and, depending on setup, logs and monitoring metadata. MuleSoft offers separate regional control planes (e.g. US and EU); a separate control plane means a separate organisation, so weigh governance overhead. Check current regional offerings with MuleSoft rather than assuming.
- The **runtime plane** is where payloads are processed. Use CloudHub 2.0 in the required cloud regions, and **Runtime Fabric** (or customer-hosted runtimes) in countries without a suitable cloud region or that require in-country hosting.
- Ensure payload data does not flow to the control plane: no personal data in API analytics custom fields, logs or monitoring dimensions.

**Regional architecture.** Per region: \`customers-sapi\`, \`loyalty-sapi\`, \`orders-sapi\` backed by regional data stores, and regional Process APIs. Global layer: product, pricing, inventory and other non-personal APIs remain shared. Store checkout calls its regional APIs → latency usually improves.

**Cross-region use cases.** Loyalty member shopping abroad: the visited region calls a global \`loyalty-router-papi\` with a **pseudonymous member token**; the home region performs the lookup/earn and returns only what is needed (points balance, tier) — no full profile copied. Transfers logged and allowed only where legal rules permit. Data warehouse: regional warehouses or pseudonymised/aggregated feeds to the global one.

**Logs and monitoring.** Masking in DataWeave/logging standards; log forwarding to regional log stores (e.g. per-region SIEM); limit platform log retention where possible; review what Anypoint Monitoring captures.

**Migration.** 1) Classification, inventory, legal matrix. 2) Stand up regional runtimes and (if decided) the EU control plane/organisation; CI/CD extended for multi-region deployments from the same codebase with region-specific config. 3) Migrate data stores and APIs region by region, highest-risk countries first; switch consumers via DNS/API gateway. 4) Remove personal data from central stores after migration, with evidence.

**Governance.** Residency check as part of API design review; Exchange metadata tags for data classification and region; automated scans for PII in logs; data-flow diagrams kept current for auditors; DPO/legal sign-off per cross-region flow.

**Risks.** Hidden copies of personal data (backups, logs, caches, test environments), operating overhead of multiple orgs/control planes, regulations changing (design for per-country configuration), and degraded global features.
`,
  followUps: [
    { q: 'Does moving runtimes to the EU solve residency on its own?', a: 'No. Metadata, logs, analytics and monitoring may still be in the control plane region, and data can leak through logs or central stores. You must check every place payload data can end up, not only where the app runs.' },
    { q: 'One organisation or one per control plane?', a: 'Separate control planes mean separate organisations with duplicated governance, so use them only where regulation demands it; otherwise keep one control plane and regional runtimes, with strict rules against personal data in metadata and logs.' },
    { q: 'How do you give auditors evidence?', a: 'A maintained data-flow inventory linked to Exchange assets, region tags, deployment records showing where each app runs, log-masking test results and legal sign-offs for every cross-region flow.' },
    { q: 'What do you prioritise?', a: 'Countries with in-country requirements and the highest legal exposure first, plus quick wins that reduce risk everywhere (masking personal data in logs) before the bigger re-platforming.' },
  ],
}
