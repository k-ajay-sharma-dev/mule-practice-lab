export default {
  id: 'inc-314',
  category: 'incidents',
  title: "The Planning Platform Rejects a 5 GB Sales File",
  level: 'INTERMEDIATE',
  tags: ["myproject","large-files","planning-platform","sftp","split"],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: "2026-11-18 04:00:00 INFO  [sales-out] Uploaded sales_full.dat sizeBytes=5368709120", relevant: true, why: "A very large upload." },
      { text: "2026-11-18 04:30:00 ERROR [planning-platform] Import failed: file exceeds 2 GB limit", relevant: true, why: "The receiver has a limit." },
      { text: "2026-11-18 04:30:00 INFO  [planning-platform] Interface spec: split files at 1 GB with sequence numbers", relevant: true, why: "The spec says split." },
      { text: "2026-11-18 04:31:00 WARN  [planners] Sales not updated", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why was the file rejected?",
        options: [
          "It is over the 2 GB limit, and the spec asks for split files",
          "The record layout of sales_full.dat does not match the spec",
          "The file arrived after the 04:00 import window closed",
          "The SFTP upload stopped before the full 5 GB arrived",
        ],
        answer: 0,
        explain: "Follow the spec.",
      },
      {
        type: 'single',
        prompt: "What should the export do?",
        options: [
          "Write 1 GB parts with sequence numbers and a control file",
          "Split into two 2.5 GB parts with sequence numbers",
          "Send the full file twice so one of the imports succeeds",
          "Strip unused columns until the single file is under 2 GB",
        ],
        answer: 0,
        explain: "Split by size with a clear set.",
      },
      {
        type: 'multi',
        prompt: "What does the control file list?",
        options: [
          "Each part name",
          "Rows in each part",
          "Total rows",
          "The SFTP user that uploaded each part",
        ],
        answer: [0,1,2],
        explain: "The receiver checks the set.",
      },
      {
        type: 'single',
        prompt: "How do you split while streaming?",
        options: [
          "Write rows to a part until it hits the size limit, then roll over",
          "Load the whole file into memory, then cut it into parts",
          "Count all rows with sizeOf first, then split evenly",
          "Write the full file, then split it with a second pass",
        ],
        answer: 0,
        explain: "Roll over as you go.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Split today’s file",
          "Send parts and control file",
          "Confirm import",
          "Change the export to roll over",
          "Test with the largest day",
        ],
        explain: "Recover, confirm, fix, test.",
      },
    ],
  },
  description: `
## Symptoms
- Planners see no sales update today.

## Change / Context
- The sales export grew after adding new stores.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 04:00:00 INFO  [sales-out] Uploaded sales_full.dat sizeBytes=5368709120
2026-11-18 04:30:00 ERROR [planning-platform] Import failed: file exceeds 2 GB limit
2026-11-18 04:30:00 INFO  [planning-platform] Interface spec: split files at 1 GB with sequence numbers
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
    "Receivers have size limits.",
    "Follow the interface spec.",
    "Split with sequence numbers.",
    "Add a control file.",
    "Roll over while streaming.",
    "Test the largest day.",
  ],
  solution: `
**Diagnosis.** The 5 GB file exceeds the 2 GB limit.

**Immediate mitigation.**
- Split and resend.

**Root cause.** The export ignores the split rule in the spec.

**Permanent fix.**
- Roll over parts with a control file.

**Prevention.** Growth tests.
`,
  followUps: [
    { q: "Split by rows or bytes?", a: "Bytes match the limit, rows are quicker to count. Agree with the receiver." },
    { q: "Can a row cross a part?", a: "No, always split on row boundaries." },
    { q: "How does the receiver know the set is complete?", a: "The control file, written last." },
    { q: "What about compression?", a: "Helps, if the receiver accepts it." },
  ],
}
