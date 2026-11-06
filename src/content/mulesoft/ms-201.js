export default {
  id: 'ms-201',
  category: 'mulesoft',
  title: 'Ingress and Egress Gateways Around an Agent Network',
  level: 'INTERMEDIATE',
  tags: ['ai-agents', 'agent-fabric', 'omni-gateway', 'a2a', 'policies', 'security'],
  estMinutes: 15,
  quiz: [
    {
      type: 'single',
      prompt: 'A shipping company has an Agent Network, which is a coordinated group of AI agents, brokers and MCP servers. A customer portal on the internet calls one of its brokers. Where should the policies for those incoming calls be enforced?',
      options: [
        'On the egress gateway, which needs a public endpoint for portal traffic',
        'On the ingress gateway, which sits in front of the broker endpoints',
        'On the egress gateway, which checks a call once it reaches the broker',
        'On the ingress gateway, which sits on the outbound paths from the agents',
      ],
      answer: 1,
      explain: 'The ingress gateway sits in front of broker and API endpoints and enforces policies on traffic entering the Agent Network. It needs a public endpoint so outside clients can reach it.',
    },
    {
      type: 'single',
      prompt: 'A broker in a bank\'s Agent Network delegates a credit check to an AI agent run by an outside partner. Which gateway does that outbound call go through?',
      options: [
        'The ingress gateway, as all traffic in a network shares that one entry point',
        'Neither gateway, as a broker can call an external agent with no gateway at all',
        'The ingress gateway, as the partner agent will reply through a public endpoint',
        'The egress gateway, which handles traffic from brokers to external agents',
      ],
      answer: 3,
      explain: 'Traffic that leaves the private space for external services goes through the egress gateway. It enforces policies, manages connections and emits telemetry for those outbound calls.',
    },
    {
      type: 'single',
      prompt: 'A tester on a home laptop sends a request to the egress gateway of a retailer\'s Agent Network and cannot reach it. A broker in the same private space reaches it with no trouble. What explains this?',
      options: [
        'This is expected, as an egress gateway has no public endpoint for outside clients',
        'This is a fault, as the public endpoint on the egress gateway has not started yet',
        'This is a fault, as the tester needs an ingress policy added to the egress gateway',
        'This is expected, as an egress gateway accepts requests from brokers on the internet',
      ],
      answer: 0,
      explain: 'The egress gateway has no public endpoint, and only clients in the same private space can send it requests. That lack of a public endpoint is the only functional difference between the two gateway types.',
    },
    {
      type: 'single',
      prompt: 'An agent instance on Omni Gateway has several upstreams, which are the services it sends traffic to. All incoming calls must present a valid client ID, and one upstream URL needs its own handling. Which policy design fits?',
      options: [
        'One outbound policy for the client ID check, and an inbound policy for that one upstream',
        'One outbound policy for each upstream, as outbound policies cover all traffic to the instance',
        'One inbound policy for the client ID check, and an outbound policy for that one upstream',
        'One inbound policy for each upstream, as inbound policies only cover traffic to one URL',
      ],
      answer: 2,
      explain: 'Inbound policies apply to all traffic reaching the endpoint of an instance. Outbound policies apply only to traffic going to one specific URL.',
    },
    {
      type: 'single',
      prompt: 'A bank plans an Agent Network with no outside partners today, and asks whether it can leave out the egress gateway to save effort. What is the right answer?',
      options: [
        'Yes, an egress gateway is only for networks that have external agents on day one',
        'No, as an Agent Network deployment requires both an ingress and an egress gateway',
        'Yes, the ingress gateway takes on the egress role when no egress gateway is present',
        'No, as a single egress gateway is what an Agent Network deployment always requires',
      ],
      answer: 1,
      explain: 'Agent Network deployments require both an ingress and an egress Omni Gateway. Anypoint Code Builder and Anypoint CLI are the simplest ways to deploy them, and you can also create them by hand in Runtime Manager. Use names that show which is which.',
    },
    {
      type: 'single',
      prompt: 'An HR team deployed its Agent Network and then found it had chosen the wrong gateway. It wants the network on a different gateway. What does it have to do?',
      options: [
        'Change the gateway name in the project file, and restart the deployed brokers',
        'Edit the gateway setting in API Manager, and the running network moves across',
        'Publish a new version to Exchange, and the network moves on the next request',
        'Delete the application in Runtime Manager, then deploy the network again',
      ],
      answer: 3,
      explain: 'Once deployed, an Agent Network cannot move to another target or gateway without deleting the Runtime Manager application and redeploying. It is worth checking this choice before the first deployment.',
    },
  ],
  description: `
A shipping company is building an **Agent Network**: a coordinated group of agents, brokers, large language models and MCP servers. An **agent** is a program that uses a **large language model (LLM)**, an AI model that reads and writes text, to decide and act. A **broker** is an intelligent router that sends each task to the best suited agent, using **A2A** (Agent2Agent: how agents discover each other and delegate tasks). **MCP** (Model Context Protocol) is how an AI client lists and calls tools.

Two kinds of traffic cross the edge of the network.

- A customer portal on the internet calls a broker to ask about a delivery.
- A broker delegates a customs check to an agent run by a partner company.

The architect has to place **Omni Gateway (formerly Flex Gateway)** on both paths.

**Questions**
1. What does the ingress gateway do, and what does it need?
2. What does the egress gateway do, and who can reach it?
3. What is the difference between inbound and outbound policies?
4. What should the team decide before the first deployment?
`,
  answerTemplate: `## Ingress gateway

## Egress gateway

## Inbound and outbound policies

## Before the first deployment
`,
  keyPoints: [
    'Agent Network deployments require both an ingress and an egress Omni Gateway.',
    'Ingress sits in front of broker and API endpoints, enforces policies on incoming traffic and needs a public endpoint.',
    'Egress handles outbound traffic from brokers and agents to external agents. It enforces policies, manages connections and emits telemetry.',
    'Egress has no public endpoint, so only clients in the same private space can reach it. This is the only functional difference between the two.',
    'Inbound policies apply to all traffic reaching an instance. Outbound policies apply only to traffic going to one specific URL.',
    'A deployed Agent Network cannot change target or gateway without deleting the Runtime Manager application and redeploying.',
  ],
  solution: `
**Ingress gateway.** It sits in front of the broker and API endpoints and enforces policies on traffic entering the network. It needs a public endpoint. The customer portal call goes through it.

**Egress gateway.** It sits on the outbound paths from brokers and agents to external agents. It enforces policies, manages connections and emits telemetry. It has no public endpoint, so only clients in the same private space can send it requests. The call to the partner agent goes through it.

| | Ingress | Egress |
|---|---|---|
| Direction | Traffic entering the network | Traffic leaving for external agents |
| Public endpoint | Yes | No |
| Who reaches it | Outside clients | Clients in the same private space |

**Inbound and outbound policies.** An inbound policy applies to all traffic reaching the endpoint of an instance, such as a client ID check. An outbound policy applies only to traffic going to one specific URL, so it can cover one upstream out of several.

**Before the first deployment.** The network needs both gateways, even with no partners today. Choose the target and gateways with care, because moving a deployed network means deleting the Runtime Manager application and redeploying. Anypoint Code Builder or Anypoint CLI can deploy both gateways, or you can create them by hand in Runtime Manager. Give each a name that shows whether it is ingress or egress.
`,
  followUps: [
    {
      q: 'If you create the gateways by hand, what makes one of them an egress gateway?',
      a: 'It has no public endpoint. An ingress gateway has one configured, and that is the only functional difference. A descriptive name helps people tell them apart.',
    },
    {
      q: 'Can a client on the internet call an egress gateway?',
      a: 'No. Only clients in the same private space can send it requests.',
    },
    {
      q: 'Why decide the gateway before deploying an Agent Network?',
      a: 'Because a deployed network cannot move to another target or gateway. You would have to delete the Runtime Manager application and redeploy.',
    },
  ],
}
