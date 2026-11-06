export default {
  id: 'inc-170',
  category: 'incidents',
  title: 'Agents Cannot See a Tool on an MCP Bridge Server: The Filter Showed It, but Nobody Checked It',
  level: 'INTERMEDIATE',
  tags: ['ai-agents', 'agent-fabric', 'mcp'],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: '2026-11-24 11:02:10 INFO  [mcp-client] tools/list on shipping-tools returned: shipping_get_shipments, shipping_get_shipments_id, shipping_get_parcels_id, shipping_delete_shipments_id', relevant: true, why: 'The server answers, and `shipping_post_labels` is not in the list. Tools the server does not expose are not offered to agents.' },
      { text: '2026-11-24 11:02:11 INFO  [returns-agent] No tool available to create a return label, passing the case to staff', relevant: true, why: 'Illustrative line: this is the user impact. The agent is working, but it has no such tool to choose.' },
      { text: '2026-11-24 11:05:33 INFO  [config-review] shipping-tools Select Tools with Filter POST /labels: shipping_post_labels shown, checkbox clear', relevant: true, why: 'This is the cause. The filter makes the tool visible, but the checkbox is what selects it.' },
      { text: '2026-11-24 11:05:58 INFO  [config-review] shipping-tools Select Tools with filter reset: shipping_delete_shipments_id (DELETE /shipments/{id}) checkbox selected', relevant: true, why: 'This is a second finding. Tools hidden by a filter stay selected and stay exposed, so this tool was never removed.' },
      { text: '2026-11-24 11:06:20 INFO  [shipping-api] POST /labels 201 (88 ms) client=warehouse-portal', relevant: true, why: 'The operation works when another client calls the API directly, so the API is not the fault.' },
      { text: '2026-11-24 11:07:00 INFO  [shipping-api] GET /health 200 (3 ms)', relevant: false },
      { text: '2026-11-24 11:07:45 INFO  [monitor] Weekly usage report generated', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'An MCP Bridge server is deployed, but `tools/list` leaves out `shipping_post_labels`. In Select Tools, a filter on POST shows the tool with its checkbox clear. What is the root cause?',
        options: [
          'The tool was never checked, and a filter changes what is shown, not what is selected',
          'The filter on POST blocks all POST operations from reaching the underlying shipping API',
          'Agents can call only GET operations through MCP Bridge, so POST tools are never listed',
          'The agent must request the tool by name with `tools/call` before it appears in the list',
        ],
        answer: 0,
        explain: 'Each selected operation becomes an MCP tool. The docs state: "Filtering changes only which tools are shown, not which tools are selected." A tool that was only shown by the filter was still not selected.',
      },
      {
        type: 'single',
        prompt: 'How do you expose an unselected tool on an MCP Bridge server that is already deployed?',
        options: [
          'Open the server, choose Actions then Edit, check the tool in Select Tools, then Save & Deploy',
          'Apply a new filter for the tool in Select Tools, close the page, and let the filter take effect',
          'Add a new MCP client to the agent, so that it requests the tool from the underlying API',
          'Delete the shipping API from Exchange and publish it again with the operation renamed',
        ],
        answer: 0,
        explain: 'Under MCP Servers, Actions then Edit opens the same steps with the current selections. The change takes effect through Save & Deploy in Review. Enable as tool in the tool\'s Actions menu is the same setting as the checkbox.',
      },
      {
        type: 'single',
        prompt: 'An engineer filtered Select Tools to GET and POST, saw only those tools, and assumed `DELETE` tools were excluded. Those tools still had their checkboxes selected. What happens?',
        options: [
          'The hidden `DELETE` tools remain selected and are exposed by the MCP server',
          'The hidden `DELETE` tools are removed from the MCP server at the next deployment',
          'The hidden `DELETE` tools are listed for agents, but every call to them is refused',
          'The hidden `DELETE` tools stay exposed only until the filter is reset in Select Tools',
        ],
        answer: 0,
        explain: 'The docs state: "Tools hidden by the filter remain selected and are exposed by the MCP server." To remove a tool, filter to it, clear its checkbox, and reset the filter to confirm what remains selected.',
      },
      {
        type: 'multi',
        prompt: 'After changing the selected tools on an MCP Bridge server, you want proof of what agents can really use. Which two checks fit?',
        options: [
          'Reset the filter in Select Tools and confirm the number of tools selected',
          'Request `tools/list` from a client and compare the names with the agreed list',
          'Read the full operation list in the API specification, which matches the tools',
          'Check that the server URL in Review has not changed since the first deployment',
        ],
        answer: [0, 1],
        explain: 'The reset filter shows the real selection, and `tools/list` shows what the server returns to agents. An API specification lists every operation, whether or not it is exposed, which is the point of selecting tools.',
      },
      {
        type: 'order',
        prompt: 'Order the response to a tool missing from an MCP Bridge server.',
        items: [
          'Confirm with `tools/list` that the tool is missing',
          'Confirm that the operation works on the API itself',
          'Open the server with Actions then Edit',
          'Reset the filter and read the selected tools',
          'Check the missing tool and clear any unwanted tool',
          'Save & Deploy, then repeat `tools/list`',
        ],
        explain: 'Prove where the gap is first: the server list, not the API. Reset the filter before you change anything, so that you see the true selection.',
      },
    ],
  },
  description: `
## Symptoms
- A shipping company's returns **agent**, an AI program that decides for itself which steps to take, should create return labels for customers.
- It reaches the company's Shipping API through \`shipping-tools\`, an **MCP** server (MCP is Model Context Protocol: how an AI client lists and calls tools).
- Since this week's release the agent hands every return label request to staff. It reports that it has no tool for the job.
- The agent can still track parcels and read shipments. The Shipping API is healthy.

## Change / Context
- \`shipping-tools\` was built with **MCP Bridge**, which turns an existing API into an MCP server without custom code. Each selected operation becomes an MCP tool.
- MCP Bridge names an API tool with a prefix for the API, then the HTTP method and path. So \`POST /labels\` is the tool \`shipping_post_labels\`.
- When the server was first built, return labels were out of scope, so the engineer cleared the checkbox for \`shipping_post_labels\` in **Select Tools**.
- This week a teammate opened the server with **Actions > Edit** to add return labels. The teammate clicked **Filter**, chose POST and \`/labels\`, and clicked **Apply**. \`shipping_post_labels\` appeared in the list, so the teammate treated it as added, and clicked through to **Save & Deploy**.
- At that first build, the engineer reviewed the list with a filter on GET and POST, saw no \`DELETE\` tools, and told security that the agent "has no DELETE tools".

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
11:02:10 INFO [mcp-client] tools/list on shipping-tools returned: shipping_get_shipments, shipping_get_shipments_id, shipping_get_parcels_id, shipping_delete_shipments_id
11:05:33 INFO [config-review] Select Tools with Filter POST /labels: shipping_post_labels shown, checkbox clear
11:05:58 INFO [config-review] Select Tools with filter reset: shipping_delete_shipments_id (DELETE /shipments/{id}) checkbox selected
11:06:20 INFO [shipping-api] POST /labels 201 (88 ms) client=warehouse-portal
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
    'MCP Bridge exposes only the selected operations, and each one becomes an MCP tool.',
    'Agents find tools through `tools/list`, which returns each tool\'s name, description and input schema.',
    'The docs say filtering changes only which tools are shown, not which are selected.',
    'A tool shown by a filter with a clear checkbox is still not exposed.',
    'Tools hidden by a filter remain selected and are exposed, so the mistake works in both directions.',
    'Enable as tool in the Actions menu is the same setting as the checkbox.',
    'Change an existing server with Actions then Edit, and finish with Save & Deploy.',
    'Reset the filter to confirm the real selection before you deploy.',
  ],
  solution: `
**Diagnosis.** The server answers \`tools/list\`, and the tool is not there. The API accepts \`POST /labels\` from another client, so the API is fine. In **Select Tools**, the filtered view shows \`shipping_post_labels\` with a clear checkbox. The docs state: "Filtering changes only which tools are shown, not which tools are selected." The teammate saw the tool and took that as selection. The log lines are illustrative, and the diagnosis rests on this documented behaviour.

**Immediate mitigation.**
- Open **MCP Servers**, select \`shipping-tools\`, and choose **Actions > Edit**.
- In **Select Tools**, reset the filter and read the full list.
- Check \`shipping_post_labels\`.
- Decide with security whether \`shipping_delete_shipments_id\` should be exposed. If not, clear its checkbox.
- Confirm the number of tools selected, then **Save & Deploy** in **Review**.
- Request \`tools/list\` again and test a return label with a test parcel. The docs do not say how a connected agent picks up a tool change, so confirm this with the agent itself.

**Root cause.** The screen state was read as the server state. The filter shows part of the list, while the checkboxes decide what is exposed. Nobody compared the deployed tool list with the agreed list.

**Permanent fix.**
- Keep an agreed list of tools for each MCP server, with an owner for each.
- Correct the statement given to security: a \`DELETE\` tool was exposed the whole time. Review whether the agent called it.

**Prevention.** Add a release check that compares \`tools/list\` with the agreed list. Reset filters before each review. Treat a change to the tools on a server as a change to what agents are allowed to do.
`,
  followUps: [
    {
      q: 'Why does a hidden tool matter more than a missing one?',
      a: 'A missing tool fails safely: the agent cannot do the work and passes it on. A hidden but selected tool gives an agent a capability that the team believes it does not have.',
    },
    {
      q: 'How do you use the filter correctly to remove write tools?',
      a: 'The docs give this pattern: filter to the methods you want to remove, clear the checkbox for each tool shown, then reset the filter and confirm that only the wanted tools remain selected.',
    },
    {
      q: 'What happens when an agent calls a tool?',
      a: 'The agent sends `tools/call`. MCP Bridge maps the tool name and arguments to an HTTP request to the underlying API or SaaS system, and makes that request.',
    },
    {
      q: 'Can one MCP Bridge server combine several sources?',
      a: 'Yes. APIs and SaaS systems can be combined in one server, and tools are grouped by source in Select Tools. More sources make a review of the selected list more important.',
    },
  ],
}
