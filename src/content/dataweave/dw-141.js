export default {
  id: 'dw-141',
  category: 'dataweave',
  title: 'Report Duplicate Invoice Numbers with Their Row Numbers',
  level: 'INTERMEDIATE',
  tags: ['duplicates', 'groupBy', 'pluck', 'trim', 'upper', 'index', 'finance', 'json'],
  estMinutes: 20,
  description: `
Quarrystone Building Supplies lets suppliers upload their invoices as a JSON list. Before the list goes to the finance system, an integration rejects any upload that holds the same invoice number twice. The supplier then needs to know **which rows** to fix.

Invoice numbers are typed by hand, so \`INV-1001\`, \`inv-1001\` and \`INV-1001 \` (with a space) are the same number.

Output one object for each invoice number that appears more than once, with:

- \`invoiceNo\`: the number in capitals, with no spaces around it
- \`count\`: how many times it appears
- \`rows\`: the row numbers where it appears, counting the first row as 1

Sort the result by \`invoiceNo\`. When there are no duplicates, output an empty list.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `[
  { "invoiceNo": "INV-1001", "supplier": "Hollins Timber", "amount": 420.5 },
  { "invoiceNo": "INV-1002", "supplier": "Hollins Timber", "amount": 88 },
  { "invoiceNo": " inv-1001", "supplier": "Hollins Timber", "amount": 420.5 },
  { "invoiceNo": "INV-1003", "supplier": "Hollins Timber", "amount": 1250 },
  { "invoiceNo": "INV-1002 ", "supplier": "Hollins Timber", "amount": 88 },
  { "invoiceNo": "INV-1004", "supplier": "Hollins Timber", "amount": 64.25 },
  { "invoiceNo": "Inv-1002", "supplier": "Hollins Timber", "amount": 91 }
]`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `[
  { "invoiceNo": "INV-1001", "count": 2, "rows": [1, 3] },
  { "invoiceNo": "INV-1002", "count": 3, "rows": [2, 5, 7] }
]`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload groupBy $.invoiceNo
`,
  hints: [
    'Clean each number and keep its row first: `payload map (inv, i) -> { key: upper(trim(inv.invoiceNo)), row: i + 1 }`. The index `i` starts at 0, so add 1.',
    'Group the cleaned rows with `groupBy $.key`. Each group is a list of rows that share one number.',
    '`pluck (rows, key) -> { ... }` turns the groups object into a list, with one item per number.',
    'Keep the groups with more than one row, then sort with `orderBy $.invoiceNo`.',
  ],
  solution: `%dw 2.0
output application/json
var rows = payload map (inv, i) -> { key: upper(trim(inv.invoiceNo)), row: i + 1 }
---
((rows groupBy $.key) pluck (group, key) -> {
  invoiceNo: key as String,
  count: sizeOf(group),
  rows: group map $.row
})
  filter ($.count > 1)
  orderBy $.invoiceNo`,
  explanation: `
**Clean before you compare.** \`trim\` removes the spaces around the number and \`upper\` makes the case the same. Without this step, \` inv-1001\` and \`INV-1001\` land in different groups and the duplicate is missed.

**Keep the row number early.** Once the list is grouped, the original position is gone. So the first \`map\` stores \`i + 1\` next to each key. The supplier counts rows from 1, and DataWeave counts from 0.

**Group, then count.** \`groupBy $.key\` gives an object such as \`{ "INV-1001": [ ... ], "INV-1002": [ ... ] }\`. \`pluck\` turns it into a list, and \`sizeOf(group)\` is how many times the number appears.

**Filter and sort last.** Numbers that appear once are dropped with \`filter ($.count > 1)\`. The rows inside a group stay in input order, because \`groupBy\` keeps the order of the list it groups.

**Why not distinctBy?** \`distinctBy\` removes repeats and keeps the first. Here we need the repeats themselves, so grouping and counting fits better.
`,
  tests: [
    {
      name: 'No duplicates',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '[{ "invoiceNo": "INV-2001", "supplier": "Marlow Glass", "amount": 10 }, { "invoiceNo": "INV-2002", "supplier": "Marlow Glass", "amount": 20 }]',
        },
      ],
      expected: '[]',
    },
    {
      name: 'Duplicates out of order are sorted by number',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content:
            '[{ "invoiceNo": "INV-3009", "supplier": "Marlow Glass", "amount": 5 }, { "invoiceNo": "INV-3001", "supplier": "Marlow Glass", "amount": 6 }, { "invoiceNo": "inv-3009", "supplier": "Marlow Glass", "amount": 5 }, { "invoiceNo": "INV-3001", "supplier": "Marlow Glass", "amount": 6 }]',
        },
      ],
      expected: '[{ "invoiceNo": "INV-3001", "count": 2, "rows": [2, 4] }, { "invoiceNo": "INV-3009", "count": 2, "rows": [1, 3] }]',
    },
    {
      name: 'An empty upload',
      inputs: [{ name: 'payload', mime: 'application/json', content: '[]' }],
      expected: '[]',
    },
  ],
  followUps: [
    {
      q: 'Two rows share a number but have different amounts. Is that still a duplicate?',
      a: 'For this rule, yes, because the finance system keys on the invoice number. Row 7 in the sample has a different amount, which is a sign of a typing mistake. You could add the amounts to the output so the supplier sees the difference.',
    },
    {
      q: 'How would you also catch numbers already sent last week?',
      a: 'Keep the numbers you have accepted in a store, such as a database table or an Object Store, and check each new number against it. The upload check only sees one file at a time.',
    },
    {
      q: 'The upload has 200,000 rows. Is groupBy a problem?',
      a: '`groupBy` needs the whole list in memory, so a very large file needs enough heap. For files that size, a database with a unique index on the cleaned number can do the check instead.',
    },
  ],
}
