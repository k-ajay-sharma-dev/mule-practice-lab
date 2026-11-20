export default {
  id: 'dw-164',
  category: 'dataweave',
  title: 'Turn a Blob Inventory CSV into a Tiering and Cost Report per Container',
  level: 'EXPERT',
  tags: ['myproject', 'azure-blob', 'blob-inventory', 'access-tiers', 'csv', 'groupBy', 'dates', 'multiple-inputs', 'json'],
  estMinutes: 35,
  description: `
Thornbury Freight pays more each month for Azure Blob Storage. A daily inventory job writes one CSV row per blob, and the team wants a report that shows where the space goes and which blobs could move to a cheaper tier.

The CSV has the columns \`Container\`, \`Name\`, \`Content-Length\` (bytes), \`Last-Modified\` and \`AccessTier\`. The second input, \`vars\`, gives \`reportDate\`, \`coolAfterDays\` and \`archiveAfterDays\`.

For each blob, the age is the number of days from the date of \`Last-Modified\` to \`reportDate\`:

- **toArchive**: the tier is not \`Archive\` and the age is at least \`archiveAfterDays\`.
- **toCool**: otherwise, the tier is \`Hot\` and the age is at least \`coolAfterDays\`.

Output:

- \`containers\`: sorted by name as text, each with \`container\`, \`blobCount\`, \`sizeGB\`, \`tiers\` (count per tier, keys sorted by name as text), \`toCool\` and \`toArchive\` (blob names in input order, empty arrays when none)
- \`totals\`: \`blobCount\`, \`sizeGB\`, \`toCoolGB\` and \`toArchiveGB\`

A GB here is 1,073,741,824 bytes. Round every GB value to the nearest 0.01, after adding up the bytes. A total with no blobs is 0. Use only the date part of \`Last-Modified\` (all values are UTC), so a blob modified on 2026-10-19 is 30 days old on 2026-11-18.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/csv',
      content: `Container,Name,Content-Length,Last-Modified,AccessTier
invoices,2025/03/batch-01.zip,2147483648,2025-03-02T10:00:00Z,Hot
invoices,2026/10/batch-44.zip,1073741824,2026-10-01T10:00:00Z,Hot
invoices,2026/11/batch-50.zip,536870912,2026-11-16T10:00:00Z,Hot
images,catalog/sku-1001.jpg,268435456,2026-01-10T08:00:00Z,Cool
images,catalog/sku-1002.jpg,268435456,2026-09-01T08:00:00Z,Cool
images,catalog/old/sku-0007.jpg,1073741824,2024-05-05T08:00:00Z,Archive
logs,app/2026-11-17.log,322122547,2026-11-17T23:00:00Z,Hot`,
    },
    {
      name: 'vars',
      mime: 'application/json',
      content: '{ "reportDate": "2026-11-18", "coolAfterDays": 30, "archiveAfterDays": 180 }',
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "containers": [
    {
      "container": "images",
      "blobCount": 3,
      "sizeGB": 1.5,
      "tiers": { "Archive": 1, "Cool": 2 },
      "toCool": [],
      "toArchive": ["catalog/sku-1001.jpg"]
    },
    {
      "container": "invoices",
      "blobCount": 3,
      "sizeGB": 3.5,
      "tiers": { "Hot": 3 },
      "toCool": ["2026/10/batch-44.zip"],
      "toArchive": ["2025/03/batch-01.zip"]
    },
    {
      "container": "logs",
      "blobCount": 1,
      "sizeGB": 0.3,
      "tiers": { "Hot": 1 },
      "toCool": [],
      "toArchive": []
    }
  ],
  "totals": { "blobCount": 7, "sizeGB": 5.3, "toCoolGB": 1, "toArchiveGB": 2.25 }
}`,
  },
  starterCode: `%dw 2.0
output application/json
---
{
  containers: payload groupBy $.Container pluck (rows, c) -> {
    container: c as String,
    blobCount: sizeOf(rows)
  },
  totals: { blobCount: sizeOf(payload) }
}
`,
  hints: [
    'Map each CSV row once into a record with `container`, `name`, `bytes` (a Number), `tier` and `action`. Every later step reads that record.',
    'The age is `daysBetween(row."Last-Modified" as DateTime as Date, vars.reportDate as Date)`.',
    'Write `fun gb(list) = round(sum(list map $.bytes) / 1073741824 * 100) / 100`. It takes a list of records, so the same function works per container and for the totals.',
    'For `tiers`, group by tier, `pluck` to a list, sort it, then build an object with `{ (list map { ($.tier): $.count }) }`.',
  ],
  solution: `%dw 2.0
output application/json
var reportDate = vars.reportDate as Date

fun actionOf(tier, ageDays) =
  if (tier != "Archive" and ageDays >= vars.archiveAfterDays) "archive"
  else if (tier == "Hot" and ageDays >= vars.coolAfterDays) "cool"
  else "none"

var blobs = payload map (r) -> do {
  var age = daysBetween(r."Last-Modified" as DateTime as Date, reportDate)
  ---
  {
    container: r.Container,
    name: r.Name,
    bytes: r."Content-Length" as Number,
    tier: r.AccessTier,
    action: actionOf(r.AccessTier, age)
  }
}

fun gb(list) = round(sum(list map $.bytes) / 1073741824 * 100) / 100

fun tierCounts(list) = {
  ((list groupBy $.tier pluck (rows, t) -> { tier: t as String, count: sizeOf(rows) })
    orderBy $.tier
    map (t) -> { (t.tier): t.count })
}
---
{
  containers: (blobs groupBy $.container pluck (rows, c) -> {
    container: c as String,
    blobCount: sizeOf(rows),
    sizeGB: gb(rows),
    tiers: tierCounts(rows),
    toCool: (rows filter (b) -> b.action == "cool") map $.name,
    toArchive: (rows filter (b) -> b.action == "archive") map $.name
  }) orderBy $.container,
  totals: {
    blobCount: sizeOf(blobs),
    sizeGB: gb(blobs),
    toCoolGB: gb(blobs filter (b) -> b.action == "cool"),
    toArchiveGB: gb(blobs filter (b) -> b.action == "archive")
  }
}`,
  explanation: `
**One clean record per row.** CSV values are text. The first \`map\` turns the size into a number, works out the age and decides the action once. Grouping and totals then never parse a column again.

**One rule, one place.** \`actionOf\` checks archive before cool. A Hot blob that is 300 days old should go straight to Archive, not to Cool first. Archive blobs are left alone.

**Round after adding.** Rounding each blob and then adding would collect small errors. \`gb\` adds the bytes first and rounds once, so the container sizes and the total agree with the raw data.

**Sorted keys.** \`groupBy\` gives the tiers in the order they first appear. Sorting them makes the report the same every day, so two days can be compared line by line.

**What the report does not say.** Moving to Cool or Archive lowers the storage price but raises the cost to read, and early deletion charges apply if a blob leaves a cool tier too soon. The report lists candidates. A person who knows how often the data is read makes the call, or writes it into a lifecycle rule.
`,
  tests: [
    {
      name: 'Header only',
      inputs: [
        { name: 'payload', mime: 'application/csv', content: 'Container,Name,Content-Length,Last-Modified,AccessTier\n' },
        { name: 'vars', mime: 'application/json', content: '{ "reportDate": "2026-11-18", "coolAfterDays": 30, "archiveAfterDays": 180 }' },
      ],
      expected: '{ "containers": [], "totals": { "blobCount": 0, "sizeGB": 0, "toCoolGB": 0, "toArchiveGB": 0 } }',
    },
    {
      name: 'Exactly on the cool boundary',
      inputs: [
        {
          name: 'payload',
          mime: 'application/csv',
          content: 'Container,Name,Content-Length,Last-Modified,AccessTier\nexports,daily/a.csv,107374182,2026-10-19T12:00:00Z,Hot\nexports,daily/b.csv,107374182,2026-10-20T12:00:00Z,Hot',
        },
        { name: 'vars', mime: 'application/json', content: '{ "reportDate": "2026-11-18", "coolAfterDays": 30, "archiveAfterDays": 180 }' },
      ],
      expected:
        '{ "containers": [{ "container": "exports", "blobCount": 2, "sizeGB": 0.2, "tiers": { "Hot": 2 }, "toCool": ["daily/a.csv"], "toArchive": [] }], "totals": { "blobCount": 2, "sizeGB": 0.2, "toCoolGB": 0.1, "toArchiveGB": 0 } }',
    },
  ],
  followUps: [
    {
      q: 'Why not let a lifecycle rule do this instead of a report?',
      a: 'A lifecycle rule is the right place to apply the decision. The report comes first, to see what a rule would move and what it would cost, before anything changes.',
    },
    {
      q: 'The inventory has 40 million rows. What changes?',
      a: 'Read the CSV with streaming and keep only running totals per container, or load it into a database or analytics tool and query it. Grouping 40 million rows in memory will not fit.',
    },
    {
      q: 'Last-Modified is old but the blob is read every day. Is it still a candidate?',
      a: 'No. Last-Modified tracks writes, not reads. Use last access time tracking, if it is turned on for the account, before moving data that is read often.',
    },
  ],
}
