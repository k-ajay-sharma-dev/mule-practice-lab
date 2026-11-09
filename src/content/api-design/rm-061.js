export default {
  id: 'rm-061',
  category: 'api-design',
  title: 'Patient Allergies API: Adding to a Nested Collection with 201, 400 and 404',
  level: 'BEGINNER',
  tags: ['raml', 'api-design', 'request-body', 'status-codes', 'headers', 'nested-resources', 'healthcare'],
  estMinutes: 14,
  description: `
A hospital group with 14 sites keeps patient allergies in its electronic patient record. Nurses on wards record a new allergy from a tablet, and the pharmacy system reads the list before it dispenses any drug. A missed allergy can harm a patient, so the contract must be clear about what a valid record is.

Allergies belong to one patient, so they live under the patient: \`/patients/{patientId}/allergies\`. A \`post\` on that collection adds one. The caller sends the allergy as a **request body**, and the API answers:
- **201 Created** with a \`Location\` header that points at the new record,
- **400 Bad Request** when the body breaks the type,
- **404 Not Found** when no patient has that id. That is different from a bad body, and the tablet shows a different message for it.

Patient ids are 10-digit NHS numbers such as \`9434765919\`.

**Requirements**
- A type \`Allergy\` with these properties:
  - \`substance\`: required string of 2 to 100 characters.
  - \`severity\`: required, only \`mild\`, \`moderate\` or \`severe\`.
  - \`reaction\`: optional string.
  - \`recordedOn\`: required calendar day with no time.
- \`patientId\` is a string of exactly 10 digits.
- \`POST /patients/{patientId}/allergies\` takes an \`Allergy\` body and returns 201 with a \`Location\` header, 400 for a bad body, and 404 for an unknown patient.
- \`GET /patients/{patientId}/allergies\` returns a list of \`Allergy\`.
`,
  starter: `#%RAML 1.0
title: Patient Allergies API
mediaType: application/json

types:
  Allergy:
    type: object
    properties:
      substance: string

/patients:
  /{patientId}:
    /allergies:
      post:
        body:
          type: Allergy
`,
  ramlChecks: [
    { label: 'substance is a required string of 2 to 100 characters', rule: { type: 'prop', typeName: 'Allergy', prop: 'substance', want: { type: 'string', required: true, minLength: 2, maxLength: 100 } } },
    { label: 'severity is required and allows only mild, moderate and severe', rule: { type: 'prop', typeName: 'Allergy', prop: 'severity', want: { required: true, enum: { exactly: ['mild', 'moderate', 'severe'] } } } },
    { label: 'reaction is an optional string', rule: { type: 'prop', typeName: 'Allergy', prop: 'reaction', want: { type: 'string', required: false } } },
    { label: 'recordedOn is a required date-only', rule: { type: 'prop', typeName: 'Allergy', prop: 'recordedOn', want: { type: 'date-only', required: true } } },
    {
      label: 'patientId is a string of exactly 10 digits',
      rule: { type: 'param', path: '/patients/{}', in: 'uri', name: 'patientId', want: { type: 'string', pattern: { accepts: ['9434765919', '0000000001'], rejects: ['943476591', '94347659190', '943476591A', 'abcdefghij'] } } },
    },
    { label: 'POST /patients/{patientId}/allergies takes an Allergy body', rule: { type: 'body', path: '/patients/{}/allergies', method: 'post', typeIs: 'Allergy' } },
    { label: 'POST returns 201 with a Location header', rule: { type: 'response', path: '/patients/{}/allergies', method: 'post', status: '201', header: 'Location' } },
    {
      label: 'POST returns 400 for a bad body and 404 for an unknown patient',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/patients/{}/allergies', method: 'post', status: '400' },
          { type: 'response', path: '/patients/{}/allergies', method: 'post', status: '404' },
        ],
      },
    },
    { label: 'GET /patients/{patientId}/allergies returns a list of Allergy', rule: { type: 'response', path: '/patients/{}/allergies', method: 'get', status: '200', typeIs: 'Allergy[]' } },
  ],
  referenceRaml: `#%RAML 1.0
title: Patient Allergies API
mediaType: application/json

types:
  Allergy:
    type: object
    properties:
      substance:
        type: string
        minLength: 2
        maxLength: 100
      severity:
        type: string
        enum: [ mild, moderate, severe ]
      reaction?: string
      recordedOn: date-only
    example:
      substance: Penicillin
      severity: severe
      reaction: Swelling of the face and throat
      recordedOn: 2026-04-03

/patients:
  /{patientId}:
    uriParameters:
      patientId:
        type: string
        pattern: ^[0-9]{10}$
    /allergies:
      get:
        description: Every allergy recorded for the patient.
        responses:
          200:
            body:
              type: Allergy[]
          404:
            description: No patient has this id.
      post:
        description: Record a new allergy.
        body:
          type: Allergy
        responses:
          201:
            description: The allergy was recorded.
            headers:
              Location:
                type: string
                description: The URL of the new allergy record.
          400:
            description: The body does not fit the Allergy type.
          404:
            description: No patient has this id.
`,
  keyPoints: [
    'A post on a nested collection adds an item that belongs to the parent.',
    '400 means the request itself is wrong. 404 means the request is fine but the parent does not exist.',
    'The Location header goes under headers inside the 201 response.',
    'minLength and maxLength stop empty or huge text before it reaches the record system.',
    'An NHS number is a string with a pattern, because ids are not numbers you do sums with.',
  ],
  solution: `
\`/allergies\` sits under \`/{patientId}\`, so the URL says whose allergy it is, and the body does not need a patient id at all.

The body is the \`Allergy\` type. \`severity\` is an enum so the pharmacy system can match on three known values instead of free text. \`reaction\` is optional because a nurse may record a known allergy without having seen the reaction. \`recordedOn\` is \`date-only\` because the clinical record keeps the day.

The responses split three cases. 201 with \`Location\` means it worked and shows where the record lives. 400 means the tablet sent a bad body. 404 means the NHS number is valid in shape but no such patient exists, so the nurse should check the wristband.
`,
  followUps: [
    {
      q: 'Why not return 400 when the patient does not exist?',
      a: 'The request is well formed, so 400 is misleading. 404 tells the caller the parent resource is missing, which is a different fix.',
    },
    {
      q: 'Should the pattern alone validate an NHS number?',
      a: 'No. The pattern checks the shape. The check digit needs code in the implementation, which then returns 400.',
    },
    {
      q: 'What would you add if two nurses might record the same allergy at once?',
      a: 'Return 409 Conflict when the patient already has that substance recorded. The body can point at the existing record.',
    },
    {
      q: 'Why keep the patient id out of the body?',
      a: 'The URL already names the patient. A second copy in the body could disagree with the path and cause a record on the wrong patient.',
    },
  ],
}
