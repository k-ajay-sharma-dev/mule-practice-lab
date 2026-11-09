export default {
  id: 'rm-060',
  category: 'api-design',
  title: 'Phone Number Picker API: Query Parameters with Patterns, Ranges and Defaults',
  level: 'BEGINNER',
  tags: ['raml', 'api-design', 'query-parameters', 'search', 'telecom'],
  estMinutes: 12,
  description: `
A mobile operator lets new customers pick their own number in the online shop. It holds about 1.2 million free numbers. The shop sends a search like this:

\`GET /available-numbers?areaCode=0161&contains=77&lineType=mobile&limit=20\`

Each query parameter is a door into the number database, so the contract should say exactly what may come through it. A query parameter takes the same facets as a type: \`pattern\` for the shape of a string, \`enum\` for a fixed list, \`minimum\` and \`maximum\` for numbers, and \`default\` for the value the API uses when the caller leaves it out. A name ending in \`?\` makes the parameter optional.

**Requirements**
- A type \`PhoneNumber\` with a required string \`number\`, a required \`lineType\` that allows only \`mobile\` and \`landline\`, and a required boolean \`premium\`.
- \`GET /available-numbers\` returns a list of \`PhoneNumber\` with 200, and 400 when a parameter is not valid.
- Its query parameters:
  - \`areaCode\`: required string. A 0 followed by 2 to 4 digits, so \`020\`, \`0161\` and \`01632\` pass, and \`161\` or \`0161x\` fail.
  - \`contains\`: optional string of 1 to 4 digits that the number must contain.
  - \`lineType\`: optional, only \`mobile\` or \`landline\`, with \`mobile\` as the default.
  - \`limit\`: optional integer from 1 to 50, with 20 as the default.
- Callers cannot create numbers here, so there is no \`post\` on \`/available-numbers\`.
`,
  starter: `#%RAML 1.0
title: Phone Number Picker API
mediaType: application/json

types:
  PhoneNumber:
    type: object
    properties:
      number: string

/available-numbers:
  get:
    queryParameters:
      areaCode: string
`,
  ramlChecks: [
    {
      label: 'areaCode is a required string of 0 and 2 to 4 digits',
      rule: {
        type: 'param',
        path: '/available-numbers',
        method: 'get',
        in: 'query',
        name: 'areaCode',
        want: { type: 'string', required: true, pattern: { accepts: ['020', '0161', '01632'], rejects: ['161', '0161x', '0', '016321', 'x0161'] } },
      },
    },
    {
      label: 'contains is an optional string of 1 to 4 digits',
      rule: {
        type: 'param',
        path: '/available-numbers',
        method: 'get',
        in: 'query',
        name: 'contains',
        want: { type: 'string', required: false, pattern: { accepts: ['7', '77', '2026'], rejects: ['', '12345', '7a', 'abc'] } },
      },
    },
    {
      label: 'lineType is optional, mobile or landline, with mobile as the default',
      rule: { type: 'param', path: '/available-numbers', method: 'get', in: 'query', name: 'lineType', want: { required: false, enum: { exactly: ['mobile', 'landline'] }, default: { is: 'mobile' } } },
    },
    {
      label: 'limit is an optional integer from 1 to 50 with a default of 20',
      rule: { type: 'param', path: '/available-numbers', method: 'get', in: 'query', name: 'limit', want: { type: 'integer', required: false, minimum: 1, maximum: 50, default: 20 } },
    },
    {
      label: 'PhoneNumber has a required lineType of mobile or landline and a required boolean premium',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'PhoneNumber', prop: 'lineType', want: { required: true, enum: { exactly: ['mobile', 'landline'] } } },
          { type: 'prop', typeName: 'PhoneNumber', prop: 'premium', want: { type: 'boolean', required: true } },
        ],
      },
    },
    { label: 'GET /available-numbers returns a list of PhoneNumber', rule: { type: 'response', path: '/available-numbers', method: 'get', status: '200', typeIs: 'PhoneNumber[]' } },
    { label: 'GET /available-numbers returns 400 for a bad parameter', rule: { type: 'response', path: '/available-numbers', method: 'get', status: '400' } },
    {
      label: 'The list is read only, with no post',
      rule: { type: 'all', rules: [{ type: 'method', path: '/available-numbers', method: 'get' }, { type: 'noMethod', path: '/available-numbers', method: 'post' }] },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Phone Number Picker API
mediaType: application/json

types:
  LineType:
    type: string
    enum: [ mobile, landline ]
  PhoneNumber:
    type: object
    properties:
      number: string
      lineType: LineType
      premium: boolean
    example:
      number: "07700900177"
      lineType: mobile
      premium: false

/available-numbers:
  get:
    description: Free numbers a new customer can choose from.
    queryParameters:
      areaCode:
        type: string
        pattern: ^0[0-9]{2,4}$
        example: "0161"
      contains?:
        type: string
        pattern: ^[0-9]{1,4}$
        example: "77"
      lineType?:
        type: LineType
        default: mobile
      limit?:
        type: integer
        minimum: 1
        maximum: 50
        default: 20
    responses:
      200:
        body:
          type: PhoneNumber[]
      400:
        description: A query parameter is missing or not valid.
`,
  keyPoints: [
    'Query parameters take the same facets as types: pattern, enum, minimum, maximum and default.',
    'A ? after the name makes a parameter optional. Without it, the parameter is required.',
    'A default is the value the API uses when the caller leaves the parameter out. It must fit the type.',
    'Digits in a string example need quotes, or YAML reads "0161" as the number 161.',
    'A cap such as maximum: 50 keeps one request from pulling thousands of rows.',
  ],
  solution: `
\`areaCode\` is a string, not an integer, because the leading 0 matters. As an integer, \`0161\` would turn into 161. The pattern \`^0[0-9]{2,4}$\` fixes the length as well as the first digit.

\`contains\` uses the same idea with \`{1,4}\`. Without a limit, a caller could send a long text and force a slow search over 1.2 million rows.

\`lineType\` reuses the \`LineType\` type, so the parameter and the response can never disagree about the allowed values. \`default: mobile\` documents what the API does when the caller sends nothing, and the default is checked against the enum.

\`limit\` has both a range and a default. The default keeps a plain call small, and \`maximum: 50\` stops a caller from asking for everything.
`,
  followUps: [
    {
      q: 'Does a default value in RAML fill in the parameter in a Mule flow?',
      a: 'No. The default documents the behaviour for callers. The flow must still apply it, for example with attributes.queryParams.limit default 20 in DataWeave.',
    },
    {
      q: 'Why quote "0161" in the example?',
      a: 'YAML reads an unquoted 0161 as a number. Quoting keeps it a string, which matches the declared type and keeps the leading zero.',
    },
    {
      q: 'Should a required query parameter have a default?',
      a: 'No. A required parameter is always sent, so the default would never be used. Give defaults to optional parameters.',
    },
    {
      q: 'What status should the API return when lineType is fax?',
      a: 'It should return 400 Bad Request, because the value is not in the enum. APIkit does this from the contract before the flow runs.',
    },
  ],
}
