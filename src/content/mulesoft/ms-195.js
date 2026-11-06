export default {
  id: 'ms-195',
  category: 'mulesoft',
  title: 'A2A in Plain Terms: Bridge, Connector or Direct Registration',
  level: 'BEGINNER',
  tags: ['ai-agents', 'agent-fabric', 'a2a', 'omni-gateway'],
  estMinutes: 10,
  quiz: [
    {
      type: 'single',
      prompt: 'A shipping company has a booking AI agent (software that uses an AI model to carry out tasks) that must hand a customs task to another agent. Which protocol is built for this, and why?',
      options: [
        'MCP, because agents can only reach each other by listing tools',
        'HTTP Listener, because it is the protocol that all agents share',
        'A2A (Agent2Agent), because agents use it to delegate tasks',
        'SFTP, because a task is best delivered to an agent as a file',
      ],
      answer: 2,
      explain: 'A2A (Agent2Agent) is how agents discover each other and delegate tasks. MCP is the other idea: how an AI client lists and calls tools.',
    },
    {
      type: 'single',
      prompt: 'A retailer has an Agentforce agent (an AI agent, software that uses an AI model to carry out tasks) that is not A2A compliant. A2A (Agent2Agent) is how agents discover each other and delegate tasks. Other agents must reach it over A2A, and it must not change. What fits?',
      options: [
        'Direct registration, because every platform is treated as A2A compliant',
        'A2A Bridge, which presents an A2A compliant front for the source agent',
        'A2A Connector, which has to be installed inside of the Agentforce agent',
        'A rebuild of the agent on a platform that is already A2A compliant',
      ],
      answer: 1,
      explain: 'A2A Bridge is for a source agent that is not A2A compliant, such as Agentforce or Microsoft Copilot Studio. No changes to the source agent are needed.',
    },
    {
      type: 'single',
      prompt: 'A bank has an AI agent on Amazon Bedrock AgentCore, a platform that is already compliant with A2A (Agent2Agent: how agents discover each other and delegate tasks). How should it join Agent Fabric?',
      options: [
        'Register it directly, because the platform is already A2A compliant',
        'Put an A2A Bridge in front of it, because all agents need one',
        'Rebuild it in a Mule app that uses the A2A Connector',
        'Wrap it in an MCP server, because A2A agents cannot be registered',
      ],
      answer: 0,
      explain: 'Platforms that are already A2A compliant, such as Amazon Bedrock AgentCore and Google Vertex AI, are registered directly. A bridge would add nothing.',
    },
    {
      type: 'single',
      prompt: 'A Mule app at a retailer has to delegate a task to another AI agent through A2A (Agent2Agent: how agents discover each other and delegate tasks). What adds this ability to the Mule app?',
      options: [
        'A2A Bridge, which is a policy chain placed inside of the Mule app',
        'MCP Bridge, which turns the Mule app into a set of tools for agents',
        'Direct registration, which gives the Mule app a list of all the agents',
        'A2A Connector, which adds an A2A server, client or both to a Mule app',
      ],
      answer: 3,
      explain: 'A2A Connector adds A2A server, client or both to a Mule app. A Mule app that delegates tasks to another agent acts as a client.',
    },
    {
      type: 'match',
      prompt: 'An A2A Bridge sits between A2A clients and a source AI agent. A2A (Agent2Agent) is how agents discover each other and delegate tasks. Match each question to the setting that answers it.',
      pairs: [
        ['How do clients prove who they are to the bridge?', 'Inbound authentication'],
        ['How does the bridge prove who it is to the source agent?', 'Upstream authentication'],
        ['What tells other agents the name and skills on offer?', 'The agent card'],
      ],
      explain: 'Inbound is how clients authenticate to the bridge. Upstream is how the bridge authenticates to the source agent. The agent card lists the name, description and skills for discovery.',
    },
    {
      type: 'single',
      prompt: 'A company uses an A2A Bridge to make a Microsoft Copilot Studio agent reachable through A2A (Agent2Agent: how agents discover each other and delegate tasks). Where does the bridge run?',
      options: [
        'Inside the Copilot Studio agent, as a change to the code of the agent',
        'Inside a Mule app, as a flow that the developer writes by hand',
        'On an Omni Gateway instance, as a chain of policies',
        'On the laptop of each client that wants to reach the source agent',
      ],
      answer: 2,
      explain: 'A2A Bridge is a chain of policies on an Omni Gateway instance. The source agent keeps running on its own platform, and the bridge translates requests.',
    },
  ],
  description: `
A logistics company has **AI agents**, which are software that uses an AI model to carry out tasks. It wants them to work as a team: a booking agent should be able to hand work to other agents.

For this it uses **A2A** (Agent2Agent), which is how agents discover each other and delegate tasks.

Three agents need to join in:

1. A customer service agent on **Agentforce**, which is not A2A compliant. The owners don't want it changed.
2. A customs agent on **Amazon Bedrock AgentCore**, which is already A2A compliant.
3. A carrier booking **Mule app**, which has to delegate tasks to the others.

**Questions**
1. What is A2A in plain terms, and how does it differ from MCP?
2. How should each of the three join in?
3. What does an A2A Bridge do for the source agent?
`,
  answerTemplate: `## A2A in plain terms

## How each one joins

## What the bridge does
`,
  keyPoints: [
    'A2A is how agents discover each other and delegate tasks. MCP is how an AI client lists and calls tools.',
    'A2A Bridge presents an A2A compliant front for a source agent that is not A2A compliant. The source agent does not change.',
    'The bridge is a chain of policies on an Omni Gateway instance.',
    'Platforms that are already A2A compliant are registered directly.',
    'A2A Connector adds A2A server, client or both to a Mule app.',
    'Inbound authentication is how clients authenticate. Upstream authentication is how the bridge authenticates to the source.',
  ],
  solution: `
**1. A2A.** A2A lets one agent find another and hand it a task. MCP (Model Context Protocol) is different: it is how an AI client lists and calls tools.

**2. How each joins.**
| Agent | Choice | Why |
|---|---|---|
| Agentforce agent | **A2A Bridge** | Not A2A compliant, and it must not change |
| Bedrock AgentCore agent | **Direct registration** | Already A2A compliant |
| Booking Mule app | **A2A Connector** | Adds A2A to a Mule app |

**3. What the bridge does.** It is a chain of policies on an **Omni Gateway** instance (Omni Gateway was formerly Flex Gateway). It:
- Translates requests between A2A and the source agent.
- Manages task state.
- Maps session ids to \`contextId\` and \`taskId\`.
- Derives an agent card, published to Portfolio, that lists the name, description and skills on offer.
`,
  followUps: [
    {
      q: 'Does the Agentforce agent move to Omni Gateway?',
      a: 'No. It keeps running on its own platform. The bridge sits in front of it and translates.',
    },
    {
      q: 'Why does an agent card matter?',
      a: 'It lists the name, description and skills that other agents use for discovery and routing.',
    },
    {
      q: 'Can a Mule app be both an A2A server and client?',
      a: 'Yes. A2A Connector can add server, client or both.',
    },
  ],
}
