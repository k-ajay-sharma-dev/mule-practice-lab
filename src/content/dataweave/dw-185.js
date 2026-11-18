export default {
  id: 'dw-185',
  category: 'dataweave',
  title: 'Translate Item Codes With an Oracle Code Map Before Loading Staging Rows',
  level: 'BEGINNER',
  tags: ['myproject', 'oracle', 'code-map', 'staging', 'lookup', 'json'],
  estMinutes: 15,
  description: `
Brindle Outdoor receives item messages and loads them into an Oracle staging table for the merchandising system. The sender uses its own codes for the unit of measure and the item status. A code map table in Oracle translates them. Mule reads the map once per run into \`vars.codeMap\`, one row per code:

\`\`\`json
{ "MAP_TYPE": "UOM", "SOURCE_CODE": "EA", "TARGET_CODE": "EACH" }
\`\`\`

Build one staging row per item:

- \`RUN_ID\`: from \`vars.runId\`
- \`MESSAGE_ID\`: from the message
- \`ITEM_ID\`: in upper case, without spaces around it
- \`DESCRIPTION\`: as given
- \`UOM_CODE\`: the target code for map type \`UOM\`
- \`STATUS_CODE\`: the target code for map type \`STATUS\`

Before the lookup, trim the sender code and put it in upper case. A missing code or a code that is not in the map becomes \`"UNMAPPED"\`, so the row still loads and a later check can report it.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{
  "messageId": "MSG-20261118-0001",
  "items": [
    { "itemId": " bk-100 ", "description": "Trail backpack 30L", "uom": "ea", "status": "A" },
    { "itemId": "TN-220", "description": "Two person tent", "uom": "CS", "status": "X" },
    { "itemId": "ST-050", "description": "Camp stove", "uom": null, "status": " d " }
  ]
}`,
    },
    {
      name: 'vars',
      mime: 'application/json',
      content: `{
  "runId": 9001,
  "codeMap": [
    { "MAP_TYPE": "UOM", "SOURCE_CODE": "EA", "TARGET_CODE": "EACH" },
    { "MAP_TYPE": "UOM", "SOURCE_CODE": "CS", "TARGET_CODE": "CASE" },
    { "MAP_TYPE": "STATUS", "SOURCE_CODE": "A", "TARGET_CODE": "ACTIVE" },
    { "MAP_TYPE": "STATUS", "SOURCE_CODE": "D", "TARGET_CODE": "DISCONTINUED" }
  ]
}`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `[
  { "RUN_ID": 9001, "MESSAGE_ID": "MSG-20261118-0001", "ITEM_ID": "BK-100", "DESCRIPTION": "Trail backpack 30L", "UOM_CODE": "EACH", "STATUS_CODE": "ACTIVE" },
  { "RUN_ID": 9001, "MESSAGE_ID": "MSG-20261118-0001", "ITEM_ID": "TN-220", "DESCRIPTION": "Two person tent", "UOM_CODE": "CASE", "STATUS_CODE": "UNMAPPED" },
  { "RUN_ID": 9001, "MESSAGE_ID": "MSG-20261118-0001", "ITEM_ID": "ST-050", "DESCRIPTION": "Camp stove", "UOM_CODE": "UNMAPPED", "STATUS_CODE": "DISCONTINUED" }
]`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload.items map (it) -> {
  ITEM_ID: it.itemId,
  UOM_CODE: it.uom
}
`,
  hints: [
    'Write a small function that cleans a code: `upper(trim(code default ""))`. The `default` stops `trim` from getting null.',
    'Find the map row with `filter`, then take the first one: `(vars.codeMap filter (...))[0].TARGET_CODE`.',
    'An empty list gives null for `[0]`, so `default "UNMAPPED"` covers both a missing code and an unknown one.',
  ],
  solution: `%dw 2.0
output application/json

fun clean(code) = upper(trim(code default ""))

fun mapCode(mapType, code) =
  (vars.codeMap filter (m) -> m.MAP_TYPE == mapType and m.SOURCE_CODE == clean(code))[0].TARGET_CODE
    default "UNMAPPED"
---
payload.items map (it) -> {
  RUN_ID: vars.runId,
  MESSAGE_ID: payload.messageId,
  ITEM_ID: clean(it.itemId),
  DESCRIPTION: it.description,
  UOM_CODE: mapCode("UOM", it.uom),
  STATUS_CODE: mapCode("STATUS", it.status)
}`,
  explanation: `
**Clean before you look up.** Senders mix case and add spaces. Cleaning the code first means the map needs one row per code, not one per spelling.

**One lookup function.** \`mapCode\` takes the map type and the code, so the same logic serves every code column. Adding a new mapped column is one more line.

**A default, not a failure.** \`[0]\` on an empty list gives null, and \`default\` turns that into \`"UNMAPPED"\`. The row still reaches staging, where a check can count unmapped codes and report them. Whether to load or reject such rows is a business choice, and the default makes it visible.

**Read the map once.** The flow loads the map from Oracle once per run into a variable. Querying the table per item would add one round trip for every row.
`,
  tests: [
    {
      name: 'No items',
      inputs: [
        { name: 'payload', mime: 'application/json', content: '{ "messageId": "MSG-20261118-0002", "items": [] }' },
        { name: 'vars', mime: 'application/json', content: '{ "runId": 9002, "codeMap": [] }' },
      ],
      expected: '[]',
    },
    {
      name: 'Keys missing and an empty map',
      inputs: [
        { name: 'payload', mime: 'application/json', content: '{ "messageId": "MSG-20261118-0003", "items": [{ "itemId": "lt-310", "description": "Head torch" }] }' },
        { name: 'vars', mime: 'application/json', content: '{ "runId": 9003, "codeMap": [] }' },
      ],
      expected:
        '[{ "RUN_ID": 9003, "MESSAGE_ID": "MSG-20261118-0003", "ITEM_ID": "LT-310", "DESCRIPTION": "Head torch", "UOM_CODE": "UNMAPPED", "STATUS_CODE": "UNMAPPED" }]',
    },
  ],
  followUps: [
    {
      q: 'The code map has 50,000 rows. Is filter per item still fine?',
      a: 'It scans the list for each item. Build a lookup object once, keyed by map type and source code, and read it with a dynamic selector.',
    },
    {
      q: 'Where would you report unmapped codes?',
      a: 'Count them per run in the job log, and list the distinct codes in the reject or job report email, so the data team can add them to the map.',
    },
    {
      q: 'Why not translate codes in SQL with a join?',
      a: 'That also works, after loading raw codes into staging. Translating in Mule keeps the staging row ready to use and lets the flow count unmapped codes before the load.',
    },
  ],
}
