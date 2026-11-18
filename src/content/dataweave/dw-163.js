export default {
  id: 'dw-163',
  category: 'dataweave',
  title: 'Mark a Claim Check Blob Processed Without Losing the Sender Metadata',
  level: 'ADVANCED',
  tags: ['myproject', 'azure-blob', 'blob-metadata', 'claim-check', 'reduce', 'regex', 'dw::core::URL', 'product-data-hub', 'json'],
  estMinutes: 30,
  description: `
Kestrel Home Supply runs a product data hub. When the hub has loaded a GS1 style file from Azure Blob Storage, it marks the blob processed by writing metadata. Setting blob metadata replaces all of the existing metadata, so the hub must send the sender's metadata back together with its own.

Metadata names must be valid C# identifiers and are not case sensitive, and the values travel as HTTP headers. The team uses these rules:

1. Drop sender entries whose value is null or an empty string.
2. Clean each sender name: lower case, every character that is not \`a-z\`, \`0-9\` or \`_\` becomes \`_\`, and a name that starts with a digit gets \`_\` in front.
3. Values become text. A value with any character outside printable ASCII is URL encoded.
4. The hub entries are \`status\` (always \`PROCESSED\`), \`jobid\`, \`goodcount\`, \`badcount\` and \`processedat\`, taken from \`job\`.
5. A sender entry whose clean name equals a hub name, or the name of an earlier kept sender entry, is dropped. List its original name in \`dropped\`.

Output \`metadata\` (kept sender entries in input order, then the hub entries), \`renamed\` (\`from\` and \`to\` for kept sender entries whose name changed) and \`dropped\`.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{
  "blobMetadata": {
    "Sender": "SUP-ALDER",
    "doc-id": "IT-901",
    "3plName": "Northway",
    "note": null,
    "Status": "NEW",
    "contact": "Zoë Hart",
    "DOC_ID": "IT-901-B"
  },
  "job": { "jobId": 90311, "goodCount": 118, "badCount": 2, "finishedAt": "2026-11-18T09:12:44Z" }
}`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "metadata": {
    "sender": "SUP-ALDER",
    "doc_id": "IT-901",
    "_3plname": "Northway",
    "contact": "Zo%C3%AB%20Hart",
    "status": "PROCESSED",
    "jobid": "90311",
    "goodcount": "118",
    "badcount": "2",
    "processedat": "2026-11-18T09:12:44Z"
  },
  "renamed": [
    { "from": "Sender", "to": "sender" },
    { "from": "doc-id", "to": "doc_id" },
    { "from": "3plName", "to": "_3plname" }
  ],
  "dropped": ["Status", "DOC_ID"]
}`,
  },
  starterCode: `%dw 2.0
output application/json
var job = payload.job
---
{
  metadata: payload.blobMetadata ++ { status: "PROCESSED" },
  renamed: [],
  dropped: []
}
`,
  hints: [
    'Build the hub entries first as an object, then `namesOf(hub)` gives the names a sender entry may not take.',
    '`pluck (v, k) -> { from: k as String, value: v }` turns the sender metadata into a list you can filter and reduce.',
    'For the name: `lower(k) replace /[^a-z0-9_]/ with "_"`, then `if (n matches /^[0-9].*/) "_" ++ n else n`.',
    'Printable ASCII is the range from space to tilde: `s matches /^[ -~]*$/`. Import `encodeURIComponent` from `dw::core::URL` for the rest.',
    'Use `reduce` with `{ names: namesOf(hub), kept: [], dropped: [] }` so a name taken earlier is seen by later entries.',
  ],
  solution: `%dw 2.0
output application/json
import encodeURIComponent from dw::core::URL
var job = payload.job

var hub = {
  status: "PROCESSED",
  jobid: job.jobId as String,
  goodcount: job.goodCount as String,
  badcount: job.badCount as String,
  processedat: job.finishedAt
}

fun cleanName(k) = do {
  var n = lower(k) replace /[^a-z0-9_]/ with "_"
  ---
  if (n matches /^[0-9].*/) "_" ++ n else n
}

fun cleanValue(v) = do {
  var s = v as String
  ---
  if (s matches /^[ -~]*$/) s else encodeURIComponent(s)
}

var entries = (payload.blobMetadata pluck (v, k) -> { from: k as String, to: cleanName(k as String), value: v })
  filter (e) -> (e.value != null) and (e.value != "")

var result = entries reduce ((e, acc = { names: namesOf(hub), kept: [], dropped: [] }) ->
  if (acc.names contains e.to) { names: acc.names, kept: acc.kept, dropped: acc.dropped ++ [e.from] }
  else { names: acc.names ++ [e.to], kept: acc.kept ++ [e], dropped: acc.dropped })
---
{
  metadata: { (result.kept map (e) -> { (e.to): cleanValue(e.value) }) } ++ hub,
  renamed: (result.kept filter (e) -> e.from != e.to) map (e) -> { from: e.from, to: e.to },
  dropped: result.dropped
}`,
  explanation: `
**Set replaces, it does not merge.** Writing metadata to a blob replaces every existing entry. A flow that sends only \`status\` would erase the sender's own values. That is why the hub reads the metadata first and writes the full set back.

**Valid names.** Azure metadata names follow C# identifier rules, so a dash or a leading digit is refused. Lower case is a team choice: names are not case sensitive, so \`Sender\` and \`sender\` would be the same entry anyway, and lower case makes clashes visible.

**Clashes.** \`Status\` from the sender would hide the hub's own \`status\`, and \`DOC_ID\` cleans to the same name as \`doc-id\`. The \`reduce\` starts with the hub names already taken, keeps the first sender entry for each other name, and reports the rest instead of losing them silently.

**Header safe values.** Metadata values are sent as HTTP headers, so characters outside ASCII can fail or be changed on the way. URL encoding keeps them safe, and the reader can decode them.

**Text values.** Header values are text. Converting the counts here means the stored value is predictable, such as \`118\`, whatever type the job log used.
`,
  tests: [
    {
      name: 'No sender metadata',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '{ "blobMetadata": {}, "job": { "jobId": 90500, "goodCount": 5, "badCount": 0, "finishedAt": "2026-11-18T11:00:00Z" } }',
        },
      ],
      expected:
        '{ "metadata": { "status": "PROCESSED", "jobid": "90500", "goodcount": "5", "badcount": "0", "processedat": "2026-11-18T11:00:00Z" }, "renamed": [], "dropped": [] }',
    },
    {
      name: 'A sender name that starts with a digit and a numeric value',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '{ "blobMetadata": { "2ndRef": "X-1", "lines": 40, "jobId": "P-77" }, "job": { "jobId": 90501, "goodCount": 40, "badCount": 0, "finishedAt": "2026-11-18T11:05:00Z" } }',
        },
      ],
      expected:
        '{ "metadata": { "_2ndref": "X-1", "lines": "40", "status": "PROCESSED", "jobid": "90501", "goodcount": "40", "badcount": "0", "processedat": "2026-11-18T11:05:00Z" }, "renamed": [{ "from": "2ndRef", "to": "_2ndref" }], "dropped": ["jobId"] }',
    },
  ],
  followUps: [
    {
      q: 'Two hub instances mark the same blob at once. How do you stop one from losing the other write?',
      a: 'Read the blob properties with their ETag, and write the metadata with an If-Match condition on that ETag. The second writer gets a precondition failure and reads again.',
    },
    {
      q: 'Why not keep the job results in metadata only?',
      a: 'Metadata is small and hard to query across blobs. The job log tables in Oracle hold the full history, and the metadata is a marker on the file itself.',
    },
    {
      q: 'Would blob index tags fit here instead?',
      a: 'Index tags can be searched across a container, which suits finding all blobs with a given status. Check that your account and the connector support them before choosing.',
    },
  ],
}
