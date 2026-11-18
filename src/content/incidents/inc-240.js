export default {
  id: 'inc-240',
  category: 'incidents',
  title: "Uploads Stop After the Security Team Moves the Private Key",
  level: 'BEGINNER',
  tags: ["myproject","sftp","auth","keys"],
  estMinutes: 15,
  investigation: {
    logs: [
      { text: "2026-11-18 08:00:02 ERROR [plan-upload] SFTP auth failed user=larkfield-int error=Auth fail", relevant: true, why: "Authentication fails." },
      { text: "2026-11-18 08:00:02 WARN  [plan-upload] identityFile=keys/sftp_id not found, falling back to password", relevant: true, why: "The key file path no longer exists." },
      { text: "2026-11-18 07:45:00 INFO  [deploy] Secrets moved to vault, files removed from app", relevant: true, why: "A change moved secrets." },
      { text: "2026-11-18 08:05:00 INFO  [plan-upload] Queue depth=34", relevant: true, why: "Files are waiting." },
      { text: "2026-11-18 23:59:00 INFO  [plan-upload] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why does auth fail?",
        options: [
          "The private key file the app used was removed, so it falls back to a password that is not set",
          "The partner locked the account",
          "The host key changed",
          "The folder is full",
        ],
        answer: 0,
        explain: "The log says the identity file is missing.",
      },
      {
        type: 'single',
        prompt: "What is the fix?",
        options: [
          "Point the connector to the key from the vault and redeploy",
          "Put the key in the code",
          "Email the key to the partner",
          "Use a blank password",
        ],
        answer: 0,
        explain: "Keep the key secret and reachable.",
      },
      {
        type: 'multi',
        prompt: "How should private keys be handled?",
        options: [
          "Stored in a vault or secure properties",
          "Protected with a passphrase where possible",
          "Never logged or committed to source control",
          "Shared by email with the team",
        ],
        answer: [0,1,2],
        explain: "Treat keys like passwords.",
      },
      {
        type: 'single',
        prompt: "What does the partner hold?",
        options: [
          "Only your public key",
          "Your private key",
          "Your passphrase",
          "Nothing",
        ],
        answer: 0,
        explain: "The private key never leaves you.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Load the key from the vault in config",
          "Redeploy",
          "Send queued files",
          "Add a startup check for the key",
          "Review other apps affected by the change",
        ],
        explain: "Fix, recover, prevent.",
      },
    ],
  },
  description: `
## Symptoms
- From 08:00 plan uploads fail with Auth fail.

## Change / Context
- A security change moved secrets to a vault this morning.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 08:00:02 ERROR [plan-upload] SFTP auth failed user=larkfield-int error=Auth fail
2026-11-18 08:00:02 WARN  [plan-upload] identityFile=keys/sftp_id not found, falling back to password
2026-11-18 07:45:00 INFO  [deploy] Secrets moved to vault, files removed from app
2026-11-18 08:05:00 INFO  [plan-upload] Queue depth=34
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
    "Key auth needs the private key at runtime.",
    "Keep keys in a vault or secure properties.",
    "Partners hold only your public key.",
    "Never log or commit private keys.",
    "Check secrets at startup.",
    "Review all apps after a secrets change.",
  ],
  solution: `
**Diagnosis.** The key file was removed when secrets moved to the vault. The app falls back to a password and fails.

**Immediate mitigation.**
- Configure the vault key and redeploy.

**Root cause.** The secrets change did not update the app config.

**Permanent fix.**
- Load the private key from the vault.

**Prevention.** Startup checks for required secrets and a change checklist.
`,
  followUps: [
    { q: "Why key auth instead of password?", a: "Keys are harder to guess and can be rotated per partner." },
    { q: "How do you rotate a key?", a: "Give the partner the new public key, allow both, switch, then remove the old." },
    { q: "What is a passphrase?", a: "A password that protects the private key file itself." },
    { q: "Should the app fail fast?", a: "Yes, a missing key should stop startup with a clear error." },
  ],
}
