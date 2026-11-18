export default {
  id: 'inc-297',
  category: 'incidents',
  title: "The Team Ignores Integration Alert Emails and Misses a Real Outage",
  level: 'EXPERT',
  tags: ["myproject","email","planning-platform","alerts","noise"],
  estMinutes: 30,
  investigation: {
    logs: [
      { text: "2026-11-18 00:00:00 INFO  [alerts] Emails sent yesterday=1840", relevant: true, why: "Far too many alerts." },
      { text: "2026-11-18 02:10:00 ERROR [plan-in] Plans not loaded, platform SFTP unreachable", relevant: true, why: "A real problem." },
      { text: "2026-11-18 02:10:00 INFO  [alerts] Email sent subject=\"ERROR in plan-in\"", relevant: true, why: "Same subject as hundreds of others." },
      { text: "2026-11-18 08:00:00 WARN  [stores] No plans today", relevant: true, why: "Found by stores, not support." },
      { text: "2026-11-18 23:59:00 INFO  [alerts] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why was the outage missed?",
        options: [
          "Too many alert emails with the same subject trained people to ignore them",
          "Email failed",
          "Nobody was on call",
          "The alert was not sent",
        ],
        answer: 0,
        explain: "Alert fatigue.",
      },
      {
        type: 'single',
        prompt: "What is the first step?",
        options: [
          "Cut noise: alert only on things that need human action",
          "Send more emails",
          "Add more recipients",
          "Use red text",
        ],
        answer: 0,
        explain: "Fewer, better alerts.",
      },
      {
        type: 'multi',
        prompt: "What makes alerts useful?",
        options: [
          "A clear impact in the subject, such as stores without plans",
          "Grouping repeats into one alert",
          "Routing urgent ones to on call paging, not email",
          "One email per log line",
        ],
        answer: [0,1,2],
        explain: "Impact, grouping, routing.",
      },
      {
        type: 'single',
        prompt: "How do you find noisy alerts?",
        options: [
          "Count alerts by type and see which led to action",
          "Guess",
          "Ask stores",
          "Delete all",
        ],
        answer: 0,
        explain: "Data driven clean up.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Rerun plans and tell stores",
          "Count alerts by type",
          "Remove or group noisy ones",
          "Page on impact alerts",
          "Review alerts monthly",
        ],
        explain: "Recover, measure, cut, route, review.",
      },
    ],
  },
  description: `
## Symptoms
- Stores found missing plans at 08:00. Support had an alert at 02:10.

## Change / Context
- Every ERROR log line sends an email to the team.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 00:00:00 INFO  [alerts] Emails sent yesterday=1840
2026-11-18 02:10:00 ERROR [plan-in] Plans not loaded, platform SFTP unreachable
2026-11-18 02:10:00 INFO  [alerts] Email sent subject="ERROR in plan-in"
2026-11-18 08:00:00 WARN  [stores] No plans today
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
    "Too many alerts cause fatigue.",
    "Alert on impact, not every error.",
    "Group repeats.",
    "Page for urgent issues.",
    "Measure alert value.",
    "Review regularly.",
  ],
  solution: `
**Diagnosis.** Alert fatigue. The real alert looked like hundreds of others.

**Immediate mitigation.**
- Rerun plans.

**Root cause.** Email per error line.

**Permanent fix.**
- Impact based, grouped alerts with paging.

**Prevention.** Monthly alert reviews.
`,
  followUps: [
    { q: "What is an impact alert?", a: "One that says what the business cannot do, such as stores without plans." },
    { q: "Should email be used at all?", a: "For summaries and low urgency items." },
    { q: "How many alerts are too many?", a: "If people stop reading them, too many." },
    { q: "Who owns alert rules?", a: "The support team with the integration team." },
  ],
}
