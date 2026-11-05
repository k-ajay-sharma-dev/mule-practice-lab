export default {
  id: 'dw-052',
  category: 'dataweave',
  title: 'Export Purchase Order Lines as a Supplier CSV',
  level: 'INTERMEDIATE',
  tags: ['supply-chain', 'csv', 'writer-properties', 'quoteValues', 'number-format'],
  estMinutes: 15,
  description: `
A buyer approves a purchase order in the ERP. A small supplier cannot receive EDI 850s, so the integration drops a **CSV file** on their SFTP server instead. The supplier's import tool has strict rules:

**Rows**
- One row per PO line, in input order. Lines with \`status\` \`"CANCELLED"\` are **not** sent.
- After the lines, one **total row**: \`PO_NUMBER\` = the PO number, \`LINE\` = \`TOTAL\`, \`LINE_TOTAL\` = the sum of all sent line totals, every other column an empty string.

**Columns** (header row first, in this order)

| Column | Value |
|---|---|
| \`PO_NUMBER\` | \`poNumber\` |
| \`LINE\` | \`lineNo\` |
| \`SKU\` | \`sku\` |
| \`DESCRIPTION\` | \`description\` (may contain commas) |
| \`QTY\` | \`qty\` |
| \`UNIT_PRICE\` | \`unitPrice\` with exactly 2 decimals |
| \`LINE_TOTAL\` | \`qty * unitPrice\` with exactly 2 decimals |

**Format**
- Comma separator. Every **value** is wrapped in double quotes; the header row is not.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{
  "poNumber": "PO-45001",
  "supplierId": "SUP-311",
  "lines": [
    { "lineNo": 1, "sku": "PK-1001", "description": "Pallet wrap, 500mm", "qty": 12, "unitPrice": 18.5, "status": "OPEN" },
    { "lineNo": 2, "sku": "PK-1002", "description": "Corner boards", "qty": 200, "unitPrice": 0.35, "status": "OPEN" },
    { "lineNo": 3, "sku": "PK-1003", "description": "Strapping kit", "qty": 5, "unitPrice": 42, "status": "CANCELLED" },
    { "lineNo": 4, "sku": "PK-1004", "description": "Label rolls, 4x6", "qty": 10, "unitPrice": 9.99, "status": "OPEN" }
  ]
}`,
    },
  ],
  expected: {
    mime: 'application/csv',
    content: `PO_NUMBER,LINE,SKU,DESCRIPTION,QTY,UNIT_PRICE,LINE_TOTAL
"PO-45001","1","PK-1001","Pallet wrap, 500mm","12","18.50","222.00"
"PO-45001","2","PK-1002","Corner boards","200","0.35","70.00"
"PO-45001","4","PK-1004","Label rolls, 4x6","10","9.99","99.90"
"PO-45001","TOTAL","","","","","391.90"`,
  },
  starterCode: `%dw 2.0
output application/csv
---
payload.lines
`,
  hints: [
    'The CSV writer takes its header from the keys of the **first** object, so build every row (including the total row) with the same keys in the same order.',
    'Format money with `n as String {format: "0.00"}` — `18.5` becomes `"18.50"`.',
    'Writer properties go on the output directive: `output application/csv quoteValues=true` quotes every value but leaves the header alone.',
  ],
  solution: `%dw 2.0
output application/csv quoteValues=true
fun money(n: Number): String = n as String {format: "0.00"}
var sent = payload.lines filter ($.status != "CANCELLED")
var rows = sent map (l) -> {
  PO_NUMBER: payload.poNumber,
  LINE: l.lineNo,
  SKU: l.sku,
  DESCRIPTION: l.description,
  QTY: l.qty,
  UNIT_PRICE: money(l.unitPrice),
  LINE_TOTAL: money(l.qty * l.unitPrice)
}
var totalRow = {
  PO_NUMBER: payload.poNumber,
  LINE: "TOTAL",
  SKU: "",
  DESCRIPTION: "",
  QTY: "",
  UNIT_PRICE: "",
  LINE_TOTAL: money(sum(sent map ($.qty * $.unitPrice)))
}
---
rows ++ [totalRow]`,
  explanation: `
CSV is just an **array of flat objects** to the writer; the header comes from the first object's keys. Because the total row is appended with the same keys, it lines up under the right columns.

- \`quoteValues=true\` wraps every value in double quotes, so \`Pallet wrap, 500mm\` stays one field. Without it the DW 2.x writer escapes the comma instead of quoting it, and many supplier import tools do not understand that. The header is controlled separately (\`quoteHeader\`, default \`false\`).
- \`format: "0.00"\` forces two decimals — plain number output would write \`18.5\` and \`70\`.
- DataWeave numbers are decimals, so \`200 * 0.35\` is exactly \`70\` (no binary floating point noise like \`70.00000000000001\`).
- \`sum([])\` is \`0\`, so a PO whose lines are all cancelled still gets a valid total row.

Common traps:
- Computing the total over **all** lines instead of the sent ones (would give 601.90).
- Building the total row with its keys in a different order or with missing keys — the writer does not realign rows by key name.
`,
  tests: [
    {
      name: 'Every line cancelled: header and a zero total row',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content:
            '{ "poNumber": "PO-9", "supplierId": "SUP-1", "lines": [ { "lineNo": 1, "sku": "A", "description": "Box, small", "qty": 3, "unitPrice": 2, "status": "CANCELLED" } ] }',
        },
      ],
      expected: `PO_NUMBER,LINE,SKU,DESCRIPTION,QTY,UNIT_PRICE,LINE_TOTAL
"PO-9","TOTAL","","","","","0.00"`,
    },
  ],
  followUps: [
    {
      q: 'How would you deliver this file to the supplier in Mule 4?',
      a: 'Write the CSV with the SFTP connector `write` operation, ideally to a temporary name and then `rename` it, so the supplier never picks up a half-written file. The file name usually carries the PO number and a timestamp to stay unique.',
    },
    {
      q: 'The supplier wants Windows line endings and a UTF-8 BOM. Can DataWeave do that?',
      a: 'Line endings: yes, the CSV writer has a `lineSeparator` property. A BOM is not a CSV writer option, so you would prepend it yourself or let the receiving side ignore it; confirm the requirement before adding bytes.',
    },
    {
      q: 'What is the risk of quoting numbers as strings?',
      a: 'None for the file itself, since CSV has no types, but the receiver must parse them; agree the decimal separator and number of decimals in the interface specification so `9.99` is not read as 999 in a locale with comma decimals.',
    },
  ],
}
