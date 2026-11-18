export default {
  id: 'dw-191',
  category: 'dataweave',
  title: 'Summarise Reject Rows for an Email: Counts by Reason and a Link, Not a Large Attachment',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'email', 'rejects', 'reports', 'groupBy', 'json'],
  estMinutes: 22,
  description: `
Larkfield Grocers emails the buying team about rejected item rows after each load. Attaching every reject made some mails too large, so the email now carries a summary and a link to the full reject file. The flow reads the reject rows for the run from Oracle into \`payload\`.

Build:

- \`subject\`: \`Item load RUN_ID: N rejects in FILE\`, with \`reject\` when N is 1
- \`totalRejects\`
- \`byReason\`: one entry per \`REASON_TEXT\` with \`reason\`, \`count\` and \`examples\`, up to 3 item IDs in line order, each ID once. Sort by count, highest first. On a tie, sort by reason A to Z.
- \`attachCsv\`: \`true\` only when there is at least one reject and the total is at most \`vars.attachLimitRows\`
- \`link\`: \`vars.reportUrl\` with \`?run=\` and the run ID

The rows come from the database in no fixed order.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `[
  { "LINE_NO": 3, "ITEM_ID": "ST-050", "REASON_TEXT": "Unknown supplier" },
  { "LINE_NO": 1, "ITEM_ID": "BK-100", "REASON_TEXT": "Unknown supplier" },
  { "LINE_NO": 2, "ITEM_ID": "TN-220", "REASON_TEXT": "Missing barcode" },
  { "LINE_NO": 4, "ITEM_ID": "LT-310", "REASON_TEXT": "Cost is zero" },
  { "LINE_NO": 5, "ITEM_ID": "MT-410", "REASON_TEXT": "Unknown supplier" },
  { "LINE_NO": 6, "ITEM_ID": "CK-500", "REASON_TEXT": "Missing barcode" },
  { "LINE_NO": 7, "ITEM_ID": "BK-100", "REASON_TEXT": "Unknown supplier" },
  { "LINE_NO": 8, "ITEM_ID": "PL-610", "REASON_TEXT": "Unknown supplier" },
  { "LINE_NO": 9, "ITEM_ID": "PL-620", "REASON_TEXT": "Cost is zero" }
]`,
    },
    {
      name: 'vars',
      mime: 'application/json',
      content: `{
  "runId": 9001,
  "fileName": "items_20261118.json",
  "attachLimitRows": 5,
  "reportUrl": "https://reports.larkfield.example/rejects"
}`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "subject": "Item load 9001: 9 rejects in items_20261118.json",
  "totalRejects": 9,
  "byReason": [
    { "reason": "Unknown supplier", "count": 5, "examples": ["BK-100", "ST-050", "MT-410"] },
    { "reason": "Cost is zero", "count": 2, "examples": ["LT-310", "PL-620"] },
    { "reason": "Missing barcode", "count": 2, "examples": ["TN-220", "CK-500"] }
  ],
  "attachCsv": false,
  "link": "https://reports.larkfield.example/rejects?run=9001"
}`,
  },
  starterCode: `%dw 2.0
output application/json
---
{
  totalRejects: sizeOf(payload),
  byReason: payload groupBy (r) -> r.REASON_TEXT
}
`,
  hints: [
    '`groupBy` gives an object of lists. `pluck (rows, reason) -> {...}` turns it into a list of entries.',
    'For examples: sort the rows by `LINE_NO`, take the item IDs, `distinctBy`, then keep the first three with `filter (id, i) -> i < 3`.',
    'Sort twice: first by reason, then by `-count`. `orderBy` keeps the order of equal values, so ties stay A to Z.',
    'Pick the word with `if (total == 1) "reject" else "rejects"`.',
  ],
  solution: `%dw 2.0
output application/json

var total = sizeOf(payload)

var summary = (payload groupBy (r) -> r.REASON_TEXT) pluck (rows, reason) -> {
  reason: reason as String,
  count: sizeOf(rows),
  examples: (((rows orderBy (r) -> r.LINE_NO) map (r) -> r.ITEM_ID) distinctBy (id) -> id)
    filter (id, i) -> i < 3
}
---
{
  subject: "Item load $(vars.runId): $(total) "
    ++ (if (total == 1) "reject" else "rejects")
    ++ " in $(vars.fileName)",
  totalRejects: total,
  byReason: (summary orderBy (s) -> s.reason) orderBy (s) -> -s.count,
  attachCsv: total > 0 and total <= vars.attachLimitRows,
  link: vars.reportUrl ++ "?run=$(vars.runId)"
}`,
  explanation: `
**What to fix first.** Sorting by count puts the biggest problem at the top. The buying team sees that one unknown supplier causes most rejects.

**Examples, not everything.** Three item IDs per reason are enough to start looking. The same item rejected twice appears once. The full list sits behind the link.

**Stable sort for ties.** Sorting by reason first and by count second gives a fixed order for equal counts, because \`orderBy\` keeps equal values in place. The same rejects always give the same mail.

**Attach only when small.** A limit in a property decides between attaching the CSV and linking only. Base64 makes attachments about a third larger, so large files belong behind a link with access control.

**Grammar matters a little.** "1 rejects" looks careless in a mail the business reads every day.
`,
  tests: [
    {
      name: 'One reject, small enough to attach',
      inputs: [
        { name: 'payload', mime: 'application/json', content: '[{ "LINE_NO": 12, "ITEM_ID": "EG-120", "REASON_TEXT": "Missing barcode" }]' },
        {
          name: 'vars',
          mime: 'application/json',
          content: '{ "runId": 9020, "fileName": "items_20261119.json", "attachLimitRows": 5, "reportUrl": "https://reports.larkfield.example/rejects" }',
        },
      ],
      expected:
        '{ "subject": "Item load 9020: 1 reject in items_20261119.json", "totalRejects": 1, "byReason": [{ "reason": "Missing barcode", "count": 1, "examples": ["EG-120"] }], "attachCsv": true, "link": "https://reports.larkfield.example/rejects?run=9020" }',
    },
    {
      name: 'No rejects',
      inputs: [
        { name: 'payload', mime: 'application/json', content: '[]' },
        {
          name: 'vars',
          mime: 'application/json',
          content: '{ "runId": 9021, "fileName": "items_20261119b.json", "attachLimitRows": 5, "reportUrl": "https://reports.larkfield.example/rejects" }',
        },
      ],
      expected:
        '{ "subject": "Item load 9021: 0 rejects in items_20261119b.json", "totalRejects": 0, "byReason": [], "attachCsv": false, "link": "https://reports.larkfield.example/rejects?run=9021" }',
    },
  ],
  followUps: [
    {
      q: 'Why build the summary in DataWeave rather than SQL?',
      a: 'A GROUP BY in Oracle works well too and moves less data. With many thousands of rejects, count in SQL and fetch only the examples.',
    },
    {
      q: 'Could item IDs in the mail be a privacy problem?',
      a: 'Item IDs are business data, not personal data. For customer or employee records, show internal keys only and keep details behind the link.',
    },
    {
      q: 'How would you render byReason in the email?',
      a: 'As a short HTML table or plain lines, with values escaped if HTML is used.',
    },
  ],
}
