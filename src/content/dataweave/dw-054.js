export default {
  id: 'dw-054',
  category: 'dataweave',
  title: 'Sequence a WMS Pick Wave by Zone with a Serpentine Path',
  level: 'INTERMEDIATE',
  tags: ['supply-chain', 'wms', 'groupBy', 'orderBy', 'pluck', 'sorting'],
  estMinutes: 25,
  description: `
A wave of pick tasks is released from order management to the warehouse. Before the tasks are sent to the pickers' handhelds, the integration groups them by **zone** and puts them in **walking order**.

**Location format**: \`ZONE-AISLE-BAY\`, e.g. \`A-03-12\` = zone \`A\`, aisle 3, bay 12.

**Rules**
- Skip tasks with \`qty\` of 0 or less (short-allocated lines).
- One group per zone, zones in alphabetical order.
- Inside a zone the picker walks a **serpentine** path:
  - aisles in ascending order;
  - in **odd** aisles bays ascend, in **even** aisles bays descend;
  - tasks at the same location are ordered by \`taskId\` (string order).
- \`seq\` numbers the picks 1, 2, 3 … inside each zone.

**Output** per zone: \`zone\`, \`pickCount\`, \`totalUnits\` and \`picks\` (\`seq\`, \`taskId\`, \`location\`, \`sku\`, \`qty\`, \`orderNo\`).
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `[
  { "taskId": "T-101", "orderNo": "SO-1", "sku": "SKU-A", "qty": 2, "location": "A-01-05" },
  { "taskId": "T-102", "orderNo": "SO-1", "sku": "SKU-B", "qty": 1, "location": "B-02-03" },
  { "taskId": "T-103", "orderNo": "SO-2", "sku": "SKU-C", "qty": 4, "location": "A-02-01" },
  { "taskId": "T-104", "orderNo": "SO-2", "sku": "SKU-D", "qty": 1, "location": "A-01-02" },
  { "taskId": "T-105", "orderNo": "SO-3", "sku": "SKU-E", "qty": 6, "location": "A-02-07" },
  { "taskId": "T-106", "orderNo": "SO-3", "sku": "SKU-F", "qty": 3, "location": "B-01-04" },
  { "taskId": "T-107", "orderNo": "SO-4", "sku": "SKU-A", "qty": 1, "location": "A-01-05" },
  { "taskId": "T-108", "orderNo": "SO-4", "sku": "SKU-G", "qty": 0, "location": "A-01-01" }
]`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `[
  {
    "zone": "A",
    "pickCount": 5,
    "totalUnits": 14,
    "picks": [
      { "seq": 1, "taskId": "T-104", "location": "A-01-02", "sku": "SKU-D", "qty": 1, "orderNo": "SO-2" },
      { "seq": 2, "taskId": "T-101", "location": "A-01-05", "sku": "SKU-A", "qty": 2, "orderNo": "SO-1" },
      { "seq": 3, "taskId": "T-107", "location": "A-01-05", "sku": "SKU-A", "qty": 1, "orderNo": "SO-4" },
      { "seq": 4, "taskId": "T-105", "location": "A-02-07", "sku": "SKU-E", "qty": 6, "orderNo": "SO-3" },
      { "seq": 5, "taskId": "T-103", "location": "A-02-01", "sku": "SKU-C", "qty": 4, "orderNo": "SO-2" }
    ]
  },
  {
    "zone": "B",
    "pickCount": 2,
    "totalUnits": 4,
    "picks": [
      { "seq": 1, "taskId": "T-106", "location": "B-01-04", "sku": "SKU-F", "qty": 3, "orderNo": "SO-3" },
      { "seq": 2, "taskId": "T-102", "location": "B-02-03", "sku": "SKU-B", "qty": 1, "orderNo": "SO-1" }
    ]
  }
]`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload groupBy (t) -> (t.location splitBy "-")[0]
`,
  hints: [
    '`splitBy "-"` gives `["A", "01", "05"]`; convert aisle and bay with `as Number` so that aisle 10 sorts after aisle 9.',
    'Build **one** sort key: for even aisles use `100 - bay` so that descending bays become ascending keys. Pad the numbers (e.g. with `as String {format: "000"}`) before concatenating them with the task id.',
    '`groupBy` returns an object; `pluck` turns it into an array of `{ zone, tasks }`, which you can `orderBy` zone. `map (t, i)` gives you the index for `seq`.',
  ],
  solution: `%dw 2.0
output application/json

fun pad(n: Number): String = n as String {format: "000"}

fun sortKey(t) = do {
  var parts = t.location splitBy "-"
  var aisle = parts[1] as Number
  var bay = parts[2] as Number
  var walkBay = if ((aisle mod 2) == 1) bay else 100 - bay
  ---
  pad(aisle) ++ pad(walkBay) ++ t.taskId
}

var byZone = payload
  filter ($.qty > 0)
  groupBy ((t) -> (t.location splitBy "-")[0])
---
(byZone pluck (tasks, zone) -> { zone: zone as String, tasks: tasks })
  orderBy $.zone
  map (g) -> do {
    var picks = g.tasks orderBy sortKey($)
    ---
    {
      zone: g.zone,
      pickCount: sizeOf(picks),
      totalUnits: sum(picks map $.qty),
      picks: picks map (t, i) -> {
        seq: i + 1,
        taskId: t.taskId,
        location: t.location,
        sku: t.sku,
        qty: t.qty,
        orderNo: t.orderNo
      }
    }
  }`,
  explanation: `
The heart of the problem is a **composite, direction-aware sort key**. \`orderBy\` sorts by one value, so you encode all three criteria into a string whose natural order is the walking order:

| Task | aisle | bay | walk bay | key |
|---|---|---|---|---|
| T-104 | 1 | 2 | 2 | \`001002T-104\` |
| T-105 | 2 | 7 | 93 | \`002093T-105\` |
| T-103 | 2 | 1 | 99 | \`002099T-103\` |

- \`100 - bay\` flips the direction in even aisles (bays are assumed to stay below 100).
- Zero-padding is essential: as strings, \`"10"\` sorts before \`"9"\`.
- \`groupBy\` gives an object keyed by zone. Object key order is not something to rely on, so \`pluck\` it into an array and sort the zones explicitly.

Common traps:
- Sorting by the raw location string — it walks every aisle in the same direction, so the picker walks back down each even aisle empty-handed.
- Numbering \`seq\` across the whole wave instead of per zone.
- Filtering after grouping: a zone whose tasks are all zero-quantity would then appear with \`pickCount: 0\`.
`,
  tests: [
    {
      name: 'Aisle 10 after aisle 9, all-zero zone disappears',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: `[
  { "taskId": "T-2", "orderNo": "SO-9", "sku": "X", "qty": 1, "location": "C-10-03" },
  { "taskId": "T-1", "orderNo": "SO-9", "sku": "Y", "qty": 2, "location": "C-09-20" },
  { "taskId": "T-3", "orderNo": "SO-9", "sku": "Z", "qty": 5, "location": "C-10-15" },
  { "taskId": "T-4", "orderNo": "SO-9", "sku": "W", "qty": 0, "location": "D-01-01" }
]`,
        },
      ],
      expected: `[
  { "zone": "C", "pickCount": 3, "totalUnits": 8, "picks": [
    { "seq": 1, "taskId": "T-1", "location": "C-09-20", "sku": "Y", "qty": 2, "orderNo": "SO-9" },
    { "seq": 2, "taskId": "T-3", "location": "C-10-15", "sku": "Z", "qty": 5, "orderNo": "SO-9" },
    { "seq": 3, "taskId": "T-2", "location": "C-10-03", "sku": "X", "qty": 1, "orderNo": "SO-9" }
  ] }
]`,
    },
  ],
  followUps: [
    {
      q: 'Should this logic live in the integration at all?',
      a: 'Usually pick-path optimisation belongs to the WMS, which knows the real layout. Integrations do it when the WMS is basic or when a third-party handheld app receives tasks directly; then the sort rules must be configuration, not hard-coded.',
    },
    {
      q: 'How would you send one message per zone to the handhelds?',
      a: 'Use a `foreach` (or `parallel-foreach`) over the zone array and publish each zone to a queue such as a JMS queue per zone or one queue with a `zone` property, so pickers in a zone only consume their own work.',
    },
    {
      q: 'Two waves are released close together and tasks overlap. What protects you from double picking?',
      a: 'Task ids are the idempotency key: the receiving side (or an idempotent-message-validator with a persistent object store in Mule) rejects a task id it has already accepted.',
    },
  ],
}
