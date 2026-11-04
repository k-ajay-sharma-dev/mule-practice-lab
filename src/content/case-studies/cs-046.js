export default {
  id: 'cs-046',
  category: 'case-studies',
  title: 'Answering a Board Concern About Vendor Lock-In',
  level: 'EXPERT',
  tags: ['vendor-lock-in', 'exit-strategy', 'architecture-governance', 'portability', 'risk'],
  estMinutes: 50,
  quiz: [
    {
      type: 'match',
      prompt: 'Match each area to its realistic lock-in level.',
      pairs: [
        ['API contracts (RAML / OAS)', 'Low — exportable and usable in other gateways'],
        ['API consumers', 'Low–Medium — they see HTTP contracts; auth/policies may change'],
        ['Platform services (Anypoint MQ, Object Store, CloudHub, policies)', 'Medium — equivalents exist but need re-plumbing'],
        ['Mule flows and DataWeave logic', 'Medium–High — must be re-implemented and re-tested'],
      ],
      explain: 'Lock-in is assessed per layer. Contracts are standard and portable; the real cost sits in the integration logic, which would exist on any platform.',
    },
    {
      type: 'single',
      prompt: 'What is usually the most expensive part of a full exit?',
      options: [
        'Exporting the API specifications from Exchange',
        'Re-implementing and re-testing the integration logic across ~220 applications, plus dual running during the transition',
        'Changing the consumers, because they call Mule-specific protocols',
        'Retraining the board on the new platform',
      ],
      answer: 1,
      explain: 'Contracts and consumers are comparatively cheap because they use standard HTTP APIs. The volume of flows and DataWeave logic to rebuild and test, plus paying for two platforms during migration, drives the cost.',
    },
    {
      type: 'multi',
      prompt: 'Which measures reduce dependency cheaply **without** slowing delivery?',
      options: [
        'Keep API specs in Git as well as in Exchange',
        'Write an architecture decision record whenever a proprietary feature is adopted, stating why and its exit cost',
        'Export logs and metrics to the company\'s own observability tooling',
        'Use a thin internal messaging module so the broker can change',
        'Ban Anypoint MQ and Object Store "just in case"',
        'Rewrite all integrations as plain Java microservices',
      ],
      answer: [0, 1, 2, 3],
      explain: 'Good-practice measures that teams barely notice give real portability. Banning platform features or rewriting everything is "lowest common denominator" architecture: it slows delivery and wastes the investment.',
    },
    {
      type: 'single',
      prompt: 'A board member asks: "Would plain Java microservices remove the lock-in?" Best answer?',
      options: [
        'Yes — open-source code has no lock-in',
        'No — it shifts lock-in to custom code, frameworks and the team that wrote it, and gives up connectors, productivity and governance; the goal is to know and price dependencies',
        'Yes, but only if deployed on Kubernetes',
        'No, because Java cannot call REST APIs efficiently',
      ],
      answer: 1,
      explain: 'Every option has dependencies. A credible answer acknowledges this and shows the size and cost of the dependency rather than promising zero lock-in.',
    },
    {
      type: 'order',
      prompt: 'Order the steps to build a credible exit plan before the renewal.',
      items: [
        'Pull an automated inventory of apps, APIs, policies, queues and connectors from the platform',
        'Classify lock-in per layer (contracts, logic, platform services, skills)',
        'Estimate effort per app with complexity sizing (simple / medium / complex)',
        'Define scenarios — renegotiate, partial migration, full exit — with cost and time ranges',
        'Present to the board and refresh the plan annually',
      ],
      explain: 'Estimates must come from the real inventory, not guesses. Scenarios with ranges give procurement leverage and satisfy regulators that the exit plan is maintained.',
    },
    {
      type: 'single',
      prompt: 'How should you open the board presentation?',
      options: [
        '"There is no lock-in because we use open standards."',
        '"Yes, there is lock-in, mostly in the integration logic, which would exist with any platform — here is its size, the cost to exit, and how we are limiting it."',
        'A detailed walkthrough of Mule runtime internals and connector versions',
        '"We recommend migrating off the platform now to remove the risk."',
      ],
      answer: 1,
      explain: 'A straight, quantified answer builds credibility with a risk committee. Denying lock-in is not credible, technical detail loses the audience, and a premature migration throws away value.',
    },
    {
      type: 'multi',
      prompt: 'Which commercial terms would you seek at renewal?',
      options: [
        'Multi-year price protection',
        'Clear data and configuration export rights',
        'Transition assistance terms if you leave',
        'Flexibility to reduce capacity',
        'Exclusivity for the vendor on all future integration work',
      ],
      answer: [0, 1, 2, 3],
      explain: 'These terms cap price risk and lower exit cost. Granting exclusivity would increase dependency — the opposite of what the board asked for.',
    },
  ],
  description: `
**Context.** A large logistics and parcel company has used Anypoint Platform for six years: ~220 Mule applications, ~400 APIs managed in API Manager, CloudHub deployments, Anypoint MQ for asynchronous flows, and heavy use of Exchange. A new CFO and the board's risk committee ask: "What happens if licence prices rise sharply or the vendor's strategy changes? Are we locked in? Show us an exit strategy and how you reduce dependency — without slowing delivery."

**Inputs**
- Renewal in 18 months.
- Procurement has asked architecture for a credible alternative position for negotiation.
- Delivery teams fear any "portability" work will slow them down.
- Regulators expect material outsourcing arrangements to have documented exit plans (kept generic).

**Your task.** Assess where the lock-in actually is, propose practical measures to reduce it, outline an exit plan (with effort and timeline), and recommend how to present this to the board.
`,
  answerTemplate: `## Where lock-in really sits (assessment)

## What is portable and what is not

## Practical measures to reduce dependency (without slowing delivery)

## Exit plan outline (scenarios, effort, timeline)

## Commercial and governance recommendations

## How you would present this to the board
`,
  keyPoints: [
    'Lock-in is assessed per layer: contracts/specs (portable), data and business logic in DataWeave/flows (re-implementable), proprietary runtime and platform services (MQ, Object Store, API Manager policies, CloudHub) and skills/processes.',
    'Reduce dependency where it is cheap: open standards for contracts (OAS/RAML exportable, AsyncAPI), canonical models, logic documented, externalised configuration, standard protocols at boundaries.',
    'Avoid "lowest common denominator" architecture that throws away platform value; accept deliberate, documented dependencies with known exit costs.',
    'An exit plan with scenarios (renegotiate, partial migration, full migration), inventory-driven effort estimates and a realistic multi-year timeline.',
    'Commercial levers and governance: contract terms (price caps, data export, exit assistance), architecture decision records for proprietary features, periodic exit-plan refresh.',
  ],
  solution: `
**Assessment.** Inventory from the platform (applications, APIs, policies, queues, connectors in use) and classify:

| Area | Lock-in level | Notes |
| --- | --- | --- |
| API contracts (RAML/OAS) | Low | Exportable; OAS works in other gateways. |
| Consumers of APIs | Low–Medium | Consumers see HTTP contracts; gateway swap affects auth/policies, not contracts. |
| Mule flows and DataWeave | Medium–High | Logic must be re-implemented elsewhere; volume is the cost driver. |
| Platform services (Anypoint MQ, Object Store, CloudHub, API Manager policies) | Medium | Equivalents exist; migration needs re-plumbing and testing. |
| Monitoring, CI/CD, Exchange as catalogue | Medium | Processes and tooling to rebuild. |
| Skills and operating model | Medium | People and processes tuned to the platform. |

**Reduce dependency (cheap, high value).**
- Contracts-first with standard specs; keep specs in Git as well as Exchange.
- Business rules documented with the API (not only inside flows); canonical models defined in schemas.
- Standard protocols at boundaries (HTTP/REST, AMQP/JMS where already used, Kafka where the company already runs it) and an abstraction for messaging in code (a thin internal module) so the broker can change.
- Logs and metrics exported to the company's own observability tooling; CI/CD in the company's own pipeline tool.
- Architecture decision records whenever a proprietary feature is adopted, stating why and the exit cost.
- What not to do: forbid platform features "just in case" — that slows delivery and wastes the investment.

**Exit plan.**
- *Scenario A — renegotiate* (most likely): credible alternative with estimates is the leverage.
- *Scenario B — partial*: move gateway/API management or messaging to alternatives while keeping Mule runtimes (possible because of standard protocols), or move the long tail of simple integrations.
- *Scenario C — full exit*: waves by domain over ~2–3 years for 220 apps; effort estimated per app by complexity (simple/medium/complex t-shirt sizing from the inventory); dual running during transition; re-skilling. Include cost of the alternative, migration, dual licences and risk.
Refresh the plan annually; keep the inventory current automatically.

**Commercial and governance.** Seek multi-year price protection, clear data and configuration export rights, transition assistance terms, and flexibility to reduce capacity. Report concentration risk in the risk register with owner and mitigations.

**Board presentation.** Lead with a straight answer: "Yes, there is lock-in, mostly in the integration logic, which would exist with any platform; here is its size, cost to exit, and how we are limiting it." Show the scenario table with cost/time ranges, the low-cost measures already under way, and the commercial strategy for renewal. Avoid technical detail unless asked.
`,
  followUps: [
    { q: 'Would building everything in plain Java microservices remove lock-in?', a: 'It shifts lock-in to custom code, frameworks and the team that wrote it, and gives up productivity, connectors and governance. Every option has dependencies; the goal is to know and price them.' },
    { q: 'What is the most expensive part of an exit?', a: 'Re-implementing and re-testing the integration logic across hundreds of applications, plus dual running. Contracts and consumers are comparatively cheap because they are standard HTTP APIs.' },
    { q: 'How do you keep delivery teams on board?', a: 'Make the portability measures part of normal good practice (contracts in Git, documented logic, standard protocols, ADRs) rather than extra work, and avoid banning useful platform features.' },
  ],
}
