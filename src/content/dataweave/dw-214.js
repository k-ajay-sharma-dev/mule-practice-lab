export default {
  id: 'dw-214',
  category: 'dataweave',
  title: 'Spread Large Part Files Across Parallel Workers So the Load Finishes Evenly',
  level: 'EXPERT',
  tags: ['myproject', 'large-files', 'parallel', 'planning-platform', 'reduce', 'json'],
  estMinutes: 30,
  description: `
Larkfield Grocers gets a nightly plan from the planning platform as several part files of very different sizes. Three workers each stream one part at a time into Oracle staging. The parts were handed out in name order, so one worker got the two largest parts and finished an hour after the others. The load window is tight.

\`payload.parts\` lists the parts: \`name\` and \`sizeMb\`. \`vars.workers\` is the number of workers. \`vars.maxPartMb\` is the largest part one worker may take, set by its temp disk.

**Rules**
- Parts with \`sizeMb\` 0 go to \`empty\`. Parts above \`maxPartMb\` go to \`tooLarge\`. Neither list is assigned. Both lists keep input order.
- Sort the other parts by size, largest first. Equal sizes go by name.
- Give each part, in that order, to the worker with the smallest total so far. On a tie, the lowest worker number wins.
- Workers are numbered from 1. Each lists its \`parts\` in the order given and its total \`sizeMb\`.
- \`spreadPct\`: the largest worker total minus the smallest, as a whole percent of the largest. 0 when the largest is 0.

Output \`workers\`, \`tooLarge\`, \`empty\` and \`spreadPct\`.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{
  "parts": [
    { "name": "plan_01.csv", "sizeMb": 900 },
    { "name": "plan_02.csv", "sizeMb": 850 },
    { "name": "plan_03.csv", "sizeMb": 400 },
    { "name": "plan_04.csv", "sizeMb": 380 },
    { "name": "plan_05.csv", "sizeMb": 0 },
    { "name": "plan_06.csv", "sizeMb": 300 },
    { "name": "plan_07.csv", "sizeMb": 2600 },
    { "name": "plan_08.csv", "sizeMb": 220 }
  ]
}`,
    },
    {
      name: 'vars',
      mime: 'application/json',
      content: `{ "workers": 3, "maxPartMb": 2048 }`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "workers": [
    { "worker": 1, "parts": ["plan_01.csv"], "sizeMb": 900 },
    { "worker": 2, "parts": ["plan_02.csv", "plan_08.csv"], "sizeMb": 1070 },
    { "worker": 3, "parts": ["plan_03.csv", "plan_04.csv", "plan_06.csv"], "sizeMb": 1080 }
  ],
  "tooLarge": ["plan_07.csv"],
  "empty": ["plan_05.csv"],
  "spreadPct": 17
}`,
  },
  starterCode: `%dw 2.0
output application/json
---
{
  workers: (1 to vars.workers) map (w) -> {
    worker: w,
    parts: (payload.parts filter ((p, i) -> (i mod vars.workers) + 1 == w)) map (p) -> p.name
  }
}
`,
  hints: [
    'Sort twice: first by name, then by `-p.sizeMb`. A stable sort keeps names in order within one size.',
    'Start `reduce` with `(1 to vars.workers) map (w) -> { worker: w, parts: [], sizeMb: 0 }`.',
    'For each part, find `min(acc map (w) -> w.sizeMb)`, take the first worker with that total, and rebuild the list with `map`.',
  ],
  solution: `%dw 2.0
output application/json

var empty = payload.parts filter (p) -> p.sizeMb == 0
var tooLarge = payload.parts filter (p) -> p.sizeMb > vars.maxPartMb
var usable = payload.parts filter (p) -> p.sizeMb > 0 and p.sizeMb <= vars.maxPartMb
var sorted = (usable orderBy (p) -> p.name) orderBy (p) -> -p.sizeMb
var start = (1 to vars.workers) map (w) -> { worker: w, parts: [], sizeMb: 0 }

var assigned = sorted reduce (p, acc = start) -> do {
  var low = min(acc map (w) -> w.sizeMb)
  var target = (acc filter (w) -> w.sizeMb == low)[0].worker
  ---
  acc map (w) ->
    if (w.worker == target) { worker: w.worker, parts: w.parts << p.name, sizeMb: w.sizeMb + p.sizeMb }
    else w
}
var totals = assigned map (w) -> w.sizeMb
var high = max(totals) default 0
---
{
  workers: assigned,
  tooLarge: tooLarge map (p) -> p.name,
  empty: empty map (p) -> p.name,
  spreadPct: if (high > 0) round((high - (min(totals) default 0)) * 100 / high) else 0
}`,
  explanation: `
**Largest first, to the least loaded.** Handing out big parts first and always to the worker with the least work keeps the totals close. Small parts at the end fill the gaps. In name order, worker 1 would have got plan_01 and plan_04 and finished well after the others.

**Totals are a proxy for time.** Rows per megabyte and lookups per row can differ between parts. Bytes are still a good first guess, and the job log shows whether the times really came out even.

**Some parts should never be assigned.** An empty part is a signal to check with the sender, not work. A part bigger than a worker's temp disk would fail halfway through, so it needs splitting or a different path before the run starts.
`,
  tests: [
    {
      name: 'Equal sizes go by name and lowest worker',
      inputs: [
        { name: 'payload', mime: 'application/json', content: '{ "parts": [{ "name": "c.csv", "sizeMb": 100 }, { "name": "a.csv", "sizeMb": 100 }, { "name": "b.csv", "sizeMb": 100 }] }' },
        { name: 'vars', mime: 'application/json', content: '{ "workers": 2, "maxPartMb": 500 }' },
      ],
      expected:
        '{ "workers": [{ "worker": 1, "parts": ["a.csv", "c.csv"], "sizeMb": 200 }, { "worker": 2, "parts": ["b.csv"], "sizeMb": 100 }], "tooLarge": [], "empty": [], "spreadPct": 50 }',
    },
    {
      name: 'Nothing usable',
      inputs: [
        { name: 'payload', mime: 'application/json', content: '{ "parts": [{ "name": "x.csv", "sizeMb": 0 }] }' },
        { name: 'vars', mime: 'application/json', content: '{ "workers": 2, "maxPartMb": 500 }' },
      ],
      expected:
        '{ "workers": [{ "worker": 1, "parts": [], "sizeMb": 0 }, { "worker": 2, "parts": [], "sizeMb": 0 }], "tooLarge": [], "empty": ["x.csv"], "spreadPct": 0 }',
    },
  ],
  followUps: [
    {
      q: 'Why not let each worker pull the next part from a queue instead?',
      a: 'That also balances well and adapts to slow parts. Put the largest parts on the queue first. A fixed plan is clearer in the logs and lets you rerun one worker.',
    },
    {
      q: 'What limits the number of workers?',
      a: 'Memory and temp disk per stream, database connections and the load the staging tables can take. More workers past that point slow everyone down.',
    },
    {
      q: 'How do you restart one failed worker?',
      a: 'Each part has its own run row and status. Remove that part rows by run ID and part name, then reload only the failed parts.',
    },
  ],
}
