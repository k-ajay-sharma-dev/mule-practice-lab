export default {
  id: 'dw-201',
  category: 'dataweave',
  title: 'Plan Part Files for a Large Feed to the Planning Platform',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'large-files', 'planning-platform', 'split-files', 'part-files', 'json'],
  estMinutes: 20,
  description: `
Brindle Outdoor sends daily sales to the planning platform as CSV files. The platform accepts parts up to a row limit and a byte limit, so a large feed is split. Before writing, the flow plans the parts from the row count and the byte count of the extract.

\`payload\` holds \`feed\`, \`businessDate\` (\`YYYY-MM-DD\`), \`totalRows\` and \`totalBytes\`. \`vars\` holds \`maxPartRows\` and \`maxPartBytes\`.

**Rules**
- The part count is the larger of \`ceil(totalRows / maxPartRows)\` and \`ceil(totalBytes / maxPartBytes)\`, but never more than \`totalRows\` and never less than 1.
- Spread rows evenly: every part gets \`floor(totalRows / partCount)\` rows, and the first \`totalRows mod partCount\` parts get one more.
- \`skipRows\` is the number of rows before the part.
- File names: \`FEED_YYYYMMDD_PNNN_OF_MMM.csv\`, with 3 digit numbers.
- \`controlFile\`: \`FEED_YYYYMMDD.ctl\`.

Output \`partCount\`, \`controlFile\` and \`parts\` with \`partNo\`, \`fileName\`, \`skipRows\` and \`rows\`.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{ "feed": "SALES", "businessDate": "2026-11-18", "totalRows": 2450000, "totalBytes": 612000000 }`,
    },
    {
      name: 'vars',
      mime: 'application/json',
      content: `{ "maxPartRows": 1000000, "maxPartBytes": 250000000 }`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "partCount": 3,
  "controlFile": "SALES_20261118.ctl",
  "parts": [
    { "partNo": 1, "fileName": "SALES_20261118_P001_OF_003.csv", "skipRows": 0, "rows": 816667 },
    { "partNo": 2, "fileName": "SALES_20261118_P002_OF_003.csv", "skipRows": 816667, "rows": 816667 },
    { "partNo": 3, "fileName": "SALES_20261118_P003_OF_003.csv", "skipRows": 1633334, "rows": 816666 }
  ]
}`,
  },
  starterCode: `%dw 2.0
output application/json
var partCount = ceil(payload.totalRows / vars.maxPartRows)
---
{
  partCount: partCount
}
`,
  hints: [
    '`max([a, b])` and `min([a, b])` take a list.',
    '`floor(total / n)` is the base size and `total mod n` the number of parts that get one extra row.',
    'Rows before part i: `(i - 1) * base + min([i - 1, extra])`.',
    'Pad numbers with `i as String { format: "000" }`.',
  ],
  solution: `%dw 2.0
output application/json

var total = payload.totalRows
var byRows = ceil(total / vars.maxPartRows)
var byBytes = ceil(payload.totalBytes / vars.maxPartBytes)
var partCount = max([1, min([total, max([byRows, byBytes])])])
var base = floor(total / partCount)
var extra = total mod partCount
var stem = payload.feed ++ "_" ++ (payload.businessDate replace "-" with "")

fun pad(n) = n as String { format: "000" }
---
{
  partCount: partCount,
  controlFile: stem ++ ".ctl",
  parts: (1 to partCount) map (i) -> {
    partNo: i,
    fileName: stem ++ "_P" ++ pad(i) ++ "_OF_" ++ pad(partCount) ++ ".csv",
    skipRows: (i - 1) * base + min([i - 1, extra]),
    rows: base + (if (i <= extra) 1 else 0)
  }
}`,
  explanation: `
**Both limits count.** Wide rows can break the byte limit long before the row limit. Taking the larger part count keeps every part under both.

**Even parts.** Spreading the remainder over the first parts gives parts that differ by at most one row. No tiny last part, and no part with zero rows.

**Names that tell the story.** "P002_OF_003" lets the receiver check it has every part before it starts. The control file lists them all.

**An empty day still sends a file.** One part with zero rows tells the platform the feed ran and had no data, which differs from a feed that never came.
`,
  tests: [
    {
      name: 'Bytes decide the count',
      inputs: [
        { name: 'payload', mime: 'application/json', content: '{ "feed": "ONHAND", "businessDate": "2026-11-19", "totalRows": 10, "totalBytes": 1000000000 }' },
        { name: 'vars', mime: 'application/json', content: '{ "maxPartRows": 1000000, "maxPartBytes": 250000000 }' },
      ],
      expected:
        '{ "partCount": 4, "controlFile": "ONHAND_20261119.ctl", "parts": [{ "partNo": 1, "fileName": "ONHAND_20261119_P001_OF_004.csv", "skipRows": 0, "rows": 3 }, { "partNo": 2, "fileName": "ONHAND_20261119_P002_OF_004.csv", "skipRows": 3, "rows": 3 }, { "partNo": 3, "fileName": "ONHAND_20261119_P003_OF_004.csv", "skipRows": 6, "rows": 2 }, { "partNo": 4, "fileName": "ONHAND_20261119_P004_OF_004.csv", "skipRows": 8, "rows": 2 }] }',
    },
    {
      name: 'No rows today',
      inputs: [
        { name: 'payload', mime: 'application/json', content: '{ "feed": "RECEIPTS", "businessDate": "2026-11-19", "totalRows": 0, "totalBytes": 0 }' },
        { name: 'vars', mime: 'application/json', content: '{ "maxPartRows": 1000000, "maxPartBytes": 250000000 }' },
      ],
      expected:
        '{ "partCount": 1, "controlFile": "RECEIPTS_20261119.ctl", "parts": [{ "partNo": 1, "fileName": "RECEIPTS_20261119_P001_OF_001.csv", "skipRows": 0, "rows": 0 }] }',
    },
  ],
  followUps: [
    {
      q: 'Where do totalRows and totalBytes come from before the file exists?',
      a: 'From a COUNT query on the extract and an average row size, or from a first pass that writes a temporary file and measures it.',
    },
    {
      q: 'Does each part repeat the CSV header?',
      a: 'Usually yes, so each part is a valid file. Confirm the rule with the receiving platform team.',
    },
    {
      q: 'Why plan parts from counts instead of cutting when a size is reached?',
      a: 'The names need the part total up front. Planning first also lets the flow write parts in parallel.',
    },
  ],
}
