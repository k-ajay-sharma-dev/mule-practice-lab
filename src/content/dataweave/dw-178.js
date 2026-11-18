export default {
  id: 'dw-178',
  category: 'dataweave',
  title: 'Parse a Unix Style FTP LIST: Missing Years, Server Time Zone and Names With Spaces',
  level: 'ADVANCED',
  tags: ['myproject', 'ftp', 'listing', 'time-zones', 'dates', 'regex', 'text/plain', 'json'],
  estMinutes: 25,
  description: `
Larkfield Grocers reads plan files from an old FTP server that does not support MLSD. The flow gets the raw \`LIST\` output as text and must turn it into a clean file list. Lines look like this:

\`\`\`
-rw-r--r--    1 ftp      ftp         20480 Nov 17 23:40 REPL_20261117.csv
-rw-r--r--    1 ftp      ftp         18890 Dec 30  2025 REPL_20251230.csv
\`\`\`

The fields are separated by one or more spaces: permissions, links, owner, group, size, month, day, then either a time \`HH:mm\` or a year, then the name. A name can contain spaces.

**Inputs**
- \`payload\`: the LIST text
- \`vars.today\`: the server's current date, \`yyyy-MM-dd\`
- \`vars.serverOffset\`: the server time zone offset, such as \`-05:00\`

**Rules**
- Keep only regular files, the lines that start with \`-\`. Skip directories, links and the \`total\` line.
- With a time and no year, the year is the year of \`today\`, unless that date is after \`today\`. Then it is the year before.
- With a year and no time, the time is \`00:00\`.
- \`modified\` is \`yyyy-MM-ddTHH:mm:00\` followed by the server offset.

Output a list of \`name\`, \`size\` as a number and \`modified\`, newest first.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'text/plain',
      content: `total 5
drwxr-xr-x    2 ftp      ftp          4096 Nov  1 09:15 archive
-rw-r--r--    1 ftp      ftp         20480 Nov 17 23:40 REPL_20261117.csv
-rw-r--r--    1 ftp      ftp             0 Nov 18 01:05 REPL_20261118.csv
-rw-r--r--    1 ftp      ftp         18890 Dec 30  2025 REPL_20251230.csv
-rw-r--r--    1 ftp      ftp          1024 Nov 18 02:10 Plan notes.txt
`,
    },
    {
      name: 'vars',
      mime: 'application/json',
      content: `{ "today": "2026-11-18", "serverOffset": "-05:00" }`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `[
  { "name": "Plan notes.txt", "size": 1024, "modified": "2026-11-18T02:10:00-05:00" },
  { "name": "REPL_20261118.csv", "size": 0, "modified": "2026-11-18T01:05:00-05:00" },
  { "name": "REPL_20261117.csv", "size": 20480, "modified": "2026-11-17T23:40:00-05:00" },
  { "name": "REPL_20251230.csv", "size": 18890, "modified": "2025-12-30T00:00:00-05:00" }
]`,
  },
  starterCode: `%dw 2.0
output application/json
---
(payload splitBy "\\n") filter ($ startsWith "-") map (line) -> do {
  var parts = line splitBy " "
  ---
  { name: parts[-1], size: parts[4] }
}
`,
  hints: [
    'Split a line on runs of spaces with `trim(line) splitBy /\\s+/`. Then the size is `parts[4]`, the month `parts[5]`, the day `parts[6]` and the time or year `parts[7]`.',
    'The name is everything from index 8: `parts[8 to -1] joinBy " "`.',
    'Map month names with an object such as `{ Jan: "01", Feb: "02", ... }` and read it with `months[parts[5]]`. Pad the day with `leftPad(parts[6], 2, "0")` from `dw::core::Strings`.',
    'Build the date with the current year first, then compare `candidate as Date > vars.today as Date` to decide whether to use the year before.',
    'Sort newest first with `orderBy -((($.modified) as DateTime) as Number)`.',
  ],
  solution: `%dw 2.0
import leftPad from dw::core::Strings
output application/json

var months = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
  Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12"
}

var thisYear = vars.today[0 to 3] as Number

fun parse(line) = do {
  var parts = trim(line) splitBy /\\s+/
  var mm = months[parts[5]]
  var dd = leftPad(parts[6], 2, "0")
  var hasTime = parts[7] contains ":"
  var guess = (thisYear as String) ++ "-" ++ mm ++ "-" ++ dd
  var year =
    if (not hasTime) parts[7]
    else if ((guess as Date) > (vars.today as Date)) ((thisYear - 1) as String)
    else (thisYear as String)
  var time = if (hasTime) leftPad(parts[7], 5, "0") else "00:00"
  ---
  {
    name: parts[8 to -1] joinBy " ",
    size: parts[4] as Number,
    modified: year ++ "-" ++ mm ++ "-" ++ dd ++ "T" ++ time ++ ":00" ++ vars.serverOffset
  }
}
---
((payload splitBy "\\n") filter ($ startsWith "-") map (line) -> parse(line))
  orderBy -((($.modified) as DateTime) as Number)`,
  explanation: `
**Runs of spaces.** LIST pads columns with spaces, and the number of spaces changes with the width of the values. Splitting on the regular expression \`/\\s+/\` gives one entry per field, whatever the padding. Trimming first stops a leading space from making an empty first field.

**Names with spaces.** The name is the last field, but it can itself contain spaces. Joining everything from index 8 puts it back together. Two spaces in a row inside a name would come back as one, which is a known limit of LIST parsing.

**The missing year.** Unix style listings show a time for recent files and a year for older ones. Using the current year works most of the time. Around New Year, a December file listed in January would land in the future, so a date after today means the year before.

**The server time zone.** LIST times are in the server's local time. Writing the offset into \`modified\` makes the value a full date time, which can be compared with other times or turned into UTC.

**Newest first.** Sorting on the date time as seconds works across offsets. Sorting the strings would only be safe when every value had the same offset.
`,
  tests: [
    {
      name: 'January: a December file belongs to last year',
      inputs: [
        {
          name: 'payload',
          mime: 'text/plain',
          content: '-rw-r--r--    1 ftp      ftp         20480 Dec 30 22:10 REPL_20261230.csv\n-rw-r--r--    1 ftp      ftp         20511 Jan  2 21:55 REPL_20270102.csv\n',
        },
        { name: 'vars', mime: 'application/json', content: '{ "today": "2027-01-03", "serverOffset": "+01:00" }' },
      ],
      expected:
        '[{ "name": "REPL_20270102.csv", "size": 20511, "modified": "2027-01-02T21:55:00+01:00" }, { "name": "REPL_20261230.csv", "size": 20480, "modified": "2026-12-30T22:10:00+01:00" }]',
    },
    {
      name: 'Only directories',
      inputs: [
        { name: 'payload', mime: 'text/plain', content: 'total 1\ndrwxr-xr-x    2 ftp      ftp          4096 Nov  1 09:15 archive\n' },
        { name: 'vars', mime: 'application/json', content: '{ "today": "2026-11-18", "serverOffset": "-05:00" }' },
      ],
      expected: '[]',
    },
  ],
  followUps: [
    {
      q: 'Why prefer MLSD when the server supports it?',
      a: 'It has a defined format with the type, size and modify time in UTC to the second, so no guessing about years, zones or column widths.',
    },
    {
      q: 'What does a Windows style LIST look like?',
      a: 'Something like `11-17-26  11:40PM  20480 REPL_20261117.csv`, with a different date order and a <DIR> marker for folders. A parser for one style fails on the other.',
    },
    {
      q: 'Where does the Mule FTP connector do this for you?',
      a: 'The list operation and the listener parse the listing and return file attributes with the name, size and timestamp. Knowing the format helps when those times look wrong.',
    },
  ],
}
