export default {
  id: 'ms-314',
  category: 'mulesoft',
  title: 'Email Bodies and Attachments: MIME Types, Charsets, HTML and Plain Text',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'email', 'mime', 'attachments', 'charset', 'html'],
  estMinutes: 18,
  quiz: [
    {
      type: 'single',
      prompt: 'A report email shows "BeschÃ¤digt" instead of "Beschädigt". What is the likely cause?',
      options: [
        'The relay changed the text',
        'UTF-8 bytes were labelled or read as ISO-8859-1. Set the body content type with charset=UTF-8',
        'The font is missing',
        'HTML is not allowed',
      ],
      answer: 1,
      explain: 'The bytes and the declared charset must match. Set the encoding on the body and attachments.',
    },
    {
      type: 'single',
      prompt: 'Which MIME structure carries a plain text and an HTML version of the same body?',
      options: ['multipart/mixed', 'multipart/alternative', 'application/zip', 'text/csv'],
      answer: 1,
      explain: 'The client shows the best version it supports. multipart/mixed is for a body plus attachments.',
    },
    {
      type: 'single',
      prompt: 'An HTML job report shows customer data that a record contained, such as a name with a <script> tag. What should the flow do?',
      options: [
        'Nothing, mail clients ignore it',
        'Escape values put into HTML, so text cannot become markup',
        'Send it as an attachment',
        'Remove all HTML',
      ],
      answer: 1,
      explain: 'Most clients block scripts, but broken or misleading markup is still a risk. Better still, keep such data out of the mail.',
    },
    {
      type: 'single',
      prompt: 'How are binary attachments carried in an email?',
      options: [
        'As raw bytes',
        'Encoded, usually base64, which makes them about a third larger than the file',
        'As a link only',
        'Compressed automatically',
      ],
      answer: 1,
      explain: 'A 15 MB file becomes about 20 MB in the mail, which counts against size limits.',
    },
    {
      type: 'multi',
      prompt: 'How do you attach a CSV of rejects with the Mule Email connector?',
      options: [
        'Add an entry to the attachments map, keyed by file name, with the content',
        'Make sure the content carries a text/csv media type, with a charset',
        'Write the CSV with DataWeave output application/csv before sending',
        'Put the CSV in the subject',
      ],
      answer: [0, 1, 2],
      explain: 'The file name and media type tell the receiving client how to open the attachment.',
    },
    {
      type: 'single',
      prompt: 'The subject contains "Übersicht". How does it travel in the mail headers?',
      options: [
        'As raw UTF-8 always',
        'Encoded with the RFC 2047 encoded word form, which mail libraries handle when the charset is set',
        'It is removed',
        'As HTML',
      ],
      answer: 1,
      explain: 'Headers were designed for ASCII. Libraries encode them. Problems usually come from a wrong charset setting.',
    },
  ],
  description: `
Marrow & Pine Home sends a daily reject report from Mule to its German and French buying teams. The body is HTML with a small table, and a CSV of rejects is attached. Users report broken accents in the body and the CSV, and one user could not open the attachment on a phone.

**Questions**
1. Why are accents broken, and how do you fix it?
2. How do you send both HTML and plain text?
3. How do you attach the CSV so clients open it?
4. What about values from records shown in HTML?
`,
  answerTemplate: `## Broken accents

## HTML and plain text

## The CSV attachment

## Record values in HTML
`,
  keyPoints: [
    'Declare charset=UTF-8 on the body and attachments.',
    'multipart/alternative carries text and HTML versions.',
    'multipart/mixed carries a body plus attachments.',
    'Attachments are base64 encoded, about a third larger.',
    'Give attachments a file name and a media type.',
    'Escape values put into HTML, and leave personal data out.',
  ],
  solution: `
**1. Broken accents.** The text was UTF-8 but was sent or read with another charset. Set the body content type to \`text/html; charset=UTF-8\` and write the CSV with UTF-8 too. Some spreadsheet tools read CSV better with a byte order mark, so agree a choice with the users.

**2. HTML and plain text.** A multipart/alternative message carries both, and the client shows the version it prefers. If the connector version you use cannot build that directly, send HTML with a short, clear layout, since most clients show HTML.

**3. The CSV attachment.** Build the CSV with DataWeave as \`application/csv\`, then add it to the attachments of the Send operation with a file name such as \`rejects-2026-11-18.csv\` and a \`text/csv\` media type with charset. The connector encodes it, usually as base64. If the file is large, send a link instead.

**4. Record values in HTML.** Escape \`<\`, \`>\` and \`&\` in any value put into HTML, so record text cannot become markup. Show keys and reasons, not names, addresses or other personal data.
`,
  followUps: [
    {
      q: 'Why might an inline image in the HTML not show?',
      a: 'Clients often block remote images. Inline images need a related part with a content ID, which adds size. Most reports do not need images.',
    },
    {
      q: 'How do you check what was sent?',
      a: 'Send to a test mailbox and view the raw source. You see the parts, content types, charsets and encodings.',
    },
    {
      q: 'Should the report be an Excel file?',
      a: 'CSV is smaller and lighter to build. If users need Excel, consider a link to a report in a shared location.',
    },
  ],
}
