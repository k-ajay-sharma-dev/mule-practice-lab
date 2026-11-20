export default {
  id: 'inc-214',
  category: 'incidents',
  title: "Every Blob Upload Returns 403 After Security Rotates the Storage Account Key",
  level: 'BEGINNER',
  tags: ["myproject","azure-blob","authentication","secrets","key-rotation"],
  estMinutes: 15,
  investigation: {
    logs: [
      { text: "2026-11-18 08:00:00 INFO  [security] Storage account key1 regenerated", relevant: true, why: "The key the app uses was replaced." },
      { text: "2026-11-18 08:02:11 ERROR [invoice-archive] Upload failed blob=2026/11/18/INV-4410.pdf status=403 code=AuthenticationFailed", relevant: true, why: "The app signs requests with the old key." },
      { text: "2026-11-18 08:02:11 INFO  [invoice-archive] Using credential from secure property azure.accountKey", relevant: true, why: "The key sits in a secure property set at deploy time." },
      { text: "2026-11-18 08:05:00 INFO  [invoice-archive] Retry queue depth=140", relevant: true, why: "Uploads are piling up." },
      { text: "2026-11-18 08:06:00 INFO  [invoice-archive] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why do uploads fail with 403?",
        options: [
          "The app still signs requests with the old key, which is no longer valid",
          "The app’s SAS token expired at 08:00, ninety days after it was issued",
          "The storage firewall now blocks the app’s outbound IP addresses",
          "The container lost its write permission when the key was regenerated",
        ],
        answer: 0,
        explain: "AuthenticationFailed means the signature does not match a valid key.",
      },
      {
        type: 'single',
        prompt: "What is the quickest safe fix?",
        options: [
          "Put the current key in the secure property and restart the app",
          "Set the container access level to public so uploads need no key",
          "Ask security to restore the old key1 value from their records",
          "Point the app at a new storage account created for invoices",
        ],
        answer: 0,
        explain: "Give the app the valid key. Opening the container would expose every invoice.",
      },
      {
        type: 'multi',
        prompt: "How do you rotate keys without an outage next time?",
        options: [
          "Move the app to key2, then regenerate key1, then move back later",
          "Read the key from a secrets store the app can refresh",
          "Use a managed identity or service principal instead of account keys",
          "Regenerate both keys at once so no old key stays valid",
        ],
        answer: [0,1,2],
        explain: "Two keys exist so one can be used while the other is rotated. Identities remove shared keys altogether.",
      },
      {
        type: 'single',
        prompt: "What about the 140 queued uploads?",
        options: [
          "Retry them once the key is fixed, and check none were dropped",
          "Purge them and ask the billing system to create the invoices again",
          "Upload them by hand from a laptop with Azure Storage Explorer",
          "Leave them, since the retry job sends them when it next runs",
        ],
        answer: 0,
        explain: "They are safe on the retry queue. Replay and count.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Get the current key from the security team",
          "Update the secure property and restart",
          "Replay the retry queue",
          "Agree a rotation runbook using both keys",
          "Plan a move to identity based access",
        ],
        explain: "Fix, recover, then make rotation routine.",
      },
    ],
  },
  description: `
## Symptoms
- From 08:02, every invoice upload to blob storage fails with 403.
- Nothing was deployed today.

## Change / Context
- The app authenticates with a storage account key held in a secure property.
- The security team rotates keys every 90 days and did so at 08:00 without telling the integration team.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 08:00:00 INFO  [security] Storage account key1 regenerated
2026-11-18 08:02:11 ERROR [invoice-archive] Upload failed blob=2026/11/18/INV-4410.pdf status=403 code=AuthenticationFailed
2026-11-18 08:02:11 INFO  [invoice-archive] Using credential from secure property azure.accountKey
2026-11-18 08:05:00 INFO  [invoice-archive] Retry queue depth=140
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
    "AuthenticationFailed means the key or signature is not valid.",
    "A rotated key breaks apps that still use it.",
    "Storage accounts have two keys so rotation can be staged.",
    "A secrets store or identity avoids key copies.",
    "Replay uploads that failed.",
    "Agree a rotation runbook with security.",
  ],
  solution: `
**Diagnosis.** Security regenerated the key the app uses. Requests signed with the old key are rejected with 403 AuthenticationFailed.

**Immediate mitigation.**
- Set the current key in the secure property and restart.
- Replay the queued uploads.

**Root cause.** Rotation was done without moving the app to the other key first.

**Permanent fix.**
- Rotate with both keys: move apps to key2, regenerate key1, and the reverse next time.
- Prefer a service principal or managed identity over account keys.

**Prevention.** A shared rotation runbook and an alert on 403 from storage.
`,
  followUps: [
    { q: "Why two keys?", a: "So apps can switch to one while the other is regenerated, with no outage." },
    { q: "Is a SAS better?", a: "A SAS limits rights and time, but it is still signed by a key, so plan its rotation too." },
    { q: "Where should the key live?", a: "In secure properties or a secrets store, never in code or logs." },
    { q: "How do you notice sooner?", a: "Alert on any 403 from the storage account." },
  ],
}
