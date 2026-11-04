export default {
  id: 'dw-035',
  category: 'dataweave',
  title: 'Reconcile Orders and Payments with SQL-Style Joins',
  level: 'INTERMEDIATE',
  tags: ['join', 'outerJoin', 'dw::core::Arrays', 'multiple-inputs', 'reconciliation'],
  estMinutes: 25,
  description: `
Finance runs a daily reconciliation between the order system (\`payload\`) and the payment gateway (\`payments\`). A payment's \`ref\` is the order's \`orderId\` — but the order system sends \`orderId\` as a **number** and the gateway sends \`ref\` as a **string**.

Return \`{ matched, unpaid, orphanPayments }\`:

| Field | Content |
|---|---|
| \`matched\` | one row per order that has a payment: \`{ orderId, customer, amount, paid, method, status }\` (\`paid\` = \`paidAmount\`) |
| \`unpaid\` | the \`orderId\`s (numbers) of orders with no payment |
| \`orphanPayments\` | the \`ref\`s (strings) of payments that match no order |

**Rules**
- \`status\` is \`"PAID"\` when \`paid == amount\`, \`"PARTIAL"\` when \`paid < amount\`, \`"OVERPAID"\` when \`paid > amount\`.
- \`matched\` and \`unpaid\` are sorted by \`orderId\` ascending (numerically); \`orphanPayments\` by \`ref\` ascending.
- Each order has at most one payment, and each \`orderId\` is unique.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `[
  { "orderId": 1003, "customer": "Globex", "amount": 250 },
  { "orderId": 1001, "customer": "Acme", "amount": 120.5 },
  { "orderId": 1002, "customer": "Initech", "amount": 80 },
  { "orderId": 1004, "customer": "Umbrella", "amount": 40 }
]`,
    },
    {
      name: 'payments',
      mime: 'application/json',
      content: `[
  { "ref": "1001", "paidAmount": 120.5, "method": "CARD" },
  { "ref": "1003", "paidAmount": 200, "method": "BANK" },
  { "ref": "1009", "paidAmount": 15, "method": "CARD" },
  { "ref": "1004", "paidAmount": 45, "method": "PAYPAL" }
]`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "matched": [
    { "orderId": 1001, "customer": "Acme", "amount": 120.5, "paid": 120.5, "method": "CARD", "status": "PAID" },
    { "orderId": 1003, "customer": "Globex", "amount": 250, "paid": 200, "method": "BANK", "status": "PARTIAL" },
    { "orderId": 1004, "customer": "Umbrella", "amount": 40, "paid": 45, "method": "PAYPAL", "status": "OVERPAID" }
  ],
  "unpaid": [1002],
  "orphanPayments": ["1009"]
}`,
  },
  starterCode: `%dw 2.0
import * from dw::core::Arrays
output application/json
---
payload
`,
  hints: [
    '`dw::core::Arrays` has `join`, `leftJoin` and `outerJoin(left, right, leftKey, rightKey)`. Each result row is `{ l, r }`; a side with no match is simply absent.',
    'The key functions must return **strings** — `(o) -> o.orderId as String` and `(p) -> p.ref as String` — which also solves the number-vs-string mismatch.',
    'One `outerJoin` gives you all three lists: rows with both sides, rows with only `l`, rows with only `r`.',
  ],
  solution: `%dw 2.0
import * from dw::core::Arrays
output application/json

var rows = outerJoin(payload, payments, (o) -> o.orderId as String, (p) -> p.ref as String)
---
{
  matched: (rows filter ($.l != null and $.r != null))
    map ((row) -> {
      orderId: row.l.orderId,
      customer: row.l.customer,
      amount: row.l.amount,
      paid: row.r.paidAmount,
      method: row.r.method,
      status: if (row.r.paidAmount == row.l.amount) "PAID"
              else if (row.r.paidAmount < row.l.amount) "PARTIAL"
              else "OVERPAID"
    })
    orderBy $.orderId,
  unpaid: ((rows filter ($.r == null)) map $.l.orderId) orderBy $,
  orphanPayments: ((rows filter ($.l == null)) map $.r.ref) orderBy $
}`,
  explanation: `
**SQL joins in DataWeave.** \`dw::core::Arrays\` mirrors SQL:

| Function | SQL | Rows returned |
|---|---|---|
| \`join\` | INNER JOIN | only pairs that match |
| \`leftJoin\` | LEFT OUTER JOIN | every left item, \`r\` absent when unmatched |
| \`outerJoin\` | FULL OUTER JOIN | every item from both sides |

Each row is \`{ l: ..., r: ... }\`, so after a single \`outerJoin\` the three reconciliation buckets are just three filters.

**The trap.** The key criteria must return a \`String\`. Returning \`o.orderId\` (a number) fails, and comparing \`1001\` with \`"1001"\` by hand never matches. Casting both sides with \`as String\` is the fix — and it is exactly the kind of type mismatch real gateways produce.

\`matched\` is sorted by the numeric \`orderId\` coming from the order side, so \`1004\` sorts after \`1003\` as a number.
`,
  tests: [
    {
      name: 'No payments yet',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '[{ "orderId": 20, "customer": "B", "amount": 5 }, { "orderId": 3, "customer": "A", "amount": 9 }]',
        },
        { name: 'payments', mime: 'application/json', content: '[]' },
      ],
      expected: '{ "matched": [], "unpaid": [3, 20], "orphanPayments": [] }',
    },
    {
      name: 'Numeric sort of matched orders',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content:
            '[{ "orderId": 100, "customer": "X", "amount": 10 }, { "orderId": 99, "customer": "Y", "amount": 10.00 }]',
        },
        {
          name: 'payments',
          mime: 'application/json',
          content:
            '[{ "ref": "99", "paidAmount": 10, "method": "CARD" }, { "ref": "100", "paidAmount": 9.99, "method": "BANK" }, { "ref": "7", "paidAmount": 1, "method": "CARD" }, { "ref": "12", "paidAmount": 1, "method": "CARD" }]',
        },
      ],
      expected:
        '{ "matched": [{ "orderId": 99, "customer": "Y", "amount": 10.00, "paid": 10, "method": "CARD", "status": "PAID" }, { "orderId": 100, "customer": "X", "amount": 10, "paid": 9.99, "method": "BANK", "status": "PARTIAL" }], "unpaid": [], "orphanPayments": ["12", "7"] }',
    },
  ],
  followUps: [
    {
      q: 'What changes if an order can have several partial payments?',
      a: 'The join returns one row per payment, so group the matched rows by `orderId` and `sum` the `paidAmount`s before computing the status. Alternatively group payments by `ref` first and join the groups.',
    },
    {
      q: 'Why are the orphan refs sorted with "12" before "7"?',
      a: 'They are strings, so `orderBy` compares them alphabetically. If you want numeric order, sort by `$ as Number` — but only if every ref is guaranteed to be numeric.',
    },
    {
      q: 'When would you not do this join in DataWeave?',
      a: 'For large daily volumes, push it to the database (a FULL OUTER JOIN) or stream both files sorted by key; an in-memory join in a Mule worker is fine for thousands of records, not millions.',
    },
  ],
}
