export default {
  id: 'inc-230',
  category: 'incidents',
  title: "The REST Reader Starts Failing Every Night at Midnight",
  level: 'INTERMEDIATE',
  tags: ["myproject","azure-file-share","sas","rest"],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: "2026-11-18 00:00:04 ERROR [share-reader] List directory failed status=403 code=AuthenticationFailed detail=Signed expiry time has passed", relevant: true, why: "The SAS token expired." },
      { text: "2026-11-18 00:00:04 INFO  [share-reader] Using SAS from secure property share.sas", relevant: true, why: "The token is fixed in config." },
      { text: "2026-11-17 23:55:04 INFO  [share-reader] List directory ok found=14", relevant: true, why: "It worked five minutes earlier." },
      { text: "2026-11-18 08:30:00 INFO  [ops] Token generated 2026-11-11 by script, validity 7 days", relevant: true, why: "Someone made a 7 day token by hand." },
      { text: "2026-11-18 23:59:00 INFO  [share-reader] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why do calls fail from midnight?",
        options: [
          "The SAS token expired",
          "The share was deleted",
          "The REST API changed",
          "The worker restarted",
        ],
        answer: 0,
        explain: "The error says the signed expiry time has passed.",
      },
      {
        type: 'single',
        prompt: "What is the quick fix?",
        options: [
          "Issue a new SAS with the needed rights and update the secure property",
          "Make the share public",
          "Use the account key in the URL",
          "Turn off the check",
        ],
        answer: 0,
        explain: "Restore access with the least rights needed.",
      },
      {
        type: 'multi',
        prompt: "What is a better long term setup?",
        options: [
          "Use an identity such as a service principal, with tokens renewed automatically",
          "Generate the SAS from a stored access policy so it can be revoked",
          "Alert well before any token expires",
          "Make SAS tokens valid for 20 years",
        ],
        answer: [0,1,2],
        explain: "Avoid hand made tokens that expire without warning.",
      },
      {
        type: 'single',
        prompt: "What must never happen with a SAS?",
        options: [
          "It must never be written to logs or code",
          "It must never be used over HTTPS",
          "It must never have an expiry",
          "It must never be renewed",
        ],
        answer: 0,
        explain: "A SAS is a credential. Anyone with it has access.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Issue a new SAS",
          "Update the secure property and restart",
          "Process files missed overnight",
          "Move to identity based access",
          "Add an expiry alert",
        ],
        explain: "Restore, recover, then fix for good.",
      },
    ],
  },
  description: `
## Symptoms
- From 00:00 the reader cannot list the share. Nothing changed in the app.

## Change / Context
- The app reads the share over REST with a SAS token in a secure property. A colleague made the token with a script a week ago.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 00:00:04 ERROR [share-reader] List directory failed status=403 code=AuthenticationFailed detail=Signed expiry time has passed
2026-11-18 00:00:04 INFO  [share-reader] Using SAS from secure property share.sas
2026-11-17 23:55:04 INFO  [share-reader] List directory ok found=14
2026-11-18 08:30:00 INFO  [ops] Token generated 2026-11-11 by script, validity 7 days
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
    "A SAS has an expiry time.",
    "Hand made tokens expire silently.",
    "Identities renew tokens for you.",
    "Stored access policies allow revocation.",
    "Never log a SAS.",
    "Alert before expiry.",
  ],
  solution: `
**Diagnosis.** The 7 day SAS expired at midnight, so every call returns 403.

**Immediate mitigation.**
- Issue a new SAS and restart. Process the missed files.

**Root cause.** Access depends on a short lived token renewed by hand.

**Permanent fix.**
- Use a service principal or managed identity, or automate SAS renewal.

**Prevention.** Track every credential expiry and alert in advance.
`,
  followUps: [
    { q: "Why not a very long SAS?", a: "If it leaks, it works for years. Short and automated is safer." },
    { q: "What rights should the SAS have?", a: "Only the ones needed, such as read and list on that share." },
    { q: "What is a stored access policy?", a: "A named policy on the share. Revoking it invalidates all tokens tied to it." },
    { q: "How do you rotate without downtime?", a: "Issue the new credential before the old one expires." },
  ],
}
