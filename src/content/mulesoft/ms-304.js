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
      prompt: 'An inbound adapter gets messages from a queue with an ID. Why check the ID in Oracle before loading?',
      options: [
        'The queue removes duplicates already, so the check only catches errors',
        'Queues can redeliver and senders resend, so data can arrive twice',
        'Oracle rejects a second insert with the same message ID by default',
        'The check confirms the message was acknowledged on the queue',
      ],
      answer: 1,
      explain: 'A check stops the same data from being loaded twice. Most brokers promise at least once delivery. The check makes the flow idempotent.',
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
      prompt: 'What does an Oracle MERGE do?',
      options: [
        'Inserts the source rows and skips any that would break a key',
        'Updates target rows that match on a key and inserts the rest',
        'Deletes target rows that match the source, then inserts all rows',
        'Joins two tables and returns the combined rows, as a SELECT does',
      ],
      answer: 1,
      explain: 'It compares source rows with a target on a key in one statement. MERGE INTO target USING source ON (key) WHEN MATCHED THEN UPDATE WHEN NOT MATCHED THEN INSERT.',
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
      ],
      answer: [0, 1, 3],
      explain: 'MERGE can still fail, for example on NOT NULL, length or duplicate source keys.',
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
