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
        'A network issue',
        'The partner rotated or removed the public key on their side, or the account password expired',
        'A full disk on Mule',
        'A bad file name',
      ],
      answer: 1,
      explain: 'Ask the partner what changed on their side and when.',
    },
    {
      type: 'single',
      prompt: 'The logs show a host key mismatch after the partner moved servers. What should you do?',
      options: [
        'Turn off host key checking',
        'Get the new host key fingerprint from the partner through a trusted channel, compare it, and update the known hosts entry',
        'Accept whatever key the server sends',
        'Switch to plain FTP',
      ],
      answer: 1,
      explain: 'A changed host key is exactly what an attacker in the middle would cause. Confirm before you trust it.',
    },
    {
      type: 'multi',
      prompt: 'The files are there and the connection works, but nothing is picked up. What could stop the listener?',
      options: [
        'The watermark is set and the files kept an older modified time from the sender',
        'The matcher pattern expects .csv and the files end in .CSV',
        'A minimum age rule with a server clock in another time zone',
        'The files are larger than 1 MB',
      ],
      answer: [0, 1, 2],
      explain: 'File size alone does not stop a listener, unless a matcher rule sets a size limit.',
    },
    {
      type: 'single',
      prompt: 'Files were picked up but stay in the folder and are picked up again every poll. What do you check?',
      options: [
        'The CPU',
        'The post action: a move to a folder that does not exist, or no permission to rename or delete on the server',
        'The file encoding',
        'The batch job',
      ],
      answer: 1,
      explain: 'Read only accounts are common on partner servers. Agree who moves processed files.',
    },
    {
      type: 'single',
      prompt: 'How would you catch this problem earlier next time?',
      options: [
        'Read the logs every morning',
        'Alert when no plan file was processed by an expected time, and on repeated connector errors',
        'Poll every second',
        'Restart the app every night',
      ],
      answer: 1,
      explain: 'An alert on missing work catches silent failures that error alerts miss.',
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
