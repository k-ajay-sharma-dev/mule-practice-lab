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
      prompt: 'What is the outbox pattern for email?',
      options: [
        'A folder in the shared mailbox where the flow saves each mail as a draft',
        'The flow writes the mail as a row in the same transaction as its work',
        'The flow sends each mail to itself first, then forwards it on success',
        'The flow saves each mail as an .eml file that the relay picks up',
      ],
      answer: 1,
      explain: 'A separate sender flow reads the rows and sends them. The mail is recorded if and only if the work committed. The sender can retry without redoing the work.',
    },
    {
      type: 'single',
      prompt: 'Why is sending the email inside the database transaction a poor idea?',
      options: [
        'The Email connector joins the transaction and commits it early',
        'A mail cannot be rolled back, so people can hear of work that never committed',
        'SMTP needs XA, which the Email connector does not support',
        'The database blocks outbound SMTP traffic while a transaction is open',
      ],
      answer: 1,
      explain: 'If the transaction rolls back after the send, the mail is already out. The outbox moves the send after the commit, where it can be retried safely.',
    },
    {
      type: 'multi',
      prompt: 'Which columns help an outbox table?',
      options: [
        'ID, type, recipients group, subject and body or template data',
        'Status, attempts, next try time and last error',
        'A dedupe key, such as job ID plus mail type, with a unique constraint',
        'The SMTP user and password, so the sender flow can log in',
      ],
      answer: [0, 1, 2],
      explain: 'The dedupe key stops two rows for the same alert. Credentials stay in secure properties.',
    },
    {
      type: 'single',
      prompt: 'A failed record alert contains: "Order 88123 for Jane Doe, jane@marrow.example, card ending 4242 failed." What is wrong?',
      options: [
        'Nothing, since the alert goes only to the internal support group',
        'It holds a name, an email address and card details, which alerts should not carry',
        'It is plain text, so the order number cannot be a link to the order',
        'It should be HTML, so the customer fields show in a readable table',
      ],
      answer: 1,
      explain: 'Alerts travel and are kept in many inboxes, so they should carry keys and reasons, not personal data. Use the order key and the reason. People with access look up the details in the system.',
    },
    {
      type: 'single',
      prompt: 'An error message from a database or API is copied into an alert. Why can that leak personal data?',
      options: [
        'It cannot, since error texts hold only codes and table names',
        'Error texts often echo values from the failing row, such as a duplicate email',
        'Only the stack trace carries data, and the alert holds the message only',
        'Drivers mask values in error texts, so only the column name shows',
      ],
      answer: 1,
      explain: 'Map errors to a code and a short safe text before putting them in mail.',
    },
    {
      type: 'single',
      prompt: 'The same job fails 200 times in an hour and sends 200 alerts. What helps?',
      options: [
        'Send all of them, so support sees each failure as it happens',
        'Suppress repeats within a window and send one alert with a count',
        'Send them to a separate folder that support reviews once a day',
        'Lower the log level so repeated errors no longer raise alerts',
      ],
      answer: 1,
      explain: 'Group repeats by job and error, and send a recovery mail when it works again. Alert storms train people to ignore alerts. One clear mail with a count is read.',
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
