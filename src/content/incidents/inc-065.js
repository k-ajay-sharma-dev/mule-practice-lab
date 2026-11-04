export default {
  id: 'inc-065',
  category: 'incidents',
  title: 'In-Doubt XA Transactions Lock Inventory Rows After a Server Crash',
  level: 'EXPERT',
  tags: ['supply-chain', 'activemq', 'jms', 'oracle', 'xa', 'transactions', 'on-prem'],
  estMinutes: 45,
  investigation: {
    logs: [
      { text: '13:41:57.002 INFO  [reserve] XA tx started: consume RESERVATION.REQ, update INV_RESERVATION, publish RESERVATION.CONFIRMED', relevant: false },
      { text: '13:41:57.880 INFO  [kernel] Out of memory: Killed process 2211 (java) mule-node-2', relevant: true, why: 'The runtime was killed abruptly, possibly between the prepare and commit phases of running XA transactions.' },
      { text: '13:44:10.300 INFO  [ops] restart script: clean working directory ./.mule/* before start', relevant: true, why: 'The restart script deleted the working directory, including the transaction manager\'s recovery journal, so it cannot finish the prepared transactions.' },
      { text: '13:45:02.115 WARN  [txm] Transaction recovery: no transaction log found, 0 in-flight transactions to recover', relevant: true, why: 'The transaction manager has forgotten the transactions that Oracle and ActiveMQ still hold as prepared.' },
      { text: '13:52:30.442 ERROR [reserve] DB:QUERY_EXECUTION ORA-01591: lock held by in-doubt distributed transaction 7.21.40912 sku=88120 store=0412', relevant: true, why: 'Rows touched by the crashed transactions stay locked until each in-doubt transaction is committed or rolled back.' },
      { text: '13:52:31.000 INFO  [health] GET /health 200 (3 ms)', relevant: false },
      { text: '13:55:00.000 INFO  [dba] SELECT local_tran_id, state FROM dba_2pc_pending -> 14 rows, state=prepared', relevant: true, why: 'Oracle confirms 14 prepared (in-doubt) branches waiting for a decision.' },
      { text: '13:55:10.400 INFO  [reserve] reservation R-551020 confirmed sku=10044 store=0110', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Why are some reservation updates failing with ORA-01591?',
        options: [
          'Transactions were prepared when the runtime was killed, and the recovery journal was deleted, so Oracle holds their locks as in-doubt and nobody tells it to commit or roll back',
          'Two Mule nodes are deadlocking on the same rows',
          'The ActiveMQ broker lost the reservation messages',
          'The DB user has lost its update privilege',
        ],
        answer: 0,
        explain: 'ORA-01591 and dba_2pc_pending in state "prepared" are in-doubt XA branches. Normally the transaction manager resolves them from its log after restart; that log was wiped.',
      },
      {
        type: 'single',
        prompt: 'How should the in-doubt transactions be resolved?',
        options: [
          'Restart Oracle; it will roll everything back',
          'For each in-doubt transaction, find out whether the other side (ActiveMQ) committed, then have the DBA COMMIT FORCE or ROLLBACK FORCE it accordingly and record the decision',
          'Delete the locked rows',
          'Wait; Oracle releases them after 24 hours',
        ],
        answer: 1,
        explain: 'A prepared branch stays in doubt across restarts. A heuristic decision must be made per transaction, consistent with the JMS side, and documented so you can reconcile afterwards.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the **permanent fix and prevention**?',
        options: [
          'Keep the transaction manager\'s journal on persistent storage and never delete it in start-up scripts',
          'Grant the integration DB user the privileges Oracle needs for XA recovery (e.g. on DBA_PENDING_TRANSACTIONS) and test recovery',
          'Alert on rows in dba_2pc_pending and on ORA-01591',
          'Re-evaluate whether XA is needed; an idempotent consumer with local transactions and an outbox is often simpler',
          'Raise the JVM heap without understanding the memory growth',
        ],
        answer: [0, 1, 2, 3],
        explain: 'XA only works if recovery works: durable logs, recovery privileges, monitoring and rehearsal. Often the better answer is to avoid distributed transactions altogether.',
      },
      {
        type: 'order',
        prompt: 'Put the recovery in order.',
        items: [
          'Stop new reservation traffic for the affected SKUs or route it to a holding queue',
          'List in-doubt transactions in Oracle and prepared transactions on the broker',
          'Decide commit or rollback per transaction from the business evidence',
          'Have the DBA COMMIT FORCE or ROLLBACK FORCE and purge the entries; resolve the broker side to match',
          'Reconcile reservations against orders and confirm locks are gone',
          'Fix the restart script and test a crash-recovery scenario',
        ],
        explain: 'Contain, inventory both sides, decide consistently, apply, reconcile, then remove the cause.',
      },
    ],
  },
  description: `
## Symptoms
- Store reservation requests for click-and-collect arrive on ActiveMQ queue \`RESERVATION.REQ\`. An on-prem Mule 4 cluster updates \`INV_RESERVATION\` in Oracle and publishes \`RESERVATION.CONFIRMED\` in **one XA transaction**.
- At 13:41 \`mule-node-2\` was killed by the OS OOM killer. Ops restarted it at 13:44.
- Since then, reservations for **about 40 SKU/store combinations** fail with ORA-01591. Everything else works. Customers are told items are unavailable although stock is on the shelf.

## Change / Context
- The JMS listener uses \`transactionalAction="ALWAYS_BEGIN"\` with transactionType XA; the Database and JMS configs are XA-enabled (Bitronix transaction manager).
- The ops restart script, written for a different app, wipes the runtime working directory "to start clean".

## Logs
\`\`\`
13:41:57.880 INFO  [kernel] Out of memory: Killed process 2211 (java) mule-node-2
13:44:10.300 INFO  [ops] restart script: clean working directory ./.mule/* before start
13:45:02.115 WARN  [txm] Transaction recovery: no transaction log found, 0 in-flight transactions to recover
13:52:30.442 ERROR [reserve] DB:QUERY_EXECUTION ORA-01591: lock held by in-doubt distributed
  transaction 7.21.40912 sku=88120 store=0412
13:55:00.000 INFO  [dba] SELECT local_tran_id, state FROM dba_2pc_pending -> 14 rows, state=prepared
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
    'Two-phase commit: the runtime was killed after some branches were prepared; prepared branches keep their locks until the coordinator decides.',
    'The restart script deleted the transaction manager journal, so recovery found nothing and the 14 Oracle branches stay in doubt (dba_2pc_pending, ORA-01591).',
    'ActiveMQ may also hold matching prepared transactions (messages neither delivered nor removed).',
    'Immediate: contain traffic, inventory both sides, decide commit/rollback per transaction, DBA uses COMMIT FORCE / ROLLBACK FORCE, reconcile reservations.',
    'Fix: durable journal storage, XA recovery privileges for the DB user, alerts on in-doubt transactions, crash-recovery tests, and consider replacing XA with idempotent local transactions.',
  ],
  solution: `
**Diagnosis.** XA uses two-phase commit: the transaction manager asks Oracle and ActiveMQ to **prepare**, writes its decision to its journal, then tells both to **commit**. The OOM kill hit while some transactions were prepared but not committed. A prepared branch keeps its row locks and cannot decide by itself, so it is **in doubt**. Normally the transaction manager reads its journal at start-up and finishes them. Here the restart script **deleted the journal**, recovery found nothing, and 14 branches stay \`prepared\` in \`dba_2pc_pending\`. Any update on those rows fails with **ORA-01591: lock held by in-doubt distributed transaction**. The broker may hold the matching prepared JMS branches, so those reservation messages are neither redelivered nor removed.

**Immediate mitigation.**
1. Contain: pause the listener or route requests for the affected SKUs to a holding queue, and tell store operations.
2. Inventory: list in-doubt transactions in Oracle (\`dba_2pc_pending\`) and prepared transactions on the broker (JMX).
3. Decide per transaction, from business evidence (was \`RESERVATION.CONFIRMED\` delivered? does the customer have a confirmation?), whether it should commit or roll back.
4. The DBA runs \`COMMIT FORCE '<local_tran_id>'\` or \`ROLLBACK FORCE '<local_tran_id>'\` and cleans up the entries; resolve the broker side the same way.
5. Reconcile reservations against orders and confirm ORA-01591 stops.

**Root cause.** XA was used without operating its recovery: the journal lived in a directory that a generic script deletes, and nobody tested a crash during commit. The memory problem that triggered the kill also needs its own investigation.

**Permanent fix.**
- Keep the transaction journal on persistent storage and remove the "clean working directory" step for Mule nodes.
- Grant the integration user the privileges Oracle requires for XA recovery (for example SELECT on \`DBA_PENDING_TRANSACTIONS\`; check the Oracle documentation for your version) and test that recovery works.
- Investigate the OOM (heap dump, workload).
- Ask whether XA is needed: an **idempotent consumer** with a local DB transaction, plus an **outbox** for the confirmation, gives the same business guarantee with much simpler failure modes.

**Prevention.** Alerts on rows in \`dba_2pc_pending\` and on ORA-01591; a crash-recovery game day; a runbook for heuristic decisions.
`,
  followUps: [
    { q: 'What is a heuristic decision in XA?', a: 'A resource manager (or a DBA) commits or rolls back a prepared branch without the coordinator\'s decision. It unblocks resources but can leave the participants inconsistent, so it must be recorded and reconciled.' },
    { q: 'Why does a prepared branch keep its locks after a database restart?', a: 'Prepare is a promise that the branch can still commit, so the database must keep its changes and locks durable until it gets the outcome, even across restarts.' },
    { q: 'What would you do instead of XA here?', a: 'Consume with a local DB transaction, make the reservation update idempotent on the request ID, write the confirmation to an outbox table in the same transaction, and publish it separately; redeliveries are then harmless.' },
  ],
}
