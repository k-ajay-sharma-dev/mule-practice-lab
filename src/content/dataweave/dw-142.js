export default {
  id: 'dw-142',
  category: 'dataweave',
  title: 'Turn a Columns and Rows Report Response into Records',
  level: 'INTERMEDIATE',
  tags: ['dynamic-keys', 'index', 'columnar', 'analytics', 'map', 'json'],
  estMinutes: 15,
  description: `
Tollbridge Outdoor runs 40 shops. Its sales reporting tool has an API that returns results in a compact form: one list of column names, and a list of rows where each row is a list of values in the same order as the columns.

The stock planning system wants normal JSON records, one object per row, with the column names as keys.

Write a script that works for **any** list of columns, not only these four. If a row is shorter than the list of columns, the missing values are \`null\`.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{
  "report": "daily-sales",
  "columns": ["storeId", "businessDate", "sales", "returns"],
  "rows": [
    ["ST-01", "2026-11-16", 1520.5, 30],
    ["ST-02", "2026-11-16", 980, 0],
    ["ST-07", "2026-11-16", 2210.75, 112.4]
  ]
}`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `[
  { "storeId": "ST-01", "businessDate": "2026-11-16", "sales": 1520.5, "returns": 30 },
  { "storeId": "ST-02", "businessDate": "2026-11-16", "sales": 980, "returns": 0 },
  { "storeId": "ST-07", "businessDate": "2026-11-16", "sales": 2210.75, "returns": 112.4 }
]`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload.rows map (row) -> {
  storeId: row[0]
}
`,
  hints: [
    'Typing `storeId: row[0]` works for this report only. The key names must come from `payload.columns`.',
    '`map` gives each column name and its position: `payload.columns map (name, i) -> ...`.',
    'A key in round brackets is worked out at run time: `{ (name): row[i] }`.',
    'Mapping the columns gives a list of small objects. Wrap that list in `{ ( ... ) }` to merge them into one object.',
  ],
  solution: `%dw 2.0
output application/json
---
payload.rows map (row) -> {
  (payload.columns map (name, i) -> { (name): row[i] })
}`,
  explanation: `
**Columns give the keys, rows give the values.** For the first row, column 0 is \`storeId\` and value 0 is \`"ST-01"\`. Pairing them by position gives \`{ storeId: "ST-01" }\`, and so on for each column.

**Dynamic keys.** \`{ (name): row[i] }\` uses the value of \`name\` as the key. Without the brackets, every key would be the word "name".

**Merging small objects.** \`payload.columns map ...\` returns a list of one-key objects. Writing that list inside \`{ ( ... ) }\` spreads all of them into a single object, in column order.

**Short rows.** Reading an index past the end of a list gives \`null\` in DataWeave, so a row with a missing last value still gets every key.

**Any report.** Nothing in the script names a column. If the tool adds a \`basketCount\` column tomorrow, the records get that key with no change to the code.
`,
  tests: [
    {
      name: 'A different report with other columns',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '{ "report": "footfall", "columns": ["storeId", "visitors"], "rows": [["ST-03", 412], ["ST-04", 95]] }',
        },
      ],
      expected: '[{ "storeId": "ST-03", "visitors": 412 }, { "storeId": "ST-04", "visitors": 95 }]',
    },
    {
      name: 'A short row gets null for the missing value',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '{ "report": "daily-sales", "columns": ["storeId", "sales", "returns"], "rows": [["ST-09", 300]] }',
        },
      ],
      expected: '[{ "storeId": "ST-09", "sales": 300, "returns": null }]',
    },
    {
      name: 'No rows',
      inputs: [{ name: 'payload', mime: 'application/json', content: '{ "report": "daily-sales", "columns": ["storeId"], "rows": [] }' }],
      expected: '[]',
    },
  ],
  followUps: [
    {
      q: 'Why do reporting APIs send columns and rows instead of records?',
      a: 'It is smaller. Each key name is sent once instead of once per row, which matters when a report has thousands of rows.',
    },
    {
      q: 'How would you go the other way, from records to columns and rows?',
      a: 'Take the keys of the first record with `keysOf` as the columns. Then map each record to a list of its values in that column order, for example `columns map (c) -> record[c]`.',
    },
    {
      q: 'The planning system wants `sales` as a number but one row sends "1,520.50" as text. Where do you fix it?',
      a: 'After building the records, convert the fields that need a type, for example with `update` or a second `map`. Keep the generic step generic, and put rules for named fields in a separate step.',
    },
  ],
}
