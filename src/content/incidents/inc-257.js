export default {
  id: 'inc-257',
  category: 'incidents',
  title: "Nightly FTP Downloads Fail During the Partner’s Maintenance Window",
  level: 'ADVANCED',
  tags: ["myproject","ftp","connections","maintenance"],
  estMinutes: 25,
  investigation: {
    logs: [
      { text: "2026-11-17 01:00:00 ERROR [cost-in] Connect failed host=ftp.supplier-b.example error=Connection refused", relevant: true, why: "The server is down." },
      { text: "2026-11-17 01:00:00 INFO  [cost-in] Reconnection strategy none", relevant: true, why: "No retry is configured." },
      { text: "2026-11-17 01:00:00 INFO  [supplier-b] Maintenance window Tuesday 00:30 to 01:30", relevant: true, why: "The partner has a weekly window." },
      { text: "2026-11-17 01:00:01 INFO  [cost-in] Job ended, next run tomorrow 01:00", relevant: true, why: "No retry until tomorrow." },
      { text: "2026-11-17 23:59:00 INFO  [cost-in] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why does the job fail every Tuesday?",
        options: [
          "It runs in the partner’s maintenance window with no retry",
          "The supplier uploads Tuesday costs only after 01:30",
          "The FTP password expires each Tuesday at midnight",
          "Tuesday’s cost file is too large to fetch",
        ],
        answer: 0,
        explain: "The timing matches the window.",
      },
      {
        type: 'single',
        prompt: "What is the best fix?",
        options: [
          "Move the run outside the window and add reconnection with backoff",
          "Add a reconnection strategy that retries every second for a minute",
          "Ask the partner to skip maintenance in our peak season",
          "Run the job twice, at 01:00 and again at 01:05",
        ],
        answer: 0,
        explain: "Avoid the window and recover from short outages.",
      },
      {
        type: 'multi',
        prompt: "What belongs in a partner profile?",
        options: [
          "Maintenance windows",
          "Session limits",
          "Expected file times",
          "Their server hardware model",
        ],
        answer: [0,1,2],
        explain: "Operational facts that affect jobs.",
      },
      {
        type: 'single',
        prompt: "What should happen if all retries fail?",
        options: [
          "Alert and retry later in a defined window",
          "Log a WARN and wait for the next run",
          "Mark the day’s costs as loaded",
          "Copy yesterday’s cost file instead",
        ],
        answer: 0,
        explain: "Visible failure with a plan.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Run today’s download by hand",
          "Move the schedule",
          "Add reconnection with backoff",
          "Alert on final failure",
          "Record the window in the profile",
        ],
        explain: "Recover, fix, harden, watch, record.",
      },
    ],
  },
  description: `
## Symptoms
- Supplier costs are missing every Tuesday.

## Change / Context
- The cost download runs at 01:00 daily.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-17 01:00:00 ERROR [cost-in] Connect failed host=ftp.supplier-b.example error=Connection refused
2026-11-17 01:00:00 INFO  [cost-in] Reconnection strategy none
2026-11-17 01:00:00 INFO  [supplier-b] Maintenance window Tuesday 00:30 to 01:30
2026-11-17 01:00:01 INFO  [cost-in] Job ended, next run tomorrow 01:00
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
    "Partners have maintenance windows.",
    "Schedule around them.",
    "Use reconnection with backoff.",
    "Alert on final failure.",
    "Keep partner profiles.",
    "Recover missed runs.",
  ],
  solution: `
**Diagnosis.** The job runs inside the partner maintenance window and does not retry.

**Immediate mitigation.**
- Run today’s download by hand.

**Root cause.** The schedule ignored the window and had no retry.

**Permanent fix.**
- New schedule and reconnection with backoff.

**Prevention.** Partner profiles with windows and alerts.
`,
  followUps: [
    { q: "Is reconnection the same as retry?", a: "Reconnection retries the connection. Until successful retries the whole operation." },
    { q: "How long should backoff be?", a: "Long enough to outlast short outages, short enough to meet the deadline." },
    { q: "How do you learn windows?", a: "Ask partners and record them." },
    { q: "What about holidays?", a: "Add them to the calendar too." },
  ],
}
