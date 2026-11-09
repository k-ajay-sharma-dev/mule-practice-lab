export default {
  id: 'rm-105',
  category: 'api-design',
  title: 'Freight Booking API: Rate Limits, Idempotency and Async Confirmation in Reusable Traits',
  level: 'EXPERT',
  tags: ['raml', 'api-design', 'rate-limiting', 'idempotency', 'async', 'trait-parameters', 'traits', 'logistics'],
  estMinutes: 45,
  description: `
An ocean freight forwarder opens its booking API to 900 shippers. A carrier confirms each container booking within 2 to 30 minutes. Three problems showed up in the pilot:
- A few shippers' scripts sent thousands of status reads a minute and slowed everyone else down.
- Retries after timeouts created duplicate bookings.
- Shippers kept a connection open waiting for the carrier and hit gateway timeouts.

The contract answers all three, using traits so every method gets the same rules.

**Rate limits.** Each successful response tells the caller its budget with \`X-RateLimit-Limit\` and \`X-RateLimit-Remaining\`. Going over the limit returns **429** with \`Retry-After\`. The success status differs by method: 202 on the booking POST, 200 on the reads. A trait with a parameter, such as \`okStatus\`, can put the headers on the right response for each method. The parameter can be used as a response code key: \`<<okStatus>>:\`.

**Idempotency.** The booking POST needs an \`Idempotency-Key\` header. A key reused with a different body returns **409**.

**Async confirmation.** The booking POST answers **202** with a \`Location\` header. The shipper polls the booking until the carrier confirms or rejects it.

**Requirements**
- Keep the title \`Freight Booking API\` and JSON as the default media type.
- A type \`BookingRequest\` with a required string \`shipperId\`, required strings \`originPort\` and \`destinationPort\` that are UN/LOCODEs (5 capital letters, such as \`NLRTM\`), a required integer \`containers\` from 1 to 50, and a required \`readyDate\` of type \`date-only\`.
- A type \`Booking\` with a required string \`bookingId\` and a required \`status\` that is exactly one of \`PENDING_CARRIER\`, \`CONFIRMED\`, \`REJECTED\`.
- A type \`BookingPage\` with a required \`items\` of \`Booking[]\`, and a required \`nextCursor\` that is a string or null.
- A type \`Error\` with required strings \`code\` and \`message\`.
- A trait \`rateLimited\` with a 429 response that has a \`Retry-After\` header and an \`Error\` body. Its success response carries \`X-RateLimit-Limit\` and \`X-RateLimit-Remaining\`.
- A trait \`idempotent\` with a required string header \`Idempotency-Key\` of 16 to 64 characters, and a 409 response with an \`Error\` body.
- \`POST /bookings\` uses both traits. It takes a \`BookingRequest\` and returns 202 with a \`Booking\` and a \`Location\` header.
- \`GET /bookings\` uses \`rateLimited\`. It takes an optional string \`cursor\` and an optional integer \`limit\` from 1 to 100, and returns 200 with a \`BookingPage\`.
- \`GET /bookings/{bookingId}\` uses \`rateLimited\` and returns 200 with a \`Booking\`, or 404.
`,
  starter: `#%RAML 1.0
title: Freight Booking API
mediaType: application/json

types:

traits:

/bookings:
  post:
  get:
  /{bookingId}:
    get:
`,
  ramlChecks: [
    {
      label: 'originPort and destinationPort are 5 capital letters',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'BookingRequest', prop: 'originPort', want: { type: 'string', required: true, pattern: { accepts: ['NLRTM', 'SGSIN'], rejects: ['nlrtm', 'NLRT', 'NLRTMX', 'NL RTM', 'NL1TM'] } } },
          { type: 'prop', typeName: 'BookingRequest', prop: 'destinationPort', want: { type: 'string', required: true, pattern: { accepts: ['NLRTM', 'SGSIN'], rejects: ['nlrtm', 'NLRT', 'NLRTMX', 'NL RTM', 'NL1TM'] } } },
        ],
      },
    },
    {
      label: 'BookingRequest has a shipperId, 1 to 50 containers and a date-only readyDate',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'BookingRequest', prop: 'shipperId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'BookingRequest', prop: 'containers', want: { type: 'integer', required: true, minimum: 1, maximum: 50 } },
          { type: 'prop', typeName: 'BookingRequest', prop: 'readyDate', want: { type: 'date-only', required: true } },
        ],
      },
    },
    { label: 'Booking.status has exactly the three states', rule: { type: 'prop', typeName: 'Booking', prop: 'status', want: { required: true, enum: { exactly: ['PENDING_CARRIER', 'CONFIRMED', 'REJECTED'] } } } },
    {
      label: 'BookingPage has items and a nextCursor that is always present and may be null',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'BookingPage', prop: 'items', want: { type: 'Booking[]', required: true } },
          {
            type: 'any',
            rules: [
              { type: 'prop', typeName: 'BookingPage', prop: 'nextCursor', want: { type: 'string | nil', required: true } },
              { type: 'prop', typeName: 'BookingPage', prop: 'nextCursor', want: { type: 'nil | string', required: true } },
              { type: 'prop', typeName: 'BookingPage', prop: 'nextCursor', want: { type: 'string?', required: true } },
            ],
          },
        ],
      },
    },
    { label: 'The rateLimited trait holds a 429 with a Retry-After header', rule: { type: 'trait', name: 'rateLimited', has: 'responses.429.headers.Retry-After' } },
    {
      label: 'Every method uses rateLimited, and its 429 returns an Error with Retry-After',
      rule: {
        type: 'all',
        rules: [
          { type: 'applied', path: '/bookings', method: 'post', trait: 'rateLimited' },
          { type: 'applied', path: '/bookings', method: 'get', trait: 'rateLimited' },
          { type: 'applied', path: '/bookings/{}', method: 'get', trait: 'rateLimited' },
          { type: 'prop', typeName: 'Error', prop: 'code', want: { type: 'string', required: true } },
          { type: 'response', path: '/bookings/{}', method: 'get', status: '429', typeIs: 'Error', header: 'Retry-After' },
        ],
      },
    },
    {
      label: 'The 202 on POST /bookings carries the rate limit headers',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/bookings', method: 'post', status: '202', header: 'X-RateLimit-Limit' },
          { type: 'response', path: '/bookings', method: 'post', status: '202', header: 'X-RateLimit-Remaining' },
        ],
      },
    },
    {
      label: 'The 200 on both GET methods carries the rate limit headers',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/bookings', method: 'get', status: '200', header: 'X-RateLimit-Remaining' },
          { type: 'response', path: '/bookings/{}', method: 'get', status: '200', header: 'X-RateLimit-Limit' },
          { type: 'response', path: '/bookings/{}', method: 'get', status: '200', header: 'X-RateLimit-Remaining' },
        ],
      },
    },
    {
      label: 'POST /bookings uses idempotent, with a required Idempotency-Key of 16 to 64 characters',
      rule: {
        type: 'all',
        rules: [
          { type: 'trait', name: 'idempotent', has: 'headers' },
          { type: 'applied', path: '/bookings', method: 'post', trait: 'idempotent' },
          { type: 'param', path: '/bookings', method: 'post', in: 'header', name: 'Idempotency-Key', want: { type: 'string', required: true, minLength: 16, maxLength: 64 } },
          { type: 'response', path: '/bookings', method: 'post', status: '409', typeIs: 'Error' },
        ],
      },
    },
    { label: 'POST /bookings takes a BookingRequest and returns 202 with a Booking and a Location header', rule: { type: 'all', rules: [{ type: 'body', path: '/bookings', method: 'post', typeIs: 'BookingRequest' }, { type: 'response', path: '/bookings', method: 'post', status: '202', typeIs: 'Booking', header: 'Location' }] } },
    {
      label: 'GET /bookings takes an optional cursor and a limit from 1 to 100, and returns a BookingPage',
      rule: {
        type: 'all',
        rules: [
          { type: 'param', path: '/bookings', method: 'get', in: 'query', name: 'cursor', want: { type: 'string', required: false } },
          { type: 'param', path: '/bookings', method: 'get', in: 'query', name: 'limit', want: { type: 'integer', required: false, minimum: 1, maximum: 100 } },
          { type: 'response', path: '/bookings', method: 'get', status: '200', typeIs: 'BookingPage' },
        ],
      },
    },
    { label: 'GET /bookings/{bookingId} returns a Booking, or 404', rule: { type: 'all', rules: [{ type: 'response', path: '/bookings/{}', method: 'get', status: '200', typeIs: 'Booking' }, { type: 'response', path: '/bookings/{}', method: 'get', status: '404' }] } },
  ],
  referenceRaml: `#%RAML 1.0
title: Freight Booking API
mediaType: application/json

types:
  BookingRequest:
    type: object
    properties:
      shipperId: string
      originPort:
        type: string
        pattern: ^[A-Z]{5}$
      destinationPort:
        type: string
        pattern: ^[A-Z]{5}$
      containers:
        type: integer
        minimum: 1
        maximum: 50
      readyDate: date-only
  Booking:
    type: object
    properties:
      bookingId: string
      status:
        type: string
        enum: [ PENDING_CARRIER, CONFIRMED, REJECTED ]
  BookingPage:
    type: object
    properties:
      items: Booking[]
      nextCursor: string | nil
  Error:
    type: object
    properties:
      code: string
      message: string

traits:
  rateLimited:
    usage: Set okStatus to the success status of the method, such as 200 or 202.
    responses:
      <<okStatus>>:
        headers:
          X-RateLimit-Limit:
            type: integer
            description: Calls allowed in the current window.
          X-RateLimit-Remaining:
            type: integer
            description: Calls left in the current window.
      429:
        description: Too many calls in this window.
        headers:
          Retry-After:
            type: integer
            description: Seconds to wait before calling again.
        body:
          type: Error
  idempotent:
    headers:
      Idempotency-Key:
        type: string
        minLength: 16
        maxLength: 64
    responses:
      409:
        description: This key was already used with a different body.
        body:
          type: Error

/bookings:
  post:
    is: [ idempotent, rateLimited: { okStatus: 202 } ]
    body:
      type: BookingRequest
    responses:
      202:
        headers:
          Location:
            type: string
            description: Poll this URL until the carrier confirms or rejects.
        body:
          type: Booking
  get:
    is: [ rateLimited: { okStatus: 200 } ]
    queryParameters:
      cursor?: string
      limit?:
        type: integer
        minimum: 1
        maximum: 100
    responses:
      200:
        body:
          type: BookingPage
  /{bookingId}:
    get:
      is: [ rateLimited: { okStatus: 200 } ]
      responses:
        200:
          body:
            type: Booking
        404:
          description: No booking has this id.
`,
  keyPoints: [
    'Rate limit headers on success let well-behaved clients slow down before they hit 429.',
    'A trait parameter can be a response code key, so one trait fits methods with different success codes.',
    'Idempotency and rate limiting are separate concerns, so they are separate traits.',
    'A 202 with Location turns a slow carrier confirmation into a booking the shipper can poll.',
    'Cursor paging keeps the list stable while new bookings arrive.',
  ],
  solution: `
The interesting part is \`<<okStatus>>:\` inside \`rateLimited\`. A trait with a fixed \`200:\` key would add the headers to a 200 that the POST never returns, and miss the 202 it does return. With the parameter, each method says which response gets the budget headers.

The 429 is the same everywhere, so it sits in the trait with a fixed code. \`Retry-After\` gives the wait in seconds.

\`idempotent\` is applied only where it is needed. GET is safe to repeat by definition, so it does not need a key.

Polling the booking costs calls, and those calls count against the limit. That is why the 202 should come with guidance in the documentation, such as polling at most every 30 seconds. A webhook for booking events would remove most of those calls.

In API Manager, a Rate Limiting SLA policy enforces the budget per client id, and can add the \`X-RateLimit\` headers to responses itself. The contract states what callers will see.
`,
  followUps: [
    {
      q: 'Should a 429 count against the caller’s budget?',
      a: 'Usually yes, or a misbehaving client can hammer the gateway for free. The gateway rejects it cheaply, so the cost is small, but the count still discourages tight retry loops.',
    },
    {
      q: 'What is the difference between Rate Limiting and Spike Control in API Manager?',
      a: 'Rate Limiting rejects calls over a budget in a time window. Spike Control smooths bursts by queueing calls for a short time before rejecting them, protecting the backend rather than enforcing a contract.',
    },
    {
      q: 'Why is X-RateLimit-Reset often added as well?',
      a: 'It tells the client when the window resets, so it can plan its calls instead of waiting for a 429. These headers are a convention, so document the exact meaning.',
    },
    {
      q: 'Why must the idempotency check happen after the rate limit check?',
      a: 'A rejected call by the rate limit never reached the booking logic, so it must not store the key. Otherwise a retry with the same key would be treated as a replay of a booking that does not exist.',
    },
  ],
}
