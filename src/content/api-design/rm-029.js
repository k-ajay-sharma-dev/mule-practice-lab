export default {
  id: 'rm-029',
  category: 'api-design',
  title: 'Hotel Reservations API: Evolve v1 to v2 Without Breaking Callers',
  level: 'EXPERT',
  tags: ['raml', 'api-design', 'versioning', 'backward-compatibility', 'annotations', 'hospitality'],
  estMinutes: 40,
  description: `
A hotel group's reservations API has 40 consumers, and some of them cannot release a change for months. The product team wants loyalty numbers, room preferences and booking extras. The v1 contract is in the editor.

A change is **backward compatible** when a caller built for the old contract keeps working with no change. Adding something optional is safe. Removing, renaming, or tightening something is a **breaking change**. Making a new request field required is breaking too, because old callers do not send it.

So this release is **additive**: it adds and never takes away.

**Requirements**
- The \`version\` becomes \`v2\`. Keep the title and the media type.
- Everything in v1 stays as it was:
  - \`Reservation\` keeps required strings \`reservationId\` and \`guestName\`, and required \`checkIn\` and \`checkOut\` of type \`date-only\`.
  - \`status\` still allows \`CONFIRMED\` and \`CANCELLED\`.
  - \`phone\` stays a required string.
  - \`GET /reservations\`, \`POST /reservations\` and \`GET /reservations/{reservationId}\` keep their statuses. The query parameter \`hotelCode\` stays optional.
- \`Reservation\` gains an optional string \`loyaltyNumber\`, and an optional \`roomPreferences\` of \`string[]\`.
- \`GET /reservations\` gains an optional string query parameter \`loyaltyNumber\`.
- A new resource \`GET /reservations/{reservationId}/extras\` returns 200, or 404.
- \`phone\` is being replaced in a later release. Do not remove it. Declare an annotation type \`deprecatedSince\` (a string) and mark \`phone\` with \`(deprecatedSince): v2\`.
`,
  starter: `#%RAML 1.0
title: Hotel Reservations API
version: v1
mediaType: application/json

types:
  Reservation:
    type: object
    properties:
      reservationId: string
      guestName: string
      checkIn: date-only
      checkOut: date-only
      phone: string
      status:
        type: string
        enum: [ CONFIRMED, CANCELLED ]

/reservations:
  get:
    queryParameters:
      hotelCode?: string
    responses:
      200:
        body:
          type: Reservation[]
  post:
    body:
      type: Reservation
    responses:
      201:
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
`,
  ramlChecks: [
    {
      label: 'The title is Hotel Reservations API and JSON is the default media type',
      rule: {
        type: 'all',
        rules: [
          { type: 'root', key: 'title', want: 'Hotel Reservations API' },
          { type: 'root', key: 'mediaType', want: 'application/json' },
        ],
      },
    },
    { label: 'The version is v2', rule: { type: 'root', key: 'version', want: 'v2' } },
    {
      label: 'Every v1 property of Reservation is still there, still required',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Reservation', prop: 'reservationId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Reservation', prop: 'guestName', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Reservation', prop: 'checkIn', want: { type: 'date-only', required: true } },
          { type: 'prop', typeName: 'Reservation', prop: 'checkOut', want: { type: 'date-only', required: true } },
          { type: 'prop', typeName: 'Reservation', prop: 'phone', want: { type: 'string', required: true } },
        ],
      },
    },
    { label: 'status still allows CONFIRMED and CANCELLED', rule: { type: 'prop', typeName: 'Reservation', prop: 'status', want: { enum: ['CONFIRMED', 'CANCELLED'] } } },
    {
      label: 'The v1 methods still return what they did',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/reservations', method: 'get', status: '200', typeIs: 'Reservation[]' },
          { type: 'body', path: '/reservations', method: 'post', typeIs: 'Reservation' },
          { type: 'response', path: '/reservations', method: 'post', status: '201', typeIs: 'Reservation' },
          { type: 'response', path: '/reservations/{}', method: 'get', status: '200', typeIs: 'Reservation' },
          { type: 'response', path: '/reservations/{}', method: 'get', status: '404' },
        ],
      },
    },
    { label: 'hotelCode is still optional', rule: { type: 'param', path: '/reservations', method: 'get', in: 'query', name: 'hotelCode', want: { type: 'string', required: false } } },
    { label: 'loyaltyNumber is an optional string on Reservation', rule: { type: 'prop', typeName: 'Reservation', prop: 'loyaltyNumber', want: { type: 'string', required: false } } },
    { label: 'roomPreferences is an optional string[] on Reservation', rule: { type: 'prop', typeName: 'Reservation', prop: 'roomPreferences', want: { type: 'string[]', required: false } } },
    {
      label: 'GET /reservations has a new optional loyaltyNumber filter',
      rule: { type: 'param', path: '/reservations', method: 'get', in: 'query', name: 'loyaltyNumber', want: { type: 'string', required: false } },
    },
    {
      label: 'GET /reservations/{reservationId}/extras returns 200, or 404',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/reservations/{}/extras', method: 'get', status: '200' },
          { type: 'response', path: '/reservations/{}/extras', method: 'get', status: '404' },
        ],
      },
    },
    {
      label: 'phone is marked deprecated since v2, with a declared annotation type',
      rule: {
        type: 'all',
        rules: [
          { type: 'root', key: 'annotationTypes' },
          { type: 'prop', typeName: 'Reservation', prop: 'phone', want: { '(deprecatedSince)': 'v2' } },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Hotel Reservations API
version: v2
mediaType: application/json

annotationTypes:
  deprecatedSince:
    type: string

types:
  Reservation:
    type: object
    properties:
      reservationId: string
      guestName: string
      checkIn: date-only
      checkOut: date-only
      phone:
        type: string
        (deprecatedSince): v2
      status:
        type: string
        enum: [ CONFIRMED, CANCELLED ]
      loyaltyNumber?: string
      roomPreferences?: string[]

/reservations:
  get:
    queryParameters:
      hotelCode?: string
      loyaltyNumber?: string
    responses:
      200:
        body:
          type: Reservation[]
  post:
    body:
      type: Reservation
    responses:
      201:
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
    /extras:
      get:
        responses:
          200:
            description: The extras on this reservation.
          404:
            description: No reservation has this id.
`,
  keyPoints: [
    'Additive means new things are optional and old things stay as they are.',
    'A new required request field breaks old callers, because they do not send it.',
    'Renaming is a removal plus an addition, so it is a breaking change.',
    'Deprecate first, remove later. An annotation lets tools find what is on its way out.',
    'Callers should ignore response fields they do not know. Say so in the documentation.',
  ],
  solution: `
Nothing from v1 was touched. Every change is a new optional property, a new optional parameter, or a new path. A caller built for v1 sends the same request and gets a response it can still read.

\`Reservation\` serves as both request and response here, which is why the new fields must be optional. If \`loyaltyNumber\` were required, every old \`POST\` would fail validation.

\`phone\` shows the slow way to retire something. It stays required so nothing breaks, and \`(deprecatedSince)\` warns consumers that it will go. Removal happens in a later release, after they have moved.
`,
  followUps: [
    {
      q: 'If nothing breaks, does this need to be called v2 at all?',
      a: 'Many teams would not. With semantic versioning, an additive change is a minor version such as 1.1, and the major number changes only for a breaking change. A new major version should be a warning to callers.',
    },
    {
      q: 'Is adding a value to a response enum safe?',
      a: 'Not always. A caller with a strict switch on status may fail on a value it has never seen. Treat a new enum value in a response as risky, and tell consumers before it ships.',
    },
    {
      q: 'What would you do if a breaking change were truly needed?',
      a: 'Publish a new major version alongside the old one, with a new base path. Run both for an agreed period, track who still calls the old one, and retire it on a stated date.',
    },
  ],
}
