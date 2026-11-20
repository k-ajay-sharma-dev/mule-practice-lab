export default {
  id: 'inc-235',
  category: 'incidents',
  title: "Writing a 3 GB Export to the Share Over REST Fails Half Way and Leaves a Broken File",
  level: 'ADVANCED',
  tags: ["myproject","azure-file-share","large-files","range-writes"],
  estMinutes: 25,
  investigation: {
    logs: [
      { text: "2026-11-18 01:30:00 INFO  [sales-history] Create file sales_history.csv sizeBytes=3221225472", relevant: true, why: "The file is created at full size first." },
      { text: "2026-11-18 01:42:10 ERROR [sales-history] Put range failed offset=1610612736 status=500 code=OperationTimedOut", relevant: true, why: "One range write failed half way." },
      { text: "2026-11-18 01:42:10 INFO  [sales-history] Flow ended with error, no cleanup", relevant: true, why: "Nothing removed the half written file." },
      { text: "2026-11-18 06:00:00 WARN  [planning-platform] sales_history.csv has 0x00 bytes from row 4120331", relevant: true, why: "The reader got zeros after the failed range." },
      { text: "2026-11-18 23:59:00 INFO  [sales-history] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why does the receiver see zero bytes?",
        options: [
          "The file was made at full size, and later ranges were never written",
          "The failed range was retried at the wrong offset and overwrote rows",
          "The export wrote UTF-16, so every second byte reads as a zero",
          "The share pads files with zeros once they pass 1.5 GB",
        ],
        answer: 0,
        explain: "Unwritten ranges read back as zeros.",
      },
      {
        type: 'single',
        prompt: "What should the writer do?",
        options: [
          "Write a temp name, retry failed ranges, and rename when all succeed",
          "Write to the final name, and retry the failed range on the next run",
          "Create the file empty and let each range write grow it as it goes",
          "Write larger ranges so the whole file needs fewer calls in total",
        ],
        answer: 0,
        explain: "The receiver must never see an incomplete file.",
      },
      {
        type: 'multi',
        prompt: "Which make the write more reliable?",
        options: [
          "Retry each range with backoff",
          "Track which ranges succeeded so you can resume",
          "Delete the temp file if the run gives up",
          "Write the whole file in one request",
        ],
        answer: [0,1,2],
        explain: "Each range is small and can be retried alone.",
      },
      {
        type: 'single',
        prompt: "How does Mule avoid loading 3 GB into memory?",
        options: [
          "Stream the source and write fixed size chunks",
          "Store the whole export in a variable first",
          "Run the export on a worker with 4 GB of heap",
          "Build the CSV in one DataWeave transform",
        ],
        answer: 0,
        explain: "Streams and chunks keep memory flat.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Tell the receiver not to use the file",
          "Delete the broken file",
          "Rewrite it with temp name and retries",
          "Add a size and trailer check",
          "Agree a completeness signal",
        ],
        explain: "Contain, clean, redo, check, agree.",
      },
    ],
  },
  description: `
## Symptoms
- The planning platform reports nulls in sales history after row 4,120,331.

## Change / Context
- The export writes a large CSV to the share through the REST API in ranges.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 01:30:00 INFO  [sales-history] Create file sales_history.csv sizeBytes=3221225472
2026-11-18 01:42:10 ERROR [sales-history] Put range failed offset=1610612736 status=500 code=OperationTimedOut
2026-11-18 01:42:10 INFO  [sales-history] Flow ended with error, no cleanup
2026-11-18 06:00:00 WARN  [planning-platform] sales_history.csv has 0x00 bytes from row 4120331
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
    "Azure Files writes large files in ranges.",
    "Unwritten ranges read as zeros.",
    "Write to a temp name and rename.",
    "Retry and track ranges.",
    "Stream to keep memory flat.",
    "Clean up on failure.",
  ],
  solution: `
**Diagnosis.** A range write timed out half way. The file stayed at full size with zeros after that point.

**Immediate mitigation.**
- Delete the file and rewrite it.

**Root cause.** The writer used the final name and had no retry or cleanup.

**Permanent fix.**
- Temp name, range retries, rename on success, delete on give up.

**Prevention.** Trailer counts and a completeness signal for the receiver.
`,
  followUps: [
    { q: "Why is the file created at full size?", a: "The REST API creates the file with its size, then ranges fill it." },
    { q: "How big is each range?", a: "There is a maximum per call, so you write in chunks below it." },
    { q: "Is blob storage better for this?", a: "Block blobs only appear when committed, which avoids partial reads." },
    { q: "How does the reader check completeness?", a: "Trailer row count or a control file." },
  ],
}
