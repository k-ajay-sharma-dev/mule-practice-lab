export default {
  id: 'dw-179',
  category: 'dataweave',
  title: 'Recover an Interrupted FTP Upload Batch: Done, Rename, Resend, Temp Cleanup and Orphans',
  level: 'EXPERT',
  tags: ['myproject', 'ftp', 'planning-platform', 'reconnection', 'temp-rename', 'reconciliation', 'multiple-inputs', 'json'],
  estMinutes: 35,
  description: `
Brindle Outdoor uploads the weekly item master to the planning platform's FTP server as several part files. Each part is written as \`<name>.tmp\` and renamed to \`<name>\` when complete. Last night the server's maintenance window cut the batch off. After reconnecting, the flow lists the folder and must decide what to do for each part.

**Inputs**
- \`payload\`: the batch manifest, each part with \`name\` and \`size\` in bytes
- \`vars.remote\`: the remote listing after reconnecting, each entry with \`name\` and \`size\`

**For each manifest part, first match wins**
1. The final name exists with the expected size: **done**
2. The final name exists with another size: **resend**, reason \`final size X does not match Y\`
3. The temp name exists with the expected size: **rename** from the temp name to the final name
4. The temp name exists with another size: **resend**, reason \`partial temp file X of Y bytes\`
5. Neither exists: **resend**, reason \`not on server\`

**Cleanup**
- \`deleteTemp\`: the temp names of parts that are **done** or **resend** and still have a temp file. A part that is renamed keeps its temp file for the rename.
- \`orphans\`: remote names ending in \`.tmp\` that belong to no manifest part. They are reported for a person to check, never deleted.

Output \`done\` (names), \`rename\` (each with \`from\` and \`to\`), \`resend\` (each with \`name\` and \`reason\`), \`deleteTemp\`, \`orphans\` and \`complete\`, which is \`true\` when every part is done. Lists keep manifest order, and \`orphans\` keeps listing order.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `[
  { "name": "ITEM_20261118_001.txt", "size": 1200 },
  { "name": "ITEM_20261118_002.txt", "size": 1500 },
  { "name": "ITEM_20261118_003.txt", "size": 980 },
  { "name": "ITEM_20261118_004.txt", "size": 2048 },
  { "name": "ITEM_20261118_005.txt", "size": 640 }
]`,
    },
    {
      name: 'vars',
      mime: 'application/json',
      content: `{
  "remote": [
    { "name": "ITEM_20261118_001.txt", "size": 1200 },
    { "name": "ITEM_20261118_001.txt.tmp", "size": 1200 },
    { "name": "ITEM_20261118_002.txt.tmp", "size": 1500 },
    { "name": "ITEM_20261118_003.txt.tmp", "size": 512 },
    { "name": "ITEM_20261118_004.txt", "size": 1024 },
    { "name": "ITEM_20261117_009.txt.tmp", "size": 300 }
  ]
}`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "done": ["ITEM_20261118_001.txt"],
  "rename": [
    { "from": "ITEM_20261118_002.txt.tmp", "to": "ITEM_20261118_002.txt" }
  ],
  "resend": [
    { "name": "ITEM_20261118_003.txt", "reason": "partial temp file 512 of 980 bytes" },
    { "name": "ITEM_20261118_004.txt", "reason": "final size 1024 does not match 2048" },
    { "name": "ITEM_20261118_005.txt", "reason": "not on server" }
  ],
  "deleteTemp": ["ITEM_20261118_001.txt.tmp", "ITEM_20261118_003.txt.tmp"],
  "orphans": ["ITEM_20261117_009.txt.tmp"],
  "complete": false
}`,
  },
  starterCode: `%dw 2.0
output application/json
var remoteNames = vars.remote map $.name
---
{
  done: payload filter (remoteNames contains $.name) map $.name
}
`,
  hints: [
    'Write `fun remoteSize(n) = (vars.remote filter ($.name == n))[0].size`. It gives null when the name is not on the server.',
    'Give each part one decision with an `if ... else if` chain that returns an object such as `{ action: "resend", reason: "not on server" }`.',
    'Keep the part, its temp name and both remote sizes together in one object, so the cleanup rules can read them later.',
    'An orphan is a remote name that ends in `.tmp` and is not in the list of manifest temp names.',
  ],
  solution: `%dw 2.0
output application/json

fun remoteSize(n) = (vars.remote filter ($.name == n))[0].size

fun decide(p) = do {
  var finalSize = remoteSize(p.name)
  var tempSize = remoteSize(p.name ++ ".tmp")
  ---
  if (finalSize != null and finalSize == p.size) { action: "done" }
  else if (finalSize != null) { action: "resend", reason: "final size $(finalSize) does not match $(p.size)" }
  else if (tempSize != null and tempSize == p.size) { action: "rename" }
  else if (tempSize != null) { action: "resend", reason: "partial temp file $(tempSize) of $(p.size) bytes" }
  else { action: "resend", reason: "not on server" }
}

var parts = payload map (p) -> {
  name: p.name,
  temp: p.name ++ ".tmp",
  hasTemp: remoteSize(p.name ++ ".tmp") != null
} ++ decide(p)

fun withAction(a) = parts filter ($.action == a)

var tempNames = parts map $.temp
---
{
  done: withAction("done") map $.name,
  rename: withAction("rename") map { from: $.temp, to: $.name },
  resend: withAction("resend") map { name: $.name, reason: $.reason },
  deleteTemp: (parts filter ($.hasTemp and $.action != "rename")) map $.temp,
  orphans: (vars.remote filter (r) -> (r.name endsWith ".tmp") and not (tempNames contains r.name)) map $.name,
  complete: sizeOf(withAction("done")) == sizeOf(parts)
}`,
  explanation: `
**One decision per part.** The rules are checked in a fixed order, and the first match wins. The final file is checked before the temp file, because a final file means a rename already happened, and its size tells whether it can be trusted.

**Rename instead of resend.** A temp file with the full size means the upload finished and only the rename was lost. Renaming it saves a full upload. A shorter temp file is partial, so the part is sent again.

**Cleanup.** A temp file next to a done part, or next to a part that will be resent, is stale and should go before the new upload starts. The temp file of a part waiting for a rename is the file itself, so it stays.

**Orphans are reported, not deleted.** A temp file from another batch, such as last week's \`ITEM_20261117_009.txt.tmp\`, may belong to a run nobody has looked at. Deleting it would hide that. A person decides.

**Complete.** The batch is complete only when every part is done. The flow can then write the control file that tells the planning platform the set is ready.
`,
  tests: [
    {
      name: 'Everything arrived',
      inputs: [
        { name: 'payload', mime: 'application/json', content: '[{ "name": "ITEM_20261118_001.txt", "size": 1200 }]' },
        { name: 'vars', mime: 'application/json', content: '{ "remote": [{ "name": "ITEM_20261118_001.txt", "size": 1200 }] }' },
      ],
      expected: '{ "done": ["ITEM_20261118_001.txt"], "rename": [], "resend": [], "deleteTemp": [], "orphans": [], "complete": true }',
    },
    {
      name: 'A wrong final size with a stale temp file',
      inputs: [
        { name: 'payload', mime: 'application/json', content: '[{ "name": "ITEM_20261118_007.txt", "size": 700 }]' },
        {
          name: 'vars',
          mime: 'application/json',
          content: '{ "remote": [{ "name": "ITEM_20261118_007.txt", "size": 350 }, { "name": "ITEM_20261118_007.txt.tmp", "size": 700 }] }',
        },
      ],
      expected:
        '{ "done": [], "rename": [], "resend": [{ "name": "ITEM_20261118_007.txt", "reason": "final size 350 does not match 700" }], "deleteTemp": ["ITEM_20261118_007.txt.tmp"], "orphans": [], "complete": false }',
    },
  ],
  followUps: [
    {
      q: 'Is a matching size enough to call a file done?',
      a: 'It is a good first check after an interruption. A hash is stronger, but plain FTP has no standard hash command, so many teams rely on size plus a trailer count the receiver checks.',
    },
    {
      q: 'Why delete stale temp files before resending?',
      a: 'The new upload writes the same temp name. Some servers refuse to overwrite it, and a leftover could be renamed by mistake later.',
    },
    {
      q: 'What if the planning platform already picked up a part with the wrong size?',
      a: 'Tell the platform team and resend the whole set with a new batch id, so the platform can replace the bad load instead of mixing parts.',
    },
  ],
}
