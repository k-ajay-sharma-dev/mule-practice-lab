export default {
  id: 'ms-085',
  category: 'mulesoft',
  title: 'JMS Ack Modes Compared: What a Failure Really Does in AUTO, IMMEDIATE, MANUAL and DUPS_OK',
  level: 'ADVANCED',
  tags: ['jms', 'activemq', 'ack-mode', 'transactions', 'redelivery', 'messaging'],
  estMinutes: 30,
  quiz: [
    {
      type: 'match',
      detail: true,
      prompt: 'The flow fails halfway through a message. Match each listener ack mode to the outcome the documentation describes.',
      pairs: [
        ['AUTO', 'Not acknowledged, and redelivered'],
        ['IMMEDIATE', 'Already acknowledged, and not redelivered'],
        ['MANUAL', 'Not redelivered by the broker until the session is recovered'],
        ['DUPS_OK', 'Behaves like AUTO, and a redelivery before the ACK can produce duplicates'],
      ],
      explain: 'Only AUTO and DUPS_OK react to a failure by themselves. IMMEDIATE has already given the message up, and MANUAL leaves every step to your flow.',
    },
    {
      type: 'single',
      prompt: 'A MANUAL flow fails. The error handler logs the error and ends, with no `jms:ack` and no `jms:recover-session`. What do the docs say about that message?',
      options: [
        'It is received but not acknowledged, and the broker does not redeliver it',
        'It is redelivered automatically, as in AUTO',
        'It moves straight to the DLQ',
        'It is acknowledged when the error handler finishes',
      ],
      answer: 0,
      explain: 'Unacknowledged messages are not redelivered by the broker in MANUAL. To have them redelivered, the flow must recover the session.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'Which requirement applies when you call `jms:recover-session`?',
      options: [
        'It must use the same connection that received the message',
        'It must run in a separate flow from the listener',
        'It must run before the first processor',
        'It must use a new consumer',
      ],
      answer: 0,
      explain: 'The connection used to recover the session has to be the one that received the message, which is why you pass the ackId of that message.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'A `jms:listener` runs with a LOCAL transaction. Which ack mode does the configuration documentation require?',
      options: ['IMMEDIATE', 'AUTO', 'MANUAL', 'DUPS_OK'],
      answer: 0,
      explain: 'This surprises many people. IMMEDIATE is required with LOCAL or MULTI transactions. The message is acknowledged only after the transaction occurs, so a rollback returns it for redelivery.',
    },
    {
      type: 'single',
      prompt: 'A flow uses `jms:consume` part-way through its logic to read a message. The developer must pick an ack mode, which decides how the message is acknowledged to the broker. Which modes can it use?',
      options: [
        'IMMEDIATE or MANUAL',
        'AUTO or DUPS_OK',
        'AUTO or MANUAL',
        'All four listener modes',
      ],
      answer: 0,
      explain: 'Consume is a step inside a flow, so it offers IMMEDIATE or MANUAL only. AUTO and DUPS_OK belong to the listener, whose acknowledgement follows the flow it starts. Maximum Wait defaults to 10000 ms, and the operation can raise JMS:TIMEOUT. If the result goes to a target with targetValue `#[message]`, the id is under the variable, for example `#[vars.consumedMessage.attributes.ackId]`.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'An audit feed tolerates a repeated message, and each record is safe to apply twice. Which listener mode gives flow-based acknowledgement and accepts that possible repeat?',
      options: ['DUPS_OK', 'IMMEDIATE', 'MANUAL with no recover-session', 'AUTO with a transaction'],
      answer: 0,
      explain: 'DUPS_OK works like AUTO but accepts duplicates if a message is redelivered before the ACK is performed, which is fine when processing is idempotent.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'A team sets Max Redelivery on the JMS listener to limit retries on ActiveMQ. Why does this not work?',
      options: [
        'The docs say Max Redelivery on the listener or config has no effect; use maxRedelivery on the ActiveMQ factory',
        'It only works for topics',
        'It only works with MANUAL ack',
        'It must be set on every jms:publish instead',
      ],
      answer: 0,
      explain: 'The setting that counts is `maxRedelivery` on the ActiveMQ connection factory. Its default is 0, which means no redelivery, and -1 means unlimited.',
    },
  ],
  description: `
A utility runs four ActiveMQ integrations, and an architecture review asks why each uses a different ack mode:

- **Meter reads:** high volume, and each read is safe to apply twice.
- **Customer payments:** written to Oracle, and must not be lost or double-booked.
- **Outage notifications:** a failed notification is parked on an error queue, and the queue must never hold up new alerts.
- **Field work orders:** the flow makes three calls and must decide for itself when a message is finished.

A previous review already explained what each mode means. This one asks a harder question: at the moment the flow fails, what exactly happens to the message, and who must act?

**Questions**
1. For each ack mode, what does a failure do to the message?
2. Which mode fits each integration?
3. How does \`jms:consume\` differ from the listener?
4. What changes in a transacted listener?
`,
  answerTemplate: `## What a failure does in each mode

## Mode for each integration

## Listener vs Consume

## Transacted listeners
`,
  keyPoints: [
    'AUTO: acknowledged only if the flow completes successfully; otherwise not acknowledged and redelivered.',
    'DUPS_OK: like AUTO, but a redelivery before the ACK is performed can produce duplicates.',
    'IMMEDIATE: acknowledged before processing; a failed message is not redelivered, so it needs error handling such as a DLQ.',
    'MANUAL: the app acknowledges with jms:ack. Unacknowledged messages are not redelivered by the broker; call jms:recover-session on the same connection.',
    'jms:consume allows only IMMEDIATE or MANUAL. Maximum Wait defaults to 10000 ms and it can raise JMS:TIMEOUT.',
    'A LOCAL or MULTI transacted listener requires ackMode IMMEDIATE; a rollback returns the message for redelivery.',
    'maxRedelivery on the ActiveMQ factory defaults to 0 (no redelivery); Max Redelivery on the listener or config has no effect.',
  ],
  solution: `
**1. What a failure does.**
| Mode | State when the flow fails | What happens next | Who must act |
|---|---|---|---|
| AUTO | Not acknowledged | Redelivered | Set \`maxRedelivery\` on the factory, and watch the DLQ |
| DUPS_OK | Like AUTO | Redelivered; duplicates are possible if redelivered before the ACK | Make processing idempotent |
| IMMEDIATE | Already acknowledged | Not redelivered | The error handler, or the message is lost |
| MANUAL | Received, not acknowledged | Not redelivered by the broker | The flow must call \`jms:recover-session\` |

The ActiveMQ factory matters here too. \`maxRedelivery\` defaults to **0**, which means no redelivery, and **-1** means unlimited. A redelivery design on AUTO needs a value you have chosen deliberately. Setting Max Redelivery on the listener or the config has no effect.

**2. Mode per integration.**
- **Meter reads:** DUPS_OK, because a repeat is harmless.
- **Customer payments:** a transacted listener, covered in section 4. JMS and Oracle are two resources, so making them commit or roll back together needs an XA transaction. With LOCAL, keep the Oracle write idempotent instead.
- **Outage notifications:** IMMEDIATE with an error handler that publishes the failure to the error queue. The handler must be reliable, because the broker no longer has the message.
- **Field work orders:** MANUAL, with \`jms:ack\` after the last call and \`jms:recover-session\` on the failure path.

**3. Listener vs Consume.** The listener starts the flow, so its acknowledgement can follow the flow's result, which gives it AUTO and DUPS_OK. \`jms:consume\` is one step in a flow, and its ack mode is IMMEDIATE or MANUAL only. Maximum Wait defaults to 10000 ms, and no message in that time raises \`JMS:TIMEOUT\`. With MANUAL and a target, read the id from the stored message:
\`\`\`xml
<jms:consume config-ref="amq" destination="WORK.ORDERS" ackMode="MANUAL"
             target="consumedMessage" targetValue="#[message]"/>
<jms:ack ackId="#[vars.consumedMessage.attributes.ackId]"/>
\`\`\`

**4. Transacted listeners.** With transaction type LOCAL (or XA), the source begins the transaction with the Transactional action \`ALWAYS_BEGIN\`. Other components do not join by default, so operations that must take part need \`ALWAYS_JOIN\` or \`JOIN_IF_POSSIBLE\`. The configuration docs require **IMMEDIATE** with LOCAL or MULTI transactions. That does not bring back the risk from section 1, because a transacted message is acknowledged only after the transaction occurs, and a rollback returns it to the destination for redelivery.
`,
  followUps: [
    {
      q: 'Why does the listener get AUTO but Consume does not?',
      a: 'A listener can follow the result of the flow it started. Consume is one step inside a flow, so the connector offers immediate acknowledgement or leaves it to your logic.',
    },
    {
      q: 'What errors would you watch for in a MANUAL design?',
      a: 'JMS:ACK when an acknowledgement fails and JMS:SESSION_RECOVER when recovering the session fails. Alert on both, because either can leave a message waiting.',
    },
    {
      q: 'How many consumers does a listener start by default?',
      a: 'Number Of Consumers defaults to 4, and Primary Node Only defaults to true. Bear that in mind when you reason about order or load.',
    },
  ],
}
