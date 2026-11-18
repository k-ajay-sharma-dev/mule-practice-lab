export default {
  id: 'inc-246',
  category: 'incidents',
  title: "The Bank Rejects Payment Files After the PGP Key Is Renewed",
  level: 'ADVANCED',
  tags: ["myproject","sftp","pgp","encryption"],
  estMinutes: 25,
  investigation: {
    logs: [
      { text: "2026-11-18 16:00:00 INFO  [pay-out] Encrypted file=pay_20261118.pgp recipientKeyId=0xA1B2C3D4", relevant: true, why: "Mule encrypts with the old key." },
      { text: "2026-11-18 16:05:00 ERROR [bank] Cannot decrypt pay_20261118.pgp no secret key for 0xA1B2C3D4", relevant: true, why: "The bank no longer has the matching private key." },
      { text: "2026-11-15 09:00:00 INFO  [bank-mail] New public key 0xE5F6A7B8 effective 2026-11-18", relevant: true, why: "The bank sent a new key." },
      { text: "2026-11-18 16:10:00 WARN  [pay-out] Payments pending=1240", relevant: true, why: "Payments are waiting." },
      { text: "2026-11-18 23:59:00 INFO  [pay-out] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why does the bank reject the file?",
        options: [
          "Mule still encrypts with the old public key",
          "The file is corrupt",
          "SFTP failed",
          "The bank is down",
        ],
        answer: 0,
        explain: "The bank only holds the new private key.",
      },
      {
        type: 'single',
        prompt: "What is the fix?",
        options: [
          "Import the new public key, check its fingerprint, re-encrypt and resend",
          "Send the file unencrypted",
          "Ask the bank to keep the old key forever",
          "Use your own private key",
        ],
        answer: 0,
        explain: "Encrypt with the key the bank can decrypt.",
      },
      {
        type: 'multi',
        prompt: "What should be in place for key changes?",
        options: [
          "An owner for each partner key and its expiry",
          "A test file exchange before the effective date",
          "Fingerprint checks by a trusted channel",
          "Keys in source control",
        ],
        answer: [0,1,2],
        explain: "Plan key changes as small projects.",
      },
      {
        type: 'single',
        prompt: "Why must payment files be sent once only?",
        options: [
          "A double send could pay suppliers twice",
          "The bank charges per file",
          "SFTP cannot overwrite",
          "It is faster",
        ],
        answer: 0,
        explain: "Resend with care and confirm with the bank.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Confirm the bank did not process the failed file",
          "Import and verify the new key",
          "Re-encrypt and resend",
          "Confirm receipt with the bank",
          "Add key expiry to the partner calendar",
        ],
        explain: "Check, fix, resend, confirm, prevent.",
      },
    ],
  },
  description: `
## Symptoms
- Today’s supplier payment file is rejected by the bank.

## Change / Context
- Payment files are PGP encrypted and sent to the bank over SFTP.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 16:00:00 INFO  [pay-out] Encrypted file=pay_20261118.pgp recipientKeyId=0xA1B2C3D4
2026-11-18 16:05:00 ERROR [bank] Cannot decrypt pay_20261118.pgp no secret key for 0xA1B2C3D4
2026-11-15 09:00:00 INFO  [bank-mail] New public key 0xE5F6A7B8 effective 2026-11-18
2026-11-18 16:10:00 WARN  [pay-out] Payments pending=1240
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
    "PGP uses the recipient public key.",
    "Partners renew keys.",
    "Check fingerprints.",
    "Test before the effective date.",
    "Avoid double payments on resend.",
    "Track key expiries.",
  ],
  solution: `
**Diagnosis.** Mule encrypts with the bank’s old public key. The bank only has the new private key.

**Immediate mitigation.**
- Import the new key, re-encrypt and resend once.

**Root cause.** The key change notice was not acted on.

**Permanent fix.**
- Key owner, calendar and a test exchange for every change.

**Prevention.** Expiry alerts for partner keys.
`,
  followUps: [
    { q: "Which key decrypts?", a: "The bank private key, which never leaves the bank." },
    { q: "Do you sign files too?", a: "Often, with your private key, so the bank can verify the sender." },
    { q: "Where are keys kept?", a: "In a secure keyring or vault, not in code." },
    { q: "How do you avoid a double payment?", a: "Confirm the first file was not processed before resending." },
  ],
}
