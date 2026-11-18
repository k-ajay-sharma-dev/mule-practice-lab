export default {
  id: 'inc-213',
  category: 'incidents',
  title: "A New Fraud Queue Misses Every Payment From Its First Week: It Was Bound to the Exchange After Go-Live",
  level: 'EXPERT',
  tags: ["myproject","queues","anypoint-mq","exchanges","fan-out","deployment"],
  estMinutes: 30,
  investigation: {
    logs: [
      { text: "2026-11-10 09:00:00 INFO  [payments] Publishing to exchange payment-events", relevant: true, why: "Payments are published to an exchange." },
      { text: "2026-11-10 09:00:00 INFO  [anypoint-mq] Exchange payment-events bindings: ledger-q, notify-q", relevant: true, why: "Only two queues are bound." },
      { text: "2026-11-17 16:00:00 INFO  [anypoint-mq] Binding added fraud-q to payment-events", relevant: true, why: "The fraud queue was bound a week later." },
      { text: "2026-11-17 16:00:05 INFO  [fraud-consumer] Started queue=fraud-q depth=0", relevant: true, why: "The fraud queue starts empty." },
      { text: "2026-11-18 09:00:00 INFO  [fraud-consumer] Received payments since 2026-11-17 16:00 only", relevant: true, why: "Earlier payments never reached it." },
      { text: "2026-11-10 23:59:00 INFO  [payments] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why did fraud miss the first week?",
        options: [
          "A queue only receives messages published after it is bound to the exchange",
          "Fraud deleted them",
          "The exchange was full",
          "Payments were not published",
        ],
        answer: 0,
        explain: "An exchange copies each message to the queues bound at that moment. It does not keep history.",
      },
      {
        type: 'single',
        prompt: "How do you get the missed week to fraud?",
        options: [
          "Replay the payments from the source of record, published only to fraud",
          "Rebind the queue",
          "Read them from the ledger queue",
          "Wait",
        ],
        answer: 0,
        explain: "The ledger queue may have consumed them already. Replay from the payment database to the fraud queue only.",
      },
      {
        type: 'multi',
        prompt: "What should a go-live checklist for fan-out include?",
        options: [
          "Create and bind every consumer queue before the first message",
          "Check bindings in each environment",
          "Have a replay path from the system of record",
          "Assume the exchange keeps history",
        ],
        answer: [0,1,2],
        explain: "Bindings are part of the deployment, and replay must exist for late joiners.",
      },
      {
        type: 'single',
        prompt: "Why replay only to fraud?",
        options: [
          "Publishing to the exchange again would send duplicates to the ledger and notifications",
          "Fraud is faster",
          "Exchanges forbid replays",
          "It does not matter",
        ],
        answer: 0,
        explain: "Other bound queues would process the same payments twice.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Identify payments published before the binding",
          "Replay them from the payment database to fraud-q only",
          "Make the fraud consumer idempotent by payment ID",
          "Add bindings to deployment scripts",
          "Test a late joiner replay",
        ],
        explain: "Find the gap, fill it safely, then make it part of deployment.",
      },
    ],
  },
  description: `
## Symptoms
- Fraud checks started a week after the payment events went live. Fraud has no data for the first week.

## Change / Context
- Payments publish to an Anypoint MQ exchange with bound queues for ledger and notifications.
- The fraud team bound its queue on 17 November.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-10 09:00:00 INFO  [payments] Publishing to exchange payment-events
2026-11-10 09:00:00 INFO  [anypoint-mq] Exchange payment-events bindings: ledger-q, notify-q
2026-11-17 16:00:00 INFO  [anypoint-mq] Binding added fraud-q to payment-events
2026-11-17 16:00:05 INFO  [fraud-consumer] Started queue=fraud-q depth=0
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
    "An exchange delivers to queues bound at publish time.",
    "It does not keep history for late joiners.",
    "Bindings belong in deployment scripts.",
    "Replay from the system of record.",
    "Replay only to the queue that needs it.",
    "Consumers must be idempotent.",
  ],
  solution: `
**Diagnosis.** The fraud queue was bound to the exchange a week after go-live. Messages published before that were never copied to it.

**Immediate mitigation.**
- Replay the missing payments from the payment database directly to the fraud queue.

**Root cause.** Bindings were added by hand when each team was ready, not as part of the release.

**Permanent fix.**
- Create queues and bindings in the deployment scripts.
- Keep a replay tool that sends past events to one chosen queue.

**Prevention.** A checklist for fan-out go-lives and a test of late joiner replay.
`,
  followUps: [
    { q: "Would a log based broker help?", a: "Yes. A log such as Kafka keeps history, so a new consumer group can read from the start within retention." },
    { q: "How do you check bindings?", a: "List them in Anypoint MQ per environment and compare with the expected list." },
    { q: "Why not bind fraud early and ignore its messages?", a: "That works too: binding early means the queue collects messages until the consumer is ready, within the TTL." },
    { q: "What does idempotent mean here?", a: "Processing the same payment twice gives the same result as once." },
  ],
}
