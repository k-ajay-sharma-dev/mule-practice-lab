export default {
  id: 'rm-075',
  category: 'api-design',
  title: 'Dental Clinic API: A Standard Errors Trait with a Reusable Error Type',
  level: 'INTERMEDIATE',
  tags: ['raml', 'api-design', 'traits', 'errors', 'data-types', 'arrays', 'healthcare'],
  estMinutes: 20,
  description: `
A group of 120 dental clinics books 9,000 appointments a day through one API. The front desk app and the patient app both show errors to users, and today each method describes its errors in its own words. The app teams want one error shape everywhere, with a list of field problems they can show next to the form.

You will write the error shape once as a type, put the common error responses in a trait, and apply that trait to every method. A method can still add its own extra error, such as a 404.

**Requirements**
- Title \`Dental Clinic API\`, with JSON as the default media type.
- A type \`FieldError\` with a required string \`field\` and a required string \`issue\`.
- A type \`ApiError\` with a required string \`code\`, a required string \`message\`, a required string \`correlationId\`, and an optional \`details\` that is a list of \`FieldError\`. Give \`ApiError\` an example.
- A type \`Appointment\` with a required string \`appointmentId\`, a required datetime \`startsAt\` and a required string \`clinicId\`.
- A trait \`standardErrors\` that adds 400, 401 and 500 responses, each with an \`ApiError\` body.
- \`GET /appointments\` returns \`Appointment[]\`, and \`POST /appointments\` takes an \`Appointment\` and returns 201.
- \`GET /appointments/{appointmentId}\` returns an \`Appointment\`, or 404 with an \`ApiError\` body.
- All three methods use \`standardErrors\`.
`,
  starter: `#%RAML 1.0
title: Dental Clinic API
mediaType: application/json

types:

traits:
  standardErrors:

/appointments:
  get:
  post:
  /{appointmentId}:
    get:
`,
  ramlChecks: [
    {
      label: 'FieldError has a required string field and issue',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'FieldError', prop: 'field', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'FieldError', prop: 'issue', want: { type: 'string', required: true } },
        ],
      },
    },
    {
      label: 'ApiError has a required code, message and correlationId',
      rule: {
        type: 'all',
        rules: ['code', 'message', 'correlationId'].map((prop) => ({ type: 'prop', typeName: 'ApiError', prop, want: { type: 'string', required: true } })),
      },
    },
    { label: 'ApiError.details is an optional list of FieldError', rule: { type: 'prop', typeName: 'ApiError', prop: 'details', want: { type: 'FieldError[]', required: false } } },
    {
      label: 'ApiError has an example',
      rule: {
        type: 'any',
        rules: [
          { type: 'typeDecl', name: 'ApiError', want: { example: { set: true } } },
          { type: 'typeDecl', name: 'ApiError', want: { examples: { set: true } } },
        ],
      },
    },
    {
      label: 'The standardErrors trait adds 400, 401 and 500',
      rule: {
        type: 'all',
        rules: ['400', '401', '500'].map((code) => ({ type: 'trait', name: 'standardErrors', has: `responses.${code}` })),
      },
    },
    {
      label: 'GET /appointments uses standardErrors and its 500 has an ApiError body',
      rule: {
        type: 'all',
        rules: [
          { type: 'applied', path: '/appointments', method: 'get', trait: 'standardErrors' },
          { type: 'response', path: '/appointments', method: 'get', status: '500', typeIs: 'ApiError' },
          { type: 'response', path: '/appointments', method: 'get', status: '200', typeIs: 'Appointment[]' },
        ],
      },
    },
    {
      label: 'POST /appointments uses standardErrors, takes an Appointment and returns 201',
      rule: {
        type: 'all',
        rules: [
          { type: 'applied', path: '/appointments', method: 'post', trait: 'standardErrors' },
          { type: 'body', path: '/appointments', method: 'post', typeIs: 'Appointment' },
          { type: 'response', path: '/appointments', method: 'post', status: '201' },
          { type: 'response', path: '/appointments', method: 'post', status: '400', typeIs: 'ApiError' },
        ],
      },
    },
    {
      label: 'GET /appointments/{appointmentId} uses standardErrors and adds its own 404 with an ApiError',
      rule: {
        type: 'all',
        rules: [
          { type: 'applied', path: '/appointments/{}', method: 'get', trait: 'standardErrors' },
          { type: 'response', path: '/appointments/{}', method: 'get', status: '200', typeIs: 'Appointment' },
          { type: 'response', path: '/appointments/{}', method: 'get', status: '404', typeIs: 'ApiError' },
          { type: 'response', path: '/appointments/{}', method: 'get', status: '401', typeIs: 'ApiError' },
        ],
      },
    },
    { label: 'Appointment.startsAt is a required datetime', rule: { type: 'prop', typeName: 'Appointment', prop: 'startsAt', want: { type: 'datetime', required: true } } },
  ],
  referenceRaml: `#%RAML 1.0
title: Dental Clinic API
mediaType: application/json

types:
  FieldError:
    type: object
    properties:
      field: string
      issue: string
  ApiError:
    type: object
    properties:
      code: string
      message: string
      correlationId: string
      details?: FieldError[]
    example:
      code: VALIDATION_FAILED
      message: The appointment could not be booked.
      correlationId: 7c1e2a90-4b3d-4f8e-a1c2-5d6e7f8a9b0c
      details:
        - field: startsAt
          issue: The clinic is closed at this time.
  Appointment:
    type: object
    properties:
      appointmentId: string
      startsAt: datetime
      clinicId: string

traits:
  standardErrors:
    usage: Apply to every method, so every error has the same shape.
    responses:
      400:
        description: The request is not valid. details lists each field problem.
        body:
          type: ApiError
      401:
        description: The caller is not signed in.
        body:
          type: ApiError
      500:
        description: Something went wrong on our side.
        body:
          type: ApiError

/appointments:
  is: [ standardErrors ]
  get:
    responses:
      200:
        body:
          type: Appointment[]
  post:
    body:
      type: Appointment
    responses:
      201:
        description: The appointment was booked.
  /{appointmentId}:
    get:
      is: [ standardErrors ]
      responses:
        200:
          body:
            type: Appointment
        404:
          body:
            type: ApiError
`,
  keyPoints: [
    'A type used as the body of a response in a trait is reused everywhere the trait goes.',
    'A list of a named type is written FieldError[], or type: array with items: FieldError.',
    'Responses from a trait are merged with the responses written on the method.',
    'An optional details list lets one error type serve both simple and form errors.',
  ],
  solution: `
\`ApiError\` is the one error shape. \`details\` is a list of \`FieldError\`, so a 400 can point at each field that failed, and the app can show the message beside the right input.

\`standardErrors\` adds the three errors that any method can return. Writing \`is: [ standardErrors ]\` on \`/appointments\` covers \`get\` and \`post\`, and \`/{appointmentId}\` applies it again because a nested resource does not inherit it.

\`GET /appointments/{appointmentId}\` writes its own 404. RAML merges it with the 400, 401 and 500 from the trait, so the method ends up with all four.

\`details\` is optional. A 500 has no field problems, and forcing an empty list on it would add noise.
`,
  followUps: [
    {
      q: 'Why include a correlationId in every error?',
      a: 'The user can read it to support, and support can find the exact call in the logs. Without it, matching a complaint to a log line is guesswork.',
    },
    {
      q: 'How does Mule fill this error shape?',
      a: 'An error handler in the APIkit flow maps each error type to a status code. A shared DataWeave script builds the ApiError body from the error and the correlation id.',
    },
    {
      q: 'Should a 500 tell the caller what failed inside?',
      a: 'No. Stack traces and database messages help an attacker and confuse a user. Log the detail on the server and send a short message with the correlation id.',
    },
    {
      q: 'Where would this trait live if ten APIs need it?',
      a: 'In a RAML library published to Exchange. Each API brings it in with uses, so the error shape is the same across the whole organisation.',
    },
  ],
}
