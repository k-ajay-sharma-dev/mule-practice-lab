export default {
  id: 'dw-181',
  category: 'dataweave',
  title: 'Split Rows Into Multi Row INSERT Blocks Within SQL Server Parameter Limits',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'sql-server', 'planning-platform', 'blocks', 'parameters', 'insert', 'json'],
  estMinutes: 22,
  description: `
Brindle Outdoor loads item master rows from the planning platform into a SQL Server staging table. Instead of one INSERT per row, Mule sends multi row INSERT statements with named parameters. SQL Server allows at most 2,100 parameters in one request and 1,000 rows in one VALUES list, so the rows must be split into blocks.

**Inputs**
- \`payload\`: the rows, as objects
- \`vars.table\`, \`vars.columns\`: the target table and the columns to insert, in order
- \`vars.maxParams\` and \`vars.maxRows\`: the limits. The samples use small numbers so the blocks are visible.

**Output**
- \`rowsPerBlock\`: the largest number of rows that keeps both limits: the smaller of \`maxRows\` and \`maxParams\` divided by the number of columns, rounded down
- \`blocks\`: one per block, in row order, with:
  - \`block\`: the block number from 1
  - \`rowCount\`
  - \`sql\`: \`INSERT INTO <table> (<columns joined by ", ">) VALUES (...), (...)\`, with parameters named \`:p1\`, \`:p2\` and so on, numbered from 1 in each block
  - \`params\`: an object from \`p1\` onwards with the values, row by row and column by column
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `[
  { "ItemId": 10021, "Descr": "Tent 2P Green", "PackSize": 4 },
  { "ItemId": 10022, "Descr": "Tent 4P Blue", "PackSize": 2 },
  { "ItemId": 10055, "Descr": "Camp Stove", "PackSize": 6 },
  { "ItemId": 10070, "Descr": "Lantern LED", "PackSize": 12 },
  { "ItemId": 10102, "Descr": "Headlamp", "PackSize": 12 }
]`,
    },
    {
      name: 'vars',
      mime: 'application/json',
      content: `{ "table": "dbo.ItemStage", "columns": ["ItemId", "Descr", "PackSize"], "maxParams": 10, "maxRows": 1000 }`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "rowsPerBlock": 3,
  "blocks": [
    {
      "block": 1,
      "rowCount": 3,
      "sql": "INSERT INTO dbo.ItemStage (ItemId, Descr, PackSize) VALUES (:p1, :p2, :p3), (:p4, :p5, :p6), (:p7, :p8, :p9)",
      "params": { "p1": 10021, "p2": "Tent 2P Green", "p3": 4, "p4": 10022, "p5": "Tent 4P Blue", "p6": 2, "p7": 10055, "p8": "Camp Stove", "p9": 6 }
    },
    {
      "block": 2,
      "rowCount": 2,
      "sql": "INSERT INTO dbo.ItemStage (ItemId, Descr, PackSize) VALUES (:p1, :p2, :p3), (:p4, :p5, :p6)",
      "params": { "p1": 10070, "p2": "Lantern LED", "p3": 12, "p4": 10102, "p5": "Headlamp", "p6": 12 }
    }
  ]
}`,
  },
  starterCode: `%dw 2.0
output application/json
var size = 3
---
{
  rowsPerBlock: size,
  blocks: payload map (r, i) -> { block: i + 1 }
}
`,
  hints: [
    '`floor(vars.maxParams / sizeOf(vars.columns))` gives the rows that fit the parameter limit. `min([a, b])` picks the smaller.',
    'The number of blocks is `ceil(sizeOf(payload) / size)`. Guard the case of no rows before you build a range like `0 to count - 1`.',
    'Block `b`, counted from 0, holds `payload[(b * size) to (min([(b + 1) * size, sizeOf(payload)]) - 1)]`.',
    'In a block, row `ri` and column `ci` use parameter number `ri * sizeOf(vars.columns) + ci + 1`.',
    'Build the params object from a list of one key objects: `{ (list map (v, i) -> { ("p" ++ (i + 1)): v }) }`.',
  ],
  solution: `%dw 2.0
output application/json

var cols = vars.columns
var n = sizeOf(cols)
var size = min([vars.maxRows, floor(vars.maxParams / n)])
var total = sizeOf(payload)
var blockCount = ceil(total / size)

fun rowsOf(b) = payload[(b * size) to (min([(b + 1) * size, total]) - 1)]

fun placeholders(rows) =
  (rows map (r, ri) -> "(" ++ ((cols map (c, ci) -> ":p" ++ ((ri * n + ci + 1) as String)) joinBy ", ") ++ ")")
    joinBy ", "

fun paramValues(rows) = rows flatMap (r) -> (cols map (c) -> r[c])
---
{
  rowsPerBlock: size,
  blocks: if (total == 0) []
    else (0 to blockCount - 1) map (b) -> do {
      var rows = rowsOf(b)
      ---
      {
        block: b + 1,
        rowCount: sizeOf(rows),
        sql: "INSERT INTO " ++ vars.table ++ " (" ++ (cols joinBy ", ") ++ ") VALUES " ++ placeholders(rows),
        params: { (paramValues(rows) map (v, i) -> { ("p" ++ ((i + 1) as String)): v }) }
      }
    }
}`,
  explanation: `
**Two limits.** Each row uses one parameter per column, so 2,100 parameters allow 700 rows of three columns. A VALUES list also stops at 1,000 rows. The block size is the smaller of the two, so neither is ever broken.

**Blocks by range.** Block \`b\` starts at row \`b * size\`. The end is cut at the last row, so the final block can be shorter. With no rows there is no block, and the range \`0 to -1\` is never built.

**Numbered placeholders.** Row \`ri\` and column \`ci\` map to parameter \`ri * n + ci + 1\`. The SQL text and the params object follow the same rule, so every placeholder has exactly one value.

**Values by column name.** \`r[c]\` reads a field by a name held in a variable. The columns list fixes the order, so the SQL and the values stay in step whatever order the fields have in the input.

**Why not build the SQL with the values in it?** Parameters keep the driver in charge of quoting, which prevents SQL injection and type mistakes, and lets SQL Server reuse plans for blocks of the same size.
`,
  tests: [
    {
      name: 'No rows',
      inputs: [
        { name: 'payload', mime: 'application/json', content: '[]' },
        { name: 'vars', mime: 'application/json', content: '{ "table": "dbo.ItemStage", "columns": ["ItemId", "Descr"], "maxParams": 2100, "maxRows": 1000 }' },
      ],
      expected: '{ "rowsPerBlock": 1000, "blocks": [] }',
    },
    {
      name: 'The row limit is the smaller one',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '[{ "ItemId": 1, "Descr": "A" }, { "ItemId": 2, "Descr": "B" }, { "ItemId": 3, "Descr": "C" }]',
        },
        { name: 'vars', mime: 'application/json', content: '{ "table": "dbo.ItemStage", "columns": ["ItemId", "Descr"], "maxParams": 100, "maxRows": 2 }' },
      ],
      expected:
        '{ "rowsPerBlock": 2, "blocks": [{ "block": 1, "rowCount": 2, "sql": "INSERT INTO dbo.ItemStage (ItemId, Descr) VALUES (:p1, :p2), (:p3, :p4)", "params": { "p1": 1, "p2": "A", "p3": 2, "p4": "B" } }, { "block": 2, "rowCount": 1, "sql": "INSERT INTO dbo.ItemStage (ItemId, Descr) VALUES (:p1, :p2)", "params": { "p1": 3, "p2": "C" } }] }',
    },
  ],
  followUps: [
    {
      q: 'How does this compare with the bulk insert operation?',
      a: 'Bulk insert sends one single row statement many times as a JDBC batch, so the parameter limit applies per row. Multi row statements send fewer, larger requests. Measure both with your data.',
    },
    {
      q: 'Why is a block size of exactly 2,100 parameters risky?',
      a: 'Some drivers or wrappers add a parameter of their own. Staying a little under the limit, for example 2,000, leaves room.',
    },
    {
      q: 'The last block has a different size. Does that matter?',
      a: 'It gives a second SQL text and so a second plan, which is fine. Many different sizes would fill the plan cache, so keep full blocks plus one remainder.',
    },
  ],
}
