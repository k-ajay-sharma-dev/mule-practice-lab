export default {
  id: 'inc-258',
  category: 'incidents',
  title: "Allocation Plans Load Into the Wrong Week",
  level: 'ADVANCED',
  tags: ["myproject","ftp","planning-platform","plans","database"],
  estMinutes: 25,
  investigation: {
    logs: [
      { text: "2026-11-18 05:00:00 INFO  [alloc-in] Read /out/alloc_202647.dat records=12000", relevant: true, why: "The file name holds a week number." },
      { text: "2026-11-18 05:00:01 INFO  [alloc-in] Parsed week=2026-47 startDate=2026-11-23", relevant: true, why: "The flow uses ISO week rules." },
      { text: "2026-11-18 05:00:01 INFO  [planning-platform] Retail calendar week 47 starts 2026-11-15", relevant: true, why: "The platform uses the retail calendar." },
      { text: "2026-11-18 08:00:00 WARN  [stores] Allocations arrive a week late", relevant: true, why: "Stores see the effect." },
      { text: "2026-11-18 23:59:00 INFO  [alloc-in] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why do allocations land in the wrong week?",
        options: [
          "The flow uses ISO weeks but the platform uses the retail calendar",
          "The file is late",
          "The database is slow",
          "FTP changed the name",
        ],
        answer: 0,
        explain: "Two week rules give different dates.",
      },
      {
        type: 'single',
        prompt: "What is the fix?",
        options: [
          "Map week numbers with the retail calendar table, or send real dates in the file",
          "Add seven days",
          "Use the file time",
          "Ignore weeks",
        ],
        answer: 0,
        explain: "Use the same calendar as the sender.",
      },
      {
        type: 'multi',
        prompt: "What prevents this?",
        options: [
          "Agree dates rather than week numbers in interfaces",
          "Share the retail calendar as reference data",
          "Test around year end weeks",
          "Assume every system counts weeks the same way",
        ],
        answer: [0,1,2],
        explain: "Week numbers are ambiguous.",
      },
      {
        type: 'single',
        prompt: "Why are year ends risky?",
        options: [
          "Calendars handle week 53 and the first week differently",
          "Files are bigger",
          "FTP is slower",
          "There is no risk",
        ],
        answer: 0,
        explain: "Edge weeks expose rule differences.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Reload with the right week start",
          "Tell stores",
          "Use the retail calendar table",
          "Ask for dates in the file",
          "Add year end tests",
        ],
        explain: "Fix data, tell, fix logic, improve, test.",
      },
    ],
  },
  description: `
## Symptoms
- Store allocations are a week late.

## Change / Context
- Allocation plans come back from the planning platform over FTP and load into the store database.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 05:00:00 INFO  [alloc-in] Read /out/alloc_202647.dat records=12000
2026-11-18 05:00:01 INFO  [alloc-in] Parsed week=2026-47 startDate=2026-11-23
2026-11-18 05:00:01 INFO  [planning-platform] Retail calendar week 47 starts 2026-11-15
2026-11-18 08:00:00 WARN  [stores] Allocations arrive a week late
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
    "Week numbers depend on the calendar.",
    "Retail calendars differ from ISO weeks.",
    "Prefer dates in interfaces.",
    "Share the calendar as reference data.",
    "Test year end weeks.",
    "Tell stores when data changes.",
  ],
  solution: `
**Diagnosis.** The flow converts the week with ISO rules. The platform uses a retail calendar.

**Immediate mitigation.**
- Reload with the correct dates.

**Root cause.** Ambiguous week numbers in the interface.

**Permanent fix.**
- Look up week start in the retail calendar table.

**Prevention.** Dates in files and year end tests.
`,
  followUps: [
    { q: "What is a retail calendar?", a: "A 4-4-5 or similar calendar where weeks and years follow trading rules." },
    { q: "Can DataWeave do ISO weeks?", a: "Yes, but that does not match a retail calendar." },
    { q: "Where does the calendar live?", a: "Usually a reference table shared by systems." },
    { q: "What about week 53?", a: "Some years have it. Both sides must agree." },
  ],
}
