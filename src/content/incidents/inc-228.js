export default {
  id: 'inc-228',
  category: 'incidents',
  title: "Writes to the Share Fail With a Quota Error at Month End",
  level: 'BEGINNER',
  tags: ["myproject","azure-file-share","quota","capacity"],
  estMinutes: 15,
  investigation: {
    logs: [
      { text: "2026-11-30 22:10:00 ERROR [invoice-drop] Write failed file=inv_20261130_0412.xml status=413 code=ShareSizeLimitReached", relevant: true, why: "The share hit its size quota." },
      { text: "2026-11-30 22:10:00 INFO  [ops] Share invoices quotaGiB=100 usedGiB=100", relevant: true, why: "It is full." },
      { text: "2026-11-30 22:10:01 INFO  [ops] archive folder size GiB=81 oldest=2025-01-02", relevant: true, why: "Most of the space is old archive files." },
      { text: "2026-11-30 22:12:00 WARN  [invoice-drop] Retry queue depth=380", relevant: true, why: "Invoices are waiting." },
      { text: "2026-11-30 23:59:00 INFO  [invoice-drop] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why do writes fail?",
        options: [
          "The share reached its quota, mostly with old archive files",
          "The key expired",
          "The file names are wrong",
          "Azure is down",
        ],
        answer: 0,
        explain: "ShareSizeLimitReached means the share quota is used up.",
      },
      {
        type: 'single',
        prompt: "What is the fastest safe fix tonight?",
        options: [
          "Raise the share quota, then replay the retry queue",
          "Delete the newest files",
          "Write invoices to a laptop",
          "Turn off retries",
        ],
        answer: 0,
        explain: "Raising the quota restores writes at once. Clean up afterwards.",
      },
      {
        type: 'multi',
        prompt: "What stops this happening again?",
        options: [
          "Move or delete archive files by an agreed retention rule",
          "Alert when usage passes a threshold such as 80 percent",
          "Keep archives in cheaper blob storage",
          "Never archive",
        ],
        answer: [0,1,2],
        explain: "Retention plus an early alert keeps space free.",
      },
      {
        type: 'single',
        prompt: "Why did it happen at month end?",
        options: [
          "Month end has the most invoices, so the last free space went then",
          "Azure resets quotas monthly",
          "Keys rotate monthly",
          "It is random",
        ],
        answer: 0,
        explain: "Peaks expose capacity limits.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Raise the quota",
          "Replay the retry queue",
          "Confirm every invoice arrived",
          "Agree retention for the archive folder",
          "Add a usage alert",
        ],
        explain: "Restore, recover, check, then prevent.",
      },
    ],
  },
  description: `
## Symptoms
- At 22:10 on month end, invoice writes to the share start failing.

## Change / Context
- Processed invoices are moved to an archive folder on the same share and never removed.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-30 22:10:00 ERROR [invoice-drop] Write failed file=inv_20261130_0412.xml status=413 code=ShareSizeLimitReached
2026-11-30 22:10:00 INFO  [ops] Share invoices quotaGiB=100 usedGiB=100
2026-11-30 22:10:01 INFO  [ops] archive folder size GiB=81 oldest=2025-01-02
2026-11-30 22:12:00 WARN  [invoice-drop] Retry queue depth=380
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
    "A file share has a size quota.",
    "A full share rejects writes.",
    "Archives grow forever without a retention rule.",
    "Alert before the quota is reached.",
    "Peaks reveal capacity limits.",
    "Replay and count after recovery.",
  ],
  solution: `
**Diagnosis.** The share reached its quota. Most of it is old archive files.

**Immediate mitigation.**
- Raise the quota and replay the 380 queued invoices.

**Root cause.** No retention rule and no capacity alert.

**Permanent fix.**
- Move archives older than the retention period to cheaper storage or delete them.

**Prevention.** A usage alert at 80 percent and a scheduled cleanup.
`,
  followUps: [
    { q: "Is raising the quota enough?", a: "No. It buys time. Retention fixes the cause." },
    { q: "Where should archives live?", a: "Blob storage with a cool or archive tier is usually cheaper." },
    { q: "Who agrees retention?", a: "The business and compliance owners of the data." },
    { q: "How do you prove nothing was lost?", a: "Compare invoice counts sent with counts written." },
  ],
}
