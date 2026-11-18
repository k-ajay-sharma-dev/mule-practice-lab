export default {
  id: 'inc-263',
  category: 'incidents',
  title: "Requests Time Out Waiting for a Database Connection at Lunch Peak",
  level: 'BEGINNER',
  tags: ["myproject","sql-server","pool","connections"],
  estMinutes: 15,
  investigation: {
    logs: [
      { text: "2026-11-18 12:05:00 ERROR [price-api] Cannot get connection, pool exhausted maxPoolSize=5 waiting=48", relevant: true, why: "The pool is full." },
      { text: "2026-11-18 12:05:00 INFO  [price-api] Average query ms=40 active connections=5", relevant: true, why: "Queries are fast." },
      { text: "2026-11-18 12:05:00 INFO  [price-api] Requests per second=220", relevant: true, why: "Peak traffic." },
      { text: "2026-11-18 12:05:00 INFO  [dba] SQL Server CPU 22 percent", relevant: true, why: "The server is not busy." },
      { text: "2026-11-18 23:59:00 INFO  [price-api] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why do requests time out?",
        options: [
          "The pool of 5 connections is too small for peak traffic",
          "Queries are slow",
          "SQL Server is overloaded",
          "The network is down",
        ],
        answer: 0,
        explain: "Fast queries and a quiet server point at the pool.",
      },
      {
        type: 'single',
        prompt: "What is the first fix?",
        options: [
          "Raise the pool size within what the server allows, and set a wait timeout",
          "Add a second database",
          "Cache nothing",
          "Restart hourly",
        ],
        answer: 0,
        explain: "Size the pool for the load.",
      },
      {
        type: 'multi',
        prompt: "What else helps?",
        options: [
          "Cache prices that change rarely",
          "Close connections quickly by streaming less",
          "Check every replica uses the same pool math",
          "Open a new connection per query without a pool",
        ],
        answer: [0,1,2],
        explain: "Fewer calls and correct sizing.",
      },
      {
        type: 'single',
        prompt: "Why consider replicas?",
        options: [
          "Each replica has its own pool, so total connections multiply",
          "Replicas share one pool",
          "They do not matter",
          "They reduce connections",
        ],
        answer: 0,
        explain: "Pool size times replicas must fit the server.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Raise the pool size",
          "Watch wait times",
          "Add a cache",
          "Agree connection limits with the DBA",
          "Load test the peak",
        ],
        explain: "Fix, watch, improve, agree, prove.",
      },
    ],
  },
  description: `
## Symptoms
- The price API times out every day around noon.

## Change / Context
- The app uses a pool of 5 connections.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 12:05:00 ERROR [price-api] Cannot get connection, pool exhausted maxPoolSize=5 waiting=48
2026-11-18 12:05:00 INFO  [price-api] Average query ms=40 active connections=5
2026-11-18 12:05:00 INFO  [price-api] Requests per second=220
2026-11-18 12:05:00 INFO  [dba] SQL Server CPU 22 percent
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
    "A small pool limits throughput.",
    "Size pools for peak.",
    "Total connections equal pool times replicas.",
    "Agree limits with the DBA.",
    "Cache stable data.",
    "Load test the peak.",
  ],
  solution: `
**Diagnosis.** Peak traffic needs more than 5 connections, so requests wait and time out.

**Immediate mitigation.**
- Raise the pool size.

**Root cause.** The pool was sized for test traffic.

**Permanent fix.**
- Size the pool with the DBA and add caching.

**Prevention.** Peak load tests.
`,
  followUps: [
    { q: "How big should the pool be?", a: "Enough for peak concurrency, within server limits." },
    { q: "What does a wait timeout do?", a: "It fails fast instead of hanging." },
    { q: "Where is the pool set in Mule?", a: "In the database config pooling profile." },
    { q: "Does a bigger pool always help?", a: "No. Too many can overload the server." },
  ],
}
