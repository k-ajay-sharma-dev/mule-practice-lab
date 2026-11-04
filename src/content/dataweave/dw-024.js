export default {
  id: 'dw-024',
  category: 'dataweave',
  title: 'Parse a Headerless Pipe-Delimited Bank Statement',
  level: 'INTERMEDIATE',
  tags: ['csv', 'reader-properties', 'header=false', 'separator', 'dates'],
  estMinutes: 20,
  description: `
A bank drops a daily statement on SFTP. It is a **pipe-delimited** file with **no header row**, and the first field of each line is a record type:

| Type | Fields after the type |
|---|---|
| \`H\` (header, first line) | file date as \`yyyyMMdd\`, bank code |
| \`D\` (detail, zero or more) | reference, booking date (\`yyyy-MM-dd\`), counterparty, amount, \`CR\` or \`DR\` |
| \`T\` (trailer, last line) | number of detail lines the bank says it sent |

Counterparty names may contain commas or pipes, so they are wrapped in double quotes.

Produce this JSON:

- \`fileDate\` — the H date formatted as \`yyyy-MM-dd\`
- \`bank\` — the bank code
- \`transactions\` — one object per D line, in file order: \`reference\`, \`bookingDate\` (string, as received), \`counterparty\` (without quotes), \`amount\` — a **number**, **negative** for \`DR\` lines
- \`declaredCount\` — the trailer count as a number
- \`countMatches\` — \`true\` when \`declaredCount\` equals the number of D lines

The script must tell the CSV reader about the file format itself (the input arrives as plain \`application/csv\`).
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/csv',
      content: `H|20261101|NORDBANK
D|TX-1001|2026-10-31|"Acme, Inc"|1250.50|CR
D|TX-1002|2026-10-31|"Pipe|Works Ltd"|89.99|DR
D|TX-1003|2026-11-01|Globex|300|CR
T|3`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "fileDate": "2026-11-01",
  "bank": "NORDBANK",
  "transactions": [
    { "reference": "TX-1001", "bookingDate": "2026-10-31", "counterparty": "Acme, Inc", "amount": 1250.50 },
    { "reference": "TX-1002", "bookingDate": "2026-10-31", "counterparty": "Pipe|Works Ltd", "amount": -89.99 },
    { "reference": "TX-1003", "bookingDate": "2026-11-01", "counterparty": "Globex", "amount": 300 }
  ],
  "declaredCount": 3,
  "countMatches": true
}`,
  },
  starterCode: `%dw 2.0
input payload application/csv
output application/json
---
payload
`,
  hints: [
    'Reader properties go on the `input` directive: `input payload application/csv header=false, separator="|"`.',
    'Without a header, the columns are named `column_0`, `column_1`, … Run `payload` alone to see the shape.',
    'Pick lines with `filter ($.column_0 == "D")`. For the date: `h.column_1 as Date {format: "yyyyMMdd"} as String {format: "yyyy-MM-dd"}`.',
  ],
  solution: `%dw 2.0
input payload application/csv header=false, separator="|"
output application/json
var header = (payload filter ($.column_0 == "H"))[0]
var trailer = (payload filter ($.column_0 == "T"))[0]
var details = payload filter ($.column_0 == "D")
---
{
  fileDate: header.column_1 as Date {format: "yyyyMMdd"} as String {format: "yyyy-MM-dd"},
  bank: header.column_2,
  transactions: details map (d) -> {
    reference: d.column_1,
    bookingDate: d.column_2,
    counterparty: d.column_3,
    amount: if (d.column_5 == "DR") -(d.column_4 as Number) else d.column_4 as Number
  },
  declaredCount: trailer.column_1 as Number,
  countMatches: (trailer.column_1 as Number) == sizeOf(details)
}`,
  explanation: `
With the default settings the reader would treat \`H|20261101|NORDBANK\` as the header row and split on commas — so \`"Acme, Inc"\` would break the whole file. Two reader properties fix that:

- \`header=false\` — every line is data; columns get generated names \`column_0\`, \`column_1\`, …
- \`separator="|"\` — split on pipes. Quoted values (the default \`quote\` is \`"\`) are kept together even when they contain the separator, and the quotes are removed.

Rows with fewer fields (H and T) simply have fewer columns, so one reader handles all three record types.

Traps:
- Every CSV value is a **String**. \`"1250.50"\` must be coerced with \`as Number\` before negating or comparing.
- Comparing \`d.column_5 == "DR"\` is exact — \`"dr"\` would not match. Agree on the code list with the bank.
- \`as Date {format: "yyyyMMdd"}\` parses; a second \`as String {format: ...}\` re-formats.
`,
  tests: [
    {
      name: 'Empty statement with a wrong trailer count',
      inputs: [
        {
          name: 'payload',
          mime: 'application/csv',
          content: `H|20260105|ABNBANK
T|2`,
        },
      ],
      expected: '{ "fileDate": "2026-01-05", "bank": "ABNBANK", "transactions": [], "declaredCount": 2, "countMatches": false }',
    },
    {
      name: 'Only debits, quoted value with a comma',
      inputs: [
        {
          name: 'payload',
          mime: 'application/csv',
          content: `H|20261231|NORDBANK
D|TX-9|2026-12-31|"Smith, Jones & Co"|0.5|DR
T|1`,
        },
      ],
      expected:
        '{ "fileDate": "2026-12-31", "bank": "NORDBANK", "transactions": [{ "reference": "TX-9", "bookingDate": "2026-12-31", "counterparty": "Smith, Jones & Co", "amount": -0.5 }], "declaredCount": 1, "countMatches": true }',
    },
  ],
  followUps: [
    {
      q: 'In a Mule app, where else can you set these reader properties?',
      a: 'On the source or connector as MIME type parameters (for example `outputMimeType="application/csv; header=false; separator=|"` on the SFTP read), or on the payload with `Set Payload`. Setting them on the connector means every component sees correctly parsed data.',
    },
    {
      q: 'How would you handle a 2 GB statement file?',
      a: 'Enable streaming on the CSV reader (`streaming=true`) and make sure the script only walks the data once — the `filter` calls here iterate the payload three times, which forces it into memory.',
    },
    {
      q: 'What if the bank escapes quotes inside a value as `""`?',
      a: 'The default escape character is a backslash, so `"O""Brien"` is read as just `O`. Setting `escape="\\""` on the reader makes `""` mean one literal quote.',
    },
  ],
}
