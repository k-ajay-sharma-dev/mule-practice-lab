export default {
  id: 'dw-211',
  category: 'dataweave',
  title: 'Prepare Item Rows for Oracle: Empty Strings, Byte Lengths and Code Map Defaults',
  level: 'ADVANCED',
  tags: ['myproject', 'oracle', 'staging', 'code-map', 'rejects', 'json'],
  estMinutes: 25,
  description: `
Brindle Outdoor loads item messages into an Oracle staging table. Two things keep failing in production. Bulk inserts stop on ORA-12899 (value too large) for descriptions with accented letters that fit the character limit. And the duplicate check misses items, because some senders send \`""\` and others leave the field out, and Oracle stores an empty string as NULL.

\`payload.items\` holds the items. \`vars.uomMap\` translates sender unit codes. \`vars.maxDescBytes\` is the byte size of the \`DESCRIPTION\` column.

**Rules**
- Trim every text field. A value that is empty after trimming becomes \`null\`.
- Reasons to reject, in this order, all that apply: \`ITEM_ID_MISSING\`, \`DESCRIPTION_MISSING\`, \`DESCRIPTION_TOO_LONG\` (more UTF-8 bytes than \`maxDescBytes\`).
- Count UTF-8 bytes per character: code below 128 is 1 byte, below 2048 is 2 bytes, otherwise 3 bytes.
- \`UOM\` is the mapped code. When the code is missing or not in the map, use \`EACH\` and add a warning \`UOM_DEFAULTED\`.
- Rows that pass go to \`rows\` with \`ITEM_ID\`, \`DESCRIPTION\`, \`UOM\` and \`BRAND\`. Rejected items go to \`rejects\` with \`itemId\` and \`reasons\`. Warnings are only for rows that pass.

Output \`rows\`, \`rejects\` and \`warnings\` (\`itemId\`, \`warning\`).
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{
  "items": [
    { "itemId": " 100245 ", "description": "Trail tent 2 person", "uom": "EA", "brand": "Brindle" },
    { "itemId": "100246", "description": "Crème waterproof jacket, größe M", "uom": "CS", "brand": "" },
    { "itemId": "100247", "description": "Camping stove", "uom": "PK", "brand": "Ridgeway" },
    { "itemId": "", "description": "Sleeping mat", "uom": "EA", "brand": "Brindle" },
    { "itemId": "100249", "description": "   ", "brand": "Brindle" },
    { "itemId": "100250", "description": "Headlamp", "brand": null }
  ]
}`,
    },
    {
      name: 'vars',
      mime: 'application/json',
      content: `{ "maxDescBytes": 32, "uomMap": { "EA": "EACH", "CS": "CASE", "PR": "PAIR" } }`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "rows": [
    { "ITEM_ID": "100245", "DESCRIPTION": "Trail tent 2 person", "UOM": "EACH", "BRAND": "Brindle" },
    { "ITEM_ID": "100247", "DESCRIPTION": "Camping stove", "UOM": "EACH", "BRAND": "Ridgeway" },
    { "ITEM_ID": "100250", "DESCRIPTION": "Headlamp", "UOM": "EACH", "BRAND": null }
  ],
  "rejects": [
    { "itemId": "100246", "reasons": ["DESCRIPTION_TOO_LONG"] },
    { "itemId": null, "reasons": ["ITEM_ID_MISSING"] },
    { "itemId": "100249", "reasons": ["DESCRIPTION_MISSING"] }
  ],
  "warnings": [
    { "itemId": "100247", "warning": "UOM_DEFAULTED" },
    { "itemId": "100250", "warning": "UOM_DEFAULTED" }
  ]
}`,
  },
  starterCode: `%dw 2.0
output application/json
---
{
  rows: payload.items map (i) -> {
    ITEM_ID: trim(i.itemId),
    DESCRIPTION: i.description,
    UOM: vars.uomMap[i.uom]
  }
}
`,
  hints: [
    'Write a `clean(v)` function: `if (v == null or isEmpty(trim(v))) null else trim(v)`.',
    'Get the characters with `s splitBy ""` and the code of one with `charCode` from `dw::core::Strings`.',
    'Build one record per item with its clean values and its list of reasons, then split it into rows and rejects.',
  ],
  solution: `%dw 2.0
output application/json
import charCode from dw::core::Strings

fun clean(v) = if (v == null or isEmpty(trim(v as String))) null else trim(v as String)
fun utf8Bytes(s) = sum((s splitBy "") map (c) -> do {
  var code = charCode(c)
  ---
  if (code < 128) 1 else if (code < 2048) 2 else 3
})

var checked = payload.items map (i) -> do {
  var id = clean(i.itemId)
  var desc = clean(i.description)
  var uomCode = clean(i.uom)
  var mapped = if (uomCode == null) null else vars.uomMap[uomCode]
  ---
  {
    row: { ITEM_ID: id, DESCRIPTION: desc, UOM: mapped default "EACH", BRAND: clean(i.brand) },
    defaulted: mapped == null,
    reasons: (if (id == null) ["ITEM_ID_MISSING"] else [])
      ++ (if (desc == null) ["DESCRIPTION_MISSING"] else [])
      ++ (if (desc != null and utf8Bytes(desc) > vars.maxDescBytes) ["DESCRIPTION_TOO_LONG"] else [])
  }
}
var good = checked filter (c) -> isEmpty(c.reasons)
---
{
  rows: good map (c) -> c.row,
  rejects: (checked filter (c) -> not isEmpty(c.reasons)) map (c) -> { itemId: c.row.ITEM_ID, reasons: c.reasons },
  warnings: (good filter (c) -> c.defaulted) map (c) -> { itemId: c.row.ITEM_ID, warning: "UOM_DEFAULTED" }
}`,
  explanation: `
**Oracle has no empty string.** In Oracle, \`''\` in a VARCHAR2 is NULL. A sender that sends \`""\` and one that leaves the field out end up the same in the table, but not in Mule. Making both \`null\` before any lookup or duplicate check keeps Mule and Oracle in agreement.

**Characters are not bytes.** A column declared with a byte size (often the default, depending on \`NLS_LENGTH_SEMANTICS\`) holds fewer accented characters than plain ones. "Crème waterproof jacket, größe M" has 32 characters but 35 bytes in UTF-8, so a check on characters lets it through and the insert fails.

**One bad row should not stop the block.** Checking lengths and required fields before the bulk insert sends bad rows to the reject table with a reason, instead of letting ORA-12899 fail the whole block.

**Defaults need a trail.** Using \`EACH\` for an unknown unit keeps the item flowing, and the warning lets someone fix the code map.
`,
  tests: [
    {
      name: 'Exactly at the byte limit',
      inputs: [
        { name: 'payload', mime: 'application/json', content: '{ "items": [{ "itemId": "1", "description": "Café", "uom": "PR", "brand": "X" }] }' },
        { name: 'vars', mime: 'application/json', content: '{ "maxDescBytes": 5, "uomMap": { "PR": "PAIR" } }' },
      ],
      expected: '{ "rows": [{ "ITEM_ID": "1", "DESCRIPTION": "Café", "UOM": "PAIR", "BRAND": "X" }], "rejects": [], "warnings": [] }',
    },
    {
      name: 'Several reasons on one item',
      inputs: [
        { name: 'payload', mime: 'application/json', content: '{ "items": [{ "itemId": " ", "description": "", "uom": "EA" }] }' },
        { name: 'vars', mime: 'application/json', content: '{ "maxDescBytes": 5, "uomMap": { "EA": "EACH" } }' },
      ],
      expected: '{ "rows": [], "rejects": [{ "itemId": null, "reasons": ["ITEM_ID_MISSING", "DESCRIPTION_MISSING"] }], "warnings": [] }',
    },
  ],
  followUps: [
    {
      q: 'How else can you avoid ORA-12899 for multibyte text?',
      a: 'Declare the column with CHAR length semantics, such as VARCHAR2(40 CHAR), so the limit counts characters. That is a table change, so agree it with the database owner.',
    },
    {
      q: 'Why not truncate long descriptions?',
      a: 'A cut description may lose the size or colour and mislead stores. Reject it, or truncate only when the business agrees and log that you did.',
    },
    {
      q: 'How does the NULL rule affect a unique key check in Oracle?',
      a: 'Rows with NULL in a unique column do not clash with each other, so empty keys slip past the constraint. Reject missing keys in Mule.',
    },
  ],
}
