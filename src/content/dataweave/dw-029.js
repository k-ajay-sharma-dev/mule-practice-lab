export default {
  id: 'dw-029',
  category: 'dataweave',
  title: 'Build a Namespaced SOAP Reservation Request',
  level: 'ADVANCED',
  tags: ['xml', 'namespaces', 'soap', 'attributes', 'map'],
  estMinutes: 25,
  description: `
The legacy Warehouse service only speaks SOAP 1.1. Convert the JSON reservation into a SOAP envelope that uses **three namespaces** with these exact prefixes:

| Prefix | URI | Used for |
|---|---|---|
| \`soapenv\` | \`http://schemas.xmlsoap.org/soap/envelope/\` | \`Envelope\`, \`Header\`, \`Body\` |
| \`sec\` | \`http://example.com/security/v1\` | \`Client\`, \`ClientId\` (inside the header) |
| \`inv\` | \`http://example.com/inventory/v2\` | everything inside the body |

**Structure**
- \`soapenv:Header\` contains \`sec:Client\` → \`sec:ClientId\` (from \`clientId\`).
- \`soapenv:Body\` contains \`inv:ReserveStock\` with a plain (un-prefixed) attribute \`requestId\`, then \`inv:Warehouse\` and \`inv:Lines\`.
- \`inv:Lines\` has one \`inv:Line\` per item, with a plain attribute \`number\` = the item's **1-based position**, and children \`inv:Sku\`, \`inv:Quantity\` and — only when the item has a \`lot\` — \`inv:Lot\`.

Declare the namespaces with \`ns\` directives and let the writer place them: each \`xmlns:...\` declaration appears on the first element that uses that prefix (see the expected output).
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{
  "requestId": "R-2026-0042",
  "clientId": "mule-oms",
  "warehouse": "AMS-1",
  "items": [
    { "sku": "A-1", "qty": 2 },
    { "sku": "B-2", "qty": 1, "lot": "L77" }
  ]
}`,
    },
  ],
  expected: {
    mime: 'application/xml',
    content: `<?xml version='1.0' encoding='UTF-8'?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Header>
    <sec:Client xmlns:sec="http://example.com/security/v1">
      <sec:ClientId>mule-oms</sec:ClientId>
    </sec:Client>
  </soapenv:Header>
  <soapenv:Body>
    <inv:ReserveStock xmlns:inv="http://example.com/inventory/v2" requestId="R-2026-0042">
      <inv:Warehouse>AMS-1</inv:Warehouse>
      <inv:Lines>
        <inv:Line number="1">
          <inv:Sku>A-1</inv:Sku>
          <inv:Quantity>2</inv:Quantity>
        </inv:Line>
        <inv:Line number="2">
          <inv:Sku>B-2</inv:Sku>
          <inv:Quantity>1</inv:Quantity>
          <inv:Lot>L77</inv:Lot>
        </inv:Line>
      </inv:Lines>
    </inv:ReserveStock>
  </soapenv:Body>
</soapenv:Envelope>`,
  },
  starterCode: `%dw 2.0
output application/xml
---
payload
`,
  hints: [
    'Declare each namespace in the header: `ns inv http://example.com/inventory/v2`. Then use it in a key with `#`: `inv#Warehouse`.',
    'Repeated `inv:Line` elements come from spreading a mapped array into an object: `inv#Lines: { (payload.items map (item, i) -> { inv#Line @(number: i + 1): { ... } }) }`.',
    'The optional element is a conditional field: `(inv#Lot: item.lot) if (item.lot != null)`.',
  ],
  solution: `%dw 2.0
output application/xml
ns soapenv http://schemas.xmlsoap.org/soap/envelope/
ns sec http://example.com/security/v1
ns inv http://example.com/inventory/v2
---
{
  soapenv#Envelope: {
    soapenv#Header: {
      sec#Client: {
        sec#ClientId: payload.clientId
      }
    },
    soapenv#Body: {
      inv#ReserveStock @(requestId: payload.requestId): {
        inv#Warehouse: payload.warehouse,
        inv#Lines: {
          (payload.items map (item, i) -> {
            inv#Line @(number: i + 1): {
              inv#Sku: item.sku,
              inv#Quantity: item.qty,
              (inv#Lot: item.lot) if (item.lot != null)
            }
          })
        }
      }
    }
  }
}`,
  explanation: `
\`ns prefix uri\` declares a namespace; \`prefix#Name\` creates a **qualified** key. The writer emits the \`xmlns:prefix\` declaration on the first element that needs it, so \`sec\` lands on \`sec:Client\` and \`inv\` on \`inv:ReserveStock\`.

Common traps:
- Writing \`"inv:Warehouse"\` as a plain string key. It *looks* right, but there is no namespace declaration, so the XML is not namespace-well-formed and a SOAP server rejects it.
- Adding \`@(xmlns:inv: ...)\` by hand: the writer still manages declarations itself, so you end up with duplicates.
- Forgetting that attributes are **not** in the element's namespace unless you prefix them (\`@(inv#requestId: ...)\`). Here the service expects plain attributes.
- \`map\` passes the index as the second lambda parameter, **zero-based** — hence \`i + 1\`.
`,
  tests: [
    {
      name: 'Single item with a lot',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '{ "requestId": "R-1", "clientId": "c", "warehouse": "RTM-2", "items": [{ "sku": "Q", "qty": 9, "lot": "X1" }] }',
        },
      ],
      expected: `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Header>
    <sec:Client xmlns:sec="http://example.com/security/v1"><sec:ClientId>c</sec:ClientId></sec:Client>
  </soapenv:Header>
  <soapenv:Body>
    <inv:ReserveStock xmlns:inv="http://example.com/inventory/v2" requestId="R-1">
      <inv:Warehouse>RTM-2</inv:Warehouse>
      <inv:Lines>
        <inv:Line number="1"><inv:Sku>Q</inv:Sku><inv:Quantity>9</inv:Quantity><inv:Lot>X1</inv:Lot></inv:Line>
      </inv:Lines>
    </inv:ReserveStock>
  </soapenv:Body>
</soapenv:Envelope>`,
    },
  ],
  followUps: [
    {
      q: 'How would you call this SOAP service from Mule?',
      a: 'Use the Web Service Consumer connector with the WSDL; it builds the envelope and you only produce the body element. Building the full envelope by hand is useful with a plain HTTP Request when no WSDL is available.',
    },
    {
      q: 'How do you write a namespaced attribute or a default (unprefixed) namespace?',
      a: 'A namespaced attribute uses the prefix in the attribute key: `@(inv#requestId: ...)`. For a default namespace, add `xmlns: "uri"` as an attribute on the element and use un-prefixed child keys, or declare it with `ns` and qualify the keys.',
    },
    {
      q: 'How do you get rid of the XML declaration or the indentation?',
      a: 'Writer properties: `output application/xml writeDeclaration=false, indent=false`.',
    },
  ],
}
