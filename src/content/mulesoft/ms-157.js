export default {
  id: 'ms-157',
  category: 'mulesoft',
  title: 'Anypoint MQ From CloudHub Apps: Acknowledgement Modes, Lock Timeouts, FIFO Limits and Cross-Region Failover',
  level: 'ADVANCED',
  tags: ['cloudhub-2', 'cloudhub', 'deployment', 'anypoint-mq', 'messaging', 'failover', 'limits'],
  estMinutes: 35,
  quiz: [
    {
      type: 'match',
      prompt: 'Match each acknowledgement mode to its behaviour.',
      pairs: [
        ['IMMEDIATE', 'Acknowledged as the app consumes it, before processing, so an error does not bring it back'],
        ['AUTO', 'Acknowledged only if the flow finishes successfully, otherwise returned for redelivery'],
        ['MANUAL', 'App logic must ACK or NACK with the `ackToken`'],
      ],
      explain: 'With IMMEDIATE, a restart between acknowledgement and dispatch can lose the message, because it was already deleted from the queue. The docs point to AUTO or MANUAL to prevent deletion until after processing.',
    },
    {
      type: 'single',
      prompt: 'A subscriber uses AUTO mode with no `acknowledgementTimeout`. Some messages take four minutes because a downstream system is slow. What happens?',
      options: [
        'The connector uses two minutes by default, so the message returns to the queue for redelivery while the first flow is still running, and it can be processed twice',
        'The timer is paused until the flow finishes',
        'The flow is cancelled and the message moves to the DLQ',
        'The message is deleted when the timer ends',
      ],
      answer: 0,
      explain: 'The timer starts when the message is consumed. Set `acknowledgementTimeout` above the expected processing time, with an allowance for delays. Standard queues provide at-least-once delivery, so consumers must be idempotent in any case.',
    },
    {
      type: 'single',
      prompt: 'A team uses prefetch on the Subscriber source and depends on `acknowledgementTimeout` being applied exactly. What do the docs warn?',
      options: [
        'Anypoint MQ extends the expiration if a message stays in the buffer until 80% of the timeout, so do not use prefetch if the timeout must be honoured',
        'Prefetch and `acknowledgementTimeout` cannot be set together',
        'Prefetch halves the timeout',
        'Prefetch has no effect on the timeout',
      ],
      answer: 0,
      explain: 'Separately, the FAQ notes that prefetch settings must be global, with `prefetch-ref` on the subscriber. A local prefetch element leads to 400 bad request errors.',
    },
    {
      type: 'match',
      prompt: 'Match each Anypoint MQ limit to its value.',
      pairs: [
        ['Maximum payload', '10 MB'],
        ['In-flight messages per standard queue', '120,000'],
        ['In-flight messages per FIFO message group', '10'],
        ['Maximum TPS for FIFO queues without batching', '300'],
        ['Maximum duration of any message', 'Two weeks'],
        ['Queues bound to an exchange with routing rules', '25'],
      ],
      explain: 'Standard queues have no maximum TPS. With batches of 10, FIFO queues can support up to 3,000 TPS, and failed requests count against TPS. Without routing rules, an exchange can bind up to 450 queues.',
    },
    {
      type: 'single',
      prompt: 'The claims app publishes PDF files of up to 12 MB as binary payloads, and gets `Payload too large`, even on files of about 9 MB. What is the documented guidance?',
      options: [
        'Non-text payloads are converted to a string, which increases the size. Split the payload or use a claim check: store the file and send a pointer',
        'Raise the limit on the queue settings',
        'Use a FIFO queue, which accepts 100 MB',
        'Enable encryption, which compresses the payload',
      ],
      answer: 0,
      explain: 'The claim check needs you to manage access to the blob store for both sender and receiver.',
    },
    {
      type: 'multi',
      prompt: 'Which statements about cross-region failover are correct?',
      options: [
        'It is not enabled by default and needs the connector at version 4.0.7 or later and the `cross.region.failover.feature.enabled` property set to true',
        'It supports standard queues only, not FIFO queues or message exchanges',
        'It gives resiliency by switching to a fallback queue, not data redundancy: messages are not replicated',
        'If the queue has a dead-letter queue, failover must be enabled on the DLQ first',
        'You choose the fallback region for each queue',
      ],
      answer: [0, 1, 2, 3],
      explain: 'The server manages fallback queues and regions, and users cannot configure them. For example, the fallback region of us-east-1 is us-east-2. The fallback queue inherits settings such as message TTL.',
    },
    {
      type: 'order',
      prompt: 'Order the steps to turn on cross-region failover for a standard queue that has a DLQ.',
      items: [
        'Upgrade the app to Anypoint MQ Connector 4.0.7 or later',
        'Set `cross.region.failover.feature.enabled` to true in the app',
        'Enable failover on the dead-letter queue',
        'Enable failover on the primary queue',
        'Restart all apps that consume from or publish to the queue',
      ],
      explain: 'The docs require the DLQ to be enabled before the primary, and all consuming and publishing apps to be restarted. Enabling might not work through the UI or REST API if either region is unavailable.',
    },
    {
      type: 'multi',
      prompt: 'A publish to an exchange succeeds, but no consumer sees the message, and operations asks about tracing and replay. Which statements are correct?',
      options: [
        'If every binding has a routing rule and none matches, the message is not delivered to any queue, and DLQ settings do not apply',
        'A successful publish confirms only that Anypoint MQ accepted the message for the exchange',
        'There is no built-in replay from a DLQ, so you implement a flow that forwards messages back to the original queue',
        'To pass an ID between publisher and subscriber, add a user property, because `correlationId` is not propagated in the way APIs propagate it',
        'Unmatched messages wait on the exchange until a matching binding is added',
      ],
      answer: [0, 1, 2, 3],
      explain: 'A binding with no rule receives every message, so one such queue gives you a record of what was published. Anypoint MQ encrypts only the message body, so also keep sensitive data out of properties.',
    },
  ],
  description: `
An insurer is building claim intake on **CloudHub 2.0** in \`us-east-1\` with **Anypoint MQ**. The team has these settings and concerns:

| Item | Current design |
|---|---|
| \`claims.intake\` subscriber | AUTO acknowledgement, no timeout set, fraud check takes 10 seconds to 4 minutes |
| \`claims.payments\` | Must be processed in order per policy number, 500 messages per second at peak |
| Documents | Binary PDFs of up to 12 MB sent as message payloads |
| \`claims.events\` exchange | Routing rules on every binding |
| Disaster recovery | "Anypoint MQ fails over automatically to another region" |
| Egress | The private space firewall was tightened, and app-level egress rules are planned |

**Questions**
1. Choose an acknowledgement mode and timeout for \`claims.intake\`.
2. Which queue type fits \`claims.payments\`, and what limits apply?
3. How do you handle documents larger than the limit?
4. What can go wrong with the exchange, and how do you make failures visible?
5. Correct the statement about disaster recovery.
6. What must a private space allow for Anypoint MQ to work?
`,
  answerTemplate: `## Acknowledgement and timeout

## Queue type and limits

## Large documents

## Exchange routing

## Disaster recovery

## Private space egress
`,
  keyPoints: [
    'IMMEDIATE acknowledges before processing, AUTO acknowledges on flow success and MANUAL leaves it to the app.',
    'If acknowledgementTimeout is not set, the connector uses two minutes; the message returns to the queue when the timeout passes, even while the flow is running.',
    'Do not use prefetch if acknowledgementTimeout must be honoured, because the expiry is extended at 80% of the timeout.',
    'Payloads up to 10 MB; non-text payloads grow when converted to a string. Use a claim check for larger data.',
    'FIFO: 300 TPS without batching, 10 in-flight messages per group, no failover. Standard: at-least-once, no strict order, 120,000 in-flight per queue.',
    'Queues and exchanges are unique to their region. Failover is opt-in, for standard queues only, and does not replicate messages.',
    'Publishing to an exchange does not confirm delivery to a queue when routing rules are used.',
    'From a private space, MQ needs outbound 443 and, with app-level egress, rules for the control plane and the MQ domain.',
  ],
  solution: `
**1. \`claims.intake\`.** Keep **AUTO** so an error returns the message, and set \`acknowledgementTimeout\` above the worst case with an allowance, such as six minutes. Without it the default of two minutes returns four-minute messages to the queue while they are still running. Make the fraud check idempotent by claim ID. Avoid prefetch if the timeout matters.

**2. \`claims.payments\`.** FIFO queues process in order and are deduplicated, and only FIFO queues support only-once delivery. The peak of 500 messages per second exceeds 300 TPS unless messages are batched, and each group allows 10 in-flight messages, so use the policy number as the group to spread the load. FIFO needs an entitlement, and FIFO queues have no cross-region failover, so plan DR separately.

**3. Documents.** Store the file in object storage and send a pointer, which is the claim check style from the FAQ. Manage access for sender and receiver, and consider that messages can arrive out of order on a standard queue.

**4. Exchange.** When all bindings have rules and none match, the message goes nowhere, and redelivery and DLQ settings do not apply. A binding with no rule receives every message, so add one to an audit queue if you must be able to find what was published. Carry a correlation value in a user property, and build your own replay flow for DLQ messages.

**5. Disaster recovery.** Within a region, Anypoint MQ runs across availability zones, and if all zones go down, messages already in the system are retained for when service returns. Across regions, failover is opt-in. The connector switches to a fallback queue for new messages, and messages in the primary queue are not copied there. It requires connector 4.0.7 or later, the app property and a restart. FIFO queues and exchanges are not covered. The CloudHub 2.0 HA and DR page adds that, if the RTO cannot wait for the primary site to recover, you run a backup app and resend in-flight data.

**6. Private space.** Allow outbound 443 at the private space level. With app-level egress, add a rule group for \`anypoint.mulesoft.com\` (or \`eu1.anypoint.mulesoft.com\`) and the domain from the connector URL, such as \`mq-us-east-1.anypoint.mulesoft.com\`.
`,
  followUps: [
    { q: 'Can I use a reconnection strategy with Anypoint MQ Connector?', a: 'No. The connector uses REST and not a connection-based protocol. On the inbound side, use max redelivery and an error handler to move messages to a DLQ. On the outbound side, you can use until-successful.' },
    { q: 'What does the connector do if a publish keeps failing?', a: 'It does not store the message for resending. According to the FAQ, it retries 5 times and then discards it, and what to do next is up to the app.' },
    { q: 'How are API requests counted?', a: 'Every API call counts as one request, including send, receive and acknowledge. Up to 10 messages can be retrieved in one call, and a receive that returns nothing still counts.' },
    { q: 'Does failover add cost when nothing has failed?', a: 'The connector periodically checks the fallback queue for new messages. Each request counts against the monthly API request quota, and these checks can add latency, though you can configure their frequency.' },
  ],
}
