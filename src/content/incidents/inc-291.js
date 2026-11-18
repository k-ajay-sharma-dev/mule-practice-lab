export default {
  id: 'inc-291',
  category: 'incidents',
  title: "Sending Store Reports to 600 Managers Gets the Account Throttled",
  level: 'INTERMEDIATE',
  tags: ["myproject","email","throttling","bulk"],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: "2026-11-18 07:00:00 INFO  [store-reports] Sending emails count=600 parallel=50", relevant: true, why: "Many emails at once." },
      { text: "2026-11-18 07:00:20 ERROR [store-reports] 421 4.7.0 Too many messages, try again later", relevant: true, why: "The relay throttles." },
      { text: "2026-11-18 07:00:21 INFO  [store-reports] Retry immediately", relevant: true, why: "Retries make it worse." },
      { text: "2026-11-18 07:05:00 WARN  [store-reports] Sent=180 failed=420", relevant: true, why: "Most failed." },
      { text: "2026-11-18 23:59:00 INFO  [store-reports] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why do emails fail?",
        options: [
          "The relay limits send rate and the flow sends 50 at a time with instant retries",
          "Addresses are wrong",
          "TLS",
          "Reports are big",
        ],
        answer: 0,
        explain: "421 is a temporary limit.",
      },
      {
        type: 'single',
        prompt: "What is the fix?",
        options: [
          "Limit concurrency and retry with backoff",
          "Send faster",
          "Use a personal account",
          "Skip reports",
        ],
        answer: 0,
        explain: "Respect the rate.",
      },
      {
        type: 'multi',
        prompt: "What else helps?",
        options: [
          "Ask the mail team for the allowed rate",
          "Queue emails and send at a steady pace",
          "Combine reports where managers share a region",
          "Retry in a tight loop",
        ],
        answer: [0,1,2],
        explain: "Pace and reduce volume.",
      },
      {
        type: 'single',
        prompt: "What does a 4xx SMTP code mean?",
        options: [
          "A temporary failure, try later",
          "Permanent failure",
          "Success",
          "Wrong address",
        ],
        answer: 0,
        explain: "5xx is permanent.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Pause sending",
          "Send the 420 failed at a steady rate",
          "Set concurrency and backoff",
          "Agree rates with the mail team",
          "Track sent and failed counts",
        ],
        explain: "Pause, recover, fix, agree, watch.",
      },
    ],
  },
  description: `
## Symptoms
- 420 store managers did not get their morning report.

## Change / Context
- Reports are sent in parallel at 07:00.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 07:00:00 INFO  [store-reports] Sending emails count=600 parallel=50
2026-11-18 07:00:20 ERROR [store-reports] 421 4.7.0 Too many messages, try again later
2026-11-18 07:00:21 INFO  [store-reports] Retry immediately
2026-11-18 07:05:00 WARN  [store-reports] Sent=180 failed=420
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
    "Relays limit rates.",
    "4xx codes are temporary.",
    "Back off and limit concurrency.",
    "Queue and pace sends.",
    "Agree limits.",
    "Track counts.",
  ],
  solution: `
**Diagnosis.** Parallel sends exceed the relay rate. Instant retries make it worse.

**Immediate mitigation.**
- Pause and resend at a steady rate.

**Root cause.** No rate limit or backoff.

**Permanent fix.**
- Concurrency limit and backoff.

**Prevention.** Agreed rates and counts.
`,
  followUps: [
    { q: "Why not a bulk mail service?", a: "For large audiences it is often better." },
    { q: "What is backoff?", a: "Waiting longer between each retry." },
    { q: "How do you know the rate?", a: "Ask the mail team or read the service limits." },
    { q: "What about 5xx codes?", a: "Do not retry. Fix the cause." },
  ],
}
