export default {
  id: 'dw-173',
  category: 'dataweave',
  title: 'Validate a Replenishment Plan From the Planning Platform and Split It by Store',
  level: 'ADVANCED',
  tags: ['myproject', 'sftp', 'planning-platform', 'replenishment-plans', 'pipe-delimited', 'header-trailer', 'groupBy', 'text/plain'],
  estMinutes: 30,
  description: `
Brindle Outdoor gets a replenishment plan back from the planning platform each morning, as a pipe delimited file on SFTP. The warehouse system wants one file per store. Mule reads the plan, checks it, and builds the store files.

The plan has three record types:

- \`HDR|planType|planDate|batchId\`, where the date is \`yyyyMMdd\`
- \`DTL|store|sku|deliveryDate|qty|uom\`
- \`TRL|lineCount|totalQty\`

**Checks**, with errors in this order:
- \`Unexpected file type X\` when the plan type is not \`REPL\`
- \`Missing trailer\` when there is no \`TRL\` line. Then the two trailer checks below do not run.
- \`Trailer count X does not match Y detail lines\`
- \`Trailer quantity X does not match Y\`, comparing with the sum of every \`qty\`

**Output**
- \`batchId\` (as text, with its leading zeros), \`planDate\` (\`yyyy-MM-dd\`), \`valid\` (\`true\` when there are no errors) and \`errors\` (an empty list when there are none)
- \`stores\`: an empty list when the plan is not valid. Otherwise one entry per store, sorted by store code as text, with:
  - \`store\`
  - \`fileName\`: \`REPL_<store>_<planDate as yyyyMMdd>.csv\`
  - \`lineCount\` and \`totalQty\` for that store
  - \`lines\`: \`sku\`, \`deliveryDate\` (\`yyyy-MM-dd\`), \`qty\` and \`uom\`, in file order

Lines with a quantity of 0 count in the trailer checks but are left out of the store files. A store with only zero lines gets no file. Skip blank lines and spaces around a line.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'text/plain',
      content: `HDR|REPL|20261118|000123
DTL|S0415|TENT-2P-GRN|20261120|6|EA
DTL|S0412|STOVE-CMP-1|20261120|12|EA
DTL|S0415|FUEL-CAN-450|20261121|24|EA
DTL|S0412|TENT-2P-GRN|20261121|0|EA
DTL|S0419|LANTERN-LED|20261120|8|EA
TRL|5|50
`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "batchId": "000123",
  "planDate": "2026-11-18",
  "valid": true,
  "errors": [],
  "stores": [
    {
      "store": "S0412",
      "fileName": "REPL_S0412_20261118.csv",
      "lineCount": 1,
      "totalQty": 12,
      "lines": [{ "sku": "STOVE-CMP-1", "deliveryDate": "2026-11-20", "qty": 12, "uom": "EA" }]
    },
    {
      "store": "S0415",
      "fileName": "REPL_S0415_20261118.csv",
      "lineCount": 2,
      "totalQty": 30,
      "lines": [
        { "sku": "TENT-2P-GRN", "deliveryDate": "2026-11-20", "qty": 6, "uom": "EA" },
        { "sku": "FUEL-CAN-450", "deliveryDate": "2026-11-21", "qty": 24, "uom": "EA" }
      ]
    },
    {
      "store": "S0419",
      "fileName": "REPL_S0419_20261118.csv",
      "lineCount": 1,
      "totalQty": 8,
      "lines": [{ "sku": "LANTERN-LED", "deliveryDate": "2026-11-20", "qty": 8, "uom": "EA" }]
    }
  ]
}`,
  },
  starterCode: `%dw 2.0
output application/json
var rows = (payload splitBy "\\n") map ($ splitBy "|")
---
{
  stores: (rows filter ($[0] == "DTL")) groupBy $[1]
}
`,
  hints: [
    'Split into trimmed, non blank lines, then each line on `"|"`. Pick the header and trailer with `(rows filter ($[0] == "HDR"))[0]`.',
    'Map the detail rows once into records with real numbers and ISO dates. The checks and the store files both read that list.',
    'Collect errors as one item lists or empty lists joined with `++`. Wrap the trailer checks in the `else` of the missing trailer test.',
    'For the stores, filter out zero quantities, then `groupBy $.store`, then `pluck` each group to an entry, and `orderBy $.store` at the end.',
    'Sum with `reduce ((l, acc = 0) -> acc + l.qty)`, so an empty list gives 0.',
  ],
  solution: `%dw 2.0
output application/json
var rows = ((payload splitBy "\\n") filter (trim($) != "")) map (trim($) splitBy "|")
var hdr = (rows filter ($[0] == "HDR"))[0]
var trl = (rows filter ($[0] == "TRL"))[0]

fun isoDate(ymd) = ymd as Date {format: "yyyyMMdd"} as String {format: "yyyy-MM-dd"}
fun qtyOf(list) = list reduce ((l, acc = 0) -> acc + l.qty)

var details = (rows filter ($[0] == "DTL")) map (r) -> {
  store: r[1],
  sku: r[2],
  deliveryDate: isoDate(r[3]),
  qty: r[4] as Number,
  uom: r[5]
}

var errors =
  (if (hdr[1] != "REPL") ["Unexpected file type $(hdr[1])"] else [])
  ++ (if (trl == null) ["Missing trailer"]
      else (
        (if ((trl[1] as Number) != sizeOf(details)) ["Trailer count $(trl[1]) does not match $(sizeOf(details)) detail lines"] else [])
        ++ (if ((trl[2] as Number) != qtyOf(details)) ["Trailer quantity $(trl[2]) does not match $(qtyOf(details))"] else [])
      ))
---
{
  batchId: hdr[3],
  planDate: isoDate(hdr[2]),
  valid: isEmpty(errors),
  errors: errors,
  stores: if (isEmpty(errors))
      ((((details filter ($.qty > 0)) groupBy $.store) pluck (lines, key) -> do {
        var store = key as String
        ---
        {
          store: store,
          fileName: "REPL_" ++ store ++ "_" ++ hdr[2] ++ ".csv",
          lineCount: sizeOf(lines),
          totalQty: qtyOf(lines),
          lines: lines map (l) -> { sku: l.sku, deliveryDate: l.deliveryDate, qty: l.qty, uom: l.uom }
        }
      }) orderBy $.store)
    else []
}`,
  explanation: `
**Check before you split.** A plan that fails its trailer check may be cut short. Splitting it would send partial orders to some stores and nothing to others, so the store list stays empty until the plan is valid.

**One clean record per line.** The detail rows become records with numbers and ISO dates once. The trailer checks and the store files read the same list, so they agree.

**Zero lines.** The trailer counts every line the platform wrote, including zero quantities. The store files leave them out, because a warehouse cannot pick zero units. That is why the filter comes after the checks, not before.

**Group, then sort.** \`groupBy\` collects lines per store. \`pluck\` turns each group into an entry with the store key. Sorting by store makes the output the same on every run, which helps when comparing two days.

**File names.** Each store file carries the store and the plan date, so the warehouse system can tell a resent plan from a new one, and support can trace a store file back to its plan.
`,
  tests: [
    {
      name: 'Trailer count does not match',
      inputs: [
        {
          name: 'payload',
          mime: 'text/plain',
          content: 'HDR|REPL|20261119|000124\nDTL|S0412|MAP-01|20261121|4|EA\nDTL|S0412|MAP-02|20261121|2|EA\nTRL|3|6\n',
        },
      ],
      expected: '{ "batchId": "000124", "planDate": "2026-11-19", "valid": false, "errors": ["Trailer count 3 does not match 2 detail lines"], "stores": [] }',
    },
    {
      name: 'Wrong plan type and no trailer',
      inputs: [
        {
          name: 'payload',
          mime: 'text/plain',
          content: 'HDR|ALLOC|20261119|000125\nDTL|S0415|MAP-01|20261121|4|EA\n',
        },
      ],
      expected: '{ "batchId": "000125", "planDate": "2026-11-19", "valid": false, "errors": ["Unexpected file type ALLOC", "Missing trailer"], "stores": [] }',
    },
  ],
  followUps: [
    {
      q: 'How would Mule write one file per store from this output?',
      a: 'A For Each over stores, with a transform that writes each lines list as CSV and an SFTP Write to the store fileName, under a temporary name and then a rename.',
    },
    {
      q: 'The plan arrives twice with the same batch id. What do you do?',
      a: 'Record processed batch ids. A repeat with the same id is skipped and logged, unless the planning team says it is a correction to replace the earlier plan.',
    },
    {
      q: 'Why not let the warehouse system read the full plan and filter by store?',
      a: 'Each store system may only accept its own file, and sending every store all lines leaks data and wastes transfer. The split belongs in the integration.',
    },
  ],
}
