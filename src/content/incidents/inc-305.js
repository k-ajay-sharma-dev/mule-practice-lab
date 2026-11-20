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
          "The hourly scheduler fires whether or not the last run ended",
          "The server clock jumped and fired the 02:00 run early",
          "A second copy of the app runs on another worker",
          "The batch engine restarts a job when it reaches 60 percent",
        ],
        answer: 0,
        explain: "Schedulers do not wait for jobs.",
      },
      {
        type: 'single',
        prompt: "What is a simple guard?",
        options: [
          "Skip a run if one is still active, using a lock or job row",
          "Run the scheduler every 30 minutes so runs stay short",
          "Add a sleep at the start of each run to let others end",
          "Disable the scheduler and start each run by hand",
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
          "Record each run’s start, end and status in a job row",
          "Let runs overlap and keep the last write",
        ],
        answer: [0,1,2],
        explain: "Guard, speed up, watch.",
      },
      {
        type: 'single',
        prompt: "Why is overlap harmful here?",
        options: [
          "Older snapshots can overwrite newer ones",
          "It doubles the database CPU for that hour",
          "It makes the second run skip rows the first updated",
          "It makes both runs fail on duplicate keys",
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
2026-11-18 01:00:00 INFO  [inv-batch] Scheduler fired, job started
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
