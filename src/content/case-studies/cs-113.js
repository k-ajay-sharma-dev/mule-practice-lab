import { diagram } from '../../arch/dsl.js'

export default {
  id: 'cs-113',
  category: 'case-studies',
  title: 'Mobile Operator Activating eSIM Postpaid Orders Across BSS and OSS',
  level: 'ADVANCED',
  tags: ['telecom', 'bss-oss', 'orchestration', 'saga', 'long-running', 'anypoint-mq', 'salesforce', 'tm-forum'],
  estMinutes: 55,
  diagram: {
    task: 'draw order to activate: Salesforce order events queued to an orchestration Process API that keeps state, calls credit, number, eSIM and billing System APIs, requests network provisioning through a queue, receives results on a queue, and updates the order in Salesforce through its System API.',
    checks: [
      { label: 'Submitted orders reach the orchestrator as async messages through a queue', rule: { type: 'path', from: 'crm', via: 'queue', to: { type: 'process-api', label: ['activate', 'orchestr'] }, kind: 'async' } },
      { label: 'The orchestrator keeps the state of each order', rule: { type: 'edge', from: { type: 'process-api', label: ['activate', 'orchestr'] }, to: 'database' } },
      { label: 'Every OSS, BSS and third-party system is reached only through System APIs', rule: { type: 'only-via', target: ['legacy', 'external-api'], from: 'system-api' } },
      { label: 'The orchestrator calls at least four System APIs (credit, number, eSIM, billing)', rule: { type: 'edge', from: { type: 'process-api', label: ['activate', 'orchestr'] }, to: 'system-api', min: 4 } },
      { label: 'Network provisioning is requested through a queue (the provisioning System API is fed only from a queue)', rule: { type: 'only-via', target: { type: 'system-api', label: 'provisioning' }, from: 'queue' } },
      { label: 'The orchestrator never waits on a synchronous call to the provisioning gateway', rule: { type: 'no-path', from: { type: 'process-api', label: ['activate', 'orchestr'] }, to: { type: 'legacy', label: ['hss', 'provisioning'] }, kind: 'sync' } },
      { label: 'Provisioning results come back to the orchestrator as async messages', rule: { type: 'path', from: { type: 'system-api', label: 'provisioning' }, via: 'queue', to: { type: 'process-api', label: ['activate', 'orchestr'] }, kind: 'async' } },
      { label: 'Order status goes back to Salesforce only through its System API', rule: { type: 'only-via', target: 'crm', from: 'system-api' } },
      { label: 'Messages that keep failing go to a dead-letter queue', rule: { type: 'edge', to: 'dlq' } },
      { label: 'Lines to and from queues and topics are async messages', rule: { type: 'lines', touching: ['queue', 'topic', 'dlq'], kind: 'async' } },
    ],
    reference: diagram(
      {
        sf: ['crm', 'Salesforce Communications Cloud (orders)'],
        ssf: ['system-api', 'sys-salesforce-order-api'],
        oq: ['queue', 'order-submitted'],
        orch: ['process-api', 'prc-order-to-activate-api'],
        st: ['database', 'Orchestration state'],
        scred: ['system-api', 'sys-credit-check-api'],
        cred: ['external-api', 'Credit bureau'],
        snum: ['system-api', 'sys-number-inventory-api'],
        num: ['legacy', 'Number inventory (OSS)'],
        sesim: ['system-api', 'sys-esim-smdp-api'],
        smdp: ['external-api', 'SM-DP+ eSIM platform'],
        pq: ['queue', 'provisioning-requests'],
        sprov: ['system-api', 'sys-network-provisioning-api'],
        hss: ['legacy', 'HSS/UDM provisioning gateway (OSS)'],
        rq: ['queue', 'provisioning-results'],
        sbill: ['system-api', 'sys-billing-api'],
        bill: ['legacy', 'Billing (BSS)'],
        dlq: ['dlq', 'Order DLQs'],
      },
      [
        'sf ~> ssf', 'ssf ~> oq', 'oq ~> orch', 'orch -> st', 'orch -> scred', 'scred -> cred', 'orch -> snum', 'snum -> num',
        'orch -> sesim', 'sesim -> smdp', 'orch ~> pq', 'pq ~> sprov', 'sprov -> hss', 'sprov ~> rq', 'rq ~> orch',
        'orch -> sbill', 'sbill -> bill', 'orch -> ssf', 'ssf -> sf', 'pq ~> dlq', 'oq ~> dlq',
      ],
    ),
  },
  description: `
**Context.** A mobile operator with 18 million subscribers sells postpaid plans with **eSIM** online and in 600 stores. Orders are captured in **Salesforce Communications Cloud** (the BSS order front end, aligned to TM Forum TMF622 Product Ordering). Activation needs five back-end steps:

| Step | System | Interface | Typical time |
|---|---|---|---|
| Credit check | External credit bureau | REST | 1 to 3 s |
| Reserve and assign MSISDN | Number inventory (OSS) | SOAP | under 1 s |
| Create eSIM profile and QR code | SM-DP+ platform (vendor hosted, GSMA ES2+) | REST, mutual TLS | 2 to 10 s |
| Provision subscriber in the network | HSS/UDM provisioning gateway (OSS) | SOAP, one request at a time per element | 5 to 90 s |
| Create billing account and subscription | Billing (BSS) | SOAP | 2 to 5 s |

**Volumes.** 9,000 orders a day; **60,000 on a flagship phone launch day**, with 25% arriving in the first hour.

**Problems today**
- A Salesforce Apex job calls each system in turn. When the provisioning gateway is slow, Apex callouts time out and the job is rerun by hand.
- 4% of orders stop half way: number reserved and eSIM created, but no billing. Some customers use the network for weeks without being billed; others are billed with no service.
- Customers wait up to 4 hours for the eSIM QR code; the target is **5 minutes**.

**Constraints**
- Salesforce must show the order state at each step (TMF622 states: acknowledged, inProgress, completed, failed).
- The provisioning gateway accepts at most 30 concurrent requests.
- A failed order must leave no reserved number, active profile or billing account behind.

**Your task.** Design the order to activate integration, including how a failed step is undone.
`,
  answerTemplate: `## Order capture to orchestration

## Orchestration steps and state

## Network provisioning (slow, limited)

## Compensation when a step fails

## Launch day peak

## Status back to Salesforce
`,
  keyPoints: [
    'Salesforce publishes an order event; Mule queues it, so Salesforce never waits for the back end and launch day peaks are absorbed.',
    'One orchestration Process API runs a saga: each step and its result are stored, so an order can resume after a crash and no step runs twice.',
    'Fast steps (credit, number, eSIM, billing) are synchronous calls through System APIs; network provisioning goes through a queue whose consumer concurrency is capped at 30 for the gateway.',
    'Each step has a compensating action (release number, delete eSIM profile, close billing account) run in reverse order when a later step fails.',
    'The orchestrator updates the TMF622 state in Salesforce through the Salesforce System API at each milestone.',
  ],
  solution: `
**Capture.** When an order is submitted, Salesforce raises an \`OrderSubmitted\` platform event. \`sys-salesforce-order-api\` subscribes and writes a canonical order to \`order-submitted\`. Launch day orders wait in the queue instead of timing out.

**Saga.** \`prc-order-to-activate-api\` consumes the queue and stores the order in a state table: one row per step with status and the IDs returned (MSISDN, ICCID, billing account). Steps:
1. Credit check (stop with \`failed\` if declined; nothing to undo).
2. Reserve MSISDN.
3. Create eSIM profile at the SM-DP+.
4. Send a provisioning request to \`provisioning-requests\`.
5. On the result message, create billing account and subscription.
6. Release the eSIM QR code to the customer and set the order \`completed\`.

**Provisioning.** \`sys-network-provisioning-api\` consumes with a maximum concurrency of 30, calls the gateway, and publishes the outcome to \`provisioning-results\`. A provisioning result carries the order ID, so the orchestrator picks the order up from its state table.

**Compensation.** If a step fails after retries, the orchestrator runs the undo actions for completed steps in reverse: deprovision, delete eSIM profile, release MSISDN. Undo actions are retried until they succeed and are idempotent. Orders that still cannot be cleaned go to the DLQ and a repair queue for the back office.

**Status.** At each milestone the orchestrator updates the order through \`sys-salesforce-order-api\` (TMF622 state and a step note).

**Peak.** 15,000 orders in the first launch hour is about 4 per second. The fast steps cope; provisioning at 30 in parallel and about 20 seconds each handles 1.5 per second, so a backlog builds and drains within a few hours. The QR code target is met for most customers, and the launch plan raises the gateway limit with the network team.
`,
  followUps: [
    { q: 'Why an orchestrator and not choreography between the systems?', a: 'The order has a strict sequence and needs one place that knows its state and can undo steps. With choreography, each system would need to understand the order lifecycle and the rollback rules.' },
    { q: 'How do you avoid creating two eSIM profiles if the orchestrator crashes mid-step?', a: 'Store the step as started before calling, and pass the order ID as an idempotency key. On restart, the orchestrator asks the SM-DP+ for a profile with that key before creating another.' },
    { q: 'Why not undo provisioning when billing fails?', a: 'It depends on business policy. Most operators keep service and retry billing, because cutting off a paying customer is worse than a short delay in creating the bill.' },
    { q: 'How would you use TM Forum Open APIs here?', a: 'TMF622 shapes the product order from Salesforce, and TMF641 can describe the service order sent to OSS. Using them as the canonical model makes a later change of BSS or OSS vendor cheaper.' },
  ],
}
