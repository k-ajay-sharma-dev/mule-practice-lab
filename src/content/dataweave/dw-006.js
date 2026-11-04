export default {
  id: 'dw-006',
  category: 'dataweave',
  title: 'Build a Purchase Order XML',
  level: 'INTERMEDIATE',
  tags: ['xml', 'attributes', 'conditional'],
  estMinutes: 20,
  description: `
The supplier portal accepts purchase orders only as XML. Convert the JSON order into this structure:

- Root \`PurchaseOrder\` with attributes \`number\` and \`date\`
- \`Supplier\` with attribute \`id\` and the supplier name as text
- \`Items\` containing one \`Item\` per line, with attribute \`line\` and child elements \`Sku\`, \`Quantity\`, \`UnitPrice\`
- \`Note\` appears **only** when the line has a note

See the expected output for the exact element names.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{
  "poNumber": "PO-7781",
  "orderDate": "2026-10-30",
  "supplier": { "id": "SUP-12", "name": "Nordic Parts AB" },
  "items": [
    { "line": 1, "sku": "NP-100", "qty": 10, "price": 4.5 },
    { "line": 2, "sku": "NP-220", "qty": 2, "price": 120, "note": "Fragile" }
  ]
}`,
    },
  ],
  expected: {
    mime: 'application/xml',
    content: `<?xml version='1.0' encoding='UTF-8'?>
<PurchaseOrder number="PO-7781" date="2026-10-30">
  <Supplier id="SUP-12">Nordic Parts AB</Supplier>
  <Items>
    <Item line="1">
      <Sku>NP-100</Sku>
      <Quantity>10</Quantity>
      <UnitPrice>4.5</UnitPrice>
    </Item>
    <Item line="2">
      <Sku>NP-220</Sku>
      <Quantity>2</Quantity>
      <UnitPrice>120</UnitPrice>
      <Note>Fragile</Note>
    </Item>
  </Items>
</PurchaseOrder>`,
  },
  starterCode: `%dw 2.0
output application/xml
---
payload
`,
  hints: [
    'Attributes use `@(...)` after the key: `PurchaseOrder @(number: payload.poNumber): { ... }`.',
    'XML needs repeated keys, not an array. Wrap the `map` in parentheses inside an object to spread the results: `Items: { (payload.items map ...) }`.',
    'A conditional field: `(Note: i.note) if (i.note != null)`.',
  ],
  solution: `%dw 2.0
output application/xml
---
{
  PurchaseOrder @(number: payload.poNumber, date: payload.orderDate): {
    Supplier @(id: payload.supplier.id): payload.supplier.name,
    Items: {
      (payload.items map (i) -> {
        Item @(line: i.line): {
          Sku: i.sku,
          Quantity: i.qty,
          UnitPrice: i.price,
          (Note: i.note) if (i.note != null)
        }
      })
    }
  }
}`,
  explanation:
    'An array inside an XML element has no direct representation, so you turn it into repeated `Item` keys by spreading `(array)` into an object.',
  tests: [
    {
      name: 'Single line without note',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: `{ "poNumber": "PO-1", "orderDate": "2026-01-02", "supplier": { "id": "S-1", "name": "Acme" },
  "items": [{ "line": 1, "sku": "X", "qty": 1, "price": 9.99 }] }`,
        },
      ],
      expected: `<PurchaseOrder number="PO-1" date="2026-01-02">
  <Supplier id="S-1">Acme</Supplier>
  <Items>
    <Item line="1"><Sku>X</Sku><Quantity>1</Quantity><UnitPrice>9.99</UnitPrice></Item>
  </Items>
</PurchaseOrder>`,
    },
  ],
}
