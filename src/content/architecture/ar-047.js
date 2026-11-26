import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-047',
  category: 'architecture',
  title: 'What API-led Connectivity Is and Why It Exists',
  level: 'BEGINNER',
  tags: ['api-led', 'application-network', 'point-to-point', 'esb', 'fundamentals'],
  estMinutes: 25,
  diagram: {
    task: 'draw the application network after the broker portal project. Use a Web portal and a Broker portal, one Experience API for each, one shared Quote Process API, and one System API for each backend: the policy mainframe, the CRM and the billing database.',
    checks: [
      { label: 'Each portal calls its own Experience API', rule: { type: 'each', of: ['web-app', 'partner', 'mobile-app', 'internal-app'], min: 2, edgeTo: 'experience-api', count: 1, max: 1 } },
      { label: 'Each Experience API serves one portal', rule: { type: 'each', of: 'experience-api', min: 2, edgeFrom: ['web-app', 'partner', 'mobile-app', 'internal-app'], count: 1, max: 1 } },
      { label: 'Both Experience APIs reuse one Process API', rule: { type: 'each', of: 'process-api', edgeFrom: 'experience-api', count: 2, some: true } },
      { label: 'Experience APIs never call System APIs directly', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
      { label: 'Every Process API calls System APIs', rule: { type: 'each', of: 'process-api', edgeTo: 'system-api' } },
      { label: 'Every System API is called by a Process API', rule: { type: 'each', of: 'system-api', edgeFrom: 'process-api' } },
      { label: 'Every System API connects to its backend', rule: { type: 'each', of: 'system-api', edgeTo: ['legacy', 'crm', 'database', 'oracle-db', 'sql-server', 'erp', 'saas'] } },
      { label: 'Each backend (mainframe, CRM, billing) has exactly one System API, shared by everyone', rule: { type: 'each', of: ['legacy', 'crm', 'database', 'oracle-db', 'sql-server', 'erp', 'saas'], min: 3, edgeFrom: 'system-api', count: 1, max: 1 } },
      { label: 'Backends are reached only through System APIs', rule: { type: 'only-via', target: ['legacy', 'crm', 'database', 'oracle-db', 'sql-server', 'erp', 'saas'], from: 'system-api' } },
      { label: 'APIs call each other with sync calls', rule: { type: 'lines', from: ['web-app', 'partner', 'mobile-app', 'internal-app', 'experience-api', 'process-api'], to: ['experience-api', 'process-api', 'system-api'], kind: 'sync' } },
      { label: 'Reads and writes to a database are sync calls', rule: { type: 'lines', to: ['database', 'oracle-db', 'sql-server'], kind: 'sync' } },
    ],
    reference: diagram(
      {
        web: ['web-app', 'Web portal'],
        brk: ['partner', 'Broker portal'],
        ew: ['experience-api', 'exp-web-api'],
        eb: ['experience-api', 'exp-broker-api', { vCores: '0.2' }],
        pq: ['process-api', 'prc-quote-api', { vCores: '0.2' }],
        sp: ['system-api', 'sys-policy-api', { vCores: '0.2', rateLimit: 35 }],
        sc: ['system-api', 'sys-customer-api', { vCores: '0.2' }],
        sb: ['system-api', 'sys-billing-api', { vCores: '0.2' }],
        mf: ['legacy', 'Policy admin (mainframe)'],
        crm: ['crm', 'CRM (Salesforce)'],
        bil: ['oracle-db', 'Billing (Oracle DB)'],
      },
      ['web -> ew', 'brk -> eb', 'ew -> pq', 'eb -> pq', 'pq -> sp', 'pq -> sc', 'pq -> sb', 'sp -> mf', 'sc -> crm', 'sb -> bil'],
    ),
    simulation: {
      systems: [
        { match: 'legacy', latencyMs: 400, maxRps: 40 },
        { match: 'crm', latencyMs: 200 },
        { match: 'oracle-db', latencyMs: 50 },
      ],
      tests: [
        {
          name: 'Both portals at peak',
          about: 'The web portal asks for 12 quotes a second and the broker portal for 8. Every quote is answered, the mainframe stays under its 40 calls a second, and the APIs fit in 1.5 vCores.',
          traffic: [
            { name: 'web', from: { type: 'web-app', label: 'web portal' }, rps: 12, to: ['legacy', 'crm', 'oracle-db'] },
            { name: 'broker', from: { type: ['partner', 'web-app', 'internal-app', 'mobile-app'], label: 'broker' }, rps: 8, to: ['legacy', 'crm', 'oracle-db'] },
          ],
          expect: { answers: [{ minSuccess: 0.99 }], peakRps: [{ node: 'legacy', max: 40 }], vCores: { max: 1.5 } },
        },
        {
          name: 'Broker launch spike',
          about: 'On launch day the broker portal sends 60 quotes a second for two minutes. The one shared Policy System API holds the mainframe under 40 calls a second, and most quotes from both portals are still answered.',
          traffic: [
            { name: 'web', from: { type: 'web-app', label: 'web portal' }, rps: 12, to: ['legacy', 'crm', 'oracle-db'] },
            { name: 'broker', from: { type: ['partner', 'web-app', 'internal-app', 'mobile-app'], label: 'broker' }, rps: 8, to: ['legacy', 'crm', 'oracle-db'], spikes: [{ at: 4, forMin: 2, rps: 60 }] },
          ],
          expect: { answers: [{ flow: 'web', minSuccess: 0.8 }, { flow: 'broker', minSuccess: 0.6 }], peakRps: [{ node: 'legacy', max: 40 }] },
        },
      ],
    },
  },
  quiz: [
    {
      type: 'single',
      prompt: 'An insurer has 40 point-to-point integrations, and each new channel builds its own access to the mainframe. The CIO asks what adopting API-led connectivity changes first. Best answer?',
      options: [
        'Deploy three Mule apps for each integration, one per layer',
        'Route all 40 links through one central ESB that the integration team owns',
        'Convert the SOAP links to REST, so all integrations share one style',
        'Expose the mainframe once as a managed System API that later projects reuse',
      ],
      answer: 3,
      explain: 'API-led connectivity builds **reusable**, **managed** APIs with three responsibilities: System APIs unlock systems of record, Process APIs compose business logic, Experience APIs shape data for a consumer. The first gain is exposing a system once and reusing it. A central ESB brings back the bottleneck of one team, REST alone keeps the point-to-point coupling, and the layers are a design model, not a quota of deployables.',
    },
    {
      type: 'match',
      prompt: 'Match each integration approach to its main weakness.',
      pairs: [
        ['Point-to-point', 'Links grow roughly N×(N−1)/2 and logic is copied per link'],
        ['Centralised ESB hub', 'One team becomes the delivery bottleneck for every project'],
        ['API-led connectivity', 'Extra hops, more deployables and governance effort'],
      ],
      explain: 'The ESB solved the spaghetti technically but not organisationally. API-led keeps central governance but decentralises delivery: at an honest cost in hops and apps.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'The insurer builds a web portal first, then a broker portal. What does the application network mean for the second project?',
      options: [
        'It rebuilds its own integrations to the mainframe and billing',
        'It reuses the System APIs and Quote Process API, and adds a Broker Experience API',
        'It waits for the central team to add new SOAP services',
        'It copies the web portal’s APIs and changes them for brokers',
      ],
      answer: 1,
      explain: 'Each project leaves reusable assets behind, so later projects get faster: this compounding reuse is the core business argument.',
    },
    {
      type: 'multi',
      needsScenario: true,
      prompt: 'Which benefits can you honestly promise the insurer?',
      options: [
        'Faster delivery for subsequent projects through reuse',
        'Backends can be replaced behind System APIs without breaking consumers',
        'Consistent security and monitoring through managed APIs',
        'The first project will be cheaper than a point-to-point build',
        'Lower latency than direct point-to-point calls',
      ],
      answer: [0, 1, 2],
      explain: 'The first project is usually slightly more expensive because it builds reusable assets, and every hop has a cost. Promising otherwise undermines credibility.',
    },
    {
      type: 'single',
      prompt: 'An interviewer says: "Isn\'t API-led an ESB with a new name?" Best reply?',
      options: [
        'Yes, the runtime, the hub model and the central team stay the same',
        'No. APIs become products that many teams build and reuse under governance',
        'No, API-led runs on CloudHub, so MuleSoft manages the hub instead',
        'No, API-led swaps the SOAP services for REST and JSON contracts',
      ],
      answer: 1,
      explain: 'The runtime can look similar; what changes is ownership, discoverability and self-service reuse.',
    },
    {
      type: 'single',
      prompt: 'A nightly feed copies settled claims from the existing Claims System API to the finance data warehouse. There are no business rules and no other consumer. A reviewer asks for a Process API and an Experience API as well. What do you decide?',
      options: [
        'Add both layers, since an integration without all three is not API-led',
        'Add a Process API only, since a scheduled feed counts as orchestration',
        'Call the System API from the feed, skip the empty layers, and record why in an ADR',
        'Add both layers now, so the feed is ready when a second consumer arrives',
      ],
      answer: 2,
      explain: 'Pass-through layers add latency and cost without value. A deliberate, documented skip is good architecture, and the ADR says when to revisit it. API-led does not demand three layers per integration, a copy with no rules is not orchestration, and building layers for a consumer that may never come pays the cost now for a benefit you can add later.',
    },
  ],
  description: `
This is the most common opening question in a MuleSoft interview:

> "Explain API-led connectivity. Why would a company use it instead of what they had before?"

Context for your answer: a mid-size insurer today has:

| System | Integrated with |
|---|---|
| Policy admin (mainframe) | CRM, web portal, billing, data warehouse: each via its own custom code |
| CRM (Salesforce) | Policy admin, billing, marketing tool |
| Billing (Oracle DB) | CRM, policy admin, web portal |
| Legacy ESB | Hosts ~60 tightly coupled SOAP "services", owned by one central team |

Every new channel project (e.g. a broker portal) takes 6+ months because each team re-builds integrations to the same backends.

Numbers for the application network after the broker portal project:
- At peak the web portal asks for **12 quotes a second** and the broker portal for **8**. On launch day the broker portal can reach **60 a second** for a few minutes.
- The mainframe takes at most **40 calls a second** and answers in about 400 ms. The CRM answers in about 200 ms and billing in about 50 ms.
- The budget for all the APIs is **1.5 vCores**.

**Questions:**
1. Define API-led connectivity in two or three sentences.
2. Compare it with **point-to-point** integration and a **centralised ESB hub**. What problem does each approach have?
3. What is an **application network**, and how does API-led build one over time?
4. What business benefit would you promise the insurer, and what would you *not* promise?
`,
  answerTemplate: `## Definition

## Point-to-point vs ESB hub vs API-led

## The application network

## Benefits (and honest limits)
`,
  keyPoints: [
    'API-led connectivity organises integration as reusable, purpose-built APIs in three layers: System (unlock systems of record), Process (compose business logic), Experience (shape data for a consumer).',
    'Point-to-point creates N×(N-1) brittle links with duplicated logic; a central ESB hub reduces links but becomes a delivery bottleneck owned by one team with tightly coupled services.',
    'API-led decentralises delivery: APIs are products discoverable in Exchange and governed by policies, so other teams can self-serve and reuse them.',
    'The application network is the growing graph of reusable APIs; each project adds assets so later projects are faster (reuse compounds).',
    'The promise is faster delivery through reuse and decoupling of consumers from backends: not zero cost: extra hops, more deployables and governance overhead are real.',
    'One shared System API per backend is also the one place to protect it: a rate limit of 35 a second on the Policy System API keeps the mainframe under its 40, whichever portal calls.',
  ],
  solution: `
**Definition.** API-led connectivity is MuleSoft's methodical approach to integration where capabilities are exposed as **reusable, managed APIs** grouped into three layers:

- **System APIs** unlock data from systems of record and hide their complexity.
- **Process APIs** compose System APIs into business processes and rules, independent of any channel.
- **Experience APIs** reshape process data for a specific consumer (mobile app, partner, web).

Each API is designed as a **product** (spec-first, documented in Exchange, secured and monitored via API Manager), so it can be found and reused by other teams.

**Comparison.**

\`\`\`
Point-to-point                ESB hub                         API-led
 CRM ─── Policy                CRM   Policy                  Exp:  Web  Mobile  Broker
  │ \\   /  │                     \\   /                               \\    |    /
  │  \\ /   │                    [ ESB ]  <- one team         Proc:   Quote   Claims
  │  / \\   │                     /   \\                               /   |   \\
 Billing ─ Portal              Billing Portal                Sys: Policy  CRM  Billing
\`\`\`

| | Point-to-point | Centralised ESB hub | API-led |
|---|---|---|---|
| Coupling | Every consumer knows every backend's protocol and model | Consumers coupled to hub services, often to backend models | Consumers coupled to stable API contracts |
| Reuse | Almost none: logic copied per link | Possible but gated by one team | Designed in: Exchange discovery, self-service |
| Delivery speed | Fast for the first link, slows exponentially | Bottleneck: central backlog | Distributed teams, governed centrally |
| Change impact | Change a backend → fix N integrations | Change in hub → regression across all | Change behind a System API → consumers unaffected |

Point-to-point grows roughly as N×(N−1)/2 links. The ESB solved the spaghetti technically but not **organisationally**: one team owns everything, so it becomes the bottleneck. API-led keeps central governance (standards, policies, Exchange) but **decentralises delivery**: the C4E model.

**Application network.** The network of applications, data and devices connected by reusable APIs. Project 1 (web portal) builds Policy SAPI, Customer SAPI and Quote PAPI. Project 2 (broker portal) reuses those and only adds a Broker EAPI: maybe 30 to 60% less work. Each project leaves assets behind; the network becomes more valuable as it grows. This is the core business argument.

**Benefits and honest limits.**
- Promise: faster delivery for subsequent projects, backends replaceable without breaking consumers, consistent security/monitoring, visibility of what exists.
- Do not promise: that the first project is cheaper (it is usually slightly more expensive: you build reusable assets), or that three layers are free (latency per hop, more deployables, governance effort). Reuse only happens if APIs are designed well and discoverable.

**Sizing and protecting the mainframe.**
- The shared Quote Process API and the three System APIs carry both portals: 20 quotes a second normally and 72 in the launch spike. 0.2 vCore each serves about 100 a second. The broker Experience API gets 0.2 vCore for its spike, and the web one stays at 0.1. That is 1.1 vCores in all.
- A **rate limit of 35 a second** on the Policy System API answers 429 to what is over it, so the mainframe never sees more than its 40. Without it, the spike sends all 72 to the mainframe. Because every consumer reuses that one System API, the limit covers them all. A second integration to the mainframe would go around it.
`,
  followUps: [
    { q: 'Isn\'t API-led an ESB with a new name?', a: 'The runtime can look similar, but the difference is the operating model: APIs are products with contracts, discoverable in Exchange and built by many teams under central governance, rather than services hidden inside one team\'s hub.' },
    { q: 'How would you prove the application network is delivering value?', a: 'Track reuse: number of consumers per API, percentage of new projects consuming existing assets, and delivery time for projects vs the baseline. Without measurement, reuse claims are anecdotal.' },
    { q: 'Do all three layers have to exist for every integration?', a: 'No. The layers are a design guide, not a mandate; skipping a layer is fine when the extra layer adds no value, as long as the decision is deliberate and documented.' },
  ],
}
