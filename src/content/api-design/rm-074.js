export default {
  id: 'rm-074',
  category: 'api-design',
  title: 'Equipment Rental API: Idempotency and Tracing Traits Together',
  level: 'INTERMEDIATE',
  tags: ['raml', 'api-design', 'traits', 'idempotency', 'headers', 'errors', 'construction'],
  estMinutes: 20,
  description: `
A construction equipment hire company runs 60 depots. Staff book excavators and cranes on tablets in the yard, often on a weak 4G signal. When a response is lost, the tablet sends the POST again, and last quarter 140 rentals were booked twice. An excavator costs 450 EUR a day, so each duplicate is a real cost.

The fix is an **idempotency key**. The tablet makes a key for each booking and sends it in a header. The API stores the key with the result, and a second call with the same key gets the first result back instead of a new rental.

A method can apply several traits: \`is: [ idempotent, traced ]\`. Each one adds its own parts.

**Requirements**
- Title \`Equipment Rental API\`, with JSON as the default media type.
- A type \`ApiError\` with a required string \`code\` and a required string \`message\`.
- Types \`RentalRequest\` (required strings \`depotId\` and \`equipmentId\`, required date-only \`startDate\` and \`endDate\`) and \`Rental\` (required string \`rentalId\`, required string \`status\`).
- A trait \`idempotent\` that adds a required string header \`Idempotency-Key\` of 16 to 64 characters, and a 409 response with an \`ApiError\` body for a key that was used with a different body.
- A trait \`traced\` that adds a required string header \`X-Correlation-ID\`.
- \`POST /rentals\` uses both traits, takes a \`RentalRequest\` and returns a \`Rental\` with status 201.
- \`POST /rentals/{rentalId}/returns\` uses both traits and returns 201.
- \`GET /rentals/{rentalId}\` uses only \`traced\`, and returns a \`Rental\` or 404. A read is safe to repeat, so it needs no key.
`,
  starter: `#%RAML 1.0
title: Equipment Rental API
mediaType: application/json

types:

traits:

/rentals:
  post:
  /{rentalId}:
    get:
    /returns:
      post:
`,
  ramlChecks: [
    {
      label: 'ApiError has a required string code and message',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'ApiError', prop: 'code', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'ApiError', prop: 'message', want: { type: 'string', required: true } },
        ],
      },
    },
    {
      label: 'The idempotent trait adds the Idempotency-Key header and a 409 response',
      rule: {
        type: 'all',
        rules: [
          { type: 'trait', name: 'idempotent', has: 'headers.Idempotency-Key' },
          { type: 'trait', name: 'idempotent', has: 'responses.409' },
        ],
      },
    },
    {
      label: 'POST /rentals uses both idempotent and traced',
      rule: {
        type: 'all',
        rules: [
          { type: 'applied', path: '/rentals', method: 'post', trait: 'idempotent' },
          { type: 'applied', path: '/rentals', method: 'post', trait: 'traced' },
        ],
      },
    },
    {
      label: 'POST /rentals needs Idempotency-Key, a string of 16 to 64 characters',
      rule: { type: 'param', path: '/rentals', method: 'post', in: 'header', name: 'Idempotency-Key', want: { type: 'string', required: true, minLength: 16, maxLength: 64 } },
    },
    { label: 'POST /rentals needs X-Correlation-ID', rule: { type: 'param', path: '/rentals', method: 'post', in: 'header', name: 'X-Correlation-ID', want: { type: 'string', required: true } } },
    { label: 'A reused key gets a 409 with an ApiError body', rule: { type: 'response', path: '/rentals', method: 'post', status: '409', typeIs: 'ApiError' } },
    {
      label: 'POST /rentals takes a RentalRequest and returns a Rental with 201',
      rule: {
        type: 'all',
        rules: [
          { type: 'body', path: '/rentals', method: 'post', typeIs: 'RentalRequest' },
          { type: 'response', path: '/rentals', method: 'post', status: '201', typeIs: 'Rental' },
        ],
      },
    },
    {
      label: 'RentalRequest has date-only startDate and endDate',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'RentalRequest', prop: 'startDate', want: { type: 'date-only', required: true } },
          { type: 'prop', typeName: 'RentalRequest', prop: 'endDate', want: { type: 'date-only', required: true } },
        ],
      },
    },
    {
      label: 'POST /rentals/{rentalId}/returns uses both traits and returns 201',
      rule: {
        type: 'all',
        rules: [
          { type: 'applied', path: '/rentals/{}/returns', method: 'post', trait: 'idempotent' },
          { type: 'applied', path: '/rentals/{}/returns', method: 'post', trait: 'traced' },
          { type: 'response', path: '/rentals/{}/returns', method: 'post', status: '201' },
        ],
      },
    },
    {
      label: 'GET /rentals/{rentalId} is traced and returns a Rental or 404',
      rule: {
        type: 'all',
        rules: [
          { type: 'applied', path: '/rentals/{}', method: 'get', trait: 'traced' },
          { type: 'response', path: '/rentals/{}', method: 'get', status: '200', typeIs: 'Rental' },
          { type: 'response', path: '/rentals/{}', method: 'get', status: '404' },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Equipment Rental API
mediaType: application/json

types:
  ApiError:
    type: object
    properties:
      code: string
      message: string
  RentalRequest:
    type: object
    properties:
      depotId: string
      equipmentId: string
      startDate: date-only
      endDate: date-only
  Rental:
    type: object
    properties:
      rentalId: string
      status: string

traits:
  idempotent:
    usage: Apply to a POST that a client may send again after a lost response.
    headers:
      Idempotency-Key:
        type: string
        minLength: 16
        maxLength: 64
        description: A key the client makes once per action and sends again on every retry.
    responses:
      409:
        description: This key was already used with a different body.
        body:
          type: ApiError
  traced:
    headers:
      X-Correlation-ID:
        type: string
        description: Ties this call to the rest of the journey.

/rentals:
  post:
    is: [ idempotent, traced ]
    body:
      type: RentalRequest
    responses:
      201:
        body:
          type: Rental
  /{rentalId}:
    get:
      is: [ traced ]
      responses:
        200:
          body:
            type: Rental
        404:
          description: No rental has this id.
    /returns:
      post:
        is: [ idempotent, traced ]
        responses:
          201:
            description: The return was recorded.
`,
  keyPoints: [
    'An idempotency key turns a retried POST into a safe repeat of the first call.',
    'A method can apply several traits, and each trait adds its own headers and responses.',
    'The 409 belongs in the idempotent trait, because it only exists when there is a key.',
    'GET is already safe to repeat, so it gets tracing but no key.',
  ],
  solution: `
\`idempotent\` holds everything about the key: the header, its length and the 409 for misuse. \`traced\` holds the correlation header. Each concern lives in one trait, and a method picks what it needs.

Both POSTs create something, so both need a key. A return booked twice would close the rental twice and charge the wrong fee.

\`GET /rentals/{rentalId}\` only reads, and reading twice changes nothing. Asking callers for a key there would add work for no gain.

The 409 uses \`ApiError\`, so a tablet can show the same kind of message it shows for any other error.
`,
  followUps: [
    {
      q: 'What should the API return when the same key arrives with the same body?',
      a: 'The stored response of the first call, with the same status and body. The client cannot tell it was a repeat, which is the point.',
    },
    {
      q: 'How would you store the keys in Mule?',
      a: 'Use an Object Store with a time to live, such as 24 hours, keyed by client id and idempotency key. Save the response after the first call and read it back on a repeat.',
    },
    {
      q: 'Why not use the Idempotent Message Validator alone?',
      a: 'It only rejects a repeat. A client that lost the first response needs the original result back, so you must store the response as well.',
    },
    {
      q: 'Who should make the key, the client or the server?',
      a: 'The client. Only the client knows that two calls are the same action, so it makes the key once and reuses it on every retry.',
    },
  ],
}
