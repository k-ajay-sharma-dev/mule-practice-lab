export default {
  id: 'dw-019',
  category: 'dataweave',
  title: 'Split Records into API Batches',
  level: 'INTERMEDIATE',
  tags: ['divideBy', 'arrays-module', 'leftPad', 'chunking', 'json'],
  estMinutes: 20,
  description: `
A target SaaS API accepts at most \`batchSize\` records per call. Before the Mule flow loops over the calls, prepare the batches.

Input: \`{ "jobId", "batchSize", "records": [ { "id", "status", "amount" } ] }\`.

**Rules**
1. Records with \`status\` \`"DELETED"\` are not sent — remove them first.
2. Split the remaining records, **in input order**, into consecutive batches of \`batchSize\`; only the last batch may be smaller.
3. Each batch is:
   - \`batchId\` — \`jobId\`, a dash, and the 1-based batch number left-padded with zeros to 3 digits, e.g. \`"JOB7-001"\`
   - \`size\` — number of records in the batch
   - \`amountTotal\` — sum of the batch's \`amount\` values
   - \`ids\` — the record ids, in order

Output: \`{ "jobId", "totalRecords" (after removing deleted ones), "batchCount", "batches": [...] }\`.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{
  "jobId": "JOB7",
  "batchSize": 3,
  "records": [
    { "id": "R1", "status": "NEW", "amount": 10 },
    { "id": "R2", "status": "UPDATED", "amount": 5.5 },
    { "id": "R3", "status": "DELETED", "amount": 99 },
    { "id": "R4", "status": "NEW", "amount": 1 },
    { "id": "R5", "status": "NEW", "amount": 2 },
    { "id": "R6", "status": "UPDATED", "amount": 3 },
    { "id": "R7", "status": "NEW", "amount": 4 },
    { "id": "R8", "status": "NEW", "amount": 0.25 }
  ]
}`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "jobId": "JOB7",
  "totalRecords": 7,
  "batchCount": 3,
  "batches": [
    { "batchId": "JOB7-001", "size": 3, "amountTotal": 16.5, "ids": ["R1", "R2", "R4"] },
    { "batchId": "JOB7-002", "size": 3, "amountTotal": 9, "ids": ["R5", "R6", "R7"] },
    { "batchId": "JOB7-003", "size": 1, "amountTotal": 0.25, "ids": ["R8"] }
  ]
}`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload
`,
  hints: [
    '`import divideBy from dw::core::Arrays` — `arr divideBy n` returns an array of sub-arrays of at most `n` items.',
    'The second lambda parameter of `map` is the 0-based index: `(batch, i) -> ...` and the batch number is `i + 1`.',
    '`leftPad((i + 1) as String, 3, "0")` from `dw::core::Strings` builds the `001` suffix.',
  ],
  solution: `%dw 2.0
import divideBy from dw::core::Arrays
import leftPad from dw::core::Strings
output application/json
var live = (payload.records default []) filter ($.status != "DELETED")
var batches = live divideBy payload.batchSize
---
{
  jobId: payload.jobId,
  totalRecords: sizeOf(live),
  batchCount: sizeOf(batches),
  batches: batches map (batch, i) -> {
    batchId: payload.jobId ++ "-" ++ leftPad((i + 1) as String, 3, "0"),
    size: sizeOf(batch),
    amountTotal: sum(batch.amount),
    ids: batch.id
  }
}`,
  explanation: `
Filtering **before** chunking is essential: chunking first and filtering inside each batch would produce uneven batches (the first one here would only hold 2 records).

\`divideBy\` keeps the order and puts the remainder in the last chunk. Every chunk is non-empty, so \`batch.amount\` and \`batch.id\` are never \`null\` here — but on an empty input \`divideBy\` returns \`[]\` and there are simply no batches.

In a real Mule app you could also let a \`For Each\` scope with \`batchSize\` do the chunking; doing it in DataWeave lets you attach metadata such as the batch id and totals.
`,
  tests: [
    {
      name: 'Nothing to send',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '{ "jobId": "J0", "batchSize": 2, "records": [{ "id": "X", "status": "DELETED", "amount": 1 }] }',
        },
      ],
      expected: '{ "jobId": "J0", "totalRecords": 0, "batchCount": 0, "batches": [] }',
    },
    {
      name: 'Batch size larger than the record count',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '{ "jobId": "J9", "batchSize": 500, "records": [{ "id": "A", "status": "NEW", "amount": 1 }, { "id": "B", "status": "NEW", "amount": 2 }] }',
        },
      ],
      expected: '{ "jobId": "J9", "totalRecords": 2, "batchCount": 1, "batches": [{ "batchId": "J9-001", "size": 2, "amountTotal": 3, "ids": ["A", "B"] }] }',
    },
  ],
  followUps: [
    {
      q: 'What happens if `batchSize` is 0 or missing?',
      a: 'A chunk size of 0 (or a missing size) is meaningless and must not reach `divideBy`. Validate it up front (e.g. `if ((payload.batchSize default 0) <= 0) fail("batchSize must be positive")`) or fall back to a sensible default.',
    },
    {
      q: 'How would you write chunking without the Arrays module?',
      a: 'Group by the integer quotient of the index: `(live map (r, i) -> { b: floor(i / n), r: r }) groupBy $.b` then `pluck` the groups — or use `live[i to i + n - 1]` slices in a map over the start indexes.',
    },
  ],
}
