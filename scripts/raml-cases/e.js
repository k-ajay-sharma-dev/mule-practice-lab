// Answers for rm-071 to rm-082, used by scripts/check-raml.js. swap: [from, to] or [from, to, file] applied to the model answer.
export default [
  {
    id: 'rm-071',
    wrong: [
      {
        swap: [['/recipes:\n  get:\n    is: [ paged ]\n', '/recipes:\n  get:\n    queryParameters:\n      offset?:\n        type: integer\n        minimum: 0\n        default: 0\n      limit?:\n        type: integer\n        minimum: 1\n        maximum: 100\n        default: 20\n']],
        fails: 'GET /recipes uses the paged trait',
      },
      { swap: [['        maximum: 100\n', '        maximum: 1000\n']], fails: 'limit from 1 to 100' },
      { swap: [['      limit?:\n', '      limit:\n']], fails: 'limit from 1 to 100' },
      { swap: [['        maximum: 100\n        default: 20\n', '        maximum: 100\n']], fails: 'default 20' },
      { swap: [['        minimum: 0\n        default: 0\n', '        minimum: 1\n        default: 1\n']], fails: 'offset, at least 0' },
      { swap: [['type: Cookbook[]', 'type: Cookbook']], fails: 'GET /cookbooks returns Cookbook[]' },
      { swap: [['/cookbooks:\n  get:\n    is: [ paged ]\n', '/cookbooks:\n  get:\n']], fails: 'GET /cookbooks uses the paged trait' },
    ],
    right: [
      { swap: [['type: Recipe[]', 'type: array\n          items: Recipe'], ['      offset?:\n        type: integer\n', '      offset:\n        required: false\n        type: integer\n']] },
      { swap: [['/recipes:\n  get:\n    is: [ paged ]\n', '/recipes:\n  is: [ paged ]\n  get:\n'], ['/cookbooks:\n  get:\n    is: [ paged ]\n', '/cookbooks:\n  is: [ paged ]\n  get:\n']] },
    ],
  },
  {
    id: 'rm-072',
    wrong: [
      { swap: [['      X-Correlation-ID:\n', '      X-Correlation-ID?:\n']], fails: 'required string with the id pattern' },
      { swap: [['        pattern: ^[0-9a-f-]{36}$\n', '']], fails: 'required string with the id pattern' },
      { swap: [['  /{lockerId}:\n    is: [ traced ]\n', '  /{lockerId}:\n']], fails: 'DELETE /lockers/{lockerId} is traced' },
      { swap: [['/lockers:\n  is: [ traced ]\n  get:\n', '/lockers:\n  get:\n    is: [ traced ]\n']], fails: 'POST /lockers is traced' },
      { swap: [['        204:\n          description: The locker was removed from service.\n', '        200:\n          description: The locker was removed from service.\n']], fails: '204 with no body' },
      { swap: [['        404:\n          description: No locker has this id.\n', '']], fails: 'returns 200 or 404' },
      { swap: [['      201:\n        description: The locker was registered.\n', '      200:\n        description: The locker was registered.\n']], fails: 'returns 201' },
    ],
    right: [
      {
        swap: [
          ['/lockers:\n  is: [ traced ]\n  get:\n', '/lockers:\n  get:\n    is: [ traced ]\n'],
          ['  post:\n    responses:\n', '  post:\n    is: [ traced ]\n    responses:\n'],
          ['    is: [ traced ]\n    get:\n      responses:\n', '    get:\n      is: [ traced ]\n      responses:\n'],
          ['    delete:\n      responses:\n', '    delete:\n      is: [ traced ]\n      responses:\n'],
        ],
      },
      { swap: [['pattern: ^[0-9a-f-]{36}$', 'pattern: ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'], ['{lockerId}', '{id}']] },
    ],
  },
  {
    id: 'rm-073',
    wrong: [
      { swap: [['        description: Free text to search the <<resourcePathName>> by.\n', '        description: Free text to search the listings by.\n']], fails: 'description says sellers' },
      { swap: [['        default: <<defaultSort>>\n', '        default: newest\n']], fails: 'The default of sort is the <<defaultSort>> parameter' },
      { swap: [['    responses:\n      400:\n        description: The search text is shorter than 2 or longer than 100 characters.\n', '']], fails: 'adds q, sort and a 400 response' },
      { swap: [['        minLength: 2\n', '        minLength: 1\n']], fails: 'at least 2 characters' },
      { swap: [['searchable: { defaultSort: rating }', 'searchable: { defaultSort: name }']], fails: 'GET /sellers sorts by rating' },
      { swap: [['          type: Seller[]\n', '          type: Seller\n']], fails: 'GET /sellers returns Seller[]' },
      {
        swap: [['/sellers:\n  get:\n    is: [ searchable: { defaultSort: rating } ]\n', '/sellers:\n  get:\n    queryParameters:\n      q?:\n        type: string\n        minLength: 2\n        description: Free text to search the sellers by.\n      sort?:\n        type: string\n        default: rating\n']],
        fails: 'GET /sellers uses searchable',
      },
    ],
    right: [
      { swap: [['Free text to search the <<resourcePathName>> by.', 'Free text to search the << resourcePathName >> by.'], ['      sort?:\n        type: string\n', '      sort:\n        required: false\n        type: string\n']] },
      { swap: [['/listings:\n  get:\n    is: [ searchable: { defaultSort: newest } ]\n', '/listings:\n  is: [ searchable: { defaultSort: newest } ]\n  get:\n'], ['type: Listing[]', 'type: array\n          items: Listing']] },
    ],
  },
  {
    id: 'rm-074',
    wrong: [
      { swap: [['      Idempotency-Key:\n', '      Idempotency-Key?:\n']], fails: 'needs Idempotency-Key' },
      { swap: [['        maxLength: 64\n', '']], fails: 'needs Idempotency-Key' },
      { swap: [['    responses:\n      409:\n        description: This key was already used with a different body.\n        body:\n          type: ApiError\n', '']], fails: 'Idempotency-Key header and a 409' },
      { swap: [['        body:\n          type: ApiError\n', '']], fails: 'A reused key gets a 409 with an ApiError body' },
      { swap: [['      post:\n        is: [ idempotent, traced ]\n', '      post:\n        is: [ traced ]\n']], fails: 'returns uses both traits' },
      { swap: [['    get:\n      is: [ traced ]\n', '    get:\n']], fails: 'GET /rentals/{rentalId} is traced' },
      { swap: [['    body:\n      type: RentalRequest\n', '    body:\n      type: Rental\n']], fails: 'takes a RentalRequest' },
      { swap: [['      endDate: date-only\n', '      endDate: string\n']], fails: 'date-only startDate and endDate' },
    ],
    right: [
      { swap: [['/rentals:\n  post:\n    is: [ idempotent, traced ]\n', '/rentals:\n  post:\n    is: [ traced, idempotent ]\n']] },
      { swap: [['        minLength: 16\n        maxLength: 64\n', '        maxLength: 64\n        minLength: 16\n'], ['    body:\n      type: RentalRequest\n','    body:\n      application/json:\n        type: RentalRequest\n'], ['{rentalId}', '{id}']] },
    ],
  },
  {
    id: 'rm-075',
    wrong: [
      { swap: [['      details?: FieldError[]\n', '      details?: FieldError\n'], ['      details:\n        - field: startsAt\n          issue: The clinic is closed at this time.\n', '      details:\n        field: startsAt\n        issue: The clinic is closed at this time.\n']], fails: 'optional list of FieldError' },
      { swap: [['      details?: FieldError[]\n', '      details: FieldError[]\n']], fails: 'optional list of FieldError' },
      { swap: [['      401:\n        description: The caller is not signed in.\n        body:\n          type: ApiError\n', '']], fails: 'adds 400, 401 and 500' },
      { swap: [['    get:\n      is: [ standardErrors ]\n', '    get:\n']], fails: 'GET /appointments/{appointmentId} uses standardErrors' },
      { swap: [['        404:\n          body:\n            type: ApiError\n', '        404:\n          description: No appointment has this id.\n']], fails: 'adds its own 404' },
      { swap: [['      correlationId: string\n      details', '      details'], ['      correlationId: 7c1e2a90-4b3d-4f8e-a1c2-5d6e7f8a9b0c\n', '']], fails: 'required code, message and correlationId' },
      { swap: [['      startsAt: datetime\n', '      startsAt: datetime-only\n']], fails: 'startsAt is a required datetime' },
      { swap: [['/appointments:\n  is: [ standardErrors ]\n', '/appointments:\n']], fails: 'GET /appointments uses standardErrors' },
    ],
    right: [
      { swap: [['      details?: FieldError[]\n', '      details?:\n        type: array\n        items: FieldError\n']] },
      {
        swap: [
          ['/appointments:\n  is: [ standardErrors ]\n  get:\n    responses:\n', '/appointments:\n  get:\n    is: [ standardErrors ]\n    responses:\n'],
          ['  post:\n    body:\n', '  post:\n    is: [ standardErrors ]\n    body:\n'],
          ['{appointmentId}', '{id}'],
        ],
      },
    ],
  },
  {
    id: 'rm-076',
    wrong: [
      { swap: [['            type: <<resourcePathName | !singularize | !uppercamelcase>>[]\n', '            type: <<resourcePathName>>[]\n']], fails: 'GET /vehicles returns Vehicle[]' },
      { swap: [['            type: <<resourcePathName | !singularize | !uppercamelcase>>[]\n', '            type: <<resourcePathName | !singularize | !uppercamelcase>>\n']], fails: 'GET /drivers returns Driver[]' },
      { swap: [['        404:\n          description: No <<resourcePathName | !singularize>> has this id.\n', '']], fails: 'The item resource type has get with 404' },
      { swap: [['        204:\n          description: The <<resourcePathName | !singularize>> was removed.\n', '        200:\n          description: The <<resourcePathName | !singularize>> was removed.\n']], fails: 'The item resource type has get with 404, put with a body, and delete with 204' },
      {
        swap: [['  /{driverId}:\n    type: item\n', '  /{driverId}:\n    get:\n      responses:\n        200:\n          body:\n            type: Driver\n        404:\n          description: No driver has this id.\n']],
        fails: '/drivers uses collection and /drivers/{driverId} uses item',
      },
      {
        swap: [['/vehicles:\n  type: collection\n', '/vehicles:\n  type: collection\n  get:\n    responses:\n      200:\n        body:\n          type: Vehicle[]\n']],
        fails: '/vehicles uses collection, and its methods come from there',
      },
      { swap: [['        enum: [ B, C1, C ]\n', '        enum: [ B, C1, C, D ]\n']], fails: 'licenceClass only allows' },
    ],
    right: [
      { swap: [['{vehicleId}', '{id}'], ['{driverId}', '{id}']] },
      { swap: [['            type: <<resourcePathName | !singularize | !uppercamelcase>>[]\n', '            type: array\n            items: <<resourcePathName | !singularize | !uppercamelcase>>\n']] },
    ],
  },
  {
    id: 'rm-077',
    wrong: [
      { swap: [['        maximum: <<maxLimit>>\n', '        maximum: 500\n']], fails: 'The paged trait sets the maximum of limit' },
      { swap: [['itemType: Observation, maxLimit: 100', 'itemType: Observation, maxLimit: 500']], fails: 'GET observations has an optional integer limit from 1 to 100' },
      { swap: [['          headers:\n            X-Next-Cursor?:\n              type: string\n              description: Send this as cursor to get the next page. Missing on the last page.\n', '']], fails: 'X-Next-Cursor header' },
      { swap: [['          from:\n', '          from?:\n']], fails: 'required datetime from' },
      { swap: [['            type: <<itemType>>[]\n', '            type: <<itemType>>\n']], fails: 'GET /stations returns Station[]' },
      { swap: [['      is: [ paged: { maxLimit: <<maxLimit>> } ]\n', '']], fails: 'GET /stations uses paged' },
      { swap: [['      observedAt: datetime\n', '      observedAt: datetime-only\n']], fails: 'datetime observedAt' },
      {
        swap: [['  type: { pagedCollection: { itemType: Station, maxLimit: 500 } }\n', '  get:\n    is: [ paged: { maxLimit: 500 } ]\n    responses:\n      200:\n        headers:\n          X-Next-Cursor?: string\n        body:\n          type: Station[]\n']],
        fails: '/stations uses pagedCollection',
      },
    ],
    right: [
      { swap: [['{ itemType: Station, maxLimit: 500 }', '{ maxLimit: 500, itemType: Station }']] },
      { swap: [['      limit?:\n        type: integer\n', '      limit:\n        required: false\n        type: integer\n'], ['            type: <<itemType>>[]\n', '            type: array\n            items: <<itemType>>\n']] },
    ],
  },
  {
    id: 'rm-078',
    wrong: [
      { swap: [['    body:\n      type: BookingRequest\n', '    body:\n      type: Booking\n']], fails: 'POST /bookings takes a BookingRequest' },
      {
        swap: [['  Booking:\n    type: BookingRequest\n    properties:\n', '  Booking:\n    type: object\n    properties:\n      venueId: string\n      eventDate: date-only\n      guests: integer\n      contactEmail: string\n']],
        fails: 'Booking extends BookingRequest',
      },
      { swap: [['      contactEmail: string\n  Booking:', '      contactEmail: string\n      bookingId?: string\n  Booking:']], fails: 'BookingRequest has no bookingId and no status' },
      { swap: [['enum: [ PROVISIONAL, CONFIRMED, CANCELLED ]', 'enum: [ PROVISIONAL, CONFIRMED ]']], fails: 'status only allows' },
      { swap: [['        maximum: 2000\n', '']], fails: 'guests is a required integer from 1 to 2000' },
      { swap: [['      201:\n        headers:\n          Location:\n            type: string\n            description: The URL of the new booking.\n', '      201:\n']], fails: 'Location header' },
      { swap: [['      createdAt: datetime\n', '      createdAt: date-only\n'], ['      createdAt: 2026-02-03T09:15:00Z\n', '      createdAt: 2026-02-03\n']], fails: 'datetime createdAt' },
    ],
    right: [
      { swap: [['type: Booking[]', 'type: array\n          items: Booking'], ['{bookingId}', '{id}']] },
      {
        swap: [
          ['      status:\n        type: string\n        enum: [ PROVISIONAL, CONFIRMED, CANCELLED ]\n', '      status: BookingStatus\n'],
          ['types:\n  BookingRequest:\n', 'types:\n  BookingStatus:\n    type: string\n    enum: [ PROVISIONAL, CONFIRMED, CANCELLED ]\n  BookingRequest:\n'],
        ],
      },
    ],
  },
  {
    id: 'rm-079',
    wrong: [
      { swap: [['        minItems: 1\n', '']], fails: 'list of Channel with 1 to 5 items' },
      { swap: [['    type: EmailChannel | SmsChannel | VoiceChannel\n', '    type: EmailChannel | SmsChannel\n']], fails: 'Channel is a union' },
      { swap: [['        pattern: ^\\+[1-9][0-9]{7,14}$\n', '']], fails: 'only accepts international numbers' },
      { swap: [['      quietHoursStart?: time-only\n', '      quietHoursStart?: datetime\n']], fails: 'quietHoursStart is an optional time-only' },
      { swap: [['          400:\n            description: The list of channels is empty, has more than 5 items, or holds a channel that fits no type.\n', '']], fails: 'returns 400' },
      {
        swap: [['      customerId: string\n      channels:', '      customerId: string\n      email?: string\n      channels:']],
        fails: 'The old single email, mobile and landline fields are gone',
      },
      {
        swap: [['  Channel:\n    type: EmailChannel | SmsChannel | VoiceChannel\n', '  Channel:\n    type: [ EmailChannel, SmsChannel, VoiceChannel ]\n'], ['        - email: j.morgan@example.com\n        - mobile: "+447700900123"\n', '        - email: j.morgan@example.com\n          mobile: "+447700900123"\n          landline: "01632960001"\n']],
        fails: 'Channel is a union',
      },
    ],
    right: [
      { swap: [['        type: Channel[]\n', '        type: array\n        items: Channel\n']] },
      {
        swap: [
          ['    example:\n      customerId: C-5520193\n      channels:\n        - email: j.morgan@example.com\n        - mobile: "+447700900123"\n', '    examples:\n      emailAndSms:\n        customerId: C-5520193\n        channels:\n          - email: j.morgan@example.com\n          - mobile: "+447700900123"\n      voiceOnly:\n        customerId: C-5520194\n        channels:\n          - landline: "01632960001"\n'],
          ['{customerId}', '{id}'],
        ],
      },
    ],
  },
  {
    id: 'rm-080',
    wrong: [
      { swap: [['    discriminatorValue: lock\n', '']], fails: 'SmartLock extends Device with the value lock' },
      { swap: [['    discriminator: kind\n', '']], fails: 'Device uses kind as its discriminator' },
      {
        swap: [['  Thermostat:\n    type: Device\n', '  Thermostat:\n    type: object\n']],
        fails: 'Thermostat extends Device',
      },
      {
        swap: [
          [
            '              example:\n                - deviceId: D-1001\n                  kind: thermostat\n                  name: Hall thermostat\n                  online: true\n                  targetC: 20.5\n                  currentC: 19.0\n                - deviceId: D-1002\n                  kind: lock\n                  name: Front door\n                  online: true\n                  locked: true\n                  batteryPct: 64\n                - deviceId: D-1003\n                  kind: camera\n                  name: Driveway\n                  online: false\n                  recording: false\n                  resolution: 1080p\n',
            '',
          ],
          ['      online: boolean\n  Thermostat:', '      online: boolean\n    example:\n      deviceId: D-1001\n      kind: thermostat\n      name: Hall thermostat\n      online: true\n  Thermostat:'],
        ],
        fails: 'GET devices returns Device[] with its own example',
      },
      { swap: [['        maximum: 30\n', '']], fails: 'targetC from 5 to 30' },
      { swap: [['          422:\n            description: The home hub does not support this kind of device.\n', '']], fails: '422' },
      { swap: [['enum: [ 720p, 1080p, 4k ]', 'enum: [ 720p, 1080p, 4k, 8k ]']], fails: 'resolution of 720p, 1080p or 4k' },
      { swap: [['      online: boolean\n  Thermostat:', '      online: boolean\n      targetC?: number\n  Thermostat:']], fails: 'Device no longer holds the fields of one kind' },
    ],
    right: [
      { swap: [['              type: Device[]\n              example:\n', '              type: array\n              items: Device\n              example:\n']] },
      {
        swap: [[
          '              example:\n                - deviceId: D-1001\n                  kind: thermostat\n                  name: Hall thermostat\n                  online: true\n                  targetC: 20.5\n                  currentC: 19.0\n                - deviceId: D-1002\n                  kind: lock\n                  name: Front door\n                  online: true\n                  locked: true\n                  batteryPct: 64\n                - deviceId: D-1003\n                  kind: camera\n                  name: Driveway\n                  online: false\n                  recording: false\n                  resolution: 1080p\n',
          '              examples:\n                mixedHome:\n                  - deviceId: D-1001\n                    kind: thermostat\n                    name: Hall thermostat\n                    online: true\n                    targetC: 20.5\n                    currentC: 19.0\n                  - deviceId: D-1002\n                    kind: lock\n                    name: Front door\n                    online: true\n                    locked: true\n                    batteryPct: 64\n                  - deviceId: D-1003\n                    kind: camera\n                    name: Driveway\n                    online: false\n                    recording: false\n                    resolution: 4k\n',
        ]],
      },
    ],
  },
  {
    id: 'rm-081',
    wrong: [
      { swap: [['  pat: libraries/patterns.raml\n', '  pat: !include libraries/patterns.raml\n']], fails: 'with the prefix pat' },
      { swap: [['Words to find in the <<resourcePathName | !singularize>> record.', 'Words to find in the object record.', 'libraries/patterns.raml']], fails: 'says artist record' },
      { swap: [['Words to find in the <<resourcePathName | !singularize>> record.', 'Words to find in the <<resourcePathName>> record.', 'libraries/patterns.raml']], fails: 'says object record' },
      { swap: [['        maximum: 50\n', '        maximum: 500\n', 'libraries/patterns.raml']], fails: 'pageSize from 1 to 50' },
      {
        swap: [
          ['types:\n  MuseumObject:\n', 'types:\n  ApiError:\n    type: object\n    properties:\n      code: string\n      message: string\n  MuseumObject:\n'],
          ['            type: pat.ApiError\n', '            type: ApiError\n'],
        ],
        fails: 'api.raml does not declare it',
      },
      { swap: [['/artists:\n  get:\n    is: [ pat.paged, pat.searchable ]\n', '/artists:\n  get:\n    is: [ pat.paged ]\n']], fails: 'GET /artists uses pat.paged and pat.searchable' },
      { swap: [['      q?:\n', '      q:\n', 'libraries/patterns.raml']], fails: 'q is optional' },
    ],
    right: [
      { swap: [['  pat: libraries/patterns.raml\n', '  pat: ./libraries/patterns.raml\n'], ['{objectId}', '{id}']] },
      {
        swap: [
          ['<<resourcePathName | !singularize>>', '<< resourcePathName | !singularize >>', 'libraries/patterns.raml'],
          ['/objects:\n  get:\n    is: [ pat.paged, pat.searchable ]\n', '/objects:\n  is: [ pat.searchable ]\n  get:\n    is: [ pat.paged ]\n'],
        ],
      },
    ],
  },
  {
    id: 'rm-082',
    wrong: [
      { swap: [['    delete?:\n', '    delete:\n', 'libraries/resources.raml']], fails: 'DELETE /farms/{farmId} is not offered' },
      { swap: [['            type: <<resourcePathName | !singularize | !uppercamelcase>>[]\n', '            type: <<resourcePathName | !singularize>>[]\n', 'libraries/resources.raml']], fails: 'GET /farms returns Farm[]' },
      { swap: [['          headers:\n            Location:\n              type: string\n              description: The URL of the new <<resourcePathName | !singularize>>.\n', '          description: Created.\n', 'libraries/resources.raml']], fails: '201 with Location' },
      { swap: [['        404:\n          body:\n            type: ApiError\n', '        404:\n          description: Not found.\n', 'libraries/resources.raml']], fails: '404 with res.ApiError' },
      {
        swap: [['  /{orderId}:\n    type: res.item\n    delete:\n      description: Cancel an order that has not been dispatched.\n', '  /{orderId}:\n    type: res.item\n']],
        fails: 'DELETE /orders/{orderId} returns 204',
      },
      { swap: [['        type: OrderLine[]\n        minItems: 1\n', '        type: OrderLine[]\n']], fails: 'Order.lines is a required list of OrderLine with at least 1 item' },
      { swap: [['      is: [ paged ]\n', '', 'libraries/resources.raml']], fails: 'uses res.paged' },
      { swap: [['        maximum: 200\n', '        maximum: 2000\n', 'libraries/resources.raml']], fails: 'pageSize up to 200' },
    ],
    right: [
      { swap: [['  res: libraries/resources.raml\n', '  res: ./libraries/resources.raml\n'], ['            type: <<resourcePathName | !singularize | !uppercamelcase>>[]\n', '            type: array\n            items: <<resourcePathName | !singularize | !uppercamelcase>>\n', 'libraries/resources.raml']] },
      { swap: [['        type: OrderLine[]\n        minItems: 1\n', '        type: array\n        items: OrderLine\n        minItems: 1\n'], ['{farmId}', '{id}'], ['{orderId}', '{id}']] },
    ],
  },
]
