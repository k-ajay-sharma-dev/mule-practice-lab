import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-120',
  category: 'architecture',
  title: 'One Agent Network for Agentforce and Vertex AI: A2A Bridge for One, Direct Registration for the Other',
  level: 'INTERMEDIATE',
  tags: ['ai-agents', 'agent-fabric', 'omni-gateway', 'a2a'],
  estMinutes: 12,
  diagram: {
    task: 'draw an Agentforce agent and a Vertex AI agent brought into one network. The palette has no agent box, so use these boxes and names: an Internal / staff app box for the service desk app, API gateway boxes named Ingress Omni Gateway, Egress Omni Gateway and A2A Bridge, an Experience API box named Agent Broker, a CRM box named Agentforce agent, a Third-party API box named Vertex AI agent, and a Database box named Agents catalog. Draw runtime calls as synchronous lines. Draw registration as asynchronous lines into the Agents catalog, one from the A2A Bridge and one from the Vertex AI agent.',
    checks: [
      { label: 'The service desk app enters through the ingress gateway', rule: { type: 'each', of: 'internal-app', edgeTo: { type: 'api-gateway', label: 'ingress' } } },
      { label: 'The ingress gateway sits in front of the Agent Broker', rule: { type: 'edge', from: { label: 'ingress' }, to: { label: 'broker' } } },
      { label: 'The broker reaches the Agentforce agent through the A2A Bridge', rule: { type: 'path', from: { label: 'broker' }, to: { type: 'crm', label: 'agentforce' }, via: { label: 'bridge' } } },
      { label: 'Only the A2A Bridge calls the Agentforce agent', rule: { type: 'only-via', target: { type: 'crm', label: 'agentforce' }, from: { label: 'bridge' } } },
      { label: 'The broker reaches the Vertex AI agent', rule: { type: 'path', from: { label: 'broker' }, to: { type: 'external-api', label: 'vertex' } } },
      { label: 'No bridge sits in front of the Vertex AI agent', rule: { type: 'no-edge', from: { label: 'bridge' }, to: { type: 'external-api', label: 'vertex' } } },
      { label: 'The bridged agent appears in the Agents catalog through the bridge', rule: { type: 'edge', from: { label: 'bridge' }, to: { label: ['catalog', 'portfolio', 'registry'] }, kind: 'async' } },
      { label: 'The Vertex AI agent is registered directly', rule: { type: 'edge', from: { type: 'external-api', label: 'vertex' }, to: { label: ['catalog', 'portfolio', 'registry'] }, kind: 'async' } },
    ],
    reference: diagram(
      {
        app: ['internal-app', 'Service desk app'],
        ing: ['api-gateway', 'Ingress Omni Gateway'],
        brk: ['experience-api', 'Agent Broker'],
        egr: ['api-gateway', 'Egress Omni Gateway'],
        brg: ['api-gateway', 'A2A Bridge on Omni Gateway'],
        af: ['crm', 'Agentforce agent'],
        vx: ['external-api', 'Vertex AI agent'],
        reg: ['database', 'Agents catalog in Portfolio'],
      },
      [
        'app -> ing', 'ing -> brk', 'brk -> egr', 'egr -> brg', 'egr -> vx', 'brg -> af',
        'brg ~> reg', 'vx ~> reg',
      ],
    ),
  },
  description: `
A bank has two **agents**, AI powered services that carry out tasks, on two different platforms.

- A customer care agent runs on **Salesforce Agentforce**.
- A fraud review agent runs on **Google Vertex AI**.

Staff use a service desk app, and they want one place to ask for help. Teams also keep rebuilding agents because they can't find the ones that exist.

Some terms first:
- **A2A** (Agent2Agent) is how agents discover each other and delegate tasks.
- An **Agent Broker** is a router that sends each task to the best suited A2A compliant agent.
- An **agent card** is the document that describes an agent to others.
- **Portfolio** is the set of services registered in your organization. It is organized into catalogs, such as the **Agents catalog**.

The source platforms belong to other teams, and the Agentforce agent must not be changed.

**Questions:**
- Draw the target design.
- Why does one agent need an A2A Bridge and the other does not?
- What does the bridge do for each request?
- Which two kinds of authentication does the bridge need?
- How do the agents become findable?
`,
  answerTemplate: `## Target design

## Bridge or no bridge

## What the bridge does

## Authentication

## Becoming findable
`,
  keyPoints: [
    'Registration comes first, because you cannot govern what you have not inventoried.',
    'Agent assets in an Agent Network must be A2A compliant.',
    'A2A Bridge is a chain of policies on an Omni Gateway instance that presents an A2A compliant front for a non A2A source agent, such as Agentforce or Microsoft Copilot Studio.',
    'The source agent does not change.',
    'The bridge translates requests, manages task state, and maps session ids to `contextId` and `taskId`.',
    'The bridge derives an agent card and publishes it to the Agents catalog in Portfolio.',
    'Platforms already A2A compliant, such as Amazon Bedrock AgentCore and Google Vertex AI, are registered directly.',
    'Inbound auth is how clients authenticate to the bridge. Upstream auth is how the bridge authenticates to the source.',
  ],
  solution: `
**Target design.**
\`\`\`
 Service desk app ─► Ingress Omni Gateway ─► Agent Broker ─► Egress Omni Gateway ─┬─► A2A Bridge ─► Agentforce agent
                                                                                  └─► Vertex AI agent
 A2A Bridge ─~► Agents catalog
 Vertex AI agent ─~► Agents catalog
\`\`\`
The dashed lines are registration, not runtime calls. The egress gateway sits on outbound paths from brokers to external agents. A single gateway can do both the ingress and egress jobs, so two gateway boxes here show two roles, not a requirement for two gateways.

**Bridge or no bridge.** An Agent Broker works with A2A compliant agents. Agentforce is not A2A compliant, so it needs a front that is. Google Vertex AI is already A2A compliant, and the docs say to register such platforms directly and not bridge them.

**What the bridge does.** It runs as a chain of policies on an Omni Gateway instance, and the Agentforce agent stays as it is. For each request it translates between A2A and the Agentforce Agent API, manages task state, and maps session ids to \`contextId\` and \`taskId\`.

**Authentication.**
| Kind | Who proves what | Example |
|---|---|---|
| Inbound | A2A clients authenticate to the bridge | JWT Validation, Basic Authentication or Client ID Enforcement |
| Upstream | The bridge authenticates to the source | Salesforce org details with a client id and secret |

**Becoming findable.** You create the bridge from the source agent's page in the Agents catalog, so the Agentforce agent must be registered in Portfolio first. The bridge then derives an agent card from it and publishes that card to the Agents catalog. For Vertex AI, use manual registration and upload its agent card file. Teams can then find both agents and reuse them, which answers the rebuilding problem.
`,
  followUps: [
    {
      q: 'What if Agentforce adds native A2A support later?',
      a: 'You can disable the bridge and point consumers at the native endpoint of the platform, without client changes.',
    },
    {
      q: 'What about a platform with no ready made bridge?',
      a: 'Agentforce and Microsoft Copilot Studio are available. For others, the docs point to a custom bridge policy built with the Policy Development Kit, or to the A2A Connector.',
    },
    {
      q: 'Can you change the agent card after the bridge is created?',
      a: 'Yes, with Customize Card, which creates a new bridge version. Some capabilities are set by the platform and locked.',
    },
    {
      q: 'How would you see both agents working together?',
      a: 'Agent Visualizer shows a real time map that includes external platforms. It shows the direction of calls and call volume, so you can trace dependencies and isolate a failing node.',
    },
  ],
}
