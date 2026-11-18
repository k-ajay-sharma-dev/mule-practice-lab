export default {
  id: 'inc-211',
  category: 'incidents',
  title: "Failed Messages From Every Queue Mix in One ActiveMQ.DLQ and Nobody Owns Them",
  level: 'ADVANCED',
  tags: ["myproject","queues","activemq","jms","dlq","redelivery"],
  estMinutes: 25,
  investigation: {
    logs: [
      { text: "2026-11-18 07:00:00 INFO  [broker] Queue ActiveMQ.DLQ depth=18450", relevant: true, why: "One dead letter queue holds failures from all queues." },
      { text: "2026-11-18 07:00:01 INFO  [broker] Redelivery policy maximumRedeliveries=6 (default)", relevant: true, why: "Each message is tried several times before moving there." },
      { text: "2026-11-18 07:00:02 INFO  [broker] DLQ sources: invoices 9100, stock 6300, returns 3050", relevant: true, why: "Three teams’ failures are mixed." },
      { text: "2026-11-18 07:00:03 INFO  [returns-team] No alert configured for DLQ", relevant: true, why: "Nobody watches it." },
      { text: "2026-11-18 07:05:00 INFO  [broker] Store usage 61%", relevant: true, why: "It is also filling the broker store." },
      { text: "2026-11-18 23:59:00 INFO  [broker] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why do all failures land in one place?",
        options: [
          "ActiveMQ by default sends dead letters from every queue to one shared ActiveMQ.DLQ",
          "Each team chose it",
          "The consumers send them there",
          "It is a topic",
        ],
        answer: 0,
        explain: "Without a per-queue dead letter strategy, the broker uses one shared DLQ.",
      },
      {
        type: 'single',
        prompt: "What is the first improvement?",
        options: [
          "Configure an individual dead letter queue per queue, such as DLQ.invoices",
          "Delete ActiveMQ.DLQ",
          "Raise redeliveries to 100",
          "Turn off dead letters",
        ],
        answer: 0,
        explain: "One DLQ per queue gives each team its own failures to watch and replay.",
      },
      {
        type: 'multi',
        prompt: "What else do you add?",
        options: [
          "An owner and alert for each DLQ",
          "A replay tool that moves messages back to their source queue",
          "An expiry or archive for very old dead letters",
          "More shared queues",
        ],
        answer: [0,1,2],
        explain: "A DLQ only helps if someone sees it, can replay it, and it cannot fill the broker.",
      },
      {
        type: 'single',
        prompt: "Why does the shared DLQ also threaten the broker?",
        options: [
          "It grows without limit and uses the store that live queues need",
          "It slows down topics only",
          "It changes message order",
          "It does not",
        ],
        answer: 0,
        explain: "A full store makes producers block or fail on every queue.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Split ActiveMQ.DLQ by source queue",
          "Set a per-queue dead letter strategy",
          "Give each DLQ an owner and alert",
          "Replay or archive the old messages",
          "Watch broker store usage",
        ],
        explain: "Sort the backlog, fix the policy, add ownership, clean up, then watch.",
      },
    ],
  },
  description: `
## Symptoms
- The broker store is at 61%. An investigation finds 18,450 messages in ActiveMQ.DLQ.
- Some returns failed weeks ago and customers were never refunded.

## Change / Context
- Three teams use the same ActiveMQ broker. No dead letter settings were changed from the defaults.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 07:00:00 INFO  [broker] Queue ActiveMQ.DLQ depth=18450
2026-11-18 07:00:01 INFO  [broker] Redelivery policy maximumRedeliveries=6 (default)
2026-11-18 07:00:02 INFO  [broker] DLQ sources: invoices 9100, stock 6300, returns 3050
2026-11-18 07:00:03 INFO  [returns-team] No alert configured for DLQ
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
    "ActiveMQ uses one shared DLQ by default.",
    "Messages move there after the redelivery limit.",
    "Use a dead letter queue per source queue.",
    "Every DLQ needs an owner and an alert.",
    "Provide a replay path.",
    "Old dead letters can fill the broker store.",
  ],
  solution: `
**Diagnosis.** All queues use the default dead letter policy, so failures from every team go to one \`ActiveMQ.DLQ\`. Nobody owns or watches it.

**Immediate mitigation.**
- Split the existing dead letters by source queue and hand each set to its team.

**Root cause.** Broker defaults were never reviewed when the broker became shared.

**Permanent fix.**
- Configure an individual dead letter strategy so each queue has its own DLQ.
- Give each DLQ an owner, an alert and a replay process.

**Prevention.** Alert on DLQ depth and broker store usage, and review broker policies when a team joins.
`,
  followUps: [
    { q: "How do you know the source queue of a dead letter?", a: "ActiveMQ keeps the original destination in a message property. Check the property name for your version." },
    { q: "Should redeliveries be immediate?", a: "Add a delay between tries so short outages do not use them all at once." },
    { q: "Who replays dead letters?", a: "The team that owns the queue, after fixing the cause." },
    { q: "Is it safe to purge old dead letters?", a: "Only after the owner confirms they are not needed, or after archiving them." },
  ],
}
