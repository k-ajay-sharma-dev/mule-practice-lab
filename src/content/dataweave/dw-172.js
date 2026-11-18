export default {
  id: 'dw-172',
  category: 'dataweave',
  title: 'Choose Which Files to Read From an SFTP Listing: Folders, Empty Files and Files Still Being Written',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'sftp', 'list-operation', 'half-written-files', 'dates', 'filter', 'orderBy', 'json'],
  estMinutes: 20,
  description: `
Quayle Freight reads carrier files with a scheduled Mule flow. The flow calls the SFTP List operation and turns the attributes of each entry into a small record with \`fileName\`, \`path\`, \`size\`, \`timestamp\` (UTC) and \`directory\`. Now it must decide which files to read.

For each entry, find the first reason to skip it:

1. It is a directory: \`directory\`
2. Its name does not end with \`.csv\`, in any case: \`not a csv file\`
3. Its size is 0: \`empty file\`
4. It was modified less than \`vars.minAgeMinutes\` minutes before \`vars.now\`: \`still being written\`

Output:

- \`pick\`: the \`path\` of every file with no reason to skip, oldest timestamp first
- \`skipped\`: in listing order, each with \`fileName\` and \`reason\`
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `[
  { "fileName": "POD_20261118_0002.csv", "path": "/inbound/carriers/POD_20261118_0002.csv", "size": 18234, "timestamp": "2026-11-18T06:10:00Z", "directory": false },
  { "fileName": "archive", "path": "/inbound/carriers/archive", "size": 4096, "timestamp": "2026-11-01T00:00:00Z", "directory": true },
  { "fileName": "POD_20261118_0001.csv", "path": "/inbound/carriers/POD_20261118_0001.csv", "size": 20110, "timestamp": "2026-11-18T05:55:00Z", "directory": false },
  { "fileName": "POD_20261118_0003.csv", "path": "/inbound/carriers/POD_20261118_0003.csv", "size": 9120, "timestamp": "2026-11-18T06:28:30Z", "directory": false },
  { "fileName": "POD_20261118_0004.csv", "path": "/inbound/carriers/POD_20261118_0004.csv", "size": 0, "timestamp": "2026-11-18T06:00:00Z", "directory": false },
  { "fileName": "POD_20261118_0005.csv.filepart", "path": "/inbound/carriers/POD_20261118_0005.csv.filepart", "size": 512, "timestamp": "2026-11-18T06:29:00Z", "directory": false },
  { "fileName": "EXC_20261118_0001.CSV", "path": "/inbound/carriers/EXC_20261118_0001.CSV", "size": 3300, "timestamp": "2026-11-18T06:25:00Z", "directory": false }
]`,
    },
    {
      name: 'vars',
      mime: 'application/json',
      content: '{ "now": "2026-11-18T06:30:00Z", "minAgeMinutes": 5 }',
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "pick": [
    "/inbound/carriers/POD_20261118_0001.csv",
    "/inbound/carriers/POD_20261118_0002.csv",
    "/inbound/carriers/EXC_20261118_0001.CSV"
  ],
  "skipped": [
    { "fileName": "archive", "reason": "directory" },
    { "fileName": "POD_20261118_0003.csv", "reason": "still being written" },
    { "fileName": "POD_20261118_0004.csv", "reason": "empty file" },
    { "fileName": "POD_20261118_0005.csv.filepart", "reason": "not a csv file" }
  ]
}`,
  },
  starterCode: `%dw 2.0
output application/json
---
{
  pick: (payload filter ($.size > 0)) map $.path,
  skipped: []
}
`,
  hints: [
    'Turn a time into seconds since 1970 with `t as DateTime as Number`. The age in minutes is then `(nowSec - fileSec) / 60`.',
    'Write `fun reasonFor(f)` as an `if ... else if` chain that returns a reason, or `null` when the file is fine.',
    'Compare names in lower case: `lower(f.fileName) endsWith ".csv"`.',
    'Map each entry once to `{ entry: f, reason: reasonFor(f) }`, then filter that list twice: once for `null` reasons and once for the rest.',
  ],
  solution: `%dw 2.0
output application/json
var nowSec = vars.now as DateTime as Number

fun secondsOf(t) = t as DateTime as Number

fun reasonFor(f) =
  if (f.directory) "directory"
  else if ((lower(f.fileName) endsWith ".csv") == false) "not a csv file"
  else if (f.size == 0) "empty file"
  else if ((nowSec - secondsOf(f.timestamp)) / 60 < vars.minAgeMinutes) "still being written"
  else null

var checked = payload map (f) -> { entry: f, reason: reasonFor(f) }
---
{
  pick: ((checked filter ($.reason == null)) orderBy (secondsOf($.entry.timestamp))) map $.entry.path,
  skipped: (checked filter ($.reason != null)) map (c) -> { fileName: c.entry.fileName, reason: c.reason }
}`,
  explanation: `
**One reason per entry.** The \`if\` chain returns the first rule that applies. A directory is never reported as "not a csv file", and an empty upload part is reported once.

**Time as numbers.** Converting each time to seconds since 1970 turns the age check into plain arithmetic. The file \`EXC_20261118_0001.CSV\` is exactly 5 minutes old, which is not less than 5, so it is picked.

**Case.** Partners write \`.CSV\` as often as \`.csv\`. Lower casing the name before the check accepts both.

**Temporary upload names.** Desktop clients often upload to \`.filepart\` or similar and rename at the end. The extension check skips those, so a half uploaded file is never read.

**Oldest first.** Reading in time order keeps the business order when a later file corrects an earlier one.

**Why not trust the listing alone.** A file still being written looks like any other entry. The minimum age is a cheap guard. A control file or a trailer count from the sender is stronger.
`,
  tests: [
    {
      name: 'Empty folder',
      inputs: [
        { name: 'payload', mime: 'application/json', content: '[]' },
        { name: 'vars', mime: 'application/json', content: '{ "now": "2026-11-18T06:30:00Z", "minAgeMinutes": 5 }' },
      ],
      expected: '{ "pick": [], "skipped": [] }',
    },
    {
      name: 'One second under the minimum age',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content:
            '[{ "fileName": "a.csv", "path": "/in/a.csv", "size": 10, "timestamp": "2026-11-18T06:25:01Z", "directory": false }, { "fileName": "b.csv", "path": "/in/b.csv", "size": 10, "timestamp": "2026-11-18T05:00:00Z", "directory": false }]',
        },
        { name: 'vars', mime: 'application/json', content: '{ "now": "2026-11-18T06:30:00Z", "minAgeMinutes": 5 }' },
      ],
      expected: '{ "pick": ["/in/b.csv"], "skipped": [{ "fileName": "a.csv", "reason": "still being written" }] }',
    },
  ],
  followUps: [
    {
      q: 'Why does the flow pass now in as a variable instead of calling now() in the script?',
      a: 'It makes the script testable with fixed times, and every file in one run is judged against the same moment.',
    },
    {
      q: 'The SFTP server clock is ten minutes behind. What happens?',
      a: 'Files look older than they are, so the age check lets them through too early. Compare against the server time, or rely on markers from the sender.',
    },
    {
      q: 'What happens to the skipped files?',
      a: 'Still being written files are checked again on the next run. Empty and wrong type files should raise an alert after a while, or they sit there forever.',
    },
  ],
}
