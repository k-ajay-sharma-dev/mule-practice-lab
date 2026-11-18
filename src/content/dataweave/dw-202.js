export default {
  id: 'dw-202',
  category: 'dataweave',
  title: 'Build the Control File for Split Parts Sent to the Planning Platform',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'large-files', 'planning-platform', 'control-file', 'checksum', 'csv'],
  estMinutes: 20,
  description: `
Brindle Outdoor writes a large sales feed to the planning platform as several part files. After the last part, the flow writes a control file. The platform reads it to check that every part arrived whole before it loads anything.

\`payload\` holds the stats of each part as it was written: \`partNo\`, \`fileName\`, \`rows\`, \`bytes\`, \`checksum\` (hex, shortened here) and \`createdAt\`. A part that was written again after an error appears twice. \`vars\` holds \`feed\` and \`businessDate\` (\`YYYYMMDD\`).

Write a CSV with the header \`RECORD_TYPE,FILE_NAME,ROW_COUNT,BYTE_COUNT,CHECKSUM\`:

- One \`D\` row per part, ordered by \`partNo\`, using only the latest entry per part by \`createdAt\`. Write the checksum in lower case.
- One \`T\` trailer row last, with \`FEED_YYYYMMDD\` as the file name, the total rows, the total bytes and an empty checksum.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `[
  { "partNo": 2, "fileName": "SALES_20261118_P002_OF_003.csv", "rows": 816667, "bytes": 204100150, "checksum": "9F2C41D0E8B7A615", "createdAt": "2026-11-18T04:10:00Z" },
  { "partNo": 1, "fileName": "SALES_20261118_P001_OF_003.csv", "rows": 816667, "bytes": 204000020, "checksum": "A1B2C3D4E5F60718", "createdAt": "2026-11-18T04:05:00Z" },
  { "partNo": 3, "fileName": "SALES_20261118_P003_OF_003.csv", "rows": 816666, "bytes": 203899830, "checksum": "c3d4e5f6a7b8c9d0", "createdAt": "2026-11-18T04:12:00Z" },
  { "partNo": 2, "fileName": "SALES_20261118_P002_OF_003.csv", "rows": 816667, "bytes": 204100160, "checksum": "7E8F9A0B1C2D3E4F", "createdAt": "2026-11-18T04:20:00Z" }
]`,
    },
    {
      name: 'vars',
      mime: 'application/json',
      content: `{ "feed": "SALES", "businessDate": "20261118" }`,
    },
  ],
  expected: {
    mime: 'application/csv',
    content: `RECORD_TYPE,FILE_NAME,ROW_COUNT,BYTE_COUNT,CHECKSUM
D,SALES_20261118_P001_OF_003.csv,816667,204000020,a1b2c3d4e5f60718
D,SALES_20261118_P002_OF_003.csv,816667,204100160,7e8f9a0b1c2d3e4f
D,SALES_20261118_P003_OF_003.csv,816666,203899830,c3d4e5f6a7b8c9d0
T,SALES_20261118,2450000,612000010,`,
  },
  starterCode: `%dw 2.0
output application/csv
---
payload map (p) -> {
  RECORD_TYPE: "D",
  FILE_NAME: p.fileName
}
`,
  hints: [
    'Group by `partNo`, keep the last entry of each group after sorting by `createdAt`, then sort the result by `partNo`.',
    'Build the detail rows and the trailer row as objects with the same keys, then join them with `++`.',
    'The CSV writer uses the keys of the first row as the header.',
  ],
  solution: `%dw 2.0
output application/csv

var parts = ((payload groupBy (p) -> p.partNo)
  pluck (entries, n) -> (entries orderBy (p) -> p.createdAt)[-1])
  orderBy (p) -> p.partNo

var details = parts map (p) -> {
  RECORD_TYPE: "D",
  FILE_NAME: p.fileName,
  ROW_COUNT: p.rows,
  BYTE_COUNT: p.bytes,
  CHECKSUM: lower(p.checksum)
}
---
details ++ [{
  RECORD_TYPE: "T",
  FILE_NAME: vars.feed ++ "_" ++ vars.businessDate,
  ROW_COUNT: sum(parts map (p) -> p.rows),
  BYTE_COUNT: sum(parts map (p) -> p.bytes),
  CHECKSUM: ""
}]`,
  explanation: `
**Last write wins.** Part 2 was written twice. The first copy was replaced on the server, so the control file must describe the second one. Old stats would make the platform reject a good file.

**Checksums in one form.** Tools print hex in upper or lower case. Writing one case avoids a false mismatch on the other side.

**A trailer with totals.** The platform can check the sum of rows against what it loaded from all parts, and the part list against the files it found.

**Control file last.** Writing it after all parts means its presence says "the set is complete". The receiver waits for it before reading anything.
`,
  tests: [
    {
      name: 'Single part',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '[{ "partNo": 1, "fileName": "STORES_20261119_P001_OF_001.csv", "rows": 812, "bytes": 90210, "checksum": "ABCDEF0123456789", "createdAt": "2026-11-19T04:00:00Z" }]',
        },
        { name: 'vars', mime: 'application/json', content: '{ "feed": "STORES", "businessDate": "20261119" }' },
      ],
      expected: `RECORD_TYPE,FILE_NAME,ROW_COUNT,BYTE_COUNT,CHECKSUM
D,STORES_20261119_P001_OF_001.csv,812,90210,abcdef0123456789
T,STORES_20261119,812,90210,`,
    },
  ],
  followUps: [
    {
      q: 'Which checksum would you use?',
      a: 'SHA-256 is a common choice for integrity. MD5 still catches accidental damage but is weak against tampering. Use what the platform team agrees to.',
    },
    {
      q: 'How do you compute a checksum of a large part without loading it?',
      a: 'Read the file as a stream through a digest, for example in a small Java helper, while it is written or right after.',
    },
    {
      q: 'What if the flow crashes after two of three parts?',
      a: 'No control file is written, so the platform ignores the set. The rerun writes all parts again and then the control file.',
    },
  ],
}
