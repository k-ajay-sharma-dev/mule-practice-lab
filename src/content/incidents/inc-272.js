export default {
  id: 'inc-272',
  category: 'incidents',
  title: "The Nightly Sales Extract for the Planning Platform Slows the Stores’ Morning Trade",
  level: 'EXPERT',
  tags: ["myproject","sql-server","planning-platform","sales","extract"],
  estMinutes: 30,
  investigation: {
    logs: [
      { text: "2026-11-18 06:30:00 INFO  [sales-extract] Schedule moved from 02:00 to 06:30 after last month’s failure", relevant: true, why: "The extract now overlaps opening." },
      { text: "2026-11-18 06:30:00 INFO  [sales-extract] Started full scan of sales_line rows=480000000", relevant: true, why: "A full scan of a huge table." },
      { text: "2026-11-18 07:00:00 WARN  [pos-api] Average checkout write ms=2400", relevant: true, why: "Store checkouts slow down." },
      { text: "2026-11-18 07:00:00 INFO  [dba] PAGEIOLATCH waits high, tempdb spills from sales extract", relevant: true, why: "The extract uses heavy IO." },
      { text: "2026-11-18 23:59:00 INFO  [sales-extract] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why are checkouts slow?",
        options: [
          "A full scan extract runs during opening and competes for IO",
          "Store networks are slow when all tills log in at opening",
          "The POS API has too few database connections at 07:00",
          "Tempdb ran out of space, so all writes now wait for it",
        ],
        answer: 0,
        explain: "The schedule change moved heavy work into trading hours.",
      },
      {
        type: 'single',
        prompt: "What is the best design?",
        options: [
          "Extract only yesterday’s data, from a replica, before opening",
          "Keep the full scan but run it at 12:00 when trade is lighter",
          "Add an index on every column the extract selects",
          "Give the extract a higher priority than the POS writes",
        ],
        answer: 0,
        explain: "Less data, another server, quiet hours.",
      },
      {
        type: 'multi',
        prompt: "What else helps?",
        options: [
          "Partition sales by date",
          "Stream the result to a file, not into tempdb",
          "Agree a latest finish time with stores",
          "Run the full scan again at noon as a check",
        ],
        answer: [0,1,2],
        explain: "Reduce the work and protect trading.",
      },
      {
        type: 'single',
        prompt: "Why was the schedule moved?",
        options: [
          "Last month’s failure was worked around by running later",
          "Stores asked for fresher sales data in the morning",
          "The planning platform now imports at 08:00, not 03:00",
          "The DBA moved it to free the 02:00 backup window",
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
2026-11-18 06:30:00 INFO  [sales-extract] Schedule moved from 02:00 to 06:30 after last month’s failure
2026-11-18 06:30:00 INFO  [sales-extract] Started full scan of sales_line rows=480000000
2026-11-18 07:00:00 WARN  [pos-api] Average checkout write ms=2400
2026-11-18 07:00:00 INFO  [dba] PAGEIOLATCH waits high, tempdb spills from sales extract
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
