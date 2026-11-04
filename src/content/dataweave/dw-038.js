export default {
  id: 'dw-038',
  category: 'dataweave',
  title: 'Build a Shipment Manifest XML from CSV Lines',
  level: 'ADVANCED',
  tags: ['csv', 'xml', 'groupBy', 'attributes', 'repeating-elements'],
  estMinutes: 30,
  description: `
The warehouse management system drops a flat CSV — one row per shipment **line** — and the carrier gateway expects one XML manifest with a \`shipment\` element per shipment and a repeating \`line\` element inside it.

Build:

\`\`\`xml
<manifest shipments="N">
  <shipment id="..." carrier="..." shipDate="..." hazmat="true">
    <line no="..." sku="..." qty="..." hazmat="true"/>
    ...
    <totalWeightKg>0.00</totalWeightKg>
  </shipment>
  ...
</manifest>
\`\`\`

**Rules**
- Group rows by \`shipmentId\`. \`carrier\` and \`shipDate\` are the same on every row of a shipment.
- \`manifest@shipments\` = number of distinct shipments.
- Shipments are sorted by \`id\` ascending; lines by \`lineNo\` **numerically** ascending.
- Attribute order is exactly as shown. Line attributes come straight from the CSV columns \`lineNo\`, \`sku\`, \`qty\`.
- \`hazmat="true"\` is added to a \`line\` whose \`hazmat\` column is \`Y\`, and to a \`shipment\` with at least one such line. Otherwise the attribute is **omitted** (not \`"false"\`).
- \`totalWeightKg\` = sum of \`qty × weightKg\` over the shipment's lines, written with exactly two decimals (e.g. \`29.00\`). It comes after all \`line\` elements.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/csv',
      content: `shipmentId,carrier,shipDate,lineNo,sku,qty,weightKg,hazmat
SHP-2,DHL,2025-02-03,2,BAT-01,4,1.25,Y
SHP-1,UPS,2025-02-01,1,LMP-10,2,3.5,N
SHP-2,DHL,2025-02-03,1,CBL-07,10,0.2,N
SHP-1,UPS,2025-02-01,2,DSK-55,1,22,N
SHP-3,FEDEX,2025-02-04,1,BAT-09,1,0.75,Y`,
    },
  ],
  expected: {
    mime: 'application/xml',
    content: `<?xml version='1.0' encoding='UTF-8'?>
<manifest shipments="3">
  <shipment id="SHP-1" carrier="UPS" shipDate="2025-02-01">
    <line no="1" sku="LMP-10" qty="2"/>
    <line no="2" sku="DSK-55" qty="1"/>
    <totalWeightKg>29.00</totalWeightKg>
  </shipment>
  <shipment id="SHP-2" carrier="DHL" shipDate="2025-02-03" hazmat="true">
    <line no="1" sku="CBL-07" qty="10"/>
    <line no="2" sku="BAT-01" qty="4" hazmat="true"/>
    <totalWeightKg>7.00</totalWeightKg>
  </shipment>
  <shipment id="SHP-3" carrier="FEDEX" shipDate="2025-02-04" hazmat="true">
    <line no="1" sku="BAT-09" qty="1" hazmat="true"/>
    <totalWeightKg>0.75</totalWeightKg>
  </shipment>
</manifest>`,
  },
  starterCode: `%dw 2.0
output application/xml
---
payload
`,
  hints: [
    'Turn the rows into a list of shipments first: `(payload groupBy $.shipmentId) pluck ((rows, id) -> rows)` gives an array of row-arrays, one per shipment.',
    'Repeating elements: inside an object, `(rows map ((r) -> { line @(...): null }))` — the outer parentheses spread every `{ line: ... }` into the parent, so you get many `line` keys.',
    'Conditional attribute: `@(id: ..., (hazmat: "true") if hz)`. CSV values are strings, so sort with `orderBy ($.lineNo as Number)` and multiply with `as Number`; format the total with `as String {format: "0.00"}`.',
  ],
  solution: `%dw 2.0
import some from dw::core::Arrays
output application/xml

var shipments = ((payload groupBy $.shipmentId) pluck ((rows, id) -> rows)) orderBy $[0].shipmentId

fun weight(rows) = sum(rows map (($.qty as Number) * ($.weightKg as Number)))
---
manifest @(shipments: sizeOf(shipments)): {
  (shipments map ((rows) -> do {
    var first = rows[0]
    var hz = rows some ($.hazmat == "Y")
    ---
    {
      shipment @(id: first.shipmentId, carrier: first.carrier, shipDate: first.shipDate, (hazmat: "true") if hz): {
        ((rows orderBy ($.lineNo as Number)) map ((r) -> {
          line @(no: r.lineNo, sku: r.sku, qty: r.qty, (hazmat: "true") if r.hazmat == "Y"): null
        })),
        totalWeightKg: weight(rows) as String {format: "0.00"}
      }
    }
  }))
}`,
  explanation: `
**Flat to hierarchical.** \`groupBy\` + \`pluck\` turns the CSV into "one array of rows per shipment". Header-level data (\`carrier\`, \`shipDate\`) is read from the first row of each group.

**Repeating XML elements.** JSON-style arrays do not exist in XML: a repeated element is the **same key many times** in one object. Mapping to \`{ line: ... }\` objects and wrapping the result in \`( ... )\` inside the parent object spreads them into repeated \`line\` keys. Writing \`line: rows map ...\` instead would nest everything in a single \`line\` element.

**Attributes.** \`@( ... )\` holds the attributes; \`(key: value) if cond\` adds one conditionally, so \`hazmat\` disappears entirely when it does not apply. A \`null\` element value is written as a self-closing tag.

**Traps**
- CSV fields are **strings**: \`orderBy $.lineNo\` sorts \`"10"\` before \`"2"\`, and \`"3.5" * "2"\` will not multiply. Coerce with \`as Number\`.
- \`29\` is not \`29.00\`. Use a number format for fixed decimals.
- Chaining after a lambda without parentheses (\`pluck (...) -> rows orderBy ...\`) sorts inside the lambda.
`,
  tests: [
    {
      name: 'Numeric line sort, no hazmat, rounding',
      inputs: [
        {
          name: 'payload',
          mime: 'application/csv',
          content: `shipmentId,carrier,shipDate,lineNo,sku,qty,weightKg,hazmat
SHP-9,UPS,2025-03-01,10,K-10,3,0.333,N
SHP-9,UPS,2025-03-01,2,K-2,1,1,N
SHP-9,UPS,2025-03-01,1,K-1,2,0.1,N`,
        },
      ],
      expected: `<?xml version='1.0' encoding='UTF-8'?>
<manifest shipments="1">
  <shipment id="SHP-9" carrier="UPS" shipDate="2025-03-01">
    <line no="1" sku="K-1" qty="2"/>
    <line no="2" sku="K-2" qty="1"/>
    <line no="10" sku="K-10" qty="3"/>
    <totalWeightKg>2.20</totalWeightKg>
  </shipment>
</manifest>`,
    },
  ],
  followUps: [
    {
      q: 'How would you write an empty element as `<line></line>` instead of `<line/>`?',
      a: 'Set the XML writer property `inlineCloseOn="none"` in the output directive (`output application/xml inlineCloseOn="none"`); the default `empty` uses the self-closing form.',
    },
    {
      q: 'The CSV has 2 million lines. What changes?',
      a: 'groupBy needs the whole file in memory, so either have the source sort by shipmentId and process in streaming batches (e.g. a Batch Job or For Each over chunks), or split the file per shipment before transforming.',
    },
    {
      q: 'How do you add a namespace to `manifest`?',
      a: 'Declare it in the header — `ns mf http://example.com/manifest` — and prefix the keys: `mf#manifest`, `mf#shipment`, and so on.',
    },
  ],
}
