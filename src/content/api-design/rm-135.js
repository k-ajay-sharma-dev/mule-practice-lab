export default {
  id: 'rm-135',
  category: 'api-design',
  title: 'Theatre Seat Holds API: Hold Seats, Let Holds Expire, Confirm with 410 Gone',
  level: 'EXPERT',
  tags: ['raml', 'api-design', 'reservations', 'expiry', 'status-codes', 'idempotency', 'libraries', 'traits', 'theatre'],
  estMinutes: 40,
  description: `
Larkspur Theatre sells 1,100 seats a night through its website and two ticket agents. Today a seat is only taken when payment succeeds. On busy nights two buyers pick the same seat, both pay, and one gets a refund and an apology.

The new contract adds **holds**. A buyer picks seats, and the API holds them for 10 minutes while the buyer pays. Nobody else can take a held seat. When the time runs out, the hold **expires** and the seats go back on sale. The buyer can also release a hold early.

Confirming a hold turns it into a booking. Confirming an expired hold must fail with \`410 Gone\`, which says the hold existed but is gone for good. That is different from \`404\`, which says the id was never known.

Creating a hold and confirming one both change state and may be retried on a bad network, so both need an \`Idempotency-Key\` header. The theatre keeps that rule and its error type in a shared library.

This problem has two files. Use the tabs above the editor to move between them.

**Requirements for \`libraries/common.raml\`**
- A type \`Problem\` with a required string \`title\`, a required integer \`status\` from 400 to 599, and an optional string \`detail\`.
- A trait \`idempotent\` with a required string header \`Idempotency-Key\` of 16 to 64 characters.

**Requirements for \`api.raml\`**
- Title \`Theatre Seat Holds API\`, with JSON as the default media type.
- Bring in the library with the prefix \`common\`. \`Problem\` lives only in the library.
- A type \`SeatId\`: a string of one capital letter and one or two digits, such as \`F12\`.
- A type \`HoldRequest\` with a required \`performanceId\` (\`PERF-\` and five digits) and a required \`seats\` list of \`SeatId\` with 1 to 8 items and no repeats.
- A type \`Hold\` that inherits from \`HoldRequest\` and adds a required string \`holdId\`, a required \`status\` that is one of \`HELD\`, \`CONFIRMED\`, \`EXPIRED\`, \`RELEASED\`, and a required \`expiresAt\` date and time with an offset.
- A type \`Booking\` with required strings \`bookingId\` and \`holdId\` and a required integer \`totalPence\` of at least 0.
- \`POST /holds\` uses \`common.idempotent\`, takes a \`HoldRequest\`, and returns a \`Hold\` with 201 and a \`Location\` header, or a \`common.Problem\` with 409 when a seat is taken.
- \`GET /holds/{holdId}\` returns a \`Hold\` with 200 and a \`common.Problem\` with 404.
- \`DELETE /holds/{holdId}\` releases the hold and returns 204 with no body.
- \`POST /holds/{holdId}/confirm\` uses \`common.idempotent\` and returns a \`Booking\` with 201, a \`common.Problem\` with 404, and a \`common.Problem\` with 410 when the hold has expired.
`,
  starter: `#%RAML 1.0
title: Theatre Seat Holds API
mediaType: application/json

uses:

types:
  Booking:
    type: object
    properties:
      bookingId: string
      seats: string[]

/bookings:
  post:
    body:
      type: Booking
    responses:
      201:
        body:
          type: Booking
`,
  files: {
    'libraries/common.raml': `#%RAML 1.0 Library
usage: Shared error type and traits for every Larkspur API.

types:

traits:
`,
  },
  ramlChecks: [
    {
      label: 'The title is Theatre Seat Holds API and JSON is the default',
      rule: { type: 'all', rules: [{ type: 'root', key: 'title', want: 'Theatre Seat Holds API' }, { type: 'root', key: 'mediaType', want: 'application/json' }] },
    },
    {
      label: 'The API brings in libraries/common.raml as common, and Problem lives only there',
      rule: {
        type: 'all',
        rules: [
          { type: 'library', prefix: 'common', file: 'libraries/common.raml' },
          { type: 'prop', typeName: 'common.Problem', prop: 'title', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'common.Problem', prop: 'status', want: { type: 'integer', required: true, minimum: 400, maximum: 599 } },
          { type: 'prop', typeName: 'common.Problem', prop: 'detail', want: { type: 'string', required: false } },
          { type: 'noType', name: 'Problem' },
        ],
      },
    },
    {
      label: 'The library trait idempotent holds Idempotency-Key',
      rule: { type: 'trait', name: 'common.idempotent', has: 'headers.Idempotency-Key' },
    },
    {
      label: 'SeatId is one capital letter and one or two digits',
      rule: { type: 'typeDecl', name: 'SeatId', want: { pattern: { accepts: ['F12', 'A1', 'Z99'], rejects: ['f12', 'F123', 'FF12', 'F', '12'] } } },
    },
    {
      label: 'HoldRequest has performanceId as PERF- and five digits, and 1 to 8 unique SeatId values',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'HoldRequest', prop: 'performanceId', want: { required: true, pattern: { accepts: ['PERF-20931', 'PERF-00001'], rejects: ['PERF-2093', 'perf-20931', 'PERF-209310', 'PERF20931', 'XPERF-20931'] } } },
          { type: 'prop', typeName: 'HoldRequest', prop: 'seats', want: { type: 'SeatId[]', required: true, minItems: 1, maxItems: 8, uniqueItems: true } },
        ],
      },
    },
    {
      label: 'Hold inherits HoldRequest and adds holdId, status and an expiresAt datetime',
      rule: {
        type: 'all',
        rules: [
          { type: 'typeDecl', name: 'Hold', extends: 'HoldRequest' },
          { type: 'prop', typeName: 'Hold', prop: 'holdId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Hold', prop: 'status', want: { required: true, enum: { exactly: ['HELD', 'CONFIRMED', 'EXPIRED', 'RELEASED'] } } },
          { type: 'prop', typeName: 'Hold', prop: 'expiresAt', want: { type: 'datetime', required: true } },
        ],
      },
    },
    {
      label: 'Booking has bookingId, holdId and totalPence of at least 0',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Booking', prop: 'bookingId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Booking', prop: 'holdId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Booking', prop: 'totalPence', want: { type: 'integer', required: true, minimum: 0 } },
        ],
      },
    },
    {
      label: 'POST /holds uses common.idempotent, with an Idempotency-Key of 16 to 64 characters',
      rule: {
        type: 'all',
        rules: [
          { type: 'applied', path: '/holds', method: 'post', trait: 'common.idempotent' },
          { type: 'param', path: '/holds', method: 'post', in: 'header', name: 'Idempotency-Key', want: { type: 'string', required: true, minLength: 16, maxLength: 64 } },
        ],
      },
    },
    {
      label: 'POST /holds takes a HoldRequest and returns a Hold with 201 and Location, or common.Problem with 409',
      rule: {
        type: 'all',
        rules: [
          { type: 'body', path: '/holds', method: 'post', typeIs: 'HoldRequest' },
          { type: 'response', path: '/holds', method: 'post', status: '201', typeIs: 'Hold', header: 'Location' },
          { type: 'response', path: '/holds', method: 'post', status: '409', typeIs: 'common.Problem' },
        ],
      },
    },
    {
      label: 'GET /holds/{holdId} returns a Hold or common.Problem with 404, and DELETE returns 204 with no body',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/holds/{}', method: 'get', status: '200', typeIs: 'Hold' },
          { type: 'response', path: '/holds/{}', method: 'get', status: '404', typeIs: 'common.Problem' },
          { type: 'response', path: '/holds/{}', method: 'delete', status: '204', noBody: true },
        ],
      },
    },
    {
      label: 'POST /holds/{holdId}/confirm uses common.idempotent and returns a Booking with 201',
      rule: {
        type: 'all',
        rules: [
          { type: 'applied', path: '/holds/{}/confirm', method: 'post', trait: 'common.idempotent' },
          { type: 'response', path: '/holds/{}/confirm', method: 'post', status: '201', typeIs: 'Booking' },
        ],
      },
    },
    {
      label: 'Confirm returns common.Problem with 404 for an unknown hold and 410 for an expired one',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/holds/{}/confirm', method: 'post', status: '404', typeIs: 'common.Problem' },
          { type: 'response', path: '/holds/{}/confirm', method: 'post', status: '410', typeIs: 'common.Problem' },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Theatre Seat Holds API
version: v1
baseUri: https://api.example.com/seats/{version}
mediaType: application/json

uses:
  common: libraries/common.raml

types:
  SeatId:
    type: string
    pattern: ^[A-Z][0-9]{1,2}$
    description: Row letter and seat number.
  HoldRequest:
    type: object
    properties:
      performanceId:
        type: string
        pattern: ^PERF-[0-9]{5}$
      seats:
        type: SeatId[]
        minItems: 1
        maxItems: 8
        uniqueItems: true
  Hold:
    type: HoldRequest
    properties:
      holdId: string
      status:
        type: string
        enum: [ HELD, CONFIRMED, EXPIRED, RELEASED ]
      expiresAt:
        type: datetime
        description: When the seats go back on sale if the hold is not confirmed.
    example:
      holdId: HLD-7Q2M9
      performanceId: PERF-20931
      seats: [ F11, F12 ]
      status: HELD
      expiresAt: 2026-11-21T19:10:00Z
  Booking:
    type: object
    properties:
      bookingId: string
      holdId: string
      totalPence:
        type: integer
        minimum: 0

/holds:
  post:
    is: [ common.idempotent ]
    body:
      type: HoldRequest
    responses:
      201:
        description: The seats are held until expiresAt.
        headers:
          Location:
            type: string
            example: /holds/HLD-7Q2M9
        body:
          type: Hold
      409:
        description: At least one seat is already held or sold. detail names the seats.
        body:
          type: common.Problem
  /{holdId}:
    get:
      responses:
        200:
          body:
            type: Hold
        404:
          body:
            type: common.Problem
    delete:
      description: Releases the seats now. Releasing a hold that has already ended changes nothing.
      responses:
        204:
          description: The seats are back on sale.
    /confirm:
      post:
        is: [ common.idempotent ]
        responses:
          201:
            body:
              type: Booking
          404:
            description: No hold has this id.
            body:
              type: common.Problem
          410:
            description: The hold expired or was released. Start again with a new hold.
            body:
              type: common.Problem
`,
  referenceFiles: {
    'libraries/common.raml': `#%RAML 1.0 Library
usage: Shared error type and traits for every Larkspur API.

types:
  Problem:
    type: object
    properties:
      title: string
      status:
        type: integer
        minimum: 400
        maximum: 599
      detail?: string

traits:
  idempotent:
    usage: For methods that change state and may be retried.
    headers:
      Idempotency-Key:
        type: string
        minLength: 16
        maxLength: 64
        description: A new random value for each action. A retry with the same key returns the first result.
`,
  },
  keyPoints: [
    'A hold reserves something for a short time, so two buyers cannot pay for the same seat.',
    'expiresAt in the response tells the client how long it has.',
    '410 Gone says a resource existed but has ended for good. 404 says the id was never known.',
    '409 Conflict fits a hold request for a seat that is already taken.',
    'DELETE on a hold releases the seats early and returns 204.',
    'Creating and confirming both change state, so both take an Idempotency-Key.',
    'A shared library keeps the error type and the idempotency rule the same across APIs.',
  ],
  solution: `
**Why holds.** The double sales happened because seats were taken only after payment. A hold takes the seats **before** payment, for a short time. The second buyer gets 409 at once and picks other seats, instead of paying and being refunded.

**The life of a hold.**
| From | Event | To |
|---|---|---|
| (none) | \`POST /holds\` | HELD |
| HELD | \`POST /holds/{holdId}/confirm\` | CONFIRMED |
| HELD | 10 minutes pass | EXPIRED |
| HELD | \`DELETE /holds/{holdId}\` | RELEASED |

\`expiresAt\` is in every \`Hold\`, so the website can show a countdown that matches the server.

**410 or 404.** Confirming an expired hold is not the same as confirming one that never existed. 410 tells the website to start again with new seats. 404 points to a bug or a typed-in id. Both carry a \`common.Problem\`, so the client reads errors one way.

**Types.** \`SeatId\` holds the seat rule once and is used in the list. \`seats\` allows 1 to 8 unique seats, so a request for the same seat twice fails with 400, and nobody can hold a whole row. \`Hold\` inherits \`HoldRequest\`, so the request fields come back unchanged.

**Idempotency.** A buyer on a train taps "hold" and the reply is lost. The retry carries the same \`Idempotency-Key\`, so the server returns the first hold instead of holding more seats. The same applies to confirm, where a duplicate could mean two bookings. Keeping \`idempotent\` in the library gives every Larkspur API the same header rule.
`,
  followUps: [
    {
      q: 'Who expires the holds: a timer in the API, or the database?',
      a: 'Do not rely on a timer alone. Store expiresAt with the hold, and treat a hold as ended whenever now is past expiresAt, in every read and every confirm. A scheduled clean-up can then free the seats in bulk, but correctness never depends on it running on time.',
    },
    {
      q: 'Can the buyer extend a hold?',
      a: 'You could add a PATCH or an action such as POST /holds/{holdId}/extend with a limit, for example one extension of 5 minutes. Without a limit, a bot could hold the best seats for ever.',
    },
    {
      q: 'How do the two ticket agents avoid holding the same seat at the same moment?',
      a: 'The server must take the seats in one atomic step, such as a database update that only succeeds if every seat is still free. The contract says what the client sees: one request gets 201 and the other gets 409.',
    },
  ],
}
