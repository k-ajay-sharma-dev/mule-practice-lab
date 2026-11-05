export default {
  id: 'dw-047',
  category: 'dataweave',
  title: 'Parse an X12 850 Purchase Order Segment String',
  level: 'ADVANCED',
  tags: ['edi', 'x12', 'splitBy', 'text/plain', 'divideBy'],
  estMinutes: 25,
  description: `
A retailer sends purchase orders as **X12 850** EDI. There is no EDI module in this project yet, so the integration team wants a quick DataWeave parser for a small subset. The file arrives as \`text/plain\`.

**Syntax**
- Segments end with \`~\`. Line breaks or spaces around segments are noise — trim each segment and ignore empty ones.
- Elements inside a segment are separated by \`*\`. Element 0 is the segment id; X12 positions count from 1 after it, so \`BEG03\` is element index **3**. Empty elements (\`**\`) keep their position.

**Segments used**

| Segment | Meaning |
|---|---|
| \`BEG\` | \`BEG03\` = PO number, \`BEG05\` = PO date \`yyyyMMdd\` |
| \`N1\` | party: \`N101\` = role (\`ST\` ship-to, \`BT\` bill-to), \`N102\` = name |
| \`PO1\` | line: \`PO101\` line no, \`PO102\` quantity, \`PO103\` unit, \`PO104\` unit price; from \`PO106\` on, **qualifier/value pairs** — \`VP\` = vendor part number, \`UP\` = UPC |
| \`ST\` / \`SE\` | transaction start / end; \`SE01\` = number of segments from \`ST\` to \`SE\` **inclusive** |

\`GS\`/\`GE\` (functional group envelope) can surround the transaction — they are **not** counted in \`SE01\`.

**Output**
- \`poNumber\`, \`poDate\` (formatted \`yyyy-MM-dd\`), \`shipTo\` and \`billTo\` (the N1 names; \`null\` if that role is missing)
- \`lines\`: per PO1 in order — \`line\`, \`qty\`, \`unitPrice\` (numbers), \`uom\`, \`sku\` (the \`VP\` value), \`upc\` (the \`UP\` value, or \`null\`)
- \`totalAmount\`: sum of \`qty * unitPrice\`
- \`segmentCountOk\`: \`true\` when \`SE01\` equals the actual number of segments from \`ST\` to \`SE\`
`,
  inputs: [
    {
      name: 'payload',
      mime: 'text/plain',
      content: `GS*PO*RETAILER*SUPPLIER*20261102*0930*42*X*004010~
ST*850*0001~
BEG*00*SA*PO-7781**20261102~
N1*ST*Acme Store 12~
N1*BT*Acme Finance~
PO1*1*10*EA*4.25**VP*SKU-100~
PO1*2*3*CS*18**UP*012345678905*VP*SKU-200~
CTT*2~
SE*8*0001~
GE*1*42~`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "poNumber": "PO-7781",
  "poDate": "2026-11-02",
  "shipTo": "Acme Store 12",
  "billTo": "Acme Finance",
  "lines": [
    { "line": 1, "qty": 10, "unitPrice": 4.25, "uom": "EA", "sku": "SKU-100", "upc": null },
    { "line": 2, "qty": 3, "unitPrice": 18, "uom": "CS", "sku": "SKU-200", "upc": "012345678905" }
  ],
  "totalAmount": 96.50,
  "segmentCountOk": true
}`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload
`,
  hints: [
    'Build a list of segments as arrays of elements: `(payload splitBy "~") map trim($) filter (not isEmpty($)) map ($ splitBy "*")`. Then `seg[0]` is the id and `seg[3]` is element 03.',
    'For the qualifier pairs, `drop` the first 6 elements and group the rest in pairs with `divideBy 2` (both from `dw::core::Arrays`). Then find the pair whose first entry is the qualifier.',
    'For the segment count, take the positions of `ST` and `SE` in the list of segment ids (`indexOf`) — do not just count every segment in the file.',
  ],
  solution: `%dw 2.0
import drop, divideBy from dw::core::Arrays
output application/json

var segs = (payload splitBy "~")
  map trim($)
  filter (not isEmpty($))
  map ($ splitBy "*")
var ids = segs map $[0]

fun segments(id: String) = segs filter ($[0] == id)
fun party(role: String) = (segments("N1") filter ($[1] == role))[0][2]
fun qualified(po1: Array, q: String) = ((po1 drop 6) divideBy 2 filter ($[0] == q))[0][1]

var beg = segments("BEG")[0]
var lines = segments("PO1") map (p) -> {
  line: p[1] as Number,
  qty: p[2] as Number,
  unitPrice: p[4] as Number,
  uom: p[3],
  sku: qualified(p, "VP"),
  upc: qualified(p, "UP")
}
---
{
  poNumber: beg[3],
  poDate: beg[5] as Date {format: "yyyyMMdd"} as String {format: "yyyy-MM-dd"},
  shipTo: party("ST"),
  billTo: party("BT"),
  lines: lines,
  totalAmount: sum(lines map ($.qty * $.unitPrice)),
  segmentCountOk: (segments("SE")[0][1] as Number) == (ids indexOf "SE") - (ids indexOf "ST") + 1
}`,
  explanation: `
Turning the file into an **array of arrays** (segments → elements) makes the rest plain indexing:

- \`splitBy "~"\` then \`trim\` removes the line breaks; \`filter (not isEmpty($))\` drops the empty piece after the last \`~\`.
- \`splitBy "*"\` keeps empty elements between separators, so \`BEG*00*SA*PO-7781**20261102\` still has the date at index 5. (Trailing empty elements are dropped, which is harmless here — a missing index just returns \`null\`.)
- Qualifier/value pairs are position-independent: \`UP\` may come before \`VP\`. \`drop 6\` + \`divideBy 2\` gives \`[["UP","0123..."], ["VP","SKU-200"]]\`, and a \`filter\` picks the pair. A missing qualifier gives \`[][0][1]\` → \`null\`.
- \`SE01\` counts only the transaction set, so subtract the positions of \`ST\` and \`SE\` instead of using \`sizeOf(segs)\`, which would include \`GS\`/\`GE\`.

Common traps:
- Hard-coding \`p[7]\` for the SKU — it breaks as soon as a partner sends \`UP\` first.
- Counting segments with \`sizeOf\` over the whole file (gives 10 here, not 8).
- Not trimming segments: the id of every segment after the first becomes \`"\\nBEG"\` and nothing matches.
`,
  tests: [
    {
      name: 'One line, no bill-to, wrong SE count, no line breaks',
      inputs: [
        {
          name: 'payload',
          mime: 'text/plain',
          content: 'ST*850*0002~BEG*00*SA*PO-9**20260131~N1*ST*Depot 3~PO1*1*2*EA*7.5**VP*X-1~SE*9*0002~',
        },
      ],
      expected:
        '{ "poNumber": "PO-9", "poDate": "2026-01-31", "shipTo": "Depot 3", "billTo": null, "lines": [ { "line": 1, "qty": 2, "unitPrice": 7.5, "uom": "EA", "sku": "X-1", "upc": null } ], "totalAmount": 15, "segmentCountOk": false }',
    },
  ],
  followUps: [
    {
      q: 'How would you do this in a real Mule project?',
      a: 'Use the X12 EDI connector (or Partner Manager): it validates the envelopes and segments against the X12 schema, generates 997/999 acknowledgements and gives you a typed structure, so DataWeave only maps business fields.',
    },
    {
      q: 'The partner uses `|` as element separator and a newline as segment terminator. What changes?',
      a: 'In X12 the separators are declared in the ISA segment (element separator at character 4, segment terminator after ISA16). A robust parser reads them from ISA first and passes them to `splitBy` instead of hard-coding `*` and `~`.',
    },
    {
      q: 'What is a 997 and when do you send it?',
      a: 'A Functional Acknowledgment: it tells the sender whether each received group/transaction was syntactically accepted or rejected. You send it after parsing and validating, before (and independently of) business processing.',
    },
  ],
}
