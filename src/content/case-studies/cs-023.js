export default {
  id: 'cs-023',
  category: 'case-studies',
  title: 'Replacing a Legacy Vendor ESB With Anypoint Platform',
  level: 'ADVANCED',
  tags: ['esb-replacement', 'migration', 'strangler', 'jms', 'governance'],
  estMinutes: 50,
  quiz: [
    {
      type: 'single',
      prompt: 'Documentation is poor and some services have no known consumers. How do you decide what to migrate?',
      options: [
        'Use 3+ months of runtime traffic evidence to classify each service as retire, lift-and-shift or redesign',
        'Migrate all 220 services 1:1 so nothing is missed',
        'Trust the service catalogue spreadsheet from 2015',
        'Ask each consumer team to list what they use, and migrate only that',
      ],
      answer: 0,
      explain: 'Traffic data shows what is really used and by whom, so dead services can be retired and the rest classified. A 1:1 copy wastes the deadline on services nobody calls and does not produce reusable APIs.',
    },
    {
      type: 'single',
      prompt: 'Some partners cannot change their endpoints at all. Which approach lets you move services one by one?',
      options: [
        'A facade/routing layer (gateway, load balancer or DNS) in front of the services that sends each one to the old ESB or Mule — the strangler pattern',
        'Ask partners to switch on a single cutover date',
        'Keep those services on the old ESB after the licence expires',
        'Give each partner a new Mule endpoint and wait for them to adopt it',
      ],
      answer: 0,
      explain: 'A facade keeps consumer endpoints stable while implementations move behind it, with rollback by switching the route. A single cutover date is exactly the big bang that 24/7 warehouses cannot tolerate.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'A SOAP consumer cannot change. How do you still end up with reusable APIs?',
      options: [
        'Expose the same WSDL from Mule (e.g. APIkit for SOAP) as a contract-compatible facade backed by the new API-led APIs',
        'Copy the old service logic line by line into one Mule app',
        'Convert the consumer to REST yourselves',
        'Leave the service on the old ESB permanently',
      ],
      answer: 0,
      explain: 'A contract-compatible facade satisfies the consumer while the logic underneath moves into reusable System/Process APIs. A line-by-line copy meets the deadline but misses the "reusable APIs, not a 1:1 copy" goal.',
    },
    {
      type: 'order',
      needsScenario: true,
      prompt: 'Order the steps for moving one service.',
      items: [
        'Build the Mule implementation',
        'Test it with recorded production traffic',
        'Run in parallel / shadow mode where possible',
        'Switch the route in the facade',
        'Monitor, then decommission the old service',
      ],
      explain: 'Build, test against real traffic, shadow, switch, then decommission once it is stable. Decommissioning before monitoring removes the rollback path.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'The JMS broker is part of the old ESB product. How do you handle it?',
      options: [
        'Introduce the new broker early, bridge queues between old and new during transition, and cut over queue by queue starting with low-volume flows',
        'Switch every producer and consumer to the new broker on the same night',
        'Keep using the old broker after decommissioning the ESB',
        'Replace all messaging with synchronous HTTP calls',
      ],
      answer: 0,
      explain: 'Bridging lets producers and consumers move independently, which is essential in a 24/7 operation. Switching everything at once is a big-bang risk, and the old broker disappears with the licence.',
    },
    {
      type: 'single',
      prompt: 'A programme is replacing an old ESB before a fixed licence renewal date. One wave is late, because redesigning its services into API-led APIs takes too long. What should the programme do?',
      options: [
        'Finish a perfect API-led redesign of each service before moving it',
        'Pause all other waves until the late redesign work is complete',
        'Time-box the redesign, and fall back to lift-and-shift when late',
        'Skip parallel runs and testing, to win back the lost time',
      ],
      answer: 2,
      explain: 'Lift-and-shift reimplements a service quickly with the same contract, so time-boxing redesign keeps the date safe. Perfecting every service before moving any is the scope trap the plan warns about. Other decisions that protect the deadline are a buffer of a few months before the renewal, pairing old-ESB experts with Mule developers (and an SI partner for early waves), and tracking services migrated, services retired and % of traffic on Mule.',
    },
  ],
  description: `
**Context.** A wholesale distributor has run another vendor's ESB for 15 years. It hosts ~220 services: SOAP web services, JMS-based messaging between warehouses and the ERP, file transfers with suppliers, and a few complex orchestrations. The licence renewal is in 24 months and the vendor product is near end of support. The team knows the old ESB deeply but not MuleSoft. Documentation is poor; some services have no known consumers.

**Goals**
- Fully decommission the old ESB before the licence renewal date.
- Zero disruption to warehouse operations (24/7).
- End with reusable APIs, not a 1:1 copy of the old services.

**Constraints**
- Consumers (ERP, WMS, supplier portal, mobile apps) cannot all change at once; some partners cannot change their endpoints at all.
- The JMS broker is part of the old ESB product.
- Budget allows a partner/SI for part of the programme.

**Your task.** Propose the migration strategy, target architecture and programme plan.
`,
  answerTemplate: `## Discovery and rationalisation

## Target architecture

## Migration strategy (how traffic moves)

## Messaging and the broker problem

## Team, tooling and governance

## Plan and risks
`,
  keyPoints: [
    'Discovery uses runtime evidence (traffic logs, metrics) to classify services into retire, rehost-as-is, and redesign-as-API, rather than trusting documentation.',
    'A strangler/facade approach: put a routing layer (e.g. gateway/proxy or DNS) in front of services so consumers keep their endpoints while implementations move one by one.',
    'Contract compatibility for consumers that cannot change (same WSDL/endpoint), with new API-led APIs underneath for reuse.',
    'The broker dependency is resolved explicitly: a replacement broker (e.g. Anypoint MQ or an enterprise JMS broker) with a bridging period and per-queue cutover.',
    'Waves are sequenced by dependency and risk, with parallel runs and rollback for warehouse-critical flows.',
    'Programme has a time buffer before licence expiry, team upskilling (old-ESB experts paired with Mule experts) and progress metrics (services migrated, traffic share on new platform).',
  ],
  solution: `
**Discovery and rationalisation (months 0–3).** Pull traffic statistics per service for 3+ months. Classify: **retire** (no traffic), **lift-and-shift** (simple, stable; reimplement with same contract quickly), **redesign** (high-reuse domains like orders, inventory, products → API-led). Map consumers per service. Expect ~20–30% to be retirable.

**Target architecture.** System APIs per core system (ERP, WMS, supplier systems), Process APIs per domain, Experience/partner APIs where needed. Messaging via Anypoint MQ or a dedicated JMS broker (depending on protocol needs, throughput and whether on-prem consumers require JMS). SFTP/managed file transfer for suppliers. Runtime: CloudHub 2.0 private space or Runtime Fabric on-prem near the warehouses if latency/connectivity requires.

**Migration strategy.**
- **Facade**: route consumers through a proxy layer (API gateway, load balancer or DNS) that can send each service to the old ESB or Mule. Consumers do not change endpoints.
- **Contract-compatible** implementations for SOAP consumers that cannot change: Mule exposes the same WSDL (APIkit for SOAP) backed by the new APIs.
- Per service: build → test with recorded traffic → parallel run/shadow where possible → switch route → monitor → decommission old service.

**Broker.** Introduce the new broker early. Bridge queues (Mule flows moving messages between old and new broker) during transition so producers and consumers can move independently. Cut over queue by queue, starting with low-volume flows.

**Team and governance.** SI partner for the first waves and to build templates; pair old-ESB experts (business logic knowledge) with Mule developers. C4E publishes standards, CI/CD and reusable assets; every migrated service ends up in Exchange.

**Plan.** Month 0–3 discovery, foundations and pilot; months 3–18 waves (simple → complex → warehouse-critical); months 18–21 tail and decommission; months 21–24 buffer. Track: services migrated, % traffic on Mule, services retired.

**Risks.** Hidden logic in old services (capture with tests), broker cutover in a 24/7 operation, the redesign scope blowing the deadline (time-box redesign; lift-and-shift when late), and losing old-ESB knowledge if staff leave.
`,
  followUps: [
    { q: 'Lift-and-shift or redesign — how do you decide per service?', a: 'Redesign where the domain has high reuse potential or the service is painful to change; lift-and-shift with the same contract where it is stable and low value. The deadline forces most of the tail to be lift-and-shift.' },
    { q: 'Is there an automated converter from the old ESB to Mule?', a: 'For other vendors there is generally no reliable automatic conversion; some partners offer accelerators, but plan for reimplementation and use recorded traffic to verify behaviour.' },
    { q: 'What is your biggest risk?', a: 'The fixed licence deadline combined with unknown hidden logic. A buffer, early discovery with runtime data, and strict scope control on redesigns are the main mitigations; also negotiate a short licence extension as a fallback.' },
  ],
}
