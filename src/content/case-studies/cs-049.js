export default {
  id: 'cs-049',
  category: 'case-studies',
  title: 'Untangling an API-Led Estate That Became a Distributed Monolith',
  level: 'ADVANCED',
  tags: ['api-led', 'distributed-monolith', 'refactoring', 'coupling', 'domain-design'],
  estMinutes: 50,
  quiz: [
    {
      type: 'single',
      prompt: 'What makes this estate a **distributed monolith** rather than an API-led network?',
      options: [
        'It has more than 150 Mule applications',
        'Its applications are deployed separately but are so coupled — synchronous chains, shared leaky models, lockstep releases — that they must change and fail together',
        'It uses the exp-/prc-/sys- naming convention',
        'All applications run on the same Mule runtime version',
      ],
      answer: 1,
      explain: 'The number of apps and the naming are irrelevant. API-led *names* without API-led *properties* — independent change, contained failure — give you a monolith spread over the network.',
    },
    {
      type: 'multi',
      prompt: 'Which causes explain the coupling here?',
      options: [
        'Layers used as a mandatory pipeline: every call goes exp → prc → sys even when a layer adds nothing',
        'Process APIs organised by entity (`prc-customer-api`) instead of business capability',
        'Process-to-Process chains with two call cycles and no dependency-direction rule',
        'System APIs leaking Amdocs field names up to Process and Experience APIs',
        'Using RAML instead of OAS for the API specifications',
        'Deploying the applications to CloudHub instead of on-premises',
      ],
      answer: [0, 1, 2, 3],
      explain: 'Coupling comes from how responsibilities and dependencies are drawn, not from the spec language or the deployment target.',
    },
    {
      type: 'single',
      prompt: 'How do you find the worst coupling with evidence rather than opinion?',
      options: [
        'Count how many applications sit in each layer',
        'Build a runtime dependency graph from correlation IDs/tracing and API Manager contracts, and measure change coupling from git history (which apps always change together)',
        'Survey each team about which APIs they find hardest to change',
        'List the APIs with the most operations in their RAML',
      ],
      answer: 1,
      explain: 'Runtime calls show cycles, fan-in hot spots (`sys-crm-api`) and hop counts per journey; git history shows which apps must change together. Layer counts and opinions do not show coupling.',
    },
    {
      type: 'match',
      prompt: 'Match each symptom to the refactoring that addresses it.',
      pairs: [
        ['`GET /my-account` makes 23 synchronous hops', 'An account read model fed by domain events'],
        ['Process APIs call each other in two cycles', 'Enforce dependency direction and break the cycles'],
        ['Amdocs field names leak into Process APIs', 'A canonical, business-oriented System API contract (anti-corruption layer)'],
        ['A 6-weekly release train for all teams', 'Contract tests and backward-compatible versioning so teams deploy independently'],
      ],
      explain: 'Each fix targets one coupling mechanism: read-time chains, cyclic dependencies, leaky contracts and incompatible changes.',
    },
    {
      type: 'order',
      prompt: 'Order the incremental refactoring plan.',
      items: [
        'Map dependencies, agree domains and owners, set principles and contract tests',
        'Break the cycles; build the my-account read model; add bulkheads and a circuit breaker around `sys-crm-api`',
        'Split `prc-customer-api` into capability APIs behind a facade',
        'Introduce canonical billing contracts (`sys-billing-api` v2) and migrate Process APIs off the Amdocs-shaped v1',
        'End the release train: teams deploy independently with contract tests in each pipeline',
      ],
      explain: 'Measure and agree first, then fix the most painful journey and the cycles. Then split the god API and decouple billing (these two can overlap). Only end the train once compatibility is enforced by tests.',
    },
    {
      type: 'single',
      prompt: '`prc-customer-api` has 60 operations and is changed by 6 teams. What do you do?',
      options: [
        'Publish a v2 with all 60 operations redesigned and ask every consumer to switch on one date',
        'Assign it to one team and make the other five raise tickets',
        'Split it into capability APIs (profile, contact preferences, consent, identity) behind a facade, so consumers keep calling the old endpoints while they migrate gradually',
        'Leave it and add more replicas',
      ],
      answer: 2,
      explain: 'A facade lets the implementation move to owned capability APIs without a big-bang consumer migration. A single team owning a 60-operation bucket just recreates the bottleneck.',
    },
    {
      type: 'multi',
      prompt: 'Which metrics show the refactoring is working?',
      options: [
        'Average number of apps changed per feature',
        'Hops and p95 latency per key journey',
        'Number of call cycles (target 0)',
        'Deployments per team per month outside the release train',
        'Total number of APIs in Exchange',
        'Lines of DataWeave code',
      ],
      answer: [0, 1, 2, 3],
      explain: 'Progress means less coupling: fewer apps per change, shorter chains, no cycles and independent releases. API counts and code size say nothing about coupling.',
    },
  ],
  description: `
**Context.** A telecom operator has run Anypoint Platform for 5 years. It has **180 Mule applications** following API-led naming (exp-/prc-/sys-). Despite this:
- A typical customer-facing feature requires changes in **5–7 applications** and coordinated releases; a "release train" ships every 6 weeks with all teams together.
- \`GET /my-account\` on the mobile app makes **23 synchronous hops** across 11 APIs; p95 is 3.8 s.
- Several Process APIs call **other Process APIs**, which call back to Process APIs in other domains; there are two known call cycles.
- \`prc-customer-api\` has 60 operations and is changed by 6 teams.
- Many System APIs return raw backend structures (e.g. Amdocs field names) and Process APIs depend on them directly; replacing the billing system is planned in 2 years.
- An outage of \`sys-crm-api\` takes down ordering, billing enquiries, the shop and the call centre.

**Your task.** Diagnose why this estate behaves like a distributed monolith, propose how to find the worst coupling, and present a refactoring plan that can run while the business keeps shipping.
`,
  answerTemplate: `## Diagnosis: symptoms and causes

## How you would analyse the estate

## Target principles

## Refactoring plan (phased)

## Keeping delivery going during the change

## How you measure progress
`,
  keyPoints: [
    'Defines a distributed monolith: services deployed separately but so coupled (synchronous chains, shared models, lockstep releases) that they must change and fail together.',
    'Identifies causes: layers used as a mandatory technical pipeline, Process APIs organised by entity rather than business capability, PAPI-to-PAPI chains and cycles, leaky System APIs exposing backend models, no versioning discipline forcing coordinated releases.',
    'Uses data to analyse: dependency graph from tracing/correlation IDs and API Manager contracts, change coupling from git history, and runtime hop counts per user journey.',
    'Target principles: domain-aligned ownership, Process APIs per business capability, System APIs with canonical/stable contracts (anti-corruption), no cycles, events for propagation of state changes, backward-compatible versioning and independent releases.',
    'Incremental plan (strangler style): fix the worst journeys first, break cycles, split the god Process API, introduce read models/caching and events, and decouple System API contracts ahead of the billing replacement.',
    'Measures progress: apps touched per feature, hops per journey, independent deployments per team, blast radius of System API outages.',
  ],
  solution: `
**Diagnosis.** The estate has API-led *names* but not API-led *properties*. Symptoms of a distributed monolith: lockstep releases, long synchronous chains, shared failure domains, and a god service changed by many teams. Causes:

1. **Layers as a mandatory pipeline** — every call goes exp → prc → sys even when a layer adds nothing, adding hops and apps per feature.
2. **Process APIs by entity, not capability** — \`prc-customer-api\` became a shared bucket for anything "customer", owned by nobody.
3. **PAPI → PAPI → PAPI chains and cycles** — no rules on dependency direction within the process layer.
4. **Leaky System APIs** — Amdocs field names flow up to Process and Experience APIs; any backend change ripples upward and the billing replacement would touch everything.
5. **No compatibility discipline** — breaking changes need coordinated releases, hence the release train.
6. **Synchronous everything** — reading data through 23 live hops instead of from appropriate read models.

**Analysis.**
- Build a **runtime dependency graph** from logs/tracing (correlation IDs) and API Manager contracts; overlay call volume and latency. Find cycles and the highest fan-in nodes (\`sys-crm-api\`, \`prc-customer-api\`).
- **Change coupling** from git history and release notes: which apps always change together?
- Per key journey (my-account, order, bill enquiry): hops, apps, latency, and which teams must coordinate.
- Classify each API: *keep*, *merge* (no value as a separate layer), *split* (god API), *redesign contract* (leaky).

**Target principles.**
- Organise around **business domains/capabilities** (customer profile, ordering, billing, product catalogue), each owned by one team that owns its Process and System APIs.
- Dependency direction: Experience → Process → System; Process-to-Process calls only to another domain's published capability, **no cycles**.
- System APIs expose a **stable, business-oriented contract** (anti-corruption layer over Amdocs, CRM); backend-specific structures never leak.
- **Events** for state changes (e.g. \`CustomerUpdated\`, \`OrderStatusChanged\`) so other domains maintain their own read models instead of calling synchronously.
- Backward-compatible evolution and independent releases; layers are skipped or merged when they add no value.

**Refactoring plan (incremental, strangler style).**

\`\`\`
Phase 0 (1-2 months)  Map dependencies, agree domains/owners, set principles & contract tests
Phase 1 (3-6 months)  Break the 2 cycles; my-account: introduce account read model fed by events
                      (23 hops -> ~4), caching for reference data; bulkheads + CB on sys-crm-api
Phase 2 (6-12 months) Split prc-customer-api into capability APIs (profile, contact prefs,
                      consent, identity) behind a facade; consumers migrate gradually
Phase 3 (in parallel) Introduce canonical billing contracts in sys-billing-api (v2),
                      migrate Process APIs off Amdocs-shaped v1 -> billing swap becomes local
Phase 4               End release train: contract tests in each pipeline, teams deploy independently
\`\`\`

Use a **facade** so existing consumers keep calling the old endpoints while the implementation is gradually routed to new capability APIs; retire old operations after migration windows.

**Keeping delivery going.** Allocate ~20–30% of each domain team's capacity to refactoring; attach refactoring to features where possible ("the new roaming add-on goes on the new ordering API"); prioritise by pain (journeys with most incidents/latency, APIs with most coordinated changes).

**Measuring progress.** Average apps changed per feature; hops and p95 per key journey; number of cycles (target 0); deployments per team per month without the train; blast radius (which journeys fail when \`sys-crm-api\` is down); percentage of Process APIs depending only on canonical System API contracts.
`,
  followUps: [
    { q: 'Is calling a Process API from another Process API always wrong?', a: 'No. Composing another domain\'s published capability is fine; the problems are cycles, deep chains and calls into another domain\'s internals. Keep the dependency direction clear and the chains short.' },
    { q: 'How do events reduce coupling here?', a: 'Instead of my-account calling 11 APIs at read time, domains publish state changes and the account domain maintains its own read model. Reads become fast and local, and an outage of one backend no longer blocks the page.' },
    { q: 'Why not rewrite the estate from scratch?', a: 'A big-bang rewrite stops feature delivery and recreates the same problems if the principles are not understood. Incremental refactoring guided by measured pain delivers value continuously and lowers risk.' },
  ],
}
