import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-118',
  category: 'architecture',
  title: 'Retail Support Agent Network: Ingress Omni Gateway, Agent Broker, Two Agents and an MCP Server',
  level: 'INTERMEDIATE',
  tags: ['ai-agents', 'agent-fabric', 'omni-gateway', 'a2a', 'mcp', 'policies'],
  estMinutes: 10,
  diagram: {
    task: 'draw a retail support agent network. The palette has no agent box, so use these boxes and names: a Chatbot box for the customer chat assistant, an API gateway box named Ingress Omni Gateway, an Experience API box named Agent Broker, a Process API box for each of the two agents, a System API box named MCP server, and a Third-party API box named Order API.',
    checks: [
      { label: 'The chat assistant enters through the ingress gateway', rule: { type: 'each', of: 'chatbot', edgeTo: { type: 'api-gateway', label: 'ingress' } } },
      { label: 'The ingress gateway sits in front of the Agent Broker', rule: { type: 'edge', from: { label: 'ingress' }, to: { label: 'broker' } } },
      { label: 'The chat assistant never calls the Agent Broker directly', rule: { type: 'no-edge', from: 'chatbot', to: { label: 'broker' } } },
      { label: 'The Agent Broker routes to two agents', rule: { type: 'edge', from: { label: 'broker' }, to: 'process-api', min: 2 } },
      { label: 'Agents take their tasks only from the Agent Broker', rule: { type: 'only-via', target: 'process-api', from: { label: 'broker' } } },
      { label: 'The network reaches the MCP server', rule: { type: 'path', from: { label: 'broker' }, to: { label: 'mcp' } } },
      { label: 'The Order API is reached only through the MCP server', rule: { type: 'only-via', target: { type: 'external-api', label: 'order api' }, from: { label: 'mcp' } } },
      { label: 'The Agent Broker is reached only through the ingress gateway', rule: { type: 'only-via', target: { label: 'broker' }, from: { type: 'api-gateway', label: 'ingress' } } },
      { label: 'The chat assistant never calls the MCP server directly', rule: { type: 'no-edge', from: 'chatbot', to: 'system-api' } },
      { label: 'Requests, task hand offs and tool calls are sync calls. There is no broker for async work here', rule: { type: 'lines', from: ['chatbot', 'api-gateway', 'experience-api', 'process-api', 'system-api'], to: ['api-gateway', 'experience-api', 'process-api', 'system-api', 'external-api'], kind: 'sync' } },
    ],
    reference: diagram(
      {
        chat: ['chatbot', 'Customer chat assistant'],
        ing: ['api-gateway', 'Ingress Omni Gateway'],
        brk: ['experience-api', 'Agent Broker'],
        ret: ['process-api', 'Returns agent'],
        dlv: ['process-api', 'Delivery agent'],
        mcp: ['system-api', 'MCP server: order tools'],
        api: ['external-api', 'Order API'],
      },
      ['chat -> ing', 'ing -> brk', 'brk -> ret', 'brk -> dlv', 'brk -> mcp', 'mcp -> api'],
    ),
  },
  description: `
A retailer wants one chat assistant on its website for support questions. Today every question lands with a human.

Some terms first:
- An **agent** is an AI powered service that carries out tasks.
- **A2A** (Agent2Agent) is how agents discover each other and delegate tasks.
- **MCP** (Model Context Protocol) is how an AI client lists and calls tools.
- An **LLM** (large language model) is an AI model that reads and writes text. Agents and brokers use one to work out what a customer means.

The plan:
- A **Returns agent** handles return requests, and a **Delivery agent** handles late parcels. Both are A2A compliant.
- An **Agent Broker** picks the right agent for each task.
- Order data lives behind an existing **Order API**. It must appear as MCP tools, and only read operations should be offered.
- Security wants policies applied to all traffic that enters from the website.

**Questions:**
- Draw the agent network.
- What does the ingress Omni Gateway do here?
- What does the Agent Broker do, and how is it defined?
- How does the Order API become MCP tools, and how do you keep write operations away from agents?
`,
  answerTemplate: `## Agent network

## Ingress Omni Gateway

## Agent Broker

## Order API as MCP tools
`,
  keyPoints: [
    'An Agent Network is a coordinated group of agents, brokers, LLMs and MCP servers. The broker graph describes how they work together.',
    'An ingress Omni Gateway sits in front of broker and API endpoints and enforces policies on traffic entering the network. It needs a public endpoint.',
    'An Agent Broker is an intelligent router that sends tasks to the best suited A2A compliant agent or broker.',
    'Brokers and their nodes are defined in Agent Script, a graph that mixes deterministic and non deterministic actions.',
    'MCP Bridge turns an existing API into an MCP server without custom code, and only the checked tools are exposed.',
    'Agents call `tools/list` and `tools/call`, and the bridge translates each call to an HTTP request to the API.',
  ],
  solution: `
**Agent network.**
\`\`\`
 Chat assistant ─► Ingress Omni Gateway ─► Agent Broker ─┬─► Returns agent
                                                         ├─► Delivery agent
                                                         └─► MCP server: order tools ─► Order API
\`\`\`
The broker graph describes the orchestration of agents, tools and LLMs, so the diagram draws the MCP server under the broker. An agent could also be the caller of the tool, so the check accepts a route to the MCP server through an agent.

**Ingress Omni Gateway.** It sits in front of the broker endpoint and enforces policies on traffic entering the network. Omni Gateway is the runtime enforcement point in the request path. Because the website is outside the network, this gateway needs a public endpoint.

**Agent Broker.** It sends each task to the best suited A2A compliant agent. You define it in Agent Script, in an \`.agent\` file, as a graph that can mix fixed steps with steps the model decides. In this case a late parcel goes to the Delivery agent, and a return goes to the Returns agent. Published brokers appear in the Agent Registry, and other brokers can reuse them.

**Order API as MCP tools.** Use MCP Bridge, as the API already exists and needs no custom logic. Each operation you select becomes an MCP tool, and only checked tools are exposed. In Select Tools, clear the checkbox for each write operation and confirm that only read operations stay selected, so agents cannot find or call the others. Choose the MCP Connector instead if a tool needs custom Mule logic.

**Deployment.** The project holds \`agent-network.yaml\`, \`exchange.json\` and the \`.agent\` files. Publishing it to Exchange registers the assets defined in the project as agents or MCP servers, and brokers are published with the agent asset type.
`,
  followUps: [
    {
      q: 'Does the network also need egress?',
      a: 'Yes. Agent Network deployments need both ingress and egress. Egress sits on outbound paths from brokers and agents to external agents. The docs recommend one gateway that handles both jobs. In a private space you can use a separate egress gateway, which has no public endpoint, so only clients in that space reach it.',
    },
    {
      q: 'How would you check that all agents are covered by policies?',
      a: 'Agent Visualizer shows a real time map of agents, MCP servers and LLMs, and it shows which agents lack Omni Gateway policy coverage.',
    },
    {
      q: 'Can the network move to another target after a deployment?',
      a: 'Not in place. It cannot move to another target or gateway without deleting the Runtime Manager application and redeploying, so pick the target with care.',
    },
  ],
}
