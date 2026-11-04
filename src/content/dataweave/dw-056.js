export default {
  id: 'dw-056',
  category: 'dataweave',
  title: 'Trace Recalled Lots to Affected Customers',
  level: 'INTERMEDIATE',
  tags: ['supply-chain', 'traceability', 'recall', 'flatMap', 'groupBy', 'distinctBy'],
  estMinutes: 25,
  description: `
Quality has issued a **recall** for some production lots of one SKU. Customer service needs to know, from the outbound shipment history (\`payload\`), which customers received the affected product so they can be contacted. The recall notice is the \`recall\` input.

**Matching**
- A shipment line is affected when its \`sku\` equals the recall \`sku\` **and** its \`lot\` is one of the recalled lots. The same lot number can exist for a different SKU — that is not affected.
- Lot numbers in the recall notice are typed by hand: compare them **trimmed and upper-cased**. Shipment lots are already clean.
- A shipment may have no \`lines\` field at all.

**Output**
- \`sku\`
- \`affectedCustomers\`, sorted by \`customerId\`: \`customerId\`, \`name\`, \`shipments\` (distinct shipment ids in shipment order), \`lots\` (distinct, sorted), \`qty\` (affected units)
- \`totalQty\`: affected units over all customers
- \`lotsNotShipped\`: recalled lots (normalised) that appear on no affected line, sorted — these are probably still in the warehouse
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `[
  { "shipmentId": "SH-1", "shipDate": "2026-10-01", "customer": { "id": "C-200", "name": "Fresh Mart" },
    "lines": [ { "sku": "SKU-7", "lot": "L2401", "qty": 50 }, { "sku": "SKU-9", "lot": "L2401", "qty": 20 } ] },
  { "shipmentId": "SH-2", "shipDate": "2026-10-03", "customer": { "id": "C-100", "name": "Corner Grocer" },
    "lines": [ { "sku": "SKU-7", "lot": "L2402", "qty": 30 }, { "sku": "SKU-7", "lot": "L2405", "qty": 10 } ] },
  { "shipmentId": "SH-3", "shipDate": "2026-10-04", "customer": { "id": "C-200", "name": "Fresh Mart" },
    "lines": [ { "sku": "SKU-7", "lot": "L2402", "qty": 15 } ] },
  { "shipmentId": "SH-4", "shipDate": "2026-10-05", "customer": { "id": "C-300", "name": "City Deli" },
    "lines": [ { "sku": "SKU-7", "lot": "L2409", "qty": 5 } ] },
  { "shipmentId": "SH-5", "shipDate": "2026-10-06", "customer": { "id": "C-100", "name": "Corner Grocer" } }
]`,
    },
    {
      name: 'recall',
      mime: 'application/json',
      content: `{ "recallId": "RC-2026-14", "sku": "SKU-7", "lots": [" l2401", "L2402 ", "l2403"] }`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "sku": "SKU-7",
  "affectedCustomers": [
    { "customerId": "C-100", "name": "Corner Grocer", "shipments": ["SH-2"], "lots": ["L2402"], "qty": 30 },
    { "customerId": "C-200", "name": "Fresh Mart", "shipments": ["SH-1", "SH-3"], "lots": ["L2401", "L2402"], "qty": 65 }
  ],
  "totalQty": 95,
  "lotsNotShipped": ["L2403"]
}`,
  },
  starterCode: `%dw 2.0
output application/json
---
{
  sku: recall.sku,
  affectedCustomers: [],
  totalQty: 0,
  lotsNotShipped: []
}
`,
  hints: [
    'Normalise the recall lots first: `recall.lots map upper(trim($))`.',
    'Flatten shipments to one record per line with `flatMap`, copying the shipment id and customer onto each line. Use `(s.lines default [])` for shipments without lines.',
    'Then `groupBy $.customerId`, `pluck` into an array and `orderBy`. `distinctBy $` de-duplicates shipment ids and lots.',
  ],
  solution: `%dw 2.0
output application/json

var recalledLots = recall.lots map upper(trim($))

var hits = payload flatMap (s) ->
  ((s.lines default [])
    filter ((l) -> l.sku == recall.sku and (recalledLots contains l.lot))
    map (l) -> {
      shipmentId: s.shipmentId,
      customerId: s.customer.id,
      name: s.customer.name,
      lot: l.lot,
      qty: l.qty
    })

var customers = (hits groupBy $.customerId)
  pluck (rows, id) -> {
    customerId: id as String,
    name: rows[0].name,
    shipments: rows.shipmentId distinctBy $,
    lots: (rows.lot distinctBy $) orderBy $,
    qty: sum(rows.qty)
  }

var shippedLots = hits.lot default []
---
{
  sku: recall.sku,
  affectedCustomers: customers orderBy $.customerId,
  totalQty: sum(hits.qty default []),
  lotsNotShipped: (recalledLots filter (not (shippedLots contains $))) distinctBy $ orderBy $
}`,
  explanation: `
Traceability questions become easy once the nested data is **flattened to one row per affected line**, with the context (shipment, customer) copied onto it. Everything after that is grouping and summing.

- \`flatMap\` = \`map\` + \`flatten\`: each shipment produces zero or more hit rows.
- Filtering on **both** \`sku\` and \`lot\` excludes \`SKU-9 / L2401\` in SH-1 — lot numbers are only unique per item.
- \`default []\` handles SH-5, which has no \`lines\` key.
- \`rows.shipmentId\` is a multi-value selector over the group; \`distinctBy $\` keeps the first occurrence, so shipment order is preserved.
- \`lotsNotShipped\` compares against the lots that were actually hit, not all shipped lots: L2405 was shipped but is not recalled, and L2403 never left.
- \`hits.lot\` on an empty array returns \`null\` in this engine, so it is defaulted before \`contains\`; the same applies to \`hits.qty\`.

Common traps:
- Comparing raw recall lots: \`" l2401"\` never equals \`"L2401"\`.
- Summing all quantities of an affected shipment instead of only the affected lines (C-100 would show 40).
`,
  tests: [
    {
      name: 'Nothing shipped from the recalled lots',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content:
            '[{ "shipmentId": "SH-9", "shipDate": "2026-10-09", "customer": { "id": "C-1", "name": "A" }, "lines": [ { "sku": "SKU-1", "lot": "X1", "qty": 3 } ] }]',
        },
        { name: 'recall', mime: 'application/json', content: '{ "recallId": "RC-1", "sku": "SKU-1", "lots": ["x2", "X2 ", "a0"] }' },
      ],
      expected: '{ "sku": "SKU-1", "affectedCustomers": [], "totalQty": 0, "lotsNotShipped": ["A0", "X2"] }',
    },
  ],
  followUps: [
    {
      q: 'In production the shipment history is in an Oracle database with millions of lines. Would you still do this in DataWeave?',
      a: 'No: push the filter into SQL (`WHERE sku = :sku AND lot IN (...)`) with parameterised values so the database uses its index, and let DataWeave only group and shape the small result. Passing a variable list of lots usually means building the IN list of named parameters or using a collection type.',
    },
    {
      q: 'The recall must also reach stores that received product through a cross-dock. How does that change the design?',
      a: 'Trace forward through every movement: DC to cross-dock to store. Each hop needs a lot-level record (GS1 EPCIS events are the standard model), and the query becomes a traversal across events rather than a single join.',
    },
    {
      q: 'How would you notify the affected customers reliably?',
      a: 'Publish one message per customer to a queue (for example an ActiveMQ queue consumed by a notification flow) with the recall id and customer id as a correlation/idempotency key, so retries do not send duplicate notices and failures land on a DLQ for follow-up.',
    },
  ],
}
