export default {
  id: 'inc-219',
  category: 'incidents',
  title: "The Nightly Import Skips Files on Busy Days: List Blobs Returns One Page and the Next Marker Is Ignored",
  level: 'INTERMEDIATE',
  tags: ["myproject","azure-blob","listing","paging","batch"],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: "2026-11-18 01:00:01 INFO  [order-import] Listing container=incoming prefix=2026/11/17/", relevant: false },
      { text: "2026-11-18 01:00:03 INFO  [order-import] Listed blobs=5000 nextMarker=present", relevant: true, why: "There are more blobs than one page returns." },
      { text: "2026-11-18 01:20:00 INFO  [order-import] Processed files=5000", relevant: true, why: "Only the first page was processed." },
      { text: "2026-11-18 09:00:00 WARN  [reconcile] Files in container=7342 processed=5000", relevant: true, why: "More than 2,000 files were skipped." },
      { text: "2026-11-18 09:01:00 INFO  [order-import] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why are files skipped on busy days?",
        options: [
          "A list call returns a page of results, and the flow did not follow the next marker for more",
          "Azure hides files",
          "The files are too large",
          "The prefix is wrong",
        ],
        answer: 0,
        explain: "Listing is paged. Without following the marker, you only see the first page.",
      },
      {
        type: 'single',
        prompt: "Why did quiet days work?",
        options: [
          "Fewer files than one page, so one call returned them all",
          "They run faster",
          "The marker is only used at weekends",
          "Luck",
        ],
        answer: 0,
        explain: "The bug only shows when volume passes the page size.",
      },
      {
        type: 'multi',
        prompt: "How do you list everything safely?",
        options: [
          "Loop while a next marker is returned, passing it to the next call",
          "Use the connector’s paging or streaming support if it has one",
          "Process each page before asking for the next, to save memory",
          "Ask for a bigger page every time",
        ],
        answer: [0,1,2],
        explain: "Follow the paging. A larger page only moves the limit.",
      },
      {
        type: 'single',
        prompt: "How do you avoid processing a file twice across runs?",
        options: [
          "Move or tag processed blobs, or record them, so the next run ignores them",
          "Process everything every night",
          "Delete the container",
          "Rely on the order of the list",
        ],
        answer: 0,
        explain: "Paging finds everything. A processed marker stops repeats.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Process the skipped files",
          "Follow the next marker until there is none",
          "Mark processed blobs",
          "Reconcile counts every night",
          "Test with more files than one page",
        ],
        explain: "Recover, fix, prevent repeats, check, test.",
      },
    ],
  },
  description: `
## Symptoms
- On busy days the nightly order import misses thousands of files. Quiet days are fine.

## Change / Context
- The import lists blobs under the day’s prefix and processes each one.
- The list call returns at most one page of blobs, with a marker when more remain.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 01:00:03 INFO  [order-import] Listed blobs=5000 nextMarker=present
2026-11-18 01:20:00 INFO  [order-import] Processed files=5000
2026-11-18 09:00:00 WARN  [reconcile] Files in container=7342 processed=5000
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
    "List results are paged.",
    "Follow the next marker until it is empty.",
    "The bug appears only above one page of results.",
    "Mark processed blobs to avoid repeats.",
    "Reconcile counts nightly.",
    "Test with more files than one page.",
  ],
  solution: `
**Diagnosis.** The flow made one list call and processed only that page. On busy days there were more blobs, and the rest were never listed.

**Immediate mitigation.**
- Process the files that were skipped.

**Root cause.** Paging was ignored because tests never had enough files.

**Permanent fix.**
- Loop on the next marker, or use the connector paging, processing page by page.
- Move processed blobs to a processed prefix or record them.

**Prevention.** A nightly count check and a test with more files than one page.
`,
  followUps: [
    { q: "Why process page by page?", a: "Holding every name in memory for a large container wastes memory." },
    { q: "What is a prefix?", a: "The start of a blob name, used like a folder to list only some blobs." },
    { q: "Is the list order guaranteed?", a: "Blobs come back in name order, but do not rely on order to know what was processed." },
    { q: "Would Event Grid help?", a: "Yes, it can notify you of each new blob instead of listing." },
  ],
}
