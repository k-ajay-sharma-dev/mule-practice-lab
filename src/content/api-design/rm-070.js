export default {
  id: 'rm-070',
  category: 'api-design',
  title: 'Home Delivery Slots API: Finding a Slot and Booking It',
  level: 'INTERMEDIATE',
  tags: ['raml', 'api-design', 'uri-parameters', 'query-parameters', 'request-body', 'status-codes', 'examples', 'logistics'],
  estMinutes: 20,
  description: `
A home delivery firm moves furniture and white goods for 30 retailers. Each van has 2-hour slots, and each slot has a fixed number of drops. Retailer checkouts call this API to show slots for a postcode and then book one.

Two steps, two resources:
1. **Find**: \`GET /postcodes/{postcode}/delivery-slots?date=2026-12-03\` lists the slots for one area on one day. The slot list depends on the postcode, so the postcode is part of the path.
2. **Book**: \`POST /delivery-bookings\` books one slot. A booking is its own thing with its own id, and it is read and cancelled by that id later, so it sits at the top level and not under the postcode.

UK postcodes are written here in capitals with no space, such as \`LS14AP\`, \`M11AE\` or \`SW1A1AA\`. Slot ids look like \`SL-118204\`.

Slots fill up. Two shoppers can see the last drop in a slot, and the second one to book gets **409 Conflict**, with an \`Error\` body the checkout can show.

**Requirements**
- \`postcode\` is a string such as \`LS14AP\`: one or two letters, a digit, an optional letter or digit, then a digit and two letters.
- \`GET /postcodes/{postcode}/delivery-slots\` has a required query parameter \`date\` that is a calendar day with no time, and returns a list of \`DeliverySlot\` with an example on that response body.
- \`DeliverySlot\` has a required \`slotId\` such as \`SL-118204\`, required \`start\` and \`end\` dates and times with a time zone, a required number \`price\` of at least 0, and a required integer \`dropsLeft\` of at least 0.
- \`BookingRequest\` has a required \`slotId\` with the same pattern and a required string \`orderId\`.
- \`POST /delivery-bookings\` takes a \`BookingRequest\` and returns 201 with \`Location\` and a \`Booking\`, 400, and 409 with an \`Error\` when the slot is full.
- \`GET /delivery-bookings/{bookingId}\` returns a \`Booking\`, or 404.
- Bookings are not nested under the postcode.
`,
  starter: `#%RAML 1.0
title: Home Delivery Slots API
mediaType: application/json

types:
  DeliverySlot:
    type: object
    properties:
      slotId: string

/postcodes:
  /{postcode}:
    /delivery-slots:
      get:
`,
  ramlChecks: [
    {
      label: 'postcode is a string such as LS14AP, M11AE or SW1A1AA',
      rule: {
        type: 'param',
        path: '/postcodes/{}',
        in: 'uri',
        name: 'postcode',
        want: { type: 'string', pattern: { accepts: ['LS14AP', 'M11AE', 'SW1A1AA', 'EC2A4BX'], rejects: ['ls14ap', 'LS1 4AP', '12345', 'LS14A', 'LS14APX', 'ABC14AP'] } },
      },
    },
    { label: 'date is a required date-only query parameter', rule: { type: 'param', path: '/postcodes/{}/delivery-slots', method: 'get', in: 'query', name: 'date', want: { type: 'date-only', required: true } } },
    { label: 'GET delivery-slots returns DeliverySlot[] with an example on the response', rule: { type: 'response', path: '/postcodes/{}/delivery-slots', method: 'get', status: '200', typeIs: 'DeliverySlot[]', example: 'own' } },
    {
      label: 'DeliverySlot has datetime start and end, a price of at least 0 and an integer dropsLeft of at least 0',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'DeliverySlot', prop: 'start', want: { type: 'datetime', required: true } },
          { type: 'prop', typeName: 'DeliverySlot', prop: 'end', want: { type: 'datetime', required: true } },
          { type: 'prop', typeName: 'DeliverySlot', prop: 'price', want: { type: 'number', required: true, minimum: 0 } },
          { type: 'prop', typeName: 'DeliverySlot', prop: 'dropsLeft', want: { type: 'integer', required: true, minimum: 0 } },
        ],
      },
    },
    {
      label: 'slotId looks like SL-118204 on both DeliverySlot and BookingRequest',
      rule: {
        type: 'all',
        rules: ['DeliverySlot', 'BookingRequest'].map((typeName) => ({ type: 'prop', typeName, prop: 'slotId', want: { type: 'string', required: true, pattern: { accepts: ['SL-118204'], rejects: ['SL-11820', 'sl-118204', 'SL118204', 'SL-1182040'] } } })),
      },
    },
    { label: 'BookingRequest has a required string orderId', rule: { type: 'prop', typeName: 'BookingRequest', prop: 'orderId', want: { type: 'string', required: true } } },
    {
      label: 'POST /delivery-bookings takes a BookingRequest and returns 201 with Location and a Booking',
      rule: {
        type: 'all',
        rules: [
          { type: 'body', path: '/delivery-bookings', method: 'post', typeIs: 'BookingRequest' },
          { type: 'response', path: '/delivery-bookings', method: 'post', status: '201', typeIs: 'Booking', header: 'Location' },
        ],
      },
    },
    {
      label: 'POST /delivery-bookings returns 400, and 409 with an Error when the slot is full',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/delivery-bookings', method: 'post', status: '400' },
          { type: 'response', path: '/delivery-bookings', method: 'post', status: '409', typeIs: 'Error' },
        ],
      },
    },
    {
      label: 'GET /delivery-bookings/{bookingId} returns a Booking or 404',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/delivery-bookings/{}', method: 'get', status: '200', typeIs: 'Booking' },
          { type: 'response', path: '/delivery-bookings/{}', method: 'get', status: '404' },
        ],
      },
    },
    {
      label: 'Bookings are not nested under the postcode',
      rule: {
        type: 'all',
        rules: [
          { type: 'resource', path: '/delivery-bookings' },
          { type: 'noResource', path: '/postcodes/{}/delivery-bookings' },
          { type: 'noResource', path: '/postcodes/{}/delivery-slots/{}/bookings' },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Home Delivery Slots API
mediaType: application/json

types:
  SlotId:
    type: string
    pattern: ^SL-[0-9]{6}$
  DeliverySlot:
    type: object
    properties:
      slotId: SlotId
      start: datetime
      end: datetime
      price:
        type: number
        minimum: 0
      dropsLeft:
        type: integer
        minimum: 0
  BookingRequest:
    type: object
    properties:
      slotId: SlotId
      orderId: string
    example:
      slotId: SL-118204
      orderId: RET7-55102934
  Booking:
    type: object
    properties:
      bookingId: string
      slotId: SlotId
      orderId: string
      start: datetime
      end: datetime
  Error:
    type: object
    properties:
      code: string
      message: string
    example:
      code: SLOT_FULL
      message: Slot SL-118204 has no drops left. Please pick another slot.

/postcodes:
  /{postcode}:
    uriParameters:
      postcode:
        type: string
        pattern: ^[A-Z]{1,2}[0-9][A-Z0-9]?[0-9][A-Z]{2}$
    /delivery-slots:
      get:
        queryParameters:
          date:
            type: date-only
            example: 2026-12-03
        responses:
          200:
            body:
              type: DeliverySlot[]
              example:
                - slotId: SL-118204
                  start: 2026-12-03T08:00:00Z
                  end: 2026-12-03T10:00:00Z
                  price: 0
                  dropsLeft: 3
                - slotId: SL-118205
                  start: 2026-12-03T10:00:00Z
                  end: 2026-12-03T12:00:00Z
                  price: 9.95
                  dropsLeft: 0
          400:
            description: The postcode or the date is not valid.

/delivery-bookings:
  post:
    description: Book one delivery slot for an order.
    body:
      type: BookingRequest
    responses:
      201:
        headers:
          Location:
            type: string
        body:
          type: Booking
      400:
        description: The body does not fit BookingRequest.
      409:
        description: The slot has no drops left.
        body:
          type: Error
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
    'Put a value in the path when it picks which collection you see, such as the slots for one postcode.',
    'Give a resource its own top-level path when callers find it later by its own id, such as a booking.',
    'A required date-only query parameter keeps every slot search to one day.',
    'A slot list example with a full slot shows consumers that dropsLeft can be 0.',
    '409 covers the race where two shoppers book the last drop in the same slot.',
  ],
  solution: `
The postcode decides which slots exist, so it sits in the path of the search. Its pattern accepts the common UK shapes written without a space, and refuses lower case and stray characters before any route planning runs.

\`date\` is required and \`date-only\`. Without it, one call could ask for every slot for months, and the van planner would have to work them all out.

Bookings live at \`/delivery-bookings\`. A booking is found later by its id from the retailer's order screen, and the caller may not know the postcode then. The \`SlotId\` type is shared by the slot and the request, so a slot id copied from the search always fits the booking body.

The list example shows a free slot and a full one with \`dropsLeft: 0\`. The 409 with \`SLOT_FULL\` covers the case where the list was right a second ago and is wrong now.
`,
  followUps: [
    {
      q: 'Should the booking hold the slot for a few minutes during checkout instead?',
      a: 'That is a common pattern. A POST creates a hold with an expiry time, and the checkout confirms it later. It cuts 409s at the cost of slots that sit held and unused.',
    },
    {
      q: 'Why not show only free slots and hide the full ones?',
      a: 'Showing a full slot greyed out helps the shopper plan. Returning dropsLeft lets each checkout choose how to display it.',
    },
    {
      q: 'How would you let a shopper cancel a booking?',
      a: 'Add DELETE /delivery-bookings/{bookingId} returning 204, and 409 when the van has already left. The freed drop goes back to the slot.',
    },
    {
      q: 'Why does the postcode pattern refuse a space?',
      a: 'A space in a URL must be encoded, which callers often get wrong. The contract asks for the compact form, and the checkout removes the space before calling.',
    },
  ],
}
