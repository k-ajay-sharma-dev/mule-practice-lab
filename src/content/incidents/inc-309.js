export default {
  id: 'inc-309',
  category: 'incidents',
  title: "A Batch Job Loses Its Place When the App Is Redeployed Mid Run",
  level: 'EXPERT',
  tags: ["myproject","batch","cloudhub","persistence","scaling"],
  estMinutes: 30,
  investigation: {
    logs: [
      { text: "2026-11-18 02:00:00 INFO  [hist-batch] Job started records=2000000", relevant: false },
      { text: "2026-11-18 02:45:00 INFO  [deploy] New version deployed, replica replaced", relevant: true, why: "A deploy replaced the replica." },
      { text: "2026-11-18 02:46:00 INFO  [hist-batch] No unfinished job instances found", relevant: true, why: "The queued state was on the old replica." },
      { text: "2026-11-18 07:00:00 WARN  [recon] History rows=1150000 expected=2000000", relevant: true, why: "Half is missing." },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why did the job not resume?",
        options: [
          "Batch queue state lived on the replaced replica and was not kept",
          "The job finished",
          "The data was bad",
          "The scheduler",
        ],
        answer: 0,
        explain: "Persistence depends on where state lives.",
      },
      {
        type: 'single',
        prompt: "What is the practical fix?",
        options: [
          "Avoid deploys during batch windows and make the job restartable from a checkpoint",
          "Deploy faster",
          "Bigger replicas",
          "Turn off batch",
        ],
        answer: 0,
        explain: "Plan around state.",
      },
      {
        type: 'multi',
        prompt: "What makes a job restartable?",
        options: [
          "A checkpoint of the last processed key in a database",
          "Idempotent writes",
          "A rerun that skips done ranges",
          "Hoping it resumes",
        ],
        answer: [0,1,2],
        explain: "Own your progress state.",
      },
      {
        type: 'single',
        prompt: "Why reconcile counts?",
        options: [
          "To catch silent gaps like this one",
          "For fun",
          "It is required",
          "It is never useful",
        ],
        answer: 0,
        explain: "Counts reveal loss.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Rerun the missing range",
          "Freeze deploys during batch windows",
          "Add a checkpoint table",
          "Make writes idempotent",
          "Keep reconciliation",
        ],
        explain: "Recover, protect, checkpoint, harden, watch.",
      },
    ],
  },
  description: `
## Symptoms
- Sales history is missing 850,000 rows.

## Change / Context
- A deploy happened during the nightly batch.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 02:45:00 INFO  [deploy] New version deployed, replica replaced
2026-11-18 02:46:00 INFO  [hist-batch] No unfinished job instances found
2026-11-18 07:00:00 WARN  [recon] History rows=1150000 expected=2000000
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
    "Batch state lives somewhere specific.",
    "Replica replacement can lose it.",
    "Avoid deploys in batch windows.",
    "Keep checkpoints in a database.",
    "Idempotent writes allow reruns.",
    "Reconcile counts.",
  ],
  solution: `
**Diagnosis.** The deploy replaced the replica and its batch state.

**Immediate mitigation.**
- Rerun the missing range.

**Root cause.** Job relied on runtime state that did not survive the deploy.

**Permanent fix.**
- Checkpoints and idempotent writes.

**Prevention.** Deploy freeze during batch windows.
`,
  followUps: [
    { q: "Does CloudHub keep batch queues across deploys?", a: "Check the platform docs. Plan as if it may not." },
    { q: "What is a checkpoint?", a: "The last key or range finished, saved after each group." },
    { q: "Should batch be split?", a: "Splitting by date or key range makes reruns smaller." },
    { q: "Who controls deploy windows?", a: "The release process." },
  ],
}
