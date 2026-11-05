export default {
  id: 'dw-082',
  category: 'dataweave',
  title: 'Reconcile a PSP Settlement CSV with the Ledger',
  level: 'ADVANCED',
  tags: ['csv', 'json', 'data-formats', 'reconciliation', 'groupBy', 'multiple-inputs'],
  estMinutes: 35,
  description: `
Each morning the finance team reconciles the payment service provider's settlement file (\`payload\`) with the ledger export (\`ledger\`). Both are CSV files with a header row and around 60,000 lines, and they come from different systems, so their column names and the formatting of values differ. A Mule flow produces the reconciliation report as JSON.

**Columns**
- \`payload\`: \`reference,amount,currency,settledOn\`
- \`ledger\`: \`ref,postedAmount,ccy,account\`

**Matching**
- Rows are matched on the reference, **trimmed and in upper case**. Each reference appears at most once per file.
- Amounts are compared as numbers, so \`120.50\` equals \`120.5\`.
- A difference of up to and including **0.01** is rounding and counts as equal.

**Output**
- \`summary\`: \`settlementRows\`, \`ledgerRows\`, \`matched\`, \`mismatched\`, \`missing\` (the total of both missing lists)
- \`matched\`: \`{ reference, amount, currency }\`, using the settlement values
- \`mismatched\`: \`{ reference, reasons, settlement, ledger }\`, where \`reasons\` holds \`"AMOUNT"\` and/or \`"CURRENCY"\` in that order, and \`settlement\` and \`ledger\` are each \`{ amount, currency }\`
- \`missing\`: \`{ inLedger, inSettlement }\`, two lists of references. \`inLedger\` holds those absent from the ledger, and \`inSettlement\` holds those absent from the settlement file.
- Every list is sorted by reference ascending.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/csv',
      content: `reference,amount,currency,settledOn
pay-1001,120.50,EUR,2026-11-02
PAY-1002,75.00,EUR,2026-11-02
PAY-1003,19.99,USD,2026-11-02
PAY-1004,300.00,EUR,2026-11-02
PAY-1006,42.10,EUR,2026-11-03`,
    },
    {
      name: 'ledger',
      mime: 'application/csv',
      content: `ref,postedAmount,ccy,account
PAY-1004,299.00,EUR,4000
PAY-1001,120.5,EUR,4000
 PAY-1002 ,75.01,EUR,4000
PAY-1003,19.99,EUR,4000
PAY-1005,60.00,EUR,4000`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "summary": { "settlementRows": 5, "ledgerRows": 5, "matched": 2, "mismatched": 2, "missing": 2 },
  "matched": [
    { "reference": "PAY-1001", "amount": 120.50, "currency": "EUR" },
    { "reference": "PAY-1002", "amount": 75.00, "currency": "EUR" }
  ],
  "mismatched": [
    {
      "reference": "PAY-1003",
      "reasons": ["CURRENCY"],
      "settlement": { "amount": 19.99, "currency": "USD" },
      "ledger": { "amount": 19.99, "currency": "EUR" }
    },
    {
      "reference": "PAY-1004",
      "reasons": ["AMOUNT"],
      "settlement": { "amount": 300.00, "currency": "EUR" },
      "ledger": { "amount": 299.00, "currency": "EUR" }
    }
  ],
  "missing": { "inLedger": ["PAY-1006"], "inSettlement": ["PAY-1005"] }
}`,
  },
  starterCode: `%dw 2.0
output application/json
---
{
  matched: [],
  mismatched: [],
  missing: { inLedger: [], inSettlement: [] }
}
`,
  hints: [
    'Normalise first. Map both files to the same shape, `{ reference, amount, currency }`, with `upper(trim(...))` for the reference and `as Number` for the amount. Everything after that is simpler.',
    'For a lookup by reference, use `groupBy`: `var ledgerByRef = rows groupBy ((r) -> r.reference)`. Then `ledgerByRef[ref]` is an array of one row, or `null` when there is no such reference.',
    'Build the `reasons` list by concatenation: `(if (...) ["AMOUNT"] else []) ++ (if (...) ["CURRENCY"] else [])`. An empty list means the row is matched.',
    'Use `abs(a - b) > 0.01` for the amount check. Numbers read from text are exact decimals in DataWeave, so `75.01 - 75.00` is exactly `0.01`.',
  ],
  solution: `%dw 2.0
output application/json

var tolerance = 0.01

var settlement = (payload map ((r) -> {
  reference: upper(trim(r.reference)),
  amount: r.amount as Number,
  currency: r.currency
})) orderBy ((r) -> r.reference)

var posted = (ledger map ((r) -> {
  reference: upper(trim(r.ref)),
  amount: r.postedAmount as Number,
  currency: r.ccy
})) orderBy ((r) -> r.reference)

var settlementByRef = settlement groupBy ((r) -> r.reference)
var ledgerByRef = posted groupBy ((r) -> r.reference)

fun reasonsFor(s, l) =
  (if (abs(s.amount - l.amount) > tolerance) ["AMOUNT"] else [])
  ++ (if (s.currency != l.currency) ["CURRENCY"] else [])

var compared = (settlement filter ((s) -> ledgerByRef[s.reference] != null)) map ((s) -> do {
  var l = ledgerByRef[s.reference][0]
  ---
  { s: s, l: l, reasons: reasonsFor(s, l) }
})

var matched = compared filter ((c) -> isEmpty(c.reasons))
var mismatched = compared filter ((c) -> not isEmpty(c.reasons))
var notInLedger = (settlement filter ((s) -> ledgerByRef[s.reference] == null)) map ((s) -> s.reference)
var notInSettlement = (posted filter ((l) -> settlementByRef[l.reference] == null)) map ((l) -> l.reference)
---
{
  summary: {
    settlementRows: sizeOf(settlement),
    ledgerRows: sizeOf(posted),
    matched: sizeOf(matched),
    mismatched: sizeOf(mismatched),
    missing: sizeOf(notInLedger) + sizeOf(notInSettlement)
  },
  matched: matched map ((c) -> c.s),
  mismatched: mismatched map ((c) -> {
    reference: c.s.reference,
    reasons: c.reasons,
    settlement: { amount: c.s.amount, currency: c.s.currency },
    ledger: { amount: c.l.amount, currency: c.l.currency }
  }),
  missing: { inLedger: notInLedger, inSettlement: notInSettlement }
}`,
  explanation: `
**Normalise once.** The two files disagree on column names, case, spaces and number format. Mapping both to one shape at the top removes those differences from every later step. Sorting at this stage too means all four result lists come out in order without further work.

**Index, then look up.** Filtering the ledger for each settlement row compares every row with every other row, which at 60,000 lines per file is billions of comparisons. \`groupBy\` builds a keyed object once, and each lookup after that is direct.

**One comparison, two lists.** \`compared\` holds every pair found in both files, and the length of \`reasons\` decides which list a pair goes to. A row can never land in both lists, and a new check only needs one more line in \`reasonsFor\`.

**Tolerance.** The rule says *up to and including* 0.01, so the test is \`> tolerance\`. \`PAY-1002\` differs by exactly 0.01 and is matched. The comparison is reliable because DataWeave numbers keep their decimal value exactly here, with no binary floating point noise.

**Missing is directional.** A payment settled but not booked and a booking with no settlement have different causes and owners, so they stay in separate lists.
`,
  tests: [
    {
      name: 'Both reasons and a difference just over the tolerance',
      inputs: [
        {
          name: 'payload',
          mime: 'application/csv',
          content: `reference,amount,currency,settledOn
PAY-2002,10.00,GBP,2026-11-04
PAY-2001,50.00,EUR,2026-11-04
PAY-2003,8.00,EUR,2026-11-04`,
        },
        {
          name: 'ledger',
          mime: 'application/csv',
          content: `ref,postedAmount,ccy,account
pay-2001,50.011,EUR,4000
PAY-2002,12.00,EUR,4100
PAY-2003,7.99,EUR,4100`,
        },
      ],
      expected:
        '{ "summary": { "settlementRows": 3, "ledgerRows": 3, "matched": 1, "mismatched": 2, "missing": 0 }, "matched": [ { "reference": "PAY-2003", "amount": 8.00, "currency": "EUR" } ], "mismatched": [ { "reference": "PAY-2001", "reasons": ["AMOUNT"], "settlement": { "amount": 50.00, "currency": "EUR" }, "ledger": { "amount": 50.011, "currency": "EUR" } }, { "reference": "PAY-2002", "reasons": ["AMOUNT", "CURRENCY"], "settlement": { "amount": 10.00, "currency": "GBP" }, "ledger": { "amount": 12.00, "currency": "EUR" } } ], "missing": { "inLedger": [], "inSettlement": [] } }',
    },
    {
      name: 'Ledger export holds only its header',
      inputs: [
        {
          name: 'payload',
          mime: 'application/csv',
          content: `reference,amount,currency,settledOn
PAY-3002,1.00,EUR,2026-11-04
PAY-3001,2.00,EUR,2026-11-04`,
        },
        { name: 'ledger', mime: 'application/csv', content: 'ref,postedAmount,ccy,account\n' },
      ],
      expected:
        '{ "summary": { "settlementRows": 2, "ledgerRows": 0, "matched": 0, "mismatched": 0, "missing": 2 }, "matched": [], "mismatched": [], "missing": { "inLedger": ["PAY-3001", "PAY-3002"], "inSettlement": [] } }',
    },
  ],
  followUps: [
    {
      q: 'A row is in inLedger today, but the booking arrives tomorrow. How do you stop finance chasing timing differences?',
      a: 'Keep unmatched items in a store with their first seen date and retry them in the next run. Report an item only after it stays open past an agreed cut-off, for example two business days. The settledOn date is the natural input for that rule.',
    },
    {
      q: 'The specification says a reference appears at most once per file. What does this solution do if that stops being true?',
      a: 'It compares each settlement row with the first ledger row found and ignores later ones, so a duplicate booking goes unnoticed. Add a check that lists references where the group holds more than one row, before matching.',
    },
  ],
}
