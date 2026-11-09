import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-118',
  category: 'use-cases',
  title: 'Outbound Webhook Delivery Platform for 1,200 Customer Endpoints',
  level: 'ADVANCED',
  tags: ['webhooks', 'retries', 'dlq', 'hmac', 'anypoint-mq', 'event-driven'],
  estMinutes: 40,
  diagram: {
    task: 'draw the webhook platform: the job service publishing events, the event stream, the fan-out that reads subscriptions, the delivery queue, the delivery worker that signs and calls customer endpoints, the retry queue that feeds back into delivery, the dead-letter queue, the delivery log, the admin portal and its API, and the email to customer admins.',
    checks: [
      { label: 'The job service publishes events to a stream or topic', rule: { type: 'edge', from: 'process-api', to: ['event-stream', 'topic'], kind: 'async' } },
      { label: 'A fan-out step reads the subscriptions', rule: { type: 'path', from: ['event-stream', 'topic'], via: 'process-api', to: { type: 'database', label: 'subscription' } } },
      { label: 'Deliveries are queued separately from the event stream', rule: { type: 'path', from: ['event-stream', 'topic'], via: { type: ['queue', 'cloud-queue'], label: 'deliver' }, to: 'external-api' } },
      { label: 'The fan-out never calls the delivery worker directly', rule: { type: 'no-edge', from: 'process-api', to: { type: 'process-api', label: 'deliver' } } },
      { label: 'Customer endpoints are called only by the delivery worker', rule: { type: 'only-via', target: 'external-api', from: { type: 'process-api', label: 'deliver' } } },
      { label: 'The job service never waits on a customer endpoint', rule: { type: 'no-path', from: { type: 'process-api', label: 'job service' }, to: 'external-api', kind: 'sync' } },
      { label: 'Failed deliveries go to a retry queue that feeds delivery again', rule: { type: 'path', from: { type: ['queue', 'cloud-queue'], label: 'retry' }, to: 'external-api' } },
      { label: 'Deliveries that fail for 24 hours are dead-lettered', rule: { type: 'edge', from: 'process-api', to: 'dlq' } },
      { label: 'The admin portal calls its own Experience API', rule: { type: 'edge', from: 'web-app', to: 'experience-api' } },
      { label: 'The admin API reads every attempt from the delivery log', rule: { type: 'edge', from: 'experience-api', to: { type: 'database', label: 'log' } } },
      { label: 'Customer admins are emailed when an endpoint is disabled', rule: { type: 'path', from: 'process-api', to: 'notification' } },
    ],
    reference: diagram(
      {
        src: ['process-api', 'Job service (event producer)'],
        k: ['event-stream', 'Kafka job.events'],
        fan: ['process-api', 'prc-webhook-fanout'],
        subs: ['database', 'Subscriptions and endpoint state'],
        dq: ['queue', 'webhook-deliveries'],
        dlv: ['process-api', 'prc-webhook-delivery (HMAC signing)'],
        retry: ['queue', 'webhook-retry (delayed)'],
        dlq: ['dlq', 'webhook-dead'],
        cust: ['external-api', 'Customer webhook endpoints'],
        log: ['database', 'Delivery log (30 days)'],
        portal: ['web-app', 'Customer admin portal'],
        exp: ['experience-api', 'exp-webhook-admin-api'],
        mail: ['notification', 'Email to customer admin'],
      },
      [
        'src ~> k', 'k ~> fan', 'fan -> subs', 'fan ~> dq', 'dq ~> dlv', 'dlv -> cust', 'dlv ~> retry', 'retry ~> dlv', 'dlv ~> dlq',
        'dlv -> log', 'dlv -> subs', 'dlv -> mail', 'portal -> exp', 'exp -> log', 'exp -> subs', 'exp ~> dq',
      ],
    ),
  },
  description: `
A B2B SaaS company sells **field service scheduling**. Its customers subscribe to **webhooks** for job events (job created, technician assigned, job completed, invoice ready) and receive them on their own HTTPS endpoints.

Facts:
- **1,200 customer endpoints**, about **3 million deliveries per day**, peaks of 150 per second at 08:00.
- Customer endpoints are often slow (some take 10 seconds), and some are down for a day during their own releases.
- Today the job service calls each endpoint inline. One slow customer slowed job creation for **everyone** last month.
- Requirements:
  - At-least-once delivery, retried for **24 hours** with growing delays.
  - Every request signed with **HMAC-SHA256** using a secret per endpoint, with a timestamp to stop replays.
  - One slow or dead endpoint must not delay other customers.
  - After 24 hours of failures the endpoint is **disabled** and the customer admin gets an email.
  - Customers can see every attempt (status code, time, latency) for 30 days in the admin portal and **replay** an event.

**Describe your solution:**
- How are events turned into deliveries?
- How are retries, delays and disabling handled?
- How do you isolate customers from each other?
- What does a signed request look like, and how does the customer verify it?
`,
  answerTemplate: `## Events to deliveries

## Delivery worker and signing

## Retries, dead letters and disabling

## Isolation

## Portal and replay
`,
  keyPoints: [
    'The job service publishes once to a stream and never calls customer endpoints, so job creation no longer depends on any customer.',
    'A fan-out step reads subscriptions and creates one delivery message per matching endpoint, with its own delivery ID.',
    'The delivery worker signs each request (HMAC of timestamp and body, secret per endpoint), uses a short timeout, and treats 2xx as success.',
    'Failures go to a retry queue with growing delays (1 min, 5 min, 30 min, 2 h ...); after 24 hours the delivery is dead-lettered and the endpoint disabled with an email.',
    'Isolation: limit concurrency per endpoint and park endpoints that keep failing, so a slow customer cannot hold all workers.',
    'Every attempt is written to a delivery log; the portal reads it and replay puts a new delivery on the queue.',
  ],
  solution: `
\`\`\`
 Job service ~> job.events ~> prc-webhook-fanout -> subscriptions
                                               ~> [webhook-deliveries] ~> prc-webhook-delivery -> customer endpoints
                                                                        ~> [webhook-retry, delayed] ~> delivery
                                                                        ~> [webhook-dead]
                                                                        -> delivery log, endpoint state, email
 admin portal -> exp-webhook-admin-api -> delivery log, subscriptions; ~> deliveries (replay)
\`\`\`

**Events to deliveries.** The job service publishes each event once to \`job.events\`. prc-webhook-fanout looks up active subscriptions for the event type and tenant (cached for a minute), and writes one message per endpoint to \`webhook-deliveries\` with \`deliveryId\`, \`eventId\`, \`endpointId\` and attempt 1.

**Delivery worker and signing.** For each message the worker loads the endpoint URL and secret (secrets encrypted at rest), builds headers \`X-Webhook-Id\`, \`X-Webhook-Timestamp\` and \`X-Webhook-Signature = HMAC-SHA256(secret, timestamp + "." + body)\`, and posts with a **5 second timeout**. 2xx is success; everything else is a failure. The customer recomputes the HMAC on the raw body, compares in constant time, and rejects timestamps older than 5 minutes. \`X-Webhook-Id\` lets them drop repeats, since delivery is at least once.

**Retries, dead letters and disabling.** On failure the worker publishes the message to \`webhook-retry\` with a delivery delay from a schedule: 1 min, 5 min, 30 min, 2 h, 6 h, 12 h. Anypoint MQ supports a delivery delay up to 15 minutes, so longer waits re-queue more than once, or a scheduled job releases due retries from a table. After 24 hours the message goes to \`webhook-dead\`, the endpoint is marked **disabled**, and the customer admin gets an email with a link to re-enable and replay.

**Isolation.** A shared queue with many slow endpoints can fill every worker thread. So:
- limit concurrent requests per endpoint (a counter in Object Store v2, or shard the delivery queue by endpoint hash);
- when an endpoint fails 10 times in a row, open a breaker for that endpoint: its messages go straight to retry without a call;
- large customers can get their own delivery queue.

**Portal and replay.** Every attempt is written to the delivery log (status, latency, response snippet without secrets). The portal reads it through exp-webhook-admin-api. Replay creates a new delivery message for the same event.
`,
  followUps: [
    { q: 'Why include a timestamp in the signed content?', a: 'Without it a captured request could be sent again later and still verify. The customer rejects timestamps older than a few minutes.' },
    { q: 'How do you stop one dead endpoint from using all delivery workers?', a: 'Limit concurrency per endpoint and use a short timeout. A per-endpoint breaker moves its messages to retry without calling.' },
    { q: 'Why does the customer need the webhook ID?', a: 'Delivery is at least once, so the same event can arrive twice. The ID lets the receiver ignore a repeat.' },
    { q: 'How do you implement delays longer than the queue allows?', a: 'Re-queue the message with the maximum delay several times, or store the due time in a table. A scheduled job then releases due retries.' },
  ],
}
