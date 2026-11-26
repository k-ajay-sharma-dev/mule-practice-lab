export default {
  id: 'cs-023',
  category: 'case-studies',
  title: 'Replacing a Legacy Vendor ESB With Anypoint Platform',
  level: 'ADVANCED',
  tags: ['myproject', 'esb-replacement', 'migration', 'strangler', 'jms', 'governance'],
  estMinutes: 50,
  quiz: [
    {
      type: 'single',
      prompt: 'Documentation is poor and some services have no known consumers. How do you decide what to migrate?',
      options: [
        'Classify each service as retire, lift-and-shift or redesign from 3+ months of traffic',
        'Migrate all 220 services 1:1 first, then retire the unused ones once on Mule',
        'Classify each service from the 2015 service catalogue and the owners it lists',
        'Ask each consumer team to list what they use, and migrate only that',
      ],
      answer: 0,
      explain: 'Traffic data shows what is really used and by whom, so dead services can be retired and the rest classified. A 1:1 copy wastes the deadline on services nobody calls and does not produce reusable APIs.',
    },
    {
      type: 'single',
      prompt: 'Some partners cannot change their endpoints at all. Which approach lets you move services one by one?',
      options: [
        'A routing layer in front of the services that sends each one to the old ESB or to Mule',
        'Repoint the ESB hostname to Mule in DNS as each service is ready',
        'Leave those services for a final wave and move them all on the licence end date',
        'Point the old ESB hostname at Mule with one DNS change once every service is rebuilt',
      ],
      answer: 0,
      explain: 'This is the strangler pattern. The routing layer can be a gateway or a load balancer that routes by path. A facade keeps consumer endpoints stable while implementations move behind it, with rollback by switching the route. A DNS change works per hostname, and all services share the ESB hostname, so repointing it moves every service at once, ready or not. A final wave on the licence end date, or one DNS change at the end, is the big bang that 24/7 warehouses cannot tolerate.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'A SOAP consumer cannot change. How do you still end up with reusable APIs?',
      options: [
        'Expose the same WSDL from Mule, with each operation calling new System and Process APIs',
        'Rebuild the service in one Mule app with APIkit for SOAP, keeping the WSDL and its logic together',
        'Build a REST API and ask the consumer team to move to it later',
        'Keep the service on the old ESB and put a REST proxy in front of it',
      ],
      answer: 0,
      explain: 'APIkit for SOAP can expose the same WSDL. A contract-compatible facade satisfies the consumer while the logic underneath moves into reusable System/Process APIs. Rebuilding the logic inside the SOAP app keeps the WSDL too, but it is a 1:1 copy that no other consumer can reuse. Asking the consumer to move later breaks the rule that it cannot change. The old ESB is switched off at the licence date, so nothing can stay on it.',
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
        'Add the new broker early, bridge queues, and cut over queue by queue',
        'Point each Mule app at the new broker as its service moves, and drain the old queues by hand',
        'Keep using the old broker from Mule, and replace it after the ESB is switched off',
        'Move all producers to the new broker first, then move all consumers a week later',
      ],
      answer: 0,
      explain: 'Start the queue by queue cutover with low volume flows. Bridging lets producers and consumers move independently, which is essential in a 24/7 operation. Moving each app as its service moves splits a queue when its producer and consumer sit in different waves, and messages then wait on a broker nobody reads. The old broker disappears with the licence, so it cannot outlive the ESB. Moving all producers a week before the consumers leaves a week of messages nobody consumes.',
    },
    {
      type: 'single',
      prompt: 'A programme is replacing an old ESB before a fixed licence renewal date. One wave is late, because redesigning its services into API-led APIs takes too long. What should the programme do?',
      options: [
        'Move developers from the waves on schedule to the late wave until its redesign catches up',
        'Lift-and-shift every remaining service, and drop the API-led redesign for the rest of the programme',
        'Time-box the redesign, and fall back to lift-and-shift when late',
        'Keep the redesign, and shorten the late wave’s parallel runs to win back the time',
      ],
      answer: 2,
      explain: 'Lift-and-shift reimplements a service quickly with the same contract, so time-boxing redesign keeps the date safe. Moving people from waves on schedule makes those waves late, and new people slow a late team down at first. Dropping redesign for everything gives up the reusable-API goal for services that are not late. A shorter parallel run trades the time back against the zero-disruption goal for 24/7 warehouses. Other decisions that protect the deadline are a buffer of a few months before the renewal, pairing old-ESB experts with Mule developers (and an SI partner for early waves), and tracking services migrated, services retired and % of traffic on Mule.',
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
**Discovery and rationalisation (months 0 to 3).** Pull traffic statistics per service for 3+ months. Classify: **retire** (no traffic), **lift-and-shift** (simple, stable; reimplement with same contract quickly), **redesign** (high-reuse domains like orders, inventory, products → API-led). Map consumers per service. Expect ~20 to 30% to be retirable.

**Target architecture.** System APIs per core system (ERP, WMS, supplier systems), Process APIs per domain, Experience/partner APIs where needed. Messaging via Anypoint MQ or a dedicated JMS broker (depending on protocol needs, throughput and whether on-prem consumers require JMS). SFTP/managed file transfer for suppliers. Runtime: CloudHub 2.0 private space or Runtime Fabric on-prem near the warehouses if latency/connectivity requires.

**Migration strategy.**
- **Facade**: route consumers through a proxy layer (API gateway, load balancer or DNS) that can send each service to the old ESB or Mule. Consumers do not change endpoints.
- **Contract-compatible** implementations for SOAP consumers that cannot change: Mule exposes the same WSDL (APIkit for SOAP) backed by the new APIs.
- Per service: build → test with recorded traffic → parallel run/shadow where possible → switch route → monitor → decommission old service.

**Broker.** Introduce the new broker early. Bridge queues (Mule flows moving messages between old and new broker) during transition so producers and consumers can move independently. Cut over queue by queue, starting with low-volume flows.

**Team and governance.** SI partner for the first waves and to build templates; pair old-ESB experts (business logic knowledge) with Mule developers. C4E publishes standards, CI/CD and reusable assets; every migrated service ends up in Exchange.

**Plan.** Months 0 to 3: discovery, foundations and pilot; months 3 to 18: waves (simple → complex → warehouse-critical); months 18 to 21: tail and decommission; months 21 to 24: buffer. Track: services migrated, % traffic on Mule, services retired.

**Risks.** Hidden logic in old services (capture with tests), broker cutover in a 24/7 operation, the redesign scope blowing the deadline (time-box redesign; lift-and-shift when late), and losing old-ESB knowledge if staff leave.
`,
  followUps: [
    { q: 'Lift-and-shift or redesign: how do you decide per service?', a: 'Redesign where the domain has high reuse potential or the service is painful to change; lift-and-shift with the same contract where it is stable and low value. The deadline forces most of the tail to be lift-and-shift.' },
    { q: 'Is there an automated converter from the old ESB to Mule?', a: 'For other vendors there is generally no reliable automatic conversion; some partners offer accelerators, but plan for reimplementation and use recorded traffic to verify behaviour.' },
    { q: 'What is your biggest risk?', a: 'The fixed licence deadline combined with unknown hidden logic. A buffer, early discovery with runtime data, and strict scope control on redesigns are the main mitigations; also negotiate a short licence extension as a fallback.' },
  ],
}
