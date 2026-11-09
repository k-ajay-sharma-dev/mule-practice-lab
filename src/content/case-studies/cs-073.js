export default {
  id: 'cs-073',
  category: 'case-studies',
  title: 'E-commerce Retailer Fixing Duplicate and Lost Orders Between Checkout, OMS and SAP',
  level: 'ADVANCED',
  tags: ['e-commerce', 'retail', 'idempotency', 'reliability', 'anypoint-mq', 'reconciliation', 'sap', 'error-handling'],
  estMinutes: 50,
  quiz: [
    {
      type: 'single',
      needsScenario: true,
      prompt: 'The checkout calls the order API, times out after 10 seconds and retries. Both calls create an order. What is the best fix?',
      options: [
        'Raise the checkout timeout to 60 seconds so it never retries',
        'Have the checkout send an idempotency key (the basket ID) and make the order API return the first result for a repeated key',
        'Stop the checkout from retrying, and ask customers to place the order again if it fails',
        'Delete duplicate orders every night with a clean-up job',
      ],
      answer: 1,
      explain: 'A timeout does not mean the order failed, so retries are needed but must be safe. An idempotency key stored with the first result makes the retry return the same order. Longer timeouts and nightly clean-up only hide the problem.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'The order Process API writes the order to its database and then publishes order-created to Anypoint MQ. Sometimes the app restarts between the two steps and the OMS never hears of the order. Which pattern fixes this?',
      options: [
        'Publish first, then write the database',
        'Wrap both steps in an XA transaction with Anypoint MQ',
        'Write the order and an outbox row in one database transaction, and let a relay publish from the outbox',
        'Add a second publish attempt in the error handler',
      ],
      answer: 2,
      explain: 'The outbox puts the order and the intent to publish in one local transaction, and the relay publishes until it succeeds. Anypoint MQ cannot take part in XA, and an error handler does not run when the app crashes.',
    },
    {
      type: 'multi',
      needsScenario: true,
      prompt: 'The OMS consumer sometimes receives the same order-created message twice (for example after a lock expires during a slow SAP call). Which three measures make this safe?',
      options: [
        'Record processed order IDs and skip ones already handled',
        'Use the order ID as the SAP sales order external reference and check it before creating',
        'Set the Anypoint MQ acknowledgement timeout longer than the slowest normal processing time',
        'Turn off redelivery on the queue so messages are never delivered twice',
        'Process messages with only one worker thread, so duplicates cannot happen',
      ],
      answer: [0, 1, 2],
      explain: 'At-least-once delivery means duplicates will happen, so consumers must be idempotent, and SAP needs its own duplicate guard. A longer acknowledgement timeout reduces redelivery. Turning off redelivery loses messages, and one thread does not stop redelivery after a timeout.',
    },
    {
      type: 'match',
      prompt: 'Match each failure to where it should end up.',
      pairs: [
        ['SAP is down for 20 minutes', 'Retried with backoff until SAP returns'],
        ['The order has a product code SAP does not know', 'Dead-letter queue for the order support team'],
        ['The same order message arrives a second time', 'Skipped by the idempotent consumer'],
        ['An order exists in the OMS but not in SAP after 2 hours', 'Flagged by the reconciliation job'],
      ],
      explain: 'Temporary failures are retried, business errors go to a person, duplicates are ignored, and a reconciliation catches anything the other controls missed.',
    },
    {
      type: 'order',
      prompt: 'Order the steps for safely creating an order from checkout.',
      items: [
        'Checkout sends the order with an idempotency key',
        'The order API checks the key and returns the stored result if it has seen it',
        'The order and an outbox row are written in one database transaction',
        'The API answers the checkout with the order number',
        'The outbox relay publishes order-created to the queue',
        'The OMS consumer processes it once, using the order ID to skip duplicates',
      ],
      explain: 'The key check comes before any write. The order and outbox row commit together, the customer gets an answer, and publishing happens afterwards from the outbox.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Finance asks how they will know no orders are lost after the fix. What is the best answer?',
      options: [
        'The queues guarantee delivery, so no check is needed',
        'A reconciliation job compares order counts and IDs between checkout, OMS and SAP every hour and alerts on any gap',
        'Developers will look at the logs if a customer complains',
        'Turn on debug logging for all order flows',
      ],
      answer: 1,
      explain: 'Delivery guarantees reduce loss but do not prove it. An independent reconciliation by order ID across systems finds gaps quickly and gives finance evidence.',
    },
  ],
  description: `
**Context.** An online electronics retailer takes 45,000 orders a day, 300,000 on Black Friday. Last November it had:
- 1,900 orders created twice (customers charged once but shipped twice, or charged twice)
- about 400 orders that the customer paid for but that never reached the warehouse, found only when customers complained

**The order path today**
1. The checkout (a Next.js storefront) calls \`exp-checkout-api\` with a 10 second timeout and 2 retries.
2. \`prc-orders\` writes the order to PostgreSQL and then publishes \`order-created\` to Anypoint MQ.
3. The OMS consumer reads the queue, creates the order in the OMS (a SaaS) and then a sales order in SAP S/4HANA for billing.
4. SAP sometimes takes 30 seconds or more under load. The queue acknowledgement timeout is 15 seconds.

**What the logs showed**
- Duplicates: checkout retries after a slow first call, and redeliveries when SAP calls are slower than the acknowledgement timeout.
- Lost orders: \`prc-orders\` restarted (CloudHub 2.0 replica replacement) between the database commit and the publish.
- Errors: failed messages were retried 10 times and then dropped, because no DLQ was set up.

**Constraints**
- Payment is authorised by the checkout before the order call; the retailer must never ship without a valid authorisation.
- The OMS API does not support idempotency keys. SAP sales orders can carry an external reference.
- The fix must be in place before the next peak, in 4 months.

**Your task.** Answer the design questions to make the order path reliable.
`,
  answerTemplate: `## Safe retries from checkout (idempotency)

## Publishing reliably (outbox)

## Idempotent consumers and acknowledgement timeouts

## Errors: retry, dead-letter, alert

## Reconciliation and proof
`,
  keyPoints: [
    'Retries are needed, so every create must be idempotent: the checkout sends the basket ID as the key and the order API returns the stored result for a repeat.',
    'Use a transactional outbox so the order row and the publish intent commit together; a relay publishes from the outbox.',
    'Consumers are idempotent by order ID, SAP sales orders carry the order ID as external reference, and the acknowledgement timeout fits the slowest normal call.',
    'Separate temporary errors (retry with backoff) from business errors (DLQ to a team); never drop messages.',
    'An hourly reconciliation by order ID across checkout, OMS and SAP proves nothing is lost or doubled.',
  ],
  solution: `
**Checkout.** Send the basket ID as an \`Idempotency-Key\` header. \`prc-orders\` stores the key with the result in the same transaction as the order. A repeat returns the stored order number, and a repeat that arrives while the first is still running gets 409 and retries later.

**Publishing.** Write the order and an outbox row in one PostgreSQL transaction. A relay flow reads unsent outbox rows, publishes to Anypoint MQ and marks them sent. A restart can publish a row twice, which the consumer handles.

**Consumer.**
- Set the acknowledgement timeout to 120 seconds, above the slowest normal SAP call.
- Record processed order IDs.
- Before creating in the OMS, look up the order by its reference, since the OMS has no idempotency keys.
- Create the SAP sales order with the order ID as external reference, and check for it first.

**Errors.** Timeouts and 5xx responses are retried with backoff up to about 2 hours. Validation errors go straight to the DLQ, with an alert and a runbook for the order support team. Nothing is dropped.

**Reconciliation.** An hourly job compares order IDs in PostgreSQL, the OMS and SAP for the last 24 hours. It alerts on any order missing for more than 30 minutes and on any ID found twice.
`,
  followUps: [
    { q: 'Why not stop the checkout from retrying?', a: 'A timeout does not tell you whether the order was created. Without a retry some paid orders would be lost, so the retry must be made safe with an idempotency key.' },
    { q: 'The OMS has no idempotency key. How do you avoid duplicates there?', a: 'Look up the order by its reference before creating it, and only create when it is not found. Run one consumer per order key so two copies are not handled at the same moment.' },
    { q: 'Why is an error handler not enough to fix lost publishes?', a: 'A crash or restart skips the error handler entirely. Only a durable record written with the order, such as an outbox row, survives the crash.' },
    { q: 'How do you size the acknowledgement timeout?', a: 'Measure the slowest normal processing time, including the SAP call, and set the timeout above it with margin. Too short causes redelivery, too long delays recovery after a crash.' },
  ],
}
