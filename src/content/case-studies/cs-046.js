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
        ['API contracts (RAML / OAS)', 'Low: exportable and usable in other gateways'],
        ['API consumers', 'Low to medium: they see HTTP contracts, but auth and policies may change'],
        ['Platform services (Anypoint MQ, Object Store, CloudHub, policies)', 'Medium: equivalents exist but need re-plumbing'],
        ['Mule flows and DataWeave logic', 'Medium to high: must be re-implemented and re-tested'],
      ],
      explain: 'Lock-in is assessed per layer. Contracts are standard and portable; the real cost sits in the integration logic, which would exist on any platform.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'What is usually the most expensive part of a full exit?',
      options: [
        'Exporting the API specifications from Exchange and loading them into a new gateway',
        'Re-implementing and re-testing the logic of ~220 apps, plus running two platforms',
        'Changing every API consumer, because they call Mule-specific protocols today',
        'Retraining the operations team and rebuilding all the monitoring dashboards',
      ],
      answer: 1,
      explain: 'Contracts and consumers are comparatively cheap because they use standard HTTP APIs. The volume of flows and DataWeave logic to rebuild and test, plus paying for two platforms during migration, drives the cost. Operations retraining and dashboards are real but much smaller.',
    },
    {
      type: 'multi',
      needsScenario: true,
      prompt: 'Which measures reduce dependency cheaply **without** slowing delivery?',
      options: [
        'Keep API specs in Git as well as in Exchange',
        'Record an architecture decision for each proprietary feature, with its exit cost',
        'Export logs and metrics to the company\'s own observability tooling',
        'Use a thin internal messaging module so the broker can change',
        'Ban Anypoint MQ and Object Store in case the company leaves',
        'Rewrite the integrations as plain Java microservices over time',
      ],
      answer: [0, 1, 2, 3],
      explain: 'Good-practice measures that teams barely notice give real portability. Banning platform features or rewriting everything is "lowest common denominator" architecture: it slows delivery and wastes the investment.',
    },
    {
      type: 'single',
      prompt: 'A board member asks: "Would plain Java microservices remove the lock-in?" Best answer?',
      options: [
        'Yes, because open-source frameworks have no licence fee and many vendors support them',
        'No, it moves lock-in to custom code and its team, and loses connectors and governance',
        'Yes, if the services run on a Kubernetes cluster that any cloud provider can host',
        'No, because the API contracts would still be stored in Exchange and tied to it',
      ],
      answer: 1,
      explain: 'Every option has dependencies. Custom code ties you to its frameworks and the team that wrote it, and gives up connectors, productivity and governance. Contracts are portable wherever they are stored, and Kubernetes changes where code runs, not who can maintain it. A credible answer acknowledges this and shows the size and cost of the dependency rather than promising zero lock-in.',
    },
    {
      type: 'order',
      prompt: 'Order the steps to build a credible exit plan before the renewal.',
      items: [
        'Pull an automated inventory of apps, APIs, policies, queues and connectors from the platform',
        'Classify lock-in per layer (contracts, logic, platform services, skills)',
        'Estimate effort per app with complexity sizing (simple / medium / complex)',
        'Define scenarios (renegotiate, partial migration, full exit) with cost and time ranges',
        'Present to the board and refresh the plan annually',
      ],
      explain: 'Estimates must come from the real inventory, not guesses. Scenarios with ranges give procurement leverage and satisfy regulators that the exit plan is maintained.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'How should you open the board presentation?',
      options: [
        '"There is no real lock-in, because all our APIs use open standards like OAS."',
        '"Yes, there is lock-in, mostly in logic any platform needs. Here is its size and exit cost."',
        '"First, here is how our Mule runtimes, connectors and DataWeave scripts work."',
        '"We recommend starting to migrate off the platform now to remove the risk."',
      ],
      answer: 1,
      explain: 'A straight, quantified answer builds credibility with a risk committee. Denying lock-in is not credible, technical detail loses the audience, and a premature migration throws away value.',
    },
    {
      type: 'multi',
      prompt: 'A company\'s Anypoint Platform licence is up for renewal, and the board worries about vendor lock-in. It asks for contract terms that make a future exit cheaper. Which two terms do that?',
      options: [
        'Clear data and configuration export rights',
        'Transition assistance terms if you leave',
        'Multi-year price protection on the licence',
        'Exclusivity in return for a larger renewal discount',
      ],
      answer: [0, 1],
      explain: 'Export rights and transition assistance lower exit cost. Multi-year price protection is also worth seeking, but it caps price risk and does not change the cost of leaving. Flexibility to reduce capacity is another useful term. Granting exclusivity would increase dependency, which is the opposite of what the board asked for.',
    },
  ],
  description: `
**Context.** A large logistics and parcel company has used Anypoint Platform for six years: ~220 Mule applications, ~400 APIs managed in API Manager, CloudHub deployments, Anypoint MQ for asynchronous flows, and heavy use of Exchange. A new CFO and the board's risk committee ask: "What happens if licence prices rise sharply or the vendor's strategy changes? Are we locked in? Show us an exit strategy and how you reduce dependency, without slowing delivery."

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
| Consumers of APIs | Low to medium | Consumers see HTTP contracts; gateway swap affects auth/policies, not contracts. |
| Mule flows and DataWeave | Medium to high | Logic must be re-implemented elsewhere; volume is the cost driver. |
| Platform services (Anypoint MQ, Object Store, CloudHub, API Manager policies) | Medium | Equivalents exist; migration needs re-plumbing and testing. |
| Monitoring, CI/CD, Exchange as catalogue | Medium | Processes and tooling to rebuild. |
| Skills and operating model | Medium | People and processes tuned to the platform. |

**Reduce dependency (cheap, high value).**
- Contracts-first with standard specs; keep specs in Git as well as Exchange.
- Business rules documented with the API (not only inside flows); canonical models defined in schemas.
- Standard protocols at boundaries (HTTP/REST, AMQP/JMS where already used, Kafka where the company already runs it). An abstraction for messaging in code (a thin internal module) so the broker can change.
- Logs and metrics exported to the company's own observability tooling; CI/CD in the company's own pipeline tool.
- Architecture decision records whenever a proprietary feature is adopted, stating why and the exit cost.
- What not to do: forbid platform features "in case we leave". That slows delivery and wastes the investment.

**Exit plan.**
- *Scenario A, renegotiate* (most likely): credible alternative with estimates is the leverage.
- *Scenario B, partial*: move gateway/API management or messaging to alternatives while keeping Mule runtimes (possible because of standard protocols), or move the long tail of simple integrations.
- *Scenario C, full exit*: waves by domain over about 2 to 3 years for 220 apps; effort estimated per app by complexity (simple/medium/complex t-shirt sizing from the inventory); dual running during transition; re-skilling. Include cost of the alternative, migration, dual licences and risk.
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
