export default {
  id: 'rm-120',
  category: 'api-design',
  title: 'Module Registration Process API: Enrol or Join the Waitlist',
  level: 'EXPERT',
  tags: ['raml', 'api-design', 'process-api', 'api-led', 'discriminator', 'union-types', 'security', 'education'],
  estMinutes: 55,
  description: `
A university with 31,000 students opens module registration for one week each summer. In the first hour about 90,000 registration requests arrive, and popular modules fill in minutes. A student who misses a place joins a waitlist and is enrolled automatically if someone drops out.

Registering checks the student record, the module's prerequisites, the timetable for clashes and the room capacity. Those live in four systems behind their own System APIs. You are writing the **Process API** that the student portal, the mobile app and the advisers' tool all call.

The same request can end two ways: the student is enrolled, or the student is waitlisted. The callers draw a different screen for each, so the contract must make the outcome plain.

**Brief**
- A student id is \`S\` and seven digits, such as \`S2041187\`. A module code is four capital letters and four digits, such as \`COMP2041\`.
- An academic year is written \`2026/27\`.
- A student can drop a module until the census date. After it, the place is fixed.

**Requirements**
- Title \`Module Registration Process API\`, version \`v1\`, and JSON as the default media type.
- \`RegistrationRequest\` has a required \`studentId\`, \`moduleCode\` and \`academicYear\`, each with a pattern for the formats above, and a required \`term\` that is one of \`AUTUMN\`, \`SPRING\`, \`SUMMER\`.
- \`RegistrationBase\` inherits from \`RegistrationRequest\`, uses \`outcome\` as its discriminator, and adds a required string \`registrationId\` and a required \`outcome\` that is one of \`ENROLLED\`, \`WAITLISTED\`.
- \`Enrolment\` and \`WaitlistEntry\` inherit from \`RegistrationBase\` with discriminator values \`ENROLLED\` and \`WAITLISTED\`. \`WaitlistEntry\` adds a required integer \`position\` of at least 1. Both have an example.
- \`Registration\` is the union of \`Enrolment\` and \`WaitlistEntry\`.
- \`Error\` has required strings \`code\` and \`message\` and an optional \`details\` of type \`string[]\`, which lists the missing prerequisites or the clashing modules.
- \`POST /registrations\` takes a \`RegistrationRequest\`. It returns an \`Enrolment\` with status 201, or a \`WaitlistEntry\` with status 202, each with a \`Location\` header. It returns an \`Error\` with 409 for a timetable clash or a repeat registration, and with 422 when a prerequisite is missing.
- \`GET /registrations/{registrationId}\` returns a \`Registration\` with status 200, or an \`Error\` with status 404.
- \`DELETE /registrations/{registrationId}\` drops the module and returns 204 with no body, or an \`Error\` with status 409 after the census date.
- \`GET /students/{studentId}/registrations\` returns \`Registration[]\` with status 200 and has an optional \`academicYear\` query parameter. \`studentId\` has a pattern.
- Trait \`traced\` has a required string header \`X-Correlation-Id\`. All four methods use it.
- A scheme \`oauth2\` of type \`OAuth 2.0\`. \`POST\` and \`DELETE\` need \`registrations:write\` and nothing else. The two GETs need \`registrations:read\` and nothing else.
`,
  starter: `#%RAML 1.0
title: Module Registration Process API
version: v1
mediaType: application/json

types:

traits:

securitySchemes:

/registrations:

/students:
`,
  ramlChecks: [
    {
      label: 'The title, version v1 and JSON',
      rule: {
        type: 'all',
        rules: [
          { type: 'root', key: 'title', want: 'Module Registration Process API' },
          { type: 'root', key: 'version', want: 'v1' },
          { type: 'root', key: 'mediaType', want: 'application/json' },
        ],
      },
    },
    {
      label: 'studentId and moduleCode have their patterns',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'RegistrationRequest', prop: 'studentId', want: { required: true, pattern: { accepts: ['S2041187'], rejects: ['S204118', 'S20411870', 's2041187', '2041187'] } } },
          { type: 'prop', typeName: 'RegistrationRequest', prop: 'moduleCode', want: { required: true, pattern: { accepts: ['COMP2041', 'MATH1001'], rejects: ['COM2041', 'COMP204', 'comp2041', 'COMP20411'] } } },
        ],
      },
    },
    {
      label: 'academicYear is written 2026/27 and term has three values',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'RegistrationRequest', prop: 'academicYear', want: { required: true, pattern: { accepts: ['2026/27', '2030/31'], rejects: ['2026-27', '26/27', '2026/2027', '2026/7'] } } },
          { type: 'prop', typeName: 'RegistrationRequest', prop: 'term', want: { required: true, enum: { exactly: ['AUTUMN', 'SPRING', 'SUMMER'] } } },
        ],
      },
    },
    {
      label: 'RegistrationBase inherits the request and uses outcome as its discriminator',
      rule: {
        type: 'all',
        rules: [
          { type: 'typeDecl', name: 'RegistrationBase', extends: 'RegistrationRequest', want: { discriminator: { is: 'outcome' } } },
          { type: 'prop', typeName: 'RegistrationBase', prop: 'registrationId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'RegistrationBase', prop: 'outcome', want: { required: true, enum: { exactly: ['ENROLLED', 'WAITLISTED'] } } },
        ],
      },
    },
    {
      label: 'Enrolment and WaitlistEntry use the values ENROLLED and WAITLISTED',
      rule: {
        type: 'all',
        rules: [
          { type: 'typeDecl', name: 'Enrolment', extends: 'RegistrationBase', want: { discriminatorValue: { is: 'ENROLLED' } } },
          { type: 'typeDecl', name: 'WaitlistEntry', extends: 'RegistrationBase', want: { discriminatorValue: { is: 'WAITLISTED' } } },
          { type: 'prop', typeName: 'WaitlistEntry', prop: 'position', want: { type: 'integer', required: true, minimum: 1 } },
          { type: 'any', rules: [{ type: 'typeDecl', name: 'Enrolment', want: { example: { set: true } } }, { type: 'typeDecl', name: 'Enrolment', want: { examples: { set: true } } }] },
          { type: 'any', rules: [{ type: 'typeDecl', name: 'WaitlistEntry', want: { example: { set: true } } }, { type: 'typeDecl', name: 'WaitlistEntry', want: { examples: { set: true } } }] },
        ],
      },
    },
    { label: 'Registration is the union of Enrolment and WaitlistEntry', rule: { type: 'typeDecl', name: 'Registration', want: { type: ['Enrolment', 'WaitlistEntry', '|'] } } },
    {
      label: 'Error has code, message and optional details',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Error', prop: 'code', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Error', prop: 'message', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Error', prop: 'details', want: { type: 'string[]', required: false } },
        ],
      },
    },
    {
      label: 'POST returns an Enrolment with 201 or a WaitlistEntry with 202, each with Location',
      rule: {
        type: 'all',
        rules: [
          { type: 'body', path: '/registrations', method: 'post', typeIs: 'RegistrationRequest' },
          { type: 'response', path: '/registrations', method: 'post', status: '201', typeIs: 'Enrolment', header: 'Location' },
          { type: 'response', path: '/registrations', method: 'post', status: '202', typeIs: 'WaitlistEntry', header: 'Location' },
        ],
      },
    },
    {
      label: 'POST returns an Error with 409 for a clash and 422 for a missing prerequisite',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/registrations', method: 'post', status: '409', typeIs: 'Error' },
          { type: 'response', path: '/registrations', method: 'post', status: '422', typeIs: 'Error' },
        ],
      },
    },
    {
      label: 'GET one registration returns a Registration, or an Error with 404',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/registrations/{}', method: 'get', status: '200', typeIs: 'Registration' },
          { type: 'response', path: '/registrations/{}', method: 'get', status: '404', typeIs: 'Error' },
        ],
      },
    },
    {
      label: 'DELETE returns 204 with no body, or an Error with 409 after the census date',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/registrations/{}', method: 'delete', status: '204', noBody: true },
          { type: 'response', path: '/registrations/{}', method: 'delete', status: '409', typeIs: 'Error' },
        ],
      },
    },
    {
      label: 'A student\'s registrations return Registration[] with an optional academicYear',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/students/{}/registrations', method: 'get', status: '200', typeIs: 'Registration[]' },
          { type: 'param', path: '/students/{}/registrations', method: 'get', in: 'query', name: 'academicYear', want: { required: false } },
          { type: 'param', path: '/students/{}/registrations', in: 'uri', name: 'studentId', want: { pattern: { accepts: ['S2041187'], rejects: ['S204118', '2041187'] } } },
        ],
      },
    },
    {
      label: 'All four methods use traced, with a required X-Correlation-Id',
      rule: {
        type: 'all',
        rules: [
          { type: 'applied', path: '/registrations', method: 'post', trait: 'traced' },
          { type: 'applied', path: '/registrations/{}', method: 'get', trait: 'traced' },
          { type: 'applied', path: '/registrations/{}', method: 'delete', trait: 'traced' },
          { type: 'applied', path: '/students/{}/registrations', method: 'get', trait: 'traced' },
          { type: 'param', path: '/registrations', method: 'post', in: 'header', name: 'X-Correlation-Id', want: { type: 'string', required: true } },
        ],
      },
    },
    {
      label: 'Writes need only registrations:write and reads need only registrations:read',
      rule: {
        type: 'all',
        rules: [
          { type: 'scheme', name: 'oauth2', schemeType: 'OAuth 2.0' },
          { type: 'secured', path: '/registrations', method: 'post', scheme: 'oauth2', scopes: ['registrations:write'], onlyScopes: true, required: true },
          { type: 'secured', path: '/registrations/{}', method: 'delete', scheme: 'oauth2', scopes: ['registrations:write'], onlyScopes: true, required: true },
          { type: 'secured', path: '/registrations/{}', method: 'get', scheme: 'oauth2', scopes: ['registrations:read'], onlyScopes: true, required: true },
          { type: 'secured', path: '/students/{}/registrations', method: 'get', scheme: 'oauth2', scopes: ['registrations:read'], onlyScopes: true, required: true },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Module Registration Process API
version: v1
baseUri: https://api.example.com/registration/{version}
mediaType: application/json

types:
  StudentId:
    type: string
    pattern: ^S[0-9]{7}$
  ModuleCode:
    type: string
    pattern: ^[A-Z]{4}[0-9]{4}$
  AcademicYear:
    type: string
    pattern: ^20[0-9]{2}/[0-9]{2}$
  RegistrationRequest:
    type: object
    properties:
      studentId: StudentId
      moduleCode: ModuleCode
      academicYear: AcademicYear
      term:
        type: string
        enum: [ AUTUMN, SPRING, SUMMER ]
  RegistrationBase:
    type: RegistrationRequest
    discriminator: outcome
    properties:
      registrationId: string
      outcome:
        type: string
        enum: [ ENROLLED, WAITLISTED ]
  Enrolment:
    type: RegistrationBase
    discriminatorValue: ENROLLED
    properties:
      enrolledAt: datetime
    example:
      registrationId: RG-26-0048812
      studentId: S2041187
      moduleCode: COMP2041
      academicYear: 2026/27
      term: AUTUMN
      outcome: ENROLLED
      enrolledAt: 2026-07-06T09:00:14+01:00
  WaitlistEntry:
    type: RegistrationBase
    discriminatorValue: WAITLISTED
    properties:
      position:
        type: integer
        minimum: 1
      expiresOn?: date-only
    example:
      registrationId: RG-26-0048977
      studentId: S2093310
      moduleCode: COMP2041
      academicYear: 2026/27
      term: AUTUMN
      outcome: WAITLISTED
      position: 14
      expiresOn: 2026-10-02
  Registration:
    type: Enrolment | WaitlistEntry
  Error:
    type: object
    properties:
      code: string
      message: string
      details?: string[]

traits:
  traced:
    headers:
      X-Correlation-Id:
        type: string

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
      scopes: [ registrations:read, registrations:write ]

/registrations:
  is: [ traced ]
  post:
    securedBy: [ oauth2: { scopes: [ registrations:write ] } ]
    body:
      type: RegistrationRequest
    responses:
      201:
        description: The student is enrolled.
        headers:
          Location:
            type: string
        body:
          type: Enrolment
      202:
        description: The module is full. The student is on the waitlist.
        headers:
          Location:
            type: string
        body:
          type: WaitlistEntry
      409:
        description: A timetable clash, or the student is already registered.
        body:
          type: Error
      422:
        description: A prerequisite is missing. details lists the modules.
        body:
          type: Error
  /{registrationId}:
    is: [ traced ]
    get:
      securedBy: [ oauth2: { scopes: [ registrations:read ] } ]
      responses:
        200:
          body:
            type: Registration
        404:
          body:
            type: Error
    delete:
      securedBy: [ oauth2: { scopes: [ registrations:write ] } ]
      responses:
        204:
          description: The module is dropped, or the student left the waitlist.
        409:
          description: The census date has passed.
          body:
            type: Error

/students/{studentId}/registrations:
  uriParameters:
    studentId: StudentId
  is: [ traced ]
  get:
    securedBy: [ oauth2: { scopes: [ registrations:read ] } ]
    queryParameters:
      academicYear?: AcademicYear
    responses:
      200:
        body:
          type: Registration[]
`,
  keyPoints: [
    'One request with two business outcomes can use two success codes: 201 when the place is granted, 202 when it may come later.',
    'A discriminator lets every caller pick the screen from one field, outcome, instead of guessing from which fields are present.',
    'Named types such as StudentId and ModuleCode keep one pattern in every place the value appears.',
    '409 and 422 split a clash with existing state from a business rule the student does not meet. details tells them what to fix.',
    'A Process API names the business action. Student records, timetabling and capacity systems stay behind it.',
  ],
  solution: `
The heart of the contract is the two outcomes. A request either takes a place or joins a queue, and the caller must not mistake one for the other. Two things make it plain.

- **Status codes.** 201 means the enrolment exists now. 202 means the request is accepted but the place is not granted, and the student may be enrolled later from the waitlist. Both carry a \`Location\`, so callers can follow up the same way.
- **Types.** \`Enrolment\` and \`WaitlistEntry\` share \`RegistrationBase\`, which uses \`outcome\` as its discriminator. The GET returns the union \`Registration\`, and a caller reads \`outcome\` to know which shape it has. A waitlisted registration that later turns into a place reads as \`ENROLLED\` on the next GET.

The errors give the student something to act on. A 409 says the request clashes with what already exists, such as another module at the same hour. A 422 says a rule is not met, and \`details\` lists the missing prerequisites by code.

\`DELETE\` serves both cases: it drops a module or leaves a waitlist. After the census date the 409 says the place is fixed, because funding is counted on that day.

Security splits by action. The advisers' tool that only views timetables holds \`registrations:read\`, and only the portal and the app can register or drop.
`,
  followUps: [
    {
      q: 'Some designers return 201 for both outcomes and rely on the body. What is the trade-off?',
      a: 'One code is simpler for clients that treat every 2xx the same. Two codes let monitoring and gateways count waitlist outcomes without reading bodies. Either works if the outcome field is always present.',
    },
    {
      q: 'How would you survive 90,000 requests in the first hour?',
      a: 'Scale the Process API workers ahead of opening, and protect capacity with a spike control policy. Keep the capacity check atomic in one place, such as a database row lock, so two students never take the last seat.',
    },
    {
      q: 'How does a waitlisted student learn they got a place?',
      a: 'The Process API publishes an event when a place frees and the first student is enrolled. A notification service sends an email or push message, and the next GET shows ENROLLED.',
    },
    {
      q: 'Why is studentId in the body and not taken from the token?',
      a: 'Advisers register students on their behalf, so the caller is not always the student. When a student calls through the app, the API must still check that the token subject matches studentId.',
    },
  ],
}
