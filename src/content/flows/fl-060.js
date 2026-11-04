import { design, flow, handler, scope, source, step } from '../../flow/dsl.js'

export default {
  id: 'fl-060',
  category: 'flows',
  title: 'POS Baskets from an ActiveMQ Virtual Topic into Oracle with Manual Ack',
  level: 'INTERMEDIATE',
  tags: ['retail', 'pos', 'activemq', 'jms', 'manual-ack', 'oracle', 'idempotency'],
  estMinutes: 30,
  flowChecks: [
    {
      label: 'Baskets are consumed from the integration queue of the POS virtual topic',
      rule: { type: 'source', component: 'jms-listener', where: { destination: 'POS.SALES' } },
    },
    {
      label: 'The listener uses MANUAL acknowledgement (ack only after Oracle committed)',
      rule: { type: 'source', component: 'jms-listener', where: { ackMode: 'MANUAL' } },
    },
    {
      label: 'The basket JSON is split into header and line rows with DataWeave',
      rule: { type: 'before', first: 'transform', then: ['db-insert', 'db-bulk-insert'] },
    },
    { label: 'Header is inserted, then all lines with one Bulk Insert', rule: { type: 'before', first: 'db-insert', then: 'db-bulk-insert' } },
    {
      label: 'Header and lines commit together (Try, ALWAYS_BEGIN)',
      rule: { type: 'inside', component: 'db-bulk-insert', within: 'try' },
    },
    {
      label: 'A redelivered basket (ORA-00001 on the natural key) is treated as already loaded',
      rule: { type: 'exists', component: 'on-error-continue', where: { type: 'DB:QUERY_EXECUTION' } },
    },
    {
      label: 'Other failures propagate, leaving the message unacknowledged for redelivery',
      rule: { type: 'handler', component: 'on-error-propagate' },
    },
  ],
  referenceFlow: design(
    flow(
      'pos-basket-to-staging',
      // ActiveMQ Classic virtual topic: POS publishes to VirtualTopic.POS.SALES, this app reads its own queue.
      // MANUAL ack: the flow calls jms:ack (ackId = attributes.ackId) after the commit; on failure jms:recover-session.
      source('jms-listener', { destination: 'Consumer.STAGING.VirtualTopic.POS.SALES', ackMode: 'MANUAL', transactionalAction: 'NONE' }),
      [
        step('set-variable', { variableName: 'ackId', value: '#[attributes.ackId]' }),
        step('transform', {
          target: 'variable',
          variableName: 'basket',
          script:
            '%dw 2.0\noutput application/java\nvar key = {\n  storeId: payload.storeId,\n  registerId: payload.registerId,\n  txnNo: payload.transactionNumber,\n  businessDate: payload.businessDate as Date\n}\n---\n{\n  header: key ++ {\n    endedAt: payload.endDateTime as DateTime,\n    cashierId: payload.cashier.id,\n    totalAmount: payload.total as Number,\n    tenderType: payload.tenders[0].\"type\",\n    loyaltyId: payload.loyalty.cardNumber default null\n  },\n  lines: payload.lines map (l, i) -> key ++ {\n    lineNo: i + 1,\n    sku: l.sku,\n    qty: l.quantity as Number,\n    unitPrice: l.unitPrice as Number,\n    discount: (l.discount default 0) as Number\n  }\n}',
        }),
        scope('try', { transactionalAction: 'ALWAYS_BEGIN' }, [
          // PK (STORE_ID, REGISTER_ID, TXN_NO, BUSINESS_DATE) makes a redelivered basket fail with ORA-00001.
          step('db-insert', {
            sql: 'INSERT INTO POS_SALE_HDR (STORE_ID, REGISTER_ID, TXN_NO, BUSINESS_DATE, ENDED_AT, CASHIER_ID, TOTAL_AMOUNT, TENDER_TYPE, LOYALTY_ID)\nVALUES (:storeId, :registerId, :txnNo, :businessDate, :endedAt, :cashierId, :totalAmount, :tenderType, :loyaltyId)',
          }),
          // Bulk Insert reads its rows from #[payload] by default.
          step('set-payload', { value: '#[vars.basket.lines]' }),
          step('db-bulk-insert', {
            sql: 'INSERT INTO POS_SALE_LINE (STORE_ID, REGISTER_ID, TXN_NO, BUSINESS_DATE, LINE_NO, SKU, QTY, UNIT_PRICE, DISCOUNT)\nVALUES (:storeId, :registerId, :txnNo, :businessDate, :lineNo, :sku, :qty, :unitPrice, :discount)',
          }),
        ]),
        step('jms-ack', { ackId: '#[vars.ackId]' }),
        step('logger', { level: 'DEBUG', message: '#["Staged basket " ++ vars.basket.header.storeId ++ "/" ++ vars.basket.header.txnNo]' }),
      ],
      [
        // Duplicate = already staged: continue and acknowledge.
        handler('on-error-continue', { type: 'DB:QUERY_EXECUTION', when: '#[error.description contains "ORA-00001"]' }, [
          step('logger', { level: 'WARN', message: '#["Duplicate basket ignored: " ++ vars.basket.header.storeId ++ "/" ++ vars.basket.header.txnNo]' }),
          step('jms-ack', { ackId: '#[vars.ackId]' }),
        ]),
        // No ack: recover the session so the message is redelivered (redelivery policy → DLQ after N tries).
        handler('on-error-propagate', { type: 'ANY' }, [
          step('logger', { level: 'ERROR', message: '#["Basket not staged, will be redelivered: " ++ error.description]' }),
          step('jms-recover-session', { ackId: '#[vars.ackId]' }),
        ]),
      ],
    ),
  ),
  description: `
A DIY retailer with **1,100 stores** streams every completed POS basket as JSON to **ActiveMQ Classic**. The POS gateway publishes to the **virtual topic** \`VirtualTopic.POS.SALES\`; loyalty and fraud already consume it through their own queues.

Your integration must load every basket into **Oracle** staging tables (\`POS_SALE_HDR\`, \`POS_SALE_LINE\`) that the nightly ERP sales-audit job reads.

- Volume: ~4 million baskets/day, **peaks of 300/s** on Saturday afternoons; average 6 lines, maximum ~400.
- Natural key: store + register + transaction number + business date.
- **No basket may be lost** (sales audit and tax), and **none may be loaded twice**.
- Oracle has a 10-minute maintenance window each night; the queue must simply back up during it.

**Design the flow(s):** which destination you read, acknowledgement mode, how header and lines are written, duplicates, and failure behaviour.
`,
  answerTemplate: `## Destination (virtual topic consumer queue)

## Acknowledgement mode

## Mapping and Oracle writes

## Duplicates

## Failures, redelivery and the Oracle maintenance window
`,
  keyPoints: [
    'With an ActiveMQ virtual topic each consumer group reads its own queue (Consumer.<name>.VirtualTopic.POS.SALES), getting queue semantics, load balancing and its own DLQ.',
    'MANUAL ack: the message is acknowledged with jms:ack (attributes.ackId) only after the Oracle commit; AUTO would also ack on success, but MANUAL makes the ack point explicit.',
    'DataWeave splits the basket into one header map and a list of line maps whose keys match the SQL parameters.',
    'Header Insert + lines Bulk Insert inside a Try with ALWAYS_BEGIN so a basket is never half-staged.',
    'Primary key on the natural key: a redelivered basket fails with ORA-00001, handled with On Error Continue (and ack) as already loaded.',
    'Other errors: no ack, recover the session so the message is redelivered; the ActiveMQ redelivery policy moves poison messages to a DLQ after N attempts. With the Mule connector, set maxRedelivery on the ActiveMQ factory: its default is 0, no redelivery.',
  ],
  solution: `
**Destination.** Do not subscribe to the topic directly (a non-durable subscriber loses messages while the app is down). Read the virtual-topic queue \`Consumer.STAGING.VirtualTopic.POS.SALES\`: every message published to the topic is copied there, and several Mule replicas can consume it competitively.

**Flow**
1. **JMS On New Message** on that queue, **ackMode MANUAL**, no transaction. The POS gateway is not a Mule app, so set **Inbound Content-Type** \`application/json\`: the config default for a message that does not state its type is \`*/*\`, and DataWeave selectors need JSON. Concurrency (number of consumers) sized for 300/s, e.g. 8–16, bounded by the Oracle pool size.
2. **Set Variable** \`ackId = attributes.ackId\`.
3. **Transform Message** → \`vars.basket\` = \`{ header, lines[] }\`, each carrying the natural key.
4. **Try (ALWAYS_BEGIN)** — **Database Insert** header, **Database Bulk Insert** lines. Commit at the end of the Try.
5. **JMS Ack** with \`#[vars.ackId]\`.

**Errors**
- \`DB:QUERY_EXECUTION\` with ORA-00001 → **On Error Continue**, log, **ack** — the basket is already there.
- Anything else (\`DB:CONNECTIVITY\` during the maintenance window, mapping bugs) → **On Error Propagate** after **JMS Recover Session**: unacknowledged messages are redelivered. Configure the redelivery policy (e.g. 6 attempts, exponential back-off; in Mule, \`maxRedelivery\` on the ActiveMQ factory, default 0 = no redelivery) so a poison basket ends in the DLQ (\`ActiveMQ.DLQ\` by default, or a per-queue DLQ via individualDeadLetterStrategy) instead of looping.
- During the Oracle window, a reconnection strategy on the DB config plus back-off avoids burning the redelivery count; messages just wait on the queue.

**Why not AUTO?** AUTO also acks after a successful flow, but MANUAL lets you ack exactly after the commit and also on the duplicate path, and makes the guarantee visible to reviewers.
`,
  followUps: [
    {
      q: 'What happens to unacknowledged messages if the Mule worker crashes mid-flow?',
      a: 'The broker sees the consumer connection drop and makes the unacknowledged messages available again, so another replica processes them. The primary key then absorbs any basket that was committed but not acked.',
    },
    {
      q: 'Why does a poison message matter more with MANUAL ack than you might expect?',
      a: 'If you never ack and never recover, the message stays in flight for that session and can block prefetch; if you recover forever without a redelivery limit, it loops. A broker redelivery policy with a DLQ bounds it.',
    },
    {
      q: 'How would you check that nothing was lost end to end?',
      a: 'Have the POS send an end-of-day count and total per store/register, and reconcile it against POS_SALE_HDR before the sales-audit job runs.',
    },
  ],
}
