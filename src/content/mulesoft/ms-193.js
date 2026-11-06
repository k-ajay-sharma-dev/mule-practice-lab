export default {
  id: 'ms-193',
  category: 'mulesoft',
  title: 'MCP in Plain Terms and What MCP Bridge Does',
  level: 'BEGINNER',
  tags: ['ai-agents', 'agent-fabric', 'mcp'],
  estMinutes: 10,
  quiz: [
    {
      type: 'single',
      prompt: 'A new developer at a retailer asks what MCP (Model Context Protocol) is for. Which answer is right?',
      options: [
        'It is how Mule apps are packaged before they are deployed to CloudHub',
        'It is how an AI client lists the tools on offer and calls them',
        'It is how an AI model is trained on the data in a company database',
        'It is how two Mule apps share one object store across two regions',
      ],
      answer: 1,
      explain: 'MCP is the way an AI client finds out which tools a server offers and then calls them. A tool is one action that the client can ask for, such as looking up an order.',
    },
    {
      type: 'match',
      prompt: 'An AI agent (software that uses an AI model to carry out tasks) uses a shipment API through MCP Bridge, which offers the API as tools through MCP (Model Context Protocol). Match each moment to what is used.',
      pairs: [
        ['The agent asks which tools it may use', '`tools/list`'],
        ['The agent asks for one tool to be run', '`tools/call`'],
        ['The bridge reaches the shipment API', 'An HTTP request'],
      ],
      explain: 'Agents use `tools/list` to see the tools and `tools/call` to run one. The bridge then translates each call into an HTTP request to the API or SaaS system.',
    },
    {
      type: 'single',
      prompt: 'A shipping company has a REST API with many operations, including delete operations. AI agents (software that uses an AI model to carry out tasks) should only track parcels. How should the company set up MCP Bridge?',
      options: [
        'Expose every operation, and tell agents in a note which ones to avoid',
        'Expose every operation, and let the API reject the calls it does not like',
        'Rewrite the API first, so that the delete operations no longer exist',
        'Check only the tracking operations, so that only they become MCP tools',
      ],
      answer: 3,
      explain: 'Each selected operation becomes an MCP tool, and only checked tools are exposed. Through the bridge, an agent cannot call an operation that was never exposed as a tool.',
    },
    {
      type: 'single',
      prompt: 'A bank has an account API that works well. It wants AI agents (software that uses an AI model to carry out tasks) to call the API through MCP (Model Context Protocol). With MCP Bridge, what does the bank have to write?',
      options: [
        'No custom code, as the bridge turns the API into an MCP server',
        'A new Mule app for each operation that the agents have to call',
        'A second copy of the API, written in the format that MCP needs',
        'A DataWeave script for each agent that will connect to the API',
      ],
      answer: 0,
      explain: 'MCP Bridge turns an existing API or SaaS system into an MCP server without custom code. The API itself stays as it is.',
    },
    {
      type: 'single',
      prompt: 'An AI agent sends `tools/call` to an MCP Bridge server for a tool called `getOrder`. The tool comes from an order API. What does the bridge do next?',
      options: [
        'It sends the call back to the agent, which then has to call the API itself',
        'It answers from a copy of the order data that it took when it was created',
        'It translates the call into an HTTP request to the order API',
        'It writes the call to a queue, and a person handles it the next working day',
      ],
      answer: 2,
      explain: 'The bridge translates each tool call into an HTTP request to the API or SaaS system. The agent speaks MCP and the API keeps speaking HTTP.',
    },
    {
      type: 'single',
      prompt: 'An HR team wants AI agents to use operations from its employee API and from a SaaS leave system. Both would be exposed through MCP Bridge, which offers them as tools through MCP (Model Context Protocol). Can one MCP server offer both?',
      options: [
        'No, each MCP server can only offer tools from a single source',
        'Yes, sources can be combined and offered from one MCP server',
        'No, MCP Bridge can use an API or a SaaS system but never both',
        'Yes, but only if the two systems are first merged into one API',
      ],
      answer: 1,
      explain: 'Sources can be combined in one server, so an agent can see the HR tools it needs in one place.',
    },
  ],
  description: `
A shipping company has a parcel tracking API that its website has used for years. Now it wants an **AI agent** to answer "where is my parcel?" in a chat window. An AI agent is software that uses an AI model to carry out tasks.

The agent can't use the API yet. It speaks **MCP** (Model Context Protocol), which is how an AI client lists and calls tools. A **tool** is one action the client can ask for, such as "get parcel status".

The API also has operations that an agent must never touch, such as deleting a parcel.

An architect suggests **MCP Bridge**, part of Agent Fabric, the MuleSoft layer for managing AI agents, MCP servers, APIs and LLM traffic.

**Questions**
1. What is MCP in plain terms?
2. What does MCP Bridge do with the API?
3. How do you keep the delete operation away from agents?
4. What happens when the agent calls a tool?
`,
  answerTemplate: `## MCP in plain terms

## What MCP Bridge does

## Keeping operations away from agents

## What happens on a tool call
`,
  keyPoints: [
    'MCP is how an AI client lists and calls tools.',
    'MCP Bridge turns an existing API or SaaS system into an MCP server without custom code.',
    'Each selected operation becomes an MCP tool, and only checked tools are exposed.',
    'Agents use tools/list to see tools and tools/call to run one.',
    'The bridge translates each call into an HTTP request to the API or SaaS system.',
    'Sources can be combined in one server.',
  ],
  solution: `
**1. MCP.** It gives an AI client two basic moves: ask which tools exist, then call one. The two calls are \`tools/list\` and \`tools/call\`.

**2. MCP Bridge.** It turns the existing API into an MCP server without custom code. Each operation you select becomes a tool.

**3. Keeping delete away.** Check only the operations agents should call, such as getting a parcel status. Only checked tools are exposed, so the delete operation is not offered.

**4. A tool call.**
1. The agent sends \`tools/list\` and sees the tracking tool.
2. The agent sends \`tools/call\` for that tool.
3. The bridge translates the call into an HTTP request to the tracking API.
4. The result goes back to the agent.

The API does not change, and the website keeps using it as before.
`,
  followUps: [
    {
      q: 'What is the difference between an operation and a tool?',
      a: 'An operation belongs to the API. A tool is what the agent sees. In MCP Bridge, each selected operation becomes a tool.',
    },
    {
      q: 'Why expose only some operations?',
      a: 'An agent decides for itself which tool to call, so the safest set is only what it should be calling.',
    },
    {
      q: 'Can MCP Bridge use a SaaS system as well as an API?',
      a: 'Yes. It works with an existing API or SaaS system, and sources can be combined in one server.',
    },
  ],
}
