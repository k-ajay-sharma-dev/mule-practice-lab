export default {
  id: 'rm-038',
  category: 'api-design',
  title: 'Smart Meter API: Integer Formats and Boolean Flags',
  level: 'BEGINNER',
  tags: ['raml', 'api-design', 'data-types', 'integer-format', 'boolean', 'energy'],
  estMinutes: 12,
  description: `
An energy supplier reads millions of smart meters. Its billing system once crashed because a lifetime counter grew too large for the 32 bit field that held it. The contract must now say how big each number can get.

- \`number\` allows decimals. \`integer\` allows whole numbers only.
- The \`format\` facet says how much space an integer needs. A **facet** is a rule or detail added to a type. \`int32\` holds values up to about 2.1 billion, and \`int64\` holds far larger ones. RAML also accepts \`long\` for large whole numbers.
- A \`boolean\` is \`true\` or \`false\`, with no quotes. A boolean used as a yes or no marker is often called a **flag**.

**Requirements**
- A type \`MeterReading\` has these required properties:
  - \`meterId\`: a string.
  - \`totalWattHours\`: a lifetime counter, a whole number of at least 0 that will pass 2.1 billion. Use the large format.
  - \`intervalMinutes\`: a whole number of at least 1 with the format \`int32\`.
  - \`voltage\`: a value with decimals, such as 229.6.
  - \`estimated\`: a flag that is true when no real reading was taken.
- \`MeterReading\` has an example that fits it.
- \`GET /meters/{meterId}/readings\` returns \`MeterReading[]\` with status 200.
- That method has an optional boolean query parameter \`estimatedOnly\`, with a default of \`false\`.
`,
  starter: `#%RAML 1.0
title: Smart Meter API
mediaType: application/json

types:
  MeterReading:
    type: object
    properties:
      meterId: string

/meters/{meterId}/readings:
`,
  ramlChecks: [
    { label: 'meterId is a required string', rule: { type: 'prop', typeName: 'MeterReading', prop: 'meterId', want: { type: 'string', required: true } } },
    {
      label: 'totalWattHours is a required 64 bit integer of at least 0',
      rule: { type: 'prop', typeName: 'MeterReading', prop: 'totalWattHours', want: { type: 'integer', required: true, minimum: 0, format: { oneOf: ['int64', 'long'] } } },
    },
    {
      label: 'intervalMinutes is a required int32 of at least 1',
      rule: { type: 'prop', typeName: 'MeterReading', prop: 'intervalMinutes', want: { type: 'integer', required: true, minimum: 1, format: 'int32' } },
    },
    { label: 'voltage is a required number', rule: { type: 'prop', typeName: 'MeterReading', prop: 'voltage', want: { type: 'number', required: true } } },
    { label: 'estimated is a required boolean', rule: { type: 'prop', typeName: 'MeterReading', prop: 'estimated', want: { type: 'boolean', required: true } } },
    {
      label: 'MeterReading has an example',
      rule: {
        type: 'any',
        rules: [
          { type: 'typeDecl', name: 'MeterReading', want: { example: { set: true } } },
          { type: 'typeDecl', name: 'MeterReading', want: { examples: { set: true } } },
        ],
      },
    },
    { label: 'GET readings returns MeterReading[]', rule: { type: 'response', path: '/meters/{}/readings', method: 'get', status: '200', typeIs: 'MeterReading[]' } },
    {
      label: 'estimatedOnly is an optional boolean with a default of false',
      rule: { type: 'param', path: '/meters/{}/readings', method: 'get', in: 'query', name: 'estimatedOnly', want: { type: 'boolean', required: false, default: false } },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Smart Meter API
mediaType: application/json

types:
  MeterReading:
    type: object
    properties:
      meterId: string
      totalWattHours:
        type: integer
        format: int64
        minimum: 0
      intervalMinutes:
        type: integer
        format: int32
        minimum: 1
      voltage: number
      estimated: boolean
    example:
      meterId: M-99120
      totalWattHours: 5120447812
      intervalMinutes: 30
      voltage: 229.6
      estimated: false

/meters/{meterId}/readings:
  get:
    queryParameters:
      estimatedOnly?:
        type: boolean
        default: false
    responses:
      200:
        body:
          type: MeterReading[]
`,
  keyPoints: [
    'integer refuses decimals, and number allows them.',
    'format tells consumers how large a value can get, so they pick a field that fits.',
    'A counter that only grows needs room for its whole life, so use int64.',
    'A boolean is written as true or false with no quotes. "false" in quotes is a string.',
  ],
  solution: `
\`totalWattHours\` only ever grows, so it must have room for years of readings. \`int64\` states that in the contract, and billing can size its field to match.

\`intervalMinutes\` is small, so \`int32\` is plenty. \`voltage\` has decimals, so it is a \`number\` and not an \`integer\`.

\`estimated\` is a real boolean. Values such as \`Y\` or \`"true"\` force every consumer to guess what counts as yes.
`,
  followUps: [
    {
      q: 'Does format change what gets validated, or does it only inform consumers?',
      a: 'It does both. Generated code and databases use it to choose a suitable field, and the AMF parser behind Design Center refuses an int32 example above 2147483647. Use minimum and maximum for a business limit.',
    },
    {
      q: 'Which format values can you use on a number in RAML?',
      a: 'int32, int64, int, long, float, double, int16 and int8. Float and double suit values with decimals.',
    },
    {
      q: 'Why can a large integer still be a problem in a JSON consumer?',
      a: 'JavaScript stores numbers as doubles, and whole numbers above about 9 quadrillion lose precision. Very large identifiers are often sent as strings for this reason.',
    },
  ],
}
