export default {
  id: 'rm-113',
  category: 'api-design',
  title: 'Meter Readings System API: A Water Utility Billing Backend',
  level: 'INTERMEDIATE',
  tags: ['raml', 'api-design', 'system-api', 'api-led', 'data-types', 'status-codes', 'energy'],
  estMinutes: 25,
  description: `
A water utility bills 410,000 homes from meter readings. Readings arrive three ways: smart meters send one every night, technicians key them in on handhelds, and customers type them into the website. About 450,000 readings a day reach the billing system.

The billing system stores them in a table called \`MTR_REG\`, keyed by \`MTR_NO\`. An early draft of the contract copied those names. You are writing the **System API** in front of the billing system, so the contract uses business words and hides the table.

**Brief**
- A meter id looks like \`WM00418823\`: the letters \`WM\` and eight digits.
- The meter register only counts up. A reading lower than the last accepted one is a business rule failure, usually a typing mistake.
- The same meter cannot have two readings at the same moment.

**Requirements**
- Title \`Meter Readings System API\`, version \`v1\`, a base URI that uses \`{version}\`, and JSON as the default media type.
- No \`/MTR_REG\` resource. Meters live at \`/meters/{meterId}\`, and \`meterId\` has a pattern for the format above.
- \`ReadingSource\` is a string that is one of \`SMART_METER\`, \`TECHNICIAN\`, \`CUSTOMER\`.
- \`ReadingRequest\` has a required integer \`value\` of at least 0 (litres on the register), a required \`readAt\` with a time zone, and a required \`source\` of type \`ReadingSource\`.
- \`Reading\` inherits from \`ReadingRequest\` and adds a required string \`readingId\` and a required boolean \`estimated\`. It has an example.
- \`Error\` has required strings \`code\` and \`message\`.
- \`GET /meters/{meterId}\` returns a \`Meter\` with status 200, or an \`Error\` with status 404. \`Meter\` has a required \`installedOn\`, a date with no time.
- \`GET /meters/{meterId}/readings\` returns \`Reading[]\` with status 200. It has a required \`from\` and an optional \`to\`, both dates with no time.
- \`POST /meters/{meterId}/readings\` takes a \`ReadingRequest\` and returns a \`Reading\` with status 201 and a \`Location\` header. It returns an \`Error\` with 409 for a second reading at the same moment, and with 422 for a value below the last reading.
`,
  starter: `#%RAML 1.0
title: Meter Readings System API

types:

/MTR_REG/{MTR_NO}:
  get:
`,
  ramlChecks: [
    {
      label: 'The title, version v1, a base URI with {version} and JSON',
      rule: {
        type: 'all',
        rules: [
          { type: 'root', key: 'title', want: 'Meter Readings System API' },
          { type: 'root', key: 'version', want: 'v1' },
          { type: 'root', key: 'baseUri', want: '{version}' },
          { type: 'root', key: 'mediaType', want: 'application/json' },
        ],
      },
    },
    {
      label: 'The table name is gone and meterId has the WM pattern',
      rule: {
        type: 'all',
        rules: [
          { type: 'noResource', path: '/MTR_REG/{}' },
          { type: 'noResource', path: '/MTR_REG' },
          { type: 'param', path: '/meters/{}', in: 'uri', name: 'meterId', want: { type: 'string', pattern: { accepts: ['WM00418823', 'WM99999999'], rejects: ['WM0041882', 'wm00418823', 'XM00418823', 'WM004188231'] } } },
        ],
      },
    },
    { label: 'ReadingSource allows the three sources', rule: { type: 'typeDecl', name: 'ReadingSource', want: { type: 'string', enum: { exactly: ['SMART_METER', 'TECHNICIAN', 'CUSTOMER'] } } } },
    {
      label: 'ReadingRequest has value, readAt and source',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'ReadingRequest', prop: 'value', want: { type: 'integer', required: true, minimum: 0 } },
          { type: 'prop', typeName: 'ReadingRequest', prop: 'readAt', want: { type: 'datetime', required: true } },
          { type: 'prop', typeName: 'ReadingRequest', prop: 'source', want: { type: 'ReadingSource', required: true } },
        ],
      },
    },
    {
      label: 'Reading inherits from ReadingRequest and adds readingId and estimated',
      rule: {
        type: 'all',
        rules: [
          { type: 'typeDecl', name: 'Reading', extends: 'ReadingRequest' },
          { type: 'prop', typeName: 'Reading', prop: 'readingId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Reading', prop: 'estimated', want: { type: 'boolean', required: true } },
          { type: 'any', rules: [{ type: 'typeDecl', name: 'Reading', want: { example: { set: true } } }, { type: 'typeDecl', name: 'Reading', want: { examples: { set: true } } }] },
        ],
      },
    },
    {
      label: 'GET /meters/{meterId} returns a Meter, or an Error with 404',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/meters/{}', method: 'get', status: '200', typeIs: 'Meter' },
          { type: 'response', path: '/meters/{}', method: 'get', status: '404', typeIs: 'Error' },
          { type: 'prop', typeName: 'Meter', prop: 'installedOn', want: { type: 'date-only', required: true } },
        ],
      },
    },
    { label: 'GET readings returns Reading[]', rule: { type: 'response', path: '/meters/{}/readings', method: 'get', status: '200', typeIs: 'Reading[]' } },
    {
      label: 'GET readings has a required from and an optional to, both date-only',
      rule: {
        type: 'all',
        rules: [
          { type: 'param', path: '/meters/{}/readings', method: 'get', in: 'query', name: 'from', want: { type: 'date-only', required: true } },
          { type: 'param', path: '/meters/{}/readings', method: 'get', in: 'query', name: 'to', want: { type: 'date-only', required: false } },
        ],
      },
    },
    {
      label: 'POST readings takes a ReadingRequest and returns a Reading with 201 and Location',
      rule: {
        type: 'all',
        rules: [
          { type: 'body', path: '/meters/{}/readings', method: 'post', typeIs: 'ReadingRequest' },
          { type: 'response', path: '/meters/{}/readings', method: 'post', status: '201', typeIs: 'Reading', header: 'Location' },
        ],
      },
    },
    { label: 'POST readings returns an Error with 409 for a duplicate moment', rule: { type: 'response', path: '/meters/{}/readings', method: 'post', status: '409', typeIs: 'Error' } },
    { label: 'POST readings returns an Error with 422 for a value below the last reading', rule: { type: 'response', path: '/meters/{}/readings', method: 'post', status: '422', typeIs: 'Error' } },
  ],
  referenceRaml: `#%RAML 1.0
title: Meter Readings System API
version: v1
baseUri: https://api.example.com/meter-readings/{version}
mediaType: application/json

types:
  ReadingSource:
    type: string
    enum: [ SMART_METER, TECHNICIAN, CUSTOMER ]
  Meter:
    type: object
    properties:
      meterId: string
      premiseId: string
      smart: boolean
      installedOn: date-only
    example:
      meterId: WM00418823
      premiseId: PR-2209914
      smart: true
      installedOn: 2021-04-19
  ReadingRequest:
    type: object
    properties:
      value:
        type: integer
        minimum: 0
        description: Litres on the register.
      readAt: datetime
      source: ReadingSource
  Reading:
    type: ReadingRequest
    properties:
      readingId: string
      estimated: boolean
    example:
      readingId: RD-88120443
      value: 1482230
      readAt: 2026-03-09T02:00:00Z
      source: SMART_METER
      estimated: false
  Error:
    type: object
    properties:
      code: string
      message: string

/meters/{meterId}:
  uriParameters:
    meterId:
      type: string
      pattern: ^WM[0-9]{8}$
  get:
    responses:
      200:
        body:
          type: Meter
      404:
        body:
          type: Error
  /readings:
    get:
      queryParameters:
        from: date-only
        to?: date-only
      responses:
        200:
          body:
            type: Reading[]
    post:
      body:
        type: ReadingRequest
      responses:
        201:
          headers:
            Location:
              type: string
          body:
            type: Reading
        409:
          description: This meter already has a reading at that moment.
          body:
            type: Error
        422:
          description: The value is below the last accepted reading.
          body:
            type: Error
`,
  keyPoints: [
    'A System API speaks business language. Table and column names stay in the implementation.',
    'A pattern on the URI parameter rejects a bad meter id before any backend call.',
    'Reading inherits from ReadingRequest, so the fields a caller sends are declared once.',
    '409 is a clash with data already stored. 422 is a valid body that breaks a business rule.',
    'readAt is a datetime because readings from different sources must sort by the exact moment.',
  ],
  solution: `
The draft named the table and its key, so every caller would have broken when the billing system is replaced. Now the paths are \`/meters/{meterId}\` and \`/meters/{meterId}/readings\`, and only the Mule application knows \`MTR_REG\`.

The types split what the caller sends from what the server adds. A technician's handheld sends \`value\`, \`readAt\` and \`source\`. The API adds \`readingId\` and \`estimated\`, the flag the billing system sets when it fills a gap.

The two error codes match the two rules in the brief. A second reading at the same moment conflicts with stored data, so it is a 409, and the smart meter head end can treat it as already done. A value below the last reading is a 422, so the website can ask the customer to check the number they typed.

\`from\` is required on the list. A meter that reads every night has thousands of readings, and an unbounded list would be slow for every caller.
`,
  followUps: [
    {
      q: 'Smart meters send 410,000 readings in one nightly window. Would you call this POST for each one?',
      a: 'Probably not. A batch path fits better: the head end drops a file, or publishes to Anypoint MQ, and a Mule batch job loads it. The single POST suits technicians and customers.',
    },
    {
      q: 'Why is the 409 useful to the smart meter platform?',
      a: 'The platform may resend after a timeout. A 409 for the same moment tells it the reading is already stored, so it can mark the message done and not retry forever.',
    },
    {
      q: 'Who sets estimated to true?',
      a: 'The billing system, when a reading is missing and it fills the gap from past use. Callers never send it, which is why it is on Reading and not on ReadingRequest.',
    },
    {
      q: 'Where would a Process API sit on top of this?',
      a: 'A customer self-service Process API could check the account, call this System API, and then trigger a bill. The System API stays focused on readings only.',
    },
  ],
}
