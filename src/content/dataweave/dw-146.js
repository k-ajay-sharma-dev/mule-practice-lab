export default {
  id: 'dw-146',
  category: 'dataweave',
  title: 'Convert Imperial Parcel Sizes to Metric for a Carrier',
  level: 'BEGINNER',
  tags: ['numbers', 'round', 'units', 'map', 'variables', 'logistics', 'json'],
  estMinutes: 10,
  description: `
Bellmoor Outdoor Gear ships from a warehouse in the United States, where parcels are measured in inches and pounds. A new European carrier wants every parcel in centimetres and kilograms.

Output one object per parcel, in input order, with:

- \`parcelId\`: copied from the input
- \`lengthCm\`, \`widthCm\`, \`heightCm\`: rounded to 1 decimal place
- \`weightKg\`: rounded to 2 decimal places

Use these factors:

- 1 inch is 2.54 cm
- 1 pound is 0.45359237 kg
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `[
  { "parcelId": "BM-7001", "lengthIn": 12, "widthIn": 10, "heightIn": 6, "weightLb": 5 },
  { "parcelId": "BM-7002", "lengthIn": 20.5, "widthIn": 14, "heightIn": 8.5, "weightLb": 12.4 },
  { "parcelId": "BM-7003", "lengthIn": 6, "widthIn": 4, "heightIn": 2, "weightLb": 0.75 }
]`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `[
  { "parcelId": "BM-7001", "lengthCm": 30.5, "widthCm": 25.4, "heightCm": 15.2, "weightKg": 2.27 },
  { "parcelId": "BM-7002", "lengthCm": 52.1, "widthCm": 35.6, "heightCm": 21.6, "weightKg": 5.62 },
  { "parcelId": "BM-7003", "lengthCm": 15.2, "widthCm": 10.2, "heightCm": 5.1, "weightKg": 0.34 }
]`,
  },
  starterCode: `%dw 2.0
output application/json
var cmPerInch = 2.54
var kgPerPound = 0.45359237
---
payload map (p) -> {
  parcelId: p.parcelId,
  lengthCm: p.lengthIn * cmPerInch
}
`,
  hints: [
    'Keep the two factors in `var` lines at the top. Each field is then one multiplication.',
    '`round` gives a whole number. To keep 1 decimal place, multiply by 10, round, then divide by 10.',
    'A small function saves typing: `fun roundTo(n, places) = ...`. For 2 places the factor is 100.',
    '12 inches is 30.48 cm. With 1 decimal place that becomes 30.5.',
  ],
  solution: `%dw 2.0
output application/json
var cmPerInch = 2.54
var kgPerPound = 0.45359237

fun roundTo(n, factor) = round(n * factor) / factor
fun cm(inches) = roundTo(inches * cmPerInch, 10)
---
payload map (p) -> {
  parcelId: p.parcelId,
  lengthCm: cm(p.lengthIn),
  widthCm: cm(p.widthIn),
  heightCm: cm(p.heightIn),
  weightKg: roundTo(p.weightLb * kgPerPound, 100)
}`,
  explanation: `
**Factors as variables.** \`cmPerInch\` and \`kgPerPound\` have names, so the reader knows what each number is, and a change happens in one place.

**Rounding to decimal places.** \`round\` only gives whole numbers. Multiplying by 10 first moves the decimal point, so \`round(304.8)\` gives 305, and dividing by 10 gives 30.5. For 2 places the factor is 100: 5 pounds is 2.26796185 kg, which becomes 2.27.

**Small functions.** \`cm\` does the multiplication and the rounding for one size. The three size fields then read the same way, so a mistake in one of them stands out.

**Round at the end.** Each value is converted first and rounded once. Rounding the inches before converting would add an error.
`,
  tests: [
    {
      name: 'One small parcel',
      inputs: [{ name: 'payload', mime: 'application/json', content: '[{ "parcelId": "BM-8001", "lengthIn": 10, "widthIn": 8, "heightIn": 3, "weightLb": 2 }]' }],
      expected: '[{ "parcelId": "BM-8001", "lengthCm": 25.4, "widthCm": 20.3, "heightCm": 7.6, "weightKg": 0.91 }]',
    },
    {
      name: 'No parcels',
      inputs: [{ name: 'payload', mime: 'application/json', content: '[]' }],
      expected: '[]',
    },
  ],
  followUps: [
    {
      q: 'The carrier also wants the volume in litres. How do you work it out?',
      a: 'Multiply the three sizes in centimetres and divide by 1000, since one litre is 1000 cubic centimetres. Use the sizes before rounding, then round the volume once.',
    },
    {
      q: 'Why not write 2.54 inside each field?',
      a: 'A named variable says what the number means and lives in one place. Repeated magic numbers invite a typo in one field that nobody notices.',
    },
    {
      q: 'The carrier wants the numbers as text with exactly two decimals, such as "2.20". What changes?',
      a: 'Format the value with `as String {format: "0.00"}`. A number cannot keep a trailing zero, but the formatted text does.',
    },
  ],
}
