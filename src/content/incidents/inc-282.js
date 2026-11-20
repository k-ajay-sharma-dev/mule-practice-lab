export default {
  id: 'inc-282',
  category: 'incidents',
  title: "Outbound Jobs Started From the Support Console Run Twice",
  level: 'ADVANCED',
  tags: ["myproject","oracle","planning-platform","outbound","async"],
  estMinutes: 25,
  investigation: {
    logs: [
      { text: "2026-11-18 10:00:00 INFO  [out-api] POST /jobs type=Location accepted jobId=J-901 status=STARTED", relevant: true, why: "A job starts." },
      { text: "2026-11-18 10:00:05 INFO  [out-api] POST /jobs type=Location accepted jobId=J-902 status=STARTED", relevant: true, why: "The user clicked again." },
      { text: "2026-11-18 10:00:05 INFO  [out-api] Both jobs call PKG_OUT.GENERATE_LOCATION asynchronously", relevant: true, why: "Two generations at once." },
      { text: "2026-11-18 10:20:00 WARN  [planning-platform] Two location files received seq=88 seq=89 with same content", relevant: true, why: "The platform sees two." },
      { text: "2026-11-18 23:59:00 INFO  [out-api] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why did the job run twice?",
        options: [
          "The API starts a new job without checking for a running one",
          "Oracle ran PKG_OUT.GENERATE_LOCATION twice for one call",
          "The planning platform requested the location file twice",
          "The scheduler started a job at the same time as support",
        ],
        answer: 0,
        explain: "No guard against concurrent jobs.",
      },
      {
        type: 'single',
        prompt: "What should the API do?",
        options: [
          "Refuse or return the running job when one of the same type is active",
          "Start the new job and cancel the older one of the same type",
          "Wait five seconds between console clicks before accepting",
          "Let both jobs run and have the platform drop the later file",
        ],
        answer: 0,
        explain: "One active job per type.",
      },
      {
        type: 'multi',
        prompt: "How can you enforce that?",
        options: [
          "A unique index on type for active jobs",
          "A lock row per type checked in a transaction",
          "Return 409 with the running job ID",
          "Disable the console button and rely on that alone",
        ],
        answer: [0,1,2],
        explain: "Enforce it in the database, not only in the UI.",
      },
      {
        type: 'single',
        prompt: "Why use the database to enforce it?",
        options: [
          "It works across all workers and API replicas",
          "A database check is faster than an in-memory flag",
          "Oracle procedures cannot run without a lock row",
          "The console cannot read state held inside the API",
        ],
        answer: 0,
        explain: "Shared state is in the database.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Tell the platform to ignore seq 89",
          "Add the one active job rule",
          "Return 409 for repeats",
          "Disable the button while running",
          "Test with two clicks",
        ],
        explain: "Contain, enforce, inform, improve, test.",
      },
    ],
  },
  description: `
## Symptoms
- The planning platform got two identical location files.

## Change / Context
- Support staff can start outbound jobs from a console. Jobs run as async Oracle procedures.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 10:00:00 INFO  [out-api] POST /jobs type=Location accepted jobId=J-901 status=STARTED
2026-11-18 10:00:05 INFO  [out-api] POST /jobs type=Location accepted jobId=J-902 status=STARTED
2026-11-18 10:00:05 INFO  [out-api] Both jobs call PKG_OUT.GENERATE_LOCATION asynchronously
2026-11-18 10:20:00 WARN  [planning-platform] Two location files received seq=88 seq=89 with same content
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
    "Async jobs need a concurrency guard.",
    "Enforce it in the database.",
    "Return the running job.",
    "Use 409 for conflicts.",
    "UI guards are not enough.",
    "Test double clicks.",
  ],
  solution: `
**Diagnosis.** Two clicks started two jobs of the same type at once.

**Immediate mitigation.**
- Ask the platform to ignore the second file.

**Root cause.** No guard for one active job per type.

**Permanent fix.**
- Database rule and 409 response.

**Prevention.** Double click tests.
`,
  followUps: [
    { q: "What is a partial unique index?", a: "Oracle can index only active rows with a function based index." },
    { q: "What about the scheduler?", a: "The same guard protects scheduled starts." },
    { q: "What does 202 mean?", a: "Accepted, work continues in the background." },
    { q: "How does the console know status?", a: "It polls a GET on the job." },
  ],
}
