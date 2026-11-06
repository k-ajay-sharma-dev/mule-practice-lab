export default {
  id: 'ms-194',
  category: 'mulesoft',
  title: 'MCP Bridge or MCP Connector: Which One Fits?',
  level: 'BEGINNER',
  tags: ['ai-agents', 'agent-fabric', 'mcp'],
  estMinutes: 10,
  quiz: [
    {
      type: 'single',
      prompt: 'A retailer has a working product API. AI agents (software that uses an AI model to carry out tasks) should call two of its operations through MCP (Model Context Protocol: how an AI client lists and calls tools). No extra logic is needed. What is the best fit?',
      options: [
        'MCP Connector in a new Mule app, with one flow written for each operation',
        'MCP Bridge, which exposes the two operations as tools without custom code',
        'MCP Connector in client role, so that the product API can call the agents',
        'A new REST API placed beside the old one, written only for the AI agents',
      ],
      answer: 1,
      explain: 'MCP Bridge turns an existing API into an MCP server without custom code. With no custom logic needed, a Mule app would be extra work for nothing.',
    },
    {
      type: 'single',
      prompt: 'A bank wants an MCP (Model Context Protocol: how an AI client lists and calls tools) tool that reads two systems, applies a Mule flow with a fee rule, and returns one answer. What is the best fit?',
      options: [
        'MCP Connector in server role, because custom Mule logic is needed',
        'MCP Connector in client role, because the tool has to read two systems',
        'MCP Bridge, because it can run any Mule flow placed inside its settings',
        'MCP Bridge, because a Mule flow is not able to return an answer to a tool',
      ],
      answer: 0,
      explain: 'MCP Connector runs MCP servers or clients inside a Mule app, and it is the choice when custom Mule logic is needed. The server role exposes Mule apps, connectors and APIs to AI clients.',
    },
    {
      type: 'single',
      prompt: 'A Mule app at a shipping company has to call a tool on an MCP server (a service that offers tools to AI clients through the Model Context Protocol) owned by a partner. What does the Mule app need?',
      options: [
        'MCP Bridge, which turns the Mule app into a tool for the partner',
        'MCP Connector in server role, as the partner will connect to the app',
        'MCP Connector in client role, as the Mule app connects to the server',
        'No MCP product, as an MCP server can only be called by an AI model',
      ],
      answer: 2,
      explain: 'The client role lets a Mule app connect to MCP servers. The Mule app is the one doing the calling here, so it is the client.',
    },
    {
      type: 'match',
      prompt: 'MCP (Model Context Protocol) is how an AI client lists and calls tools. Match each need at a retailer to the best fit.',
      pairs: [
        ['Offer an existing SaaS system to AI agents with no code', 'MCP Bridge'],
        ['Offer a Mule app with custom logic to AI clients', 'MCP Connector, server role'],
        ['Let a Mule app use tools on another MCP server', 'MCP Connector, client role'],
      ],
      explain: 'No code points to MCP Bridge. Custom Mule logic points to MCP Connector. In the connector, server means offering tools, and client means calling them.',
    },
    {
      type: 'single',
      prompt: 'An HR team compares MCP Bridge and MCP Connector, two ways to use MCP (Model Context Protocol: how an AI client lists and calls tools). Which choice leaves the team with a Mule app of its own to build?',
      options: [
        'MCP Bridge, as each checked tool is generated as a separate Mule app',
        'Neither one, as both of them run as settings inside of API Manager',
        'Both of them, as MCP can only ever run inside of a Mule application',
        'MCP Connector, as it runs the MCP server or client inside a Mule app',
      ],
      answer: 3,
      explain: 'MCP Connector lives inside a Mule app, so the team builds and looks after that app. MCP Bridge needs no custom code.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'A Mule app uses MCP Connector in server role and will run as several replicas behind a load balancer. Which transport (the way messages travel between client and server) fits?',
      options: [
        'SSE, as it is the recommended transport for several replicas',
        'Streamable HTTP, as it supports load balanced replicas',
        'SSE, as a load balancer needs a deprecated transport',
        'Streamable HTTP, as it only runs on a single replica',
      ],
      answer: 1,
      explain: 'Streamable HTTP is the recommended transport and supports load balanced deployments with several replicas. SSE is deprecated, and an SSE server is single replica only.',
    },
  ],
  description: `
A retailer is opening its systems to **AI agents**, which are software that uses an AI model to carry out tasks. Agents speak **MCP** (Model Context Protocol), which is how an AI client lists and calls tools. A service that offers tools this way is an **MCP server**.

Three requests arrive in one week:

1. "Let agents read stock levels from the Inventory API. No changes needed."
2. "Give agents a price check tool. It has to read two systems and apply our discount rules, which we already have as Mule flows."
3. "Our order Mule app should call a tool on the MCP server of a delivery partner."

There are two products to pick from. **MCP Bridge** turns an existing API or SaaS system into an MCP server without custom code. **MCP Connector** runs MCP servers or clients inside a Mule app.

**Questions**
1. Which product fits each request, and why?
2. What is the difference between the server and client roles?
3. What question decides between the two products?
`,
  answerTemplate: `## Which product fits each request

## Server and client roles

## The deciding question
`,
  keyPoints: [
    'MCP Bridge turns an existing API or SaaS system into an MCP server without custom code.',
    'MCP Connector runs MCP servers or clients inside a Mule app, and it is for when custom Mule logic is needed.',
    'The server role exposes Mule apps, connectors and APIs to AI clients.',
    'The client role lets a Mule app connect to MCP servers.',
    'Ask two things: is custom Mule logic needed, and is the Mule app offering tools or calling them?',
  ],
  solution: `
**1. Each request.**
| Request | Fit | Why |
|---|---|---|
| Stock levels from the Inventory API | **MCP Bridge** | Existing API, no custom logic |
| Price check with discount rules | **MCP Connector**, server role | Custom Mule logic is needed |
| Order app calls a partner tool | **MCP Connector**, client role | The Mule app does the calling |

**2. The roles.** In the server role, a Mule app offers things to AI clients. In the client role, a Mule app connects to an MCP server and uses its tools.

**3. The deciding question.** Do you need custom Mule logic? If not, and the source is an existing API or SaaS system, use MCP Bridge. If so, use MCP Connector. If a Mule app has to call an MCP server, that also points to MCP Connector, in the client role.
`,
  followUps: [
    {
      q: 'Why not use MCP Connector for everything?',
      a: 'It means building a Mule app. If an existing API only needs to be exposed, MCP Bridge does that without custom code.',
    },
    {
      q: 'Who is the client in the partner example?',
      a: 'The order Mule app, because it connects to the MCP server of the partner.',
    },
    {
      q: 'What does the connector server role expose?',
      a: 'Mule apps, connectors and APIs, which AI clients can then use.',
    },
  ],
}
