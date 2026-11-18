export default {
  id: 'dw-195',
  category: 'dataweave',
  title: 'Split Staging Rows Into Fixed Size Blocks With a Log Line per Block',
  level: 'BEGINNER',
  tags: ['myproject', 'batch', 'block-size', 'staging', 'logging', 'divideBy', 'json'],
  estMinutes: 12,
  description: `
Brindle Outdoor loads item rows into an Oracle staging table in blocks. The block size comes from a property, like the size of a batch aggregator. Support wants one log line per block that names the staging table, so support can find a failed block in the logs.

The rows are in \`payload\` in line order. \`vars.blockSize\` holds the block size and \`vars.tableName\` the staging table.

Build one entry per block with:

- \`block\`: the block number, from 1
- \`table\`: the staging table name
- \`rows\`: the number of rows in the block
- \`firstLine\` and \`lastLine\`: the \`LINE_NO\` of the first and last row in the block
- \`logLine\`: \`Block N of TOTAL to TABLE: R rows\`, with \`row\` when R is 1

No rows gives an empty list.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `[
  { "LINE_NO": 1, "ITEM_ID": "TN-220" },
  { "LINE_NO": 2, "ITEM_ID": "BK-100" },
  { "LINE_NO": 3, "ITEM_ID": "ST-050" },
  { "LINE_NO": 4, "ITEM_ID": "LT-310" },
  { "LINE_NO": 5, "ITEM_ID": "MT-410" },
  { "LINE_NO": 6, "ITEM_ID": "CK-500" },
  { "LINE_NO": 7, "ITEM_ID": "PL-610" }
]`,
    },
    {
      name: 'vars',
      mime: 'application/json',
      content: `{ "blockSize": 3, "tableName": "STG_ITEM" }`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `[
  { "block": 1, "table": "STG_ITEM", "rows": 3, "firstLine": 1, "lastLine": 3, "logLine": "Block 1 of 3 to STG_ITEM: 3 rows" },
  { "block": 2, "table": "STG_ITEM", "rows": 3, "firstLine": 4, "lastLine": 6, "logLine": "Block 2 of 3 to STG_ITEM: 3 rows" },
  { "block": 3, "table": "STG_ITEM", "rows": 1, "firstLine": 7, "lastLine": 7, "logLine": "Block 3 of 3 to STG_ITEM: 1 row" }
]`,
  },
  starterCode: `%dw 2.0
import divideBy from dw::core::Arrays
output application/json
---
payload divideBy vars.blockSize
`,
  hints: [
    '`divideBy` from `dw::core::Arrays` cuts a list into lists of a given size. The last one may be shorter.',
    'Count the blocks once in a `var`, so each log line can say "of TOTAL".',
    '`b[0]` is the first row of a block and `b[-1]` the last.',
  ],
  solution: `%dw 2.0
import divideBy from dw::core::Arrays
output application/json

var blocks = payload divideBy vars.blockSize
var total = sizeOf(blocks)
---
blocks map (b, i) -> {
  block: i + 1,
  table: vars.tableName,
  rows: sizeOf(b),
  firstLine: b[0].LINE_NO,
  lastLine: b[-1].LINE_NO,
  logLine: "Block $(i + 1) of $(total) to $(vars.tableName): $(sizeOf(b)) "
    ++ (if (sizeOf(b) == 1) "row" else "rows")
}`,
  explanation: `
**Blocks like an aggregator.** \`divideBy\` gives the same shape a fixed size batch aggregator gives: full blocks, then one shorter block at the end.

**Find a bad block fast.** A log line with the block number, table and line range lets support go from an ORA error to the rows that caused it.

**Size from a property.** Keeping the size in \`vars\` (set from a property) lets the team tune it per environment without a code change.
`,
  tests: [
    {
      name: 'Rows fill the blocks exactly',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '[{ "LINE_NO": 10, "ITEM_ID": "A1" }, { "LINE_NO": 11, "ITEM_ID": "A2" }, { "LINE_NO": 12, "ITEM_ID": "A3" }, { "LINE_NO": 13, "ITEM_ID": "A4" }]',
        },
        { name: 'vars', mime: 'application/json', content: '{ "blockSize": 2, "tableName": "STG_BARCODE" }' },
      ],
      expected:
        '[{ "block": 1, "table": "STG_BARCODE", "rows": 2, "firstLine": 10, "lastLine": 11, "logLine": "Block 1 of 2 to STG_BARCODE: 2 rows" }, { "block": 2, "table": "STG_BARCODE", "rows": 2, "firstLine": 12, "lastLine": 13, "logLine": "Block 2 of 2 to STG_BARCODE: 2 rows" }]',
    },
    {
      name: 'No rows',
      inputs: [
        { name: 'payload', mime: 'application/json', content: '[]' },
        { name: 'vars', mime: 'application/json', content: '{ "blockSize": 500, "tableName": "STG_ITEM" }' },
      ],
      expected: '[]',
    },
  ],
  followUps: [
    {
      q: 'Why does the last block often have fewer rows?',
      a: 'The total row count is rarely a multiple of the block size. The remainder forms a final, shorter block.',
    },
    {
      q: 'Would you log every row of a block?',
      a: 'No. Log the block number, table, line range and count. Row values belong in the reject table when a row fails.',
    },
    {
      q: 'How would you pick the block size?',
      a: 'Start near a few hundred rows, measure load time and memory in a test with real volumes, then tune the property.',
    },
  ],
}
