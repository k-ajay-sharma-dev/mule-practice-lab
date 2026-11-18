export default {
  id: 'inc-261',
  category: 'incidents',
  title: "Stores on FTP, SFTP and a File Share Report Different Daily Totals",
  level: 'EXPERT',
  tags: ["myproject","ftp","multi-source","reconciliation"],
  estMinutes: 30,
  investigation: {
    logs: [
      { text: "2026-11-18 07:00:00 INFO  [sales-hub] Received ftp=180 sftp=72 share=8 expected=260", relevant: true, why: "All stores reported." },
      { text: "2026-11-18 07:00:00 INFO  [sales-hub] Totals ftp=1.2M sftp=0.51M share=0.04M", relevant: true, why: "Totals by source." },
      { text: "2026-11-18 07:30:00 WARN  [finance] Hub total differs from finance by 0.6 percent", relevant: true, why: "A gap with finance." },
      { text: "2026-11-18 07:31:00 INFO  [sales-hub] FTP source rounding=2dp, SFTP rounding=none, share rounding=0dp", relevant: true, why: "Each source rounds differently." },
      { text: "2026-11-18 23:59:00 INFO  [sales-hub] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why do totals differ?",
        options: [
          "Each source rounds amounts differently",
          "Files are missing",
          "FTP lost data",
          "Finance is wrong",
        ],
        answer: 0,
        explain: "Every store reported. Rounding differs.",
      },
      {
        type: 'single',
        prompt: "What fixes it?",
        options: [
          "Agree one format with full precision, and convert in one canonical mapping",
          "Round everything to zero places",
          "Ignore it",
          "Use FTP only",
        ],
        answer: 0,
        explain: "One canonical model.",
      },
      {
        type: 'multi',
        prompt: "What helps reconciliation?",
        options: [
          "Totals per store compared with finance",
          "Counts per source",
          "The rule used by each source documented",
          "Only the grand total",
        ],
        answer: [0,1,2],
        explain: "Find where the gap starts.",
      },
      {
        type: 'single',
        prompt: "Where should rounding happen?",
        options: [
          "Once, at the end, by an agreed rule",
          "At every step",
          "At each store",
          "Never",
        ],
        answer: 0,
        explain: "Rounding early loses precision.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Find stores with the biggest gaps",
          "Confirm rounding rules per source",
          "Build one canonical mapping",
          "Rerun and reconcile",
          "Agree the rule with finance",
        ],
        explain: "Find, confirm, fix, prove, agree.",
      },
    ],
  },
  description: `
## Symptoms
- The daily sales total differs from finance by 0.6 percent.

## Change / Context
- Stores report over FTP, SFTP or a file share, depending on their age.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 07:00:00 INFO  [sales-hub] Received ftp=180 sftp=72 share=8 expected=260
2026-11-18 07:00:00 INFO  [sales-hub] Totals ftp=1.2M sftp=0.51M share=0.04M
2026-11-18 07:30:00 WARN  [finance] Hub total differs from finance by 0.6 percent
2026-11-18 07:31:00 INFO  [sales-hub] FTP source rounding=2dp, SFTP rounding=none, share rounding=0dp
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
    "Different sources may use different rules.",
    "Map to one canonical model.",
    "Round once, at the end.",
    "Reconcile per store.",
    "Document source rules.",
    "Agree rules with finance.",
  ],
  solution: `
**Diagnosis.** Each source rounds differently, so the totals drift from finance.

**Immediate mitigation.**
- Identify gaps per store and explain them.

**Root cause.** No canonical format across transports.

**Permanent fix.**
- One mapping with full precision and one rounding rule.

**Prevention.** Daily reconciliation per store.
`,
  followUps: [
    { q: "Why not fix each store?", a: "Fix the mapping once instead of many stores." },
    { q: "What type holds money?", a: "A decimal type, not a float." },
    { q: "Should transport affect data?", a: "No. Transport moves bytes. Rules belong in the mapping." },
    { q: "How do you show progress?", a: "A reconciliation report trending to zero." },
  ],
}
