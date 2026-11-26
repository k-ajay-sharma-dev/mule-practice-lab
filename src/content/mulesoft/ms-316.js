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
        'The server deletes the mail, since the session broke during a fetch',
        'The mail is still in the inbox and is processed again, so it must be safe to repeat',
        'Mule restores the event from its persistent queue and finishes the move to the folder',
        'The server holds the mail back until its own retry time has passed',
      ],
      answer: 1,
      explain: 'Email has no transaction across Mule and the mail server. Design for at least once. A flow that relies only on the Seen flag can miss the mail instead, which is why moving it after processing is safer.',
    },
    {
      type: 'single',
      prompt: 'Which value identifies a mail across repeats?',
      options: [
        'The subject, since suppliers put the file name in it',
        'The Message-ID header, ideally together with a hash of the attachment',
        'The received time, which the server sets once for each mail',
        'The size of the mail, since a repeat is byte for byte the same',
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
        'Delete it, so the inbox only holds mail that can be processed',
        'Reply to the sender with the parse error, so the supplier can resend',
      ],
      answer: [0, 1, 2],
      explain: 'An Error folder stops the repeat and keeps the mail for checks, the Message-ID ties the reason to the mail, and the owner can chase the supplier. Leaving a bad mail in the inbox creates a poison message that fails on every poll. Deleting it loses the evidence and the file. An automatic reply goes to whatever the From header says, which can be forged, and it can start a mail loop with an auto responder. The feed owner should talk to the supplier.',
    },
    {
      type: 'single',
      prompt: 'Two Mule workers in a cluster both run the mailbox listener. What is the risk, and what helps?',
      options: [
        'None, since IMAP lets only one session read a folder at a time',
        'Both can fetch the same mail, so run the listener on the primary node only',
        'The first worker locks the mailbox for its session, so the second one waits',
        'The server refuses a second login with the same account, so the second worker stops',
      ],
      answer: 1,
      explain: 'Polling sources such as mail listeners are commonly set to primary node only in a cluster.',
    },
    {
      type: 'single',
      prompt: 'A mail has three attachments: a CSV, a PDF and a logo image from the signature. What should the flow pick?',
      options: [
        'All of them, so the business team can check them later',
        'Those that match the agreed name pattern and content type, such as *.csv',
        'The largest one, since data files are bigger than images',
        'The first one, since suppliers attach the data file first',
      ],
      answer: 1,
      explain: 'Ignore the rest. Content types from senders vary, so check the file name extension too.',
    },
    {
      type: 'single',
      prompt: 'How do you guard against a mail from an unknown sender that looks like a supplier file?',
      options: [
        'Accept mail only when the From domain matches the domain of a known supplier',
        'Allow only known senders, and check the mail system enforces SPF, DKIM and DMARC',
        'Reply to each new sender and process the file once they confirm',
        'Accept a sender when the attachment parses as a valid supplier file with known item codes',
      ],
      answer: 1,
      explain: 'The From header can be forged, so a sender list works only when the mail system checks SPF, DKIM and DMARC on the way in. A domain match on its own trusts that forgeable header. A reply goes to the From address, which a forger can control. A file that parses only shows the attacker knows the format.',
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
