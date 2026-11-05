export default {
  id: 'ms-062',
  category: 'mulesoft',
  title: 'ASN Processing from ActiveMQ: Ack Modes, Manual Ack, Redelivery Count and the DLQ',
  level: 'INTERMEDIATE',
  tags: ['supply-chain', 'jms', 'activemq', 'ack-mode', 'redelivery', 'dlq', 'asn'],
  estMinutes: 25,
  quiz: [
    {
      type: 'match',
      prompt: 'Match each JMS listener ack mode to its behaviour in Mule 4.',
      pairs: [
        ['IMMEDIATE', 'Acknowledged as soon as Mule receives it, before the flow runs'],
        ['AUTO', 'Acknowledged when the flow completes successfully; redelivered on error'],
        ['MANUAL', 'Acknowledged only when the flow calls jms:ack'],
        ['DUPS_OK', 'Acknowledged lazily; duplicates are possible'],
      ],
      explain: 'IMMEDIATE can lose a message if the flow fails; AUTO ties the ack to flow success; MANUAL lets you choose the point; DUPS_OK trades duplicates for throughput.',
    },
    {
      type: 'single',
      prompt: 'ASNs were lost when the WMS was down. The listener used `ackMode="IMMEDIATE"`. Why?',
      options: [
        'The broker considered the message consumed on receipt, so a failure in the flow could not trigger redelivery',
        'IMMEDIATE sends failed messages straight to the DLQ',
        'IMMEDIATE disables persistence on the queue',
        'The WMS acknowledged the message to the broker',
      ],
      answer: 0,
      explain: 'With IMMEDIATE the ack happens before any processing. If the flow then fails, the broker has already removed the message and there is nothing to redeliver.',
    },
    {
      type: 'single',
      prompt: 'With `ackMode="MANUAL"`, where should `<jms:ack ackId="#[attributes.ackId]"/>` go for an ASN that is posted to the WMS and then stored in Oracle?',
      options: [
        'After both the WMS call and the Oracle insert succeed',
        'As the first processor in the flow',
        'In the error handler',
        'Inside an Async scope so it does not slow the flow down',
      ],
      answer: 0,
      explain: 'Ack only once the work is done. Acking first is the same as IMMEDIATE; acking in the error handler loses the failed message.',
    },
    {
      type: 'single',
      prompt: 'What does `jms:recover-session` do in a MANUAL-ack flow?',
      options: [
        'Asks the broker to redeliver the unacknowledged messages of that session',
        'Moves the message to the DLQ immediately',
        'Reconnects to the broker after a network failure',
        'Commits a JMS transaction',
      ],
      answer: 0,
      explain: 'Recovering the session makes the unacknowledged messages available again, which counts as a redelivery. It is not a DLQ move or a reconnection.',
    },
    {
      type: 'multi',
      prompt: 'An ASN with an invalid SKU fails every time. Which statements are true on **ActiveMQ Classic** with a redelivery limit of 5?',
      options: [
        'Each redelivery increases the JMSXDeliveryCount property, which the flow can read',
        'After the limit is exceeded the message is moved to a dead-letter queue (ActiveMQ.DLQ unless an individual DLQ strategy is configured)',
        'A validation error that will never succeed can be routed to an error queue at once instead of waiting for all redeliveries',
        'Redelivery happens forever unless Mule has a redelivery policy',
      ],
      answer: [0, 1, 2],
      explain: 'Classic counts deliveries and dead-letters the message after `maximumRedeliveries`. For permanent errors, it is better to publish the message with error details to a business error queue and ack it, rather than burning redeliveries.',
    },
    {
      type: 'order',
      prompt: 'Order what happens to a poison ASN with AUTO ack and a broker redelivery limit.',
      items: [
        'The listener delivers the message and the flow fails',
        'Mule does not acknowledge, so the broker redelivers it with a higher delivery count',
        'The flow fails again on each redelivery',
        'The redelivery limit is exceeded',
        'The broker moves the message to the dead-letter queue',
      ],
      explain: 'Without a successful completion the message is never acked; the broker counts deliveries and dead-letters it at the limit, where an alert and a reprocessing flow should pick it up.',
    },
  ],
  description: `
A retailer's **inbound logistics** team receives **Advance Shipping Notices (ASNs)** from 300 suppliers. An EDI gateway translates each 856 into JSON and puts it on the ActiveMQ Classic queue \`ASN.INBOUND\`. A Mule app:

1. Validates the ASN (PO exists in Oracle, SKUs known).
2. Posts it to the **WMS** REST API so the DC can plan receiving.
3. Inserts a row into the Oracle table \`ASN_LOG\`.

Problems in production:
- During a 20-minute WMS outage, ~600 ASNs disappeared — trucks arrived at the DC with no ASN. The listener was configured with \`ackMode="IMMEDIATE"\`.
- After switching to AUTO, one ASN with an unknown SKU was redelivered again and again, slowing the queue.
- Operations wants to know how many times a message has been tried and where failed ones end up.

**Questions**
1. Explain the JMS listener ack modes and why ASNs were lost.
2. How would you use MANUAL ack with \`jms:ack\` and \`jms:recover-session\`?
3. How do redelivery, \`JMSXDeliveryCount\` and the DLQ work on ActiveMQ Classic (and how is it configured on Artemis)?
4. How should permanent errors (unknown SKU) be treated differently from transient ones (WMS down)?
`,
  answerTemplate: `## Ack modes and the lost ASNs

## Manual ack

## Redelivery, delivery count and DLQ

## Permanent vs transient errors
`,
  keyPoints: [
    'IMMEDIATE acks on receipt (fast, but a failing flow loses the message); AUTO acks when the flow succeeds; MANUAL needs jms:ack; DUPS_OK acks lazily.',
    'With MANUAL, ack after the last side effect succeeds using attributes.ackId; jms:recover-session triggers redelivery of unacknowledged messages.',
    'ActiveMQ Classic counts deliveries (JMSXDeliveryCount) and moves the message to ActiveMQ.DLQ (or an individual DLQ) after maximumRedeliveries.',
    'Artemis uses address settings: max-delivery-attempts and dead-letter-address.',
    'Treat permanent business errors differently: publish to an error queue with details and ack, instead of redelivering a message that can never succeed.',
    'Make processing idempotent (e.g. ASN number unique in ASN_LOG), because redelivery means the WMS may receive the same ASN twice.',
  ],
  solution: `
**1. Ack modes.**
| Mode | When the message is acknowledged |
|---|---|
| IMMEDIATE | as soon as Mule receives it |
| AUTO | when the flow completes successfully; on error it is redelivered |
| MANUAL | when the flow executes \`jms:ack\` |
| DUPS_OK | lazily, in groups; duplicates possible |

With IMMEDIATE the broker removed each ASN before the WMS call; when the call failed, the message was gone. AUTO (or MANUAL) fixes that.

**2. MANUAL ack.**
\`\`\`xml
<flow name="asn-inbound">
  <jms:listener config-ref="amq" destination="ASN.INBOUND" ackMode="MANUAL"/>
  <set-variable variableName="ackId" value="#[attributes.ackId]"/>
  <flow-ref name="validate-asn"/>
  <http:request config-ref="wms" method="POST" path="/asns"/>
  <db:insert config-ref="oracle">...</db:insert>
  <jms:ack ackId="#[vars.ackId]"/>
  <error-handler>
    <on-error-propagate type="HTTP:CONNECTIVITY, HTTP:TIMEOUT">
      <jms:recover-session ackId="#[vars.ackId]"/>   <!-- transient: redeliver -->
    </on-error-propagate>
    <on-error-continue type="APP:INVALID_ASN">
      <jms:publish config-ref="amq" destination="ASN.ERRORS"/>  <!-- permanent: park with details -->
      <jms:ack ackId="#[vars.ackId]"/>
    </on-error-continue>
  </error-handler>
</flow>
\`\`\`
Store the ackId in a variable early, because the payload and attributes change during the flow.

**3. Redelivery and DLQ.**
- Each redelivery increments \`JMSXDeliveryCount\` (Mule exposes it in \`attributes.properties.jmsxProperties\`) and sets the redelivered header, so the flow can log "attempt 3 of 6".
- **Classic**: the client redelivery policy decides when to give up. With the Mule JMS connector set it with \`maxRedelivery\` in the factory configuration — the connector default is **0** (no redelivery; \`-1\` means unlimited), unlike the plain Classic client default of 6 \`maximumRedeliveries\`; the broker then moves the message to \`ActiveMQ.DLQ\`, or to \`ActiveMQ.DLQ.Queue.ASN.INBOUND\` with an individual dead-letter strategy. A redelivery delay avoids hammering the WMS.
- **Artemis**: \`address-settings\` with \`max-delivery-attempts\` and \`dead-letter-address\` (and \`redelivery-delay\`).
- Monitor the DLQ depth and alert on it; provide a replay flow.

**4. Permanent vs transient.** The unknown SKU will fail on every attempt, so redelivering wastes time and blocks other ASNs. Detect it (validation error type), publish the original ASN plus the reason to \`ASN.ERRORS\` for the supplier-management team, and **ack** it. Only transient errors (WMS down, Oracle unavailable) should be redelivered. Because the WMS call and the Oracle insert are not atomic, a redelivered ASN may reach the WMS twice — use the ASN number as an idempotency key.
`,
  followUps: [
    {
      q: 'With MANUAL ack, does acking one message acknowledge others too?',
      a: 'JMS client acknowledgement works per session, so acknowledging can also acknowledge earlier messages consumed in the same session. Keep processing per message and do not hold several unacknowledged messages if you rely on per-message acks.',
    },
    {
      q: 'Can you use the Mule redelivery policy on the JMS listener instead of broker redelivery?',
      a: 'Not for the limit: the JMS connector reference says the listener redelivery-policy maxRedeliveryCount has no effect and points to maxRedelivery on the ActiveMQ factory configuration. Redelivery is counted by the broker client (JMSXDeliveryCount), which then dead-letters the message itself; if you want your own cut-off, read JMSXDeliveryCount in the flow and park the message past a threshold.',
    },
    {
      q: 'What would you include in an error-queue message?',
      a: 'The original ASN, the error type and description, the ASN and PO numbers, the supplier ID, the delivery count and a timestamp. That way the business can fix and replay it without reading logs.',
    },
  ],
}
