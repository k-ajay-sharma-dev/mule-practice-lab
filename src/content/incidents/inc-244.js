export default {
  id: 'inc-244',
  category: 'incidents',
  title: "Files Uploaded With an Old Timestamp Are Never Picked Up",
  level: 'INTERMEDIATE',
  tags: ["myproject","sftp","watermark","missed-files"],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: "2026-11-18 10:00:00 INFO  [vendor-in] Watermark last=2026-11-18T09:55:00", relevant: true, why: "The listener only reads files newer than this." },
      { text: "2026-11-18 10:01:00 INFO  [sftp-server] Upload /in/asn_V88.xml mtime=2026-11-15T16:00:00", relevant: true, why: "The vendor tool keeps the original file time." },
      { text: "2026-11-18 10:05:00 INFO  [vendor-in] New files=0", relevant: true, why: "The listener skips it." },
      { text: "2026-11-18 14:00:00 WARN  [warehouse] ASN missing for truck V88", relevant: true, why: "The truck arrives without an ASN." },
      { text: "2026-11-18 23:59:00 INFO  [vendor-in] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why was the file skipped?",
        options: [
          "Its modified time is older than the watermark, because the vendor tool keeps the original time",
          "The name is wrong",
          "The file is empty",
          "The folder is wrong",
        ],
        answer: 0,
        explain: "The watermark compares modified times.",
      },
      {
        type: 'single',
        prompt: "What is a safer approach here?",
        options: [
          "Turn off the watermark and move each file after processing, so anything in the folder is new",
          "Lower the poll interval",
          "Delete old files",
          "Ask the vendor to change the clock",
        ],
        answer: 0,
        explain: "With moves, presence in the folder means not yet processed.",
      },
      {
        type: 'multi',
        prompt: "What else helps?",
        options: [
          "Ask the vendor to upload with the current time",
          "Alert when an expected file has not arrived by a cut off",
          "Record processed names to avoid repeats",
          "Read only on Mondays",
        ],
        answer: [0,1,2],
        explain: "Each closes a gap.",
      },
      {
        type: 'single',
        prompt: "When is a watermark useful?",
        options: [
          "When files stay in place and you cannot move or delete them",
          "Always",
          "Never",
          "Only for FTP",
        ],
        answer: 0,
        explain: "It avoids rereading files you cannot move.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Process the missed ASN",
          "Check for other skipped files",
          "Change to move after processing",
          "Add an arrival alert",
          "Ask the vendor about file times",
        ],
        explain: "Recover, sweep, fix, watch, ask.",
      },
    ],
  },
  description: `
## Symptoms
- Some vendor ASNs are never processed, though the files are on the server.

## Change / Context
- The SFTP listener uses a watermark. Files stay in the folder after reading.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 10:00:00 INFO  [vendor-in] Watermark last=2026-11-18T09:55:00
2026-11-18 10:01:00 INFO  [sftp-server] Upload /in/asn_V88.xml mtime=2026-11-15T16:00:00
2026-11-18 10:05:00 INFO  [vendor-in] New files=0
2026-11-18 14:00:00 WARN  [warehouse] ASN missing for truck V88
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
    "A watermark compares modified times.",
    "Some tools keep old times on upload.",
    "Moving files avoids the issue.",
    "Alert on missing expected files.",
    "Sweep for skipped files.",
    "Know when a watermark fits.",
  ],
  solution: `
**Diagnosis.** The vendor tool preserves old modified times, so the watermark skips new files.

**Immediate mitigation.**
- Process the missed files.

**Root cause.** The design relied on modified time as an arrival signal.

**Permanent fix.**
- Move files after processing and drop the watermark.

**Prevention.** Arrival alerts for expected files.
`,
  followUps: [
    { q: "Why does the vendor keep the time?", a: "Many tools preserve times by default." },
    { q: "Is the watermark kept across restarts?", a: "Yes, it is stored in an object store." },
    { q: "What if you cannot move files?", a: "Track processed names and checksums instead." },
    { q: "How do you find all missed files?", a: "List the folder and compare with processed records." },
  ],
}
