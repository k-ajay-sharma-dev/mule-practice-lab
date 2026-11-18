export default {
  id: 'inc-232',
  category: 'incidents',
  title: "Every Inventory File Is Loaded Twice After the App Is Scaled to Two Workers",
  level: 'INTERMEDIATE',
  tags: ["myproject","azure-file-share","duplicates","watermark"],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: "2026-11-18 04:00:01 INFO  [inv-loader] worker=1 Picked file=inv_20261118.csv", relevant: true, why: "Worker 1 took the file." },
      { text: "2026-11-18 04:00:01 INFO  [inv-loader] worker=2 Picked file=inv_20261118.csv", relevant: true, why: "Worker 2 took the same file." },
      { text: "2026-11-18 04:02:30 INFO  [inv-loader] worker=1 Loaded rows=260000", relevant: false },
      { text: "2026-11-18 04:02:31 INFO  [inv-loader] worker=2 Loaded rows=260000", relevant: true, why: "The same rows loaded twice." },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why is the file loaded twice?",
        options: [
          "Both workers poll the share and neither knows the other picked the file",
          "The producer sent two files",
          "The database duplicated rows",
          "The poll is too fast",
        ],
        answer: 0,
        explain: "Polling on two workers needs coordination.",
      },
      {
        type: 'single',
        prompt: "What is the simplest fix that keeps two workers?",
        options: [
          "Run the poll on the primary node only, or claim each file with an atomic move or lock first",
          "Add a sleep",
          "Read the file twice and compare",
          "Use a bigger worker",
        ],
        answer: 0,
        explain: "Only one worker should own each file.",
      },
      {
        type: 'multi',
        prompt: "Which make the load safe even if it runs twice?",
        options: [
          "Upsert rows on store and item",
          "Record loaded file names and checksums",
          "Use an object store lock per file name",
          "Delete the target table first each time",
        ],
        answer: [0,1,2],
        explain: "Idempotency and a claim protect against repeats.",
      },
      {
        type: 'single',
        prompt: "What does a move to a working folder give you?",
        options: [
          "Only the worker whose move succeeds processes the file",
          "Faster reads",
          "Smaller files",
          "Nothing",
        ],
        answer: 0,
        explain: "The second move fails because the file is gone.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Remove the duplicate rows",
          "Scale to one worker for now",
          "Add a claim step and idempotent load",
          "Test with two workers",
          "Scale back to two",
        ],
        explain: "Clean, contain, fix, prove, resume.",
      },
    ],
  },
  description: `
## Symptoms
- Stock levels doubled overnight for every store.

## Change / Context
- The loader was scaled from one to two workers yesterday for resilience.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 04:00:01 INFO  [inv-loader] worker=1 Picked file=inv_20261118.csv
2026-11-18 04:00:01 INFO  [inv-loader] worker=2 Picked file=inv_20261118.csv
2026-11-18 04:02:31 INFO  [inv-loader] worker=2 Loaded rows=260000
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
    "Polling on several workers needs coordination.",
    "Primary node only, or claim each file.",
    "An atomic move is a simple claim.",
    "Locks in an object store also work.",
    "Upserts make loads safe to repeat.",
    "Test scaling changes with real files.",
  ],
  solution: `
**Diagnosis.** Two workers poll the same share. Both see the file and both load it.

**Immediate mitigation.**
- Remove duplicates and go back to one worker.

**Root cause.** The design assumed a single poller.

**Permanent fix.**
- Claim each file with a move to a working folder, and load with upserts.

**Prevention.** Review every poller before scaling out.
`,
  followUps: [
    { q: "Is primary node only enough?", a: "It works, but the primary does all the work. Claims spread load." },
    { q: "What if a worker dies after claiming?", a: "A sweeper returns files that stayed in working too long." },
    { q: "Why upsert as well?", a: "Defence in depth. Any repeat still gives the right result." },
    { q: "Does the SFTP listener have the same issue?", a: "Yes, it also needs primary node only in a cluster." },
  ],
}
