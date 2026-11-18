export default {
  id: 'inc-236',
  category: 'incidents',
  title: "Sales and Inventory Feeds Disagree Because They Were Taken at Different Times",
  level: 'EXPERT',
  tags: ["myproject","azure-file-share","planning-platform","database","reconciliation"],
  estMinutes: 30,
  investigation: {
    logs: [
      { text: "2026-11-18 02:00:00 INFO  [sales-extract] Extract sales cutoff=2026-11-18T00:00 rows=812004", relevant: true, why: "Sales cut at midnight." },
      { text: "2026-11-18 02:45:00 INFO  [inv-extract] Extract inventory snapshotAt=2026-11-18T02:45 rows=260000", relevant: true, why: "Stock taken at 02:45." },
      { text: "2026-11-18 02:30:00 INFO  [ecom] Overnight orders committed count=4120", relevant: true, why: "Orders after midnight changed stock." },
      { text: "2026-11-18 06:00:00 WARN  [planning-platform] Stock does not reconcile with sales for 1,880 items", relevant: true, why: "The platform sees a mismatch." },
      { text: "2026-11-18 23:59:00 INFO  [sales-extract] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why do the feeds disagree?",
        options: [
          "Sales stop at midnight but stock was read at 02:45, after more orders",
          "The share lost rows",
          "The platform is wrong",
          "Both extracts failed",
        ],
        answer: 0,
        explain: "The two feeds describe different moments.",
      },
      {
        type: 'single',
        prompt: "What fixes it?",
        options: [
          "Take both from the same cut off, for example stock as of midnight",
          "Run sales later",
          "Ignore the warning",
          "Send stock twice",
        ],
        answer: 0,
        explain: "Use one agreed point in time for both.",
      },
      {
        type: 'multi',
        prompt: "How can you get stock as of midnight?",
        options: [
          "Read a midnight snapshot table",
          "Use a database snapshot or flashback query",
          "Subtract movements after midnight from current stock",
          "Read stock at any time",
        ],
        answer: [0,1,2],
        explain: "Any of these gives a consistent point in time.",
      },
      {
        type: 'single',
        prompt: "What should the control file include?",
        options: [
          "The cut off time each feed represents",
          "Only the file names",
          "The extract server name",
          "Nothing",
        ],
        answer: 0,
        explain: "The receiver can then reject mismatched feeds.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Explain the mismatch to the planners",
          "Re-extract stock as of midnight",
          "Resend inventory",
          "Add the cut off to the control file",
          "Add a check that both cut offs match",
        ],
        explain: "Explain, fix, resend, then prevent.",
      },
    ],
  },
  description: `
## Symptoms
- The planning platform flags 1,880 items where stock and sales do not reconcile.

## Change / Context
- Sales and stock are extracted from the store database by separate jobs and written to the share.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 02:00:00 INFO  [sales-extract] Extract sales cutoff=2026-11-18T00:00 rows=812004
2026-11-18 02:45:00 INFO  [inv-extract] Extract inventory snapshotAt=2026-11-18T02:45 rows=260000
2026-11-18 02:30:00 INFO  [ecom] Overnight orders committed count=4120
2026-11-18 06:00:00 WARN  [planning-platform] Stock does not reconcile with sales for 1,880 items
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
    "Related feeds need one cut off.",
    "Read stock as of the sales cut off.",
    "Snapshots or flashback give point in time data.",
    "State the cut off in the control file.",
    "Check cut offs match before sending.",
    "Tell the business what the mismatch means.",
  ],
  solution: `
**Diagnosis.** Sales stop at midnight but stock is read at 02:45, so overnight orders appear in stock but not in sales.

**Immediate mitigation.**
- Re-extract stock as of midnight and resend.

**Root cause.** The two extracts were scheduled separately with no shared cut off.

**Permanent fix.**
- Extract both from the same point in time.

**Prevention.** Cut off in the control file and a matching check.
`,
  followUps: [
    { q: "Why not run both at midnight?", a: "Running at the same time is not the same as reading the same moment." },
    { q: "What is a flashback query?", a: "An Oracle query that reads data as it was at a past time, within limits." },
    { q: "How do you prove the fix?", a: "The platform reconciliation shows zero mismatches." },
    { q: "Who owns the cut off?", a: "The business and the planning team agree it." },
  ],
}
