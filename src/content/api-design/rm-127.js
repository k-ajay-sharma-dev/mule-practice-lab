export default {
  id: 'rm-127',
  category: 'api-design',
  title: 'Tenancy Repairs API: Errors as application/problem+json',
  level: 'INTERMEDIATE',
  tags: ['raml', 'api-design', 'errors', 'problem-details', 'media-types', 'status-codes', 'housing'],
  estMinutes: 20,
  description: `
Kestrel Homes is a housing association with 12,000 homes. Tenants report repairs in an app, and three contractors read the same API. Each team that built part of the old API invented its own error body, so the app had to handle four shapes.

The new contract uses one error shape for every API: **Problem Details** (RFC 9457, which replaced RFC 7807). A problem is a JSON object sent with the media type \`application/problem+json\`, so a client can tell an error body from a normal one by its content type alone. Its common members are:

- \`type\`: a URI that names the kind of problem
- \`title\`: a short, human-readable summary of that kind of problem
- \`status\`: the HTTP status code, repeated in the body
- \`detail\`: what went wrong in this case
- \`instance\`: a URI for this one occurrence

**Requirements**
- Title \`Tenancy Repairs API\`, with JSON as the default media type.
- A type \`Problem\` with required strings \`type\` and \`title\`, a required integer \`status\` from 400 to 599, and optional strings \`detail\` and \`instance\`. \`Problem\` has an example.
- A type \`RepairRequest\` with:
  - \`propertyId\`: required, \`KH-\` and five digits, such as \`KH-04412\`.
  - \`issue\`: required, one of \`LEAK\`, \`HEATING\`, \`ELECTRICAL\`, \`DOOR\`, \`OTHER\`.
  - \`description\`: a required string of at least 10 characters.
- A type \`Repair\` that inherits from \`RepairRequest\` and adds a required string \`repairId\` and a required \`status\` that is one of \`REPORTED\`, \`BOOKED\`, \`DONE\`.
- \`POST /repairs\` takes a \`RepairRequest\` and returns a \`Repair\` with 201 and a \`Location\` header, or a \`Problem\` as \`application/problem+json\` with 400.
- \`GET /repairs/{repairId}\` returns a \`Repair\` with 200, or a \`Problem\` as \`application/problem+json\` with 404.
`,
  starter: `#%RAML 1.0
title: Tenancy Repairs API
mediaType: application/json

types:
  Error:
    type: object
    properties:
      errorCode: string
      errorText: string

/repairs:
  post:
    responses:
      400:
        body:
          type: Error
`,
  ramlChecks: [
    {
      label: 'The title is Tenancy Repairs API and JSON is the default',
      rule: { type: 'all', rules: [{ type: 'root', key: 'title', want: 'Tenancy Repairs API' }, { type: 'root', key: 'mediaType', want: 'application/json' }] },
    },
    {
      label: 'Problem has required type, title and status from 400 to 599',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Problem', prop: 'type', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Problem', prop: 'title', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Problem', prop: 'status', want: { type: 'integer', required: true, minimum: 400, maximum: 599 } },
        ],
      },
    },
    {
      label: 'Problem has optional detail and instance, and an example',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Problem', prop: 'detail', want: { type: 'string', required: false } },
          { type: 'prop', typeName: 'Problem', prop: 'instance', want: { type: 'string', required: false } },
          { type: 'any', rules: [{ type: 'typeDecl', name: 'Problem', want: { example: { set: true } } }, { type: 'typeDecl', name: 'Problem', want: { examples: { set: true } } }] },
        ],
      },
    },
    {
      label: 'propertyId is KH- and five digits',
      rule: { type: 'prop', typeName: 'RepairRequest', prop: 'propertyId', want: { required: true, pattern: { accepts: ['KH-04412', 'KH-99999'], rejects: ['KH-4412', 'kh-04412', 'KH-044120', 'KH04412', 'XKH-04412'] } } },
    },
    {
      label: 'issue is one of five values and description has at least 10 characters',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'RepairRequest', prop: 'issue', want: { required: true, enum: { exactly: ['LEAK', 'HEATING', 'ELECTRICAL', 'DOOR', 'OTHER'] } } },
          { type: 'prop', typeName: 'RepairRequest', prop: 'description', want: { type: 'string', required: true, minLength: 10 } },
        ],
      },
    },
    {
      label: 'Repair inherits RepairRequest and adds repairId and status',
      rule: {
        type: 'all',
        rules: [
          { type: 'typeDecl', name: 'Repair', extends: 'RepairRequest' },
          { type: 'prop', typeName: 'Repair', prop: 'repairId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Repair', prop: 'status', want: { required: true, enum: { exactly: ['REPORTED', 'BOOKED', 'DONE'] } } },
        ],
      },
    },
    {
      label: 'POST /repairs takes a RepairRequest and returns a Repair with 201 and Location',
      rule: {
        type: 'all',
        rules: [
          { type: 'body', path: '/repairs', method: 'post', typeIs: 'RepairRequest' },
          { type: 'response', path: '/repairs', method: 'post', status: '201', typeIs: 'Repair', header: 'Location' },
        ],
      },
    },
    {
      label: 'POST /repairs returns a Problem as application/problem+json with 400',
      rule: { type: 'response', path: '/repairs', method: 'post', status: '400', media: 'application/problem+json', typeIs: 'Problem' },
    },
    {
      label: 'GET /repairs/{repairId} returns a Repair, or a Problem as application/problem+json with 404',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/repairs/{}', method: 'get', status: '200', typeIs: 'Repair' },
          { type: 'response', path: '/repairs/{}', method: 'get', status: '404', media: 'application/problem+json', typeIs: 'Problem' },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Tenancy Repairs API
version: v1
baseUri: https://api.example.com/repairs/{version}
mediaType: application/json

types:
  Problem:
    type: object
    properties:
      type: string
      title: string
      status:
        type: integer
        minimum: 400
        maximum: 599
      detail?: string
      instance?: string
    example:
      type: https://api.example.com/problems/repair-not-found
      title: Repair not found
      status: 404
      detail: No repair has the id RP-77031.
      instance: /repairs/RP-77031
  RepairRequest:
    type: object
    properties:
      propertyId:
        type: string
        pattern: ^KH-[0-9]{5}$
      issue:
        type: string
        enum: [ LEAK, HEATING, ELECTRICAL, DOOR, OTHER ]
      description:
        type: string
        minLength: 10
  Repair:
    type: RepairRequest
    properties:
      repairId: string
      status:
        type: string
        enum: [ REPORTED, BOOKED, DONE ]

/repairs:
  post:
    body:
      type: RepairRequest
    responses:
      201:
        headers:
          Location:
            type: string
        body:
          type: Repair
      400:
        description: The request does not fit. detail says which field is wrong.
        body:
          application/problem+json:
            type: Problem
  /{repairId}:
    get:
      responses:
        200:
          body:
            type: Repair
        404:
          body:
            application/problem+json:
              type: Problem
`,
  keyPoints: [
    'Problem Details (RFC 9457, formerly RFC 7807) is a standard error body with type, title, status, detail and instance.',
    'application/problem+json lets a client spot an error body from its content type.',
    'A media type key under one response body overrides the default mediaType for that body only.',
    'type names the kind of problem and stays the same for every case of it. detail and instance describe this case.',
    'One error shape across every API means each client writes its error handling once.',
  ],
  solution: `
**One shape for every error.** The old API had four error bodies. \`Problem\` replaces them all, and because it is a published standard, clients and tools may already know it.

**The media type.** The 400 and 404 bodies are keyed by \`application/problem+json\`. Normal bodies have no key, so they use the default JSON. A client can then branch on the \`Content-Type\` header before it parses anything.

**The members.**
| Member | Example | Changes per case? |
|---|---|---|
| \`type\` | \`https://api.example.com/problems/repair-not-found\` | No |
| \`title\` | \`Repair not found\` | No |
| \`status\` | \`404\` | No |
| \`detail\` | \`No repair has the id RP-77031.\` | Yes |
| \`instance\` | \`/repairs/RP-77031\` | Yes |

\`status\` is limited to 400 to 599, because a problem is always an error.

**A property called type.** Inside \`properties\`, \`type\` is the name of a property, not the RAML keyword. RAML reads the keys of \`properties\` as names, so this is allowed.
`,
  followUps: [
    {
      q: 'How do you return the field errors for a 400 with several bad fields?',
      a: 'The standard allows extra members. Add an optional `errors` array to a type that inherits from Problem, with one item per field holding the field name and a message.',
    },
    {
      q: 'Does the type URI have to lead to a real page?',
      a: 'It does not have to, but it helps. A page that explains the problem and how to fix it gives developers somewhere to look. The URI should stay the same once published, because clients may compare it.',
    },
    {
      q: 'How does a Mule app send this media type?',
      a: 'The body is ordinary JSON, so the error handler builds it with a Transform as usual. What differs is the Content-Type of the response. Set it in the error response of the listener, then call the API and check the header the client really gets.',
    },
  ],
}
