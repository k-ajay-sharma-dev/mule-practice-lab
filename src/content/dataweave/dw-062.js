export default {
  id: 'dw-062',
  category: 'dataweave',
  title: 'End-of-Day Store Sales from a POS Transaction Log XML',
  level: 'INTERMEDIATE',
  tags: ['retail', 'pos', 'xml', 'attributes', 'groupBy', 'flatMap', 'json'],
  estMinutes: 25,
  description: `
After closing, each store's back-office server drops its POS transaction log on SFTP. A Mule flow picks the files up and must post an **end-of-day sales summary** per store to the ERP.

The log is XML. Every \`Transaction\` has the attributes \`store\`, \`register\`, \`seq\`, \`kind\` and optionally \`cancelled="true"\`. Lines are \`Line\` elements with the attributes \`dept\`, \`sku\`, \`qty\`, \`amount\` (line total, always positive) and optionally \`voided="true"\`. The business date is the \`storeDate\` attribute of the root element.

**Rules**
- Only transactions of kind \`SALE\` or \`RETURN\` count (\`NO_SALE\` drawer openings, \`PAID_OUT\` etc. are ignored), and never a transaction with \`cancelled="true"\`.
- Voided lines (\`voided="true"\`) are ignored.
- A transaction without any \`Line\` is possible.
- One object per store that has at least one counted transaction, **sorted by \`storeId\`**:
  - \`storeId\`, \`businessDate\`
  - \`transactionCount\` — counted transactions of that store
  - \`grossSales\` — sum of SALE line amounts
  - \`returns\` — sum of RETURN line amounts (positive number)
  - \`netSales\` — \`grossSales - returns\`
  - \`departments\` — one entry per department with at least one non-voided line, **sorted by \`dept\`**: \`dept\`, \`netSales\` (sales minus returns), \`units\` (sold qty minus returned qty)
- Amounts and quantities are numbers in the output.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/xml',
      content: `<PosLog storeDate="2025-11-02">
  <Transaction store="S022" register="01" seq="2001" kind="SALE">
    <Line dept="HOME" sku="560112" qty="1" amount="12.50"/>
  </Transaction>
  <Transaction store="S014" register="02" seq="1001" kind="SALE">
    <Line dept="GROCERY" sku="400118" qty="2" amount="7.98"/>
    <Line dept="HOME" sku="560201" qty="1" amount="24.99"/>
  </Transaction>
  <Transaction store="S014" register="01" seq="1002" kind="SALE">
    <Line dept="GROCERY" sku="400250" qty="1" amount="3.49" voided="true"/>
    <Line dept="GROCERY" sku="400251" qty="3" amount="5.97"/>
  </Transaction>
  <Transaction store="S022" register="01" seq="2002" kind="NO_SALE"/>
  <Transaction store="S014" register="01" seq="1003" kind="RETURN">
    <Line dept="HOME" sku="560201" qty="1" amount="24.99"/>
  </Transaction>
  <Transaction store="S022" register="03" seq="2003" kind="SALE" cancelled="true">
    <Line dept="GROCERY" sku="400118" qty="1" amount="3.99"/>
  </Transaction>
</PosLog>`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `[
  {
    "storeId": "S014",
    "businessDate": "2025-11-02",
    "transactionCount": 3,
    "grossSales": 38.94,
    "returns": 24.99,
    "netSales": 13.95,
    "departments": [
      { "dept": "GROCERY", "netSales": 13.95, "units": 5 },
      { "dept": "HOME", "netSales": 0, "units": 0 }
    ]
  },
  {
    "storeId": "S022",
    "businessDate": "2025-11-02",
    "transactionCount": 1,
    "grossSales": 12.50,
    "returns": 0,
    "netSales": 12.50,
    "departments": [
      { "dept": "HOME", "netSales": 12.50, "units": 1 }
    ]
  }
]`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload.PosLog
`,
  hints: [
    'Attributes are read with `@`: `t.@store`, `l.@amount`. They are strings — convert with `as Number`.',
    '`payload.PosLog.*Transaction` returns all transactions as an array; `t.*Line` returns `null` for a transaction without lines, so add `default []`.',
    'Flatten all counted lines into one list of simple objects (`store`, `dept`, `sign`, `qty`, `amount`) with `flatMap`; then grouping and summing is easy.',
    '`sum([])` is `0`, which handles "no returns" for free.',
  ],
  solution: `%dw 2.0
output application/json
var log = payload.PosLog
var txns = (log.*Transaction default []) filter (t) -> (["SALE", "RETURN"] contains t.@kind) and (t.@cancelled != "true")
var lines = txns flatMap (t) -> ((t.*Line default []) filter ($.@voided != "true")) map (l) -> {
  store: t.@store,
  dept: l.@dept,
  sign: if (t.@kind == "RETURN") -1 else 1,
  qty: l.@qty as Number,
  amount: l.@amount as Number
}
---
((txns groupBy $.@store) pluck (storeTxns, storeKey) -> do {
  var store = storeKey as String
  var storeLines = lines filter ($.store == store)
  var gross = sum((storeLines filter ($.sign == 1)) map $.amount)
  var returns = sum((storeLines filter ($.sign == -1)) map $.amount)
  ---
  {
    storeId: store,
    businessDate: log.@storeDate,
    transactionCount: sizeOf(storeTxns),
    grossSales: gross,
    returns: returns,
    netSales: gross - returns,
    departments: ((storeLines groupBy $.dept) pluck (deptLines, dept) -> {
      dept: dept as String,
      netSales: sum(deptLines map ($.amount * $.sign)),
      units: sum(deptLines map ($.qty * $.sign))
    }) orderBy $.dept
  }
}) orderBy $.storeId`,
  explanation: `
**Normalise first, aggregate second.** XML with attributes and nested repeating elements is awkward to aggregate directly. The solution first turns every counted line into a flat record with a \`sign\` (+1 for SALE, −1 for RETURN). After that, every figure is a plain \`sum\` over a filtered list.

**Repeating elements.** \`*Transaction\` and \`*Line\` (multi-value selectors) always return an array — even when there is only one element. With the single-value selector \`t.Line\` you would get only the **first** line. For a transaction without lines (\`NO_SALE\`), \`t.*Line\` is \`null\`, hence \`default []\`.

**Attributes are strings.** \`l.@amount\` is \`"7.98"\`; summing strings fails, so convert with \`as Number\`. Comparisons such as \`t.@cancelled != "true"\` work on the string value, and a missing attribute is \`null\`, which is also \`!= "true"\`.

**Filters before grouping.** Cancelled and non-sale transactions are removed before \`groupBy\`, so a store whose only activity was a drawer opening never shows up — matching the rule "at least one counted transaction".

**Precedence.** \`flatMap (t) -> (...) map (l) -> ...\` — the \`map\` is inside the \`flatMap\` lambda (the lambda body extends as far right as possible), which is exactly what is wanted here because the line mapper needs \`t\`. The outer \`groupBy ... pluck\` is wrapped in parentheses so that \`orderBy\` applies to the result, not to each object.
`,
  tests: [
    {
      name: 'Returns-only store and cancelled-only store',
      inputs: [
        {
          name: 'payload',
          mime: 'application/xml',
          content:
            '<PosLog storeDate="2025-11-03"><Transaction store="S031" register="01" seq="1" kind="RETURN"><Line dept="TOYS" sku="1" qty="2" amount="19.98"/></Transaction><Transaction store="S040" register="01" seq="1" kind="SALE" cancelled="true"><Line dept="TOYS" sku="1" qty="1" amount="9.99"/></Transaction></PosLog>',
        },
      ],
      expected:
        '[ { "storeId": "S031", "businessDate": "2025-11-03", "transactionCount": 1, "grossSales": 0, "returns": 19.98, "netSales": -19.98, "departments": [ { "dept": "TOYS", "netSales": -19.98, "units": -2 } ] } ]',
    },
    {
      name: 'Single transaction with every line voided',
      inputs: [
        {
          name: 'payload',
          mime: 'application/xml',
          content:
            '<PosLog storeDate="2025-11-04"><Transaction store="S050" register="02" seq="7" kind="SALE"><Line dept="DIY" sku="9" qty="1" amount="4.50" voided="true"/></Transaction></PosLog>',
        },
      ],
      expected:
        '[ { "storeId": "S050", "businessDate": "2025-11-04", "transactionCount": 1, "grossSales": 0, "returns": 0, "netSales": 0, "departments": [] } ]',
    },
  ],
  followUps: [
    {
      q: 'The log of a large store is 400 MB. How do you process it without loading it all into memory?',
      a: 'Enable streaming on the XML reader (`streaming=true` reader property, with the file read as a stream) and keep the script a single forward pass. `groupBy`/`orderBy` defeat streaming, so a common pattern is to split per transaction (For Each over `payload.PosLog.*Transaction`) and accumulate totals in a database or Object Store.',
    },
    {
      q: 'A store resends its log after a network outage. How do you avoid doubling its sales in the ERP?',
      a: 'Make the post idempotent on `(storeId, businessDate)`: the ERP side or a control table records which store-days were posted, and a resend either is rejected or replaces the earlier posting. The SFTP connector watermark alone does not help if the file comes back with a new name.',
    },
    {
      q: 'Why keep `returns` as a separate figure instead of only reporting net sales?',
      a: 'Finance and loss prevention track the return rate per store; a store with normal net sales but very high gross and returns can indicate fraud. Netting early would hide it.',
    },
  ],
}
