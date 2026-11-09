export default {
  id: 'rm-078',
  category: 'api-design',
  title: 'Venue Bookings API: A Request Type and a Response Type That Extends It',
  level: 'INTERMEDIATE',
  tags: ['raml', 'api-design', 'data-types', 'inheritance', 'request-body', 'hospitality'],
  estMinutes: 20,
  description: `
An events platform lists 900 venues. An organiser sends the venue, the date, the number of guests and a contact email. The platform adds a booking id, a status and the time it was created.

The first version used one \`Booking\` type for both the request and the response. Callers started sending their own \`bookingId\` and \`status: CONFIRMED\`, and one venue was double booked before anyone noticed.

The fix is two types. \`BookingRequest\` holds only what a caller may send. \`Booking\` **extends** it with \`type: BookingRequest\` and adds the fields the server owns. The shared fields are written once.

**Requirements**
- Title \`Venue Bookings API\`, with JSON as the default media type.
- \`BookingRequest\` with a required string \`venueId\`, a required date-only \`eventDate\`, a required integer \`guests\` from 1 to 2000 and a required string \`contactEmail\`. It has no \`bookingId\` and no \`status\`.
- \`Booking\` extends \`BookingRequest\` and adds a required string \`bookingId\`, a required string \`status\` that only allows \`PROVISIONAL\`, \`CONFIRMED\` and \`CANCELLED\`, and a required datetime \`createdAt\`. Give it an example.
- \`POST /bookings\` takes a \`BookingRequest\` and returns a \`Booking\` with status 201 and a \`Location\` header.
- \`GET /bookings\` returns \`Booking[]\`.
- \`GET /bookings/{bookingId}\` returns a \`Booking\`, or 404.
`,
  starter: `#%RAML 1.0
title: Venue Bookings API
mediaType: application/json

types:
  Booking:
    type: object
    properties:
      bookingId: string
      venueId: string
      eventDate: date-only
      guests: integer
      contactEmail: string
      status: string

/bookings:
  get:
  post:
    body:
      type: Booking
`,
  ramlChecks: [
    {
      label: 'BookingRequest has a required venueId, date-only eventDate and contactEmail',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'BookingRequest', prop: 'venueId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'BookingRequest', prop: 'eventDate', want: { type: 'date-only', required: true } },
          { type: 'prop', typeName: 'BookingRequest', prop: 'contactEmail', want: { type: 'string', required: true } },
        ],
      },
    },
    { label: 'BookingRequest.guests is a required integer from 1 to 2000', rule: { type: 'prop', typeName: 'BookingRequest', prop: 'guests', want: { type: 'integer', required: true, minimum: 1, maximum: 2000 } } },
    {
      label: 'BookingRequest has no bookingId and no status',
      rule: {
        type: 'all',
        rules: [
          { type: 'typeDecl', name: 'BookingRequest' },
          { type: 'noProp', typeName: 'BookingRequest', prop: 'bookingId' },
          { type: 'noProp', typeName: 'BookingRequest', prop: 'status' },
        ],
      },
    },
    { label: 'Booking extends BookingRequest', rule: { type: 'typeDecl', name: 'Booking', extends: 'BookingRequest' } },
    {
      label: 'Booking adds a required bookingId and datetime createdAt',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Booking', prop: 'bookingId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Booking', prop: 'createdAt', want: { type: 'datetime', required: true } },
        ],
      },
    },
    { label: 'Booking.status only allows PROVISIONAL, CONFIRMED and CANCELLED', rule: { type: 'prop', typeName: 'Booking', prop: 'status', want: { required: true, enum: { exactly: ['PROVISIONAL', 'CONFIRMED', 'CANCELLED'] } } } },
    {
      label: 'Booking has an example',
      rule: {
        type: 'any',
        rules: [
          { type: 'typeDecl', name: 'Booking', want: { example: { set: true } } },
          { type: 'typeDecl', name: 'Booking', want: { examples: { set: true } } },
        ],
      },
    },
    { label: 'POST /bookings takes a BookingRequest', rule: { type: 'body', path: '/bookings', method: 'post', typeIs: 'BookingRequest' } },
    { label: 'POST /bookings returns a Booking with 201 and a Location header', rule: { type: 'response', path: '/bookings', method: 'post', status: '201', typeIs: 'Booking', header: 'Location' } },
    {
      label: 'GET /bookings returns Booking[], and GET /bookings/{bookingId} returns a Booking or 404',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/bookings', method: 'get', status: '200', typeIs: 'Booking[]' },
          { type: 'response', path: '/bookings/{}', method: 'get', status: '200', typeIs: 'Booking' },
          { type: 'response', path: '/bookings/{}', method: 'get', status: '404' },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Venue Bookings API
mediaType: application/json

types:
  BookingRequest:
    type: object
    properties:
      venueId: string
      eventDate: date-only
      guests:
        type: integer
        minimum: 1
        maximum: 2000
      contactEmail: string
  Booking:
    type: BookingRequest
    properties:
      bookingId: string
      status:
        type: string
        enum: [ PROVISIONAL, CONFIRMED, CANCELLED ]
      createdAt: datetime
    example:
      bookingId: BK-20417
      venueId: V-0088
      eventDate: 2026-06-12
      guests: 180
      contactEmail: events@example.com
      status: PROVISIONAL
      createdAt: 2026-02-03T09:15:00Z

/bookings:
  get:
    responses:
      200:
        body:
          type: Booking[]
  post:
    body:
      type: BookingRequest
    responses:
      201:
        headers:
          Location:
            type: string
            description: The URL of the new booking.
        body:
          type: Booking
  /{bookingId}:
    get:
      responses:
        200:
          body:
            type: Booking
        404:
          description: No booking has this id.
`,
  keyPoints: [
    'type: BookingRequest makes Booking a subtype that inherits every property.',
    'The request type holds only what a caller may send. The server-owned fields live in the subtype.',
    'Declaring Booking as the POST body would invite callers to send the server fields again.',
    'The example of a subtype must include the inherited required properties too.',
  ],
  solution: `
\`BookingRequest\` is the contract for what callers send. It has no \`bookingId\` and no \`status\`, so the contract shows callers that those fields are not theirs to set. The flow builds them itself, and a client can no longer confirm a venue.

\`Booking\` inherits the four request fields and adds the three the server owns. When the guest limit changes, it changes in one place and both types follow.

The example on \`Booking\` lists all seven fields. An inherited required field is still required, so leaving out \`venueId\` would make the example invalid.

To make the request strict, you could add \`additionalProperties: false\` to \`BookingRequest\`, so a stray \`status\` is rejected instead of ignored.
`,
  followUps: [
    {
      q: 'Why not mark bookingId and status as optional on one shared type?',
      a: 'Then the contract allows a caller to send them, and the response says they might be missing. Two types state the truth on both sides.',
    },
    {
      q: 'What would a PATCH body look like here?',
      a: 'A third type where every field a caller may change is optional, such as guests and contactEmail. venueId and eventDate may need a new booking instead of a patch.',
    },
    {
      q: 'Does inheritance in RAML change the JSON on the wire?',
      a: 'No. A Booking is a flat JSON object with all seven fields. Inheritance only changes how the contract is written and validated.',
    },
  ],
}
