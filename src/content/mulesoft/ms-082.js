export default {
  id: 'ms-082',
  category: 'mulesoft',
  title: 'Email Attachments and Sending: Payload Body, Attachment Maps, Timeouts and EMAIL Errors',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'email', 'attachments', 'smtp', 'imap', 'dataweave', 'error-handling'],
  estMinutes: 20,
  quiz: [
    {
      type: 'single',
      detail: true,
      prompt: 'An IMAP listener receives a supplier email with `statement.pdf` attached. Where is the attachment in Mule 4?',
      options: [
        'In a map on the payload, for example `payload.attachments.\'statement.pdf\'`',
        'In a separate inbound attachments scope, for example `message.inboundAttachments`',
        'In the headers, for example `attributes.headers.\'statement.pdf\'`',
        'In a variable the listener creates, for example `vars.attachments`',
      ],
      answer: 0,
      explain: 'The payload holds the body and the attachments, and attachments are a map read with DataWeave. `payload.body` gives the body. There is no separate attachments scope to read from.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'A flow receives an email with two attachments and forwards it with `email:send`. What arrives at the recipient?',
      options: [
        'Neither attachment, unless the flow sets them in the Attachments parameter',
        'Both attachments, because they travel with the Mule event payload',
        'Both attachments, as long as the same mail server sends the email',
        'The attachments, converted to text and appended to the body',
      ],
      answer: 0,
      explain: 'Nothing is carried over implicitly: outbound attachments must be given in the Attachments parameter. The Attachments parameter takes a DataWeave expression that evaluates to a map.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'One `email:send` must carry two PDFs held in `vars.pdf1` and `vars.pdf2`, each named after its order, for example `ORD-17.pdf`. The order numbers are in `vars.order1` and `vars.order2`. Which Attachments expression is right?',
      options: [
        '`#[{ "application/pdf": [vars.pdf1, vars.pdf2] }]`, keyed by the MIME type',
        '`#[[vars.pdf1, vars.pdf2]]`, an array the connector names in order',
        '`#[{ (vars.order1 ++ ".pdf"): vars.pdf1, (vars.order2 ++ ".pdf"): vars.pdf2 }]`',
        '`#[{ (vars.order1): vars.pdf1, (vars.order2): vars.pdf2 }]`, keyed by order number',
      ],
      answer: 2,
      explain: 'Attachments is a map where each key is the attachment filename and each value is its content. A dynamic key in parentheses builds the name from the order, and `++ ".pdf"` adds the extension. Keying by the order number alone sends files called `ORD-17` with no extension. The key is not a MIME type, and a plain array gives the connector no filenames.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'The Content field on `email:send` is left empty and the payload is a PDF. What happens?',
      options: [
        'The payload becomes the body, and a non-text body raises EMAIL:SEND',
        'The connector attaches the PDF and sends an empty body instead',
        'The email is sent with an empty body and a warning is logged',
        'The flow raises EMAIL:ACCESSING_FOLDER before the send starts',
      ],
      answer: 0,
      explain: 'Content defaults to the payload. Set an explicit text body and pass the PDF in Attachments instead.',
    },
    {
      type: 'single',
      prompt: 'A flow sends a PDF with `email:send`, using the Attachments parameter (a map of filename to content). What should the value in the map be?',
      options: [
        'The PDF read as a UTF-8 string, because a MIME message is text',
        'A Base64 string of the PDF, because mail attachments travel as Base64',
        'The binary PDF content, for example `vars.pdf`',
        'The file path of the PDF, which the connector reads at send time',
      ],
      answer: 2,
      explain: 'Attachments stay binary. The connector Base64-encodes non-text attachments by default, so encoding it yourself sends the recipient a Base64 text file. Reading a PDF as a UTF-8 string corrupts its bytes. A path is only a string, so the recipient gets a file that holds the path, not the PDF.',
    },
    {
      type: 'match',
      detail: true,
      prompt: 'Match each operation to the errors listed for it in the connector reference.',
      pairs: [
        ['email:send', 'EMAIL:SEND, EMAIL:CONNECTIVITY, EMAIL:RETRY_EXHAUSTED'],
        ['email:mark-as-read', 'EMAIL:EMAIL_NOT_FOUND, EMAIL:ACCESSING_FOLDER, EMAIL:CONNECTIVITY, EMAIL:RETRY_EXHAUSTED'],
        ['email:expunge-folder', 'EMAIL:ACCESSING_FOLDER, EMAIL:CONNECTIVITY, EMAIL:RETRY_EXHAUSTED'],
      ],
      explain: 'The reference lists these errors by name only. The one trigger the docs spell out is a non-text payload used as the body, which fails with EMAIL:SEND. Expunge takes no email id, and its list has no EMAIL:EMAIL_NOT_FOUND.',
    },
  ],
  description: `
A bank's supplier onboarding team receives signed forms by email in a monitored mailbox, about 300 a day. Each email has one or more PDF attachments. A Mule app must:

1. Read the email body and save every attachment to the document store.
2. Forward the signed form to the compliance team, with the PDF attached.
3. Send the supplier a confirmation.

Test results so far:

- The forwarded email reached compliance with no attachment.
- A test with a PDF as the payload failed with \`EMAIL:SEND\`.
- Large PDFs sometimes fail on a slow relay.

**Questions**
1. Where are the body and attachments on a received email, and how do you read them?
2. How do you send attachments, and why did the forward arrive without one?
3. What caused the \`EMAIL:SEND\` failure?
4. Which timeouts and errors would you handle, and how?
`,
  answerTemplate: `## Reading the body and attachments

## Sending attachments

## The EMAIL:SEND failure

## Timeouts and errors
`,
  keyPoints: [
    'The payload holds body and attachments. In Mule 4 attachments are a map on the payload, read with DataWeave.',
    'Metadata such as subject and addresses is in the attributes, not the payload.',
    'Outbound attachments must be set explicitly on email:send. Nothing is carried over from an incoming email.',
    'The Attachments parameter is a DataWeave map: the key is the filename and the value is the content.',
    'Content defaults to the payload, and a non-text payload causes EMAIL:SEND.',
    'Keep binary files binary. Non-text attachments are Base64-encoded by default.',
    'Connection, read and write timeouts default to 5 seconds.',
  ],
  solution: `
**1. Reading.** The payload has two parts: \`payload.body\` and \`payload.attachments\`. Attachments are a map, so you can read one by name or loop over all of them:
\`\`\`dataweave
%dw 2.0
output application/java
---
payload.attachments pluck ((content, name) -> { fileName: name, content: content })
\`\`\`
Read the subject, addresses and flags from the attributes.

**2. Sending.** Outbound attachments must be set explicitly. The forward arrived empty because the flow did not pass any in \`email:send\`. The Attachments parameter takes a map where each key is the filename:
\`\`\`xml
<email:send config-ref="smtps" subject="Signed supplier form">
  <email:to-addresses>
    <email:to-address value="compliance@example.com"/>
  </email:to-addresses>
  <email:body>
    <email:content>#["Signed form attached."]</email:content>
  </email:body>
  <email:attachments>#[{ 'signed-form.pdf': vars.signedForm }]</email:attachments>
</email:send>
\`\`\`
Keep the PDF binary. The connector Base64-encodes non-text attachments by default, and Content Transfer Encoding can change that.

**3. The EMAIL:SEND failure.** Content defaults to the payload. With a PDF as the payload and no explicit Content, the body is not text, and that causes \`EMAIL:SEND\`. Set a text body and pass the PDF as an attachment.

**4. Timeouts and errors.** Connection, read and write timeouts default to **5 seconds**, so raise them on the SMTP connection if a slow relay needs longer, and record why. The reference lists the error types by name only, so the meanings below are what the names suggest. Confirm them against real failures.
- \`EMAIL:CONNECTIVITY\` and \`EMAIL:RETRY_EXHAUSTED\`: probably the server could not be reached. Use a reconnection strategy, and park the message for a later retry.
- \`EMAIL:SEND\`: the send failed. Check the content before retrying.
- \`EMAIL:EMAIL_NOT_FOUND\` and \`EMAIL:ACCESSING_FOLDER\`: probably the id or folder is wrong for the mailbox. Log them with the id and alert someone.

Save the attachments to the document store before you change any mailbox state, so a failed send does not cost you the original.
`,
  followUps: [
    {
      q: 'How do you send a file from an SFTP read as an attachment?',
      a: 'Keep the content binary, store it in a variable, and put it in the Attachments map under the filename you want the recipient to see.',
    },
    {
      q: 'Does the Attachments map have to be fixed in the flow?',
      a: 'No. It is a DataWeave expression, so you can build it dynamically, for example from the attachments of a received email or from a list of generated files.',
    },
    {
      q: 'If the email body is HTML, what do you set?',
      a: 'Set ContentType on the body, for example text/html. The default body handling converts the payload to plain text where possible.',
    },
  ],
}
