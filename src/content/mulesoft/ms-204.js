export default {
  id: 'ms-204',
  category: 'mulesoft',
  title: 'Controlling LLM Spend: Budget Management, Model Wallets and Cost Optimization',
  level: 'INTERMEDIATE',
  tags: ['ai-agents', 'agent-fabric', 'llm', 'omni-gateway'],
  estMinutes: 15,
  quiz: [
    {
      type: 'match',
      prompt: 'A retailer wants to control what it spends on large language models. Match each need to the Agent Fabric feature that meets it.',
      pairs: [
        ['See token usage and spend across model proxies, agents and MCP servers', 'Budget Management'],
        ['Cap what one caller of a model proxy can spend against a provider', 'Model wallet'],
        ['Lower the tokens each call uses, with no change to what the service does', 'Cost Optimization'],
      ],
      explain: 'Budget Management shows spend and lets you cap it. A model wallet is the unit that holds a cap for one caller. Cost Optimization reduces what each call consumes in the first place.',
    },
    {
      type: 'single',
      prompt: 'A shipping company wants model wallets, which cap the spend of each caller of a model proxy. It has no identity provider today. What does this mean?',
      options: [
        'It can use model wallets, as each wallet has its own system generated client ID',
        'It can use model wallets, as callers are told apart by their IP address instead',
        'It needs an identity provider that issues JWTs before it can use model wallets',
        'It needs a separate provider account for each caller before it can use wallets',
      ],
      answer: 2,
      explain: 'Model wallets require an identity provider that issues JWTs. The proxy matches the client ID and the JWT claims of a request to a wallet, so an organization without one cannot use them.',
    },
    {
      type: 'single',
      prompt: 'A security lead at a bank wants to stop a contractor app from using a model proxy, and suggests deleting the model wallet of that app. Why does this not do the job?',
      options: [
        'A wallet only caps spend or tokens, and it does not grant or deny access to the proxy',
        'A wallet cannot be deleted once it holds a budget, so the app would keep its access',
        'A wallet only applies to agents, so a contractor app is outside of what it can control',
        'A wallet takes effect a full period later, so the app would keep running until then',
      ],
      answer: 0,
      explain: 'A model wallet identifies a caller and caps its spend or token use with a provider. It does not control access to the proxy, so stopping an app is a job for access control, not for a wallet.',
    },
    {
      type: 'single',
      prompt: 'A retailer\'s cost view shows token counts for a new model, but its spend shows as zero. The model is in daily use. What is the most likely cause?',
      options: [
        'The provider has not sent its invoice for the period to Anypoint Platform',
        'The model is on a free tier, so the provider does not charge for its tokens',
        'The model has no wallet, and spend is only worked out for callers with wallets',
        'The model has no cost set, and cost settings are what turn tokens into dollars',
      ],
      answer: 3,
      explain: 'You set input and output token costs for each model so that reports can show dollars. Models without costs show zero spend, while token counts are not affected. Spend budgets are only accurate when costs are set.',
    },
    {
      type: 'single',
      prompt: 'An HR team\'s model wallet has a monthly budget for one model, and its route has no fallback. Usage went slightly past the limit, and then requests were blocked. Is this a fault?',
      options: [
        'Yes, a budget is a hard limit, so a request past it means a policy has failed',
        'No, budgets are approximate, so usage can briefly exceed a limit before blocking',
        'Yes, the wallet should have warned the caller and allowed all requests to go on',
        'No, a limit only ever applies to the budget of the following period, not this one',
      ],
      answer: 1,
      explain: 'Budgets are approximate, not a real time hard cutoff. When usage reaches a limit, the proxy blocks requests for that provider and model. If the route has a fallback, the proxy sends the request to the next model in the route instead.',
    },
    {
      type: 'single',
      prompt: 'A retail agent, a program that uses a large language model to decide and act, calls an MCP server, which offers it tools. Long tool lists and bulky tool responses use many tokens. The company wants the agent to keep doing the same work. What fits best?',
      options: [
        'Set a lower budget, so requests are blocked when the agent uses too many tokens',
        'Give the agent a model wallet, so that its tool responses become smaller',
        'Apply optimization policies that trim unneeded tools and payload from the traffic',
        'Move the model proxy to a native endpoint format, which sends fewer tokens',
      ],
      answer: 2,
      explain: 'Optimization policies reduce token consumption without changing what the instance does. A budget or a wallet limits spending, but it does nothing to make each call smaller.',
    },
  ],
  description: `
A retailer has several **AI agents**: programs that use a **large language model (LLM)**, an AI model that reads and writes text, to decide and act. LLM providers charge by the **token**, the unit they count. Agents reach the models through a **Model Proxy**, and some also call tools on an **MCP** server (Model Context Protocol: how an AI client lists and calls tools).

The finance director has three requests:

- Show me what we spend, in dollars, across all of this.
- Make sure the pricing agent cannot overspend against one provider.
- Reduce what each call costs.

**Questions**
1. What does Budget Management give you, and what do you have to set up for dollars to appear?
2. What is a model wallet, and what is it not?
3. How exact are budgets, and what happens at the limit?
4. How does Cost Optimization differ from a budget?
`,
  answerTemplate: `## Budget Management

## Model wallets

## At the limit

## Cost Optimization
`,
  keyPoints: [
    'Budget Management covers token usage and spend across model proxies, agents and MCP servers.',
    'Model cost settings turn tokens into dollars. A model with no cost shows zero spend.',
    'Budgets are daily, weekly or monthly, and can be based on spend or tokens.',
    'A model wallet caps a caller\'s spend or tokens against a provider. It needs an identity provider, and it does not grant or deny access to the proxy.',
    'Budgets are approximate. At the limit the proxy blocks requests, or uses the next model in the route if a fallback exists.',
    'Cost Optimization reduces what each call consumes: semantic routing, semantic caching, and trimming unneeded tools and payloads.',
  ],
  solution: `
**Budget Management.** The overview docs use this name. In the product you find it at Governance > Cost Management, on the Budgets tab. It shows token usage and spend across model proxies, agents and MCP servers, and shows which providers and wallets are near or at their limit. For dollars to appear, set the input and output token costs for each model. Until then, spend shows as zero.

**Model wallets.** A wallet identifies a caller of a model proxy and caps that caller's spend or tokens with a provider, over a daily, weekly or monthly period. The pricing agent gets a wallet with a budget. Wallets need an identity provider that issues JWTs. A wallet is not access control: it does not grant or deny access to the proxy.

**At the limit.** The proxy blocks requests for that provider and model. If a fallback route exists, the proxy sends the request to the next model in the route. Budgets are approximate, so usage can briefly pass a limit before blocking starts.

**Cost Optimization.** A budget stops spending at a line. Optimization makes each call cheaper:

| Lever | What it does |
|---|---|
| Semantic routing | Sends a request to a model by meaning, in place of always using the most expensive one |
| Semantic caching | Reuses a stored response for a similar request |
| Optimization policies | Trim unneeded tools and payload |

Use them together: optimization to lower the bill, budgets and wallets to cap what is left.
`,
  followUps: [
    {
      q: 'Why can a request get through after a budget limit is reached?',
      a: 'Budgets are approximate, so usage can briefly exceed a limit before the proxy blocks requests. Treat a budget as a strong control, not a real time cutoff.',
    },
    {
      q: 'What happens at the limit if the route has a fallback?',
      a: 'The proxy sends the request to the next model in the route, so the request is not blocked.',
    },
    {
      q: 'Does a budget lower your costs?',
      a: 'It limits them by blocking requests at the limit. To make each call cost less, use Cost Optimization, such as semantic caching or trimming tools and payloads.',
    },
  ],
}
