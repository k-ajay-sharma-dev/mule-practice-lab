export default {
  id: 'dw-213',
  category: 'dataweave',
  title: 'Find the Slow Step and the Slow Blocks of a Batch Job From Its Block Log',
  level: 'ADVANCED',
  tags: ['myproject', 'batch', 'performance', 'job-log', 'oracle', 'json'],
  estMinutes: 25,
  description: `
Brindle Outdoor loads supplier items with a batch job: a lookup step that translates codes, and a load step whose aggregator bulk inserts blocks into Oracle staging. The job used to take 6 minutes and now takes 40. Each step writes a log row per block it handles. Support wants to see where the time goes before anyone changes the block size.

\`payload.blocks\` holds the block log: \`step\`, \`block\`, \`records\` and \`millis\`.

**Rules**, one entry per step in the order the steps first appear:
- \`blocks\`, \`records\` and \`seconds\` (total time, rounded to 1 decimal)
- \`recordsPerSec\`: records divided by seconds, rounded to a whole number, 0 when no time was spent
- \`medianMillis\`: the median block time of the step. With an even number of blocks it is the mean of the two middle values.
- \`slowBlocks\`: block numbers whose time is more than 3 times the median, in block order

\`slowestStep\` is the step with the lowest \`recordsPerSec\`. \`share\` is its share of the total time of all steps, as a whole percent.

Output \`steps\`, \`slowestStep\` and \`share\`.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{
  "blocks": [
    { "step": "lookup-codes", "block": 1, "records": 100, "millis": 9000 },
    { "step": "lookup-codes", "block": 2, "records": 100, "millis": 9400 },
    { "step": "lookup-codes", "block": 3, "records": 100, "millis": 8800 },
    { "step": "lookup-codes", "block": 4, "records": 60, "millis": 5600 },
    { "step": "load-staging", "block": 1, "records": 100, "millis": 400 },
    { "step": "load-staging", "block": 2, "records": 100, "millis": 6100 },
    { "step": "load-staging", "block": 3, "records": 100, "millis": 420 },
    { "step": "load-staging", "block": 4, "records": 60, "millis": 300 }
  ]
}`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "steps": [
    { "step": "lookup-codes", "blocks": 4, "records": 360, "seconds": 32.8, "recordsPerSec": 11, "medianMillis": 8900, "slowBlocks": [] },
    { "step": "load-staging", "blocks": 4, "records": 360, "seconds": 7.2, "recordsPerSec": 50, "medianMillis": 410, "slowBlocks": [2] }
  ],
  "slowestStep": "lookup-codes",
  "share": 82
}`,
  },
  starterCode: `%dw 2.0
output application/json
var byStep = payload.blocks groupBy (b) -> b.step
---
{
  steps: byStep pluck (rows, step) -> {
    step: step,
    records: sum(rows.records)
  }
}
`,
  hints: [
    'Get the step names in first seen order with `(payload.blocks map (b) -> b.step) distinctBy $`.',
    'For the median, sort the times and pick index `n / 2` (odd) or the mean of `n / 2 - 1` and `n / 2` (even). Use `floor` for the odd case.',
    'Pick the slowest step with `minBy (s) -> s.recordsPerSec`.',
  ],
  solution: `%dw 2.0
output application/json

fun median(nums) = do {
  var s = nums orderBy $
  var n = sizeOf(s)
  ---
  if (n == 0) 0
  else if ((n mod 2) == 1) s[floor(n / 2)]
  else (s[n / 2 - 1] + s[n / 2]) / 2
}

var names = (payload.blocks map (b) -> b.step) distinctBy $
var steps = names map (name) -> do {
  var rows = payload.blocks filter (b) -> b.step == name
  var ms = sum(rows map (r) -> r.millis)
  var recs = sum(rows map (r) -> r.records)
  var med = median(rows map (r) -> r.millis)
  ---
  {
    step: name,
    blocks: sizeOf(rows),
    records: recs,
    seconds: round(ms / 100) / 10,
    recordsPerSec: if (ms > 0) round(recs / (ms / 1000)) else 0,
    medianMillis: med,
    slowBlocks: ((rows filter (r) -> r.millis > 3 * med) orderBy (r) -> r.block) map (r) -> r.block
  }
}
var slowest = steps minBy (s) -> s.recordsPerSec
var totalMs = sum(payload.blocks map (b) -> b.millis)
---
{
  steps: steps,
  slowestStep: slowest.step,
  share: if (totalMs > 0) round(sum((payload.blocks filter (b) -> b.step == slowest.step) map (b) -> b.millis) * 100 / totalMs) else 0
}`,
  explanation: `
**Measure before tuning.** Everyone suspected the bulk insert. The block log shows the lookup step takes most of the time, at about 90 ms per record, with every block equally slow. That points at a call per record, such as a code map query for each item, not at the database load.

**Median, not mean.** One slow block pulls the mean up and hides what normal looks like. The median stays put, so a block at three times the median stands out. Block 2 of the load step is a single slow insert, maybe a lock or a failed block retried row by row.

**Two different fixes.** A step that is slow everywhere needs a design change, such as loading the code map once before the job and looking it up in memory. One slow block needs its own log lines and maybe a check of the reject table.
`,
  tests: [
    {
      name: 'Odd number of blocks',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '{ "blocks": [{ "step": "load", "block": 1, "records": 50, "millis": 1000 }, { "step": "load", "block": 3, "records": 50, "millis": 5000 }, { "step": "load", "block": 2, "records": 50, "millis": 1200 }] }',
        },
      ],
      expected:
        '{ "steps": [{ "step": "load", "blocks": 3, "records": 150, "seconds": 7.2, "recordsPerSec": 21, "medianMillis": 1200, "slowBlocks": [3] }], "slowestStep": "load", "share": 100 }',
    },
  ],
  followUps: [
    {
      q: 'Where would you write these block log rows from?',
      a: 'At the end of each step for its block, or from the aggregator for the load. Include run ID, step, block number, record count and elapsed time.',
    },
    {
      q: 'Would a bigger block size fix the lookup step?',
      a: 'No. Block size changes how records are grouped for threads, not the cost of each lookup. Removing the per record query fixes it.',
    },
    {
      q: 'What does more max concurrency do for a lookup bound step?',
      a: 'It runs more blocks at once, which can help, but it also sends more parallel queries to the database. Check pool size and database load first.',
    },
  ],
}
