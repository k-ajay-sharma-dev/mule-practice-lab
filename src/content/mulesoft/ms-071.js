export default {
  id: 'ms-071',
  category: 'mulesoft',
  title: 'Goods Receipt from ActiveMQ into Oracle: Transacted JMS Listener, LOCAL vs XA with Bitronix, and the Outbox Alternative',
  level: 'EXPERT',
  tags: ['supply-chain', 'jms', 'activemq', 'oracle', 'transactions', 'xa', 'bitronix', 'outbox', 'goods-receipt'],
  estMinutes: 40,
  quiz: [
    {
      type: 'single',
      prompt: 'The listener is `transactionalAction="ALWAYS_BEGIN" transactionType="LOCAL" ackMode="IMMEDIATE"` on the JMS config. The flow inserts the goods receipt into Oracle with `db:insert` and then publishes `GR.POSTED` with `transactionalAction="ALWAYS_JOIN"`. What do the DB insert and the JMS publish do?',
      options: [
        'The JMS publish (same JMS config) joins the local JMS transaction; the DB insert cannot join it and commits on its own',
        'Both join the local transaction',
        'Neither joins; LOCAL transactions only apply to the listener',
        'The DB insert joins and the publish runs outside',
      ],
      answer: 0,
      explain: 'A local transaction belongs to one resource — here the JMS session: all operations in it must use the same connector and the same global config. Operations on another resource (Oracle) cannot join it and run with their own commit.',
    },
    {
      type: 'single',
      prompt: 'With that LOCAL JMS transaction, Oracle commits the receipt and then the runtime crashes before the JMS commit. What happens next?',
      options: [
        'The message is redelivered and the receipt would be inserted again unless the consumer is idempotent',
        'Oracle rolls back the insert because JMS did not commit',
        'The message is lost',
        'The broker sends the message to the DLQ immediately',
      ],
      answer: 0,
      explain: 'This is the duplicate window of "DB first, then ack": the broker never got a commit, so it redelivers. A unique key on the receipt number turns the second insert into a no-op.',
    },
    {
      type: 'multi',
      prompt: 'What is needed to make the JMS consume, the Oracle inserts and the JMS publish one XA transaction in Mule 4?',
      options: [
        'A transaction manager — the Bitronix module (bti:transaction-manager)',
        'An XA-capable JMS connection (e.g. the ActiveMQ XA Connection type in JMS connector 2.x — older 1.x versions used enableXA — or a generic XA connection)',
        'An XA data source for Oracle (e.g. a Bitronix XA data source pool referenced by the DB config)',
        'transactionType="XA" on the listener (or Try) that begins the transaction',
        'Setting ackMode="MANUAL" on the listener',
      ],
      answer: [0, 1, 2, 3],
      explain: 'XA needs a transaction manager plus XA-capable resources, and the transaction must be begun as XA. MANUAL ack plays no part: in a transaction the message is acknowledged only after the transaction completes.',
    },
    {
      type: 'multi',
      prompt: 'Which are real costs or risks of XA in this design?',
      options: [
        'Two-phase commit adds latency and round trips to both resources for every message',
        'In-doubt transactions after a crash must be recovered from the transaction log, which needs persistent storage for the runtime',
        'The Oracle user needs privileges for XA recovery, and DBAs must understand pending in-doubt transactions',
        'XA makes the HTTP call to the ERP transactional too',
      ],
      answer: [0, 1, 2],
      explain: 'XA only covers XA resources. HTTP is never part of it. Recovery depends on the transaction log surviving restarts, which is harder on ephemeral container replicas.',
    },
    {
      type: 'single',
      prompt: 'The team picks the **transactional outbox** instead of XA. What does that mean here?',
      options: [
        'In one Oracle LOCAL transaction insert the receipt and an OUTBOX row; a separate flow publishes OUTBOX rows to GR.POSTED and marks them sent',
        'Publish GR.POSTED first and insert into Oracle afterwards',
        'Use an Async scope to publish after the insert',
        'Store the message in an Object Store and publish it later',
      ],
      answer: 0,
      explain: 'The receipt and the "event to publish" commit atomically in Oracle. Publishing is then at-least-once from the outbox, so consumers of GR.POSTED must be idempotent.',
    },
    {
      type: 'order',
      prompt: 'Order the outbox-based processing of one goods receipt message.',
      items: [
        'JMS listener receives the receipt (AUTO ack, no JMS transaction)',
        'Try with a LOCAL DB transaction inserts GOODS_RECEIPTS (unique receipt number) and an OUTBOX row',
        'The DB transaction commits, then the JMS message is acknowledged',
        'An outbox publisher flow reads NEW outbox rows and publishes GR.POSTED',
        'The publisher marks the outbox rows SENT',
      ],
      explain: 'If the ack is lost after the DB commit, the redelivery hits the unique key and is skipped. If publishing fails, the row stays NEW and is retried.',
    },
  ],
  description: `
A grocery DC posts **goods receipts** when pallets are received against a purchase order. The WMS publishes each receipt to the ActiveMQ queue \`GR.INBOUND\`. A Mule **Receiving Process API** must:

1. Insert the receipt into Oracle \`GOODS_RECEIPTS\` and lines into \`GOODS_RECEIPT_LINES\`.
2. Update \`PO_LINES.QTY_RECEIVED\`.
3. Publish \`GR.POSTED\` on ActiveMQ for invoice matching (3-way match) and replenishment.

Incidents:
- After a node crash, a receipt was posted **twice** — finance paid for 2 pallets that arrived once.
- During a broker failover, \`GR.POSTED\` was published for a receipt whose Oracle transaction later rolled back; invoice matching approved an invoice for goods not in the system.

The architect proposes **XA with Bitronix** across ActiveMQ and Oracle. The platform team runs Mule on **CloudHub 2.0 replicas** and is worried about XA recovery. A developer suggests "just use a LOCAL transaction on the listener".

**Questions**
1. What exactly does a LOCAL transaction on the JMS listener cover, and what does it not cover?
2. Explain how each incident could happen.
3. How would you configure XA in Mule 4 for ActiveMQ + Oracle, and what does it cost to operate?
4. Design the alternative with a transactional outbox and idempotent consumers. Which would you recommend here?
`,
  answerTemplate: `## What a LOCAL listener transaction covers

## How the incidents happened

## XA configuration and cost

## Outbox design and recommendation
`,
  keyPoints: [
    'A LOCAL transaction is bound to one resource: on a JMS listener it covers the receive and publishes on the same JMS config, never the Oracle operations.',
    'DB commit followed by a lost JMS commit causes redelivery and duplicates; JMS publish followed by a DB rollback causes phantom events.',
    'XA needs the Bitronix transaction manager, XA-capable JMS connection and Oracle XA data source, and transactionType XA where the transaction begins.',
    'XA costs latency (two-phase commit), needs a persistent transaction log for recovery of in-doubt transactions, and complicates operations on ephemeral replicas.',
    'The outbox pattern commits business data and the outgoing event in one Oracle LOCAL transaction; a publisher sends outbox rows at least once.',
    'Idempotency (unique receipt number, idempotent consumers of GR.POSTED) is required in every design.',
  ],
  solution: `
**1. LOCAL on the listener.** \`transactionalAction="ALWAYS_BEGIN" transactionType="LOCAL"\` makes the JMS session transacted: the message is acknowledged only after the transaction completes, and \`jms:publish\` on the **same JMS config** can join, so the publish and the consume commit together. Set its \`transactionalAction\` explicitly to ALWAYS_JOIN or JOIN_IF_POSSIBLE: the reference lists JOIN_IF_POSSIBLE as the default, but the JMS transactions page says other components do not join by default. Oracle operations are a **different resource**: a Single Resource transaction needs the same connector and the same global config, so they stay outside it with their own commit. A Try with ALWAYS_BEGIN for a DB transaction is not possible here either, because ALWAYS_BEGIN raises an error when a Single Resource transaction already exists. The config docs require ack mode IMMEDIATE when the transaction type is LOCAL or MULTI. On a rollback the message returns to the destination for redelivery; on ActiveMQ Classic check \`maxRedelivery\` on the factory configuration, whose default of 0 means no redelivery.

**2. Incidents.**
- **Duplicate receipt**: Oracle committed, then the node died before the JMS commit. The broker redelivered and the receipt was inserted again — no unique key on the receipt number.
- **Phantom GR.POSTED**: the publish and the DB work were not atomic. In the failing version, the publish was effectively committed before the Oracle transaction rolled back (e.g. a publish on a different, non-transacted config, or an outer DB transaction that failed after the publish).

**3. XA with Bitronix.**
\`\`\`xml
<bti:transaction-manager/>
<bti:xa-data-source-pool name="oracleXaPool" dataSource-ref="oracleXaDataSource" minPoolSize="2" maxPoolSize="10"/>
<db:config name="oracleXa">
  <db:data-source-connection dataSourceRef="oracleXaPool"/>
</db:config>
<jms:config name="amqXa">
  <jms:active-mq-xa-connection>
    <jms:factory-configuration brokerUrl="failover:(tcp://amq1:61616,tcp://amq2:61616)"/>
    <jms:xa-connection-pool maxPoolSize="32" maxIdleSeconds="60"/>
  </jms:active-mq-xa-connection>
</jms:config>
<!-- ActiveMQ XA Connection: JMS connector 2.x on Mule 4.10+. Older 1.x versions used
     <jms:active-mq-connection> with enableXA="true" on the factory configuration. -->

<flow name="gr-inbound">
  <jms:listener config-ref="amqXa" destination="GR.INBOUND" transactionalAction="ALWAYS_BEGIN" transactionType="XA"/>
  <db:insert config-ref="oracleXa">...</db:insert>
  <db:bulk-insert config-ref="oracleXa">...</db:bulk-insert>
  <db:update config-ref="oracleXa">...</db:update>
  <jms:publish config-ref="amqXa" destination="GR.POSTED"/>
</flow>
\`\`\`
(\`oracleXaDataSource\` is an \`oracle.jdbc.xa.client.OracleXADataSource\` bean. Check \`transactionalAction\` on each operation so that it really joins, as in section 1.) **Costs**: two-phase commit on every message (prepare + commit on both resources), lower throughput, and Bitronix transaction logs that must survive restarts to recover in-doubt transactions. You also need Oracle privileges for XA recovery and DBA procedures for pending transactions. On CloudHub 2.0 replicas, local disk is not durable across replica replacement, which weakens recovery.

**4. Outbox + idempotency (recommended here).**
- Listener with AUTO ack and no JMS transaction, because a Try with ALWAYS_BEGIN inside an active LOCAL transaction raises an error. In a Try with a LOCAL DB transaction: insert the receipt (unique \`RECEIPT_NO\`), lines, PO update and an \`OUTBOX\` row (\`event_type=GR_POSTED\`, payload, status NEW). Commit.
- If the receipt already exists (ORA-00001 on \`RECEIPT_NO\`), treat it as already processed and ack.
- A scheduler-driven publisher reads NEW outbox rows (claiming them with \`FOR UPDATE SKIP LOCKED\`), publishes \`GR.POSTED\` persistently and marks them SENT. Publishing is at least once, so invoice matching de-duplicates on receipt number.
- Result: no phantom events (the event only exists if the receipt committed), no duplicate receipts (unique key), and no XA recovery to operate.

Choose XA only when you cannot add idempotency or an outbox table, the platform offers durable transaction logs, and the throughput cost is acceptable.
`,
  followUps: [
    {
      q: 'Can the outbox publisher and the receipt flow run in the same app?',
      a: 'Yes; they are separate flows. The publisher must avoid double publishing across replicas, e.g. by claiming rows with SKIP LOCKED, and consumers must still be idempotent.',
    },
    {
      q: 'What happens to an XA transaction if Oracle is prepared but the runtime dies before commit?',
      a: 'The branch stays in-doubt in Oracle, holding locks, until the transaction manager recovers it from its log and commits or rolls back. If the log is lost, a DBA has to resolve it manually.',
    },
    {
      q: 'Why does the invoice-matching consumer need idempotency even with XA?',
      a: 'Its own processing of GR.POSTED is a separate transaction with its own failure modes and redeliveries; idempotency on receipt number protects it regardless of how the event was produced.',
    },
  ],
}
