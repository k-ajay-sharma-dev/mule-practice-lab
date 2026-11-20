export default {
  id: 'inc-237',
  category: 'incidents',
  title: "After a Region Failover the Hub Reprocesses a Day of Files",
  level: 'EXPERT',
  tags: ["myproject","azure-file-share","dr","replication","failover"],
  estMinutes: 30,
  investigation: {
    logs: [
      { text: "2026-11-18 10:00:00 INFO  [ops] Failover to secondary region complete: storage, hub, processed-files database", relevant: true, why: "The share, the hub and its state all moved region." },
      { text: "2026-11-18 10:05:00 INFO  [file-hub] Poll directory=/inbound files=640 not in processed table=640", relevant: true, why: "Every file in inbound looks new to the hub." },
      { text: "2026-11-18 10:05:01 INFO  [file-hub] Processed name table last entry=2026-11-17T09:58", relevant: true, why: "The DR copy of the state is a day old, while the files are almost current." },
      { text: "2026-11-18 10:30:00 WARN  [erp] Duplicate invoice numbers received count=598", relevant: true, why: "Downstream sees repeats." },
      { text: "2026-11-18 23:59:00 INFO  [ops] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why did files come back?",
        options: [
          "The DR table was a day old, so files done since then looked new",
          "Geo replication lag put a day of old files back into /inbound",
          "The partners resent a day of invoices when the region went down",
          "The failover copied each file twice into the secondary share",
        ],
        answer: 0,
        explain: "The files replicate within minutes, but the processed table in DR comes from a daily backup. The hub compared current files with day old state.",
      },
      {
        type: 'single',
        prompt: "What protects downstream from repeats?",
        options: [
          "Idempotent posting checked by a business key such as invoice number",
          "A faster failover, so fewer files are waiting when the hub starts",
          "A check on file names only, kept in the hub’s memory",
          "Purging /inbound during every failover before the hub starts",
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
          "Starting the hub in both regions so no files wait",
        ],
        answer: [0,1,2],
        explain: "Plan the state, the loss window and the reconcile.",
      },
      {
        type: 'single',
        prompt: "Where should processed state live?",
        options: [
          "In a store that fails over with the files, or is reconciled to them",
          "In the hub’s object store, which is rebuilt empty after failover",
          "In the primary region only, so it is never restored from backup",
          "In the daily backup only, since a day of loss is acceptable",
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
- The share is geo replicated, with a lag of a few minutes. Files stay in /inbound for two days.
- The hub decides what is new by checking each file name against a processed-files table.
- In the secondary region that table is restored from a daily backup taken at 10:00.
- The hub posts every new file to the ERP. The ERP accepts an invoice number it has already seen and flags it.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 10:00:00 INFO  [ops] Failover to secondary region complete: storage, hub, processed-files database
2026-11-18 10:05:00 INFO  [file-hub] Poll directory=/inbound files=640 not in processed table=640
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
    "Geo replication is asynchronous, and each store has its own recovery point.",
    "State restored from an older backup than the data makes old work look new.",
    "Idempotent processing protects downstream.",
    "Keep processed state consistent with the files.",
    "Know the RPO.",
    "Reconcile after every failover.",
  ],
  solution: `
**Diagnosis.** After failover the share was almost current, but the processed-files table came from yesterday’s 10:00 backup. Every file processed since then looked new, and the hub sent them again.

**Immediate mitigation.**
- Pause, reconcile and remove duplicates.

**Root cause.** The files and their processed state had very different recovery points, and processing was not idempotent.

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
