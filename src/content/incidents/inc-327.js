export default {
  id: 'inc-327',
  category: 'incidents',
  title: "The Hybrid Worker Loses Access to the Share After a Password Change",
  level: 'ADVANCED',
  tags: ["myproject","azure-file-share","identity","permissions"],
  estMinutes: 25,
  investigation: {
    logs: [
      { text: "2026-11-18 06:30:00 INFO  [it] svc-files password rotated", relevant: true, why: "The password changed." },
      { text: "2026-11-18 07:00:00 INFO  [share-reader] Mounting as service account svc-files", relevant: true, why: "A service account mounts the share." },
      { text: "2026-11-18 07:00:00 INFO  [share-reader] Using credential cached on host since 2026-08-01", relevant: true, why: "The host still has the old password." },
      { text: "2026-11-18 07:00:01 ERROR [share-reader] Access denied \\\\larkfieldfiles\\inbound", relevant: true, why: "The mount fails." },
      { text: "2026-11-18 07:05:00 INFO  [share-reader] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why is access denied?",
        options: [
          "The host still mounts with the old cached password",
          "The share was renamed when the password changed",
          "The share quota is full, so new mounts are refused",
          "The firewall now blocks port 445 from the worker",
        ],
        answer: 0,
        explain: "Rotation broke the stored credential.",
      },
      {
        type: 'single',
        prompt: "What is the right quick fix?",
        options: [
          "Update the stored credential on the host and remount",
          "Restart the worker so it picks up the new password",
          "Disable password rotation for the svc-files account",
          "Reset the share permissions to their default values",
        ],
        answer: 0,
        explain: "The cached credential must change. A restart reuses the same cached one.",
      },
      {
        type: 'multi',
        prompt: "What is better long term?",
        options: [
          "Identity based access with a managed or domain identity",
          "Rotation that updates all hosts",
          "An alert on mount failures",
          "Put the new password in plain text in the mount script",
        ],
        answer: [0,1,2],
        explain: "Remove manual credential copies.",
      },
      {
        type: 'single',
        prompt: "Who should know about rotations?",
        options: [
          "Every team whose systems use the account",
          "Only the IT team that performs the rotation",
          "Nobody, rotations should stay secret",
          "Only the storage account owner in Azure",
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
2026-11-18 06:30:00 INFO  [it] svc-files password rotated
2026-11-18 07:00:00 INFO  [share-reader] Mounting as service account svc-files
2026-11-18 07:00:00 INFO  [share-reader] Using credential cached on host since 2026-08-01
2026-11-18 07:00:01 ERROR [share-reader] Access denied \\\\larkfieldfiles\\inbound
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
