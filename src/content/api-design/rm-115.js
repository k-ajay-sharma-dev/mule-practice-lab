export default {
  id: 'rm-115',
  category: 'api-design',
  title: 'Patient Lookup System API: A FHIR-Style Read-Only Contract',
  level: 'ADVANCED',
  tags: ['raml', 'api-design', 'system-api', 'api-led', 'media-types', 'security', 'healthcare'],
  estMinutes: 35,
  description: `
A regional health network has 14 hospitals and one patient index, the system that knows every patient's identifiers. Clinical apps, the lab system and a booking app all need to look patients up, about 2 million lookups a day.

The network has chosen **HL7 FHIR** shapes for patient data, so that new apps can use FHIR libraries. You are writing the read-only **System API** in front of the patient index. You do not need to know FHIR well: the brief gives every shape you need, in a small subset of the standard.

**Brief**
- FHIR names a resource with a capital letter in the path: \`/Patient\` and \`/Patient/{id}\`.
- The media type is \`application/fhir+json\`.
- A search never returns a bare list. It returns a \`Bundle\` whose \`type\` is \`searchset\`, with a \`total\` and an \`entry\` list. Each entry holds a \`resource\`.
- Every error is an \`OperationOutcome\` holding at least one \`issue\`.
- An identifier search is written as \`system|value\`, such as \`https://id.example.org/nhi|9434765919\`.
- A patient record that was merged into another or removed answers 410 Gone, not 404, so callers know it existed.
- Callers are other systems, not people. They get a token with the client credentials grant and the scope \`system/Patient.read\`.

**Requirements**
- Title \`Patient Lookup System API\`, version \`v1\`, and \`application/fhir+json\` as the default media type.
- \`Patient\` has a required \`resourceType\` whose only value is \`Patient\`, a required string \`id\`, a required \`identifier\` of type \`Identifier[]\`, a required \`name\` of type \`HumanName[]\`, a required \`gender\` that is one of \`male\`, \`female\`, \`other\`, \`unknown\`, and a required \`birthDate\` with no time.
- \`Bundle\` has a required \`type\` whose only value is \`searchset\`, a required integer \`total\` of at least 0, and an optional \`entry\` of type \`BundleEntry[]\`. \`BundleEntry\` has a required \`resource\` of type \`Patient\`.
- \`OperationOutcome\` has a required \`issue\` of type \`Issue[]\`. \`Issue\` has a required \`severity\` that is one of \`fatal\`, \`error\`, \`warning\`, \`information\`.
- \`GET /Patient\` returns a \`Bundle\` with status 200, or an \`OperationOutcome\` with status 400 when the search has no usable parameter.
- \`GET /Patient\` has optional query parameters \`identifier\` (with a pattern for \`system|value\`), \`family\` (a string), \`birthdate\` (a date with no time) and \`_count\` (an integer from 1 to 50).
- \`GET /Patient/{id}\` returns a \`Patient\` with status 200, or an \`OperationOutcome\` with status 404 or 410.
- The API is read-only: no \`post\`, \`put\` or \`delete\` on either resource.
- A scheme \`oauth2\` of type \`OAuth 2.0\` with the grant \`client_credentials\`. Both methods need the scope \`system/Patient.read\`.
`,
  starter: `#%RAML 1.0
title: Patient Lookup System API

types:

securitySchemes:

/Patient:
`,
  ramlChecks: [
    {
      label: 'The title, version v1 and application/fhir+json',
      rule: {
        type: 'all',
        rules: [
          { type: 'root', key: 'title', want: 'Patient Lookup System API' },
          { type: 'root', key: 'version', want: 'v1' },
          { type: 'root', key: 'mediaType', want: 'application/fhir+json' },
        ],
      },
    },
    {
      label: 'Patient has resourceType, id, identifier and name',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Patient', prop: 'resourceType', want: { required: true, enum: { exactly: ['Patient'] } } },
          { type: 'prop', typeName: 'Patient', prop: 'id', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Patient', prop: 'identifier', want: { type: 'Identifier[]', required: true } },
          { type: 'prop', typeName: 'Patient', prop: 'name', want: { type: 'HumanName[]', required: true } },
        ],
      },
    },
    {
      label: 'Patient has the four FHIR genders and a date-only birthDate',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Patient', prop: 'gender', want: { required: true, enum: { exactly: ['male', 'female', 'other', 'unknown'] } } },
          { type: 'prop', typeName: 'Patient', prop: 'birthDate', want: { type: 'date-only', required: true } },
        ],
      },
    },
    {
      label: 'Bundle is a searchset with a total and optional entries',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Bundle', prop: 'type', want: { required: true, enum: { exactly: ['searchset'] } } },
          { type: 'prop', typeName: 'Bundle', prop: 'total', want: { type: 'integer', required: true, minimum: 0 } },
          { type: 'prop', typeName: 'Bundle', prop: 'entry', want: { type: 'BundleEntry[]', required: false } },
          { type: 'prop', typeName: 'BundleEntry', prop: 'resource', want: { type: 'Patient', required: true } },
        ],
      },
    },
    {
      label: 'OperationOutcome holds issues with a FHIR severity',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'OperationOutcome', prop: 'issue', want: { type: 'Issue[]', required: true } },
          { type: 'prop', typeName: 'Issue', prop: 'severity', want: { required: true, enum: { exactly: ['fatal', 'error', 'warning', 'information'] } } },
        ],
      },
    },
    {
      label: 'GET /Patient returns a Bundle, or an OperationOutcome with 400',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/Patient', method: 'get', status: '200', typeIs: 'Bundle' },
          { type: 'response', path: '/Patient', method: 'get', status: '400', typeIs: 'OperationOutcome' },
        ],
      },
    },
    {
      label: 'identifier is optional with a system|value pattern',
      rule: {
        type: 'param',
        path: '/Patient',
        method: 'get',
        in: 'query',
        name: 'identifier',
        want: { required: false, pattern: { accepts: ['https://id.example.org/nhi|9434765919', 'urn:mrn|A1'], rejects: ['9434765919', '|9434765919', 'https://id.example.org/nhi|', 'a|b|c'] } },
      },
    },
    {
      label: 'family, birthdate and _count are optional and typed',
      rule: {
        type: 'all',
        rules: [
          { type: 'param', path: '/Patient', method: 'get', in: 'query', name: 'family', want: { type: 'string', required: false } },
          { type: 'param', path: '/Patient', method: 'get', in: 'query', name: 'birthdate', want: { type: 'date-only', required: false } },
          { type: 'param', path: '/Patient', method: 'get', in: 'query', name: '_count', want: { type: 'integer', required: false, minimum: 1, maximum: 50 } },
        ],
      },
    },
    {
      label: 'GET /Patient/{id} returns a Patient, or an OperationOutcome with 404 or 410',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/Patient/{}', method: 'get', status: '200', typeIs: 'Patient' },
          { type: 'response', path: '/Patient/{}', method: 'get', status: '404', typeIs: 'OperationOutcome' },
          { type: 'response', path: '/Patient/{}', method: 'get', status: '410', typeIs: 'OperationOutcome' },
        ],
      },
    },
    {
      label: 'The API is read-only',
      rule: {
        type: 'all',
        rules: [
          { type: 'method', path: '/Patient', method: 'get' },
          { type: 'noMethod', path: '/Patient', method: 'post' },
          { type: 'noMethod', path: '/Patient/{}', method: 'put' },
          { type: 'noMethod', path: '/Patient/{}', method: 'delete' },
          { type: 'noMethod', path: '/Patient/{}', method: 'patch' },
        ],
      },
    },
    {
      label: 'Both methods need a client_credentials token with system/Patient.read',
      rule: {
        type: 'all',
        rules: [
          { type: 'scheme', name: 'oauth2', schemeType: 'OAuth 2.0', values: { 'settings.authorizationGrants': 'client_credentials' } },
          { type: 'secured', path: '/Patient', method: 'get', scheme: 'oauth2', scopes: ['system/Patient.read'], required: true },
          { type: 'secured', path: '/Patient/{}', method: 'get', scheme: 'oauth2', scopes: ['system/Patient.read'], required: true },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Patient Lookup System API
version: v1
baseUri: https://api.example.com/fhir/{version}
protocols: [ HTTPS ]
mediaType: application/fhir+json

types:
  Identifier:
    type: object
    properties:
      system: string
      value: string
  HumanName:
    type: object
    properties:
      family: string
      given?: string[]
  Patient:
    type: object
    properties:
      resourceType:
        type: string
        enum: [ Patient ]
      id: string
      identifier: Identifier[]
      name: HumanName[]
      gender:
        type: string
        enum: [ male, female, other, unknown ]
      birthDate: date-only
    example:
      resourceType: Patient
      id: pat-00412877
      identifier:
        - system: https://id.example.org/nhi
          value: '9434765919'
      name:
        - family: Okafor
          given: [ Ada, Grace ]
      gender: female
      birthDate: 1984-07-23
  BundleEntry:
    type: object
    properties:
      fullUrl: string
      resource: Patient
  Bundle:
    type: object
    properties:
      resourceType:
        type: string
        enum: [ Bundle ]
      type:
        type: string
        enum: [ searchset ]
      total:
        type: integer
        minimum: 0
      entry?: BundleEntry[]
  Issue:
    type: object
    properties:
      severity:
        type: string
        enum: [ fatal, error, warning, information ]
      code: string
      diagnostics?: string
  OperationOutcome:
    type: object
    properties:
      resourceType:
        type: string
        enum: [ OperationOutcome ]
      issue:
        type: Issue[]
        minItems: 1

securitySchemes:
  oauth2:
    type: OAuth 2.0
    describedBy:
      headers:
        Authorization:
          type: string
      responses:
        401:
          description: The token is missing or not valid.
    settings:
      accessTokenUri: https://auth.example.com/token
      authorizationGrants: [ client_credentials ]
      scopes: [ system/Patient.read ]

securedBy: [ oauth2: { scopes: [ system/Patient.read ] } ]

/Patient:
  get:
    description: Search for patients.
    queryParameters:
      identifier?:
        type: string
        pattern: ^[^|]+[|][^|]+$
        example: https://id.example.org/nhi|9434765919
      family?: string
      birthdate?: date-only
      _count?:
        type: integer
        minimum: 1
        maximum: 50
        default: 10
    responses:
      200:
        body:
          type: Bundle
      400:
        description: The search has no usable parameter.
        body:
          type: OperationOutcome
  /{id}:
    get:
      responses:
        200:
          body:
            type: Patient
        404:
          body:
            type: OperationOutcome
        410:
          description: The record was merged into another or removed.
          body:
            type: OperationOutcome
`,
  keyPoints: [
    'Following a standard such as FHIR lets callers use existing libraries and tools, so the contract follows its names exactly.',
    'A search returns a Bundle with a total, never a bare array. The wrapper has room for paging links later.',
    'A System API that only reads must not offer post, put or delete. Leaving them out is part of the design.',
    '410 Gone tells a caller the record existed and was merged or removed, which matters for clinical safety.',
    'System callers use client_credentials with a narrow read scope.',
  ],
  solution: `
The shapes come from the brief, and the contract keeps FHIR's names: \`/Patient\` with a capital letter, \`resourceType\` on every body, lower case gender codes, and \`birthDate\` on the resource while the search parameter is \`birthdate\`. Matching the standard letter for letter is what lets a FHIR client library parse the responses.

The search returns a \`Bundle\`, not \`Patient[]\`. \`total\` says how many matched, and \`entry\` may be missing when nothing matched. A 400 with an \`OperationOutcome\` covers a search with no usable parameter, so nobody can pull the whole index in one call. \`_count\` is capped at 50 for the same reason.

The identifier pattern requires text on both sides of exactly one bar. \`[|]\` is a bar inside a character class, which avoids escaping.

The 410 is a safety decision. When two records for one person are merged, a clinician who looks up the old id must learn that it is gone, not that it never existed.

Only GET is offered. Registering and merging patients belongs to the patient index's own tools, and leaving those methods out keeps every caller of this API read-only.
`,
  followUps: [
    {
      q: 'Why not return Patient[] from the search?',
      a: 'FHIR clients expect a Bundle. The wrapper also carries the total and, later, links to the next page, which a bare array has no place for.',
    },
    {
      q: 'How would you add paging?',
      a: 'Add a link list to Bundle with relation next and a URL. The caller follows next until it is missing, which is how FHIR servers page.',
    },
    {
      q: 'The lab system wants to update a patient address. Where does that go?',
      a: 'Not in this API. Address changes go through the patient index workflow or a separate API with its own write scope and audit trail.',
    },
    {
      q: 'How would API Manager protect this API?',
      a: 'Apply an OAuth 2.0 token enforcement policy that requires system/Patient.read. Add rate limiting per client, and keep full patient data out of the logs.',
    },
  ],
}
