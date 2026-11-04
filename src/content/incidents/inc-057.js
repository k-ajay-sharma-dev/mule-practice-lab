export default {
  id: 'inc-057',
  category: 'incidents',
  title: 'Goods Receipts Vanish: Queue Empty, DLQ Empty, Oracle Missing Rows',
  level: 'BEGINNER',
  tags: ['supply-chain', 'activemq', 'jms', 'oracle', 'error-handling', 'goods-receipt'],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: '11:15:02.110 INFO  [gr] Received goods receipt GR-778120 PO=4500018840 lines=12', relevant: false },
      { text: '11:15:02.390 INFO  [gr] Inserted GR-778120 into GR_HEADER/GR_LINES', relevant: false },
      { text: '11:15:04.006 INFO  [gr] Received goods receipt GR-778121 PO=4500018841 lines=3', relevant: false },
      { text: '11:15:04.210 WARN  [gr] On Error Continue: DB:QUERY_EXECUTION ORA-01400: cannot insert NULL into ("SCM"."GR_LINES"."LOT_NO") GR=GR-778121', relevant: true, why: 'The insert fails but the error handler is On Error Continue, so the flow ends "successfully" and the message is acknowledged.' },
      { text: '11:15:04.211 INFO  [gr] Flow completed, message acknowledged msgId=ID:wms-02-9931-4', relevant: true, why: 'With AUTO ack, a flow that completes (even through On Error Continue) acknowledges the message: it is gone for good.' },
      { text: '11:15:30.000 INFO  [amq-console] WMS.GR.OUT pending=0 ActiveMQ.DLQ pending=0', relevant: true, why: 'Nothing is retried and nothing is parked, which is why nobody noticed.' },
      { text: '11:16:00.000 INFO  [health] GET /health 200 (2 ms)', relevant: false },
      { text: '11:16:12.800 INFO  [deploy] Release notes v2.1.0: lot number is now mandatory in GR_LINES (cold chain traceability)', relevant: true, why: 'The schema change explains why receipts without a lot number started to fail.' },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Why are receipts missing without any visible failure?',
        options: [
          'Inserts fail on the new NOT NULL lot column, and On Error Continue swallows the error so the JMS message is acknowledged and lost',
          'The WMS never published the receipts',
          'The broker expired the messages',
          'The receipts are still in the DLQ',
        ],
        answer: 0,
        explain: 'On Error Continue makes the flow end successfully, and AUTO ack then acknowledges the message. The queue and DLQ are both empty because the message was consumed.',
      },
      {
        type: 'single',
        prompt: 'What do you do **first** to recover the lost receipts?',
        options: [
          'Wait for the WMS to retry automatically',
          'List the failed GR numbers from the WARN logs and ask the WMS team to republish them (or load them manually) once lot numbers are available',
          'Restart the app so it reprocesses the queue',
          'Drop the NOT NULL constraint',
        ],
        answer: 1,
        explain: 'Acknowledged messages are gone from the broker, so the logs are your list of what to replay. Dropping the constraint defeats the traceability requirement.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the **permanent fix**?',
        options: [
          'Use On Error Propagate (redelivery to the DLQ) or publish failed messages to an error queue before continuing',
          'Log failures at ERROR level with the business key and alert on them',
          'Validate that every line has a lot number before the insert and route invalid receipts to an exception queue',
          'Change the log level to DEBUG so errors are hidden from the console',
        ],
        answer: [0, 1, 2],
        explain: 'Never drop a message silently: either let it be redelivered and parked, or store it somewhere you can replay from, and alert.',
      },
    ],
  },
  description: `
## Symptoms
- The WMS publishes goods receipts to ActiveMQ queue \`WMS.GR.OUT\`. Mule inserts them into Oracle (\`GR_HEADER\`, \`GR_LINES\`) for invoice matching.
- Accounts payable reports that about **15%** of receipts since yesterday are missing in Oracle, so supplier invoices fail 3-way match.
- The queue is empty, \`ActiveMQ.DLQ\` is empty, and the operations dashboard shows **no errors**.

## Change / Context
- Yesterday the DBA released v2.1.0 of the schema: \`GR_LINES.LOT_NO\` is now **NOT NULL** for cold chain traceability. Some suppliers' products are not lot-controlled in the WMS yet.
- The Mule flow uses \`ackMode="AUTO"\` and its error handler is an **On Error Continue** that logs at WARN, added long ago "so one bad message does not block the queue".

## Logs
\`\`\`
11:15:04.006 INFO  [gr] Received goods receipt GR-778121 PO=4500018841 lines=3
11:15:04.210 WARN  [gr] On Error Continue: DB:QUERY_EXECUTION ORA-01400: cannot insert NULL
  into ("SCM"."GR_LINES"."LOT_NO") GR=GR-778121
11:15:04.211 INFO  [gr] Flow completed, message acknowledged msgId=ID:wms-02-9931-4
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
    'Inserts fail with ORA-01400 on the new NOT NULL LOT_NO column for non-lot-controlled items.',
    'On Error Continue completes the flow successfully, so the AUTO-ack listener acknowledges the message; it is lost, not retried, not in the DLQ.',
    'WARN-level logging with no alert explains why monitoring showed nothing.',
    'Immediate: build the list of failed GRs from the logs, agree how to supply lot numbers (or a default for non-lot items), and have the WMS republish.',
    'Fix: On Error Propagate or an explicit error queue, validation before insert, ERROR logs with business keys and alerts; coordinate schema changes with integrations.',
  ],
  solution: `
**Diagnosis.** Since the schema change, receipts for items without a lot number fail with **ORA-01400** (raised as **DB:QUERY_EXECUTION**). The flow's **On Error Continue** handles the error, the flow is considered successful, and with \`ackMode="AUTO"\` the listener **acknowledges** the message. The receipt is removed from the broker and never retried, so the queue and the DLQ are both empty.

**Immediate mitigation.** Search the logs for the WARN lines to list every failed GR number. Agree with the business how to fill \`LOT_NO\` for non-lot-controlled items (for example a documented placeholder, or make the column conditional). Ask the WMS team to republish those receipts, or load them through a controlled script, and tell AP which invoices can be re-matched.

**Root cause.** An error handler that swallows every error type, combined with a database change made without checking the integrations that write to the table.

**Permanent fix.**
- Use **On Error Propagate** for unexpected errors so the message is redelivered and, after a finite \`maxRedelivery\` limit on the ActiveMQ factory configuration, parked in the DLQ; or, if you continue, first **publish the original message and error to an exception queue**.
- Validate required fields before the insert and route invalid receipts to an exception queue with a clear reason.
- Log failures at **ERROR** with the GR number and alert on them.

**Prevention.** A rule that On Error Continue is only allowed for specific, expected error types and never without storing the message; schema changes reviewed against the integration catalogue; a daily reconciliation (WMS receipts vs Oracle GR count).
`,
  followUps: [
    { q: 'When is On Error Continue the right choice in a JMS consumer?', a: 'When you have deliberately handled the message, for example published it to an error queue or stored it, and retrying cannot help. Then acknowledging is correct because the message is safe elsewhere.' },
    { q: 'How would MANUAL ack change this?', a: 'With MANUAL ack the message is only acknowledged when the flow calls jms:ack, and an unacknowledged message is not redelivered by itself: a failure path must call jms:recover-session on the same connection. It gives control, but you must make sure every path either acks or recovers.' },
    { q: 'What reconciliation would have caught this within a day?', a: 'Comparing the count (and IDs) of receipts sent by the WMS per day with the rows in GR_HEADER; any difference raises an alert.' },
  ],
}
