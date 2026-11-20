export default {
  id: 'dw-186',
  category: 'dataweave',
  title: 'Split an Oracle IN List Into Chunks to Avoid ORA-01795',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'oracle', 'ora-01795', 'in-list', 'divideBy', 'json'],
  estMinutes: 20,
  description: `
Fenwick Supply looks up the status of many items in Oracle before a load. The flow built one query with all item IDs in an \`IN\` list, and large files fail with ORA-01795, because an \`IN\` list holds at most 1,000 expressions.

Build the queries in chunks:

- Clean the IDs: trim, upper case, drop blanks and nulls, then keep each ID once, in first seen order.
- Split them into chunks of at most \`vars.maxInList\` IDs. The sample uses 4 so the result is short. Production would use up to 1,000.
- For each chunk, give \`chunk\` (from 1), the \`sql\` text with named parameters \`:p1\`, \`:p2\` and so on, and \`params\`, an object that maps each parameter name to its ID.

The SQL is:

\`\`\`sql
SELECT ITEM_ID, STATUS_CODE FROM ITEM_MASTER WHERE ITEM_ID IN (:p1, :p2, ...)
\`\`\`

Return \`distinctIds\`, the number of clean IDs, and \`queries\`.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{
  "itemIds": [" bk-100", "TN-220", "BK-100", "ST-050", "", "LT-310", "MT-410", null, "tn-220", "CK-500"]
}`,
    },
    {
      name: 'vars',
      mime: 'application/json',
      content: `{ "maxInList": 4 }`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "distinctIds": 6,
  "queries": [
    {
      "chunk": 1,
      "sql": "SELECT ITEM_ID, STATUS_CODE FROM ITEM_MASTER WHERE ITEM_ID IN (:p1, :p2, :p3, :p4)",
      "params": { "p1": "BK-100", "p2": "TN-220", "p3": "ST-050", "p4": "LT-310" }
    },
    {
      "chunk": 2,
      "sql": "SELECT ITEM_ID, STATUS_CODE FROM ITEM_MASTER WHERE ITEM_ID IN (:p1, :p2)",
      "params": { "p1": "MT-410", "p2": "CK-500" }
    }
  ]
}`,
  },
  starterCode: `%dw 2.0
output application/json
---
{
  queries: [{
    sql: "SELECT ITEM_ID, STATUS_CODE FROM ITEM_MASTER WHERE ITEM_ID IN (" ++ (payload.itemIds joinBy ", ") ++ ")"
  }]
}
`,
  hints: [
    'Clean in steps, each in brackets: `map` to trim and upper case (turn null into `""` first with `default ""`), `filter` out empty strings, then `distinctBy`.',
    '`import divideBy from dw::core::Arrays` gives `ids divideBy n`, a list of lists with at most n items each.',
    'Build the placeholders with `chunk map (id, i) -> ":p$(i + 1)"` and join them with `", "`.',
    'Build the params object from a list of one key objects: `{ (chunk map (id, i) -> { ("p$(i + 1)"): id }) }`.',
  ],
  solution: `%dw 2.0
import divideBy from dw::core::Arrays
output application/json

var cleaned = payload.itemIds map (id) -> upper(trim(id default ""))
var ids = (cleaned filter (id) -> id != "") distinctBy (id) -> id
var chunks = ids divideBy vars.maxInList
---
{
  distinctIds: sizeOf(ids),
  queries: chunks map (chunk, c) -> {
    chunk: c + 1,
    sql: "SELECT ITEM_ID, STATUS_CODE FROM ITEM_MASTER WHERE ITEM_ID IN ("
      ++ ((chunk map (id, i) -> ":p$(i + 1)") joinBy ", ")
      ++ ")",
    params: { (chunk map (id, i) -> { ("p$(i + 1)"): id }) }
  }
}`,
  explanation: `
**Why chunks.** Oracle allows at most 1,000 expressions in one \`IN\` list. Splitting the IDs keeps every query under the limit, whatever the file size.

**Clean first.** Duplicates and blanks waste slots and can push a list over the limit. Trimming and upper casing before \`distinctBy\` makes \`bk-100\` and \`BK-100\` one ID.

**divideBy.** It cuts a list into lists of a fixed size, with a shorter last one. An empty list gives no chunks, so no query runs.

**Bind, do not paste.** The IDs go in as named parameters, not into the SQL text. That avoids SQL injection and quoting problems. The SQL text is the same for every full chunk, so Oracle can reuse the parsed statement. In Mule the text goes in the Select operation as an expression and the object as its input parameters.
`,
  tests: [
    {
      name: 'No IDs',
      inputs: [
        { name: 'payload', mime: 'application/json', content: '{ "itemIds": [] }' },
        { name: 'vars', mime: 'application/json', content: '{ "maxInList": 4 }' },
      ],
      expected: '{ "distinctIds": 0, "queries": [] }',
    },
    {
      name: 'Exactly one full chunk',
      inputs: [
        { name: 'payload', mime: 'application/json', content: '{ "itemIds": ["a-1", "a-2", "A-1", "a-3"] }' },
        { name: 'vars', mime: 'application/json', content: '{ "maxInList": 3 }' },
      ],
      expected:
        '{ "distinctIds": 3, "queries": [{ "chunk": 1, "sql": "SELECT ITEM_ID, STATUS_CODE FROM ITEM_MASTER WHERE ITEM_ID IN (:p1, :p2, :p3)", "params": { "p1": "A-1", "p2": "A-2", "p3": "A-3" } }] }',
    },
  ],
  followUps: [
    {
      q: 'What other ways avoid ORA-01795?',
      a: 'Bulk insert the IDs into a global temporary or staging table and join to it, which also handles very large lists in one query.',
    },
    {
      q: 'Why can a varying number of placeholders hurt Oracle?',
      a: 'Each distinct SQL text is parsed and cached on its own. Fixed chunk sizes, maybe padding the last chunk with a repeat of an ID, keep the number of texts small.',
    },
    {
      q: 'How would you run the chunks in Mule?',
      a: 'A For Each over the queries with a Select per chunk, then join the results. Parallel For Each can help, within the pool size.',
    },
  ],
}
