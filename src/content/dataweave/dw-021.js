export default {
  id: 'dw-021',
  category: 'dataweave',
  title: 'Pivot Meter Readings into a Wide Report',
  level: 'ADVANCED',
  tags: ['pivot', 'groupBy', 'dynamic-keys', 'distinctBy', 'orderBy', 'json'],
  estMinutes: 35,
  description: `
Smart meters send energy readings as long-format rows. The finance team wants a wide, spreadsheet-like report.

**Input**
- Each row is \`{ "site", "month", "kWh" }\`, with \`month\` as \`yyyy-MM\`.
- The rows arrive unsorted.
- A site can report the **same month more than once** (partial readings).

**Output**: an object with:

- \`months\`: every distinct month present in the input, sorted ascending
- \`rows\`: one object per site:
  - \`site\`
  - one key **per month in \`months\`, in that order**, whose value is the site's total kWh for that month (sum of its readings), or \`0\` when the site has no reading that month
  - \`total\`: the site's total kWh over all months

  Rows are sorted by \`total\` **descending**. Sites with equal totals are sorted by \`site\` ascending.
- \`monthTotals\`: an object with one key per month (same order as \`months\`) holding the total kWh of all sites for that month

No readings → \`{ "months": [], "rows": [], "monthTotals": {} }\`.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `[
  { "site": "Pune", "month": "2026-02", "kWh": 120 },
  { "site": "Oslo", "month": "2026-01", "kWh": 300 },
  { "site": "Pune", "month": "2026-01", "kWh": 80 },
  { "site": "Lima", "month": "2026-03", "kWh": 50.5 },
  { "site": "Pune", "month": "2026-02", "kWh": 30 },
  { "site": "Oslo", "month": "2026-03", "kWh": 100 },
  { "site": "Lima", "month": "2026-01", "kWh": 149.5 },
  { "site": "Accra", "month": "2026-02", "kWh": 200 }
]`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "months": ["2026-01", "2026-02", "2026-03"],
  "rows": [
    { "site": "Oslo", "2026-01": 300, "2026-02": 0, "2026-03": 100, "total": 400 },
    { "site": "Pune", "2026-01": 80, "2026-02": 150, "2026-03": 0, "total": 230 },
    { "site": "Accra", "2026-01": 0, "2026-02": 200, "2026-03": 0, "total": 200 },
    { "site": "Lima", "2026-01": 149.5, "2026-02": 0, "2026-03": 50.5, "total": 200 }
  ],
  "monthTotals": { "2026-01": 529.5, "2026-02": 350, "2026-03": 150.5 }
}`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload
`,
  hints: [
    'Compute the column list first: `(payload.month default []) distinctBy $ orderBy $`. Every row is then built by mapping over that list, which guarantees the same keys in the same order.',
    'Dynamic keys: `{ (months map (m) -> { (m): ... }) }` builds one key per month. For the cell value, group the site\'s readings by month and `sum(group[m].kWh default [])` — a missing month gives `null`, hence the `default`.',
    'For "total desc, then site asc", sort by `site` first and then by `-total`: `orderBy` is stable, so ties keep the site order.',
  ],
  solution: `%dw 2.0
output application/json
var months = ((payload.month default []) distinctBy $) orderBy $

fun monthCells(readings) = do {
  var byMonth = readings groupBy $.month
  ---
  { (months map (m) -> { (m): sum(byMonth[m].kWh default []) }) }
}

var rows = (payload groupBy $.site) pluck (readings, site) ->
  { site: site as String } ++ monthCells(readings) ++ { total: sum(readings.kWh) }
---
{
  months: months,
  rows: (rows orderBy $.site) orderBy -$.total,
  monthTotals: monthCells(payload)
}`,
  explanation: `
A pivot is two steps: decide the **columns** once (the sorted distinct months), then build every row by iterating over those columns — never over the keys a particular site happens to have. That is what guarantees zero-filled gaps and identical key order in every row.

\`monthCells\` is reused for the grand totals: applied to all readings instead of one site's, it yields \`monthTotals\` for free.

\`orderBy\` is stable, so sorting by the secondary key (\`site\`) first and the primary key (\`-total\`) second gives "total descending, then site ascending" — Accra stays before Lima at 200 kWh.

**Common traps**
- Using \`site.month\` keys from the data directly: sites missing a month lose that column and columns appear in data order.
- Forgetting that a site can report a month twice: taking \`[0]\` instead of summing.
- \`orderBy\` has no descending flag — negate numbers (\`-$.total\`) or \`reverse\` the result (which would also reverse the tie order).
`,
  tests: [
    {
      name: 'No readings',
      inputs: [{ name: 'payload', mime: 'application/json', content: '[]' }],
      expected: '{ "months": [], "rows": [], "monthTotals": {} }',
    },
    {
      name: 'Ties, duplicates and a single month',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content:
            '[{ "site": "Zug", "month": "2025-12", "kWh": 5 }, { "site": "Bern", "month": "2025-12", "kWh": 2 }, { "site": "Bern", "month": "2025-12", "kWh": 3 }, { "site": "Chur", "month": "2025-12", "kWh": 7 }]',
        },
      ],
      expected:
        '{ "months": ["2025-12"], "rows": [{ "site": "Chur", "2025-12": 7, "total": 7 }, { "site": "Bern", "2025-12": 5, "total": 5 }, { "site": "Zug", "2025-12": 5, "total": 5 }], "monthTotals": { "2025-12": 17 } }',
    },
  ],
  followUps: [
    {
      q: 'How would you output this as CSV for Excel?',
      a: 'Switch to `output application/csv` and output only the `rows` array. Because every row has the same keys in the same order, the CSV writer derives a consistent header from the first row.',
    },
    {
      q: 'How would you unpivot the wide rows back into long format?',
      a: 'For each row, drop `site` and `total` with `-` and `pluck` the remaining month keys: `(row - "site" - "total") pluck (v, k) -> { site: row.site, month: k as String, kWh: v }`, then `flatten` the result (optionally filtering zero cells).',
    },
    {
      q: 'Why is `orderBy` stability important here?',
      a: 'The two-pass sort only works if equal elements keep their relative order from the first pass. If the sort were not stable you would need a single composite key instead.',
    },
  ],
}
