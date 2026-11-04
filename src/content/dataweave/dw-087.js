export default {
  id: 'dw-087',
  category: 'dataweave',
  title: 'Parse a Multi-Record Fixed-Position Stock File as a Flat File Stand-In',
  level: 'ADVANCED',
  tags: ['fixed-width', 'flat-file', 'data-formats', 'json', 'text/plain', 'substring', 'control-totals'],
  estMinutes: 35,
  description: `
A warehouse system on an IBM i platform sends its stock movements as a fixed-position text file. A Mule flow picks the file up with \`file:listener\` and passes the movements to the inventory API as JSON.

**Stand-in notice.** In Mule, this file would be read with the Flat File format (\`application/flatfile\`) and a schema file that describes each record. **The DataWeave CLI behind this site does not include that format**, so here the file arrives as \`text/plain\` and you cut the fields out by position, using string functions. The positions below are exactly what such a schema would declare.

The first character of each line is the record type. A file has one header, any number of details, and one trailer.

**Header \`H\`** (positions are 0-based)

| Field | Start | Length | Notes |
|---|---|---|---|
| batch id | 1 | 8 | |
| business date | 9 | 8 | \`yyyyMMdd\` |
| warehouse | 17 | 4 | |

**Detail \`D\`**

| Field | Start | Length | Notes |
|---|---|---|---|
| sku | 1 | 10 | right-padded with spaces |
| description | 11 | 20 | right-padded with spaces |
| quantity | 31 | 6 | zero-padded digits |
| sign | 37 | 1 | \`+\` or \`-\` |
| unit cost | 38 | 7 | zero-padded digits in **cents** |
| reason | 45 | 2 | absent when the sender strips trailing spaces |

**Trailer \`T\`**

| Field | Start | Length | Notes |
|---|---|---|---|
| record count | 1 | 6 | number of detail lines |
| net quantity | 7 | 8 | zero-padded digits |
| sign | 15 | 1 | \`+\` or \`-\` |

**Rules**
- Lines end in \`\\n\` or \`\\r\\n\`. Ignore blank lines.
- \`batch\`: \`{ id, businessDate, warehouse }\`, with the date as \`yyyy-MM-dd\`.
- \`movements\`: one object per detail in file order, \`{ sku, description, qty, unitCost, value, reason }\`. \`qty\` is signed, \`unitCost\` is in the currency unit, \`value\` is \`qty * unitCost\`, and \`reason\` is \`null\` when absent or blank.
- \`control\`: \`{ expectedCount, actualCount, expectedNetQty, actualNetQty, balanced }\`. The expected values come from the trailer, and the actual values are computed from the details. \`balanced\` is true only when both pairs agree.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'text/plain',
      content: `HBT26041120261102AMS1
DWH-100    Desk Lamp           000012+0002495RC
DWH-205    Cable Tray, 2 m     000003-0001200DM
DWH-300    Footrest            000040+0003950
T00000300000049+
`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "batch": { "id": "BT260411", "businessDate": "2026-11-02", "warehouse": "AMS1" },
  "movements": [
    { "sku": "WH-100", "description": "Desk Lamp", "qty": 12, "unitCost": 24.95, "value": 299.40, "reason": "RC" },
    { "sku": "WH-205", "description": "Cable Tray, 2 m", "qty": -3, "unitCost": 12.00, "value": -36.00, "reason": "DM" },
    { "sku": "WH-300", "description": "Footrest", "qty": 40, "unitCost": 39.50, "value": 1580.00, "reason": null }
  ],
  "control": { "expectedCount": 3, "actualCount": 3, "expectedNetQty": 49, "actualNetQty": 49, "balanced": true }
}`,
  },
  starterCode: `%dw 2.0
import substring from dw::core::Strings
output application/json
---
payload splitBy "\\n"
`,
  hints: [
    'Clean up the lines first: split on `"\\n"`, remove a trailing `\\r` with `replace /\\r$/ with ""`, and drop lines that are blank after `trim`.',
    '`substring(text, from, until)` from `dw::core::Strings` is 0-based and `until` is exclusive, so a helper can take the start and length from the layout: `fun field(line, start, length) = trim(substring(line, start, start + length))`.',
    'Pick record types with `filter`: `lines filter ((l) -> l startsWith "D")`. The header and trailer are element 0 of their own filters.',
    'Zero-padded digits convert directly: `"000012" as Number` is `12`. Cents are divided by 100, and the sign becomes a multiplier.',
    'Parse the movements first, then compute the control block from the parsed list: `sum(movements map ((m) -> m.qty))`.',
    'A Date keeps the format it was parsed with, so reformat in two steps: `as Date { format: "yyyyMMdd" } as String { format: "yyyy-MM-dd" }`.',
  ],
  solution: `%dw 2.0
import substring from dw::core::Strings
output application/json

fun field(line: String, start: Number, length: Number): String =
  trim(substring(line, start, start + length))

fun signed(digits: String, sign: String): Number =
  (if (sign == "-") -1 else 1) * (digits as Number)

var lines = ((payload splitBy "\\n") map ((l) -> l replace /\\r$/ with ""))
  filter ((l) -> trim(l) != "")

var header = (lines filter ((l) -> l startsWith "H"))[0]
var trailer = (lines filter ((l) -> l startsWith "T"))[0]

var movements = (lines filter ((l) -> l startsWith "D")) map ((l) -> do {
  var qty = signed(field(l, 31, 6), field(l, 37, 1))
  var unitCost = (field(l, 38, 7) as Number) / 100
  var reason = field(l, 45, 2)
  ---
  {
    sku: field(l, 1, 10),
    description: field(l, 11, 20),
    qty: qty,
    unitCost: unitCost,
    value: qty * unitCost,
    reason: if (reason == "") null else reason
  }
})

var expectedCount = field(trailer, 1, 6) as Number
var expectedNetQty = signed(field(trailer, 7, 8), field(trailer, 15, 1))
var actualCount = sizeOf(movements)
var actualNetQty = sum(movements map ((m) -> m.qty))
---
{
  batch: {
    id: field(header, 1, 8),
    businessDate: field(header, 9, 8) as Date { format: "yyyyMMdd" } as String { format: "yyyy-MM-dd" },
    warehouse: field(header, 17, 4)
  },
  movements: movements,
  control: {
    expectedCount: expectedCount,
    actualCount: actualCount,
    expectedNetQty: expectedNetQty,
    actualNetQty: actualNetQty,
    balanced: expectedCount == actualCount and expectedNetQty == actualNetQty
  }
}`,
  explanation: `
**Layout as code.** \`field(line, start, length)\` takes the same numbers as the record layout, so the script can be checked against the specification line by line. \`substring\` takes an exclusive end position, and calculating it in one place avoids off-by-one errors in every field.

**Short lines.** The sender strips trailing spaces, so the last detail stops after the unit cost. \`substring\` returns what is there, which here is an empty string, and the mapping turns that into the \`null\` the rules ask for. A range selector such as \`line[45 to 46]\` returns \`null\` when the range runs past the end, so the two approaches differ on short lines, which is one reason to keep the access in a single helper.

**Implied decimals and separate signs.** Fixed-position files often carry no decimal point and put the sign in its own column. \`0002495\` means 24.95, and \`000003\` with \`-\` means -3. Both are decoded immediately, so everything after that uses real numbers.

**Control totals.** The trailer exists to detect a truncated or altered file. Here the mapping reports the result and leaves the decision to the flow, for example routing an unbalanced file to a quarantine folder instead of posting it.

**What the real Flat File format changes.** With \`application/flatfile\`, the positions, types and record identification move into a schema file referenced by the \`schemaPath\` reader property, and the script works on structured records. The format supports several record types in one message, and the schema defines how they are told apart. The control check stays your own logic.
`,
  tests: [
    {
      name: 'Windows line endings, a blank line and a file that does not balance',
      inputs: [
        {
          name: 'payload',
          mime: 'text/plain',
          content:
            'HBT26041220261103RTM2\r\nDXK-9      Shelf Bracket       000100-0000075ST\r\n\r\nDXK-10     Wall Plug 8 mm      000020+0000005RC\r\nT00000300000079-\r\n',
        },
      ],
      expected:
        '{ "batch": { "id": "BT260412", "businessDate": "2026-11-03", "warehouse": "RTM2" }, "movements": [ { "sku": "XK-9", "description": "Shelf Bracket", "qty": -100, "unitCost": 0.75, "value": -75.00, "reason": "ST" }, { "sku": "XK-10", "description": "Wall Plug 8 mm", "qty": 20, "unitCost": 0.05, "value": 1.00, "reason": "RC" } ], "control": { "expectedCount": 3, "actualCount": 2, "expectedNetQty": -79, "actualNetQty": -80, "balanced": false } }',
    },
    {
      name: 'A batch with no movements balances at zero',
      inputs: [
        {
          name: 'payload',
          mime: 'text/plain',
          content: 'HBT26041320261104EIN3\nT00000000000000+',
        },
      ],
      expected:
        '{ "batch": { "id": "BT260413", "businessDate": "2026-11-04", "warehouse": "EIN3" }, "movements": [], "control": { "expectedCount": 0, "actualCount": 0, "expectedNetQty": 0, "actualNetQty": 0, "balanced": true } }',
    },
  ],
  followUps: [
    {
      q: 'On a real project, which DataWeave reader settings would replace most of this script?',
      a: 'The input would be `application/flatfile` with `schemaPath` pointing to the schema file, which is required. When the schema holds several structures, `structureIdent` selects one, and `recordParsing` (default `strict`, which expects a line break at the exact end of each record) controls how records are separated. The other documented values are `lenient`, `noTerminator` and `singleRecord`.',
    },
    {
      q: 'The control check fails. Why is that better detected here than in the inventory API?',
      a: 'The trailer describes the file as a whole, and only this step sees the whole file. If the movements were posted first, a truncated file would have been partly applied, and undoing that is far harder than holding the file back and asking for a resend.',
    },
  ],
}
