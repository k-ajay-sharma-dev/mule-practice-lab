export default {
  id: 'inc-252',
  category: 'incidents',
  title: "An Audit Finds FTP Passwords in Clear Text on the Network",
  level: 'BEGINNER',
  tags: ["myproject","ftp","security","credentials"],
  estMinutes: 15,
  investigation: {
    logs: [
      { text: "2026-11-18 09:00:00 WARN  [audit] Clear text credentials seen on port 21 user=marrow-int", relevant: true, why: "FTP sends passwords unencrypted." },
      { text: "2026-11-18 09:00:00 INFO  [audit] Source=integration runtime destination=ftp.supplier-a.example", relevant: true, why: "It comes from our integration." },
      { text: "2026-11-18 09:01:00 INFO  [supplier-a] Supports FTPS explicit on port 21 and SFTP on port 22", relevant: true, why: "Secure options exist." },
      { text: "2026-11-18 09:02:00 INFO  [order-out] Uploads per day=48", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "What is the problem?",
        options: [
          "Plain FTP sends the login and files without encryption",
          "The marrow-int password is too short and never rotated",
          "Port 21 is open, and it should be closed for uploads",
          "The integration logs print the password on each of 48 runs",
        ],
        answer: 0,
        explain: "Anyone on the path can read them.",
      },
      {
        type: 'single',
        prompt: "What is the best change?",
        options: [
          "Move to SFTP or FTPS with the supplier",
          "Change the FTP password every day",
          "Use a 32 character FTP password",
          "Batch the uploads to cut logins",
        ],
        answer: 0,
        explain: "Encrypt the session.",
      },
      {
        type: 'multi',
        prompt: "What else should happen?",
        options: [
          "Rotate the exposed password",
          "Store the new secret in secure properties",
          "Plan a cutover test with the supplier",
          "Keep plain FTP open as a fallback",
        ],
        answer: [0,1,2],
        explain: "Treat the old password as leaked.",
      },
      {
        type: 'single',
        prompt: "What is FTPS?",
        options: [
          "FTP over TLS",
          "FTP over SSH",
          "FTP on port 22",
          "Signed FTP files",
        ],
        answer: 0,
        explain: "SFTP is a different protocol over SSH.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Agree SFTP or FTPS with the supplier",
          "Test in a non production setup",
          "Switch production",
          "Rotate the old password",
          "Disable plain FTP for this partner",
        ],
        explain: "Plan, test, switch, rotate, close.",
      },
    ],
  },
  description: `
## Symptoms
- A security audit flags clear text passwords from the integration runtime.

## Change / Context
- Purchase orders go to supplier A over plain FTP.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 09:00:00 WARN  [audit] Clear text credentials seen on port 21 user=marrow-int
2026-11-18 09:00:00 INFO  [audit] Source=integration runtime destination=ftp.supplier-a.example
2026-11-18 09:01:00 INFO  [supplier-a] Supports FTPS explicit on port 21 and SFTP on port 22
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
    "Plain FTP is unencrypted.",
    "SFTP runs over SSH.",
    "FTPS is FTP over TLS.",
    "Rotate exposed passwords.",
    "Store secrets securely.",
    "Close plain FTP after cutover.",
  ],
  solution: `
**Diagnosis.** The integration uses plain FTP, so credentials and files cross the network unencrypted.

**Immediate mitigation.**
- Move to SFTP or FTPS and rotate the password.

**Root cause.** An old interface was never moved to a secure protocol.

**Permanent fix.**
- Use SFTP with keys, or FTPS.

**Prevention.** A rule that new partners use secure transfer only.
`,
  followUps: [
    { q: "Which works better through firewalls?", a: "SFTP uses one port. FTPS has the same data channel issues as FTP." },
    { q: "Explicit or implicit FTPS?", a: "Explicit starts on port 21 and upgrades. Implicit uses port 990." },
    { q: "Are the files also exposed?", a: "Yes, all data is in clear text." },
    { q: "What about old partners that only support FTP?", a: "Use a VPN or encrypt files with PGP as a stopgap." },
  ],
}
