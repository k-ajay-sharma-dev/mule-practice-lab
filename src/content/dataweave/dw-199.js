export default {
  id: 'dw-199',
  category: 'dataweave',
  title: 'Find the Blocks to Rerun After a Crash From the Block Log',
  level: 'EXPERT',
  tags: ['myproject', 'batch', 'checkpoint', 'restart', 'job-log', 'reduce', 'json'],
  estMinutes: 35,
  description: `
Thornbury Freight loads large files into a staging table in blocks. Each block runs in its own transaction and writes rows to a block log: \`STARTED\` before the insert, then \`COMMITTED\` or \`FAILED\`. The runtime crashed during a run. Before restarting, the team wants a plan that reruns only the blocks that need it.

\`payload\` holds the block log rows for the run in no fixed order: \`BLOCK_NO\`, \`STATUS\`, \`ROWS\` and \`LOGGED_AT\`. \`vars\` holds \`runId\`, \`totalRows\` and \`blockSize\`.

**Rules**
- The file has \`ceil(totalRows / blockSize)\` blocks. Block N covers lines \`(N - 1) * blockSize + 1\` to the smaller of \`N * blockSize\` and \`totalRows\`.
- Use the latest log row per block, by \`LOGGED_AT\`.
- A block is done when its latest status is \`COMMITTED\` and its \`ROWS\` equal the lines it covers.
- Any other block is rerun with a \`reason\`:
  - \`MISSING\`: no log rows
  - \`FAILED\`: the transaction rolled back
  - \`STARTED\`: the crash came during the block. The commit may have happened before the log row, so delete the block's rows first
  - \`COUNT_MISMATCH\`: committed with the wrong row count, so delete first
- \`deleteFirst\` is \`true\` for \`STARTED\` and \`COUNT_MISMATCH\`.

Output \`runId\`, \`expectedBlocks\`, \`doneBlocks\` (how many are done), \`doneRows\` (the sum of \`ROWS\` over done blocks), \`rerun\` (\`block\`, \`fromLine\`, \`toLine\`, \`reason\`, \`deleteFirst\`, in block order), \`resumeFrom\` (the first block to rerun, or \`null\`) and \`complete\` (\`true\` when nothing needs a rerun). A file with 0 rows has 0 blocks and is complete.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `[
  { "BLOCK_NO": 2, "STATUS": "FAILED", "ROWS": 0, "LOGGED_AT": "2026-11-18T03:01:40Z" },
  { "BLOCK_NO": 1, "STATUS": "STARTED", "ROWS": 0, "LOGGED_AT": "2026-11-18T03:00:00Z" },
  { "BLOCK_NO": 3, "STATUS": "COMMITTED", "ROWS": 498, "LOGGED_AT": "2026-11-18T03:03:30Z" },
  { "BLOCK_NO": 1, "STATUS": "COMMITTED", "ROWS": 500, "LOGGED_AT": "2026-11-18T03:00:50Z" },
  { "BLOCK_NO": 2, "STATUS": "STARTED", "ROWS": 0, "LOGGED_AT": "2026-11-18T03:01:00Z" },
  { "BLOCK_NO": 2, "STATUS": "COMMITTED", "ROWS": 500, "LOGGED_AT": "2026-11-18T03:02:40Z" },
  { "BLOCK_NO": 2, "STATUS": "STARTED", "ROWS": 0, "LOGGED_AT": "2026-11-18T03:02:00Z" },
  { "BLOCK_NO": 3, "STATUS": "STARTED", "ROWS": 0, "LOGGED_AT": "2026-11-18T03:02:50Z" },
  { "BLOCK_NO": 4, "STATUS": "STARTED", "ROWS": 0, "LOGGED_AT": "2026-11-18T03:03:40Z" }
]`,
    },
    {
      name: 'vars',
      mime: 'application/json',
      content: `{ "runId": 7310, "totalRows": 2350, "blockSize": 500 }`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "runId": 7310,
  "expectedBlocks": 5,
  "doneBlocks": 2,
  "doneRows": 1000,
  "rerun": [
    { "block": 3, "fromLine": 1001, "toLine": 1500, "reason": "COUNT_MISMATCH", "deleteFirst": true },
    { "block": 4, "fromLine": 1501, "toLine": 2000, "reason": "STARTED", "deleteFirst": true },
    { "block": 5, "fromLine": 2001, "toLine": 2350, "reason": "MISSING", "deleteFirst": false }
  ],
  "resumeFrom": 3,
  "complete": false
}`,
  },
  starterCode: `%dw 2.0
output application/json
var expectedBlocks = ceil(vars.totalRows / vars.blockSize)
---
{
  runId: vars.runId,
  expectedBlocks: expectedBlocks
}
`,
  hints: [
    'Build an object from block number to its latest log row: `groupBy`, then `mapObject` with `(rows orderBy (r) -> r.LOGGED_AT)[-1]`.',
    'Walk over `1 to expectedBlocks` and look up each block, so missing blocks show up. Guard the case of 0 blocks, since `1 to 0` counts down.',
    'Write a function for the lines a block covers: `min([n * size, total]) - (n - 1) * size`.',
    '`rerun[0].block` is `null` when the list is empty.',
  ],
  solution: `%dw 2.0
output application/json

var size = vars.blockSize
var total = vars.totalRows
var expectedBlocks = ceil(total / size)

var latestByBlock = (payload groupBy (r) -> r.BLOCK_NO as String)
  mapObject (rows, b) -> { (b): (rows orderBy (r) -> r.LOGGED_AT)[-1] }

fun linesIn(n) = min([n * size, total]) - (n - 1) * size

var blocks = if (expectedBlocks == 0) [] else (1 to expectedBlocks) map (n) -> do {
  var last = latestByBlock[n as String]
  ---
  {
    block: n,
    fromLine: (n - 1) * size + 1,
    toLine: (n - 1) * size + linesIn(n),
    rows: last.ROWS default 0,
    reason:
      if (last == null) "MISSING"
      else if (last.STATUS == "COMMITTED" and last.ROWS == linesIn(n)) "DONE"
      else if (last.STATUS == "COMMITTED") "COUNT_MISMATCH"
      else last.STATUS
  }
}

var done = blocks filter (b) -> b.reason == "DONE"
var rerun = (blocks filter (b) -> b.reason != "DONE") map (b) -> {
  block: b.block,
  fromLine: b.fromLine,
  toLine: b.toLine,
  reason: b.reason,
  deleteFirst: b.reason == "STARTED" or b.reason == "COUNT_MISMATCH"
}
---
{
  runId: vars.runId,
  expectedBlocks: expectedBlocks,
  doneBlocks: sizeOf(done),
  doneRows: sum(done map (b) -> b.rows),
  rerun: rerun,
  resumeFrom: rerun[0].block,
  complete: isEmpty(rerun)
}`,
  explanation: `
**Latest row wins.** Block 2 failed once and committed on a second try. Only its last log row counts, so it is done.

**Missing blocks come from the plan, not the log.** The log knows only blocks that started. Walking over every expected block finds block 5, which never ran.

**STARTED is the risky case.** A crash between the commit and the log write leaves committed rows behind a STARTED row. Deleting the block's rows by run ID and line range before the rerun stops duplicates. A FAILED block rolled back, so it needs no delete.

**Counts catch silent loss.** Block 3 committed 498 rows instead of 500. Without the count check the run would look complete.

**Resume, do not restart.** Rerunning three blocks instead of the whole file saves time on large loads and keeps the staging table consistent.
`,
  tests: [
    {
      name: 'All blocks done',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '[{ "BLOCK_NO": 1, "STATUS": "COMMITTED", "ROWS": 300, "LOGGED_AT": "2026-11-19T01:00:10Z" }, { "BLOCK_NO": 2, "STATUS": "COMMITTED", "ROWS": 50, "LOGGED_AT": "2026-11-19T01:00:20Z" }]',
        },
        { name: 'vars', mime: 'application/json', content: '{ "runId": 7311, "totalRows": 350, "blockSize": 300 }' },
      ],
      expected: '{ "runId": 7311, "expectedBlocks": 2, "doneBlocks": 2, "doneRows": 350, "rerun": [], "resumeFrom": null, "complete": true }',
    },
    {
      name: 'Empty file',
      inputs: [
        { name: 'payload', mime: 'application/json', content: '[]' },
        { name: 'vars', mime: 'application/json', content: '{ "runId": 7312, "totalRows": 0, "blockSize": 500 }' },
      ],
      expected: '{ "runId": 7312, "expectedBlocks": 0, "doneBlocks": 0, "doneRows": 0, "rerun": [], "resumeFrom": null, "complete": true }',
    },
    {
      name: 'Nothing logged yet',
      inputs: [
        { name: 'payload', mime: 'application/json', content: '[]' },
        { name: 'vars', mime: 'application/json', content: '{ "runId": 7313, "totalRows": 900, "blockSize": 500 }' },
      ],
      expected:
        '{ "runId": 7313, "expectedBlocks": 2, "doneBlocks": 0, "doneRows": 0, "rerun": [{ "block": 1, "fromLine": 1, "toLine": 500, "reason": "MISSING", "deleteFirst": false }, { "block": 2, "fromLine": 501, "toLine": 900, "reason": "MISSING", "deleteFirst": false }], "resumeFrom": 1, "complete": false }',
    },
  ],
  followUps: [
    {
      q: 'Why write STARTED before the insert at all?',
      a: 'Without it a crash leaves no trace of the block. STARTED tells the restart plan that rows may exist and need a cleanup.',
    },
    {
      q: 'Could the block log row be written in the same transaction as the rows?',
      a: 'Yes, when both live in the same database. Then COMMITTED and the rows commit together, and the STARTED case no longer needs a delete.',
    },
    {
      q: 'What must stay the same between the first run and the rerun?',
      a: 'The file, its line order and the block size. If any changes, line ranges no longer match and the safe choice is a full reload by run ID.',
    },
  ],
}
