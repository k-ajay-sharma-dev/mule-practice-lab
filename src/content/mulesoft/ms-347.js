export default {
  id: 'ms-347',
  category: 'mulesoft',
  title: 'The SFTP Listener Stopped Picking Up Plan Files: What to Check First',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'sftp', 'production-support', 'planning-platform', 'listener', 'troubleshooting'],
  estMinutes: 20,
  quiz: [
    {
      type: 'order',
      prompt: 'No plan files were picked up last night. Put the first checks in order.',
      items: [
        'Check the files are really in the folder the listener polls, with the expected names',
        'Check the app logs for connection or authentication errors from the SFTP connector',
        'Check the matcher, the watermark and any minimum age or size rule',
        'Check where processed files go and whether a move or delete step fails',
      ],
      explain: 'First prove there is something to pick up, then prove the listener can see it.',
    },
    {
      type: 'single',
      prompt: 'The logs show "Auth fail" since yesterday. Nothing changed in the app. What is the likely cause?',
      options: [
        'A firewall rule now blocks port 22 between Mule and the server',
        'The partner removed or rotated our key, or the password expired',
        'The listener thread pool is exhausted by an earlier slow poll',
        'The files arrived with a name the matcher does not accept',
      ],
      answer: 1,
      explain: '"Auth fail" means the connection opened and the login was refused, so a blocked port or a file name rule would show other errors. Ask the partner what changed on their side and when.',
    },
    {
      type: 'single',
      prompt: 'The logs show a host key mismatch after the partner moved servers. What should you do?',
      options: [
        'Accept the new key on the first connect, then pin it in known hosts',
        'Confirm the new fingerprint with the partner, then update known hosts',
        'Add the new key next to the old one in known hosts, in case the move is rolled back',
        'Ask the partner to copy the old host key onto the new server',
      ],
      answer: 1,
      explain: 'Get the new fingerprint through a trusted channel, such as a call or a signed mail, and compare it before you update the known hosts entry. A changed host key is exactly what an attacker in the middle would cause. Accepting the first key seen, or adding it next to the old one, trusts it without that check. Copying the old key means moving a private key between servers, which the partner should not do.',
    },
    {
      type: 'multi',
      prompt: 'The files are there and the connection works, but nothing is picked up. What could stop the listener?',
      options: [
        'The watermark is set and the files kept an older modified time from the sender',
        'The matcher pattern expects .csv and the files end in .CSV',
        'A minimum age rule with a server clock in another time zone',
        'Auto delete is off, so the listener skips files it may not delete',
        'Recursive is off, and the files sit in the watched folder itself',
      ],
      answer: [0, 1, 2],
      explain: 'A watermark skips files older than the last one seen, the pattern match is case sensitive, so .csv misses .CSV, and a clock in another zone can make every file look too new. With auto delete off, files are still read. Without a watermark or a move, they are read again on the next poll, which is a different problem. Recursive only decides whether subfolders are read; files in the watched folder are read either way.',
    },
    {
      type: 'single',
      prompt: 'Files were picked up but stay in the folder and are picked up again every poll. What do you check?',
      options: [
        'The polling frequency, which may be shorter than the processing time',
        'The post action: a missing target folder or no rights to move or delete',
        'The file encoding, which may stop the reader from finishing the file',
        'The max concurrency of the flow, which may start a second reader',
      ],
      answer: 1,
      explain: 'If the move or delete fails, the file stays and the next poll picks it up again. Read only accounts are common on partner servers. Agree who moves processed files.',
    },
    {
      type: 'single',
      prompt: 'How would you catch this problem earlier next time?',
      options: [
        'Alert on every ERROR line the SFTP connector writes to the logs',
        'Alert when no plan is processed by a set time, and on repeated errors',
        'Add a health check that fails when the app stops running',
        'Alert when CPU or memory on the worker goes above a threshold',
      ],
      answer: 1,
      explain: 'An alert on missing work catches silent failures that error alerts miss. A matcher or watermark that skips the files writes no ERROR line at all. A health check passes while the app runs and idles. CPU and memory stay low when no work arrives.',
    },
  ],
  description: `
Marrow & Pine Home receives replenishment plans from the planning platform every night on the platform's SFTP server. The Mule app polls the outbound folder. This morning, no plans were loaded and the stores had no orders. The app shows as running.

**Questions**
1. What do you check first?
2. Which connection problems can start without any change in the app?
3. If the connection works, what can still stop the listener?
4. How do you notice this before the stores do?
`,
  answerTemplate: `## First checks

## Connection problems without a release

## When the connection works

## Noticing earlier
`,
  keyPoints: [
    'Prove the files are there, with the expected names.',
    'Key rotation, expired passwords and host key changes break logins.',
    'Never turn off host key checks to get past a mismatch.',
    'Watermarks, matcher case and age rules can hide files.',
    'A failing post action makes files repeat.',
    'Alert when expected work did not arrive.',
  ],
  solution: `
**1. First checks.** Log in with an SFTP client using the app's account and confirm the files are in the polled folder with the expected names. Then read the app logs for connector errors.

**2. Connection problems.** The partner may have rotated keys, removed the public key, expired a password, changed IP allow lists or moved to a new server with a new host key. For a host key change, get the fingerprint from the partner through a trusted channel and update the known hosts entry. Do not turn off the check.

**3. When the connection works.** A watermark skips files whose modified time is older than the last one seen, which happens when the sender keeps original times. A case sensitive matcher misses \`.CSV\`. A minimum age rule with a clock difference waits forever. Also check the post action: if the move or delete fails, files stay and are read again.

**4. Noticing earlier.** Alert when no plan has been processed by an agreed time, and when connector errors repeat. A green app status says nothing about missing work.
`,
  followUps: [
    {
      q: 'How do you test the app account without the app?',
      a: 'Use an SFTP client from a machine with the same outbound IP, using the same key, and list the folder.',
    },
    {
      q: 'What do you tell the stores while you fix it?',
      a: 'Give a time for the next update and the fallback, such as using yesterday\'s plan, agreed with the business owner.',
    },
    {
      q: 'Why did the app status stay green?',
      a: 'The listener retries its connection in the background. The app runs, so health checks pass unless they test the SFTP connection or recent work.',
    },
  ],
}
