export default {
  id: 'inc-225',
  category: 'incidents',
  title: "Staging Tables Get Double Rows: Event Grid Delivered the Same BlobCreated Event Twice",
  level: 'EXPERT',
  tags: ["myproject","azure-blob","event-grid","idempotency","duplicates","staging"],
  estMinutes: 30,
  investigation: {
    logs: [
      { text: "2026-11-18 11:00:01 INFO  [blob-intake] Event received id=evt-5501 type=BlobCreated blob=sales/2026-11-18/store-118.csv", relevant: true, why: "An event for a new blob." },
      { text: "2026-11-18 11:00:31 INFO  [blob-intake] Loaded rows=8400 blob=store-118.csv", relevant: true, why: "The first load worked." },
      { text: "2026-11-18 11:00:31 WARN  [blob-intake] Processing took 31 s, response to Event Grid after timeout", relevant: true, why: "The answer to Event Grid came late." },
      { text: "2026-11-18 11:01:05 INFO  [blob-intake] Event received id=evt-5501 type=BlobCreated (retry)", relevant: true, why: "Event Grid sent the same event again." },
      { text: "2026-11-18 11:01:40 INFO  [blob-intake] Loaded rows=8400 blob=store-118.csv", relevant: true, why: "The file was loaded a second time." },
      { text: "2026-11-18 11:02:00 WARN  [reconcile] store-118 sales doubled", relevant: true, why: "Reports show double sales." },
      { text: "2026-11-18 23:59:00 INFO  [blob-intake] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why was the file loaded twice?",
        options: [
          "Event Grid got no answer in time, so it sent the same event again",
          "The store uploaded the file twice, so two BlobCreated events fired",
          "The staging insert was retried by the database driver after 31 s",
          "Two Mule workers each got their own copy of the event at once",
        ],
        answer: 0,
        explain: "Event delivery is at least once. A slow answer looks like a failure and triggers a retry.",
      },
      {
        type: 'single',
        prompt: "What should the event handler do first?",
        options: [
          "Accept the event quickly and process it in the background",
          "Load the whole file first, so success means the data is in",
          "Answer with an error while busy, so Event Grid tries later",
          "Turn off retries on the subscription so each event comes once",
        ],
        answer: 0,
        explain: "A fast answer avoids most retries. Background work can take as long as it needs.",
      },
      {
        type: 'multi',
        prompt: "How do you make a repeat harmless?",
        options: [
          "Record processed event IDs or blob names with their version, and skip repeats",
          "Load with MERGE on a business key",
          "Mark the blob as processed with metadata or by moving it",
          "Add workers so each load ends within the 30 second delivery timeout",
        ],
        answer: [0,1,2],
        explain: "At least once delivery needs an idempotent consumer.",
      },
      {
        type: 'single',
        prompt: "What key identifies \"the same file\"?",
        options: [
          "The blob name plus its ETag, so a real update is still loaded",
          "The event time, since a retry arrives with a later time",
          "The blob name alone, since each store sends one file a day",
          "The file size and row count, since a repeat has the same values",
        ],
        answer: 0,
        explain: "A file can be legitimately replaced. The ETag tells a new version from a repeat.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Remove the double rows for affected stores",
          "Answer events fast and queue the work",
          "Skip events already processed for the same blob version",
          "Load staging with MERGE on a business key",
          "Reconcile totals per store daily",
        ],
        explain: "Clean up, then fix delivery handling and loading.",
      },
    ],
  },
  description: `
## Symptoms
- Some stores show double sales for a day. Each case matches a slow load.

## Change / Context
- Event Grid sends a BlobCreated event to an HTTP endpoint in Mule for each new sales file.
- The flow loads the whole file into staging before answering the event.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 11:00:01 INFO  [blob-intake] Event received id=evt-5501 type=BlobCreated blob=sales/2026-11-18/store-118.csv
2026-11-18 11:00:31 INFO  [blob-intake] Loaded rows=8400 blob=store-118.csv
2026-11-18 11:00:31 WARN  [blob-intake] Processing took 31 s, response to Event Grid after timeout
2026-11-18 11:01:05 INFO  [blob-intake] Event received id=evt-5501 type=BlobCreated (retry)
2026-11-18 11:01:40 INFO  [blob-intake] Loaded rows=8400 blob=store-118.csv
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
    "Event Grid delivers at least once.",
    "A slow answer triggers a retry.",
    "Answer fast and process in the background.",
    "Skip events already processed for the same blob version.",
    "Load with MERGE on business keys.",
    "Reconcile totals daily.",
  ],
  solution: `
**Diagnosis.** The flow took 31 seconds to answer. Event Grid treated that as failed and redelivered the event, and the file was loaded again.

**Immediate mitigation.**
- Delete the second set of rows for affected stores and files.

**Root cause.** Long work ran before the event was acknowledged, and the load was not idempotent.

**Permanent fix.**
- Acknowledge the event at once and put the work on a queue.
- Record blob name and ETag when processed, and skip repeats.
- Load staging with MERGE on store, date and line keys.

**Prevention.** A daily reconciliation of totals per store and a test that sends the same event twice.
`,
  followUps: [
    { q: "Why not turn off retries?", a: "Then real failures would lose files. Keep retries and make repeats harmless." },
    { q: "What is an ETag?", a: "A value that changes each time the blob content changes." },
    { q: "How fast should the answer be?", a: "Within the timeout Event Grid expects. Answer first, work later." },
    { q: "Could you poll instead of using events?", a: "Yes, by listing new blobs, but you still need a processed marker." },
  ],
}
