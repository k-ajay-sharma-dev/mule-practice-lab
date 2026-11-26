export default {
  id: 'ms-304',
  category: 'mulesoft',
  title: 'Duplicate Message Checks and MERGE in Oracle: Stopping Replays and Unique Key Clashes',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'oracle', 'merge', 'idempotency', 'duplicates', 'ora-00001'],
  estMinutes: 20,
  quiz: [
    {
      type: 'single',
      prompt: 'A Mule subscriber takes an order message from Anypoint MQ, loads it into Oracle, commits, and then acks. The worker crashes after the commit and before the ack. What happens next?',
      options: [
        'The broker sees no ack, but drops the message once its lock time passes',
        'The broker redelivers it, and Oracle rejects the copy since its transaction is the same',
        'The broker keeps it locked until the same worker comes back to ack it',
        'The broker redelivers it after the lock expires, so the flow must skip a known message ID',
      ],
      answer: 3,
      explain: 'Without an ack the message becomes visible again when its lock expires, and another worker loads it a second time. Delivery is at least once, so record the message ID in Oracle and skip repeats. An expired lock returns the message to the queue, it does not drop it, and no worker owns it after a crash. Oracle has no link between the new insert and the old transaction, so nothing rejects the copy unless you add a check.',
    },
    {
      type: 'single',
      prompt: 'Two copies of a message arrive at the same moment on two workers. Both SELECT the ID, find nothing, and load. What prevents this?',
      options: [
        'Running the SELECT with the SERIALIZABLE isolation level',
        'A unique constraint on the message ID in the message log table',
        'Running the SELECT and the load in one transaction',
        'Adding FOR UPDATE to the SELECT that checks the ID',
      ],
      answer: 1,
      explain: 'The second insert fails with ORA-00001 and that worker stops. A check then insert has a gap. A transaction or FOR UPDATE cannot lock a row that does not exist yet, and Oracle SERIALIZABLE does not stop two sessions inserting the same new value. Inserting the ID first under a unique constraint closes it.',
    },
    {
      type: 'single',
      prompt: 'A partner resends item changes. ITEM_STAGE must keep one row per ITEM_ID with the newest values, and each block mixes known and new items. Which one statement fits?',
      options: [
        'An INSERT with the IGNORE_ROW_ON_DUPKEY_INDEX hint, so a resent item does not fail',
        'An INSERT ALL with a WHEN clause per row that tests whether the key exists already',
        'A MERGE on ITEM_ID that updates matching rows and inserts the ones not found',
        'A Bulk update operation by ITEM_ID, which inserts the rows that match nothing',
      ],
      answer: 2,
      explain: 'MERGE INTO target USING source ON (key) WHEN MATCHED THEN UPDATE WHEN NOT MATCHED THEN INSERT does both in one statement. The IGNORE_ROW_ON_DUPKEY_INDEX hint skips a duplicate row, so the newest values of a resent item are lost. The WHEN conditions of INSERT ALL test the source row, and it can only insert. A Bulk update runs an UPDATE per row and never inserts.',
    },
    {
      type: 'single',
      prompt: 'A MERGE fails with ORA-30926, unable to get a stable set of rows. What is the cause?',
      options: [
        'Another session changed the target rows during the MERGE',
        'Two source rows match the same target row',
        'The UPDATE part changes a column used in the ON clause',
        'The source query has no ORDER BY, so its row order is unstable',
      ],
      answer: 1,
      explain: 'Oracle cannot tell which update should win. Updating an ON clause column is a different error, ORA-38104. Remove duplicate keys from the source first, keeping the newest row per key.',
    },
    {
      type: 'multi',
      prompt: 'A plain bulk insert into an item staging table started failing with ORA-00001 when the sender resent items. Why might the team switch to MERGE?',
      options: [
        'A resent item updates the existing row instead of failing',
        'A block no longer fails because of a key that was already loaded',
        'MERGE cannot fail on a row, so no reject table is needed',
        'The reject table gets fewer false rejects for resends',
        'MERGE removes duplicate keys inside the same source batch',
        'MERGE makes any replay safe, so the duplicate message check can be dropped',
      ],
      answer: [0, 1, 3],
      explain: 'With MERGE a resent item updates its row, so the block does not fail on a known key and resends stop showing up as rejects. MERGE can still fail, for example on NOT NULL or length. Two rows with the same key in one source batch give ORA-30926, not a silent dedupe. A replay of an older message can overwrite newer data, so the duplicate message check still has a job.',
    },
    {
      type: 'single',
      prompt: 'Two sessions MERGE the same new key at the same time. What can happen?',
      options: [
        'Nothing, because MERGE locks the key before it checks for a match',
        'Both see no match and insert, so one fails with ORA-00001',
        'The second MERGE waits, then updates the row the first inserted',
        'Both inserts succeed, and the table holds two rows with that key',
      ],
      answer: 1,
      explain: 'Catch the error and retry the row, or keep each key in one session. MERGE is one statement but not a lock on keys that do not exist yet. A retry of the failed row then finds a match and updates.',
    },
  ],
  description: `
Marrow & Pine Home receives item and supplier item messages from a queue. Each message has a message ID, and the JSON it points to has a sender document ID. Mule loads the data into Oracle staging tables. Last month the sender replayed a day of messages, the loads failed with ORA-00001, and some messages were loaded twice where no constraint existed.

**Questions**
1. How do you stop the same message from being loaded twice?
2. Why is a SELECT then INSERT check not enough on its own?
3. When would you use MERGE instead of INSERT for staging rows?
4. What can still go wrong with MERGE?
`,
  answerTemplate: `## Duplicate message check

## The race

## INSERT or MERGE

## MERGE pitfalls
`,
  keyPoints: [
    'Check the message ID and the document ID against a log table.',
    'Back the check with a unique constraint and insert the ID first.',
    'A duplicate is not a failure: acknowledge it and log it.',
    'MERGE updates matches and inserts the rest in one statement.',
    'Remove duplicate source keys or MERGE fails with ORA-30926.',
    'Concurrent MERGE of a new key can still raise ORA-00001.',
  ],
  solution: `
**1. Duplicate message check.** Keep a message log table with the message ID, the document ID, the message type and the time. Before any work, look up the ID. If it exists, log a duplicate, send the agreed response and stop without loading. Do the same for the document ID after downloading the content, since a sender can resend the same document with a new message ID.

**2. The race.** Two copies can be read by two workers at once. Both look up the ID, both find nothing, and both load. Put a unique constraint on the message ID and insert the log row as the first step. The second worker fails with ORA-00001, which the flow maps to a duplicate outcome.

**3. INSERT or MERGE.** Plain INSERT is right when a key must be new and a clash is a real error. When a resend should replace the earlier values, MERGE on the business key updates the existing row or inserts a new one. This removes the ORA-00001 failures that resends cause and keeps reject tables for real data problems.

**4. MERGE pitfalls.** The source must have one row per key, or MERGE fails with ORA-30926. Two sessions merging the same new key at the same time can both insert, and one gets ORA-00001, so retry that row once. Constraint errors such as ORA-01400 still apply. An index on the ON columns keeps it fast.
`,
  followUps: [
    {
      q: 'How long do you keep message IDs in the log table?',
      a: 'At least as long as the sender may replay, plus a margin. Purge older rows in a job, and keep the index small.',
    },
    {
      q: 'Should a duplicate go to the error queue?',
      a: 'Usually not. It is an expected case. Log it, acknowledge the message and count it in the job log.',
    },
    {
      q: 'How does Mule bind a list of rows to a MERGE?',
      a: 'A common way is a bulk operation whose SQL is the MERGE, with named parameters in a USING (SELECT :a ... FROM DUAL) source, so each row runs as one batched statement. Test it with your connector and driver versions.',
    },
  ],
}
