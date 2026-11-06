export default {
  id: 'ms-203',
  category: 'mulesoft',
  title: 'Model Proxy Design: Routing, Semantic Caching and Endpoint Format',
  level: 'INTERMEDIATE',
  tags: ['ai-agents', 'agent-fabric', 'omni-gateway', 'llm'],
  estMinutes: 15,
  quiz: [
    {
      type: 'single',
      prompt: 'A retailer is creating a Model Proxy, one governed endpoint for many large language model providers. It wants a fallback route to a second provider. Which endpoint format should it choose?',
      options: [
        'Gemini format, as native formats are the ones that support fallback',
        'Anthropic format, as native formats are the ones that support fallback',
        'OpenAI format, as it works with all providers and supports fallback',
        'Any format, as the choice can be changed later if fallback is needed',
      ],
      answer: 2,
      explain: 'OpenAI format works with all supported providers and supports multi routing and fallback. Gemini and Anthropic formats are native formats that support model based routing only.',
    },
    {
      type: 'single',
      prompt: 'A bank created a Model Proxy with the Anthropic endpoint format. Six months later it wants semantic routing on that proxy. What is the situation?',
      options: [
        'Edit the proxy and switch the format to OpenAI, which keeps the endpoint',
        'Add the semantic service to the proxy, as routing does not depend on format',
        'Add a Gemini route first, as semantic routing needs two native formats',
        'The format cannot be changed, so it needs a new proxy in OpenAI format',
      ],
      answer: 3,
      explain: 'The endpoint format is chosen at creation and cannot be changed. The Anthropic format supports model based routing only, so semantic routing needs a proxy in OpenAI format. This is why the format choice deserves thought at the start.',
    },
    {
      type: 'match',
      prompt: 'A shipping company uses a Model Proxy. Match each need to the feature that meets it.',
      pairs: [
        ['The calling app knows which model it wants and names it in the request', 'Model based routing'],
        ['Requests should go to a model according to what the prompt is about', 'Semantic routing'],
        ['Requests that mean the same as an earlier one should reuse its response', 'Semantic caching'],
      ],
      explain: 'Model based routing is static, as the request names the model. Semantic routing is dynamic, as a semantic service compares the request with prompt topics. Semantic caching is about reusing a response, not choosing a model.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'An HR assistant uses a Model Proxy with semantic routing. Prompts on one sensitive subject must never reach a model. What is the way to do this?',
      options: [
        'Remove the subject from each route, so that its prompts match no model at all',
        'Create a prompt topic for the subject, and apply it as a denylist topic on the proxy',
        'Turn on semantic caching for the subject, so a stored refusal is sent back each time',
        'Name a blocked model in the request, so the proxy drops any prompt on the subject',
      ],
      answer: 1,
      explain: 'A semantic routing service can route a request or block it. To block a subject, you create a prompt topic for it with example utterances, then apply it as a denylist topic when you configure the Model Proxy.',
    },
    {
      type: 'single',
      prompt: 'On a retailer\'s Model Proxy with semantic caching on, one shopper asked "Where is my parcel?" and the response was stored. Another shopper now asks "Can you track my delivery?". What can semantic caching do?',
      options: [
        'Return the stored response, as the two requests are semantically similar',
        'Send the request to a cheaper model, as it is similar to an earlier one',
        'Send the request on as normal, as only identical text can match a stored one',
        'Block the request, as it counts as a duplicate of the stored request',
      ],
      answer: 0,
      explain: 'Semantic caching compares meaning, not exact text. A hit reuses the stored response and skips the upstream call, which cuts latency and cost.',
    },
    {
      type: 'single',
      prompt: 'A bank wants semantic caching on a Model Proxy and sees that nothing is being cached. Routing works as normal. What should it check first?',
      options: [
        'That all calling apps send the very same prompt text in each request',
        'That the proxy was created with a native format such as Gemini or Anthropic',
        'That a semantic caching service is configured and caching is enabled on the proxy',
        'That each prompt topic on the proxy has a model cost setting for its route',
      ],
      answer: 2,
      explain: 'Semantic caching requires a configured semantic caching service, and it must be enabled on the proxy. It is not something a proxy does by itself.',
    },
  ],
  description: `
A retailer runs a shopping assistant, an **AI agent**: a program that uses a **large language model (LLM)**, an AI model that reads and writes text, to decide and act. All LLM calls go through a **Model Proxy**, one governed endpoint for many LLM providers on **Omni Gateway (formerly Flex Gateway)**.

The team has three goals:

- Send simple questions to a cheaper model, without the app having to choose.
- Stop paying for the same answer when shoppers ask the same thing in different words.
- Have a fallback route to a second provider.

It is about to create the proxy and must pick an endpoint format: **OpenAI**, **Gemini** or **Anthropic**.

**Questions**
1. Which endpoint format fits, and why does the choice matter?
2. What is the difference between model based routing and semantic routing?
3. What does semantic caching do, and what does it need?
`,
  answerTemplate: `## Endpoint format

## Model based and semantic routing

## Semantic caching
`,
  keyPoints: [
    'The endpoint format is chosen at creation and cannot be changed.',
    'OpenAI format works with all providers and supports multi routing and fallback. Gemini and Anthropic formats are native and support model based routing only.',
    'Model based routing is static: the request names the model.',
    'Semantic routing is dynamic: a semantic service compares the request with prompt topics and their example utterances.',
    'A prompt topic can also be applied as a denylist topic to block a subject.',
    'Semantic caching reuses responses for similar requests, cutting latency and cost. It needs a configured semantic caching service and must be enabled on the proxy.',
  ],
  solution: `
**Endpoint format.** Choose **OpenAI** format. It works with all supported providers and supports multi routing and fallback. Gemini and Anthropic formats are native formats that support model based routing only, so they cannot meet the first and third goals. The choice matters because it cannot be changed after creation.

**Routing**

| | Model based routing | Semantic routing |
|---|---|---|
| Type | Static | Dynamic |
| Who picks the model | The request names it | A semantic service picks the best matching route |
| What you set up | The models on the proxy | Prompt topics with example utterances, for each route |

An **utterance** is a sample prompt that represents a topic. For the first goal, semantic routing fits: a topic of simple questions can route to a cheaper model. You configure the semantic service before you create the proxy that uses it.

**Semantic caching.** It returns a stored response for a semantically similar request and skips the upstream call, which meets the second goal. It needs a configured semantic caching service and must be enabled on the proxy.

**The design:** one proxy in OpenAI format, as only that format offers semantic routing and fallback, plus semantic caching for repeated questions.
`,
  followUps: [
    {
      q: 'Why not always use a native format such as Anthropic?',
      a: 'It suits direct requests to that provider, but it supports model based routing only. If you may need multi routing, fallback or semantic routing, choose OpenAI format, as the format cannot be changed later.',
    },
    {
      q: 'What is the difference between semantic routing and semantic caching?',
      a: 'Semantic routing chooses which model gets a request. Semantic caching tries to avoid calling a model at all, by reusing a stored response for a similar request.',
    },
    {
      q: 'What is a prompt topic?',
      a: 'A named set of utterances, which are sample prompts for that topic. The semantic service compares each request with them to find the best match.',
    },
  ],
}
