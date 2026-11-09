export default {
  id: 'rm-065',
  category: 'api-design',
  title: 'Energy Tariffs API: Response Examples That Fit Their Type',
  level: 'BEGINNER',
  tags: ['raml', 'api-design', 'examples', 'responses', 'data-types', 'debugging', 'energy'],
  estMinutes: 14,
  description: `
An energy supplier lists its 40 live tariffs on a price comparison site. The comparison site built its parser from the examples in the contract, then broke on the first real response. The example said \`unitRatePence: "24.5p"\` as text, while the real API sent the number 24.5.

An example can sit on the type, or on the body of one response. An example on a response body shows that exact response, such as a whole list. RAML checks both against the type. A wrong example makes the file invalid, which is what you want: it stops a misleading example from reaching Exchange.

The starter has the old examples. Fix them to fit the type, and add what is missing.

**Requirements**
- A type \`Tariff\` with:
  - \`tariffCode\`: required string such as \`FIX-24\` or \`EV-7\`: two to four capital letters, a hyphen, then one or two digits.
  - \`fuel\`: required, only \`electricity\` or \`gas\`.
  - \`unitRatePence\` and \`standingChargePence\`: required numbers, at least 0.
  - \`fixedUntil\`: optional calendar day with no time.
- \`GET /tariffs\` returns a list of \`Tariff\`, with an example of the whole list written on that response body.
- \`GET /tariffs\` has an optional query parameter \`fuel\` that allows only \`electricity\` or \`gas\`.
- \`GET /tariffs/{tariffCode}\` returns a \`Tariff\` with an example, or 404.
`,
  starter: `#%RAML 1.0
title: Energy Tariffs API
mediaType: application/json

types:
  Tariff:
    type: object
    properties:
      tariffCode:
        type: string
        pattern: ^[A-Z]{2,4}-[0-9]{1,2}$
      fuel:
        type: string
        enum: [ electricity, gas ]
      unitRatePence:
        type: number
        minimum: 0
      standingChargePence:
        type: number
        minimum: 0
      fixedUntil?: date-only
    example:
      tariffCode: fix-24
      fuel: Electric
      unitRatePence: "24.5p"
      standingChargePence: 53.1
      fixedUntil: 31/03/2027

/tariffs:
  get:
    responses:
      200:
        body:
          type: Tariff[]
`,
  ramlChecks: [
    {
      label: 'tariffCode is a string whose pattern accepts FIX-24 and EV-7',
      rule: { type: 'prop', typeName: 'Tariff', prop: 'tariffCode', want: { type: 'string', required: true, pattern: { accepts: ['FIX-24', 'EV-7', 'GAS-12', 'TRCK-1'] , rejects: ['fix-24', 'F-24', 'FIX-240', 'FIX24', 'FIXED-24'] } } },
    },
    { label: 'fuel allows only electricity and gas', rule: { type: 'prop', typeName: 'Tariff', prop: 'fuel', want: { required: true, enum: { exactly: ['electricity', 'gas'] } } } },
    {
      label: 'unitRatePence and standingChargePence are numbers of at least 0',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Tariff', prop: 'unitRatePence', want: { type: 'number', required: true, minimum: 0 } },
          { type: 'prop', typeName: 'Tariff', prop: 'standingChargePence', want: { type: 'number', required: true, minimum: 0 } },
        ],
      },
    },
    { label: 'fixedUntil is an optional date-only', rule: { type: 'prop', typeName: 'Tariff', prop: 'fixedUntil', want: { type: 'date-only', required: false } } },
    { label: 'GET /tariffs returns Tariff[] with its own example of the list', rule: { type: 'response', path: '/tariffs', method: 'get', status: '200', typeIs: 'Tariff[]', example: 'own' } },
    { label: 'The fuel query parameter is optional, electricity or gas', rule: { type: 'param', path: '/tariffs', method: 'get', in: 'query', name: 'fuel', want: { required: false, enum: { exactly: ['electricity', 'gas'] } } } },
    { label: 'GET /tariffs/{tariffCode} returns a Tariff with an example', rule: { type: 'response', path: '/tariffs/{}', method: 'get', status: '200', typeIs: 'Tariff', example: true } },
    { label: 'GET /tariffs/{tariffCode} returns 404 for an unknown code', rule: { type: 'response', path: '/tariffs/{}', method: 'get', status: '404' } },
  ],
  referenceRaml: `#%RAML 1.0
title: Energy Tariffs API
mediaType: application/json

types:
  Fuel:
    type: string
    enum: [ electricity, gas ]
  Tariff:
    type: object
    properties:
      tariffCode:
        type: string
        pattern: ^[A-Z]{2,4}-[0-9]{1,2}$
      fuel: Fuel
      unitRatePence:
        type: number
        minimum: 0
      standingChargePence:
        type: number
        minimum: 0
      fixedUntil?: date-only
    example:
      tariffCode: FIX-24
      fuel: electricity
      unitRatePence: 24.5
      standingChargePence: 53.1
      fixedUntil: 2027-03-31

/tariffs:
  get:
    queryParameters:
      fuel?: Fuel
    responses:
      200:
        body:
          type: Tariff[]
          example:
            - tariffCode: FIX-24
              fuel: electricity
              unitRatePence: 24.5
              standingChargePence: 53.1
              fixedUntil: 2027-03-31
            - tariffCode: EV-7
              fuel: electricity
              unitRatePence: 7.9
              standingChargePence: 48.2
            - tariffCode: GAS-12
              fuel: gas
              unitRatePence: 6.1
              standingChargePence: 31.4
  /{tariffCode}:
    get:
      responses:
        200:
          body:
            type: Tariff
        404:
          description: No live tariff has this code.
`,
  keyPoints: [
    'Every example is checked against its type, on a type and on a response body alike.',
    'A number in quotes is a string in YAML, so "24.5p" can never fit a number.',
    'date-only examples use the form 2027-03-31, never 31/03/2027.',
    'An example on a response body can show a whole list, including items that leave out optional fields.',
    'Consumers often build parsers from examples, so a wrong example breaks real code.',
  ],
  solution: `
The starter example broke four rules: \`fix-24\` failed the pattern, \`Electric\` was not in the enum, \`"24.5p"\` was a string, and \`31/03/2027\` was not a \`date-only\`. Each one is fixed in the type's example.

The list example sits on the 200 body of \`GET /tariffs\`. It shows three tariffs, and the \`EV-7\` and \`GAS-12\` entries leave out \`fixedUntil\`, so a consumer sees early that the field can be missing.

\`GET /tariffs/{tariffCode}\` returns \`Tariff\` with no example of its own, so it shows the type's example. The \`Fuel\` type is shared by the property and the query parameter, so the filter and the data always offer the same values.
`,
  followUps: [
    {
      q: 'Why does an invalid example make the whole file invalid?',
      a: 'Parsers such as AMF validate examples against their types. A failing example is reported as an error, so Design Center and Exchange refuse to publish it.',
    },
    {
      q: 'When should an example sit on the response rather than the type?',
      a: 'When the response has a shape of its own, such as a list or a filtered view. The type example then stays a single item.',
    },
    {
      q: 'How does the Anypoint mocking service use these examples?',
      a: 'It returns the response example, or the type example when the response has none. A wrong example would be served to every consumer that builds against the mock.',
    },
    {
      q: 'Can you turn off validation for one example?',
      a: 'Yes, with strict: false on a named example. Use it rarely, for example to show a payload that is invalid on purpose.',
    },
  ],
}
