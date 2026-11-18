import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-059',
  category: 'architecture',
  title: 'Combining API-led with Event-Driven Architecture',
  level: 'ADVANCED',
  tags: ['myproject', 'api-led', 'event-driven', 'anypoint-mq', 'cdc', 'pub-sub'],
  estMinutes: 45,
  diagram: {
    task: 'redesign order creation with events (at least two subscribers) and show how Salesforce customer changes are captured and published.',
    checks: [
      { label: 'Channels call an Experience API', rule: { type: 'each', of: ['web-app', 'mobile-app'], edgeTo: 'experience-api' } },
      { label: 'The order is still created in SAP synchronously, through a System API', rule: { type: 'path', from: 'experience-api', to: 'erp', via: 'system-api', kind: 'sync' } },
      { label: 'The Process layer publishes OrderCreated asynchronously', rule: { type: 'edge', from: 'process-api', to: ['topic', 'queue', 'event-stream'], kind: 'async' } },
      { label: 'At least two subscribers consume the event asynchronously', rule: { type: 'edge', from: ['queue', 'topic', 'event-stream'], to: 'process-api', kind: 'async', min: 2 } },
      { label: 'The Experience API does not publish business events', rule: { type: 'no-edge', from: 'experience-api', to: ['topic', 'queue', 'event-stream'] } },
      { label: 'Salesforce changes are captured by the System layer and published as an event', rule: { type: 'edge', from: 'system-api', to: ['topic', 'queue', 'event-stream'], kind: 'async' } },
      { label: 'Subscribers reach their backends only through System APIs', rule: { type: 'only-via', target: ['erp', 'crm', 'legacy', 'saas', 'database'], from: 'system-api' } },
      { label: 'Experience APIs never call System APIs directly', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
      { label: 'OrderCreated reaches the backends of at least two subscribers', rule: { type: 'path', from: { type: 'process-api', label: 'order' }, via: ['topic', 'queue', 'event-stream'], to: ['erp', 'crm', 'legacy', 'saas', 'wms', 'database', 'notification', 'data-warehouse', 'external-api'], min: 2 } },
      { label: 'No chain of sync calls joins the order request to loyalty, warehouse, email or analytics', rule: { type: 'no-path', from: 'experience-api', to: { label: ['loyalty', 'warehouse', 'wms', 'fulfil', 'email', 'notif', 'analytics'] }, kind: 'sync', ifDrawn: true } },
      { label: 'A System API is joined to Salesforce to capture its changes', rule: { type: 'link', from: 'system-api', to: 'crm' } },
      { label: 'A Process API subscribes to the Salesforce change event', rule: { type: 'path', from: 'system-api', via: ['topic', 'queue', 'event-stream'], to: 'process-api' } },
      { label: 'Every Process API does its work through a System API', rule: { type: 'each', of: 'process-api', edgeTo: ['system-api', 'notification', 'data-warehouse'] } },
      { label: 'APIs call each other with sync calls. Async work goes through a broker', rule: { type: 'lines', from: ['web-app', 'mobile-app', 'experience-api', 'process-api'], to: ['experience-api', 'process-api', 'system-api'], kind: 'sync' } },
      { label: 'Every line to or from a queue or topic is an async message', rule: { type: 'lines', touching: ['queue', 'topic', 'event-stream', 'cloud-queue', 'dlq'], kind: 'async' } },
    ],
    reference: diagram(
      {
        web: ['web-app', 'Web shop'],
        exp: ['experience-api', 'exp-web-api', { vCores: '0.2' }],
        po: ['process-api', 'prc-order-api', { vCores: '0.2' }],
        ssap: ['system-api', 'sys-sap-order-api', { vCores: '0.2' }],
        sap: ['erp', 'SAP'],
        ex: ['topic', 'OrderCreated exchange'],
        qf: ['queue', 'fulfilment-q'],
        ql: ['queue', 'loyalty-q'],
        pf: ['process-api', 'prc-fulfilment', { vCores: '0.2' }],
        pl: ['process-api', 'prc-loyalty', { vCores: '0.5' }],
        swms: ['system-api', 'sys-wms-api', { vCores: '0.2' }],
        sloy: ['system-api', 'sys-loyalty-api', { vCores: '0.5' }],
        wms: ['legacy', 'WMS'],
        loy: ['saas', 'Loyalty platform'],
        ssf: ['system-api', 'sys-sfdc-customer-api (CDC listener)'],
        sfdc: ['crm', 'Salesforce'],
        cev: ['topic', 'CustomerChanged'],
        pcs: ['process-api', 'prc-customer-sync'],
      },
      [
        'web -> exp', 'exp -> po', 'po -> ssap', 'ssap -> sap', 'po ~> ex', 'ex ~> qf', 'ex ~> ql', 'qf ~> pf', 'ql ~> pl',
        'pf -> swms', 'swms -> wms', 'pl -> sloy', 'sloy -> loy', 'ssf -> sfdc', 'ssf ~> cev', 'cev ~> pcs', 'pcs -> sloy',
      ],
    ),
    simulation: {
      systems: [
        { match: 'erp', latencyMs: 400 },
        { match: 'legacy', latencyMs: 300 },
        { match: 'saas', latencyMs: 2000, maxRps: 150 },
      ],
      tests: [
        {
          name: 'Orders at peak',
          about: 'The web shop places 60 orders a second for ten minutes. Each order is answered in under a second, and both the warehouse and the loyalty platform get every order.',
          traffic: [{ name: 'orders', from: 'web-app', rps: 60, kind: 'write', to: ['erp', 'legacy', 'saas'] }],
          expect: {
            answers: [{ minSuccess: 0.99, maxMs: 1000 }],
            delivered: [{ to: 'legacy', min: 0.97 }, { to: 'saas', min: 0.97 }],
          },
        },
        {
          name: 'Loyalty is down and the broker restarts',
          about: 'The loyalty platform is down from minute 3 to minute 8, and the broker restarts at minute 6. Orders are still taken, no loyalty message is lost, and the backlog is gone by minute 20.',
          traffic: [{ name: 'orders', from: 'web-app', rps: 60, kind: 'write', to: ['erp', 'legacy', 'saas'] }],
          incidents: [{ down: 'saas', at: 3, forMin: 5 }, { restart: ['queue', 'topic'], at: 6 }],
          durationMin: 20,
          expect: {
            answers: [{ minSuccess: 0.99 }],
            delivered: [{ to: 'saas', min: 0.97 }],
            backlog: [{ queue: ['queue', 'topic'], maxEnd: 100 }],
            lost: { max: 0 },
          },
        },
      ],
    },
  },
  description: `
An interviewer challenges you: *"API-led is all synchronous request/response. Real enterprises are event-driven. How do events fit into the three layers?"*

Scenario: a retailer's \`prc-order-api\` creates orders in SAP. After an order is created, **five** things must happen: warehouse picking, loyalty points, customer email, fraud scoring, analytics.

What is wrong today:
- \`prc-order-api\` calls all five synchronously.
- The order POST takes 4 s.
- The POST fails if loyalty is down.

Also, customer master data changes directly in Salesforce (by sales users), and three systems need those changes.

Numbers to design for:
- At peak the web shop places 60 orders a second.
- SAP creates an order in about 400 ms and the WMS answers in 300 ms. The loyalty platform takes about 2 s per call and takes at most 150 calls a second.
- The order POST must answer in under a second, even when the loyalty platform is down for several minutes.
- No loyalty or warehouse message may be lost, even if the broker restarts while messages wait.

**Questions:**
1. Redesign order creation using events. Which layer **publishes** and which layers **subscribe**?
2. How do you capture changes that happen **inside** a system of record (Salesforce edits)? Which layer owns that?
3. What do you put in the event (thin vs fat), and how do you document it (AsyncAPI, Exchange)?
4. What new problems do events introduce, and how do you handle them?
`,
  answerTemplate: `## Order creation with events

## Change capture at the System layer

## Event design and documentation

## New problems
`,
  keyPoints: [
    'Synchronous API-led for commands and queries that need an immediate answer; events for notifying "something happened" to many independent interested parties.',
    'The Process layer is the natural publisher of business events (OrderCreated) after the core transaction succeeds; subscribers are Process-layer apps of other domains, each calling their own System APIs.',
    'The System layer captures changes made inside a SoR (Salesforce CDC/Platform Events, DB CDC, polling with watermark) and publishes normalised system-level events, which Process apps may turn into business events.',
    'Events are contracts: versioned schemas documented with AsyncAPI in Exchange, with thin-vs-fat payload chosen consciously.',
    'Events bring eventual consistency, duplicate/out-of-order delivery (idempotent consumers), dead-letter queues and harder tracing (correlation ids in message headers).',
    'Sizing: 0.2 vCore for the order path at 60 orders a second; 0.5 vCore for the loyalty subscriber and its System API, because 2 s calls hold threads and the backlog must drain after an outage.',
    'Persistent queues keep waiting messages through a broker restart. A redelivery limit without a DLQ drops messages while a subscriber is down.',
  ],
  solution: `
**Order creation with events.**
\`\`\`
exp-*  --POST /orders-->  prc-order-api --> sys-sap-order-api  (sync: must succeed)
                              |
                              | publish OrderCreated (Anypoint MQ exchange / topic)
                              v
        +-----------+-----------+-----------+-----------+
        v           v           v           v           v
  prc-fulfil   prc-loyalty  prc-notify   prc-fraud   analytics
  (queue)      (queue)      (queue)      (queue)     (queue)
     |             |            |            |
  sys-wms-api  sys-loyalty  sys-email    sys-fraud
\`\`\`
- \`prc-order-api\` does the **must-be-synchronous** part (validate, create in SAP), returns **201** in ~500 ms, and publishes \`OrderCreated\`.
- With Anypoint MQ: publish to a **message exchange** bound to one **queue per subscriber**, so each consumer has independent pace, retries and a **DLQ**. (Kafka or another broker works the same conceptually with topics and consumer groups.)
- Loyalty being down no longer fails orders; its queue simply builds up and drains later.
- To avoid "SAP order created but event lost", use the **transactional outbox** or publish with reliable retries; consumers are idempotent.
- Fraud scoring: if fraud must *block* the order, it is part of the synchronous command (or the order is created in a "pending" state and the event-driven flow approves/rejects it).

**Change capture at the System layer.** Changes made inside Salesforce by users never pass through your APIs, so the **System layer** owns detection:
- Salesforce: subscribe to **Change Data Capture** or Platform Events via the Salesforce connector; databases: CDC tools or polling with a watermark (\`modifiedSince\`); SAP: IDocs or change pointers.
- \`sys-sfdc-customer-api\` (or a companion listener app in the System layer) normalises the change into a **system event** (\`CustomerChanged\` with the clean model) and publishes it.
- A Process-layer app (e.g. \`prc-customer-sync\`) subscribes, applies business rules (which systems need it, survivorship) and calls target System APIs.
- Layers still apply: System hides the SoR's change mechanism; Process owns business meaning and routing.

**Event design and documentation.**
- **Thin** event (\`orderId\`, \`eventType\`, \`occurredAt\`) — consumers call back \`GET /orders/{id}\`: always current data, but load on the API and coupling at read time.
- **Fat** event (full order snapshot) — consumers are autonomous, but payload/PII and schema evolution concerns.
- Common compromise: business-relevant fields + id; include an \`eventId\`, \`correlationId\`, \`schemaVersion\`.
- Document with **AsyncAPI** specs published to Exchange (alongside RAML/OAS) so events are discoverable and reused like APIs.

**New problems.**

| Problem | Mitigation |
|---|---|
| Eventual consistency (email sent before WMS acknowledges) | Design UX/business for it; status resources |
| Duplicates (at-least-once delivery) | Idempotent consumers keyed on \`eventId\` |
| Ordering | Partition/sequence by key where needed, or use versions/timestamps and ignore stale |
| Poison messages | Bounded redelivery, DLQ, alerting and replay tooling |
| Tracing | Correlation id in message properties, logged by every consumer |
| Hidden coupling via schema | Versioned schemas, additive changes only |

**Sizing and failure handling.**
- At 60 orders a second, 0.1 vCore (about 50 requests a second) is not enough, so the Experience, order Process and SAP System APIs get 0.2 vCore each. The order POST takes about 0.5 s because it waits for SAP only.
- The loyalty subscriber and \`sys-loyalty-api\` get 0.5 vCore. Each loyalty call takes 2 s and holds a thread, and after a 5 minute outage they must take the 60 new orders a second plus the backlog of 18,000 messages.
- The queues keep persistent messages, so a broker restart during the outage loses nothing. With no redelivery limit, messages wait while loyalty is down instead of being dropped; when you set a limit, draw a DLQ from the queue.
`,
  followUps: [
    { q: 'Should the Experience API publish events?', a: 'Rarely. Business events should come from the layer that knows the business fact has happened (Process or System); an Experience API publishing domain events usually means business logic leaked into it.' },
    { q: 'Isn\'t a Process API that subscribes to a queue no longer an "API"?', a: 'It is an integration application in the Process layer with an asynchronous interface; the layer describes responsibility, not the transport. Its contract is the event schema rather than a REST spec.' },
    { q: 'When do you choose orchestration (sync) over choreography (events)?', a: 'Orchestration when the caller needs the outcome now or steps need central control and compensation; choreography when downstream reactions are independent, can be delayed, and should not affect the caller.' },
  ],
}
