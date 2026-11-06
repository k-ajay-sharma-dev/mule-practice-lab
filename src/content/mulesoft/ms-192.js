export default {
  id: 'ms-192',
  category: 'mulesoft',
  title: 'Agent Registry and Scanners: Know What You Have Before You Govern It',
  level: 'BEGINNER',
  tags: ['ai-agents', 'agent-fabric', 'mcp'],
  estMinutes: 10,
  quiz: [
    {
      type: 'single',
      prompt: 'A bank wants one set of rules for all its AI agents (software that uses an AI model to carry out tasks), but nobody knows how many agents exist. In Agent Fabric, what should happen first?',
      options: [
        'Write the rules now and wait for each team to report which agents it has',
        'Register the agents, because you cannot govern what is not in the inventory',
        'Turn off every agent until each one has been rebuilt on a single platform',
        'Buy a larger LLM budget, so that rules are not needed for the agents later',
      ],
      answer: 1,
      explain: 'Registration comes first. A rule cannot cover an agent that nobody has on the list, so the inventory is what makes governance possible.',
    },
    {
      type: 'single',
      prompt: 'A developer at a retailer needs an MCP server (a service that offers tools to AI clients through the Model Context Protocol) that looks up orders. Another team may already have one. What is the best first step?',
      options: [
        'Build a new MCP server, as a copy owned by one team is the safest choice',
        'Send an email to every team and wait a week to see who gives an answer',
        'Search the Agent Registry and reuse the MCP server if a suitable one exists',
        'Read the logs of each Mule app to find one that has handled an order',
      ],
      answer: 2,
      explain: 'The Agent Registry is one inventory of agents, MCP servers, APIs and gateways from any platform. Finding and reusing assets is one of its main jobs.',
    },
    {
      type: 'single',
      prompt: 'A shipping company runs AI agents (software that uses an AI model to carry out tasks) on several cloud providers. New ones appear faster than anyone can add them to the Agent Registry by hand. What in Agent Fabric helps?',
      options: [
        'Scanners, which connect to cloud providers and discover and register assets',
        'A Logger added to each agent, so that a person can read which agents have run',
        'An Omni Gateway policy, which removes any agent that has not been registered',
        'A daily spreadsheet, which each cloud team fills in and then sends to one owner',
      ],
      answer: 0,
      explain: 'Scanners connect to cloud providers and discover and register agents, MCP servers and APIs. They suit agents spread over several platforms, where adding each one by hand cannot keep up.',
    },
    {
      type: 'single',
      prompt: 'A bank wants Agent Fabric Scanners to look for new AI agents on a regular schedule, and also to run an extra check the day before an audit. Is this possible?',
      options: [
        'No, a Scanner runs once when it is set up and then has to be created again',
        'No, a Scanner only runs on demand, so someone has to start it every time',
        'No, a Scanner only runs on a schedule, so the extra check cannot be started',
        'Yes, a Scanner can run on a schedule and can also be run on demand',
      ],
      answer: 3,
      explain: 'Scanners work on a schedule or on demand, so a regular run and a one off check before an audit both fit.',
    },
    {
      type: 'single',
      prompt: 'A developer finds an order lookup API in the Agent Registry and wants to reuse it for a new AI agent. What can the Agent Registry show that helps the developer decide?',
      options: [
        'The personal phone number of each developer who has called the API',
        'Its conformance status and the health of its instances',
        'The full text of every request that the API has ever received',
        'A copy of the database that sits behind the API',
      ],
      answer: 1,
      explain: 'The Agent Registry lets you check conformance and instance health before you use an asset, so you can tell if it meets your rules and is running well.',
    },
    {
      type: 'single',
      prompt: 'An HR team has built an AI agent (software that uses an AI model to carry out tasks) that answers questions about leave. Other departments could use it. How can the HR team make it available to them?',
      options: [
        'Send the source code to each department so that each one can run a copy',
        'Publish it through the Agent Registry so that other teams can find it',
        'Add the name of the agent to the HTTP headers of every internal API',
        'Move the agent into the Mule app of each department that wants to use it',
      ],
      answer: 1,
      explain: 'The Agent Registry lets you manage the lifecycle of assets and publish them for other teams, so one agent can serve many departments.',
    },
  ],
  description: `
A bank has **AI agents** on several platforms. An AI agent is software that uses an AI model to carry out tasks. The bank also has APIs and **MCP servers**, which offer tools to AI clients through the Model Context Protocol (MCP), a standard way for an AI client to list and call tools.

An auditor asks a simple question: "How many agents do you have, and who owns them?" Nobody can answer.

Last month, two teams also found they had each built the same customer lookup tool.

The bank is starting with two parts of **Agent Fabric**, the MuleSoft layer for managing agents, MCP servers, APIs and LLM traffic: the **Agent Registry** and **Scanners**.

**Questions**
1. Why does the inventory come before any rules?
2. What does the Agent Registry hold, and what can you do with it?
3. What do Scanners add?
`,
  answerTemplate: `## Why the inventory comes first

## The Agent Registry

## Scanners
`,
  keyPoints: [
    'You can\'t govern what you haven\'t inventoried, so registration comes first.',
    'The Agent Registry is one inventory of agents, MCP servers, APIs and gateways from any platform.',
    'Use it to find and reuse assets, so teams stop building the same thing twice.',
    'It shows conformance and instance health, and it lets you manage lifecycles and publish for other teams.',
    'Scanners connect to cloud providers and discover and register assets, on a schedule or on demand.',
  ],
  solution: `
**1. Why the inventory comes first.** A rule can only cover what you know about. An agent that is not on the list can break every rule and nobody will notice. That is why registration comes first in Agent Fabric.

**2. The Agent Registry.** It is one inventory of agents, MCP servers, APIs and gateways, from any platform. With it you can:
- Find assets and reuse them.
- Check conformance and instance health.
- Manage lifecycles.
- Publish assets for other teams.

The two teams with the same lookup tool could have found each other here.

**3. Scanners.** They connect to cloud providers, then discover and register agents, MCP servers and APIs. They run on a schedule or on demand. This keeps the inventory current when agents are spread over several platforms.
`,
  followUps: [
    {
      q: 'Why not keep the inventory in a spreadsheet?',
      a: 'It goes out of date as soon as a team adds an agent. Scanners keep finding new assets, and the Agent Registry also shows conformance and instance health.',
    },
    {
      q: 'Does the Agent Registry only list MuleSoft assets?',
      a: 'No. It holds assets from any platform.',
    },
    {
      q: 'How does the inventory save money?',
      a: 'Teams that can find an existing asset do not spend time rebuilding it.',
    },
  ],
}
