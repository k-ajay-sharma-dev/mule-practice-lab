export default {
  id: 'dw-058',
  category: 'dataweave',
  title: 'Detect Cold-Chain Temperature Excursions from Logger Readings',
  level: 'ADVANCED',
  tags: ['supply-chain', 'cold-chain', 'iot', 'reduce', 'datetime', 'orderBy'],
  estMinutes: 35,
  description: `
A reefer trailer carrying vaccines uploads its data-logger readings when it reaches the DC. The readings arrive **unsorted** and may use different UTC offsets. The quality team needs the list of **temperature excursions** for the shipment.

**Rules**
- A reading is \`HIGH\` above \`maxC\`, \`LOW\` below \`minC\`, otherwise in range (the limits themselves are in range).
- Order the readings by actual instant (\`2026-11-02T01:10:00+01:00\` is 00:10 UTC).
- An excursion is a run of **consecutive** readings of the same type (\`HIGH\` or \`LOW\`). A change of type starts a new excursion.
- \`start\`: timestamp of the first reading in the run.
- \`end\`: timestamp of the **next** reading after the run (the moment it was seen to have changed). If the run reaches the last reading, \`end\` is the last reading's timestamp and \`open\` is \`true\`; otherwise \`open\` is \`false\`.
- \`durationMinutes\`: minutes from \`start\` to \`end\`.
- \`peakC\`: the highest temperature of a \`HIGH\` run, the lowest of a \`LOW\` run.
- Output timestamps exactly as received (the original strings).

**Output**: \`shipmentId\`, \`excursions\` (\`type\`, \`start\`, \`end\`, \`durationMinutes\`, \`peakC\`, \`open\`) in time order, \`totalExcursionMinutes\`, and \`compliant\` — \`true\` when **no** excursion lasts 30 minutes or more.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{
  "shipmentId": "RF-2201",
  "minC": 2,
  "maxC": 8,
  "readings": [
    { "ts": "2026-11-02T08:45:00Z", "tempC": 9.4 },
    { "ts": "2026-11-02T08:00:00Z", "tempC": 4.0 },
    { "ts": "2026-11-02T10:15:00Z", "tempC": 9.9 },
    { "ts": "2026-11-02T08:15:00Z", "tempC": 5.1 },
    { "ts": "2026-11-02T09:30:00Z", "tempC": 1.5 },
    { "ts": "2026-11-02T08:30:00Z", "tempC": 8.6 },
    { "ts": "2026-11-02T09:00:00Z", "tempC": 7.9 },
    { "ts": "2026-11-02T10:00:00Z", "tempC": 8.2 },
    { "ts": "2026-11-02T09:15:00Z", "tempC": 8.0 },
    { "ts": "2026-11-02T09:45:00Z", "tempC": 3.0 }
  ]
}`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "shipmentId": "RF-2201",
  "excursions": [
    { "type": "HIGH", "start": "2026-11-02T08:30:00Z", "end": "2026-11-02T09:00:00Z", "durationMinutes": 30, "peakC": 9.4, "open": false },
    { "type": "LOW", "start": "2026-11-02T09:30:00Z", "end": "2026-11-02T09:45:00Z", "durationMinutes": 15, "peakC": 1.5, "open": false },
    { "type": "HIGH", "start": "2026-11-02T10:00:00Z", "end": "2026-11-02T10:15:00Z", "durationMinutes": 15, "peakC": 9.9, "open": true }
  ],
  "totalExcursionMinutes": 60,
  "compliant": false
}`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload.readings orderBy $.ts
`,
  hints: [
    'Sort on `$.ts as DateTime`, not on the string — strings with different offsets do not sort chronologically. Keep the original string next to the parsed value.',
    'Classify each reading (`HIGH`/`LOW`/`OK`), then use `reduce` to build **runs**: if the reading has the same class as the last run, append it to that run, otherwise start a new run. `take` from `dw::core::Arrays` gives "all but the last" safely.',
    'With the runs as an array, `map (run, i)` can look at `runs[i + 1]` to find the end of an excursion. `DateTime as Number` is epoch seconds.',
  ],
  solution: `%dw 2.0
import take from dw::core::Arrays
output application/json

fun classify(t: Number): String =
  if (t > payload.maxC) "HIGH"
  else if (t < payload.minC) "LOW"
  else "OK"

var readings = (payload.readings map (r) -> {
    raw: r.ts,
    at: r.ts as DateTime,
    tempC: r.tempC,
    kind: classify(r.tempC)
  }) orderBy $.at

var runs = readings reduce ((r, acc = []) ->
  if (!isEmpty(acc) and acc[-1].kind == r.kind)
    (acc take (sizeOf(acc) - 1)) ++ [{ kind: r.kind, items: acc[-1].items ++ [r] }]
  else
    acc ++ [{ kind: r.kind, items: [r] }])

fun minutes(from, to) = ((to.at as Number) - (from.at as Number)) / 60

var excursions = (runs map (run, i) -> do {
    var next = runs[i + 1]
    var first = run.items[0]
    var last = if (next == null) run.items[-1] else next.items[0]
    var temps = run.items.tempC
    ---
    {
      "type": run.kind,
      start: first.raw,
      end: last.raw,
      durationMinutes: minutes(first, last),
      peakC: if (run.kind == "HIGH") max(temps) else min(temps),
      open: next == null
    }
  }) filter ($."type" != "OK")
---
{
  shipmentId: payload.shipmentId,
  excursions: excursions,
  totalExcursionMinutes: sum(excursions.durationMinutes default []),
  compliant: isEmpty(excursions filter ($.durationMinutes >= 30))
}`,
  explanation: `
This is a **run-length grouping** problem: \`groupBy\` would put all \`HIGH\` readings together regardless of time, so you need a \`reduce\` that only merges a reading into the **current** run.

Sorted and classified, the sample becomes:

| 08:00 | 08:15 | 08:30 | 08:45 | 09:00 | 09:15 | 09:30 | 09:45 | 10:00 | 10:15 |
|---|---|---|---|---|---|---|---|---|---|
| OK | OK | HIGH | HIGH | OK | OK (8.0) | LOW | OK | HIGH | HIGH |

Runs: \`OK, HIGH, OK, LOW, OK, HIGH\`. Including the \`OK\` runs in the array is what makes \`runs[i + 1]\` the correct "recovered at" reading; they are filtered out only at the end.

Details that matter:
- **Sorting by instant**: \`as DateTime\` respects the offset; sorting the raw strings would put \`01:10+01:00\` after \`00:20Z\`.
- **Updating the last run**: \`acc take (sizeOf(acc) - 1)\` is safe for a one-element array; slicing with \`acc[0 to -2]\` is not (on a one-element array it returns \`null\` instead of \`[]\`, and \`null ++ [...]\` fails).
- **Duration**: \`DateTime as Number\` gives epoch seconds; the difference divided by 60 is minutes. Subtracting two \`DateTime\`s directly gives a \`Period\`, which is awkward to turn into a number.
- \`"type"\` is quoted as a key and selector because \`type\` is a DataWeave keyword.
- \`excursions.durationMinutes\` is \`null\` when there are no excursions, hence \`default []\`.

Common traps:
- Ending an excursion at its own last out-of-range reading: the 08:30 run would last 15 minutes and the shipment would look compliant.
- Treating exactly 8.0 °C as an excursion.
`,
  tests: [
    {
      name: 'Mixed offsets and a HIGH run directly followed by a LOW run',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: `{ "shipmentId": "RF-9", "minC": 2, "maxC": 8, "readings": [
  { "ts": "2026-11-02T00:20:00Z", "tempC": 5 },
  { "ts": "2026-11-02T01:10:00+01:00", "tempC": 1 },
  { "ts": "2026-11-02T00:05:00Z", "tempC": 9.5 },
  { "ts": "2026-11-02T00:00:00Z", "tempC": 9 }
] }`,
        },
      ],
      expected: `{
  "shipmentId": "RF-9",
  "excursions": [
    { "type": "HIGH", "start": "2026-11-02T00:00:00Z", "end": "2026-11-02T01:10:00+01:00", "durationMinutes": 10, "peakC": 9.5, "open": false },
    { "type": "LOW", "start": "2026-11-02T01:10:00+01:00", "end": "2026-11-02T00:20:00Z", "durationMinutes": 10, "peakC": 1, "open": false }
  ],
  "totalExcursionMinutes": 20,
  "compliant": true
}`,
    },
    {
      name: 'All readings in range',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '{ "shipmentId": "RF-10", "minC": 2, "maxC": 8, "readings": [ { "ts": "2026-11-02T00:00:00Z", "tempC": 2 }, { "ts": "2026-11-02T00:15:00Z", "tempC": 8 } ] }',
        },
      ],
      expected: '{ "shipmentId": "RF-10", "excursions": [], "totalExcursionMinutes": 0, "compliant": true }',
    },
  ],
  followUps: [
    {
      q: 'The loggers stream readings live over MQTT or Kafka instead of one upload. How does the design change?',
      a: 'Excursion detection becomes stateful per shipment: keep the current run in a persistent object store (or use a stream processor) and emit an alert when a run starts and when it ends. DataWeave still classifies each reading, but the run state lives outside a single message.',
    },
    {
      q: 'Readings can arrive twice after a logger retry. What would you add?',
      a: 'De-duplicate on logger id plus timestamp (`distinctBy`) before sorting. Without it, duplicates do not change durations here but would inflate counts and could split runs if the duplicate carries a slightly different value.',
    },
    {
      q: 'Why report the end as the next in-range reading rather than interpolating?',
      a: 'Because it is what the data proves: the product was out of range at least until the last bad reading and possibly until the next reading. Regulated reporting (for example GDP for pharma) normally prefers the conservative, evidence-based value; the logging interval itself is the precision limit.',
    },
  ],
}
