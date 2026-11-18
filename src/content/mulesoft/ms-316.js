export default {
  id: 'ms-316',
  category: 'mulesoft',
  title: 'Polling a Mailbox for Supplier Files: Moving Messages, Duplicates and Failures',
  level: 'ADVANCED',
  tags: ['myproject', 'email', 'imap', 'polling', 'idempotency', 'attachments'],
  estMinutes: 25,
  quiz: [
    {
      type: 'single',
      prompt: 'An IMAP flow processes an attachment, then the app crashes before it moves the mail. On restart, what happens?',
      options: [
        'The mail is lost',
        'The mail is still in the inbox and is processed again, so the processing must be safe to repeat',
        'The mail server knows it was processed',
        'Mule restores its memory',
      ],
      answer: 1,
      explain: 'Email has no transaction across Mule and the mail server. Design for at least once.',
    },
    {
      type: 'single',
      prompt: 'Which value identifies a mail across repeats?',
      options: [
        'The subject',
        'The Message-ID header, ideally together with a hash of the attachment',
        'The received time',
        'The size',
      ],
      answer: 1,
      explain: 'A supplier who resends the same file creates a new Message-ID, so the attachment hash catches that case.',
    },
    {
      type: 'multi',
      prompt: 'What should the flow do with a mail whose attachment fails to parse?',
      options: [
        'Move it to an Error folder so it is not picked up again',
        'Record the reason with the Message-ID',
        'Alert the business owner of the supplier feed',
        'Leave it in the inbox to retry every minute',
      ],
      answer: [0, 1, 2],
      explain: 'Leaving a bad mail in the inbox creates a poison message that fails on every poll.',
    },
    {
      type: 'single',
      prompt: 'Two Mule workers in a cluster both run the mailbox listener. What is the risk, and what helps?',
      options: [
        'None',
        'Both can fetch the same mail. Run the listener on the primary node only',
        'The mailbox is locked',
        'IMAP refuses the second login',
      ],
      answer: 1,
      explain: 'Polling sources such as mail listeners are commonly set to primary node only in a cluster.',
    },
    {
      type: 'single',
      prompt: 'A mail has three attachments: a CSV, a PDF and a logo image from the signature. What should the flow pick?',
      options: [
        'All of them',
        'Attachments that match the agreed name pattern and content type, such as *.csv with text/csv, and ignore the rest',
        'The largest one',
        'The first one',
      ],
      answer: 1,
      explain: 'Content types from senders vary, so check the file name extension too.',
    },
    {
      type: 'single',
      prompt: 'How do you guard against a mail from an unknown sender that looks like a supplier file?',
      options: [
        'Trust the From header',
        'Allow only known sender addresses, and treat the From header as weak proof. Check that the mail system enforces SPF, DKIM and DMARC on inbound mail',
        'Reply to ask who they are',
        'Open the attachment and look',
      ],
      answer: 1,
      explain: 'The From header can be forged. Inbound checks by the mail system make forging harder.',
    },
  ],
  description: `
Quayle Freight receives delivery confirmation files from small carriers by email. Mule polls a shared mailbox, reads the CSV attachment, loads it into a database and moves the mail. After an outage, some files were loaded twice. A mail with a broken file failed on every poll for a day. A forged mail with a fake file was also loaded once.

**Questions**
1. Why were files loaded twice, and how do you prevent it?
2. How do you handle a mail that always fails?
3. Which attachments should the flow take?
4. How do you deal with clusters and forged senders?
`,
  answerTemplate: `## Loaded twice

## Poison mails

## Which attachments

## Clusters and senders
`,
  keyPoints: [
    'Mail processing is at least once: make it safe to repeat.',
    'Record Message-ID and an attachment hash to spot repeats.',
    'Move failed mail to an Error folder and alert.',
    'Pick attachments by name pattern and content type.',
    'Run the mail listener on the primary node only.',
    'Allow known senders and rely on SPF, DKIM and DMARC checks.',
  ],
  solution: `
**1. Loaded twice.** The flow loaded the file and the app stopped before the mail was moved, so the next poll took the same mail. Record the Message-ID and a hash of the attachment in a table before loading. If either was seen, move the mail to Processed and stop. Make the load itself an upsert where possible.

**2. Poison mails.** A file that cannot be parsed fails on every poll. Catch the error, move the mail to an Error folder, store the reason with the Message-ID and alert the owner of that carrier feed. Do not leave it in the inbox.

**3. Which attachments.** Take only attachments whose file name matches the agreed pattern and whose content type fits, such as \`*.csv\` with \`text/csv\` or \`application/octet-stream\`. Ignore signature images and other parts. A mail with no matching file goes to the Error folder.

**4. Clusters and senders.** In a cluster, run the listener on the primary node only, so two nodes do not fetch the same mail. Keep a list of allowed sender addresses per carrier, and remember the From header can be forged. Ask the mail team to apply SPF, DKIM and DMARC checks on inbound mail, and treat files from mail as untrusted input that is validated before loading.
`,
  followUps: [
    {
      q: 'What if a carrier sends the file inside a zip?',
      a: 'Unzip it in the flow with the Compression module, check the inner file names and sizes, and guard against very large unzipped sizes.',
    },
    {
      q: 'How often should the listener poll?',
      a: 'As often as the business needs, for example every few minutes. Very short intervals add load on the mail server for little gain.',
    },
    {
      q: 'How would you move away from email for this feed?',
      a: 'Offer carriers an SFTP drop or a simple upload API. Keep the mailbox for those who cannot change.',
    },
  ],
}
