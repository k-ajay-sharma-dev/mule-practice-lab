export default {
  id: 'ar-066',
  category: 'architecture',
  title: 'Arguing Against API-led: Right-Sizing for a Small Team',
  level: 'EXPERT',
  tags: ['api-led', 'trade-offs', 'over-engineering', 'right-sizing', 'interview-strategy'],
  estMinutes: 35,
  quiz: [
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Why is full three-layer API-led (36 APIs) weak value for this team?',
      options: [
        'MuleSoft does not support Shopify',
        'Costs multiply (specs, instances, pipelines, apps, vCores) while the main benefits — reuse by many consumers and decoupling across teams — are small with one team and few consumers',
        'API-led only works for companies above 1,000 people',
        'Syncs cannot be built in Mule',
      ],
      answer: 1,
      explain: 'Four developers would each own ~9 apps, and most Process/Experience APIs would have exactly one caller.',
    },
    {
      type: 'multi',
      prompt: 'A 4-developer integration team runs about 12 integrations, mostly nightly syncs, with one external partner. It will not build all three API-led layers. Which two APIs are still worth building?',
      options: [
        'A System API for a backend that several integrations share',
        'A partner API with client-id enforcement for the external partner',
        'An Experience API for each nightly sync job',
        'A Process API for each integration, even with a single caller',
        'A System API for a backend that only one integration uses',
      ],
      answer: [0, 1],
      explain: 'Shared systems and external consumers justify an API, even for one partner. Batch syncs have no channel and gain nothing from extra hops, and a System API with a single consumer is premature. Apply the principles proportionately: keep connectivity, orchestration and mapping in separate flows or modules inside each app, and use one project template, one error contract and one logging standard.',
    },
    {
      type: 'single',
      prompt: 'Shopify and Postgres are accessed directly via connectors inside a process app. Is that acceptable?',
      options: [
        'No — every backend must always have a System API',
        'Yes, as a documented trade-off: connectivity code is isolated in its own flows/modules, so extracting a System API later is a small refactor',
        'Yes, and no documentation is needed',
        'Only for Postgres',
      ],
      answer: 1,
      explain: 'With a single consumer, a System API now is premature; isolating the code keeps the door open. Record it in an ADR with the triggers to revisit.',
    },
    {
      type: 'multi',
      needsScenario: true,
      prompt: 'Which signals would tell you to grow towards fuller API-led?',
      options: [
        'A second and third consumer for the same data',
        'A second team starts building integrations',
        'A backend replacement on the roadmap (e.g. NetSuite → another ERP)',
        'The same business logic duplicated in two sync apps',
        'One sync job getting slightly slower',
        'The monthly vCore bill going down',
      ],
      answer: [0, 1, 2, 3],
      explain: 'New consumers, new teams, backend replacements and duplicated logic are exactly the situations where layers pay for themselves.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'How do you frame this answer in the interview?',
      options: [
        '"API-led is pointless for small teams."',
        '"Always three layers — that is the MuleSoft way."',
        '"API-led is a set of principles applied proportionately; the layers are a logical model, not a quota of deployables" — then give a right-sized design and growth triggers',
        'Avoid the question and talk about DataWeave',
      ],
      answer: 2,
      explain: 'The devil\'s-advocate question tests judgement: show you know both the value and the costs, and avoid both dogma and dismissal.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'What is the minimum governance you would keep?',
      options: [
        'None — the team is small',
        'Specs for anything consumed outside the team, client-id enforcement on exposed APIs, one project template with error handling and logging, naming conventions, and ADRs for layering decisions',
        'A full C4E with weekly design boards',
        'Only a naming convention',
      ],
      answer: 1,
      explain: 'Cheap, high-value guardrails keep the estate consistent and make it easy to grow later.',
    },
  ],
  description: `
A senior interviewer plays devil's advocate:

> "We're a 4-developer integration team at a 300-person company. We have Salesforce, NetSuite, a Postgres-based warehouse app and Shopify — about 12 integrations, mostly syncs. A consultant proposed 3 layers × 12 integrations = 36 APIs. **Convince me we shouldn't do API-led** — or tell me how you'd right-size it."

Constraints: limited vCores/capacity, no C4E, one team owns everything, only one external consumer (a 3PL partner).

**Questions:**
1. What are the genuine **costs** of full API-led for this team? Quantify where you can.
2. Where does API-led **still** add value here?
3. Propose a **right-sized** architecture: which layers, how many apps, which shortcuts are acceptable.
4. What signals would tell you to **grow** toward fuller API-led later?
5. How do you present this in an interview without sounding like you don't "believe in" API-led?
`,
  answerTemplate: `## Costs of full API-led here

## Where it still adds value

## Right-sized architecture

## Signals to grow

## Interview framing
`,
  keyPoints: [
    'Full three-layer API-led for 12 mostly-sync integrations multiplies apps, deployments, specs, policies and runtime cost for a single team with little reuse demand. The benefits (decoupling across teams, reuse by many consumers) are weakest here.',
    'API-led still pays off for systems used by several integrations (a System API per core SaaS) and for the single external consumer (an Experience API/gateway boundary).',
    'Right-size: System APIs only where reused, sync jobs as Process-layer apps calling connectors or System APIs, one partner-facing API, co-located deployments, shared templates — keep logical layering in code even when physically merged.',
    'Grow when there are new channels/consumers, more teams, a backend replacement on the roadmap, duplicated logic appearing, or external consumers multiplying.',
    'Frame it as "API-led is a set of principles applied proportionately" — show judgement, not rejection.',
  ],
  solution: `
**Costs of full API-led here.**
- **36 APIs** = 36 specs, 36 API instances (× environments), 36 pipelines, 36 apps to patch on runtime upgrades. For 4 developers that is roughly 9 apps each to own.
- **Runtime cost:** 36 apps × even 1 replica at a small fractional size is a significant vCore/capacity bill; with 2 replicas for HA it doubles. Each Mule app has a fixed baseline footprint regardless of traffic.
- **Latency/complexity:** batch syncs gain nothing from 2 extra HTTP hops; record-by-record REST calls through layers can be far slower than bulk connector operations.
- **Reuse is limited:** one team, few consumers. Reuse value comes from *other* consumers; here, most Process and Experience APIs would have exactly one caller.
- **Governance overhead** with no C4E to run it.

**Where API-led still adds value.**
- **System APIs for the most-shared systems:** if Salesforce and NetSuite are each touched by 5+ integrations, use one System API (or at least one shared connector config + DataWeave module). It avoids repeating auth, mapping and API-limit handling.
- **The 3PL partner:** an explicit Experience/partner API with client-id enforcement and rate limiting decouples an external party from internal systems — worth it even for one consumer.
- **Contracts and Exchange** for anything consumed by another team (e.g. the e-commerce team).
- **Principles** cost nothing: separate connectivity code from business logic from consumer shaping, inside the code base.

**Right-sized architecture.**
\`\`\`
3PL partner -> [partner-api]  (1 app: spec, client-id, rate limit)
                    |
             [order-sync-app]  [customer-sync-app]  [finance-sync-app]   <- "process" apps (schedulers/listeners)
                 |     \\           |                     |
          [sys-salesforce-api]  [sys-netsuite-api]   (only where 3+ integrations share the system)
           Shopify / Postgres accessed directly via connectors inside process apps (single use)
\`\`\`
- ~6–8 apps instead of 36; low-traffic apps on small sizes; non-critical syncs on 1 replica.
- Inside each app, keep **logical layers**: separate flows/files for connectivity (system), orchestration (process) and output mapping (experience); shared DataWeave and error-handling modules. Splitting later is then a refactor, not a rewrite.
- One project template, one error contract, one logging standard — cheap and valuable.
- Document the decision in an **ADR** with the triggers for revisiting.

**Signals to grow.**
- A second and third consumer for the same data (mobile app, another partner, analytics).
- A second team starts building integrations → reuse and contracts start to matter.
- A backend replacement on the roadmap (NetSuite → another ERP) → System APIs pay for themselves.
- Duplicated business logic found in 2+ sync apps → extract a Process API.
- Partner/external consumers multiplying → formal Experience layer and SLA tiers.

**Interview framing.**
- Open with: "API-led is a set of principles — decouple systems, compose logic, shape for consumers — applied proportionately. The three layers are a logical model, not a quota of deployables."
- Show you know its value (application network, reuse, change isolation) **and** its costs (hops, apps, governance).
- Give a concrete right-sized design and explicit **growth triggers** — that demonstrates architectural judgement, which is what the devil's-advocate question tests.
- Avoid both extremes: "always three layers" (dogma) and "API-led is pointless" (dismissive).
`,
  followUps: [
    { q: 'Isn\'t calling Shopify directly from a process app technical debt?', a: 'It is a deliberate, documented trade-off. Because connectivity code is isolated in its own flows/modules, extracting a System API later is a small refactor; paying for it now with no second consumer is premature.' },
    { q: 'How would you explain this to a MuleSoft account team pushing for more APIs?', a: 'Focus on outcomes: delivery speed, cost and reliability for this team. A right-sized estate that grows with demand is a healthier long-term platform adoption than a sprawling one the team cannot maintain.' },
    { q: 'What is the minimum governance you would keep?', a: 'Specs for any API consumed outside the team, client-id enforcement on exposed APIs, one project template with standard error handling and logging, naming conventions, and ADRs for layering decisions.' },
  ],
}
