export default {
  id: 'inc-171',
  category: 'incidents',
  title: 'A Team Cannot Add Semantic Routing to a Model Proxy Created With the Anthropic Format',
  level: 'INTERMEDIATE',
  tags: ['ai-agents', 'agent-fabric', 'llm'],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: '2026-11-25 09:40:02 INFO  [model-proxy] mp-store-assist created, endpoint format: Anthropic', relevant: true, why: 'This choice was made at creation, and the docs say it cannot be changed later.' },
      { text: '2026-11-25 09:41:15 INFO  [model-proxy] mp-store-assist routing: model based, 1 model', relevant: true, why: 'This is the only routing the native Anthropic format supports.' },
      { text: '2026-11-25 09:41:40 INFO  [store-assistant] POST to mp-store-assist 200 (1320 ms) model named in request', relevant: true, why: 'The proxy works. This is a design limit, not an outage.' },
      { text: '2026-12-08 15:12:31 WARN  [change-request] CR-4471 add semantic routing to mp-store-assist: blocked, not available for this endpoint format', relevant: true, why: 'Illustrative line: the docs give no error text, but they limit the native formats to model based routing.' },
      { text: '2026-12-08 15:14:02 WARN  [change-request] CR-4471 change endpoint format to OpenAI: blocked', relevant: true, why: 'Illustrative line: the format cannot be changed after creation, so editing the existing proxy is not a way out.' },
      { text: '2026-12-08 15:20:11 INFO  [monitor] mp-store-assist error rate 0.1%', relevant: false },
      { text: '2026-12-08 15:21:00 INFO  [inventory-sync] Store stock file loaded', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'A Model Proxy was created with the Anthropic format, and the team now cannot add semantic routing to it. What is the root cause?',
        options: [
          'The format is fixed at creation, and native formats support model based routing only',
          'Semantic routing needs at least two Anthropic models on the proxy before it can be enabled',
          'Semantic routing is available only after semantic caching has been enabled on the proxy',
          'The proxy is deployed to Omni Gateway, and semantic routing does not run on a gateway',
        ],
        answer: 0,
        explain: 'The Model Proxy page says the endpoint format is selected at creation and cannot be changed later, and that the Gemini and Anthropic formats support model based routing only. Multi routing and fallback come with the OpenAI format.',
      },
      {
        type: 'single',
        prompt: 'A team has a Model Proxy on the Anthropic format and now needs semantic routing. Which path fits the documented limits?',
        options: [
          'Create a new Model Proxy with the OpenAI format and move clients to it',
          'Edit the existing Model Proxy and switch its endpoint format to OpenAI',
          'Add a Gemini model to the existing proxy, because Gemini adds routing options',
          'Keep the Anthropic format and name a routing topic in each client request',
        ],
        answer: 0,
        explain: 'The format cannot be changed, and Gemini is also native, so the existing proxy is a dead end for this need. The page does not describe a migration, but a new proxy on the OpenAI format is the option its limits leave. That format works with all supported LLM providers.',
      },
      {
        type: 'single',
        prompt: 'A retailer on the OpenAI format wants simple stock questions to go to a cheaper LLM, and complex policy questions to a stronger one. What must be set up for semantic routing?',
        options: [
          'Prompt topics with example utterances for each route, compared by a semantic service',
          'A model name in every client request, which the proxy checks against a list of topics',
          'A semantic caching service, which stores one response for each model in the proxy',
          'A separate Model Proxy endpoint for each topic, chosen by the client on every request',
        ],
        answer: 0,
        explain: 'With semantic routing, the proxy chooses the model from the request content. A semantic service compares the request to the topic utterances and sends it to the best matching route. Naming the model in the request is model based routing, and caching is a separate feature.',
      },
      {
        type: 'multi',
        prompt: 'Before creating a Model Proxy for a new assistant, which two questions should decide the endpoint format?',
        options: [
          'Will the assistant ever need semantic routing, multi routing or fallback?',
          'Must clients use a native provider API format for direct requests to that provider?',
          'How many users will the assistant have in its first month after going live?',
          'Which Slack channel should receive alerts when the assistant has errors?',
        ],
        answer: [0, 1],
        explain: 'The format cannot be changed, so decide it from future routing needs and from what clients must send. OpenAI gives the routing options, and the native formats serve direct requests to their own provider. User numbers and alert channels have no bearing on the format.',
      },
      {
        type: 'order',
        prompt: 'Order the work to move from an Anthropic format Model Proxy to semantic routing.',
        items: [
          'Confirm the format of the existing proxy',
          'Create a new Model Proxy with the OpenAI format',
          'Add the models, topics and example utterances',
          'Test routing with real sample prompts',
          'Move clients to the new endpoint in stages',
          'Retire the old proxy when no traffic remains',
        ],
        explain: 'The existing proxy keeps serving while the new one is built and tested, so the store assistant has no outage. Clients move only after routing has been proven.',
      },
    ],
  },
  description: `
## Symptoms
- A retail chain's store assistant **agent**, an AI program that decides for itself which steps to take, answers staff questions about stock and returns policy.
- It calls its **LLM** (large language model, the AI model that reads a prompt and writes a reply) through **Model Proxy** \`mp-store-assist\`, one governed endpoint for many LLM providers.
- The finance team reports that LLM cost is too high, because simple stock questions go to the same strong model as complex policy questions.
- The team tries to add **semantic routing**, where the proxy picks the model from the content of the prompt. The change is blocked. Trying to change the proxy's format is blocked as well.
- There is no outage, and the assistant keeps working normally.

## Change / Context
- \`mp-store-assist\` was created two weeks ago, with the **Anthropic** endpoint format, because the first release used one Anthropic model and "native seemed cleanest".
- Clients name the model in each request.
- Nobody asked at creation time whether routing needs might change.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-25 09:40:02 INFO [model-proxy] mp-store-assist created, endpoint format: Anthropic
2026-11-25 09:41:15 INFO [model-proxy] mp-store-assist routing: model based, 1 model
2026-12-08 15:12:31 WARN [change-request] CR-4471 add semantic routing to mp-store-assist: blocked, not available for this endpoint format
2026-12-08 15:14:02 WARN [change-request] CR-4471 change endpoint format to OpenAI: blocked
\`\`\`

## Your tasks
1. What is the most likely root cause?
2. What do you do right now?
3. What is the permanent fix?
4. How do you stop this class of issue happening again?
`,
  answerTemplate: `## Diagnosis

## Immediate mitigation

## Root cause

## Permanent fix

## Prevention
`,
  keyPoints: [
    'The endpoint format is chosen when the Model Proxy is created and cannot be changed later.',
    'The OpenAI format works with all supported LLM providers and supports multi routing and fallback.',
    'The Gemini and Anthropic formats are native and support model based routing only.',
    'Model based routing: the request names the model. Semantic routing: the proxy chooses from the request content.',
    'Semantic routing uses prompt topics with example utterances, and a semantic service finds the best match.',
    'The current proxy is healthy, so there is time to build and test a replacement.',
    'The docs do not describe a migration, so plan the move to a new proxy yourself.',
    'Choosing the format is a one way decision, so ask about future routing at creation.',
  ],
  solution: `
**Diagnosis.** This is a design limit and not a fault. The Model Proxy page says the endpoint formats are selected when creating a Model Proxy and "can't be changed later". It says the Anthropic format "Supports model-based routing only." So semantic routing cannot be added, and the format cannot be edited. The change request log lines are illustrative, because the docs give no error text.

**Immediate mitigation.**
- Leave \`mp-store-assist\` running. Nothing is broken, so do not disturb it.
- Tell finance the real position: the saving needs a new proxy, and is not a settings change.
- If cost must fall sooner, look at what the current proxy can do. For example, add a cheaper Anthropic model, and have clients name it for simple requests. Model based routing supports this, and adding a model does not change the endpoint.

**Root cause.** A one way choice was made for the first release, with no thought for later routing needs. The native format looked simpler, and its limit was not noticed.

**Permanent fix.**
- Create a new Model Proxy with the **OpenAI** format, which works with all supported LLM providers, so Anthropic models stay available.
- Add the models, and define prompt topics with example utterances for each route, such as stock questions and policy questions.
- Check how clients build requests, because they will now send the OpenAI format.
- Apply the policies and settings the old proxy has. The docs do not describe copying them, so review each one.
- Test routing with real sample prompts, move clients in stages, and retire the old proxy.
- Consider semantic caching too. It reduces latency and cost for similar requests, and needs a semantic caching service.

**Prevention.** Add endpoint format to the design review for each new Model Proxy, and make OpenAI the team default unless there is a stated reason to use a native format. Record that reason.
`,
  followUps: [
    {
      q: 'When would you still choose a native format?',
      a: 'When clients need the native API format for direct requests to that provider, and you are confident that model based routing is enough. Record the decision, because the format cannot be changed.',
    },
    {
      q: 'Can you add a model without changing the endpoint?',
      a: 'Yes. The page says you can add new models to the service without changing the endpoint. That is different from changing the format.',
    },
    {
      q: 'Is semantic routing the same as semantic caching?',
      a: 'No. Routing chooses which model gets the request. Caching returns a stored response for a semantically similar request, without calling the provider again.',
    },
    {
      q: 'How would you show finance that the change worked?',
      a: 'Use Cost Management under Governance, which shows the cost of LLM traffic through managed proxies. Dollar figures appear only after you set a cost rate for each model. The docs call the metrics directional and not exact, so compare trends before and after the move.',
    },
  ],
}
