export default {
  id: 'rm-114',
  category: 'api-design',
  title: 'Seat Map Experience API: Online Check-in for an Airline App',
  level: 'INTERMEDIATE',
  tags: ['raml', 'api-design', 'experience-api', 'api-led', 'uri-parameters', 'status-codes', 'airline'],
  estMinutes: 25,
  description: `
An airline checks in 9 million passengers a year through its mobile app. At check-in the app shows a seat map and lets the passenger pick a seat. On the busiest mornings the seat map is loaded 300 times a second, often over weak airport Wi-Fi.

You are writing the **Experience API** for that screen. It returns what the app draws and nothing more, and it lets a passenger choose a seat. A Process API behind it talks to the reservation and departure control systems.

A draft from another team is in the editor. Its \`Seat\` type shows the name of whoever sits in an occupied seat, which no passenger should ever see.

**Brief**
- A flight id joins the flight number and the date, such as \`BA117-20260314\`: two letters or digits for the airline, one to four digits, a hyphen and eight digits.
- A booking reference is six capital letters or digits, such as \`X7Q2LM\`.
- A seat number is a row of one or two digits and a letter from A to K, such as \`23C\`.
- A passenger chooses one seat. Choosing again replaces the first choice.

**Requirements**
- Title \`Seat Map Experience API\`, with JSON as the default media type.
- \`Cabin\` is one of \`ECONOMY\`, \`PREMIUM_ECONOMY\`, \`BUSINESS\`. \`SeatFeature\` is one of \`WINDOW\`, \`AISLE\`, \`EXIT_ROW\`, \`EXTRA_LEGROOM\`.
- \`Seat\` has a required \`seatNumber\` with the pattern above, a required \`cabin\` of type \`Cabin\`, a required \`status\` that is one of \`AVAILABLE\`, \`OCCUPIED\`, \`BLOCKED\`, and an optional \`features\` of type \`SeatFeature[]\`. It has no \`occupantName\`.
- \`SeatMap\` has a required string \`flightId\` and a required \`seats\` of type \`Seat[]\`. It has an example.
- \`GET /flights/{flightId}/seat-map\` returns a \`SeatMap\` with status 200 and a \`Cache-Control\` header, or an \`Error\` with status 404. It has an optional \`cabin\` query parameter of type \`Cabin\`. \`flightId\` has a pattern for the format above.
- \`PUT /bookings/{bookingRef}/passengers/{passengerId}/seat\` takes a \`SeatSelection\` and returns a \`SeatAssignment\` with status 200. \`bookingRef\` has a pattern. There is no \`POST\` on that resource, since a passenger has one seat.
- The PUT returns an \`Error\` with 409 when someone else took the seat first, and with 422 when the seat is not allowed for this passenger, such as an exit row for someone travelling with an infant.
`,
  starter: `#%RAML 1.0
title: Seat Map Experience API

types:
  Seat:
    type: object
    properties:
      seatNumber: string
      status: string
      occupantName?: string

/flights:
`,
  ramlChecks: [
    {
      label: 'The title is Seat Map Experience API and JSON is the default',
      rule: { type: 'all', rules: [{ type: 'root', key: 'title', want: 'Seat Map Experience API' }, { type: 'root', key: 'mediaType', want: 'application/json' }] },
    },
    {
      label: 'Cabin and SeatFeature allow exactly the listed values',
      rule: {
        type: 'all',
        rules: [
          { type: 'typeDecl', name: 'Cabin', want: { enum: { exactly: ['ECONOMY', 'PREMIUM_ECONOMY', 'BUSINESS'] } } },
          { type: 'typeDecl', name: 'SeatFeature', want: { enum: { exactly: ['WINDOW', 'AISLE', 'EXIT_ROW', 'EXTRA_LEGROOM'] } } },
        ],
      },
    },
    {
      label: 'seatNumber is a row of one or two digits and a letter from A to K',
      rule: { type: 'prop', typeName: 'Seat', prop: 'seatNumber', want: { type: 'string', required: true, pattern: { accepts: ['23C', '1A', '45K'], rejects: ['123C', '23L', '23c', 'C23', '23'] } } },
    },
    {
      label: 'Seat has cabin, status and optional features',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Seat', prop: 'cabin', want: { type: 'Cabin', required: true } },
          { type: 'prop', typeName: 'Seat', prop: 'status', want: { required: true, enum: { exactly: ['AVAILABLE', 'OCCUPIED', 'BLOCKED'] } } },
          { type: 'prop', typeName: 'Seat', prop: 'features', want: { type: 'SeatFeature[]', required: false } },
        ],
      },
    },
    { label: 'Seat never shows who sits there', rule: { type: 'all', rules: [{ type: 'typeDecl', name: 'Seat' }, { type: 'noProp', typeName: 'Seat', prop: 'occupantName' }] } },
    {
      label: 'SeatMap has flightId, seats as Seat[] and an example',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'SeatMap', prop: 'flightId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'SeatMap', prop: 'seats', want: { type: 'Seat[]', required: true } },
          { type: 'any', rules: [{ type: 'typeDecl', name: 'SeatMap', want: { example: { set: true } } }, { type: 'typeDecl', name: 'SeatMap', want: { examples: { set: true } } }] },
        ],
      },
    },
    {
      label: 'flightId in the path has the flight and date pattern',
      rule: { type: 'param', path: '/flights/{}/seat-map', in: 'uri', name: 'flightId', want: { pattern: { accepts: ['BA117-20260314', 'U21234-20261201', 'LH4-20260101'], rejects: ['BA117', 'BA11734-20260314', 'ba117-20260314', 'BA117-2026031'] } } },
    },
    {
      label: 'GET seat-map returns a SeatMap with Cache-Control, or an Error with 404',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/flights/{}/seat-map', method: 'get', status: '200', typeIs: 'SeatMap', header: 'Cache-Control' },
          { type: 'response', path: '/flights/{}/seat-map', method: 'get', status: '404', typeIs: 'Error' },
        ],
      },
    },
    { label: 'GET seat-map has an optional cabin filter of type Cabin', rule: { type: 'param', path: '/flights/{}/seat-map', method: 'get', in: 'query', name: 'cabin', want: { type: 'Cabin', required: false } } },
    {
      label: 'PUT seat takes a SeatSelection and returns a SeatAssignment, with no POST',
      rule: {
        type: 'all',
        rules: [
          { type: 'body', path: '/bookings/{}/passengers/{}/seat', method: 'put', typeIs: 'SeatSelection' },
          { type: 'response', path: '/bookings/{}/passengers/{}/seat', method: 'put', status: '200', typeIs: 'SeatAssignment' },
          { type: 'noMethod', path: '/bookings/{}/passengers/{}/seat', method: 'post' },
        ],
      },
    },
    { label: 'bookingRef has a six character pattern', rule: { type: 'param', path: '/bookings/{}/passengers/{}/seat', in: 'uri', name: 'bookingRef', want: { pattern: { accepts: ['X7Q2LM', 'ABC123'], rejects: ['X7Q2L', 'X7Q2LMM', 'x7q2lm'] } } } },
    {
      label: 'PUT seat returns an Error with 409 for a taken seat and 422 for a seat not allowed',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/bookings/{}/passengers/{}/seat', method: 'put', status: '409', typeIs: 'Error' },
          { type: 'response', path: '/bookings/{}/passengers/{}/seat', method: 'put', status: '422', typeIs: 'Error' },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Seat Map Experience API
version: v1
baseUri: https://api.example.com/check-in/{version}
mediaType: application/json

types:
  Cabin:
    type: string
    enum: [ ECONOMY, PREMIUM_ECONOMY, BUSINESS ]
  SeatFeature:
    type: string
    enum: [ WINDOW, AISLE, EXIT_ROW, EXTRA_LEGROOM ]
  SeatNumber:
    type: string
    pattern: ^[0-9]{1,2}[A-K]$
  Seat:
    type: object
    properties:
      seatNumber: SeatNumber
      cabin: Cabin
      status:
        type: string
        enum: [ AVAILABLE, OCCUPIED, BLOCKED ]
      features?: SeatFeature[]
      price?:
        type: number
        minimum: 0
  SeatMap:
    type: object
    properties:
      flightId: string
      aircraftType: string
      seats: Seat[]
    example:
      flightId: BA117-20260314
      aircraftType: A320
      seats:
        - seatNumber: 1A
          cabin: BUSINESS
          status: OCCUPIED
          features: [ WINDOW ]
        - seatNumber: 12C
          cabin: ECONOMY
          status: AVAILABLE
          features: [ AISLE, EXIT_ROW, EXTRA_LEGROOM ]
          price: 35
  SeatSelection:
    type: object
    properties:
      seatNumber: SeatNumber
  SeatAssignment:
    type: object
    properties:
      passengerId: string
      seatNumber: SeatNumber
      price?: number
  Error:
    type: object
    properties:
      code: string
      message: string

/flights/{flightId}/seat-map:
  uriParameters:
    flightId:
      type: string
      pattern: ^[A-Z0-9]{2}[0-9]{1,4}-[0-9]{8}$
  get:
    queryParameters:
      cabin?: Cabin
    responses:
      200:
        headers:
          Cache-Control:
            type: string
            example: max-age=15
        body:
          type: SeatMap
      404:
        body:
          type: Error

/bookings/{bookingRef}/passengers/{passengerId}/seat:
  uriParameters:
    bookingRef:
      type: string
      pattern: ^[A-Z0-9]{6}$
  put:
    body:
      type: SeatSelection
    responses:
      200:
        body:
          type: SeatAssignment
      409:
        description: Another passenger took this seat first.
        body:
          type: Error
      422:
        description: This seat is not allowed for this passenger.
        body:
          type: Error
`,
  keyPoints: [
    'An Experience API returns what one screen draws. Other passengers\' names have no place on a seat map.',
    'A short Cache-Control max-age lets the CDN and the app absorb 300 calls a second for the same flight.',
    'PUT fits a choice that replaces the earlier one. Calling it twice with the same seat gives the same result.',
    'A named SeatNumber type keeps the same pattern on Seat, SeatSelection and SeatAssignment.',
    '409 means the seat was taken in the meantime. 422 means this passenger may never have it.',
  ],
  solution: `
The seat map is read far more than it is written, so the GET is built to be cached. \`Cache-Control: max-age=15\` lets a CDN and the app reuse one answer for a few seconds. A seat taken in that window is caught by the 409 on the PUT, so short staleness is safe.

The seat choice is \`PUT /bookings/{bookingRef}/passengers/{passengerId}/seat\`. Each passenger has exactly one seat, so the seat is a single sub-resource and PUT replaces it. A retry after a timeout does no harm. There is no POST, because that would suggest a passenger can collect several seats.

The two errors drive different screens in the app. A 409 refreshes the map and asks the passenger to pick again. A 422 explains the rule, for example that an exit row needs a passenger who can help in an evacuation.

\`occupantName\` is gone. A seat map only needs to know a seat is \`OCCUPIED\`.
`,
  followUps: [
    {
      q: 'Why does the Experience API not call the departure control system directly?',
      a: 'The kiosk, the website and the app all need seat logic. A Process API holds it once, and each Experience API shapes the result for its own screen.',
    },
    {
      q: 'What would you return for a flight that has closed for check-in?',
      a: 'A 409 or 422 with a clear code such as CHECKIN_CLOSED on the PUT. The GET can still return the map with every seat BLOCKED, so the app shows why nothing can be chosen.',
    },
    {
      q: 'How would you charge for paid seats?',
      a: 'The map shows the price on each seat. The PUT returns the price in the assignment, and the app sends the passenger to payment before the seat is confirmed.',
    },
  ],
}
