export default {
  id: 'ms-348',
  category: 'mulesoft',
  title: 'Push or Pull, Whose SFTP Server, and How to Confirm Delivery: Design Trade Offs With the Planning Platform',
  level: 'EXPERT',
  tags: ['myproject', 'sftp', 'planning-platform', 'design', 'acknowledgement', 'trade-offs'],
  estMinutes: 30,
  quiz: [
    {
      type: 'match',
      prompt: 'Match each SFTP setup to its main trade off.',
      pairs: [
        ['We push to the platform server', 'We control timing, but depend on their uptime, keys and folder rules'],
        ['The platform pulls from our server', 'We control the server and audit, but must run it and expose it safely'],
        ['Both sides use a managed transfer service', 'Less to run, with an extra system in the path and its own cost'],
      ],
      explain: 'There is no single right answer. The interviewer wants to hear the trade offs.',
    },
    {
      type: 'single',
      prompt: 'The retailer must prove what it sent and when, for disputes about plans built on wrong data. Which setup helps most?',
      options: [
        'Hosting the server ourselves, since its logs then show every pull',
        'Keeping each sent file with its checksum, send time and the ack',
        'Asking the platform team to keep their transfer logs for a year',
        'Pushing to their server, since the upload result proves delivery',
      ],
      answer: 1,
      explain: 'Keep your own copy, checksum, send time and the platform ack, whichever side hosts the server. Your own record is the evidence. Server logs show a transfer, not what the file held, and the other side may not keep theirs.',
    },
    {
      type: 'multi',
      prompt: 'What should the interface agreement with the platform team cover for files sent over SFTP?',
      options: [
        'Folder layout, file naming, temporary names and the ready signal',
        'Ack format, the maximum wait for an ack and what a rerun produces',
        'Key rotation process and contacts',
        'The platform’s internal tables that the files are loaded into',
        'The SFTP client library each side uses',
        'The names of our Mule flows and error handlers, so they can follow a failure',
      ],
      answer: [0, 1, 2],
      explain: 'The agreement covers the boundary: where files go and how they are named and marked ready, how and when an ack comes back, what a rerun sends, and how keys rotate and who to call. Internal tables, client libraries and flow names sit inside one side. Each team can change them without telling the other, so they do not belong in the agreement.',
    },
    {
      type: 'single',
      prompt: 'The platform only pulls files at fixed times, every 2 hours. Sales files are ready at 01:10. What is the risk?',
      options: [
        'No risk, since the server hides a file from listings until the writer closes it',
        'The file waits for the next pull, and a half written file can be read',
        'The platform pulls the same file twice, once at each scheduled time',
        'The server locks the file while it is written, so the pull fails',
      ],
      answer: 1,
      explain: 'A file finished at 01:10 waits until the next pull. Without a ready signal, a pull that starts while the file is written takes a partial file. Pull designs need the ready signal even more, because the reader decides the time. SFTP servers do not usually lock files being written.',
    },
    {
      type: 'single',
      prompt: 'Which choice makes key rotation least risky for push?',
      options: [
        'Switch Mule to the new key and the partner account at an agreed time',
        'Add the new public key, switch Mule to it, then remove the old key',
        'Use one key for all partners so one rotation covers every feed',
        'Keep the key pair and set a new passphrase, so the partner side needs no change',
      ],
      answer: 1,
      explain: 'Add the new public key to the partner account first, so both keys work for a short overlap. That removes the cut over moment. Shared keys widen the damage of a leak.',
    },
    {
      type: 'single',
      prompt: 'An interviewer asks why not use the platform\'s API instead of SFTP. What is a fair answer?',
      options: [
        'APIs cannot carry more than a few megabytes in one request',
        'APIs suit small changes, large nightly snapshots often suit files',
        'Files are encrypted at rest on the server, while API payloads are not',
        'SFTP needs no firewall changes, while an API needs new rules',
      ],
      answer: 1,
      explain: 'Large snapshots often go as files because they stream well and can be replayed. Name the data size, frequency and replay needs. The platform\'s supported options decide in the end.',
    },
  ],
  description: `
Thornbury Freight's retail client is moving its sales, inventory and master data feeds to the planning platform. The platform team offers an SFTP server with their folder rules. The retailer's security team would prefer to host the server, so it controls keys and audit. Plans come back the other way. You are asked to compare the options in a design review.

**Questions**
1. What are the trade offs of push to their server versus pull from yours?
2. How do you confirm delivery, whichever side hosts?
3. What must the interface agreement cover?
4. How do you handle keys, timing and the API question?
`,
  answerTemplate: `## Push or pull

## Confirming delivery

## The interface agreement

## Keys, timing and APIs
`,
  keyPoints: [
    'Push gives control of timing, pull gives control of the server.',
    'Keep your own record of sent files with checksums and acks.',
    'Agree naming, ready signals, acks and rerun rules in writing.',
    'Pull designs need ready signals and add latency.',
    'Rotate keys with an overlap period.',
    'Files suit large snapshots, APIs suit small changes.',
  ],
  solution: `
**1. Push or pull.** Pushing to the platform server means the retailer decides when files go, but depends on the partner's uptime, keys and folder rules. Hosting your own server and letting the platform pull keeps keys, logs and retention under your control, but you must run it, patch it and expose it safely. A managed transfer service sits between the two.

**2. Confirming delivery.** Whatever the setup, keep a copy of each file sent, with checksum, row count and send time. Ask for an ack file per file with the result and counts, and alert when an ack does not arrive in time.

**3. The interface agreement.** Folder layout, file names, temporary names and the ready signal. Ack format and timing. Rerun and resend rules. Key rotation steps, contacts and maintenance windows.

**4. Keys, timing and APIs.** Rotate keys with an overlap: add the new key, switch, then remove the old one. With pull, the partner's schedule adds delay, and the ready signal protects against half files. For the API question: APIs fit small, frequent changes. Large nightly snapshots often stay as files because they stream and replay well, within what the platform supports.
`,
  followUps: [
    {
      q: 'Who owns a file once it is on the partner server?',
      a: 'Agree it in the interface: usually the partner owns it after the ack, and the sender keeps its own copy for an agreed time.',
    },
    {
      q: 'How do you keep the plans coming back safe from tampering?',
      a: 'Check the checksum or signature if the platform provides one, read only from the agreed folder, and validate the plan before loading.',
    },
    {
      q: 'What would make you choose a managed transfer service?',
      a: 'Many partners, strict audit needs and a small team. It centralises keys, logs and retries for every feed.',
    },
  ],
}
