export default {
  id: 'inc-311',
  category: 'incidents',
  title: "Temp Disk Fills Up While Processing Large Files",
  level: 'BEGINNER',
  tags: ["myproject","large-files","repeatable-streams","disk"],
  estMinutes: 15,
  investigation: {
    logs: [
      { text: "2026-11-18 02:00:00 INFO  [inv-file] Processing file sizeBytes=4000000000", relevant: true, why: "A 4 GB file." },
      { text: "2026-11-18 02:00:00 INFO  [inv-file] Streaming strategy=repeatable file store", relevant: true, why: "Buffers spill to disk." },
      { text: "2026-11-18 02:10:00 ERROR [inv-file] No space left on device", relevant: true, why: "The disk is full." },
      { text: "2026-11-18 02:10:00 INFO  [ops] Temp disk free before run=3GB", relevant: true, why: "Not enough disk." },
      { text: "2026-11-18 23:59:00 INFO  [inv-file] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why is the disk full?",
        options: [
          "Repeatable file store buffers the 4 GB file to a 3 GB temp disk",
          "Debug logs from the job filled the temp disk",
          "The database export wrote its dump to temp disk",
          "Temp files from earlier failed runs were never cleaned",
        ],
        answer: 0,
        explain: "Spilling to disk needs space.",
      },
      {
        type: 'single',
        prompt: "What can help?",
        options: [
          "Use a non repeatable stream if the payload is read once",
          "Read the file twice so each pass buffers half",
          "Log the payload so the buffer is flushed early",
          "Raise the in-memory buffer so less spills to disk",
        ],
        answer: 0,
        explain: "No buffer needed if you read once.",
      },
      {
        type: 'multi',
        prompt: "What else helps?",
        options: [
          "Make sure the flow reads the payload only once",
          "Size temp disk for the largest file",
          "Clean temp files after failures",
          "Copy the file into a variable",
        ],
        answer: [0,1,2],
        explain: "Design for one pass.",
      },
      {
        type: 'single',
        prompt: "When do you need repeatable streams?",
        options: [
          "When the payload is read more than once, such as log then write",
          "Never, since every connector reads the payload once",
          "Always, for any payload bigger than the buffer size",
          "Only for JSON payloads, since XML and CSV stream",
        ],
        answer: 0,
        explain: "Repeat reads need a buffer.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Free temp disk",
          "Change to one pass with non repeatable streaming",
          "Rerun",
          "Add disk alerts",
          "Test with the largest file",
        ],
        explain: "Free, fix, rerun, watch, test.",
      },
    ],
  },
  description: `
## Symptoms
- The inventory file job fails with no space left on device.

## Change / Context
- Files grew from 1 GB to 4 GB.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 02:00:00 INFO  [inv-file] Processing file sizeBytes=4000000000
2026-11-18 02:00:00 INFO  [inv-file] Streaming strategy=repeatable file store
2026-11-18 02:10:00 ERROR [inv-file] No space left on device
2026-11-18 02:10:00 INFO  [ops] Temp disk free before run=3GB
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
    "Repeatable file store buffers to disk.",
    "Non repeatable streams read once.",
    "Read once where possible.",
    "Size temp disk.",
    "Clean temp after failures.",
    "Test the largest file.",
  ],
  solution: `
**Diagnosis.** The repeatable stream buffers 4 GB to a 3 GB temp disk.

**Immediate mitigation.**
- Free disk and rerun.

**Root cause.** Repeatable buffering not needed for a one pass flow.

**Permanent fix.**
- Non repeatable streaming and one pass design.

**Prevention.** Disk alerts and tests.
`,
  followUps: [
    { q: "What is the default streaming strategy?", a: "Repeatable file store in many cases." },
    { q: "What breaks with non repeatable?", a: "A second read gets nothing or fails." },
    { q: "How much memory does file store use?", a: "A buffer in memory, then disk." },
    { q: "Where is temp disk?", a: "On the runtime host or worker." },
  ],
}
