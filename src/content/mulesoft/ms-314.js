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
        'The relay rewrote the text, since SMTP carries only 7 bit ASCII',
        'UTF-8 bytes were labelled or read as ISO-8859-1',
        'The reader’s mail client lacks a font with German characters',
        'The HTML body was escaped twice, so the umlaut became two characters',
      ],
      answer: 1,
      explain: 'Set the body content type with charset=UTF-8. The bytes and the declared charset must match. Set the encoding on the body and attachments.',
    },
    {
      type: 'single',
      prompt: 'A report mail carries an HTML body and a plain text copy for older clients. Readers see both versions one after the other, as if they were separate parts. Which structure was used, and which is right?',
      options: [
        'multipart/mixed was used, and multipart/alternative is right',
        'multipart/alternative was used, and multipart/related is right',
        'multipart/related was used, and multipart/mixed is right',
        'message/rfc822 was used, and multipart/related is right',
      ],
      answer: 0,
      explain: 'In multipart/alternative the parts are versions of the same content, and the client shows the best one it supports. multipart/mixed is for a body plus attachments, so clients show every part, which matches what readers saw. multipart/related ties HTML to inline images, and message/rfc822 is a whole mail inside another.',
    },
    {
      type: 'single',
      prompt: 'An HTML job report shows customer data that a record contained, such as a name with a <script> tag. What should the flow do?',
      options: [
        'Remove any text between < and > from each value before it goes into the body',
        'Escape values put into HTML, so text cannot become markup',
        'Set the body content type to text/html with charset=UTF-8, so the tag shows as text',
        'Drop the record from the load, since it holds a script',
      ],
      answer: 1,
      explain: 'Escaping turns < and & into entities, so the value shows as written and cannot become markup. Removing text between angle brackets changes real data and misses broken tags. A text/html content type tells the client to render markup, which is the problem. The record may be valid data, so dropping it from the load is not the fix. Better still, keep such data out of the mail.',
    },
    {
      type: 'single',
      prompt: 'A 15 MB PDF is attached to a report mail. The relay accepts mails up to 20 MB, yet it rejects this one as too large. Why?',
      options: [
        'The relay counts one copy of the mail per recipient, and it went to two addresses',
        'The library sent the PDF as quoted-printable, which doubles the size of binary data',
        'The HTML body and the plain text copy of the mail each carry their own PDF copy',
        'The PDF travels base64 encoded, which makes it about a third larger, near 20 MB',
      ],
      answer: 3,
      explain: 'Mail carries binary attachments as text, usually base64, which adds about a third. A 15 MB file becomes about 20 MB, and the headers and body push it over. A size limit applies to one message, not to each recipient. Mail libraries pick base64, not quoted-printable, for binary content. An attachment is one part of the mail, whatever versions of the body exist.',
    },
    {
      type: 'multi',
      prompt: 'How do you attach a CSV of rejects with the Mule Email connector?',
      options: [
        'Add an entry to the attachments map, keyed by file name, with the content',
        'Make sure the content carries a text/csv media type, with a charset',
        'Write the CSV with DataWeave output application/csv before sending',
        'Set the CSV text as the value of a custom mail header',
        'Base64 encode the CSV in DataWeave before adding it to the attachments',
        'Put the CSV in the body and set the body content type to text/csv',
      ],
      answer: [0, 1, 2],
      explain: 'The attachments map entry gives the file name, and the text/csv media type with a charset tells the receiving client how to open it. DataWeave writes the CSV text. A header is not an attachment. The connector handles the transfer encoding, so a Base64 string of your own arrives as unreadable text. A CSV body replaces the report text instead of attaching a file.',
    },
    {
      type: 'single',
      prompt: 'A support engineer opens the raw source of a report mail and sees Subject: =?UTF-8?B?w5xiZXJzaWNodA==?= where the report said "Übersicht". What does it mean?',
      options: [
        'It is an RFC 2047 encoded word, which mail clients decode and show as Übersicht',
        'The relay encrypted the subject, since the session to the relay used TLS',
        'The library encoded the subject twice, so readers will see this text as it is',
        'DKIM signing replaced the non ASCII subject with a hash of its bytes',
      ],
      answer: 0,
      explain: 'Headers were designed for ASCII, so libraries encode non ASCII text as an encoded word: charset, B for base64, then the bytes. Clients decode it, so readers see Übersicht. TLS protects the session, not single headers in the message. A double encoding would wrap one encoded word in another, and this is a single one. DKIM signs headers but does not change them. Problems usually come from a wrong charset setting.',
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
