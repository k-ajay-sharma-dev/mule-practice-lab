export default {
  id: 'dw-160',
  category: 'dataweave',
  title: 'Build Date Prefixed Blob Names for Nightly Exports',
  level: 'BEGINNER',
  tags: ['myproject', 'azure-blob', 'blob-naming', 'dates', 'format', 'strings', 'map', 'json'],
  estMinutes: 10,
  description: `
Orchard Lane Foods writes nightly exports from several systems to one Azure Blob Storage container called \`nightly-exports\`. To keep the container tidy and cheap to list, each blob name starts with the system and the date:

\`<system>/<yyyy>/<MM>/<dd>/<file name>\`

For each file in the input, output:

- \`container\`: always \`nightly-exports\`
- \`blobName\`: the system in lower case, the date of \`createdAt\` as \`yyyy/MM/dd\`, then the file name in lower case with each space replaced by a dash
- \`contentType\`: \`text/csv\` for a \`.csv\` file, \`application/json\` for a \`.json\` file, otherwise \`application/octet-stream\` (check the extension of the lower case name)

All \`createdAt\` values are in UTC.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `[
  { "system": "SAP", "fileName": "Stock Levels.csv", "createdAt": "2026-11-18T01:30:00Z" },
  { "system": "Salesforce", "fileName": "accounts.json", "createdAt": "2026-11-17T23:55:00Z" },
  { "system": "WMS", "fileName": "Pick List 7.dat", "createdAt": "2026-11-18T02:05:00Z" }
]`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `[
  { "container": "nightly-exports", "blobName": "sap/2026/11/18/stock-levels.csv", "contentType": "text/csv" },
  { "container": "nightly-exports", "blobName": "salesforce/2026/11/17/accounts.json", "contentType": "application/json" },
  { "container": "nightly-exports", "blobName": "wms/2026/11/18/pick-list-7.dat", "contentType": "application/octet-stream" }
]`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload map (f) -> {
  container: "nightly-exports",
  blobName: f.system ++ "/" ++ f.fileName
}
`,
  hints: [
    'Turn the text into a date and time first: `f.createdAt as DateTime`.',
    'Then format it: `as String {format: "yyyy/MM/dd"}`. The slashes in the pattern become the folder separators.',
    '`lower(...) replace " " with "-"` cleans the file name.',
    '`endsWith` checks the extension. Use `if` and `else if` for the content type.',
  ],
  solution: `%dw 2.0
output application/json

fun contentTypeOf(name) =
  if (name endsWith ".csv") "text/csv"
  else if (name endsWith ".json") "application/json"
  else "application/octet-stream"
---
payload map (f) -> do {
  var fileName = lower(f.fileName) replace " " with "-"
  var datePath = f.createdAt as DateTime as String {format: "yyyy/MM/dd"}
  ---
  {
    container: "nightly-exports",
    blobName: lower(f.system) ++ "/" ++ datePath ++ "/" ++ fileName,
    contentType: contentTypeOf(fileName)
  }
}`,
  explanation: `
**Folders are part of the name.** Blob Storage has a flat list of blobs per container. A name such as \`sap/2026/11/18/stock-levels.csv\` only looks like folders. Tools show the slashes as folders, and a list call with a prefix such as \`sap/2026/11/\` returns one system and one month.

**Date first in the name.** Putting the date in the name makes listing by day cheap and makes lifecycle rules by prefix possible.

**Format patterns.** \`yyyy\` is the year, \`MM\` the month and \`dd\` the day, each with leading zeros. Lower case \`mm\` would be minutes, a common mistake.

**Clean names.** Spaces in blob names work, but they must be encoded in URLs and often go wrong in scripts. Lower case with dashes avoids that.

**Content type.** Setting it when the blob is written means a browser or a later download knows what the file is. Without it, the blob may be stored as \`application/octet-stream\`.
`,
  tests: [
    {
      name: 'Start of a new year',
      inputs: [{ name: 'payload', mime: 'application/json', content: '[{ "system": "HR", "fileName": "New Starters.json", "createdAt": "2027-01-01T00:10:00Z" }]' }],
      expected: '[{ "container": "nightly-exports", "blobName": "hr/2027/01/01/new-starters.json", "contentType": "application/json" }]',
    },
    {
      name: 'No files',
      inputs: [{ name: 'payload', mime: 'application/json', content: '[]' }],
      expected: '[]',
    },
  ],
  followUps: [
    {
      q: 'The timestamps arrive in local time with an offset. Which date should the name use?',
      a: 'Agree on one zone for the whole container, usually UTC, and convert with the >> operator before formatting. Mixing zones puts files from one night under two dates.',
    },
    {
      q: 'Why put the system first and the date after, not the other way round?',
      a: 'Most reads ask for one system over some days. With the system first, one prefix lists that system. If reads were mostly all systems for one day, the date would go first.',
    },
    {
      q: 'Two runs on the same night write the same file name. What happens?',
      a: 'The second upload overwrites the first blob unless the write checks for an existing blob. Add a run id or time to the name, or use a condition so the upload fails when the blob exists.',
    },
  ],
}
