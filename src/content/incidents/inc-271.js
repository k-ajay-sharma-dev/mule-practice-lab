export default {
  id: 'inc-271',
  category: 'incidents',
  title: "After a Database Restore the Change Feed Sends Old Changes Again",
  level: 'ADVANCED',
  tags: ["myproject","sql-server","cdc","events"],
  estMinutes: 25,
  investigation: {
    logs: [
      { text: "2026-11-18 03:00:00 INFO  [dba] Database restored to 2026-11-17 22:00", relevant: true, why: "The database went back in time." },
      { text: "2026-11-18 03:10:00 INFO  [cdc-reader] Last LSN stored=0x00012A, current max=0x000110", relevant: true, why: "The stored position is ahead of the database." },
      { text: "2026-11-18 03:10:00 INFO  [cdc-reader] Reset to earliest available LSN", relevant: true, why: "The reader starts from the beginning." },
      { text: "2026-11-18 03:20:00 WARN  [erp] Duplicate customer updates count=48000", relevant: true, why: "Old changes were sent again." },
      { text: "2026-11-18 23:59:00 INFO  [dba] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why were old changes resent?",
        options: [
          "The stored LSN was past the restored data, so the reader reset to the start",
          "The restore turned CDC off and on, so it captured every row again",
          "The ERP rejected the first batch, so Mule sent all changes again",
          "The reader lost its stored LSN when the Mule app restarted at 03:00",
        ],
        answer: 0,
        explain: "The reset sends everything still kept.",
      },
      {
        type: 'single',
        prompt: "What should happen after a restore?",
        options: [
          "A runbook step sets the reader position and checks downstream",
          "The reader resets to the earliest LSN, as it did today",
          "CDC is turned off and on again to start a clean feed",
          "The reader keeps its stored LSN and waits to catch up",
        ],
        answer: 0,
        explain: "Restores need a plan for the change feed.",
      },
      {
        type: 'multi',
        prompt: "What protects downstream?",
        options: [
          "Idempotent updates by key and version",
          "A version check so old data never overwrites new",
          "Pausing the reader during restores",
          "Sending a full customer reload to the ERP each night",
        ],
        answer: [0,1,2],
        explain: "Old changes must not overwrite new ones.",
      },
      {
        type: 'single',
        prompt: "Why is a version check important?",
        options: [
          "A replayed old change could overwrite a newer value",
          "It lets the ERP skip updates with no field changes",
          "CDC rejects changes that have no version number",
          "It stops the reader from resetting after a restore",
        ],
        answer: 0,
        explain: "Last writer wins is not enough.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Pause the reader",
          "Find replayed updates downstream",
          "Correct overwritten data",
          "Set the right position",
          "Add the restore step to the runbook",
        ],
        explain: "Pause, find, fix, reset, document.",
      },
    ],
  },
  description: `
## Symptoms
- The ERP received 48,000 customer updates in ten minutes.

## Change / Context
- A Mule app reads SQL Server change data capture and sends updates to the ERP.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 03:00:00 INFO  [dba] Database restored to 2026-11-17 22:00
2026-11-18 03:10:00 INFO  [cdc-reader] Last LSN stored=0x00012A, current max=0x000110
2026-11-18 03:10:00 INFO  [cdc-reader] Reset to earliest available LSN
2026-11-18 03:20:00 WARN  [erp] Duplicate customer updates count=48000
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
    "CDC positions depend on the database history.",
    "A restore can invalidate the stored position.",
    "Resets can resend old changes.",
    "Use version checks downstream.",
    "Pause readers during restores.",
    "Runbooks for restores.",
  ],
  solution: `
**Diagnosis.** The restore moved the database back. The reader reset to the earliest change and resent old data.

**Immediate mitigation.**
- Pause, correct, and set the right position.

**Root cause.** No restore procedure for the change feed.

**Permanent fix.**
- Version checks downstream and a restore runbook.

**Prevention.** Pause the reader as part of any restore.
`,
  followUps: [
    { q: "What is an LSN?", a: "A log sequence number that marks a position in the database log." },
    { q: "How long is CDC data kept?", a: "For a retention period set by the DBA." },
    { q: "Could the ERP reject old data?", a: "Yes, if it checks a version or modified time." },
    { q: "Who runs the runbook?", a: "The DBA and the integration team together." },
  ],
}
