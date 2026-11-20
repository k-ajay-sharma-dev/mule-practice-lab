export default {
  id: 'ms-247',
  category: 'mulesoft',
  title: 'Duplicates in a JMS Driven Hub: Message ID Checks in Oracle, Sender Document IDs and Where Transactions Stop',
  level: 'ADVANCED',
  tags: ['myproject', 'queues', 'jms', 'idempotency', 'duplicates', 'oracle', 'transactions', 'product-data-hub'],
  estMinutes: 25,
  quiz: [
    {
      type: 'single',
      prompt: 'The hub checks a notification message id with a SELECT, and inserts it if not found. Two copies of the same message arrive on two consumers at once. What can happen?',
      options: [
        'The database blocks the second SELECT',
        'Both SELECTs find nothing, so both are processed',
        'The broker drops the second copy as a duplicate',
        'Nothing, a read cannot cause a race',
      ],
      answer: 1,
      explain: 'Check then insert has a race. Two consumers can pass the check before either inserts.',
    },
    {
      type: 'single',
      prompt: 'What closes that race?',
      options: [
        'A longer JMS receive timeout',
        'A unique key on the message id, inserting first',
        'A SELECT FOR UPDATE on the message id row',
        'A larger database connection pool',
      ],
      answer: 1,
      explain: 'Insert first, and treat a unique constraint violation as a duplicate. The database enforces uniqueness at insert time. A SELECT FOR UPDATE cannot lock a row that does not exist yet. The second insert fails, and the flow treats that as a duplicate instead of an error.',
    },
    {
      type: 'single',
      prompt: 'A partner resends the same ReceivingAdvice document a day later with a new notification message id. Which check catches it?',
      options: [
        'The message id check',
        'The sender document id check',
        'The JSON schema check',
        'The blob exists check',
      ],
      answer: 1,
      explain: 'The sender document id check runs after the file is downloaded. The message id is new, so the first check passes. The sender document id inside the business document is the same, so the second check catches it.',
    },
    {
      type: 'multi',
      prompt: 'The JMS listener is transacted, and the flow writes to Oracle with its own local database transaction. Which statements are true?',
      options: [
        'The JMS and database transactions are separate, so one can commit while the other rolls back',
        'If Oracle commits and the JMS commit then fails, the message is delivered again after the data is already loaded',
        'The two commit together without XA',
        'XA or an idempotent design is needed to cope with that gap',
      ],
      answer: [0, 1, 3],
      explain: 'Two local transactions commit one after the other. Without XA, the hub must be safe to receive the message again, which the duplicate checks provide.',
    },
    {
      type: 'single',
      prompt: 'Which ack setting suits the hub, where a crash in the middle must not lose a notification?',
      options: [
        'IMMEDIATE, which acks as soon as it is received',
        'AUTO, which acks when the flow ends, or transacted',
        'DUPS_OK, which lets the session ack lazily',
        'MANUAL, with no ack call anywhere in the flow',
      ],
      answer: 1,
      explain: 'Acknowledging on receipt loses the message if the app crashes during the load. AUTO acknowledges when the flow ends without error, and a transacted listener commits at the end, so the message stays on the broker until the work is done. DUPS_OK can ack before the work ends, and MANUAL with no ack never removes the message.',
    },
    {
      type: 'order',
      prompt: 'Order the duplicate defences in the hub flow.',
      items: [
        'Insert the notification message id into the received messages table',
        'Download and validate the blob',
        'Insert the sender document id into the documents table',
        'Load the records into the staging tables',
        'Mark the blob processed and send the final ACK',
      ],
      explain: 'Each step that can be repeated is guarded before the expensive work it protects.',
    },
  ],
  description: `
Kestrel Home Supply runs a product data hub on ActiveMQ and Oracle. A JMS listener receives notifications that point to GS1 style files in Azure Blob Storage. The hub records each notification message id and each sender document id in Oracle, then loads the records into staging tables.

Last quarter an Item file was loaded twice and created duplicate staging rows. The logs show the same message id on two consumers within 50 milliseconds.

**Questions**
1. Why do duplicates reach the hub at all?
2. What went wrong with the message id check, and how do you fix it?
3. Why are there two ids to check?
4. How do JMS and Oracle transactions fit together, and where is the gap?
`,
  answerTemplate: `## Why duplicates arrive

## Fixing the message id check

## Two ids

## Transactions
`,
  keyPoints: [
    'JMS delivery is at least once, so redelivery and partner resends both happen.',
    'Check then insert has a race between parallel consumers.',
    'A unique constraint with insert first closes the race.',
    'The message id stops redelivered notifications. The sender document id stops resent documents.',
    'A transacted JMS listener and a local Oracle transaction commit separately.',
    'Without XA, the flow must be safe to run twice, which the duplicate checks provide.',
  ],
  solution: `
**1. Why duplicates arrive.** JMS delivers at least once. A consumer can load the data and fail before its acknowledgement or commit reaches the broker, and the broker delivers again. Partners also resend documents, sometimes with a new notification. The hub must expect both.

**2. The message id check.** The flow ran a SELECT and inserted the id afterwards. Two consumers read the same id at once, both found nothing, and both loaded the file. Put a unique constraint on the message id column and insert first. If the insert fails with a unique constraint violation, treat the message as a duplicate: log it, ack it and stop. The database decides, so the race is gone.

**3. Two ids.** The notification message id identifies one delivery attempt by the sender. The sender document id identifies the business document inside the file. A resend with a new notification passes the first check and is caught by the second, after the blob is downloaded and validated.

**4. Transactions.** A transacted JMS listener commits the message when the flow ends. The Oracle writes use their own local transaction. They commit one after the other, so a crash between them can leave the data loaded while the message comes back. XA can make them commit together, at a cost in setup and speed. Most teams keep local transactions and make the flow safe to repeat, which is what the two id checks do. Record each step in the job log, so a repeat shows clearly.
`,
  followUps: [
    {
      q: 'When the message id insert fails as a duplicate, should the hub still send a received ACK?',
      a: 'Agree it with the partner. Many hubs send nothing new for a duplicate delivery, since the first copy already got its ACK, but they log it for support.',
    },
    {
      q: 'Should the message id insert be in the same database transaction as the staging load?',
      a: 'If it is, a failed load also removes the id, so a retry can run again, which is usually what you want. If it is separate, a failed load leaves the id and blocks the retry.',
    },
    {
      q: 'How long do you keep the received message ids?',
      a: 'Longer than any redelivery or resend window, for example several months, then purge old rows on a schedule. The table must not grow forever.',
    },
  ],
}
