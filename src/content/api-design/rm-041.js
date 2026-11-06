export default {
  id: 'rm-041',
  category: 'api-design',
  title: 'Course Enrolment API: Nullable Fields and Optional Properties',
  level: 'INTERMEDIATE',
  tags: ['raml', 'api-design', 'data-types', 'nullable', 'nil', 'optional-properties', 'education'],
  estMinutes: 15,
  description: `
A university exposes each student's enrolment to its portal. The portal team asked a fair question: when a student has no grade yet, does the key go missing, or is it there with \`null\`? The two cases need different code, so the contract must say which.

- **Optional** means the key can be left out. The question mark goes on the name: \`note?: string\`.
- **Nullable** means the key is always there, and its value can be \`null\`. The type allows \`nil\`, which is the RAML type for null: \`note: string | nil\`.
- \`string?\` with the question mark on the type is short for \`string | nil\`.

Watch where the question mark goes. It changes the meaning.

**Requirements**
- A type \`Enrolment\` has these properties:
  - \`enrolmentId\`: a string that is always present and never null.
  - \`grade\`: a string. The key is always present, and the value is null until the course is marked.
  - \`finalScore\`: a number. The key is always present, and the value is null until the course is marked.
  - \`tutorNote\`: a string. The key is left out when there is no note, and it is never null.
- \`Enrolment\` has an example that fits it.
- \`GET /enrolments/{enrolmentId}\` returns an \`Enrolment\` with status 200, or 404.
`,
  starter: `#%RAML 1.0
title: Course Enrolment API
mediaType: application/json

types:
  Enrolment:
    type: object
    properties:
      enrolmentId: string

/enrolments:
`,
  ramlChecks: [
    {
      label: 'enrolmentId is required and never null',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Enrolment', prop: 'enrolmentId', want: { type: { oneOf: ['string'], not: '?' }, required: true } },
          { type: 'prop', typeName: 'Enrolment', prop: 'enrolmentId', want: { type: { oneOf: ['string'], not: 'nil' } } },
        ],
      },
    },
    {
      label: 'grade is a required nullable string',
      rule: {
        type: 'any',
        rules: [
          { type: 'prop', typeName: 'Enrolment', prop: 'grade', want: { type: ['string', 'nil'], required: true } },
          { type: 'prop', typeName: 'Enrolment', prop: 'grade', want: { type: 'string?', required: true } },
        ],
      },
    },
    {
      label: 'finalScore is a required nullable number',
      rule: {
        type: 'any',
        rules: [
          { type: 'prop', typeName: 'Enrolment', prop: 'finalScore', want: { type: ['number', 'nil'], required: true } },
          { type: 'prop', typeName: 'Enrolment', prop: 'finalScore', want: { type: 'number?', required: true } },
        ],
      },
    },
    {
      label: 'tutorNote is an optional string that is never null',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Enrolment', prop: 'tutorNote', want: { type: { oneOf: ['string'], not: '?' }, required: false } },
          { type: 'prop', typeName: 'Enrolment', prop: 'tutorNote', want: { type: { oneOf: ['string'], not: 'nil' } } },
        ],
      },
    },
    {
      label: 'Enrolment has an example',
      rule: {
        type: 'any',
        rules: [
          { type: 'typeDecl', name: 'Enrolment', want: { example: { set: true } } },
          { type: 'typeDecl', name: 'Enrolment', want: { examples: { set: true } } },
        ],
      },
    },
    { label: 'GET /enrolments/{enrolmentId} returns an Enrolment', rule: { type: 'response', path: '/enrolments/{}', method: 'get', status: '200', typeIs: 'Enrolment' } },
    { label: 'GET /enrolments/{enrolmentId} returns 404', rule: { type: 'response', path: '/enrolments/{}', method: 'get', status: '404' } },
  ],
  referenceRaml: `#%RAML 1.0
title: Course Enrolment API
mediaType: application/json

types:
  Enrolment:
    type: object
    properties:
      enrolmentId: string
      grade: string?
      finalScore: number | nil
      tutorNote?: string
    example:
      enrolmentId: E-30417
      grade: null
      finalScore: null

/enrolments:
  /{enrolmentId}:
    get:
      responses:
        200:
          body:
            type: Enrolment
        404:
          description: No enrolment has this id.
`,
  keyPoints: [
    'Optional is about the key: it can be left out. Nullable is about the value: it can be null.',
    'note?: string is optional. note: string? is required and nullable.',
    'string? is short for string | nil.',
    'The two can be combined, but a field that can both vanish and be null gives consumers three cases to handle.',
  ],
  solution: `
\`grade\` and \`finalScore\` are always sent, so the portal can read them with no check for a missing key. A \`null\` tells it the course is not marked yet.

\`tutorNote\` is the opposite. Most enrolments have no note, so the key is left out.

The example shows a student who is not marked. \`grade\` and \`finalScore\` must both appear, even as \`null\`, because they are required. \`tutorNote\` can be missing.
`,
  followUps: [
    {
      q: 'Why does the difference between missing and null matter on a PATCH?',
      a: 'A missing key usually means leave this value alone. An explicit null means clear it. The two lead to different updates, so the contract must allow the one you mean.',
    },
    {
      q: 'What does a consumer gain from a required nullable field over an optional one?',
      a: 'A stable shape. The key is always in the payload, so mapping code does not branch on its presence, and a typed client gets one predictable field.',
    },
    {
      q: 'Where does the type nil appear beyond nullable fields?',
      a: 'It can stand alone, for a value that must be null. It also works in any union, such as Address | nil for a nested object that may be empty.',
    },
  ],
}
