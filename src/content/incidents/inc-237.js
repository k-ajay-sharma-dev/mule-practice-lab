export default {
  id: 'inc-237',
  category: 'incidents',
  title: "After a Region Failover the Hub Reprocesses a Day of Files",
  level: 'EXPERT',
  tags: ["myproject","azure-file-share","dr","replication","failover"],
  estMinutes: 30,
  investigation: {
    logs: [
      { text: "2026-11-18 10:00:00 INFO  [ops] Storage failover to secondary region complete", relevant: true, why: "The storage account moved region." },
      { text: "2026-11-18 10:05:00 INFO  [file-hub] Poll directory=/inbound found=640", relevant: true, why: "Many files reappear." },
      { text: "2026-11-18 10:05:01 INFO  [file-hub] Processed name table last entry=2026-11-17T09:58", relevant: true, why: "The hub lost track because its state lived elsewhere." },
      { text: "2026-11-18 10:30:00 WARN  [erp] Duplicate invoice numbers received count=598", relevant: true, why: "Downstream sees repeats." },
      { text: "2026-11-18 23:59:00 INFO  [ops] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why did files come back?",
        options: [
          "Replication lag meant moves done before the failover were lost, so processed files appeared in inbound again",
          "The partner resent them",
          "The poll is broken",
          "Azure created copies",
        ],
        answer: 0,
        explain: "Geo replication is asynchronous. Recent changes may be lost.",
      },
      {
        type: 'single',
        prompt: "What protects downstream from repeats?",
        options: [
          "Idempotent processing by a business key such as invoice number",
          "Faster failover",
          "More workers",
          "Deleting the inbound folder",
        ],
        answer: 0,
        explain: "Then repeats do no harm.",
      },
      {
        type: 'multi',
        prompt: "What else should the DR plan cover?",
        options: [
          "How much data can be lost, the RPO",
          "Where the processed file state lives and whether it fails over too",
          "A runbook to reconcile after failover",
          "Running both regions at once with no coordination",
        ],
        answer: [0,1,2],
        explain: "Plan the state, the loss window and the reconcile.",
      },
      {
        type: 'single',
        prompt: "Where should processed state live?",
        options: [
          "In a store that fails over with, or is reconciled against, the files",
          "Only in memory",
          "In logs",
          "In the file name",
        ],
        answer: 0,
        explain: "State and data must agree after failover.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Pause the hub",
          "Compare inbound files with processed state",
          "Remove repeats from the ERP",
          "Resume with idempotent checks",
          "Update the DR runbook",
        ],
        explain: "Pause, reconcile, clean, resume, learn.",
      },
    ],
  },
  description: `
## Symptoms
- After failover the ERP receives 598 duplicate invoices.

## Change / Context
- The share is geo replicated. The hub tracks processed file names in a table in another region.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 10:00:00 INFO  [ops] Storage failover to secondary region complete
2026-11-18 10:05:00 INFO  [file-hub] Poll directory=/inbound found=640
2026-11-18 10:05:01 INFO  [file-hub] Processed name table last entry=2026-11-17T09:58
2026-11-18 10:30:00 WARN  [erp] Duplicate invoice numbers received count=598
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
    "Geo replication is asynchronous.",
    "Failover can lose recent changes.",
    "Idempotent processing protects downstream.",
    "Keep processed state consistent with the files.",
    "Know the RPO.",
    "Reconcile after every failover.",
  ],
  solution: `
**Diagnosis.** Recent moves did not replicate. After failover, processed files were in inbound again and the hub sent them again.

**Immediate mitigation.**
- Pause, reconcile and remove duplicates.

**Root cause.** Processing was not idempotent and DR did not plan for lost changes.

**Permanent fix.**
- Check business keys before posting and reconcile state after failover.

**Prevention.** A tested DR runbook with a reconcile step.
`,
  followUps: [
    { q: "What is RPO?", a: "The amount of recent data you can afford to lose." },
    { q: "Is failover automatic?", a: "It can be customer started or managed by Microsoft. Know which applies." },
    { q: "Why not rely on file names?", a: "The same name may come back after failover. Business keys are safer." },
    { q: "How do you test DR?", a: "Run a planned failover in a test environment and reconcile." },
  ],
}
