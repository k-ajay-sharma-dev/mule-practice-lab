export default {
  id: 'inc-273',
  category: 'incidents',
  title: "Writes Fail for a Minute After Every SQL Server Failover",
  level: 'EXPERT',
  tags: ["myproject","sql-server","failover","always-on"],
  estMinutes: 30,
  investigation: {
    logs: [
      { text: "2026-11-18 14:00:00 INFO  [dba] Availability group failover to node B", relevant: true, why: "A planned failover." },
      { text: "2026-11-18 14:00:01 ERROR [order-api] The target database is in read only state", relevant: true, why: "The app still talks to the old primary." },
      { text: "2026-11-18 14:00:01 INFO  [order-api] url=jdbc:sqlserver://sqlnode-a:1433", relevant: true, why: "The app points at a node, not the listener." },
      { text: "2026-11-18 14:01:10 INFO  [order-api] Pool refreshed, writes ok", relevant: true, why: "Recovery depends on the pool refresh." },
      { text: "2026-11-18 23:59:00 INFO  [dba] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why do writes fail after failover?",
        options: [
          "The app connects to node A directly, which is now a read only secondary",
          "The database is down",
          "The password changed",
          "Locks",
        ],
        answer: 0,
        explain: "Connect to the listener, not a node.",
      },
      {
        type: 'single',
        prompt: "What is the fix?",
        options: [
          "Use the availability group listener with MultiSubnetFailover where needed",
          "Point at node B",
          "Add both nodes in code",
          "Disable failover",
        ],
        answer: 0,
        explain: "The listener follows the primary.",
      },
      {
        type: 'multi',
        prompt: "What makes the app recover quickly?",
        options: [
          "Pool validation so dead connections are dropped",
          "Retries with backoff on transient errors",
          "Idempotent writes so retries are safe",
          "Long waits with no retry",
        ],
        answer: [0,1,2],
        explain: "Failover is expected. Plan for it.",
      },
      {
        type: 'single',
        prompt: "Why must retries be idempotent?",
        options: [
          "A write may have committed before the failover",
          "For speed",
          "Retries are rare",
          "They are not needed",
        ],
        answer: 0,
        explain: "Unknown results need safe retries.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Point to the listener",
          "Add pool validation",
          "Add retries with backoff",
          "Test a planned failover",
          "Add failover to the release checklist",
        ],
        explain: "Fix, recover faster, prove, prevent.",
      },
    ],
  },
  description: `
## Symptoms
- Each failover breaks order writes for about a minute.

## Change / Context
- SQL Server runs in an availability group with two nodes.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 14:00:00 INFO  [dba] Availability group failover to node B
2026-11-18 14:00:01 ERROR [order-api] The target database is in read only state
2026-11-18 14:00:01 INFO  [order-api] url=jdbc:sqlserver://sqlnode-a:1433
2026-11-18 14:01:10 INFO  [order-api] Pool refreshed, writes ok
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
    "Connect through the listener.",
    "Failover changes the primary.",
    "Validate pooled connections.",
    "Retry transient errors.",
    "Make writes idempotent.",
    "Test failover.",
  ],
  solution: `
**Diagnosis.** The app connects to a node, not the listener. After failover it writes to a read only secondary.

**Immediate mitigation.**
- Refresh the pool or restart.

**Root cause.** Wrong connection target.

**Permanent fix.**
- Listener, pool validation and retries.

**Prevention.** Planned failover tests.
`,
  followUps: [
    { q: "What is MultiSubnetFailover?", a: "A driver setting that speeds up connection when nodes are in different subnets." },
    { q: "Can reads go to secondaries?", a: "Yes, with read intent routing." },
    { q: "How long is a failover?", a: "Usually seconds, but apps must cope with more." },
    { q: "Should Mule restart?", a: "It should not need to with validation and retries." },
  ],
}
