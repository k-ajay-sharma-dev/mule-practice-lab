export default {
  id: 'dw-156',
  category: 'dataweave',
  title: 'Split a Nightly Order Batch into One Queue Message per Order',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'queues', 'splitting', 'filter', 'map', 'sum', 'ordering-key', 'retail', 'json'],
  estMinutes: 18,
  description: `
Pellmark Garden Supplies receives one JSON batch of web orders each night. The integration used to send the whole batch to the ERP in one call, and one bad order failed all of them. The new design publishes one queue message per order, so each order succeeds or fails on its own.

Rules:

1. An order without a \`customerId\` (missing, null or empty) is rejected with the reason \`no customer\`.
2. Otherwise, an order with no lines is rejected with the reason \`no lines\`.
3. Every other order becomes a message with:
   - \`messageId\`: the batch id, a dash and the order id
   - \`orderingKey\`: the customer id, so one customer's orders can be kept in order
   - \`properties\`: \`batchId\`, \`seq\` (1, 2, 3 and so on among the accepted orders) and \`of\` (the number of accepted orders)
   - \`body\`: \`orderId\`, \`customerId\`, \`orderTotal\` (the sum of \`qty * price\`) and \`lines\`

Output \`messages\` and \`rejected\` (each with \`orderId\` and \`reason\`), both in input order.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{
  "batchId": "B-20261118-01",
  "orders": [
    { "orderId": "A100", "customerId": "C-9", "lines": [{ "sku": "S1", "qty": 2, "price": 5.5 }, { "sku": "S2", "qty": 1, "price": 10 }] },
    { "orderId": "A101", "customerId": "C-4", "lines": [] },
    { "orderId": "A102", "customerId": "C-4", "lines": [{ "sku": "S3", "qty": 3, "price": 2 }] },
    { "orderId": "A103", "customerId": null, "lines": [{ "sku": "S1", "qty": 1, "price": 5.5 }] },
    { "orderId": "A104", "customerId": "C-9", "lines": [{ "sku": "S1", "qty": 1, "price": 5.5 }] }
  ]
}`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "messages": [
    {
      "messageId": "B-20261118-01-A100",
      "orderingKey": "C-9",
      "properties": { "batchId": "B-20261118-01", "seq": 1, "of": 3 },
      "body": { "orderId": "A100", "customerId": "C-9", "orderTotal": 21, "lines": [{ "sku": "S1", "qty": 2, "price": 5.5 }, { "sku": "S2", "qty": 1, "price": 10 }] }
    },
    {
      "messageId": "B-20261118-01-A102",
      "orderingKey": "C-4",
      "properties": { "batchId": "B-20261118-01", "seq": 2, "of": 3 },
      "body": { "orderId": "A102", "customerId": "C-4", "orderTotal": 6, "lines": [{ "sku": "S3", "qty": 3, "price": 2 }] }
    },
    {
      "messageId": "B-20261118-01-A104",
      "orderingKey": "C-9",
      "properties": { "batchId": "B-20261118-01", "seq": 3, "of": 3 },
      "body": { "orderId": "A104", "customerId": "C-9", "orderTotal": 5.5, "lines": [{ "sku": "S1", "qty": 1, "price": 5.5 }] }
    }
  ],
  "rejected": [
    { "orderId": "A101", "reason": "no lines" },
    { "orderId": "A103", "reason": "no customer" }
  ]
}`,
  },
  starterCode: `%dw 2.0
output application/json
var batchId = payload.batchId
---
{
  messages: payload.orders map (o) -> {
    messageId: batchId ++ "-" ++ o.orderId,
    body: o
  },
  rejected: []
}
`,
  hints: [
    'Write a small function that returns the reject reason for an order, or `null` when the order is fine.',
    '`isEmpty` is true for null, an empty string and an empty list, so `isEmpty(o.customerId)` covers all three cases.',
    'Filter the accepted orders once into a `var`. Then `sizeOf` gives `of`, and the index in `map (o, i)` gives `seq`.',
    'The order total is `sum(o.lines map ($.qty * $.price))`.',
  ],
  solution: `%dw 2.0
output application/json
var batchId = payload.batchId

fun reason(o) =
  if (isEmpty(o.customerId)) "no customer"
  else if (isEmpty(o.lines)) "no lines"
  else null

var accepted = payload.orders filter (o) -> reason(o) == null
var rejected = payload.orders filter (o) -> reason(o) != null
---
{
  messages: accepted map (o, i) -> {
    messageId: batchId ++ "-" ++ o.orderId,
    orderingKey: o.customerId,
    properties: {
      batchId: batchId,
      seq: i + 1,
      of: sizeOf(accepted)
    },
    body: {
      orderId: o.orderId,
      customerId: o.customerId,
      orderTotal: sum(o.lines map ($.qty * $.price)),
      lines: o.lines
    }
  },
  rejected: rejected map (o) -> { orderId: o.orderId, reason: reason(o) }
}`,
  explanation: `
**One message per unit of work.** A bad order now fails alone. Its message can go to a dead letter queue while the others are processed. With one big call, the whole batch had to be fixed and sent again.

**One reason function.** \`reason\` holds the rules in one place, and both lists use it, so an order is never in both lists and never in neither. The order of the checks decides which reason wins when an order has two problems.

**seq and of.** These let a consumer, or a report at the end, check that every message of the batch arrived. \`of\` counts the accepted orders only, since rejected ones are never published.

**The ordering key.** Messages for one customer carry the same key. A broker or consumer that supports grouping can keep them in order while orders for other customers run in parallel.

**A stable message id.** The batch id and order id together give the same id if the batch is split again after a failure, so consumers can drop repeats.
`,
  tests: [
    {
      name: 'Every order is rejected',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '{ "batchId": "B-2", "orders": [{ "orderId": "Z1", "customerId": "", "lines": [] }, { "orderId": "Z2", "customerId": "C-1" }] }',
        },
      ],
      expected: '{ "messages": [], "rejected": [{ "orderId": "Z1", "reason": "no customer" }, { "orderId": "Z2", "reason": "no lines" }] }',
    },
    {
      name: 'One good order',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '{ "batchId": "B-3", "orders": [{ "orderId": "K7", "customerId": "C-2", "lines": [{ "sku": "S9", "qty": 4, "price": 1.25 }] }] }',
        },
      ],
      expected:
        '{ "messages": [{ "messageId": "B-3-K7", "orderingKey": "C-2", "properties": { "batchId": "B-3", "seq": 1, "of": 1 }, "body": { "orderId": "K7", "customerId": "C-2", "orderTotal": 5, "lines": [{ "sku": "S9", "qty": 4, "price": 1.25 }] } }], "rejected": [] }',
    },
  ],
  followUps: [
    {
      q: 'How would the Mule flow publish these messages?',
      a: 'Loop over the messages array with For Each and call the publish operation for each one. The messageId and properties come from each item, and the body becomes the message payload.',
    },
    {
      q: 'The batch has 200,000 orders. What worries you?',
      a: 'Building every message in memory at once. Stream the input and publish as you go, or split the file into chunks first, and watch the publish rate against the broker limits.',
    },
    {
      q: 'Where should the rejected orders go?',
      a: 'Somewhere a person sees them, such as an error report file or a ticket. Silently dropping them means a customer order is lost.',
    },
  ],
}
