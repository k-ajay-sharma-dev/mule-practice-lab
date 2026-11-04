export default {
  id: 'dw-018',
  category: 'dataweave',
  title: 'Running Balance Ledger with reduce',
  level: 'ADVANCED',
  tags: ['reduce', 'orderBy', 'accumulator', 'json'],
  estMinutes: 25,
  description: `
The core-banking API returns an account's transactions in no particular order. The statement service needs a ledger with a running balance.

Input: \`{ "account", "openingBalance", "transactions": [ { "id", "postedAt", "type", "amount" } ] }\`. \`postedAt\` values are UTC timestamps, all in the same \`yyyy-MM-ddTHH:mm:ssZ\` format. \`type\` is \`CREDIT\` or \`DEBIT\`; \`amount\` is always positive.

**Rules**
1. Process transactions by \`postedAt\` ascending; when two have the same \`postedAt\`, the one with the smaller \`id\` (string comparison) goes first.
2. \`change\` is \`+amount\` for a \`CREDIT\` and \`-amount\` for a \`DEBIT\`.
3. Each entry's \`balance\` is the balance **after** applying that transaction.

Output:

- \`account\`, \`openingBalance\` — copied as-is
- \`entries\` — \`{ "id", "postedAt", "change", "balance" }\` in processing order
- \`closingBalance\` — balance after the last transaction (the opening balance if there are none)
- \`lowestBalance\` — the minimum of the opening balance and every running balance
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{
  "account": "NL01-BANK-0042",
  "openingBalance": 100,
  "transactions": [
    { "id": "T3", "postedAt": "2026-05-02T09:00:00Z", "type": "DEBIT", "amount": 150 },
    { "id": "T1", "postedAt": "2026-05-01T08:30:00Z", "type": "CREDIT", "amount": 50 },
    { "id": "T4", "postedAt": "2026-05-02T09:00:00Z", "type": "CREDIT", "amount": 20 },
    { "id": "T2", "postedAt": "2026-05-03T12:00:00Z", "type": "CREDIT", "amount": 30.25 }
  ]
}`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "account": "NL01-BANK-0042",
  "openingBalance": 100,
  "entries": [
    { "id": "T1", "postedAt": "2026-05-01T08:30:00Z", "change": 50, "balance": 150 },
    { "id": "T3", "postedAt": "2026-05-02T09:00:00Z", "change": -150, "balance": 0 },
    { "id": "T4", "postedAt": "2026-05-02T09:00:00Z", "change": 20, "balance": 20 },
    { "id": "T2", "postedAt": "2026-05-03T12:00:00Z", "change": 30.25, "balance": 50.25 }
  ],
  "closingBalance": 50.25,
  "lowestBalance": 0
}`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload
`,
  hints: [
    'Sort first. Because every timestamp has the same fixed-width format, `postedAt ++ "|" ++ id` is a single string key that sorts by time, then by id.',
    '`reduce ((t, acc = { ... }) -> ...)` can carry several values at once: put `balance`, `lowest` and `entries` in the accumulator object.',
    'Append to an array with `acc.entries << newEntry` (or `++ [newEntry]`). Read `closingBalance` and `lowestBalance` from the final accumulator.',
  ],
  solution: `%dw 2.0
output application/json
var opening = payload.openingBalance
var sorted = (payload.transactions default []) orderBy ((t) -> t.postedAt ++ "|" ++ t.id)
var ledger = sorted reduce ((t, acc = { balance: opening, lowest: opening, entries: [] }) -> do {
  var change = if (t."type" == "CREDIT") t.amount else -t.amount
  var balance = acc.balance + change
  ---
  {
    balance: balance,
    lowest: min([acc.lowest, balance]),
    entries: acc.entries << { id: t.id, postedAt: t.postedAt, change: change, balance: balance }
  }
})
---
{
  account: payload.account,
  openingBalance: opening,
  entries: ledger.entries,
  closingBalance: ledger.balance,
  lowestBalance: ledger.lowest
}`,
  explanation: `
\`reduce\` is DataWeave's tool for anything that depends on the **previous** item — here, the running balance. Using an object as the accumulator lets one pass compute three things (balance, minimum, entries) without re-scanning the array.

The composite sort key works only because the timestamps are fixed-width ISO strings; for mixed formats you would parse them to \`DateTime\` first.

**Common traps**
- Forgetting the initial value: \`reduce ((t, acc) -> ...)\` starts with the **first item** as the accumulator, which breaks when the accumulator has a different shape than the items.
- Not sorting: the running balance is meaningless in input order.
- Starting \`lowest\` from the first running balance instead of the opening balance.
`,
  tests: [
    {
      name: 'No transactions',
      inputs: [
        { name: 'payload', mime: 'application/json', content: '{ "account": "A-1", "openingBalance": 12.5, "transactions": [] }' },
      ],
      expected: '{ "account": "A-1", "openingBalance": 12.5, "entries": [], "closingBalance": 12.5, "lowestBalance": 12.5 }',
    },
    {
      name: 'Goes negative then recovers',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content:
            '{ "account": "A-2", "openingBalance": 0, "transactions": [{ "id": "B", "postedAt": "2026-01-01T10:00:00Z", "type": "CREDIT", "amount": 100 }, { "id": "A", "postedAt": "2026-01-01T10:00:00Z", "type": "DEBIT", "amount": 40 }] }',
        },
      ],
      expected:
        '{ "account": "A-2", "openingBalance": 0, "entries": [{ "id": "A", "postedAt": "2026-01-01T10:00:00Z", "change": -40, "balance": -40 }, { "id": "B", "postedAt": "2026-01-01T10:00:00Z", "change": 100, "balance": 60 }], "closingBalance": 60, "lowestBalance": -40 }',
    },
  ],
  followUps: [
    {
      q: 'What does `reduce` return for an empty array?',
      a: 'With an initial accumulator value it returns that value unchanged, which is why the "no transactions" case needs no special handling. Without an initial value it returns `null`.',
    },
    {
      q: 'Is `<<` inside reduce a performance concern for very large arrays?',
      a: 'Each append builds a new immutable array, so very large reductions can get slow. For a pure running total you can instead `map` with an index and compute prefix sums, or stream the data in batches.',
    },
  ],
}
