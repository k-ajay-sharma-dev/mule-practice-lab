export default {
  id: 'dw-175',
  category: 'dataweave',
  title: 'Pick the Ready Files From an FTP Listing: Name Pattern, Empty Files and Minimum Age',
  level: 'BEGINNER',
  tags: ['myproject', 'ftp', 'listing', 'file-selection', 'dates', 'filter', 'json'],
  estMinutes: 15,
  description: `
Brindle Outdoor collects store master files from a supplier FTP server. A scheduled Mule flow lists the folder and must decide which files to read. The supplier writes files slowly, so a file is only safe to read when it has not changed for a few minutes.

**Inputs**
- \`payload\`: the listing, each entry with \`name\`, \`size\`, \`directory\` and \`modified\`, an ISO date time in UTC
- \`vars.now\`: the time of the poll
- \`vars.prefix\`: the name prefix, such as \`STORES_\`
- \`vars.minAgeMinutes\`: how long a file must be unchanged

**Rules**
- Only regular files whose name starts with the prefix and ends with \`.csv\` count. Ignore everything else.
- \`empty\`: matching files with size 0
- \`waiting\`: matching files with a size above 0 that changed less than \`minAgeMinutes\` ago
- \`ready\`: the other matching files, oldest \`modified\` first

Each list holds file names. \`empty\` and \`waiting\` keep listing order.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `[
  { "name": "STORES_20261118_01.csv", "size": 48210, "directory": false, "modified": "2026-11-18T05:12:00Z" },
  { "name": "STORES_20261118_02.csv", "size": 0, "directory": false, "modified": "2026-11-18T05:20:00Z" },
  { "name": "archive", "size": 0, "directory": true, "modified": "2026-11-01T00:00:00Z" },
  { "name": "STORES_20261118_03.csv", "size": 51000, "directory": false, "modified": "2026-11-18T05:55:00Z" },
  { "name": "STORES_20261117_04.csv", "size": 47000, "directory": false, "modified": "2026-11-17T23:40:00Z" },
  { "name": "readme.txt", "size": 300, "directory": false, "modified": "2026-10-01T00:00:00Z" }
]`,
    },
    {
      name: 'vars',
      mime: 'application/json',
      content: `{ "now": "2026-11-18T06:00:00Z", "prefix": "STORES_", "minAgeMinutes": 10 }`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "ready": ["STORES_20261117_04.csv", "STORES_20261118_01.csv"],
  "waiting": ["STORES_20261118_03.csv"],
  "empty": ["STORES_20261118_02.csv"]
}`,
  },
  starterCode: `%dw 2.0
output application/json
---
{
  ready: payload filter ($.size > 0) map $.name
}
`,
  hints: [
    'Keep the matching files first: `f.directory == false and (f.name startsWith vars.prefix) and (f.name endsWith ".csv")`. Avoid a leading `not` here, because it applies to the whole `and` chain after it.',
    'Turn a time into seconds with `(f.modified as DateTime) as Number`. The age in minutes is the difference divided by 60.',
    'Sort the ready files with `orderBy` on the seconds value, then `map $.name`.',
  ],
  solution: `%dw 2.0
output application/json

fun seconds(t) = (t as DateTime) as Number
fun ageMinutes(f) = (seconds(vars.now) - seconds(f.modified)) / 60

var matching = payload filter (f) ->
  f.directory == false and (f.name startsWith vars.prefix) and (f.name endsWith ".csv")

var empty = matching filter ($.size == 0)
var waiting = matching filter (f) -> f.size > 0 and ageMinutes(f) < vars.minAgeMinutes
var ready = matching filter (f) -> f.size > 0 and ageMinutes(f) >= vars.minAgeMinutes
---
{
  ready: (ready orderBy seconds($.modified)) map $.name,
  waiting: waiting map $.name,
  empty: empty map $.name
}`,
  explanation: `
**Match first.** The folder holds a directory, a readme and the files you want. Filtering on the type, prefix and extension once gives one list that every other rule works on.

**Age in minutes.** A \`DateTime\` coerced to \`Number\` gives seconds since 1970. The difference between the poll time and the file time, divided by 60, is the age. A file younger than the limit may still be growing, so it waits for the next poll.

**Empty files.** A size of 0 usually means a failed export. Keeping them in their own list lets the flow move them to an error folder and alert, instead of loading nothing and calling it success.

**Oldest first.** Reading the oldest file first keeps the supplier's order when two days arrive together.
`,
  tests: [
    {
      name: 'Empty folder',
      inputs: [
        { name: 'payload', mime: 'application/json', content: '[]' },
        { name: 'vars', mime: 'application/json', content: '{ "now": "2026-11-18T06:00:00Z", "prefix": "STORES_", "minAgeMinutes": 10 }' },
      ],
      expected: '{ "ready": [], "waiting": [], "empty": [] }',
    },
    {
      name: 'Exactly at the minimum age',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '[{ "name": "STORES_20261118_05.csv", "size": 900, "directory": false, "modified": "2026-11-18T05:50:00Z" }, { "name": "STORES_20261118_06.csv", "size": 950, "directory": false, "modified": "2026-11-18T05:51:00Z" }]',
        },
        { name: 'vars', mime: 'application/json', content: '{ "now": "2026-11-18T06:00:00Z", "prefix": "STORES_", "minAgeMinutes": 10 }' },
      ],
      expected: '{ "ready": ["STORES_20261118_05.csv"], "waiting": ["STORES_20261118_06.csv"], "empty": [] }',
    },
  ],
  followUps: [
    {
      q: 'Why not use the listener size check instead?',
      a: 'The listener can wait for a stable size with timeBetweenSizeCheck. In a scheduled flow that lists itself, an age rule like this does the same job.',
    },
    {
      q: 'Is the modified time from an FTP server always in UTC?',
      a: 'No. Plain LIST times are often in the server time zone. Convert them to UTC first, or the age is off by hours.',
    },
    {
      q: 'What is a stronger signal than age?',
      a: 'A rename from a temporary name, or a control file written after the data file. Age is a fallback when the sender offers neither.',
    },
  ],
}
