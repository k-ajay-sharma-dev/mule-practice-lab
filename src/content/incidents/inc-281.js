export default {
  id: 'inc-281',
  category: 'incidents',
  title: "The Outbound Job Table Stays Locked and the Next Run Hangs",
  level: 'ADVANCED',
  tags: ["myproject","oracle","locks","select-for-update"],
  estMinutes: 25,
  investigation: {
    logs: [
      { text: "2026-11-18 02:00:00 INFO  [out-job] SELECT ... FROM out_job WHERE status=NEW FOR UPDATE", relevant: true, why: "The flow locks job rows." },
      { text: "2026-11-18 02:00:05 ERROR [out-job] Flow failed after lock, connection returned to pool without rollback", relevant: true, why: "The lock is not released." },
      { text: "2026-11-18 02:15:00 INFO  [out-job] Next run waiting on lock", relevant: true, why: "The next run waits." },
      { text: "2026-11-18 02:45:00 INFO  [dba] Session 331 holds row locks on OUT_JOB for 45 minutes", relevant: true, why: "An idle session holds locks." },
      { text: "2026-11-18 23:59:00 INFO  [out-job] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why does the next run hang?",
        options: [
          "A failed run left a transaction open, holding row locks",
          "The table is big",
          "The pool is small",
          "Oracle is down",
        ],
        answer: 0,
        explain: "Locks last until commit or rollback.",
      },
      {
        type: 'single',
        prompt: "What is the fix?",
        options: [
          "Wrap the work in a transaction scope that rolls back on error",
          "Restart the database",
          "Remove FOR UPDATE everywhere",
          "Add more workers",
        ],
        answer: 0,
        explain: "Every path must end the transaction.",
      },
      {
        type: 'multi',
        prompt: "What else helps?",
        options: [
          "FOR UPDATE SKIP LOCKED so runs skip rows others hold",
          "A short lock wait with NOWAIT or WAIT n",
          "Mark rows IN_PROGRESS and commit, then process",
          "Holding locks while calling slow APIs",
        ],
        answer: [0,1,2],
        explain: "Keep locks short.",
      },
      {
        type: 'single',
        prompt: "What does SKIP LOCKED give you?",
        options: [
          "Several workers can claim different rows without waiting",
          "Faster commits",
          "No locks at all",
          "Bigger batches",
        ],
        answer: 0,
        explain: "A common queue pattern in tables.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Ask the DBA to end the idle session",
          "Fix the transaction handling",
          "Add SKIP LOCKED or a claim step",
          "Test a failure mid run",
          "Alert on long lock waits",
        ],
        explain: "Release, fix, improve, test, watch.",
      },
    ],
  },
  description: `
## Symptoms
- Outbound runs hang every few nights.

## Change / Context
- The flow claims job rows with SELECT FOR UPDATE.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 02:00:00 INFO  [out-job] SELECT ... FROM out_job WHERE status=NEW FOR UPDATE
2026-11-18 02:00:05 ERROR [out-job] Flow failed after lock, connection returned to pool without rollback
2026-11-18 02:15:00 INFO  [out-job] Next run waiting on lock
2026-11-18 02:45:00 INFO  [dba] Session 331 holds row locks on OUT_JOB for 45 minutes
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
    "Row locks last until commit or rollback.",
    "Errors must roll back.",
    "SKIP LOCKED lets workers share a table.",
    "Claim rows and commit fast.",
    "Do not hold locks during slow calls.",
    "Alert on lock waits.",
  ],
  solution: `
**Diagnosis.** A failed run left a transaction open and the locks stayed.

**Immediate mitigation.**
- End the session.

**Root cause.** Error path did not roll back.

**Permanent fix.**
- Transaction scope with rollback, and claim pattern.

**Prevention.** Lock wait alerts.
`,
  followUps: [
    { q: "How does Mule manage transactions?", a: "With a try scope or a transactional operation and a defined action." },
    { q: "What is NOWAIT?", a: "Fail at once if the row is locked." },
    { q: "Why mark IN_PROGRESS?", a: "Short locks, clear state." },
    { q: "What if a worker dies mid job?", a: "A sweeper resets old IN_PROGRESS rows." },
  ],
}
