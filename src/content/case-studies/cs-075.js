import { diagram } from '../../arch/dsl.js'

export default {
  id: 'cs-075',
  category: 'case-studies',
  title: 'Car Maker Building a Global Order-to-Delivery Tracking Platform for Dealers and Buyers',
  level: 'EXPERT',
  tags: ['automotive', 'manufacturing', 'kafka', 'event-driven', 'data-residency', 'privacy', 'api-led', 'partners'],
  estMinutes: 70,
  diagram: {
    task: 'draw the vehicle tracking platform: dealer ordering, SAP production planning, plant MES and vehicle logistics publishing milestones through System APIs, ocean and rail carriers sending EDI through an Experience API, one milestones stream keyed by VIN, a journey Process API building a journey store, dealer and buyer Experience APIs sharing one tracking Process API, buyers signing in through an identity provider, and buyer notifications that look up contact details in the regional CRM.',
    checks: [
      { label: 'At least four source domains publish milestones to the event stream', rule: { type: 'edge', from: ['system-api', 'experience-api'], to: 'event-stream', kind: 'async', min: 4 } },
      { label: 'Ordering, SAP, MES and logistics systems are reached only through System APIs', rule: { type: 'only-via', target: ['legacy', 'erp', 'tms'], from: 'system-api' } },
      { label: 'Carrier EDI enters through an Experience API', rule: { type: 'edge', from: 'partner', to: 'experience-api' } },
      { label: 'A journey Process API builds the journey store from the stream', rule: { type: 'path', from: 'event-stream', to: 'database', via: { type: 'process-api', label: 'journey' } } },
      { label: 'The journey store is reached only through a System API', rule: { type: 'only-via', target: 'database', from: 'system-api' } },
      { label: 'Dealer and buyer Experience APIs share one tracking Process API', rule: { type: 'each', of: 'process-api', edgeFrom: 'experience-api', count: 2, some: true } },
      { label: 'Dealer and buyer apps never reach a source system', rule: { type: 'no-path', from: ['web-app', 'mobile-app'], to: ['legacy', 'erp', 'tms'] } },
      { label: 'Buyers sign in through the identity provider', rule: { type: 'link', from: 'mobile-app', to: 'identity-provider' } },
      { label: 'Notifications look up buyer contact details in the regional CRM at send time', rule: { type: 'path', from: 'event-stream', to: 'crm', via: { type: 'process-api', label: ['notif', 'buyer', 'customer'] } } },
      { label: 'Every line into or out of the event stream is an async message', rule: { type: 'lines', touching: 'event-stream', kind: 'async' } },
    ],
    reference: diagram(
      {
        dos: ['legacy', 'Regional dealer ordering systems (3)'],
        sdo: ['system-api', 'sys-dealer-orders-api'],
        sap: ['erp', 'SAP S/4HANA (production planning)'],
        ssap: ['system-api', 'sys-sap-pp-api'],
        mes: ['legacy', 'Plant MES (5 plants)'],
        smes: ['system-api', 'sys-plant-mes-api'],
        tms: ['tms', 'Vehicle logistics TMS'],
        stms: ['system-api', 'sys-vehicle-logistics-api'],
        car: ['partner', 'Ocean and rail carriers (EDI 315)'],
        eedi: ['experience-api', 'exp-carrier-edi-inbound'],
        es: ['event-stream', 'vehicle-milestones (Kafka, keyed by VIN)'],
        pj: ['process-api', 'prc-vehicle-journey'],
        sjs: ['system-api', 'sys-journey-store-api'],
        js: ['database', 'Vehicle journey store'],
        ptr: ['process-api', 'prc-order-tracking'],
        dp: ['web-app', 'Dealer portal'],
        edl: ['experience-api', 'exp-dealer-order-tracking-api'],
        app: ['mobile-app', 'Buyer app'],
        ecu: ['experience-api', 'exp-buyer-order-status-api'],
        idp: ['identity-provider', 'Buyer identity (OIDC)'],
        pn: ['process-api', 'prc-buyer-notifications'],
        scrm: ['system-api', 'sys-buyer-crm-api'],
        crm: ['crm', 'Regional buyer CRM (EU, US, CN)'],
        nt: ['notification', 'Push and email'],
      },
      [
        'sdo -> dos', 'ssap -> sap', 'smes -> mes', 'stms -> tms', 'car -> eedi',
        'sdo ~> es', 'ssap ~> es', 'smes ~> es', 'stms ~> es', 'eedi ~> es',
        'es ~> pj', 'pj -> sjs', 'sjs -> js', 'dp -> edl', 'edl -> ptr', 'app -> idp', 'app -> ecu', 'ecu -> ptr', 'ptr -> sjs',
        'es ~> pn', 'pn -> scrm', 'scrm -> crm', 'pn -> nt',
      ],
    ),
  },
  description: `
**Context.** A premium car maker builds 1.2 million vehicles a year in 5 plants and sells in 70 markets. About 45% of cars are built to order. Buyers wait 8 to 20 weeks and phone the dealer, who phones the importer, who emails the plant. Dealers spend an estimated 300,000 hours a year answering "where is my car?".

**Where the milestones live today**
| Milestone | System |
|---|---|
| Order placed, changed, allocated to a build week | 3 regional dealer ordering systems (Europe on IBM z/OS, Americas on Oracle, China on a local platform) |
| Production sequence and build date | SAP S/4HANA production planning |
| Body shop, paint, assembly, end of line, quality release | Plant MES (2 vendors across 5 plants) |
| Gate out, rail, port, vessel, arrival, dealer delivery | Vehicle logistics TMS plus ocean and rail carriers sending EDI 315 status messages |

**Volumes.** About 30 million milestone events a day, mostly MES station passes; buyers care about 12 of them. 2.5 million tracking lookups a day, with spikes when a buyer app push goes out.

**Goals**
- Dealers and buyers see one order journey with an expected delivery date (ETA).
- A push notification to the buyer at key milestones.
- New milestone sources (for example a new plant) join without changing the apps.

**Constraints**
- Buyer personal data (name, phone, email) must stay in the buyer's region: EU, US or China. Order numbers and VINs are not personal data on their own here.
- Plant MES teams will not allow any synchronous call into the MES from outside the plant.
- 4 business units and 3 regional IT teams will run parts of this; the platform team is 12 people.
- China data must be processed in China.

**Your task.** Design the platform architecture, the event model, the data residency approach and the operating model.
`,
  answerTemplate: `## Event model: milestones, keys and filtering

## Sources and adapters

## Journey store and ETA

## Experience APIs for dealers and buyers

## Data residency and personal data

## Operating model across business units and regions

## Risks
`,
  keyPoints: [
    'Each source publishes canonical milestone events (VIN, order number, milestone code, time, location) through its System API or EDI Experience API onto a Kafka stream keyed by VIN; MES station passes are filtered to business milestones at the plant edge.',
    'A journey Process API builds a journey store per order and VIN and computes the ETA; dealer and buyer Experience APIs share one tracking Process API that reads only the journey store.',
    'No synchronous call goes into the MES or other sources from the apps; sources push events.',
    'Events carry no buyer personal data; notifications look up contact details in the regional CRM at send time, and China runs its own regional stack.',
    'Run it as a platform with domain-owned adapters: the platform team owns the stream, schema registry and journey store; regional teams own their adapters and contracts.',
  ],
  solution: `
**Event model.** A canonical \`VehicleMilestone\`: VIN (or order number before a VIN exists), order number, milestone code from a controlled list, time, location and source. A schema registry holds versions. Events are keyed by VIN so each vehicle's milestones stay in order. MES station passes (30 million a day) are filtered at the plant edge to the 12 business milestones.

**Sources.**
- \`sys-dealer-orders-api\` (one per region) publishes order events.
- \`sys-sap-pp-api\` publishes build week and sequence.
- \`sys-plant-mes-api\` runs in each plant and pushes milestones out. Nothing calls into the MES.
- \`sys-vehicle-logistics-api\` publishes TMS events.
- \`exp-carrier-edi-inbound\` maps EDI 315 messages from carriers.

**Journey and ETA.** \`prc-vehicle-journey\` consumes the stream, links the order number to the VIN when SAP assigns it, and keeps the latest state per milestone in the journey store. ETA = last milestone time + typical lead time for the route, updated as data arrives. Late or repeated events are handled by event time and event ID.

**APIs.** \`exp-dealer-order-tracking-api\` (dealer portal, filtered by the dealer from the token) and \`exp-buyer-order-status-api\` (buyer app, OIDC sign-in, filtered by the buyer's orders) both call \`prc-order-tracking\`. It reads the journey store and caches hot orders.

**Residency.** Milestone events hold no buyer data. \`prc-buyer-notifications\` looks up the buyer's contact details in the regional CRM at send time, in the region. China has its own stream, journey store and APIs in a China region. Only aggregated, anonymous figures leave China.

**Operating model.** The platform team owns Kafka, the schema registry, the journey store and the shared Process APIs. Regional and plant teams own their System APIs against a published contract. A design authority approves new milestone codes.

**Risks.**
- Poor data quality from sources (contract tests, data quality dashboards).
- ETA that buyers do not trust (show ranges, measure accuracy).
- Stream cost (retention by topic, filtering at the edge).
`,
  followUps: [
    { q: 'Why filter MES events at the plant instead of streaming all 30 million?', a: 'Buyers and dealers need about 12 milestones. Filtering at the plant cuts network and stream cost and keeps detailed shop floor data in the plant.' },
    { q: 'How do you link events before and after the VIN exists?', a: 'Early events carry the order number. When SAP assigns the VIN, an event links the two, and the journey store joins them under one record.' },
    { q: 'How do you keep buyer personal data in its region?', a: 'Keep personal data out of milestone events and look up contact details in the regional CRM only when sending. Run a separate regional stack where the law needs local processing, such as China.' },
    { q: 'Why do the dealer and buyer APIs share one tracking Process API?', a: 'Both need the same journey and ETA logic. Sharing it keeps one source of truth, and each Experience API only filters and shapes the data for its users.' },
    { q: 'Who owns the adapters for each source?', a: 'The regional and plant teams that know the source own its System API. They publish to a contract that the platform team governs.' },
  ],
}
