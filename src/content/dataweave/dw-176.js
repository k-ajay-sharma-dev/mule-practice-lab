export default {
  id: 'dw-176',
  category: 'dataweave',
  title: 'Read a Fixed Width Receipts File From a Distribution Center FTP Server',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'ftp', 'planning-platform', 'fixed-width', 'header-trailer', 'text/plain', 'receipts-feed', 'json'],
  estMinutes: 22,
  description: `
Brindle Outdoor distribution centers write a daily receipts file to their FTP server. Mule collects it and passes the receipts on to the planning platform. The file is fixed width text, one record per line:

| Record | Positions (from 0) | Fields |
| --- | --- | --- |
| Header | 0 to 2 \`HDR\`, 3 to 6, 7 to 14 | dc, date \`yyyyMMdd\` |
| Detail | 0 to 2 \`RCV\`, 3 to 10, 11 to 22, 23 to 28, 29 to 30 | po, sku padded with spaces, qty zero padded, uom |
| Trailer | 0 to 2 \`TRL\`, 3 to 8, 9 to 17 | record count, total qty |

A detail line must be exactly 31 characters long.

Build JSON:

- \`dc\` and \`receiptDate\`, written as \`yyyy-MM-dd\`
- \`receipts\`: one per detail line of the right length, in order, with \`po\`, \`sku\` without the padding, \`qty\` as a number and \`uom\`
- \`errors\`, in this order:
  - \`Line N has length L, expected 31\` for each detail line of the wrong length, where N counts every line of the file from 1
  - \`Missing trailer\` when there is no trailer. Then the trailer checks do not run.
  - \`Trailer count X does not match Y detail lines\`, where Y counts every detail line, good or bad
  - \`Trailer total X does not match Y\`, where Y is the sum of qty over the good receipts
- \`valid\`: \`true\` when there are no errors

Skip blank lines. Numbers in messages are written without leading zeros. Output the keys in the order \`dc\`, \`receiptDate\`, \`valid\`, \`errors\`, \`receipts\`, with empty lists when there is nothing to list.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'text/plain',
      content: `HDRDC0120261117
RCV40001234TENT-2P-GRN 000024EA
RCV40001234STOVE-CMP-1 000010EA
RCV40001240LANTERN-LED 000006CS
TRL000003000000040
`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "dc": "DC01",
  "receiptDate": "2026-11-17",
  "valid": true,
  "errors": [],
  "receipts": [
    { "po": "40001234", "sku": "TENT-2P-GRN", "qty": 24, "uom": "EA" },
    { "po": "40001234", "sku": "STOVE-CMP-1", "qty": 10, "uom": "EA" },
    { "po": "40001240", "sku": "LANTERN-LED", "qty": 6, "uom": "CS" }
  ]
}`,
  },
  starterCode: `%dw 2.0
output application/json
var lines = payload splitBy "\\n"
---
{
  dc: lines[0][3 to 6],
  receipts: lines filter ($ startsWith "RCV")
}
`,
  hints: [
    'Keep the line number before you drop blank lines: `(payload splitBy "\\n") map (l, i) -> { n: i + 1, text: l }`, then filter on `trim($.text) != ""`.',
    'A string range gives a field: `text[11 to 22]` is the sku with its padding. `trim` removes the spaces.',
    'Check `sizeOf(l.text) == 31` before you cut the fields. A short line would fail on the range.',
    '`"000024" as Number` gives 24, which also takes care of the leading zeros in messages.',
  ],
  solution: `%dw 2.0
output application/json

var lines = ((payload splitBy "\\n") map (l, i) -> { n: i + 1, text: l })
  filter (trim($.text) != "")

fun ofType(t) = lines filter ($.text startsWith t)

var header = ofType("HDR")[0].text
var trailer = ofType("TRL")[0].text
var details = ofType("RCV")
var good = details filter (sizeOf($.text) == 31)
var bad = details filter (sizeOf($.text) != 31)

var receipts = good map (d) -> {
  po: d.text[3 to 10],
  sku: trim(d.text[11 to 22]),
  qty: d.text[23 to 28] as Number,
  uom: d.text[29 to 30]
}

var total = receipts reduce ((r, acc = 0) -> acc + r.qty)

var lengthErrors = bad map (d) -> "Line $(d.n) has length $(sizeOf(d.text)), expected 31"

var trailerErrors =
  if (trailer == null) ["Missing trailer"]
  else do {
    var count = trailer[3 to 8] as Number
    var sum = trailer[9 to 17] as Number
    ---
    (if (count != sizeOf(details)) ["Trailer count $(count) does not match $(sizeOf(details)) detail lines"] else [])
    ++ (if (sum != total) ["Trailer total $(sum) does not match $(total)"] else [])
  }

var errors = lengthErrors ++ trailerErrors
---
{
  dc: header[3 to 6],
  receiptDate: header[7 to 14] as Date {format: "yyyyMMdd"} as String {format: "yyyy-MM-dd"},
  valid: isEmpty(errors),
  errors: errors,
  receipts: receipts
}`,
  explanation: `
**Positions, not separators.** A fixed width file has no delimiter. Each field sits at known positions, so a string range such as \`text[23 to 28]\` reads it. Text fields are padded with spaces, which \`trim\` removes. Numbers are padded with zeros, which \`as Number\` drops.

**Line numbers before filtering.** Support staff open the file and look for line 3. Numbering every line before dropping blanks keeps the number in the message the same as in an editor.

**Length first.** A line of the wrong length has every later field shifted. Reading it would give a wrong sku or quantity without any error. Checking the length first keeps those lines out of the receipts and reports them.

**Trailer checks.** The count is compared with every detail line, because the writer counted every line it wrote. The total is compared with the good receipts only, so a bad line also shows up as a total gap. Both together tell support that the file is not safe to pass on.
`,
  tests: [
    {
      name: 'A short detail line',
      inputs: [
        {
          name: 'payload',
          mime: 'text/plain',
          content: 'HDRDC0220261117\nRCV40001300TENT-2P-GRN 000024EA\nRCV40001301ROPE-20M 000005EA\nTRL000002000000029\n',
        },
      ],
      expected:
        '{ "dc": "DC02", "receiptDate": "2026-11-17", "valid": false, "errors": ["Line 3 has length 28, expected 31", "Trailer total 29 does not match 24"], "receipts": [{ "po": "40001300", "sku": "TENT-2P-GRN", "qty": 24, "uom": "EA" }] }',
    },
    {
      name: 'No trailer and a blank line',
      inputs: [
        {
          name: 'payload',
          mime: 'text/plain',
          content: 'HDRDC0320261116\n\nRCV40001400LANTERN-LED 000012CS\n',
        },
      ],
      expected:
        '{ "dc": "DC03", "receiptDate": "2026-11-16", "valid": false, "errors": ["Missing trailer"], "receipts": [{ "po": "40001400", "sku": "LANTERN-LED", "qty": 12, "uom": "CS" }] }',
    },
  ],
  followUps: [
    {
      q: 'The file comes from a Windows server and each line ends with CR LF. What breaks?',
      a: 'Every line is one character longer, so the length check fails. Transfer in binary mode and remove a trailing carriage return, or split on CR LF.',
    },
    {
      q: 'Could you use the flat file format in DataWeave instead?',
      a: 'Yes. A flat file schema describes the records and lets DataWeave read them as structured data. For a small layout, ranges are clear and need no schema file.',
    },
    {
      q: 'Should a file with one bad line go to the planning platform?',
      a: 'Agree it with the business. Many teams hold the whole file, because receipts drive stock and a missing line gives wrong plans.',
    },
  ],
}
