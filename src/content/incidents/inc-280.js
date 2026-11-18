export default {
  id: 'inc-280',
  category: 'incidents',
  title: "Message Times in the Job Log Are One Hour Off After the Clock Change",
  level: 'INTERMEDIATE',
  tags: ["myproject","oracle","timezone","timestamp"],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: "2026-11-01 02:30:00 INFO  [job-log] Insert received_at=2026-11-01 01:30:00 (TIMESTAMP)", relevant: true, why: "The column has no time zone." },
      { text: "2026-11-01 02:30:00 INFO  [job-log] App sends local time string", relevant: true, why: "The app sends local times." },
      { text: "2026-11-01 02:30:00 INFO  [ops] Clocks went back at 02:00", relevant: true, why: "The clock changed." },
      { text: "2026-11-02 09:00:00 WARN  [report] Jobs appear to finish before they start", relevant: true, why: "Times are confused." },
      { text: "2026-11-01 23:59:00 INFO  [job-log] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why are times confused?",
        options: [
          "Local times without a zone repeat during the clock change",
          "Oracle is wrong",
          "The report is broken",
          "The server is slow",
        ],
        answer: 0,
        explain: "One hour happens twice.",
      },
      {
        type: 'single',
        prompt: "What is the fix?",
        options: [
          "Store UTC or TIMESTAMP WITH TIME ZONE",
          "Store text",
          "Use the report server time",
          "Ignore",
        ],
        answer: 0,
        explain: "Unambiguous times.",
      },
      {
        type: 'multi',
        prompt: "What else helps?",
        options: [
          "Format times with an offset in DataWeave",
          "Convert to local only for display",
          "Agree UTC in interfaces",
          "Use local times everywhere",
        ],
        answer: [0,1,2],
        explain: "UTC in storage and transport.",
      },
      {
        type: 'single',
        prompt: "What happens in spring?",
        options: [
          "An hour is skipped, so some local times do not exist",
          "Nothing",
          "Times double",
          "Oracle stops",
        ],
        answer: 0,
        explain: "Both changes cause issues.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Mark affected rows",
          "Change the column to store UTC",
          "Change the app to send UTC",
          "Display local in reports",
          "Test both clock changes",
        ],
        explain: "Mark, fix storage, fix app, display, test.",
      },
    ],
  },
  description: `
## Symptoms
- Job reports show negative durations on the night the clocks changed.

## Change / Context
- The job log uses TIMESTAMP without time zone and local time strings.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-01 02:30:00 INFO  [job-log] Insert received_at=2026-11-01 01:30:00 (TIMESTAMP)
2026-11-01 02:30:00 INFO  [job-log] App sends local time string
2026-11-01 02:30:00 INFO  [ops] Clocks went back at 02:00
2026-11-02 09:00:00 WARN  [report] Jobs appear to finish before they start
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
    "Local times are ambiguous at clock changes.",
    "Store UTC or zoned timestamps.",
    "Send times with offsets.",
    "Convert for display only.",
    "Spring skips an hour.",
    "Test both changes.",
  ],
  solution: `
**Diagnosis.** Local times repeat during the autumn change, so ordering breaks.

**Immediate mitigation.**
- Mark affected rows.

**Root cause.** Local times without zone in storage.

**Permanent fix.**
- UTC or zoned timestamps.

**Prevention.** Tests around clock changes.
`,
  followUps: [
    { q: "How do you format with offset in DataWeave?", a: "Use a format with an offset pattern such as XXX." },
    { q: "What is SYSTIMESTAMP?", a: "The database time with its zone." },
    { q: "Should servers use UTC?", a: "It helps, but data should still carry zones." },
    { q: "How do you fix old rows?", a: "Convert with known rules and mark uncertain ones." },
  ],
}
