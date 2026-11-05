import { diagram } from '../../arch/dsl.js'

export default {
  id: 'cs-011',
  category: 'case-studies',
  title: 'Telecom Orchestrating Broadband Orders',
  level: 'INTERMEDIATE',
  tags: ['telecom', 'orchestration', 'saga', 'long-running', 'status-tracking'],
  estMinutes: 35,
  diagram: {
    task: 'draw the broadband order architecture: channel Experience APIs, one order orchestration Process API with its state store, queued long-running steps, the callback path, status events and the exception queue.',
    checks: [
      { label: 'The website and partners each call an Experience API', rule: { type: 'each', of: ['web-app', 'partner'], min: 2, edgeTo: 'experience-api' } },
      { label: 'Every Experience API calls the single order orchestration Process API', rule: { type: 'each', of: 'experience-api', edgeTo: 'process-api' } },
      { label: 'Experience APIs never call System APIs directly', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
      { label: 'The orchestrator persists order state (the process runs for days)', rule: { type: 'edge', from: 'process-api', to: 'database' } },
      { label: 'Slow OSS provisioning is driven through a queue, not one long HTTP call', rule: { type: 'path', from: 'process-api', to: 'legacy', via: ['queue', 'event-stream'] } },
      { label: 'Status changes are published as events so every channel sees the same status', rule: { type: 'edge', from: 'process-api', to: ['topic', 'event-stream'], kind: 'async' } },
      { label: 'Unrecoverable orders go to an exception queue for operations', rule: { type: 'edge', from: ['process-api', 'queue'], to: 'dlq' } },
      { label: 'Fulfilment systems (OSS, 3PL, credit) are reached only through System APIs', rule: { type: 'only-via', target: ['legacy', 'external-api', 'saas', 'erp'], from: 'system-api' } },
    ],
    reference: diagram(
      {
        web: ['web-app', 'Website'],
        prt: ['partner', 'Retail partner'],
        cbk: ['partner', '3PL / field-service callbacks'],
        ew: ['experience-api', 'web-orders-eapi'],
        ep: ['experience-api', 'partner-orders-eapi'],
        ecb: ['experience-api', 'fulfilment-callbacks-eapi'],
        orc: ['process-api', 'order-orchestration-papi'],
        st: ['database', 'Order state store'],
        q: ['queue', 'fulfilment-steps'],
        top: ['topic', 'order-status-changed'],
        exq: ['dlq', 'order-exceptions'],
        sc: ['system-api', 'credit-sapi'],
        so: ['system-api', 'oss-provisioning-sapi'],
        sl: ['system-api', 'logistics-sapi'],
        cr: ['external-api', 'Credit bureau'],
        oss: ['legacy', 'OSS platform (slow, nightly window)'],
        tpl: ['external-api', '3PL'],
      },
      [
        'web -> ew', 'prt -> ep', 'cbk -> ecb',
        'ew -> orc', 'ep -> orc', 'ecb -> orc',
        'orc -> st', 'orc -> sc', 'orc ~> q', 'orc ~> top', 'orc ~> exq',
        'q ~> so', 'q ~> sl',
        'sc -> cr', 'so -> oss', 'sl -> tpl',
      ],
    ),
  },
  description: `
**Context.** A telecom operator sells broadband through its website, call centre and retail partners. Fulfilling one order touches:
- credit check
- address/line availability check
- number/port allocation
- network provisioning (an OSS platform)
- equipment shipping (a 3PL)
- engineer appointment booking
- billing account creation

**The problem today.** Each channel runs its own sequence of calls. Failures leave half-provisioned orders, and customers get conflicting status messages.

**Goals**
- One order orchestration used by all channels.
- A single order status the customer, agents and partners all see.
- Failed steps are recovered or cleanly compensated, not left half-done.

**Constraints**
- Fulfilment takes days (shipping, engineer visit); some steps are asynchronous callbacks.
- The OSS platform is slow (calls take up to 60 s) and has a maintenance window nightly.
- Partners call via APIs; the website and call centre use internal apps.

**Your task.** Propose the architecture for order capture, orchestration, status and error handling.
`,
  answerTemplate: `## API layers and channels

## Orchestration of the fulfilment steps

## Order state and status updates

## Failure handling and compensation

## Risks
`,
  keyPoints: [
    'A single Order Process API owns the orchestration; channel Experience APIs (web, call centre, partner) call it instead of each running their own sequence.',
    'Order state is persisted (state machine with clear statuses) because the process runs for days and must survive restarts.',
    'Long and asynchronous steps (OSS provisioning, shipping, appointments) are decoupled with queues/events and callbacks, not held open in one HTTP request.',
    'Each step is idempotent and failed steps trigger compensating actions (e.g. release number, cancel shipment) — a saga, not a distributed transaction.',
    'Orders that cannot be auto-recovered go to an exception queue/work list for an operations team.',
    'Status changes are published as events so all channels show the same status.',
  ],
  solution: `
**Layers.** \`web-orders-eapi\`, \`partner-orders-eapi\` (with partner-specific security and rate limits), call-centre app → \`order-orchestration-papi\` → System APIs: \`credit-sapi\`, \`address-sapi\`, \`numbering-sapi\`, \`oss-provisioning-sapi\`, \`logistics-sapi\`, \`field-service-sapi\`, \`billing-sapi\`.

**Orchestration.**
1. Synchronous at capture: validate, credit check, address/line check → create order with status \`ACCEPTED\`, return order ID.
2. Asynchronous fulfilment: each step is driven by a message (Anypoint MQ) and its result. The orchestrator persists state after every step (database table or a dedicated order store; Object Store is fine for small markers, not as the order database).
3. OSS calls are queued; consumers respect the maintenance window (pause consumption or reschedule) and use generous timeouts.
4. Callbacks from 3PL and field service hit a callback API which correlates by order ID and advances the state.

**State model.** \`ACCEPTED → PROVISIONING → EQUIPMENT_SHIPPED → APPOINTMENT_BOOKED → ACTIVE\`, plus \`ON_HOLD\`, \`FAILED\`, \`CANCELLED\`. Each transition emits an \`OrderStatusChanged\` event to a topic consumed by notifications, CRM and partner webhooks.

**Failures.** Retries with backoff for transient errors. Business failures trigger **compensation** in reverse order (release the number, cancel shipment, cancel appointment). Unrecoverable cases go to an exception queue surfaced in the CRM for agents.

**Rollout.** Start with the web channel for one product, then move the call centre and partners. Run reconciliation reports between orchestrator state and OSS/billing daily.

**Risks.** Orchestrator becomes a bottleneck/monolith (keep it focused on order flow), state drift between systems (reconciliation), and long-running timeouts (explicit SLA timers per step).
`,
  followUps: [
    { q: 'Why not a distributed transaction across these systems?', a: 'The systems are independent, slow and asynchronous; XA across HTTP/SaaS is not possible and would hold locks for days. A saga with compensations and idempotent steps is the realistic option.' },
    { q: 'Would you build this orchestration in Mule or a BPM/workflow tool?', a: 'Mule can do it with a persisted state model and queues; if the process has many human tasks, long timers and frequent business changes, a workflow engine (with Mule doing the integration calls) is often a better fit.' },
    { q: 'What is your biggest risk?', a: 'Inconsistent state across OSS, billing and the orchestrator. Mitigate with idempotency, correlation IDs, and a daily reconciliation that flags mismatches.' },
  ],
}
