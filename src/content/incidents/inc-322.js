export default {
  id: 'inc-322',
  category: 'incidents',
  title: "Messages Vanish From the Queue Over a Long Weekend",
  level: 'INTERMEDIATE',
  tags: ["myproject","queues","ttl","expiry"],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: "2026-11-13 18:00:00 INFO  [stock-consumer] Stopped for weekend maintenance", relevant: true, why: "The consumer stops on Friday evening." },
      { text: "2026-11-14 09:00:00 INFO  [stock-publisher] Published count=41200 queue=stock-updates", relevant: true, why: "Many messages were sent while nobody was reading." },
      { text: "2026-11-16 08:00:00 INFO  [stock-consumer] Started after weekend maintenance", relevant: true, why: "The consumer was down for 62 hours." },
      { text: "2026-11-16 08:00:01 INFO  [stock-consumer] Queue stock-updates depth=0", relevant: true, why: "Nothing is waiting." },
      { text: "2026-11-16 08:00:01 INFO  [broker] Queue stock-updates defaultTtl=24h", relevant: true, why: "Messages expire one day after they are sent." },
      { text: "2026-11-16 08:05:00 INFO  [stock-consumer] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Where did the messages go?",
        options: [
          "They expired 24 hours after they were sent, while no consumer was reading",
          "Another consumer on the queue read and acknowledged them on Saturday",
          "The publisher sent them to a different queue during the maintenance",
          "The broker purged the queue when the consumer restarted on Monday",
        ],
        answer: 0,
        explain: "A time to live removes messages nobody reads in time. Saturday’s messages expired on Sunday.",
      },
      {
        type: 'single',
        prompt: "What should the TTL be for stock updates?",
        options: [
          "Longer than the longest planned outage, or none, with alerts on depth",
          "One hour, so stores never apply a stock level that is out of date",
          "Keep 24 hours and restart the consumer faster after maintenance",
          "Twelve hours, so the queue stays small during long outages",
        ],
        answer: 0,
        explain: "TTL should match how long data stays useful and how long outages last.",
      },
      {
        type: 'multi',
        prompt: "What else would have helped?",
        options: [
          "An alert when the consumer is down",
          "An expiry queue so expired messages are kept",
          "A full stock snapshot after long outages",
          "A shorter TTL so the queue stays small",
        ],
        answer: [0,1,2],
        explain: "Detect, keep and recover. A shorter TTL loses even more messages.",
      },
      {
        type: 'single',
        prompt: "Is some expiry ever right?",
        options: [
          "Yes, for data that is worthless when old, such as live prices",
          "No, every message must be delivered however old it is",
          "Only on dead letter queues, never on main queues",
          "Yes, every queue should expire messages after a day",
        ],
        answer: 0,
        explain: "Pick TTL per data type.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Resend a full stock snapshot",
          "Review TTL per queue",
          "Add an expiry queue",
          "Alert on consumer down",
          "Add outage steps to the runbook",
        ],
        explain: "Recover, fix, keep, watch, plan.",
      },
    ],
  },
  description: `
## Symptoms
- After the weekend, stores show stock from Friday.

## Change / Context
- The consumer was stopped for planned maintenance from Friday evening to Monday morning.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-13 18:00:00 INFO  [stock-consumer] Stopped for weekend maintenance
2026-11-14 09:00:00 INFO  [stock-publisher] Published count=41200 queue=stock-updates
2026-11-16 08:00:00 INFO  [stock-consumer] Started after weekend maintenance
2026-11-16 08:00:01 INFO  [stock-consumer] Queue stock-updates depth=0
2026-11-16 08:00:01 INFO  [broker] Queue stock-updates defaultTtl=24h
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
    "TTL removes unread messages.",
    "Match TTL to outage length and data value.",
    "Keep expired messages in an expiry queue.",
    "Alert when consumers stop.",
    "Resend a snapshot after long outages.",
    "Plan maintenance with queue settings in mind.",
  ],
  solution: `
**Diagnosis.** The queue TTL of 24 hours removed messages while the consumer was down for 62 hours.

**Immediate mitigation.**
- Resend a full stock snapshot.

**Root cause.** TTL was shorter than the maintenance window.

**Permanent fix.**
- Longer TTL or none, plus an expiry queue.

**Prevention.** Check queue settings before planned outages.
`,
  followUps: [
    { q: "What is the difference between TTL and DLQ?", a: "TTL drops or moves old messages. A DLQ catches messages that failed too many times." },
    { q: "Can a message carry its own TTL?", a: "Yes, many brokers let the sender set it per message." },
    { q: "Why a snapshot?", a: "It sets stock right without replaying every change." },
    { q: "Who owns queue settings?", a: "The integration team with the platform team." },
  ],
}
