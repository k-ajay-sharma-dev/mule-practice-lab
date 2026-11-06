import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-119',
  category: 'architecture',
  title: 'Model Proxy for Internal Agents: Two LLM Providers, Policies and Budget Management',
  level: 'INTERMEDIATE',
  tags: ['ai-agents', 'agent-fabric', 'omni-gateway', 'llm', 'policies', 'security'],
  estMinutes: 15,
  diagram: {
    task: 'draw three internal agents reaching two LLM providers through one Model Proxy. The palette has no agent or model proxy box, so use these boxes and names: an Internal / staff app box for each agent, an Identity provider box, an API gateway box named Policies, an API gateway box named Model Proxy, a Third-party API box for each provider, and a Monitoring box named Budget Management. Send requests from each agent through Policies to the Model Proxy. Draw a line from each agent to the Identity provider for its token, and a line from the Model Proxy to Budget Management for usage.',
    checks: [
      { label: 'At least three internal agents', rule: { type: 'node', match: 'internal-app', min: 3 } },
      { label: 'Every agent gets its token from the identity provider', rule: { type: 'each', of: 'internal-app', edgeTo: 'identity-provider' } },
      { label: 'Every agent sends its requests to the gateway', rule: { type: 'each', of: 'internal-app', edgeTo: 'api-gateway' } },
      { label: 'Requests pass through the policies on the way to the Model Proxy', rule: { type: 'path', from: 'internal-app', to: { label: 'model proxy' }, via: { label: 'policies' } } },
      { label: 'The Model Proxy reaches two LLM providers', rule: { type: 'edge', from: { label: 'model proxy' }, to: 'external-api', min: 2 } },
      { label: 'Providers are reached only through the Model Proxy', rule: { type: 'only-via', target: 'external-api', from: { label: 'model proxy' } } },
      { label: 'Usage from the Model Proxy reaches Budget Management', rule: { type: 'edge', from: { label: 'model proxy' }, to: { label: 'budget' } } },
    ],
    reference: diagram(
      {
        hr: ['internal-app', 'HR assistant agent'],
        ship: ['internal-app', 'Shipping support agent'],
        inv: ['internal-app', 'Invoice agent'],
        idp: ['identity-provider', 'Identity provider'],
        pol: ['api-gateway', 'Policies: JWT Validation, Rogue Agent Detection, Agent Kill Switch'],
        proxy: ['api-gateway', 'Model Proxy on Omni Gateway'],
        oai: ['external-api', 'OpenAI models'],
        ant: ['external-api', 'Anthropic models'],
        bud: ['monitoring', 'Budget Management'],
      },
      [
        'hr -> idp', 'ship -> idp', 'inv -> idp',
        'hr -> pol', 'ship -> pol', 'inv -> pol',
        'pol -> proxy', 'proxy -> oai', 'proxy -> ant', 'proxy -> bud',
      ],
    ),
  },
  description: `
A logistics company has three internal **agents**, AI powered services that carry out tasks: an HR assistant, a shipping support agent and an invoice agent. Each one calls an **LLM** (large language model, an AI model that reads and writes text).

Today each agent holds its own provider keys and calls the provider directly. That causes three problems:

- **Cost:** finance cannot see what each agent spends, and the HR assistant overspent last quarter.
- **Availability:** when one provider blocks or fails a request, the agent has no other route.
- **Security:** nobody can tell which agent sent a prompt, or stop an agent that behaves badly.

The company wants a single governed endpoint in front of two providers, with a spending cap for each agent and a way to contain a risky agent. It has an identity provider that issues a JWT (a signed token) to each agent.

**Questions:**
- Draw the target design.
- Which endpoint format do you choose, and why does it matter now?
- How is the spending of each agent capped, and what happens at the limit?
- Which policies do you apply, and what does each one do?
`,
  answerTemplate: `## Target design

## Endpoint format

## Spending caps

## Policies
`,
  keyPoints: [
    'Model Proxy is one governed endpoint for many LLM providers, deployed to Omni Gateway. Models can be added without changing the endpoint.',
    'The endpoint format is chosen at creation and cannot be changed. OpenAI format works with all providers and supports multi routing and fallback.',
    'Gemini and Anthropic formats are native and support model based routing only.',
    'Budget Management tracks token usage and spend. Model cost settings turn tokens into dollars.',
    'A model wallet caps a caller\'s spend against a provider and needs an identity provider.',
    'At the limit the proxy blocks requests for that provider and model, or sends them to the next model when a fallback route exists. Budgets are approximate.',
    'JWT Validation provides the verified claims that Rogue Agent Detection and Agent Kill Switch use.',
    'Rogue Agent Detection flags risky behaviour for review. Containment through Agent Kill Switch happens only after human review.',
  ],
  solution: `
**Target design.**
\`\`\`
 HR assistant ─┐                                                 ┌─► OpenAI models
 Shipping ─────┼─► Policies ─► Model Proxy on Omni Gateway ──────┼─► Anthropic models
 Invoice ──────┘                                                 └─► Budget Management
 Each agent ─► Identity provider (gets its token)
\`\`\`
In the product the policies are attached to the model proxy and are not a separate hop. The diagram draws them as a box so that you can see them.

**Endpoint format.** Choose OpenAI format. It works with all providers and supports multi routing and fallback, which is the availability requirement. The Gemini and Anthropic formats are native and support model based routing only. The choice is made at creation and cannot be changed, so it has to be right the first time.

**Spending caps.** Set model costs so that token counts read as dollars. Create a model wallet for each agent. A wallet identifies a caller of the proxy from its JWT claims. Add budgets to it: each budget caps spend or tokens for one provider and model over a daily, weekly or monthly period. When usage reaches the limit, the proxy blocks requests for that provider and model. If a fallback route exists, the request goes to the next model on the route. Budgets are approximate, so usage can briefly pass the limit. Treat them as cost control, not as an exact stop.

**Policies.**
| Policy | Job |
|---|---|
| JWT Validation | Verifies the token and publishes the claims that later policies read |
| Rogue Agent Detection | Checks each incoming prompt against anomaly rules, such as PII Leak, Privilege Escalation and Prompt Injection, and flags risky behaviour for review |
| Agent Kill Switch | Blocks a quarantined agent identity from the model proxy |

The Agent Identity Selector must match in Rogue Agent Detection and Agent Kill Switch, and each agent needs its own non human identity provider account. Otherwise you cannot tell the agents apart.

**Wallet setup.** Wallets identify callers from the JWT, so the docs have you disable the default Client ID Enforcement and DataWeave Headers Transformation policies on the proxy, and add JWT Validation.
`,
  followUps: [
    {
      q: 'Does a wallet decide who may use the proxy?',
      a: 'No. A wallet controls spend only. It does not grant or deny access to the proxy. Access is the job of the policies.',
    },
    {
      q: 'What happens if Rogue Agent Detection has no rules?',
      a: 'It forwards everything and detects nothing. Custom rules also do nothing until you add a detection prompt.',
    },
    {
      q: 'Does a flagged agent stop at once?',
      a: 'No. A person reviews the flag and picks Quarantine agent or Clear flags. Quarantine can be reversed with Restore Model Access, and these actions are audited.',
    },
    {
      q: 'Which other features lower the bill?',
      a: 'Semantic routing sends a request to the best match for its topic. Semantic caching returns stored responses for similar requests, and it needs a semantic caching service.',
    },
  ],
}
