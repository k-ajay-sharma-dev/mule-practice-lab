export default {
  id: 'ms-047',
  category: 'mulesoft',
  title: 'Design-First API Lifecycle: From Design Center to Monitoring for a New System API',
  level: 'BEGINNER',
  tags: ['api-led', 'api-lifecycle', 'design-center', 'exchange', 'api-manager', 'runtime-manager'],
  estMinutes: 15,
  quiz: [
    {
      type: 'order',
      prompt: 'Put the design-first lifecycle stages for the Customers System API in order.',
      items: [
        'Design the contract in Design Center (API Designer)',
        'Publish the spec to Exchange',
        'Scaffold and implement with Studio / Code Builder + APIkit',
        'Create the API instance and apply policies in API Manager',
        'Deploy and operate with Runtime Manager',
        'Observe with Anypoint Monitoring',
      ],
      explain: 'The spec is designed and shared first; everything later — scaffolding, the API instance, docs — is driven from it.',
    },
    {
      type: 'match',
      prompt: 'Match each task to the Anypoint component.',
      pairs: [
        ['Try the spec with the mocking service before any code exists', 'Design Center'],
        ['Discover and reuse the published spec', 'Exchange'],
        ['Apply client ID enforcement and approve contracts', 'API Manager'],
        ['Scale replicas and set deployment properties', 'Runtime Manager'],
      ],
      explain: 'Each stage has a home in the platform; the Exchange asset links them.',
    },
    {
      type: 'single',
      prompt: 'What is the central artefact handed from one stage to the next?',
      options: [
        'The Studio project folder',
        'The API specification as a versioned Exchange asset',
        'The deployable JAR',
        'The API Manager policy list',
      ],
      answer: 1,
      explain: 'From the spec come the scaffolded project, the API instance and the consumer docs. The JAR and API instance ID come later.',
    },
    {
      type: 'single',
      prompt: 'Why is design-first especially valuable for the Process API team that will consume this System API?',
      options: [
        'It makes the System API faster at runtime',
        'With the contract and a mock in Exchange, they can start immediately instead of waiting for the CRM integration',
        'It removes the need for MUnit tests',
        'It lets them skip API Manager',
      ],
      answer: 1,
      explain: 'Feedback on names, types and paging happens when it is cheap, and layers can be built in parallel.',
    },
    {
      type: 'single',
      prompt: 'Can you create an API instance in API Manager before the implementation exists?',
      options: [
        'No, an app with autodiscovery must be deployed first',
        'Yes — it is created from the Exchange asset, so policies and SLA tiers can be configured early',
        'Only for proxies',
        'Only in the Sandbox environment',
      ],
      answer: 1,
      explain: 'The instance simply has no runtime connected until an app with autodiscovery (or a proxy) is deployed.',
    },
    {
      type: 'single',
      prompt: 'The spec moves from 1.0.0 to 1.1.0. What happens to consumers on 1.0.x?',
      options: [
        'They break and must upgrade immediately',
        'They are unaffected, because a minor version must be backward compatible',
        'They are moved to 1.1.0 automatically by Exchange',
        'They lose access until a new contract is approved',
      ],
      answer: 1,
      explain: 'The team re-scaffolds (reviewing the diff), updates the API instance asset version and redeploys; minor changes are additive.',
    },
  ],
  description: `
Your team must build a new **Customers System API** that wraps a legacy CRM database. The architect insists on a **design-first** approach using Anypoint Platform end to end. A new developer asks: "Why can't I just open Studio, build the flows, and deploy?"

| Stage | Anypoint component |
|---|---|
| Design the contract | ? |
| Share / discover / reuse | ? |
| Build the implementation | ? |
| Secure and govern at runtime | ? |
| Deploy and operate | ? |
| Observe | ? |

**Questions**
1. Fill in the table and describe what happens at each stage for this System API.
2. What is the main artefact handed from one stage to the next?
3. Why is design-first especially valuable in API-led connectivity (think about the Process and Experience API teams)?
4. Which stages are repeated when the spec changes from 1.0.0 to 1.1.0?
`,
  answerTemplate: `## Stage-by-stage lifecycle

## The artefacts passed between stages

## Why design-first matters for API-led

## What repeats on a spec change
`,
  keyPoints: [
    'Design Center (API Designer) → Exchange → Anypoint Studio/ACB + APIkit → API Manager → Runtime Manager → Anypoint Monitoring.',
    'The API specification (RAML or OAS) published to Exchange is the contract every later stage is driven from: scaffolding, mocking, API instances, documentation.',
    'Design-first lets consumers (Process/Experience teams) review and mock the contract before a single flow exists, so layers can be built in parallel.',
    'API Manager creates an API instance for the Exchange asset; autodiscovery links the deployed app to that instance so policies apply.',
    'A spec change means: edit in Design Center, publish a new semantic version, re-scaffold in Studio, update the API instance asset version, redeploy.',
  ],
  solution: `
| Stage | Component | For the Customers System API |
|---|---|---|
| Design | **Design Center – API Designer** | Write the RAML/OAS: resources (\`/customers\`, \`/customers/{id}\`), data types, examples, error responses. Use the mocking service to try it. |
| Share | **Anypoint Exchange** | Publish the spec as a REST API asset (e.g. \`customers-sapi\` 1.0.0). It gets generated documentation, an API console and a mock. |
| Build | **Anypoint Studio / Anypoint Code Builder + APIkit** | Import the spec from Exchange, scaffold flows, implement DB access and mappings, write MUnit tests. |
| Manage | **API Manager** | Create an API instance from the Exchange asset in each environment, apply policies (e.g. client ID enforcement, IP allowlist), define SLA tiers, approve client contracts. |
| Deploy/Operate | **Runtime Manager** | Deploy to CloudHub 2.0 / RTF / hybrid, set properties (incl. the API instance ID for autodiscovery), scale replicas, set alerts. |
| Observe | **Anypoint Monitoring** (+ API Manager analytics) | Dashboards, logs, alerts, functional monitors against the deployed endpoint. |

**Artefacts handed on:** the **API specification** (as a versioned Exchange asset) is the central one. From it come the scaffolded project, the API instance in API Manager, and the consumer documentation. Then the **deployable JAR** (built with Maven) and the **API instance ID** that ties the runtime to API Manager via autodiscovery.

**Why design-first matters in API-led**
- The System API is consumed by Process APIs built by other teams. With the contract and a mock in Exchange, those teams can start immediately instead of waiting for the CRM integration.
- Feedback on naming, types and paging happens when it is cheap, before code exists.
- The contract becomes the reusable asset — discoverable in Exchange, which is the whole point of API-led reuse.
- APIkit validates requests against the same contract at runtime, so the spec and the implementation cannot silently drift.

**On a change to 1.1.0:** edit in Design Center → publish 1.1.0 to Exchange → update the dependency in the project and re-scaffold (commit first and review the diff) → implement and test → update the API instance to the new asset version in API Manager → redeploy via Runtime Manager (ideally through CI/CD) → monitoring continues. Consumers on 1.0.x are unaffected because a minor version must be backward compatible.

Building straight in Studio "works", but you lose the reviewable contract, the mock for parallel teams, and the reusable Exchange asset.
`,
  followUps: [
    {
      q: 'Where does Anypoint Code Builder fit compared to Studio?',
      a: 'Anypoint Code Builder is the VS Code-based IDE that can both design specs and implement Mule apps; it fills the same "design and build" stages as Design Center plus Studio.',
    },
    {
      q: 'Can you create an API instance in API Manager before the implementation exists?',
      a: 'Yes. The instance is created from the Exchange asset, so you can configure policies and SLA tiers early; it simply has no runtime connected until an app with autodiscovery (or a proxy) is deployed.',
    },
    {
      q: 'What is the difference between the Exchange version and the API instance version?',
      a: 'The Exchange asset has a full semantic version (1.1.0); the API instance shows the asset version it is bound to plus the API version label from the spec (e.g. v1). Patches and minors can be swapped in without changing the consumer-facing major.',
    },
  ],
}
