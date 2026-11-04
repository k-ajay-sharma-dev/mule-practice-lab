export default {
  id: 'dw-046',
  category: 'dataweave',
  title: 'Read a Fixed-Width Payroll File with Substring Offsets',
  level: 'INTERMEDIATE',
  tags: ['fixed-width', 'text/plain', 'substring', 'splitBy', 'dates'],
  estMinutes: 20,
  description: `
A mainframe payroll system sends a **fixed-width** text file: no separators, every field sits at a fixed character position and is padded with spaces. The file arrives as \`text/plain\`, so \`payload\` is one big String.

**Record layout** (0-based, both positions inclusive)

| Field | From | To | Length | Notes |
|---|---|---|---|---|
| employee id | 0 | 7 | 8 | |
| last name | 8 | 22 | 15 | right-padded with spaces |
| first name | 23 | 32 | 10 | right-padded with spaces |
| start date | 33 | 40 | 8 | \`yyyyMMdd\` |
| monthly salary | 41 | 48 | 8 | digits only, in **cents** (\`00452500\` = 4525.00) |
| country | 49 | 50 | 2 | |

**Rules**
- Lines are separated by \`\\n\`, possibly \`\\r\\n\`. Ignore **blank** lines and lines starting with \`#\` (comments).
- Output one object per data line, in file order: \`employeeId\`, \`lastName\`, \`firstName\`, \`startDate\` (re-formatted as \`yyyy-MM-dd\`), \`monthlySalary\` (a number in the currency unit), \`country\`.
- Text fields are trimmed; a text field that is empty after trimming becomes \`null\`.
- The sender strips trailing spaces, so a line with an empty country is only **49** characters long — \`country\` is then \`null\`.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'text/plain',
      content: `# PAYROLL EXPORT 2026-11
EMP00123SMITH          JOHN      2026110100452500NL
EMP00007VAN DER BERG   ANNA-MARIE2019041500610075BE

EMP00456O'NEIL                   2024030100398000IE
EMP00900MUELLER        KLAUS     2025120100500000
`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `[
  { "employeeId": "EMP00123", "lastName": "SMITH", "firstName": "JOHN", "startDate": "2026-11-01", "monthlySalary": 4525.00, "country": "NL" },
  { "employeeId": "EMP00007", "lastName": "VAN DER BERG", "firstName": "ANNA-MARIE", "startDate": "2019-04-15", "monthlySalary": 6100.75, "country": "BE" },
  { "employeeId": "EMP00456", "lastName": "O'NEIL", "firstName": null, "startDate": "2024-03-01", "monthlySalary": 3980.00, "country": "IE" },
  { "employeeId": "EMP00900", "lastName": "MUELLER", "firstName": "KLAUS", "startDate": "2025-12-01", "monthlySalary": 5000.00, "country": null }
]`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload
`,
  hints: [
    'Split into lines with `payload splitBy "\\n"`, drop a trailing `\\r` with `replace /\\r$/ with ""`, then `filter` out blank and `#` lines.',
    'A string range selector is inclusive on both ends: `line[8 to 22]` is the 15-character last name. A range that runs past the end of the string returns `null` instead of failing.',
    'Write one helper, e.g. `fun text(line, a, b) = do { var v = trim(line[a to b]) --- if (isEmpty(v)) null else v }`, and use it for every text field.',
  ],
  solution: `%dw 2.0
output application/json

fun isBlank(s: String): Boolean = isEmpty(trim(s))

fun text(line: String, a: Number, b: Number) = do {
  var v = trim(line[a to b])
  ---
  if (isEmpty(v)) null else v
}

var lines = (payload splitBy "\\n")
  map ($ replace /\\r$/ with "")
  filter ((not isBlank($)) and not ($ startsWith "#"))
---
lines map (line) -> {
  employeeId: text(line, 0, 7),
  lastName: text(line, 8, 22),
  firstName: text(line, 23, 32),
  startDate: line[33 to 40] as Date {format: "yyyyMMdd"} as String {format: "yyyy-MM-dd"},
  monthlySalary: (line[41 to 48] as Number) / 100,
  country: text(line, 49, 50)
}`,
  explanation: `
Fixed-width parsing is just **string slicing at agreed offsets**. In DataWeave, \`line[a to b]\` is a substring where **both** indexes are inclusive, so a field of length \`n\` starting at \`a\` is \`line[a to a + n - 1]\`.

- Splitting on \`"\\n"\` and then removing a trailing \`\\r\` handles both Unix and Windows line endings.
- The \`text\` helper trims padding and turns an all-blank field into \`null\`.
- When the sender trims trailing spaces, \`line[49 to 50]\` is out of range; DataWeave returns \`null\` for that, and \`trim(null)\` is \`null\`, so \`country\` becomes \`null\` without a special case.
- \`"00452500" as Number\` is \`452500\`; dividing by 100 gives the amount. Leading zeros are not a problem for numbers — but they would be for an id, which is why \`employeeId\` stays a string.

Common traps:
- Naming a function parameter \`to\` (\`fun text(line, from, to)\`): \`to\` is the range operator, so \`line[from to to]\` does not compile.
- Using exclusive end offsets (Java's \`substring(8, 23)\` habit): every field shifts by one character.
- Forgetting the \`\\r\` on Windows files: the last field of every line ends with an invisible carriage return, so \`country\` becomes \`"NL\\r"\`.
- Stopping at \`as Date {format: "yyyyMMdd"}\`: the parsed Date keeps its format, so the JSON writer prints \`"20261101"\` again. Add \`as String {format: "yyyy-MM-dd"}\` to re-format.
- Coercing a blank date or salary: if those fields can be blank in your feed, guard them like the text fields.
`,
  tests: [
    {
      name: 'Windows line endings and a trailing comment',
      inputs: [
        {
          name: 'payload',
          mime: 'text/plain',
          content: 'EMP00901LI             WEI       2023010200012345DE\r\n# END OF FILE 1 RECORD\r\n',
        },
      ],
      expected:
        '[{ "employeeId": "EMP00901", "lastName": "LI", "firstName": "WEI", "startDate": "2023-01-02", "monthlySalary": 123.45, "country": "DE" }]',
    },
    {
      name: 'Only comments and blank lines',
      inputs: [{ name: 'payload', mime: 'text/plain', content: '# EMPTY RUN\n\n   \n' }],
      expected: '[]',
    },
  ],
  followUps: [
    {
      q: 'Is there a built-in way to read fixed-width files in Mule?',
      a: 'Yes: the flat file format (`application/flatfile`) with a schema (`.ffd`) that declares each field\'s width and type. DataWeave then reads the file into objects directly, and the same schema can write fixed-width output.',
    },
    {
      q: 'How would you write a fixed-width file?',
      a: 'Pad each field to its width and concatenate: `rightPad(name, 15)` for text and `leftPad(amount as String, 8, "0")` for numbers from `dw::core::Strings`, joined with `"\\n"` and written as `text/plain` — or use the flat file writer with the same schema.',
    },
    {
      q: 'The file has 2 million lines. What changes?',
      a: '`splitBy` on the whole payload materializes everything in memory. Read the file in streaming mode (e.g. the flat file reader with streaming, or File connector + Batch) so records are processed as they are read.',
    },
  ],
}
