export default {
  id: 'dw-037',
  category: 'dataweave',
  title: 'List Business Days in a Delivery Window',
  level: 'INTERMEDIATE',
  tags: ['dates', 'periods', 'ranges', 'business-days', 'multiple-inputs'],
  estMinutes: 25,
  description: `
A logistics API offers customers a dispatch day inside a delivery window. Given the window (\`payload\`) and the company's public holidays (\`holidays\`, an array of \`yyyy-MM-dd\` strings), list every **business day** in the window.

Return \`{ orderId, businessDays, count }\`.

**Rules**
- The window runs from \`from\` to \`to\`, **both inclusive**.
- A business day is Monday–Friday and not in \`holidays\`. (A holiday that falls on a weekend changes nothing.)
- \`businessDays\` is a list of \`yyyy-MM-dd\` strings in chronological order; \`count\` is its length.
- If \`to\` is before \`from\`, the window is invalid: \`businessDays\` is \`[]\` and \`count\` is \`0\`.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{ "orderId": "O-1", "from": "2024-12-20", "to": "2025-01-03" }`,
    },
    {
      name: 'holidays',
      mime: 'application/json',
      content: `["2024-12-25", "2024-12-26", "2025-01-01"]`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "orderId": "O-1",
  "businessDays": [
    "2024-12-20",
    "2024-12-23",
    "2024-12-24",
    "2024-12-27",
    "2024-12-30",
    "2024-12-31",
    "2025-01-02",
    "2025-01-03"
  ],
  "count": 8
}`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload
`,
  hints: [
    '`daysBetween(start, end)` gives the number of days between two dates. Generate offsets `0 to n` and add each one to the start date.',
    'Turn an offset into a period with `days(i)` from `dw::core::Periods` (or build `("P" ++ i ++ "D") as Period`). `d.dayOfWeek` is 1 for Monday … 7 for Sunday.',
    'What does `0 to -3` produce? Try it — then guard the invalid window explicitly.',
  ],
  solution: `%dw 2.0
import days from dw::core::Periods
output application/json

var start = payload.from as Date
var end = payload.to as Date
var n = daysBetween(start, end)

var allDays = if (n < 0) [] else (0 to n) map ((i) -> start + days(i))

var business = allDays
  filter ((d) -> d.dayOfWeek <= 5)
  map ((d) -> d as String {format: "yyyy-MM-dd"})
  filter ((s) -> !(holidays contains s))
---
{
  orderId: payload.orderId,
  businessDays: business,
  count: sizeOf(business)
}`,
  explanation: `
**Generating a date range.** DataWeave has no "date range" operator, but it has integer ranges and date arithmetic: \`(0 to n) map (start + days(i))\` produces every date from \`start\` to \`start + n\`. \`daysBetween\` returns a plain \`Number\` of days across month and year boundaries; \`end - start\` instead returns a period value (for two dates this engine prints it as \`PT336H\`), which you then have to unpack.

**Filtering.** \`dayOfWeek\` follows ISO-8601 (Monday = 1, Sunday = 7), so \`<= 5\` keeps weekdays. Holidays arrive as strings, so the date is formatted first and then looked up with \`contains\`; comparing a \`Date\` with a \`String\` would never match.

**The trap.** DataWeave ranges can run **backwards**: \`0 to -3\` is \`[0, -1, -2, -3]\`, not \`[]\`. Without the \`n < 0\` guard an inverted window silently returns the days *before* \`from\`.
`,
  tests: [
    {
      name: 'Inverted window',
      inputs: [
        { name: 'payload', mime: 'application/json', content: '{ "orderId": "O-2", "from": "2025-03-10", "to": "2025-03-07" }' },
        { name: 'holidays', mime: 'application/json', content: '[]' },
      ],
      expected: '{ "orderId": "O-2", "businessDays": [], "count": 0 }',
    },
    {
      name: 'Weekend and a holiday at the end of the window',
      inputs: [
        { name: 'payload', mime: 'application/json', content: '{ "orderId": "O-3", "from": "2025-03-07", "to": "2025-03-11" }' },
        { name: 'holidays', mime: 'application/json', content: '["2025-03-11", "2025-03-08"]' },
      ],
      expected: '{ "orderId": "O-3", "businessDays": ["2025-03-07", "2025-03-10"], "count": 2 }',
    },
  ],
  followUps: [
    {
      q: 'How would you find the Nth business day after an order date?',
      a: 'Generate a generous range (e.g. N × 2 + 10 days), filter to business days and take index `[N - 1]`; or write a tail-recursive function that adds one day at a time and decrements N only on business days.',
    },
    {
      q: 'Why use `daysBetween` instead of subtracting the dates?',
      a: '`end - start` returns a period/duration value (e.g. `PT336H`), not a number, so you must extract the days from it before using it in a range. `daysBetween` states the intent and returns a Number directly.',
    },
    {
      q: 'Where should the holiday calendar come from in a real API?',
      a: 'From a cached lookup — an Object Store, a config file per country, or a calendar System API — passed into the transform as a variable, not hard-coded in the script.',
    },
  ],
}
