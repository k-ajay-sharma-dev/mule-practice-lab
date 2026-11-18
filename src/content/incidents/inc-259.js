export default {
  id: 'inc-259',
  category: 'incidents',
  title: "A 6 GB FTP Download Restarts From Zero After Every Network Blip",
  level: 'ADVANCED',
  tags: ["myproject","ftp","large-files","resume"],
  estMinutes: 25,
  investigation: {
    logs: [
      { text: "2026-11-18 00:10:00 INFO  [archive-in] Download start /out/history.dat sizeBytes=6442450944", relevant: true, why: "A very large file." },
      { text: "2026-11-18 00:52:00 ERROR [archive-in] Read failed at bytes=4831838208 Connection reset", relevant: true, why: "A reset at 75 percent." },
      { text: "2026-11-18 00:52:05 INFO  [archive-in] Retry download from offset 0", relevant: true, why: "It starts again from the beginning." },
      { text: "2026-11-18 06:00:00 WARN  [archive-in] Download not finished by cut off", relevant: true, why: "It never finishes." },
      { text: "2026-11-18 23:59:00 INFO  [archive-in] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why does it never finish?",
        options: [
          "Each blip restarts the whole 6 GB download",
          "The file is too big for FTP",
          "The disk is slow",
          "The server is down",
        ],
        answer: 0,
        explain: "Long transfers meet more blips.",
      },
      {
        type: 'single',
        prompt: "What can help?",
        options: [
          "Resume from the last offset if the server supports REST, or ask for smaller split files",
          "Download faster",
          "Use ASCII mode",
          "Retry from zero sooner",
        ],
        answer: 0,
        explain: "Resume or reduce the unit of work.",
      },
      {
        type: 'multi',
        prompt: "What else helps?",
        options: [
          "Ask for compressed files",
          "Ask for daily deltas instead of full history",
          "Verify size or checksum at the end",
          "Load into memory",
        ],
        answer: [0,1,2],
        explain: "Smaller transfers fail less.",
      },
      {
        type: 'single',
        prompt: "What does the FTP REST command do?",
        options: [
          "Starts a transfer from a byte offset",
          "Deletes a file",
          "Lists a folder",
          "Changes mode",
        ],
        answer: 0,
        explain: "It allows resuming.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Ask the partner to split today’s file",
          "Download the parts",
          "Verify sizes",
          "Agree deltas and compression",
          "Add resume support",
        ],
        explain: "Unblock, verify, improve.",
      },
    ],
  },
  description: `
## Symptoms
- The weekly history download has not finished in three runs.

## Change / Context
- A partner sends full sales history as one file over FTP.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 00:10:00 INFO  [archive-in] Download start /out/history.dat sizeBytes=6442450944
2026-11-18 00:52:00 ERROR [archive-in] Read failed at bytes=4831838208 Connection reset
2026-11-18 00:52:05 INFO  [archive-in] Retry download from offset 0
2026-11-18 06:00:00 WARN  [archive-in] Download not finished by cut off
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
    "Long transfers are fragile.",
    "Resume from an offset if supported.",
    "Split large files.",
    "Compress and send deltas.",
    "Verify size or checksum.",
    "Stream to disk, not memory.",
  ],
  solution: `
**Diagnosis.** Network resets restart the 6 GB download from zero, so it never finishes.

**Immediate mitigation.**
- Ask for split files today.

**Root cause.** One huge file and no resume.

**Permanent fix.**
- Resume support, or split and compress at source.

**Prevention.** Agree deltas and size checks.
`,
  followUps: [
    { q: "Does the Mule FTP connector resume?", a: "Check the connector docs. Many designs split files at source instead." },
    { q: "Why compress?", a: "Text files often shrink a lot, which shortens transfers." },
    { q: "How do you verify?", a: "Compare size, and a checksum if the partner sends one." },
    { q: "What about SFTP?", a: "Same issue. Smaller files and resume where supported." },
  ],
}
