export default {
  id: 'inc-210',
  category: 'incidents',
  title: "Orders Saved but Never Announced: the Database Commit Worked and the Queue Publish After It Failed",
  level: 'ADVANCED',
  tags: ["myproject","queues","outbox","transactions","database","events"],
  estMinutes: 25,
  investigation: {
    logs: [
      { text: "2026-11-18 14:20:01 INFO  [order-api] Order saved orderId=SO-1201 db=committed", relevant: true, why: "The order is in the database." },
      { text: "2026-11-18 14:20:01 ERROR [order-api] Publish order-created failed errorType=ANYPOINT-MQ:CONNECTIVITY", relevant: true, why: "The event was not published." },
      { text: "2026-11-18 14:20:01 INFO  [order-api] Response 201 orderId=SO-1201", relevant: true, why: "The customer was told it worked." },
      { text: "2026-11-18 14:25:00 WARN  [order-recon] SO-1201 is in the order database but shipping has no order-created event for it", relevant: true, why: "Shipping never hears about it." },
      { text: "2026-11-18 14:26:00 INFO  [order-api] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why is SO-1201 never shipped?",
        options: [
          "The order committed, then the publish failed, and nothing retried it",
          "The publish failed, so the database rolled the order back afterwards",
          "Shipping received the event but dropped it as a duplicate order ID",
          "The event sits in the order-created DLQ after five failed deliveries",
        ],
        answer: 0,
        explain: "Two separate systems were written one after the other with no link between them.",
      },
      {
        type: 'single',
        prompt: "What does the outbox pattern do?",
        options: [
          "Saves the event in the order’s transaction, and a job publishes it later",
          "Publishes the event first, then saves the order once the broker accepts",
          "Joins the database and the broker in one XA two phase commit transaction",
          "Retries the publish three times inside the API before it answers 201",
        ],
        answer: 0,
        explain: "The order and its event commit together. Publishing can then retry until it works.",
      },
      {
        type: 'multi',
        prompt: "What must the outbox publisher handle?",
        options: [
          "Retrying until the broker accepts",
          "Marking events as sent after a successful publish",
          "Sending an event twice if it crashes between publish and mark",
          "Rolling back the order when the publish fails",
        ],
        answer: [0,1,2],
        explain: "It is at least once delivery, so consumers must ignore duplicates.",
      },
      {
        type: 'single',
        prompt: "Why not publish first, then save?",
        options: [
          "A failed save would leave an event for an order that does not exist",
          "It is safe, since the broker holds the event until the save commits",
          "Anypoint MQ rejects a publish that comes before the database commit",
          "It is slower, because the customer waits for the broker as well",
        ],
        answer: 0,
        explain: "Changing the order only moves the gap.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Find orders with no published event",
          "Publish their events",
          "Add an outbox table written in the order transaction",
          "Add a publisher job that retries and marks events sent",
          "Make consumers idempotent by event ID",
        ],
        explain: "Recover, then close the gap for good.",
      },
    ],
  },
  description: `
## Symptoms
- A few orders a day are never shipped. They exist in the order database.

## Change / Context
- The order API inserts the order, commits, then publishes an order-created event to Anypoint MQ.
- Publish errors are logged, and the API still answers 201.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 14:20:01 INFO  [order-api] Order saved orderId=SO-1201 db=committed
2026-11-18 14:20:01 ERROR [order-api] Publish order-created failed errorType=ANYPOINT-MQ:CONNECTIVITY
2026-11-18 14:20:01 INFO  [order-api] Response 201 orderId=SO-1201
2026-11-18 14:25:00 WARN  [order-recon] SO-1201 is in the order database but shipping has no order-created event for it
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
    "Writing a database and a queue one after the other leaves a gap.",
    "The outbox pattern writes the event in the same transaction as the data.",
    "A separate job publishes and retries.",
    "Delivery becomes at least once.",
    "Consumers must be idempotent.",
    "Find and republish missed events.",
  ],
  solution: `
**Diagnosis.** The order committed, then the publish failed with a connectivity error. Nothing kept the event, so shipping never heard of the order.

**Immediate mitigation.**
- Find orders without a matching event and publish them.

**Root cause.** Two writes to two systems with no shared transaction and no retry.

**Permanent fix.**
- Insert an outbox row in the same transaction as the order.
- A scheduled or listener flow publishes outbox rows, retries on failure, and marks them sent.

**Prevention.** A daily check that every order has a published event, and idempotent consumers.
`,
  followUps: [
    { q: "Why not an XA transaction?", a: "Not every broker supports it, and it adds cost and locking. The outbox is lighter to run." },
    { q: "How fast does the outbox publish?", a: "A poll every few seconds is usual. A database listener or CDC can be faster." },
    { q: "What about ordering?", a: "Publish outbox rows in insert order per order ID." },
    { q: "How long do you keep outbox rows?", a: "Delete or archive sent rows after a short period." },
  ],
}
