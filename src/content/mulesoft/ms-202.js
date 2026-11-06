export default {
  id: 'ms-202',
  category: 'mulesoft',
  title: 'What a Model Proxy Is and Why Not Call Each LLM Provider Directly',
  level: 'BEGINNER',
  tags: ['ai-agents', 'agent-fabric', 'omni-gateway', 'llm'],
  estMinutes: 10,
  quiz: [
    {
      type: 'single',
      prompt: 'At a retailer, each team calls large language model (LLM) providers such as OpenAI and Google with its own endpoint and settings. The platform team proposes a Model Proxy. What is a Model Proxy?',
      options: [
        'A Mule connector that adds one operation for each LLM provider to a flow',
        'One governed endpoint for many LLM providers, deployed to Omni Gateway',
        'A hosted LLM from MuleSoft that replaces the models of other providers',
        'A map that shows which agents call which LLM providers in real time',
      ],
      answer: 1,
      explain: 'A Model Proxy gives you one LLM service that accepts requests for many providers. It is deployed to Omni Gateway. It does not replace the providers, it sits in front of them.',
    },
    {
      type: 'single',
      prompt: 'A bank has ten apps calling a Model Proxy. It wants to offer one more large language model to those apps. What has to happen to the endpoint the apps use?',
      options: [
        'Each app moves to a new endpoint that is created for the added model',
        'The proxy has to be deleted and created again with the added model',
        'The endpoint stays the same, and the model is added to the proxy',
        'Each app needs a second endpoint for the model, beside the old one',
      ],
      answer: 2,
      explain: 'Developers keep the same endpoint, and you can add models without changing it. With direct calls, each app would need its own change for a new provider.',
    },
    {
      type: 'single',
      prompt: 'A shipping company sends most large language model (LLM) traffic through Model Proxies, but one team calls a provider directly. In the cost view, that team\'s spend is missing. Why?',
      options: [
        'Direct calls bypass the proxy, so their token data never reaches cost management',
        'Direct calls are billed by MuleSoft as well, so they appear on a separate invoice',
        'Direct calls are counted after a delay, once the provider has closed its billing',
        'Direct calls have no tokens, as tokens exist only in calls that use a Model Proxy',
      ],
      answer: 0,
      explain: 'Routing, caching and policy run in front of every call through a proxy, and token data from those calls feeds cost management. Traffic that bypasses the proxy is not in those figures.',
    },
    {
      type: 'single',
      prompt: 'A compliance officer at a bank wants the same policy on all calls to three large language model providers. Agents use a Model Proxy for those calls. Where is the best place to apply it?',
      options: [
        'In the code of each agent, so each one applies the rule before it sends',
        'In the account of each provider, so each one applies the rule on arrival',
        'In Agent Registry, so the rule is copied to each agent as it is published',
        'On the Model Proxy, as policies there run in front of every call it handles',
      ],
      answer: 3,
      explain: 'This is the main reason to use a proxy. One governed endpoint means one place to apply policies, in place of repeating the rule in each agent or relying on each provider.',
    },
    {
      type: 'single',
      prompt: 'An HR platform team must choose where to deploy a new Model Proxy. Which choice is available?',
      options: [
        'Managed Omni Gateway, or Self-Managed Omni Gateway in Connected Mode',
        'Any Omni Gateway, including Self-Managed Omni Gateway in Local Mode',
        'Mule Gateway, inside any Mule app that runs on Mule runtime engine',
        'The account of the LLM provider, beside the models that it will serve',
      ],
      answer: 0,
      explain: 'Model Proxy is available on Managed Omni Gateway and on Self-Managed Omni Gateway in Connected Mode. It is not listed for Local Mode.',
    },
    {
      type: 'single',
      prompt: 'A retailer has two needs. Need A: one Mule flow must call a provider API from inside the app. Need B: many AI agents must have consistent governance, routing and cost visibility across providers. Which products fit?',
      options: [
        'Model Proxy for A, and Inference Connector for B',
        'Inference Connector for A, and Model Proxy for B',
        'Inference Connector for both A and for B',
        'Model Proxy for both A and for B',
      ],
      answer: 1,
      explain: 'Inference Connector talks directly to inference provider APIs from a Mule app. Model Proxy is for agents calling LLMs when you need consistent governance, routing and cost visibility across providers.',
    },
  ],
  description: `
A retailer has several **AI agents**: programs that use a **large language model (LLM)**, an AI model that reads and writes text, to decide and act. One agent answers shoppers, one writes product text and one helps with returns.

Each team picked its own LLM provider and calls it directly. Now the company has these problems:

- Each agent has its own endpoint and settings for each provider.
- Trying a new model means changing each agent.
- Nobody can see total token use. A **token** is the unit that LLM providers count and charge for.
- A rule on what may be sent to a provider has to be added to each agent.

The platform team proposes a **Model Proxy** on **Omni Gateway (formerly Flex Gateway)**.

**Questions**
1. What is a Model Proxy?
2. How does it help with each problem above?
3. Where can it be deployed?
`,
  answerTemplate: `## What a Model Proxy is

## How it helps

## Where it can be deployed
`,
  keyPoints: [
    'A Model Proxy is one governed endpoint for many LLM providers, deployed to Omni Gateway.',
    'Developers keep the same endpoint, and models can be added without changing it.',
    'Routing, caching and policy run in front of every call through the proxy.',
    'Token data from those calls feeds cost management, so direct calls are not in those figures.',
    'It is available on Managed Omni Gateway and on Self-Managed Omni Gateway in Connected Mode.',
    'Inference Connector calls provider APIs directly from a Mule app. Model Proxy is for consistent governance across providers.',
  ],
  solution: `
**What it is.** A Model Proxy is one LLM service that accepts requests for many providers. It sits between the agents and the providers, and it is deployed to Omni Gateway.

**How it helps**

| Problem with direct calls | With a Model Proxy |
|---|---|
| An endpoint for each provider | One endpoint for all of them |
| A new model means changing each agent | Add the model to the proxy, and the endpoint stays the same |
| No total view of token use | Token data from calls through the proxy feeds cost management |
| Rules repeated in each agent | Policies run on the proxy, in front of every call |

**Where it can be deployed.** On Managed Omni Gateway, or on Self-Managed Omni Gateway in Connected Mode.

**Remember.** The proxy only helps with traffic that goes through it. A team that keeps calling a provider directly stays outside these controls.
`,
  followUps: [
    {
      q: 'Does a Model Proxy replace the LLM providers?',
      a: 'No. It sits in front of them. The models still come from the providers, and the proxy gives you one endpoint and one place for routing, caching and policy.',
    },
    {
      q: 'When would you use Inference Connector in place of a Model Proxy?',
      a: 'When a Mule app needs to talk directly to an inference provider API from a flow. A Model Proxy fits when many agents need consistent governance, routing and cost visibility.',
    },
    {
      q: 'What can a Model Proxy do for you beyond one endpoint?',
      a: 'It can route by model or by meaning, reuse responses for similar requests, and apply policies, and its token data feeds cost management.',
    },
  ],
}
