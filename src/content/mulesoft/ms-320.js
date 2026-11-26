export default {
  id: 'ms-320',
  category: 'mulesoft',
  title: 'Reliable Alert Emails Without Personal Data: An Outbox Table and Safe Alert Content',
  level: 'EXPERT',
  tags: ['myproject', 'email', 'outbox', 'alerts', 'privacy', 'reliability'],
  estMinutes: 30,
  quiz: [
    {
      type: 'single',
      prompt: 'A flow sets an order to SHIPPED in Oracle and must tell the service team by mail. The mail must go out only if the update commits, and it must not be lost when the worker restarts. What fits?',
      options: [
        'Write the mail as an outbox row in the same transaction, and let a sender flow send it',
        'Send the mail inside the transaction, as the last step right before the commit',
        'Send the mail in an Async scope right after the commit, so the flow is not held up',
        'Send the mail after the commit, inside Until Successful with a few retries',
      ],
      answer: 0,
      explain: 'With an outbox row the mail is recorded if and only if the work committed, and the row survives a restart. A separate sender flow reads the rows, sends them and can retry without redoing the work. A send before the commit cannot be undone if the commit then fails. An Async scope or Until Successful holds the mail only in memory, so a crash after the commit loses it.',
    },
    {
      type: 'single',
      prompt: 'The outbox sender reads a NEW row, sends the mail, and the worker crashes before it marks the row SENT. What happens on the next run?',
      options: [
        'Nothing more is sent, since the relay drops a copy with a Message-ID it saw before',
        'The row stays locked by the dead session, so the mail is never sent again',
        'The row is still NEW, so the mail goes out a second time to the same readers',
        'The rollback of the crashed session also pulls back the mail it had sent',
      ],
      answer: 2,
      explain: 'The send and the status update cannot be one atomic step, so the sender delivers at least once. Keep the gap short and accept a rare repeat, or let readers spot it by a run ID in the subject. Relays do not drop repeats by Message-ID. Oracle releases the locks of a dead session when it cleans up. A mail that has left cannot be rolled back.',
    },
    {
      type: 'multi',
      prompt: 'Which columns help an outbox table?',
      options: [
        'ID, type, recipients group, subject and body or template data',
        'Status, attempts, next try time and last error',
        'A dedupe key, such as job ID plus mail type, with a unique constraint',
        'An SMTP Message-ID set when the row is written, so the relay drops a resend',
        'The ID of the worker that wrote the row, so only that worker sends it',
      ],
      answer: [0, 1, 2],
      explain: 'Content columns say what to send, status columns drive retries, and the dedupe key with a unique constraint stops two rows for the same alert. Relays do not drop repeats by Message-ID, so it does not stop a resend. A row tied to one worker is never sent if that worker dies or is scaled away. Any sender should be able to claim any row.',
    },
    {
      type: 'single',
      prompt: 'A failed record alert contains: "Order 88123 for Jane Doe, jane@marrow.example, card ending 4242 failed." What should change?',
      options: [
        'Mask the email as j***@marrow.example, and keep the name and card ending for support',
        'Keep the order number and the reason, and drop the customer fields',
        'Drop the card ending, since card data is regulated, and keep the name and email',
        'Keep the text, and send the alert only to the internal support group',
      ],
      answer: 1,
      explain: 'Alerts travel and are kept in many inboxes, so they should carry keys and reasons, not personal data. People with access look up the details in the system. A masked email still leaves a name and card ending in every inbox. A name and an email are personal data too, not only card details. An internal list still copies the data into many mailboxes and backups.',
    },
    {
      type: 'single',
      prompt: 'An error message from a database or API is copied into an alert. Why can that leak personal data?',
      options: [
        'The Database connector adds the input payload of the operation to its error description',
        'Error texts often echo values from the failing row, such as a duplicate email',
        'The stack trace in the message holds the values of the local variables in each frame',
        'The error text carries the SQL statement with each bound value written into it',
      ],
      answer: 1,
      explain: 'Many errors quote the offending value, such as a duplicate key or a value that is too long, and APIs often echo the field they rejected. Map errors to a code and a short safe text before putting them in mail. The connector does not add the payload to the description. Stack frames list classes and lines, not variable values. Bound values stay separate from the SQL text.',
    },
    {
      type: 'single',
      prompt: 'The same job fails 200 times in an hour and sends 200 alerts. What helps?',
      options: [
        'Send them all, with a mailbox rule that threads repeats under one subject',
        'Suppress repeats within a window and send one alert with a count',
        'Send them to a separate folder that support reviews once a day',
        'Alert only after 50 failures in the hour, so short bursts stay quiet',
      ],
      answer: 1,
      explain: 'Group repeats by job and error, and send a recovery mail when it works again. Alert storms train people to ignore alerts. One clear mail with a count is read. A mailbox rule hides the storm in one inbox but still sends 200 mails to everyone else. A daily folder review delays the first alert by up to a day. A threshold of 50 hides the first 49 failures and still sends four alerts.',
    },
  ],
  description: `
Larkfield Grocers sends alert emails from several Mule apps when jobs or records fail. Some alerts were sent for loads that later rolled back. During an outage the team got hundreds of mails. An audit found customer names and email addresses in old alerts kept in personal mailboxes.

**Questions**
1. Why did alerts go out for work that rolled back, and how does an outbox fix it?
2. What does the outbox table hold, and how is it sent?
3. What may an alert contain, and what not?
4. How do you stop alert storms?
`,
  answerTemplate: `## Alerts and rollbacks

## The outbox

## Alert content

## Alert storms
`,
  keyPoints: [
    'Mail cannot be rolled back, so do not send inside a transaction.',
    'Write an outbox row in the same transaction as the work.',
    'A sender flow sends rows with retries and marks them sent.',
    'A unique dedupe key stops duplicate alerts.',
    'Alerts carry keys, codes and links, never personal data.',
    'Suppress repeats and send counts and recovery notices.',
  ],
  solution: `
**1. Alerts and rollbacks.** The flow sent the mail during the transaction. When a later step failed and the transaction rolled back, the mail was already out. Write a row into an outbox table in the same transaction instead. If the work commits, the row exists. If it rolls back, so does the row.

**2. The outbox.** The table holds an ID, mail type, recipient group, template data, a dedupe key with a unique constraint, status, attempts, next try time and last error. A sender flow on a scheduler claims NEW rows, for example with \`FOR UPDATE SKIP LOCKED\` in Oracle, sends them, and marks them SENT. Temporary failures set a later next try time. After a limit, rows go to FAILED and raise an alert in monitoring. Recipients are groups resolved at send time, not personal addresses in each row.

**3. Alert content.** Include the app, environment, job or run ID, record keys, an error code, a short safe reason, a count and a link to the job log or report. Leave out names, contact details, payment data and raw error texts that may echo record values. Use example domains such as \`marrow.example\` in tests.

**4. Alert storms.** Use the dedupe key with a time window, such as job plus error code per 15 minutes, so repeats update a count instead of creating rows. Send one alert with the count, and a recovery mail when the job works again.
`,
  followUps: [
    {
      q: 'How long do you keep outbox rows?',
      a: 'Sent rows for a short time, such as 30 days, for support. Purge them in a job, since they may hold business keys.',
    },
    {
      q: 'Could a message queue replace the outbox table?',
      a: 'If the work and the queue cannot share one transaction, you get the same gap. The outbox uses the database transaction the work already has.',
    },
    {
      q: 'Who decides what counts as personal data in alerts?',
      a: 'The privacy or data protection team sets the rules. The integration team applies them in templates and reviews.',
    },
  ],
}
