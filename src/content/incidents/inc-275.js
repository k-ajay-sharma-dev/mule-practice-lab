export default {
  id: 'inc-275',
  category: 'incidents',
  title: "Dates Load as the Wrong Month on One Server",
  level: 'BEGINNER',
  tags: ["myproject","oracle","dates","nls"],
  estMinutes: 15,
  investigation: {
    logs: [
      { text: "2026-11-18 04:00:00 INFO  [plan-load] TO_DATE(:d) with value 03/11/2026", relevant: true, why: "The date has no format mask." },
      { text: "2026-11-18 04:00:00 INFO  [dba] Server A NLS_DATE_FORMAT=DD/MM/YYYY, server B NLS_DATE_FORMAT=MM/DD/YYYY", relevant: true, why: "Session defaults differ." },
      { text: "2026-11-18 04:00:01 WARN  [plan-load] Plan date stored 2026-03-11 expected 2026-11-03", relevant: true, why: "Day and month swapped." },
      { text: "2026-11-18 04:00:01 INFO  [plan-load] Worker on server B", relevant: true, why: "The job ran on server B." },
      { text: "2026-11-18 23:59:00 INFO  [plan-load] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why is the date wrong?",
        options: [
          "TO_DATE without a mask uses the session format, which differs on server B",
          "The file is wrong",
          "Oracle is broken",
          "Time zones",
        ],
        answer: 0,
        explain: "Never rely on session defaults.",
      },
      {
        type: 'single',
        prompt: "What is the fix?",
        options: [
          "Always pass a format mask, or bind a real date type",
          "Change server B",
          "Use strings",
          "Ignore",
        ],
        answer: 0,
        explain: "Explicit formats or typed binds.",
      },
      {
        type: 'multi',
        prompt: "Where should dates be typed?",
        options: [
          "Parse them in DataWeave with an explicit format",
          "Bind them as dates, not strings",
          "Store them in DATE or TIMESTAMP columns",
          "Keep them as text",
        ],
        answer: [0,1,2],
        explain: "Typed dates avoid guessing.",
      },
      {
        type: 'single',
        prompt: "How do you find wrong rows?",
        options: [
          "Dates where day is 12 or less loaded on server B",
          "All rows",
          "None",
          "Random",
        ],
        answer: 0,
        explain: "Only ambiguous days can swap.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Find swapped dates",
          "Correct them",
          "Bind dates as types",
          "Add a test with day 3 and month 11",
          "Review other TO_DATE calls",
        ],
        explain: "Find, fix, harden, test, review.",
      },
    ],
  },
  description: `
## Symptoms
- Some plans appear in March instead of November.

## Change / Context
- The job runs on two servers.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 04:00:00 INFO  [plan-load] TO_DATE(:d) with value 03/11/2026
2026-11-18 04:00:00 INFO  [dba] Server A NLS_DATE_FORMAT=DD/MM/YYYY, server B NLS_DATE_FORMAT=MM/DD/YYYY
2026-11-18 04:00:01 WARN  [plan-load] Plan date stored 2026-03-11 expected 2026-11-03
2026-11-18 04:00:01 INFO  [plan-load] Worker on server B
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
    "TO_DATE without a mask uses session defaults.",
    "Sessions can differ by server.",
    "Use explicit masks or typed binds.",
    "Parse dates in DataWeave.",
    "Only ambiguous days swap.",
    "Test ambiguous dates.",
  ],
  solution: `
**Diagnosis.** Server B uses a different date format, so 03/11 became March 11.

**Immediate mitigation.**
- Correct swapped rows.

**Root cause.** No explicit date format.

**Permanent fix.**
- Typed binds or explicit masks.

**Prevention.** Tests with ambiguous dates.
`,
  followUps: [
    { q: "What is NLS_DATE_FORMAT?", a: "The default text format for dates in a session." },
    { q: "Can Mule set it?", a: "You can alter the session, but typed binds are better." },
    { q: "Why ISO format?", a: "YYYY-MM-DD cannot be misread." },
    { q: "What about time zones?", a: "Use TIMESTAMP WITH TIME ZONE where it matters." },
  ],
}
