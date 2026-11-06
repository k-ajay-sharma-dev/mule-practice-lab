export default {
  id: 'rm-049',
  category: 'api-design',
  title: 'Course Platform API: Scopes Written Inline on Each Method',
  level: 'INTERMEDIATE',
  tags: ['raml', 'api-design', 'security', 'oauth2', 'scopes', 'education'],
  estMinutes: 25,
  description: `
A university platform serves three kinds of app. The student portal reads courses. The admin tool creates courses and enrols students. The marking tool reads and writes grades.

A leaked token from the student portal must not be able to change a grade. So each method names exactly the permissions it needs.

A **scope** is a named permission carried by an access token. The scheme lists every scope in its \`settings\`. Each method then picks its own with this form, written inline on the method:

\`\`\`
securedBy: [ oauth2: { scopes: [ one:scope, other:scope ] } ]
\`\`\`

In this API, a method that lists two scopes needs a token that holds both. A valid token with the wrong scopes gets a 403, and a missing or bad token gets a 401.

**Requirements**
- Title \`Course Platform API\`, with JSON as the default media type.
- A security scheme \`oauth2\` of type \`OAuth 2.0\`. Its \`settings\` give \`accessTokenUri\` \`https://auth.example.com/token\`, the grant \`client_credentials\`, and the scopes \`courses:read\`, \`courses:write\`, \`grades:read\`, \`grades:write\` and \`enrolments:write\`.
- Its \`describedBy\` has a 401 and a 403 response.
- A type \`Course\` with a required string \`courseId\` and a required string \`title\`.
- A type \`Grade\` with a required string \`studentId\` and a required integer \`mark\` from 0 to 100.
- A type \`Enrolment\` with a required string \`studentId\`.
- \`GET /courses\` needs \`courses:read\` and returns \`Course[]\` with status 200.
- \`POST /courses\` needs \`courses:write\`, takes a \`Course\` and returns 201.
- \`GET /courses/{courseId}/grades\` needs \`grades:read\` and returns \`Grade[]\` with status 200.
- \`PUT /courses/{courseId}/grades/{studentId}\` needs both \`grades:write\` and \`courses:read\`. It takes a \`Grade\` and returns 200.
- \`POST /courses/{courseId}/enrolments\` needs \`enrolments:write\`, takes an \`Enrolment\` and returns 201.
`,
  starter: `#%RAML 1.0
title: Course Platform API
mediaType: application/json

securitySchemes:

types:

/courses:
`,
  ramlChecks: [
    { label: 'oauth2 is an OAuth 2.0 scheme', rule: { type: 'scheme', name: 'oauth2', schemeType: 'OAuth 2.0' } },
    { label: 'The settings give the token URI, the grant and the scopes', rule: { type: 'scheme', name: 'oauth2', values: {"settings.accessTokenUri":"https://auth.example.com/token","settings.authorizationGrants":["client_credentials"],"settings.scopes":["courses:read","courses:write","grades:read","grades:write","enrolments:write"]}, has: ['settings.accessTokenUri', 'settings.authorizationGrants', 'settings.scopes'] } },
    { label: 'The scheme describes a 401 and a 403', rule: { type: 'scheme', name: 'oauth2', has: ['describedBy.responses.401', 'describedBy.responses.403'] } },
    {
      label: 'Course, Enrolment and Grade have their required properties',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Course', prop: 'courseId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Course', prop: 'title', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Enrolment', prop: 'studentId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Grade', prop: 'studentId', want: { type: 'string', required: true } },
        ],
      },
    },
    { label: 'Grade.mark is an integer from 0 to 100', rule: { type: 'prop', typeName: 'Grade', prop: 'mark', want: { type: 'integer', required: true, minimum: 0, maximum: 100 } } },
    {
      label: 'GET /courses needs courses:read and returns Course[]',
      rule: {
        type: 'all',
        rules: [
          { type: 'secured', path: '/courses', method: 'get', scheme: 'oauth2', scopes: ['courses:read'], onlyScopes: true, required: true },
          { type: 'response', path: '/courses', method: 'get', status: '200', typeIs: 'Course[]' },
        ],
      },
    },
    {
      label: 'POST /courses needs courses:write, takes a Course and returns 201',
      rule: {
        type: 'all',
        rules: [
          { type: 'secured', path: '/courses', method: 'post', scheme: 'oauth2', scopes: ['courses:write'], onlyScopes: true, required: true },
          { type: 'body', path: '/courses', method: 'post', typeIs: 'Course' },
          { type: 'response', path: '/courses', method: 'post', status: '201' },
        ],
      },
    },
    {
      label: 'GET /courses/{courseId}/grades needs grades:read and returns Grade[]',
      rule: {
        type: 'all',
        rules: [
          { type: 'secured', path: '/courses/{}/grades', method: 'get', scheme: 'oauth2', scopes: ['grades:read'], onlyScopes: true, required: true },
          { type: 'response', path: '/courses/{}/grades', method: 'get', status: '200', typeIs: 'Grade[]' },
        ],
      },
    },
    {
      label: 'PUT on one grade needs both grades:write and courses:read',
      rule: { type: 'secured', path: '/courses/{}/grades/{}', method: 'put', scheme: 'oauth2', scopes: ['grades:write', 'courses:read'], onlyScopes: true, required: true },
    },
    {
      label: 'PUT on one grade takes a Grade and returns 200',
      rule: {
        type: 'all',
        rules: [
          { type: 'body', path: '/courses/{}/grades/{}', method: 'put', typeIs: 'Grade' },
          { type: 'response', path: '/courses/{}/grades/{}', method: 'put', status: '200' },
        ],
      },
    },
    {
      label: 'POST /courses/{courseId}/enrolments needs enrolments:write, takes an Enrolment and returns 201',
      rule: {
        type: 'all',
        rules: [
          { type: 'secured', path: '/courses/{}/enrolments', method: 'post', scheme: 'oauth2', scopes: ['enrolments:write'], onlyScopes: true, required: true },
          { type: 'body', path: '/courses/{}/enrolments', method: 'post', typeIs: 'Enrolment' },
          { type: 'response', path: '/courses/{}/enrolments', method: 'post', status: '201' },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Course Platform API
mediaType: application/json

securitySchemes:
  oauth2:
    type: OAuth 2.0
    describedBy:
      responses:
        401:
          description: The token is missing, wrong or expired.
        403:
          description: The token does not hold the scopes this method needs.
    settings:
      accessTokenUri: https://auth.example.com/token
      authorizationGrants: [ client_credentials ]
      scopes: [ courses:read, courses:write, grades:read, grades:write, enrolments:write ]

types:
  Course:
    type: object
    properties:
      courseId: string
      title: string
  Grade:
    type: object
    properties:
      studentId: string
      mark:
        type: integer
        minimum: 0
        maximum: 100
  Enrolment:
    type: object
    properties:
      studentId: string

/courses:
  get:
    securedBy: [ oauth2: { scopes: [ courses:read ] } ]
    responses:
      200:
        body:
          type: Course[]
  post:
    securedBy: [ oauth2: { scopes: [ courses:write ] } ]
    body:
      type: Course
    responses:
      201:
        description: The course was created.
  /{courseId}:
    /grades:
      get:
        securedBy: [ oauth2: { scopes: [ grades:read ] } ]
        responses:
          200:
            body:
              type: Grade[]
      /{studentId}:
        put:
          securedBy: [ oauth2: { scopes: [ grades:write, courses:read ] } ]
          body:
            type: Grade
          responses:
            200:
              description: The grade was saved.
    /enrolments:
      post:
        securedBy: [ oauth2: { scopes: [ enrolments:write ] } ]
        body:
          type: Enrolment
        responses:
          201:
            description: The student was enrolled.
`,
  keyPoints: [
    'The scheme lists every scope in settings, and each method picks the ones it needs.',
    'Written inline, the scopes sit beside the method they protect, so a reviewer sees them at once.',
    'A 401 is about the token itself. A 403 is about what the token may do.',
    'Small scopes limit the damage of a leaked token.',
  ],
  solution: `
Each method states its own scopes, so a reader can check any endpoint without looking elsewhere.

Writing a grade lists two scopes. The marking tool must read the course as well as change the grade, so its token has to hold both.

The 401 and 403 sit in \`describedBy\`, so they apply to all five methods. Both are needed because they tell a caller different things: get a new token, or ask for more access.
`,
  followUps: [
    {
      q: 'When would you move scopes from the method into a trait?',
      a: 'A trait fits when many methods share one rule, such as every read needing the same scope. Inline is clearer when each method differs, as it does here.',
    },
    {
      q: 'Does listing scopes in RAML enforce them?',
      a: 'No, RAML only documents them. An OAuth policy in API Manager or the application must compare the scopes in the token with what the method needs.',
    },
    {
      q: 'Why not one admin scope for everything the admin tool does?',
      a: 'A broad scope means a stolen admin token can do everything. Separate scopes allow each app the least access it needs, and access can be withdrawn piece by piece.',
    },
  ],
}
