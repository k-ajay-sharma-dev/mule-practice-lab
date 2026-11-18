export default {
  id: 'dw-203',
  category: 'dataweave',
  title: 'Check Downloaded Plan Files Against the Sender Checksum Manifest',
  level: 'ADVANCED',
  tags: ['myproject', 'large-files', 'checksum', 'manifest', 'planning-platform', 'json'],
  estMinutes: 25,
  description: `
Larkfield Grocers downloads forecast files from the planning platform each night. The platform also sends a manifest with the name, size and SHA-256 of each file. After the downloads, a flow computes the size and checksum of what it received. Only when everything matches may the load start.

\`payload.files\` is the manifest: \`name\`, \`bytes\` and \`sha256\`. \`vars.received\` lists what is in the landing folder, with the same fields. Checksums are shortened here.

**Rules**
- Ignore received names that end with \`.part\`. Those downloads are still running.
- For each manifest file, in manifest order, the status is:
  - \`MISSING\` when no received file has the name
  - \`SIZE_MISMATCH\` when the sizes differ
  - \`CHECKSUM_MISMATCH\` when the checksums differ, ignoring upper and lower case
  - otherwise \`OK\`
- Each received file not in the manifest is \`UNEXPECTED\`. List these after the manifest files, sorted by name.
- \`counts\`: one entry per status in the order \`OK\`, \`MISSING\`, \`SIZE_MISMATCH\`, \`CHECKSUM_MISMATCH\`, \`UNEXPECTED\`, including zeros.
- \`ready\` is \`true\` only when every result is \`OK\`.

Output \`ready\`, \`results\` (\`name\`, \`status\`) and \`counts\`.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{
  "files": [
    { "name": "plan_20261118_01.csv", "bytes": 5000000, "sha256": "AA11BB22CC33DD44" },
    { "name": "plan_20261118_02.csv", "bytes": 5000000, "sha256": "EE55FF6600771188" },
    { "name": "plan_20261118_03.csv", "bytes": 3200000, "sha256": "9900AABBCCDDEEFF" },
    { "name": "plan_20261118_04.csv", "bytes": 1200000, "sha256": "1234567890ABCDEF" }
  ]
}`,
    },
    {
      name: 'vars',
      mime: 'application/json',
      content: `{
  "received": [
    { "name": "readme.txt", "bytes": 120, "sha256": "0f0f0f0f0f0f0f0f" },
    { "name": "plan_20261118_01.csv", "bytes": 5000000, "sha256": "aa11bb22cc33dd44" },
    { "name": "plan_20261118_02.csv", "bytes": 4999000, "sha256": "ee55ff6600771188" },
    { "name": "plan_20261118_03.csv", "bytes": 3200000, "sha256": "9900aabbccddee00" },
    { "name": "plan_20261118_04.csv.part", "bytes": 600000, "sha256": "" }
  ]
}`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "ready": false,
  "results": [
    { "name": "plan_20261118_01.csv", "status": "OK" },
    { "name": "plan_20261118_02.csv", "status": "SIZE_MISMATCH" },
    { "name": "plan_20261118_03.csv", "status": "CHECKSUM_MISMATCH" },
    { "name": "plan_20261118_04.csv", "status": "MISSING" },
    { "name": "readme.txt", "status": "UNEXPECTED" }
  ],
  "counts": { "OK": 1, "MISSING": 1, "SIZE_MISMATCH": 1, "CHECKSUM_MISMATCH": 1, "UNEXPECTED": 1 }
}`,
  },
  starterCode: `%dw 2.0
output application/json
---
{
  results: payload.files map (f) -> {
    name: f.name,
    status: if (vars.received.name contains f.name) "OK" else "MISSING"
  }
}
`,
  hints: [
    'Filter out `.part` files first with `endsWith`.',
    'Index the received files by name: `received groupBy (r) -> r.name` gives an object you can look up with `byName[f.name][0]`.',
    'Compare checksums with `lower(a) == lower(b)`.',
    'Build `counts` with `reduce` over the list of statuses: `acc ++ { (s): ... }`.',
  ],
  solution: `%dw 2.0
output application/json

var received = vars.received filter (r) -> not (r.name endsWith ".part")
var byName = received groupBy (r) -> r.name
var manifestNames = payload.files map (f) -> f.name

var checked = payload.files map (f) -> do {
  var got = byName[f.name][0]
  ---
  {
    name: f.name,
    status:
      if (got == null) "MISSING"
      else if (got.bytes != f.bytes) "SIZE_MISMATCH"
      else if (lower(got.sha256) != lower(f.sha256)) "CHECKSUM_MISMATCH"
      else "OK"
  }
}

var unexpected = ((received filter (r) -> not (manifestNames contains r.name)) orderBy (r) -> r.name)
  map (r) -> { name: r.name, status: "UNEXPECTED" }

var results = checked ++ unexpected
var statuses = ["OK", "MISSING", "SIZE_MISMATCH", "CHECKSUM_MISMATCH", "UNEXPECTED"]
---
{
  ready: isEmpty(results filter (r) -> r.status != "OK"),
  results: results,
  counts: statuses reduce (s, acc = {}) -> acc ++ { (s): sizeOf(results filter (r) -> r.status == s) }
}`,
  explanation: `
**Size first, then checksum.** A size check costs nothing and catches cut off downloads. The checksum catches changed bytes when the size is right.

**Partial downloads are not files yet.** Many clients write to a temporary name and rename at the end. A \`.part\` file is ignored, so the real file counts as missing until it lands.

**Unexpected files matter.** A stray file may be a wrong upload or a leftover from yesterday. Listing it stops it from being loaded by a wildcard read.

**Counts with zeros.** A fixed set of keys lets a dashboard chart and alert on the result, since every status is always there.
`,
  tests: [
    {
      name: 'Everything matches',
      inputs: [
        { name: 'payload', mime: 'application/json', content: '{ "files": [{ "name": "plan_a.csv", "bytes": 10, "sha256": "ABC1" }, { "name": "plan_b.csv", "bytes": 20, "sha256": "def2" }] }' },
        {
          name: 'vars',
          mime: 'application/json',
          content: '{ "received": [{ "name": "plan_b.csv", "bytes": 20, "sha256": "DEF2" }, { "name": "plan_a.csv", "bytes": 10, "sha256": "abc1" }] }',
        },
      ],
      expected:
        '{ "ready": true, "results": [{ "name": "plan_a.csv", "status": "OK" }, { "name": "plan_b.csv", "status": "OK" }], "counts": { "OK": 2, "MISSING": 0, "SIZE_MISMATCH": 0, "CHECKSUM_MISMATCH": 0, "UNEXPECTED": 0 } }',
    },
    {
      name: 'Nothing downloaded yet',
      inputs: [
        { name: 'payload', mime: 'application/json', content: '{ "files": [{ "name": "plan_a.csv", "bytes": 10, "sha256": "ABC1" }] }' },
        { name: 'vars', mime: 'application/json', content: '{ "received": [{ "name": "plan_a.csv.part", "bytes": 4, "sha256": "" }] }' },
      ],
      expected:
        '{ "ready": false, "results": [{ "name": "plan_a.csv", "status": "MISSING" }], "counts": { "OK": 0, "MISSING": 1, "SIZE_MISMATCH": 0, "CHECKSUM_MISMATCH": 0, "UNEXPECTED": 0 } }',
    },
  ],
  followUps: [
    {
      q: 'What do you do on a checksum mismatch?',
      a: 'Download that file again a limited number of times. If it still differs, stop the load and raise an alert to the sender.',
    },
    {
      q: 'Who computes the received checksum, and when?',
      a: 'The download flow, while it streams the file to disk, so the file is not read a second time.',
    },
    {
      q: 'Why not load the good files and skip the bad ones?',
      a: 'A plan split over files is one data set. Loading part of it gives the business a wrong plan, which is worse than a late one.',
    },
  ],
}
