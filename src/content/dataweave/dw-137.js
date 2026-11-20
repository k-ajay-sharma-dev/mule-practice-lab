export default {
  id: 'dw-137',
  category: 'dataweave',
  title: 'Smooth Daily Sales with a Three-Day Moving Average',
  level: 'INTERMEDIATE',
  tags: ['moving-average', 'ranges', 'index', 'orderBy', 'round', 'retail', 'json'],
  estMinutes: 20,
  description: `
Hollin Bakery has one shop. Its till sends one total per day. Daily sales jump around with the weather, so the owner wants a **three-day moving average** to see the trend.

The average for a day is the mean of that day and the two days before it. The first two days have no full window, so they are left out.

Output one object per day from the third day on, in date order, with:

- \`date\` and \`sales\`: copied from the input
- \`avg3\`: the three-day average as a Number, rounded to two decimal places. A whole average stays whole, so 120 is written as \`120\`, not \`120.00\`.

The input may arrive out of order. An array index can take a range, so \`days[2 to 4]\` gives the items at positions 2, 3 and 4.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `[
  { "date": "2026-11-04", "sales": 90 },
  { "date": "2026-11-02", "sales": 120 },
  { "date": "2026-11-03", "sales": 150 },
  { "date": "2026-11-05", "sales": 200 },
  { "date": "2026-11-07", "sales": 310 },
  { "date": "2026-11-06", "sales": 175 }
]`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `[
  { "date": "2026-11-04", "sales": 90, "avg3": 120 },
  { "date": "2026-11-05", "sales": 200, "avg3": 146.67 },
  { "date": "2026-11-06", "sales": 175, "avg3": 155 },
  { "date": "2026-11-07", "sales": 310, "avg3": 228.33 }
]`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload map (day) -> {
  date: day.date,
  sales: day.sales,
  avg3: day.sales
}
`,
  hints: [
    'Sort first: `var days = payload orderBy $.date`. Dates written as `yyyy-MM-dd` sort correctly as text.',
    '`map` gives the index as a second argument: `days map (day, i) -> ...`. The window for day `i` is `days[(i - 2) to i]`.',
    'Days 0 and 1 have no full window. Give them `null`, then remove them with `filter ($ != null)`.',
    'Round to two places with `round(value * 100) / 100`.',
  ],
  solution: `%dw 2.0
output application/json
var days = payload orderBy $.date
---
(days map (day, i) ->
  if (i < 2) null
  else do {
    var window = days[(i - 2) to i]
    ---
    {
      date: day.date,
      sales: day.sales,
      avg3: round(sum(window map $.sales) / 3 * 100) / 100
    }
  }
) filter ($ != null)`,
  explanation: `
**Sort first.** A moving average only makes sense in time order. The dates use \`yyyy-MM-dd\`, so text order is date order.

**The window.** \`days[(i - 2) to i]\` takes three items that end at the current day. The brackets around \`i - 2\` keep the range clear to the reader.

**Days without a full window.** Day 0 and day 1 return \`null\`, and \`filter\` removes them at the end. This keeps the index of every day the same as its place in \`days\`.

**Rounding.** \`440 / 3\` has no end to its decimals. Multiplying by 100, rounding to a whole number and dividing by 100 keeps two places. A whole result such as 120 prints without decimals.
`,
  tests: [
    {
      name: 'Exactly three days',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '[{ "date": "2026-12-01", "sales": 10 }, { "date": "2026-12-03", "sales": 40 }, { "date": "2026-12-02", "sales": 25 }]',
        },
      ],
      expected: '[{ "date": "2026-12-03", "sales": 40, "avg3": 25 }]',
    },
    {
      name: 'Two days give no averages',
      inputs: [{ name: 'payload', mime: 'application/json', content: '[{ "date": "2026-12-01", "sales": 10 }, { "date": "2026-12-02", "sales": 20 }]' }],
      expected: '[]',
    },
    {
      name: 'No days',
      inputs: [{ name: 'payload', mime: 'application/json', content: '[]' }],
      expected: '[]',
    },
  ],
  followUps: [
    {
      q: 'Why not loop with `(2 to sizeOf(days) - 1) map ...` instead?',
      a: 'With fewer than three days, that range runs from 2 down to 1 or 0, and a DataWeave range counts down when the end is below the start. The script would then read days that have no full window. Mapping over the days and dropping the first two avoids that case.',
    },
    {
      q: 'The shop is closed on Mondays, so some dates are missing. Is a three-row window still three days?',
      a: 'No. It is three trading days, which may cover four calendar days. If the owner wants calendar days, fill the missing dates with zero sales first, or pick the window by date instead of by position.',
    },
    {
      q: 'How would you make the window size a setting?',
      a: 'Put it in a variable such as `var size = 7`, and use `days[(i - size + 1) to i]`, `i < size - 1` and `/ size`. The rest of the script stays the same.',
    },
  ],
}
