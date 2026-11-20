export default {
  id: 'inc-224',
  category: 'incidents',
  title: "The Item Hub Runs Out of Memory on One Supplier’s 900 MB Message: the Whole Blob Is Read and Parsed at Once",
  level: 'EXPERT',
  tags: ["myproject","azure-blob","large-files","memory","streaming","planning-platform"],
  estMinutes: 30,
  investigation: {
    logs: [
      { text: "2026-11-18 04:00:01 INFO  [item-hub] Notification blob=items/2026-11-18/full-catalog.json sizeMB=900", relevant: true, why: "A very large message arrives." },
      { text: "2026-11-18 04:00:02 INFO  [item-hub] Reading blob into memory via Java helper", relevant: true, why: "The whole file is read into memory." },
      { text: "2026-11-18 04:01:30 ERROR [item-hub] java.lang.OutOfMemoryError: Java heap space", relevant: true, why: "The app runs out of heap." },
      { text: "2026-11-18 04:01:31 INFO  [runtime] App restarted, in-flight messages=6", relevant: true, why: "The restart also drops other messages in progress." },
      { text: "2026-11-18 04:05:00 INFO  [item-hub] Normal message sizes 2 to 20 MB", relevant: true, why: "Usual messages are much smaller." },
      { text: "2026-11-18 23:59:00 INFO  [item-hub] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why does the hub crash?",
        options: [
          "It loads and parses all 900 MB in memory, which needs more heap than it has",
          "The blob download takes 90 seconds, and the runtime kills slow flows",
          "The 900 MB file has invalid JSON, and the parser loops until it fails",
          "The six other messages leak memory, and the large one only tips it over",
        ],
        answer: 0,
        explain: "Parsed JSON takes several times the file size in memory.",
      },
      {
        type: 'single',
        prompt: "What is the main fix?",
        options: [
          "Stream the blob and process items in chunks, so memory stays flat",
          "Give the app a larger worker with enough heap for a 900 MB file",
          "Reject any message over 20 MB and ask the sender to stop",
          "Lower the flow’s concurrency to one so the file has all the heap",
        ],
        answer: 0,
        explain: "Streaming keeps memory use tied to the chunk size, not the file size.",
      },
      {
        type: 'multi',
        prompt: "What else should change?",
        options: [
          "Set a size limit, and route very large files to a separate path or time",
          "Ask the sender to split full catalogues into parts",
          "Protect other messages in flight from one large one",
          "Log the whole payload of large files to find bad records",
        ],
        answer: [0,1,2],
        explain: "Limit the blast radius and agree sensible sizes. Logging 900 MB makes it worse.",
      },
      {
        type: 'single',
        prompt: "Why were six other messages affected?",
        options: [
          "The crash restarted the app, dropping all work in progress",
          "They came from the same supplier and held the same catalogue",
          "They waited behind the large file and timed out on the queue",
          "The restart sent them to the DLQ as duplicates of the large one",
        ],
        answer: 0,
        explain: "One bad file can take down all work on the same runtime.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Hold the large message so it does not crash the app again",
          "Reprocess the six other messages",
          "Change the read to stream and process in chunks",
          "Add a size based route for very large files",
          "Agree split sizes with the sender",
        ],
        explain: "Contain, recover, fix, then prevent.",
      },
    ],
  },
  description: `
## Symptoms
- Every night at 04:00 the item hub crashes and restarts. Other messages processed at the same time fail.

## Change / Context
- Messages arrive as JSON blobs. A helper reads the whole blob into memory and the flow parses it before splitting good and bad records.
- One supplier started sending its full catalogue of 900 MB each night.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 04:00:01 INFO  [item-hub] Notification blob=items/2026-11-18/full-catalog.json sizeMB=900
2026-11-18 04:00:02 INFO  [item-hub] Reading blob into memory via Java helper
2026-11-18 04:01:30 ERROR [item-hub] java.lang.OutOfMemoryError: Java heap space
2026-11-18 04:01:31 INFO  [runtime] App restarted, in-flight messages=6
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
    "Parsed data needs several times the file size in memory.",
    "Stream large files and process in chunks.",
    "A size limit protects the runtime.",
    "One huge file can crash other work.",
    "Agree file sizes with senders.",
    "Hold the message to stop crash loops.",
  ],
  solution: `
**Diagnosis.** The 900 MB blob is read whole into memory and parsed. That needs more heap than the app has, so it fails with OutOfMemoryError and restarts, dropping other messages.

**Immediate mitigation.**
- Move the large message aside and reprocess the six others.

**Root cause.** The read path was built for small messages and loads everything at once.

**Permanent fix.**
- Download as a stream and parse with a streaming reader, splitting items into chunks for the staging load.
- Route files over a set size to a separate app or time window.

**Prevention.** Agree a maximum message size with senders and alert on files near it.
`,
  followUps: [
    { q: "How much memory does parsed JSON take?", a: "Several times the file size, depending on the structure." },
    { q: "Does DataWeave stream?", a: "For some formats and with the streaming property, when the script reads the data in one pass." },
    { q: "Why a separate path?", a: "So one large file cannot starve normal messages." },
    { q: "Would more heap fix it?", a: "Until the next larger file. Streaming removes the link to file size." },
  ],
}
