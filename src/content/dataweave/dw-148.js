export default {
  id: 'dw-148',
  category: 'dataweave',
  title: 'Fill Gaps in Sensor Readings with the Last Known Value',
  level: 'INTERMEDIATE',
  tags: ['reduce', 'accumulator', 'mergeWith', 'dw::core::Objects', 'null-handling', 'iot', 'json'],
  estMinutes: 20,
  description: `
Cresswell Cold Storage logs the temperature of each freezer and chiller room every five minutes. The sensors share one radio link, and now and then a reading arrives with \`tempC\` set to \`null\`. The dashboard draws broken lines where values are missing, so the integration fills each gap with the **last known value of the same sensor**.

The readings arrive in time order, with several sensors mixed together.

Output one object per reading, in input order, with:

- \`time\` and \`sensor\`: copied from the input
- \`tempC\`: the reading, or the last real reading of the same sensor when it is \`null\`
- \`filled\`: \`true\` when the value was copied from an earlier reading

When a sensor has no earlier real reading, leave \`tempC\` as \`null\` and \`filled\` as \`false\`. A reading of \`0\` is a real reading.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `[
  { "time": "2026-11-20T08:00:00Z", "sensor": "FRZ-1", "tempC": -18.2 },
  { "time": "2026-11-20T08:00:00Z", "sensor": "CHL-2", "tempC": null },
  { "time": "2026-11-20T08:05:00Z", "sensor": "FRZ-1", "tempC": null },
  { "time": "2026-11-20T08:05:00Z", "sensor": "CHL-2", "tempC": 3.4 },
  { "time": "2026-11-20T08:10:00Z", "sensor": "FRZ-1", "tempC": null },
  { "time": "2026-11-20T08:10:00Z", "sensor": "CHL-2", "tempC": 3.9 }
]`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `[
  { "time": "2026-11-20T08:00:00Z", "sensor": "FRZ-1", "tempC": -18.2, "filled": false },
  { "time": "2026-11-20T08:00:00Z", "sensor": "CHL-2", "tempC": null, "filled": false },
  { "time": "2026-11-20T08:05:00Z", "sensor": "FRZ-1", "tempC": -18.2, "filled": true },
  { "time": "2026-11-20T08:05:00Z", "sensor": "CHL-2", "tempC": 3.4, "filled": false },
  { "time": "2026-11-20T08:10:00Z", "sensor": "FRZ-1", "tempC": -18.2, "filled": true },
  { "time": "2026-11-20T08:10:00Z", "sensor": "CHL-2", "tempC": 3.9, "filled": false }
]`,
  },
  starterCode: `%dw 2.0
output application/json
import mergeWith from dw::core::Objects
---
payload map (r) -> r ++ { filled: false }
`,
  hints: [
    '`map` sees one reading at a time and cannot remember earlier ones. `reduce` can carry a memory from one reading to the next.',
    'Start the accumulator as `{ last: {}, out: [] }`. `last` holds the latest real value per sensor, such as `{ "FRZ-1": -18.2 }`.',
    'Read the memory with `acc.last[r.sensor]`. When the sensor is not there yet, this gives `null`.',
    'To update `last`, use `acc.last mergeWith { (r.sensor): r.tempC }`. With `++` the object would get the same key twice, and the selector would still find the old value first.',
    'Test for a real reading with `r.tempC != null`. A test such as `(r.tempC default 0) != 0` would treat a reading of 0 as missing.',
  ],
  solution: `%dw 2.0
output application/json
import mergeWith from dw::core::Objects

var result = payload reduce ((r, acc = { last: {}, out: [] }) ->
  if (r.tempC != null)
    {
      last: acc.last mergeWith { (r.sensor): r.tempC },
      out: acc.out ++ [{ time: r.time, sensor: r.sensor, tempC: r.tempC, filled: false }]
    }
  else
    {
      last: acc.last,
      out: acc.out ++ [{ time: r.time, sensor: r.sensor, tempC: acc.last[r.sensor], filled: acc.last[r.sensor] != null }]
    }
)
---
result.out`,
  explanation: `
**Why reduce.** Filling a gap needs to know what came before. \`reduce\` passes an accumulator from one reading to the next, so it can hold the last value of each sensor and the output built so far.

**One memory per sensor.** The readings of several sensors are mixed. \`last\` is an object keyed by sensor name, so FRZ-1 never borrows a value from CHL-2.

**mergeWith replaces a key.** \`{ a: 1 } ++ { a: 2 }\` gives an object with \`a\` twice, and \`.a\` returns the first one, 1. \`mergeWith\` from \`dw::core::Objects\` drops the old key and keeps the new value.

**No earlier value.** CHL-2 starts with a gap. \`acc.last["CHL-2"]\` is \`null\` at that point, so the output keeps \`null\` and \`filled\` is \`false\`, which tells the dashboard nothing was invented.

**Zero is a value.** The test is \`!= null\`. A freezer that reads 0 degrees is a real reading, and the next gap copies 0.
`,
  tests: [
    {
      name: 'A reading of 0 is copied into the next gap',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '[{ "time": "2026-11-21T01:00:00Z", "sensor": "CHL-9", "tempC": 0 }, { "time": "2026-11-21T01:05:00Z", "sensor": "CHL-9", "tempC": null }]',
        },
      ],
      expected: '[{ "time": "2026-11-21T01:00:00Z", "sensor": "CHL-9", "tempC": 0, "filled": false }, { "time": "2026-11-21T01:05:00Z", "sensor": "CHL-9", "tempC": 0, "filled": true }]',
    },
    {
      name: 'A newer real reading replaces the memory',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content:
            '[{ "time": "2026-11-21T02:00:00Z", "sensor": "FRZ-4", "tempC": -20 }, { "time": "2026-11-21T02:05:00Z", "sensor": "FRZ-4", "tempC": -15.5 }, { "time": "2026-11-21T02:10:00Z", "sensor": "FRZ-4", "tempC": null }]',
        },
      ],
      expected:
        '[{ "time": "2026-11-21T02:00:00Z", "sensor": "FRZ-4", "tempC": -20, "filled": false }, { "time": "2026-11-21T02:05:00Z", "sensor": "FRZ-4", "tempC": -15.5, "filled": false }, { "time": "2026-11-21T02:10:00Z", "sensor": "FRZ-4", "tempC": -15.5, "filled": true }]',
    },
    {
      name: 'No readings',
      inputs: [{ name: 'payload', mime: 'application/json', content: '[]' }],
      expected: '[]',
    },
  ],
  followUps: [
    {
      q: 'A sensor has been silent for two hours. Should the gap still be filled?',
      a: 'Probably not, because an old value hides a real fault. Store the time of the last reading next to the value and only fill when it is recent, for example within 15 minutes.',
    },
    {
      q: 'Why not group by sensor and fill each group separately?',
      a: 'That works too, but the output must keep the input order. You would need to keep an index on each reading and sort again at the end. One reduce keeps the order for free.',
    },
    {
      q: 'Is filling gaps right for an alarm on high temperature?',
      a: 'No. An alarm should see the missing reading as its own problem. Fill gaps for charts, but raise a separate alert when a sensor stops sending.',
    },
  ],
}
