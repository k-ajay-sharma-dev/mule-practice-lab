export default {
  id: 'dw-140',
  category: 'dataweave',
  title: 'Summarise Courier Delivery Times with avg, min and max',
  level: 'BEGINNER',
  tags: ['avg', 'min', 'max', 'round', 'numbers', 'logistics', 'json'],
  estMinutes: 10,
  description: `
Pellham Home Goods pays a courier to take parcels from its depot to customers. The contract says each parcel should arrive within a target time. Every evening an integration gets the day's deliveries and sends a short summary to the transport manager.

Output one object with:

- \`courier\`: copied from the input
- \`parcels\`: how many deliveries there were
- \`averageMinutes\`: the average delivery time, rounded to whole minutes
- \`fastestMinutes\` and \`slowestMinutes\`: the shortest and the longest time
- \`overTarget\`: how many deliveries took longer than \`targetMinutes\`

DataWeave has \`avg\`, \`min\` and \`max\` for a list of numbers, and \`round\` for whole numbers.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{
  "courier": "Swiftline Couriers",
  "targetMinutes": 45,
  "deliveries": [
    { "parcelId": "PH-3101", "minutes": 42 },
    { "parcelId": "PH-3102", "minutes": 35 },
    { "parcelId": "PH-3103", "minutes": 58 },
    { "parcelId": "PH-3104", "minutes": 27 },
    { "parcelId": "PH-3105", "minutes": 40 }
  ]
}`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "courier": "Swiftline Couriers",
  "parcels": 5,
  "averageMinutes": 40,
  "fastestMinutes": 27,
  "slowestMinutes": 58,
  "overTarget": 1
}`,
  },
  starterCode: `%dw 2.0
output application/json
---
{
  courier: payload.courier,
  parcels: 0,
  averageMinutes: 0,
  fastestMinutes: 0,
  slowestMinutes: 0,
  overTarget: 0
}
`,
  hints: [
    'Pull the times out once: `var times = payload.deliveries map $.minutes`. Every other field reads from this list.',
    '`sizeOf(times)` counts them. `min(times)` and `max(times)` give the shortest and the longest.',
    '`avg(times)` gives 40.4 here. Wrap it in `round(...)` to get 40.',
    'For `overTarget`, filter the list and count what is left: `sizeOf(times filter ($ > payload.targetMinutes))`.',
  ],
  solution: `%dw 2.0
output application/json
var times = payload.deliveries map $.minutes
---
{
  courier: payload.courier,
  parcels: sizeOf(times),
  averageMinutes: round(avg(times)),
  fastestMinutes: min(times),
  slowestMinutes: max(times),
  overTarget: sizeOf(times filter ($ > payload.targetMinutes))
}`,
  explanation: `
**One list of numbers.** \`payload.deliveries map $.minutes\` turns the deliveries into \`[42, 35, 58, 27, 40]\`. With a plain list of numbers, each field is one short function call.

**avg and round.** The five times add up to 202, and 202 / 5 is 40.4. \`round\` gives the nearest whole number, 40.

**min and max.** They return the smallest and the largest value in the list. You do not need to sort the list first.

**Counting with filter.** \`times filter ($ > payload.targetMinutes)\` keeps only the late deliveries, here \`[58]\`. \`sizeOf\` counts them. A delivery of exactly 45 minutes is on target, because the rule is "longer than".
`,
  tests: [
    {
      name: 'A single delivery',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '{ "courier": "Fenwick Freight", "targetMinutes": 45, "deliveries": [{ "parcelId": "PH-4001", "minutes": 50 }] }',
        },
      ],
      expected: '{ "courier": "Fenwick Freight", "parcels": 1, "averageMinutes": 50, "fastestMinutes": 50, "slowestMinutes": 50, "overTarget": 1 }',
    },
    {
      name: 'Exactly on target is not late, and the average rounds down',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content:
            '{ "courier": "Swiftline Couriers", "targetMinutes": 30, "deliveries": [{ "parcelId": "PH-5001", "minutes": 30 }, { "parcelId": "PH-5002", "minutes": 12 }, { "parcelId": "PH-5003", "minutes": 13 }] }',
        },
      ],
      expected: '{ "courier": "Swiftline Couriers", "parcels": 3, "averageMinutes": 18, "fastestMinutes": 12, "slowestMinutes": 30, "overTarget": 0 }',
    },
  ],
  followUps: [
    {
      q: 'What should the summary say on a day with no deliveries?',
      a: 'Check for an empty list first with `isEmpty(times)`. There is no average of nothing, and `min` and `max` give null. Send zero parcels and leave the other fields null, or skip the summary for that day.',
    },
    {
      q: 'The manager wants the average with one decimal place. How?',
      a: 'Format the number: `avg(times) as String {format: "0.0"}` gives "40.4". Add `as Number` at the end if the receiving system wants a number and not text.',
    },
    {
      q: 'How would you show the same figures for each courier when several couriers work on one day?',
      a: 'Group the deliveries by courier with `groupBy`, then build the same object for each group with `pluck` or `mapObject`.',
    },
  ],
}
