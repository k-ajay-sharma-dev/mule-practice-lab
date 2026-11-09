export default {
  id: 'rm-108',
  category: 'api-design',
  title: 'Pharmacy Refills API: Indentation, an Undeclared Type and a Wrong Date',
  level: 'BEGINNER',
  tags: ['raml', 'api-design', 'debugging', 'data-types', 'query-parameters', 'healthcare'],
  estMinutes: 15,
  description: `
A pharmacy chain with 340 stores lets patients ask for a repeat prescription in its app. The app shows each refill and where it can be collected. About 18,000 refills are requested each day.

The contract was written in a hurry before a release. The parser now reports errors, and a reviewer also found two mistakes the parser cannot see. Fix the file so it meets the requirements.

Indentation matters in RAML. A key that is two spaces too deep belongs to the key above it, and a key that is too shallow belongs to the level above.

**Requirements**
- \`RefillStatus\` is a string that is one of \`REQUESTED\`, \`READY\`, \`COLLECTED\`, \`CANCELLED\`.
- \`Refill\` has required strings \`refillId\`, \`prescriptionId\` and \`pharmacyId\`.
- \`Refill\` has a required integer \`quantity\` from 1 to 90, the number of days of medicine.
- \`Refill\` has a required \`status\` of type \`RefillStatus\`.
- \`Refill\` has a required \`requestedAt\`: the exact moment of the request, with a time zone, because the stores span two time zones.
- \`Refill\` keeps an example that fits it.
- \`GET /patients/{patientId}/refills\` returns \`Refill[]\` with status 200, and has an optional \`status\` query parameter of type \`RefillStatus\`.
- \`GET /patients/{patientId}/refills/{refillId}\` returns a \`Refill\` with status 200, or 404.
`,
  starter: `#%RAML 1.0
title: Pharmacy Refills API
version: v1
baseUri: https://api.example.com/pharmacy/{version}
mediaType: application/json

types:
  RefillStatus:
    type: string
    enum: [ REQUESTED, READY, COLLECTED, CANCELLED ]
  Refill:
    type: object
    properties:
      refillId: string
      prescriptionId: string
      quantity:
        type: integer
        minimum: 1
        maximum: 90
        pharmacyId: string
      status: RefilStatus
      requestedAt: date-only
    example:
      refillId: RF-901233
      prescriptionId: RX-4471820
      quantity: 28
      pharmacyId: PH-0117
      status: READY
      requestedAt: 2026-03-02T08:15:00+01:00

/patients/{patientId}/refills:
  get:
    responses:
      200:
        body:
          type: Refill
      queryParameters:
        status?: RefillStatus
  /{refillId}:
    get:
      responses:
        200:
          body:
            type: Refill
        404:
          description: No refill has this id for this patient.
`,
  ramlChecks: [
    { label: 'RefillStatus allows the four statuses', rule: { type: 'typeDecl', name: 'RefillStatus', want: { type: 'string', enum: { exactly: ['REQUESTED', 'READY', 'COLLECTED', 'CANCELLED'] } } } },
    {
      label: 'Refill has required refillId, prescriptionId and pharmacyId',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Refill', prop: 'refillId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Refill', prop: 'prescriptionId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Refill', prop: 'pharmacyId', want: { type: 'string', required: true } },
        ],
      },
    },
    { label: 'quantity is a required integer from 1 to 90', rule: { type: 'prop', typeName: 'Refill', prop: 'quantity', want: { type: 'integer', required: true, minimum: 1, maximum: 90 } } },
    { label: 'status is a required RefillStatus', rule: { type: 'prop', typeName: 'Refill', prop: 'status', want: { type: 'RefillStatus', required: true } } },
    { label: 'requestedAt is a required datetime with a time zone', rule: { type: 'prop', typeName: 'Refill', prop: 'requestedAt', want: { type: 'datetime', required: true } } },
    {
      label: 'Refill keeps its example',
      rule: {
        type: 'any',
        rules: [
          { type: 'typeDecl', name: 'Refill', want: { example: { set: true } } },
          { type: 'typeDecl', name: 'Refill', want: { examples: { set: true } } },
        ],
      },
    },
    { label: 'The list returns Refill[]', rule: { type: 'response', path: '/patients/{}/refills', method: 'get', status: '200', typeIs: 'Refill[]' } },
    {
      label: 'The list has an optional status filter of type RefillStatus',
      rule: { type: 'param', path: '/patients/{}/refills', method: 'get', in: 'query', name: 'status', want: { type: 'RefillStatus', required: false } },
    },
    {
      label: 'One refill returns a Refill, or 404',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/patients/{}/refills/{}', method: 'get', status: '200', typeIs: 'Refill' },
          { type: 'response', path: '/patients/{}/refills/{}', method: 'get', status: '404' },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Pharmacy Refills API
version: v1
baseUri: https://api.example.com/pharmacy/{version}
mediaType: application/json

types:
  RefillStatus:
    type: string
    enum: [ REQUESTED, READY, COLLECTED, CANCELLED ]
  Refill:
    type: object
    properties:
      refillId: string
      prescriptionId: string
      quantity:
        type: integer
        minimum: 1
        maximum: 90
      pharmacyId: string
      status: RefillStatus
      requestedAt: datetime
    example:
      refillId: RF-901233
      prescriptionId: RX-4471820
      quantity: 28
      pharmacyId: PH-0117
      status: READY
      requestedAt: 2026-03-02T08:15:00+01:00

/patients/{patientId}/refills:
  get:
    queryParameters:
      status?: RefillStatus
    responses:
      200:
        body:
          type: Refill[]
  /{refillId}:
    get:
      responses:
        200:
          body:
            type: Refill
        404:
          description: No refill has this id for this patient.
`,
  keyPoints: [
    'Indentation decides what a key belongs to. pharmacyId two spaces too deep became a facet of quantity, which is not allowed.',
    'A type name must match its declaration letter for letter. RefilStatus is a different, undeclared name.',
    'queryParameters belongs to the method, next to responses, not inside it.',
    'datetime holds a moment with a time zone. date-only holds a calendar day.',
    'A list endpoint returns an array type such as Refill[]. The parser accepts Refill there, so only a review finds it.',
  ],
  solution: `
Five things were wrong.
- \`pharmacyId\` was indented under \`quantity\`, so the parser read it as an unknown facet of \`quantity\`. Move it back to the level of the other properties.
- \`status: RefilStatus\` has one \`l\` missing. Use the declared name \`RefillStatus\`.
- \`requestedAt\` was \`date-only\` while the example held a full time with an offset. The requirement asks for the moment with a time zone, so the type becomes \`datetime\` and the example stays. Cutting the example down to a date would hide the time a refill came in.
- \`queryParameters\` sat under \`responses\`, where the parser reads every key as a status code. It moves up one level, beside \`responses\`.
- \`GET\` on the list returned \`Refill\`. A list is \`Refill[]\`. This one is valid RAML, so the parser said nothing.
`,
  followUps: [
    {
      q: 'Why does the parser call queryParameters a bad status code?',
      a: 'Every key under responses is read as a status code. queryParameters is not a three digit number, so the parser reports it there.',
    },
    {
      q: 'When would you choose datetime-only over datetime?',
      a: 'datetime-only is a local wall clock time with no zone, such as a store opening hour. datetime is an exact moment, which suits audit and request times.',
    },
    {
      q: 'Should patientId be in the path or taken from the token?',
      a: 'For a patient app the id should come from the access token, often as /me. A path parameter fits staff tools that look up many patients, and the API must still check the caller may see that patient.',
    },
  ],
}
