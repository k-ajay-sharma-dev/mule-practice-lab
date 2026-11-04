export default {
  id: 'dw-005',
  category: 'dataweave',
  title: 'Export Inventory as a Semicolon CSV',
  level: 'INTERMEDIATE',
  tags: ['csv', 'writer', 'filter', 'orderBy'],
  estMinutes: 15,
  description: `
A legacy warehouse system imports stock levels from a CSV file with a **semicolon** separator.

**Rules**
- Only include items that are \`active\` **and** have \`qty\` greater than 0.
- Columns, in this order: \`SKU;DESCRIPTION;LOCATION;QTY\`.
- Sort by \`LOCATION\`, then by \`SKU\`.
- First row is the header.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `[
  { "sku": "WH-100", "name": "Desk Lamp", "warehouse": "AMS", "qty": 42, "active": true },
  { "sku": "WH-101", "name": "Monitor Arm", "warehouse": "AMS", "qty": 0, "active": true },
  { "sku": "WH-205", "name": "Cable Tray", "warehouse": "RTM", "qty": 7, "active": false },
  { "sku": "WH-300", "name": "Footrest", "warehouse": "RTM", "qty": 15, "active": true }
]`,
    },
  ],
  expected: {
    mime: 'application/csv',
    content: `SKU;DESCRIPTION;LOCATION;QTY
WH-100;Desk Lamp;AMS;42
WH-300;Footrest;RTM;15`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload
`,
  hints: [
    'Writer properties go on the output directive: `output application/csv separator=";"`.',
    'The CSV writer uses the keys of the first object as the header row, in order.',
    'Warehouse codes are all 3 letters, so ordering by `$.warehouse ++ $.sku` sorts by both.',
  ],
  solution: `%dw 2.0
output application/csv separator=";"
---
payload
  filter ($.active and $.qty > 0)
  orderBy ($.warehouse ++ $.sku)
  map (i) -> {
    SKU: i.sku,
    DESCRIPTION: i.name,
    LOCATION: i.warehouse,
    QTY: i.qty
  }`,
  explanation:
    'Filtering first keeps the sort and the map working on fewer records. Header defaults to `true` for the CSV writer, so no extra property is needed.',
  tests: [
    {
      name: 'Sort by location then SKU',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: `[
  { "sku": "B-2", "name": "Bolt", "warehouse": "ZRH", "qty": 5, "active": true },
  { "sku": "A-9", "name": "Anchor", "warehouse": "ZRH", "qty": 1, "active": true },
  { "sku": "C-1", "name": "Clamp", "warehouse": "BER", "qty": 3, "active": true }
]`,
        },
      ],
      expected: `SKU;DESCRIPTION;LOCATION;QTY
C-1;Clamp;BER;3
A-9;Anchor;ZRH;1
B-2;Bolt;ZRH;5`,
    },
  ],
}
