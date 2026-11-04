export default {
  id: 'dw-059',
  category: 'dataweave',
  title: 'Rebuild the HL Hierarchy of an X12 856 Ship Notice',
  level: 'EXPERT',
  tags: ['supply-chain', 'edi', 'x12', '856', 'asn', 'reduce', 'hierarchy', 'text/plain'],
  estMinutes: 45,
  description: `
A supplier sends an **advance ship notice** (X12 **856**) before the truck arrives, so the DC can plan receiving and scan pallets by their SSCC labels. The file is \`text/plain\` (segments end with \`~\`, elements are separated by \`*\`; trim segments and ignore empty ones).

An 856 is a **flat list of segments** that describes a **tree** through \`HL\` (hierarchical level) segments:

| Element | Meaning |
|---|---|
| \`HL01\` | id of this level |
| \`HL02\` | id of the **parent** level (empty for the shipment) |
| \`HL03\` | level code: \`S\` shipment, \`O\` order, \`P\` pack (pallet/carton), \`I\` item |

All segments after an \`HL\` up to the next \`HL\` belong to that level. **Use \`HL02\` to attach levels** — do not assume a child directly follows its parent.

**Segments you need**

| Level | Segment | Field |
|---|---|---|
| (header) | \`BSN\` | \`BSN02\` ASN number, \`BSN03\` ship date \`yyyyMMdd\` |
| S | \`TD5\` | \`TD503\` carrier SCAC |
| S | \`REF\` | when \`REF01\` = \`BM\`: \`REF02\` bill of lading |
| O | \`PRF\` | \`PRF01\` PO number |
| P | \`MAN\` | \`MAN02\` SSCC |
| I | \`LIN\` | qualifier/value pairs from \`LIN02\` on: \`VP\` vendor part, \`UP\` UPC |
| I | \`SN1\` | \`SN102\` units shipped, \`SN103\` unit of measure |
| (trailer) | \`CTT\` | \`CTT01\` number of HL segments |

**Output**
- \`asnNumber\`, \`shipDate\` (\`yyyy-MM-dd\`), \`carrier\`, \`billOfLading\` (\`null\` if there is no \`REF*BM\`)
- \`orders\` (in HL order): \`poNumber\`, \`packs\` (\`sscc\`, \`items\`), \`looseItems\` (items whose parent is the order itself)
- each item: \`sku\` (VP), \`upc\` (UP or \`null\`), \`qty\` (number), \`uom\`
- \`totalUnits\`: sum of all item quantities
- \`hlCountOk\`: \`CTT01\` equals the number of \`HL\` segments
`,
  inputs: [
    {
      name: 'payload',
      mime: 'text/plain',
      content: `ST*856*0001~
BSN*00*ASN-5521*20261102*1430~
HL*1**S~
TD5*B*2*UPSN~
REF*BM*BOL-778~
HL*2*1*O~
PRF*PO-7781~
HL*3*2*P~
MAN*GM*00012345670000000017~
HL*4*3*I~
LIN**VP*SKU-100~
SN1**6*EA~
HL*5*3*I~
LIN**VP*SKU-200*UP*012345678905~
SN1**4*EA~
HL*6*2*P~
MAN*GM*00012345670000000024~
HL*7*6*I~
LIN**VP*SKU-100~
SN1**4*EA~
HL*8*1*O~
PRF*PO-7790~
HL*9*8*I~
LIN**VP*SKU-300~
SN1**12*EA~
CTT*9~
SE*27*0001~`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "asnNumber": "ASN-5521",
  "shipDate": "2026-11-02",
  "carrier": "UPSN",
  "billOfLading": "BOL-778",
  "orders": [
    {
      "poNumber": "PO-7781",
      "packs": [
        { "sscc": "00012345670000000017", "items": [
          { "sku": "SKU-100", "upc": null, "qty": 6, "uom": "EA" },
          { "sku": "SKU-200", "upc": "012345678905", "qty": 4, "uom": "EA" }
        ] },
        { "sscc": "00012345670000000024", "items": [
          { "sku": "SKU-100", "upc": null, "qty": 4, "uom": "EA" }
        ] }
      ],
      "looseItems": []
    },
    {
      "poNumber": "PO-7790",
      "packs": [],
      "looseItems": [
        { "sku": "SKU-300", "upc": null, "qty": 12, "uom": "EA" }
      ]
    }
  ],
  "totalUnits": 26,
  "hlCountOk": true
}`,
  },
  starterCode: `%dw 2.0
output application/json
var segs = (payload splitBy "~") map trim($) filter (not isEmpty($)) map ($ splitBy "*")
---
segs
`,
  hints: [
    'First tag every non-HL segment with the id of the HL it belongs to. A `reduce` that carries `{ current: <HL id>, out: [...] }` does this in one pass; then `groupBy` the tag.',
    'Build a flat list of nodes `{ id, parent, level }` from the HL segments. "Children of X at level L" is then just `nodes filter ($.parent == X and $.level == L)` — no recursion needed for a fixed 4-level shape.',
    'For `LIN`, `drop 2` and `divideBy 2` (from `dw::core::Arrays`) turn the rest into qualifier/value pairs. Remember a lambda body extends as far right as possible — wrap pipelines in parentheses.',
  ],
  solution: `%dw 2.0
import drop, divideBy from dw::core::Arrays
output application/json

var segs = (payload splitBy "~")
  map trim($)
  filter (not isEmpty($))
  map ($ splitBy "*")

// Tag each segment with the HL it belongs to
var tagged = (segs reduce ((s, acc = { current: null, out: [] }) ->
  if (s[0] == "HL") { current: s[1], out: acc.out }
  else { current: acc.current, out: acc.out ++ [{ hl: acc.current, seg: s }] })).out

var segsByHl = (tagged filter ($.hl != null)) groupBy $.hl

var nodes = (segs filter ($[0] == "HL")) map (h) -> {
  id: h[1],
  parent: h[2] default "",
  level: h[3]
}

fun segOf(hlId, tag) = ((segsByHl[hlId] default []) filter ($.seg[0] == tag)).seg
fun firstSeg(hlId, tag) = (segOf(hlId, tag) default [])[0]
fun children(parentId, level) = nodes filter ($.parent == parentId and $.level == level)
fun header(tag) = (segs filter ($[0] == tag))[0]

fun qualified(lin, q) = (((lin default []) drop 2) divideBy 2 filter ($[0] == q))[0][1]

fun item(n) = do {
  var lin = firstSeg(n.id, "LIN")
  var sn1 = firstSeg(n.id, "SN1")
  ---
  { sku: qualified(lin, "VP"), upc: qualified(lin, "UP"), qty: sn1[2] as Number, uom: sn1[3] }
}

var shipment = (nodes filter ($.level == "S"))[0]
var bsn = header("BSN")
var allItems = (nodes filter ($.level == "I")) map item($)
---
{
  asnNumber: bsn[2],
  shipDate: bsn[3] as Date {format: "yyyyMMdd"} as String {format: "yyyy-MM-dd"},
  carrier: firstSeg(shipment.id, "TD5")[3],
  billOfLading: ((segOf(shipment.id, "REF") default []) filter ($[1] == "BM"))[0][2],
  orders: children(shipment.id, "O") map (o) -> {
    poNumber: firstSeg(o.id, "PRF")[1],
    packs: children(o.id, "P") map (p) -> {
      sscc: firstSeg(p.id, "MAN")[2],
      items: children(p.id, "I") map item($)
    },
    looseItems: children(o.id, "I") map item($)
  },
  totalUnits: sum(allItems.qty default []),
  hlCountOk: (header("CTT")[1] as Number) == sizeOf(nodes)
}`,
  explanation: `
The 856 is a tree serialised as a list. The solution turns it back into a tree in three steps:

1. **Ownership** — one \`reduce\` walks the segments carrying the current HL id and tags every other segment with it. \`ST\`/\`BSN\` come before any HL and get \`hl: null\` (filtered out); \`CTT\`/\`SE\` are tagged to the last HL, which is harmless because nobody looks for them there.
2. **Nodes** — the HL segments become \`{ id, parent, level }\`. Note \`HL*1**S\` splits into \`["HL", "1", "", "S"]\`: the empty parent keeps its position.
3. **Assembly** — \`children(parentId, level)\` filters the node list. Because the 856 shape is fixed (S → O → P → I, or O → I), nesting \`map\`s three levels deep is clearer than a generic recursive builder.

Why \`HL02\` and not position? Partners may send all orders first and their packs later (the hidden test does). A "remember the last order I saw" approach silently puts items under the wrong PO — the kind of bug that only shows up as a receiving discrepancy at the dock.

Engine details:
- \`segOf\` uses the multi-value selector \`.seg\`, which returns \`null\` on an empty array, hence the \`default []\` in the callers.
- \`drop 2\` skips the segment id and \`LIN01\` (an assigned id, usually empty), so the qualifier pairs line up regardless of how many there are or their order.
- \`totalUnits\` sums **all** \`I\` levels, loose or packed, in one pass over the nodes.

Common traps:
- Counting segments instead of HLs for \`hlCountOk\` (\`CTT01\` in an 856 is the HL count).
- Reading the SCAC from \`TD502\` — that is the code qualifier (\`2\` = SCAC); the code itself is \`TD503\`.
`,
  tests: [
    {
      name: 'Orders listed before their packs, no bill of lading, wrong CTT',
      inputs: [
        {
          name: 'payload',
          mime: 'text/plain',
          content:
            'ST*856*0002~BSN*00*ASN-9*20260115*0800~HL*1**S~TD5*B*2*FDEG~HL*2*1*O~PRF*PO-A~HL*3*1*O~PRF*PO-B~HL*4*2*P~MAN*GM*SSCC-1~HL*5*4*I~LIN**VP*X-1~SN1**2*EA~HL*6*3*I~LIN**UP*111*VP*X-2~SN1**3*CS~CTT*7~SE*18*0002~',
        },
      ],
      expected: `{
  "asnNumber": "ASN-9",
  "shipDate": "2026-01-15",
  "carrier": "FDEG",
  "billOfLading": null,
  "orders": [
    { "poNumber": "PO-A", "packs": [ { "sscc": "SSCC-1", "items": [ { "sku": "X-1", "upc": null, "qty": 2, "uom": "EA" } ] } ], "looseItems": [] },
    { "poNumber": "PO-B", "packs": [], "looseItems": [ { "sku": "X-2", "upc": "111", "qty": 3, "uom": "CS" } ] }
  ],
  "totalUnits": 5,
  "hlCountOk": false
}`,
    },
  ],
  followUps: [
    {
      q: 'What is the difference between "standard pack" and "pick and pack" 856 structures?',
      a: 'Standard pack (S-O-P-I) puts packs under orders, as here. Pick and pack (S-O-T-P-I or S-T-P-O-I variants) adds tare (pallet) levels or puts orders under packs when one carton holds several orders. Trading partner guides specify which one they send, and the HL-parent approach handles both if the assembly step is driven by level codes.',
    },
    {
      q: 'How would a real Mule implementation receive and acknowledge this ASN?',
      a: 'Read it with the X12 EDI connector (validating against the 856 schema), return a 997/999 functional acknowledgment, then map the parsed structure. Partner Manager can handle the envelope, partner identification and acknowledgments for you.',
    },
    {
      q: 'The DC wants to receive the ASN in its WMS before the truck arrives. Where would you persist it?',
      a: 'Usually post it to the WMS as an expected receipt (by SSCC and PO line) and keep a copy keyed by ASN number for reconciliation. If the WMS is down, put the canonical message on a durable queue (for example an ActiveMQ queue with redelivery and a DLQ) rather than losing the ASN.',
    },
  ],
}
