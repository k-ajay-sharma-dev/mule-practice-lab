export default {
  id: 'inc-272',
  category: 'incidents',
  title: "The Nightly Sales Extract for the Planning Platform Slows the Stores’ Morning Trade",
  level: 'EXPERT',
  tags: ["myproject","sql-server","blue-yonder","sales","extract"],
  estMinutes: 30,
  investigation: {
    logs: [
      { text: "2026-11-18 06:30:00 INFO  [sales-extract] Started full scan of sales_line rows=480000000", relevant: true, why: "A full scan of a huge table." },
      { text: "2026-11-18 07:00:00 WARN  [pos-api] Average checkout write ms=2400", relevant: true, why: "Store checkouts slow down." },
      { text: "2026-11-18 07:00:00 INFO  [dba] PAGEIOLATCH waits high, tempdb spills from sales extract", relevant: true, why: "The extract uses heavy IO." },
      { text: "2026-11-18 06:30:00 INFO  [sales-extract] Schedule moved from 02:00 to 06:30 after last month’s failure", relevant: true, why: "The extract now overlaps opening." },
      { text: "2026-11-18 23:59:00 INFO  [sales-extract] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why are checkouts slow?",
        options: [
          "A full scan extract runs during opening hours and competes for IO",
          "Stores have bad network",
          "The POS is broken",
          "Tempdb is full",
        ],
        answer: 0,
        explain: "The schedule change moved heavy work into trading hours.",
      },
      {
        type: 'single',
        prompt: "What is the best design?",
        options: [
          "Extract only yesterday’s partition or changes, from a replica, before opening",
          "Scan more",
          "Run at noon",
          "Add indexes everywhere",
        ],
        answer: 0,
        explain: "Less data, another server, quiet hours.",
      },
      {
        type: 'multi',
        prompt: "What else helps?",
        options: [
          "Partition sales by date",
          "Stream the result to file instead of building it in tempdb",
          "Agree a latest finish time with stores",
          "Run it twice",
        ],
        answer: [0,1,2],
        explain: "Reduce the work and protect trading.",
      },
      {
        type: 'single',
        prompt: "Why was the schedule moved?",
        options: [
          "A past failure was fixed by running later, which created a new problem",
          "Stores asked",
          "The platform asked",
          "At random",
        ],
        answer: 0,
        explain: "Fix the cause, not the time.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Stop the extract",
          "Restart it on the replica",
          "Change to a date range extract",
          "Return to an early schedule",
          "Find the original failure cause",
        ],
        explain: "Stop, relocate, reduce, reschedule, root cause.",
      },
    ],
  },
  description: `
## Symptoms
- Stores see slow checkouts from 07:00.

## Change / Context
- The sales extract for the planning platform runs on the live store database.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 06:30:00 INFO  [sales-extract] Started full scan of sales_line rows=480000000
2026-11-18 07:00:00 WARN  [pos-api] Average checkout write ms=2400
2026-11-18 07:00:00 INFO  [dba] PAGEIOLATCH waits high, tempdb spills from sales extract
2026-11-18 06:30:00 INFO  [sales-extract] Schedule moved from 02:00 to 06:30 after last month’s failure
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
    "Heavy extracts hurt live systems.",
    "Read only what changed.",
    "Use a replica.",
    "Schedule before trading.",
    "Stream results.",
    "Fix causes, not times.",
  ],
  solution: `
**Diagnosis.** A full table scan runs during opening and slows checkouts.

**Immediate mitigation.**
- Stop and rerun on the replica.

**Root cause.** The extract reads everything and was moved into trading hours.

**Permanent fix.**
- Date range extract from a replica, early schedule.

**Prevention.** A latest finish time with alerts.
`,
  followUps: [
    { q: "Why a replica?", a: "Readers there do not compete with checkout writes." },
    { q: "Is the replica up to date?", a: "Usually seconds behind. Check before extracting." },
    { q: "What was last month’s failure?", a: "Find it. Moving the schedule hid it." },
    { q: "How do you stream to file?", a: "Read with a streaming select and write with a streaming writer." },
  ],
}
