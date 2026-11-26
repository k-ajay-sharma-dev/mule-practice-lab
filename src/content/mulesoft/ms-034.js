export default {
  id: 'ms-034',
  category: 'mulesoft',
  title: 'VM Connector: Transient vs Persistent Queues and Publish-Consume',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'vm-connector', 'queues', 'async', 'reliability'],
  estMinutes: 15,
  quiz: [
    {
      type: 'single',
      prompt: 'After Friday\'s redeploy, ~300 orders that had already received **202 Accepted** never reached the ERP. What explains it?',
      options: [
        'The ERP rejected them silently, without any error back',
        'The queue is TRANSIENT, so in-memory messages were lost',
        'VM messages expire after one hour by default, so old ones were dropped',
        'The HTTP Listener returned 202 before it published them',
      ],
      answer: 1,
      explain: 'The `orders` queue is TRANSIENT, and TRANSIENT queues live in memory, so messages are lost on restart. Work already acknowledged to the client must survive restarts: use PERSISTENT, or better, a real broker.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'When the ERP is slow, `vm:publish` blocks and then fails with `VM:QUEUE_TIMEOUT`. Which setting controls how many messages can wait before publishers block?',
      options: [
        '`maxOutstandingMessages` on the queue, which defaults to 0',
        '`queueType="TRANSIENT"`, which keeps the queue in memory',
        'The response timeout of the HTTP Listener for the flow',
        '`numberOfConsumers` on the `vm:listener` of that queue',
      ],
      answer: 0,
      explain: '`maxOutstandingMessages` sets the number of messages that can be queued before blocking starts. The reference gives a default of 0, which in the VM docs has meant no limit, so set an explicit value to get back-pressure. `numberOfConsumers` sets parallel consumers, not the queue size. Size it for the bursts you can hold. When publish still times out, return **503** rather than accepting work you cannot hold.',
    },
    {
      type: 'single',
      prompt: 'Another team wants to publish to the `orders` queue from **their own** application on CloudHub. What do you recommend?',
      options: [
        'Share the VM config name with them so they can reference it',
        'Make the queue PERSISTENT so that other apps can see it',
        'Use Anypoint MQ or a JMS broker, as VM queues are app-local',
        'Deploy both apps to the same CloudHub worker so they share it',
      ],
      answer: 2,
      explain: 'VM queues are visible only inside the same app (or apps sharing a domain on-premises). A broker gives durable, cross-app messaging with DLQ support and monitoring.',
    },
    {
      type: 'single',
      prompt: 'The Order API hands each order to a `price-order` flow that has a `vm:listener` on the `pricing` queue, and it needs the computed price for its own response. Which operation fits?',
      options: [
        '`vm:publish`, then read the price from the payload once it returns',
        '`vm:publish`, then `vm:consume` on the `pricing` queue for the reply',
        '`vm:consume` on the `pricing` queue, which sends the order and waits',
        '`vm:publish-consume`, which waits for the reply of the listener flow',
      ],
      answer: 3,
      explain: 'It is synchronous request-reply over VM: it waits for the response the listener flow produces, with a timeout. On timeout the caller gets an error. `vm:publish` returns at once with no reply, and a `vm:consume` on the same queue would read a pending order, not the price. `vm:consume` only reads, it never sends.',
    },
    {
      type: 'match',
      prompt: 'Match each VM listener case to its outcome.',
      pairs: [
        ['`ALWAYS_BEGIN`, and an error propagates out of the flow', 'Rollback: the message is redelivered'],
        ['`ALWAYS_BEGIN`, and an On Error Continue handles the error', 'Commit: the message is gone'],
        ['`transactionalAction="NONE"` (the listener default)', 'No transaction is started, so there is nothing to roll back'],
      ],
      explain: 'Propagate rolls the transaction back so the message can be retried; Continue commits. Without a transaction, plan explicit retry or an error queue.',
    },
    {
      type: 'multi',
      prompt: 'A flow with a `vm:listener` reads a VM queue and calls a slow ERP. Which two settings control how many messages it processes in parallel?',
      options: [
        '`numberOfConsumers` on the `vm:listener`',
        '`maxConcurrency` on the flow',
        '`maxOutstandingMessages` on the queue',
        '`queueType` on the queue',
      ],
      answer: [0, 1],
      explain: '`numberOfConsumers` sets how many parallel consumers read the queue, and the flow\'s `maxConcurrency` also caps parallel processing. `maxOutstandingMessages` sets how many messages can be queued before blocking starts. `queueType` chooses TRANSIENT or PERSISTENT: PERSISTENT queues survive restarts but are slower. VM publish is not faster than Flow Reference, which is a direct in-memory call. Use VM for decoupling, buffering or transaction boundaries, not for speed.',
    },
  ],
  description: `
An **Order Intake** app accepts orders over HTTP, replies **202 Accepted** immediately, and processes them in the background through a VM queue:

\`\`\`xml
<vm:config name="vmConfig">
  <vm:queues>
    <vm:queue queueName="orders" queueType="TRANSIENT"/>
  </vm:queues>
</vm:config>
\`\`\`

The HTTP flow does \`vm:publish\` to \`orders\`; a second flow has \`vm:listener queueName="orders"\` and calls the ERP.

Incidents:
- After a redeploy on Friday, **~300 accepted orders never reached the ERP**.
- When the ERP is slow, \`vm:publish\` blocks and then fails with \`VM:QUEUE_TIMEOUT\`, so clients see errors during short bursts.
- Another team asks to publish to the \`orders\` queue **from their own app**.

**Questions**
1. Explain transient vs persistent VM queues. Which incident does the queue type explain?
2. What controls how many messages are consumed in parallel, and how do you add back-pressure?
3. When would you use \`vm:publish-consume\`?
4. Can another application publish to this VM queue? What would you recommend instead?
5. How do transactions and errors in the listener flow affect the message?
`,
  answerTemplate: `## Transient vs persistent

## Concurrency and back-pressure

## publish-consume

## Cross-application messaging

## Transactions and errors
`,
  keyPoints: [
    'TRANSIENT queues live in memory and lose messages on restart or crash; PERSISTENT queues are stored and survive restarts at some performance cost.',
    'maxOutstandingMessages on the queue sets how many messages can be queued before blocking starts (default 0, which has meant no limit, so set a value for back-pressure); the listener numberOfConsumers (default 4) controls parallel consumers.',
    'publish-consume sends a message and waits for the listener flow\'s response: a synchronous request-reply over VM.',
    'VM queues are local to an application (or a domain on-premises); cross-application messaging needs a broker such as Anypoint MQ or JMS.',
    'With a transactional VM listener, an error that propagates rolls back and the message is redelivered; On Error Continue consumes it.',
  ],
  solution: `
**Transient vs persistent**
| | TRANSIENT | PERSISTENT |
|---|---|---|
| Storage | Memory | Disk on a single runtime; the cluster's memory grid in a Mule cluster; the "Persistent queues" option on CloudHub 1.0 (CloudHub 2.0 does not support persistent VM queues: use Anypoint MQ) |
| Restart / crash | Messages lost | Messages kept |
| Speed | Faster | Slower |
| Use for | Fire-and-forget, recomputable work | Work that has already been acknowledged to the client |

The Friday loss: the HTTP flow returned 202, so the client believes the order is safe, but the messages sat in an in-memory queue during the redeploy. Use \`queueType="PERSISTENT"\`, or better for business-critical data, a real broker (see below).

**Concurrency and back-pressure**
- \`maxOutstandingMessages\` on the queue sets how many messages can be queued before blocking starts. The default is 0, which in the VM docs has meant no limit, so set an explicit value to get back-pressure. A blocked publish fails with \`VM:QUEUE_TIMEOUT\` when its timeout (default 5 seconds) expires.
- \`numberOfConsumers\` on \`vm:listener\` sets parallel consumers; the flow's \`maxConcurrency\` also caps parallel processing.
- When publish times out, return **503** to the client rather than accepting work you cannot hold.

**publish-consume:** sends a message and **waits** for the response produced by the listener flow: useful to decouple a call across flows while keeping request-reply semantics (e.g. calling a flow that has its own transaction or concurrency limit). It has a timeout; on expiry the caller gets an error.

**Cross-application:** VM queues are visible only inside the same application (and, on-premises, apps sharing a **domain**). They are not an integration channel between apps on CloudHub or RTF. For the other team use **Anypoint MQ** (or a JMS broker): durable, cross-app, DLQ support, monitoring.

**Transactions and errors:** the VM listener can start a transaction (\`transactionalAction="ALWAYS_BEGIN"\`). If an error propagates, the transaction rolls back and the message goes back to the queue for redelivery; On Error Continue commits and the message is gone. The listener default is \`NONE\`, and the VM docs do not describe what happens to a message when a non-transactional flow fails, so plan failures explicitly (retry, error queue).
`,
  followUps: [
    {
      q: 'In an on-premises Mule cluster, how do persistent VM queues behave?',
      a: 'In a cluster, VM queues are shared across nodes using the cluster\'s distributed storage. So a message published on one node can be consumed on another and survives the loss of a node.',
    },
    {
      q: 'Is a VM publish faster than a Flow Reference?',
      a: 'No: Flow Reference is a direct in-memory call. VM adds queueing and serialization (for persistent queues). Use VM for decoupling, buffering or transaction boundaries, not for speed.',
    },
  ],
}
