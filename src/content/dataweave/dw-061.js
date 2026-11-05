export default {
  id: 'dw-061',
  category: 'dataweave',
  title: 'Gift Card Balances from a Transaction Ledger',
  level: 'INTERMEDIATE',
  tags: ['retail', 'gift-card', 'groupBy', 'filter', 'strings-module', 'json'],
  estMinutes: 15,
  description: `
The gift-card processor sends a nightly extract of card transactions from all stores and the web shop. Customer service wants one line per card with its current balance.

Each transaction has \`txnId\`, \`card\` (16-digit card number as a string), \`type\`, \`amount\` (always positive), \`status\` and \`date\` (\`yyyy-MM-dd\`).

**Rules**
- Only transactions with status \`APPROVED\` count. Declined attempts are ignored completely.
- \`ACTIVATE\`, \`RELOAD\` and \`REFUND\` (money returned to the card) **add** the amount; \`REDEEM\` **subtracts** it.
- One object per card that has at least one approved transaction, **sorted by card number ascending**:
  - \`card\` — masked: every digit except the last four replaced by \`*\`
  - \`balance\`
  - \`txnCount\` — number of approved transactions
  - \`lastActivity\` — the latest approved transaction date
  - \`status\` — \`DEPLETED\` when the balance is \`0\`, otherwise \`ACTIVE\`

No approved transactions → \`[]\`.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `[
  { "txnId": "T1", "card": "6006491234560002", "type": "ACTIVATE", "amount": 25.00, "status": "APPROVED", "date": "2025-11-02" },
  { "txnId": "T2", "card": "6006491234560001", "type": "ACTIVATE", "amount": 50.00, "status": "APPROVED", "date": "2025-11-01" },
  { "txnId": "T3", "card": "6006491234560001", "type": "REDEEM", "amount": 18.40, "status": "APPROVED", "date": "2025-11-03" },
  { "txnId": "T4", "card": "6006491234560001", "type": "REDEEM", "amount": 40.00, "status": "DECLINED", "date": "2025-11-07" },
  { "txnId": "T5", "card": "6006491234560002", "type": "RELOAD", "amount": 20.00, "status": "APPROVED", "date": "2025-11-04" },
  { "txnId": "T6", "card": "6006491234560001", "type": "REFUND", "amount": 5.25, "status": "APPROVED", "date": "2025-11-06" },
  { "txnId": "T7", "card": "6006491234560002", "type": "REDEEM", "amount": 45.00, "status": "APPROVED", "date": "2025-11-05" }
]`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `[
  { "card": "************0001", "balance": 36.85, "txnCount": 3, "lastActivity": "2025-11-06", "status": "ACTIVE" },
  { "card": "************0002", "balance": 0, "txnCount": 3, "lastActivity": "2025-11-05", "status": "DEPLETED" }
]`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload
`,
  hints: [
    'Filter on `status` first, then `groupBy $.card` and `pluck` the groups back into an array.',
    'Turn each transaction into a signed amount (`if ($.type == "REDEEM") -$.amount else $.amount`) and `sum` them.',
    '`repeat("*", n)` from `dw::core::Strings` builds the mask; `card[-4 to -1]` takes the last four characters.',
    'Sort by the **real** card number before you mask it — or the `orderBy` has nothing meaningful left to sort on.',
  ],
  solution: `%dw 2.0
import repeat from dw::core::Strings
output application/json
var approved = payload filter ($.status == "APPROVED")
fun signed(t) = if (t."type" == "REDEEM") -t.amount else t.amount
---
((approved groupBy $.card) orderBy $$) pluck (txns, cardKey) -> do {
  var card = cardKey as String
  var balance = sum(txns map signed($))
  ---
  {
    card: repeat("*", sizeOf(card) - 4) ++ card[-4 to -1],
    balance: balance,
    txnCount: sizeOf(txns),
    lastActivity: max(txns.date),
    status: if (balance == 0) "DEPLETED" else "ACTIVE"
  }
}`,
  explanation: `
**Filter first.** Removing declined transactions before grouping means a card that only has declined attempts never forms a group, so it disappears from the output without any extra rule.

**Sorting an object.** \`groupBy\` returns an object keyed by card number. \`orderBy $$\` sorts an object by its keys, and \`pluck\` then turns the sorted entries into an array. Masking happens last, so the sort still uses the real number. The parentheses matter: without them, \`orderBy $$ pluck ...\` would make the whole \`pluck\` part of the \`orderBy\` lambda.

**Balance.** \`sum\` of signed amounts. DataWeave decimals keep \`25.00 + 20.00 - 45.00\` exactly zero, so \`balance == 0\` is a safe test (in floating point you would compare against a tolerance).

**Latest date.** \`yyyy-MM-dd\` strings sort the same way as the dates they represent, so \`max\` on the strings is correct. For other formats (\`dd/MM/yyyy\`) you would have to convert to \`Date\` first.

**Masking.** \`repeat("*", sizeOf(card) - 4)\` works for any card length. Never log or return full gift-card numbers: they are bearer instruments, like cash.
`,
  tests: [
    {
      name: 'No approved transactions',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content:
            '[ { "txnId": "X1", "card": "6006490000009999", "type": "ACTIVATE", "amount": 10, "status": "DECLINED", "date": "2025-11-01" } ]',
        },
      ],
      expected: '[]',
    },
    {
      name: 'Declined-only card is skipped',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content:
            '[ { "txnId": "Y1", "card": "6006490000000500", "type": "REDEEM", "amount": 5, "status": "DECLINED", "date": "2025-11-09" }, { "txnId": "Y2", "card": "6006490000000400", "type": "ACTIVATE", "amount": 100, "status": "APPROVED", "date": "2025-10-30" }, { "txnId": "Y3", "card": "6006490000000400", "type": "REDEEM", "amount": 12.5, "status": "APPROVED", "date": "2025-10-31" } ]',
        },
      ],
      expected:
        '[ { "card": "************0400", "balance": 87.5, "txnCount": 2, "lastActivity": "2025-10-31", "status": "ACTIVE" } ]',
    },
  ],
  followUps: [
    {
      q: 'The extract has millions of rows. What breaks with this script?',
      a: '`groupBy` and `orderBy` must hold the whole payload in memory. For very large extracts, load the rows into a database table (bulk insert) and let SQL do `GROUP BY card`, or have the processor send balances instead of transactions.',
    },
    {
      q: 'A REDEEM is approved but would make the balance negative. Should the integration fix it?',
      a: 'No — the integration should report it, not hide it. Output the negative balance and flag the card (e.g. status `NEGATIVE`) so finance can investigate; silently clamping to zero would make the ledger disagree with the processor.',
    },
    {
      q: 'Why not mask the card with a regex instead of repeat?',
      a: 'Both work: `card replace /.(?=.{4})/ with "*"` masks every character that has at least four characters after it. `repeat` plus a slice is easier to read; the regex version is handy when the mask must be applied inside a longer text.',
    },
  ],
}
