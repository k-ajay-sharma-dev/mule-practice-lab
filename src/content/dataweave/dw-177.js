export default {
  id: 'dw-177',
  category: 'dataweave',
  title: 'Split Replenishment Plans Into One Delimited FTP File per Distribution Center',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'ftp', 'planning-platform', 'delimited', 'groupBy', 'file-names', 'replenishment-feed', 'json'],
  estMinutes: 20,
  description: `
Marrow & Pine Home gets a replenishment plan from the planning platform as JSON. Each distribution center collects its own file from an FTP server, so Mule must write one semicolon delimited file per center. The writer uploads each file under a temporary name and renames it when done.

Build a list with one entry per distribution center that has at least one line to send, sorted by \`dc\` as text:

- \`dc\`
- \`fileName\`: \`REPL_<dc>_<planDate as yyyyMMdd>.csv\`
- \`tempName\`: the file name followed by \`.tmp\`
- \`records\`: the number of detail lines
- \`totalQty\`: the sum of \`qty\`
- \`lines\`: the header \`SKU;NEED_DATE;QTY\`, then one line per plan row as \`sku;needDate as yyyyMMdd;qty\`, sorted by need date and then by sku as text

Rows with a \`qty\` of 0 or less are not sent.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{
  "planDate": "2026-11-18",
  "rows": [
    { "dc": "DC02", "sku": "LAMP-ARC-BLK", "needDate": "2026-11-21", "qty": 12 },
    { "dc": "DC01", "sku": "RUG-200-OAT", "needDate": "2026-11-20", "qty": 8 },
    { "dc": "DC01", "sku": "CHAIR-OAK-2", "needDate": "2026-11-20", "qty": 20 },
    { "dc": "DC01", "sku": "MIRROR-RND", "needDate": "2026-11-19", "qty": 5 },
    { "dc": "DC03", "sku": "VASE-CLY-S", "needDate": "2026-11-22", "qty": 0 },
    { "dc": "DC02", "sku": "SHELF-PINE", "needDate": "2026-11-19", "qty": 3 }
  ]
}`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `[
  {
    "dc": "DC01",
    "fileName": "REPL_DC01_20261118.csv",
    "tempName": "REPL_DC01_20261118.csv.tmp",
    "records": 3,
    "totalQty": 33,
    "lines": [
      "SKU;NEED_DATE;QTY",
      "MIRROR-RND;20261119;5",
      "CHAIR-OAK-2;20261120;20",
      "RUG-200-OAT;20261120;8"
    ]
  },
  {
    "dc": "DC02",
    "fileName": "REPL_DC02_20261118.csv",
    "tempName": "REPL_DC02_20261118.csv.tmp",
    "records": 2,
    "totalQty": 15,
    "lines": [
      "SKU;NEED_DATE;QTY",
      "SHELF-PINE;20261119;3",
      "LAMP-ARC-BLK;20261121;12"
    ]
  }
]`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload.rows groupBy $.dc pluck (rows, dc) -> {
  dc: dc as String,
  records: sizeOf(rows)
}
`,
  hints: [
    'Drop the zero rows before you group, so a center with only zero rows has no group at all.',
    '`groupBy $.dc` gives an object keyed by center. `pluck (rows, dc) -> ...` turns it into a list. The key is a Key, so write `dc as String`.',
    'Both dates are ISO strings of the same length, so `orderBy ($.needDate ++ $.sku)` sorts by date and then sku.',
    'Format a date with `d as Date as String {format: "yyyyMMdd"}`.',
  ],
  solution: `%dw 2.0
output application/json

fun ymd(d) = d as Date as String {format: "yyyyMMdd"}

var toSend = payload.rows filter ($.qty > 0)
---
((toSend groupBy $.dc) pluck (rows, key) -> do {
  var dc = key as String
  var sorted = rows orderBy ($.needDate ++ $.sku)
  var fileName = "REPL_" ++ dc ++ "_" ++ ymd(payload.planDate) ++ ".csv"
  ---
  {
    dc: dc,
    fileName: fileName,
    tempName: fileName ++ ".tmp",
    records: sizeOf(sorted),
    totalQty: sorted reduce ((r, acc = 0) -> acc + r.qty),
    lines: ["SKU;NEED_DATE;QTY"] ++ (sorted map (r) -> r.sku ++ ";" ++ ymd(r.needDate) ++ ";" ++ (r.qty as String))
  }
}) orderBy $.dc`,
  explanation: `
**Filter, then group.** Removing zero quantity rows first means a center with nothing to order gets no group, so no empty file is written. An empty file on an FTP server is often read as a failed export.

**One entry per file.** \`groupBy\` collects rows per center, and \`pluck\` turns each group into one file description. The flow can then loop over the list and write each file with its own name.

**Temporary names.** The writer uploads to \`tempName\` and renames to \`fileName\` when the upload is done. The center only matches \`.csv\`, so it never reads a half written file.

**Stable order.** Sorting the lines by date and sku, and the files by center, gives the same output for the same plan. Files can then be compared between runs and in tests.

**Counts for the audit log.** \`records\` and \`totalQty\` go to the file audit table, so support can answer what was sent without opening the file.
`,
  tests: [
    {
      name: 'Nothing to order',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '{ "planDate": "2026-11-18", "rows": [{ "dc": "DC01", "sku": "RUG-200-OAT", "needDate": "2026-11-20", "qty": 0 }] }',
        },
      ],
      expected: '[]',
    },
    {
      name: 'One center, same date for two items',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '{ "planDate": "2026-12-01", "rows": [{ "dc": "DC03", "sku": "VASE-CLY-S", "needDate": "2026-12-03", "qty": 4 }, { "dc": "DC03", "sku": "BOWL-CLY-L", "needDate": "2026-12-03", "qty": 6 }] }',
        },
      ],
      expected:
        '[{ "dc": "DC03", "fileName": "REPL_DC03_20261201.csv", "tempName": "REPL_DC03_20261201.csv.tmp", "records": 2, "totalQty": 10, "lines": ["SKU;NEED_DATE;QTY", "BOWL-CLY-L;20261203;6", "VASE-CLY-S;20261203;4"] }]',
    },
  ],
  followUps: [
    {
      q: 'How would the flow turn lines into the file content?',
      a: 'Join them with the agreed line ending, for example `lines joinBy "\\r\\n"`, and write the string with the FTP write operation in binary mode.',
    },
    {
      q: 'A sku contains a semicolon. What then?',
      a: 'Either reject the row, or quote the field as agreed with the receiver. Writing it as is shifts every later field.',
    },
    {
      q: 'Why not use output application/csv with a semicolon separator?',
      a: 'That works for one file. Here the script returns several files with their names and counts, so plain lines in JSON suit a loop in the flow better.',
    },
  ],
}
