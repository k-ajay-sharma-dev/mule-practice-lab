export default {
  id: 'dw-081',
  category: 'dataweave',
  title: 'Write a Pipe-Separated, Fully Quoted Customs CSV',
  level: 'BEGINNER',
  tags: ['csv', 'json', 'data-formats', 'writer-properties', 'quoteValues', 'escaping'],
  estMinutes: 15,
  description: `
A freight forwarder submits customs declarations to a broker as a daily file. The broker's import tool is strict about the format, because descriptions often contain commas and quotes.

**File format**
- The separator is a **pipe** (\`|\`).
- The first line is the header, and the header names are enclosed in double quotes too.
- **Every** value is enclosed in double quotes, numbers included.
- A double quote inside a value is written as two double quotes (\`""\`). A backslash is not an escape character for this tool.

**Columns, in this order**

| Column | Value |
|---|---|
| \`DECLARATION_ID\` | \`declarationId\` |
| \`HS_CODE\` | \`hsCode\` |
| \`DESCRIPTION\` | \`description\` |
| \`ORIGIN\` | \`origin\` |
| \`VALUE_EUR\` | \`value\` with exactly 2 decimals |
| \`DANGEROUS\` | \`Y\` when \`dangerous\` is true, otherwise \`N\` |
| \`REMARKS\` | \`remarks\`, an empty value when it is \`null\` |

Rows stay in input order.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `[
  {
    "declarationId": "DEC-7001",
    "hsCode": "8471300000",
    "description": "Laptop 14\\", refurbished",
    "origin": "CN",
    "value": 1250.5,
    "dangerous": false,
    "remarks": null
  },
  {
    "declarationId": "DEC-7002",
    "hsCode": "3824999600",
    "description": "Cleaning agent | 5 L drum",
    "origin": "DE",
    "value": 89,
    "dangerous": true,
    "remarks": "UN1993, class 3"
  }
]`,
    },
  ],
  expected: {
    mime: 'application/csv',
    content: `"DECLARATION_ID"|"HS_CODE"|"DESCRIPTION"|"ORIGIN"|"VALUE_EUR"|"DANGEROUS"|"REMARKS"
"DEC-7001"|"8471300000"|"Laptop 14"", refurbished"|"CN"|"1250.50"|"N"|""
"DEC-7002"|"3824999600"|"Cleaning agent | 5 L drum"|"DE"|"89.00"|"Y"|"UN1993, class 3"`,
  },
  starterCode: `%dw 2.0
output application/csv
---
payload map (d) -> {
  DECLARATION_ID: d.declarationId
}
`,
  hints: [
    'The format is set on the `output` line, not in the mapping. Properties are separated by commas: `output application/csv separator="|", header=true`.',
    '`quoteValues=true` quotes the values and `quoteHeader=true` quotes the header names. They are separate properties.',
    'The default escape character is a backslash. Set `escape=\'"\'` so an embedded quote is doubled.',
    'For the amount, use `d.value as String { format: "0.00" }`. A `null` remark can go straight into the row.',
  ],
  solution: `%dw 2.0
output application/csv separator="|", header=true, quoteHeader=true, quoteValues=true, escape='"'
---
payload map (d) -> {
  DECLARATION_ID: d.declarationId,
  HS_CODE: d.hsCode,
  DESCRIPTION: d.description,
  ORIGIN: d.origin,
  VALUE_EUR: d.value as String { format: "0.00" },
  DANGEROUS: if (d.dangerous) "Y" else "N",
  REMARKS: d.remarks
}`,
  explanation: `
**The file format belongs to the writer.** The mapping decides *what* goes in each column, and the writer properties decide *how* it is written. Keeping them apart means a change of separator never touches the mapping.

| Property | Default | Here | Effect |
|---|---|---|---|
| \`separator\` | comma | pipe | field delimiter |
| \`header\` | \`true\` | \`true\` | writes the column names first |
| \`quoteHeader\` | \`false\` | \`true\` | quotes the column names |
| \`quoteValues\` | \`false\` | \`true\` | quotes every value |
| \`escape\` | \`\\\` | \`"\` | character placed before a special character |

**Doubling quotes.** With \`escape='"'\`, the quote inside \`Laptop 14"\` is written as \`""\`. With the default it would be written as \`\\"\`, which an RFC 4180 style reader does not understand.

**A separator inside a value is safe.** \`Cleaning agent | 5 L drum\` contains the separator, but the whole value is quoted, so the broker's tool still sees seven columns. The comma in the remarks is ordinary text in this file.

**Column names come from the keys.** The header is taken from the object keys, and the column order follows the key order. That is why the object is written in the order of the specification.
`,
  tests: [
    {
      name: 'Several quotes in one value, and a backslash that stays literal',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content:
            '[ { "declarationId": "DEC-7100", "hsCode": "9403200000", "description": "Shelf \\"Mini\\" and \\"Max\\"", "origin": "PL", "value": 0.5, "dangerous": false, "remarks": "Ref A\\\\B" } ]',
        },
      ],
      expected: `"DECLARATION_ID"|"HS_CODE"|"DESCRIPTION"|"ORIGIN"|"VALUE_EUR"|"DANGEROUS"|"REMARKS"
"DEC-7100"|"9403200000"|"Shelf ""Mini"" and ""Max"""|"PL"|"0.50"|"N"|"Ref A\\B"`,
    },
    {
      name: 'Three rows stay in input order',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content:
            '[ { "declarationId": "DEC-3", "hsCode": "1", "description": "C", "origin": "FR", "value": 3, "dangerous": true, "remarks": "" }, { "declarationId": "DEC-1", "hsCode": "2", "description": "A", "origin": "FR", "value": 1000000, "dangerous": false, "remarks": null }, { "declarationId": "DEC-2", "hsCode": "3", "description": "B", "origin": "FR", "value": 2.345, "dangerous": false, "remarks": "x" } ]',
        },
      ],
      expected: `"DECLARATION_ID"|"HS_CODE"|"DESCRIPTION"|"ORIGIN"|"VALUE_EUR"|"DANGEROUS"|"REMARKS"
"DEC-3"|"1"|"C"|"FR"|"3.00"|"Y"|""
"DEC-1"|"2"|"A"|"FR"|"1000000.00"|"N"|""
"DEC-2"|"3"|"B"|"FR"|"2.35"|"N"|"x"`,
    },
  ],
  followUps: [
    {
      q: 'Several batches per day must end up in one file, so the flow uses file:write with mode APPEND. What is wrong with the result?',
      a: 'Each script run writes its own header, so the header line repeats inside the file. Set `header=false` for every batch after the first, or build the whole file before writing it once.',
    },
    {
      q: 'The broker runs on Windows and needs CRLF line endings. Which property sets that?',
      a: '`lineSeparator="\\r\\n"` on the CSV writer. By default the writer uses the line separator of the system it runs on, so a file can differ between a laptop and the server.',
    },
  ],
}
