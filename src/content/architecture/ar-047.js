export default {
  id: 'ar-047',
  category: 'architecture',
  title: 'What API-led Connectivity Is and Why It Exists',
  level: 'BEGINNER',
  tags: ['api-led', 'application-network', 'point-to-point', 'esb', 'fundamentals'],
  estMinutes: 15,
  quiz: [
    {
      type: 'single',
      prompt: 'Which definition of API-led connectivity would you give in an interview?',
      options: [
        'A way of putting all integrations into one central ESB owned by the integration team',
        'Exposing capabilities as reusable, managed APIs in three layers — System (unlock systems of record), Process (compose business logic), Experience (shape data for a consumer)',
        'A rule that every integration must have exactly three deployed apps',
        'Point-to-point integration with REST instead of SOAP',
      ],
      answer: 1,
      explain: 'The key words are **reusable**, **managed** and the three responsibilities. The layers are a design model, not a quota of deployables.',
    },
    {
      type: 'match',
      prompt: 'Match each integration approach to its main weakness.',
      pairs: [
        ['Point-to-point', 'Links grow roughly N×(N−1)/2 and logic is copied per link'],
        ['Centralised ESB hub', 'One team becomes the delivery bottleneck for every project'],
        ['API-led connectivity', 'Extra hops, more deployables and governance effort'],
      ],
      explain: 'The ESB solved the spaghetti technically but not organisationally. API-led keeps central governance but decentralises delivery — at an honest cost in hops and apps.',
    },
    {
      type: 'single',
      prompt: 'The insurer builds a web portal first, then a broker portal. What does the application network mean for the second project?',
      options: [
        'It must rebuild its own integrations to the mainframe and billing',
        'It reuses the Policy System API, Customer System API and Quote Process API and mainly adds a Broker Experience API',
        'It must wait for the central team to add SOAP services',
        'Nothing changes; each project is independent',
      ],
      answer: 1,
      explain: 'Each project leaves reusable assets behind, so later projects get faster — this compounding reuse is the core business argument.',
    },
    {
      type: 'multi',
      prompt: 'Which benefits can you honestly promise the insurer?',
      options: [
        'Faster delivery for subsequent projects through reuse',
        'Backends can be replaced behind System APIs without breaking consumers',
        'Consistent security and monitoring through managed APIs',
        'The first project will be cheaper than a point-to-point build',
        'Three layers add no latency',
      ],
      answer: [0, 1, 2],
      explain: 'The first project is usually slightly more expensive because it builds reusable assets, and every hop has a cost. Promising otherwise undermines credibility.',
    },
    {
      type: 'single',
      prompt: 'An interviewer says: "Isn\'t API-led just an ESB with a new name?" Best reply?',
      options: [
        'Yes, the runtime is the same',
        'The difference is the operating model: APIs are products with contracts, discoverable in Exchange and built by many teams under central governance',
        'No, API-led does not use any middleware',
        'API-led only works on CloudHub',
      ],
      answer: 1,
      explain: 'The runtime can look similar; what changes is ownership, discoverability and self-service reuse.',
    },
    {
      type: 'single',
      prompt: 'Must every integration have all three layers?',
      options: [
        'Yes, always — otherwise it is not API-led',
        'No — the layers are a design guide; skipping one is fine when it adds no value, as long as the decision is deliberate and documented',
        'Only System APIs are optional',
        'Only regulated industries need all three',
      ],
      answer: 1,
      explain: 'Pass-through layers add latency and cost without value. A deliberate, documented skip is good architecture.',
    },
  ],
  description: `
This is the most common opening question in a MuleSoft interview:

> "Explain API-led connectivity. Why would a company use it instead of what they had before?"

Context for your answer — a mid-size insurer today has:

| System | Integrated with |
|---|---|
| Policy admin (mainframe) | CRM, web portal, billing, data warehouse — each via its own custom code |
| CRM (Salesforce) | Policy admin, billing, marketing tool |
| Billing (Oracle DB) | CRM, policy admin, web portal |
| Legacy ESB | Hosts ~60 tightly coupled SOAP "services", owned by one central team |

Every new channel project (e.g. a broker portal) takes 6+ months because each team re-builds integrations to the same backends.

**Questions:**
1. Define API-led connectivity in two or three sentences.
2. Compare it with **point-to-point** integration and a **centralised ESB hub**. What problem does each approach have?
3. What is an **application network**, and how does API-led build one over time?
4. What business benefit would you promise the insurer — and what would you *not* promise?
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
    'The promise is faster delivery through reuse and decoupling of consumers from backends — not zero cost: extra hops, more deployables and governance overhead are real.',
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
| Reuse | Almost none — logic copied per link | Possible but gated by one team | Designed in: Exchange discovery, self-service |
| Delivery speed | Fast for the first link, slows exponentially | Bottleneck: central backlog | Distributed teams, governed centrally |
| Change impact | Change a backend → fix N integrations | Change in hub → regression across all | Change behind a System API → consumers unaffected |

Point-to-point grows roughly as N×(N−1)/2 links. The ESB solved the spaghetti technically but not **organisationally**: one team owns everything, so it becomes the bottleneck. API-led keeps central governance (standards, policies, Exchange) but **decentralises delivery** — the C4E model.

**Application network.** The network of applications, data and devices connected by reusable APIs. Project 1 (web portal) builds Policy SAPI, Customer SAPI and Quote PAPI. Project 2 (broker portal) reuses those and only adds a Broker EAPI — maybe 30–60% less work. Each project leaves assets behind; the network becomes more valuable as it grows. This is the core business argument.

**Benefits and honest limits.**
- Promise: faster delivery for subsequent projects, backends replaceable without breaking consumers, consistent security/monitoring, visibility of what exists.
- Do not promise: that the first project is cheaper (it is usually slightly more expensive — you build reusable assets), or that three layers are free (latency per hop, more deployables, governance effort). Reuse only happens if APIs are designed well and discoverable.
`,
  followUps: [
    { q: 'Isn\'t API-led just an ESB with a new name?', a: 'The runtime can look similar, but the difference is the operating model: APIs are products with contracts, discoverable in Exchange and built by many teams under central governance, rather than services hidden inside one team\'s hub.' },
    { q: 'How would you prove the application network is delivering value?', a: 'Track reuse: number of consumers per API, percentage of new projects consuming existing assets, and delivery time for projects vs the baseline. Without measurement, reuse claims are anecdotal.' },
    { q: 'Do all three layers have to exist for every integration?', a: 'No. The layers are a design guide, not a mandate; skipping a layer is fine when the extra layer adds no value, as long as the decision is deliberate and documented.' },
  ],
}
