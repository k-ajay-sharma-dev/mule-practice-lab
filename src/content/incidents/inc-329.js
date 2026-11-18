export default {
  id: 'inc-329',
  category: 'incidents',
  title: "The SFTP Server Disk Fills and Uploads Stop at Month End",
  level: 'ADVANCED',
  tags: ["myproject","sftp","disk","capacity"],
  estMinutes: 25,
  investigation: {
    logs: [
      { text: "2026-11-30 21:00:00 ERROR [sales-out] Write failed: No space left on device", relevant: true, why: "The server disk is full." },
      { text: "2026-11-30 21:00:00 INFO  [sftp-server] /archive size=480GB of 500GB", relevant: true, why: "Archives fill the disk." },
      { text: "2026-11-30 21:00:00 INFO  [sales-out] Month end file sizeBytes=9000000000", relevant: true, why: "A very large month end file." },
      { text: "2026-11-30 21:05:00 INFO  [sales-out] Temp file left /to-planning/sales.tmp sizeBytes=6000000000", relevant: true, why: "A partial temp file remains." },
      { text: "2026-11-30 23:59:00 INFO  [sales-out] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why do uploads stop?",
        options: [
          "Archives fill the server disk and the month end file does not fit",
          "The key expired",
          "The network",
          "The platform",
        ],
        answer: 0,
        explain: "No space left.",
      },
      {
        type: 'single',
        prompt: "What should happen to the partial temp file?",
        options: [
          "Delete it so it does not hold space or confuse anyone",
          "Rename it to final",
          "Keep it forever",
          "Upload again next to it",
        ],
        answer: 0,
        explain: "Clean up failed uploads.",
      },
      {
        type: 'multi',
        prompt: "What prevents this?",
        options: [
          "A retention rule for archives",
          "A disk usage alert",
          "A size check against free space before large uploads",
          "More archives",
        ],
        answer: [0,1,2],
        explain: "Capacity needs owners.",
      },
      {
        type: 'single',
        prompt: "Who owns archive retention?",
        options: [
          "The server owner with the data owners",
          "Mule",
          "Nobody",
          "The network team",
        ],
        answer: 0,
        explain: "Agree retention.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Free space by moving old archives",
          "Delete the temp file",
          "Resend the month end file",
          "Agree retention",
          "Add a disk alert",
        ],
        explain: "Free, clean, recover, agree, watch.",
      },
    ],
  },
  description: `
## Symptoms
- The month end sales file did not reach the planning platform.

## Change / Context
- Files are archived on the SFTP server and never removed.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-30 21:00:00 ERROR [sales-out] Write failed: No space left on device
2026-11-30 21:00:00 INFO  [sftp-server] /archive size=480GB of 500GB
2026-11-30 21:00:00 INFO  [sales-out] Month end file sizeBytes=9000000000
2026-11-30 21:05:00 INFO  [sales-out] Temp file left /to-planning/sales.tmp sizeBytes=6000000000
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
    "Server disks fill without retention.",
    "Peaks need free space.",
    "Delete partial temp files.",
    "Alert on disk usage.",
    "Agree retention.",
    "Resend after recovery.",
  ],
  solution: `
**Diagnosis.** Archives filled the disk, so the month end file failed half way.

**Immediate mitigation.**
- Free space, delete the temp file, resend.

**Root cause.** No retention for archives.

**Permanent fix.**
- Retention rule and disk alert.

**Prevention.** Check free space before big uploads.
`,
  followUps: [
    { q: "Can a client see free space?", a: "Some SFTP servers support a statvfs extension. Many do not." },
    { q: "Where should archives go?", a: "Cheaper storage with retention." },
    { q: "Why delete the temp file?", a: "It holds space and could be mistaken for data." },
    { q: "How much headroom?", a: "At least twice the largest file." },
  ],
}
