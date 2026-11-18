export default {
  id: 'dw-174',
  category: 'dataweave',
  title: 'Sequence Gaps, Duplicates and Zero Byte Files Across Partner SFTP Folders',
  level: 'EXPERT',
  tags: ['myproject', 'sftp', 'planning-platform', 'partner-folders', 'idempotency', 'sequence-gaps', 'groupBy', 'multiple-inputs'],
  estMinutes: 35,
  description: `
Larkfield Grocers runs an SFTP hub. Each distribution center sends plan confirmation files into its own folder, \`/inbound/<sender>/\`. Files are named \`PLAN_<seq>.txt\` with a six digit sequence, and must be loaded in sequence order with no gaps. The hub lists every folder and decides what to do.

**Inputs**
- \`payload\`: the listing, each with \`path\`, \`size\` and \`checksum\`
- \`vars.lastSeq\`: the last loaded sequence per sender. A sender that is not there starts at 0.
- \`vars.processed\`: loaded files, each with \`sender\`, \`seq\` and \`checksum\`

**Classify each file, first match wins**
1. Size 0: **rejected**
2. Sequence at or below the sender's last loaded sequence: **duplicate** when a processed record has the same sender, sequence and checksum, otherwise **conflict**, a different file reusing an old number
3. Otherwise it is a candidate

**Per sender**, sort the candidates by sequence. Those that continue without a gap from the last loaded sequence go to \`process\`. The rest go to \`hold\`, since a missing file must come first. \`missing\` lists the sequence numbers between the last loaded one and the highest candidate that have no candidate file. An empty file does not fill its number.

Output one entry per sender found in the listing, sorted by sender, with \`sender\`, \`lastSeq\`, \`process\`, \`hold\`, \`missing\`, \`duplicates\`, \`conflicts\` and \`rejected\`. The path lists keep sequence order for \`process\` and \`hold\` and listing order for the others.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `[
  { "path": "/inbound/LARKDC1/PLAN_000124.txt", "size": 20480, "checksum": "b001" },
  { "path": "/inbound/LARKDC1/PLAN_000123.txt", "size": 19900, "checksum": "a91f" },
  { "path": "/inbound/LARKDC1/PLAN_000126.txt", "size": 21000, "checksum": "b003" },
  { "path": "/inbound/LARKDC1/PLAN_000125.txt", "size": 0, "checksum": "e3b0" },
  { "path": "/inbound/LARKDC2/PLAN_000059.txt", "size": 9100, "checksum": "c059" },
  { "path": "/inbound/LARKDC2/PLAN_000057.txt", "size": 8790, "checksum": "ffff" },
  { "path": "/inbound/LARKDC2/PLAN_000058.txt", "size": 8800, "checksum": "c058" },
  { "path": "/inbound/LARKDC3/PLAN_000001.txt", "size": 500, "checksum": "d001" }
]`,
    },
    {
      name: 'vars',
      mime: 'application/json',
      content: `{
  "lastSeq": { "LARKDC1": 123, "LARKDC2": 57 },
  "processed": [
    { "sender": "LARKDC1", "seq": 123, "checksum": "a91f" },
    { "sender": "LARKDC2", "seq": 57, "checksum": "77c0" }
  ]
}`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `[
  {
    "sender": "LARKDC1",
    "lastSeq": 123,
    "process": ["/inbound/LARKDC1/PLAN_000124.txt"],
    "hold": ["/inbound/LARKDC1/PLAN_000126.txt"],
    "missing": [125],
    "duplicates": ["/inbound/LARKDC1/PLAN_000123.txt"],
    "conflicts": [],
    "rejected": ["/inbound/LARKDC1/PLAN_000125.txt"]
  },
  {
    "sender": "LARKDC2",
    "lastSeq": 57,
    "process": ["/inbound/LARKDC2/PLAN_000058.txt", "/inbound/LARKDC2/PLAN_000059.txt"],
    "hold": [],
    "missing": [],
    "duplicates": [],
    "conflicts": ["/inbound/LARKDC2/PLAN_000057.txt"],
    "rejected": []
  },
  {
    "sender": "LARKDC3",
    "lastSeq": 0,
    "process": ["/inbound/LARKDC3/PLAN_000001.txt"],
    "hold": [],
    "missing": [],
    "duplicates": [],
    "conflicts": [],
    "rejected": []
  }
]`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload groupBy ((f) -> (f.path splitBy "/")[2]) pluck (files, sender) -> {
  sender: sender as String,
  process: files map $.path
}
`,
  hints: [
    'Parse each entry once: `parts = f.path splitBy "/"`, the sender is `parts[-2]` and the file name `parts[-1]`. The sequence is `substringBefore(substringAfter(name, "_"), ".") as Number`.',
    'Look up the last sequence with `vars.lastSeq[sender] default 0`.',
    'Give every file a `state` in one `if ... else if` chain: rejected, duplicate, conflict or candidate.',
    'After sorting the candidates, the ones without a gap are exactly those where `c.seq == last + 1 + i`, with `i` the index from `filter (c, i) -> ...`.',
    'For `missing`, loop over `(last + 1) to max(seqs)` and keep numbers not in the candidate sequences. Guard the case with no candidates first.',
  ],
  solution: `%dw 2.0
import substringBefore, substringAfter from dw::core::Strings
output application/json

fun lastSeqOf(sender) = vars.lastSeq[sender] default 0

fun seenBefore(f) =
  sizeOf(vars.processed filter (p) -> p.sender == f.sender and p.seq == f.seq and p.checksum == f.checksum) > 0

var files = payload map (f) -> do {
  var parts = f.path splitBy "/"
  var name = parts[-1]
  ---
  {
    path: f.path,
    sender: parts[-2],
    seq: substringBefore(substringAfter(name, "_"), ".") as Number,
    size: f.size,
    checksum: f.checksum
  }
}

fun stateOf(f) =
  if (f.size == 0) "rejected"
  else if (f.seq <= lastSeqOf(f.sender)) (if (seenBefore(f)) "duplicate" else "conflict")
  else "candidate"

var checked = files map (f) -> f ++ { state: stateOf(f) }

fun pathsIn(list, s) = (list filter ($.state == s)) map $.path
---
((checked groupBy $.sender) pluck (list, key) -> do {
  var sender = key as String
  var last = lastSeqOf(sender)
  var candidates = (list filter ($.state == "candidate")) orderBy $.seq
  var seqs = candidates map $.seq
  ---
  {
    sender: sender,
    lastSeq: last,
    process: (candidates filter (c, i) -> c.seq == last + 1 + i) map $.path,
    hold: (candidates filter (c, i) -> c.seq != last + 1 + i) map $.path,
    missing: if (isEmpty(candidates)) []
      else (((last + 1) to max(seqs)) filter (n) -> (seqs contains n) == false),
    duplicates: pathsIn(list, "duplicate"),
    conflicts: pathsIn(list, "conflict"),
    rejected: pathsIn(list, "rejected")
  }
}) orderBy $.sender`,
  explanation: `
**Parse once.** Each path gives the sender and the sequence. Negative indexes read from the end, so the rule works however deep the folder is.

**Old numbers.** A file at or below the last loaded sequence is never loaded again. With the same checksum as the processed record it is a harmless resend, a duplicate. With a different checksum it is a conflict: the partner reused a number for new content, which needs a person to look at it.

**No gaps.** After sorting, a candidate continues the sequence when its number equals \`last + 1 + i\`. The first gap breaks that equation for every later file, so the rest go to \`hold\`. Loading 126 before 125 could apply plans in the wrong order.

**Empty files.** \`PLAN_000125.txt\` is empty, so it is rejected and its number shows up as missing. The hub waits for a proper resend of 125 before it loads 126.

**Missing numbers.** The range from \`last + 1\` to the highest candidate, minus the candidate numbers, gives the gaps to ask the partner for. Without candidates there is nothing to compare, and \`(last + 1) to max([])\` would fail, so the \`if\` guards it.

**Per sender, in a fixed order.** Grouping by sender keeps one partner's gap from blocking another. Sorting by sender keeps the report stable from run to run.
`,
  tests: [
    {
      name: 'Nothing in the folders',
      inputs: [
        { name: 'payload', mime: 'application/json', content: '[]' },
        { name: 'vars', mime: 'application/json', content: '{ "lastSeq": { "LARKDC1": 10 }, "processed": [] }' },
      ],
      expected: '[]',
    },
    {
      name: 'Only an empty file for the next number',
      inputs: [
        { name: 'payload', mime: 'application/json', content: '[{ "path": "/inbound/LARKDC1/PLAN_000011.txt", "size": 0, "checksum": "e3b0" }]' },
        { name: 'vars', mime: 'application/json', content: '{ "lastSeq": { "LARKDC1": 10 }, "processed": [] }' },
      ],
      expected:
        '[{ "sender": "LARKDC1", "lastSeq": 10, "process": [], "hold": [], "missing": [], "duplicates": [], "conflicts": [], "rejected": ["/inbound/LARKDC1/PLAN_000011.txt"] }]',
    },
  ],
  followUps: [
    {
      q: 'The partner says file 125 was lost on their side and will never come. What then?',
      a: 'A person decides. Record a manual skip for 125 so the last sequence moves past it, then the held files load on the next run.',
    },
    {
      q: 'Where does the checksum come from?',
      a: 'The hub computes a hash such as SHA-256 when it reads the file, or the partner sends one in a control file. A listing does not give it.',
    },
    {
      q: 'How do you stop two hub runs from loading the same file at once?',
      a: 'Run the job on one node, or lock per sender in Object Store, and update the last sequence in the same transaction as the load.',
    },
  ],
}
