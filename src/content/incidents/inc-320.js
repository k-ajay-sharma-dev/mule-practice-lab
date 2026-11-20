export default {
  id: 'inc-320',
  category: 'incidents',
  title: "The Nightly Chain of Large Files Finishes After Stores Open",
  level: 'EXPERT',
  tags: ["myproject","large-files","planning-platform","end-to-end","planning"],
  estMinutes: 30,
  investigation: {
    logs: [
      { text: "2026-11-18 00:00:00 INFO  [chain] Extract sales from SQL Server started", relevant: true, why: "Step 1." },
      { text: "2026-11-18 02:30:00 INFO  [chain] Upload sales to planning platform via SFTP finished", relevant: true, why: "Step 2 ends at 02:30." },
      { text: "2026-11-18 05:40:00 INFO  [planning-platform] Plan run finished, files ready", relevant: true, why: "The platform plan run takes 3 h 10 min." },
      { text: "2026-11-18 08:20:00 INFO  [chain] Plans loaded into store database", relevant: true, why: "Stores open at 08:00." },
      { text: "2026-11-18 23:59:00 INFO  [chain] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Where does the time go in the steps the integration team owns?",
        options: [
          "Extract and upload take 2.5 hours, plan load about 2 h 40 min",
          "Almost all of it in the SFTP upload, about 2 hours",
          "Mostly in the plan load, which takes over 4 hours",
          "Evenly, about 1 hour in each of the four steps",
        ],
        answer: 0,
        explain: "Measure each step.",
      },
      {
        type: 'single',
        prompt: "What gives the best gain?",
        options: [
          "Send deltas, not full extracts, and load plans with bulk MERGE",
          "Move SFTP to a faster cipher and keep full extracts",
          "Start the chain at 01:00 so the database is quieter",
          "Add detailed logs to each step to find slow rows",
        ],
        answer: 0,
        explain: "Less data and faster loads.",
      },
      {
        type: 'multi',
        prompt: "What else helps the chain?",
        options: [
          "Start the plan load as soon as each region file arrives",
          "Compress files for transfer",
          "Alert when a step runs late against a timeline",
          "Run everything one after another with no checks",
        ],
        answer: [0,1,2],
        explain: "Parallelism, size and visibility.",
      },
      {
        type: 'single',
        prompt: "Why a timeline alert?",
        options: [
          "To act before stores open, not after",
          "To build a weekly report of late runs",
          "To bill the planning platform for delays",
          "To restart the chain when it runs late",
        ],
        answer: 0,
        explain: "Know early.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Measure each step",
          "Move to deltas",
          "Bulk load plans per region",
          "Add a timeline alert",
          "Agree the deadline with stores",
        ],
        explain: "Measure, reduce, speed, watch, agree.",
      },
    ],
  },
  description: `
## Symptoms
- Stores open without plans three days a week.

## Change / Context
- A nightly chain moves sales out and plans back. Stores open at 08:00.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 00:00:00 INFO  [chain] Extract sales from SQL Server started
2026-11-18 02:30:00 INFO  [chain] Upload sales to planning platform via SFTP finished
2026-11-18 05:40:00 INFO  [planning-platform] Plan run finished, files ready
2026-11-18 08:20:00 INFO  [chain] Plans loaded into store database
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
    "Measure each step of a chain.",
    "Send deltas.",
    "Bulk load results.",
    "Process parts as they arrive.",
    "Compress transfers.",
    "Alert against a timeline.",
  ],
  solution: `
**Diagnosis.** Full extracts and slow plan loads push the chain past 08:00.

**Immediate mitigation.**
- Tell stores of delays.

**Root cause.** Volume grew; the chain did not change.

**Permanent fix.**
- Deltas, bulk loads, per region processing.

**Prevention.** Timeline alerts.
`,
  followUps: [
    { q: "What is a timeline alert?", a: "An alert when a step has not finished by its expected time." },
    { q: "Can the platform run faster?", a: "Ask the platform team, but fix your own steps first." },
    { q: "Why per region?", a: "Stores in early regions get plans sooner." },
    { q: "Who owns the deadline?", a: "Store operations." },
  ],
}
