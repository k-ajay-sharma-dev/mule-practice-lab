export default {
  id: 'inc-167',
  category: 'incidents',
  title: 'Agent Tool Calls Start Failing After an MCP Connector App Is Scaled to Two Replicas',
  level: 'INTERMEDIATE',
  tags: ['ai-agents', 'mcp'],
  estMinutes: 25,
  investigation: {
    logs: [
      { text: '2026-11-19 14:01:37 INFO  [runtime-manager] mcp-order-tools: replicas changed from 1 to 2 by platform-ops', relevant: true, why: 'This is the change. The failures start after it, and the app is now a deployment with more than one replica.' },
      { text: '2026-11-19 14:02:02 INFO  [mcp-order-tools] Server config uses SSE Server connection, listener on /sse and /message', relevant: true, why: 'This is the transport the docs support only in single replica deployments.' },
      { text: '2026-11-19 14:03:40 INFO  [runtime-manager] mcp-order-tools: 2/2 replicas Running', relevant: true, why: 'Both replicas are healthy, so the fault is not a crash. Running replicas do not show that a deployment shape is unsupported.' },
      { text: '2026-11-19 14:06:11 ERROR [support-agent] tools/call getOrderStatus failed', relevant: true, why: 'Illustrative line: the docs give no error text for this case. It shows the user impact that the timing links to the scale out.' },
      { text: '2026-11-19 14:06:15 INFO  [support-agent] tools/call getOrderStatus succeeded', relevant: true, why: 'Illustrative line: failures mixed with successes show the tool logic itself still works.' },
      { text: '2026-11-19 14:06:30 INFO  [sys-orders] GET /orders/70412 200 (41 ms)', relevant: false },
      { text: '2026-11-19 14:07:00 INFO  [scheduler] Nightly stock sync skipped: outside window', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'A Mule app acts as an MCP server over the SSE server transport, and agent tool calls began failing right after it went from one replica to two. What is the root cause?',
        options: [
          'The SSE server transport is supported only in single replica deployments, and the app now runs two',
          'The second replica has a different version of the `getOrderStatus` tool logic from the first',
          'The `sys-orders` backend API cannot handle requests that arrive from two replicas at once',
          'MCP clients are limited to one tool call at a time, so a second replica breaks them',
        ],
        answer: 0,
        explain: 'The MCP Connector page states the limit and names CloudHub 2.0 with a replica count above one as an affected deployment. It gives no reason or symptom, so the log lines here are illustrative: the answer rests on the documented limit and on the timing.',
      },
      {
        type: 'single',
        prompt: 'Peak trading is under way and the SSE MCP server app must recover now, with no code change. What is the safest immediate action?',
        options: [
          'Return the app to one replica, the deployment shape the docs support for the SSE server',
          'Add a third replica so that more of the failing tool calls land on a healthy one',
          'Restart both replicas and keep the count at two, so that clients reconnect cleanly',
          'Switch the agent to the SSE client connection, so that it no longer needs the server',
        ],
        answer: 0,
        explain: 'Going back to one replica restores a supported shape in one setting. More replicas or a restart leave the app unsupported. The SSE client role is for a Mule app connecting out to a remote MCP server, so it does not replace this server.',
      },
      {
        type: 'single',
        prompt: 'An MCP server built with MCP Connector must run on more than one replica for peak load. What is the right permanent design?',
        options: [
          'Move to the Streamable HTTP Server connection, with clients on one load balanced endpoint',
          'Keep the SSE Server connection, and deploy two separate apps with one replica each and a URL for each client',
          'Keep the SSE Server connection, and give the app bigger replicas so that one is always enough for peak load',
          'Replace the MCP server with a scheduled job that writes order status to a file for agents to read',
        ],
        answer: 0,
        explain: 'The docs say to use the Streamable HTTP server transport in any deployment with more than one replica. It is the recommended transport and lets several instances run behind a load balancer. SSE is deprecated, so more investment in it is the wrong direction.',
      },
      {
        type: 'multi',
        detail: true,
        prompt: 'A Streamable HTTP MCP server on CloudHub 2.0 will run on two replicas and keeps session information in an object store. Which two things does the connector reference ask for?',
        options: [
          'Define a specific object store that is distributed across all replicas',
          'Enable the Clustered option as well as persistence for the deployment',
          'Create one separate object store for each replica, with a different name',
          'Disable sessions by setting the session idle timeout to zero',
        ],
        answer: [0, 1],
        explain: 'The Sessions Object Store row says to define a store distributed across all replicas, that persistence must be enabled for a multi worker deployment, and that on CloudHub 2.0 the Clustered option must also be enabled. Separate stores would not be shared between replicas.',
      },
      {
        type: 'order',
        prompt: 'Order the response to tool calls failing after an SSE MCP server was scaled out.',
        items: [
          'Link the start of the failures to the replica change',
          'Confirm that the app uses the SSE Server connection',
          'Return the app to one replica',
          'Verify tool calls from the agent',
          'Move the server to Streamable HTTP and update client endpoints',
          'Scale out again and test under load',
        ],
        explain: 'Connect the symptom to the change, restore a supported shape, verify, and only then redo the scale out on a transport that supports it.',
      },
    ],
  },
  description: `
## Symptoms
- A retailer runs a support **agent**, an AI program that decides for itself which tools to call to finish a task. It answers "where is my order?" chats.
- The agent reaches order data over **MCP** (Model Context Protocol: how an AI client lists and calls tools).
- Thursday 14:06: some \`getOrderStatus\` tool calls start failing, and others still succeed. Chats fall back to human staff.
- Runtime Manager shows \`mcp-order-tools\` as **2/2 replicas Running**. The \`sys-orders\` API behind the tool is healthy.

## Change / Context
- \`mcp-order-tools\` is a Mule app on CloudHub 2.0. It uses MCP Connector in the server role, so agents can call its tools.
- The app was built last year on the **SSE Server** connection (\`<mcp:sse-server-connection>\`), and it ran on one replica. SSE (Server-Sent Events) keeps a connection open so that a server can push updates to a client.
- At 14:01 platform operations raised the replica count from 1 to 2 (a replica is one running copy of the app), to prepare for the holiday peak. The change note says "no code change, low risk".

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
14:01:37 INFO  [runtime-manager] mcp-order-tools: replicas changed from 1 to 2 by platform-ops
14:02:02 INFO  [mcp-order-tools] Server config uses SSE Server connection, listener on /sse and /message
14:03:40 INFO  [runtime-manager] mcp-order-tools: 2/2 replicas Running
14:06:11 ERROR [support-agent] tools/call getOrderStatus failed
14:06:15 INFO  [support-agent] tools/call getOrderStatus succeeded
\`\`\`

## Your tasks
1. What is the most likely root cause?
2. What do you do right now?
3. What is the permanent fix?
4. How do you stop this class of issue happening again?
`,
  answerTemplate: `## Diagnosis

## Immediate mitigation

## Root cause

## Permanent fix

## Prevention
`,
  keyPoints: [
    'MCP Connector supports two transports: Streamable HTTP, which is recommended, and SSE, which is deprecated.',
    'The docs say the SSE server transport is supported only in single replica deployments.',
    'Affected deployments include CloudHub 2.0 with more than one replica, multi replica Runtime Fabric, on premises clusters, and CloudHub 1 with multiple workers.',
    'The failures start right after the replica change, and no code changed.',
    'Replicas showing Running does not prove that the deployment shape is supported.',
    'Going back to one replica is the quick recovery.',
    'Streamable HTTP lets several instances run behind a load balancer, with clients using one endpoint.',
    'With several replicas, session information needs an object store distributed across all replicas.',
  ],
  solution: `
**Diagnosis.** The failures start minutes after the move from one replica to two. No code changed, both replicas are Running, and the backend answers normally. The app uses the SSE Server connection. The docs state: "The SSE server transport (\`<mcp:sse-server-connection>\`) is supported only in single-replica deployments." They give no reason or symptom, so the failure pattern and the error lines here are illustrative. The diagnosis rests on the documented limit and on the timing.

**Immediate mitigation.**
- Set the replica count back to 1.
- Confirm that \`tools/call\` requests from the agent succeed, and that chats stop falling back to staff.
- Plan capacity for the peak on the single replica until the transport changes.

**Root cause.** Scaling was treated as a safe operations change, but the app's transport supports only one replica. Nobody had recorded that limit against the app.

**Permanent fix.**
- Change the server configuration to the **Streamable HTTP Server** connection. Its \`Listener Config\` points at the HTTP listener, and it exposes one MCP endpoint path.
- Update each MCP client to the new endpoint and to the Streamable HTTP transport. Clients then use one URL, and the load balancer spreads requests across instances.
- Set the Sessions Object Store to a store distributed across all replicas. On CloudHub 2.0 the reference asks for persistence and the Clustered option.
- Test in a lower environment on two replicas, then scale out in production.

**Prevention.** Record the transport of each MCP server app in its design notes. Add a review step for any replica change on an MCP app. Move remaining SSE servers off a deprecated transport before they need to scale.
`,
  followUps: [
    {
      q: 'Does the single replica limit apply to an app that uses the SSE client connection?',
      a: 'No. The docs say the limit does not affect the SSE client, because it makes an outbound connection to a remote MCP server. SSE is still deprecated, so Streamable HTTP remains the better choice.',
    },
    {
      q: 'Why do the docs not explain the exact failure?',
      a: 'The warning gives the rule and the alternative but no mechanism. In an interview, state the documented limit and treat any explanation of the mechanism as your own reasoning.',
    },
    {
      q: 'What does Streamable HTTP not support in MCP Connector?',
      a: 'The connector page lists two limitations: calling the GET endpoint to receive notifications, and resumability and redelivery. Check that no client depends on these before you migrate.',
    },
    {
      q: 'Would MCP Bridge have avoided this?',
      a: 'MCP Bridge turns an existing API or SaaS system into an MCP server without custom code. MCP Connector is for when custom Mule logic is needed. If the tools are plain API operations, the bridge is worth considering, but it is a design change and not a fix for this incident.',
    },
  ],
}
