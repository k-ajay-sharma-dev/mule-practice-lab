export default {
  id: 'inc-302',
  category: 'incidents',
  title: "After a Crash the Batch Job Starts Again From the Beginning",
  level: 'INTERMEDIATE',
  tags: ["myproject","batch","restart","persistent-queues"],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: "2026-11-18 02:30:00 INFO  [stock-batch] Scheduler fired, job instance created records=800000", relevant: false },
      { text: "2026-11-18 03:10:00 INFO  [runtime] Worker restarted after out of memory", relevant: true, why: "A crash mid job." },
      { text: "2026-11-18 03:15:00 INFO  [stock-batch] Previous instance resumed records remaining=310000", relevant: true, why: "The old one resumed." },
      { text: "2026-11-18 03:15:01 INFO  [stock-batch] Startup check: job_log not COMPLETED, new job instance created records=800000", relevant: true, why: "The startup check started a new job too." },
    ],
    questions: [
      {
        type: 'single',
        prompt: "What is happening?",
        options: [
          "The old instance resumed and the startup check started a new one",
          "Only the new instance runs, and the old one was discarded",
          "The resumed instance reads the file again from the start",
          "The source file held 800,000 new rows on top of yesterday’s",
        ],
        answer: 0,
        explain: "Two instances now process the same data.",
      },
      {
        type: 'single',
        prompt: "What prevents the second instance?",
        options: [
          "A guard that skips the start while an unfinished run exists",
          "More heap so the worker does not crash mid job",
          "A ten minute delay before the startup check runs",
          "Smaller blocks so the job ends before any crash",
        ],
        answer: 0,
        explain: "Check before starting.",
      },
      {
        type: 'multi',
        prompt: "What makes double processing harmless?",
        options: [
          "Upserts by business key",
          "A run ID with a unique constraint per date",
          "A lock row in the database",
          "Plain inserts with no key check",
        ],
        answer: [0,1,2],
        explain: "Idempotency and a guard.",
      },
      {
        type: 'single',
        prompt: "Why did the old instance resume?",
        options: [
          "Batch queues are persistent, so unfinished instances resume",
          "The startup check restarted it from the job_log row",
          "Support resumed it by hand from Runtime Manager",
          "The worker replays every job from the last hour on restart",
        ],
        answer: 0,
        explain: "This is a feature, if you plan for it.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Stop the new instance",
          "Let the old one finish",
          "Add a start guard",
          "Use upserts",
          "Fix the memory issue",
        ],
        explain: "Contain, finish, guard, harden, root cause.",
      },
    ],
  },
  description: `
## Symptoms
- Stock rows doubled after last night’s crash.

## Change / Context
- A scheduler starts the batch job at 02:30 every night.
- When the app starts, a startup check also starts the job if today’s job_log row is not COMPLETED.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 02:30:00 INFO  [stock-batch] Scheduler fired, job instance created records=800000
2026-11-18 03:10:00 INFO  [runtime] Worker restarted after out of memory
2026-11-18 03:15:00 INFO  [stock-batch] Previous instance resumed records remaining=310000
2026-11-18 03:15:01 INFO  [stock-batch] Startup check: job_log not COMPLETED, new job instance created records=800000
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
    "Batch instances can resume after restart.",
    "A scheduler or startup check can start a second one.",
    "Guard against duplicate starts.",
    "Use upserts.",
    "Track runs by date.",
    "Fix the crash cause.",
  ],
  solution: `
**Diagnosis.** The old instance resumed and a new one also started.

**Immediate mitigation.**
- Stop the new instance.

**Root cause.** No guard against concurrent runs.

**Permanent fix.**
- Start guard and upserts.

**Prevention.** Fix memory and test restarts.
`,
  followUps: [
    { q: "Where do queued records live?", a: "In persistent storage managed by the runtime." },
    { q: "Can you see running instances?", a: "Yes, through runtime tools or logs." },
    { q: "Is resuming always good?", a: "Only if the job is safe to continue." },
    { q: "What about CloudHub?", a: "Check how persistence behaves on your platform." },
  ],
}
