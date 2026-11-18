export default {
  id: 'dw-184',
  category: 'dataweave',
  title: 'Spread a Weekly Forecast Into Daily Rows With a SQL Server Calendar Table and a Day Profile',
  level: 'EXPERT',
  tags: ['myproject', 'sql-server', 'planning-platform', 'calendar', 'dates', 'rounding', 'multiple-inputs', 'json'],
  estMinutes: 35,
  description: `
Brindle Outdoor gets a weekly store forecast from the planning platform, by fiscal year and fiscal week. The store replenishment system in SQL Server needs daily quantities. Mule reads the fiscal calendar table and a day profile from the database, spreads each week over its seven days, and bulk inserts the daily rows.

**Inputs**
- \`payload\`: forecast lines with \`store\`, \`item\`, \`fiscalYear\`, \`fiscalWeek\` and \`qty\`, a whole number
- \`vars.calendar\`: rows of the calendar table with \`FiscalYear\`, \`FiscalWeek\` and \`WeekStart\`, the first day of the week
- \`vars.profile\`: seven whole number weights in percent, from the first day of the week to the last, adding up to 100

**Spreading.** Daily quantities must be whole numbers and must add up to the weekly quantity. Use cumulative rounding down: with \`cum(d)\` the sum of the weights of days 0 to d, the quantity of day d is \`floor(qty * cum(d) / 100) - floor(qty * cum(d - 1) / 100)\`, where \`cum(-1)\` is 0.

**Output**
- \`rows\`: \`StoreId\`, \`ItemId\`, \`SalesDate\` as \`yyyy-MM-dd\` and \`Qty\`, in forecast order and then day order. Leave out days with a quantity of 0.
- \`rejects\`: forecast lines whose week is not in the calendar, with \`store\`, \`item\`, \`fiscalYear\`, \`fiscalWeek\` and \`reason\` \`No calendar week Y-W\`
- \`unitsIn\`: the sum of \`qty\` over the forecast lines that were not rejected
- \`unitsOut\`: the sum of \`Qty\` over \`rows\`
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `[
  { "store": "0412", "item": "TENT-2P-GRN", "fiscalYear": 2026, "fiscalWeek": 42, "qty": 50 },
  { "store": "0412", "item": "STOVE-CMP-1", "fiscalYear": 2026, "fiscalWeek": 42, "qty": 7 },
  { "store": "0415", "item": "LANTERN-LED", "fiscalYear": 2026, "fiscalWeek": 43, "qty": 3 },
  { "store": "0415", "item": "TENT-2P-GRN", "fiscalYear": 2026, "fiscalWeek": 53, "qty": 9 }
]`,
    },
    {
      name: 'vars',
      mime: 'application/json',
      content: `{
  "calendar": [
    { "FiscalYear": 2026, "FiscalWeek": 42, "WeekStart": "2026-11-15" },
    { "FiscalYear": 2026, "FiscalWeek": 43, "WeekStart": "2026-11-22" }
  ],
  "profile": [10, 10, 12, 13, 15, 22, 18]
}`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "rows": [
    { "StoreId": "0412", "ItemId": "TENT-2P-GRN", "SalesDate": "2026-11-15", "Qty": 5 },
    { "StoreId": "0412", "ItemId": "TENT-2P-GRN", "SalesDate": "2026-11-16", "Qty": 5 },
    { "StoreId": "0412", "ItemId": "TENT-2P-GRN", "SalesDate": "2026-11-17", "Qty": 6 },
    { "StoreId": "0412", "ItemId": "TENT-2P-GRN", "SalesDate": "2026-11-18", "Qty": 6 },
    { "StoreId": "0412", "ItemId": "TENT-2P-GRN", "SalesDate": "2026-11-19", "Qty": 8 },
    { "StoreId": "0412", "ItemId": "TENT-2P-GRN", "SalesDate": "2026-11-20", "Qty": 11 },
    { "StoreId": "0412", "ItemId": "TENT-2P-GRN", "SalesDate": "2026-11-21", "Qty": 9 },
    { "StoreId": "0412", "ItemId": "STOVE-CMP-1", "SalesDate": "2026-11-16", "Qty": 1 },
    { "StoreId": "0412", "ItemId": "STOVE-CMP-1", "SalesDate": "2026-11-17", "Qty": 1 },
    { "StoreId": "0412", "ItemId": "STOVE-CMP-1", "SalesDate": "2026-11-18", "Qty": 1 },
    { "StoreId": "0412", "ItemId": "STOVE-CMP-1", "SalesDate": "2026-11-19", "Qty": 1 },
    { "StoreId": "0412", "ItemId": "STOVE-CMP-1", "SalesDate": "2026-11-20", "Qty": 1 },
    { "StoreId": "0412", "ItemId": "STOVE-CMP-1", "SalesDate": "2026-11-21", "Qty": 2 },
    { "StoreId": "0415", "ItemId": "LANTERN-LED", "SalesDate": "2026-11-25", "Qty": 1 },
    { "StoreId": "0415", "ItemId": "LANTERN-LED", "SalesDate": "2026-11-27", "Qty": 1 },
    { "StoreId": "0415", "ItemId": "LANTERN-LED", "SalesDate": "2026-11-28", "Qty": 1 }
  ],
  "rejects": [
    { "store": "0415", "item": "TENT-2P-GRN", "fiscalYear": 2026, "fiscalWeek": 53, "reason": "No calendar week 2026-53" }
  ],
  "unitsIn": 60,
  "unitsOut": 60
}`,
  },
  starterCode: `%dw 2.0
output application/json
---
{
  rows: payload flatMap (f) -> vars.profile map (w, d) -> {
    StoreId: f.store,
    Qty: f.qty * w / 100
  }
}
`,
  hints: [
    'Find the week with `(vars.calendar filter (c) -> c.FiscalYear == f.fiscalYear and c.FiscalWeek == f.fiscalWeek)[0]`. It is null when the week is missing.',
    'Build the cumulative weights once: `(0 to 6) map (d) -> sum(vars.profile[0 to d])`.',
    'Write a helper `fun upTo(qty, d) = if (d < 0) 0 else floor(qty * cum[d] / 100)`. Day d is then `upTo(qty, d) - upTo(qty, d - 1)`.',
    'Add days with a period: `(start as Date) + ("P$(d)D" as Period)`, then `as String {format: "yyyy-MM-dd"}`.',
    'Use `reduce ((x, acc = 0) -> acc + x)` for the totals, so empty lists give 0.',
  ],
  solution: `%dw 2.0
output application/json

var cum = (0 to 6) map (d) -> (vars.profile[0 to d] reduce ((w, acc = 0) -> acc + w))

fun weekOf(f) =
  (vars.calendar filter (c) -> c.FiscalYear == f.fiscalYear and c.FiscalWeek == f.fiscalWeek)[0]

fun upTo(qty, d) = if (d < 0) 0 else floor(qty * cum[d] / 100)

fun dayDate(start, d) = ((start as Date) + ("P$(d)D" as Period)) as String {format: "yyyy-MM-dd"}

var accepted = payload filter (f) -> weekOf(f) != null

var rows = accepted flatMap (f) -> do {
  var start = weekOf(f).WeekStart
  ---
  ((0 to 6) map (d) -> {
    StoreId: f.store,
    ItemId: f.item,
    SalesDate: dayDate(start, d),
    Qty: upTo(f.qty, d) - upTo(f.qty, d - 1)
  }) filter ($.Qty > 0)
}

fun total(list) = list reduce ((x, acc = 0) -> acc + x)
---
{
  rows: rows,
  rejects: (payload filter (f) -> weekOf(f) == null) map (f) -> {
    store: f.store,
    item: f.item,
    fiscalYear: f.fiscalYear,
    fiscalWeek: f.fiscalWeek,
    reason: "No calendar week $(f.fiscalYear)-$(f.fiscalWeek)"
  },
  unitsIn: total(accepted map $.qty),
  unitsOut: total(rows map $.Qty)
}`,
  explanation: `
**The calendar decides the dates.** Fiscal weeks do not follow ISO weeks, and retail years can have 52 or 53 weeks. Reading \`WeekStart\` from the calendar table, instead of computing it, keeps Mule in step with the business calendar. A week the calendar does not have is rejected, not guessed.

**Rounding that keeps the total.** Rounding each day on its own can lose or add units: for 7 units with this profile, the seven rounded days add up to 8. Cumulative rounding rounds the running total instead. The last running total is always the full quantity, so the days always add up to the week.

**Why round down the running total?** \`floor\` gives the same result on every engine and avoids half way cases. The difference of two running totals is never negative, because the weights are never negative.

**Dates by period.** Adding \`P0D\` to \`P6D\` to the week start gives the seven days, and month ends are handled by the date type.

**Two totals as a check.** \`unitsIn\` and \`unitsOut\` must be equal. The flow can stop before the insert if they are not, for example when the profile does not add up to 100.
`,
  tests: [
    {
      name: 'A week that crosses a month end',
      inputs: [
        { name: 'payload', mime: 'application/json', content: '[{ "store": "0420", "item": "TENT-4P-BLU", "fiscalYear": 2026, "fiscalWeek": 44, "qty": 10 }]' },
        {
          name: 'vars',
          mime: 'application/json',
          content: '{ "calendar": [{ "FiscalYear": 2026, "FiscalWeek": 44, "WeekStart": "2026-11-29" }], "profile": [10, 10, 12, 13, 15, 22, 18] }',
        },
      ],
      expected:
        '{ "rows": [{ "StoreId": "0420", "ItemId": "TENT-4P-BLU", "SalesDate": "2026-11-29", "Qty": 1 }, { "StoreId": "0420", "ItemId": "TENT-4P-BLU", "SalesDate": "2026-11-30", "Qty": 1 }, { "StoreId": "0420", "ItemId": "TENT-4P-BLU", "SalesDate": "2026-12-01", "Qty": 1 }, { "StoreId": "0420", "ItemId": "TENT-4P-BLU", "SalesDate": "2026-12-02", "Qty": 1 }, { "StoreId": "0420", "ItemId": "TENT-4P-BLU", "SalesDate": "2026-12-03", "Qty": 2 }, { "StoreId": "0420", "ItemId": "TENT-4P-BLU", "SalesDate": "2026-12-04", "Qty": 2 }, { "StoreId": "0420", "ItemId": "TENT-4P-BLU", "SalesDate": "2026-12-05", "Qty": 2 }], "rejects": [], "unitsIn": 10, "unitsOut": 10 }',
    },
    {
      name: 'Zero forecast',
      inputs: [
        { name: 'payload', mime: 'application/json', content: '[{ "store": "0412", "item": "STOVE-CMP-1", "fiscalYear": 2026, "fiscalWeek": 42, "qty": 0 }]' },
        {
          name: 'vars',
          mime: 'application/json',
          content: '{ "calendar": [{ "FiscalYear": 2026, "FiscalWeek": 42, "WeekStart": "2026-11-15" }], "profile": [10, 10, 12, 13, 15, 22, 18] }',
        },
      ],
      expected: '{ "rows": [], "rejects": [], "unitsIn": 0, "unitsOut": 0 }',
    },
  ],
  followUps: [
    {
      q: 'Where would the day profile come from?',
      a: 'From a table per store or store group, often from the sales history of each weekday. The planning platform may also send daily splits itself.',
    },
    {
      q: 'Why not compute the week start from the fiscal year start?',
      a: 'Retail calendars have 53 week years and shifted year starts. The calendar table is the source of truth, and the database team maintains it.',
    },
    {
      q: 'How would you load the calendar efficiently?',
      a: 'Query only the weeks in the forecast once per run, or cache the table, and build a lookup object keyed by year and week instead of filtering for each line.',
    },
  ],
}
