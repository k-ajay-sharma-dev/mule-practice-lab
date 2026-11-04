export default {
  id: 'ms-082',
  category: 'mulesoft',
  title: 'Email Attachments and Sending: Payload Body, Attachment Maps, Timeouts and EMAIL Errors',
  level: 'INTERMEDIATE',
  tags: ['email', 'attachments', 'smtp', 'imap', 'dataweave', 'error-handling'],
  estMinutes: 20,
  quiz: [
    {
      type: 'single',
      prompt: 'An IMAP listener receives a supplier email with `statement.pdf` attached. Where is the attachment in Mule 4?',
      options: [
        'In a map on the payload, for example `payload.attachments.\'statement.pdf\'`',
        'In a separate inbound attachments scope on the message',
        'In `attributes.headers`',
        'In `vars.attachments`, which the listener creates',
      ],
      answer: 0,
      explain: 'The payload holds the body and the attachments, and attachments are a map read with DataWeave. `payload.body` gives the body. There is no separate attachments scope to read from.',
    },
    {
      type: 'single',
      prompt: 'A flow receives an email with two attachments and forwards it with `email:send`. What arrives at the recipient?',
      options: [
        'Only what the flow set explicitly: outbound attachments must be given in the Attachments parameter',
        'Both attachments, because they travel with the Mule event',
        'Both attachments, but only if the same mail server is used',
        'The attachments, converted to text in the body',
      ],
      answer: 0,
      explain: 'Nothing is carried over implicitly. The Attachments parameter takes a DataWeave expression that evaluates to a map.',
    },
    {
      type: 'single',
      prompt: 'In the Attachments map of `email:send`, what does each key represent?',
      options: [
        'The attachment filename',
        'The MIME type of the attachment',
        'The recipient of that attachment',
        'The position of the attachment in the email',
      ],
      answer: 0,
      explain: 'Each key is the attachment filename and each value is its content. So `{ "report.pdf": vars.report }` sends one file called report.pdf.',
    },
    {
      type: 'single',
      prompt: 'The Content field on `email:send` is left empty and the payload is a PDF. What happens?',
      options: [
        'The operation uses the payload as the body, and a non-text payload causes EMAIL:SEND',
        'The PDF is added as an attachment automatically',
        'The email is sent with an empty body',
        'The flow raises EMAIL:ACCESSING_FOLDER',
      ],
      answer: 0,
      explain: 'Content defaults to the payload. Set an explicit text body and pass the PDF in Attachments instead.',
    },
    {
      type: 'multi',
      prompt: 'A nightly flow sends a 4 MB PDF as an attachment. Which statements are correct?',
      options: [
        'Pass the PDF as binary content; do not convert it to a string',
        'The connector Base64-encodes non-text attachments by default',
        'Content Transfer Encoding can change that default',
        'A PDF must be converted to JSON before it can be attached',
      ],
      answer: [0, 1, 2],
      explain: 'Attachments stay binary. Turning a PDF into a string corrupts it, and JSON has no role here.',
    },
    {
      type: 'match',
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
