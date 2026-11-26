import { diagram } from '../../arch/dsl.js'

const APPS = ['process-api', 'batch-job']
const BACKENDS = ['crm', 'erp', 'saas', 'database', 'oracle-db', 'sql-server', 'external-api', 'pos', 'wms']

export default {
  id: 'ar-066',
  category: 'architecture',
  title: 'Arguing Against API-led: Right-Sizing for a Small Team',
  level: 'EXPERT',
  tags: ['api-led', 'trade-offs', 'over-engineering', 'right-sizing', 'interview-strategy'],
  estMinutes: 40,
  diagram: {
    task: 'draw your right-sized architecture. Show the 3PL partner, its partner API, the sync apps, the System APIs you would keep, and Salesforce, NetSuite, Shopify and the Postgres warehouse app.',
    checks: [
      { label: 'The 3PL partner calls the partner API', rule: { type: 'path', from: 'partner', to: 'experience-api' } },
      { label: 'The partner reaches nothing internal around the partner API', rule: { type: 'no-path', from: 'partner', to: [...APPS, 'system-api', ...BACKENDS], unless: 'experience-api' } },
      { label: 'Only one partner-facing API. The sync jobs get no Experience API', rule: { type: 'node', match: 'experience-api', max: 1 } },
      { label: 'The partner API hands its work to a sync app', rule: { type: 'each', of: 'experience-api', edgeTo: APPS } },
      { label: 'Every sync app works on a System API or a system directly', rule: { type: 'each', of: APPS, edgeTo: ['system-api', ...BACKENDS] } },
      { label: 'A System API is kept only where at least two sync apps share it', rule: { type: 'each', of: 'system-api', edgeFrom: APPS, count: 2 } },
      { label: 'Salesforce is reached only through its System API', rule: { type: 'only-via', target: { type: BACKENDS, label: ['salesforce', 'sfdc'] }, from: 'system-api' } },
      { label: 'NetSuite is reached only through its System API', rule: { type: 'only-via', target: { type: BACKENDS, label: 'netsuite' }, from: 'system-api' } },
      { label: 'All four systems are connected', rule: { type: 'each', of: BACKENDS, min: 4, edgeFrom: [...APPS, 'system-api'] } },
      { label: 'Every System API connects to its system', rule: { type: 'each', of: 'system-api', edgeTo: BACKENDS } },
      { label: 'APIs and apps call each other with sync calls', rule: { type: 'lines', from: ['partner', 'experience-api', ...APPS], to: ['experience-api', ...APPS, 'system-api'], kind: 'sync' } },
      { label: 'Reads and writes to a data store are sync calls', rule: { type: 'lines', to: ['database', 'oracle-db', 'sql-server'], kind: 'sync' } },
    ],
    reference: diagram(
      {
        tpl: ['partner', '3PL partner'],
        papi: ['experience-api', 'partner-api (spec, client-id, rate limit)', { auth: 'client-id', rateLimit: 30 }],
        ord: ['process-api', 'order-sync-app'],
        cus: ['batch-job', 'customer-sync-app'],
        fin: ['batch-job', 'finance-sync-app'],
        ssf: ['system-api', 'sys-salesforce-api (shared)'],
        sns: ['system-api', 'sys-netsuite-api (shared)'],
        sf: ['crm', 'Salesforce'],
        ns: ['erp', 'NetSuite'],
        shop: ['saas', 'Shopify (connector, single use)'],
        pg: ['database', 'Postgres warehouse app (connector, single use)'],
      },
      ['tpl -> papi', 'papi -> ord', 'ord -> ssf', 'ord -> sns', 'ord -> shop', 'cus -> ssf', 'cus -> pg', 'fin -> sns', 'ssf -> sf', 'sns -> ns'],
    ),
    simulation: {
      systems: [
        { match: 'crm', latencyMs: 200 },
        { match: 'erp', latencyMs: 300, maxRps: 40 },
        { match: 'saas', latencyMs: 150 },
      ],
      tests: [
        {
          name: 'The 3PL partner at its peak',
          about: 'The 3PL partner sends 20 order updates a second with its client ID, and a misconfigured script sends 2 a second without one. The partner is answered, the script is refused, and the whole estate fits in 1.5 vCores.',
          traffic: [
            { name: '3PL', from: 'partner', rps: 20, to: ['crm', 'erp', 'saas'], kind: 'write' },
            { name: 'no client id', from: 'partner', rps: 2, to: ['crm', 'erp', 'saas'], kind: 'write', auth: 'none' },
          ],
          expect: { answers: [{ flow: '3PL', minSuccess: 0.99 }, { flow: 'no client id', minRefused: 0.99 }], vCores: { max: 1.5 } },
        },
        {
          name: 'The partner floods the API',
          about: 'A retry loop at the 3PL sends 150 requests a second for three minutes. The rate limit on the partner API answers 429 to what is over it, so NetSuite never sees more than its 40 calls a second.',
          traffic: [{ name: '3PL', from: 'partner', rps: 15, to: ['crm', 'erp', 'saas'], kind: 'write', spikes: [{ at: 3, forMin: 3, rps: 150 }] }],
          expect: { answers: [{ minLimited: 0.4 }], peakRps: [{ node: 'erp', max: 40 }] },
        },
      ],
    },
  },
  quiz: [
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Why is full three-layer API-led (36 APIs) weak value for this team?',
      options: [
        'API-led needs a C4E in place before any layer can be built',
        'Costs grow with every app, while reuse and cross-team decoupling stay small',
        'Three hops make each 3PL update slower than the partner allows',
        'Nightly batch syncs cannot be exposed through REST APIs in Mule',
      ],
      answer: 1,
      explain: 'Specs, API instances, pipelines, apps and vCores all multiply. Four developers would each own about 9 apps, and most Process and Experience APIs would have exactly one caller.',
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
        'No: a connector inside a process app breaks the API-led layering',
        'Yes, if the connector code sits in its own flows and the choice is recorded',
        'Yes, and no record is needed, since only one app uses them',
        'Only if the connector calls are wrapped in a Process API first',
      ],
      answer: 1,
      explain: 'With a single consumer, a System API now is premature. Isolating the connectivity code keeps extraction later a small refactor. Record the trade-off in an ADR with the triggers to revisit.',
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
        'A sync job that starts to need retries and a dead letter queue',
        'The nightly volume of one sync doubling after a sales campaign',
      ],
      answer: [0, 1, 2, 3],
      explain: 'New consumers, new teams, backend replacements and duplicated logic are exactly the situations where layers pay for themselves.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'How do you frame this answer in the interview?',
      options: [
        '"API-led does not pay off for small teams, so we skip it."',
        '"Keep the three layers, because that is the standard MuleSoft way."',
        '"API-led is principles applied in proportion; layers are logical, not an app quota."',
        '"Build the 36 APIs now, so no rework is needed later."',
      ],
      answer: 2,
      explain: 'The devil\'s-advocate question tests judgement: show you know both the value and the costs, avoid both dogma and dismissal, then give a right-sized design and growth triggers.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'What is the minimum governance you would keep?',
      options: [
        'None beyond code review, since one small team owns every app',
        'Specs for exposed APIs, client-id, one project template, naming rules, ADRs',
        'A full C4E with weekly design boards and a three-layer review checklist',
        'App naming rules and a shared logger, with no API specs or ADRs',
      ],
      answer: 1,
      explain: 'Cheap, high-value guardrails keep the estate consistent and make growing later less work. The template carries standard error handling and logging.',
    },
  ],
  description: `
A senior interviewer plays devil's advocate:

> "We're a 4-developer integration team at a 300-person company. We have Salesforce, NetSuite, a Postgres-based warehouse app and Shopify, about 12 integrations, mostly syncs. A consultant proposed 3 layers × 12 integrations = 36 APIs. **Convince me we shouldn't do API-led**, or tell me how you'd right-size it."

Constraints: limited vCores/capacity, no C4E, one team owns everything, only one external consumer (a 3PL partner).

The 12 integrations group into three sync apps:
- **Order sync** takes the 3PL order updates and works on Salesforce, NetSuite and Shopify.
- **Customer sync** works on Salesforce and the Postgres warehouse app.
- **Finance sync** works on NetSuite.

The team wants a System API only for a system that more than one sync app uses.

Numbers:
- The 3PL partner sends up to **20 order updates a second**. Each one touches Salesforce, NetSuite and Shopify. A retry loop on its side has sent **150 a second** before.
- NetSuite allows about **40 calls a second** for the integration and answers in about 300 ms.
- The budget for the whole estate is **1.5 vCores**.

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
    'Right-size: System APIs only where reused, sync jobs as Process-layer apps calling connectors or System APIs, one partner-facing API, co-located deployments, shared templates. Keep logical layering in code even when physically merged.',
    'Grow when there are new channels/consumers, more teams, a backend replacement on the roadmap, duplicated logic appearing, or external consumers multiplying.',
    'Frame it as "API-led is a set of principles applied proportionately". Show judgement, not rejection.',
    'The one partner API carries the policies that matter: client-id enforcement and a rate limit of 30 a second, which keeps a misbehaving partner from flooding NetSuite. Six small apps at 0.1 vCore fit the budget with room to spare.',
  ],
  solution: `
**Costs of full API-led here.**
- **36 APIs** = 36 specs, 36 API instances (× environments), 36 pipelines, 36 apps to patch on runtime upgrades. For 4 developers that is roughly 9 apps each to own.
- **Runtime cost:** 36 apps × even 1 replica at a small fractional size is a significant vCore/capacity bill; with 2 replicas for HA it doubles. Each Mule app has a fixed baseline footprint regardless of traffic.
- **Latency/complexity:** batch syncs gain nothing from 2 extra HTTP hops; record-by-record REST calls through layers can be far slower than bulk connector operations.
- **Reuse is limited:** one team, few consumers. Reuse value comes from *other* consumers; here, most Process and Experience APIs would have exactly one caller.
- **Governance overhead** with no C4E to run it.

**Where API-led still adds value.**
- **System APIs for the shared systems:** Salesforce and NetSuite are each used by two sync apps, so each gets one System API. It avoids repeating auth, mapping and API-limit handling.
- **The 3PL partner:** an explicit Experience/partner API with client-id enforcement and rate limiting decouples an external party from internal systems. It is worth it even for one consumer.
- **Contracts and Exchange** for anything consumed by another team (e.g. the e-commerce team).
- **Principles** cost nothing: separate connectivity code from business logic from consumer shaping, inside the code base.

**Right-sized architecture.**
\`\`\`
3PL partner -> [partner-api]  (1 app: spec, client-id, rate limit)
                    |
             [order-sync-app]  [customer-sync-app]  [finance-sync-app]   <- "process" apps (schedulers/listeners)
                 |     \\           |                     |
          [sys-salesforce-api]  [sys-netsuite-api]   (only where two or more sync apps share the system)
           Shopify / Postgres accessed directly via connectors inside process apps (single use)
\`\`\`
- 6 apps instead of 36; low-traffic apps on small sizes; non-critical syncs on 1 replica.
- Inside each app, keep **logical layers**: separate flows/files for connectivity (system), orchestration (process) and output mapping (experience); shared DataWeave and error-handling modules. Splitting later is then a refactor, not a rewrite.
- One project template, one error contract, one logging standard: cheap and valuable.
- Document the decision in an **ADR** with the triggers for revisiting.
- **Policies on the partner API**: client-id enforcement refuses callers without a registered ID, and a rate limit of **30 a second** answers 429 to the rest of a flood. NetSuite then sees at most 30 of its 40 calls a second, even when the 3PL retries in a loop.
- **Sizing**: at these volumes every app runs on one 0.1 vCore replica, 0.6 vCores for the six apps. The consultant's 36 apps would need 3.6 vCores at the same size before any traffic.

**Signals to grow.**
- A second and third consumer for the same data (mobile app, another partner, analytics).
- A second team starts building integrations → reuse and contracts start to matter.
- A backend replacement on the roadmap (NetSuite → another ERP) → System APIs pay for themselves.
- Duplicated business logic found in 2+ sync apps → extract a Process API.
- Partner/external consumers multiplying → formal Experience layer and SLA tiers.

**Interview framing.**
- Open with: "API-led is a set of principles (decouple systems, compose logic, shape for consumers) applied proportionately. The three layers are a logical model, not a quota of deployables."
- Show you know its value (application network, reuse, change isolation) **and** its costs (hops, apps, governance).
- Give a concrete right-sized design and explicit **growth triggers**. That demonstrates architectural judgement, which is what the devil's-advocate question tests.
- Avoid both extremes: "always three layers" (dogma) and "API-led is pointless" (dismissive).
`,
  followUps: [
    { q: 'Isn\'t calling Shopify directly from a process app technical debt?', a: 'It is a deliberate, documented trade-off. Because connectivity code is isolated in its own flows/modules, extracting a System API later is a small refactor; paying for it now with no second consumer is premature.' },
    { q: 'How would you explain this to a MuleSoft account team pushing for more APIs?', a: 'Focus on outcomes: delivery speed, cost and reliability for this team. A right-sized estate that grows with demand is a healthier long-term platform adoption than a sprawling one the team cannot maintain.' },
    { q: 'What is the minimum governance you would keep?', a: 'Specs for any API consumed outside the team, client-id enforcement on exposed APIs, one project template with standard error handling and logging, naming conventions, and ADRs for layering decisions.' },
  ],
}
