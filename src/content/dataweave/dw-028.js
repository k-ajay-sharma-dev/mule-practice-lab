export default {
  id: 'dw-028',
  category: 'dataweave',
  title: 'Diff Two Product Snapshots',
  level: 'ADVANCED',
  tags: ['diff', 'groupBy', 'multiple-inputs', 'namesOf', 'sync'],
  estMinutes: 30,
  description: `
A nightly sync compares today's product export (\`payload\`) with yesterday's (\`previous\`) and only sends the **delta** to the e-commerce platform. Products are identified by \`sku\`.

Return an object with three lists:

- \`added\` — full records (as in \`payload\`) whose \`sku\` is not in \`previous\`
- \`removed\` — the **sku strings** that are in \`previous\` but not in \`payload\`
- \`changed\` — for every sku in both snapshots whose data differs: \`{ sku, changes }\`, where \`changes\` is a list of \`{ field, from, to }\` (\`from\` = previous value, \`to\` = current value)

**Rules**
- Compare every field name that appears in **either** version of the record, except \`sku\`. A field missing on one side counts as \`null\`.
- Products with no differences do not appear in \`changed\`.
- \`added\`, \`removed\` and \`changed\` are sorted by \`sku\` ascending; \`changes\` is sorted by \`field\` name ascending.
- Each sku appears at most once per snapshot.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `[
  { "sku": "D-4", "name": "Cable Tray", "price": 12, "stock": 35 },
  { "sku": "A-1", "name": "Desk Lamp", "price": 24.99, "stock": 10 },
  { "sku": "E-5", "name": "Footrest", "price": 39, "stock": 12 },
  { "sku": "B-2", "name": "Office Chair Pro", "price": 159, "stock": 4 }
]`,
    },
    {
      name: 'previous',
      mime: 'application/json',
      content: `[
  { "sku": "A-1", "name": "Desk Lamp", "price": 24.99, "stock": 10 },
  { "sku": "B-2", "name": "Office Chair", "price": 149, "stock": 4 },
  { "sku": "C-3", "name": "Monitor Arm", "price": 59, "stock": 0 },
  { "sku": "D-4", "name": "Cable Tray", "price": 12, "stock": 40 }
]`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "added": [
    { "sku": "E-5", "name": "Footrest", "price": 39, "stock": 12 }
  ],
  "removed": ["C-3"],
  "changed": [
    {
      "sku": "B-2",
      "changes": [
        { "field": "name", "from": "Office Chair", "to": "Office Chair Pro" },
        { "field": "price", "from": 149, "to": 159 }
      ]
    },
    {
      "sku": "D-4",
      "changes": [
        { "field": "stock", "from": 40, "to": 35 }
      ]
    }
  ]
}`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload
`,
  hints: [
    'Index both snapshots once: `var prevBySku = previous groupBy $.sku`. Then `prevBySku[p.sku] == null` tells you a product is new.',
    'For one pair of records, the field list is `(namesOf(before) ++ namesOf(after)) distinctBy $`, minus `"sku"`, sorted. Keep the fields where `before[f] != after[f]`.',
    'A lambda body extends as far right as possible: wrap `(... map (c) -> { ... })` in parentheses before chaining `filter` or `orderBy` on the result.',
  ],
  solution: `%dw 2.0
output application/json

var prevBySku = previous groupBy $.sku
var curBySku = payload groupBy $.sku

fun changesOf(before: Object, after: Object) =
  ((namesOf(before) ++ namesOf(after)) distinctBy ((n) -> n))
    filter ((n) -> n != "sku")
    orderBy ((n) -> n)
    filter ((f) -> before[f] != after[f])
    map ((f) -> { field: f, from: before[f], to: after[f] })
---
{
  added: (payload filter ((p) -> prevBySku[p.sku] == null)) orderBy $.sku,

  removed: ((previous filter ((p) -> curBySku[p.sku] == null)) orderBy $.sku) map $.sku,

  changed: (
    (payload filter ((p) -> prevBySku[p.sku] != null))
      map ((c) -> { sku: c.sku, changes: changesOf(prevBySku[c.sku][0], c) })
  )
    filter (!isEmpty($.changes))
    orderBy $.sku
}`,
  explanation: `
**Lookups, not nested loops.** \`groupBy $.sku\` turns each snapshot into an object keyed by sku, so "does this sku exist on the other side?" is a key access instead of a \`filter\` over the whole other list (n × m).

**Field-level diff.** \`namesOf\` returns the keys as strings. Taking the union of both records' keys catches fields that were **added or removed**, not just changed — selecting a missing field returns \`null\`, which gives the "missing counts as null" rule for free. \`!=\` compares by value, so \`12\` and \`12.0\` are equal.

**The precedence trap.** \`xs map (c) -> { ... } filter (...)\` applies \`filter\` to the *object inside the lambda*, not to the mapped array. Parenthesise the whole \`map\` expression before chaining.

Sorting \`changed\` *after* building it (rather than sorting \`payload\` first) keeps the code readable; both are correct.
`,
  tests: [
    {
      name: 'First run: no previous snapshot',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '[{ "sku": "Z-1", "price": 1 }, { "sku": "A-9", "price": 2 }]',
        },
        { name: 'previous', mime: 'application/json', content: '[]' },
      ],
      expected: '{ "added": [{ "sku": "A-9", "price": 2 }, { "sku": "Z-1", "price": 1 }], "removed": [], "changed": [] }',
    },
    {
      name: 'Fields added and removed, null equals missing',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '[{ "sku": "K-2", "price": 5, "color": "red", "note": null }, { "sku": "K-1", "price": 10.0 }]',
        },
        {
          name: 'previous',
          mime: 'application/json',
          content: '[{ "sku": "K-1", "price": 10 }, { "sku": "K-2", "price": 5, "size": "L" }]',
        },
      ],
      expected:
        '{ "added": [], "removed": [], "changed": [{ "sku": "K-2", "changes": [{ "field": "color", "from": null, "to": "red" }, { "field": "size", "from": "L", "to": null }] }] }',
    },
  ],
  followUps: [
    {
      q: 'How would you scale this to two snapshots with a million products each?',
      a: 'Avoid holding both in memory in Mule: sort both exports by sku at the source and stream-merge them, or push the comparison into the database (a full outer join on sku). The groupBy approach is fine for tens of thousands of records.',
    },
    {
      q: 'How would you ignore changes to a volatile field such as `lastModified`?',
      a: 'Add it to the excluded field list next to `"sku"`, e.g. `filter (!(["sku", "lastModified"] contains $))`.',
    },
    {
      q: 'Why sort the output at all?',
      a: 'A deterministic order makes the delta easy to test, diff and replay. Without it, the order depends on the input order, which upstream systems rarely guarantee.',
    },
  ],
}
