export default {
  id: 'rm-013',
  category: 'api-design',
  title: 'Flight Bookings API: Arrays and Facets',
  level: 'INTERMEDIATE',
  tags: ['raml', 'api-design', 'data-types', 'facets', 'arrays', 'debugging', 'travel'],
  estMinutes: 20,
  description: `
An airline wants to catch bad bookings at the edge of its platform, before they reach the reservation system. A junior developer started the contract, but the file has errors, and some rules are still missing.

A **facet** is a rule that narrows a type. Common ones:
- On strings: \`minLength\`, \`maxLength\` and \`pattern\`, which is a regular expression the value must match.
- On numbers: \`minimum\` and \`maximum\`.
- On arrays: \`minItems\` and \`maxItems\`.

The starter holds real mistakes. Fix them, and add what is missing.

**Requirements**
- \`Passenger\` has these required properties:
  - \`fullName\`: a string with \`minLength\` 2 and \`maxLength\` 60.
  - \`age\`: an integer with a \`minimum\` of 0.
- \`Booking\` has these required properties:
  - \`reference\`: a string that is exactly 6 capital letters or digits. Use a \`pattern\` that covers the whole value from start to end.
  - \`passengers\`: a list of \`Passenger\`, with at least 1 and at most 9 items.
  - \`baggageKg\`: a number with a \`minimum\` of 0 and a \`maximum\` of 32.
- \`Booking\` has an example that fits all of these rules.
- \`POST /bookings\` takes a \`Booking\` body and returns 201.
`,
  starter: `#%RAML 1.0
title: Flight Bookings API
mediaType: application/json

types:
  Passenger:
    type: object
    properties:
      fullName:
        type: string
      age:
        type: int
        minimum: 0
  Booking:
    type: object
    properties:
      reference:
        type: string
      passengers:
        type: Passenger
        minItem: 1
      baggageKg:
        type: number
    example:
      reference: ab12
      passengers: []
      baggageKg: 20

/bookings:
  post:
    body:
      type: Booking
`,
  ramlChecks: [
    { label: 'fullName is a string of 2 to 60 characters', rule: { type: 'prop', typeName: 'Passenger', prop: 'fullName', want: { type: 'string', required: true, minLength: 2, maxLength: 60 } } },
    { label: 'age is an integer with a minimum of 0', rule: { type: 'prop', typeName: 'Passenger', prop: 'age', want: { type: 'integer', required: true, minimum: 0 } } },
    {
      label: 'reference has a pattern for exactly 6 characters, anchored at both ends',
      rule: { type: 'prop', typeName: 'Booking', prop: 'reference', want: { type: 'string', required: true, pattern: ['^', '{6}', '$'] } },
    },
    { label: 'passengers is a list of Passenger with 1 to 9 items', rule: { type: 'prop', typeName: 'Booking', prop: 'passengers', want: { type: 'Passenger[]', required: true, minItems: 1, maxItems: 9 } } },
    { label: 'baggageKg is a number from 0 to 32', rule: { type: 'prop', typeName: 'Booking', prop: 'baggageKg', want: { type: 'number', required: true, minimum: 0, maximum: 32 } } },
    {
      label: 'Booking has an example',
      rule: {
        type: 'any',
        rules: [
          { type: 'typeDecl', name: 'Booking', want: { example: { set: true } } },
          { type: 'typeDecl', name: 'Booking', want: { examples: { set: true } } },
        ],
      },
    },
    {
      label: 'POST /bookings takes a Booking and returns 201',
      rule: {
        type: 'all',
        rules: [
          { type: 'body', path: '/bookings', method: 'post', typeIs: 'Booking' },
          { type: 'response', path: '/bookings', method: 'post', status: '201' },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Flight Bookings API
mediaType: application/json

types:
  Passenger:
    type: object
    properties:
      fullName:
        type: string
        minLength: 2
        maxLength: 60
      age:
        type: integer
        minimum: 0
  Booking:
    type: object
    properties:
      reference:
        type: string
        pattern: ^[A-Z0-9]{6}$
      passengers:
        type: Passenger[]
        minItems: 1
        maxItems: 9
      baggageKg:
        type: number
        minimum: 0
        maximum: 32
    example:
      reference: AB12CD
      passengers:
        - fullName: Lena Fischer
          age: 34
      baggageKg: 20

/bookings:
  post:
    body:
      type: Booking
    responses:
      201:
        description: The booking was created.
`,
  keyPoints: [
    'A facet narrows a type, so bad data is refused by the contract and not by your code.',
    'RAML has no int type. Use integer.',
    'Passenger is one passenger and Passenger[] is a list. minItems only makes sense on a list.',
    'Without ^ and $ a pattern can match part of a value, so a longer string could still pass.',
  ],
  solution: `
The starter had these mistakes:
- \`age\` used \`int\`, which is not a RAML type. The name is \`integer\`.
- \`passengers\` was a single \`Passenger\`, and it needs to be \`Passenger[]\`.
- \`minItem\` was a typo for \`minItems\`.
- The example broke the new rules: \`ab12\` is too short and is in lower case, and an empty list breaks \`minItems: 1\`.

\`^[A-Z0-9]{6}$\` is anchored, so the whole value must fit. Without \`^\` and \`$\`, a pattern can match any part of a value, and \`XXAB12CDXX\` would pass.

The example is also a test of the facets. If it cannot be written to fit, the rules are wrong.
`,
  followUps: [
    {
      q: 'Why state limits in RAML when the backend validates data anyway?',
      a: 'Consumers can read the rules before they write code, and a router such as APIkit can refuse bad requests at the edge. The backend check stays as the last line of defence.',
    },
    {
      q: 'What is the difference between minItems and required on an array?',
      a: 'required says the property must be present. minItems says how many items it must hold. Without minItems, an empty list is still valid.',
    },
    {
      q: 'What does uniqueItems do?',
      a: 'uniqueItems: true on an array refuses duplicates. It suits a list of seat numbers, where the same seat twice makes no sense.',
    },
  ],
}
