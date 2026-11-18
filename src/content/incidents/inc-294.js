export default {
  id: 'inc-294',
  category: 'incidents',
  title: "Email Sending Stops When Basic Authentication Is Turned Off",
  level: 'ADVANCED',
  tags: ["myproject","email","oauth","microsoft-365"],
  estMinutes: 25,
  investigation: {
    logs: [
      { text: "2026-11-18 08:00:00 ERROR [notify] SMTP AUTH failed 535 5.7.139 Authentication unsuccessful, basic authentication is disabled", relevant: true, why: "The provider turned off basic auth." },
      { text: "2026-11-18 08:00:00 INFO  [notify] Auth=LOGIN user=notify@marrow.example", relevant: true, why: "The app uses user and password." },
      { text: "2026-11-01 09:00:00 INFO  [it-notice] Basic auth for SMTP will be disabled on 2026-11-18", relevant: true, why: "Notice given." },
      { text: "2026-11-18 08:05:00 WARN  [notify] Pending notifications=930", relevant: true, why: "Notifications pile up." },
      { text: "2026-11-18 23:59:00 INFO  [notify] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why does sending fail?",
        options: [
          "The provider disabled basic authentication for SMTP",
          "The password expired",
          "The relay is down",
          "TLS",
        ],
        answer: 0,
        explain: "The error states it.",
      },
      {
        type: 'single',
        prompt: "What are the options?",
        options: [
          "Use OAuth with a registered app, or send through an API such as a mail graph API, or an internal relay",
          "Re-enable basic auth forever",
          "Use a personal account",
          "Stop notifications",
        ],
        answer: 0,
        explain: "Modern auth or another path.",
      },
      {
        type: 'multi',
        prompt: "What does an OAuth setup need?",
        options: [
          "An app registration with mail send permission",
          "A client secret or certificate in secure properties",
          "Token refresh handled by the connector or flow",
          "The user password in code",
        ],
        answer: [0,1,2],
        explain: "Treat it as a service identity.",
      },
      {
        type: 'single',
        prompt: "What about the 930 pending?",
        options: [
          "Send them once auth works, and check none are stale",
          "Delete them",
          "Send to everyone",
          "Ignore",
        ],
        answer: 0,
        explain: "Some may be out of date.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Route through the internal relay as a stopgap",
          "Register the app for OAuth",
          "Update the connector config",
          "Send pending notifications",
          "Track auth deprecations",
        ],
        explain: "Stopgap, fix, configure, recover, watch.",
      },
    ],
  },
  description: `
## Symptoms
- No notification emails since 08:00.

## Change / Context
- The app sends through a cloud mail provider with user and password.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 08:00:00 ERROR [notify] SMTP AUTH failed 535 5.7.139 Authentication unsuccessful, basic authentication is disabled
2026-11-18 08:00:00 INFO  [notify] Auth=LOGIN user=notify@marrow.example
2026-11-01 09:00:00 INFO  [it-notice] Basic auth for SMTP will be disabled on 2026-11-18
2026-11-18 08:05:00 WARN  [notify] Pending notifications=930
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
    "Providers retire basic auth.",
    "Use OAuth or an API.",
    "Register an app identity.",
    "Keep secrets secure.",
    "Check stale notifications.",
    "Track deprecation notices.",
  ],
  solution: `
**Diagnosis.** Basic auth for SMTP was disabled by the provider.

**Immediate mitigation.**
- Use the internal relay.

**Root cause.** The notice was not acted on.

**Permanent fix.**
- OAuth app registration.

**Prevention.** Track platform deprecations.
`,
  followUps: [
    { q: "What is client credentials flow?", a: "An app gets a token with its own secret, without a user." },
    { q: "Does the Mule email connector support OAuth?", a: "Check the connector version and docs." },
    { q: "Is an API better than SMTP?", a: "Often, for cloud mail providers." },
    { q: "How do you avoid surprises?", a: "Someone owns platform notices." },
  ],
}
