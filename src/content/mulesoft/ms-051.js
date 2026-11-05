export default {
  id: 'ms-051',
  category: 'mulesoft',
  title: 'Mocking Service and Consumer-Driven Design Before Implementation',
  level: 'BEGINNER',
  tags: ['api-led', 'mocking-service', 'design-center', 'api-design', 'consumer-driven'],
  estMinutes: 12,
  quiz: [
    {
      type: 'single',
      detail: true,
      prompt: 'Where does the Anypoint mocking service get its response data?',
      options: [
        'From a sample of production traffic',
        'From the examples declared in the spec for the matching method/response',
        'It generates random data from the types',
        'From the Process API team\'s database',
      ],
      answer: 1,
      explain: 'It returns the status codes and example payloads defined in the spec. Random values from the types appear only if the caller sends the `MS2-Randomize` header and no example exists — one more reason good specs include examples.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Which spec should the **mobile** team review in the consumer-driven workflow?',
      options: [
        'The Inventory System API spec',
        'The Orders Process API spec — the one they actually call',
        'Both, equally',
        'Neither; they review the implementation later',
      ],
      answer: 1,
      explain: 'The Experience API never calls the System API directly. The Process API team reviews the System API contract.',
    },
    {
      type: 'single',
      prompt: 'A mobile team builds against the Anypoint mocking service, which simulates an API from its spec and returns the declared examples. The real API does not exist yet. What can the team learn from the mock?',
      options: [
        'Realistic latency and timeout behaviour',
        'The shape of the response the contract promises',
        'Whether a POST followed by a GET returns what was created',
        'Whether client ID and OAuth policies work',
      ],
      answer: 1,
      explain: 'Mocks show the contract shape from examples, but have no state, no real performance and no API Manager policies. So a POST followed by a GET will not return what was created, latency and timeouts are not realistic, and client ID and OAuth flows are not exercised.',
    },
    {
      type: 'single',
      prompt: 'How do you switch the Experience API from the mock to the real Process API with minimal change?',
      options: [
        'Search-and-replace the mock URL in all flows',
        'Keep the host/base path in environment properties and point them at the real endpoint when it is deployed',
        'Redeploy the mock with real data',
        'Ask the Process API team to host on the mock URL',
      ],
      answer: 1,
      explain: 'Then it is a configuration change; add client credentials once a contract exists and rerun the same integration tests.',
    },
    {
      type: 'order',
      prompt: 'Order the consumer-driven design steps.',
      items: [
        'Provider teams draft the Process and System API specs',
        'The mobile team reviews the Process API contract in Exchange and comments',
        'Specs iterate until agreed, then are published as 1.0.0',
        'Teams build against the mocks while implementations progress',
      ],
      explain: 'The contract is agreed before implementation, so layers are built in parallel against mocks.',
    },
    {
      type: 'single',
      prompt: 'The mobile team wants to load-test against the mock. Good idea?',
      options: [
        'Yes, the mock reflects the implementation\'s performance',
        'No — it is a design-time aid; load testing must target a deployed implementation',
        'Yes, if the public URL is enabled',
        'Only for GET requests',
      ],
      answer: 1,
      explain: 'The mock has no relation to the real implementation\'s performance.',
    },
  ],
  description: `
The **Mobile Orders Experience API** team must start building in two weeks, but the **Orders Process API** and the underlying **Inventory System API** will not be implemented for six weeks.

The architect proposes: "Design both specs now, get the mobile team to review them, and let them build against mocks."

**Questions**
1. What is the Anypoint mocking service, where do you access it, and where does its response data come from?
2. How does consumer-driven design work here — who reviews what, and when?
3. What are the limits of a mock (what will it *not* tell you)?
4. How do you switch the mobile team from the mock to the real API later with minimal change?
`,
  answerTemplate: `## The mocking service

## Consumer-driven design workflow

## Limits of mocks

## Switching to the real implementation
`,
  keyPoints: [
    'The mocking service simulates an API from its spec in API Designer and from the Exchange API console, returning the examples declared in the spec.',
    'A public mock URL can be enabled so consumers or external tools can call it outside Anypoint for a time.',
    'Consumer-driven: the consuming team reviews and requests changes to the contract (fields, paging, errors) before implementation, iterating on spec versions.',
    'Mocks do not prove backend behaviour: no real data, performance, state, auth policies or business rules.',
    'Keep the base URL configurable (properties per environment) so moving from mock to real endpoint is a configuration change.',
  ],
  solution: `
**The mocking service**
- Available while editing a spec in **API Designer** (the "mocking service" toggle in the documentation panel) and in the **API console in Exchange** for published assets.
- It reads the spec and returns the **examples** you declared for the matching method/response. For a response with no example, the \`MS2-Randomize\` header asks it to auto-generate random values from the types, which is no substitute for realistic data, so good specs include examples.
- It can validate requests against the spec, so consumers see a 400-style error if they send something invalid.
- A **public URL** can be enabled so the mobile team's app (or Postman) can call the mock directly.

**Consumer-driven design workflow**
1. Process API team drafts the Orders Process API spec; Inventory team drafts the System API spec.
2. The mobile team reviews the Process API contract (not the System API — they never call it directly) in Exchange: does it provide the fields the screens need, in the shape and page size they need? Comments go back to the spec owners.
3. Specs iterate (0.x / pre-release or development lifecycle state) until agreed, then are published as 1.0.0.
4. The mobile team builds the Experience API against the Process API **mock**; the Process API team builds against the System API mock.
5. Examples agreed in the spec double as acceptance criteria for implementation and MUnit tests.

**Limits of mocks**
- Static example data — no real lookups, no state (a POST then a GET won't return what you created).
- No realistic latency, throughput or timeout behaviour.
- No API Manager policies, so client ID / OAuth flows aren't exercised.
- No backend business rules or real error conditions beyond what the examples show.

**Switching to the real implementation**
- In the Experience API, the Process API host/base path/port live in **environment properties** (e.g. \`orders-papi.host\`), never hard-coded.
- Point the dev property file at the mock first, then at the real Dev endpoint when it is deployed; add the client ID/secret once a contract exists.
- Run the same integration tests; differences from the mock reveal where reality diverged from the contract.
`,
  followUps: [
    {
      q: 'Can you return different examples (e.g. an error) from the mock?',
      a: 'The mocking service supports request headers that influence the response, such as forcing a particular status code so you can see the documented error example; check the docs for the current header names.',
    },
    {
      q: 'Is the mock suitable for performance testing?',
      a: 'No. It is a design-time aid with no relation to your implementation\'s performance; load testing must target a deployed implementation.',
    },
    {
      q: 'Who should own the contract in consumer-driven design?',
      a: 'The provider team still owns and publishes the spec, but changes are driven by consumer needs and agreed before implementation, often in a review on the Exchange asset.',
    },
  ],
}
