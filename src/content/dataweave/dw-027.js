export default {
  id: 'dw-027',
  category: 'dataweave',
  title: 'Normalize Shipments XML with Optional and Repeated Elements',
  level: 'INTERMEDIATE',
  tags: ['xml', 'multi-value-selector', 'default', 'attributes'],
  estMinutes: 20,
  description: `
A carrier aggregator sends shipment status as XML. Some elements repeat, some are optional, and a file may contain a **single** shipment. The tracking Experience API wants clean, predictable JSON.

Return an array with one object per \`Shipment\`, in document order:

- \`id\` — the \`id\` attribute of \`Shipment\`
- \`carrier\` — text of \`Carrier\`
- \`trackingNumber\` — text of \`Tracking\`, or \`null\` when the element is absent
- \`packages\` — one number per \`Package\`: its weight **in kilograms**. \`Weight\` has a \`unit\` attribute of \`kg\` or \`g\` (grams are divided by 1000). No packages → \`[]\`.
- \`totalWeightKg\` — sum of \`packages\` (\`0\` when there are none)

Every field must always be present, even when the XML has no value for it.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/xml',
      content: `<?xml version="1.0" encoding="UTF-8"?>
<Shipments>
  <Shipment id="S-100">
    <Carrier>DHL</Carrier>
    <Tracking>JD0146000032</Tracking>
    <Package><Weight unit="kg">2.5</Weight></Package>
    <Package><Weight unit="g">750</Weight></Package>
  </Shipment>
  <Shipment id="S-101">
    <Carrier>UPS</Carrier>
    <Package><Weight unit="kg">4</Weight></Package>
  </Shipment>
  <Shipment id="S-102">
    <Carrier>PostNL</Carrier>
    <Tracking>3SABCD123</Tracking>
  </Shipment>
</Shipments>`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `[
  { "id": "S-100", "carrier": "DHL", "trackingNumber": "JD0146000032", "packages": [2.5, 0.75], "totalWeightKg": 3.25 },
  { "id": "S-101", "carrier": "UPS", "trackingNumber": null, "packages": [4], "totalWeightKg": 4 },
  { "id": "S-102", "carrier": "PostNL", "trackingNumber": "3SABCD123", "packages": [], "totalWeightKg": 0 }
]`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload
`,
  hints: [
    '`payload.Shipments.Shipment` returns only the **first** match. Use the multi-value selector `*Shipment` to get all of them as an array.',
    'For a shipment without packages, `s.*Package` is `null`, not `[]` — add `default []`.',
    'Attributes are read with `@`: `p.Weight.@unit`. Element text is a String, so coerce with `as Number`.',
  ],
  solution: `%dw 2.0
output application/json

fun toKg(w) =
  if (w.@unit == "g") (w as Number) / 1000 else w as Number
---
payload.Shipments.*Shipment map (s) -> do {
  var packages = (s.*Package default []) map (p) -> toKg(p.Weight)
  ---
  {
    id: s.@id,
    carrier: s.Carrier,
    trackingNumber: s.Tracking,
    packages: packages,
    totalWeightKg: sum(packages)
  }
}`,
  explanation: `
XML has no arrays, only repeated elements, so DataWeave reads \`<Package>\` twice as an object with two \`Package\` keys:

- \`s.Package\` — the **first** \`Package\` only. With a single shipment or a single package this looks right and hides the bug until production.
- \`s.*Package\` — **all** \`Package\` values as an array. When there are none, the result is \`null\`, hence \`default []\`.

Absent optional elements select as \`null\` (\`s.Tracking\`), which is exactly what the JSON should contain.

\`w.@unit\` reads an attribute of the \`Weight\` element; \`w as Number\` reads its text. \`sum([])\` is \`0\`, so no special case is needed for the total.
`,
  tests: [
    {
      name: 'Single shipment, grams only, no tracking',
      inputs: [
        {
          name: 'payload',
          mime: 'application/xml',
          content: `<Shipments>
  <Shipment id="S-9">
    <Carrier>GLS</Carrier>
    <Package><Weight unit="g">500</Weight></Package>
  </Shipment>
</Shipments>`,
        },
      ],
      expected: '[{ "id": "S-9", "carrier": "GLS", "trackingNumber": null, "packages": [0.5], "totalWeightKg": 0.5 }]',
    },
  ],
  followUps: [
    {
      q: 'What does `payload.Shipments.Shipment.Carrier` return when there are three shipments?',
      a: 'Only `"DHL"` — the single-value selector picks the first match at each step. `payload.Shipments.*Shipment.Carrier` returns all three carriers as an array.',
    },
    {
      q: 'How would you read every `Weight` in the document, regardless of nesting?',
      a: 'Use the descendants selector: `payload..Weight` (or `payload..*Weight` to be sure to get all repeated matches).',
    },
    {
      q: 'What changes if the XML uses a namespace, e.g. `<s:Shipments xmlns:s="...">`?',
      a: 'Declare it with `ns s http://...` and select with `payload.s#Shipments.*s#Shipment`. Selecting without the namespace still matches by local name, but being explicit avoids clashes.',
    },
  ],
}
