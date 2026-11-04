export default {
  id: 'inc-056',
  category: 'incidents',
  title: 'One Malformed ASN Redelivered Thousands of Times and Never Reaches the DLQ',
  level: 'INTERMEDIATE',
  tags: ['supply-chain', 'activemq', 'jms', 'redelivery', 'dlq', 'error-handling', 'asn'],
  estMinutes: 30,
  investigation: {
    logs: [
      { text: '14:02:10.551 INFO  [asn] Received ASN msgId=ID:wms-01-4412-1 JMSXDeliveryCount=1 supplier=SUP-221', relevant: false },
      { text: '14:02:10.802 ERROR [asn] MULE:EXPRESSION Unexpected end of input, expected </ShipNotice> msgId=ID:wms-01-4412-7 JMSXDeliveryCount=3812', relevant: true, why: 'The same message has been delivered almost 4,000 times: it is a poison message that can never succeed.' },
      { text: '14:02:10.803 ERROR [asn] On Error Propagate in asn-inbound-flow, rolling back message msgId=ID:wms-01-4412-7', relevant: true, why: 'Propagating the error makes the JMS listener recover the session, so the broker client redelivers the message.' },
      { text: '14:02:11.004 INFO  [health] GET /health 200 (2 ms)', relevant: false },
      { text: '14:02:11.810 ERROR [asn] MULE:EXPRESSION Unexpected end of input, expected </ShipNotice> msgId=ID:wms-01-4412-7 JMSXDeliveryCount=3813', relevant: true, why: 'Redelivered again one second later, and it is first in line, so the messages behind it are blocked.' },
      { text: '14:02:12.000 INFO  [config] jms:factory-configuration brokerUrl=failover:(tcp://amq1:61616,tcp://amq2:61616) maxRedelivery=-1 redeliveryDelay=1000', relevant: true, why: 'maxRedelivery=-1 means unlimited redeliveries, so ActiveMQ never moves the message to ActiveMQ.DLQ.' },
      { text: '14:02:12.300 INFO  [amq-console] SUPPLIER.ASN.IN pending=2140 consumers=1 ActiveMQ.DLQ pending=0', relevant: true, why: 'Backlog grows while the DLQ stays empty: the poison message is never parked.' },
      { text: '14:02:13.900 INFO  [receipts] Dock door 7 assigned to PO 4500018812', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Why is the ASN queue blocked?',
        options: [
          'A truncated ASN fails on every attempt, the error is propagated so the message is redelivered, and maxRedelivery=-1 means it never goes to the DLQ',
          'The WMS stopped publishing ASNs',
          'The DLQ is full so new messages cannot be accepted',
          'On Error Continue is acknowledging every message',
        ],
        answer: 0,
        explain: 'JMSXDeliveryCount in the thousands, an empty DLQ and maxRedelivery=-1 together show an endless redelivery loop of one poison message.',
      },
      {
        type: 'single',
        prompt: 'What is the safest **immediate** step?',
        options: [
          'Purge SUPPLIER.ASN.IN',
          'Move the single poison message out of the queue (to a parking queue) via the broker console, after saving its body, and let the backlog drain',
          'Switch the flow to On Error Continue for every error',
          'Restart the Mule application',
        ],
        answer: 1,
        explain: 'Only one message is bad. Park it with its content preserved and the 2,140 good ASNs flow again. A restart just redelivers the same message.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the **permanent fix**?',
        options: [
          'Set a finite redelivery limit (e.g. maxRedelivery=5) so poison messages land in the DLQ',
          'Instead, set maxRedeliveryCount in a redelivery-policy on the JMS listener and leave maxRedelivery=-1',
          'Treat validation errors (bad XML) as non-retryable: send them straight to an error queue and acknowledge the original',
          'Alert on DLQ depth and on high JMSXDeliveryCount',
          'Keep maxRedelivery=-1 and add a bigger redeliveryDelay',
        ],
        answer: [0, 2, 3],
        explain: 'Retry only what can succeed, cap retries, and make parked messages visible. A longer delay only slows the infinite loop. For the JMS connector the limit belongs in maxRedelivery on the ActiveMQ factory configuration — the docs say the listener redelivery-policy maxRedeliveryCount has no effect.',
      },
      {
        type: 'match',
        prompt: 'Match each error to how the flow should treat it.',
        pairs: [
          ['Malformed or truncated XML', 'Do not retry; send to an error queue'],
          ['DB:CONNECTIVITY to Oracle', 'Retry with redelivery; it may recover'],
          ['Redelivery limit reached', 'Park in the DLQ and alert'],
        ],
        explain: 'Data errors will fail on every attempt; infrastructure errors are often transient; whatever still fails after the limit must be parked and visible.',
      },
    ],
  },
  description: `
## Symptoms
- The WMS publishes supplier ASNs (ship notices) to the ActiveMQ Classic queue \`SUPPLIER.ASN.IN\`. Mule converts them and creates expected receipts in Oracle so the dock can receive goods.
- Since 09:40 no new expected receipts have been created. Dock staff are receiving trucks "blind".
- The queue holds **2,140** messages; \`ActiveMQ.DLQ\` is **empty**. The app logs the same error about once a second.

## Change / Context
- Last month, to "never lose a message", the team set \`maxRedelivery="-1"\` on the ActiveMQ factory configuration of the JMS connector.
- The listener uses \`ackMode="AUTO"\` and the flow's error handler is **On Error Propagate**.
- At 09:40 the WMS published one ASN that was cut off mid-document during a WMS restart.

## Logs
\`\`\`
14:02:10.802 ERROR [asn] MULE:EXPRESSION Unexpected end of input, expected </ShipNotice>
  msgId=ID:wms-01-4412-7 JMSXDeliveryCount=3812
14:02:10.803 ERROR [asn] On Error Propagate in asn-inbound-flow, rolling back message
14:02:11.810 ERROR [asn] MULE:EXPRESSION Unexpected end of input ... JMSXDeliveryCount=3813
14:02:12.300 INFO  [amq-console] SUPPLIER.ASN.IN pending=2140 consumers=1 ActiveMQ.DLQ pending=0
\`\`\`

## Your tasks
1. What is the most likely root cause?
2. What do you do **right now**?
3. What is the permanent fix?
4. How do you stop this class of issue happening again?
`,
  answerTemplate: `## Diagnosis

## Immediate mitigation

## Root cause

## Permanent fix

## Prevention
`,
  keyPoints: [
    'Poison message: a truncated ASN fails parsing on every attempt (JMSXDeliveryCount in the thousands).',
    'AUTO ack + On Error Propagate means the session is recovered and the message redelivered; it stays at the head of the queue and blocks the rest for this consumer.',
    'maxRedelivery=-1 disables the redelivery limit, so ActiveMQ never sends it to ActiveMQ.DLQ.',
    'Immediate: save the message body, move only that message to a parking queue, let the backlog drain, ask the WMS to resend a corrected ASN.',
    'Fix: finite maxRedelivery on the ActiveMQ factory configuration (the listener redelivery-policy maxRedeliveryCount has no effect for JMS); classify non-retryable errors; alert on DLQ depth and delivery count.',
  ],
  solution: `
**Diagnosis.** One ASN was truncated. Parsing fails with **MULE:EXPRESSION** every time. With \`ackMode="AUTO"\` and **On Error Propagate**, the listener does not acknowledge the message and the ActiveMQ client redelivers it. Because \`maxRedelivery=-1\` means *unlimited*, the broker client never gives up and never moves it to **ActiveMQ.DLQ**. The poison message sits first in line, so the single consumer never gets to the 2,140 good ASNs behind it.

**Immediate mitigation.** In the ActiveMQ web console (or via JMX), copy the body of \`ID:wms-01-4412-7\` and **move** that one message to a parking queue such as \`SUPPLIER.ASN.PARKED\`. The backlog drains within minutes. Ask the WMS team to resend the corrected ASN, and tell the dock the expected receipts are catching up.

**Root cause.** "Never lose a message" was implemented as "retry forever", with no distinction between errors that can recover (DB down) and errors that never will (bad data).

**Permanent fix.**
- Set a finite limit (e.g. \`maxRedelivery="5"\` with a delay on the ActiveMQ factory configuration) so poison messages reach the DLQ. Don't rely on a \`redelivery-policy\` on the JMS listener for this: the JMS connector reference says its \`maxRedeliveryCount\` has no effect and points to the factory configuration's \`maxRedelivery\`.
- Validate the payload first; on validation errors publish to an error queue and let the original be acknowledged (On Error Continue for *that* error type only).
- Keep On Error Propagate for transient errors such as **DB:CONNECTIVITY** so they are retried.

**Prevention.** Alerts on DLQ/parking queue depth, on \`JMSXDeliveryCount\` above a threshold, and on the age of the oldest message; a runbook to inspect, fix and replay parked messages.
`,
  followUps: [
    { q: 'Why does one bad message block the whole queue?', a: 'After a session recover the unacknowledged message is redelivered before the ones behind it, so a single consumer keeps getting the same poison message. Several consumers would only partially hide it.' },
    { q: 'Where does ActiveMQ Classic put messages that exceed the redelivery limit by default?', a: 'In the shared ActiveMQ.DLQ queue; you can configure an individual dead-letter strategy so each queue gets its own DLQ, which is easier to operate.' },
    { q: 'How is this configured differently on ActiveMQ Artemis?', a: 'Artemis uses address settings on the broker: max-delivery-attempts and a dead-letter-address (DLA), plus redelivery-delay.' },
  ],
}
