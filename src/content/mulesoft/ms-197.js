export default {
  id: 'ms-197',
  category: 'mulesoft',
  title: 'Agent Visualizer and Monitor: What Each One Tells You',
  level: 'BEGINNER',
  tags: ['ai-agents', 'agent-fabric', 'omni-gateway', 'policies', 'mcp', 'llm'],
  estMinutes: 10,
  quiz: [
    {
      type: 'single',
      prompt: 'A security lead at a bank wants to know which AI agents (software that uses an AI model to carry out tasks) have no Omni Gateway policy coverage. Omni Gateway was formerly Flex Gateway. Where can this be seen?',
      options: [
        'In Anypoint Exchange, on the page of each agent',
        'In Agent Visualizer, which shows agents lacking coverage',
        'In Anypoint Studio, in the console of a local run',
        'In the Agent Broker, in the routing graph of each agent',
      ],
      answer: 1,
      explain: 'Agent Visualizer is a real time map. Among other things, it shows which agents lack Omni Gateway policy coverage.',
    },
    {
      type: 'single',
      prompt: 'A returns AI agent at a retailer starts failing. It depends on an MCP server (a service that offers tools to AI clients through the Model Context Protocol) and on other agents. How does Agent Visualizer help find the cause?',
      options: [
        'It rewrites the failing agent so that it no longer needs its dependencies',
        'It restarts each node on the map, one by one, until the errors have stopped',
        'It sends the failing requests to a different agent while the team sleeps',
        'It lets the team trace dependencies and isolate the failing node',
      ],
      answer: 3,
      explain: 'Agent Visualizer shows what calls what, and in which direction. That lets you trace dependencies and isolate a failing node. It shows the problem and does not fix it for you.',
    },
    {
      type: 'single',
      prompt: 'An operations team at a shipping company wants a message in Slack when an AI agent service starts returning error response codes. Which part of Agent Fabric gives them this?',
      options: [
        'Monitor, which tracks signals such as error rates and sends alerts',
        'The Agent Registry, which writes a new entry when a service has errors',
        'Scanners, which search cloud providers for any agent that has an error',
        'Agent Script, which sends a Slack message for each node in the graph',
      ],
      answer: 0,
      explain: 'Monitor covers latency, error rates and request volume. Alerts go to Slack, Teams and email, and an alert can watch a metric such as Response Code.',
    },
    {
      type: 'match',
      prompt: 'A retailer manages its AI agents (software that uses an AI model to carry out tasks) with Agent Fabric. Match each need to the best place to go.',
      pairs: [
        ['See which agents call which MCP servers, and in which direction', 'Agent Visualizer'],
        ['Get an email alert when the request count of a service passes a limit', 'Monitor'],
        ['Find an existing agent to reuse in a new project', 'Agent Registry'],
      ],
      explain: 'Agent Visualizer maps who calls whom. Monitor watches the health of traffic and sends alerts. The Agent Registry is the inventory for finding and reusing assets.',
    },
    {
      type: 'single',
      prompt: 'On the Agent Visualizer map, an HR analyst sees an AI agent (software that uses an AI model to carry out tasks) that nobody recognises. What can Agent Visualizer tell them about that node?',
      options: [
        'The password of the person who first deployed it',
        'The full text of each prompt that it has received',
        'Its purpose, its origin and its running instances',
        'Its source code and the name of each developer',
      ],
      answer: 2,
      explain: 'For a node, Agent Visualizer shows its purpose, its origin and its running instances. That is enough to start working out what an unknown agent is.',
    },
    {
      type: 'single',
      prompt: 'An AI agent at a bank has all the right policies in place, yet customers say replies have become slow. Which part of Agent Fabric is the natural place to check request latency and error rates?',
      options: [
        'Governance Strategies, as a service that conforms is always healthy',
        'Monitor, as a policy being in place says nothing about healthy traffic',
        'The Agent Registry, as its inventory lists each request that is slow',
        'Agent Script, as each slow node writes its own time to the `.agent` file',
      ],
      answer: 1,
      explain: 'A defined policy is not the same as healthy traffic. Monitor shows latency, error rates and request volume, so it can catch a service that is covered by policy but running badly.',
    },
  ],
  description: `
A retailer now has many **AI agents**, which are software that uses an AI model to carry out tasks. Some run on Amazon Bedrock, some on Microsoft Copilot and some on Google Vertex AI. They also use **MCP servers**, which offer tools through the Model Context Protocol, a way for an AI client to list and call tools. And they use **LLMs** (large language models, the AI models that read and write text).

Two things happen in one week:

- An auditor asks which agents have no **Omni Gateway** policy applied. Omni Gateway (formerly Flex Gateway) is the gateway that enforces rules on traffic.
- The returns agent fails on Saturday, and nobody knows until customers complain on Monday.

The team looks at **Agent Visualizer** and **Monitor**.

**Questions**
1. What does Agent Visualizer show?
2. How would you find the agents with no policy coverage?
3. How would you find the failing part behind the returns agent?
4. What would have warned the team on Saturday?
`,
  answerTemplate: `## What Agent Visualizer shows

## Finding policy gaps

## Finding the failing node

## Getting a warning
`,
  keyPoints: [
    'Agent Visualizer is a real time map of agents, MCP servers and LLMs, including external platforms.',
    'It shows the direction of calls, call volume and which agents lack Omni Gateway policy coverage.',
    'For a node it shows purpose, origin and running instances.',
    'Use it to trace dependencies and isolate failing nodes, and filter by production or nonproduction.',
    'Monitor covers latency, error rates and request volume, with alerts to Slack, Teams and email.',
    'A policy being in place does not mean that traffic is healthy.',
  ],
  solution: `
**1. Agent Visualizer.** It is a real time map of agents, MCP servers and LLMs, including those on external platforms such as Amazon Bedrock, Microsoft Copilot and Google Vertex AI. It shows the direction of calls and call volume.

**2. Policy gaps.** Agent Visualizer shows which agents lack Omni Gateway policy coverage, so the answer for the auditor comes from the map. Filter by production or nonproduction to focus on what matters.

**3. The failing node.** Start at the returns agent and trace its dependencies on the map. That lets you isolate the failing node. Selecting a node shows its purpose, origin and running instances.

**4. The warning.** **Monitor** tracks latency, error rates and request volume, and it sends alerts to Slack, Teams or email. An alert on response codes would have reached the team on Saturday.

In short, Agent Visualizer helps you see how things connect and where the gaps are, and it also shows live metrics such as latency and error rates. Monitor tells you how a service is doing and sends alerts when it gets worse.
`,
  followUps: [
    {
      q: 'Does Agent Visualizer only show MuleSoft agents?',
      a: 'No. It includes external platforms such as Amazon Bedrock, Microsoft Copilot and Google Vertex AI.',
    },
    {
      q: 'Why filter by production or nonproduction?',
      a: 'So that test traffic does not get in the way when you are looking at a live problem.',
    },
    {
      q: 'If every agent has policy coverage, can you skip Monitor?',
      a: 'No. A policy controls what is allowed. It does not tell you that a service is fast or free of errors.',
    },
  ],
}
