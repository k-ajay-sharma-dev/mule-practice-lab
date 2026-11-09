import { diagram } from '../../arch/dsl.js'

export default {
  id: 'cs-108',
  category: 'case-studies',
  title: 'Mobile Operator Automating Number Porting Through a National Clearing House',
  level: 'INTERMEDIATE',
  tags: ['telecom', 'number-porting', 'bss-oss', 'async', 'anypoint-mq', 'long-running', 'status-tracking'],
  estMinutes: 40,
  diagram: {
    task: 'draw the port-in design: stores and the app submitting through one Experience API, a porting Process API that keeps the state of each request, the clearing house behind a System API, its responses arriving on a queue, and HLR routing and billing changed through System APIs.',
    checks: [
      { label: 'Stores and the self-care app submit port requests through an Experience API', rule: { type: 'each', of: ['internal-app', 'mobile-app'], min: 2, edgeTo: 'experience-api' } },
      { label: 'The clearing house is called only through its System API', rule: { type: 'only-via', target: 'external-api', from: 'system-api' } },
      { label: 'Clearing house responses reach the porting Process API through a queue', rule: { type: 'path', from: 'external-api', via: 'queue', to: 'process-api' } },
      { label: 'No synchronous chain runs from a clearing house callback to the porting Process API', rule: { type: 'no-path', from: 'external-api', to: 'process-api', kind: 'sync' } },
      { label: 'Lines to and from the response queue are async messages', rule: { type: 'lines', touching: ['queue', 'dlq'], kind: 'async' } },
      { label: 'The porting Process API keeps the state of each port request', rule: { type: 'edge', from: 'process-api', to: 'database' } },
      { label: 'HLR number routing is changed only through a System API', rule: { type: 'only-via', target: { type: 'legacy', label: ['hlr', 'routing'] }, from: 'system-api' } },
      { label: 'Billing is activated only through a System API', rule: { type: 'only-via', target: { type: ['legacy', 'erp', 'saas'], label: 'billing' }, from: 'system-api' } },
      { label: 'Every route from a channel to the HLR passes the porting Process API', rule: { type: 'no-path', from: ['internal-app', 'mobile-app'], to: { type: 'legacy', label: ['hlr', 'routing'] }, unless: 'process-api' } },
      { label: 'Responses that cannot be processed go to a dead-letter queue', rule: { type: 'edge', to: 'dlq' } },
    ],
    reference: diagram(
      {
        shop: ['internal-app', 'Retail store tablets'],
        app: ['mobile-app', 'Self-care app'],
        exp: ['experience-api', 'exp-porting-api'],
        prc: ['process-api', 'prc-number-porting-api'],
        db: ['database', 'Port request state'],
        sch: ['system-api', 'sys-clearing-house-api'],
        ch: ['external-api', 'National porting clearing house'],
        scb: ['system-api', 'sys-clearing-house-callback-api'],
        q: ['queue', 'port-responses'],
        dlq: ['dlq', 'port-responses DLQ'],
        soss: ['system-api', 'sys-number-routing-api'],
        hlr: ['legacy', 'HLR and number routing (OSS)'],
        sbill: ['system-api', 'sys-billing-api'],
        bill: ['legacy', 'Amdocs billing (BSS)'],
        sms: ['notification', 'SMS to customer'],
      },
      [
        'shop -> exp', 'app -> exp', 'exp -> prc', 'prc -> db', 'prc -> sch', 'sch -> ch', 'ch -> scb', 'scb ~> q',
        'q ~> prc', 'q ~> dlq', 'prc -> soss', 'soss -> hlr', 'prc -> sbill', 'sbill -> bill', 'prc ~> sms',
      ],
    ),
  },
  description: `
**Context.** A mobile operator with 25 million subscribers handles about 6,000 port-ins and 5,500 port-outs a day, and up to 20,000 port-ins on the first day of a new handset launch. Number porting in its country runs through a **national clearing house** with a SOAP over HTTPS interface:

1. The recipient operator (the one winning the customer) submits a port request.
2. The clearing house asks the donor operator to validate it. The donor has 4 working hours to accept or reject.
3. The clearing house calls back the recipient with the result and later with the agreed **port window**.
4. In the port window both operators change number routing in their networks (HLR and number routing database in the OSS), and the recipient activates billing.

The regulator requires a port to complete within **one working day** and fines operators for late ports.

**Today.** Store staff type the request into the BSS order screen. A back-office team of 14 people re-keys it into the clearing house web portal, watches for results, and raises network and billing tickets. 3% of ports miss the one-day deadline, and customers often lose service for hours because routing and billing are changed at different times.

**Systems**
- BSS: Amdocs billing and customer management.
- OSS: HLR and number routing database, with a provisioning API that accepts one change at a time.
- Store tablets and the self-care app (new: customers will be able to request a port-in themselves).

**Constraints**
- Clearing house callbacks must be acknowledged within 5 seconds, or the clearing house retries and later suspends the operator's endpoint.
- Callbacks can arrive twice.
- The OSS provisioning API allows 20 changes per second.

**Your task.** Design the automated port-in process and explain how it meets the one-day rule.
`,
  answerTemplate: `## Port request lifecycle (states)

## Components and responsibilities

## Handling clearing house callbacks

## Port window: network and billing

## Errors, retries and monitoring
`,
  keyPoints: [
    'A porting Process API owns a state machine per port request (submitted, accepted, rejected, window scheduled, completed, failed) stored in a database.',
    'The clearing house is wrapped by a System API for requests; callbacks are acknowledged fast and put on a queue, so the 5 second limit is always met.',
    'Callbacks are processed idempotently using the clearing house message ID, because duplicates happen.',
    'In the port window, number routing and billing are changed by the Process API through System APIs, routing first and billing right after, with retries and alerts if either fails.',
    'Ports approaching the one-day deadline are monitored and escalated to the back-office team before they breach.',
  ],
  solution: `
**States.** \`SUBMITTED → DONOR_ACCEPTED | DONOR_REJECTED → WINDOW_SCHEDULED → ROUTING_DONE → COMPLETED\`, plus \`FAILED\`. Each change is written to the port request table with a timestamp, so the deadline clock is always known.

**Submitting.** Store tablets and the self-care app call \`exp-porting-api\`. The Process API validates the number and the customer, stores the request, and calls \`sys-clearing-house-api\` (SOAP, mutual TLS). The response only confirms receipt.

**Callbacks.** \`sys-clearing-house-callback-api\` receives each callback, checks the signature, writes it to the \`port-responses\` queue and returns 200 within milliseconds. The Process API consumes the queue, looks up the request, ignores a message ID it has already processed, and moves the state machine on. Messages that fail after retries go to a DLQ with an alert.

**Port window.** A scheduler in the Process API picks requests whose window has opened. It calls \`sys-number-routing-api\` (throttled to 20 per second) and then \`sys-billing-api\`. If billing fails, it retries; after three failures the request is flagged for the back office, while routing stays in place because the customer must keep service. The customer gets an SMS when the port completes.

**Monitoring.** A dashboard shows ports by state and age. Any port older than 18 working hours raises an alert, well before the 24 hour regulatory limit.
`,
  followUps: [
    { q: 'Why not process the callback inside the HTTP request?', a: 'The clearing house expects an acknowledgement within 5 seconds. Routing and billing calls can take longer, and a slow answer makes the clearing house retry and eventually suspend the endpoint.' },
    { q: 'How do you handle a duplicate callback?', a: 'Store the clearing house message ID with each processed callback. A message ID seen before is acknowledged and skipped.' },
    { q: 'What do you do if number routing succeeds and billing fails?', a: 'Keep the routing change so the customer has service. Retry billing, then escalate to the back office with the request ID, because reversing routing would cut the customer off.' },
    { q: 'How would port-outs differ?', a: 'The clearing house asks the operator, as donor, to validate a request. The Process API checks the account and answers within the 4 hour window, then removes routing and closes billing in the port window.' },
  ],
}
