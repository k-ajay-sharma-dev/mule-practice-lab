export default {
  id: 'dw-147',
  category: 'dataweave',
  title: 'Unpivot Monthly Budget Columns into Rows',
  level: 'INTERMEDIATE',
  tags: ['unpivot', 'filterObject', 'pluck', 'flatMap', 'dynamic-keys', 'finance', 'json'],
  estMinutes: 15,
  description: `
Thornbury Housing plans its budget in a spreadsheet. Each row is one cost centre and account, with one column per month. The finance system wants the opposite shape: one row per cost centre, account and month.

The spreadsheet is turned into JSON before it reaches Mule. The month columns change from file to file. One file may hold January to March, the next April to June. The script must not list the months by name.

Output one row per month column, in input order and then column order, with:

- \`costCentre\` and \`account\`: copied from the row
- \`month\`: the column name
- \`amount\`: the value

Every key other than \`costCentre\` and \`account\` is a month. Skip a month when its value is \`0\` or \`null\`, because the finance system treats a missing row as zero.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `[
  { "costCentre": "CC-410", "account": "Travel", "Jan": 1200, "Feb": 950, "Mar": 0 },
  { "costCentre": "CC-410", "account": "Training", "Jan": 0, "Feb": null, "Mar": 2400 },
  { "costCentre": "CC-520", "account": "Software", "Jan": 310.5, "Feb": 310.5, "Mar": 310.5 }
]`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `[
  { "costCentre": "CC-410", "account": "Travel", "month": "Jan", "amount": 1200 },
  { "costCentre": "CC-410", "account": "Travel", "month": "Feb", "amount": 950 },
  { "costCentre": "CC-410", "account": "Training", "month": "Mar", "amount": 2400 },
  { "costCentre": "CC-520", "account": "Software", "month": "Jan", "amount": 310.5 },
  { "costCentre": "CC-520", "account": "Software", "month": "Feb", "amount": 310.5 },
  { "costCentre": "CC-520", "account": "Software", "month": "Mar", "amount": 310.5 }
]`,
  },
  starterCode: `%dw 2.0
output application/json
var idKeys = ["costCentre", "account"]
---
payload map (row) -> row
`,
  hints: [
    'Each input row turns into several output rows, so start with `flatMap` over the payload.',
    'Inside, use `filterObject` on the row to keep the month keys. A key is a month when `idKeys contains (k as String)` is false.',
    'Add `v != null and v != 0` to the same filter to skip empty months.',
    '`pluck ((v, k) -> ...)` then turns each remaining key and value into one row. Read `costCentre` and `account` from the outer row.',
  ],
  solution: `%dw 2.0
output application/json
var idKeys = ["costCentre", "account"]

fun isMonth(k) = not (idKeys contains (k as String))
---
payload flatMap (row) ->
  (row filterObject ((v, k) -> isMonth(k) and v != null and v != 0))
    pluck ((v, k) -> {
      costCentre: row.costCentre,
      account: row.account,
      month: k as String,
      amount: v
    })`,
  explanation: `
**Unpivot is the reverse of pivot.** A wide row holds one value per column. The long shape holds one row per value, with the column name moved into a field, here \`month\`.

**Find the columns by what they are not.** The month names change between files, so the script lists the fixed keys instead. Any other key is a month. \`k as String\` is needed because \`filterObject\` passes the key as a Key, not as text.

**filterObject, then pluck.** \`filterObject\` keeps the month keys that have a value. \`pluck\` walks the keys that are left and returns a list, one row per month. The order of the keys in the row is kept, so January comes before February.

**flatMap joins the lists.** Each input row gives a list of rows. \`map\` would return a list of lists. \`flatMap\` joins them into one flat list.
`,
  tests: [
    {
      name: 'A file with other months',
      inputs: [{ name: 'payload', mime: 'application/json', content: '[{ "costCentre": "CC-610", "account": "Rent", "Apr": 5000, "May": 5000, "Jun": 5200 }]' }],
      expected:
        '[{ "costCentre": "CC-610", "account": "Rent", "month": "Apr", "amount": 5000 }, { "costCentre": "CC-610", "account": "Rent", "month": "May", "amount": 5000 }, { "costCentre": "CC-610", "account": "Rent", "month": "Jun", "amount": 5200 }]',
    },
    {
      name: 'A row with nothing planned gives no rows',
      inputs: [{ name: 'payload', mime: 'application/json', content: '[{ "costCentre": "CC-700", "account": "Events", "Jan": 0, "Feb": null }]' }],
      expected: '[]',
    },
  ],
  followUps: [
    {
      q: 'The finance system wants a period such as 2027-01 instead of Jan. How?',
      a: 'Keep a lookup object from month name to number, such as { Jan: "01" }, and build the period from the budget year and that number. The year can come from a variable or the file name.',
    },
    {
      q: 'Why skip the zero months?',
      a: 'The finance system treats a missing row as zero, so sending zeros adds rows that mean nothing. Check this rule with the receiving team, since some systems need an explicit zero to clear an old value.',
    },
    {
      q: 'How would you pivot the rows back into the wide shape?',
      a: 'Group the rows by cost centre and account, then build one object per group with dynamic keys: `{ (rows map (r) -> { (r.month): r.amount }) }`.',
    },
  ],
}
