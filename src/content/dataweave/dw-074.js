export default {
  id: 'dw-074',
  category: 'dataweave',
  title: 'Export a PIM Catalogue XML as CSV for Azure Blob Storage',
  level: 'ADVANCED',
  tags: ['xml', 'csv', 'azure-blob', 'namespaces', 'writer-properties', 'escaping'],
  estMinutes: 30,
  description: `
Every night the product information system (PIM) exports its catalogue as XML. A scheduled Mule flow converts it to CSV and stores it with the Azure Storage connector's **Upload Blob** operation in the \`analytics\` container, where a data platform loads it.

**Formats**
- The catalogue uses a **default namespace** (\`xmlns="urn:example:pim:catalogue:v3"\`).
- The loader follows RFC 4180: fields are enclosed in double quotes and a quote **inside** a value is written as two quotes (\`""\`).
- A backslash is not an escape character for the loader.

**Rules**
- Only products with \`status="ACTIVE"\`.
- Columns, in this order: \`SKU,NAME,BRAND,CATEGORY,PRICE,CURRENCY,IN_STOCK,TAGS\`.
  - \`SKU\` and \`CATEGORY\` come from the \`sku\` attribute and the \`path\` attribute of \`category\`.
  - \`PRICE\` with exactly 2 decimals; \`CURRENCY\` from the \`currency\` attribute of \`price\`.
  - \`IN_STOCK\` is \`Y\` when \`stock\` > 0, otherwise \`N\` (a missing \`stock\` counts as 0).
  - \`TAGS\`: all \`tag\` values joined with \`|\` (empty when there are none).
- Sort by \`CATEGORY\`, then \`SKU\`.
- Header row unquoted; **every** data value enclosed in double quotes, embedded quotes doubled.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/xml',
      content: `<catalogue xmlns="urn:example:pim:catalogue:v3" exportedAt="2026-11-02T22:00:00Z">
  <product sku="KT-1001" status="ACTIVE">
    <name>Chef's knife 20 cm</name>
    <brand>Solingen Steel</brand>
    <category path="Kitchen/Knives"/>
    <price currency="EUR">89.95</price>
    <stock>14</stock>
    <tags><tag>knife</tag><tag>gift</tag></tags>
  </product>
  <product sku="KT-1002" status="DISCONTINUED">
    <name>Bread knife 22 cm</name>
    <brand>Solingen Steel</brand>
    <category path="Kitchen/Knives"/>
    <price currency="EUR">59.00</price>
    <stock>3</stock>
  </product>
  <product sku="KT-1003" status="ACTIVE">
    <name>Cutting board, oak, "XL"</name>
    <brand>Hout &amp; Co</brand>
    <category path="Kitchen/Boards"/>
    <price currency="EUR">45</price>
    <stock>0</stock>
  </product>
  <product sku="GD-2001" status="ACTIVE">
    <name>Garden hose 25 m</name>
    <brand>AquaFlow</brand>
    <category path="Garden/Watering"/>
    <price currency="EUR">32.5</price>
    <stock>120</stock>
    <tags><tag>hose</tag></tags>
  </product>
</catalogue>`,
    },
  ],
  expected: {
    mime: 'application/csv',
    content: `SKU,NAME,BRAND,CATEGORY,PRICE,CURRENCY,IN_STOCK,TAGS
"GD-2001","Garden hose 25 m","AquaFlow","Garden/Watering","32.50","EUR","Y","hose"
"KT-1003","Cutting board, oak, ""XL""","Hout & Co","Kitchen/Boards","45.00","EUR","N",""
"KT-1001","Chef's knife 20 cm","Solingen Steel","Kitchen/Knives","89.95","EUR","Y","knife|gift"`,
  },
  starterCode: `%dw 2.0
output application/csv
---
payload.catalogue.*product map (p) -> {
  SKU: p.@sku
}
`,
  hints: [
    'An unprefixed selector such as `payload.catalogue.*product` matches on the local name, so the default namespace does not get in the way here.',
    'Writer properties: `quoteValues=true` quotes every value; `escape=\'"\'` makes the writer double embedded quotes. The default escape character is a backslash, which produces `\\"` — not RFC 4180.',
    '`p.tags.*tag default []` gives an array (possibly empty); `joinBy "|"` turns it into one field.',
    'Sort with `orderBy` on a composite key — but only after `map`, so the column names exist: `orderBy ($.CATEGORY ++ "|" ++ $.SKU)`. Put the `filter ... map` part in parentheses first, or `orderBy` is applied inside the `map` lambda.',
  ],
  solution: `%dw 2.0
output application/csv quoteValues=true, escape='"'
---
((payload.catalogue.*product default [])
  filter ($.@status == "ACTIVE")
  map (p) -> {
    SKU: p.@sku,
    NAME: p.name,
    BRAND: p.brand,
    CATEGORY: p.category.@path,
    PRICE: p.price as Number as String { format: "0.00" },
    CURRENCY: p.price.@currency,
    IN_STOCK: if ((p.stock default "0") as Number > 0) "Y" else "N",
    TAGS: (p.tags.*tag default []) joinBy "|"
  })
  orderBy ($.CATEGORY ++ "|" ++ $.SKU)`,
  explanation: `
**Default namespace.** All elements are in \`urn:example:pim:catalogue:v3\`. A selector without a namespace (\`.product\`) matches on the local name, so it still finds them; when you need to be precise (two vocabularies with the same element names), declare \`ns pim urn:example:pim:catalogue:v3\` and select \`pim#product\`.

**CSV escaping is a contract.** With its defaults, the DataWeave CSV writer does not quote values; it escapes special characters with a backslash, so \`Cutting board, oak, "XL"\` would be written as \`Cutting board\\, oak\\, \\"XL\\"\` — readable by DataWeave, but loaders that follow RFC 4180 (spreadsheet tools, many data platform loaders) misread the row. Setting \`escape='"'\` doubles embedded quotes, and \`quoteValues=true\` quotes every value, so a value that later gains a comma or quote can never shift the columns.

**XML entities are decoded.** \`Hout &amp; Co\` is read as \`Hout & Co\`; CSV has no entities, so the plain text is written.

**Formatting.** \`45\` and \`32.5\` become \`45.00\` and \`32.50\` with \`as String { format: "0.00" }\`; the value is coerced to a number first because XML text is a string.

**Upload.** The CSV output is the payload of the Upload Blob operation; include the export date in the blob name (for example \`catalogue/2026-11-02/products.csv\` — folders in a container are just prefixes in the blob name) so each night's file is kept separately.
`,
  tests: [
    {
      name: 'Missing stock counts as out of stock',
      inputs: [
        {
          name: 'payload',
          mime: 'application/xml',
          content:
            '<catalogue xmlns="urn:example:pim:catalogue:v3"><product sku="OF-0007" status="ACTIVE"><name>Desk organiser "Mini", grey</name><brand>Office Line</brand><category path="Office/Desk"/><price currency="USD">7</price><tags><tag>desk</tag><tag>storage</tag><tag>sale</tag></tags></product><product sku="OF-0001" status="BLOCKED"><name>Stapler</name><brand>Office Line</brand><category path="Office/Desk"/><price currency="USD">12.00</price><stock>40</stock></product></catalogue>',
        },
      ],
      expected: `SKU,NAME,BRAND,CATEGORY,PRICE,CURRENCY,IN_STOCK,TAGS
"OF-0007","Desk organiser ""Mini"", grey","Office Line","Office/Desk","7.00","USD","N","desk|storage|sale"`,
    },
  ],
  followUps: [
    {
      q: 'The export is 300 MB of XML. What do you change?',
      a: 'Enable the XML reader\'s streaming mode and avoid operations that need the whole document — `orderBy` does, so either sort in the source export or drop the sort requirement and let the consumer order the data. Write the CSV as a stream into the upload.',
    },
    {
      q: 'The upload fails with HTTP 403 AuthenticationFailed after months of working. Likely cause?',
      a: 'The SAS token used by the connection has expired (or its permissions/IP range no longer match). Rotate it — ideally from a secrets store with an alert before expiry — rather than switching to the account key, which grants full access to the storage account.',
    },
  ],
}
