export default {
  id: 'rm-056',
  category: 'api-design',
  title: 'Lab Results API: A Library, DataType Fragments and JSON Examples in One Contract',
  level: 'ADVANCED',
  tags: ['raml', 'api-design', 'libraries', 'fragments', 'include', 'examples', 'healthcare'],
  estMinutes: 40,
  description: `
A hospital group is publishing lab results to its clinical apps. The contract has to be split up, so each part has a clear home:

- A **library** holds named parts that many APIs share. It is brought in with \`uses\`, and its names carry a prefix.
- A **DataType fragment** holds one unnamed type. It is brought in with \`!include\`, and the place that includes it gives it a name.
- A **JSON example** is a plain file, so test tools can read it as well.

Every path is relative to the file that holds it. This catches many people. \`types/lab-result.raml\` sits in \`types\`, so it reaches the examples folder with \`../examples/\`, and it reaches a file beside it by name alone.

A fragment stands on its own. It does not see the types declared in \`api.raml\`, so one fragment brings in another with \`!include\`.

This problem has six files. Use the tabs above the editor to move between them.

**Requirements for \`libraries/common.raml\`**
- A type \`Error\` with a required string \`code\` and a required string \`message\`.
- A trait \`traced\` with a required string header \`X-Correlation-Id\`.

**Requirements for \`types/reference-range.raml\`**
- A DataType fragment with a required number \`low\` and a required number \`high\`.

**Requirements for \`types/lab-result.raml\`**
- A DataType fragment with a required string \`resultId\`, a required string \`testCode\`, a required number \`value\`, a required string \`unit\`, and a required \`collectedAt\` that is a date and time with a time zone.
- A required \`range\`, which includes \`types/reference-range.raml\`.
- Its \`example\` includes \`examples/lab-result.json\`.

**Requirements for the JSON files**
- \`examples/lab-result.json\` fits the lab result type.
- \`examples/not-found.json\` fits \`Error\`.

**Requirements for \`api.raml\`**
- Title \`Lab Results API\`, with JSON as the default media type.
- Bring in the library with the prefix \`common\`.
- Declare \`LabResult\` and \`ReferenceRange\` with \`!include\`.
- \`GET /patients/{patientId}/results\` uses \`common.traced\` and returns \`LabResult[]\` with status 200.
- \`GET /results/{resultId}\` uses \`common.traced\` and returns a \`LabResult\` with status 200.
- It also returns 404 with a \`common.Error\` body, with \`examples/not-found.json\` as the example on that body.
- \`GET /tests/{testCode}/range\` uses \`common.traced\` and returns a \`ReferenceRange\` with status 200.
`,
  starter: `#%RAML 1.0
title: Lab Results API
mediaType: application/json

uses:

types:

/patients:
`,
  files: {
    'libraries/common.raml': `#%RAML 1.0 Library
usage: Parts shared by all clinical APIs.

types:

traits:
`,
    'types/reference-range.raml': `#%RAML 1.0 DataType
`,
    'types/lab-result.raml': `#%RAML 1.0 DataType
`,
    'examples/lab-result.json': `{
}
`,
    'examples/not-found.json': `{
}
`,
  },
  ramlChecks: [
    { label: 'The API brings in libraries/common.raml with the prefix common', rule: { type: 'library', prefix: 'common', file: 'libraries/common.raml' } },
    {
      label: 'The library holds Error with a required code and message',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'common.Error', prop: 'code', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'common.Error', prop: 'message', want: { type: 'string', required: true } },
        ],
      },
    },
    { label: 'The library holds the traced trait with X-Correlation-Id', rule: { type: 'trait', name: 'common.traced', has: 'headers.X-Correlation-Id' } },
    {
      label: 'ReferenceRange comes from types/reference-range.raml with a required low and high',
      rule: {
        type: 'all',
        rules: [
          { type: 'included', file: 'types/reference-range.raml' },
          { type: 'prop', typeName: 'ReferenceRange', prop: 'low', want: { type: 'number', required: true } },
          { type: 'prop', typeName: 'ReferenceRange', prop: 'high', want: { type: 'number', required: true } },
        ],
      },
    },
    {
      label: 'LabResult comes from types/lab-result.raml with its required properties',
      rule: {
        type: 'all',
        rules: [
          { type: 'included', file: 'types/lab-result.raml' },
          { type: 'prop', typeName: 'LabResult', prop: 'resultId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'LabResult', prop: 'testCode', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'LabResult', prop: 'value', want: { type: 'number', required: true } },
          { type: 'prop', typeName: 'LabResult', prop: 'unit', want: { type: 'string', required: true } },
        ],
      },
    },
    { label: 'collectedAt is a date and time with a time zone', rule: { type: 'prop', typeName: 'LabResult', prop: 'collectedAt', want: { type: 'datetime', required: true } } },
    { label: 'LabResult.range is brought in as a fragment, not by name', rule: { type: 'prop', typeName: 'LabResult', prop: 'range', want: { type: 'object', required: true } } },
    {
      label: 'LabResult has its example from examples/lab-result.json',
      rule: {
        type: 'all',
        rules: [
          { type: 'included', file: 'examples/lab-result.json' },
          { type: 'typeDecl', name: 'LabResult', want: { example: { set: true } } },
        ],
      },
    },
    {
      label: 'GET /patients/{patientId}/results uses common.traced and returns LabResult[]',
      rule: {
        type: 'all',
        rules: [
          { type: 'applied', path: '/patients/{}/results', method: 'get', trait: 'common.traced' },
          { type: 'response', path: '/patients/{}/results', method: 'get', status: '200', typeIs: 'LabResult[]' },
        ],
      },
    },
    {
      label: 'GET /results/{resultId} uses common.traced and returns a LabResult',
      rule: {
        type: 'all',
        rules: [
          { type: 'applied', path: '/results/{}', method: 'get', trait: 'common.traced' },
          { type: 'response', path: '/results/{}', method: 'get', status: '200', typeIs: 'LabResult' },
        ],
      },
    },
    { label: 'The trait gives the method a required X-Correlation-Id', rule: { type: 'param', path: '/results/{}', method: 'get', in: 'header', name: 'X-Correlation-Id', want: { type: 'string', required: true } } },
    {
      label: 'The 404 is a common.Error with the example file on its body',
      rule: {
        type: 'all',
        rules: [
          { type: 'included', file: 'examples/not-found.json' },
          { type: 'response', path: '/results/{}', method: 'get', status: '404', typeIs: 'common.Error', example: 'own' },
        ],
      },
    },
    {
      label: 'GET /tests/{testCode}/range uses common.traced and returns a ReferenceRange',
      rule: {
        type: 'all',
        rules: [
          { type: 'applied', path: '/tests/{}/range', method: 'get', trait: 'common.traced' },
          { type: 'response', path: '/tests/{}/range', method: 'get', status: '200', typeIs: 'ReferenceRange' },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Lab Results API
mediaType: application/json

uses:
  common: libraries/common.raml

types:
  LabResult: !include types/lab-result.raml
  ReferenceRange: !include types/reference-range.raml

/patients:
  /{patientId}:
    /results:
      get:
        is: [ common.traced ]
        responses:
          200:
            body:
              type: LabResult[]

/results:
  /{resultId}:
    get:
      is: [ common.traced ]
      responses:
        200:
          body:
            type: LabResult
        404:
          body:
            type: common.Error
            example: !include examples/not-found.json

/tests:
  /{testCode}:
    /range:
      get:
        is: [ common.traced ]
        responses:
          200:
            body:
              type: ReferenceRange
`,
  referenceFiles: {
    'libraries/common.raml': `#%RAML 1.0 Library
usage: Parts shared by all clinical APIs.

types:
  Error:
    type: object
    properties:
      code: string
      message: string

traits:
  traced:
    headers:
      X-Correlation-Id:
        type: string
`,
    'types/reference-range.raml': `#%RAML 1.0 DataType
type: object
properties:
  low: number
  high: number
`,
    'types/lab-result.raml': `#%RAML 1.0 DataType
type: object
properties:
  resultId: string
  testCode: string
  value: number
  unit: string
  collectedAt: datetime
  range: !include reference-range.raml
example: !include ../examples/lab-result.json
`,
    'examples/lab-result.json': `{
  "resultId": "R-20417",
  "testCode": "HBA1C",
  "value": 41.5,
  "unit": "mmol/mol",
  "collectedAt": "2026-02-03T08:15:00Z",
  "range": { "low": 20, "high": 42 }
}
`,
    'examples/not-found.json': `{
  "code": "RESULT_NOT_FOUND",
  "message": "No lab result has this id."
}
`,
  },
  keyPoints: [
    'A library is for named parts shared across APIs. A fragment is for one piece in its own file.',
    'uses takes a plain path, and !include brings in fragments and examples.',
    'Every path is relative to the file that holds it, so a fragment in types needs ../examples/.',
    'A fragment does not see the types in api.raml, so it brings in what it needs itself.',
    'Examples in their own files are still checked against the type.',
  ],
  solution: `
Each part sits where it fits. \`Error\` and \`traced\` are shared, so they live in the library. \`LabResult\` belongs to this API, so it is a fragment.

The two example paths look different on purpose. \`api.raml\` writes \`examples/not-found.json\`, and the fragment writes \`../examples/lab-result.json\`. Both point into the same folder, each from its own place.

\`range\` includes the fragment and does not name \`ReferenceRange\`. That name only exists in \`api.raml\`, and a fragment cannot see it. The same file serves both places, so the shape is written once.
`,
  followUps: [
    {
      q: 'When would you put LabResult in the library as well?',
      a: 'When a second API needs it. Until then a fragment keeps it private to this contract, and nobody else takes on a dependency that may change.',
    },
    {
      q: 'Why do example files help beyond the contract?',
      a: 'Tests and mocks can read the same JSON, so the examples stay real. A MUnit test can load the file instead of holding its own copy.',
    },
    {
      q: 'How do you share these files between API projects in Anypoint?',
      a: 'Publish them to Exchange as a RAML fragment asset, then add it to each project as a dependency. Each project pins a version, so an update is a choice.',
    },
  ],
}
