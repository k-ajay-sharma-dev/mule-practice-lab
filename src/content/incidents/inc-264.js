export default {
  id: 'inc-264',
  category: 'incidents',
  title: "The App Cannot Find the Order It Has Inserted",
  level: 'BEGINNER',
  tags: ["myproject","sql-server","identity","insert"],
  estMinutes: 15,
  investigation: {
    logs: [
      { text: "2026-11-18 10:00:00 INFO  [order-api] INSERT INTO orders ... executed affectedRows=1", relevant: true, why: "The insert worked." },
      { text: "2026-11-18 10:00:00 INFO  [order-api] SELECT MAX(order_id) FROM orders returned 55120", relevant: true, why: "The app guesses the new ID with MAX." },
      { text: "2026-11-18 10:00:00 INFO  [order-api] Another insert at the same time got order_id 55120", relevant: true, why: "Another request inserted between them." },
      { text: "2026-11-18 10:00:01 WARN  [order-api] Order lines attached to wrong order 55120", relevant: true, why: "Lines go to the wrong order." },
      { text: "2026-11-18 23:59:00 INFO  [order-api] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why do lines attach to the wrong order?",
        options: [
          "MAX(order_id) returns another request’s order under concurrency",
          "The insert failed and the lines went to the last order",
          "The identity column repeats values after a restart",
          "A lock made the app read an uncommitted order",
        ],
        answer: 0,
        explain: "MAX is not safe under concurrency.",
      },
      {
        type: 'single',
        prompt: "How should the app get the new ID?",
        options: [
          "Use the keys the insert returns, or OUTPUT INSERTED",
          "Run SELECT MAX inside a short retry loop",
          "Read IDENT_CURRENT('orders') after the insert",
          "Select the newest order by created time",
        ],
        answer: 0,
        explain: "The insert itself returns the key.",
      },
      {
        type: 'multi',
        prompt: "Which are safe in SQL Server?",
        options: [
          "OUTPUT INSERTED.order_id",
          "SCOPE_IDENTITY() in the same batch",
          "The Mule insert with auto generated keys",
          "@@IDENTITY with triggers on the table",
        ],
        answer: [0,1,2],
        explain: "@@IDENTITY can return a key from a trigger insert.",
      },
      {
        type: 'single',
        prompt: "How do you fix the bad orders?",
        options: [
          "Find orders with lines from two requests and fix them",
          "Delete all orders placed since the API went live",
          "Restart the API so new orders get correct IDs",
          "Ask customers to cancel and place orders again",
        ],
        answer: 0,
        explain: "Clean up affected data.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Stop the API or route to a fixed version",
          "Use generated keys",
          "Find affected orders",
          "Correct them",
          "Add a concurrency test",
        ],
        explain: "Contain, fix, clean, test.",
      },
    ],
  },
  description: `
## Symptoms
- Customers see lines from other orders.

## Change / Context
- The API inserts an order, then reads MAX(order_id) to add lines.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 10:00:00 INFO  [order-api] INSERT INTO orders ... executed affectedRows=1
2026-11-18 10:00:00 INFO  [order-api] SELECT MAX(order_id) FROM orders returned 55120
2026-11-18 10:00:00 INFO  [order-api] Another insert at the same time got order_id 55120
2026-11-18 10:00:01 WARN  [order-api] Order lines attached to wrong order 55120
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
    "MAX is unsafe under concurrency.",
    "Use OUTPUT or SCOPE_IDENTITY.",
    "Mule can return generated keys.",
    "Avoid @@IDENTITY with triggers.",
    "Clean affected data.",
    "Test with concurrent requests.",
  ],
  solution: `
**Diagnosis.** Two inserts ran together. MAX returned the other one’s ID.

**Immediate mitigation.**
- Correct affected orders.

**Root cause.** The ID was guessed, not returned by the insert.

**Permanent fix.**
- Return the generated key from the insert.

**Prevention.** Concurrency tests.
`,
  followUps: [
    { q: "What does OUTPUT do?", a: "Returns columns from rows the statement changed." },
    { q: "Is a sequence better?", a: "A sequence lets you get the ID before the insert, which also works." },
    { q: "Why did tests pass?", a: "They ran one request at a time." },
    { q: "What about transactions?", a: "Wrap order and lines in one transaction." },
  ],
}
