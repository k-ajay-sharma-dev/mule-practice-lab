export default {
  id: 'inc-305',
  category: 'incidents',
  title: "A Slow Batch Run Overlaps the Next Scheduled Run",
  level: 'ADVANCED',
  tags: ["myproject","batch","scheduler","overlap"],
  estMinutes: 25,
  investigation: {
    logs: [
      { text: "2026-11-18 01:00:00 INFO  [inv-batch] Scheduler fired, job started", relevant: false },
      { text: "2026-11-18 02:00:00 INFO  [inv-batch] Scheduler fired, job started", relevant: true, why: "A second run starts while the first is running." },
      { text: "2026-11-18 02:00:00 INFO  [inv-batch] First run progress=62 percent", relevant: true, why: "The first run is still going." },
      { text: "2026-11-18 02:40:00 WARN  [inv-batch] Inventory rows updated twice with different snapshots", relevant: true, why: "Two runs fight." },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why do runs overlap?",
        options: [
          "The scheduler fires every hour regardless of whether the last run finished",
          "The clock is wrong",
          "Two apps",
          "A bug in batch",
        ],
        answer: 0,
        explain: "Schedulers do not wait for jobs.",
      },
      {
        type: 'single',
        prompt: "What is a simple guard?",
        options: [
          "Skip a run if one is still active, using a lock or job row",
          "Run more often",
          "Remove the scheduler",
          "Sleep",
        ],
        answer: 0,
        explain: "One run at a time.",
      },
      {
        type: 'multi',
        prompt: "What else helps?",
        options: [
          "Make the job faster, so it fits the window",
          "Alert when a run is skipped",
          "Use a fixed delay rather than fixed frequency if available",
          "Allow overlaps",
        ],
        answer: [0,1,2],
        explain: "Guard, speed up, watch.",
      },
      {
        type: 'single',
        prompt: "Why is overlap harmful here?",
        options: [
          "Older snapshots can overwrite newer ones",
          "It is not harmful",
          "It saves time",
          "It uses less memory",
        ],
        answer: 0,
        explain: "Order of writes matters.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Stop the second run",
          "Reload the latest snapshot",
          "Add a run lock",
          "Alert on skips",
          "Tune job speed",
        ],
        explain: "Stop, correct, guard, watch, tune.",
      },
    ],
  },
  description: `
## Symptoms
- Inventory jumps up and down overnight.

## Change / Context
- The batch runs hourly. It now takes longer than an hour.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 02:00:00 INFO  [inv-batch] Scheduler fired, job started
2026-11-18 02:00:00 INFO  [inv-batch] First run progress=62 percent
2026-11-18 02:40:00 WARN  [inv-batch] Inventory rows updated twice with different snapshots
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
    "Schedulers do not wait for jobs.",
    "Use a run lock.",
    "Alert on skipped runs.",
    "Speed up the job.",
    "Older data can overwrite newer.",
    "Watch run duration.",
  ],
  solution: `
**Diagnosis.** A run took over an hour and the next one started.

**Immediate mitigation.**
- Stop the second and reload.

**Root cause.** No guard against overlapping runs.

**Permanent fix.**
- Run lock and skip with alert.

**Prevention.** Duration alerts.
`,
  followUps: [
    { q: "How do you lock in a cluster?", a: "With a database row or a shared object store lock." },
    { q: "Does Mule have a disallow concurrent option?", a: "Some sources and schedulers offer settings. Check your version." },
    { q: "What if the job always runs long?", a: "Change the schedule or the design." },
    { q: "Who needs to know about skips?", a: "Support, through an alert." },
  ],
}
