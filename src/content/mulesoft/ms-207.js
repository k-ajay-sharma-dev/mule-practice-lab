export default {
  id: 'ms-207',
  category: 'mulesoft',
  title: 'MCP Connector in a Mule App: Server or Client, and Which Transport',
  level: 'BEGINNER',
  tags: ['ai-agents', 'mcp'],
  estMinutes: 10,
  quiz: [
    {
      type: 'single',
      prompt: 'A retailer has a Mule flow that looks up an order. It wants AI clients to call that flow as a tool through MCP (Model Context Protocol, how an AI client lists and calls tools). Which role should the MCP Connector play in the Mule app?',
      options: [
        'Client, so the Mule app connects out to each AI client and sends it the order',
        'Server, so the Mule app exposes the lookup as a tool that AI clients can call',
        'Client, so the Mule app lists the tools that each AI client has installed',
        'Server, so the Mule app calls a tool that a remote AI client is hosting',
      ],
      answer: 1,
      explain: 'The server role exposes Mule apps, connectors and APIs to AI clients. The AI client is the caller, and the Mule app offers the tool.',
    },
    {
      type: 'single',
      prompt: 'A Mule flow that books deliveries must call a tool on a carrier\'s remote MCP (Model Context Protocol) server. Which role should the MCP Connector play in the Mule app?',
      options: [
        'Server, because the Mule app is the side that hosts the carrier tool',
        'Server, because any Mule app that uses a tool must also publish that tool',
        'Client, because the Mule app connects to the remote server and calls its tool',
        'Client, because the carrier server connects in and runs the Mule flow',
      ],
      answer: 2,
      explain: 'The client role lets a Mule app connect to MCP servers. The Mule app is the caller here, and the carrier hosts the tool.',
    },
    {
      type: 'single',
      prompt: 'An MCP (Model Context Protocol) server inside a Mule app must run on several replicas behind a load balancer. A replica is one running copy of the app. Which server transport fits, and why?',
      options: [
        'SSE, because it is the recommended transport and it shares sessions across replicas',
        'SSE, because a long open connection keeps each client on the replica it started with',
        'Streamable HTTP, because each replica publishes its own URL for clients to pick from',
        'Streamable HTTP, because clients use one endpoint and the replicas sit behind it',
      ],
      answer: 3,
      explain: 'Streamable HTTP is the recommended transport. It lets several MCP server instances run behind a load balancer, and clients connect to one endpoint without knowing the individual server URLs. The SSE server transport is deprecated and works only with a single replica.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'A Mule app with two replicas uses the MCP Connector as a client. It reaches a remote MCP (Model Context Protocol) server that offers only SSE. Does the single replica limit of SSE stop this design?',
      options: [
        'No, the limit is on the SSE server, and this client connects outbound to a remote server',
        'No, the limit is removed once a load balancer is placed in front of the two replicas',
        'Yes, any use of SSE in a Mule app means that the app must drop to a single replica',
        'Yes, the remote server must first run the same number of replicas as the Mule app',
      ],
      answer: 0,
      explain: 'The single replica limit applies to the SSE server transport. The SSE client connection is not affected, because it connects outbound. SSE is still deprecated, so prefer Streamable HTTP once the remote server offers it.',
    },
    {
      type: 'single',
      prompt: 'A bank wants AI clients to call a balance check as an MCP (Model Context Protocol) tool. Before it answers, the tool must run custom Mule logic. Which product fits?',
      options: [
        'MCP Bridge, because it runs custom Mule flows inside each tool that it creates',
        'MCP Connector, because the MCP server then runs inside a Mule app with that logic',
        'API Manager, because a policy turns a Mule flow into an MCP tool with no changes',
        'MCP Bridge, because a Mule app cannot act as an MCP server by itself',
      ],
      answer: 1,
      explain: 'MCP Bridge turns an existing API or SaaS system into an MCP server without custom code. When custom Mule logic is needed, MCP Connector runs the MCP server inside the Mule app.',
    },
    {
      type: 'match',
      detail: true,
      prompt: 'Match each need in a Mule app that uses the MCP Connector to the source or operation that meets it.',
      pairs: [
        ['Offer a flow to AI clients as a tool', '`MCP Server - Tool Listener`'],
        ['See which tools a remote server offers', '`MCP Client - List Tools`'],
        ['Run a tool on a remote server', '`MCP Client - Call Tool`'],
        ['Check that a remote server is reachable', '`MCP Client - Ping`'],
      ],
      explain: 'The names show the role. `MCP Server - Tool Listener` is a source that runs its flow when a client calls the tool. The `MCP Client` operations here run inside a flow and reach out to a remote server.',
    },
  ],
  description: `
A retailer already runs its order lookups in Mule. Two new requests arrive.

- **Request 1:** AI clients should be able to look up an order. An **AI client** is an AI tool or assistant that can use outside tools.
- **Request 2:** a Mule flow that books deliveries should call a tool on a carrier's remote server.

Both requests use **MCP** (Model Context Protocol), which is how an AI client lists and calls tools. The **MCP Connector** runs MCP servers or clients inside a Mule app, so you don't need a separate hosting environment for them. The order app will run on several replicas behind a load balancer. A **replica** is one running copy of the app.

**Questions**
1. Which role does the connector play for each request?
2. Which transport suits an MCP server with several replicas, and why?
3. When do you pick the MCP Connector over MCP Bridge?
`,
  answerTemplate: `## Role for each request

## Transport for several replicas

## MCP Connector or MCP Bridge
`,
  keyPoints: [
    'MCP (Model Context Protocol) is how an AI client lists and calls tools.',
    'The server role exposes Mule apps, connectors and APIs to AI clients. It also lets AI clients reach legacy and SaaS systems that have no MCP support of their own.',
    'The client role lets a Mule app connect to remote MCP servers.',
    'The MCP server or client runs inside Mule, so it needs no separate hosting environment.',
    'Streamable HTTP is the recommended transport. SSE is deprecated.',
    'For an MCP server on more than one replica, use Streamable HTTP. The SSE server transport works only on a single replica.',
    'Use the MCP Connector when custom Mule logic is needed. MCP Bridge turns an existing API or SaaS system into an MCP server without custom code.',
  ],
  solution: `
**Role for each request**
| Request | Who calls | Who hosts the tool | Role in the Mule app |
|---|---|---|---|
| AI clients look up an order | The AI client | The Mule app | Server |
| The flow calls a carrier tool | The Mule app | The carrier | Client |

The working rule: ask who hosts the tool. If the Mule app hosts it, the app is the server. If the Mule app calls it, the app is the client.

**Transport for several replicas:** use Streamable HTTP. It lets several MCP server instances run behind a load balancer, and clients connect to one endpoint such as \`/mcp\` without knowing the individual server URLs. The SSE server transport is deprecated and works only on a single replica. The limit does not touch an SSE client connection, because that connects outbound to a remote server.

**MCP Connector or MCP Bridge:** if an existing API or SaaS system only needs to appear as tools, MCP Bridge does that without custom code. If the tool needs custom Mule logic, build it in a Mule app with the MCP Connector.
`,
  followUps: [
    {
      q: 'Can one retailer use both roles?',
      a: 'Yes. The roles are separate configurations in the connector, Server and Client. A flow can offer a tool in one place and call a remote tool in another.',
    },
    {
      q: 'Why does the docs page suggest simpler tools over one large API?',
      a: 'It says to expose APIs with complex endpoints as simpler, more atomic tools or resources, because those suit agents better. An agent is an AI powered service that carries out tasks.',
    },
    {
      q: 'Does a client need to know how many replicas are running?',
      a: 'No. With Streamable HTTP the client connects to one endpoint, and the load balancer spreads the work across the replicas behind it.',
    },
  ],
}
