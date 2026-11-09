export default {
  id: 'rm-109',
  category: 'api-design',
  title: 'Car Rental Bookings API: Traits Applied in the Wrong Places',
  level: 'INTERMEDIATE',
  tags: ['raml', 'api-design', 'debugging', 'traits', 'idempotency', 'headers', 'travel'],
  estMinutes: 20,
  description: `
A car rental company with 85 branches sells bookings through three travel partners. Last month one partner retried a slow \`POST /bookings\` after a timeout, and 140 customers were booked twice.

The fix was meant to be in the contract: an \`Idempotency-Key\` header on create, paging on the list, and a correlation id on every call. The team wrote the right traits and then applied them in the wrong places. Some placements break the file. Others are valid RAML that does the wrong thing.

**Requirements**
- Trait \`paged\` has an optional integer \`limit\` from 1 to 50 with a default of 20, and an optional integer \`offset\` of at least 0. Only \`GET /bookings\` uses it.
- Trait \`idempotent\` has a required string header \`Idempotency-Key\` of 16 to 64 characters, and a 409 response for a key reused with a different body. \`POST /bookings\` uses it.
- Trait \`traced\` has a required string header \`X-Correlation-Id\`. All three methods use it. RAML has no \`is\` at the top of the file, so apply it on the resources or the methods.
- \`POST /bookings\` takes a \`BookingRequest\` and returns a \`Booking\` with status 201 and a \`Location\` header.
- \`GET /bookings\` returns \`Booking[]\` with status 200.
- \`GET /bookings/{bookingId}\` returns a \`Booking\` with status 200, or 404.
- \`branchCode\` is three capital letters and two digits, such as \`LHR01\`.
`,
  starter: `#%RAML 1.0
title: Car Rental Bookings API
version: v1
baseUri: https://api.example.com/rentals/{version}
mediaType: application/json
is: [ traced ]

types:
  BookingRequest:
    type: object
    properties:
      branchCode:
        type: string
        pattern: ^[A-Z]{3}[0-9]{2}$
      carClass:
        type: string
        enum: [ ECONOMY, COMPACT, SUV, VAN ]
      pickUpAt: datetime
      returnAt: datetime
  Booking:
    type: BookingRequest
    properties:
      bookingId: string
      status:
        type: string
        enum: [ CONFIRMED, CANCELLED ]
    example:
      bookingId: BK-2026-118733
      branchCode: LHR01
      carClass: COMPACT
      pickUpAt: 2026-05-02T09:00:00+01:00
      returnAt: 2026-05-06T09:00:00+01:00
      status: CONFIRMED

traits:
  paged:
    queryParameters:
      limit:
        type: integer
        minimum: 1
        maximum: 50
        default: 20
      offset?:
        type: integer
        minimum: 0
        default: 0
  idempotent:
    headers:
      Idempotency-Key?:
        type: string
        minLength: 16
        maxLength: 64
    responses:
      409:
        description: This key was already used with a different body.
  traced:
    headers:
      X-Correlation-Id:
        type: string

/bookings:
  get:
    is: [ idempotent ]
    responses:
      200:
        body:
          type: Booking[]
  post:
    body:
      type: BookingRequest
    responses:
      201:
        is: [ idempotent ]
        headers:
          Location:
            type: string
        body:
          type: Booking
  /{bookingId}:
    get:
      is: [ paged ]
      responses:
        200:
          body:
            type: Booking
        404:
          description: No booking has this id.
`,
  ramlChecks: [
    {
      label: 'GET /bookings uses paged, with an optional limit from 1 to 50',
      rule: {
        type: 'all',
        rules: [
          { type: 'applied', path: '/bookings', method: 'get', trait: 'paged' },
          { type: 'param', path: '/bookings', method: 'get', in: 'query', name: 'limit', want: { type: 'integer', required: false, minimum: 1, maximum: 50, default: 20 } },
          { type: 'param', path: '/bookings', method: 'get', in: 'query', name: 'offset', want: { type: 'integer', required: false, minimum: 0 } },
        ],
      },
    },
    { label: 'POST /bookings uses idempotent', rule: { type: 'applied', path: '/bookings', method: 'post', trait: 'idempotent' } },
    {
      label: 'Idempotency-Key is a required header of 16 to 64 characters',
      rule: {
        type: 'all',
        rules: [
          { type: 'trait', name: 'idempotent', has: 'headers.Idempotency-Key' },
          { type: 'param', path: '/bookings', method: 'post', in: 'header', name: 'Idempotency-Key', want: { type: 'string', required: true, minLength: 16, maxLength: 64 } },
        ],
      },
    },
    { label: 'POST /bookings gets a 409 from idempotent', rule: { type: 'all', rules: [{ type: 'trait', name: 'idempotent', has: 'responses.409' }, { type: 'response', path: '/bookings', method: 'post', status: '409' }] } },
    {
      label: 'All three methods use traced, with a required X-Correlation-Id',
      rule: {
        type: 'all',
        rules: [
          { type: 'applied', path: '/bookings', method: 'get', trait: 'traced' },
          { type: 'applied', path: '/bookings', method: 'post', trait: 'traced' },
          { type: 'applied', path: '/bookings/{}', method: 'get', trait: 'traced' },
          { type: 'param', path: '/bookings/{}', method: 'get', in: 'header', name: 'X-Correlation-Id', want: { type: 'string', required: true } },
        ],
      },
    },
    {
      label: 'POST /bookings takes a BookingRequest and returns a Booking with 201 and Location',
      rule: {
        type: 'all',
        rules: [
          { type: 'body', path: '/bookings', method: 'post', typeIs: 'BookingRequest' },
          { type: 'response', path: '/bookings', method: 'post', status: '201', typeIs: 'Booking', header: 'Location' },
        ],
      },
    },
    { label: 'GET /bookings returns Booking[]', rule: { type: 'response', path: '/bookings', method: 'get', status: '200', typeIs: 'Booking[]' } },
    {
      label: 'GET /bookings/{bookingId} returns a Booking, or 404',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/bookings/{}', method: 'get', status: '200', typeIs: 'Booking' },
          { type: 'response', path: '/bookings/{}', method: 'get', status: '404' },
        ],
      },
    },
    {
      label: 'branchCode is three capital letters and two digits',
      rule: { type: 'prop', typeName: 'BookingRequest', prop: 'branchCode', want: { type: 'string', pattern: { accepts: ['LHR01', 'MAN12'], rejects: ['lhr01', 'LH01', 'LHR1', 'LHR012', 'ABCDE', '12ABC'] } } },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Car Rental Bookings API
version: v1
baseUri: https://api.example.com/rentals/{version}
mediaType: application/json

types:
  BookingRequest:
    type: object
    properties:
      branchCode:
        type: string
        pattern: ^[A-Z]{3}[0-9]{2}$
      carClass:
        type: string
        enum: [ ECONOMY, COMPACT, SUV, VAN ]
      pickUpAt: datetime
      returnAt: datetime
  Booking:
    type: BookingRequest
    properties:
      bookingId: string
      status:
        type: string
        enum: [ CONFIRMED, CANCELLED ]
    example:
      bookingId: BK-2026-118733
      branchCode: LHR01
      carClass: COMPACT
      pickUpAt: 2026-05-02T09:00:00+01:00
      returnAt: 2026-05-06T09:00:00+01:00
      status: CONFIRMED

traits:
  paged:
    queryParameters:
      limit?:
        type: integer
        minimum: 1
        maximum: 50
        default: 20
      offset?:
        type: integer
        minimum: 0
        default: 0
  idempotent:
    headers:
      Idempotency-Key:
        type: string
        minLength: 16
        maxLength: 64
    responses:
      409:
        description: This key was already used with a different body.
  traced:
    headers:
      X-Correlation-Id:
        type: string

/bookings:
  is: [ traced ]
  get:
    is: [ paged ]
    responses:
      200:
        body:
          type: Booking[]
  post:
    is: [ idempotent ]
    body:
      type: BookingRequest
    responses:
      201:
        headers:
          Location:
            type: string
        body:
          type: Booking
  /{bookingId}:
    is: [ traced ]
    get:
      responses:
        200:
          body:
            type: Booking
        404:
          description: No booking has this id.
`,
  keyPoints: [
    'is works on a method or a resource. It is not allowed at the top of the file or inside a response.',
    'is on a resource applies the trait to every method on that resource, but not to nested resources.',
    'An idempotency key belongs on the call that creates something. A GET is already safe to repeat.',
    'A trait applied to the wrong method is valid RAML, so only the requirements reveal it.',
    'A parameter in a trait keeps its own required rule. limit without ? makes every caller send it.',
  ],
  solution: `
Six fixes, in the order the parser and the review find them.
- \`is: [ traced ]\` at the top is not a RAML key. Put it on \`/bookings\` and on \`/{bookingId}\`. A nested resource does not inherit \`is\` from its parent, so it needs its own.
- \`is: [ idempotent ]\` inside the 201 response is not allowed there. Move it up to \`post\`.
- \`idempotent\` on \`GET /bookings\` comes off. A read does not need a key, and requiring one makes every list call fail without it.
- \`paged\` moves from \`GET /bookings/{bookingId}\` to \`GET /bookings\`. One booking has nothing to page.
- \`limit\` in \`paged\` gets a \`?\`, so callers may leave it out and get the default of 20.
- \`Idempotency-Key?\` in \`idempotent\` loses its \`?\`. An optional key protects nothing, because the partner that caused the double bookings would leave it out.
`,
  followUps: [
    {
      q: 'How does an Idempotency-Key stop the double bookings?',
      a: 'The API stores each key with the response it gave, for example in Object Store for 24 hours. A retry with the same key gets the stored response and no second booking is made.',
    },
    {
      q: 'Why return 409 when a key is reused with a different body?',
      a: 'The same key must mean the same request. A different body under that key is a client bug, and replaying the old answer would hide it.',
    },
    {
      q: 'Why does /bookings/{bookingId} need its own is: [ traced ]?',
      a: 'Traits on a resource reach its own methods only. A nested resource is a separate resource in RAML, so it lists its traits again.',
    },
    {
      q: 'Where should the trait declarations live when ten APIs need them?',
      a: 'In a RAML library published to Exchange. Each API brings it in with uses, so the header names and limits match across the company.',
    },
  ],
}
