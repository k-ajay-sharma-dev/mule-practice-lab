export default {
  id: 'inc-319',
  category: 'incidents',
  title: "Unzipping a Large Archive Fills Memory",
  level: 'ADVANCED',
  tags: ["myproject","large-files","compression","zip"],
  estMinutes: 25,
  investigation: {
    logs: [
      { text: "2026-11-18 02:00:00 INFO  [img-in] Received images.zip sizeBytes=2000000000 entries=48000", relevant: true, why: "A big zip." },
      { text: "2026-11-18 02:00:00 INFO  [img-in] Using compression extract to list of entries", relevant: true, why: "All entries extracted to a list." },
      { text: "2026-11-18 02:00:01 INFO  [img-in] Uncompressed size about 6000000000", relevant: true, why: "Three times larger uncompressed." },
      { text: "2026-11-18 02:04:00 ERROR [img-in] OutOfMemoryError: Java heap space", relevant: true, why: "Memory runs out." },
      { text: "2026-11-18 02:04:01 INFO  [runtime] Worker restarted", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why does memory fill?",
        options: [
          "All entries are extracted into memory at once",
          "The zip file is corrupt and the reader loops",
          "The worker disk filled up during the extract",
          "Debug logs of each entry fill the heap",
        ],
        answer: 0,
        explain: "A list of 48,000 entries in memory.",
      },
      {
        type: 'single',
        prompt: "What is better?",
        options: [
          "Stream entries one at a time, writing each to storage",
          "Move to a worker with three times the heap",
          "Unzip twice, once per half of the entries",
          "Ask the supplier to send the same zip less often",
        ],
        answer: 0,
        explain: "One entry at a time.",
      },
      {
        type: 'multi',
        prompt: "What else protects you?",
        options: [
          "A limit on uncompressed size to stop zip bombs",
          "A limit on entry count",
          "Checking entry names for path traversal",
          "Trusting archives from known suppliers",
        ],
        answer: [0,1,2],
        explain: "Archives can be hostile.",
      },
      {
        type: 'single',
        prompt: "What is a zip bomb?",
        options: [
          "A small archive that expands to a huge size",
          "A virus hidden inside a zip entry",
          "A zip that takes hours to compress",
          "A zip with a broken central directory",
        ],
        answer: 0,
        explain: "Guard against expansion.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Process entries one by one",
          "Add size and count limits",
          "Check entry paths",
          "Rerun",
          "Alert on large archives",
        ],
        explain: "Fix, guard, check, recover, watch.",
      },
    ],
  },
  description: `
## Symptoms
- The image import crashes on large archives.

## Change / Context
- A supplier sends product images as one zip.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 02:00:00 INFO  [img-in] Received images.zip sizeBytes=2000000000 entries=48000
2026-11-18 02:00:00 INFO  [img-in] Using compression extract to list of entries
2026-11-18 02:00:01 INFO  [img-in] Uncompressed size about 6000000000
2026-11-18 02:04:00 ERROR [img-in] OutOfMemoryError: Java heap space
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
    "Extract entries one at a time.",
    "Uncompressed size can be much larger.",
    "Limit size and count.",
    "Check entry paths.",
    "Zip bombs exist.",
    "Alert on large archives.",
  ],
  solution: `
**Diagnosis.** All 48,000 entries were extracted to memory.

**Immediate mitigation.**
- Process one at a time.

**Root cause.** Extract all design.

**Permanent fix.**
- Streaming extraction with limits.

**Prevention.** Size alerts.
`,
  followUps: [
    { q: "What is path traversal in zips?", a: "An entry name like ../../etc that writes outside the target folder." },
    { q: "Can Mule stream zip entries?", a: "Check the compression module options or use a custom step." },
    { q: "Should images go to blob storage?", a: "Yes, with references in records." },
    { q: "How large can an archive be?", a: "Agree a limit with the supplier." },
  ],
}
