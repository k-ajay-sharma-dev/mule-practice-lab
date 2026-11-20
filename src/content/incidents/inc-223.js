export default {
  id: 'inc-223',
  category: 'incidents',
  title: "An Auditor Asks for Last Year’s Files and Every Download Fails With 409: the Blobs Are in the Archive Tier",
  level: 'ADVANCED',
  tags: ["myproject","azure-blob","access-tier","lifecycle","archive"],
  estMinutes: 25,
  investigation: {
    logs: [
      { text: "2026-11-18 10:00:01 INFO  [audit-export] Downloading 1,240 blobs prefix=invoices/2025/", relevant: false },
      { text: "2026-11-18 10:00:02 ERROR [audit-export] Download failed status=409 code=BlobArchived", relevant: true, why: "Archived blobs cannot be read directly." },
      { text: "2026-11-18 10:00:02 INFO  [storage] Lifecycle rule: move to archive after 180 days", relevant: true, why: "A rule moved old invoices to the archive tier." },
      { text: "2026-11-18 10:00:03 INFO  [audit-export] Failed=1240 ok=0", relevant: true, why: "Nothing can be read." },
      { text: "2026-11-18 10:01:00 INFO  [audit-export] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why does every download fail?",
        options: [
          "They are in the archive tier and must be rehydrated before a read",
          "A legal hold blocks reads of blobs older than 180 days",
          "Another process holds a lease on each blob, so reads conflict",
          "The lifecycle rule soft deleted them, and 409 marks a deleted blob",
        ],
        answer: 0,
        explain: "Archived data is stored offline. Reading needs a rehydration first.",
      },
      {
        type: 'single',
        prompt: "How long can rehydration take?",
        options: [
          "Hours, depending on the priority chosen",
          "A few seconds per blob, like a normal read",
          "About a minute, whatever the priority",
          "Several weeks for a batch of 1,240 blobs",
        ],
        answer: 0,
        explain: "Plan for hours. A higher priority can be faster and costs more.",
      },
      {
        type: 'multi',
        prompt: "How do you get the auditor the files?",
        options: [
          "Rehydrate to hot or cool, or copy each to a new blob in an online tier",
          "Track progress and download when each blob is online",
          "Tell the auditor the expected time",
          "Retry the downloads every minute until the blobs come back online",
        ],
        answer: [0,1,2],
        explain: "Start rehydration, wait for it, and set expectations. Retrying a download never brings a blob back online by itself.",
      },
      {
        type: 'single',
        prompt: "What should the design have considered?",
        options: [
          "How fast the business may need old files, before choosing archive",
          "Only the storage cost, since old invoices are rarely read",
          "The file size, since only large blobs belong in archive",
          "Deleting invoices after 180 days instead of archiving them",
        ],
        answer: 0,
        explain: "Archive saves money but adds delay. Match the tier to how quickly files may be needed.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Tell the auditor the expected wait",
          "Start rehydration for the needed blobs",
          "Download them once online",
          "Review the lifecycle rule against audit needs",
          "Document how to request old files",
        ],
        explain: "Set expectations, rehydrate, deliver, then review the rule.",
      },
    ],
  },
  description: `
## Symptoms
- An audit export of 2025 invoices fails for every file with 409.

## Change / Context
- A lifecycle rule moves invoice blobs to the archive tier after 180 days to save cost.
- The audit team needs the files this week.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 10:00:02 ERROR [audit-export] Download failed status=409 code=BlobArchived
2026-11-18 10:00:02 INFO  [storage] Lifecycle rule: move to archive after 180 days
2026-11-18 10:00:03 INFO  [audit-export] Failed=1240 ok=0
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
    "Archive tier blobs cannot be read directly.",
    "Reading them gives 409 BlobArchived.",
    "Rehydration can take hours.",
    "Rehydrate in place or copy to an online tier.",
    "Choose tiers by how fast data may be needed.",
    "Document the process for old files.",
  ],
  solution: `
**Diagnosis.** A lifecycle rule moved the 2025 invoices to the archive tier. Archived blobs return 409 BlobArchived until rehydrated.

**Immediate mitigation.**
- Start rehydration for the 1,240 blobs, track it, and download when online.

**Root cause.** The tier was chosen for cost without agreeing how quickly audits need files.

**Permanent fix.**
- Adjust the rule, for example cool tier for a year before archive, if audits need faster access.

**Prevention.** An agreed retrieval time for old data and a documented request process.
`,
  followUps: [
    { q: "Which tiers exist?", a: "Hot, cool, cold and archive, with lower storage cost and higher access cost as you go." },
    { q: "Can you change the tier of one blob?", a: "Yes, set its tier, which starts rehydration for archived blobs." },
    { q: "Is there a minimum time in archive?", a: "Early deletion charges can apply. Check current pricing." },
    { q: "How do you know rehydration finished?", a: "Check the blob properties, or use an event when it completes." },
  ],
}
