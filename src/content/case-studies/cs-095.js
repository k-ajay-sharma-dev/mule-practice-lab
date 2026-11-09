import { diagram } from '../../arch/dsl.js'

const EHR = { type: ['legacy', 'saas', 'database'], label: ['ehr', 'emr'] }

export default {
  id: 'cs-095',
  category: 'case-studies',
  title: 'Hospital Group Fanning Out ADT Events to Departmental Systems',
  level: 'INTERMEDIATE',
  tags: ['healthcare', 'hl7', 'mllp', 'pub-sub', 'events', 'anypoint-mq', 'pii', 'dlq'],
  estMinutes: 45,
  diagram: {
    task: 'draw ADT distribution: the EHR sends one HL7 v2 feed over MLLP to a listener System API, which archives the raw message and publishes one canonical event to a topic; pharmacy, dietary and bed management each read their own queue and are updated through their own Process and System APIs.',
    checks: [
      { label: 'The EHR sends ADT to a listener System API', rule: { type: 'edge', from: EHR, to: 'system-api' } },
      { label: 'The EHR has one outbound feed, not one per department', rule: { type: 'each', of: EHR, edgeTo: ['system-api', 'process-api', 'experience-api', 'batch-job', 'queue', 'topic', 'event-stream', 'saas', 'legacy', 'database'], count: 1, max: 1 } },
      { label: 'The listener publishes each event once to a topic as an async message', rule: { type: 'edge', from: 'system-api', to: 'topic', kind: 'async' } },
      { label: 'Each department has its own queue fed by the topic', rule: { type: 'each', of: 'queue', edgeFrom: 'topic', kind: 'async', min: 3 } },
      { label: 'At least three departmental systems receive the events', rule: { type: 'path', from: 'topic', to: ['saas', 'legacy', 'database'], min: 3 } },
      { label: 'Departmental systems are reached only through System APIs', rule: { type: 'only-via', target: ['saas', 'legacy'], from: 'system-api' } },
      { label: 'A slow department cannot hold up the EHR feed (no sync route from the EHR to a department)', rule: { type: 'no-path', from: EHR, to: ['saas', 'legacy', 'database'], kind: 'sync' } },
      { label: 'The raw HL7 messages are archived for replay', rule: { type: 'edge', from: ['system-api', 'topic', 'queue'], to: ['file-store', 's3-bucket', 'azure-blob'] } },
      { label: 'Messages that keep failing go to a dead-letter queue', rule: { type: 'edge', to: 'dlq' } },
      { label: 'Lines to and from queues and topics are async messages', rule: { type: 'lines', touching: ['queue', 'topic'], kind: 'async' } },
    ],
    reference: diagram(
      {
        ehr: ['legacy', 'EHR (HL7 v2 ADT over MLLP)'],
        lis: ['system-api', 'sys-ehr-adt-listener (MLLP)'],
        arch: ['file-store', 'Raw HL7 archive'],
        top: ['topic', 'adt-events'],
        qph: ['queue', 'pharmacy.adt'],
        qdi: ['queue', 'dietary.adt'],
        qbed: ['queue', 'bed-management.adt'],
        dlq: ['dlq', 'adt-dlq'],
        pph: ['process-api', 'prc-pharmacy-adt'],
        pdi: ['process-api', 'prc-dietary-adt'],
        pbed: ['process-api', 'prc-bed-management-adt'],
        sph: ['system-api', 'sys-pharmacy-api'],
        sdi: ['system-api', 'sys-dietary-api'],
        sbed: ['system-api', 'sys-bed-management-api'],
        phs: ['legacy', 'Pharmacy system (HL7 v2 inbound)'],
        diet: ['saas', 'Meal ordering (SaaS)'],
        bed: ['saas', 'Bed management (SaaS)'],
      },
      [
        'ehr -> lis', 'lis -> arch', 'lis ~> top', 'top ~> qph', 'top ~> qdi', 'top ~> qbed',
        'qph ~> pph', 'qdi ~> pdi', 'qbed ~> pbed', 'qph ~> dlq',
        'pph -> sph', 'sph -> phs', 'pdi -> sdi', 'sdi -> diet', 'pbed -> sbed', 'sbed -> bed',
      ],
    ),
  },
  description: `
**Context.** A hospital group runs five hospitals on one EHR. Every admission, transfer, discharge and demographic update leaves the EHR as an HL7 v2 ADT message (A01, A02, A03, A08 and others) over MLLP. About 250,000 ADT messages a day, with peaks of 60 a second when the morning bed moves happen.

**The problem today.** The EHR has 14 outbound ADT interfaces, one per departmental system: pharmacy, meal ordering, bed management, radiology, the lab, nurse call, patient billing and more. Each interface is licensed and configured separately in the EHR. When the meal ordering vendor's system was down for six hours, its EHR outbound queue filled up and the EHR team had to restart the interface engine, which delayed pharmacy messages too.

**Goals**
- One ADT feed out of the EHR, distributed by MuleSoft.
- A department that is down must not slow anyone else; it catches up when it returns.
- Messages for one patient arrive in order.
- Each department receives only the fields it needs.
- Any message can be replayed for 30 days.

**Constraints**
| Item | Detail |
|---|---|
| Protocol | The EHR sends HL7 v2.5.1 over MLLP and waits for an ACK before sending the next message |
| Consumers | Pharmacy needs HL7 v2; meal ordering and bed management are SaaS products with REST APIs |
| Privacy | Meal ordering may see name, ward, bed and diet codes only, never diagnoses |
| Ordering | An A03 (discharge) must never overtake the A01 (admission) for the same patient |
| Operations | The integration team has three people and wants one place to see stuck messages |

**Your task.** Design the ADT distribution. Start with pharmacy, meal ordering and bed management, in a way that lets the other eleven join later.
`,
  answerTemplate: `## The single EHR feed and the ACK

## Canonical ADT event

## Fan-out and isolation per department

## Ordering per patient

## Filtering PHI per department

## Replay, errors and monitoring
`,
  keyPoints: [
    'A thin MLLP listener System API ACKs the EHR as soon as the message is archived and published, so the EHR never waits on a department.',
    'One canonical ADT event on a topic, with a durable queue per department, isolates a slow or offline department.',
    'Each department has its own Process API that filters fields and maps to that system, reaching it through a System API.',
    'Ordering per patient comes from FIFO queues or a single consumer per queue (or message groups keyed by patient), not from the topic alone.',
    'Raw HL7 is archived for replay and audit; failures go to a dead-letter queue that the team watches in one place.',
    'Adding a department means a new queue subscription and a Process API, with no change in the EHR.',
  ],
  solution: `
**Listener.** \`sys-ehr-adt-listener\` runs an MLLP listener. For each message it writes the raw HL7 to the archive, maps it to a canonical ADT event (event type, patient id, encounter, location, demographics, diet and allergy codes) and publishes it to \`adt-events\`. Only then does it send the HL7 ACK (AA). If the publish fails, it sends an AE so the EHR resends. The listener does nothing else, so it keeps up with 60 messages a second.

**Fan-out.** \`adt-events\` is an Anypoint MQ exchange (or a JMS topic with durable subscriptions). Each department has its own queue bound to it. When meal ordering is down for six hours, its queue grows and the others are not affected.

**Ordering.** Each department queue is FIFO, or has one consumer with prefetch 1, so messages for a patient stay in order. If a department needs more throughput, group by patient id.

**Department Process APIs.**
- \`prc-pharmacy-adt\` maps back to HL7 v2 for the pharmacy system through \`sys-pharmacy-api\`.
- \`prc-dietary-adt\` keeps only name, ward, bed and diet codes and calls the meal ordering REST API through \`sys-dietary-api\`.
- \`prc-bed-management-adt\` sends only location changes and discharges.

**Errors.** Transient errors are retried with backoff. A message that fails three times goes to \`adt-dlq\` with the department name. The team gets one dashboard of queue depths and DLQ counts.

**Replay.** The archive keeps raw HL7 for 30 days. A replay tool republishes chosen messages to one department queue only.

**Next departments.** Radiology, lab, nurse call and billing each get a queue and a Process API. The EHR's 14 interfaces are switched off one by one.
`,
  followUps: [
    { q: 'When should the listener send the HL7 ACK to the EHR?', a: 'After the message is archived and published to the topic. Sending it earlier risks losing a message, and waiting for departments would make the EHR wait on them.' },
    { q: 'How do you keep messages for one patient in order?', a: 'Use a FIFO queue or a single consumer per department queue. If more throughput is needed, group messages by patient id so each patient is handled by one consumer.' },
    { q: 'Why does each department get its own queue instead of reading the topic directly?', a: 'A durable queue holds messages while that department is down. Each department then catches up at its own pace without affecting the others.' },
    { q: 'How do you stop the meal ordering vendor seeing diagnoses?', a: 'Its Process API builds a message with name, ward, bed and diet codes only. The canonical event never goes to the vendor as it is.' },
  ],
}
