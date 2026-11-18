export default {
  id: 'inc-202',
  category: 'incidents',
  title: "Orders Stop Reaching the Warehouse After Go-Live: the Production Queue Name Has a Typo",
  level: 'BEGINNER',
  tags: ["myproject","queues","anypoint-mq","configuration","deployment"],
  estMinutes: 15,
  investigation: {
    logs: [
      { text: "2026-11-18 09:00:04 INFO  [order-api] Order accepted orderId=SO-7001", relevant: false },
      { text: "2026-11-18 09:00:04 ERROR [order-api] Publish failed destination=warehouse-orderz errorType=ANYPOINT-MQ:DESTINATION_NOT_FOUND", relevant: true, why: "The queue the app publishes to does not exist." },
      { text: "2026-11-18 09:00:05 INFO  [config] mq.destination=warehouse-orderz env=prod", relevant: true, why: "The production property holds a typo." },
      { text: "2026-11-18 09:00:05 INFO  [anypoint-mq] Queues in prod region: warehouse-orders, warehouse-orders-dlq", relevant: true, why: "The real queue is warehouse-orders." },
      { text: "2026-11-18 09:01:00 INFO  [order-api] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why do orders not reach the warehouse?",
        options: [
          "The production property names a queue that does not exist, so every publish fails",
          "The warehouse consumer is down",
          "Anypoint MQ is full",
          "Orders are too large",
        ],
        answer: 0,
        explain: "The error says the destination was not found, and the property shows the misspelled name.",
      },
      {
        type: 'single',
        prompt: "Why did it work in test?",
        options: [
          "The test property file had the right queue name",
          "Test has no queues",
          "Test skips publishing",
          "Test uses a different connector",
        ],
        answer: 0,
        explain: "Each environment has its own value. Only the production one was wrong.",
      },
      {
        type: 'multi',
        prompt: "What do you do right away?",
        options: [
          "Fix the property to warehouse-orders and restart or redeploy",
          "Find orders accepted since go-live and publish them again",
          "Tell the warehouse orders will arrive late",
          "Create a queue called warehouse-orderz",
        ],
        answer: [0,1,2],
        explain: "Fix the name, recover the missed orders, and warn the people waiting. A second queue with the typo would hide the mistake.",
      },
      {
        type: 'single',
        prompt: "Why were customers told their order was accepted?",
        options: [
          "The API answered before publishing, and a failed publish was only logged",
          "The warehouse confirmed it",
          "The queue sent a receipt",
          "Anypoint MQ retried for them",
        ],
        answer: 0,
        explain: "If publishing is part of accepting an order, its failure must fail the request or be retried from a store.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Fix the queue name in production",
          "Republish orders accepted since go-live",
          "Make a failed publish fail the request or go to a retry store",
          "Add a start-up check that the queues exist",
          "Add a smoke test that publishes one message after each deploy",
        ],
        explain: "Fix, recover, stop silent loss, then catch it at start-up and after deploy.",
      },
    ],
  },
  description: `
## Symptoms
- After go-live of the new order API, the warehouse receives no orders.
- Customers still get "order accepted".

## Change / Context
- The API publishes each order to an Anypoint MQ queue named in \`mq.destination\`.
- Test worked the day before.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 09:00:04 ERROR [order-api] Publish failed destination=warehouse-orderz errorType=ANYPOINT-MQ:DESTINATION_NOT_FOUND
2026-11-18 09:00:05 INFO  [config] mq.destination=warehouse-orderz env=prod
2026-11-18 09:00:05 INFO  [anypoint-mq] Queues in prod region: warehouse-orders, warehouse-orders-dlq
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
    "A destination not found error means the queue name is wrong or the queue was never created.",
    "Each environment has its own property value.",
    "Recover orders accepted during the outage.",
    "A publish failure must not be hidden behind a success answer.",
    "Check queues exist at start-up.",
    "Smoke test the messaging path after each deploy.",
  ],
  solution: `
**Diagnosis.** The production property says \`warehouse-orderz\`. That queue does not exist, so every publish fails with destination not found.

**Immediate mitigation.**
- Correct the property to \`warehouse-orders\` and redeploy.
- Find orders accepted since go-live and publish them again.

**Root cause.** The production value was typed by hand and never tested. The API logged the publish error but still answered success.

**Permanent fix.**
- Fail the request, or save the order for a retry job, when the publish fails.
- Keep queue names in one reviewed place per environment.

**Prevention.** A start-up check or smoke test that publishes and reads one test message in each environment.
`,
  followUps: [
    { q: "Why not create the misspelled queue?", a: "It would hide the mistake, and the warehouse consumer would still read the real queue." },
    { q: "How do you republish safely?", a: "Use the order IDs, and make the warehouse consumer ignore an order it already has." },
    { q: "Should the API wait for the publish?", a: "Yes, if the order is only safe once the message is accepted by the broker." },
    { q: "Where else can names be wrong?", a: "DLQ names, exchange bindings and client app permissions in each environment." },
  ],
}
