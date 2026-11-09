import { diagram } from '../../arch/dsl.js'

export default {
  id: 'cs-100',
  category: 'case-studies',
  title: 'Energy Retailer Exchanging Switching and Meter Read Messages With the Market Hub',
  level: 'ADVANCED',
  tags: ['utilities', 'energy', 'b2b', 'event-driven', 'kafka', 'partitions', 'idempotency', 'dlq', 'salesforce'],
  estMinutes: 55,
  diagram: {
    task: 'draw market messaging: the market hub sends messages to an inbound Experience API that places them on a stream keyed by meter point; switching and meter-read consumers update CRM and billing through System APIs; every message is archived; outbound messages are queued and sent by one Process API through the only System API that talks to the hub; switch progress is tracked and a scheduled job watches the deadlines.',
    checks: [
      { label: 'Inbound market messages are accepted by an Experience API and placed on a stream, topic or queue', rule: { type: 'edge', from: 'experience-api', to: ['event-stream', 'topic', 'queue'], kind: 'async' } },
      { label: 'Switching and meter reads are handled by separate consumers', rule: { type: 'each', of: ['event-stream', 'topic'], edgeTo: 'process-api', count: 2, some: true } },
      { label: 'Billing and the CRM are reached only through System APIs', rule: { type: 'only-via', target: ['saas', 'crm'], from: 'system-api' } },
      { label: 'Messages to the hub are queued and sent by a Process API', rule: { type: 'path', from: 'queue', via: 'process-api', to: 'external-api' } },
      { label: 'Consumers of inbound messages never call the hub directly: replies pass the outbound queue', rule: { type: 'no-path', from: ['event-stream', 'topic'], to: 'external-api', unless: 'queue' } },
      { label: 'The hub is reached only through a System API', rule: { type: 'only-via', target: 'external-api', from: 'system-api' } },
      { label: 'Only one System API talks to the hub', rule: { type: 'each', of: 'external-api', edgeFrom: 'system-api', max: 1 } },
      { label: 'Every market message is archived', rule: { type: 'path', from: ['experience-api', 'event-stream', 'topic'], to: ['file-store', 's3-bucket', 'azure-blob', 'data-warehouse'] } },
      { label: 'Switch progress is tracked in a database', rule: { type: 'link', from: 'process-api', to: 'database' } },
      { label: 'A scheduled job watches switch deadlines', rule: { type: 'link', from: 'batch-job', to: 'database' } },
      { label: 'Messages that keep failing go to a dead-letter queue', rule: { type: 'edge', to: 'dlq' } },
    ],
    reference: diagram(
      {
        hub: ['external-api', 'Central market hub (switching service)'],
        ein: ['experience-api', 'exp-market-inbound-api'],
        ms: ['event-stream', 'market-messages (key: meter point id)'],
        arch: ['file-store', 'Market message archive (7 years)'],
        psw: ['process-api', 'prc-switching'],
        prd: ['process-api', 'prc-meter-reads'],
        dlq: ['dlq', 'market-messages-dlq'],
        trk: ['database', 'Switch case tracker'],
        job: ['batch-job', 'switch-deadline-monitor (every 30 min)'],
        alert: ['notification', 'Market operations alerts'],
        scrm: ['system-api', 'sys-crm-api'],
        sbill: ['system-api', 'sys-billing-api'],
        crm: ['crm', 'Salesforce (customers, contracts)'],
        bill: ['saas', 'Billing platform (SaaS)'],
        outq: ['queue', 'market-outbound'],
        pout: ['process-api', 'prc-market-outbound'],
        shub: ['system-api', 'sys-market-hub-api'],
      },
      [
        'hub -> ein', 'ein ~> ms', 'ms ~> arch', 'ms ~> psw', 'ms ~> prd', 'psw ~> dlq',
        'psw -> scrm', 'scrm -> crm', 'psw -> sbill', 'prd -> sbill', 'sbill -> bill', 'psw -> trk',
        'job -> trk', 'job -> alert', 'psw ~> outq', 'outq ~> pout', 'pout -> shub', 'shub -> hub',
      ],
    ),
  },
  description: `
**Context.** An energy retailer supplies electricity and gas to 1.8 million homes. Every customer switch, meter read, registration change and objection is exchanged with the central market hub as a regulated market message. The hub delivers messages to the retailer over an authenticated HTTPS interface and accepts the retailer's messages the same way.

**The problem today.** A 15-year-old message broker application receives hub messages and writes them to a shared Oracle schema. Billing, CRM and the meter team each poll the tables. Messages for the same meter point are sometimes processed out of order (a loss message before the gain it cancels). Last quarter 1,100 switches missed the 5 working day deadline and the regulator fined the retailer.

**Goals**
- Messages for one meter point are processed in the order the hub sent them.
- The retailer's replies (switch confirmations, objections, read acknowledgements) reach the hub within the market's time limits.
- Every switch is tracked against its deadline, with alerts before it is missed.
- The shared Oracle schema is retired.

**Constraints**
| Item | Detail |
|---|---|
| Volume | About 15,000 switching messages and 400,000 meter read messages a day; month end doubles reads |
| Hub | Delivers at least once; duplicates carry the same message id; the hub rejects messages over 300 a second from one retailer |
| Deadlines | A switch must complete in 5 working days; an objection must be raised within 2 working days |
| Systems | Salesforce for customers and contracts; a SaaS billing platform with a REST API |
| Audit | Every message in and out kept for 7 years, available to the regulator on request |

**Your task.** Design the inbound and outbound market messaging, ordering, deadline tracking and audit.
`,
  answerTemplate: `## Inbound messages and acknowledgement to the hub

## Ordering per meter point

## Switching and meter read processing

## Outbound messages and the hub's rate limit

## Deadline tracking

## Duplicates, errors and audit
`,
  keyPoints: [
    'The inbound Experience API checks the message, publishes it to a stream keyed by meter point id and acknowledges the hub; ordering per meter point comes from the key.',
    'Switching and meter reads are separate consumers, so a month-end read surge does not delay switches.',
    'Duplicates are detected by hub message id before any change to CRM or billing.',
    'All outbound messages go through one queue and one System API that respects the hub\'s 300 a second limit.',
    'A switch tracker records every switch and its deadline; a scheduled job raises alerts before deadlines are missed.',
    'Every inbound and outbound message is archived for 7 years.',
  ],
  solution: `
**Inbound.** The hub posts messages to \`exp-market-inbound-api\`. The API validates the signature and schema, then publishes the message to the \`market-messages\` Kafka topic with the meter point id as the key, and returns 200 to the hub. Everything for one meter point lands on one partition, so it is read in order.

**Archive.** An archive consumer writes every message, inbound and outbound, to write-once storage, partitioned by day.

**Switching.** \`prc-switching\` handles registration, loss, gain and objection messages. It checks the message id against the tracker to drop duplicates, updates the customer and contract in Salesforce through \`sys-crm-api\` and the billing account through \`sys-billing-api\`, and records the switch state and deadline in the tracker. Replies to the hub (confirmations, objections) are put on \`market-outbound\`.

**Meter reads.** \`prc-meter-reads\` sends reads to billing through \`sys-billing-api\`. It has its own consumer group, so a month-end surge does not delay switching.

**Outbound.** \`prc-market-outbound\` consumes \`market-outbound\` and calls \`sys-market-hub-api\`, which owns the hub credentials and stays under 300 messages a second. Hub errors are retried with backoff.

**Deadlines.** Every 30 minutes \`switch-deadline-monitor\` reads the tracker and alerts market operations about switches due within one working day that have not progressed.

**Errors.** A message that cannot be processed after retries goes to \`market-messages-dlq\`. Because later messages for the same meter point depend on it, the consumer marks the meter point as blocked and parks its following messages until the failure is fixed, instead of skipping ahead.
`,
  followUps: [
    { q: 'How does keying by meter point keep messages in order?', a: 'Kafka keeps order within a partition, and one key always maps to one partition. All messages for a meter point are read by one consumer in the order they were written.' },
    { q: 'What do you do when one message for a meter point fails?', a: 'Send it to the dead-letter queue and hold the later messages for that meter point. Processing them first could apply a loss before the gain it cancels.' },
    { q: 'Why route every outbound message through one System API?', a: 'The hub limits each retailer to 300 messages a second. One component can enforce that limit and own the credentials.' },
    { q: 'How do you handle duplicates from an at-least-once hub?', a: 'Store each processed hub message id and skip any id already seen. Updates to CRM and billing are also written as upserts.' },
  ],
}
