export default {
  id: 'dw-170',
  category: 'dataweave',
  title: 'Build Dated, Sequenced File Names and Temporary Paths for an SFTP Upload',
  level: 'BEGINNER',
  tags: ['myproject', 'sftp', 'planning-platform', 'file-names', 'dates', 'number-format', 'json'],
  estMinutes: 10,
  description: `
Brindle Outdoor sends daily feeds to the planning platform over SFTP. Each file name holds the feed, the business date and a sequence number, so the platform can load files in order and spot a gap. Mule writes each file under a temporary name first and renames it when the upload is complete.

Build the names and paths:

- \`fileName\`: the feed in upper case, \`_\`, the business date as \`yyyyMMdd\`, \`_\`, the sequence with at least 4 digits (zero padded), \`.\` and the extension. For example \`SALES_20261117_0004.csv\`.
- \`tempName\`: the file name followed by \`.tmp\`
- \`directory\`: the base directory, \`/\` and the partner code in lower case
- \`tempPath\` and \`finalPath\`: the directory, \`/\` and the temporary or final name
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{
  "partner": "PLANPLAT",
  "feed": "sales",
  "businessDate": "2026-11-17",
  "sequence": 4,
  "extension": "csv",
  "baseDir": "/outbound"
}`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "fileName": "SALES_20261117_0004.csv",
  "tempName": "SALES_20261117_0004.csv.tmp",
  "directory": "/outbound/planplat",
  "tempPath": "/outbound/planplat/SALES_20261117_0004.csv.tmp",
  "finalPath": "/outbound/planplat/SALES_20261117_0004.csv"
}`,
  },
  starterCode: `%dw 2.0
output application/json
---
{
  fileName: payload.feed ++ "_" ++ payload.businessDate ++ "_" ++ payload.sequence ++ "." ++ payload.extension
}
`,
  hints: [
    'Format the date with `payload.businessDate as Date as String {format: "yyyyMMdd"}`.',
    'Zero pad the sequence with `payload.sequence as String {format: "0000"}`.',
    '`upper` and `lower` change the case of the feed and the partner.',
    'Build `fileName` and `directory` once in `var`s, then reuse them for the paths.',
  ],
  solution: `%dw 2.0
output application/json
var datePart = payload.businessDate as Date as String {format: "yyyyMMdd"}
var seqPart = payload.sequence as String {format: "0000"}
var fileName = upper(payload.feed) ++ "_" ++ datePart ++ "_" ++ seqPart ++ "." ++ payload.extension
var directory = payload.baseDir ++ "/" ++ lower(payload.partner)
---
{
  fileName: fileName,
  tempName: fileName ++ ".tmp",
  directory: directory,
  tempPath: directory ++ "/" ++ fileName ++ ".tmp",
  finalPath: directory ++ "/" ++ fileName
}`,
  explanation: `
**Dates in names.** \`yyyyMMdd\` sorts in date order as text and has no characters that file systems dislike, such as slashes or colons.

**Zero padded sequences.** The format \`0000\` pads to four digits, so file names sort in order as text: \`0009\` comes before \`0010\`. A larger number keeps all its digits, as the test with 12345 shows, so nothing is cut off.

**Temporary name then rename.** The upload goes to the \`.tmp\` path. The planning platform only picks names that end in \`.csv\`, so it never loads a file that is still uploading. The final rename is quick and, on most servers, atomic.

**One place for each part.** The file name and directory are built once. The two paths reuse them, so they can never disagree.
`,
  tests: [
    {
      name: 'A three digit sequence',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '{ "partner": "PlanPlat", "feed": "inventory", "businessDate": "2026-01-05", "sequence": 123, "extension": "dat", "baseDir": "/out" }',
        },
      ],
      expected:
        '{ "fileName": "INVENTORY_20260105_0123.dat", "tempName": "INVENTORY_20260105_0123.dat.tmp", "directory": "/out/planplat", "tempPath": "/out/planplat/INVENTORY_20260105_0123.dat.tmp", "finalPath": "/out/planplat/INVENTORY_20260105_0123.dat" }',
    },
    {
      name: 'A sequence longer than four digits',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '{ "partner": "DC1", "feed": "receipts", "businessDate": "2026-12-31", "sequence": 12345, "extension": "csv", "baseDir": "/outbound" }',
        },
      ],
      expected:
        '{ "fileName": "RECEIPTS_20261231_12345.csv", "tempName": "RECEIPTS_20261231_12345.csv.tmp", "directory": "/outbound/dc1", "tempPath": "/outbound/dc1/RECEIPTS_20261231_12345.csv.tmp", "finalPath": "/outbound/dc1/RECEIPTS_20261231_12345.csv" }',
    },
  ],
  followUps: [
    {
      q: 'Where does the sequence number come from?',
      a: 'From a counter that survives restarts, such as a database sequence or a persistent object store entry, increased once per file and per feed.',
    },
    {
      q: 'Why not use the time of day in the name instead of a sequence?',
      a: 'Times do not show a gap. With a sequence, the receiver sees that 0005 is missing between 0004 and 0006 and can ask for it.',
    },
    {
      q: 'The rename fails because the final name exists. What do you do?',
      a: 'Stop and alert. It means a resend or a sequence reuse, and overwriting could replace a file the platform has not loaded yet.',
    },
  ],
}
