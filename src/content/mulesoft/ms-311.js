export default {
  id: 'ms-311',
  category: 'mulesoft',
  title: 'Sending Email From Mule: SMTP, SMTPS and STARTTLS Ports and the Send Operation',
  level: 'BEGINNER',
  tags: ['myproject', 'email', 'smtp', 'tls', 'email-connector', 'connection'],
  estMinutes: 12,
  quiz: [
    {
      type: 'single',
      prompt: 'Which Mule connector sends email over SMTP?',
      options: [
        'The HTTP connector',
        'The Email connector, with an SMTP or SMTPS configuration and the Send operation',
        'The File connector',
        'The JMS connector',
      ],
      answer: 1,
      explain: 'The same connector also reads mail with IMAP and POP3 listeners and operations.',
    },
    {
      type: 'match',
      prompt: 'Match each port with what it is usually used for.',
      pairs: [
        ['25', 'Server to server relay, often blocked for clients'],
        ['587', 'Mail submission, upgraded to TLS with STARTTLS'],
        ['465', 'Mail submission over TLS from the first byte (SMTPS)'],
      ],
      explain: 'Your mail team decides which one the relay accepts. Port 587 with STARTTLS is common for authenticated submission.',
    },
    {
      type: 'single',
      prompt: 'What is the difference between SMTPS and STARTTLS?',
      options: [
        'They are the same',
        'SMTPS starts TLS before any SMTP command. STARTTLS starts in plain text, then the client asks to switch to TLS',
        'STARTTLS has no encryption',
        'SMTPS is only for reading mail',
      ],
      answer: 1,
      explain: 'Make sure STARTTLS is required, not optional, so a failed upgrade does not send in plain text.',
    },
    {
      type: 'single',
      prompt: 'The send fails with a TLS handshake error to the internal relay. What is the usual cause?',
      options: [
        'The body is too large',
        'The relay certificate comes from an internal CA that the Mule truststore does not trust',
        'The subject has accents',
        'The port is 587',
      ],
      answer: 1,
      explain: 'Add the CA to a truststore in a TLS context. Turning checks off hides a real risk.',
    },
    {
      type: 'multi',
      prompt: 'What do you set on the Send operation for a job report?',
      options: [
        'From address, to addresses and a subject',
        'A body with its content type, such as text/plain or text/html',
        'Attachments when needed',
        'The IMAP folder',
      ],
      answer: [0, 1, 2],
      explain: 'Folders belong to reading mail, not sending it.',
    },
    {
      type: 'single',
      prompt: 'Where do the SMTP user and password belong?',
      options: [
        'In the flow XML',
        'In secure properties per environment, read into the SMTP configuration',
        'In the email subject',
        'In a DataWeave variable',
      ],
      answer: 1,
      explain: 'Some internal relays accept mail from known hosts without login. Cloud mail usually needs authentication.',
    },
  ],
  description: `
Marrow & Pine Home wants its nightly inbound jobs to send a short report email to the support team. The mail team says to use the internal relay, gives a host name and port 587, and says TLS is required. The first test fails with a certificate error.

**Questions**
1. Which connector and configuration do you use?
2. What do ports 25, 587 and 465 mean?
3. How do SMTPS and STARTTLS differ?
4. Why did the certificate error appear, and how do you fix it?
`,
  answerTemplate: `## Connector and config

## Ports

## SMTPS and STARTTLS

## The certificate error
`,
  keyPoints: [
    'Use the Email connector with an SMTP or SMTPS config and Send.',
    '25 relay, 587 submission with STARTTLS, 465 SMTPS.',
    'SMTPS is TLS from the start. STARTTLS upgrades a plain connection.',
    'Require STARTTLS, do not leave it optional.',
    'Trust the relay CA in a TLS context.',
    'Keep credentials in secure properties.',
  ],
  solution: `
**1. Connector and config.** Add the Email connector. For port 587 use an SMTP configuration and turn on STARTTLS, for example through the connection properties. For port 465 use the SMTPS configuration with a TLS context. Set a connection and read timeout so a slow relay does not hang the flow.

**2. Ports.** Port 25 is for relays talking to each other and is often blocked for clients. Port 587 is for submission by clients, with STARTTLS. Port 465 is SMTP over TLS from the first byte.

**3. SMTPS and STARTTLS.** With SMTPS the client opens TLS straight away. With STARTTLS the client connects in plain text, sees the server offers STARTTLS, and asks to switch. If STARTTLS is optional and the upgrade fails, some clients send in plain text, so require it.

**4. The certificate error.** The relay presents a certificate from an internal CA. Java does not trust it. Add the CA certificate to a truststore and point the TLS context at it. Do not set the context to trust everything outside a local test.
`,
  followUps: [
    {
      q: 'How do you test the relay from the Mule host without Mule?',
      a: 'Use a tool such as openssl s_client with -starttls smtp to see the certificate and the server greeting.',
    },
    {
      q: 'Should a job wait for the email to be sent?',
      a: 'Usually not. Send it in an Async scope or through a queue, so a mail problem does not fail the job.',
    },
    {
      q: 'What from address do you use?',
      a: 'A shared no reply or integration mailbox on the company domain, such as integration@marrow.example, which the mail team allows to send.',
    },
  ],
}
