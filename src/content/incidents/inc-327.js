export default {
  id: 'inc-327',
  category: 'incidents',
  title: "The Hybrid Worker Loses Access to the Share After a Password Change",
  level: 'ADVANCED',
  tags: ["myproject","azure-file-share","identity","permissions"],
  estMinutes: 25,
  investigation: {
    logs: [
      { text: "2026-11-18 07:00:00 ERROR [share-reader] Access denied \\\\larkfieldfiles\\inbound", relevant: true, why: "The mount fails." },
      { text: "2026-11-18 07:00:00 INFO  [share-reader] Mounted as service account svc-files", relevant: true, why: "A service account mounts the share." },
      { text: "2026-11-18 06:30:00 INFO  [it] svc-files password rotated", relevant: true, why: "The password changed." },
      { text: "2026-11-18 07:00:00 INFO  [share-reader] Credential cached on host since 2026-08-01", relevant: true, why: "The host still has the old one." },
      { text: "2026-11-18 23:59:00 INFO  [share-reader] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why is access denied?",
        options: [
          "The host mounts with a cached old password",
          "The share is gone",
          "Quota",
          "Network",
        ],
        answer: 0,
        explain: "Rotation broke the stored credential.",
      },
      {
        type: 'single',
        prompt: "What is the quick fix?",
        options: [
          "Update the stored credential on the host and remount",
          "Make the share public",
          "Disable rotation",
          "Use a personal account",
        ],
        answer: 0,
        explain: "Restore access properly.",
      },
      {
        type: 'multi',
        prompt: "What is better long term?",
        options: [
          "Identity based access with a managed or domain identity",
          "Rotation that updates all hosts",
          "An alert on mount failures",
          "Passwords in scripts",
        ],
        answer: [0,1,2],
        explain: "Remove manual credential copies.",
      },
      {
        type: 'single',
        prompt: "Who should know about rotations?",
        options: [
          "Every team whose systems use the account",
          "Nobody",
          "Only IT",
          "Only the vendor",
        ],
        answer: 0,
        explain: "Rotations need a list of consumers.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Update the credential and remount",
          "Process waiting files",
          "List all users of the account",
          "Plan identity based access",
          "Alert on mount failure",
        ],
        explain: "Restore, recover, map, improve, watch.",
      },
    ],
  },
  description: `
## Symptoms
- Store files are not read since 07:00.

## Change / Context
- An on premises worker mounts the share with a service account.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 07:00:00 ERROR [share-reader] Access denied \\\\larkfieldfiles\\inbound
2026-11-18 07:00:00 INFO  [share-reader] Mounted as service account svc-files
2026-11-18 06:30:00 INFO  [it] svc-files password rotated
2026-11-18 07:00:00 INFO  [share-reader] Credential cached on host since 2026-08-01
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
    "Password rotation breaks cached credentials.",
    "Remount after updating.",
    "Prefer identity based access.",
    "Track who uses each account.",
    "Alert on mount failures.",
    "Recover waiting files.",
  ],
  solution: `
**Diagnosis.** The service account password changed and the host still uses the old one.

**Immediate mitigation.**
- Update and remount.

**Root cause.** Rotation without updating consumers.

**Permanent fix.**
- Identity based access or automated rotation.

**Prevention.** Mount failure alerts.
`,
  followUps: [
    { q: "What is identity based access for Azure Files?", a: "Using directory identities instead of the storage key or shared passwords." },
    { q: "Why not the storage key?", a: "It grants full access and is hard to rotate safely." },
    { q: "How do you find consumers?", a: "Sign in logs and a register of systems." },
    { q: "Should Mule hold the password?", a: "Only in secure properties, if at all." },
  ],
}
