export default {
  id: 'dw-014',
  category: 'dataweave',
  title: 'Invoice Due Dates and Days Overdue',
  level: 'INTERMEDIATE',
  tags: ['dates', 'periods', 'daysBetween', 'format', 'json'],
  estMinutes: 20,
  description: `
The legacy billing system exports invoices with European dates (\`dd/MM/yyyy\`) and payment terms in days. The collections dashboard needs ISO dates and an overdue indicator.

Input: \`{ "asOf": "dd/MM/yyyy", "invoices": [ { "invoiceNo", "issueDate", "termsDays" } ] }\`.

For each invoice (keep the input order) output:

- \`invoiceNo\` — copied as-is
- \`issueDate\` — the issue date formatted \`yyyy-MM-dd\`
- \`dueDate\` — issue date **plus** \`termsDays\` calendar days, formatted \`yyyy-MM-dd\`
- \`daysOverdue\` — the number of days from \`dueDate\` to \`asOf\` when \`asOf\` is **after** \`dueDate\`; otherwise \`0\` (an invoice due *on* the \`asOf\` date is not overdue)
- \`status\` — \`"OVERDUE"\` when \`daysOverdue > 0\`, otherwise \`"OPEN"\`

Calendar rules apply: month lengths and leap years must be handled correctly.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{
  "asOf": "15/03/2026",
  "invoices": [
    { "invoiceNo": "INV-1", "issueDate": "10/01/2026", "termsDays": 30 },
    { "invoiceNo": "INV-2", "issueDate": "28/02/2026", "termsDays": 15 },
    { "invoiceNo": "INV-3", "issueDate": "05/03/2026", "termsDays": 45 },
    { "invoiceNo": "INV-4", "issueDate": "31/12/2025", "termsDays": 60 }
  ]
}`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `[
  { "invoiceNo": "INV-1", "issueDate": "2026-01-10", "dueDate": "2026-02-09", "daysOverdue": 34, "status": "OVERDUE" },
  { "invoiceNo": "INV-2", "issueDate": "2026-02-28", "dueDate": "2026-03-15", "daysOverdue": 0, "status": "OPEN" },
  { "invoiceNo": "INV-3", "issueDate": "2026-03-05", "dueDate": "2026-04-19", "daysOverdue": 0, "status": "OPEN" },
  { "invoiceNo": "INV-4", "issueDate": "2025-12-31", "dueDate": "2026-03-01", "daysOverdue": 14, "status": "OVERDUE" }
]`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload
`,
  hints: [
    'Parse a custom format with `"10/01/2026" as Date {format: "dd/MM/yyyy"}` and print one with `d as String {format: "yyyy-MM-dd"}`.',
    'Add days with a Period: `d + |P30D|`. For a dynamic number build the period from a string: `("P" ++ n ++ "D") as Period`.',
    '`daysBetween(from, to)` returns the total number of days between two dates. Dates can be compared with `>`.',
  ],
  solution: `%dw 2.0
output application/json
var asOf = payload.asOf as Date {format: "dd/MM/yyyy"}
---
payload.invoices map (inv) -> do {
  var issued = inv.issueDate as Date {format: "dd/MM/yyyy"}
  var due = issued + ("P$(inv.termsDays)D" as Period)
  var late = if (asOf > due) daysBetween(due, asOf) else 0
  ---
  {
    invoiceNo: inv.invoiceNo,
    issueDate: issued as String {format: "yyyy-MM-dd"},
    dueDate: due as String {format: "yyyy-MM-dd"},
    daysOverdue: late,
    status: if (late > 0) "OVERDUE" else "OPEN"
  }
}`,
  explanation: `
Once the strings are real \`Date\` values, the calendar does the work: adding \`P60D\` to 31 Dec 2025 lands on 1 Mar 2026 because February 2026 has 28 days.

\`"P$(inv.termsDays)D" as Period\` uses string interpolation to build an ISO-8601 period such as \`P30D\`.

**Common traps**
- Using \`YYYY\` instead of \`yyyy\`: \`YYYY\` is the *week-based* year and gives wrong years around New Year.
- Subtracting two dates and reading a field of the result: the difference is a Period/Duration, not a day count. \`daysBetween\` gives the total number of days.
- Using \`>=\` for "overdue": an invoice due today is still on time.
`,
  tests: [
    {
      name: 'Leap year and zero-day terms',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content:
            '{ "asOf": "01/03/2024", "invoices": [{ "invoiceNo": "A", "issueDate": "20/02/2024", "termsDays": 10 }, { "invoiceNo": "B", "issueDate": "01/01/2024", "termsDays": 0 }] }',
        },
      ],
      expected:
        '[{ "invoiceNo": "A", "issueDate": "2024-02-20", "dueDate": "2024-03-01", "daysOverdue": 0, "status": "OPEN" }, { "invoiceNo": "B", "issueDate": "2024-01-01", "dueDate": "2024-01-01", "daysOverdue": 60, "status": "OVERDUE" }]',
    },
  ],
  followUps: [
    {
      q: 'How would you add one month instead of 30 days?',
      a: 'Use `|P1M|`. Month arithmetic is calendar-aware, so 31 Jan + P1M becomes the last day of February rather than overflowing into March.',
    },
    {
      q: 'The source now sends `2026-01-10T23:30:00+05:30` and the dashboard works in UTC. What changes?',
      a: 'Parse it as a DateTime and shift it with `>> "UTC"` (e.g. `dt >> "UTC"`) before taking the date part, otherwise the local date may be one day off.',
    },
  ],
}
