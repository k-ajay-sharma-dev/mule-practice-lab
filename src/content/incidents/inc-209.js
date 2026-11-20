export default {
  id: 'inc-209',
  category: 'incidents',
  title: "Every Order Lands in the DLQ in Ten Minutes While the ERP Is Down: the Consumer Kept Consuming",
  level: 'INTERMEDIATE',
  tags: ["myproject","queues","anypoint-mq","circuit-breaker","dlq"],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: "2026-11-18 13:00:00 ERROR [erp] Maintenance started, all calls return 503", relevant: true, why: "The ERP is down for an hour." },
      { text: "2026-11-18 13:00:01 WARN  [order-consumer] ERP call failed orderId=SO-9001 deliveryCount=1 next=nack", relevant: true, why: "Each message fails and is nacked." },
      { text: "2026-11-18 13:00:09 WARN  [order-consumer] ERP call failed orderId=SO-9001 deliveryCount=5 next=dlq", relevant: true, why: "Five quick tries are used up in seconds." },
      { text: "2026-11-18 13:10:00 INFO  [anypoint-mq] orders-dlq depth=4200 orders depth=0", relevant: true, why: "The whole backlog moved to the DLQ." },
      { text: "2026-11-18 13:10:30 INFO  [order-consumer] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why did every order end up in the DLQ?",
        options: [
          "The consumer kept reading during the outage, and each order used its five tries in seconds",
          "The queue TTL was shorter than the outage, so expired orders moved to the DLQ",
          "The ERP rejected the orders as invalid, so the consumer routed them to the DLQ",
          "The consumer acked each order before the call, so the broker moved them on",
        ],
        answer: 0,
        explain: "Retries that happen in seconds cannot outlast an outage of an hour.",
      },
      {
        type: 'single',
        prompt: "What should the consumer do when the ERP is down for everyone?",
        options: [
          "Stop taking messages for a while and try later, so they wait on the queue",
          "Keep consuming and nack each message, so the broker keeps redelivering it",
          "Ack each message and write it to a log so support can replay it later",
          "Raise the subscriber concurrency so more orders get through between failures",
        ],
        answer: 0,
        explain: "This is a circuit breaker. When a dependency is down, stop consuming instead of failing every message.",
      },
      {
        type: 'multi',
        prompt: "Which help?",
        options: [
          "A circuit breaker on the subscriber for connectivity errors",
          "Delay between redeliveries",
          "A clear split between \"ERP down\" errors and \"bad order\" errors",
          "A longer TTL on orders-dlq so failed orders are kept",
        ],
        answer: [0,1,2],
        explain: "Treat outages and bad data differently. Only bad data belongs in the DLQ.",
      },
      {
        type: 'single',
        prompt: "What do you do with the 4,200 orders in the DLQ?",
        options: [
          "Move them back to the main queue at a rate the ERP can take",
          "Move all 4,200 back at once so the backlog clears quickly",
          "Leave them in the DLQ and ask customers to place them again",
          "Have support key each order into the ERP by hand",
        ],
        answer: 0,
        explain: "They are good orders that met an outage. Replay them, paced.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Wait for the ERP to recover",
          "Replay the DLQ to the main queue at a safe rate",
          "Add a circuit breaker for connectivity errors",
          "Send only bad data errors to the DLQ",
          "Alert when the DLQ grows fast",
        ],
        explain: "Recover, then fix the design and watch it.",
      },
    ],
  },
  description: `
## Symptoms
- During a one hour ERP maintenance window, all 4,200 orders moved to the DLQ.
- The ERP is back now, and the orders are still in the DLQ.

## Change / Context
- The order consumer nacks on any error. The queue sends a message to the DLQ after five deliveries.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 13:00:00 ERROR [erp] Maintenance started, all calls return 503
2026-11-18 13:00:01 WARN  [order-consumer] ERP call failed orderId=SO-9001 deliveryCount=1 next=nack
2026-11-18 13:00:09 WARN  [order-consumer] ERP call failed orderId=SO-9001 deliveryCount=5 next=dlq
2026-11-18 13:10:00 INFO  [anypoint-mq] orders-dlq depth=4200 orders depth=0
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
    "Fast retries cannot outlast a long outage.",
    "Stop consuming when a dependency is down for everyone.",
    "Separate outage errors from bad data errors.",
    "The DLQ is for messages that cannot ever succeed.",
    "Replay DLQ messages at a safe rate.",
    "Alert when the DLQ grows fast.",
  ],
  solution: `
**Diagnosis.** The consumer kept pulling messages during the outage. Each failed five times within seconds and went to the DLQ, emptying the queue in ten minutes.

**Immediate mitigation.**
- Replay the DLQ to the main queue once the ERP is back, paced to what it can take.

**Root cause.** The error handling treated an outage like bad data.

**Permanent fix.**
- Open a circuit breaker on connectivity errors so the subscriber pauses, then tries again after a delay.
- Send only validation and business errors to the DLQ.

**Prevention.** Alert when the DLQ grows quickly, and test the consumer against a dependency outage.
`,
  followUps: [
    { q: "Does the Anypoint MQ connector help?", a: "It offers a circuit breaker on the subscriber for chosen error types. Check your connector version." },
    { q: "Why not raise the max deliveries to 1000?", a: "Bad messages would then loop for a long time before reaching the DLQ." },
    { q: "How do you replay safely?", a: "Move messages back in batches, watching the ERP, and keep the consumer idempotent." },
    { q: "What tells outage from bad data?", a: "Error types: connectivity and 5xx are outages, 4xx and validation are bad data." },
  ],
}
