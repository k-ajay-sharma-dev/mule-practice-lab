export default {
  id: 'inc-248',
  category: 'incidents',
  title: "The Planning Platform Applies Two Item Updates in the Wrong Order",
  level: 'EXPERT',
  tags: ["myproject","sftp","planning-platform","sequence","master-data"],
  estMinutes: 30,
  investigation: {
    logs: [
      { text: "2026-11-18 12:00:00 INFO  [item-out] Uploaded items_delta_0412.txt seq=412", relevant: true, why: "Delta 412 sent." },
      { text: "2026-11-18 12:00:02 INFO  [item-out] Uploaded items_delta_0413.txt seq=413", relevant: true, why: "Delta 413 sent two seconds later." },
      { text: "2026-11-18 12:05:00 INFO  [planning-platform] Imported items_delta_0413.txt then items_delta_0412.txt", relevant: true, why: "The platform read them out of order." },
      { text: "2026-11-18 12:05:01 WARN  [planning-platform] Item ITM-5520 status set to ACTIVE", relevant: true, why: "An older change overwrote a newer one." },
      { text: "2026-11-18 23:59:00 INFO  [item-out] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why is the item wrong?",
        options: [
          "The platform imported delta 413 before 412, so the older change won",
          "Delta 413 had the item as ACTIVE because the extract was wrong",
          "Delta 413 failed to upload, so only 412 was imported",
          "The platform ignores DISCONTINUED and keeps the last status",
        ],
        answer: 0,
        explain: "Order matters for deltas.",
      },
      {
        type: 'single',
        prompt: "What makes order safe?",
        options: [
          "Sequence numbers the receiver applies in order",
          "A five second pause between the two uploads",
          "A separate SFTP folder for each delta file",
          "A unique random ID in each delta file name",
        ],
        answer: 0,
        explain: "The receiver needs a rule to sort by.",
      },
      {
        type: 'multi',
        prompt: "What else protects order?",
        options: [
          "The receiver holds a gap until the missing file arrives",
          "Send a full snapshot periodically to correct drift",
          "Store the last sequence sent in a table",
          "Let the receiver sort deltas by modified time",
        ],
        answer: [0,1,2],
        explain: "Sequences, gap checks and snapshots work together.",
      },
      {
        type: 'single',
        prompt: "Where should the next sequence come from?",
        options: [
          "A database sequence or table updated with the extract",
          "A counter held in the Mule app’s memory",
          "The count of files in the platform’s folder",
          "The hour and minute when the extract runs",
        ],
        answer: 0,
        explain: "It must survive restarts and never repeat.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Resend 413 so it applies last",
          "Check other items in both deltas",
          "Agree ordered import by sequence",
          "Add a gap check",
          "Schedule a weekly full snapshot",
        ],
        explain: "Correct, check, agree, guard, reset.",
      },
    ],
  },
  description: `
## Symptoms
- An item the business discontinued shows as active in the planning platform.

## Change / Context
- Item changes are sent as delta files several times a day.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 12:00:00 INFO  [item-out] Uploaded items_delta_0412.txt seq=412
2026-11-18 12:00:02 INFO  [item-out] Uploaded items_delta_0413.txt seq=413
2026-11-18 12:05:00 INFO  [planning-platform] Imported items_delta_0413.txt then items_delta_0412.txt
2026-11-18 12:05:01 WARN  [planning-platform] Item ITM-5520 status set to ACTIVE
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
    "Deltas must apply in order.",
    "Use sequence numbers.",
    "Receivers sort and check for gaps.",
    "Keep the sequence in a database.",
    "Snapshots correct drift.",
    "File times are not an order.",
  ],
  solution: `
**Diagnosis.** Two deltas arrived close together and the platform imported them out of order.

**Immediate mitigation.**
- Resend the newer delta.

**Root cause.** No agreed ordering rule between sender and receiver.

**Permanent fix.**
- Sequence numbers, ordered import and gap checks.

**Prevention.** Periodic full snapshots to correct drift.
`,
  followUps: [
    { q: "Why not send one file at a time and wait?", a: "Possible, but slow. Sequences let the receiver handle order." },
    { q: "What if a sequence is lost?", a: "The receiver waits and alerts. You resend it." },
    { q: "How often for a snapshot?", a: "Weekly is common. It depends on volume." },
    { q: "Do sequences reset?", a: "Not unless both sides agree a reset." },
  ],
}
