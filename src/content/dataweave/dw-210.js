export default {
  id: 'dw-210',
  category: 'dataweave',
  title: 'Check Row Counts Before Switching a Reloaded SQL Server Table Into Live',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'sql-server', 'reload', 'reconciliation', 'planning-platform', 'json'],
  estMinutes: 20,
  description: `
Larkfield Grocers reloads its store forecast table in SQL Server every night from the planning platform. The flow loads a shadow table, then switches it with the live table so readers never see a half loaded table. One night a store file was empty, the switch went ahead, and that store's forecast disappeared from the replenishment screens.

\`payload.staged\` holds row counts per store in the shadow table. \`vars.live\` holds the counts in the current live table. \`vars.maxDropPct\` is the largest drop allowed per store.

**Rules**, for every store in either list, each once, sorted by \`storeId\` as text. A store missing from a list has 0 rows there.
- \`MISSING\` when the store is live but has no staged rows (absent or 0)
- \`NEW\` when the store is not live yet
- \`DROP\` when staged rows are lower than live rows by more than \`maxDropPct\` percent
- otherwise \`OK\`
- \`changePct\`: \`(staged - live) / live * 100\` rounded to a whole number, or \`null\` for \`NEW\`

\`swap\` is \`true\` only when no store is \`MISSING\` or \`DROP\`. \`problems\` lists the store IDs that block it, in the same order as \`stores\`. \`totals\` are the sums of the two input lists.

Output \`swap\`, \`totals\` (\`live\`, \`staged\`), \`problems\` and \`stores\` (\`storeId\`, \`liveRows\`, \`stagedRows\`, \`changePct\`, \`status\`).
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{
  "staged": [
    { "storeId": "0142", "rows": 3020 },
    { "storeId": "0150", "rows": 2100 },
    { "storeId": "0161", "rows": 0 },
    { "storeId": "0177", "rows": 1500 },
    { "storeId": "0188", "rows": 2900 }
  ]
}`,
    },
    {
      name: 'vars',
      mime: 'application/json',
      content: `{
  "maxDropPct": 20,
  "live": [
    { "storeId": "0142", "rows": 3000 },
    { "storeId": "0150", "rows": 3000 },
    { "storeId": "0161", "rows": 2800 },
    { "storeId": "0170", "rows": 900 },
    { "storeId": "0188", "rows": 3100 }
  ]
}`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "swap": false,
  "totals": { "live": 12800, "staged": 9520 },
  "problems": ["0150", "0161", "0170"],
  "stores": [
    { "storeId": "0142", "liveRows": 3000, "stagedRows": 3020, "changePct": 1, "status": "OK" },
    { "storeId": "0150", "liveRows": 3000, "stagedRows": 2100, "changePct": -30, "status": "DROP" },
    { "storeId": "0161", "liveRows": 2800, "stagedRows": 0, "changePct": -100, "status": "MISSING" },
    { "storeId": "0170", "liveRows": 900, "stagedRows": 0, "changePct": -100, "status": "MISSING" },
    { "storeId": "0177", "liveRows": 0, "stagedRows": 1500, "changePct": null, "status": "NEW" },
    { "storeId": "0188", "liveRows": 3100, "stagedRows": 2900, "changePct": -6, "status": "OK" }
  ]
}`,
  },
  starterCode: `%dw 2.0
output application/json
---
{
  swap: sum(payload.staged.rows) >= sum(vars.live.rows)
}
`,
  hints: [
    'Build the store list with `(a ++ b) distinctBy $ orderBy $` over both lists of IDs.',
    'Turn each list into a lookup object first: `{ (list map (r) -> { (r.storeId): r.rows }) }`.',
    'A store that is not in a list counts as 0 rows: `lookup[id] default 0`.',
  ],
  solution: `%dw 2.0
output application/json

var live = { (vars.live map (r) -> { (r.storeId): r.rows }) }
var staged = { (payload.staged map (r) -> { (r.storeId): r.rows }) }
var ids = ((vars.live map (r) -> r.storeId) ++ (payload.staged map (r) -> r.storeId)) distinctBy $ orderBy $

var stores = ids map (id) -> do {
  var l = live[id]
  var s = staged[id] default 0
  ---
  {
    storeId: id,
    liveRows: l default 0,
    stagedRows: s,
    changePct: if (l == null or l == 0) null else round((s - l) / l * 100),
    status:
      if (l == null) "NEW"
      else if (s == 0) "MISSING"
      else if (s < l * (1 - vars.maxDropPct / 100)) "DROP"
      else "OK"
  }
}
var problems = (stores filter (r) -> r.status == "MISSING" or r.status == "DROP") map (r) -> r.storeId
---
{
  swap: isEmpty(problems),
  totals: { live: sum(vars.live map (r) -> r.rows), staged: sum(payload.staged map (r) -> r.rows) },
  problems: problems,
  stores: stores
}`,
  explanation: `
**A swap is fast and total.** Switching a shadow table, by renaming or by \`ALTER TABLE ... SWITCH\`, replaces all rows at once. That is good for readers and bad when the new data has holes, so the check comes before the switch.

**Check per store, not only in total.** Here the total dropped by about a quarter, but a total rule with a loose limit could still pass while one store went to zero. Per store counts catch that.

**New stores are not a problem.** A store opening adds rows. It should show up in the report, but it must not block the switch.

**Keep the old table.** After a switch, keep the previous live table until the next run, so support can switch back in seconds.
`,
  tests: [
    {
      name: 'Normal night',
      inputs: [
        { name: 'payload', mime: 'application/json', content: '{ "staged": [{ "storeId": "0001", "rows": 100 }, { "storeId": "0002", "rows": 85 }] }' },
        { name: 'vars', mime: 'application/json', content: '{ "maxDropPct": 20, "live": [{ "storeId": "0001", "rows": 100 }, { "storeId": "0002", "rows": 100 }] }' },
      ],
      expected:
        '{ "swap": true, "totals": { "live": 200, "staged": 185 }, "problems": [], "stores": [{ "storeId": "0001", "liveRows": 100, "stagedRows": 100, "changePct": 0, "status": "OK" }, { "storeId": "0002", "liveRows": 100, "stagedRows": 85, "changePct": -15, "status": "OK" }] }',
    },
    {
      name: 'First load ever',
      inputs: [
        { name: 'payload', mime: 'application/json', content: '{ "staged": [{ "storeId": "0001", "rows": 40 }] }' },
        { name: 'vars', mime: 'application/json', content: '{ "maxDropPct": 20, "live": [] }' },
      ],
      expected:
        '{ "swap": true, "totals": { "live": 0, "staged": 40 }, "problems": [], "stores": [{ "storeId": "0001", "liveRows": 0, "stagedRows": 40, "changePct": null, "status": "NEW" }] }',
    },
  ],
  followUps: [
    {
      q: 'How do you get these counts cheaply?',
      a: 'A GROUP BY store query on each table after the load. With an index on the store column it reads little, and it runs once per night.',
    },
    {
      q: 'Who decides when a blocked swap should go ahead anyway?',
      a: 'The planning business owner. Give them the report and a manual switch step, so a closed store does not stop every other store.',
    },
    {
      q: 'Why not TRUNCATE the live table and load it directly?',
      a: 'Readers would see an empty or half filled table for the whole load, and a failure leaves no good data behind.',
    },
  ],
}
