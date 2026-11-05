import { diagram } from '../../arch/dsl.js'

export default {
  id: 'cs-018',
  category: 'case-studies',
  title: 'Airline Automating Disruption and Rebooking',
  level: 'ADVANCED',
  tags: ['airline', 'event-driven', 'burst-load', 'notifications', 'resilience'],
  estMinutes: 45,
  diagram: {
    task: 'draw the disruption architecture: the flight-status event that starts it, the disruption Process API fanning out prioritised work items, the throttled rebooking worker in front of the PSS, offer events driving notifications, and the app path for accepting offers.',
    checks: [
      { label: 'Flight-status events from operations control trigger the disruption Process API asynchronously', rule: { type: 'edge', from: ['topic', 'event-stream', 'queue'], to: 'process-api', kind: 'async' } },
      { label: 'Cancellations fan out to prioritised work-item queues (e.g. high and normal)', rule: { type: 'edge', from: 'process-api', to: ['queue', 'topic'], kind: 'async', min: 2 } },
      { label: 'Work items reach the PSS through a queue-fed worker and a System API (writes throttled to its limit)', rule: { type: 'path', from: 'queue', to: { type: ['saas', 'legacy', 'erp'], label: ['pss', 'passenger service', 'reservation'] }, via: 'system-api' } },
      { label: 'PSS, CRM, rebooking engine and other systems are reached only through System APIs', rule: { type: 'only-via', target: ['saas', 'crm', 'legacy', 'erp'], from: 'system-api' } },
      { label: 'Passenger data is enriched with CRM/loyalty and special needs', rule: { type: 'path', from: 'process-api', to: 'crm' } },
      { label: 'Offer events drive notifications asynchronously', rule: { type: 'path', from: ['topic', 'event-stream'], to: 'notification' } },
      { label: 'The mobile app accepts offers through a rebooking Experience API', rule: { type: 'each', of: 'mobile-app', edgeTo: 'experience-api' } },
      { label: 'Experience APIs never call System APIs directly', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
    ],
    reference: diagram(
      {
        app: ['mobile-app', 'Passenger app'],
        erb: ['experience-api', 'rebooking-eapi'],
        dis: ['process-api', 'disruption-papi'],
        wrk: ['process-api', 'rebooking-worker (≤ 50 PSS writes/s)'],
        fs: ['topic', 'flight-status'],
        qhi: ['queue', 'work-items-high'],
        qn: ['queue', 'work-items-normal'],
        offer: ['topic', 'offer-created'],
        spss: ['system-api', 'pss-sapi (rate limited)'],
        scrm: ['system-api', 'crm-loyalty-sapi'],
        seng: ['system-api', 'rebooking-engine-sapi'],
        snot: ['system-api', 'notifications-sapi'],
        ops: ['saas', 'Operations control'],
        pss: ['saas', 'PSS (vendor-hosted)'],
        crm: ['crm', 'CRM / loyalty'],
        eng: ['saas', 'Rebooking engine'],
        notif: ['notification', 'SMS / email / push'],
      },
      [
        'ops ~> fs', 'fs ~> dis', 'dis -> spss', 'dis -> scrm',
        'dis ~> qhi', 'dis ~> qn', 'qhi ~> wrk', 'qn ~> wrk',
        'wrk -> seng', 'wrk -> spss', 'wrk ~> offer', 'offer ~> snot',
        'app -> erb', 'erb -> dis',
        'spss -> pss', 'scrm -> crm', 'seng -> eng', 'snot -> notif',
      ],
    ),
  },
  description: `
**Context.** A mid-size airline handles flight cancellations and long delays mostly by hand: agents rebook passengers in the passenger service system (PSS), call hotels and send emails.

**The problem today.** During a storm, 200 flights can be cancelled in two hours, affecting 30,000 passengers. Call centres collapse and the mobile app shows stale information.

**Systems**
- PSS (reservations, inventory; vendor-hosted with rate-limited APIs)
- operations control system (publishes flight status events)
- a rebooking-optimisation engine (new, vendor product)
- CRM/loyalty
- a notification platform (SMS, email, push)
- hotel/meal voucher providers
- the mobile app backend

**Goals**
- Affected passengers get a rebooking offer in the app within 15 minutes of a cancellation.
- Passengers can accept, change or request a refund self-service.
- Loyalty status and special needs (wheelchair, unaccompanied minors) are respected.

**Constraints**
- The PSS allows ~50 write transactions per second for the airline.
- Regulation requires correct passenger notifications and care (vouchers). Keep exact rules generic, but they must be auditable.
- Disruptions are rare but extreme bursts; normal days are quiet.

**Your task.** Propose:
- the event flow
- the integration architecture
- how it behaves under burst load
`,
  answerTemplate: `## Event flow from cancellation to offer

## API and event architecture

## Burst handling and protecting the PSS

## Prioritisation of passengers

## Self-service acceptance and confirmations

## Audit, monitoring and risks
`,
  keyPoints: [
    'Flight status events from operations control trigger the process; cancellations are fanned out to per-passenger work items via queues/topics.',
    'PSS writes are throttled to its limit with a queue and controlled consumers, not by letting burst traffic hit it directly.',
    'Work items are prioritised (e.g. tight connections, special needs, loyalty tier) using priority queues or ordering before PSS writes.',
    'Rebooking offers are held (or protected) in the PSS before being sent, and acceptance is idempotent so double taps in the app do not double-book.',
    'Notifications are sent asynchronously through the notification platform with delivery tracking; every offer, notification and voucher is audited per passenger.',
    'Burst capacity is planned (autoscaling/pre-scaled replicas, load test with a storm scenario) and dashboards track backlog and time-to-offer.',
  ],
  solution: `
**Event flow.**
1. Operations control publishes \`FlightCancelled\` / \`FlightDelayed\`.
2. \`disruption-papi\` consumes it, pulls the passenger manifest from \`pss-sapi\`, enriches with CRM/loyalty and special-service data, and creates one **work item per booking** on a queue.
3. Work items call the **rebooking engine** for an option, then \`pss-sapi\` to hold the seat.
4. An \`OfferCreated\` event triggers notifications and updates the app backend.
5. The passenger accepts / changes / requests a refund in the app → \`rebooking-eapi\` → confirm in the PSS, issue vouchers via provider APIs, send confirmation.

**Architecture.** Event-driven core on Anypoint MQ (FIFO not required for independent bookings; use per-flight grouping if order matters). System APIs for PSS, CRM, notifications, vouchers. Experience API for the app; agent desktop reuses the same Process APIs for complex cases.

**Burst handling.** The bottleneck is the PSS (~50 writes/s). Consumers of the PSS-write queue are sized to stay under that limit (fixed concurrency + rate limiting on the System API). 30,000 passengers ≈ 10 minutes of PSS writes at full rate, so prioritisation matters. Everything else (enrichment, notifications) scales out. Read-heavy calls use caching where data does not change during the disruption.

**Prioritisation.** Score each work item: special needs, unaccompanied minors, last flight of the day, tight onward connections, loyalty tier. Use separate high/normal queues (MQ has no per-message priority) or sort per flight before publishing.

**Idempotency and audit.** Booking reference + flight + offer ID as the idempotency key for accept. An audit trail per passenger: offer, notification sent/delivered, acceptance, vouchers — needed for regulatory and complaints handling.

**Monitoring.** Dashboards for queue backlog, time from cancellation to offer, PSS error rate. Alerts when backlog age exceeds the target. Storm-scenario load tests twice a year.

**Risks.** PSS vendor limits (negotiate burst capacity), rebooking engine quality, notification overload/costs, and stale app data (push events, not polling).
`,
  followUps: [
    { q: 'Anypoint MQ has no message priority — how do you prioritise?', a: 'Use separate queues per priority and have consumers drain the high-priority queue first (or allocate more consumers to it), or sort work items per flight before publishing.' },
    { q: 'How do you test a 30,000-passenger storm?', a: 'A replay/simulation environment with a PSS stub that enforces the real rate limit, generating a mass cancellation event; measure time-to-offer for the last passenger and backlog drain time.' },
    { q: 'What is your biggest risk?', a: 'The PSS write limit: it caps how fast you can help passengers no matter how well Mule scales. Mitigate with prioritisation, holding seats early and negotiating burst capacity with the vendor.' },
  ],
}
