export default {
  id: 'dw-117',
  category: 'dataweave',
  title: 'Send a Shipment to a Carrier as Simple XML',
  level: 'BEGINNER',
  tags: ['xml', 'json', 'data-formats', 'selectors'],
  estMinutes: 10,
  description: `
Your warehouse system holds each shipment as JSON. The carrier only accepts XML, so a Mule flow must convert the shipment before sending it.

Build this XML from \`payload\`:

| Element | Source |
|---|---|
| \`Shipment\` | the outer element that holds all the others |
| \`TrackingNumber\` | \`trackingNumber\` |
| \`Customer\` | \`customer\` |
| \`City\` | \`city\` |
| \`WeightKg\` | \`weightKg\` |

An XML document must have exactly one outer element. It is called the **root element**. Here the root is \`Shipment\`.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{
  "trackingNumber": "TRK-4471",
  "customer": "Anna Berg",
  "city": "Leeds",
  "weightKg": 2.5
}`,
    },
  ],
  expected: {
    mime: 'application/xml',
    content: `<?xml version='1.0' encoding='UTF-8'?>
<Shipment>
  <TrackingNumber>TRK-4471</TrackingNumber>
  <Customer>Anna Berg</Customer>
  <City>Leeds</City>
  <WeightKg>2.5</WeightKg>
</Shipment>`,
  },
  starterCode: `%dw 2.0
output application/xml
---
{
  Shipment: {
    TrackingNumber: payload.trackingNumber
  }
}
`,
  hints: [
    'Each key in your object becomes an XML element, and the value becomes the text inside it.',
    'The object you return needs one top-level key, `Shipment`. Put the other four keys inside it.',
    'Key names are written to the XML exactly as you type them, so use `WeightKg` and not `weightKg`.',
  ],
  solution: `%dw 2.0
output application/xml
---
{
  Shipment: {
    TrackingNumber: payload.trackingNumber,
    Customer: payload.customer,
    City: payload.city,
    WeightKg: payload.weightKg
  }
}`,
  explanation: `
With \`output application/xml\`, DataWeave writes your object as XML. A key becomes an element name. A nested object becomes child elements.

The important rule is the single root. If you return \`payload\` as it stands, the script fails with an error about a second root, because the object has four top-level keys and XML allows one. Wrapping everything in \`Shipment\` fixes that.

You don't handle special characters yourself. The writer turns \`&\` in a value into \`&amp;\`, which keeps the XML valid.
`,
  tests: [
    {
      name: 'A customer name with an ampersand',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '{ "trackingNumber": "TRK-9001", "customer": "Hall & Sons", "city": "York", "weightKg": 12 }',
        },
      ],
      expected: `<Shipment>
  <TrackingNumber>TRK-9001</TrackingNumber>
  <Customer>Hall &amp; Sons</Customer>
  <City>York</City>
  <WeightKg>12</WeightKg>
</Shipment>`,
    },
  ],
  followUps: [
    {
      q: 'What happens if the script returns `payload` with no wrapping key?',
      a: 'It fails with a "second root" error when the object has more than one top-level key. XML allows only one root element.',
    },
    {
      q: 'The carrier now wants the tracking number as an attribute on `Shipment`. How do you write that?',
      a: 'Put `@(...)` after the key: `Shipment @(id: payload.trackingNumber): { ... }` gives `<Shipment id="TRK-4471">`.',
    },
    {
      q: 'What does the XML show if `city` is missing from the JSON?',
      a: 'The selector gives `null`, and the writer produces an empty element, `<City/>`. The script does not fail.',
    },
  ],
}
