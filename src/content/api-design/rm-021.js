export default {
  id: 'rm-021',
  category: 'api-design',
  title: 'Patient Records API: Annotations and Documentation',
  level: 'INTERMEDIATE',
  tags: ['raml', 'api-design', 'annotations', 'documentation', 'healthcare'],
  estMinutes: 20,
  description: `
A hospital group is publishing a patient records API. The privacy team wants every sensitive field marked in the contract, so that tools can find those fields. Each API must also name the team that owns it. New consumers keep asking the same questions, so the contract needs a short guide.

An **annotation** is extra information you attach to part of a RAML file. RAML has no key for "owner" or "data class", so you invent your own. You declare it under \`annotationTypes\`, then use it with its name in brackets, as in \`(owner): Some Team\`. Annotations change nothing about how the API behaves. Tools read them.

The top-level \`documentation\` key holds guide pages. Each page has a \`title\` and \`content\`.

**Requirements**
- Title \`Patient Records API\`, with JSON as the default media type.
- A \`documentation\` section with at least one page.
- Annotation types \`owner\` (a string) and \`dataClass\` (a string that is one of \`PUBLIC\`, \`INTERNAL\`, \`SENSITIVE\`).
- The API as a whole is marked with \`(owner)\`.
- A type \`Patient\` with a required string \`patientId\`, a required string \`fullName\`, and a required \`dateOfBirth\` that holds a date with no time.
- \`fullName\` and \`dateOfBirth\` are marked \`(dataClass): SENSITIVE\`.
- \`patientId\` is marked \`(dataClass): INTERNAL\`.
- \`GET /patients/{patientId}\` returns a \`Patient\` with status 200, with an example, or 404.
`,
  starter: `#%RAML 1.0
title: Patient Records API
mediaType: application/json

annotationTypes:

types:
  Patient:
    type: object
    properties:

/patients:
`,
  ramlChecks: [
    {
      label: 'The title is Patient Records API and JSON is the default media type',
      rule: {
        type: 'all',
        rules: [
          { type: 'root', key: 'title', want: 'Patient Records API' },
          { type: 'root', key: 'mediaType', want: 'application/json' },
        ],
      },
    },
    { label: 'The file has a documentation section', rule: { type: 'root', key: 'documentation' } },
    {
      label: 'owner is a string annotation, and dataClass allows only PUBLIC, INTERNAL and SENSITIVE',
      rule: {
        type: 'all',
        rules: [
          { type: 'annotationType', name: 'owner', want: { type: 'string' } },
          { type: 'annotationType', name: 'dataClass', want: { type: 'string', enum: { exactly: ['PUBLIC', 'INTERNAL', 'SENSITIVE'] } } },
        ],
      },
    },
    { label: 'The API is marked with (owner)', rule: { type: 'annotated', name: 'owner' } },
    {
      label: 'Patient has required patientId, fullName and dateOfBirth',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Patient', prop: 'patientId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Patient', prop: 'fullName', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Patient', prop: 'dateOfBirth', want: { type: 'date-only', required: true } },
        ],
      },
    },
    {
      label: 'fullName and dateOfBirth are marked SENSITIVE',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Patient', prop: 'fullName', want: { '(dataClass)': 'SENSITIVE' } },
          { type: 'prop', typeName: 'Patient', prop: 'dateOfBirth', want: { '(dataClass)': 'SENSITIVE' } },
        ],
      },
    },
    { label: 'patientId is marked INTERNAL', rule: { type: 'prop', typeName: 'Patient', prop: 'patientId', want: { '(dataClass)': 'INTERNAL' } } },
    { label: 'GET /patients/{patientId} returns a Patient with an example', rule: { type: 'response', path: '/patients/{}', method: 'get', status: '200', typeIs: 'Patient', example: true } },
    { label: 'GET /patients/{patientId} returns 404 for an unknown patient', rule: { type: 'response', path: '/patients/{}', method: 'get', status: '404' } },
  ],
  referenceRaml: `#%RAML 1.0
title: Patient Records API
mediaType: application/json

documentation:
  - title: Getting started
    content: Ask the Patient Systems team for access, then read one patient by id.

annotationTypes:
  owner:
    type: string
  dataClass:
    type: string
    enum: [ PUBLIC, INTERNAL, SENSITIVE ]
    allowedTargets: TypeDeclaration

(owner): Patient Systems

types:
  Patient:
    type: object
    properties:
      patientId:
        type: string
        (dataClass): INTERNAL
      fullName:
        type: string
        (dataClass): SENSITIVE
      dateOfBirth:
        type: date-only
        (dataClass): SENSITIVE
    example:
      patientId: P-20417
      fullName: Asha Rao
      dateOfBirth: 1984-03-12

/patients:
  /{patientId}:
    get:
      responses:
        200:
          body:
            type: Patient
        404:
          description: No patient has this id.
`,
  keyPoints: [
    'Annotation types are declared under annotationTypes and used with brackets, as in (owner).',
    'An annotation adds information for tools. It does not change how the API behaves.',
    'allowedTargets limits where an annotation can go. TypeDeclaration covers types and properties.',
    'documentation is a list of pages, each with a title and content.',
    'date-only holds a date with no time, which suits a date of birth.',
  ],
  solution: `
\`owner\` and \`dataClass\` are declared once, so the RAML tooling can check each use. A value such as \`(dataClass): SECRET\` breaks the enum, which keeps the marking consistent.

\`(owner)\` sits at the top level, so it describes the API. \`(dataClass)\` sits on each property, because sensitivity belongs to a field and not to the whole record.

\`allowedTargets\` is optional here, but it stops someone marking a resource with a data class by mistake.
`,
  followUps: [
    {
      q: 'What could a team do with the dataClass annotation?',
      a: 'A script could read the contract and list every sensitive field, so a reviewer can check logging rules or masking. The value comes from a tool reading it. The annotation does nothing alone.',
    },
    {
      q: 'What is the difference between description and an annotation?',
      a: 'A description is free text for people. An annotation has a declared name and type, so a tool can read and check it.',
    },
    {
      q: 'What belongs in documentation and not on a resource?',
      a: 'Anything that spans the whole API: how to get access, how errors work, rate limits and a first example call. Details about one method belong on that method.',
    },
  ],
}
