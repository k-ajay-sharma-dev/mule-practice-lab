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
      prompt: 'Mule must read a supplier mailbox, and each processed mail must end up in a Processed folder where people can check it. Which protocol do you configure?',
      options: [
        'POP3 over TLS on port 995, then file each mail in Processed after the flow',
        'POP3 with delete after read, so the server files the mail in Processed',
        'IMAP, since it keeps mail on the server with folders and flags such as Seen',
        'SMTP, with a listener that receives each mail and files it in Processed',
      ],
      answer: 2,
      explain: 'IMAP keeps mail on the server with folders and flags, so a flow can mark or move processed mail. POP3 sees only the inbox and has no folders, so there is nowhere to move a mail to, with or without TLS. Deleting a mail removes it, it does not file it anywhere. SMTP sends and relays mail, and Mule reads mail with IMAP or POP3.',
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
      prompt: 'An order mailed at 10:01 was loaded only at 10:15. The On New Email listener for IMAP has a fixed frequency of 15 minutes. What explains the delay?',
      options: [
        'The listener polls the folder, so a new mail waits until the next poll runs',
        'The server push over IMAP IDLE was late, so Mule learned of the mail late',
        'The mail server holds new mail back for a while before IMAP clients see it',
        'The first poll skipped the mail on its watermark, and the next poll took it',
      ],
      answer: 0,
      explain: 'The Email connector listeners poll on their scheduling strategy, so mail waits up to one interval. Set the interval to what the business needs. The listener does not use IMAP IDLE push, so no push could be late. A server makes new mail visible at once, and a skipped mail would point to a bug, not to a 14 minute wait that matches the interval.',
    },
    {
      type: 'multi',
      prompt: 'After a message is processed, what can an IMAP flow do so it is not processed again?',
      options: [
        'Mark it as Seen and only read unseen mail',
        'Move it to a Processed folder',
        'Delete it, when no copy is needed',
        'Copy it to the Sent folder so the server flags it as handled',
        'Keep processed Message-IDs in a non persistent object store',
      ],
      answer: [0, 1, 2],
      explain: 'Seen with an unseen filter, a move, or a delete all take the message out of the next read. Moving to a folder leaves a trail people can check. Deleting leaves none. A copy to Sent does not change the original message or its flags. A non persistent object store is lost on a restart and not shared between replicas, so old mail is processed again.',
    },
    {
      type: 'single',
      prompt: 'A support person opens the shared mailbox in a mail client and reads a new order mail before Mule polls. What happens with a Seen based filter?',
      options: [
        'Mule still processes it, since the listener ignores flags set by clients',
        'The client marks it Seen, so Mule skips it and the order is missed',
        'The client deletes it from the server once it has been read',
        'Mule processes it twice, once for the client read and once on its poll',
      ],
      answer: 1,
      explain: 'Do not let people use the integration mailbox, or move processed mail out instead of relying on the Seen flag.',
    },
    {
      type: 'single',
      prompt: 'A supplier mail has a short text body and an attachment named po.csv. In the flow after the IMAP listener, where is the CSV content?',
      options: [
        'In attributes.attachments."po.csv", since parts of the mail sit in the attributes',
        'In payload.body, which holds the whole MIME message with the CSV part inside',
        'Nowhere yet, since the listener gives the headers and a later fetch gets the parts',
        'In payload.attachments."po.csv", keyed by the attachment name, next to payload.body',
      ],
      answer: 3,
      explain: 'The payload holds the body and the attachments. Attachments are a map keyed by attachment name, so you read one with `payload.attachments."po.csv"` and the body with `payload.body`. The attributes hold from, to, subject, date and headers, not the parts. The body is only the text part, and the listener already gives the full content, so no second fetch is needed.',
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

**2. Picking up mail.** Use the Email connector with an IMAPS configuration on port 993 and the listener for new mail on the inbox. The listener polls on a schedule. Each message arrives with the content as payload and attributes with the sender, subject, date and headers. The payload holds the body in \`payload.body\` and the attachments in \`payload.attachments\`, a map keyed by attachment name.

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
