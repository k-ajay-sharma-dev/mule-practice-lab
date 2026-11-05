export default {
  id: 'inc-061',
  category: 'incidents',
  title: 'Stock Movements Booked Twice After the WMS API Slows Down',
  level: 'INTERMEDIATE',
  tags: ['supply-chain', 'activemq', 'jms', 'oracle', 'idempotency', 'inventory'],
  estMinutes: 30,
  investigation: {
    logs: [
      { text: '15:40:01.220 INFO  [stock] Received transfer TR-55120 JMSXDeliveryCount=1 msgId=ID:erp-7731-1', relevant: false },
      { text: '15:40:01.410 INFO  [stock] INSERT INTO STOCK_MOVEMENT (movement_id=STKMV_SEQ.NEXTVAL, ref=TR-55120, qty=-48) rows=1', relevant: true, why: 'The insert commits immediately (auto-commit) with a new sequence ID, before the WMS call.' },
      { text: '15:40:11.415 ERROR [stock] HTTP:TIMEOUT POST wms-sapi /transfers (10000 ms) ref=TR-55120', relevant: true, why: 'The WMS call fails after the insert, so the flow fails and the message will be redelivered.' },
      { text: '15:40:11.420 ERROR [stock] On Error Propagate, message will be redelivered ref=TR-55120', relevant: false },
      { text: '15:40:12.501 INFO  [stock] Received transfer TR-55120 JMSXDeliveryCount=2 msgId=ID:erp-7731-1', relevant: true, why: 'Same message again: redelivery is expected and correct.' },
      { text: '15:40:12.690 INFO  [stock] INSERT INTO STOCK_MOVEMENT (movement_id=STKMV_SEQ.NEXTVAL, ref=TR-55120, qty=-48) rows=1', relevant: true, why: 'A second row for the same transfer: the insert is not idempotent because nothing unique ties it to the message.' },
      { text: '15:41:00.000 INFO  [health] GET /health 200 (2 ms)', relevant: false },
      { text: '15:41:30.000 INFO  [metrics] wms-sapi p95=9.8s (normal 300 ms)', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Why are stock movements duplicated?',
        options: [
          'The movement row is committed before the WMS call; when the call times out the message is redelivered and the non-idempotent insert runs again with a new sequence ID',
          'ActiveMQ delivered the message to two consumers at once',
          'The ERP published every transfer twice',
          'The sequence returned the same value twice',
        ],
        answer: 0,
        explain: 'Same msgId with JMSXDeliveryCount=2 proves it is a redelivery. Redelivery is correct; the problem is that the insert has no business key that prevents a second row.',
      },
      {
        type: 'single',
        prompt: 'What do you do **right now**?',
        options: [
          'Switch the error handler to On Error Continue so nothing is redelivered',
          'Find duplicates by ref and correct them with a reviewed script, and add a unique constraint on the source reference once clean',
          'Restart the WMS',
          'Turn off redelivery on the broker',
        ],
        answer: 1,
        explain: 'Repair the stock figures and stop new duplicates. Without redelivery, a transfer that fails on the WMS call would no longer be retried.',
      },
      {
        type: 'multi',
        prompt: 'Which designs make the consumer **idempotent**?',
        options: [
          'A unique constraint on the business key (source ref + line), with MERGE or "insert, and treat ORA-00001 as already processed"',
          'Record processed message/business IDs and skip ones already seen',
          'Do the DB write and the WMS call in a way that the retry only repeats the failed step (e.g. a status column per movement)',
          'Use a bigger HTTP timeout so the WMS never times out',
        ],
        answer: [0, 1, 2],
        explain: 'At-least-once delivery means duplicates will happen; the database must reject or absorb them. A bigger timeout only makes duplicates rarer.',
      },
    ],
  },
  description: `
## Symptoms
- Store-to-store transfers from the ERP arrive on ActiveMQ queue \`ERP.STOCK.TRANSFER\`. Mule inserts a row into Oracle \`STOCK_MOVEMENT\` and then calls \`wms-sapi\` to create the transfer in the WMS.
- Since 15:30 several stores show **negative** or doubled stock movements. Store managers complain that stock counts are wrong.
- \`wms-sapi\` has been slow since 15:30 (p95 ~10 s).

## Change / Context
- Flow: JMS listener (\`ackMode="AUTO"\`) → \`db:insert\` (auto-commit, \`movement_id\` from \`STKMV_SEQ.NEXTVAL\`) → HTTP POST to \`wms-sapi\` (timeout 10 s) → end.
- Error handler: On Error Propagate.
- The ActiveMQ factory configuration sets \`maxRedelivery="5"\`.
- \`STOCK_MOVEMENT\` has a primary key on \`movement_id\` only.

## Logs
\`\`\`
15:40:01.410 INFO  [stock] INSERT INTO STOCK_MOVEMENT (... ref=TR-55120, qty=-48) rows=1
15:40:11.415 ERROR [stock] HTTP:TIMEOUT POST wms-sapi /transfers (10000 ms) ref=TR-55120
15:40:12.501 INFO  [stock] Received transfer TR-55120 JMSXDeliveryCount=2 msgId=ID:erp-7731-1
15:40:12.690 INFO  [stock] INSERT INTO STOCK_MOVEMENT (... ref=TR-55120, qty=-48) rows=1
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
    'Same msgId with JMSXDeliveryCount=2: a legitimate redelivery after the WMS call timed out.',
    'The Oracle insert auto-commits before the WMS call, and with a sequence-generated key nothing stops a second row on redelivery.',
    'Immediate: find duplicate movements by ref, correct with a reviewed script, inform store operations; then add a unique constraint on the business key.',
    'Fix: idempotent consumer (unique business key + MERGE / treat ORA-00001 as done, or processed-ID store), and step status so retries only redo the failed step.',
    'Prevention: design every JMS consumer for at-least-once delivery; test with forced redeliveries.',
  ],
  solution: `
**Diagnosis.** The insert is auto-committed, then the WMS call times out. On Error Propagate makes the listener recover, and the broker **redelivers** the message (\`JMSXDeliveryCount=2\`, same msgId). The flow starts again from the top and inserts a **second** movement with a new \`STKMV_SEQ\` value. Nothing in the table identifies the business event, so Oracle happily accepts the duplicate. The slow WMS since 15:30 turned a rare case into hundreds of duplicates.

**Immediate mitigation.** Query \`STOCK_MOVEMENT\` for refs with more than one row per line since 15:30, review with the inventory team, and remove or reverse the duplicates in one controlled script. Check which transfers actually reached the WMS. Tell store managers which counts were affected and when they are correct again.

**Root cause.** A non-idempotent consumer on an at-least-once channel: a side effect committed before a later step that can fail and trigger redelivery.

**Permanent fix.**
- Add a **unique constraint** on the business key (\`source_ref, line_no\`) and use \`MERGE\` or an insert that treats **ORA-00001** as "already booked".
- Track a status per movement (\`BOOKED\`, \`SENT_TO_WMS\`) so a redelivery skips the DB step and only retries the WMS call.
- Alternatively use a local transaction around the DB step and an outbox for the WMS call. Make the WMS call idempotent too (send the transfer ref as an idempotency key).

**Prevention.** Team standard: every JMS consumer must be idempotent; tests that force a failure after each step and check the end state; a daily reconciliation of ERP transfers vs Oracle movements.
`,
  followUps: [
    { q: 'Would an XA transaction across JMS and Oracle solve it?', a: 'It would roll back the insert when the flow fails, but the HTTP call to the WMS cannot join the transaction, so you still need idempotency for the WMS side; XA also adds latency and recovery complexity.' },
    { q: 'Why not use the Idempotent Message Validator on the JMS message ID?', a: 'It helps against broker-level duplicates, but if the first attempt failed you still need to process the retry. The docs do not say whether the ID is removed when a later step fails, so test that a redelivery is not rejected with MULE:DUPLICATE_MESSAGE. A DB unique key is a stronger guarantee.' },
    { q: 'How do you choose the idempotency key?', a: 'Use a business identifier from the source event (transfer ref + line), not a generated sequence or a timestamp, so every retry or replay maps to the same key.' },
  ],
}
