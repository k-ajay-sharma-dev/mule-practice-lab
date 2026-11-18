export default {
  id: 'inc-204',
  category: 'incidents',
  title: "Messages Lost When the Broker Restarts: JMS Publish Was Set to Non-Persistent to Go Faster",
  level: 'BEGINNER',
  tags: ["myproject","queues","jms","persistence","broker-restart"],
  estMinutes: 15,
  investigation: {
    logs: [
      { text: "2026-11-18 02:00:00 INFO  [broker] Planned restart for patching", relevant: true, why: "The broker restarts in the night." },
      { text: "2026-11-18 01:59:58 INFO  [claims-intake] Sent 340 messages queue=claims.new persistentDelivery=false", relevant: true, why: "Messages were sent as non-persistent." },
      { text: "2026-11-18 02:03:10 INFO  [broker] Started, queue claims.new depth=0", relevant: true, why: "After the restart the queue is empty." },
      { text: "2026-11-18 02:03:15 INFO  [claims-worker] Waiting for messages", relevant: true, why: "The worker never receives the 340 claims." },
      { text: "2026-11-18 02:05:00 INFO  [broker] Disk usage 8%", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why were 340 claims lost?",
        options: [
          "They were sent as non-persistent, so the broker kept them only in memory and lost them on restart",
          "The worker deleted them",
          "The disk was full",
          "The queue was renamed",
        ],
        answer: 0,
        explain: "Non-persistent messages are not written to disk, so a restart loses them.",
      },
      {
        type: 'single',
        prompt: "When is non-persistent delivery acceptable?",
        options: [
          "When losing a message does no harm, such as a frequent status ping",
          "For claims",
          "For payments",
          "Always, it is faster",
        ],
        answer: 0,
        explain: "Speed is fine to trade only when a lost message can be ignored.",
      },
      {
        type: 'multi',
        prompt: "What do you do now?",
        options: [
          "Find the claims sent before the restart and send them again",
          "Set persistent delivery for this queue",
          "Check other producers for the same setting",
          "Turn off patching",
        ],
        answer: [0,1,2],
        explain: "Recover, fix this producer and look for the same mistake elsewhere.",
      },
      {
        type: 'single',
        prompt: "Why did nobody notice in testing?",
        options: [
          "Tests did not restart the broker while messages were waiting",
          "Tests used a different broker version",
          "Tests had fewer claims",
          "Tests ran at night",
        ],
        answer: 0,
        explain: "Loss only shows when the broker stops with messages on the queue.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Find claims sent but never processed",
          "Resend them",
          "Set persistent delivery on the claims producer",
          "Review every producer setting",
          "Add a restart test with messages on the queue",
        ],
        explain: "Recover first, then fix and prevent.",
      },
    ],
  },
  description: `
## Symptoms
- After the night patch window, 340 claims are missing.
- The claims portal shows them as submitted.

## Change / Context
- Last month a developer set persistent delivery to false on the claims publisher to speed up a load test.
- The setting was released to production with the change.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 02:00:00 INFO  [broker] Planned restart for patching
2026-11-18 01:59:58 INFO  [claims-intake] Sent 340 messages queue=claims.new persistentDelivery=false
2026-11-18 02:03:10 INFO  [broker] Started, queue claims.new depth=0
2026-11-18 02:03:15 INFO  [claims-worker] Waiting for messages
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
    "Non-persistent messages live only in memory.",
    "A broker restart loses them.",
    "Use persistent delivery for business messages.",
    "Load test settings must not reach production.",
    "Recover lost messages from the source.",
    "Test restarts with messages waiting.",
  ],
  solution: `
**Diagnosis.** The claims were published with persistent delivery off. The broker held them in memory, and the planned restart lost them.

**Immediate mitigation.**
- Find claims submitted before 02:00 and not processed, and resend them.

**Root cause.** A load test setting was committed and released without review.

**Permanent fix.**
- Set persistent delivery on the claims publisher.
- Keep performance settings in a profile that is never deployed to production.

**Prevention.** A release check on messaging settings and a test that restarts the broker with messages queued.
`,
  followUps: [
    { q: "Is persistent delivery much slower?", a: "It writes to disk, so it is slower, but brokers handle large volumes with it. Measure before trading safety." },
    { q: "Can the consumer side protect you?", a: "No. The message is gone before the consumer could see it." },
    { q: "What about transactions?", a: "A transacted send still needs persistence to survive a restart." },
    { q: "How do you find the lost claims?", a: "Compare claims marked submitted in the portal with claims received by the worker." },
  ],
}
