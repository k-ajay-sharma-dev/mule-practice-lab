export default {
  id: 'dw-171',
  category: 'dataweave',
  title: 'Write a Fixed Width Sales File With Header and Trailer for the Planning Platform',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'sftp', 'planning-platform', 'fixed-width', 'header-trailer', 'text/plain', 'sales-feed', 'number-format'],
  estMinutes: 25,
  description: `
Brindle Outdoor sends daily store sales to the planning platform over SFTP. The platform expects a fixed width text file. Mule reads the sales rows from the database and writes the file.

Each line has fixed positions. Numbers are padded on the left with zeros. Text is padded on the right with spaces and cut to its width.

| Record | Layout |
|---|---|
| Header | \`HDR\`, sender (10, text), file date (8, \`yyyyMMdd\`), \`SALESDLY\` |
| Detail | \`DTL\`, store (5, number), SKU (15, text), sales date (8, \`yyyyMMdd\`), units (7, number), net amount in cents (10, number) |
| Trailer | \`TRL\`, detail count (7, number), total units (9, number), total amount in cents (12, number) |

The net amount comes as a decimal such as 389.97, which is 38997 cents. The trailer totals add up the detail values. Write the header, the detail lines in input order, then the trailer, joined with \`\\n\` and with no newline after the trailer. A day with no rows still has the header and a trailer of zeros.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{
  "sender": "BRINDLE",
  "fileDate": "2026-11-18",
  "rows": [
    { "STORE_ID": 12, "SKU": "TENT-2P-GRN", "SALES_DATE": "2026-11-17", "UNITS": 3, "NET_AMOUNT": 389.97 },
    { "STORE_ID": 12, "SKU": "STOVE-CMP-1", "SALES_DATE": "2026-11-17", "UNITS": 1, "NET_AMOUNT": 54.5 },
    { "STORE_ID": 207, "SKU": "SLEEPINGBAG-WINTER-XL", "SALES_DATE": "2026-11-17", "UNITS": 2, "NET_AMOUNT": 259.98 }
  ]
}`,
    },
  ],
  expected: {
    mime: 'text/plain',
    content: `HDRBRINDLE   20261118SALESDLY
DTL00012TENT-2P-GRN    2026111700000030000038997
DTL00012STOVE-CMP-1    2026111700000010000005450
DTL00207SLEEPINGBAG-WIN2026111700000020000025998
TRL0000003000000006000000070445`,
  },
  starterCode: `%dw 2.0
output text/plain
---
(payload.rows map (r) -> "DTL" ++ r.STORE_ID ++ r.SKU) joinBy "\\n"
`,
  hints: [
    'Zero pad a number with `leftPad(r.UNITS as String, 7, "0")` from `dw::core::Strings`.',
    'For text, write `fun text(s, n) = rightPad(s, n)[0 to n - 1]` with `rightPad` from `dw::core::Strings`. It pads short values and cuts long ones.',
    'Work out the cents once per row with `round(r.NET_AMOUNT * 100)`, and add the rounded cents for the trailer, so the total matches the lines.',
    'Build a list: the header, then the detail lines, then the trailer, and finish with `joinBy "\\n"`. Use `reduce` with a start value of 0 for the totals, so an empty file still works.',
  ],
  solution: `%dw 2.0
import leftPad, rightPad from dw::core::Strings
output text/plain

fun num(n, width) = leftPad(n as String, width, "0")
fun text(s, width) = rightPad(s default "", width)[0 to width - 1]
fun ymd(d) = d as Date as String {format: "yyyyMMdd"}

var details = payload.rows map (r) -> {
  store: r.STORE_ID,
  sku: r.SKU,
  salesDate: r.SALES_DATE,
  units: r.UNITS,
  cents: round(r.NET_AMOUNT * 100)
}

var header = "HDR" ++ text(payload.sender, 10) ++ ymd(payload.fileDate) ++ "SALESDLY"

var lines = details map (d) ->
  "DTL" ++ num(d.store, 5) ++ text(d.sku, 15) ++ ymd(d.salesDate) ++ num(d.units, 7) ++ num(d.cents, 10)

var totalUnits = details reduce ((d, acc = 0) -> acc + d.units)
var totalCents = details reduce ((d, acc = 0) -> acc + d.cents)

var trailer = "TRL" ++ num(sizeOf(details), 7) ++ num(totalUnits, 9) ++ num(totalCents, 12)
---
([header] ++ lines ++ [trailer]) joinBy "\\n"`,
  explanation: `
**Fixed width means fixed positions.** The receiver reads each field by position, not by a separator. A field one character too long shifts every field after it, so each value is padded and cut to its width.

**Numbers.** \`leftPad\` with \`"0"\` fills the field with zeros on the left. The \`num\` helper takes the width, so each field states its width once. It does not cut a number that is too wide, which is right: a cut amount would be wrong money, so a too large value should fail the checks instead.

**Text.** \`rightPad\` adds spaces on the right, and the range \`[0 to width - 1]\` cuts a long value. \`SLEEPINGBAG-WINTER-XL\` becomes \`SLEEPINGBAG-WIN\`. Agree with the receiver whether cutting is allowed, or whether a long SKU is an error.

**Money in cents.** Fixed width files often carry amounts as whole numbers with an implied decimal point. Rounding each line once, and adding the rounded values for the trailer, makes the total equal the sum of the lines the receiver reads.

**Header and trailer.** The header names the sender, the date and the file type. The trailer count and totals let the platform check that it got every line.
`,
  tests: [
    {
      name: 'No sales for the day',
      inputs: [{ name: 'payload', mime: 'application/json', content: '{ "sender": "BRINDLE", "fileDate": "2026-12-25", "rows": [] }' }],
      expected: 'HDRBRINDLE   20261225SALESDLY\nTRL0000000000000000000000000000',
    },
    {
      name: 'A long sender name is cut',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content:
            '{ "sender": "BRINDLEOUTDOOR", "fileDate": "2026-11-19", "rows": [{ "STORE_ID": 3, "SKU": "MAP-01", "SALES_DATE": "2026-11-18", "UNITS": 10, "NET_AMOUNT": 19.9 }] }',
        },
      ],
      expected:
        'HDRBRINDLEOUT20261119SALESDLY\nDTL00003MAP-01         2026111800000100000001990\nTRL0000001000000010000000001990',
    },
  ],
  followUps: [
    {
      q: 'A return has negative units. How would the layout show it?',
      a: 'Agree a sign rule with the receiver, such as a separate sign character before the field or a negative format pattern, and test it. Zero padding alone cannot hold a minus sign in a fixed position.',
    },
    {
      q: 'A SKU holds an accented letter. What can go wrong?',
      a: 'The receiver may count bytes, not characters. In UTF-8 the letter takes two bytes and shifts the line. Agree the encoding, or write the file in a single byte encoding.',
    },
    {
      q: 'Why not use the flat file format with a schema instead?',
      a: 'For a large or complex layout, a flat file schema is clearer and handles padding for you. For a three record layout, a short script is clear to read and test.',
    },
  ],
}
