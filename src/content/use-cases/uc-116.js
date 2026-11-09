import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-116',
  category: 'use-cases',
  title: 'Transactional Outbox for SIM Activation Events',
  level: 'ADVANCED',
  tags: ['outbox', 'anypoint-mq', 'event-driven', 'idempotency', 'postgresql', 'telecom'],
  estMinutes: 35,
  diagram: {
    task: 'draw the activation flow with an outbox: the web shop and store app, the activation Experience and Process APIs, the PostgreSQL database with its outbox table, the relay that publishes to the Anypoint MQ exchange, one queue per subscriber, the provisioning, billing and notification consumers with their System APIs, and the dead-letter queue.',
    checks: [
      { label: 'The order service writes the order and outbox row to its database', rule: { type: 'edge', from: 'process-api', to: 'database' } },
      { label: 'The relay reads the outbox table', rule: { type: 'link', from: { type: ['batch-job', 'process-api'], label: ['relay', 'outbox'] }, to: 'database' } },
      { label: 'Only the outbox relay publishes to the exchange', rule: { type: 'only-via', target: 'topic', from: { type: ['batch-job', 'process-api'], label: ['relay', 'outbox'] } } },
      { label: 'Events leave only after the commit: every route from the request to the exchange passes the database', rule: { type: 'no-path', from: 'experience-api', to: 'topic', unless: 'database' } },
      { label: 'Each subscriber has its own queue bound to the exchange', rule: { type: 'each', of: 'queue', edgeFrom: 'topic', kind: 'async', min: 3 } },
      { label: 'HSS and billing are reached only through System APIs', rule: { type: 'only-via', target: ['legacy', 'saas'], from: 'system-api' } },
      { label: 'Provisioning failures go to a dead-letter queue', rule: { type: 'edge', from: 'queue', to: 'dlq' } },
      { label: 'Every line into or out of the exchange and queues is async', rule: { type: 'lines', touching: ['topic', 'queue'], kind: 'async' } },
    ],
    reference: diagram(
      {
        web: ['web-app', 'Web shop'],
        shop: ['internal-app', 'Retail store app'],
        exp: ['experience-api', 'exp-activation-api'],
        prc: ['process-api', 'prc-activation-orders'],
        pg: ['database', 'Orders DB (PostgreSQL): orders + outbox tables'],
        relay: ['batch-job', 'Outbox relay (polls every 2 s)'],
        ex: ['topic', 'Anypoint MQ exchange activation-events'],
        qp: ['queue', 'provisioning-q'],
        qb: ['queue', 'billing-q'],
        qn: ['queue', 'notify-q'],
        dlq: ['dlq', 'provisioning-dlq'],
        pprov: ['process-api', 'prc-provisioning'],
        sprov: ['system-api', 'sys-hss-api'],
        hss: ['legacy', 'HSS / HLR'],
        pbill: ['process-api', 'prc-billing-account'],
        sbill: ['system-api', 'sys-billing-api'],
        bill: ['saas', 'Billing platform'],
        pnote: ['process-api', 'prc-customer-notify'],
        notif: ['notification', 'SMS and email'],
      },
      [
        'web -> exp', 'shop -> exp', 'exp -> prc', 'prc -> pg', 'relay -> pg', 'relay ~> ex', 'ex ~> qp', 'ex ~> qb', 'ex ~> qn', 'qp ~> dlq',
        'qp ~> pprov', 'pprov -> sprov', 'sprov -> hss', 'qb ~> pbill', 'pbill -> sbill', 'sbill -> bill', 'qn ~> pnote', 'pnote -> notif',
      ],
    ),
  },
  description: `
A mobile operator sells SIM and **eSIM activations** on its web shop and in 600 retail stores. \`prc-activation-orders\` saves each order in **PostgreSQL** and then publishes an \`ActivationRequested\` event to an **Anypoint MQ exchange**. Three subscribers react:
- **Provisioning**: activates the number on the HSS / HLR (legacy, slow, sometimes down for an hour at night).
- **Billing**: creates the billing account and the first invoice schedule.
- **Customer notification**: SMS and email with the activation status.

The problem, after one year in production:
- About **40 orders a month** are saved but their event is never published (the app crashed or Anypoint MQ timed out after the commit). Customers pay and get no service.
- About **10 a month** have an event published for an order whose insert was rolled back. Billing creates accounts for orders that do not exist.

Facts:
- **30,000 activations per day**, peaks of 15 per second on new phone launch days.
- Anypoint MQ and PostgreSQL cannot join one XA transaction.
- Subscribers must see the events of one order in order (ActivationRequested before ActivationCancelled).

**Describe your solution:**
- Why does "save then publish" lose or invent events?
- How does the outbox pattern fix it, and what does the relay do exactly?
- What delivery guarantee do subscribers get, and what must they do about it?
- How do you keep the outbox table small?
`,
  answerTemplate: `## Why dual writes fail

## Outbox table

## Relay

## Subscribers

## Operations
`,
  keyPoints: [
    'Writing to the database and publishing to the broker are two separate actions with no shared transaction, so a crash or timeout between them loses or invents an event.',
    'The order row and an outbox row are inserted in the same PostgreSQL transaction, so the event exists if and only if the order does.',
    'A relay reads unpublished outbox rows in order, publishes them, and marks them published only after the broker confirms.',
    'A crash between publish and mark makes the relay publish again, so delivery is at least once and every subscriber is idempotent by eventId.',
    'Ordering per order: the relay publishes in outbox sequence and subscribers use FIFO queues or check versions; published rows are deleted or archived after a few days.',
  ],
  solution: `
\`\`\`
 web shop / store app -> exp-activation-api -> prc-activation-orders -> PostgreSQL (orders + outbox, one transaction)
 outbox relay -> PostgreSQL (read unpublished)  ~> exchange activation-events
   ~> provisioning-q ~> prc-provisioning -> sys-hss-api -> HSS      (~> DLQ)
   ~> billing-q      ~> prc-billing-account -> sys-billing-api -> billing
   ~> notify-q       ~> prc-customer-notify -> SMS / email
\`\`\`

**Why dual writes fail.** "Commit, then publish" loses the event when the app dies after the commit. "Publish, then commit" invents an event when the commit fails. Retrying the publish does not help when the process is gone. With no XA between Anypoint MQ and PostgreSQL there is no way to make both writes atomic directly.

**Outbox table.** \`outbox(id bigserial, aggregate_id, event_type, payload jsonb, created_at, published_at null)\`. prc-activation-orders inserts the order and the outbox row in **one database transaction** (Mule Database connector inside a Try scope with a local transaction). The API then answers 202. It never talks to Anypoint MQ.

**Relay.** A scheduled flow every 2 seconds (with a single active instance, or row locking with \`FOR UPDATE SKIP LOCKED\` for several):
1. selects up to 200 rows with \`published_at IS NULL\` ordered by \`id\`;
2. publishes each to the exchange with \`eventId = outbox.id\` and the order ID as a property;
3. sets \`published_at\` after the publish succeeds.
If the relay crashes after step 2, the row is published again. So the guarantee is **at least once**. A database CDC feed on the outbox table (Debezium) is an alternative to polling when latency must be lower.

**Subscribers.** Each subscriber has its own queue bound to the exchange, so a slow HSS does not hold billing back. Each one stores processed \`eventId\`s (Idempotent Message Validator with a persistent Object Store, or a unique key in its own table) and ignores repeats. The provisioning queue sends messages to a DLQ after 5 failed deliveries, which covers the nightly HSS window with retries and a delay.

**Operations.** Alert when the oldest unpublished row is older than 1 minute (the relay is stuck). A daily job deletes rows published more than 7 days ago. The 40 lost and 10 phantom orders a month go to zero; reconciliation counts orders against \`ActivationRequested\` events daily to prove it.
`,
  followUps: [
    { q: 'Why can\'t a retry after the commit fix the lost events?', a: 'If the Mule app crashes after the commit, nothing is left to retry. The event must be stored in the same transaction as the order.' },
    { q: 'Why is delivery at least once and not exactly once?', a: 'The relay may crash after publishing and before marking the row. It then publishes the same row again.' },
    { q: 'How do you run the relay on several replicas without publishing a row twice at the same time?', a: 'Lock rows with FOR UPDATE SKIP LOCKED, or allow one active relay with a cluster lock. Subscribers still deduplicate as a safety net.' },
    { q: 'When would you use CDC on the outbox table instead of polling?', a: 'When events must leave in under a second or polling load matters. A log-based connector publishes rows as soon as they commit.' },
  ],
}
