export default {
  id: 'dw-072',
  category: 'dataweave',
  title: 'Nest a Flat Database Join into Orders with Lines',
  level: 'INTERMEDIATE',
  tags: ['database', 'oracle', 'sql-server', 'json', 'groupBy', 'pluck', 'orderBy'],
  estMinutes: 30,
  description: `
A Mule system API reads open and recent orders from the ERP database with a single \`db:select\` (Oracle in production, SQL Server in the DR site):

\`\`\`sql
SELECT o.ORDER_ID, o.ORDER_DATE, o.CUSTOMER_NO, o.STATUS,
       l.LINE_NO, l.SKU, l.QTY, l.UNIT_PRICE
FROM ORDERS o LEFT JOIN ORDER_LINES l ON l.ORDER_ID = o.ORDER_ID
WHERE o.ORDER_DATE >= :fromDate
\`\`\`

**The result set**
- It is a **flat** array of rows with **uppercase** column names.
- There is one row per order line, with the order columns repeated on every row.
- An order without lines appears once with all line columns \`null\` (left join).
- The rows come back in no particular order.

**Output**: an array of orders, sorted by \`orderId\` (numerically):
- \`orderId\`, \`orderDate\` (the date part only, \`yyyy-MM-dd\`), \`customerNo\`, \`status\`
- \`lineCount\` and \`total\` (sum of the line amounts, \`0\` without lines)
- \`lines\` sorted by \`lineNo\`, each \`{ lineNo, sku, qty, unitPrice, amount }\` where \`amount = qty * unitPrice\`; an order without lines has \`lines: []\`.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `[
  { "ORDER_ID": 50012, "ORDER_DATE": "2026-10-28T09:15:00", "CUSTOMER_NO": "C-1009", "STATUS": "OPEN", "LINE_NO": 2, "SKU": "PUMP-220", "QTY": 1, "UNIT_PRICE": 489.00 },
  { "ORDER_ID": 50011, "ORDER_DATE": "2026-10-27T16:40:00", "CUSTOMER_NO": "C-1004", "STATUS": "SHIPPED", "LINE_NO": 1, "SKU": "HOSE-12", "QTY": 20, "UNIT_PRICE": 3.75 },
  { "ORDER_ID": 50012, "ORDER_DATE": "2026-10-28T09:15:00", "CUSTOMER_NO": "C-1009", "STATUS": "OPEN", "LINE_NO": 1, "SKU": "VALVE-15", "QTY": 4, "UNIT_PRICE": 12.50 },
  { "ORDER_ID": 50013, "ORDER_DATE": "2026-10-29T08:02:00", "CUSTOMER_NO": "C-1020", "STATUS": "CANCELLED", "LINE_NO": null, "SKU": null, "QTY": null, "UNIT_PRICE": null },
  { "ORDER_ID": 50011, "ORDER_DATE": "2026-10-27T16:40:00", "CUSTOMER_NO": "C-1004", "STATUS": "SHIPPED", "LINE_NO": 2, "SKU": "CLAMP-08", "QTY": 40, "UNIT_PRICE": 0.95 }
]`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `[
  {
    "orderId": 50011, "orderDate": "2026-10-27", "customerNo": "C-1004", "status": "SHIPPED",
    "lineCount": 2, "total": 113.00,
    "lines": [
      { "lineNo": 1, "sku": "HOSE-12", "qty": 20, "unitPrice": 3.75, "amount": 75.00 },
      { "lineNo": 2, "sku": "CLAMP-08", "qty": 40, "unitPrice": 0.95, "amount": 38.00 }
    ]
  },
  {
    "orderId": 50012, "orderDate": "2026-10-28", "customerNo": "C-1009", "status": "OPEN",
    "lineCount": 2, "total": 539.00,
    "lines": [
      { "lineNo": 1, "sku": "VALVE-15", "qty": 4, "unitPrice": 12.50, "amount": 50.00 },
      { "lineNo": 2, "sku": "PUMP-220", "qty": 1, "unitPrice": 489.00, "amount": 489.00 }
    ]
  },
  {
    "orderId": 50013, "orderDate": "2026-10-29", "customerNo": "C-1020", "status": "CANCELLED",
    "lineCount": 0, "total": 0,
    "lines": []
  }
]`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload groupBy $.ORDER_ID
`,
  hints: [
    '`groupBy $.ORDER_ID` returns an **object** whose keys are the order ids (as strings) and whose values are the rows of that order.',
    '`pluck (rows, id) -> ...` turns that object back into an array — one element per order. Take the order columns from `rows[0]`.',
    'Drop the left-join placeholder row with `filter ($.LINE_NO != null)` before mapping the lines; `sum([])` is `0`.',
    'Sort the orders by the numeric `ORDER_ID` from the row, not by the group key: keys are strings, and `"9998"` sorts after `"10001"`. Wrap the whole `pluck` expression in parentheses before `orderBy`, otherwise `orderBy` becomes part of the lambda body.',
    'Date part: `row.ORDER_DATE as LocalDateTime as String { format: "yyyy-MM-dd" }`.',
  ],
  solution: `%dw 2.0
output application/json
---
((payload groupBy $.ORDER_ID) pluck (rows, id) -> do {
  var h = rows[0]
  var lines = (rows filter ($.LINE_NO != null)) orderBy $.LINE_NO map (r) -> {
    lineNo: r.LINE_NO,
    sku: r.SKU,
    qty: r.QTY,
    unitPrice: r.UNIT_PRICE,
    amount: r.QTY * r.UNIT_PRICE
  }
  ---
  {
    orderId: h.ORDER_ID,
    orderDate: h.ORDER_DATE as LocalDateTime as String { format: "yyyy-MM-dd" },
    customerNo: h.CUSTOMER_NO,
    status: h.STATUS,
    lineCount: sizeOf(lines),
    total: sum(lines map $.amount),
    lines: lines
  }
}) orderBy $.orderId`,
  explanation: `
**Why a join returns flat rows.** SQL result sets are tables: the one-to-many relation between ORDERS and ORDER_LINES comes back as one row per line with the header columns repeated. Turning it into a document is a classic DataWeave job: \`groupBy\` collects the rows per order, \`pluck\` turns the groups into an array, and the header fields are taken from the first row of each group.

**Left join placeholders.** An order without lines still produces one row, with \`null\` in all line columns. Filtering on \`LINE_NO != null\` turns that into an empty \`lines\` array instead of a line full of nulls — and \`sum([])\` gives \`0\`.

**Ordering.** A database returns rows in an undefined order unless the query has \`ORDER BY\`, and \`groupBy\` produces an object, so the script sorts explicitly: lines by \`LINE_NO\`, orders by the **numeric** \`orderId\`. Sorting by the group key would sort strings.

**Column names.** Oracle returns unquoted identifiers in uppercase; SQL Server returns them as written in the query. Mapping to camelCase in one place keeps the API contract independent of the database. In a real flow the date columns arrive as date/timestamp values rather than strings; the coercion here works on the ISO text from the sample.

**One query vs. N+1.** One joined query is much cheaper than selecting the orders and then calling \`db:select\` for the lines of every order inside a For Each.
`,
  tests: [
    {
      name: 'Numeric order ids sort numerically; lines out of order',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content:
            '[ { "ORDER_ID": 10001, "ORDER_DATE": "2026-11-01T10:00:00", "CUSTOMER_NO": "C-1", "STATUS": "OPEN", "LINE_NO": 3, "SKU": "C", "QTY": 1, "UNIT_PRICE": 1.10 }, { "ORDER_ID": 9998, "ORDER_DATE": "2026-10-31T23:59:59", "CUSTOMER_NO": "C-2", "STATUS": "OPEN", "LINE_NO": 1, "SKU": "X", "QTY": 3, "UNIT_PRICE": 2.00 }, { "ORDER_ID": 10001, "ORDER_DATE": "2026-11-01T10:00:00", "CUSTOMER_NO": "C-1", "STATUS": "OPEN", "LINE_NO": 1, "SKU": "A", "QTY": 2, "UNIT_PRICE": 5.00 }, { "ORDER_ID": 10001, "ORDER_DATE": "2026-11-01T10:00:00", "CUSTOMER_NO": "C-1", "STATUS": "OPEN", "LINE_NO": 2, "SKU": "B", "QTY": 1, "UNIT_PRICE": 0.40 } ]',
        },
      ],
      expected:
        '[ { "orderId": 9998, "orderDate": "2026-10-31", "customerNo": "C-2", "status": "OPEN", "lineCount": 1, "total": 6.00, "lines": [ { "lineNo": 1, "sku": "X", "qty": 3, "unitPrice": 2.00, "amount": 6.00 } ] }, { "orderId": 10001, "orderDate": "2026-11-01", "customerNo": "C-1", "status": "OPEN", "lineCount": 3, "total": 11.50, "lines": [ { "lineNo": 1, "sku": "A", "qty": 2, "unitPrice": 5.00, "amount": 10.00 }, { "lineNo": 2, "sku": "B", "qty": 1, "unitPrice": 0.40, "amount": 0.40 }, { "lineNo": 3, "sku": "C", "qty": 1, "unitPrice": 1.10, "amount": 1.10 } ] } ]',
    },
    {
      name: 'Empty result set',
      inputs: [{ name: 'payload', mime: 'application/json', content: '[]' }],
      expected: '[]',
    },
  ],
  followUps: [
    {
      q: 'The query returns 500,000 rows. What is the risk with this script?',
      a: '`groupBy` needs all rows in memory. Options: page the query (`FETCH FIRST n ROWS ONLY` / `OFFSET` in Oracle 12c+, `TOP`/`OFFSET FETCH` in SQL Server), process per order range, or sort by ORDER_ID in SQL and stream, emitting an order each time the id changes.',
    },
    {
      q: 'How do you pass `fromDate` to the query safely?',
      a: 'As a named parameter: `:fromDate` in the SQL and `{ fromDate: ... }` in `db:input-parameters`. Never concatenate values into the SQL text — that opens the door to SQL injection and prevents statement reuse.',
    },
  ],
}
