export default {
  id: 'ms-018',
  category: 'mulesoft',
  title: 'Try Scope and Transactions: Local vs XA',
  level: 'ADVANCED',
  tags: ['transactions', 'try-scope', 'xa', 'database', 'jms'],
  estMinutes: 30,
  quiz: [
    {
      type: 'single',
      prompt: 'Can a **local** transaction make steps 1–3 (Oracle inserts + JMS publish, plus the JMS consume) all-or-nothing?',
      options: [
        'No — a local transaction is bound to one resource; Oracle + JMS needs XA',
        'Yes — a local transaction covers every connector in the flow',
        'Yes, if all operations use ALWAYS_JOIN',
        'No — transactions are not supported with JMS',
      ],
      answer: 0,
      explain: 'Steps 1 and 2 alone (same Oracle config) could share a local DB transaction, but spanning Oracle **and** JMS requires XA.',
    },
    {
      type: 'match',
      prompt: 'Match each transactional action to its behaviour.',
      pairs: [
        ['INDIFFERENT (scope default)', 'Does not start a transaction'],
        ['ALWAYS_BEGIN', 'Starts a new transaction'],
        ['JOIN_IF_POSSIBLE (operation default)', 'Joins a transaction if one exists'],
        ['NOT_SUPPORTED', 'Runs the operation outside the transaction'],
      ],
      explain: 'Scopes and sources begin transactions; operations decide whether to join them. `ALWAYS_JOIN` fails if no transaction exists.',
    },
    {
      type: 'single',
      prompt: 'Last month a failure in step 2 left orphan headers in `ORDERS`. Which error handler behaviour causes that inside a transaction?',
      options: [
        'On Error Continue — it commits whatever already succeeded',
        'On Error Propagate — it commits before rethrowing',
        'Both handlers always roll back',
        'The default error handler commits',
      ],
      answer: 0,
      explain: '**On Error Propagate rolls back**; **On Error Continue commits**. To undo the header insert, propagate the error.',
    },
    {
      type: 'multi',
      prompt: 'What do you need for an XA transaction in Mule 4?',
      options: [
        'An XA DataSource for Oracle',
        'An XA connection factory for IBM MQ',
        'A transaction manager such as the Bitronix module',
        'An HTTP Request with `transactionalAction="ALWAYS_JOIN"`',
      ],
      answer: [0, 1, 2],
      explain: 'XA needs XA-capable resources and a transaction manager, and costs two-phase-commit latency and complex recovery. HTTP cannot take part in a transaction.',
    },
    {
      type: 'single',
      prompt: 'Where does the Tax HTTP call belong?',
      options: [
        'After the commit (e.g. a separate flow triggered by `OrderAccepted`), with retries and idempotency',
        'Inside the XA transaction so it is rolled back on failure',
        'Before the DB inserts, so tax is registered first',
        'Inside an Async scope within the transaction so it joins it',
      ],
      answer: 0,
      explain: 'HTTP cannot be rolled back, and inside the transaction it would hold DB locks while waiting. An Async scope does not join the transaction either — it runs on another thread.',
    },
    {
      type: 'order',
      prompt: 'A message keeps failing inside the XA flow. Order what happens.',
      items: [
        'An error occurs and On Error Propagate rolls back the transaction',
        'The DB changes are undone and nothing is published',
        'The JMS message returns to the queue and is redelivered',
        'After the redelivery limit is exceeded, the message is routed to the DLQ',
      ],
      explain: 'Rollback returns the message to the queue; once the IBM MQ backout threshold is reached the IBM MQ JMS client moves it to the backout queue (the DLQ), or the flow sees `JMSXDeliveryCount` above the limit and publishes it to the DLQ itself.',
    },
  ],
  description: `
An **Order System API** receives orders from an **IBM MQ queue** (JMS connector) and must:

1. Insert the order header into Oracle table \`ORDERS\`.
2. Insert N lines into \`ORDER_LINES\`.
3. Publish an \`OrderAccepted\` message to a second JMS queue.
4. Call a **Tax HTTP API** to register the tax document.

Requirements: if anything in steps 1–3 fails, **nothing** should be written to Oracle, nothing published, and the original message must go back to the queue for redelivery (max 5 times, then to a DLQ). Last month a failure in step 2 left orphan headers in \`ORDERS\`, and some \`OrderAccepted\` messages were published for orders that were never saved.

**Questions**
1. Explain the transactional actions on the Try scope and on connector operations.
2. Design the transaction boundaries. Can a **local** transaction cover steps 1–3? Why or why not?
3. What do you need for an XA transaction in Mule 4, and what does it cost?
4. Where does the Tax HTTP call go, and why can't it be in the transaction?
5. What decides commit vs rollback in the error handler, and how does redelivery reach the DLQ?
`,
  answerTemplate: `## Transactional actions

## Transaction boundaries

## XA requirements and cost

## The Tax HTTP call

## Commit, rollback and redelivery
`,
  keyPoints: [
    'Try scope transactionalAction: INDIFFERENT (default), ALWAYS_BEGIN, BEGIN_OR_JOIN; transactionType LOCAL or XA. Transactional sources (e.g. jms:listener): NONE (default) or ALWAYS_BEGIN.',
    'Operations: JOIN_IF_POSSIBLE (default), ALWAYS_JOIN, NOT_SUPPORTED.',
    'A local transaction is bound to a single resource (one connector config), so DB inserts can share one but DB + JMS needs XA.',
    'XA needs XA-capable connections (XA data source / XA JMS connection factory) and a transaction manager (Bitronix module); it adds latency and operational complexity.',
    'HTTP is not transactional — call it after the commit, make it idempotent and handle its failure separately (retry/compensation).',
    'On Error Propagate rolls back the transaction; On Error Continue commits it. With a transacted JMS listener on IBM MQ, the backout threshold (BOTHRESH) and backout queue (BOQNAME) — or a JMSXDeliveryCount check in the flow — get poison messages to a DLQ; the JMS listener redelivery-policy maxRedeliveryCount has no effect.',
  ],
  solution: `
**Transactional actions**
- **Try scope**: \`INDIFFERENT\` (default — no transaction started), \`ALWAYS_BEGIN\` (start a new one), \`BEGIN_OR_JOIN\` (join an existing one or start). \`transactionType\` = \`LOCAL\` or \`XA\`.
- **Transactional sources** (e.g. \`jms:listener\`): \`NONE\` (default) or \`ALWAYS_BEGIN\`.
- **Operations**: \`JOIN_IF_POSSIBLE\` (default — join if a transaction exists), \`ALWAYS_JOIN\` (fail if there is none), \`NOT_SUPPORTED\` (run outside the transaction).

**Boundaries:** a **local** transaction belongs to **one** resource/connector config. Steps 1 and 2 (same Oracle config) could share a local DB transaction, but steps 1–3 span **Oracle + JMS**, plus the JMS consume itself. To get "all or nothing" across them you need **XA**:
\`\`\`xml
<flow name="order-intake">
  <jms:listener config-ref="ibmMqXa" destination="ORDERS.IN"
      transactionalAction="ALWAYS_BEGIN" transactionType="XA" ackMode="IMMEDIATE"/>
  <db:insert config-ref="oracleXa" .../>          <!-- header -->
  <db:bulk-insert config-ref="oracleXa" .../>     <!-- lines -->
  <jms:publish config-ref="ibmMqXa" destination="ORDERS.ACCEPTED"/>
  <error-handler>
    <on-error-propagate/>  <!-- rollback: DB undone, nothing published, message back on queue -->
  </error-handler>
</flow>
<flow name="register-tax"> ... </flow>  <!-- triggered after commit -->
\`\`\`
Alternatively use a Try scope with \`ALWAYS_BEGIN\`/\`XA\` around steps 1–3.

**XA requirements and cost:** XA-capable resources — an XA DataSource for Oracle (data-source connection referencing an XA datasource bean) and an XA connection factory for IBM MQ — plus a transaction manager (**Bitronix** module in Mule 4). Costs: two-phase commit latency, lower throughput, more complex recovery (in-doubt transactions, transaction logs on disk). If XA is too heavy, alternatives are a single local DB transaction plus an **outbox table** (publish from the table afterwards) or idempotent consumers.

**Tax HTTP call:** HTTP can't take part in a transaction — it can't be rolled back. Put it **after** the commit, e.g. in a separate flow triggered by the \`OrderAccepted\` message, with retries and idempotency (tax document ID), and a compensating/manual path if it keeps failing. Inside the transaction it would also hold DB locks while waiting on a remote system.

**Commit vs rollback:** if the flow (or Try) completes successfully, the transaction commits. In the handler, **On Error Propagate rolls back**; **On Error Continue commits** whatever succeeded — which is how orphan headers happen. On rollback the JMS message returns to the queue. To stop after 5 attempts, rely on IBM MQ's backout threshold (\`BOTHRESH=5\` on the queue): once the backout count reaches it, the IBM MQ JMS client moves the message to the backout queue (\`BOQNAME\`), which acts as the DLQ. Alternatively read \`JMSXDeliveryCount\` in the flow and, past the limit, publish the message to a DLQ and let the transaction commit. (The JMS listener's \`redelivery-policy\` \`maxRedeliveryCount\` is documented as having no effect for the JMS connector; its own \`maxRedelivery\` setting exists only on the ActiveMQ factory configuration.)
`,
  followUps: [
    {
      q: 'What happens if you put an Async scope or VM publish to another flow inside the transaction?',
      a: 'Async work runs on another thread and does not join the transaction, so it can happen even if the transaction later rolls back. Transactions are bound to the processing thread of the flow.',
    },
    {
      q: 'Is XA supported on CloudHub 2.0?',
      a: 'The Bitronix docs do not list supported deployment targets, so confirm it for your target. XA depends on the XA support of the resources and on recovery of in-doubt transactions, which is likely to be harder on ephemeral replicas, so many teams prefer the outbox pattern.',
    },
    {
      q: 'How do you make the consumer safe if the same order is redelivered after a partial external effect?',
      a: 'Use idempotency: a unique constraint on order ID in the DB, an Idempotent Message Validator, or check-before-insert so a redelivered message doesn\'t create duplicates.',
    },
  ],
}
