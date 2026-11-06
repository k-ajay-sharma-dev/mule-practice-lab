export default {
  id: 'dw-118',
  category: 'dataweave',
  title: 'Find Low Stock Rows in a CSV File',
  level: 'BEGINNER',
  tags: ['csv', 'json', 'data-formats', 'filter', 'type-conversion'],
  estMinutes: 15,
  description: `
Each night a shop sends its stock count as a CSV file. CSV means comma separated values: the first line holds the column names, and each later line is one row.

The buying team wants a JSON list of the products that are running low.

- Keep only the rows where \`stock\` is less than \`10\`. Keep them in file order.
- Output \`sku\` and \`name\` as they are.
- Output \`stock\` as a **number**, not as text.
- If no product is low, the output is an empty array.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/csv',
      content: `sku,name,stock
MUG-01,Blue mug,4
TEA-07,Green tea,120
PAN-03,Frying pan,9
LID-02,Pan lid,10`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `[
  { "sku": "MUG-01", "name": "Blue mug", "stock": 4 },
  { "sku": "PAN-03", "name": "Frying pan", "stock": 9 }
]`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload
`,
  hints: [
    'Run the starter code first. `payload` is an array of objects, one per row, and every value is a String.',
    'Convert with `as Number`: `"4" as Number` gives `4`. The output field needs this too.',
    'Use `filter` to pick the rows, then `map` to build the output. Put parentheses around the `filter` part before you call `map`.',
  ],
  solution: `%dw 2.0
output application/json
---
(payload filter (row) -> (row.stock as Number) < 10) map (row) -> {
  sku: row.sku,
  name: row.name,
  stock: row.stock as Number
}`,
  explanation: `
**CSV has no types.** The reader gives you an array of objects, and every value is a String, so \`stock\` arrives as \`"4"\`.

\`filter\` keeps the rows you want, and \`map\` builds the output for each row that is left. The boundary matters here: \`10\` is not less than \`10\`, so the pan lid is dropped.

**A trap with the output.** \`row.stock < 10\` does work, because DataWeave converts the text for the comparison. But the row itself doesn't change. If you return the filtered rows directly, the JSON shows \`"stock": "4"\` in quotes, and the buying team receives text. That is why the \`map\` converts the value again.

**A trap with text comparison.** \`row.stock < "10"\` compares two Strings, one character at a time. \`"9"\` is not less than \`"10"\` as text, so rows such as \`"4"\` and \`"9"\` are lost.
`,
  tests: [
    {
      name: 'Nothing is low',
      inputs: [
        {
          name: 'payload',
          mime: 'application/csv',
          content: `sku,name,stock
TEA-07,Green tea,120
LID-02,Pan lid,10`,
        },
      ],
      expected: '[]',
    },
    {
      name: 'Zero stock and a name with a comma',
      inputs: [
        {
          name: 'payload',
          mime: 'application/csv',
          content: `sku,name,stock
JAR-05,"Jam, strawberry",0
BAG-11,Tote bag,100`,
        },
      ],
      expected: '[ { "sku": "JAR-05", "name": "Jam, strawberry", "stock": 0 } ]',
    },
    {
      name: 'A file with a header and no rows',
      inputs: [{ name: 'payload', mime: 'application/csv', content: 'sku,name,stock' }],
      expected: '[]',
    },
  ],
  followUps: [
    {
      q: 'What happens if a row has an empty `stock` value?',
      a: 'An empty value arrives as `""`, and `"" as Number` fails, so the whole script stops. If blanks are allowed, check for `""` before converting.',
    },
    {
      q: 'Why should a column such as a postal code stay a String?',
      a: 'Converting it to a Number removes leading zeros. Convert only the columns you need to calculate or compare with.',
    },
  ],
}
