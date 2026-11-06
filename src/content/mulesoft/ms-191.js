export default {
  id: 'ms-191',
  category: 'mulesoft',
  title: 'What Agent Fabric Is and the Problems It Solves',
  level: 'BEGINNER',
  tags: ['ai-agents', 'agent-fabric', 'llm'],
  estMinutes: 10,
  quiz: [
    {
      type: 'single',
      prompt: 'A retailer has AI agents (software that uses an AI model to carry out tasks) built on three different platforms. A manager asks whether MuleSoft Agent Fabric is where those agents should be rebuilt. What is the best reply?',
      options: [
        'Yes, agents have to be rebuilt in Agent Fabric before anyone can manage them',
        'Yes, Agent Fabric is a MuleSoft AI model that takes the place of those agents',
        'No, Agent Fabric is a control plane that manages agents across platforms',
        'No, Agent Fabric is a connector that lets one Mule app call one AI model',
      ],
      answer: 2,
      explain: 'Agent Fabric is an AI control plane: one layer for managing agents, MCP servers, APIs and LLM traffic across platforms. It is not a place you must move your agents to.',
    },
    {
      type: 'match',
      prompt: 'A retailer runs many AI agents (software that uses an AI model to carry out tasks), and an LLM (large language model, the AI model that reads and writes text) sits behind each one. Match each problem to the part of Agent Fabric that addresses it.',
      pairs: [
        ['Teams rebuild assets because they cannot find the ones that exist', 'Agent Registry'],
        ['Each team applies its own rules for access and data privacy', 'Governance Strategies'],
        ['Nobody can see how much LLM usage costs across the company', 'Budget Management'],
      ],
      explain: 'The Agent Registry is one inventory for finding and reusing assets. Governance Strategies define rules once. Budget Management tracks token usage and spend.',
    },
    {
      type: 'single',
      prompt: 'A shipping company has an AI agent (software that uses an AI model to carry out tasks) running on Amazon Bedrock. It wants that agent managed alongside its other agents in Agent Fabric. What does this require?',
      options: [
        'The agent stays on its platform and is added to the Agent Registry inventory',
        'The agent is moved off Amazon Bedrock and rebuilt inside a Mule application',
        'The agent is left out, as Agent Fabric can only see agents MuleSoft has built',
        'The agent is copied to CloudHub, and the original on Amazon Bedrock is removed',
      ],
      answer: 0,
      explain: 'The Agent Registry holds agents, MCP servers, APIs and gateways from any platform. Managing an asset does not mean moving it.',
    },
    {
      type: 'multi',
      prompt: 'An HR department is deciding whether Agent Fabric fits its AI agents (software that uses an AI model to carry out tasks). Which two of its problems is Agent Fabric meant to address?',
      options: [
        'Its payroll database is running short of disk space',
        'Its security rules differ from one agent team to the next',
        'Its teams cannot find agents that were already built',
        'Its DataWeave scripts run slowly during month end',
      ],
      answer: [1, 2],
      explain: 'Inconsistent governance and assets that nobody can find are two of the problems Agent Fabric addresses. Disk space and DataWeave speed are not about managing agents.',
    },
    {
      type: 'single',
      prompt: 'A finance lead at a bank sees a growing bill for LLM (large language model, the AI model that reads and writes text) usage, but cannot tell which AI agents are behind it. Which kind of problem is this?',
      options: [
        'A reuse problem, because the bill means that one agent has been built twice',
        'A visibility problem, because LLM costs are not being tracked in one place',
        'An API design problem, because each API spec should list the price of a call',
        'A deployment problem, because agents cost less when they run on one server',
      ],
      answer: 1,
      explain: 'LLM costs that nobody can see are one of the problems Agent Fabric addresses. Its Budget Management tracks token usage and spend across model proxies, agents and MCP servers.',
    },
    {
      type: 'single',
      prompt: 'A bank uses Agent Fabric to manage its AI agents (software that uses an AI model to carry out tasks). When a live request passes through, which product enforces authentication, authorization and tool restrictions?',
      options: [
        'Anypoint Exchange, which checks each request against the published asset',
        'Anypoint Studio, which checks each request on the laptop of the developer',
        'The Agent Registry, which reads each request as it passes through the list',
        'Omni Gateway, which sits in the request path as the enforcement point',
      ],
      answer: 3,
      explain: 'Omni Gateway (formerly Flex Gateway) is the runtime enforcement point in Agent Fabric. The Agent Registry is an inventory, so it does not sit in the path of a request.',
    },
  ],
  description: `
A clothing retailer has moved quickly with AI. An **AI agent** is software that uses an AI model to carry out tasks, such as answering a customer or checking stock.

Three teams have built agents on three platforms. Now the head of IT sees three problems:

- The returns team built an order lookup tool that the support team had already built.
- Each team has its own rules for who can call what.
- The bill for **LLM** usage keeps growing and nobody can say why. An LLM (large language model) is the AI model that reads and writes text.

A colleague suggests **Agent Fabric**. It also covers **MCP servers**, which offer tools to AI clients using the Model Context Protocol, a standard way for an AI client to list and call tools.

**Questions**
1. What is Agent Fabric, and what is it not?
2. Which of the three problems does it address?
3. Do the agents have to move off their platforms?
`,
  answerTemplate: `## What Agent Fabric is

## The problems it addresses

## Do the agents have to move?
`,
  keyPoints: [
    'Agent Fabric is an AI control plane: one layer for managing agents, MCP servers, APIs and LLM traffic across platforms.',
    'It is not a place where every agent must be rebuilt. Assets from any platform can be registered.',
    'It addresses three problems: assets nobody can find, governance applied unevenly, and LLM costs nobody can see.',
    'The Agent Registry is the inventory, and registration comes first.',
    'Omni Gateway is the runtime enforcement point in the request path.',
  ],
  solution: `
**1. What it is.** Agent Fabric is an AI control plane. That means one layer for managing AI agents, MCP servers, APIs and LLM traffic across platforms. It is not a new home that every agent has to be rebuilt in.

**2. The problems.**
| Problem at the retailer | Where Agent Fabric helps |
|---|---|
| A tool was built twice | The **Agent Registry** lets teams find and reuse assets |
| Each team has its own rules | **Governance Strategies** define rules once |
| The LLM bill is a mystery | **Budget Management** tracks token usage and spend |

**3. Do the agents move?** No. The Agent Registry holds assets from any platform. The first step is to register them, because you can't govern what you haven't inventoried.

At run time, **Omni Gateway** (formerly Flex Gateway) sits in the request path. It enforces authentication, authorization and tool restrictions.
`,
  followUps: [
    {
      q: 'What does control plane mean here?',
      a: 'It is the layer where you manage things, such as what exists and which rules apply. The agents themselves keep doing the work.',
    },
    {
      q: 'Why does registration come first?',
      a: 'You can\'t govern what you haven\'t inventoried. A rule can\'t cover an agent that nobody has on the list.',
    },
    {
      q: 'Is Agent Fabric only for agents?',
      a: 'No. It covers AI agents, MCP servers, APIs and LLM traffic.',
    },
  ],
}
