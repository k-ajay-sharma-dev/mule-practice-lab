export default {
  id: 'inc-269',
  category: 'incidents',
  title: "One Long Report Query Blocks Every Order Update",
  level: 'ADVANCED',
  tags: ["myproject","sql-server","transactions","blocking"],
  estMinutes: 25,
  investigation: {
    logs: [
      { text: "2026-11-18 11:00:00 INFO  [report] Started weekly sales report on orders table", relevant: true, why: "A big read query." },
      { text: "2026-11-18 11:00:30 WARN  [order-api] Update waiting on lock, blocked by session 112", relevant: true, why: "Writers are blocked." },
      { text: "2026-11-18 11:01:00 ERROR [order-api] Query timeout after 30000 ms", relevant: true, why: "Updates time out." },
      { text: "2026-11-18 11:05:00 INFO  [dba] Session 112 holds a table S lock after lock escalation, isolation read committed, snapshot off", relevant: true, why: "Readers take shared locks, and the escalated table lock is held until the scan ends." },
      { text: "2026-11-18 23:59:00 INFO  [report] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why are updates blocked?",
        options: [
          "The long report holds shared locks that block writers",
          "The order API opens too few database connections",
          "Session 112 is an order update that never committed",
          "A missing index makes each order update scan the table",
        ],
        answer: 0,
        explain: "Readers and writers block each other under read committed without snapshot.",
      },
      {
        type: 'single',
        prompt: "What is a lasting fix?",
        options: [
          "Enable read committed snapshot, or run reports on a replica",
          "Raise the order API query timeout to ten minutes",
          "Run the report twice a week so each run is shorter",
          "Move the database to a server with more CPU",
        ],
        answer: 0,
        explain: "Readers then use row versions instead of locks.",
      },
      {
        type: 'multi',
        prompt: "What else helps?",
        options: [
          "Run heavy reports outside trading hours",
          "Use a reporting copy of the data",
          "Index the report query",
          "Make order updates retry with no limit",
        ],
        answer: [0,1,2],
        explain: "Move or shorten the heavy read.",
      },
      {
        type: 'single',
        prompt: "What should the order API do on lock timeout?",
        options: [
          "Fail clearly so the caller can retry, and alert",
          "Wait with no timeout until the lock is released",
          "Return 200 and drop the update without a log",
          "Restart the app to clear the lock on the table",
        ],
        answer: 0,
        explain: "Visible failure with a retry plan.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Stop the report",
          "Retry failed updates",
          "Move reports to a replica",
          "Plan snapshot isolation with the DBA",
          "Alert on blocking",
        ],
        explain: "Release, recover, move, fix, watch.",
      },
    ],
  },
  description: `
## Symptoms
- Order updates time out every Wednesday from 11:00.

## Change / Context
- A weekly report runs on the live orders table.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 11:00:00 INFO  [report] Started weekly sales report on orders table
2026-11-18 11:00:30 WARN  [order-api] Update waiting on lock, blocked by session 112
2026-11-18 11:01:00 ERROR [order-api] Query timeout after 30000 ms
2026-11-18 11:05:00 INFO  [dba] Session 112 holds a table S lock after lock escalation, isolation read committed, snapshot off
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
    "Shared locks block writers under read committed.",
    "Read committed snapshot avoids it.",
    "Use replicas for reports.",
    "Schedule heavy reads.",
    "Fail clearly on lock timeout.",
    "Alert on blocking.",
  ],
  solution: `
**Diagnosis.** The weekly report holds locks that block order updates.

**Immediate mitigation.**
- Stop the report and retry updates.

**Root cause.** Heavy reads on the live table without snapshot isolation.

**Permanent fix.**
- Replica for reports, snapshot isolation.

**Prevention.** Blocking alerts.
`,
  followUps: [
    { q: "What does RCSI change?", a: "Readers see the last committed version without shared locks." },
    { q: "Does it cost anything?", a: "Version storage in tempdb." },
    { q: "Why not NOLOCK?", a: "It can read uncommitted or duplicated rows." },
    { q: "Who owns this change?", a: "The DBA, with testing." },
  ],
}
