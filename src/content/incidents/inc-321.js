export default {
  id: 'inc-321',
  category: 'incidents',
  title: "A Mule App Copies 200 GB a Night Between Storage Accounts",
  level: 'EXPERT',
  tags: ["myproject","large-files","architecture","tool-choice"],
  estMinutes: 30,
  investigation: {
    logs: [
      { text: "2026-11-18 00:00:00 INFO  [archive-copy] Copy blobs count=120000 totalGB=200", relevant: true, why: "Huge volume." },
      { text: "2026-11-18 00:00:00 INFO  [archive-copy] Download then upload through Mule", relevant: true, why: "Every byte goes through Mule." },
      { text: "2026-11-18 06:00:00 INFO  [archive-copy] Progress GB=95", relevant: true, why: "Half done by morning." },
      { text: "2026-11-18 06:00:00 INFO  [finance] Egress and worker costs rising monthly", relevant: true, why: "Costs grow." },
      { text: "2026-11-18 23:59:00 INFO  [archive-copy] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why is this design poor?",
        options: [
          "Mule moves every byte, while storage can copy server side",
          "Mule cannot read blobs larger than 2 GB in one call",
          "The network link between the accounts is saturated",
          "Too many blobs are stored in each container",
        ],
        answer: 0,
        explain: "Use the right tool.",
      },
      {
        type: 'single',
        prompt: "What is better?",
        options: [
          "Server side copy or storage replication, with Mule orchestrating",
          "Bigger workers so each blob downloads and uploads faster",
          "Four more workers that each copy a share of the blobs",
          "Run the copy at noon, when the network is quieter",
        ],
        answer: 0,
        explain: "Let storage move bytes.",
      },
      {
        type: 'multi',
        prompt: "When should Mule handle large files?",
        options: [
          "When it must transform or validate content",
          "When it routes small references",
          "When it orchestrates and tracks jobs",
          "When it only copies bytes",
        ],
        answer: [0,1,2],
        explain: "Mule adds value with logic, not raw copying.",
      },
      {
        type: 'single',
        prompt: "What should Mule track instead?",
        options: [
          "Job status, counts and failures from the copy service",
          "Every byte moved, logged per blob in Mule",
          "Only errors, since successful copies need no record",
          "The storage account keys used for each copy",
        ],
        answer: 0,
        explain: "Orchestrate and report.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Measure current cost and time",
          "Test server side copy",
          "Move copying to storage",
          "Keep Mule for orchestration",
          "Review other byte moving flows",
        ],
        explain: "Measure, test, move, keep, review.",
      },
    ],
  },
  description: `
## Symptoms
- The archive copy does not finish and costs keep rising.

## Change / Context
- Mule downloads and uploads every blob.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 00:00:00 INFO  [archive-copy] Copy blobs count=120000 totalGB=200
2026-11-18 00:00:00 INFO  [archive-copy] Download then upload through Mule
2026-11-18 06:00:00 INFO  [archive-copy] Progress GB=95
2026-11-18 06:00:00 INFO  [finance] Egress and worker costs rising monthly
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
    "Do not stream bytes through Mule for plain copies.",
    "Use server side copy or replication.",
    "Mule orchestrates and tracks.",
    "Mule adds value when transforming.",
    "Measure cost and time.",
    "Review similar flows.",
  ],
  solution: `
**Diagnosis.** Mule moves 200 GB that storage could copy directly.

**Immediate mitigation.**
- Move the copy to a storage feature.

**Root cause.** Tool choice.

**Permanent fix.**
- Server side copy, Mule for orchestration.

**Prevention.** Architecture review of byte moving flows.
`,
  followUps: [
    { q: "What is server side copy?", a: "A storage API that copies data without it passing through the caller." },
    { q: "Can Mule start it?", a: "Yes, with a REST call, then poll status." },
    { q: "What about transformations?", a: "Then Mule may need to read the data, in streams." },
    { q: "How do you justify the change?", a: "Show time and cost before and after." },
  ],
}
