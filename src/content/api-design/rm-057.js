const memberStarter = `#%RAML 1.0 DataType
type: object
properties:
  memberId: string
  email: string
  pointsBalance: integer
  marketingConsent: boolean
`

const commonLibrary = `#%RAML 1.0 Library
usage: Company API standards. Do not change this file.

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

securitySchemes:
  oauth2:
    type: OAuth 2.0
    describedBy:
      responses:
        401:
          description: The token is missing, wrong or expired.
    settings:
      accessTokenUri: https://auth.example.com/token
      authorizationGrants: [ client_credentials ]
`

export default {
  id: 'rm-057',
  category: 'api-design',
  title: 'Loyalty API: Fix a Contract That Failed Governance Review',
  level: 'EXPERT',
  tags: ['raml', 'api-design', 'governance', 'libraries', 'security', 'retail'],
  estMinutes: 50,
  description: `
A retailer's API review board has rejected the new Loyalty API. **API governance** means checking every contract against shared company rules before it goes live. The draft is in the editor, and the review notes are below. Your job is to fix each finding.

During the move, the API gateway will map the old paths to the new ones, so changing a path is safe. It passes bodies through untouched, so a change to a body is not. Three partner apps already call this API, and they send a \`Member\` body with the fields they have always sent.

This problem has three files. Use the tabs above the editor to move between them. \`libraries/common.raml\` holds the company standards. Read it, but do not change it.

**Finding 1: verbs in paths**
A path names a thing, and the HTTP method says what to do.
- Remove \`/getMembers\`, \`/createMember\` and \`/members/{memberId}/addPoints\`.
- \`GET /members\` returns \`Member[]\` with status 200.
- \`POST /members\` takes a \`Member\`.
- \`POST /members/{memberId}/points\` takes a \`PointsAward\`.

**Finding 2: wrong status codes**
- \`POST /members\` and \`POST /members/{memberId}/points\` create something, so each returns 201 and not 200.

**Finding 3: inconsistent errors**
Each endpoint invented its own error body, so no client can handle errors in one place.
- Bring in the library with the prefix \`common\`.
- Every 400 and 404 in the API has a \`common.Error\` body. That means 400 on both \`POST\` methods, and 404 on \`GET /members/{memberId}\` and \`POST /members/{memberId}/points\`.
- Remove the types \`NotFoundMessage\` and \`BadInput\`.

**Finding 4: missing security**
- All four methods are secured by \`common.oauth2\`.

**Finding 5: no tracing**
- All four methods use the trait \`common.traced\`.

**Finding 6: a required field that breaks callers**
\`marketingConsent\` was added last week as a required field in \`types/member.raml\`. The partner apps do not send it, so every one of their calls would be refused.
- Make \`marketingConsent\` optional. Every other property of \`Member\` stays required.
`,
  starter: `#%RAML 1.0
title: Loyalty API
version: v1
mediaType: application/json

types:
  Member: !include types/member.raml
  PointsAward:
    type: object
    properties:
      points: integer
      reason: string
  NotFoundMessage:
    type: object
    properties:
      msg: string
  BadInput:
    type: object
    properties:
      errorText: string
      field: string

/getMembers:
  get:
    responses:
      200:
        body:
          type: Member[]

/createMember:
  post:
    body:
      type: Member
    responses:
      200:
        body:
          type: Member
      400:
        body:
          type: BadInput

/members:
  /{memberId}:
    get:
      responses:
        200:
          body:
            type: Member
        404:
          body:
            type: NotFoundMessage
    /addPoints:
      post:
        body:
          type: PointsAward
        responses:
          200:
            description: The points were added.
          400:
            body:
              type: BadInput
          404:
            body:
              type: NotFoundMessage
`,
  files: {
    'libraries/common.raml': commonLibrary,
    'types/member.raml': memberStarter,
  },
  ramlChecks: [
    {
      label: 'Finding 1: the verb paths are gone',
      rule: {
        type: 'all',
        rules: [
          { type: 'method', path: '/members', method: 'get' },
          { type: 'noResource', path: '/getMembers' },
          { type: 'noResource', path: '/createMember' },
          { type: 'noResource', path: '/members/{}/addPoints' },
        ],
      },
    },
    { label: 'Finding 1: GET /members returns Member[]', rule: { type: 'response', path: '/members', method: 'get', status: '200', typeIs: 'Member[]' } },
    { label: 'Finding 1: POST /members takes a Member', rule: { type: 'body', path: '/members', method: 'post', typeIs: 'Member' } },
    { label: 'Finding 1: POST /members/{memberId}/points takes a PointsAward', rule: { type: 'body', path: '/members/{}/points', method: 'post', typeIs: 'PointsAward' } },
    {
      label: 'Finding 2: both POST methods return 201',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/members', method: 'post', status: '201' },
          { type: 'response', path: '/members/{}/points', method: 'post', status: '201' },
        ],
      },
    },
    { label: 'Finding 3: the API brings in libraries/common.raml with the prefix common', rule: { type: 'library', prefix: 'common', file: 'libraries/common.raml' } },
    {
      label: 'Finding 3: every 400 is a common.Error',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/members', method: 'post', status: '400', typeIs: 'common.Error' },
          { type: 'response', path: '/members/{}/points', method: 'post', status: '400', typeIs: 'common.Error' },
        ],
      },
    },
    {
      label: 'Finding 3: every 404 is a common.Error',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/members/{}', method: 'get', status: '404', typeIs: 'common.Error' },
          { type: 'response', path: '/members/{}/points', method: 'post', status: '404', typeIs: 'common.Error' },
        ],
      },
    },
    {
      label: 'Finding 3: NotFoundMessage and BadInput are removed',
      rule: {
        type: 'all',
        rules: [
          { type: 'library', prefix: 'common' },
          { type: 'noType', name: 'NotFoundMessage' },
          { type: 'noType', name: 'BadInput' },
        ],
      },
    },
    {
      label: 'Finding 4: all four methods are secured by common.oauth2',
      rule: {
        type: 'all',
        rules: [
          { type: 'secured', path: '/members', method: 'get', scheme: 'common.oauth2' },
          { type: 'secured', path: '/members', method: 'post', scheme: 'common.oauth2' },
          { type: 'secured', path: '/members/{}', method: 'get', scheme: 'common.oauth2' },
          { type: 'secured', path: '/members/{}/points', method: 'post', scheme: 'common.oauth2' },
        ],
      },
    },
    {
      label: 'Finding 5: all four methods use common.traced',
      rule: {
        type: 'all',
        rules: [
          { type: 'applied', path: '/members', method: 'get', trait: 'common.traced' },
          { type: 'applied', path: '/members', method: 'post', trait: 'common.traced' },
          { type: 'applied', path: '/members/{}', method: 'get', trait: 'common.traced' },
          { type: 'applied', path: '/members/{}/points', method: 'post', trait: 'common.traced' },
        ],
      },
    },
    { label: 'Finding 6: marketingConsent is optional', rule: { type: 'prop', typeName: 'Member', prop: 'marketingConsent', want: { type: 'boolean', required: false } } },
    {
      label: 'Finding 6: the other Member properties stay required',
      rule: {
        type: 'all',
        rules: [
          { type: 'included', file: 'types/member.raml' },
          { type: 'prop', typeName: 'Member', prop: 'memberId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Member', prop: 'email', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Member', prop: 'pointsBalance', want: { type: 'integer', required: true } },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Loyalty API
version: v1
mediaType: application/json

uses:
  common: libraries/common.raml

securedBy: [ common.oauth2 ]

types:
  Member: !include types/member.raml
  PointsAward:
    type: object
    properties:
      points: integer
      reason: string

/members:
  get:
    is: [ common.traced ]
    responses:
      200:
        body:
          type: Member[]
  post:
    is: [ common.traced ]
    body:
      type: Member
    responses:
      201:
        body:
          type: Member
      400:
        body:
          type: common.Error
  /{memberId}:
    get:
      is: [ common.traced ]
      responses:
        200:
          body:
            type: Member
        404:
          body:
            type: common.Error
    /points:
      post:
        is: [ common.traced ]
        body:
          type: PointsAward
        responses:
          201:
            description: The points were added.
          400:
            body:
              type: common.Error
          404:
            body:
              type: common.Error
`,
  referenceFiles: {
    'libraries/common.raml': commonLibrary,
    'types/member.raml': `#%RAML 1.0 DataType
type: object
properties:
  memberId: string
  email: string
  pointsBalance: integer
  marketingConsent?: boolean
`,
  },
  keyPoints: [
    'Governance rules work best as shared libraries, so the right choice is also the short one.',
    'One error type lets a client handle every failure in one place.',
    'Adding a required field to a request body is a breaking change.',
    'Adding an optional field is safe, and the server decides a default when it is missing.',
    'A path names a thing. An action such as adding points becomes a new item under it.',
  ],
  solution: `
Most findings go away once the API uses the standards. Security, tracing and errors all come from \`common\`, so the team writes none of them by hand.

\`addPoints\` becomes \`POST /members/{memberId}/points\`. The action turns into a thing you create, which is why it now returns 201.

\`marketingConsent\` is the finding that would have hurt most. It looks harmless, but a validating API rejects every partner call with a 400 from the day it ships. With the question mark, old callers keep working, and the backend treats a missing value as no consent. That default is also the safe choice in law.

The order of work matters in a real review. Fix what breaks callers first, then what weakens security, then what is only untidy.
`,
  followUps: [
    {
      q: 'How can governance be checked automatically instead of by a board?',
      a: 'Anypoint API Governance applies rulesets to API specifications in Exchange and reports what fails. Running the rules in the build pipeline catches problems before any review meeting.',
    },
    {
      q: 'Which contract changes are breaking for callers?',
      a: 'Removing or renaming a field or path, tightening a type, and adding a required request field. Adding an optional request field or a new response field is normally safe.',
    },
    {
      q: 'How long should the gateway keep mapping the old paths?',
      a: 'Set a date with the partners and track traffic on the old paths. Remove the mapping once that traffic reaches zero, and tell any late callers directly.',
    },
  ],
}
