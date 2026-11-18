export default {
  id: 'inc-217',
  category: 'incidents',
  title: "Scanned Delivery Notes Go Missing: Two Uploads in the Same Second Share One Blob Name",
  level: 'INTERMEDIATE',
  tags: ["myproject","azure-blob","naming","overwrite","concurrency"],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: "2026-11-18 15:10:02 INFO  [pod-scan] Uploaded blob=pod/20261118151002.jpg depot=DP-04", relevant: true, why: "The name is the time to the second." },
      { text: "2026-11-18 15:10:02 INFO  [pod-scan] Uploaded blob=pod/20261118151002.jpg depot=DP-09", relevant: true, why: "A second depot uploads in the same second, with the same name." },
      { text: "2026-11-18 15:10:02 DEBUG [pod-scan] Upload overwrite=true", relevant: true, why: "The second upload replaces the first." },
      { text: "2026-11-18 15:30:00 WARN  [support] Delivery note for DP-04 shows a DP-09 delivery", relevant: true, why: "The first scan is gone." },
      { text: "2026-11-18 15:31:00 INFO  [pod-scan] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why is the DP-04 scan gone?",
        options: [
          "Both uploads used the same name in the same second, and the second overwrote the first",
          "DP-04 never uploaded",
          "Azure lost it",
          "The container is full",
        ],
        answer: 0,
        explain: "A blob name is a key. Uploading to an existing name replaces the content.",
      },
      {
        type: 'single',
        prompt: "What makes a good blob name here?",
        options: [
          "A business ID such as depot and delivery ID, plus a unique part, under a date prefix",
          "The time to the second",
          "A random number only",
          "The scanner model",
        ],
        answer: 0,
        explain: "Business IDs make names meaningful and unique. A date prefix helps listing.",
      },
      {
        type: 'multi',
        prompt: "What else protects against overwrites?",
        options: [
          "Upload only if the blob does not already exist",
          "Turn on blob versioning or soft delete to recover overwritten data",
          "Use a unique ID in every name",
          "Upload slower",
        ],
        answer: [0,1,2],
        explain: "A condition on upload, versioning for recovery, and unique names each reduce the risk.",
      },
      {
        type: 'single',
        prompt: "Can the lost scan be recovered?",
        options: [
          "Only if versioning or soft delete was on, or the scanner kept a copy",
          "Always",
          "Never",
          "By renaming the blob",
        ],
        answer: 0,
        explain: "Without versioning or soft delete, the overwritten content is gone from storage.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Ask the depot to rescan the lost notes",
          "Change names to depot, delivery ID and a unique part",
          "Upload only when the name is new",
          "Turn on versioning or soft delete",
          "Search logs for other same-second names",
        ],
        explain: "Recover, fix naming, guard, add recovery, find other cases.",
      },
    ],
  },
  description: `
## Symptoms
- Some proof of delivery scans show the wrong delivery. Others are missing.

## Change / Context
- Each depot scanner uploads to one container. The blob name is the upload time to the second.
- Upload is set to overwrite existing blobs.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 15:10:02 INFO  [pod-scan] Uploaded blob=pod/20261118151002.jpg depot=DP-04
2026-11-18 15:10:02 INFO  [pod-scan] Uploaded blob=pod/20261118151002.jpg depot=DP-09
2026-11-18 15:10:02 DEBUG [pod-scan] Upload overwrite=true
2026-11-18 15:30:00 WARN  [support] Delivery note for DP-04 shows a DP-09 delivery
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
    "A blob name is unique within a container.",
    "Uploading to an existing name replaces it.",
    "Use business IDs and a unique part in names.",
    "Upload only if the name is new where overwrite is wrong.",
    "Versioning or soft delete allows recovery.",
    "Time alone is not a unique key.",
  ],
  solution: `
**Diagnosis.** Two depots uploaded in the same second. The names matched, so the second upload replaced the first.

**Immediate mitigation.**
- Ask depots to rescan the affected notes, found by searching for duplicate names in the logs.

**Root cause.** The name used only the time, and overwrite was allowed.

**Permanent fix.**
- Name blobs \`pod/2026/11/18/{depot}-{deliveryId}-{uuid}.jpg\`.
- Upload with a condition that the blob does not exist.

**Prevention.** Turn on versioning or soft delete, and alert when an upload overwrites.
`,
  followUps: [
    { q: "What condition stops overwrites?", a: "An If-None-Match condition on upload makes it fail if the blob exists. Check your connector supports it." },
    { q: "Why a date prefix?", a: "Listing by prefix then finds a day’s files fast." },
    { q: "Is a UUID alone enough?", a: "It is unique but tells support nothing. Combine it with business IDs." },
    { q: "What does versioning cost?", a: "Storage for old versions, so pair it with a lifecycle rule." },
  ],
}
