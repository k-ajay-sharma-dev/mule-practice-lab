export default {
  id: 'inc-315',
  category: 'incidents',
  title: "A 1.5 GB JSON Array Cannot Be Parsed",
  level: 'INTERMEDIATE',
  tags: ["myproject","large-files","json","arrays"],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: "2026-11-18 02:00:00 INFO  [catalog-in] Received catalog.json sizeBytes=1500000000", relevant: true, why: "A huge JSON file." },
      { text: "2026-11-18 02:00:00 INFO  [catalog-in] Format: {\"items\": [ … ]}", relevant: true, why: "One array in an object." },
      { text: "2026-11-18 02:02:00 ERROR [catalog-in] OutOfMemoryError while reading JSON", relevant: true, why: "Memory runs out." },
      { text: "2026-11-18 02:02:00 INFO  [catalog-in] Reader streaming=false", relevant: true, why: "Streaming is off." },
      { text: "2026-11-18 23:59:00 INFO  [catalog-in] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why does parsing fail?",
        options: [
          "The reader builds the whole document in memory",
          "The JSON is invalid",
          "The file is late",
          "Network",
        ],
        answer: 0,
        explain: "Streaming is off.",
      },
      {
        type: 'single',
        prompt: "What helps?",
        options: [
          "Enable streaming and process items one by one, or ask for JSON lines",
          "Bigger worker",
          "Read twice",
          "Convert to XML",
        ],
        answer: 0,
        explain: "Read items as a stream.",
      },
      {
        type: 'multi',
        prompt: "Why does JSON lines suit big data better?",
        options: [
          "Each line is one record",
          "It can be split anywhere on a line break",
          "It streams naturally",
          "It is smaller always",
        ],
        answer: [0,1,2],
        explain: "Not always smaller.",
      },
      {
        type: 'single',
        prompt: "What limits streaming of JSON?",
        options: [
          "Accessing data in a way that needs the whole document",
          "Nothing",
          "File names",
          "Encoding",
        ],
        answer: 0,
        explain: "Read items in order once.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Enable streaming",
          "Process items one at a time",
          "Test with the full file",
          "Ask the sender about JSON lines",
          "Alert on size",
        ],
        explain: "Fix, process, test, improve, watch.",
      },
    ],
  },
  description: `
## Symptoms
- The catalog import crashes.

## Change / Context
- The catalog grew to 1.5 GB.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 02:00:00 INFO  [catalog-in] Received catalog.json sizeBytes=1500000000
2026-11-18 02:00:00 INFO  [catalog-in] Format: {"items": [ … ]}
2026-11-18 02:02:00 ERROR [catalog-in] OutOfMemoryError while reading JSON
2026-11-18 02:02:00 INFO  [catalog-in] Reader streaming=false
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
    "Big JSON needs streaming.",
    "Process items one by one.",
    "JSON lines stream naturally.",
    "Avoid whole document access.",
    "Test full size.",
    "Alert on size.",
  ],
  solution: `
**Diagnosis.** The JSON reader loads 1.5 GB without streaming.

**Immediate mitigation.**
- Enable streaming.

**Root cause.** Design assumed small files.

**Permanent fix.**
- Streaming read, item by item.

**Prevention.** Agree JSON lines and size alerts.
`,
  followUps: [
    { q: "What is JSON lines?", a: "One JSON object per line." },
    { q: "Can DataWeave read it?", a: "Yes, with the right format settings or by splitting lines." },
    { q: "Does batch help?", a: "Yes, fed with a streaming reader." },
    { q: "Why not split the file?", a: "That also works, at the sender." },
  ],
}
