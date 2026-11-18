export default {
  id: 'dw-153',
  category: 'dataweave',
  title: 'Order Nightly Integration Jobs by Their Dependencies',
  level: 'EXPERT',
  tags: ['topological-sort', 'recursion', 'graphs', 'every', 'arrays-module', 'scheduling', 'interview-classic', 'json'],
  estMinutes: 35,
  description: `
Ashcombe Building Supplies runs a set of nightly integration jobs. Some jobs need others to finish first: invoices need orders and prices, and statements need invoices. Today the order is a hand-kept list, and a new job added in the wrong place broke last week's run.

The job list says what each job depends on. Work out the run plan:

- \`waves\`: a list of waves. The first wave holds every job with no dependencies. Each later wave holds every job whose dependencies have all run in earlier waves. Jobs in one wave can run at the same time. Sort the names in each wave.
- \`order\`: all the waves joined into one list, for a scheduler that runs one job at a time.
- \`blocked\`: jobs that can never run, sorted by name. A job is blocked when it sits in a loop of dependencies, depends on a blocked job, or depends on a job that is not in the list.

This is the classic topological sort question, done in waves.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{
  "jobs": [
    { "name": "send-statements", "dependsOn": ["build-invoices", "load-customers"] },
    { "name": "load-orders", "dependsOn": ["load-customers", "load-products"] },
    { "name": "load-customers", "dependsOn": [] },
    { "name": "build-invoices", "dependsOn": ["load-orders", "load-prices"] },
    { "name": "load-prices", "dependsOn": ["load-products"] },
    { "name": "load-products", "dependsOn": [] }
  ]
}`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "waves": [["load-customers", "load-products"], ["load-orders", "load-prices"], ["build-invoices"], ["send-statements"]],
  "order": ["load-customers", "load-products", "load-orders", "load-prices", "build-invoices", "send-statements"],
  "blocked": []
}`,
  },
  starterCode: `%dw 2.0
output application/json
import every from dw::core::Arrays
---
{
  waves: [payload.jobs filter isEmpty($.dependsOn) map $.name],
  order: [],
  blocked: []
}
`,
  hints: [
    'Write a recursive function that takes the jobs still waiting and the names already done: `fun plan(waiting, done) = ...`.',
    'The next wave is every waiting job whose dependencies are all done: `(j.dependsOn default []) every (d) -> done contains d`.',
    'If the wave is empty, stop. Whatever is still waiting can never run, so it is the blocked list.',
    'Otherwise, call `plan` again with the wave removed from `waiting` and its names added to `done`, and put the wave in front of the waves that come back.',
    '`flatten` joins the waves into the single `order` list.',
  ],
  solution: `%dw 2.0
output application/json
import every from dw::core::Arrays

fun plan(waiting, done) = do {
  var wave = (waiting filter (j) -> (j.dependsOn default []) every (d) -> done contains d) map $.name orderBy $
  ---
  if (isEmpty(wave)) { waves: [], blocked: (waiting map $.name) orderBy $ }
  else do {
    var rest = plan(waiting filter ((j) -> not (wave contains j.name)), done ++ wave)
    ---
    { waves: [wave] ++ rest.waves, blocked: rest.blocked }
  }
}

var result = plan(payload.jobs, [])
---
{
  waves: result.waves,
  order: flatten(result.waves),
  blocked: result.blocked
}`,
  explanation: `
**Waves, one at a time.** This is Kahn's way of doing a topological sort. Take every job that has nothing left to wait for, mark them done, and repeat. Jobs found in the same round do not depend on each other, so they form a wave that can run in parallel.

**Recursion instead of a loop.** DataWeave has no loop with a changing variable, so \`plan\` calls itself with a smaller waiting list and a longer done list. Each call removes at least one job, so the recursion always ends.

**every and the empty list.** \`[] every ...\` is \`true\`, so a job with no dependencies is ready in the first wave without a special case.

**Stopping is the cycle check.** When no waiting job is ready, nothing more can ever run. The jobs left are in a loop, depend on something in a loop, or depend on a job that is not in the list. That list is \`blocked\`, and no separate cycle search is needed.

**Sorted waves.** Sorting the names in each wave gives the same plan every night for the same input, which makes runs comparable in the logs.
`,
  tests: [
    {
      name: 'A loop blocks its jobs and the job that needs them',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content:
            '{ "jobs": [{ "name": "sync-a", "dependsOn": ["sync-c"] }, { "name": "sync-b", "dependsOn": ["sync-a"] }, { "name": "sync-c", "dependsOn": ["sync-b"] }, { "name": "report", "dependsOn": ["sync-a"] }, { "name": "backup", "dependsOn": [] }] }',
        },
      ],
      expected: '{ "waves": [["backup"]], "order": ["backup"], "blocked": ["report", "sync-a", "sync-b", "sync-c"] }',
    },
    {
      name: 'A dependency that is not in the list',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '{ "jobs": [{ "name": "load-stock", "dependsOn": [] }, { "name": "push-web", "dependsOn": ["load-stock", "load-images"] }] }',
        },
      ],
      expected: '{ "waves": [["load-stock"]], "order": ["load-stock"], "blocked": ["push-web"] }',
    },
    {
      name: 'No jobs',
      inputs: [{ name: 'payload', mime: 'application/json', content: '{ "jobs": [] }' }],
      expected: '{ "waves": [], "order": [], "blocked": [] }',
    },
  ],
  followUps: [
    {
      q: 'How would you tell a loop apart from a missing job in the blocked list?',
      a: 'Check the dependencies of the blocked jobs against the full job list first. Any name that is not a job is a missing dependency. The rest are in or behind a loop.',
    },
    {
      q: 'Each job has a run time. How would you estimate the time for the whole night?',
      a: 'With waves run in parallel, the night takes the sum of the longest job in each wave. A finer plan starts each job as soon as its own dependencies end, which follows the longest path through the graph.',
    },
    {
      q: 'Where would this run in a Mule app?',
      a: 'In the flow that loads the job definitions, before the scheduler starts. A non empty blocked list should stop the run and alert the team, since a silent skip leaves data out of date.',
    },
  ],
}
