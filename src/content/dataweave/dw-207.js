export default {
  id: 'dw-207',
  category: 'dataweave',
  title: 'Plan Archive Moves on an Azure File Share Without Overwriting Earlier Files',
  level: 'ADVANCED',
  tags: ['myproject', 'azure-file-share', 'archive', 'file-names', 'planning-platform', 'json'],
  estMinutes: 25,
  description: `
Fenwick Supply collects store sales files from an Azure File Share and sends them on to the planning platform. After a run, each file moves out of the inbound folder. Stores sometimes send a file with the same name twice in a day, and last week a move overwrote the first copy in the archive. Audit could not tell what the store had sent first.

\`payload.files\` lists the handled files: \`path\`, \`handledAt\` (UTC) and \`status\` (\`LOADED\` or \`REJECTED\`). \`vars.existing\` lists the full paths already in the archive and error folders.

**Rules**
- Skip names that start with \`~$\` or end with \`.tmp\`. Those are lock or temporary files. List their paths in \`skipped\`.
- The target folder is \`/stores/archive/yyyy/MM/dd\` for \`LOADED\` and \`/stores/error/yyyy/MM/dd\` for \`REJECTED\`, using the UTC date of \`handledAt\`.
- The target name is the file name. When that path already exists, or an earlier move in this run already uses it, add \`_2\` before the extension, then \`_3\` and so on, until the path is free. The extension starts at the last dot. A name with no dot gets the suffix at the end.
- \`renamed\` is \`true\` when a suffix was added.

Output \`moves\` (\`from\`, \`to\`, \`renamed\`) in input order and \`skipped\`.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{
  "files": [
    { "path": "/stores/inbound/sales_0142_20261117.csv", "handledAt": "2026-11-18T02:14:00Z", "status": "LOADED" },
    { "path": "/stores/inbound/~$sales_0150_20261117.csv", "handledAt": "2026-11-18T02:14:05Z", "status": "LOADED" },
    { "path": "/stores/inbound/sales_0150_20261117.csv", "handledAt": "2026-11-18T02:15:00Z", "status": "LOADED" },
    { "path": "/stores/inbound/late/sales_0142_20261117.csv", "handledAt": "2026-11-18T02:16:00Z", "status": "LOADED" },
    { "path": "/stores/inbound/stock_0142_20261117.csv", "handledAt": "2026-11-18T02:17:00Z", "status": "REJECTED" },
    { "path": "/stores/inbound/stock_0150_20261117.csv.tmp", "handledAt": "2026-11-18T02:18:00Z", "status": "LOADED" }
  ]
}`,
    },
    {
      name: 'vars',
      mime: 'application/json',
      content: `{
  "existing": [
    "/stores/archive/2026/11/18/sales_0142_20261117.csv",
    "/stores/archive/2026/11/18/sales_0142_20261117_2.csv",
    "/stores/error/2026/11/17/stock_0142_20261117.csv"
  ]
}`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "moves": [
    { "from": "/stores/inbound/sales_0142_20261117.csv", "to": "/stores/archive/2026/11/18/sales_0142_20261117_3.csv", "renamed": true },
    { "from": "/stores/inbound/sales_0150_20261117.csv", "to": "/stores/archive/2026/11/18/sales_0150_20261117.csv", "renamed": false },
    { "from": "/stores/inbound/late/sales_0142_20261117.csv", "to": "/stores/archive/2026/11/18/sales_0142_20261117_4.csv", "renamed": true },
    { "from": "/stores/inbound/stock_0142_20261117.csv", "to": "/stores/error/2026/11/18/stock_0142_20261117.csv", "renamed": false }
  ],
  "skipped": [
    "/stores/inbound/~$sales_0150_20261117.csv",
    "/stores/inbound/stock_0150_20261117.csv.tmp"
  ]
}`,
  },
  starterCode: `%dw 2.0
output application/json
---
{
  moves: payload.files map (f) -> {
    from: f.path,
    to: "/stores/archive/" ++ ((f.path splitBy "/")[-1])
  }
}
`,
  hints: [
    'Each move depends on the ones before it, so use `reduce` and carry the taken paths in the accumulator.',
    'Split a name into base and extension with `match /^(.+)(\\.[^.]+)$/`. Index 1 is the base and index 2 the extension.',
    'A recursive function can try `_2`, `_3` and so on until a path is not taken.',
    'Format the date with `(f.handledAt as DateTime) as String { format: "yyyy/MM/dd" }`.',
  ],
  solution: `%dw 2.0
output application/json

fun nameOf(path) = (path splitBy "/")[-1]
fun skip(name) = (name startsWith "~\\$") or (name endsWith ".tmp")

fun freePath(folder, base, ext, n, taken) = do {
  var candidate = if (n == 1) "$(folder)/$(base)$(ext)" else "$(folder)/$(base)_$(n)$(ext)"
  ---
  if (taken contains candidate) freePath(folder, base, ext, n + 1, taken) else candidate
}

var work = payload.files filter (f) -> not skip(nameOf(f.path))

var planned = work reduce (f, acc = { moves: [], taken: vars.existing }) -> do {
  var name = nameOf(f.path)
  var parts = name match /^(.+)(\\.[^.]+)$/
  var base = if (isEmpty(parts)) name else parts[1]
  var ext = if (isEmpty(parts)) "" else parts[2]
  var root = if (f.status == "REJECTED") "/stores/error" else "/stores/archive"
  var folder = root ++ "/" ++ ((f.handledAt as DateTime) as String { format: "yyyy/MM/dd" })
  var target = freePath(folder, base, ext, 1, acc.taken)
  ---
  {
    moves: acc.moves << { from: f.path, to: target, renamed: target != "$(folder)/$(name)" },
    taken: acc.taken << target
  }
}
---
{
  moves: planned.moves,
  skipped: (payload.files filter (f) -> skip(nameOf(f.path))) map (f) -> f.path
}`,
  explanation: `
**An archive is evidence.** When a store sends the same name twice, both copies matter. Overwriting the first one removes the only proof of what arrived.

**Plans depend on earlier plans.** Two files in one run can want the same target. Carrying the taken paths through \`reduce\` lets the second one see the first.

**Lock and temporary files are not data.** Office tools and copy programs leave \`~$\` and \`.tmp\` files on SMB shares. Moving them hides a half copied file, so they are left for the next run.

**Use the UTC date.** The run date in the folder should not change with the server time zone. Agree on UTC and write it down.
`,
  tests: [
    {
      name: 'Two copies in one run, empty archive',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '{ "files": [{ "path": "/stores/inbound/a.csv", "handledAt": "2026-12-01T23:59:00Z", "status": "LOADED" }, { "path": "/stores/inbound/old/a.csv", "handledAt": "2026-12-01T23:59:30Z", "status": "LOADED" }] }',
        },
        { name: 'vars', mime: 'application/json', content: '{ "existing": [] }' },
      ],
      expected:
        '{ "moves": [{ "from": "/stores/inbound/a.csv", "to": "/stores/archive/2026/12/01/a.csv", "renamed": false }, { "from": "/stores/inbound/old/a.csv", "to": "/stores/archive/2026/12/01/a_2.csv", "renamed": true }], "skipped": [] }',
    },
    {
      name: 'Name without an extension',
      inputs: [
        { name: 'payload', mime: 'application/json', content: '{ "files": [{ "path": "/stores/inbound/README", "handledAt": "2026-12-02T01:00:00Z", "status": "REJECTED" }] }' },
        { name: 'vars', mime: 'application/json', content: '{ "existing": ["/stores/error/2026/12/02/README"] }' },
      ],
      expected: '{ "moves": [{ "from": "/stores/inbound/README", "to": "/stores/error/2026/12/02/README_2", "renamed": true }], "skipped": [] }',
    },
  ],
  followUps: [
    {
      q: 'Why not add a timestamp to every archived name instead?',
      a: 'That also works and avoids clashes. A suffix keeps the original name readable, so pick one rule and use it everywhere.',
    },
    {
      q: 'Is a move on Azure File Share a copy and delete?',
      a: 'Over REST a rename operation exists in recent API versions. Older code copies and then deletes, which can leave both files after a crash. Check what your connector or API version does.',
    },
    {
      q: 'How long should archived store files stay?',
      a: 'Agree a retention period with the business, often long enough to replay a planning cycle, and remove older folders with a scheduled cleanup.',
    },
  ],
}
