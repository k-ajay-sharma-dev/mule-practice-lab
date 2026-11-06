export default {
  id: 'rm-030',
  category: 'api-design',
  title: 'Enrolment Process API: A Complete Contract',
  level: 'EXPERT',
  tags: ['raml', 'api-design', 'process-api', 'api-led', 'traits', 'resource-types', 'security', 'education'],
  estMinutes: 50,
  description: `
A university wants one way to enrol a student on a course. Enrolling means checking the student record, checking the course has room, and raising a fee. Those live in three separate systems, each behind its own System API.

A **Process API** is the middle layer of API-led connectivity. It combines System APIs into one business action, so the website and the mobile app do not each rebuild that logic. Its contract speaks only of the business action and never names the systems behind it.

This task brings together what a real contract needs: types, traits, a resource type and security. Write the whole file.

**Requirements**

*API details*
- Title \`Enrolment Process API\`, version \`v1\`, a base URI that uses \`{version}\`, and JSON as the default media type.

*Types*
- \`EnrolmentRequest\` with required strings \`studentId\` and \`courseCode\`, and a required \`startDate\` that holds a date with no time.
- \`Enrolment\` extends \`EnrolmentRequest\` and adds a required string \`enrolmentId\` and a required \`status\` that is one of \`PENDING\`, \`CONFIRMED\`, \`REJECTED\`. It has an example that fits it.
- \`Error\` with required strings \`code\` and \`message\`.

*Security*
- A scheme \`oauth2\` of type \`OAuth 2.0\`, with \`accessTokenUri\` \`https://auth.example.com/token\` and the grant \`client_credentials\`. Every method is secured by it.

*Traits*
- \`paged\` with an optional integer \`limit\` (minimum 1, maximum 100, default 20) and an optional integer \`offset\` (minimum 0).
- \`traced\` with a required string header \`X-Correlation-Id\`, which links one request across all the APIs it touches.
- \`downstreamErrors\` with a 503 response that has an \`Error\` body, for when a system behind the API cannot be reached.

*Resource type*
- \`collection\`, which takes the item type and the request type as parameters. Its \`get\` returns a list of the item type with status 200. Its \`post\` takes the request type and returns the item type with status 201 and a \`Location\` header.

*Resources*
- \`/enrolments\` uses \`collection\` with \`Enrolment\` and \`EnrolmentRequest\`.
- \`GET /enrolments\` uses \`paged\` and has an optional string query parameter \`studentId\`.
- \`POST /enrolments\` returns an \`Error\` with status 409 when the course is full or the student is already enrolled.
- \`GET /enrolments/{enrolmentId}\` returns an \`Enrolment\` with status 200, or an \`Error\` with status 404.
- All three methods use \`traced\` and \`downstreamErrors\`.
`,
  starter: `#%RAML 1.0
title: Enrolment Process API
version: v1

types:

securitySchemes:

traits:

resourceTypes:

/enrolments:
`,
  ramlChecks: [
    { label: 'The title is Enrolment Process API', rule: { type: 'root', key: 'title', want: 'Enrolment Process API' } },
    { label: 'The version is v1', rule: { type: 'root', key: 'version', want: 'v1' } },
    { label: 'The base URI uses {version}', rule: { type: 'root', key: 'baseUri', want: '{version}' } },
    { label: 'JSON is the default media type', rule: { type: 'root', key: 'mediaType', want: 'application/json' } },
    {
      label: 'EnrolmentRequest has required studentId, courseCode and startDate',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'EnrolmentRequest', prop: 'studentId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'EnrolmentRequest', prop: 'courseCode', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'EnrolmentRequest', prop: 'startDate', want: { type: 'date-only', required: true } },
        ],
      },
    },
    {
      label: 'Enrolment extends EnrolmentRequest with enrolmentId and status',
      rule: {
        type: 'all',
        rules: [
          { type: 'typeDecl', name: 'Enrolment', extends: 'EnrolmentRequest' },
          { type: 'prop', typeName: 'Enrolment', prop: 'enrolmentId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Enrolment', prop: 'status', want: { required: true, enum: { exactly: ['PENDING', 'CONFIRMED', 'REJECTED'] } } },
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
    {
      label: 'Error has required code and message',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Error', prop: 'code', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Error', prop: 'message', want: { type: 'string', required: true } },
        ],
      },
    },
    {
      label: 'oauth2 is an OAuth 2.0 scheme that secures every method',
      rule: {
        type: 'all',
        rules: [
          { type: 'scheme', name: 'oauth2', schemeType: 'OAuth 2.0', has: ['settings.accessTokenUri', 'settings.authorizationGrants'] },
          { type: 'secured', path: '/enrolments', method: 'get', scheme: 'oauth2' },
          { type: 'secured', path: '/enrolments', method: 'post', scheme: 'oauth2' },
          { type: 'secured', path: '/enrolments/{}', method: 'get', scheme: 'oauth2' },
        ],
      },
    },
    {
      label: '/enrolments uses the collection resource type',
      rule: {
        type: 'all',
        rules: [
          { type: 'resourceType', name: 'collection' },
          { type: 'typed', path: '/enrolments', resourceType: 'collection' },
        ],
      },
    },
    { label: 'GET /enrolments returns Enrolment[]', rule: { type: 'response', path: '/enrolments', method: 'get', status: '200', typeIs: 'Enrolment[]' } },
    { label: 'POST /enrolments takes an EnrolmentRequest', rule: { type: 'body', path: '/enrolments', method: 'post', typeIs: 'EnrolmentRequest' } },
    {
      label: 'POST /enrolments returns an Enrolment with 201 and a Location header',
      rule: { type: 'response', path: '/enrolments', method: 'post', status: '201', typeIs: 'Enrolment', header: 'Location' },
    },
    {
      label: 'GET /enrolments uses paged, with a limit of at most 100',
      rule: {
        type: 'all',
        rules: [
          { type: 'applied', path: '/enrolments', method: 'get', trait: 'paged' },
          { type: 'param', path: '/enrolments', method: 'get', in: 'query', name: 'limit', want: { type: 'integer', required: false, minimum: 1, maximum: 100, default: 20 } },
          { type: 'param', path: '/enrolments', method: 'get', in: 'query', name: 'offset', want: { type: 'integer', required: false, minimum: 0 } },
        ],
      },
    },
    { label: 'GET /enrolments has an optional studentId filter', rule: { type: 'param', path: '/enrolments', method: 'get', in: 'query', name: 'studentId', want: { type: 'string', required: false } } },
    { label: 'POST /enrolments returns an Error with status 409', rule: { type: 'response', path: '/enrolments', method: 'post', status: '409', typeIs: 'Error' } },
    {
      label: 'GET /enrolments/{enrolmentId} returns an Enrolment, or an Error with 404',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/enrolments/{}', method: 'get', status: '200', typeIs: 'Enrolment' },
          { type: 'response', path: '/enrolments/{}', method: 'get', status: '404', typeIs: 'Error' },
        ],
      },
    },
    {
      label: 'All three methods use traced, with a required X-Correlation-Id',
      rule: {
        type: 'all',
        rules: [
          { type: 'applied', path: '/enrolments', method: 'get', trait: 'traced' },
          { type: 'applied', path: '/enrolments', method: 'post', trait: 'traced' },
          { type: 'applied', path: '/enrolments/{}', method: 'get', trait: 'traced' },
          { type: 'param', path: '/enrolments', method: 'post', in: 'header', name: 'X-Correlation-Id', want: { type: 'string', required: true } },
        ],
      },
    },
    {
      label: 'All three methods use downstreamErrors, with a 503 Error',
      rule: {
        type: 'all',
        rules: [
          { type: 'applied', path: '/enrolments', method: 'get', trait: 'downstreamErrors' },
          { type: 'applied', path: '/enrolments', method: 'post', trait: 'downstreamErrors' },
          { type: 'applied', path: '/enrolments/{}', method: 'get', trait: 'downstreamErrors' },
          { type: 'response', path: '/enrolments', method: 'post', status: '503', typeIs: 'Error' },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Enrolment Process API
version: v1
baseUri: https://api.example.com/enrolment/{version}
mediaType: application/json

types:
  EnrolmentRequest:
    type: object
    properties:
      studentId: string
      courseCode: string
      startDate: date-only
  Enrolment:
    type: EnrolmentRequest
    properties:
      enrolmentId: string
      status:
        type: string
        enum: [ PENDING, CONFIRMED, REJECTED ]
    example:
      enrolmentId: E-30917
      studentId: S-22041
      courseCode: MATH101
      startDate: 2026-09-14
      status: CONFIRMED
  Error:
    type: object
    properties:
      code: string
      message: string

securitySchemes:
  oauth2:
    type: OAuth 2.0
    describedBy:
      headers:
        Authorization:
          type: string
      responses:
        401:
          description: The token is missing, expired or not valid.
    settings:
      accessTokenUri: https://auth.example.com/token
      authorizationGrants: [ client_credentials ]

securedBy: [ oauth2 ]

traits:
  paged:
    queryParameters:
      limit?:
        type: integer
        minimum: 1
        maximum: 100
        default: 20
      offset?:
        type: integer
        minimum: 0
        default: 0
  traced:
    headers:
      X-Correlation-Id:
        type: string
  downstreamErrors:
    responses:
      503:
        description: A system behind this API cannot be reached.
        body:
          type: Error

resourceTypes:
  collection:
    get:
      description: List the <<resourcePathName>>.
      responses:
        200:
          body:
            type: <<itemType>>[]
    post:
      description: Create one <<resourcePathName | !singularize>>.
      body:
        type: <<requestType>>
      responses:
        201:
          headers:
            Location:
              type: string
          body:
            type: <<itemType>>

/enrolments:
  type: { collection: { itemType: Enrolment, requestType: EnrolmentRequest } }
  is: [ traced, downstreamErrors ]
  get:
    is: [ paged ]
    queryParameters:
      studentId?: string
  post:
    responses:
      409:
        description: The course is full, or the student is already enrolled.
        body:
          type: Error
  /{enrolmentId}:
    is: [ traced, downstreamErrors ]
    get:
      responses:
        200:
          body:
            type: Enrolment
        404:
          body:
            type: Error
`,
  keyPoints: [
    'A Process API names a business action. Its contract never mentions the systems behind it.',
    'Enrolment extends EnrolmentRequest, so the shared fields are declared once.',
    'A resource type can take several parameters, as a request and a response often differ.',
    'is on a resource applies a trait to every method on it.',
    'securedBy at the top of the file secures every method, including those added later.',
  ],
  solution: `
Every part has one job. Types describe the data. The resource type gives the shape of a collection. Traits add behaviour that cuts across methods. The scheme says how callers prove who they are.

Two types are needed because a caller does not choose the \`enrolmentId\` or the \`status\`. \`Enrolment\` extends \`EnrolmentRequest\`, so what the caller sends is also what comes back, plus what the server adds.

\`client_credentials\` fits because the callers here are other apps, not people. \`X-Correlation-Id\` is required since one enrolment touches three systems, and support needs one value to follow it through the logs.

Look at what is missing as well. Nothing mentions the student records system, the course system or the finance system. A 503 says only that something behind the API is down, so any of those systems can be replaced without changing this file.
`,
  followUps: [
    {
      q: 'What should happen if the fee step fails after the course place was taken?',
      a: 'The Process API must undo the earlier step or finish the work later. This is often called a saga: each step has a compensating action. The PENDING status lets the contract show work that has not settled.',
    },
    {
      q: 'Which parts would you move to a shared library?',
      a: 'The Error type, paged, traced and collection are not specific to enrolment. Put them in a RAML library, publish it to Exchange and bring it in with uses, so that every API matches.',
    },
    {
      q: 'Should the website call this API directly?',
      a: 'It can. If the website and the mobile app need different shapes, add an Experience API for each one on top. Add that layer only when a real difference appears.',
    },
  ],
}
