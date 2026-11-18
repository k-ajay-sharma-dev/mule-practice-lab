export default {
  id: 'inc-203',
  category: 'incidents',
  title: "Production Payments Disappear: a Test App Is Reading the Same Queue on a Shared Broker",
  level: 'BEGINNER',
  tags: ["myproject","queues","jms","activemq","environments"],
  estMinutes: 15,
  investigation: {
    logs: [
      { text: "2026-11-18 10:12:00 INFO  [pay-producer prod] Sent paymentId=PY-881 queue=payments.out", relevant: true, why: "Production sends to payments.out." },
      { text: "2026-11-18 10:12:01 INFO  [pay-consumer test] Received paymentId=PY-881 queue=payments.out", relevant: true, why: "A test app on the same broker takes the message." },
      { text: "2026-11-18 10:12:01 INFO  [pay-consumer prod] Waiting for messages queue=payments.out", relevant: true, why: "The production consumer never sees it." },
      { text: "2026-11-18 10:12:30 INFO  [broker] Consumers on payments.out: 2 (hosts prod-mule-01, test-mule-03)", relevant: true, why: "Two consumers from two environments share one queue." },
      { text: "2026-11-18 10:13:00 INFO  [broker] Memory usage 12%", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Where do the missing payments go?",
        options: [
          "To the test consumer, because both environments read one queue on one broker",
          "To the DLQ",
          "They expire",
          "The producer drops them",
        ],
        answer: 0,
        explain: "With two consumers on one queue, each message goes to only one of them.",
      },
      {
        type: 'single',
        prompt: "Why did it start this week?",
        options: [
          "A tester pointed the test app at the shared broker with the production queue name",
          "The broker was upgraded",
          "Payments doubled",
          "The DLQ filled up",
        ],
        answer: 0,
        explain: "The broker shows a consumer from a test host on the production queue.",
      },
      {
        type: 'multi',
        prompt: "What separates environments on a broker?",
        options: [
          "A separate broker or virtual host per environment",
          "Queue names with an environment prefix",
          "Credentials per environment that can only read their own queues",
          "Asking testers to be careful",
        ],
        answer: [0,1,2],
        explain: "Use isolation that does not rely on memory. Permissions make the mistake impossible, not only unlikely.",
      },
      {
        type: 'single',
        prompt: "What happened to the payments the test app took?",
        options: [
          "They were processed in test, so they must be found and replayed into production",
          "They are still on the queue",
          "They were sent back automatically",
          "They are lost forever with no trace",
        ],
        answer: 0,
        explain: "The test logs show which payment IDs it took. Those must be resent to production.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Stop the test consumer",
          "List payment IDs the test app took",
          "Resend those payments to production",
          "Give each environment its own credentials and queue names",
          "Block test hosts from the production broker",
        ],
        explain: "Stop the leak, recover, then make it impossible.",
      },
    ],
  },
  description: `
## Symptoms
- About half of today’s payments never reached the payment system.
- There are no errors in production.

## Change / Context
- Production and test share one ActiveMQ broker to save cost.
- Both use the queue name \`payments.out\`.
- A tester changed a test app config on Monday.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 10:12:00 INFO  [pay-producer prod] Sent paymentId=PY-881 queue=payments.out
2026-11-18 10:12:01 INFO  [pay-consumer test] Received paymentId=PY-881 queue=payments.out
2026-11-18 10:12:01 INFO  [pay-consumer prod] Waiting for messages queue=payments.out
2026-11-18 10:12:30 INFO  [broker] Consumers on payments.out: 2 (hosts prod-mule-01, test-mule-03)
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
    "Two consumers on one queue share the messages.",
    "Shared brokers need isolation by name and by permission.",
    "The broker console shows who is consuming.",
    "Recover messages taken by the wrong environment.",
    "Credentials per environment stop cross reads.",
    "Prefer a separate broker for production.",
  ],
  solution: `
**Diagnosis.** A test app consumes from the production queue on the shared broker. The broker hands each message to one consumer, so test took about half.

**Immediate mitigation.**
- Stop the test consumer.
- Find the payment IDs in the test logs and resend them to production.

**Root cause.** Environments were separated only by convention, with the same queue names and open permissions.

**Permanent fix.**
- Use a separate broker or virtual host for production.
- Prefix queue names with the environment and give each environment credentials limited to its queues.

**Prevention.** Alert when a queue has consumers from unexpected hosts, and review broker permissions.
`,
  followUps: [
    { q: "Why only half?", a: "The broker balances messages across the two consumers." },
    { q: "Would a topic behave the same?", a: "No. A topic gives a copy to each subscriber, so both would get every message." },
    { q: "How do you find the consumer host?", a: "The broker console or JMX lists consumers with their connection details." },
    { q: "Is a shared broker ever fine?", a: "For dev and test together, with names and permissions per environment. Keep production apart." },
  ],
}
