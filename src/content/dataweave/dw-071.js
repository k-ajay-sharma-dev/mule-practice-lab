export default {
  id: 'dw-071',
  category: 'dataweave',
  title: 'Validate an SFTP Order CSV into Accepted and Rejected Rows',
  level: 'ADVANCED',
  tags: ['csv', 'json', 'sftp', 'ftp', 'validation', 'type-conversion', 'try'],
  estMinutes: 30,
  description: `
A wholesale customer uploads a daily order file to an SFTP folder. A Mule flow reads it with \`sftp:read\` as \`application/csv\`.

The file has a header row and a comma separator. Fields with commas or quotes are enclosed in double quotes.

Bad rows must **not** stop the batch. Valid rows go to the order API, and invalid rows are reported back to the customer.

**Validation, in this order.** A row is rejected with the reason of the first failing check:
1. \`orderDate\` must convert to a Date with the format \`yyyy-MM-dd\` → \`INVALID_DATE\`
2. \`amount\` must be a decimal with a dot and at most 2 decimals (e.g. \`75\`, \`75.5\`, \`149.90\`) → \`INVALID_AMOUNT\`
3. \`qty\` must be a whole number greater than 0 → \`INVALID_QTY\`

**Accepted row** → \`orderId\`, \`customer\` (trimmed), \`orderDate\`, \`amount\` and \`qty\` as numbers, \`priority\` (\`true\` only for \`Y\`; \`N\` or empty is \`false\`).

**Rejected row** → \`line\` (the line number in the file; the header is line 1), \`orderId\`, \`reason\`.

**Output** → \`summary\` (\`received\`, \`accepted\`, \`rejected\`), \`accepted\`, \`rejected\`, both in file order.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/csv',
      content: `orderId,customer,orderDate,amount,qty,priority
SO-1001,"Jansen, P.",2026-10-30,149.90,3,Y
SO-1002,Smit BV,30/10/2026,20.00,1,N
SO-1003,"Bakker ""Fresh"" Foods",2026-10-31,1.250.00,2,N
SO-1004,De Groot Techniek,2026-10-31,75.5,,N
SO-1005, Visser & Zn ,2026-11-01,310,12,`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "summary": { "received": 5, "accepted": 2, "rejected": 3 },
  "accepted": [
    { "orderId": "SO-1001", "customer": "Jansen, P.", "orderDate": "2026-10-30", "amount": 149.90, "qty": 3, "priority": true },
    { "orderId": "SO-1005", "customer": "Visser & Zn", "orderDate": "2026-11-01", "amount": 310, "qty": 12, "priority": false }
  ],
  "rejected": [
    { "line": 3, "orderId": "SO-1002", "reason": "INVALID_DATE" },
    { "line": 4, "orderId": "SO-1003", "reason": "INVALID_AMOUNT" },
    { "line": 5, "orderId": "SO-1004", "reason": "INVALID_QTY" }
  ]
}`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload
`,
  hints: [
    'Every CSV value is a **String** (an empty field is `""`), so validate with regular expressions before converting: `s matches /^\\d+(\\.\\d{1,2})?$/`.',
    'A regex accepts `2026-13-45`. Use `try` from `dw::Runtime` to check that the value really converts: `try(() -> s as Date { format: "yyyy-MM-dd" }).success`. It rejects month 13, but a day past the end of a month, such as `2026-02-31`, is adjusted to the last valid day rather than failing.',
    'Map each row to `{ row, line, reason }` where `reason` is `null` for valid rows, then split with `filter`.',
    'The line number is `index + 2`: the index is 0-based and line 1 is the header.',
  ],
  solution: `%dw 2.0
output application/json
import try from dw::Runtime
fun validDate(s) = (s matches /^\\d{4}-\\d{2}-\\d{2}$/)
  and try(() -> s as Date { format: "yyyy-MM-dd" }).success
fun reasonFor(r) =
  if (not validDate(r.orderDate default "")) "INVALID_DATE"
  else if (not ((r.amount default "") matches /^\\d+(\\.\\d{1,2})?$/)) "INVALID_AMOUNT"
  else if (not ((r.qty default "") matches /^[1-9]\\d*$/)) "INVALID_QTY"
  else null
var checked = payload map (r, i) -> { row: r, line: i + 2, reason: reasonFor(r) }
var ok = checked filter ($.reason == null)
var bad = checked filter ($.reason != null)
---
{
  summary: { received: sizeOf(checked), accepted: sizeOf(ok), rejected: sizeOf(bad) },
  accepted: ok map (c) -> {
    orderId: c.row.orderId,
    customer: trim(c.row.customer),
    orderDate: c.row.orderDate as Date { format: "yyyy-MM-dd" },
    amount: c.row.amount as Number,
    qty: c.row.qty as Number,
    priority: c.row.priority == "Y"
  },
  rejected: bad map (c) -> { line: c.line, orderId: c.row.orderId, reason: c.reason }
}`,
  explanation: `
**Everything in a CSV is text.** The CSV reader does not infer types: \`149.90\`, \`3\` and an empty field all arrive as strings. Converting blindly with \`as Number\` would fail the whole file on \`1.250.00\` (a European thousands separator that slipped in). Validating first and converting only valid rows lets the good orders through.

**Regex + \`try\` for dates.** The regex checks the shape, \`try\` checks that the value is an actual date: a month of 13 matches \`\\d{2}\` but cannot be converted. \`try\` returns \`{ success, result | error }\` instead of throwing, which is the DataWeave way to test a conversion.

**Quoted fields.** \`"Jansen, P."\` contains the separator and \`"Bakker ""Fresh"" Foods"\` contains doubled quotes; the CSV reader unquotes both, so the mapping never sees the quoting. Never split CSV lines on commas yourself.

**First failing reason.** The \`if / else if\` chain stops at the first failing check, which keeps the rejection report short and deterministic. Keeping the original row next to the reason means the accepted and rejected lists are built from one pass of validation.

**Line numbers.** Reporting \`line\` (index + 2) lets the customer find the row in the file they sent — far more useful than an internal index.
`,
  tests: [
    {
      name: 'Impossible date, negative and zero values',
      inputs: [
        {
          name: 'payload',
          mime: 'application/csv',
          content: `orderId,customer,orderDate,amount,qty,priority
SO-2001,Meijer Groothandel,2026-13-01,10.00,1,N
SO-2002,Meijer Groothandel,2026-11-02,-5.00,1,N
SO-2003,Meijer Groothandel,2026-11-02,5.005,1,N
SO-2004,Meijer Groothandel,2026-11-02,5.00,0,Y
SO-2005,"Meijer Groothandel",2026-11-02,0.99,040,Y`,
        },
      ],
      expected:
        '{ "summary": { "received": 5, "accepted": 0, "rejected": 5 }, "accepted": [], "rejected": [ { "line": 2, "orderId": "SO-2001", "reason": "INVALID_DATE" }, { "line": 3, "orderId": "SO-2002", "reason": "INVALID_AMOUNT" }, { "line": 4, "orderId": "SO-2003", "reason": "INVALID_AMOUNT" }, { "line": 5, "orderId": "SO-2004", "reason": "INVALID_QTY" }, { "line": 6, "orderId": "SO-2005", "reason": "INVALID_QTY" } ] }',
    },
    {
      name: 'All rows valid',
      inputs: [
        {
          name: 'payload',
          mime: 'application/csv',
          content: `orderId,customer,orderDate,amount,qty,priority
SO-3001,"Kok, Kok & Co",2026-02-28,1200,100,Y`,
        },
      ],
      expected:
        '{ "summary": { "received": 1, "accepted": 1, "rejected": 0 }, "accepted": [ { "orderId": "SO-3001", "customer": "Kok, Kok & Co", "orderDate": "2026-02-28", "amount": 1200, "qty": 100, "priority": true } ], "rejected": [] }',
    },
  ],
  followUps: [
    {
      q: 'The file is 2 GB. What changes in the flow and the script?',
      a: 'Read the file as a stream and avoid operations that need the whole document at once (`sizeOf`, two `filter` passes over the same data). Common designs are a Batch Job or a For Each over CSV records with streaming enabled (`streaming=true` reader property). They write accepted and rejected records to separate outputs and compute the summary with aggregators.',
    },
    {
      q: 'How do you make sure the same file is not processed twice?',
      a: 'After processing, move it with `sftp:move` to an archive folder (or rename it), and on a listener use `moveToDirectory`/`autoDelete` or a watermark. In a cluster, run the listener on the primary node only.',
    },
  ],
}
