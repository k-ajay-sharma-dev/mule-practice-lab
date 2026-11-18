export default {
  id: 'inc-328',
  category: 'incidents',
  title: "Uploads Work but the Planning Platform Cannot Read the Files",
  level: 'INTERMEDIATE',
  tags: ["myproject","sftp","permissions","planning-platform"],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: "2026-11-18 03:00:00 INFO  [loc-out] Uploaded /to-planning/locations.txt", relevant: true, why: "The upload works." },
      { text: "2026-11-18 03:20:00 ERROR [planning-platform] Permission denied reading /to-planning/locations.txt", relevant: true, why: "The reader cannot open it." },
      { text: "2026-11-18 03:00:00 INFO  [sftp-server] File mode 600 owner=larkfield-int", relevant: true, why: "Only the owner can read." },
      { text: "2026-11-17 18:00:00 INFO  [sftp-server] Server umask changed to 077", relevant: true, why: "The server default changed." },
      { text: "2026-11-18 23:59:00 INFO  [loc-out] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why can the platform not read?",
        options: [
          "New files are created readable only by the uploader after a umask change",
          "The file is empty",
          "The name is wrong",
          "SFTP failed",
        ],
        answer: 0,
        explain: "File permissions block the reader.",
      },
      {
        type: 'single',
        prompt: "Who fixes it?",
        options: [
          "The SFTP server owner sets the right umask or group, agreed with both sides",
          "Mule alone",
          "The planning team alone",
          "Nobody",
        ],
        answer: 0,
        explain: "Server side settings.",
      },
      {
        type: 'multi',
        prompt: "What can the uploader do meanwhile?",
        options: [
          "Set file permissions after upload if the server allows it",
          "Ask for a shared group",
          "Test reads with the reader account",
          "Upload twice",
        ],
        answer: [0,1,2],
        explain: "Check access from the reader’s side.",
      },
      {
        type: 'single',
        prompt: "What should a new interface test include?",
        options: [
          "A read by the receiving account",
          "Only the upload",
          "Only login",
          "Nothing",
        ],
        answer: 0,
        explain: "End to end, not only your side.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Fix permissions on today’s file",
          "Agree the umask or group",
          "Resend if needed",
          "Add a reader access test",
          "Note the setting in the partner profile",
        ],
        explain: "Fix, agree, recover, test, record.",
      },
    ],
  },
  description: `
## Symptoms
- The planning platform reports permission denied on location files.

## Change / Context
- Both sides use the same SFTP server with different accounts.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 03:00:00 INFO  [loc-out] Uploaded /to-planning/locations.txt
2026-11-18 03:20:00 ERROR [planning-platform] Permission denied reading /to-planning/locations.txt
2026-11-18 03:00:00 INFO  [sftp-server] File mode 600 owner=larkfield-int
2026-11-17 18:00:00 INFO  [sftp-server] Server umask changed to 077
\`\`\`

## Your tasks
1. What is the most likely root cause?
2. What do you do right now?
3. What is the permanent fix?
4. How do you stop this class of issue happening again?
`,
  answerTemplate: `## Diagnosis

## Immediate mitigation

## Root cause

## Permanent fix

## Prevention
`,
  keyPoints: [
    "Uploads can succeed while reads fail.",
    "umask controls new file permissions.",
    "Agree group access.",
    "Test with the reader account.",
    "Record settings.",
    "Fix today’s files.",
  ],
  solution: `
**Diagnosis.** A new umask makes uploaded files private to the uploader.

**Immediate mitigation.**
- Fix permissions on today’s file.

**Root cause.** Server default changed without telling users.

**Permanent fix.**
- Agreed umask or shared group.

**Prevention.** Reader access tests.
`,
  followUps: [
    { q: "What is umask?", a: "A setting that removes permissions from newly created files." },
    { q: "Can SFTP set permissions?", a: "Many servers allow a chmod command after upload." },
    { q: "Why did uploads still work?", a: "The uploader owns the file." },
    { q: "Who owns the server?", a: "Whichever team hosts it. Agree changes with all users." },
  ],
}
