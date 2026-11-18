export default {
  id: 'dw-167',
  category: 'dataweave',
  title: 'Convert a Pipe Delimited Store Inventory Snapshot and Check Its Trailer',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'azure-file-share', 'planning-platform', 'pipe-delimited', 'header-trailer', 'text/plain', 'inventory-feed', 'json'],
  estMinutes: 20,
  description: `
Larkfield Grocers stores write a nightly inventory snapshot to an Azure file share. A Mule app reads each file and loads it for the planning platform. The file is pipe delimited text with a header, detail lines and a trailer:

- \`H|sender|fileType|snapshotDate|store\`, where the date is \`yyyyMMdd\`
- \`D|store|sku|onHand|onOrder|uom\`, one per item
- \`T|recordCount|totalOnHand\`

Build JSON:

- \`store\`: from the header
- \`snapshotDate\`: the header date written as \`yyyy-MM-dd\`
- \`valid\`: \`true\` when there are no errors
- \`errors\`: a list of messages, in this order:
  - \`Missing trailer\` when there is no \`T\` line. Then no other checks run.
  - \`Trailer count X does not match Y detail records\` when the trailer count differs from the number of \`D\` lines
  - \`Trailer on hand total X does not match Y\` when the trailer total differs from the sum of \`onHand\`
- \`items\`: one per \`D\` line, in order, with \`sku\`, \`onHand\` and \`onOrder\` as numbers, and \`uom\`

Skip blank lines and spaces around a line.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'text/plain',
      content: `H|LARKFIELD|INVSNAP|20261117|0412
D|0412|SKU-10021|48|12|EA
D|0412|SKU-10022|0|24|EA
D|0412|SKU-20010|7|0|CS
T|3|55
`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "store": "0412",
  "snapshotDate": "2026-11-17",
  "valid": true,
  "errors": [],
  "items": [
    { "sku": "SKU-10021", "onHand": 48, "onOrder": 12, "uom": "EA" },
    { "sku": "SKU-10022", "onHand": 0, "onOrder": 24, "uom": "EA" },
    { "sku": "SKU-20010", "onHand": 7, "onOrder": 0, "uom": "CS" }
  ]
}`,
  },
  starterCode: `%dw 2.0
output application/json
var rows = (payload splitBy "\\n") map ($ splitBy "|")
---
{
  store: rows[0][4],
  items: rows filter ($[0] == "D")
}
`,
  hints: [
    'Split into lines, drop blank ones with `filter (trim($) != "")`, then split each trimmed line on `"|"`. A row is then a list of fields.',
    'Find the header with `(rows filter ($[0] == "H"))[0]`. When there is no match, the result is null, which is how you spot a missing trailer.',
    'Add up `onHand` with `reduce ((i, acc = 0) -> acc + i.onHand)`, which also gives 0 for an empty list.',
    'Build each error as a one item list or an empty list, then join them with `++`.',
    'Convert the date with `as Date {format: "yyyyMMdd"} as String {format: "yyyy-MM-dd"}`.',
  ],
  solution: `%dw 2.0
output application/json
var rows = ((payload splitBy "\\n") filter (trim($) != "")) map (trim($) splitBy "|")
var header = (rows filter ($[0] == "H"))[0]
var trailer = (rows filter ($[0] == "T"))[0]
var items = (rows filter ($[0] == "D")) map (r) -> {
  sku: r[2],
  onHand: r[3] as Number,
  onOrder: r[4] as Number,
  uom: r[5]
}
var count = sizeOf(items)
var totalOnHand = items reduce ((i, acc = 0) -> acc + i.onHand)
var errors =
  if (trailer == null) ["Missing trailer"]
  else (
    (if ((trailer[1] as Number) != count) ["Trailer count $(trailer[1]) does not match $(count) detail records"] else [])
    ++ (if ((trailer[2] as Number) != totalOnHand) ["Trailer on hand total $(trailer[2]) does not match $(totalOnHand)"] else [])
  )
---
{
  store: header[4],
  snapshotDate: header[3] as Date {format: "yyyyMMdd"} as String {format: "yyyy-MM-dd"},
  valid: isEmpty(errors),
  errors: errors,
  items: items
}`,
  explanation: `
**Rows as lists.** Each line becomes a list of fields, and the first field says what kind of record it is. Filtering by that field gives the header, the details and the trailer, wherever they sit in the file.

**The trailer as a contract.** The writer puts the count and total it meant to write in the trailer. If the file was cut short, or a line was lost, the numbers do not match. A missing trailer is the clearest sign of a half written file, so the other checks are skipped.

**Errors as a list.** Each check gives a list with one message or an empty list. Joining them keeps the order fixed and lets one file report several problems at once. \`valid\` is then a plain test on the list.

**Numbers from text.** Every field in a text file is a string. \`onHand\` and \`onOrder\` become numbers once, so the sum and the output both use real numbers.
`,
  tests: [
    {
      name: 'Cut short: trailer counts do not match',
      inputs: [
        {
          name: 'payload',
          mime: 'text/plain',
          content: 'H|LARKFIELD|INVSNAP|20261117|0415\nD|0415|SKU-10021|30|0|EA\nT|2|42\n',
        },
      ],
      expected:
        '{ "store": "0415", "snapshotDate": "2026-11-17", "valid": false, "errors": ["Trailer count 2 does not match 1 detail records", "Trailer on hand total 42 does not match 30"], "items": [{ "sku": "SKU-10021", "onHand": 30, "onOrder": 0, "uom": "EA" }] }',
    },
    {
      name: 'No trailer and a blank line',
      inputs: [
        {
          name: 'payload',
          mime: 'text/plain',
          content: 'H|LARKFIELD|INVSNAP|20261116|0419\n\nD|0419|SKU-30001|5|5|EA\n',
        },
      ],
      expected:
        '{ "store": "0419", "snapshotDate": "2026-11-16", "valid": false, "errors": ["Missing trailer"], "items": [{ "sku": "SKU-30001", "onHand": 5, "onOrder": 5, "uom": "EA" }] }',
    },
  ],
  followUps: [
    {
      q: 'Should a file that fails the trailer check be sent to the planning platform?',
      a: 'No. Hold it, alert, and wait for a resend. A partial snapshot shows items as out of stock and drives wrong orders.',
    },
    {
      q: 'What other check would you add?',
      a: 'That every detail line has the same store as the header, and that the header date is the expected business date.',
    },
    {
      q: 'The file has 2 million lines. What changes?',
      a: 'Read it as a stream, and check the counts with a running total. Holding every row in a list for the checks will not scale.',
    },
  ],
}
