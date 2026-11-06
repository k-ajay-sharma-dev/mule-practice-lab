export default {
  id: 'rm-033',
  category: 'api-design',
  title: 'Organisation API Standards: Layered Libraries and a Shared Resource Type',
  level: 'EXPERT',
  tags: ['raml', 'api-design', 'libraries', 'resource-types', 'governance', 'insurance'],
  estMinutes: 45,
  description: `
An insurer's API review board wants every new API to follow one standard. Errors, paging and the shape of a collection should come from shared files, so a team cannot get them wrong.

A library can use another library. The names of that inner library stay private. An API that uses \`core\` can write \`core.collection\`, but it cannot reach through to \`core.errors.Error\`. Only \`core\` itself decides what it passes on.

This problem has three files. Use the tabs above the editor to move between them.

**Requirements for \`standards/errors.raml\`**
- A library with a type \`Error\` that has a required string \`code\` and a required string \`message\`.

**Requirements for \`standards/core.raml\`**
- A library that uses \`standards/errors.raml\` with the prefix \`errors\`.
- A trait \`paged\` with an optional integer \`page\` of at least 1.
- A resource type \`collection\` with a parameter \`itemType\`. It offers \`get\` and \`post\`:
  - \`get\` returns \`<<itemType>>[]\` with status 200, and a 500 with an \`errors.Error\` body.
  - \`post\` takes a \`<<itemType>>\` body and returns 201, and a 400 with an \`errors.Error\` body.

**Requirements for \`api.raml\`**
- Title \`Claims API\`, with JSON as the default media type.
- Bring in the standards with the prefix \`core\`.
- A type \`Claim\` with a required string \`claimId\` and a required number \`amount\`.
- \`/claims\` uses \`core.collection\` with \`Claim\` as the item type.
- \`GET /claims\` uses \`core.paged\`.
- The responses and the body come from the resource type, so do not write them on \`/claims\`.
`,
  starter: `#%RAML 1.0
title: Claims API
mediaType: application/json

uses:

types:

/claims:
`,
  files: {
    'standards/core.raml': `#%RAML 1.0 Library
usage: The standard every API must follow.

uses:

traits:

resourceTypes:
`,
    'standards/errors.raml': `#%RAML 1.0 Library
usage: The standard error shape.

types:
`,
  },
  ramlChecks: [
    { label: 'The API brings in standards/core.raml with the prefix core', rule: { type: 'library', prefix: 'core', file: 'standards/core.raml' } },
    { label: 'Claim has a required string claimId', rule: { type: 'prop', typeName: 'Claim', prop: 'claimId', want: { type: 'string', required: true } } },
    { label: 'Claim has a required number amount', rule: { type: 'prop', typeName: 'Claim', prop: 'amount', want: { type: 'number', required: true } } },
    {
      label: 'The Error type sits in the inner library, with a required code and message',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'core.errors.Error', prop: 'code', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'core.errors.Error', prop: 'message', want: { type: 'string', required: true } },
          { type: 'noType', name: 'Error' },
        ],
      },
    },
    {
      label: 'core.paged gives GET /claims an optional page of at least 1',
      rule: {
        type: 'all',
        rules: [
          { type: 'applied', path: '/claims', method: 'get', trait: 'core.paged' },
          { type: 'param', path: '/claims', method: 'get', in: 'query', name: 'page', want: { type: 'integer', required: false, minimum: 1 } },
        ],
      },
    },
    {
      label: '/claims uses core.collection, and its responses and body come from there',
      rule: { type: 'typed', path: '/claims', resourceType: 'core.collection', provides: ['get.responses.200', 'get.responses.500', 'post.body', 'post.responses.201', 'post.responses.400'] },
    },
    {
      label: 'GET /claims returns Claim[], or 500 with the standard error',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/claims', method: 'get', status: '200', typeIs: 'Claim[]' },
          { type: 'response', path: '/claims', method: 'get', status: '500', typeIs: 'core.errors.Error' },
        ],
      },
    },
    {
      label: 'POST /claims takes a Claim and returns 201, or 400 with the standard error',
      rule: {
        type: 'all',
        rules: [
          { type: 'body', path: '/claims', method: 'post', typeIs: 'Claim' },
          { type: 'response', path: '/claims', method: 'post', status: '201' },
          { type: 'response', path: '/claims', method: 'post', status: '400', typeIs: 'core.errors.Error' },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Claims API
mediaType: application/json

uses:
  core: standards/core.raml

types:
  Claim:
    type: object
    properties:
      claimId: string
      amount: number

/claims:
  type: { core.collection: { itemType: Claim } }
  get:
    is: [ core.paged ]
`,
  referenceFiles: {
    'standards/core.raml': `#%RAML 1.0 Library
usage: The standard every API must follow.

uses:
  errors: errors.raml

traits:
  paged:
    queryParameters:
      page?:
        type: integer
        minimum: 1

resourceTypes:
  collection:
    get:
      responses:
        200:
          body:
            type: <<itemType>>[]
        500:
          body:
            type: errors.Error
    post:
      body:
        type: <<itemType>>
      responses:
        201:
          description: Created.
        400:
          body:
            type: errors.Error
`,
    'standards/errors.raml': `#%RAML 1.0 Library
usage: The standard error shape.

types:
  Error:
    type: object
    properties:
      code: string
      message: string
`,
  },
  keyPoints: [
    'A path in uses is relative to the file that holds it, so core.raml writes errors.raml.',
    'A library can use another library, and the inner names stay private to it.',
    'A resource type from a library is applied as core.collection, with its parameters beside the name.',
    'Standards in shared files turn a review rule into something the contract enforces.',
  ],
  solution: `
\`api.raml\` holds only what is special about claims. The review board's rules arrive through \`core.collection\`, so a team cannot forget the error shape.

\`errors.raml\` stays private to \`core.raml\`. The board can reorganise its inner files without breaking any API, because APIs depend on \`core\` alone.

\`<<itemType>>\` is filled in by the API, so \`Claim\` is looked up in \`api.raml\`, while \`errors.Error\` is looked up in the library that wrote it.
`,
  followUps: [
    {
      q: 'How do you stop a team skipping the standard?',
      a: 'Shared files make the right way the easy path, but they do not force it. Add API governance rulesets in Anypoint, so a contract that breaks the rules is flagged before it is published.',
    },
    {
      q: 'A team needs one extra response on /claims. Does it have to change the library?',
      a: 'No. Anything written on the resource is merged with the resource type, so the team can add a 409 to POST on its own resource.',
    },
    {
      q: 'What is the cost of many layers of libraries?',
      a: 'Each layer is one more thing to version and understand. Keep to the layers that give real separation, and avoid a chain of small files that people must follow to read one type.',
    },
  ],
}
