export default {
  id: 'inc-334',
  category: 'incidents',
  title: "Oracle Refuses New Connections After the App Scales Up",
  level: 'INTERMEDIATE',
  tags: ["myproject","oracle","connections","sessions"],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: "2026-11-18 08:55:00 INFO  [deploy] item-api replicas 2 to 8, pool max 50", relevant: true, why: "Connections can now reach 8 x 50 = 400." },
      { text: "2026-11-18 09:00:00 ERROR [item-api] ORA-12516 TNS:listener could not find available handler", relevant: true, why: "The database has no room for sessions." },
      { text: "2026-11-18 09:00:00 INFO  [dba] processes limit 300, in use 300", relevant: true, why: "The limit is reached." },
      { text: "2026-11-18 09:00:00 INFO  [item-api] Pool open=36 active=4 idle=32 per replica, growing to 50", relevant: true, why: "Most open connections are idle, and the pools still try to grow." },
      { text: "2026-11-18 09:05:00 INFO  [item-api] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why are connections refused?",
        options: [
          "Eight replicas with pools of 50 exceed the database process limit",
          "The database password expired when the new replicas started",
          "The listener crashed under load and must be restarted",
          "A firewall rule blocks new connections from the new replicas",
        ],
        answer: 0,
        explain: "Pools multiply by replicas. 8 x 36 = 288 open already, and they try to reach 400.",
      },
      {
        type: 'single',
        prompt: "What is the fix?",
        options: [
          "Shrink each pool to measured use so the total fits",
          "Raise each pool max to 80 so requests stop waiting",
          "Restart the database to clear the stuck sessions",
          "Cut the number of queries the API makes per request",
        ],
        answer: 0,
        explain: "Only 4 connections per replica were active. A restart clears sessions only until the pools refill.",
      },
      {
        type: 'multi',
        prompt: "What else helps?",
        options: [
          "Set a minimum and idle timeout so idle connections close",
          "Agree a connection budget with the DBA",
          "Alert on processes used",
          "Open a new connection for every query instead",
        ],
        answer: [0,1,2],
        explain: "Budget and tidy pools.",
      },
      {
        type: 'single',
        prompt: "How do you size a pool?",
        options: [
          "From measured concurrent queries per replica, plus headroom",
          "As large as possible so no request ever waits",
          "Equal to the number of HTTP threads per replica",
          "The database limit divided by the number of apps",
        ],
        answer: 0,
        explain: "Measure, then size.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Lower pool max per replica",
          "Redeploy",
          "Agree a budget with the DBA",
          "Add idle timeouts",
          "Alert on session use",
        ],
        explain: "Fix, apply, agree, tidy, watch.",
      },
    ],
  },
  description: `
## Symptoms
- The item API fails after scaling to eight replicas.

## Change / Context
- Each replica has a pool of up to 50 connections.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 08:55:00 INFO  [deploy] item-api replicas 2 to 8, pool max 50
2026-11-18 09:00:00 ERROR [item-api] ORA-12516 TNS:listener could not find available handler
2026-11-18 09:00:00 INFO  [dba] processes limit 300, in use 300
2026-11-18 09:00:00 INFO  [item-api] Pool open=36 active=4 idle=32 per replica, growing to 50
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
    "Total connections equal pool times replicas.",
    "Databases limit sessions.",
    "Size pools from usage.",
    "Close idle connections.",
    "Agree a budget.",
    "Alert on usage.",
  ],
  solution: `
**Diagnosis.** Scaling multiplied pools past the database limit.

**Immediate mitigation.**
- Lower pool max and redeploy.

**Root cause.** Pool size not reviewed when scaling.

**Permanent fix.**
- Measured pool sizes and idle timeouts.

**Prevention.** Connection budget with the DBA.
`,
  followUps: [
    { q: "What is ORA-12516?", a: "The listener could not hand the connection to a server process, often because limits are reached." },
    { q: "Does more connections mean more speed?", a: "No, beyond a point it slows the database." },
    { q: "What is a connection budget?", a: "An agreed share of database sessions per app." },
    { q: "Where is the pool configured?", a: "In the Mule database config pooling profile." },
  ],
}
