import { diagram } from '../../arch/dsl.js'

const BROKER = ['topic', 'queue', 'event-stream', 'cloud-queue']
const BACKEND = ['legacy', 'database', 'erp', 'saas', 'crm', 'oracle-db', 'sql-server', 'payment']
const APIS = ['experience-api', 'process-api', 'system-api']
const AGG = { type: 'partner', label: 'aggregator' }
const BROKER_PORTAL = { type: ['web-app', 'partner'], label: 'broker' }

export default {
  id: 'ar-028',
  category: 'architecture',
  title: 'REST, SOAP, GraphQL, gRPC or Events for Each Client',
  level: 'BEGINNER',
  tags: ['api-style', 'graphql', 'grpc', 'soap', 'event-driven'],
  estMinutes: 30,
  diagram: {
    task: 'draw one Policy Process API with a thin Experience API facade for each client: REST for the mobile app, SOAP for the broker portal and REST for the partner aggregators. The Process API reads policy, claims and payments through System APIs and publishes PolicyChanged on a topic for the analytics platform.',
    checks: [
      { label: 'The mobile app, the broker portal and the aggregators each call an Experience API facade', rule: { type: 'each', of: ['mobile-app', 'web-app', 'partner'], min: 3, edgeTo: 'experience-api' } },
      { label: 'At least three facades: mobile REST, broker SOAP and partner REST', rule: { type: 'node', match: 'experience-api', min: 3 } },
      { label: 'Every facade calls the Process API', rule: { type: 'each', of: 'experience-api', edgeTo: 'process-api' } },
      { label: 'All three facades share one Process API that owns the logic', rule: { type: 'each', of: 'process-api', edgeFrom: 'experience-api', count: 3, some: true } },
      { label: 'The Process API reads policy, claims and payments through System APIs', rule: { type: 'edge', from: 'process-api', to: 'system-api', min: 3 } },
      { label: 'Every System API connects to its backend', rule: { type: 'each', of: 'system-api', edgeTo: BACKEND } },
      { label: 'Facades never call System APIs directly', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
      { label: 'The Process API publishes PolicyChanged as an async message', rule: { type: 'edge', from: 'process-api', to: BROKER, kind: 'async' } },
      { label: 'PolicyChanged reaches the analytics platform', rule: { type: 'path', from: BROKER, to: 'data-warehouse' } },
      { label: 'No chain of sync calls joins a facade to analytics, so client requests never wait on it', rule: { type: 'no-path', from: 'experience-api', to: 'data-warehouse', kind: 'sync' } },
      { label: 'Clients and APIs call each other with sync calls', rule: { type: 'lines', from: ['mobile-app', 'web-app', 'partner', ...APIS], to: APIS, kind: 'sync' } },
      { label: 'Every line to or from a queue or topic is an async message', rule: { type: 'lines', touching: [...BROKER, 'dlq'], kind: 'async' } },
    ],
    reference: diagram(
      {
        mob: ['mobile-app', 'Mobile app'],
        brk: ['web-app', 'Legacy broker portal (WSDL, WS-Security)'],
        agg: ['partner', 'Partner aggregators'],
        emob: ['experience-api', 'exp-policy-mobile (REST, shaped for the screen)', { vCores: '0.2' }],
        esoap: ['experience-api', 'exp-quote-soap (SOAP facade)'],
        eagg: ['experience-api', 'exp-quotes-partner (REST, spec in Exchange)', { vCores: '0.2', rateLimit: 80 }],
        prc: ['process-api', 'prc-policy-api (owns the logic)', { vCores: '0.5' }],
        spol: ['system-api', 'sys-policy-api', { vCores: '0.5' }],
        sclm: ['system-api', 'sys-claims-api', { vCores: '0.2' }],
        spay: ['system-api', 'sys-payments-api', { vCores: '0.2' }],
        pol: ['legacy', 'Policy system'],
        clm: ['database', 'Claims system'],
        pay: ['erp', 'Payments system'],
        ev: ['topic', 'PolicyChanged'],
        dw: ['data-warehouse', 'Analytics platform'],
      },
      ['mob -> emob', 'brk -> esoap', 'agg -> eagg', 'emob -> prc', 'esoap -> prc', 'eagg -> prc', 'prc -> spol', 'prc -> sclm', 'prc -> spay', 'spol -> pol', 'sclm -> clm', 'spay -> pay', 'prc ~> ev', 'ev ~> dw'],
    ),
    simulation: {
      systems: [
        { match: 'legacy', latencyMs: 200, maxRps: 200 },
        { match: 'database', latencyMs: 100 },
        { match: 'erp', latencyMs: 150 },
        { match: 'data-warehouse', latencyMs: 300 },
      ],
      tests: [
        {
          name: 'Partner aggregators send a burst',
          about: 'The mobile app reads 50 policy summaries a second. The aggregators ask for 60 quotes a second, then 400 for three minutes. The policy system takes at most 200 a second, so the partner facade limits the aggregators and mobile users do not notice.',
          traffic: [
            { name: 'mobile', from: 'mobile-app', rps: 50, to: ['legacy', 'database', 'erp'] },
            { name: 'aggregators', from: AGG, rps: 60, to: 'legacy', spikes: [{ at: 3, forMin: 3, rps: 400 }] },
          ],
          expect: {
            answers: [{ flow: 'mobile', minSuccess: 0.99 }, { flow: 'aggregators', maxFailed: 0.01 }],
            peakRps: [{ node: 'legacy', max: 200 }],
            vCores: { max: 2.5 },
          },
        },
        {
          name: 'Analytics is down',
          about: 'The analytics platform is down for ten minutes while brokers change 10 policies a second. The brokers are still answered, PolicyChanged waits on the topic, and analytics gets every event once it is back.',
          traffic: [{ name: 'policy changes', from: BROKER_PORTAL, rps: 10, kind: 'write', to: ['legacy', 'data-warehouse'] }],
          incidents: [{ down: 'data-warehouse', at: 2, forMin: 10 }],
          durationMin: 20,
          expect: {
            answers: [{ minSuccess: 0.99 }],
            delivered: [{ to: 'data-warehouse', min: 0.99 }],
            backlog: [{ queue: BROKER, minPeak: 1000, maxEnd: 0 }],
            lost: { max: 0 },
          },
        },
      ],
    },
  },
  quiz: [
    {
      type: 'match',
      prompt: 'Match each consumer to the interaction style that fits best.',
      pairs: [
        ['Legacy broker portal with a WSDL contract and WS-Security', 'SOAP facade'],
        ['Partner aggregators needing a public, cache-friendly API', 'REST/JSON with the spec in Exchange'],
        ['High-volume internal pricing microservices (Java/Go)', 'gRPC'],
        ['Analytics team that wants to know when a policy changes', 'Events (PolicyChanged on a topic)'],
      ],
      explain: 'Each style is chosen for the consumer\'s needs: compatibility (SOAP), reach and caching (REST), typed low-latency calls (gRPC), decoupled notification (events).',
    },
    {
      type: 'single',
      prompt: 'The mobile summary screen needs fields from policy, claims and payments over slow networks. What is the usual first answer?',
      options: [
        'Let the app call the policy, claims and payments System APIs directly',
        'A REST Experience API shaped for the screen, with GraphQL only if many screens vary',
        'A SOAP service with WS-Security, like the broker portal',
        'The partner REST facade, so mobile and partners share one contract',
      ],
      answer: 1,
      explain: 'A purpose-built Experience API already gives one round trip and a small payload. Three direct calls cost three round trips on a slow network, and the partner contract is not shaped for the screen. GraphQL pays off when many front ends need flexible queries over the same graph.',
    },
    {
      type: 'single',
      prompt: 'A company adds a GraphQL API next to its REST APIs. GraphQL lets each client ask for exactly the fields it wants. Why do plain HTTP caching and per-endpoint rate limits stop working for it?',
      options: [
        'Every query is a POST body sent to one endpoint',
        'Responses come back in a format other than JSON',
        'Contracts are binary and need HTTP/2',
        'Each requested field becomes a separate HTTP call',
      ],
      answer: 0,
      explain: 'GraphQL has one endpoint and takes POST bodies, so plain HTTP caching and simple per-endpoint rate limits no longer work. It also needs query depth and cost limits, and field-level authorization. The costs move from the endpoint level to the query level. Responses are still JSON.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Why is gRPC a poor choice for the partner aggregators?',
      options: [
        'gRPC is slower than REST for small payloads',
        'Browsers need a proxy, and partners rarely want binary HTTP/2 contracts',
        'gRPC calls cannot be secured with TLS',
        'gRPC has no typed contracts for partners to code against',
      ],
      answer: 1,
      explain: 'gRPC shines internally between services you control. External reach favours REST, which is broader, cacheable and quicker for partners to start with.',
    },
    {
      type: 'single',
      prompt: 'How do you contain the cost of supporting REST, SOAP, GraphQL and events?',
      options: [
        'Build each style as its own stack, with Process and System APIs copied per style',
        'One Process API owns the logic, with a thin facade per style and events after changes',
        'Offer REST only, and give SOAP and GraphQL consumers a client SDK that wraps it',
        'Put the business logic in each facade, so a style can change without the others',
      ],
      answer: 1,
      explain: 'Logic lives once in the Process API, which also publishes events after state changes. Each extra style then costs only a thin Experience-layer facade plus its security, docs and monitoring.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Where is MuleSoft not the natural hop?',
      options: [
        'Exposing a SOAP facade for the broker portal',
        'Publishing PolicyChanged events',
        'Low-latency gRPC calls between internal pricing microservices',
        'Orchestrating policy, claims and payments for mobile',
      ],
      answer: 2,
      explain: 'Putting an integration layer between internal microservices adds latency without adding value; they usually call each other directly.',
    },
  ],
  description: `
An insurance company is opening its **Policy** capabilities to several consumers. The architecture board asks you to pick an interaction style for each:

| Consumer | Needs |
|---|---|
| Mobile app | Policy summary screen needs fields from policy, claims and payments; slow mobile networks |
| Legacy broker portal | Already integrated with a WSDL-based quoting service; WS-Security required by contract |
| Partner aggregators | Public, stable, well documented, cache-friendly API to get quotes |
| Internal pricing microservices (Java/Go) | Very high call volume, low latency, strongly typed contracts |
| Data/analytics team | Wants to know whenever a policy changes, no need for an immediate answer |

Load: the mobile app reads about **50 policy summaries a second**, and brokers change about 10 policies a second through the portal. The aggregators ask for about **60 quotes a second**, with bursts of 400 that mobile users must not notice. The policy system answers in 200 ms and takes at most **200 requests a second**; claims answer in 100 ms and payments in 150 ms. The analytics platform can be down for maintenance for ten minutes. The budget for the APIs is **2.5 vCores**.

**Questions:**
- Which style would you choose for each consumer and why?
- What are the costs of offering several styles from the same platform?
- Where does MuleSoft fit, and where would it not be the natural choice?
`,
  answerTemplate: `## Choice per consumer

## Why (trade-offs)

## Cost of multiple styles

## Where MuleSoft fits
`,
  keyPoints: [
    'REST/JSON is the default for broad, cacheable, partner-facing APIs with good tooling and documentation in Exchange.',
    'SOAP is kept where an existing WSDL contract or WS-* standards (e.g. WS-Security) are required; it is a compatibility choice, not a default.',
    'GraphQL suits client-driven aggregation (one round trip, only requested fields) such as a mobile screen, but makes caching, rate limiting and authorization per field harder.',
    'gRPC suits high-volume internal service-to-service calls with strongly typed contracts, but is a poor fit for browsers and external partners.',
    'Events/messaging suit consumers that need to be notified of changes without blocking the producer.',
    'Each extra style adds governance, security and skills cost, so the same underlying capability should be exposed through thin facades over shared Process/System APIs.',
    'Each facade gets its own policies and size: a rate limit of 80 a second on the partner REST facade keeps aggregator bursts away from the policy system that the mobile app also needs, and the shared Process and policy System APIs get 0.5 vCore for the combined load.',
  ],
  solution: `
**Choice per consumer.**

| Consumer | Style | Reason |
|---|---|---|
| Mobile app | **REST Experience API** shaped for the screen (or **GraphQL** if many screens need flexible field selection) | Fewer round trips, small payloads. A dedicated Experience API often solves this without GraphQL. |
| Broker portal | **SOAP** facade | Keeps the WSDL and WS-Security contract; Mule can expose it with APIkit for SOAP and call the same Process API underneath. |
| Partner aggregators | **REST/JSON** with OAS/RAML in Exchange | Widely understood, cacheable GETs, gateway policies (client ID, rate limit), quick partner onboarding. |
| Pricing microservices | **gRPC** (or REST if the platform team does not run gRPC tooling) | Binary protocol over HTTP/2, generated typed stubs, low overhead. Usually service-to-service directly, not through an integration layer. |
| Analytics team | **Events** (PolicyChanged on a broker/topic) | Decouples producer from consumer; analytics can replay or consume at its own pace. |

**Trade-offs to mention.**
- **GraphQL**: one endpoint, POST bodies → HTTP caching and simple per-endpoint rate limits no longer work; need query depth/cost limits and field-level authorization. Mule can host a GraphQL API (APIkit for GraphQL), but check fit, version support and team skills.
- **SOAP**: verbose, but strong contract and WS-* standards. Do not build new SOAP APIs unless a consumer requires it.
- **gRPC**: excellent internally; browsers need a proxy, partners rarely want it.
- **Events**: eventual consistency, need for schema governance and DLQs.

**Cost of multiple styles.** Each style needs its own security policies, documentation, testing, monitoring and skills. Contain it: one **Process API** owns the logic; Experience-layer facades (REST, SOAP, GraphQL) are thin translations.

**Sizing and policies.** A thin facade per style also means a policy per consumer. The partner REST facade has a **rate limit of 80 requests a second**: a burst of 400 quotes gets 429 at the facade, and the policy system (200 a second at most) still has room for the mobile app. The shared Process API and the policy System API carry everyone, about 140 requests a second, so they get 0.5 vCore each; the mobile and partner facades and the claims and payments System APIs get 0.2. That is 1.9 vCores, inside the 2.5 budget. PolicyChanged goes on a topic, so when analytics is down the brokers are still answered and the events wait for it.

**Where MuleSoft fits.** Natural for REST/SOAP facades, orchestration and event publishing/consumption. Not the natural hop for low-latency gRPC calls between internal microservices: adding an integration layer there adds latency without adding value.
`,
  followUps: [
    { q: 'The mobile team asks for GraphQL. How do you decide?', a: 'Ask how many screens with varying field needs exist and who owns the schema. If two or three fixed screens, a purpose-built REST Experience API costs less to build and run; if many front ends need flexible queries over the same graph, GraphQL can pay off provided you add cost limits and field-level security.' },
    { q: 'Can the same API serve both REST and events?', a: 'The same capability can: the Process API handles commands synchronously and publishes an event after state changes, so request/reply and notification consumers are both served without duplicating logic.' },
  ],
}
