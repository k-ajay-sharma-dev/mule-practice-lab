export default {
  id: 'dw-180',
  category: 'dataweave',
  title: 'Build Bulk Insert Rows for a SQL Server Sales Staging Table',
  level: 'BEGINNER',
  tags: ['myproject', 'sql-server', 'planning-platform', 'bulk-insert', 'staging', 'sales-feed', 'json'],
  estMinutes: 15,
  description: `
Larkfield Grocers stores send daily sales to a Mule API. Before the nightly extract for the planning platform, Mule writes each store's sales into a SQL Server staging table with the Database bulk insert operation. The operation needs a list of objects, one per row, whose keys match the named parameters of the INSERT:

\`\`\`sql
INSERT INTO dbo.StoreSalesStage
  (RunId, StoreId, BusinessDate, Sku, Units, NetAmount, IsReturn, PromoCode)
VALUES
  (:RunId, :StoreId, :BusinessDate, :Sku, :Units, :NetAmount, :IsReturn, :PromoCode)
\`\`\`

Build one row per sales line:

- \`RunId\`: from \`vars.runId\`
- \`StoreId\`: the store code without spaces around it
- \`BusinessDate\`: the business date, given as \`yyyyMMdd\`, written as \`yyyy-MM-dd\`
- \`Sku\`: in upper case, without spaces around it
- \`Units\` and \`NetAmount\`: as given, but negative for a return
- \`IsReturn\`: \`1\` when \`returned\` is \`"Y"\`, otherwise \`0\`, for a BIT column
- \`PromoCode\`: the code, or \`null\` when it is missing or blank
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{
  "store": " 0412 ",
  "businessDate": "20261118",
  "lines": [
    { "sku": "milk-2l-semi", "units": 6, "netAmount": 8.34, "returned": "N", "promo": null },
    { "sku": " BREAD-WHT-800 ", "units": 2, "netAmount": 2.9, "returned": "N", "promo": "BAKERY2" },
    { "sku": "EGGS-12-FR", "units": 1, "netAmount": 3.15, "returned": "Y", "promo": "  " }
  ]
}`,
    },
    {
      name: 'vars',
      mime: 'application/json',
      content: `{ "runId": "R-20261118-0412" }`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `[
  { "RunId": "R-20261118-0412", "StoreId": "0412", "BusinessDate": "2026-11-18", "Sku": "MILK-2L-SEMI", "Units": 6, "NetAmount": 8.34, "IsReturn": 0, "PromoCode": null },
  { "RunId": "R-20261118-0412", "StoreId": "0412", "BusinessDate": "2026-11-18", "Sku": "BREAD-WHT-800", "Units": 2, "NetAmount": 2.9, "IsReturn": 0, "PromoCode": "BAKERY2" },
  { "RunId": "R-20261118-0412", "StoreId": "0412", "BusinessDate": "2026-11-18", "Sku": "EGGS-12-FR", "Units": -1, "NetAmount": -3.15, "IsReturn": 1, "PromoCode": null }
]`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload.lines map (l) -> {
  StoreId: payload.store,
  Sku: l.sku
}
`,
  hints: [
    'Work out the values that are the same for every line once, in `var`s above the body.',
    'Convert the date with `as Date {format: "yyyyMMdd"} as String {format: "yyyy-MM-dd"}`.',
    'Use a sign: `var sign = if (l.returned == "Y") (-1) else 1`, then `l.units * sign`.',
    'For the promo code, `trim(l.promo default "")` is empty when the code is missing or blank.',
  ],
  solution: `%dw 2.0
output application/json

var storeId = trim(payload.store)
var businessDate = payload.businessDate as Date {format: "yyyyMMdd"} as String {format: "yyyy-MM-dd"}
---
payload.lines map (l) -> do {
  var isReturn = l.returned == "Y"
  var sign = if (isReturn) (-1) else 1
  var promo = trim(l.promo default "")
  ---
  {
    RunId: vars.runId,
    StoreId: storeId,
    BusinessDate: businessDate,
    Sku: upper(trim(l.sku)),
    Units: l.units * sign,
    NetAmount: l.netAmount * sign,
    IsReturn: if (isReturn) 1 else 0,
    PromoCode: if (promo == "") null else promo
  }
}`,
  explanation: `
**Keys match the parameters.** The bulk insert operation binds each object's keys to the named parameters in the SQL. A key spelled differently leaves a parameter without a value, so the names follow the SQL exactly.

**Work once.** The store id and date are the same for every line, so they are computed once outside the \`map\`.

**Clean values.** Codes are trimmed and the sku is upper cased, so the staging table holds one spelling per item. The date is written as ISO text, which the driver and SQL Server read as a date.

**Returns.** A return is stored as negative units and amount, plus a flag. Sums over the table then give net sales, and the flag still tells returns apart.

**Null, not blank.** A blank promo code would be stored as an empty string. Writing \`null\` keeps "no promo" in one form, which matters for joins and counts later.
`,
  tests: [
    {
      name: 'No lines',
      inputs: [
        { name: 'payload', mime: 'application/json', content: '{ "store": "0415", "businessDate": "20261118", "lines": [] }' },
        { name: 'vars', mime: 'application/json', content: '{ "runId": "R-20261118-0415" }' },
      ],
      expected: '[]',
    },
    {
      name: 'Promo key missing',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '{ "store": "0419", "businessDate": "20261117", "lines": [{ "sku": "apple-gala-1kg", "units": 3, "netAmount": 5.25, "returned": "N" }] }',
        },
        { name: 'vars', mime: 'application/json', content: '{ "runId": "R-20261117-0419" }' },
      ],
      expected:
        '[{ "RunId": "R-20261117-0419", "StoreId": "0419", "BusinessDate": "2026-11-17", "Sku": "APPLE-GALA-1KG", "Units": 3, "NetAmount": 5.25, "IsReturn": 0, "PromoCode": null }]',
    },
  ],
  followUps: [
    {
      q: 'Why stage the rows instead of writing straight to the sales table?',
      a: 'Staging with a run id lets you check counts and totals, rerun a failed run by deleting its rows, and move good rows on in one set based step.',
    },
    {
      q: 'Would you send NetAmount as a number or a string?',
      a: 'As a number, bound to a DECIMAL column. Check the column scale, for example DECIMAL(12,2), so values are not rounded in a way you did not expect.',
    },
    {
      q: 'The store sends 200,000 lines. What changes?',
      a: 'Split the rows into blocks, for example with a batch aggregator, so each bulk insert sends a few thousand rows and a failure affects only one block.',
    },
  ],
}
