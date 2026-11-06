export default {
  id: 'ms-198',
  category: 'mulesoft',
  title: 'Governance Strategies and Open Policies Across Gateways and Third Party APIs',
  level: 'INTERMEDIATE',
  tags: ['ai-agents', 'agent-fabric', 'omni-gateway', 'policies', 'security'],
  estMinutes: 15,
  quiz: [
    {
      type: 'match',
      prompt: 'After a merger, a bank has AI agents (software that uses an AI model to carry out tasks) and APIs behind gateways from several vendors. Match each need to the part of Agent Fabric that fits.',
      pairs: [
        ['Define a data privacy rule once and find the services that break it', 'Governance Strategies'],
        ['Write one CORS control and apply it on gateways from two vendors', 'Open Policies'],
        ['See which agents lack Omni Gateway policy coverage on a live map', 'Agent Visualizer'],
      ],
      explain: 'Governance Strategies define rules and identify nonconforming services. Open Policies are authored once and translated for each gateway. Agent Visualizer maps agents and shows coverage gaps.',
    },
    {
      type: 'single',
      prompt: 'A retailer runs APIs on Omni Gateway (formerly Flex Gateway) and on Kong Gateway. Both need the same IP allowlist. Which design sets this up with the least repeated work?',
      options: [
        'Write the allowlist by hand in the format of each gateway, and compare them monthly',
        'Move every API to one gateway first, as a policy cannot cover two kinds of gateway',
        'Author it once as an Open Policy, and let MuleSoft translate it for each gateway',
        'Put the allowlist in the code of each API, so that no gateway has to enforce it',
      ],
      answer: 2,
      explain: 'Open Policies are authored once and translated by MuleSoft for each gateway, including gateways from other vendors such as Kong Gateway. IP allowlisting is one of the examples. After that, only native policies remain on each gateway.',
    },
    {
      type: 'single',
      prompt: 'A shipping company has an important API on a third party gateway that will stay there for years. The compliance team must still check it against company standards. What is the best design?',
      options: [
        'Leave it out of governance, and review that API by hand once a year',
        'Bring it under governance where it runs, in the same conformance view as the rest',
        'Move it to Omni Gateway, as governance cannot reach an API on another gateway',
        'Rebuild it as a Mule app, as only Mule apps can be checked for conformance',
      ],
      answer: 1,
      explain: 'Services on a third party gateway still have to meet your standards. Federated governance puts those APIs in the same conformance view, so they do not escape oversight.',
    },
    {
      type: 'single',
      prompt: 'A bank adds a new data privacy rule to a Governance Strategy. Some payment services may not conform yet, and stopping them on the first day would hurt customers. Which rollout would you recommend?',
      options: [
        'Flag noncompliant activity first, fix what is found, then consider blocking',
        'Block noncompliant activity on the first day, and fix the services after that',
        'Apply the rule only to services that are already known to conform to it',
        'Hold the rule back until every team has reported that it is ready for it',
      ],
      answer: 0,
      explain: 'Governance Strategies can block or flag noncompliant activity, but the docs set no rollout order. Flagging first is design advice: it shows the size of the problem without stopping live payments, and blocking can come once the services are fixed.',
    },
    {
      type: 'single',
      prompt: 'An auditor at an insurer finds a live AI agent (software that uses an AI model to carry out tasks) that no Governance Strategy report mentions. The strategies themselves are correct. What is the most likely gap, and what is the fix?',
      options: [
        'The strategy is too strict, so loosen its rules until the agent shows up',
        'The agent lacks an LLM budget, so create a daily budget for the agent',
        'The gateway is out of date, so replace it with one from a different vendor',
        'The agent is not in the inventory, so register it and run Scanners',
      ],
      answer: 3,
      explain: 'You can\'t govern what you haven\'t inventoried. Registering the agent brings it into view, and Scanners discover other assets on cloud providers, so one gap does not stay hidden.',
    },
    {
      type: 'single',
      prompt: 'During an incident, every service at a retailer shows as conforming to its Governance Strategy, yet customers report failed orders. What should the team conclude, and where should it look next?',
      options: [
        'Conformance proves the fault is with the customers, so no check is needed',
        'Conformance is not the same as healthy traffic, so check Monitor for errors',
        'The Governance Strategy has blocked the orders, so remove the strategy now',
        'The Open Policies have expired, so author all of them again for each gateway',
      ],
      answer: 1,
      explain: 'A defined policy is not the same as healthy traffic. Monitor shows latency, error rates and request volume, so it is where to look when rules are met but things still fail.',
    },
  ],
  description: `
Two banks have merged. The new bank has APIs on **Omni Gateway** (formerly Flex Gateway), which enforces rules on traffic at run time. It also has APIs on a **third party gateway**, meaning a gateway from another vendor, plus **AI agents**, which are software that uses an AI model to carry out tasks.

Each side brought its own security rules. The Chief Risk Officer wants one standard in four areas: access, data privacy, performance and cost, and compliance.

The architects are looking at two parts of **Agent Fabric**, the MuleSoft layer for managing agents, APIs and AI traffic: **Governance Strategies** and **Open Policies**.

**Questions**
1. What is each one for, and how do they work together?
2. How do you handle the APIs on the third party gateway?
3. How would you roll out a new rule without stopping live services?
4. What can these two features not tell you?
`,
  answerTemplate: `## What each one is for

## APIs on the third party gateway

## Rolling out a new rule

## What they cannot tell you
`,
  keyPoints: [
    'Governance Strategies define rules once for access, data privacy, performance and cost, and compliance, and apply them to in scope services.',
    'They identify nonconforming services and can block or flag.',
    'Open Policies are authored once and translated by MuleSoft for each gateway, including other vendors. After that, only native policies remain, so later changes are made on each gateway.',
    'Examples of Open Policies are API key enforcement, CORS, IP allowlisting and JWT validation.',
    'Services on a third party gateway still must meet your standards, and they can appear in the same conformance view.',
    'Registration comes first, and a defined policy is not the same as healthy traffic.',
  ],
  solution: `
**1. What each one is for.**
| | Governance Strategies | Open Policies |
|---|---|---|
| Job | Say what the standard is and find who breaks it | Provide a control that gateways enforce |
| Written | Once, then applied to in scope services | Once, then translated by MuleSoft for each gateway |
| Example | A rule for data privacy | JWT validation, CORS, IP allowlisting |

A sensible way to use them together: let the strategy say what the rule is, and use an Open Policy to put one control on each supported gateway.

**2. The third party gateway.** Connect the provider and run a scanner, so its APIs appear in your inventory. They still must meet your standards. Federated governance, which means governance across gateways, puts them in the same conformance view. If the gateway is supported, such as Kong Gateway or Google Apigee, Open Policies can carry the same controls to it.

**3. Rolling out a rule.** A strategy can block or flag noncompliant activity, and a Control strategy blocks only where that is supported. The docs set no rollout order, so this is design advice: start by flagging, so you can see which services don't conform without stopping them. Fix them, then decide where blocking is right.

**4. What they can't tell you.**
- They can't cover what isn't registered, so make sure the inventory is complete first. Scanners help here.
- They don't show that traffic is healthy. For that, use Monitor, which shows latency, error rates and request volume.
`,
  followUps: [
    {
      q: 'Why not write the same policy by hand for each gateway?',
      a: 'The same control is a different native policy on each gateway, so gaps appear. An Open Policy is authored once and translated by MuleSoft. Later changes are made on the native policies, because no open object remains.',
    },
    {
      q: 'When would you move from flagging to blocking?',
      a: 'The docs set no rule for this. As advice, wait until the services that matter conform and the owners know what a block will stop. It is a judgment call for each rule.',
    },
    {
      q: 'Does a conforming service mean a healthy service?',
      a: 'No. Conformance says the rules are met. Monitor tells you how the traffic is doing.',
    },
  ],
}
