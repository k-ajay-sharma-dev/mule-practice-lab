export default {
  id: 'dw-182',
  category: 'dataweave',
  title: 'Turn SQL Server Change Tracking Rows Into an Item Delta With a Version Watermark',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'sql-server', 'planning-platform', 'change-tracking', 'delta', 'watermark', 'json'],
  estMinutes: 22,
  description: `
Marrow & Pine Home sends item changes from SQL Server to the planning platform every hour, using Change Tracking. The flow first reads \`CHANGE_TRACKING_CURRENT_VERSION()\` and \`CHANGE_TRACKING_MIN_VALID_VERSION\`, then runs:

\`\`\`sql
SELECT ct.ItemId AS CtItemId, ct.SYS_CHANGE_OPERATION AS Op, ct.SYS_CHANGE_VERSION AS Version,
       i.ItemId, i.Descr, i.Status, i.PackSize
FROM CHANGETABLE(CHANGES dbo.Item, :lastVersion) AS ct
LEFT JOIN dbo.Item AS i ON i.ItemId = ct.ItemId
\`\`\`

**Inputs**
- \`payload\`: the rows of that query. The item columns are null when the item no longer exists.
- \`vars.lastVersion\`: the version stored after the last successful send
- \`vars.minValidVersion\` and \`vars.currentVersion\`

**Rules**
- If \`lastVersion\` is below \`minValidVersion\`, the changes are no longer complete. Return \`mode\` \`FULL_RELOAD\` with \`reason\` \`Last version X is older than minimum valid version Y\`, \`nextVersion\` null and empty lists and counts of 0.
- Otherwise \`mode\` is \`DELTA\` and \`nextVersion\` is \`currentVersion\`:
  - A row with a \`Version\` above \`currentVersion\` changed after the version was read. Leave it for the next run and count it as \`deferred\`.
  - \`upserts\`: rows with \`Op\` \`I\` or \`U\` whose item still exists, as \`itemId\`, \`description\`, \`status\` and \`packSize\`
  - \`deletes\`: item ids (from \`CtItemId\`, since \`ItemId\` is null for a deleted item) of rows with \`Op\` \`D\`, or with \`I\` or \`U\` but no item any more
  - Both lists sorted by item id as a number, and \`counts\` with \`upserts\`, \`deletes\` and \`deferred\`

Output the keys in the order \`mode\`, \`reason\` (full reload only), \`nextVersion\`, \`counts\`, \`upserts\`, \`deletes\`.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `[
  { "CtItemId": 10055, "Op": "I", "Version": 1540, "ItemId": 10055, "Descr": "Oak Side Table", "Status": "A", "PackSize": 1 },
  { "CtItemId": 10021, "Op": "U", "Version": 1512, "ItemId": 10021, "Descr": "Linen Throw Oat", "Status": "A", "PackSize": 4 },
  { "CtItemId": 10007, "Op": "D", "Version": 1555, "ItemId": null, "Descr": null, "Status": null, "PackSize": null },
  { "CtItemId": 10090, "Op": "U", "Version": 1588, "ItemId": null, "Descr": null, "Status": null, "PackSize": null },
  { "CtItemId": 10102, "Op": "I", "Version": 1631, "ItemId": 10102, "Descr": "Clay Vase Small", "Status": "A", "PackSize": 6 }
]`,
    },
    {
      name: 'vars',
      mime: 'application/json',
      content: `{ "lastVersion": 1500, "minValidVersion": 1200, "currentVersion": 1620 }`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "mode": "DELTA",
  "nextVersion": 1620,
  "counts": { "upserts": 2, "deletes": 2, "deferred": 1 },
  "upserts": [
    { "itemId": 10021, "description": "Linen Throw Oat", "status": "A", "packSize": 4 },
    { "itemId": 10055, "description": "Oak Side Table", "status": "A", "packSize": 1 }
  ],
  "deletes": [10007, 10090]
}`,
  },
  starterCode: `%dw 2.0
output application/json
---
{
  mode: "DELTA",
  upserts: payload filter ($.Op != "D")
}
`,
  hints: [
    'Check the full reload case first with an `if`, and return the whole object for it.',
    'Split the rows once: `inWindow = payload filter ($.Version <= vars.currentVersion)`.',
    'A row is an upsert when `$.Op != "D" and $.ItemId != null`. Every other row in the window is a delete.',
    'Sort with `orderBy $.itemId` for the upserts and `orderBy $` for the list of ids.',
  ],
  solution: `%dw 2.0
output application/json

var tooOld = vars.lastVersion < vars.minValidVersion
var inWindow = payload filter ($.Version <= vars.currentVersion)
var deferred = sizeOf(payload) - sizeOf(inWindow)

fun itemExists(r) = r.Op != "D" and r.ItemId != null

var upserts = (inWindow filter (r) -> itemExists(r)) map (r) -> {
  itemId: r.ItemId,
  description: r.Descr,
  status: r.Status,
  packSize: r.PackSize
}

var deletes = (inWindow filter (r) -> not itemExists(r)) map $.CtItemId
---
if (tooOld) {
  mode: "FULL_RELOAD",
  reason: "Last version $(vars.lastVersion) is older than minimum valid version $(vars.minValidVersion)",
  nextVersion: null,
  counts: { upserts: 0, deletes: 0, deferred: 0 },
  upserts: [],
  deletes: []
}
else {
  mode: "DELTA",
  nextVersion: vars.currentVersion,
  counts: { upserts: sizeOf(upserts), deletes: sizeOf(deletes), deferred: deferred },
  upserts: upserts orderBy $.itemId,
  deletes: deletes orderBy $
}`,
  explanation: `
**Is the delta still complete?** Change Tracking cleans up old change records after its retention period. If the stored version is older than the minimum valid version, some changes are gone, and a delta would quietly miss them. The only safe answer is a full reload.

**The window.** The flow reads the current version before the changes. A row with a higher version was written in between. Sending it now is harmless, but the next run would see it again. Leaving it out keeps each run's window exact, and the next run, which starts at the current version, picks it up.

**Upserts and deletes.** Change Tracking gives the key and the operation. The join gives today's values. A row marked \`U\` with no item behind it was deleted after the update, so the platform must get a delete, not an update with nulls.

**The key for deletes.** Deleted rows have no \`ItemId\` from the item table, so the key comes from the change table column, \`CtItemId\`.

**Moving the watermark.** \`nextVersion\` is stored only after the platform confirms the send. A failed send keeps the old version, and the next run sends the same changes again.
`,
  tests: [
    {
      name: 'Watermark too old',
      inputs: [
        { name: 'payload', mime: 'application/json', content: '[]' },
        { name: 'vars', mime: 'application/json', content: '{ "lastVersion": 1100, "minValidVersion": 1200, "currentVersion": 1620 }' },
      ],
      expected:
        '{ "mode": "FULL_RELOAD", "reason": "Last version 1100 is older than minimum valid version 1200", "nextVersion": null, "counts": { "upserts": 0, "deletes": 0, "deferred": 0 }, "upserts": [], "deletes": [] }',
    },
    {
      name: 'At the minimum version, no changes',
      inputs: [
        { name: 'payload', mime: 'application/json', content: '[]' },
        { name: 'vars', mime: 'application/json', content: '{ "lastVersion": 1200, "minValidVersion": 1200, "currentVersion": 1250 }' },
      ],
      expected: '{ "mode": "DELTA", "nextVersion": 1250, "counts": { "upserts": 0, "deletes": 0, "deferred": 0 }, "upserts": [], "deletes": [] }',
    },
  ],
  followUps: [
    {
      q: 'Why read the current version before the changes?',
      a: 'If you read it after, a change committed in between would be below the stored version but missing from the result, and it would never be sent.',
    },
    {
      q: 'Should the query run in a snapshot transaction?',
      a: 'It is the usual advice, so the version and the changes are read from one consistent view. Snapshot isolation must be allowed on the database.',
    },
    {
      q: 'How does the full reload end?',
      a: 'Read the current version, extract every item, send them, and store that version. The next run is a normal delta from there.',
    },
  ],
}
