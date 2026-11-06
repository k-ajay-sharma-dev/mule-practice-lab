export default {
  id: 'rm-011',
  category: 'api-design',
  title: 'Hotel Reservations API: A Shared Error Type',
  level: 'BEGINNER',
  tags: ['raml', 'api-design', 'errors', 'data-types', 'status-codes', 'hospitality'],
  estMinutes: 15,
  description: `
A hotel group is opening its reservations system to travel agents. Agents complain that each error looks different, so their code has to guess where the message is.

The fix is one **shared error type**. Every error response uses the same shape, so a consumer writes its error handling once.

The status codes mean:
- **400 Bad Request**: the caller sent something wrong.
- **404 Not Found**: the thing asked for does not exist.
- **500 Internal Server Error**: the API failed, and the caller did nothing wrong.

**Requirements**
- A type \`Error\` with a required string \`code\`, a required string \`message\`, and an optional string \`correlationId\`.
- \`Error\` has an example that fits it.
- \`POST /reservations\` returns 201, and returns \`Error\` on 400 and on 500.
- \`GET /reservations/{reservationId}\` returns 200, and returns \`Error\` on 400, 404 and 500.

You can write the error responses on each method, or put them in a trait. Both pass.
`,
  starter: `#%RAML 1.0
title: Hotel Reservations API
mediaType: application/json

types:
  Error:

/reservations:
  post:
    responses:
      201:
        description: The reservation was created.
`,
  ramlChecks: [
    { label: 'Error has a required string code', rule: { type: 'prop', typeName: 'Error', prop: 'code', want: { type: 'string', required: true } } },
    { label: 'Error has a required string message', rule: { type: 'prop', typeName: 'Error', prop: 'message', want: { type: 'string', required: true } } },
    { label: 'Error has an optional string correlationId', rule: { type: 'prop', typeName: 'Error', prop: 'correlationId', want: { type: 'string', required: false } } },
    {
      label: 'Error has an example',
      rule: {
        type: 'any',
        rules: [
          { type: 'typeDecl', name: 'Error', want: { example: { set: true } } },
          { type: 'typeDecl', name: 'Error', want: { examples: { set: true } } },
        ],
      },
    },
    { label: 'POST /reservations returns 201', rule: { type: 'response', path: '/reservations', method: 'post', status: '201' } },
    {
      label: 'POST /reservations returns Error on 400 and 500',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/reservations', method: 'post', status: '400', typeIs: 'Error' },
          { type: 'response', path: '/reservations', method: 'post', status: '500', typeIs: 'Error' },
        ],
      },
    },
    { label: 'GET /reservations/{reservationId} returns 200', rule: { type: 'response', path: '/reservations/{}', method: 'get', status: '200' } },
    {
      label: 'GET /reservations/{reservationId} returns Error on 400, 404 and 500',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/reservations/{}', method: 'get', status: '400', typeIs: 'Error' },
          { type: 'response', path: '/reservations/{}', method: 'get', status: '404', typeIs: 'Error' },
          { type: 'response', path: '/reservations/{}', method: 'get', status: '500', typeIs: 'Error' },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Hotel Reservations API
mediaType: application/json

types:
  Error:
    type: object
    properties:
      code: string
      message: string
      correlationId?: string
    example:
      code: ROOM_NOT_AVAILABLE
      message: No rooms of this kind are free on these dates.

/reservations:
  post:
    responses:
      201:
        description: The reservation was created.
      400:
        body:
          type: Error
      500:
        body:
          type: Error
  /{reservationId}:
    get:
      responses:
        200:
          description: The reservation.
        400:
          body:
            type: Error
        404:
          body:
            type: Error
        500:
          body:
            type: Error
`,
  keyPoints: [
    'One Error type means a consumer writes its error handling once.',
    'A machine-readable code is for programs. The message is for people.',
    '4xx codes mean the caller must change something. 5xx codes mean the fault is on the server side.',
    'The same type can sit on many status codes. The status says what kind of failure it was.',
  ],
  solution: `
\`Error\` is declared once and used on every failure, so all errors have the same shape.

\`code\` is stable, so a program can act on it. \`message\` can change wording freely, since it is for people. \`correlationId?\` is optional because a failure can happen before one exists.

\`POST /reservations\` has no 404, because a POST to a collection is not looking up one item.

With many endpoints, a trait that holds these responses saves repetition. The result for the consumer is the same.
`,
  followUps: [
    {
      q: 'Why have a code property when the HTTP status already says what failed?',
      a: 'A status is broad. Many failures are a 400, and code tells them apart, such as ROOM_NOT_AVAILABLE and DATES_IN_THE_PAST, so a program can react to each.',
    },
    {
      q: 'What must a 500 response never contain?',
      a: 'Internal details such as stack traces, SQL or server names. They help attackers and mean nothing to the consumer. Log them, and return a safe message with a correlation id.',
    },
    {
      q: 'How would you make every API in the company use this error shape?',
      a: 'Publish the type and a trait with the error responses to Exchange as a library. Each API brings it in with uses, and a design review checks for it.',
    },
  ],
}
