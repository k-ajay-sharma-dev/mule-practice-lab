import { diagram } from '../../arch/dsl.js'

export default {
  id: 'cs-040',
  category: 'case-studies',
  title: 'Retail Bank Streaming Transactions for Fraud Detection',
  level: 'ADVANCED',
  tags: ['banking', 'fraud', 'event-streaming', 'kafka', 'low-latency'],
  estMinutes: 50,
  diagram: {
    task: 'draw the two paths: the short synchronous scoring call for instant payments, and the asynchronous Kafka path for context events and for routing fraud decisions to case management, customer contact and the payment hub.',
    checks: [
      { label: 'Instant payments are scored by a synchronous call to the fraud engine', rule: { type: 'edge', from: ['system-api', 'experience-api', 'process-api', 'legacy', 'erp'], to: { type: ['saas', 'external-api'], label: ['fraud', 'scoring'] }, kind: 'sync' } },
      { label: 'Logins, payee changes and card events are published asynchronously to Kafka', rule: { type: 'edge', to: 'event-stream', kind: 'async', min: 2 } },
      { label: 'The fraud engine ingests the context events from Kafka', rule: { type: 'edge', from: 'event-stream', to: { type: ['saas', 'external-api'], label: ['fraud', 'scoring'] }, kind: 'async' } },
      { label: 'Mule consumes fraud decisions/alerts from a topic and routes them', rule: { type: 'edge', from: ['event-stream', 'topic', 'queue'], to: 'process-api', kind: 'async' } },
      { label: 'Case management is reached only through a System API', rule: { type: 'only-via', target: { type: ['saas', 'crm'], label: ['case'] }, from: 'system-api' } },
      { label: 'Customers are contacted (SMS / app push) when a payment is held', rule: { type: 'path', from: 'event-stream', to: 'notification' } },
      { label: 'Held payments are released or rejected through a payment-hub System API', rule: { type: 'edge', from: 'process-api', to: { type: 'system-api', label: ['payment', 'hub'] } } },
    ],
    reference: diagram(
      {
        router: ['process-api', 'prc-fraud-alert-router'],
        cardjob: ['batch-job', 'Card switch file publisher'],
        ks: ['event-stream', 'banking.* events (key = customer ID)'],
        dec: ['event-stream', 'fraud.decisions / alerts'],
        score: ['system-api', 'sys-fraud-scoring-api (lean, 120 ms timeout)', { replicas: 2, vCores: '1', timeoutMs: 120, circuitBreaker: 'on', onFailure: 'partial answer' }],
        olbs: ['system-api', 'sys-online-banking-events-api', { replicas: 2, vCores: '1' }],
        scase: ['system-api', 'sys-case-mgmt-api'],
        scontact: ['system-api', 'sys-contact-api'],
        sph: ['system-api', 'sys-payment-hub-api'],
        hub: ['legacy', 'Instant payment hub'],
        engine: ['saas', 'Fraud scoring engine'],
        olb: ['saas', 'Online-banking platform (webhooks)'],
        card: ['file-store', 'Card switch files'],
        case: ['saas', 'Case management'],
        notif: ['notification', 'SMS / app push'],
      },
      [
        'hub -> score', 'score -> engine', 'hub ~> ks', 'olb -> olbs', 'olbs ~> ks', 'cardjob -> card', 'cardjob ~> ks',
        'ks ~> engine', 'engine ~> dec', 'dec ~> router', 'router -> scase', 'router -> scontact', 'router -> sph',
        'scase -> case', 'scontact -> notif', 'sph -> hub',
      ],
    ),
    simulation: {
      systems: [
        { match: 'legacy', latencyMs: 10 },
        { match: { type: 'saas', label: 'scoring engine' }, latencyMs: 60 },
        { match: 'saas', latencyMs: 100 },
      ],
      tests: [
        {
          name: 'The scoring engine slows down',
          about: 'The payment hub asks for 400 scores a second, and for 10 minutes the scoring engine takes 2 seconds to answer. The scoring API gives up after 120 ms and the payment goes on by the risk policy, so every payment gets a decision within 150 ms.',
          traffic: [{ name: 'instant payments', from: 'legacy', rps: 400, to: { type: 'saas', label: 'scoring engine' } }],
          incidents: [{ slow: { type: 'saas', label: 'scoring engine' }, latencyMs: 2000, at: 3, forMin: 10 }],
          durationMin: 20,
          expect: { answers: [{ minSuccess: 0.99, maxMs: 150 }] },
        },
        {
          name: 'The online-banking event peak',
          about: 'The online-banking platform sends 800 login and payee events a second. The events API takes each one and puts it on the stream, and none is lost.',
          traffic: [{ name: 'banking events', from: { type: 'saas', label: 'online-banking' }, rps: 800, to: { type: 'saas', label: 'scoring engine' }, kind: 'write' }],
          expect: { answers: [{ minSuccess: 0.99 }], lost: { max: 0 } },
        },
      ],
    },
  },
  description: `
**Context.** A retail bank processes card payments, instant payments, online-banking logins and payee changes in separate systems.

**The problem today.** Its fraud checks run in overnight batches, so instant-payment scams are spotted only after the money has left.

**What the bank has**
- A newly bought real-time fraud-scoring engine. The bank wants every relevant event scored, with high-risk instant payments held before release.
- A Kafka cluster owned by the data team.
- Mule, used for most system integration.

**Goals**
- Instant payments scored before release (budget: 150 ms of the payment's processing time).
- Logins, device changes and payee changes streamed to the fraud engine within seconds to build behaviour profiles.
- Fraud alerts reach case management and the customer-contact system immediately.

**Constraints**
- Instant-payment scheme timing is strict; if scoring is unavailable, the bank must still decide (fail open or closed by risk policy).
- ~3,000 events/s peak across channels, ~400 instant payments/s peak.
- Customer data is sensitive; data minimisation and encryption are mandatory.
- The fraud engine vendor offers a synchronous REST scoring API and a Kafka-based event ingest.
- Plan for 400 scores a second from the payment hub and 800 online-banking events a second. The scoring engine can slow to 2 seconds for 10 minutes.
- The payment hub calls one lean scoring System API. It times out after 120 ms, has a circuit breaker, and on failure returns a partial answer so the risk policy decides. Run it on 2 replicas of 1 vCore each.
- Run the online-banking events System API on 2 replicas of 1 vCore each. Name the APIs sys-fraud-scoring-api, sys-online-banking-events-api, prc-fraud-alert-router, sys-case-mgmt-api, sys-contact-api and sys-payment-hub-api.

**Your task.** Propose:
- the architecture
- the split between synchronous and asynchronous paths
- failure behaviour
`,
  answerTemplate: `## Synchronous vs asynchronous paths

## Event streaming design (topics, keys, ordering)

## Where Mule fits

## Failure behaviour and fallbacks

## Security and data minimisation

## Alerts to case management and customers

## Risks
`,
  keyPoints: [
    'Only the instant-payment decision is synchronous (payment hub → fraud scoring); everything else is asynchronous event streaming.',
    'The synchronous path is as short as possible: the payment hub calls the scoring engine through a single lean System API with a strict timeout and a circuit breaker.',
    'Events are published to Kafka topics keyed by customer/account so per-customer ordering is preserved for the fraud engine profiles.',
    'A documented fallback policy when scoring times out (e.g. release low-value, hold high-value) agreed with the risk team.',
    'Mule adapts systems that cannot publish events themselves and routes fraud decisions/alerts to case management and contact systems.',
    'Payloads are minimised and tokenised; topics are access-controlled and encrypted.',
  ],
  solution: `
**Two paths.**
- *Synchronous (decisioning)*: payment hub → scoring API → decision (release / hold / reject) within 150 ms. Each extra hop costs latency, so one lean \`sys-fraud-scoring-api\` (no heavy transformation, pooled connections, tight timeouts) fronts the vendor for policy enforcement and observability. Calling the vendor directly is the other option if even one hop is too much. Measure p99, not averages.
- *Asynchronous (context)*: logins, device changes, payee changes, card authorisations → Kafka topics → fraud engine ingest. Seconds of latency are acceptable.

**Streaming design.** Topics per event type (\`banking.login.v1\`, \`banking.payee-change.v1\`, \`payments.instant.v1\`); key = customer ID so events for one customer stay ordered within a partition. Schemas versioned in a schema registry. Retention long enough to replay after an engine outage.

**Mule's role.**
- Publish events from systems that cannot produce to Kafka (the online-banking platform's webhooks through \`sys-online-banking-events-api\`, legacy card switch files through a scheduled publisher) using the Kafka connector.
- \`prc-fraud-alert-router\` consumes decision and alert topics and routes them: \`sys-case-mgmt-api\` creates fraud cases; \`sys-contact-api\` triggers customer verification messages (SMS/app push); \`sys-payment-hub-api\` releases or rejects held payments after manual review.
- Expose APIs for agents to look up fraud status.

**Failure behaviour.** Timeout on scoring at 120 ms → return a partial answer and apply a fallback rule set agreed with risk (e.g. low-value payments to known payees released; others held for a short review window). Every fallback decision is logged and re-scored asynchronously afterwards. Circuit breaker on the scoring API to avoid piling up requests during an outage.

**Security.** Events carry tokenised account/card numbers and only the attributes the model needs; encryption in transit (TLS) and at rest; ACLs per topic; secrets in a vault; no personal data in Mule logs.

**Rollout.** Shadow mode first (score but do not act) to tune thresholds and measure latency; then hold only very high scores; then full policy.

**Risks.**
- Latency creep (performance budget per hop, tests in CI).
- False positives annoying customers (shadow mode tuning).
- Ordering problems (customer-keyed partitions).
- Kafka being treated as a free-for-all (topic governance with the data team).
`,
  followUps: [
    { q: 'Why not route every event through Mule APIs before Kafka?', a: 'Systems that can publish natively should; adding Mule hops adds latency and cost without value. Mule earns its place adapting systems that cannot produce events and orchestrating actions on decisions.' },
    { q: 'Fail open or fail closed if the scoring engine is down?', a: 'It is a risk-policy decision, not a technical one. Usually a tiered fallback (amount, payee history) is agreed, logged, and every fallback decision is re-scored later.' },
    { q: 'How do you keep events for one customer in order?', a: 'Use the customer ID as the Kafka message key so all events for that customer go to the same partition, and process each partition sequentially in consumers.' },
  ],
}
