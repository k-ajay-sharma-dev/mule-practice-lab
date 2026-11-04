export default {
  id: 'dw-045',
  category: 'dataweave',
  title: 'Nest Flat CSV Order Lines under Their Orders',
  level: 'INTERMEDIATE',
  tags: ['csv', 'groupBy', 'coercion', 'default', 'nesting'],
  estMinutes: 20,
  description: `
An ERP exports open orders as a CSV file with **one row per order line**. The order columns are repeated on every line, the file is **not** sorted, and — because a human edits it in a spreadsheet — some numeric cells are **empty**. Your Mule app must post the orders as nested JSON to an e-commerce API.

**Rules**
- One object per \`orderId\`, in the order in which each \`orderId\` **first appears** in the file.
- Order fields: \`orderId\`, \`orderDate\` and \`customer\` (take them from the order's first row), then \`lines\` and \`total\`.
- \`lines\`: one object per row of that order, **sorted by \`lineNo\` numerically**, each with \`lineNo\` (number), \`sku\`, \`qty\` (number) and \`unitPrice\` (number).
- An empty \`qty\` means **1**. An empty \`unitPrice\` means a free item, **0**.
- \`total\`: the sum of \`qty * unitPrice\` over the order's lines (after applying the defaults).
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/csv',
      content: `orderId,orderDate,customer,lineNo,sku,qty,unitPrice
SO-11,2026-11-02,C-900,2,MOUSE-01,2,19.95
SO-12,2026-11-02,C-311,1,DOCK-02,,129.00
SO-11,2026-11-02,C-900,10,STICKER,5,
SO-11,2026-11-02,C-900,1,LAPTOP-15,1,1099.00`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `[
  {
    "orderId": "SO-11",
    "orderDate": "2026-11-02",
    "customer": "C-900",
    "lines": [
      { "lineNo": 1, "sku": "LAPTOP-15", "qty": 1, "unitPrice": 1099.00 },
      { "lineNo": 2, "sku": "MOUSE-01", "qty": 2, "unitPrice": 19.95 },
      { "lineNo": 10, "sku": "STICKER", "qty": 5, "unitPrice": 0 }
    ],
    "total": 1138.90
  },
  {
    "orderId": "SO-12",
    "orderDate": "2026-11-02",
    "customer": "C-311",
    "lines": [
      { "lineNo": 1, "sku": "DOCK-02", "qty": 1, "unitPrice": 129.00 }
    ],
    "total": 129.00
  }
]`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload
`,
  hints: [
    'Every CSV value is a String, and an empty cell is the empty string `""` — not null. So `row.qty default "1"` does **not** work; test with `isEmpty(row.qty)`.',
    '`payload groupBy $.orderId` returns an object keyed by order id, in first-appearance order. Turn it into an array with `pluck (rows, id) -> ...`.',
    'Sort lines with `orderBy ($.lineNo as Number)` — sorting the strings puts `"10"` before `"2"`. Convert the rows to typed lines first, then sort and sum the typed values.',
  ],
  solution: `%dw 2.0
output application/json

fun num(s, dflt: Number): Number = if (isEmpty(s)) dflt else s as Number
---
payload groupBy $.orderId pluck (rows, id) -> do {
  var first = rows[0]
  var lines = rows map (r) -> {
      lineNo: r.lineNo as Number,
      sku: r.sku,
      qty: num(r.qty, 1),
      unitPrice: num(r.unitPrice, 0)
    }
  ---
  {
    orderId: first.orderId,
    orderDate: first.orderDate,
    customer: first.customer,
    lines: lines orderBy $.lineNo,
    total: sum(lines map ($.qty * $.unitPrice))
  }
}`,
  explanation: `
This is the reverse of "explode children into rows": **group** the rows by the parent key, take parent fields from any row of the group, and map the group's rows into children.

- \`groupBy\` keeps groups in the order in which each key first appears, so \`SO-11\` comes first even though its rows are scattered.
- \`pluck\` turns the grouped object into an array of parents.
- The \`num\` helper centralizes "empty means default, otherwise coerce" — the CSV reader gives \`""\` for an empty cell, so \`r.qty default "1"\` never fires (\`""\` is not null).
- Converting first and sorting afterwards means \`orderBy $.lineNo\` compares **numbers**.

Common traps:
- \`orderBy $.lineNo\` on the raw strings gives \`1, 10, 2\`.
- A bare \`r.qty as Number\` throws on \`""\`, so a single empty cell fails the whole file.
- Computing \`total\` from the raw rows instead of the typed lines forgets the defaults (\`qty\` 1, \`unitPrice\` 0).
`,
  tests: [
    {
      name: 'Single order, all defaults and unsorted lines',
      inputs: [
        {
          name: 'payload',
          mime: 'application/csv',
          content: `orderId,orderDate,customer,lineNo,sku,qty,unitPrice
SO-7,2026-12-01,C-1,3,C,,
SO-7,2026-12-01,C-1,1,A,3,2.50
SO-7,2026-12-01,C-1,2,B,,4`,
        },
      ],
      expected:
        '[{ "orderId": "SO-7", "orderDate": "2026-12-01", "customer": "C-1", "lines": [ { "lineNo": 1, "sku": "A", "qty": 3, "unitPrice": 2.50 }, { "lineNo": 2, "sku": "B", "qty": 1, "unitPrice": 4 }, { "lineNo": 3, "sku": "C", "qty": 1, "unitPrice": 0 } ], "total": 11.5 }]',
    },
    {
      name: 'Header only',
      inputs: [{ name: 'payload', mime: 'application/csv', content: 'orderId,orderDate,customer,lineNo,sku,qty,unitPrice' }],
      expected: '[]',
    },
  ],
  followUps: [
    {
      q: 'What if the same order has different customers on different rows?',
      a: 'That is a data-quality error the ERP should not produce. Detect it with `sizeOf(rows.customer distinctBy $) > 1` and route the order to an error queue instead of silently taking the first row.',
    },
    {
      q: 'The file is 500 MB. Is groupBy still a good idea?',
      a: '`groupBy` must see every row before it can emit a group, so the whole file is held in memory. If the export can be sorted by `orderId`, process it in a streaming fashion (e.g. a Batch Job or For Each over a streamed reader) and close an order when the id changes.',
    },
    {
      q: 'Could you just write `r.qty as Number default 1`?',
      a: 'It gives the same result here: when the coercion on the left of `default` fails, `default` returns the fallback. But it also hides junk — `"abc"` silently becomes 1 — so an explicit `isEmpty` check is safer when bad data should fail loudly.',
    },
  ],
}
