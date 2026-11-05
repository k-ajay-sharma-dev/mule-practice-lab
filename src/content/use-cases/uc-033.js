import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-033',
  category: 'use-cases',
  title: 'Power Outage Notifications for Utility Customers',
  level: 'INTERMEDIATE',
  tags: ['event-driven', 'notifications', 'fan-out', 'throttling', 'utilities'],
  estMinutes: 30,
  diagram: {
    task: 'draw the outage-notification flow: OMS events in, resolution of nodes to customers, the per-channel queues and throttled providers, the call-centre path for vulnerable customers and the planned-outage job.',
    checks: [
      { label: 'OMS events are consumed asynchronously from the broker by a Process API', rule: { type: 'edge', from: ['topic', 'queue', 'event-stream'], to: 'process-api', kind: 'async' } },
      { label: 'Node → customer index and per-customer notification state live in a fast cache', rule: { type: 'edge', from: 'process-api', to: 'cache' } },
      { label: 'Notifications fan out to one queue per channel (SMS, email, push)', rule: { type: 'edge', from: 'process-api', to: 'queue', kind: 'async', min: 3 } },
      { label: 'Every channel queue is drained by its own consumer', rule: { type: 'each', of: 'queue', edgeTo: ['system-api', 'process-api'], kind: 'async' } },
      { label: 'Providers are called only by channel System APIs (where the SMS 100/s limit is enforced)', rule: { type: 'only-via', target: 'notification', from: 'system-api' } },
      { label: 'Life-support customers become a call-centre task in the CRM', rule: { type: 'path', from: 'process-api', to: 'crm' } },
      { label: 'A scheduled job notifies planned outages ≥ 48 h ahead', rule: { type: 'path', from: 'batch-job', to: 'notification' } },
    ],
    reference: diagram(
      {
        oms: ['legacy', 'OMS (outage management)'],
        t: ['topic', 'outage-events'],
        prc: ['process-api', 'prc-outage-notification-api'],
        idx: ['cache', 'Node→customer index + notification state'],
        scis: ['system-api', 'sys-cis-api'],
        cis: ['erp', 'CIS (customers, preferences)'],
        qs: ['queue', 'notify-sms'],
        qe: ['queue', 'notify-email'],
        qp: ['queue', 'notify-push'],
        ssms: ['system-api', 'sys-sms-api (100 msg/s)'],
        smail: ['system-api', 'sys-email-api'],
        spush: ['system-api', 'sys-push-api'],
        sms: ['notification', 'SMS provider'],
        mail: ['notification', 'Email provider'],
        push: ['notification', 'Push provider'],
        scrm: ['system-api', 'sys-callcentre-crm-api'],
        crm: ['crm', 'Call-centre CRM'],
        job: ['batch-job', 'Planned-outage scheduler (daily)'],
      },
      [
        'oms ~> t', 't ~> prc', 'prc -> idx', 'prc -> scis', 'scis -> cis',
        'prc ~> qs', 'prc ~> qe', 'prc ~> qp', 'qs ~> ssms', 'qe ~> smail', 'qp ~> spush',
        'ssms -> sms', 'smail -> mail', 'spush -> push', 'prc -> scrm', 'scrm -> crm', 'job -> prc',
      ],
    ),
  },
  description: `
An electricity distributor serving **1.8 million customers** wants to proactively tell customers about outages by **SMS, email and app push**, and update them as the restoration estimate changes.

Facts:
- The **outage management system (OMS)** publishes events to a message broker: *outage created*, *ETR updated* (estimated time of restoration), *crew assigned*, *restored*. Each event has a list of affected network nodes, not customers.
- The **customer information system (CIS)** knows which premises (and customers) are connected to which node, plus contact preferences and language.
- A storm can create **hundreds of outages in an hour**, affecting up to **300,000 customers**; ETRs may change many times.
- SMS provider: **100 messages/second** contract limit. Email and push providers are much faster.
- Regulation: **planned outages** must be notified **at least 48 hours** in advance; **medically vulnerable customers** (life-support register) must be phoned by the call centre, not just messaged.
- Customers complained about receiving 7 updates in one evening.

**Describe your solution:**
- How do you turn node-level events into customer-level notifications?
- How do you deal with the SMS rate limit during a storm?
- How do you avoid notification fatigue?
- How do you handle vulnerable customers and planned outages?
`,
  answerTemplate: `## Event intake

## Resolving affected customers

## Notification rules

## Channel delivery and throttling

## Vulnerable customers and planned outages

## Monitoring
`,
  keyPoints: [
    'OMS events consumed from the broker; affected nodes resolved to premises/customers via a CIS System API or a cached node-to-premise index.',
    'Notifications fan out per customer onto queues per channel, honouring contact preferences and language.',
    'SMS throttled to 100/s with queue-based rate limiting; prioritise by event type (restored and new outage before minor ETR changes).',
    'Fatigue rules: send ETR updates only if the change is significant (e.g. > 30 min) and limit messages per customer per outage; suppress if already restored.',
    'Life-support customers routed to a call-centre task with priority, in addition to messages; planned outages scheduled from the work-planning system ≥ 48h ahead.',
    'Idempotency by outage + customer + event version; delivery status tracked for reporting.',
  ],
  solution: `
**Event intake.** A consumer subscribes to the OMS topic (JMS/Kafka/Anypoint MQ depending on the broker). Each event is stored with its **outage ID and version** so out-of-order or duplicate events can be ignored (only process if version > last processed).

**Resolving affected customers.** Calling the CIS for 300,000 customers per storm event is slow. Two options:
- a **cached index** (node → premises → customers with preferences), refreshed nightly from CIS plus change events; or
- a CIS System API that accepts a list of nodes and returns customers in pages.

The Process API expands nodes to customers in streaming pages and creates one notification record per customer.

**Notification rules (Process API, configurable).**
- New outage → notify all affected.
- ETR update → only if the new ETR differs by **more than 30 minutes**, and at most one update per customer per **2 hours**.
- Restored → always send; cancel any queued, unsent ETR updates for that outage.
- Quiet hours for non-critical updates (e.g. 22:00–07:00, except restoration).

State per customer + outage (last message sent, last ETR) lives in a fast store (Object Store or Redis-style cache with TTL).

**Channel delivery and throttling.** Notifications go to **one queue per channel**. The SMS consumer runs with fixed concurrency and a rate limit so it never exceeds 100 msg/s (≈ 360,000/hour — a full storm wave in under an hour). Use priority: restored and new-outage messages ahead of ETR updates (separate high/low queues). 429/5xx from providers → retry with backoff; permanent failures (invalid number) → mark contact invalid in CIS.

**Vulnerable customers.** Customers on the life-support register produce a **call-centre task** (CRM case or call-list API) with high priority, plus messages. **Planned outages** come from the work-management system; a daily Scheduler finds jobs starting in ≥ 48h and notifies affected customers, recording proof of notification for the regulator.

**Monitoring.** Dashboards for queue depth, send rate, delivery failures per channel; alert if the SMS backlog exceeds 30 minutes.
`,
  followUps: [
    { q: 'How do you avoid the "restored" SMS arriving before the "outage" SMS?', a: 'Process per outage in order (version numbers), and when restored arrives purge queued messages for that outage, or check current outage state before sending each message.' },
    { q: 'Why not let the CIS send the notifications?', a: 'The CIS is not built for burst fan-out and multi-channel throttling; the integration layer decouples the OMS spike from both CIS and providers.' },
  ],
}
