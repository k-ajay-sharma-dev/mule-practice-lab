export default {
  id: 'dw-189',
  category: 'dataweave',
  title: 'Assign Oracle Sequence Keys to Item and Barcode Rows Before a Bulk Insert',
  level: 'EXPERT',
  tags: ['myproject', 'oracle', 'sequences', 'technical-keys', 'bulk-insert', 'flatten', 'json'],
  estMinutes: 35,
  description: `
Larkfield Grocers loads item messages into two Oracle staging tables: one row per item and one row per barcode. Every row needs a technical key from a sequence, and each barcode row needs its item key. To avoid one call per row, the flow first counts the rows and fetches blocks of sequence values, for example with \`SELECT ITEM_SEQ.NEXTVAL AS ID FROM DUAL CONNECT BY LEVEL <= :n\`. The results arrive in \`vars.itemKeys\` and \`vars.barcodeKeys\`.

**Rules**
- Items take item keys in order: the first item gets the first key.
- Within an item, keep each GTIN once, the first time it appears.
- Barcodes take barcode keys in order, item by item, then barcode by barcode.
- \`IS_PRIMARY\` is \`"Y"\` for the first barcode marked \`primary: true\`. If none is marked, the first barcode of the item is primary. All others are \`"N"\`.
- If there are fewer keys than rows, do not assign any. Return \`ok: false\`, empty lists and the error \`Need X item keys and Y barcode keys, got A and B\`.

**Output**: \`ok\`, \`items\` with \`ITEM_KEY\`, \`ITEM_ID\` and \`BARCODE_COUNT\`, and \`barcodes\` with \`BARCODE_KEY\`, \`ITEM_KEY\`, \`GTIN\` and \`IS_PRIMARY\`. Extra keys are fine and stay unused.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{
  "items": [
    {
      "itemId": "BK-100",
      "barcodes": [
        { "gtin": "05012345678900", "primary": false },
        { "gtin": "05012345678917", "primary": true }
      ]
    },
    {
      "itemId": "TN-220",
      "barcodes": [
        { "gtin": "05012345678924" },
        { "gtin": "05012345678924" }
      ]
    },
    { "itemId": "ST-050", "barcodes": [] }
  ]
}`,
    },
    {
      name: 'vars',
      mime: 'application/json',
      content: `{
  "itemKeys": [{ "ID": 5001 }, { "ID": 5002 }, { "ID": 5003 }],
  "barcodeKeys": [{ "ID": 88001 }, { "ID": 88002 }, { "ID": 88003 }, { "ID": 88004 }]
}`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "ok": true,
  "items": [
    { "ITEM_KEY": 5001, "ITEM_ID": "BK-100", "BARCODE_COUNT": 2 },
    { "ITEM_KEY": 5002, "ITEM_ID": "TN-220", "BARCODE_COUNT": 1 },
    { "ITEM_KEY": 5003, "ITEM_ID": "ST-050", "BARCODE_COUNT": 0 }
  ],
  "barcodes": [
    { "BARCODE_KEY": 88001, "ITEM_KEY": 5001, "GTIN": "05012345678900", "IS_PRIMARY": "N" },
    { "BARCODE_KEY": 88002, "ITEM_KEY": 5001, "GTIN": "05012345678917", "IS_PRIMARY": "Y" },
    { "BARCODE_KEY": 88003, "ITEM_KEY": 5002, "GTIN": "05012345678924", "IS_PRIMARY": "Y" }
  ]
}`,
  },
  starterCode: `%dw 2.0
output application/json
---
{
  items: payload.items map (it, i) -> {
    ITEM_KEY: vars.itemKeys[i].ID,
    ITEM_ID: it.itemId
  },
  barcodes: payload.items map (it) -> it.barcodes
}
`,
  hints: [
    'First build each item with its key and its cleaned barcodes, inside a `do` block per item.',
    'Dedupe barcodes with `distinctBy (b) -> b.gtin`. Pick the primary GTIN from the marked ones, or from the first barcode.',
    'Use `flatten(items map (it) -> it.barcodes map (b) -> ...)` to get one list of barcodes in order, each carrying its item key.',
    'The index of the flat list is the position of the barcode key: `flatBarcodes map (b, j) -> vars.barcodeKeys[j].ID`.',
    'Compare `sizeOf` of the keys with the rows needed before building the result.',
  ],
  solution: `%dw 2.0
output application/json

var items = payload.items map (it, i) -> do {
  var codes = (it.barcodes default []) distinctBy (b) -> b.gtin
  var marked = codes filter (b) -> b.primary == true
  var primaryGtin = if (isEmpty(marked)) codes[0].gtin else marked[0].gtin
  ---
  {
    itemKey: vars.itemKeys[i].ID,
    itemId: it.itemId,
    barcodes: codes map (b) -> { gtin: b.gtin, primary: b.gtin == primaryGtin }
  }
}

var flatBarcodes = flatten(items map (it) -> it.barcodes map (b) -> b ++ { itemKey: it.itemKey })

var needItems = sizeOf(items)
var needBarcodes = sizeOf(flatBarcodes)
var haveItems = sizeOf(vars.itemKeys)
var haveBarcodes = sizeOf(vars.barcodeKeys)
---
if (haveItems < needItems or haveBarcodes < needBarcodes)
  {
    ok: false,
    error: "Need $(needItems) item keys and $(needBarcodes) barcode keys, got $(haveItems) and $(haveBarcodes)",
    items: [],
    barcodes: []
  }
else
  {
    ok: true,
    items: items map (it) -> {
      ITEM_KEY: it.itemKey,
      ITEM_ID: it.itemId,
      BARCODE_COUNT: sizeOf(it.barcodes)
    },
    barcodes: flatBarcodes map (b, j) -> {
      BARCODE_KEY: vars.barcodeKeys[j].ID,
      ITEM_KEY: b.itemKey,
      GTIN: b.gtin,
      IS_PRIMARY: if (b.primary) "Y" else "N"
    }
  }`,
  explanation: `
**Keys first, rows second.** Fetching all sequence values in one query and assigning them in DataWeave turns thousands of round trips into two queries and two bulk inserts. Child rows carry the parent key, so no lookup is needed after the insert.

**Count after cleaning.** The number of barcode keys needed is the number of barcodes after removing duplicates. In the flow, the same logic must decide how many values to fetch, or the counts will not match.

**Position is the link.** Items take keys by their index. Barcodes are flattened in a fixed order, item by item, and the index in the flat list picks the barcode key. Changing the order changes the keys, so the order is part of the rule.

**One primary per item.** The marked barcode wins. With none marked, the first one does. With two marked, the first marked one does. Comparing each GTIN with the chosen one gives exactly one \`Y\` per item, because GTINs are unique after the dedupe.

**Fail before assigning.** Too few keys would leave rows with null keys and fail with ORA-01400 at insert time. Checking first gives a clear error.

**Gaps are fine.** Unused keys are lost, and that is normal for sequences.
`,
  tests: [
    {
      name: 'Too few barcode keys',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content:
            '{ "items": [{ "itemId": "BK-100", "barcodes": [{ "gtin": "05012345678900" }, { "gtin": "05012345678917" }] }, { "itemId": "TN-220", "barcodes": [{ "gtin": "05012345678924" }] }] }',
        },
        { name: 'vars', mime: 'application/json', content: '{ "itemKeys": [{ "ID": 6001 }, { "ID": 6002 }], "barcodeKeys": [{ "ID": 99001 }, { "ID": 99002 }] }' },
      ],
      expected: '{ "ok": false, "error": "Need 2 item keys and 3 barcode keys, got 2 and 2", "items": [], "barcodes": [] }',
    },
    {
      name: 'No barcode marked: the first one is primary',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '{ "items": [{ "itemId": "MT-410", "barcodes": [{ "gtin": "05099999000011" }, { "gtin": "05099999000028" }] }] }',
        },
        { name: 'vars', mime: 'application/json', content: '{ "itemKeys": [{ "ID": 7001 }], "barcodeKeys": [{ "ID": 77001 }, { "ID": 77002 }] }' },
      ],
      expected:
        '{ "ok": true, "items": [{ "ITEM_KEY": 7001, "ITEM_ID": "MT-410", "BARCODE_COUNT": 2 }], "barcodes": [{ "BARCODE_KEY": 77001, "ITEM_KEY": 7001, "GTIN": "05099999000011", "IS_PRIMARY": "Y" }, { "BARCODE_KEY": 77002, "ITEM_KEY": 7001, "GTIN": "05099999000028", "IS_PRIMARY": "N" }] }',
    },
  ],
  followUps: [
    {
      q: 'Could the barcodes use NEXTVAL in the INSERT instead?',
      a: 'Yes, if no other row needs the barcode key. The item key still has to be known before the barcode insert, so items need keys first.',
    },
    {
      q: 'What if the bulk insert of items fails after the keys were assigned?',
      a: 'The keys are lost, which is fine. On a rerun, fetch new keys. Never reuse old values, since another session may have taken them.',
    },
    {
      q: 'How would you fetch the right number of keys in the flow?',
      a: 'Run the same dedupe in a small DataWeave step to count items and barcodes, then call the two sequence queries with those counts.',
    },
  ],
}
