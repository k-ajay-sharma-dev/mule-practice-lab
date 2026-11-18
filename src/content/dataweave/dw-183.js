export default {
  id: 'dw-183',
  category: 'dataweave',
  title: 'Prepare Plan Rows for a SQL Server MERGE: Reject Reasons and One Row per Key',
  level: 'ADVANCED',
  tags: ['myproject', 'sql-server', 'planning-platform', 'merge', 'rejects', 'dedupe', 'groupBy', 'json'],
  estMinutes: 28,
  description: `
Larkfield Grocers loads weekly replenishment plans from the planning platform into SQL Server with a MERGE on store, item and week. MERGE fails when two source rows have the same key, and bad rows must not reach the table. Mule prepares the source rows and a reject list first.

**Inputs**
- \`payload\`: plan lines with \`store\`, \`item\`, \`week\`, \`qty\` and \`planVersion\`
- \`vars.knownStores\` and \`vars.knownItems\`: codes from the master data tables

**Checks**, all that apply, in this order:
- \`Unknown store S\`
- \`Unknown item I\`
- \`Bad week W\` when the week is not four digits, \`-W\` and two digits, such as \`2026-W48\`
- \`Negative quantity Q\`

A line with any reason goes to \`rejects\` as \`line\` (its position in the file, from 1) and \`reasons\`.

**One row per key.** Among good lines with the same store, item and week, keep the highest \`planVersion\`. On a tie, keep the later line in the file. Count the lines dropped this way as \`superseded\`.

**Output** \`mergeRows\` with \`StoreId\`, \`ItemId\`, \`PlanWeek\`, \`Qty\` and \`PlanVersion\`, sorted by store, item and week, then \`rejects\` in file order and \`superseded\`.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `[
  { "store": "0412", "item": "MILK-2L-SEMI", "week": "2026-W48", "qty": 40, "planVersion": 3 },
  { "store": "0412", "item": "MILK-2L-SEMI", "week": "2026-W48", "qty": 44, "planVersion": 4 },
  { "store": "0412", "item": "BREAD-WHT-800", "week": "2026-W48", "qty": 12, "planVersion": 4 },
  { "store": "0999", "item": "BREAD-WHT-800", "week": "2026-W48", "qty": 5, "planVersion": 4 },
  { "store": "0415", "item": "EGGS-12-FR", "week": "2026-48", "qty": -3, "planVersion": 4 },
  { "store": "0415", "item": "MILK-2L-SEMI", "week": "2026-W49", "qty": 18, "planVersion": 4 }
]`,
    },
    {
      name: 'vars',
      mime: 'application/json',
      content: `{
  "knownStores": ["0412", "0415"],
  "knownItems": ["MILK-2L-SEMI", "BREAD-WHT-800", "EGGS-12-FR"]
}`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "mergeRows": [
    { "StoreId": "0412", "ItemId": "BREAD-WHT-800", "PlanWeek": "2026-W48", "Qty": 12, "PlanVersion": 4 },
    { "StoreId": "0412", "ItemId": "MILK-2L-SEMI", "PlanWeek": "2026-W48", "Qty": 44, "PlanVersion": 4 },
    { "StoreId": "0415", "ItemId": "MILK-2L-SEMI", "PlanWeek": "2026-W49", "Qty": 18, "PlanVersion": 4 }
  ],
  "rejects": [
    { "line": 4, "reasons": ["Unknown store 0999"] },
    { "line": 5, "reasons": ["Bad week 2026-48", "Negative quantity -3"] }
  ],
  "superseded": 1
}`,
  },
  starterCode: `%dw 2.0
output application/json
---
{
  mergeRows: payload distinctBy ($.store ++ $.item ++ $.week),
  rejects: []
}
`,
  hints: [
    'Number the lines first: `payload map (l, i) -> l ++ { line: i + 1 }`.',
    'Build the reasons as a joined list of one item lists: `(if (cond) ["..."] else []) ++ (...)`.',
    'Check the week with `l.week matches /^\\d{4}-W\\d{2}$/`.',
    'Group good lines by `$.store ++ "|" ++ $.item ++ "|" ++ $.week`. In each group, `(group orderBy $.planVersion)[-1]` is the highest version, and the later line on a tie, because `orderBy` keeps the order of equal values.',
    '`distinctBy` keeps the first line, which is the wrong one here.',
  ],
  solution: `%dw 2.0
output application/json

fun reasonsOf(l) =
  (if (vars.knownStores contains l.store) [] else ["Unknown store $(l.store)"])
  ++ (if (vars.knownItems contains l.item) [] else ["Unknown item $(l.item)"])
  ++ (if (l.week matches /^\\d{4}-W\\d{2}$/) [] else ["Bad week $(l.week)"])
  ++ (if (l.qty < 0) ["Negative quantity $(l.qty)"] else [])

var checked = payload map (l, i) -> l ++ { line: i + 1, reasons: reasonsOf(l) }

var good = checked filter (l) -> isEmpty(l.reasons)

var latest = (good groupBy ($.store ++ "|" ++ $.item ++ "|" ++ $.week))
  pluck (group, key) -> (group orderBy $.planVersion)[-1]
---
{
  mergeRows: (latest orderBy ($.store ++ "|" ++ $.item ++ "|" ++ $.week)) map (l) -> {
    StoreId: l.store,
    ItemId: l.item,
    PlanWeek: l.week,
    Qty: l.qty,
    PlanVersion: l.planVersion
  },
  rejects: (checked filter (l) -> not isEmpty(l.reasons)) map { line: $.line, reasons: $.reasons },
  superseded: sizeOf(good) - sizeOf(latest)
}`,
  explanation: `
**Every reason, not the first one.** Line 5 has a bad week and a negative quantity. Reporting both lets the planning team fix the line in one go. Each check gives a one item list or an empty list, and joining them keeps the order fixed.

**Line numbers.** The line number is added before any filtering, so it always points at the same line in the file the platform sent.

**One row per key.** MERGE stops with an error when two source rows match the same target row. Grouping by the key and keeping one row per group removes that risk. Sorting each group by version and taking the last row picks the highest version. \`orderBy\` keeps equal values in their original order, so on a tie the later line wins.

**Why not distinctBy?** It keeps the first line it sees for each key, which here is the older version.

**Sorted source.** Sorting by the key gives the same order on every run, which helps when you compare runs. It can also help the database, since the rows arrive in index order.

**Counts.** \`superseded\` is the number of good lines minus the number of merge rows. The job log stores it with the reject count, so support can explain why the table has fewer rows than the file.
`,
  tests: [
    {
      name: 'Same version twice: the later line wins',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '[{ "store": "0412", "item": "EGGS-12-FR", "week": "2026-W50", "qty": 10, "planVersion": 5 }, { "store": "0412", "item": "EGGS-12-FR", "week": "2026-W50", "qty": 11, "planVersion": 5 }]',
        },
        { name: 'vars', mime: 'application/json', content: '{ "knownStores": ["0412"], "knownItems": ["EGGS-12-FR"] }' },
      ],
      expected:
        '{ "mergeRows": [{ "StoreId": "0412", "ItemId": "EGGS-12-FR", "PlanWeek": "2026-W50", "Qty": 11, "PlanVersion": 5 }], "rejects": [], "superseded": 1 }',
    },
    {
      name: 'Everything rejected',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '[{ "store": "0001", "item": "TEA-80-BAG", "week": "W50", "qty": 2, "planVersion": 1 }]',
        },
        { name: 'vars', mime: 'application/json', content: '{ "knownStores": ["0412"], "knownItems": ["EGGS-12-FR"] }' },
      ],
      expected:
        '{ "mergeRows": [], "rejects": [{ "line": 1, "reasons": ["Unknown store 0001", "Unknown item TEA-80-BAG", "Bad week W50"] }], "superseded": 0 }',
    },
  ],
  followUps: [
    {
      q: 'Where do the rejects go?',
      a: 'Into a reject table with the run id, line number and reasons, by bulk insert. A report or email to the planning team lists them so they can resend.',
    },
    {
      q: 'Why check stores and items in DataWeave rather than with foreign keys only?',
      a: 'A foreign key error fails a whole block with one message. Checking first keeps the good rows moving and gives a reason per line.',
    },
    {
      q: 'The known item list has 300,000 codes. Is contains still fine?',
      a: 'It scans the list for every line. For large lists, build a lookup object once, keyed by code, or let SQL find unknown codes with a join on the staging table.',
    },
  ],
}
