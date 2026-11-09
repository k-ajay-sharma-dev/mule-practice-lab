export default {
  id: 'rm-107',
  category: 'api-design',
  title: 'Parcel Locker API: Fix the Contract a Team Shipped',
  level: 'BEGINNER',
  tags: ['raml', 'api-design', 'debugging', 'examples', 'status-codes', 'optional-properties', 'logistics'],
  estMinutes: 15,
  description: `
A parcel company runs 1,200 lockers at stations and supermarkets. A customer reserves a locker in the app, the courier drops the parcel, and the customer opens the door with a six digit pickup code.

The team published the contract below to Exchange last week. The mobile team then tried the mocking service and it failed: the examples do not validate, and the app saw a 200 where it expected a 201. Fix the file so it meets the requirements.

Watch for two traps. Making an example pass by **changing the type** is wrong when the type was right. Making an error go away by **deleting the example** is wrong too, since the mock needs it.

**Requirements**
- All bodies are JSON, set once with \`mediaType\`.
- \`LockerSize\` is a string that is one of \`S\`, \`M\`, \`L\`. The lockers come in no other size.
- \`NewReservation\` has a required string \`lockerId\`, a required \`size\` of type \`LockerSize\`, and an optional string \`notes\` for the courier.
- \`Reservation\` has required strings \`reservationId\` and \`lockerId\`, a required \`size\` of type \`LockerSize\`, a required \`pickupCode\` and the same optional \`notes\`.
- \`pickupCode\` is a string of exactly six digits, such as \`048213\`. It is a string so the leading zero is kept.
- \`Reservation\` keeps an example that fits it.
- \`POST /reservations\` takes a \`NewReservation\` and returns a \`Reservation\` with status 201 and a \`Location\` header.
- \`GET /reservations/{reservationId}\` returns a \`Reservation\` with status 200, or 404.
- \`DELETE /reservations/{reservationId}\` cancels the reservation and returns 204 with no body.
`,
  starter: `#%RAML 1.0
title: Parcel Locker API
version: v1
baseUri: https://api.example.com/lockers/{version}
mediaType: application/json

types:
  LockerSize:
    type: string
    enum: [ S, M, L ]
  NewReservation:
    type: object
    properties:
      lockerId: string
      size: LockerSize
      notes: string
  Reservation:
    type: object
    properties:
      reservationId: string
      lockerId?: string
      size: LockerSize
      pickupCode:
        type: string
        pattern: ^[0-9]{6}$
      notes?: string
    example:
      reservationId: R-77120
      lockerId: LK-0418
      size: XL
      pickupCode: 048213
      notes: Fragile, keep upright.

/reservations:
  post:
    body:
      type: NewReservation
    responses:
      200:
        body:
          type: Reservation
  /{reservationId}:
    get:
      responses:
        200:
          body:
            type: Reservation
        404:
          description: No reservation has this id.
    delete:
      responses:
        200:
          body:
            type: Reservation
`,
  ramlChecks: [
    { label: 'JSON is the default media type', rule: { type: 'root', key: 'mediaType', want: 'application/json' } },
    { label: 'LockerSize allows only S, M and L', rule: { type: 'typeDecl', name: 'LockerSize', want: { enum: { exactly: ['S', 'M', 'L'] } } } },
    {
      label: 'Reservation has required reservationId and lockerId',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Reservation', prop: 'reservationId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Reservation', prop: 'lockerId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Reservation', prop: 'size', want: { type: 'LockerSize', required: true } },
        ],
      },
    },
    {
      label: 'pickupCode is a required string of exactly six digits',
      rule: { type: 'prop', typeName: 'Reservation', prop: 'pickupCode', want: { type: 'string', required: true, pattern: { accepts: ['048213', '999999'], rejects: ['48213', '0482130', '04821A'] } } },
    },
    {
      label: 'notes is optional on NewReservation and Reservation',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'NewReservation', prop: 'notes', want: { type: 'string', required: false } },
          { type: 'prop', typeName: 'Reservation', prop: 'notes', want: { type: 'string', required: false } },
          { type: 'prop', typeName: 'NewReservation', prop: 'lockerId', want: { type: 'string', required: true } },
        ],
      },
    },
    {
      label: 'Reservation keeps its example',
      rule: {
        type: 'any',
        rules: [
          { type: 'typeDecl', name: 'Reservation', want: { example: { set: true } } },
          { type: 'typeDecl', name: 'Reservation', want: { examples: { set: true } } },
        ],
      },
    },
    { label: 'POST /reservations takes a NewReservation', rule: { type: 'body', path: '/reservations', method: 'post', typeIs: 'NewReservation' } },
    {
      label: 'POST /reservations returns a Reservation with 201 and a Location header',
      rule: { type: 'response', path: '/reservations', method: 'post', status: '201', typeIs: 'Reservation', header: 'Location' },
    },
    {
      label: 'GET /reservations/{reservationId} returns a Reservation, or 404',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/reservations/{}', method: 'get', status: '200', typeIs: 'Reservation' },
          { type: 'response', path: '/reservations/{}', method: 'get', status: '404' },
        ],
      },
    },
    { label: 'DELETE /reservations/{reservationId} returns 204 with no body', rule: { type: 'response', path: '/reservations/{}', method: 'delete', status: '204', noBody: true } },
  ],
  referenceRaml: `#%RAML 1.0
title: Parcel Locker API
version: v1
baseUri: https://api.example.com/lockers/{version}
mediaType: application/json

types:
  LockerSize:
    type: string
    enum: [ S, M, L ]
  NewReservation:
    type: object
    properties:
      lockerId: string
      size: LockerSize
      notes?: string
  Reservation:
    type: object
    properties:
      reservationId: string
      lockerId: string
      size: LockerSize
      pickupCode:
        type: string
        pattern: ^[0-9]{6}$
      notes?: string
    example:
      reservationId: R-77120
      lockerId: LK-0418
      size: M
      pickupCode: '048213'
      notes: Fragile, keep upright.

/reservations:
  post:
    body:
      type: NewReservation
    responses:
      201:
        headers:
          Location:
            type: string
            description: The URL of the new reservation.
        body:
          type: Reservation
  /{reservationId}:
    get:
      responses:
        200:
          body:
            type: Reservation
        404:
          description: No reservation has this id.
    delete:
      responses:
        204:
          description: The reservation is cancelled and the locker is free again.
`,
  keyPoints: [
    'An example that does not fit its type breaks the mocking service, so the mobile team sees errors before any code exists.',
    'Fix the example when the type is right. Widening an enum or loosening a type to silence an error changes the contract.',
    'YAML reads 048213 as a number. Quotes keep it a string with its leading zero.',
    'Create returns 201 with a Location header. Delete returns 204 with no body.',
    'A property ending in ? is optional. Without the ? it is required.',
  ],
  solution: `
There are six fixes.
- \`notes\` on \`NewReservation\` needs a \`?\`. Without it every caller must send a note.
- \`lockerId?\` on \`Reservation\` loses the \`?\`. Every reservation belongs to a locker.
- The example size \`XL\` becomes one of \`S\`, \`M\`, \`L\`. Adding \`XL\` to the enum would invent a locker that does not exist.
- The example \`pickupCode\` gets quotes. YAML turns \`048213\` into the number 48213, which is not a string and has lost its zero.
- \`POST\` returns 201 with a \`Location\` header, since it creates something.
- \`DELETE\` returns 204 with no body. The reservation is gone, so there is nothing to return.

The example errors appear one at a time. The parser stops at the first problem in an example, so fixing the size reveals the pickup code.
`,
  followUps: [
    {
      q: 'Why is pickupCode a string and not an integer?',
      a: 'A code such as 048213 starts with zero, and a number drops it. The code is never added or compared as a number, so it is an identifier. Identifiers are strings with a pattern.',
    },
    {
      q: 'The example used XL. Why not add XL to the enum?',
      a: 'The enum describes real lockers, and the business has only three sizes. Changing the contract to fit a wrong example spreads the mistake to every caller.',
    },
    {
      q: 'How would you stop a broken example reaching Exchange again?',
      a: 'Validate the RAML in the build pipeline before publishing. Run the API through the mocking service or a contract test as a release gate.',
    },
    {
      q: 'Why does DELETE return 204 and not 200 with the reservation?',
      a: 'The resource no longer exists, so a body adds nothing. A 204 tells the app the cancel worked with no payload to parse.',
    },
  ],
}
