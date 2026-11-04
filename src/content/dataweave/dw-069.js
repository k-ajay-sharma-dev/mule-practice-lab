export default {
  id: 'dw-069',
  category: 'dataweave',
  title: 'Build a Namespaced Invoice XML for a Supplier Portal',
  level: 'INTERMEDIATE',
  tags: ['xml', 'json', 'namespaces', 'attributes', 'xsi-nil', 'formatting'],
  estMinutes: 25,
  description: `
A procurement platform accepts supplier invoices only as XML that validates against its \`invoice-v2.xsd\`. The Mule API receives the invoice as JSON and must produce that XML.

**Target format**
- One root element \`Invoice\` in the namespace \`urn:acme:invoice:v2\` with prefix \`inv\`; **every** element uses this namespace.
- The root declares the XML Schema instance namespace (\`http://www.w3.org/2001/XMLSchema-instance\`, prefix \`xsi\`) and carries \`xsi:schemaLocation="urn:acme:invoice:v2 invoice-v2.xsd"\`, followed by the attributes \`number\` and \`currency\`.
- \`IssueDate\` — the issue date.
- \`PurchaseOrderRef\` — the PO reference. The XSD makes it nillable: when it is \`null\`, write an empty element with \`xsi:nil="true"\`.
- \`Supplier\` — the supplier name as text, with attribute \`vatId\`.
- \`Lines\` with attribute \`count\`, containing one \`Line\` per input line with attributes \`no\` (1-based position) and \`sku\`, and children \`Description\`, \`Quantity\`, \`UnitPrice\` and \`Amount\` (\`qty * unitPrice\`).
- \`Total\` — sum of the line amounts.
- \`UnitPrice\`, \`Amount\` and \`Total\` always have 2 decimals.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{
  "invoiceNumber": "INV-2026-04711",
  "issueDate": "2026-11-02",
  "currency": "EUR",
  "purchaseOrderRef": null,
  "supplier": { "vatId": "NL859966521B01", "name": "Noordzee Packaging BV" },
  "lines": [
    { "sku": "BOX-40", "description": "Shipping box 40x30x20", "qty": 200, "unitPrice": 0.85 },
    { "sku": "TAPE-50", "description": "Packing tape 50 mm", "qty": 36, "unitPrice": 2.1 }
  ]
}`,
    },
  ],
  expected: {
    mime: 'application/xml',
    content: `<?xml version='1.0' encoding='UTF-8'?>
<inv:Invoice xmlns:inv="urn:acme:invoice:v2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="urn:acme:invoice:v2 invoice-v2.xsd" number="INV-2026-04711" currency="EUR">
  <inv:IssueDate>2026-11-02</inv:IssueDate>
  <inv:PurchaseOrderRef xsi:nil="true"/>
  <inv:Supplier vatId="NL859966521B01">Noordzee Packaging BV</inv:Supplier>
  <inv:Lines count="2">
    <inv:Line no="1" sku="BOX-40">
      <inv:Description>Shipping box 40x30x20</inv:Description>
      <inv:Quantity>200</inv:Quantity>
      <inv:UnitPrice>0.85</inv:UnitPrice>
      <inv:Amount>170.00</inv:Amount>
    </inv:Line>
    <inv:Line no="2" sku="TAPE-50">
      <inv:Description>Packing tape 50 mm</inv:Description>
      <inv:Quantity>36</inv:Quantity>
      <inv:UnitPrice>2.10</inv:UnitPrice>
      <inv:Amount>75.60</inv:Amount>
    </inv:Line>
  </inv:Lines>
  <inv:Total>245.60</inv:Total>
</inv:Invoice>`,
  },
  starterCode: `%dw 2.0
output application/xml
---
payload
`,
  hints: [
    'Declare namespaces in the header: `ns inv urn:acme:invoice:v2` and `ns xsi http://www.w3.org/2001/XMLSchema-instance`. Then write keys as `inv#Invoice`.',
    'Attributes go between the key and the colon: `inv#Invoice @(xsi#schemaLocation: "...", number: ...): { ... }`. Attribute order in `@( )` is the output order.',
    'Conditional attribute: `@((xsi#nil: true) if (payload.purchaseOrderRef == null))`.',
    'To repeat `Line` elements inside `Lines`, map the lines to objects and spread them with `{ (lines map ...) }`.',
    'Format numbers with `as String { format: "0.00" }`.',
  ],
  solution: `%dw 2.0
output application/xml
ns inv urn:acme:invoice:v2
ns xsi http://www.w3.org/2001/XMLSchema-instance
fun money(n) = n as String { format: "0.00" }
var lines = payload.lines default []
---
inv#Invoice @(
  xsi#schemaLocation: "urn:acme:invoice:v2 invoice-v2.xsd",
  number: payload.invoiceNumber,
  currency: payload.currency
): {
  inv#IssueDate: payload.issueDate,
  inv#PurchaseOrderRef @((xsi#nil: true) if (payload.purchaseOrderRef == null)): payload.purchaseOrderRef,
  inv#Supplier @(vatId: payload.supplier.vatId): payload.supplier.name,
  inv#Lines @(count: sizeOf(lines)): {
    (lines map (l, i) -> inv#Line @(no: i + 1, sku: l.sku): {
      inv#Description: l.description,
      inv#Quantity: l.qty,
      inv#UnitPrice: money(l.unitPrice),
      inv#Amount: money(l.qty * l.unitPrice)
    })
  },
  inv#Total: money(sum(lines map ($.qty * $.unitPrice)))
}`,
  explanation: `
**Namespaces.** \`ns inv urn:acme:invoice:v2\` binds a prefix to a URI for the script; \`inv#Invoice\` creates an element in that namespace. The writer declares a namespace on the first element that needs it — here the root — and nested elements reuse the declaration. What the XSD validates is the **URI**; the prefix is only a local alias.

**Namespaced attributes.** \`xsi#schemaLocation\` and \`xsi#nil\` are attributes in the XML Schema instance namespace, so \`xsi\` is declared on the root as well.

**Nillable vs. omitted.** For a \`nillable="true"\` element with \`minOccurs="1"\`, leaving the element out fails validation, and an empty \`<inv:PurchaseOrderRef/>\` means "empty string", not "no value". The explicit \`xsi:nil="true"\` is the XSD way of saying null. The conditional attribute syntax \`@((xsi#nil: true) if cond)\` adds it only when needed.

**Repeating elements.** An XML object cannot contain an array, so the lines are mapped to single-key objects and spread into \`Lines\` with \`{ ( ... ) }\`, producing repeated \`inv:Line\` keys.

**Money formatting.** \`2.1\` must be written as \`2.10\`: \`as String { format: "0.00" }\` fixes the number of decimals. Keep the arithmetic on numbers and format only at the end, so \`Total\` is the sum of the exact amounts.
`,
  tests: [
    {
      name: 'PO reference present, single line',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content:
            '{ "invoiceNumber": "INV-2026-04712", "issueDate": "2026-11-03", "currency": "EUR", "purchaseOrderRef": "PO-88120", "supplier": { "vatId": "NL859966521B01", "name": "Noordzee Packaging BV" }, "lines": [ { "sku": "PAL-EU", "description": "Euro pallet", "qty": 12, "unitPrice": 14 } ] }',
        },
      ],
      expected: `<?xml version='1.0' encoding='UTF-8'?>
<inv:Invoice xmlns:inv="urn:acme:invoice:v2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="urn:acme:invoice:v2 invoice-v2.xsd" number="INV-2026-04712" currency="EUR">
  <inv:IssueDate>2026-11-03</inv:IssueDate>
  <inv:PurchaseOrderRef>PO-88120</inv:PurchaseOrderRef>
  <inv:Supplier vatId="NL859966521B01">Noordzee Packaging BV</inv:Supplier>
  <inv:Lines count="1">
    <inv:Line no="1" sku="PAL-EU">
      <inv:Description>Euro pallet</inv:Description>
      <inv:Quantity>12</inv:Quantity>
      <inv:UnitPrice>14.00</inv:UnitPrice>
      <inv:Amount>168.00</inv:Amount>
    </inv:Line>
  </inv:Lines>
  <inv:Total>168.00</inv:Total>
</inv:Invoice>`,
    },
  ],
  followUps: [
    {
      q: 'The portal rejects the file although it looks correct. How do you catch this before sending?',
      a: 'Validate the generated XML against the same XSD in the flow with `xml-module:validate-schema`; it raises `XML-MODULE:SCHEMA_NOT_HONOURED` with the validation problems, which you can log and route to an error handler instead of discovering the rejection later.',
    },
    {
      q: 'The receiver expects prefix `ns0` instead of `inv`. Does that matter?',
      a: 'For a namespace-aware XML parser it does not: only the URI is significant. If the receiver really compares prefixes, it is a non-compliant parser; you can still satisfy it by renaming the prefix in the `ns` declaration.',
    },
  ],
}
