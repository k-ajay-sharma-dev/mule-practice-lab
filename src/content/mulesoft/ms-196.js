export default {
  id: 'ms-196',
  category: 'mulesoft',
  title: 'Agent Broker and Agent Network: Routing Tasks to the Right Agent',
  level: 'BEGINNER',
  tags: ['ai-agents', 'agent-fabric', 'a2a', 'mcp'],
  estMinutes: 10,
  quiz: [
    {
      type: 'single',
      prompt: 'A bank has separate AI agents (software that uses an AI model to carry out tasks) for loans, cards and fraud. Each is compliant with A2A (Agent2Agent: how agents discover each other and delegate tasks). What decides which agent gets each customer task?',
      options: [
        'The Agent Registry, which matches each task to the skills on agent cards',
        'An Agent Broker, an intelligent router that picks the best suited agent',
        'Agent Visualizer, whose map sets which agent each kind of task goes to',
        'Omni Gateway, which routes each task by the path the client calls',
      ],
      answer: 1,
      explain: 'An Agent Broker sends tasks to the best suited A2A compliant agent or broker. The Agent Registry is an inventory and Agent Visualizer is a map, so neither routes tasks. Omni Gateway enforces policies on traffic but does not choose an agent for a task.',
    },
    {
      type: 'single',
      prompt: 'A retailer wants its Agent Broker to always run a fixed fraud check step, and to let AI judgment (non deterministic, so results can vary) pick the agent for other steps. How are brokers defined to allow this?',
      options: [
        'In `agent-network.yaml`, as routes the broker walks in order',
        'In a DataWeave script that the broker runs to choose each step',
        'In Agent Script, a graph mixing both kinds of action',
        'In an LLM prompt that the broker sends to the model for each step',
      ],
      answer: 2,
      explain: 'Brokers and their nodes are defined in Agent Script (`.agent` files). It is a graph that mixes deterministic actions, which are fixed, with non deterministic ones.',
    },
    {
      type: 'single',
      prompt: 'A shipping company wires an Agent Broker, two AI agents (software that uses an AI model to carry out tasks) and some MCP tools (actions offered through the Model Context Protocol) into one routing graph. What is the whole thing called, and how does it go live?',
      options: [
        'An Agent Network, published and then deployed',
        'An Agent Registry, deployed one part at a time',
        'A Governance Strategy, applied to each part alone',
        'A Scanner, run on a schedule for each of the parts',
      ],
      answer: 0,
      explain: 'An Agent Network is a coordinated group of agents, brokers, LLMs and MCP servers. You publish the project to Exchange, then deploy the network, including its brokers.',
    },
    {
      type: 'single',
      prompt: 'One team at a retailer has published an Agent Broker that routes returns tasks to the right AI agent. A second team needs the same routing. What is the best step?',
      options: [
        'Write a new broker, as a broker serves only the network it was built in',
        'Copy the `.agent` files of the first team into a new network project',
        'Run a Scanner so that it registers a second copy of the broker',
        'Find the published broker in the Agent Registry and reuse it',
      ],
      answer: 3,
      explain: 'After an agent network is published, its brokers appear as specialized agents in the Agent Registry, and other brokers can reuse them. Copying the files makes a second broker to keep in step, and Scanners discover assets on cloud providers rather than copy them.',
    },
    {
      type: 'single',
      prompt: 'A developer wants to describe an Agent Network (AI agents and a broker wired together) in plain words and get a first draft of the YAML and Agent Script. What in Anypoint Code Builder does this?',
      options: [
        'APIkit, which creates flows from an API spec',
        'MuleSoft Vibes, an AI assistant that generates them',
        'Agent Visualizer, which draws the files as a map',
        'Scanners, which read cloud providers for the files',
      ],
      answer: 1,
      explain: 'MuleSoft Vibes is an AI assistant in Anypoint Code Builder. It generates YAML and Agent Script from a description.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'An Agent Network (AI agents and a broker wired together) is live on a CloudHub 2.0 shared space. The team now wants it on Runtime Fabric. What has to happen?',
      options: [
        'Change the target in `agent-network.yaml`, and the network moves by itself',
        'Publish a new version to Exchange, which redeploys it to the new target',
        'Delete the Runtime Manager application and redeploy to the new target',
        'Add Runtime Fabric as a second target, and move traffic once it starts',
      ],
      answer: 2,
      explain: 'Once deployed, an Agent Network can\'t move to another target or gateway without deleting the Runtime Manager application and redeploying. So choose the target with care.',
    },
  ],
  description: `
A bank has three **AI agents**, which are software that uses an AI model to carry out tasks: one for loans, one for cards and one for fraud. All three are **A2A** compliant. A2A (Agent2Agent) is how agents discover each other and delegate tasks.

Customers don't know or care which agent they need. They type "my card was charged twice" and expect an answer.

The bank also has **MCP** tools it wants in the mix. MCP (Model Context Protocol) is how an AI client lists and calls tools.

An architect proposes an **Agent Broker** and an **Agent Network**.

**Questions**
1. What does an Agent Broker do?
2. How is a broker defined?
3. What is an Agent Network, and how does it go live?
`,
  answerTemplate: `## What an Agent Broker does

## How a broker is defined

## What an Agent Network is
`,
  keyPoints: [
    'An Agent Broker is an intelligent router that sends tasks to the best suited A2A compliant agent or broker.',
    'Brokers and their nodes are defined in Agent Script (.agent files), a graph mixing deterministic and non deterministic actions.',
    'Published brokers appear as specialized agents in the Agent Registry, and other brokers can reuse them.',
    'An Agent Network is a coordinated group of agents, brokers, LLMs and MCP servers, wired together through the broker graph.',
    'Agent Networks are built with MuleSoft Vibes, Anypoint Code Builder or Anypoint CLI.',
  ],
  solution: `
**1. Agent Broker.** It is an intelligent router. It takes a task such as "my card was charged twice" and sends it to the best suited A2A compliant agent, or to another broker. Here that could be the cards agent.

**2. How it is defined.** Brokers and their nodes are written in **Agent Script**, in \`.agent\` files. Agent Script describes a graph that mixes two kinds of action:
- **Deterministic:** fixed steps that always behave the same way.
- **Non deterministic:** steps where the result can vary, such as AI judgment.

**3. Agent Network.** It is a coordinated group of agents, brokers, LLMs and MCP servers, wired together through the broker graph. Its project files are \`agent-network.yaml\`, \`exchange.json\` and the \`.agent\` files. You can build it with MuleSoft Vibes, Anypoint Code Builder or Anypoint CLI. It is published as Exchange assets, one per broker, agent and MCP server. It deploys to a CloudHub 2.0 shared or private space, or to Runtime Fabric.
`,
  followUps: [
    {
      q: 'Can a broker send a task to another broker?',
      a: 'Yes. A broker routes to the best suited A2A compliant agent or broker.',
    },
    {
      q: 'Where can other teams find a published broker?',
      a: 'In the Agent Registry, where it appears as a specialized agent that other brokers can reuse.',
    },
    {
      q: 'What happens when a network is published?',
      a: 'Exchange creates an asset for each broker, agent and MCP server, so other teams can find and reuse them.',
    },
  ],
}
