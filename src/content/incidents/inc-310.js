export default {
  id: 'inc-310',
  category: 'incidents',
  title: "Logging the Payload Crashes the App on a Large File",
  level: 'BEGINNER',
  tags: ["myproject","large-files","logging","memory"],
  estMinutes: 15,
  investigation: {
    logs: [
      { text: "2026-11-18 01:00:00 INFO  [order-file] Received file sizeBytes=1200000000", relevant: true, why: "A big file." },
      { text: "2026-11-18 01:00:00 INFO  [order-file] Logger message=#[payload]", relevant: true, why: "The logger prints the whole payload." },
      { text: "2026-11-18 01:00:40 ERROR [order-file] OutOfMemoryError: Java heap space", relevant: true, why: "Memory runs out." },
      { text: "2026-11-18 01:00:41 INFO  [runtime] Worker restarted", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why does the app crash?",
        options: [
          "Logging the payload turns the whole 1.2 GB stream into a string",
          "The file is bad",
          "The disk is full",
          "The network",
        ],
        answer: 0,
        explain: "Loggers read the full value.",
      },
      {
        type: 'single',
        prompt: "What should the logger show?",
        options: [
          "File name, size and a count, not the content",
          "The first 10 MB",
          "The whole payload at DEBUG",
          "Nothing",
        ],
        answer: 0,
        explain: "Facts, not content.",
      },
      {
        type: 'multi',
        prompt: "What else reads the whole stream?",
        options: [
          "sizeOf on the payload",
          "Writing payload to a variable as a string",
          "Logging #[payload]",
          "Reading attributes.size",
        ],
        answer: [0,1,2],
        explain: "Attributes do not read content.",
      },
      {
        type: 'single',
        prompt: "Why did it work in test?",
        options: [
          "Test files were small",
          "Test had more memory",
          "Luck",
          "Different logger",
        ],
        answer: 0,
        explain: "Test with real sizes.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Remove the payload logger",
          "Redeploy",
          "Process the file",
          "Add a log review rule",
          "Test with a large file",
        ],
        explain: "Fix, deploy, recover, prevent.",
      },
    ],
  },
  description: `
## Symptoms
- The order file app crashes on large nights.

## Change / Context
- A debug logger was left in the flow.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 01:00:00 INFO  [order-file] Received file sizeBytes=1200000000
2026-11-18 01:00:00 INFO  [order-file] Logger message=#[payload]
2026-11-18 01:00:40 ERROR [order-file] OutOfMemoryError: Java heap space
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
    "Logging payloads reads the whole stream.",
    "Log names, sizes and counts.",
    "sizeOf and string vars also read all.",
    "Attributes are cheap.",
    "Test with large files.",
    "Review loggers.",
  ],
  solution: `
**Diagnosis.** The logger prints the payload and loads 1.2 GB into memory.

**Immediate mitigation.**
- Remove the logger.

**Root cause.** Debug logger left in.

**Permanent fix.**
- Log facts only.

**Prevention.** Review rules and large tests.
`,
  followUps: [
    { q: "Is DEBUG level safe?", a: "The expression may still run. Avoid payload logging." },
    { q: "How do you see content for debugging?", a: "Log a small sample in a non production run." },
    { q: "What is attributes.size?", a: "File size from the connector, without reading content." },
    { q: "Does this apply to all connectors?", a: "Yes, any large payload." },
  ],
}
