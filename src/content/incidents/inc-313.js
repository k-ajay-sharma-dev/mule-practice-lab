export default {
  id: 'inc-313',
  category: 'incidents',
  title: "A DataWeave Transform Breaks Streaming on a 2 GB CSV",
  level: 'INTERMEDIATE',
  tags: ["myproject","large-files","dataweave","streaming"],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: "2026-11-18 01:00:00 INFO  [sales-csv] Reader streaming=true sizeBytes=2100000000", relevant: true, why: "The reader streams." },
      { text: "2026-11-18 01:00:00 INFO  [sales-csv] Transform uses payload orderBy $.store", relevant: true, why: "Sorting needs everything." },
      { text: "2026-11-18 01:03:00 ERROR [sales-csv] OutOfMemoryError: Java heap space", relevant: true, why: "Memory runs out." },
      { text: "2026-11-18 01:03:01 INFO  [runtime] Worker restarted", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why does streaming fail?",
        options: [
          "orderBy needs all rows in memory before it can sort",
          "The CSV reader ignores streaming=true for files over 2 GB",
          "The CSV has a broken quote that makes one huge row",
          "The output writer holds every store group in memory",
        ],
        answer: 0,
        explain: "Some operations cannot stream.",
      },
      {
        type: 'single',
        prompt: "What can you do instead?",
        options: [
          "Get sorted input from the source, or sort in a database",
          "Sort each half of the file and append the two results",
          "Use groupBy on store instead, since groupBy streams",
          "Move to a worker with double the heap and keep the sort",
        ],
        answer: 0,
        explain: "Avoid whole file operations.",
      },
      {
        type: 'multi',
        prompt: "Which DataWeave operations need the whole input?",
        options: [
          "orderBy",
          "groupBy",
          "sizeOf",
          "map with a simple field change",
        ],
        answer: [0,1,2],
        explain: "map can stream.",
      },
      {
        type: 'single',
        prompt: "What does streaming=true promise?",
        options: [
          "The reader can stream, if the script allows it",
          "Every operation in the script will stream",
          "The transform uses no heap memory at all",
          "The file is read in parallel on all cores",
        ],
        answer: 0,
        explain: "The script must also stream.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Remove the sort",
          "Ask for sorted input",
          "Test with the full file",
          "Review other transforms",
          "Add memory alerts",
        ],
        explain: "Fix, agree, test, review, watch.",
      },
    ],
  },
  description: `
## Symptoms
- The sales CSV job crashes since files reached 2 GB.

## Change / Context
- The transform sorts rows by store.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 01:00:00 INFO  [sales-csv] Reader streaming=true sizeBytes=2100000000
2026-11-18 01:00:00 INFO  [sales-csv] Transform uses payload orderBy $.store
2026-11-18 01:03:00 ERROR [sales-csv] OutOfMemoryError: Java heap space
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
    "Some functions need all data.",
    "orderBy, groupBy and sizeOf break streaming.",
    "map can stream.",
    "Sort upstream or in a database.",
    "Reader streaming is not enough.",
    "Test with full size.",
  ],
  solution: `
**Diagnosis.** orderBy forces the whole 2 GB into memory.

**Immediate mitigation.**
- Remove the sort.

**Root cause.** Whole input operation in a streaming flow.

**Permanent fix.**
- Sort upstream or in the database.

**Prevention.** Review transforms for streaming.
`,
  followUps: [
    { q: "How do you know if a script streams?", a: "Check the docs and test memory with large input." },
    { q: "Does @StreamCapable help?", a: "It marks a script that must stream and fails if it cannot." },
    { q: "Can you group without memory?", a: "If the input is already sorted, process groups as they come." },
    { q: "Why a database?", a: "It can sort large data on disk." },
  ],
}
