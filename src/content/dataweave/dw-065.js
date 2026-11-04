export default {
  id: 'dw-065',
  category: 'dataweave',
  title: 'Pick the Active Store Price per SKU for a Business Date',
  level: 'ADVANCED',
  tags: ['retail', 'pricing', 'dates', 'reduce', 'effective-dating', 'vars', 'json'],
  estMinutes: 35,
  description: `
Head office maintains prices as **effective-dated records**. Every night a Mule flow builds the price file for each store for the next business day and publishes it to the store's ActiveMQ queue. Write the transformation that resolves the price records into one price per SKU per store.

\`payload\` is the list of price records: \`sku\`, \`store\` (a store id, or \`"*"\` for chain-wide), \`priceType\` (\`REGULAR\` or \`PROMO\`), \`price\`, \`effectiveFrom\` and \`effectiveTo\` (\`yyyy-MM-dd\`, both **inclusive**; \`effectiveTo\` may be \`null\` = open-ended).

\`vars\` holds \`businessDate\` and \`stores\` (the stores to build files for).

**Rules**
- A record is **active** when \`effectiveFrom <= businessDate\` and (\`effectiveTo\` is null or \`businessDate <= effectiveTo\`).
- A record applies to a store when its \`store\` is that store or \`"*"\`. Records for other stores are ignored.
- When several active records apply to the same store and SKU, choose by, in this order:
  1. \`PROMO\` beats \`REGULAR\`;
  2. a store-specific record beats a chain-wide one;
  3. the later \`effectiveFrom\` wins;
  4. the lower price wins.
- The SKU universe is every SKU that appears anywhere in \`payload\`.
- Output one object per store, **in the order of \`vars.stores\`**:
  - \`store\`
  - \`prices\` — sorted by \`sku\`: \`sku\`, \`price\`, \`priceType\`, \`source\` (\`STORE\` or \`CHAIN\`), \`effectiveFrom\`
  - \`noPrice\` — the SKUs (sorted) without any applicable active record, \`[]\` if none
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `[
  { "sku": "4011",  "store": "*",    "priceType": "REGULAR", "price": 1.29,  "effectiveFrom": "2025-01-01", "effectiveTo": null },
  { "sku": "4011",  "store": "*",    "priceType": "REGULAR", "price": 1.35,  "effectiveFrom": "2025-11-10", "effectiveTo": null },
  { "sku": "4011",  "store": "S022", "priceType": "REGULAR", "price": 1.25,  "effectiveFrom": "2025-06-01", "effectiveTo": null },
  { "sku": "4011",  "store": "*",    "priceType": "PROMO",   "price": 0.99,  "effectiveFrom": "2025-11-15", "effectiveTo": "2025-11-21" },
  { "sku": "70012", "store": "*",    "priceType": "REGULAR", "price": 4.49,  "effectiveFrom": "2025-03-01", "effectiveTo": null },
  { "sku": "70012", "store": "S014", "priceType": "PROMO",   "price": 3.99,  "effectiveFrom": "2025-11-08", "effectiveTo": "2025-11-14" },
  { "sku": "70012", "store": "*",    "priceType": "PROMO",   "price": 4.19,  "effectiveFrom": "2025-11-01", "effectiveTo": "2025-11-30" },
  { "sku": "88001", "store": "S014", "priceType": "REGULAR", "price": 15.00, "effectiveFrom": "2025-12-01", "effectiveTo": null },
  { "sku": "88001", "store": "S099", "priceType": "REGULAR", "price": 14.00, "effectiveFrom": "2025-01-01", "effectiveTo": null }
]`,
    },
    {
      name: 'vars',
      mime: 'application/json',
      content: `{ "businessDate": "2025-11-14", "stores": ["S014", "S022"] }`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `[
  {
    "store": "S014",
    "prices": [
      { "sku": "4011", "price": 1.35, "priceType": "REGULAR", "source": "CHAIN", "effectiveFrom": "2025-11-10" },
      { "sku": "70012", "price": 3.99, "priceType": "PROMO", "source": "STORE", "effectiveFrom": "2025-11-08" }
    ],
    "noPrice": ["88001"]
  },
  {
    "store": "S022",
    "prices": [
      { "sku": "4011", "price": 1.25, "priceType": "REGULAR", "source": "STORE", "effectiveFrom": "2025-06-01" },
      { "sku": "70012", "price": 4.19, "priceType": "PROMO", "source": "CHAIN", "effectiveFrom": "2025-11-01" }
    ],
    "noPrice": ["88001"]
  }
]`,
  },
  starterCode: `%dw 2.0
output application/json
var day = vars.businessDate as Date
---
payload
`,
  hints: [
    'Convert the strings with `as Date` before comparing; check `effectiveTo == null` **before** converting it.',
    'Write `better(a, b, store)` that returns the winner of two records by applying the four rules in order — each rule only decides when the two records differ on it.',
    '`candidates reduce (c, acc) -> better(c, acc, store)` without an initial value starts with the first candidate and returns `null` for an empty list.',
    '`(list filter ...).sku` is `null` when nothing matches — add `default []` for `noPrice`.',
    'Careful with `distinctBy $ orderBy $`: the second lambda swallows the rest. Parenthesise.',
  ],
  solution: `%dw 2.0
output application/json
var day = vars.businessDate as Date
var active = payload filter (p) ->
  ((p.effectiveFrom as Date) <= day) and (p.effectiveTo == null or day <= (p.effectiveTo as Date))
var skus = ((payload.sku default []) distinctBy $) orderBy $
fun better(a, b, store) =
  if (a.priceType != b.priceType)
    (if (a.priceType == "PROMO") a else b)
  else if ((a.store == store) != (b.store == store))
    (if (a.store == store) a else b)
  else if (a.effectiveFrom != b.effectiveFrom)
    (if ((a.effectiveFrom as Date) > (b.effectiveFrom as Date)) a else b)
  else if (b.price < a.price) b
  else a
---
vars.stores map (store) -> do {
  var picks = skus map (sku) -> {
    sku: sku,
    best: (active filter ($.sku == sku and ($.store == store or $.store == "*")))
      reduce (c, acc) -> better(c, acc, store)
  }
  ---
  {
    store: store,
    prices: (picks filter ($.best != null)) map (x) -> {
      sku: x.sku,
      price: x.best.price,
      priceType: x.best.priceType,
      source: if (x.best.store == "*") "CHAIN" else "STORE",
      effectiveFrom: x.best.effectiveFrom
    },
    noPrice: (picks filter ($.best == null)).sku default []
  }
}`,
  explanation: `
**Effective dating.** "Active on a date" is an interval test with an open end. Two classic bugs: comparing the date **strings** in a format that does not sort (\`dd/MM/yyyy\`), and forgetting that \`effectiveTo\` is **inclusive** — S014's promo for 70012 ends on 2025-11-14 and is still the price on that day.

**A comparator instead of sorting.** Multi-key priority rules are easiest to get right as a function that compares two candidates: each rule only decides when the candidates differ on it, otherwise it falls through to the next. \`reduce\` then keeps the winner of the whole list. Sorting with several \`orderBy\` passes is fragile (it relies on sort stability and on reversing the order of the keys).

\`reduce\` without an initial accumulator uses the first element as the starting value — and on an empty list returns \`null\`, which is exactly the "no price" signal.

**Why the rule order matters.** For S022 and SKU 4011 there is a newer chain-wide price (1.35, from 11-10), but the older store-specific price (1.25) wins because rule 2 comes before rule 3. That is the usual retail convention: a store override stays until someone removes it. The chain-wide promo for 4011 starts tomorrow, so it is not active yet.

**Output details.** \`vars.stores map ...\` keeps the requested store order. The empty-selector trap: \`(picks filter ...).sku\` on an empty array is \`null\`, so \`noPrice\` needs \`default []\`. Records of store S099 never match any requested store, but their SKU still belongs to the SKU universe — hence 88001 in \`noPrice\`.
`,
  tests: [
    {
      name: 'Next day: store promo expired, chain promo starts',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content:
            '[ { "sku": "4011", "store": "*", "priceType": "REGULAR", "price": 1.35, "effectiveFrom": "2025-11-10", "effectiveTo": null }, { "sku": "4011", "store": "S022", "priceType": "REGULAR", "price": 1.25, "effectiveFrom": "2025-06-01", "effectiveTo": null }, { "sku": "4011", "store": "*", "priceType": "PROMO", "price": 0.99, "effectiveFrom": "2025-11-15", "effectiveTo": "2025-11-21" }, { "sku": "70012", "store": "S014", "priceType": "PROMO", "price": 3.99, "effectiveFrom": "2025-11-08", "effectiveTo": "2025-11-14" }, { "sku": "70012", "store": "*", "priceType": "PROMO", "price": 4.19, "effectiveFrom": "2025-11-01", "effectiveTo": "2025-11-30" } ]',
        },
        { name: 'vars', mime: 'application/json', content: '{ "businessDate": "2025-11-15", "stores": ["S022", "S014"] }' },
      ],
      expected:
        '[ { "store": "S022", "prices": [ { "sku": "4011", "price": 0.99, "priceType": "PROMO", "source": "CHAIN", "effectiveFrom": "2025-11-15" }, { "sku": "70012", "price": 4.19, "priceType": "PROMO", "source": "CHAIN", "effectiveFrom": "2025-11-01" } ], "noPrice": [] }, { "store": "S014", "prices": [ { "sku": "4011", "price": 0.99, "priceType": "PROMO", "source": "CHAIN", "effectiveFrom": "2025-11-15" }, { "sku": "70012", "price": 4.19, "priceType": "PROMO", "source": "CHAIN", "effectiveFrom": "2025-11-01" } ], "noPrice": [] } ]',
    },
    {
      name: 'Same priority and start date: lower price wins',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content:
            '[ { "sku": "501", "store": "S001", "priceType": "REGULAR", "price": 2.49, "effectiveFrom": "2025-10-01", "effectiveTo": null }, { "sku": "501", "store": "S001", "priceType": "REGULAR", "price": 2.29, "effectiveFrom": "2025-10-01", "effectiveTo": null }, { "sku": "501", "store": "*", "priceType": "REGULAR", "price": 1.99, "effectiveFrom": "2025-10-05", "effectiveTo": null } ]',
        },
        { name: 'vars', mime: 'application/json', content: '{ "businessDate": "2025-10-10", "stores": ["S001"] }' },
      ],
      expected:
        '[ { "store": "S001", "prices": [ { "sku": "501", "price": 2.29, "priceType": "REGULAR", "source": "STORE", "effectiveFrom": "2025-10-01" } ], "noPrice": [] } ]',
    },
  ],
  followUps: [
    {
      q: 'The price records live in an Oracle table. Would you resolve the price in SQL or in DataWeave?',
      a: 'For large catalogues, in SQL: filter active rows with `WHERE effective_from <= :businessDate AND (effective_to IS NULL OR effective_to >= :businessDate)` (parameterised in `db:select`) and rank with `ROW_NUMBER() OVER (PARTITION BY store, sku ORDER BY ...)`. DataWeave is fine for the per-store shaping once the candidate set is small.',
    },
    {
      q: 'Each store has its own ActiveMQ queue. How do you publish the per-store files?',
      a: 'Iterate over the result with For Each and use `jms:publish` with a dynamic destination such as `#["prices." ++ payload.store]`, setting a JMS property like `businessDate` so the store system can discard stale files. Making messages persistent ensures they survive a broker restart while a store is offline.',
    },
    {
      q: 'Why not send only the price changes instead of the full price file?',
      a: 'Deltas are smaller, but a store that missed one message is wrong until the next full refresh. Many retailers send deltas intraday and a full file nightly (or weekly) as a reconciliation baseline.',
    },
    {
      q: 'How do you handle overlapping REGULAR records that were entered by mistake?',
      a: 'The tie-break rules make the output deterministic, but the overlap itself should be reported. Add a validation pass that groups active records by store/SKU/type and flags groups with more than one record, and send that list to the pricing team.',
    },
  ],
}
