export default {
  id: 'ar-078',
  category: 'architecture',
  title: 'Goods Receipt Consistency: XA Transactions vs Outbox with JMS and Oracle',
  level: 'ADVANCED',
  tags: ['supply-chain', 'xa', 'outbox', 'transactions', 'activemq', 'jms', 'oracle', 'idempotency'],
  estMinutes: 30,
  quiz: [
    {
      type: 'single',
      prompt: 'prc-goods-receipt consumes a receipt from ActiveMQ, inserts it into Oracle and publishes "receipt.posted". What does an XA transaction (Bitronix) give you here?',
      options: [
        'The JMS receive, the Oracle insert and the JMS publish commit or roll back together under one transaction manager',
        'Exactly-once delivery to every downstream HTTP API',
        'Automatic deduplication of messages the supplier sent twice',
        'Faster processing because the commits are batched',
      ],
      answer: 0,
      explain: 'XA coordinates **transactional resources** (the JMS session and the Oracle connection) with two-phase commit. It does not cover HTTP calls, does not dedupe business duplicates, and is slower, not faster.',
    },
    {
      type: 'multi',
      prompt: 'Which are real costs or prerequisites of the XA option? (Select all that apply.)',
      options: [
        'Both resources must be XA-capable: an Oracle XA data source and an XA-enabled ActiveMQ connection factory',
        'Two-phase commit adds round trips and holds locks longer, reducing throughput',
        'The transaction manager keeps a recovery log; in-doubt transactions after a crash need recovery and sometimes manual resolution',
        'XA also makes the call to the WMS REST API transactional',
        'XA removes the need for idempotent consumers downstream of the published event',
      ],
      answer: [0, 1, 2],
      explain: 'XA needs XA drivers on both sides, costs throughput and introduces recovery/in-doubt handling. HTTP is not an XA resource, and downstream consumers still see at-least-once delivery from the broker.',
    },
    {
      type: 'single',
      prompt: 'In the outbox alternative, what happens in the single LOCAL Oracle transaction?',
      options: [
        'Insert the goods receipt AND insert a row into an OUTBOX table describing the "receipt.posted" event',
        'Insert the receipt and publish to ActiveMQ inside a try scope',
        'Only insert the outbox row; the receipt is inserted later by the relay',
        'Publish to ActiveMQ first, then insert the receipt',
      ],
      answer: 0,
      explain: 'The business row and the event row commit atomically in one local Oracle transaction. Publishing to the broker inside the same flow without XA would reintroduce the dual-write problem.',
    },
    {
      type: 'order',
      prompt: 'Order the steps of the outbox design end to end.',
      items: [
        'jms:listener receives the receipt message (MANUAL ack)',
        'One local Oracle transaction inserts the receipt (unique on ASN + line) and the OUTBOX row',
        'The JMS message is acknowledged after the commit',
        'A relay flow reads unsent OUTBOX rows in order',
        'The relay publishes "receipt.posted" to ActiveMQ and marks the row as sent',
      ],
      explain: 'The inbound side relies on ack-after-commit plus a unique key for idempotency; the outbound side relies on the relay, which may publish a row twice if it crashes between publish and mark — so subscribers must be idempotent.',
    },
    {
      type: 'single',
      prompt: 'The relay publishes an outbox event, then crashes before marking the row as sent. What is the consequence and the correct design response?',
      options: [
        'The event is published again after restart; subscribers deduplicate on the event id',
        'The event is lost; add XA to the relay',
        'Oracle rolls back the receipt; the supplier must resend',
        'ActiveMQ detects the duplicate automatically, so nothing is needed',
      ],
      answer: 0,
      explain: 'The outbox gives **at-least-once** publishing. That is acceptable because each event carries a stable id and consumers are idempotent; the broker does not deduplicate business events for you.',
    },
    {
      type: 'match',
      prompt: 'Match each approach to its defining characteristic.',
      pairs: [
        ['XA with Bitronix', 'Atomic commit across JMS and Oracle via two-phase commit'],
        ['Transactional outbox', 'Local Oracle transaction plus an asynchronous relay; at-least-once publish'],
        ['Local JMS transaction + idempotent DB write', 'Redelivery on failure, duplicates absorbed by a unique key'],
      ],
      explain: 'All three are valid; they trade strict atomicity (XA) against throughput and operational simplicity (outbox, idempotent consumer).',
    },
  ],
  description: `
A grocery DC posts **goods receipts** from the WMS. Flow today in \`prc-goods-receipt\`:
1. \`jms:listener\` on \`wms.receipts\` (ActiveMQ Classic, \`ackMode\` IMMEDIATE).
2. \`db:insert\` into Oracle \`GOODS_RECEIPT\` and \`db:stored-procedure\` to update PO lines.
3. \`jms:publish\` of \`receipt.posted\` to a topic, used by AP (3-way match), replenishment and the supplier portal.

Problems seen:
- A crash between steps 2 and 3 left receipts in Oracle **without** the event — AP could not match invoices.
- Another time, Oracle failed after the message had already been acknowledged on receipt, and the receipt was **lost**.
- Volume: 300 receipts/minute at peak; Mule runs on 2 on-prem nodes; the DBA dislikes long-held locks.

The team debates: **XA transaction** (Bitronix) spanning the JMS listener, Oracle and the publish, or a **transactional outbox**.

**Questions:**
- What exactly goes wrong today, and why does IMMEDIATE ack make it worse?
- Describe both XA and outbox designs for this flow, with their costs.
- Which would you choose here, and what must consumers do in either case?
`,
  answerTemplate: `## What goes wrong today

## Option 1: XA

## Option 2: Outbox

## Recommendation and consumer requirements
`,
  keyPoints: [
    'The flow is a dual write (Oracle + broker) with no atomicity; IMMEDIATE ack acknowledges on receipt, before processing succeeds, so a failure loses the message (AUTO acks only after the flow completes successfully).',
    'XA (Bitronix transaction manager, listener starting an XA transaction, database operations joining it) makes receive, insert and publish atomic, at the cost of throughput, XA drivers and recovery handling.',
    'Outbox: one local Oracle transaction writes the receipt and an OUTBOX row; a relay publishes later — simpler and faster, but at-least-once.',
    'Inbound idempotency (unique key on ASN/receipt line) plus ack-after-commit covers the consuming side without XA.',
    'Whatever you choose, downstream consumers must be idempotent because brokers deliver at least once.',
  ],
  solution: `
**What goes wrong.** Two independent writes (Oracle and ActiveMQ) without a shared transaction: a crash between them leaves one done and the other not. With IMMEDIATE ack the inbound message is acknowledged as soon as it is consumed, so when processing fails it is never redelivered. (AUTO would ack only if the flow completes successfully — but an on-error-continue handler also counts as success.)

**Option 1 — XA.**
- Configure the Bitronix transaction manager; the \`jms:listener\` begins an **XA** transaction (\`transactionalAction\` ALWAYS_BEGIN, \`transactionType\` XA); \`db:insert\`, the stored procedure and \`jms:publish\` **join** it.
- Use an Oracle XA data source and an XA-enabled ActiveMQ connection factory.
- Result: all three commit together or roll back (the message is redelivered).
- Costs: 2PC latency and longer lock holds, a recovery log on durable storage per node, in-doubt transactions after crashes, and XA cannot include HTTP calls.

**Option 2 — Outbox.**
\`\`\`
 wms.receipts ─► prc-goods-receipt ─► [Oracle local tx: GOODS_RECEIPT + PO update + OUTBOX row] ─► ack
 outbox-relay (scheduler / db:listener on OUTBOX) ─► jms:publish receipt.posted ─► mark sent
\`\`\`
- Inbound: MANUAL ack (or a local JMS transaction) after the Oracle commit; a unique constraint on ASN + line makes redeliveries harmless.
- Outbound: the relay publishes in order and marks rows; a crash may publish twice.

**Recommendation.** At 300/minute both work; the **outbox** is simpler to operate on two nodes, avoids XA recovery, keeps lock times short and is independent of broker XA support. Choose XA when the team already runs it well and strict atomicity without a relay delay is required.

**Consumers.** AP, replenishment and the portal deduplicate on \`receiptId\`/event id — in both options, because delivery is at least once.
`,
  followUps: [
    { q: 'Can you just put jms:publish inside a try scope after the insert and retry it?', a: 'Retries do not help if the app crashes between the commit and the publish — the event is lost. You need either atomicity (XA) or a durable record of the intent (outbox).' },
    { q: 'How do you keep outbox events in order per PO?', a: 'Read outbox rows ordered by a sequence column, process them with a single relay instance or per-PO grouping, and publish with a message group id of the PO number.' },
    { q: 'How do you stop the OUTBOX table growing forever?', a: 'Mark rows as sent and purge them after a retention window with a scheduled job, or partition the table by date and drop old partitions.' },
  ],
}
