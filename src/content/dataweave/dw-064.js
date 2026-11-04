export default {
  id: 'dw-064',
  category: 'dataweave',
  title: 'Marketplace Product Feed with Variant Attributes as TSV',
  level: 'INTERMEDIATE',
  tags: ['retail', 'pim', 'marketplace', 'csv', 'tsv', 'flatMap', 'case-insensitive'],
  estMinutes: 25,
  description: `
The PIM exports products as JSON. A marketplace accepts listings as a **tab-separated** flat file with one row per sellable item. Write the transformation.

A product has \`sku\`, \`title\`, \`price\`, optional \`attributes\` and \`stock\`, and a \`variants\` array (possibly empty or missing). A variant has \`sku\`, \`price\` (\`null\` = use the product price), \`status\`, \`attributes\` and \`stock\`. \`attributes\` is a list of \`{ name, value }\` pairs and the PIM is not consistent about the case of \`name\` (\`Color\`, \`color\`). \`stock\` is an object of warehouse → quantity.

**Rules**
- A product **with** variants produces one row per variant whose \`status\` is not \`DISCONTINUED\`; \`parent_sku\` is the product SKU. If every variant is discontinued, the product produces no rows.
- A product **without** variants (empty or missing) produces one row for itself: \`parent_sku\` is empty, attributes and stock come from the product.
- \`color\` and \`size\` are taken from the attributes, matching the name **case-insensitively**; a missing attribute is an empty field.
- \`title\` = product title, followed by \`" - "\` and the present values of color and size joined with \`" / "\`; when neither exists, just the product title.
- \`price\` with exactly two decimals; \`quantity\` = sum over all warehouses (\`0\` when \`stock\` is empty or missing).
- Columns in this order: \`parent_sku, sku, title, color, size, price, quantity\`, separated by a **tab**, header included.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{
  "products": [
    {
      "sku": "TEE-100",
      "title": "Organic Cotton Tee",
      "price": 19.99,
      "variants": [
        { "sku": "TEE-100-NAV-M", "price": null, "status": "ACTIVE",
          "attributes": [ { "name": "Color", "value": "Navy" }, { "name": "Size", "value": "M" } ],
          "stock": { "DC1": 4, "DC2": 6 } },
        { "sku": "TEE-100-NAV-L", "price": 21.5, "status": "ACTIVE",
          "attributes": [ { "name": "size", "value": "L" }, { "name": "color", "value": "Navy" } ],
          "stock": { "DC1": 0 } },
        { "sku": "TEE-100-RED-S", "price": null, "status": "DISCONTINUED",
          "attributes": [ { "name": "Color", "value": "Red" }, { "name": "Size", "value": "S" } ],
          "stock": { "DC1": 2 } }
      ]
    },
    {
      "sku": "MUG-200",
      "title": "Enamel Camp Mug",
      "price": 12,
      "attributes": [ { "name": "COLOR", "value": "White" } ],
      "stock": { "DC1": 15 },
      "variants": []
    },
    {
      "sku": "CAP-300",
      "title": "Wool Cap",
      "price": 24,
      "variants": [
        { "sku": "CAP-300-GRY", "price": null, "status": "ACTIVE",
          "attributes": [ { "name": "Color", "value": "Grey" } ], "stock": {} }
      ]
    }
  ]
}`,
    },
  ],
  expected: {
    mime: 'application/csv',
    content: `parent_sku\tsku\ttitle\tcolor\tsize\tprice\tquantity
TEE-100\tTEE-100-NAV-M\tOrganic Cotton Tee - Navy / M\tNavy\tM\t19.99\t10
TEE-100\tTEE-100-NAV-L\tOrganic Cotton Tee - Navy / L\tNavy\tL\t21.50\t0
\tMUG-200\tEnamel Camp Mug - White\tWhite\t\t12.00\t15
CAP-300\tCAP-300-GRY\tWool Cap - Grey\tGrey\t\t24.00\t0`,
  },
  starterCode: `%dw 2.0
output application/csv
---
payload.products
`,
  hints: [
    '`flatMap` over the products: each product returns an array of rows (zero, one or many).',
    'Write a small function `attr(attrs, name)` that filters `attrs default []` on `lower($.name) == name` and returns `[0].value` — on an empty result that is simply `null`.',
    '`valuesOf(stock default {})` gives the warehouse quantities; `sum([])` is `0`.',
    'For the title, put color and size in an array, `filter ($ != null)`, and `joinBy " / "`.',
    'The tab separator is a writer property: `output application/csv separator="\\t"`.',
  ],
  solution: `%dw 2.0
output application/csv separator="\\t"
fun attr(attrs, name) = ((attrs default []) filter (lower($.name) == name))[0].value
fun row(parentSku, product, item) = do {
  var color = attr(item.attributes, "color")
  var size = attr(item.attributes, "size")
  var extras = [color, size] filter ($ != null)
  ---
  {
    parent_sku: parentSku,
    sku: item.sku,
    title: if (isEmpty(extras)) product.title else product.title ++ " - " ++ (extras joinBy " / "),
    color: color,
    size: size,
    price: (item.price default product.price) as String {format: "0.00"},
    quantity: sum(valuesOf(item.stock default {}))
  }
}
---
payload.products flatMap (p) ->
  if (isEmpty(p.variants default []))
    [ row(null, p, p) ]
  else
    (p.variants filter ($.status != "DISCONTINUED")) map (v) -> row(p.sku, p, v)`,
  explanation: `
**One-to-many with a fallback.** \`flatMap\` lets every product decide how many rows it contributes: one per active variant, exactly one for a simple product, or none when all variants are discontinued. Note the difference between "has no variants" (a simple product, sell it) and "has only discontinued variants" (nothing to sell) — the \`isEmpty\` test is done on the **unfiltered** variants for exactly that reason.

**One row builder.** Simple products and variants have the same shape (\`attributes\`, \`stock\`, \`price\`), so \`row(parentSku, product, item)\` serves both; the simple product is passed as its own item.

**Case-insensitive lookup.** \`lower($.name) == "color"\` matches \`Color\`, \`color\` and \`COLOR\`. \`[][0]\` is \`null\` and \`null.value\` is \`null\`, so a missing attribute needs no special code.

**Inheritance.** \`item.price default product.price\` — \`default\` replaces \`null\` (and missing), which is exactly the "use the parent value" rule. It would **not** replace \`0\`, which is good: a variant explicitly priced at 0 is a data problem to be caught, not silently overridden.

**TSV.** \`separator="\\t"\` switches the CSV writer to tabs. All rows have the same keys in the same order, so the header (taken from the first row) is right for every row; \`null\` becomes an empty field. Tabs in a title would break the file — real feeds strip them from free text.
`,
  tests: [
    {
      name: 'All variants discontinued and no attributes',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content:
            '{ "products": [ { "sku": "OLD-1", "title": "Retired Scarf", "price": 9, "variants": [ { "sku": "OLD-1-A", "price": null, "status": "DISCONTINUED", "attributes": [], "stock": { "DC1": 3 } } ] }, { "sku": "BOOK-9", "title": "Field Guide", "price": 15.5 } ] }',
        },
      ],
      expected: 'parent_sku\tsku\ttitle\tcolor\tsize\tprice\tquantity\n\tBOOK-9\tField Guide\t\t\t15.50\t0',
    },
    {
      name: 'Size only, stock across three warehouses',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content:
            '{ "products": [ { "sku": "SOCK-5", "title": "Hiking Socks", "price": 7.95, "variants": [ { "sku": "SOCK-5-43", "price": 8.25, "status": "ACTIVE", "attributes": [ { "name": "SIZE", "value": "43-46" } ], "stock": { "DC1": 5, "DC2": 0, "STORE-14": 2 } } ] } ] }',
        },
      ],
      expected:
        'parent_sku\tsku\ttitle\tcolor\tsize\tprice\tquantity\nSOCK-5\tSOCK-5-43\tHiking Socks - 43-46\t\t43-46\t8.25\t7',
    },
  ],
  followUps: [
    {
      q: 'The marketplace needs every attribute as its own column, but the attribute set differs per category. How would you build the header?',
      a: 'Collect the distinct attribute names over all rows first (`flatMap` + `distinctBy`), then build every row with all of those keys (missing ones `null`). The CSV writer takes the header from the first row only, so every row must carry the full key set.',
    },
    {
      q: 'Should the quantity include store stock?',
      a: 'Usually not all of it: retailers publish available-to-sell = warehouse stock minus reservations minus a safety buffer, and only include stores that do ship-from-store. That logic is better computed in the inventory service than in the feed mapping.',
    },
    {
      q: 'The feed has 200,000 rows and is uploaded by SFTP every night. Any concerns with this script?',
      a: 'It is a single forward pass with no `groupBy`/`orderBy` over the whole payload, so the CSV writer can stream it. The JSON input itself is the bottleneck; with a streaming JSON reader and deferred output it can be written without materialising everything.',
    },
  ],
}
