import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-060',
  category: 'use-cases',
  title: 'WMS ↔ ERP Order Release and Shipment Confirmations over ActiveMQ',
  level: 'INTERMEDIATE',
  tags: ['supply-chain', 'wms', 'activemq', 'jms', 'oracle', 'oracle-ebs', 'dlq', 'idempotency'],
  estMinutes: 20,
  diagram: {
    task: 'draw how released orders flow from Oracle EBS to the WMS and how shipment confirmations flow back, using ActiveMQ queues in both directions, a DLQ, and a System API in front of EBS.',
    checks: [
      { label: 'The WMS publishes shipment confirmations to a queue', rule: { type: 'edge', from: 'wms', to: ['queue', 'topic'], kind: 'async' } },
      { label: 'A Mule app consumes the confirmations from the queue asynchronously', rule: { type: 'edge', from: ['queue', 'topic'], to: 'process-api', kind: 'async' } },
      { label: 'Oracle EBS is reached only through a System API', rule: { type: 'only-via', target: 'erp', from: 'system-api' } },
      { label: 'Released orders reach the WMS through a queue, not a direct call', rule: { type: 'edge', from: ['queue', 'topic'], to: 'wms', kind: 'async' } },
      { label: 'Nothing calls the WMS synchronously', rule: { type: 'no-edge', from: ['process-api', 'system-api', 'batch-job'], to: 'wms' } },
      { label: 'Poison messages end up in a dead-letter queue', rule: { type: 'edge', from: 'queue', to: 'dlq' } },
      { label: 'Processed message IDs are recorded for idempotency', rule: { type: 'edge', from: 'process-api', to: 'database' } },
    ],
    reference: diagram(
      {
        job: ['batch-job', 'Pick-release poller (2 min)'],
        qout: ['queue', 'WMS.ORDER.RELEASE'],
        wms: ['wms', 'DC WMS'],
        qin: ['queue', 'WMS.SHIP.CONFIRM'],
        dlq: ['dlq', 'DLQ.WMS.SHIP.CONFIRM'],
        prc: ['process-api', 'prc-shipment-confirmation'],
        log: ['database', 'INT_MESSAGE_LOG (Oracle)'],
        sys: ['system-api', 'sys-oracle-ebs-shipping'],
        ebs: ['erp', 'Oracle EBS Order Management'],
      },
      ['job -> sys', 'job ~> qout', 'qout ~> wms', 'wms ~> qin', 'qin ~> prc', 'qin ~> dlq', 'prc -> log', 'prc -> sys', 'sys -> ebs'],
    ),
  },
  description: `
A distributor of electrical supplies runs **Oracle EBS Order Management** and one central **DC WMS**. The WMS vendor supports only **JMS messaging via ActiveMQ Classic** (XML messages), no REST API.

Two flows are needed:
1. **Order release (EBS → WMS):** when an order is pick-released in EBS (~4,000 deliveries/day, peaks of 600/hour before the 15:00 carrier cut-off), the WMS must receive the delivery with lines, ship-to and carrier.
2. **Shipment confirmation (WMS → EBS):** when the truck is loaded the WMS sends a confirmation with shipped quantities, lot numbers and tracking numbers. EBS must ship-confirm the delivery so invoicing can run within **30 minutes**.

Facts:
- The WMS sometimes resends the same confirmation after a restart.
- EBS is down for patching every second Sunday for 4 hours; the WMS keeps working.
- About 1 in 500 confirmations has an error (e.g. lot number unknown to EBS).

**Design both flows:**
- Which queues and which Mule components do you use?
- How do you avoid duplicate ship-confirms?
- What happens during the EBS outage?
- What happens to bad messages?
`,
  answerTemplate: `## Order release flow

## Shipment confirmation flow

## Duplicates

## EBS outage

## Bad messages
`,
  keyPoints: [
    'Two queues, one per direction: WMS.ORDER.RELEASE (Mule publishes) and WMS.SHIP.CONFIRM (WMS publishes, Mule listens) — the WMS is never called synchronously.',
    'The confirmation listener runs inside a transaction: if the EBS call fails the message is rolled back and redelivered by ActiveMQ instead of being lost.',
    'Idempotency: a processed-message table (unique key on WMS message ID / delivery ID) prevents a second ship-confirm when the WMS resends.',
    'During EBS patching messages simply accumulate in the queue; the listener can be stopped or will keep retrying with back-off.',
    'After the redelivery limit poison messages go to a DLQ (ActiveMQ.DLQ by default in Classic, better an individual DLQ per queue) with alerting and a replay process.',
  ],
  solution: `
\`\`\`
 EBS <-- sys-oracle-ebs-shipping <-- poller --publish--> [WMS.ORDER.RELEASE] --> WMS
 WMS --publish--> [WMS.SHIP.CONFIRM] --jms:listener--> prc-shipment-confirmation --> sys-oracle-ebs-shipping --> EBS
                         \\--(max redeliveries)--> [DLQ.WMS.SHIP.CONFIRM]
\`\`\`

**Order release.** A Scheduler calls **sys-oracle-ebs-shipping** to read deliveries released since the last run (a view over the shipping tables, parameterised by \`:lastRun\`). Each delivery is mapped by DataWeave to the WMS XML format and sent with \`jms:publish\` to \`WMS.ORDER.RELEASE\`, persistent delivery, with \`deliveryId\` as a JMS property and correlation ID. The delivery is marked "sent to WMS" so it is not sent twice.

**Shipment confirmation.**
- \`jms:listener\` on \`WMS.SHIP.CONFIRM\` with \`transactionalAction="ALWAYS_BEGIN"\`; a few concurrent consumers are enough for 600/hour.
- Transform the XML to the canonical shipment and call the System API, which runs the ship-confirm through a PL/SQL wrapper package (\`db:stored-procedure\` with IN params for delivery ID, quantities and lots, OUT params for status and message).
- Insert the message ID into \`INT_MESSAGE_LOG\` (unique constraint). A duplicate raises a constraint violation → log "already processed" and commit — do not ship-confirm twice.

**EBS outage.** The connection fails with \`DB:CONNECTIVITY\`; the transaction rolls back and ActiveMQ redelivers. Better: an operations runbook stops the listener flow during the patching window so messages wait safely in the persistent queue and are processed in order afterwards.

**Bad messages.**
- Technical errors are retried (ActiveMQ redelivery policy, e.g. 5 attempts with exponential back-off). The \`JMSXDeliveryCount\` property tells the flow which attempt it is on.
- Business errors (unknown lot) are not retryable: route straight to an error queue with the reason, or let it reach the DLQ after the limit. Configure an **individual DLQ per queue** instead of the shared \`ActiveMQ.DLQ\`, alert on DLQ depth, and give support a replay flow that moves corrected messages back.

**NFRs.** Persistent messages; correlation ID from WMS message ID through to EBS logs; dashboards for queue depth and age of oldest message (alert if > 15 minutes).
`,
  followUps: [
    { q: 'Why use a transacted listener rather than AUTO acknowledgement?', a: 'With AUTO the message is acknowledged when received, so if the EBS call fails it is gone. A transaction (or MANUAL ack after success) only removes the message once the work is done.' },
    { q: 'Does ActiveMQ guarantee message order across several consumers?', a: 'No — with concurrent consumers order is not guaranteed. If order per delivery matters, use message groups (JMSXGroupID = deliveryId) or a single consumer.' },
    { q: 'Where do messages go in ActiveMQ Classic after too many redeliveries if you configure nothing?', a: 'To the shared ActiveMQ.DLQ. Most teams configure an individualDeadLetterStrategy so each queue gets its own DLQ.' },
  ],
}
