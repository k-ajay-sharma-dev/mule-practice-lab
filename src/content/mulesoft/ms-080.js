export default {
  id: 'ms-080',
  category: 'mulesoft',
  title: 'Email Connector Protocols: IMAP vs POP3 vs SMTP, Connection Types, Ports and Secure Variants',
  level: 'BEGINNER',
  tags: ['email', 'imap', 'pop3', 'smtp', 'connectors', 'tls'],
  estMinutes: 15,
  quiz: [
    {
      type: 'match',
      prompt: 'Match each integration need to the protocol that fits.',
      pairs: [
        ['Send a daily claims report to the finance team', 'SMTP or SMTPS'],
        ['Read a shared mailbox, keep messages on the server and sort them into folders', 'IMAP or IMAPS'],
        ['Collect mail from a legacy host that offers only a simple download mailbox', 'POP3 or POP3S'],
      ],
      explain: 'SMTP sends mail; it cannot read a mailbox. IMAP works on messages that stay on the server, with folders and flags. POP3 is the simpler retrieval protocol, with far less metadata and no folder operations in the connector.',
    },
    {
      type: 'match',
      prompt: 'Match each Email connector connection type to its port as listed in the connector documentation.',
      pairs: [
        ['SMTP', '25'],
        ['SMTPS', '465'],
        ['IMAPS', '993'],
        ['POP3', '110'],
        ['POP3S', '995'],
      ],
      explain: 'Each secure variant is a separate connection type on its own port. Changing only the port number does not turn an SMTP connection into an SMTPS one.',
    },
    {
      type: 'single',
      prompt: 'The new mail relay accepts TLS connections on port 465 only. Which configuration fits?',
      options: [
        'An SMTPS connection on port 465 with a TLS configuration',
        'An SMTP connection with the port changed to 465',
        'An IMAPS connection on port 465',
        'An SMTP connection on port 25 with a higher connection timeout',
      ],
      answer: 0,
      explain: 'The secure variants are distinct connection types and the reference lists TLS configuration as required on them. A plain SMTP connection has no TLS configuration, whichever port it uses.',
    },
    {
      type: 'single',
      prompt: 'A legacy host offers POP3 only. After a message is processed it must not be picked up again. What do you configure?',
      options: [
        'Delete after retrieve on the POP3 listener',
        'email:mark-as-read with the message id',
        'email:move-to-folder to a Processed folder',
        'Enable Watermark on the POP3 listener',
      ],
      answer: 0,
      explain: 'POP3 cannot look up messages by UID, so delete-after-retrieve is the only way to remove them after retrieval. Mark-as-read and move are IMAP operations, and the POP3 listener has no watermark option.',
    },
    {
      type: 'multi',
      prompt: 'The claims team needs mail to be processed and then filed in a `Processed` folder, with a watermark on polling. Which of these are available with an IMAP configuration but not with POP3?',
      options: [
        'email:move-to-folder',
        'email:mark-as-read',
        'Enable Watermark on the listener',
        'email:send',
      ],
      answer: [0, 1, 2],
      explain: 'Move, mark-as-read, delete, expunge and the watermark option belong to the IMAP side. `email:send` belongs to neither: it needs an SMTP or SMTPS configuration.',
    },
    {
      type: 'single',
      prompt: 'One Mule app must read a mailbox over IMAPS and also send confirmations. How many Email connector configurations does it need?',
      options: [
        'Two: one for reading (IMAPS) and one for sending (SMTP or SMTPS)',
        'One IMAPS configuration, because IMAP can also send',
        'One SMTP configuration, because SMTP can also read',
        'None, because the listener can reply to the sender by itself',
      ],
      answer: 0,
      explain: 'Reading and sending are different protocols with different servers and ports, so each side has its own configuration.',
    },
  ],
  description: `
An insurer is moving three email integrations into Mule 4:

- **Claims intake:** adjusters and an automated flow share \`claims@\`. About 900 emails a day must be read, and messages must stay on the server for audit, filed into folders once processed.
- **Broker statements:** a 15-year-old host offers a POP3 mailbox only. About 40 statements arrive each night.
- **Finance reports:** a nightly flow sends a report through the corporate relay, which accepts TLS connections only.

The security team has said that credentials must never cross the network in clear text.

**Questions**
1. What does each protocol do, and which fits each integration?
2. Which connection type and port would you use for each, and what is different about the secure variants?
3. What can you do with IMAP that you cannot do with POP3 in the connector?
4. How do you stop a POP3 message being retrieved twice?
`,
  answerTemplate: `## What each protocol does

## Connection type and port per integration

## IMAP vs POP3 capabilities

## Avoiding repeat POP3 retrieval
`,
  keyPoints: [
    'SMTP sends mail. IMAP and POP3 read mail. A flow that does both needs two configurations.',
    'Connection types and ports: SMTP 25, SMTPS 465, IMAPS 993, POP3 110, POP3S 995.',
    'The secure variants are separate connection types that take a TLS configuration, so changing the port alone is not enough.',
    'IMAP keeps mail on the server and gives folders, flags, move, mark-as-read, delete, expunge and a watermark option.',
    'POP3 cannot look up messages by UID, so delete-after-retrieve is the only way to remove messages after retrieval.',
    'Connection, read and write timeouts default to 5 seconds.',
  ],
  solution: `
**1. Protocols.**
| Protocol | Job | Fits |
|---|---|---|
| SMTP / SMTPS | Send mail | Finance reports |
| IMAP / IMAPS | Read mail that stays on the server, with folders and flags | Claims intake |
| POP3 / POP3S | Simple retrieval from a mailbox | Broker statements (the only option offered) |

**2. Connection types.**
- Claims intake: **IMAPS**, port **993**, with a TLS configuration.
- Broker statements: **POP3S**, port **995**, if the host supports it. Plain POP3 on **110** would break the clear-text rule, so raise it with security if the host cannot do better.
- Finance reports: **SMTPS**, port **465**, with a TLS configuration. Plain **SMTP** uses **25**.

A secure variant is its own connection type. Changing the port on a plain connection does not add TLS.

The conventional port for plain IMAP is 143. The connector reference shows 993 as the default on both its IMAP and IMAPS connections, so always set the port explicitly rather than rely on the default.

**3. IMAP vs POP3.** With an IMAP configuration you get \`email:mark-as-read\`, \`email:delete\`, \`email:move-to-folder\` and \`email:expunge-folder\`, plus the listener options Enable Watermark and Imap Matcher. IMAP attributes also carry more metadata, such as the answered, deleted, draft, recent and seen flags. The POP3 listener has no watermark option.

**4. POP3 repeat retrieval.** POP3 cannot look up a message by UID, so operations that target one message by id are not available after retrieval. **Delete after retrieve** is the only way to remove it, so make the processing safe first: store the statement durably, then let the message go. Keep the flow idempotent on a business key such as the statement number.
`,
  followUps: [
    {
      q: 'Why not use POP3 for the claims mailbox too? It is simpler.',
      a: 'The claims flow needs to keep messages on the server and file them in folders. Those operations belong to the IMAP configuration, and POP3 could only delete messages after retrieval.',
    },
    {
      q: 'What timeouts apply to these connections?',
      a: 'Connection, read and write timeouts default to 5 seconds. Raise them only with a reason, such as a slow relay or large attachments, and keep them explicit in the configuration.',
    },
    {
      q: 'Which listeners need a scheduling strategy?',
      a: 'The IMAP listener polls, so it requires a scheduling strategy. Choose the frequency from how fresh the data must be and how much load the mail server tolerates.',
    },
  ],
}
