export default {
  id: 'dw-131',
  category: 'dataweave',
  title: 'Find the Longest Run of On-Time Deliveries with reduce',
  level: 'INTERMEDIATE',
  tags: ['reduce', 'accumulator', 'orderBy', 'objects', 'logistics', 'json'],
  estMinutes: 20,
  description: `
Pebblebrook Couriers gives a bonus to drivers with long runs of on-time deliveries. Each evening the van app sends one driver's deliveries for the day. The app sends them in the order they were synced, which is not always the order they were made, so each delivery has a \`sequence\` number.

Output one object with:

- \`driverId\`: copied from the input
- \`deliveries\`: how many deliveries there were
- \`late\`: how many were not on time
- \`longestOnTimeRun\`: the most on-time deliveries in a row
- \`currentOnTimeRun\`: the on-time deliveries in a row at the end of the day

Work through the deliveries **once**, in \`sequence\` order, with \`reduce\`. Keep everything you need in one accumulator object. When there are no deliveries, all the numbers are 0.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{
  "driverId": "DRV-207",
  "deliveries": [
    { "sequence": 3, "parcelId": "P-883", "onTime": false },
    { "sequence": 1, "parcelId": "P-871", "onTime": true },
    { "sequence": 2, "parcelId": "P-875", "onTime": true },
    { "sequence": 4, "parcelId": "P-890", "onTime": true },
    { "sequence": 5, "parcelId": "P-894", "onTime": true },
    { "sequence": 6, "parcelId": "P-902", "onTime": true },
    { "sequence": 7, "parcelId": "P-911", "onTime": false },
    { "sequence": 8, "parcelId": "P-915", "onTime": true }
  ]
}`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "driverId": "DRV-207",
  "deliveries": 8,
  "late": 2,
  "longestOnTimeRun": 3,
  "currentOnTimeRun": 1
}`,
  },
  starterCode: `%dw 2.0
output application/json
var ordered = payload.deliveries orderBy $.sequence
---
{
  driverId: payload.driverId,
  deliveries: sizeOf(ordered),
  late: 0,
  longestOnTimeRun: 0,
  currentOnTimeRun: 0
}
`,
  hints: [
    'Start the accumulator as an object: `acc = { current: 0, best: 0, late: 0 }`.',
    'For an on-time delivery, `current` grows by 1, and `best` becomes the larger of `best` and the new `current`.',
    'For a late delivery, `current` goes back to 0 and `late` grows by 1. `best` stays as it was.',
    'Every branch must return the whole accumulator object, with all three fields.',
  ],
  solution: `%dw 2.0
output application/json
var start = { current: 0, best: 0, late: 0 }
var ordered = payload.deliveries orderBy $.sequence
var stats = (ordered reduce ((delivery, acc = start) ->
  if (delivery.onTime) do {
    var run = acc.current + 1
    ---
    { current: run, best: if (run > acc.best) run else acc.best, late: acc.late }
  }
  else { current: 0, best: acc.best, late: acc.late + 1 }
)) default start
---
{
  driverId: payload.driverId,
  deliveries: sizeOf(ordered),
  late: stats.late,
  longestOnTimeRun: stats.best,
  currentOnTimeRun: stats.current
}`,
  explanation: `
**Why one object.** The run you are in and the best run so far are two different numbers, and the late count is a third. An accumulator can hold any value, so an object holds all three and \`reduce\` walks the list once.

**Order first.** A run only means something in the order the deliveries were made. \`orderBy $.sequence\` puts sequence 3 back between 2 and 4, so the run 1, 2 is broken by the late delivery at 3.

**The two branches.**
| Delivery | current | best | late |
|---|---|---|---|
| On time | current + 1 | larger of best and the new current | same |
| Late | 0 | same | late + 1 |

After the eight deliveries, the best run is 4, 5, 6, and the day ends with one on-time delivery after the late one at 7.

**No deliveries.** The \`default start\` at the end makes sure an empty list gives zeros, whatever \`reduce\` returns for an empty array.
`,
  tests: [
    {
      name: 'Every delivery on time',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '{ "driverId": "DRV-1", "deliveries": [{ "sequence": 2, "parcelId": "P-2", "onTime": true }, { "sequence": 1, "parcelId": "P-1", "onTime": true }] }',
        },
      ],
      expected: '{ "driverId": "DRV-1", "deliveries": 2, "late": 0, "longestOnTimeRun": 2, "currentOnTimeRun": 2 }',
    },
    {
      name: 'The day ends with a late delivery',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '{ "driverId": "DRV-2", "deliveries": [{ "sequence": 1, "parcelId": "P-5", "onTime": true }, { "sequence": 2, "parcelId": "P-6", "onTime": false }] }',
        },
      ],
      expected: '{ "driverId": "DRV-2", "deliveries": 2, "late": 1, "longestOnTimeRun": 1, "currentOnTimeRun": 0 }',
    },
    {
      name: 'No deliveries',
      inputs: [{ name: 'payload', mime: 'application/json', content: '{ "driverId": "DRV-3", "deliveries": [] }' }],
      expected: '{ "driverId": "DRV-3", "deliveries": 0, "late": 0, "longestOnTimeRun": 0, "currentOnTimeRun": 0 }',
    },
  ],
  followUps: [
    {
      q: 'Could you do this without reduce?',
      a: 'Yes, but it takes more passes. For example, you could find the positions of the late deliveries and measure the gaps between them. `reduce` keeps the state in one place and reads the list once, so the logic sits in one readable block.',
    },
    {
      q: 'The file holds a week of deliveries for 40 drivers. What changes?',
      a: 'Group by driver with `groupBy $.driverId`, then run the same `reduce` on each group with `mapObject` or `pluck`. Put the reduce in a function so it is written once.',
    },
    {
      q: 'What goes wrong if one branch forgets the `late` field?',
      a: 'The next step reads `acc.late` as `null`, and `null + 1` fails. Every branch of a reduce must return the full shape of the accumulator.',
    },
  ],
}
