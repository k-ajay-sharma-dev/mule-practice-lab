export default {
  id: 'dw-188',
  category: 'dataweave',
  title: 'Split a Supplier Item Message Into Staging Rows, Reject Rows and a Job Log Row',
  level: 'ADVANCED',
  tags: ['myproject', 'oracle', 'staging', 'rejects', 'job-log', 'duplicates', 'groupBy', 'json'],
  estMinutes: 30,
  description: `
Marrow & Pine Home loads supplier item messages into Oracle. Before the load, Mule must check the message and each record, and produce three things for three tables: staging rows, reject rows and one job log row.

**Inputs**
- \`payload.header\`: \`messageId\`, \`documentId\` and \`messageType\`
- \`payload.records\`: \`supplierId\`, \`itemId\`, \`gtin\` and \`cost\`
- \`vars.seenDocumentIds\`: document IDs already loaded, from an Oracle lookup
- \`vars.knownSuppliers\` and \`vars.runId\`

**Duplicate document.** If the document ID was seen before, load nothing: no staging rows, no reject rows, and a job log row with status \`DUPLICATE\`, the record count as \`TOTAL\`, and 0 good and 0 rejected.

**Record checks**, all that apply, in this order:
- \`UNKNOWN_SUPPLIER\`
- \`BAD_GTIN\` when the GTIN is not 13 or 14 digits
- \`BAD_COST\` when the cost is missing, zero or negative
- \`DUPLICATE_KEY\` when an earlier record in the message has the same supplier and item

**Staging rows**: \`RUN_ID\`, \`LINE_NO\` (from 1), \`SUPPLIER_ID\`, \`ITEM_ID\`, \`GTIN_14\` (the GTIN padded with leading zeros to 14 digits) and \`UNIT_COST\`.

**Reject rows**: \`RUN_ID\`, \`LINE_NO\`, \`SUPPLIER_ID\`, \`ITEM_ID\` and \`REASON_CODES\`, the codes joined with commas.

**Job log**: \`RUN_ID\`, \`MESSAGE_ID\`, \`DOCUMENT_ID\`, \`STATUS\`, \`TOTAL\`, \`GOOD\`, \`REJECTED\`. Status is \`SUCCESS\` with no rejects, \`FAILED\` when nothing is good, otherwise \`PARTIAL\`.

**Output**: an object with \`stageRows\` and \`rejectRows\` (both lists, in input order) and \`jobLog\` (one object). \`UNIT_COST\` is the cost as sent.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{
  "header": { "messageId": "MSG-7781", "documentId": "DOC-2026-1118-01", "messageType": "SupplierItem" },
  "records": [
    { "supplierId": "SUP-10", "itemId": "BK-100", "gtin": "05012345678900", "cost": 21.5 },
    { "supplierId": "SUP-99", "itemId": "TN-220", "gtin": "05012345678917", "cost": 80 },
    { "supplierId": "SUP-10", "itemId": "ST-050", "gtin": "12345", "cost": 0 },
    { "supplierId": "SUP-10", "itemId": "BK-100", "gtin": "05012345678900", "cost": 22 },
    { "supplierId": "SUP-12", "itemId": "LT-310", "gtin": "5012345678924", "cost": 12.75 }
  ]
}`,
    },
    {
      name: 'vars',
      mime: 'application/json',
      content: `{
  "runId": 9002,
  "seenDocumentIds": ["DOC-2026-1117-04"],
  "knownSuppliers": ["SUP-10", "SUP-12"]
}`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "stageRows": [
    { "RUN_ID": 9002, "LINE_NO": 1, "SUPPLIER_ID": "SUP-10", "ITEM_ID": "BK-100", "GTIN_14": "05012345678900", "UNIT_COST": 21.5 },
    { "RUN_ID": 9002, "LINE_NO": 5, "SUPPLIER_ID": "SUP-12", "ITEM_ID": "LT-310", "GTIN_14": "05012345678924", "UNIT_COST": 12.75 }
  ],
  "rejectRows": [
    { "RUN_ID": 9002, "LINE_NO": 2, "SUPPLIER_ID": "SUP-99", "ITEM_ID": "TN-220", "REASON_CODES": "UNKNOWN_SUPPLIER" },
    { "RUN_ID": 9002, "LINE_NO": 3, "SUPPLIER_ID": "SUP-10", "ITEM_ID": "ST-050", "REASON_CODES": "BAD_GTIN,BAD_COST" },
    { "RUN_ID": 9002, "LINE_NO": 4, "SUPPLIER_ID": "SUP-10", "ITEM_ID": "BK-100", "REASON_CODES": "DUPLICATE_KEY" }
  ],
  "jobLog": {
    "RUN_ID": 9002,
    "MESSAGE_ID": "MSG-7781",
    "DOCUMENT_ID": "DOC-2026-1118-01",
    "STATUS": "PARTIAL",
    "TOTAL": 5,
    "GOOD": 2,
    "REJECTED": 3
  }
}`,
  },
  starterCode: `%dw 2.0
output application/json
---
{
  stageRows: payload.records filter (r) -> vars.knownSuppliers contains r.supplierId,
  rejectRows: [],
  jobLog: { RUN_ID: vars.runId }
}
`,
  hints: [
    'Number the records first: `payload.records map (r, i) -> r ++ { line: i + 1 }`.',
    'For duplicate keys, group by `supplierId ++ "|" ++ itemId` and keep the smallest line per key with `mapObject (group, k) -> { (k): min(group.line) }`. A record is a duplicate when its line is not that first line.',
    'Build the reasons as joined one item lists: `(if (ok) [] else ["CODE"]) ++ ...`.',
    'Pad the GTIN with `("00000000000000" ++ gtin)[-14 to -1]`, which keeps the last 14 characters.',
    'Work out `docSeen` once and use it to empty both lists.',
  ],
  solution: `%dw 2.0
output application/json

var docSeen = vars.seenDocumentIds contains payload.header.documentId

var numbered = payload.records map (r, i) -> r ++ { line: i + 1 }

fun keyOf(r) = r.supplierId ++ "|" ++ r.itemId

var firstLine = (numbered groupBy (r) -> keyOf(r)) mapObject (group, k) -> { (k): min(group.line) }

fun reasonsOf(r) =
  (if (vars.knownSuppliers contains r.supplierId) [] else ["UNKNOWN_SUPPLIER"])
  ++ (if ((r.gtin default "") matches /^\\d{13,14}$/) [] else ["BAD_GTIN"])
  ++ (if ((r.cost default 0) > 0) [] else ["BAD_COST"])
  ++ (if (firstLine[keyOf(r)] == r.line) [] else ["DUPLICATE_KEY"])

var checked = numbered map (r) -> r ++ { reasons: reasonsOf(r) }

var good = if (docSeen) [] else checked filter (r) -> isEmpty(r.reasons)

var bad = if (docSeen) [] else checked filter (r) -> not isEmpty(r.reasons)
---
{
  stageRows: good map (r) -> {
    RUN_ID: vars.runId,
    LINE_NO: r.line,
    SUPPLIER_ID: r.supplierId,
    ITEM_ID: r.itemId,
    GTIN_14: ("00000000000000" ++ r.gtin)[-14 to -1],
    UNIT_COST: r.cost
  },
  rejectRows: bad map (r) -> {
    RUN_ID: vars.runId,
    LINE_NO: r.line,
    SUPPLIER_ID: r.supplierId,
    ITEM_ID: r.itemId,
    REASON_CODES: r.reasons joinBy ","
  },
  jobLog: {
    RUN_ID: vars.runId,
    MESSAGE_ID: payload.header.messageId,
    DOCUMENT_ID: payload.header.documentId,
    STATUS:
      if (docSeen) "DUPLICATE"
      else if (isEmpty(bad)) "SUCCESS"
      else if (isEmpty(good)) "FAILED"
      else "PARTIAL",
    TOTAL: sizeOf(numbered),
    GOOD: sizeOf(good),
    REJECTED: sizeOf(bad)
  }
}`,
  explanation: `
**Message first, records second.** A document that was loaded before is not an error in any record. Checking it first stops the whole load and gives a clear \`DUPLICATE\` status in the job log, which support can tell apart from a failure.

**Line numbers before filtering.** The line number is added once, at the start, so staging and reject rows both point at the same record in the original message.

**First line per key.** Grouping by the key and taking the smallest line gives the record that wins. Every later record with that key is marked \`DUPLICATE_KEY\`. This also keeps two rows with the same key out of a single bulk insert, which would fail with ORA-00001 on a unique index.

**All reasons.** Each check gives an empty list or one code, and joining them keeps a fixed order. Line 3 shows both problems, so the supplier can fix them in one go.

**Counts that add up.** \`TOTAL\` equals \`GOOD\` plus \`REJECTED\` for a normal run. The job log row is written with these numbers, and the job report email reads them from there.
`,
  tests: [
    {
      name: 'Document already loaded',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content:
            '{ "header": { "messageId": "MSG-7790", "documentId": "DOC-2026-1117-04", "messageType": "SupplierItem" }, "records": [{ "supplierId": "SUP-10", "itemId": "BK-100", "gtin": "05012345678900", "cost": 21.5 }] }',
        },
        { name: 'vars', mime: 'application/json', content: '{ "runId": 9003, "seenDocumentIds": ["DOC-2026-1117-04"], "knownSuppliers": ["SUP-10"] }' },
      ],
      expected:
        '{ "stageRows": [], "rejectRows": [], "jobLog": { "RUN_ID": 9003, "MESSAGE_ID": "MSG-7790", "DOCUMENT_ID": "DOC-2026-1117-04", "STATUS": "DUPLICATE", "TOTAL": 1, "GOOD": 0, "REJECTED": 0 } }',
    },
    {
      name: 'Everything rejected',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '{ "header": { "messageId": "MSG-7791", "documentId": "DOC-2026-1118-02", "messageType": "SupplierItem" }, "records": [{ "supplierId": "SUP-77", "itemId": "MT-410" }] }',
        },
        { name: 'vars', mime: 'application/json', content: '{ "runId": 9004, "seenDocumentIds": [], "knownSuppliers": ["SUP-10"] }' },
      ],
      expected:
        '{ "stageRows": [], "rejectRows": [{ "RUN_ID": 9004, "LINE_NO": 1, "SUPPLIER_ID": "SUP-77", "ITEM_ID": "MT-410", "REASON_CODES": "UNKNOWN_SUPPLIER,BAD_GTIN,BAD_COST" }], "jobLog": { "RUN_ID": 9004, "MESSAGE_ID": "MSG-7791", "DOCUMENT_ID": "DOC-2026-1118-02", "STATUS": "FAILED", "TOTAL": 1, "GOOD": 0, "REJECTED": 1 } }',
    },
  ],
  followUps: [
    {
      q: 'Why is the seen document check backed by the database too?',
      a: 'Two copies can be processed at once. A unique constraint on the document ID in the message log table stops the second one even if both passed this check.',
    },
    {
      q: 'Should the duplicate record keep the first or the last value?',
      a: 'That is a business rule. Some feeds treat the last line as the newest. Write the rule in the interface spec and test it.',
    },
    {
      q: 'How would you check the GTIN check digit?',
      a: 'Weight the digits 3 and 1 from the right, sum them and compare the check digit with the value that makes the sum a multiple of 10. Add it as another reason code.',
    },
  ],
}
