export default {
  id: 'inc-242',
  category: 'incidents',
  title: "The Planning Platform Picks Up Item Files Before Upload Ends",
  level: 'INTERMEDIATE',
  tags: ["myproject","sftp","blue-yonder","outbound","rename"],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: "2026-11-18 03:10:00 INFO  [item-out] Upload start /to-planning/items_20261118.txt sizeBytes=812000000", relevant: true, why: "A large upload writes straight to the final name." },
      { text: "2026-11-18 03:12:00 INFO  [planning-platform] Import started items_20261118.txt", relevant: true, why: "The platform starts reading it." },
      { text: "2026-11-18 03:12:30 WARN  [planning-platform] Import ended rows=210400 expected trailer missing", relevant: true, why: "It read part of the file." },
      { text: "2026-11-18 03:19:00 INFO  [item-out] Upload complete items_20261118.txt", relevant: true, why: "Mule finished after the import." },
      { text: "2026-11-18 23:59:00 INFO  [item-out] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "What went wrong?",
        options: [
          "Mule wrote straight to the final name so the platform saw an incomplete file",
          "The platform is slow",
          "The file is too large",
          "The encoding is wrong",
        ],
        answer: 0,
        explain: "The reader cannot tell a growing file from a finished one.",
      },
      {
        type: 'single',
        prompt: "How should Mule write the file?",
        options: [
          "Write to a temp name such as .tmp, then rename to the final name",
          "Write it twice",
          "Write it slower",
          "Zip it",
        ],
        answer: 0,
        explain: "The platform only sees the final name when complete.",
      },
      {
        type: 'multi',
        prompt: "Which extra signals help the receiver?",
        options: [
          "A trailer with the row count",
          "A control file written last",
          "A checksum in the control file",
          "A comment in the log",
        ],
        answer: [0,1,2],
        explain: "The receiver can verify completeness.",
      },
      {
        type: 'single',
        prompt: "Which SFTP operation finishes the write?",
        options: [
          "rename, or move, within the same server",
          "copy",
          "delete",
          "list",
        ],
        answer: 0,
        explain: "A rename on the same server is quick and atomic.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Tell the platform to ignore today’s partial import",
          "Resend with temp name and rename",
          "Confirm the full import",
          "Add a trailer",
          "Use the same pattern for every outbound file",
        ],
        explain: "Contain, fix, confirm, harden, spread.",
      },
    ],
  },
  description: `
## Symptoms
- Item master import in the planning platform is missing a quarter of items.

## Change / Context
- Mule uploads the nightly item file to the platform’s SFTP folder. The platform polls that folder.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 03:10:00 INFO  [item-out] Upload start /to-planning/items_20261118.txt sizeBytes=812000000
2026-11-18 03:12:00 INFO  [planning-platform] Import started items_20261118.txt
2026-11-18 03:12:30 WARN  [planning-platform] Import ended rows=210400 expected trailer missing
2026-11-18 03:19:00 INFO  [item-out] Upload complete items_20261118.txt
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
    "Never write to the final name directly.",
    "Temp name then rename.",
    "Trailers and control files help.",
    "Rename is atomic on the same server.",
    "Use the pattern for every outbound file.",
    "Confirm the receiver imported fully.",
  ],
  solution: `
**Diagnosis.** Mule wrote the file under its final name. The platform started reading before it finished.

**Immediate mitigation.**
- Resend with temp name and rename.

**Root cause.** Outbound writes have no completeness signal.

**Permanent fix.**
- Write .tmp, then rename. Add a trailer.

**Prevention.** A shared outbound write pattern for all partners.
`,
  followUps: [
    { q: "Will the platform ignore .tmp files?", a: "Agree a pattern it ignores, such as names ending in .tmp." },
    { q: "What if rename is not allowed?", a: "Use a separate upload folder, then move, or write a control file last." },
    { q: "Is a trailer enough alone?", a: "It detects the problem but the import still starts too early." },
    { q: "How large can SFTP files be?", a: "Large, as long as you stream rather than load into memory." },
  ],
}
