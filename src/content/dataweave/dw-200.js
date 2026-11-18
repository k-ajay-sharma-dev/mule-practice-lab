export default {
  id: 'dw-200',
  category: 'dataweave',
  title: 'Route Incoming Files by Size Before Reading Them',
  level: 'BEGINNER',
  tags: ['myproject', 'large-files', 'sftp', 'file-size', 'routing', 'json'],
  estMinutes: 12,
  description: `
Hollin Garden Supply picks up CSV files from an SFTP folder. Small files are fine to read into memory. Large files must go to a streaming flow. Huge files are refused before anyone opens them, and empty files are only markers.

\`payload\` is the folder listing with \`fileName\` and \`size\` in bytes. \`vars.streamOverBytes\` and \`vars.rejectOverBytes\` hold the limits.

For each file, in listing order:

- \`fileName\`
- \`sizeMb\`: the size in MB (1 MB = 1,048,576 bytes), rounded to 1 decimal
- \`route\`: \`EMPTY\` for 0 bytes, \`TOO_LARGE\` above \`rejectOverBytes\`, \`STREAM\` above \`streamOverBytes\`, otherwise \`MEMORY\`

Also output \`totalMb\` for all files, rounded to 1 decimal.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `[
  { "fileName": "stores_20261118.csv", "size": 524288 },
  { "fileName": "sales_20261118.csv", "size": 734003200 },
  { "fileName": "done_20261118.csv", "size": 0 },
  { "fileName": "history_2025.csv", "size": 2147483648 },
  { "fileName": "onhand_20261118.csv", "size": 15728640 },
  { "fileName": "items_delta.csv", "size": 3355443 }
]`,
    },
    {
      name: 'vars',
      mime: 'application/json',
      content: `{ "streamOverBytes": 10485760, "rejectOverBytes": 1073741824 }`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "files": [
    { "fileName": "stores_20261118.csv", "sizeMb": 0.5, "route": "MEMORY" },
    { "fileName": "sales_20261118.csv", "sizeMb": 700, "route": "STREAM" },
    { "fileName": "done_20261118.csv", "sizeMb": 0, "route": "EMPTY" },
    { "fileName": "history_2025.csv", "sizeMb": 2048, "route": "TOO_LARGE" },
    { "fileName": "onhand_20261118.csv", "sizeMb": 15, "route": "STREAM" },
    { "fileName": "items_delta.csv", "sizeMb": 3.2, "route": "MEMORY" }
  ],
  "totalMb": 2766.7
}`,
  },
  starterCode: `%dw 2.0
output application/json
---
{
  files: payload map (f) -> {
    fileName: f.fileName,
    sizeMb: f.size / 1048576
  }
}
`,
  hints: [
    'Write a small function `mb(bytes)` that divides and rounds with `round(x * 10) / 10`.',
    'Check the routes from the most specific: empty, then too large, then stream.',
    '`sum(payload map (f) -> f.size)` gives the total bytes. `sum([])` is 0.',
  ],
  solution: `%dw 2.0
output application/json

fun mb(bytes) = round(bytes / 1048576 * 10) / 10
---
{
  files: payload map (f) -> {
    fileName: f.fileName,
    sizeMb: mb(f.size),
    route:
      if (f.size == 0) "EMPTY"
      else if (f.size > vars.rejectOverBytes) "TOO_LARGE"
      else if (f.size > vars.streamOverBytes) "STREAM"
      else "MEMORY"
  },
  totalMb: mb(sum(payload map (f) -> f.size))
}`,
  explanation: `
**Decide from the listing.** The size is in the file attributes. The flow can pick a route before it reads a single byte, so a huge file never lands in memory by mistake.

**Empty files are signals.** Many senders write an empty done file after the data file. It should not run through a load.

**Limits in properties.** The thresholds depend on the worker size, so they belong in properties per environment.
`,
  tests: [
    {
      name: 'File exactly at the stream limit',
      inputs: [
        { name: 'payload', mime: 'application/json', content: '[{ "fileName": "prices.csv", "size": 10485760 }, { "fileName": "prices_big.csv", "size": 10485761 }]' },
        { name: 'vars', mime: 'application/json', content: '{ "streamOverBytes": 10485760, "rejectOverBytes": 1073741824 }' },
      ],
      expected:
        '{ "files": [{ "fileName": "prices.csv", "sizeMb": 10, "route": "MEMORY" }, { "fileName": "prices_big.csv", "sizeMb": 10, "route": "STREAM" }], "totalMb": 20 }',
    },
    {
      name: 'Empty folder',
      inputs: [
        { name: 'payload', mime: 'application/json', content: '[]' },
        { name: 'vars', mime: 'application/json', content: '{ "streamOverBytes": 10485760, "rejectOverBytes": 1073741824 }' },
      ],
      expected: '{ "files": [], "totalMb": 0 }',
    },
  ],
  followUps: [
    {
      q: 'What should happen to a TOO_LARGE file?',
      a: 'Move it to a hold folder and alert the sender or support. Agree on splitting it at the source.',
    },
    {
      q: 'Can the size in a listing be wrong?',
      a: 'Yes, while the sender is still writing. Wait until the size stays the same between two polls, or for a done file.',
    },
    {
      q: 'Why not stream every file, small ones too?',
      a: 'Streaming adds care in every step. Small files read into memory are quicker to code and test, and they are safe below the limit.',
    },
  ],
}
