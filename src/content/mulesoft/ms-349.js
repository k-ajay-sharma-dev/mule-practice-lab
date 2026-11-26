export default {
  id: 'ms-349',
  category: 'mulesoft',
  title: 'Reading FTP Reply Codes: 421, 425, 426, 530, 550 and 553',
  level: 'BEGINNER',
  tags: ['myproject', 'ftp', 'reply-codes', 'production-support', 'troubleshooting', 'retry'],
  estMinutes: 15,
  quiz: [
    {
      type: 'match',
      prompt: 'Match each FTP reply code to its usual meaning.',
      pairs: [
        ['421', 'Service not available, the server is closing the connection'],
        ['425', 'Cannot open the data connection'],
        ['530', 'Not logged in'],
        ['550', 'File not found or no access'],
      ],
      explain: 'Learn the first digit rule too: 4 means try later, 5 means it will fail again as it is.',
    },
    {
      type: 'single',
      prompt: 'An upload logs "150 Opening data connection", then the flow hangs and never logs a 226. How do you read that?',
      options: [
        'The upload is complete, since 150 is a success reply and the 226 is optional',
        'The server refused the upload for now, so a retry a bit later should work',
        'The transfer started, but the final reply never came, so look at the data connection',
        'The server needs more input, such as the password, before it opens the data channel',
      ],
      answer: 2,
      explain: 'A first digit of 1 means the action started and another reply will follow. 226 is that final reply: the transfer finished and the data connection closed. Without it, the transfer stalled on the data connection, for example a firewall that drops it. A first digit of 2 means done, 3 means more input is needed, and 4 means try later, so 150 is none of those.',
    },
    {
      type: 'single',
      prompt: 'Logins work, but every file download fails with 425. What is the likely cause?',
      options: [
        'The account may log in but has no read rights on the folder',
        'A firewall blocks the data connection, often the passive port range',
        'The files are locked by the sender while it still writes them',
        'The connector uses ASCII mode for files the server stores as binary',
      ],
      answer: 1,
      explain: 'The control channel on port 21 works, which is why the login passes. Files move on a separate data connection. Missing rights or a locked file would give a 550 reply instead.',
    },
    {
      type: 'single',
      prompt: 'An upload stops with 426 halfway through a large file. Which action fits?',
      options: [
        'Resume the upload from the byte where the last attempt stopped',
        'Retry to a temporary name, and rename it only once it is complete',
        'Mark the file as sent, since the server already holds part of it',
        'Retry the upload at once, using the final file name as before',
      ],
      answer: 1,
      explain: '426 means the transfer was aborted. The partial file on the server must not look finished, so upload under a temporary name and rename it after a complete transfer. Resume is not supported by every server and still exposes the partial file.',
    },
    {
      type: 'single',
      prompt: 'Uploads to the DC 07 server to /inbound/dc07/receipts/ get 553. The same flow uploads to the other DCs without errors. What do you check first?',
      options: [
        'That the receipts folder exists on DC 07 and the file name fits its naming rules',
        'The free disk on the DC 07 server, since a full disk refuses each new upload',
        'The DC 07 login, since its password may have expired since the last good run',
        'The passive port range on the DC 07 firewall, which may block the data channel',
      ],
      answer: 0,
      explain: '553 means the file name is not allowed, often because the target folder does not exist or the name breaks a rule on that server. A full disk gives 452 or 552, a failed login gives 530, and a blocked data connection gives 425.',
    },
    {
      type: 'multi',
      prompt: 'Which replies are worth an automatic retry with a wait?',
      options: ['421', '425 when it happens now and then', '530', '550'],
      answer: [0, 1],
      explain: '530 and 550 need someone to fix a credential, path or permission.',
    },
  ],
  description: `
Quayle Freight exchanges receipts and shipment files with distribution centers over FTP. Support often sees FTP reply codes in error messages and asks what they mean. Explain the codes an integration developer meets most, and what to do about each.

**Questions**
1. How do you read the first digit of a reply code?
2. What do 421, 425 and 426 mean, and what do you do?
3. What do 530, 550 and 553 mean, and what do you do?
4. Which replies should be retried automatically?
`,
  answerTemplate: `## The first digit

## 421, 425 and 426

## 530, 550 and 553

## What to retry
`,
  keyPoints: [
    '2 means done, 3 means more input, 4 means try later, 5 means it will fail again.',
    '425 often means a blocked passive port range.',
    '426 is an aborted transfer, so the server copy is partial.',
    '530 is a login problem, 550 a missing file or no access.',
    '553 points at the file name or path.',
    'Retry 4xx replies a few times, alert on 5xx replies.',
  ],
  solution: `
**1. The first digit.** 1 means started, wait for more. 2 means done. 3 means the server needs more, such as a password after a user name. 4 means a temporary problem, try later. 5 means a permanent problem for this request.

**2. 421, 425 and 426.** 421: the server is closing, often for maintenance or too many sessions. Retry later. 425: the data connection could not open, often a firewall or passive port range problem. 426: the transfer was cut off. Retry to a temporary name and rename only when complete.

**3. 530, 550 and 553.** 530: not logged in, usually a wrong or expired credential or a locked account. 550: the file is missing, or the account has no access. 553: the file name is not allowed or the folder does not exist.

**4. What to retry.** Retry 421, 425 and 426 a few times with a wait. Alert at once on 530, 550 and 553, since repeating them does not help and can lock the account.
`,
  followUps: [
    {
      q: 'Why can a retry of 530 make things worse?',
      a: 'Many servers lock an account after a number of failed logins, so automatic retries can turn a wrong password into a locked account.',
    },
    {
      q: 'How do you see the raw replies in Mule?',
      a: 'Turn on debug logging for the FTP connector package for a short time. The error message often holds only a summary.',
    },
    {
      q: 'A 550 shows up only for some files. What do you check?',
      a: 'The exact names, case and folder of those files, and whether they were moved or deleted by another job before the read.',
    },
  ],
}
