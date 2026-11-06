export default {
  id: 'ms-206',
  category: 'mulesoft',
  title: 'Securing MCP and A2A Traffic on Omni Gateway',
  level: 'INTERMEDIATE',
  tags: ['ai-agents', 'omni-gateway', 'agent-fabric', 'mcp', 'a2a', 'security', 'policies'],
  estMinutes: 15,
  quiz: [
    {
      type: 'single',
      prompt: 'A retailer puts an A2A Bridge in front of a Microsoft Copilot Studio agent, so A2A clients (other agents using the Agent2Agent protocol) can reach it. Clients present a JWT, and the bridge sends a Direct Line secret to Copilot Studio. Which is which?',
      options: [
        'The JWT is upstream auth, and the Direct Line secret is inbound auth',
        'The JWT is inbound auth, and the Direct Line secret is upstream auth',
        'Both are inbound auth, as each one protects the bridge from its callers',
        'Both are upstream auth, as each one protects the Copilot Studio agent',
      ],
      answer: 1,
      explain: 'Inbound auth is how clients authenticate to the bridge. The docs name JWT Validation, Basic Authentication and Client ID Enforcement as methods. Upstream auth is how the bridge authenticates to the source agent, and for Copilot Studio the bridge injects the Direct Line secret.',
    },
    {
      type: 'match',
      prompt: 'An HR team runs an MCP server, which offers tools to AI clients through the Model Context Protocol, behind Omni Gateway. Match each need to the policy that meets it.',
      pairs: [
        ['Keep certain tools away from all clients with allow and block rules', 'MCP Global Access'],
        ['Give each client its own subset of tools, based on tier or claims', 'MCP Attribute-Based Access Control'],
        ['Rename tools and rewrite their descriptions for the LLM', 'MCP Tool Mapping'],
      ],
      explain: 'Global Access filters the overall tool list. Attribute-Based Access Control gives each client a tailored subset, using attributes such as tiers, IP addresses, headers or claims. Tool Mapping changes names and descriptions and filters nothing.',
    },
    {
      type: 'single',
      prompt: 'MCP Global Access on Omni Gateway blocks a tool called `delete_account`, so `tools/list` does not show it. A bank\'s AI client already knows the name and sends a `tools/call` for it anyway. What happens?',
      options: [
        'The call goes through, as the policy only filters what `tools/list` returns',
        'The call goes through, but the gateway records it as a policy violation',
        'The gateway rejects the call, as blocked tools are denied on `tools/call` too',
        'The gateway removes the tool from the MCP server, so the call finds nothing',
      ],
      answer: 2,
      explain: 'Hiding is only half of it. A blocked tool is left out of `tools/list`, and a direct `tools/call` for it is rejected with an access denied error. The tool itself stays on the server.',
    },
    {
      type: 'single',
      prompt: 'A shipping company uses MCP Global Access with an Allow rule that matches all tools starting with `shipment_`, and a Block rule for `shipment_cancel`. Is `shipment_cancel` available?',
      options: [
        'Yes, as the Allow rule matches it and Allow rules take precedence',
        'Yes, as the rule listed first is the one that decides the outcome',
        'No, as the rule listed last is the one that decides the outcome',
        'No, as the Block rule matches it and Block rules take precedence',
      ],
      answer: 3,
      explain: 'Rule order does not matter, and Block rules take precedence over Allow rules. With both kinds present, an item is permitted only if it matches an Allow rule and no Block rule.',
    },
    {
      type: 'single',
      prompt: 'A developer at a retailer renames a sensitive MCP tool with MCP Tool Mapping and says, "Now clients cannot use it." What is wrong with that?',
      options: [
        'Tool Mapping changes names and descriptions only, so the tool is still available',
        'Tool Mapping only applies to prompts, so the tool name is not changed by it at all',
        'Tool Mapping needs Attribute-Based Access Control, or the rename will be ignored',
        'Tool Mapping works on the MCP server itself, so the change needs a code release',
      ],
      answer: 0,
      explain: 'Tool Mapping does not filter. To restrict a tool, use MCP Global Access or MCP Attribute-Based Access Control. When you stack them, the order from the gateway toward the client is Global Access, then Tool Mapping, then Attribute-Based Access Control.',
    },
    {
      type: 'single',
      prompt: 'A bank registers HashiCorp Vault as an external vault, and a Model Proxy takes its provider credential from a secret in that vault. An auditor asks what MuleSoft stores about that secret. What is the right answer?',
      options: [
        'An encrypted copy of the value, refreshed from the vault on each sync',
        'Only metadata such as its name and path, as the value stays in the vault',
        'The value in plain text, held in the configuration of the Model Proxy',
        'Nothing at all, as the proxy has to be given the secret by hand each time',
      ],
      answer: 1,
      explain: 'External vaults keep credentials in AWS Secrets Manager, Azure Key Vault or HashiCorp Vault. MuleSoft stores only metadata, and the value is read from the vault when it is needed.',
    },
  ],
  description: `
A retailer is opening up its **AI agents** to other teams. An agent is a program that uses a **large language model (LLM)**, an AI model that reads and writes text, to decide and act.

- An **MCP server** (Model Context Protocol: how an AI client lists and calls tools) offers order tools. Some are safe for all, and some must only reach certain clients.
- A **Microsoft Copilot Studio** agent does not speak **A2A** (Agent2Agent: how agents discover each other and delegate tasks), so it sits behind an **A2A Bridge**, a chain of policies on **Omni Gateway (formerly Flex Gateway)**.
- The security team does not want LLM provider credentials copied into MuleSoft.

**Questions**
1. What is the difference between inbound auth and upstream auth on an A2A Bridge?
2. How do you restrict which MCP tools clients can see and call?
3. What do external vaults do, and what do the docs confirm about them?
4. What else can protect MCP and A2A traffic?
`,
  answerTemplate: `## Inbound and upstream auth

## Restricting MCP tools

## External vaults

## Other protection
`,
  keyPoints: [
    'On an A2A Bridge, inbound auth is how clients authenticate to the bridge, and upstream auth is how the bridge authenticates to the source agent.',
    'The MCP Support policy is required on an MCP server instance and must be first in the policy chain.',
    'MCP Global Access filters tools with allow and block rules. Block rules take precedence, and rule order does not matter.',
    'A blocked tool is left out of tools/list, and a direct tools/call for it is rejected.',
    'MCP Attribute-Based Access Control gives each client a subset of tools. MCP Tool Mapping renames tools and filters nothing.',
    'External vaults keep credentials in place, and MuleSoft stores only metadata. The vault page documents a model proxy as a consumer.',
  ],
  solution: `
**Inbound and upstream auth on an A2A Bridge**

| | Inbound auth | Upstream auth |
|---|---|---|
| Question it answers | How do clients prove who they are to the bridge? | How does the bridge prove who it is to the source agent? |
| Examples | JWT Validation, Basic Authentication, Client ID Enforcement | Agentforce: OAuth values such as client ID and secret. Copilot Studio: Direct Line secret |

For **MCP Bridge**, you supply the credentials it uses to call a SaaS system, and only the tools you check are exposed.

**Restricting MCP tools.** The MCP Support policy must be on the MCP server instance and first in the chain. Then, stacked from the gateway toward the client:

1. **MCP Global Access** filters the overall list with allow and block rules.
2. **MCP Tool Mapping** renames tools and rewrites descriptions. It filters nothing.
3. **MCP Attribute-Based Access Control** gives each client a subset, based on attributes such as tiers, IP addresses, headers or claims.

You can use them alone or together.

**External vaults.** You register AWS Secrets Manager, Azure Key Vault or HashiCorp Vault. The credentials stay there and MuleSoft stores only metadata. The vault page documents a model proxy as a consumer, with its authentication set to come from the vault. It does not describe MCP or A2A credentials, so check the docs before you plan on that.

**Other protection.** Policies for A2A can log or block sensitive information in messages, and validate requests against the specification. Rate Limiting, Spike Control and Message Logging also apply to MCP and A2A servers.
`,
  followUps: [
    {
      q: 'If you use both MCP Global Access and MCP Tool Mapping, which one sees a tool first?',
      a: 'Global Access. Since Tool Mapping does not filter, Global Access must allow a tool before the mapping applies to it.',
    },
    {
      q: 'With only Allow rules in MCP Global Access, what happens to other tools?',
      a: 'They are blocked. Only matching items are permitted. With only Block rules it is the reverse: everything is permitted except matching items.',
    },
    {
      q: 'Are the MCP policies available in Local Mode?',
      a: 'The pages for MCP Support, MCP Global Access and MCP Tool Mapping say they are not supported in Local Mode. They work on Managed Omni Gateway and in Connected Mode.',
    },
  ],
}
