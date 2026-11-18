export default {
  id: 'ms-312',
  category: 'mulesoft',
  title: 'Reading a Mailbox From Mule: IMAP or POP3, Folders, Flags and Ports',
  level: 'BEGINNER',
  tags: ['myproject', 'email', 'imap', 'pop3', 'email-connector', 'mailbox'],
  estMinutes: 12,
  quiz: [
    {
      type: 'single',
      prompt: 'What is the main difference between IMAP and POP3?',
      options: [
        'IMAP sends mail, POP3 reads it',
        'IMAP works with mail that stays on the server, with folders and flags such as Seen. POP3 downloads from the inbox and usually deletes',
        'POP3 is newer',
        'They are the same protocol on different ports',
      ],
      answer: 1,
      explain: 'For an integration that must mark or move processed mail, IMAP is the usual choice.',
    },
    {
      type: 'match',
      prompt: 'Match each port with its protocol.',
      pairs: [
        ['143', 'IMAP, often with STARTTLS'],
        ['993', 'IMAP over TLS'],
        ['995', 'POP3 over TLS'],
      ],
      explain: 'Port 110 is POP3 without TLS. Use the TLS ports where the server offers them.',
    },
    {
      type: 'single',
      prompt: 'How does Mule pick up new mail from a mailbox?',
      options: [
        'The mail server calls a Mule HTTP endpoint',
        'An Email connector listener, such as On New Email for IMAP, polls the folder on a schedule',
        'With a JMS listener',
        'It cannot',
      ],
      answer: 1,
      explain: 'Polling means mail waits up to one interval. Set the interval to what the business needs.',
    },
    {
      type: 'multi',
      prompt: 'After a message is processed, what can an IMAP flow do so it is not processed again?',
      options: [
        'Mark it as Seen and only read unseen mail',
        'Move it to a Processed folder',
        'Delete it, when no copy is needed',
        'Nothing, IMAP forgets it',
      ],
      answer: [0, 1, 2],
      explain: 'Moving to a folder leaves a trail people can check. Deleting leaves none.',
    },
    {
      type: 'single',
      prompt: 'A support person opens the shared mailbox in a mail client and reads a new order mail before Mule polls. What happens with a Seen based filter?',
      options: [
        'Mule still processes it',
        'The client marks it Seen, so Mule skips it and the order is missed',
        'The mail is deleted',
        'Mule processes it twice',
      ],
      answer: 1,
      explain: 'Do not let people use the integration mailbox, or move processed mail out instead of relying on the Seen flag.',
    },
    {
      type: 'single',
      prompt: 'What does the listener give you for each message?',
      options: [
        'Only the subject',
        'The body as the payload and attributes such as from, to, subject, received date, headers and attachments',
        'A file path',
        'The SMTP log',
      ],
      answer: 1,
      explain: 'Attachments come as parts you can route by name and content type.',
    },
  ],
  description: `
Fenwick Supply gets purchase order confirmations from a few small suppliers by email, with a CSV attached. The mail team created a shared mailbox for the integration. Mule must pick up new mails, process the attachment and not pick the same mail up twice.

**Questions**
1. IMAP or POP3, and why?
2. How does Mule pick up new mail?
3. How do you stop the same mail from being processed twice?
4. What can go wrong if people also use the mailbox?
`,
  answerTemplate: `## IMAP or POP3

## Picking up mail

## Not twice

## People in the mailbox
`,
  keyPoints: [
    'IMAP keeps mail on the server with folders and flags.',
    'POP3 downloads and usually deletes.',
    'Use TLS ports: 993 for IMAP, 995 for POP3.',
    'A listener polls a folder on a schedule.',
    'Mark Seen, move to a folder or delete after processing.',
    'People reading the mailbox can hide mail from a Seen filter.',
  ],
  solution: `
**1. IMAP or POP3.** IMAP keeps mail on the server, supports folders and keeps flags such as Seen. That lets the flow move processed mail to a folder and leave a trail. POP3 downloads from the inbox and usually deletes, with no folders. IMAP fits better here.

**2. Picking up mail.** Use the Email connector with an IMAPS configuration on port 993 and the listener for new mail on the inbox. The listener polls on a schedule. Each message arrives with the body as payload and attributes with the sender, subject, date and attachments.

**3. Not twice.** After the attachment is processed, move the mail to a Processed folder, or to an Error folder when it fails. Also record the Message-ID header in a table, so a repeat delivery or a restored message is spotted.

**4. People in the mailbox.** A person who opens a new mail marks it Seen, and a Seen based filter then skips it. A person can also move or delete mail. Keep the mailbox for the integration only, and rely on moving mail rather than the Seen flag.
`,
  followUps: [
    {
      q: 'How would you handle a mail with no attachment?',
      a: 'Move it to an Error folder and send a short reply or an alert to the business owner, not to the sender if that could leak details.',
    },
    {
      q: 'What about very large attachments?',
      a: 'Stream them to a file or blob store first, then process. Check the size before loading the content into memory.',
    },
    {
      q: 'Is email a good integration channel?',
      a: 'It works for small partners without APIs. It is slow, hard to secure and loose in format, so prefer SFTP or an API when the partner can.',
    },
  ],
}
