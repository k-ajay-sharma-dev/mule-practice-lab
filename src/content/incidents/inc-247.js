export default {
  id: 'inc-247',
  category: 'incidents',
  title: "A 2 GB Sales History File From SFTP Crashes the Worker",
  level: 'ADVANCED',
  tags: ["myproject","sftp","large-files","memory"],
  estMinutes: 25,
  investigation: {
    logs: [
      { text: "2026-11-18 01:00:00 INFO  [hist-in] Read /in/sales_hist.csv sizeBytes=2147483648", relevant: true, why: "A very large file." },
      { text: "2026-11-18 01:00:05 INFO  [hist-in] set-variable rows = payload as Array", relevant: true, why: "The flow loads every row into memory." },
      { text: "2026-11-18 01:01:40 ERROR [hist-in] java.lang.OutOfMemoryError: Java heap space", relevant: true, why: "Memory runs out." },
      { text: "2026-11-18 01:01:45 INFO  [runtime] Worker restarted", relevant: true, why: "The worker restarts and the listener reads it again." },
      { text: "2026-11-18 23:59:00 INFO  [hist-in] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why does the worker crash?",
        options: [
          "The flow turns the whole file into an array, so all 2 GB sits in heap",
          "The CSV has a broken quote, so the reader treats it as one huge row",
          "The SFTP read times out and the retry buffers a second copy",
          "The worker’s temp disk fills while the 2 GB file downloads",
        ],
        answer: 0,
        explain: "Variables hold the full content.",
      },
      {
        type: 'single',
        prompt: "What is the fix?",
        options: [
          "Stream the file into a batch job or for each with deferred reading",
          "Move to a worker with twice the memory and keep the flow",
          "Ask the sender to split the file by hand each night",
          "Raise the SFTP read timeout so the read can finish",
        ],
        answer: 0,
        explain: "Streaming keeps memory flat.",
      },
      {
        type: 'multi',
        prompt: "What else matters for big files?",
        options: [
          "Avoid functions that read the whole payload",
          "Use repeatable file store streams that spill to disk",
          "Write output in chunks",
          "Log the whole payload at DEBUG to trace rows",
        ],
        answer: [0,1,2],
        explain: "Design every step to stream.",
      },
      {
        type: 'single',
        prompt: "Why does the crash repeat?",
        options: [
          "After restart the listener reads the same file again",
          "The heap is not cleared when the worker restarts",
          "The sender uploads the file again every two minutes",
          "The runtime replays the failed event from its log",
        ],
        answer: 0,
        explain: "A poison file loops.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Move the file aside to stop the loop",
          "Change the flow to stream",
          "Test with the full file",
          "Process the moved file",
          "Add a size alert",
        ],
        explain: "Stop the loop, fix, prove, recover, watch.",
      },
    ],
  },
  description: `
## Symptoms
- The worker crashes every two minutes since 01:00.

## Change / Context
- The flow was built with small test files.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 01:00:00 INFO  [hist-in] Read /in/sales_hist.csv sizeBytes=2147483648
2026-11-18 01:00:05 INFO  [hist-in] set-variable rows = payload as Array
2026-11-18 01:01:40 ERROR [hist-in] java.lang.OutOfMemoryError: Java heap space
2026-11-18 01:01:45 INFO  [runtime] Worker restarted
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
    "Variables hold the whole payload.",
    "Stream large files.",
    "Batch jobs read records as they go.",
    "Some functions force a full read.",
    "File store streams spill to disk.",
    "Move poison files aside.",
  ],
  solution: `
**Diagnosis.** The flow loads the 2 GB file into a variable and runs out of heap, then restarts and reads it again.

**Immediate mitigation.**
- Move the file aside.

**Root cause.** The flow was built and tested with small files only.

**Permanent fix.**
- Stream records through a batch job.

**Prevention.** Test with production size files and alert on file size.
`,
  followUps: [
    { q: "What is a repeatable file store stream?", a: "A stream that buffers to disk when it outgrows memory, so it can be read again." },
    { q: "Is a batch job always needed?", a: "No, a streaming for each also works for simple loads." },
    { q: "How do you test?", a: "Generate a file of production size in a test environment." },
    { q: "How do you stop the loop?", a: "Move the file, or catch the error and move it to an error folder." },
  ],
}
