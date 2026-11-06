export default {
  id: 'dw-113',
  category: 'dataweave',
  title: 'Total a Shipment Weight with sum',
  level: 'BEGINNER',
  tags: ['sum', 'selectors', 'json'],
  estMinutes: 10,
  description: `
A carrier charges by the total weight of a shipment. The warehouse sends one shipment with a list of parcels.

Use \`sum\` to add up the weights. \`sum\` takes an array of numbers and returns their total.

Output:

- \`shipmentId\`: copied as it is
- \`totalWeightKg\`: the total of every parcel's \`weightKg\`

Every shipment has at least one parcel.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{
  "shipmentId": "SH-7001",
  "parcels": [
    { "parcelId": "P-1", "weightKg": 2.5 },
    { "parcelId": "P-2", "weightKg": 7 },
    { "parcelId": "P-3", "weightKg": 0.75 }
  ]
}`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "shipmentId": "SH-7001",
  "totalWeightKg": 10.25
}`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload
`,
  hints: [
    '`payload.parcels.weightKg` reads `weightKg` from every parcel and gives you an array of numbers.',
    'Pass that array to `sum`, inside its round brackets.',
  ],
  solution: `%dw 2.0
output application/json
---
{
  shipmentId: payload.shipmentId,
  totalWeightKg: sum(payload.parcels.weightKg)
}`,
  explanation: 'When you use a selector on an array, it reads that field from every item. So `payload.parcels.weightKg` is an array of weights, and that is the array `sum` needs.',
  tests: [
    {
      name: 'One parcel',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '{ "shipmentId": "SH-2", "parcels": [{ "parcelId": "P-9", "weightKg": 12 }] }',
        },
      ],
      expected: '{ "shipmentId": "SH-2", "totalWeightKg": 12 }',
    },
    {
      name: 'Small decimal weights',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '{ "shipmentId": "SH-3", "parcels": [{ "parcelId": "P-1", "weightKg": 0.1 }, { "parcelId": "P-2", "weightKg": 0.2 }] }',
        },
      ],
      expected: '{ "shipmentId": "SH-3", "totalWeightKg": 0.3 }',
    },
  ],
}
