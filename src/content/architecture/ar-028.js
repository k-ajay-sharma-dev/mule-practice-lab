export default {
  id: 'ar-028',
  category: 'architecture',
  title: 'REST, SOAP, GraphQL, gRPC or Events for Each Client',
  level: 'BEGINNER',
  tags: ['api-style', 'graphql', 'grpc', 'soap', 'event-driven'],
  estMinutes: 20,
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
        'GraphQL is always required for mobile',
        'A REST Experience API shaped for the screen; consider GraphQL only if many screens need flexible field selection',
        'SOAP with WS-Security',
        'Let the app call the three System APIs directly',
      ],
      answer: 1,
      explain: 'A purpose-built Experience API already gives one round trip and a small payload. GraphQL pays off when many front ends need flexible queries over the same graph.',
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
        'It is slower than REST',
        'Browsers need a proxy and partners rarely want binary HTTP/2 contracts; REST is broader, cacheable and easier to onboard',
        'It cannot be secured',
        'It does not support typed contracts',
      ],
      answer: 1,
      explain: 'gRPC shines internally between services you control. External reach favours REST.',
    },
    {
      type: 'single',
      prompt: 'How do you contain the cost of supporting REST, SOAP, GraphQL and events?',
      options: [
        'Build each style as a separate full stack with its own logic',
        'One Process API owns the logic; REST, SOAP and GraphQL facades are thin Experience-layer translations, and the Process API publishes events after state changes',
        'Pick one style and force every consumer onto it',
        'Let each consumer team build its own integration',
      ],
      answer: 1,
      explain: 'Logic lives once; each extra style then costs only a thin facade plus its security, docs and monitoring.',
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
  ],
  solution: `
**Choice per consumer.**

| Consumer | Style | Reason |
|---|---|---|
| Mobile app | **REST Experience API** shaped for the screen (or **GraphQL** if many screens need flexible field selection) | Fewer round trips, small payloads. A dedicated Experience API often solves this without GraphQL. |
| Broker portal | **SOAP** facade | Keeps the WSDL and WS-Security contract; Mule can expose it with APIkit for SOAP and call the same Process API underneath. |
| Partner aggregators | **REST/JSON** with OAS/RAML in Exchange | Widely understood, cacheable GETs, gateway policies (client ID, rate limit), easy onboarding. |
| Pricing microservices | **gRPC** (or REST if the platform team does not run gRPC tooling) | Binary protocol over HTTP/2, generated typed stubs, low overhead. Usually service-to-service directly, not through an integration layer. |
| Analytics team | **Events** (PolicyChanged on a broker/topic) | Decouples producer from consumer; analytics can replay or consume at its own pace. |

**Trade-offs to mention.**
- **GraphQL**: one endpoint, POST bodies → HTTP caching and simple per-endpoint rate limits no longer work; need query depth/cost limits and field-level authorization. Mule can host a GraphQL API (APIkit for GraphQL), but check fit, version support and team skills.
- **SOAP**: verbose, but strong contract and WS-* standards. Do not build new SOAP APIs unless a consumer requires it.
- **gRPC**: excellent internally; browsers need a proxy, partners rarely want it.
- **Events**: eventual consistency, need for schema governance and DLQs.

**Cost of multiple styles.** Each style needs its own security policies, documentation, testing, monitoring and skills. Contain it: one **Process API** owns the logic; Experience-layer facades (REST, SOAP, GraphQL) are thin translations.

**Where MuleSoft fits.** Natural for REST/SOAP facades, orchestration and event publishing/consumption. Not the natural hop for low-latency gRPC calls between internal microservices — adding an integration layer there adds latency without adding value.
`,
  followUps: [
    { q: 'The mobile team asks for GraphQL. How do you decide?', a: 'Ask how many screens with varying field needs exist and who owns the schema. If two or three fixed screens, a purpose-built REST Experience API is simpler; if many front ends need flexible queries over the same graph, GraphQL can pay off provided you add cost limits and field-level security.' },
    { q: 'Can the same API serve both REST and events?', a: 'The same capability can: the Process API handles commands synchronously and publishes an event after state changes, so request/reply and notification consumers are both served without duplicating logic.' },
  ],
}
