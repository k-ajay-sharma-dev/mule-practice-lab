export default {
  id: 'inc-325',
  category: 'incidents',
  title: "Blob Uploads Slow Down Every Night When All Stores Send at Once",
  level: 'EXPERT',
  tags: ["myproject","azure-blob","throttling","performance"],
  estMinutes: 30,
  investigation: {
    logs: [
      { text: "2026-11-18 22:00:00 INFO  [store-uploads] Uploads started stores=600 parallel=600", relevant: true, why: "All stores upload together." },
      { text: "2026-11-18 22:00:20 WARN  [store-uploads] status=503 code=ServerBusy count=1800", relevant: true, why: "The account throttles." },
      { text: "2026-11-18 22:00:20 INFO  [store-uploads] Blob names start with date 2026/11/18/ for every store", relevant: true, why: "All writes hit one name range." },
      { text: "2026-11-18 23:30:00 INFO  [store-uploads] Last upload finished", relevant: true, why: "It takes 90 minutes." },
      { text: "2026-11-18 23:59:00 INFO  [store-uploads] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why do uploads get 503?",
        options: [
          "The burst exceeds what the account or partition serves, so Azure throttles",
          "The SAS token used by the stores expired at 22:00 for most of them",
          "The container hit its maximum number of blobs for a single day",
          "The upload worker ran out of outbound sockets with 600 at once",
        ],
        answer: 0,
        explain: "ServerBusy means slow down.",
      },
      {
        type: 'single',
        prompt: "What is the first fix?",
        options: [
          "Retry with exponential backoff and limit concurrency",
          "Retry each failed upload at once until it succeeds",
          "Move the upload worker to a bigger machine with more cores",
          "Upload each file twice so at least one copy lands",
        ],
        answer: 0,
        explain: "Back off when the service says busy.",
      },
      {
        type: 'multi',
        prompt: "What else spreads the load?",
        options: [
          "Stagger store send times",
          "Use names that do not all share one prefix pattern",
          "Use more than one storage account for very high rates",
          "Raise the parallel uploads from 600 to 1200 to finish sooner",
        ],
        answer: [0,1,2],
        explain: "Spread in time and across ranges.",
      },
      {
        type: 'single',
        prompt: "Why does the prefix matter?",
        options: [
          "Azure partitions by name range, so one hot range can limit throughput",
          "It does not, Azure spreads every blob evenly across servers",
          "The prefix sets which access tier the blob is billed at",
          "Blobs that share a prefix are locked together while written",
        ],
        answer: 0,
        explain: "Naming affects how load is spread.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Add backoff and a concurrency cap",
          "Stagger store windows",
          "Review naming",
          "Measure upload time",
          "Consider more accounts",
        ],
        explain: "Calm, spread, tune, measure, scale.",
      },
    ],
  },
  description: `
## Symptoms
- Store uploads take 90 minutes and some fail.

## Change / Context
- 600 stores upload at 22:00 into one container.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 22:00:00 INFO  [store-uploads] Uploads started stores=600 parallel=600
2026-11-18 22:00:20 WARN  [store-uploads] status=503 code=ServerBusy count=1800
2026-11-18 22:00:20 INFO  [store-uploads] Blob names start with date 2026/11/18/ for every store
2026-11-18 23:30:00 INFO  [store-uploads] Last upload finished
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
    "503 ServerBusy means throttling.",
    "Back off and cap concurrency.",
    "Stagger bursts.",
    "Name ranges affect partitions.",
    "Scale out accounts if needed.",
    "Measure throughput.",
  ],
  solution: `
**Diagnosis.** A 600 way burst into one name range triggers throttling.

**Immediate mitigation.**
- Backoff and a concurrency cap.

**Root cause.** All stores write at once into a hot range.

**Permanent fix.**
- Staggered windows and naming review.

**Prevention.** Measure and alert on 503 counts.
`,
  followUps: [
    { q: "Is retrying at once bad?", a: "Yes, it adds load and prolongs throttling." },
    { q: "What limits exist?", a: "Accounts and partitions have target rates. Check current Azure docs." },
    { q: "Can Event Grid help?", a: "It helps processing, not upload throughput." },
    { q: "What is jitter?", a: "Random extra delay so clients do not retry in sync." },
  ],
}
