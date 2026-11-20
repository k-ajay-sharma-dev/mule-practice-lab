export default {
  id: 'inc-227',
  category: 'incidents',
  title: "Half a Sales File Was Loaded Because the Poll Read It While It Was Still Being Copied",
  level: 'BEGINNER',
  tags: ["myproject","azure-file-share","partial-files","polling"],
  estMinutes: 15,
  investigation: {
    logs: [
      { text: "2026-11-18 02:00:05 INFO  [sales-loader] Picked file=sales_20261117.csv sizeBytes=4194304", relevant: true, why: "The file was read at a round size, a sign it was mid copy." },
      { text: "2026-11-18 02:00:40 INFO  [sales-loader] Loaded rows=41200 file=sales_20261117.csv", relevant: true, why: "Fewer rows than usual." },
      { text: "2026-11-18 02:01:30 INFO  [pos-export] Finished writing sales_20261117.csv sizeBytes=9830112", relevant: true, why: "The producer finished after the read." },
      { text: "2026-11-18 07:30:00 WARN  [recon] Sales total mismatch store count=118 of 260", relevant: true, why: "Only part of the stores arrived." },
      { text: "2026-11-18 23:59:00 INFO  [sales-loader] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "What went wrong?",
        options: [
          "The loader read the file while the export was still writing it",
          "The loader stopped at a 4 MB read buffer and skipped the rest",
          "The database rejected rows for stores with bad sales totals",
          "The export split the day into two files, and one was missed",
        ],
        answer: 0,
        explain: "The read finished at 02:00 and the write at 02:01.",
      },
      {
        type: 'single',
        prompt: "Which convention fixes this best?",
        options: [
          "The export writes a temp name and renames it when done",
          "The loader waits 2 minutes after it first sees a file",
          "The loader polls once an hour instead of every 5 minutes",
          "The loader takes a lock on the file before reading it",
        ],
        answer: 0,
        explain: "A rename is the signal that the file is complete.",
      },
      {
        type: 'multi',
        prompt: "Which other signals can mark a finished file?",
        options: [
          "A separate done or control file written last",
          "A size that stays the same across two checks",
          "A trailer record with a row count",
          "A file name that includes the business date",
        ],
        answer: [0,1,2],
        explain: "Each gives the loader a way to know the file is complete.",
      },
      {
        type: 'single',
        prompt: "What do you do with today’s load?",
        options: [
          "Delete the partial rows and load the full file again",
          "Load the full file on top, since rows already in will be skipped",
          "Keep the partial load and add the missing stores tomorrow",
          "Load only the rows after row 41,200 from the full file",
        ],
        answer: 0,
        explain: "Reload cleanly. Partial data is worse than late data.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Stop downstream use of the sales data",
          "Remove the partial load",
          "Load the complete file",
          "Agree the rename or control file convention",
          "Add a row count check",
        ],
        explain: "Contain, recover, then prevent.",
      },
    ],
  },
  description: `
## Symptoms
- The morning reconciliation shows sales for 118 of 260 stores.

## Change / Context
- The point of sale export writes a CSV to the share. The loader polls the share every 5 minutes and loads any file it sees.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 02:00:05 INFO  [sales-loader] Picked file=sales_20261117.csv sizeBytes=4194304
2026-11-18 02:00:40 INFO  [sales-loader] Loaded rows=41200 file=sales_20261117.csv
2026-11-18 02:01:30 INFO  [pos-export] Finished writing sales_20261117.csv sizeBytes=9830112
2026-11-18 07:30:00 WARN  [recon] Sales total mismatch store count=118 of 260
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
    "A poller can see a file before it is complete.",
    "Write to a temp name, then rename.",
    "Control files or trailers prove completeness.",
    "A size stable check helps when you cannot change the producer.",
    "Reload partial data cleanly.",
    "Reconcile counts after every load.",
  ],
  solution: `
**Diagnosis.** The loader picked up the file while the export was still writing, and loaded the first 4 MB.

**Immediate mitigation.**
- Remove the partial rows and load the full file.

**Root cause.** No agreed signal that a file is complete.

**Permanent fix.**
- Producer writes .tmp and renames, or writes a control file last. Loader checks a trailer count.

**Prevention.** Make completeness signals part of every file interface spec.
`,
  followUps: [
    { q: "Why not wait a fixed time?", a: "Big days take longer. A timer only moves the race." },
    { q: "What if you cannot change the producer?", a: "Check that size and last modified stay unchanged across two polls." },
    { q: "What is a trailer record?", a: "A last line with the row count, so the reader can prove it got everything." },
    { q: "Should the load be all or nothing?", a: "Yes, load into staging and switch only when counts match." },
  ],
}
