export default {
  id: 'dw-144',
  category: 'dataweave',
  title: 'Merge Overlapping Maintenance Windows into Blackout Periods',
  level: 'ADVANCED',
  tags: ['intervals', 'merge', 'reduce', 'accumulator', 'orderBy', 'dates', 'distinctBy', 'json'],
  estMinutes: 30,
  description: `
Corriedale Foods runs nightly integrations between its ERP, CRM, warehouse and payroll systems. Each system team publishes its own maintenance windows. During any window, the integration platform must pause the jobs that call that system's neighbours, so operations wants one list of **blackout periods** for the whole estate.

Merge the windows into periods:

- Two windows that overlap belong to the same period.
- Two windows that touch, where one ends at the minute the other starts, also belong to the same period.
- A period runs from its earliest start to its latest end.

Output one object per period, sorted by start, with:

- \`start\` and \`end\`: copied from the window that starts the period and the window that ends it
- \`minutes\`: the length of the period
- \`systems\`: the systems in the period, each once, sorted by name

All times are in UTC.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `[
  { "system": "WMS", "start": "2026-11-21T04:00:00Z", "end": "2026-11-21T05:00:00Z" },
  { "system": "ERP", "start": "2026-11-22T00:00:00Z", "end": "2026-11-22T01:00:00Z" },
  { "system": "ERP", "start": "2026-11-21T01:00:00Z", "end": "2026-11-21T03:00:00Z" },
  { "system": "Payroll", "start": "2026-11-21T22:00:00Z", "end": "2026-11-21T23:30:00Z" },
  { "system": "CRM", "start": "2026-11-21T02:30:00Z", "end": "2026-11-21T04:00:00Z" },
  { "system": "CRM", "start": "2026-11-22T00:30:00Z", "end": "2026-11-22T00:45:00Z" }
]`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `[
  { "start": "2026-11-21T01:00:00Z", "end": "2026-11-21T05:00:00Z", "minutes": 240, "systems": ["CRM", "ERP", "WMS"] },
  { "start": "2026-11-21T22:00:00Z", "end": "2026-11-21T23:30:00Z", "minutes": 90, "systems": ["Payroll"] },
  { "start": "2026-11-22T00:00:00Z", "end": "2026-11-22T01:00:00Z", "minutes": 60, "systems": ["CRM", "ERP"] }
]`,
  },
  starterCode: `%dw 2.0
output application/json
var timed = payload map (w) -> w ++ { s: w.start as DateTime as Number, e: w.end as DateTime as Number }
---
timed orderBy $.s
`,
  hints: [
    'Sort the windows by start first. After that, a window can only join the period that was built last.',
    'Use `reduce` with a list of periods as the accumulator: `(w, acc = []) -> ...`. Read the last period with `acc[-1]`.',
    'If `w.s <= acc[-1].e`, the window overlaps or touches that period. Replace the last period with a wider one. Otherwise add a new period at the end.',
    'To drop the last period, keep the others: `acc filter ((p, i) -> i < sizeOf(acc) - 1)`.',
    'Keep the start and end text in each period next to the numbers, so the output can copy them without converting dates back to text.',
  ],
  solution: `%dw 2.0
output application/json
var timed = payload map (w) -> w ++ { s: w.start as DateTime as Number, e: w.end as DateTime as Number }

fun newPeriod(w) = { s: w.s, e: w.e, start: w.start, end: w.end, systems: [w.system] }

fun widen(p, w) = {
  s: p.s,
  e: if (w.e > p.e) w.e else p.e,
  start: p.start,
  end: if (w.e > p.e) w.end else p.end,
  systems: p.systems ++ [w.system]
}

var periods = (timed orderBy $.s) reduce ((w, acc = []) ->
  if (isEmpty(acc)) [newPeriod(w)]
  else if (w.s <= acc[-1].e) (acc filter ((p, i) -> i < sizeOf(acc) - 1)) ++ [widen(acc[-1], w)]
  else acc ++ [newPeriod(w)]
)
---
periods map (p) -> {
  start: p.start,
  end: p.end,
  minutes: (p.e - p.s) / 60,
  systems: (p.systems distinctBy $) orderBy $
}`,
  explanation: `
**Sort first.** Once the windows are in start order, a new window can never belong to a period before the last one. That turns the merge into one pass from left to right.

**reduce builds the periods.** The accumulator is the list of periods so far. Each window either widens the last period or opens a new one. \`w.s <= acc[-1].e\` covers both overlap and touch, because a window that starts at the minute the last period ends gives equal numbers.

**The end can stay put.** The CRM window from 00:30 to 00:45 sits inside the ERP window that ends at 01:00. \`widen\` keeps the later end, so the period does not shrink to 00:45.

**Seconds for the maths, text for the output.** \`as DateTime as Number\` gives seconds since 1970, which compare and subtract cleanly. The original \`start\` and \`end\` text travels with each period, so the output shows exactly what the teams published.

**Each system once.** A system can have two windows in one period, as WMS does in the second test. \`distinctBy $\` removes the repeat and \`orderBy $\` sorts the names.
`,
  tests: [
    {
      name: 'Windows with a gap stay apart',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content:
            '[{ "system": "ERP", "start": "2026-11-23T01:00:00Z", "end": "2026-11-23T02:00:00Z" }, { "system": "CRM", "start": "2026-11-23T02:01:00Z", "end": "2026-11-23T03:00:00Z" }]',
        },
      ],
      expected:
        '[{ "start": "2026-11-23T01:00:00Z", "end": "2026-11-23T02:00:00Z", "minutes": 60, "systems": ["ERP"] }, { "start": "2026-11-23T02:01:00Z", "end": "2026-11-23T03:00:00Z", "minutes": 59, "systems": ["CRM"] }]',
    },
    {
      name: 'One long window swallows a chain of short ones',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content:
            '[{ "system": "WMS", "start": "2026-11-24T02:00:00Z", "end": "2026-11-24T02:30:00Z" }, { "system": "ERP", "start": "2026-11-24T00:00:00Z", "end": "2026-11-24T06:00:00Z" }, { "system": "WMS", "start": "2026-11-24T05:00:00Z", "end": "2026-11-24T07:00:00Z" }]',
        },
      ],
      expected: '[{ "start": "2026-11-24T00:00:00Z", "end": "2026-11-24T07:00:00Z", "minutes": 420, "systems": ["ERP", "WMS"] }]',
    },
    {
      name: 'No windows',
      inputs: [{ name: 'payload', mime: 'application/json', content: '[]' }],
      expected: '[]',
    },
  ],
  followUps: [
    {
      q: 'One team publishes its windows in local time with an offset, such as +01:00. Does the script still work?',
      a: 'The comparisons do, because `as DateTime as Number` gives the same instant whatever the offset. The output copies the text as published, so you may want to convert start and end to UTC before showing them side by side.',
    },
    {
      q: 'Operations wants a 15 minute buffer before and after each window. Where do you add it?',
      a: 'Widen each window before the merge: subtract 900 seconds from `s` and add 900 to `e`. Windows that were 20 minutes apart then merge into one period, which is what the buffer is for.',
    },
    {
      q: 'How is this different from finding double-booked rooms?',
      a: 'Finding clashes lists each overlapping pair and keeps the bookings apart. Merging joins every chain of overlapping windows into one period and does not care which pairs overlap.',
    },
  ],
}
