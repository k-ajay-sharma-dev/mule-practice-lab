// Answers for rm-059 to rm-070, used by scripts/check-raml.js. swap: [from, to] applied to the model answer. See a.js and core.js.
const valid = 'The file is valid RAML 1.0'

export default [
  {
    id: 'rm-059',
    wrong: [
      { swap: [['pattern: ^LK-[0-9]{5}$', 'pattern: LK-[0-9]{5}']], fails: 'lockerId' },
      { swap: [['/lockers:\n', '/compartments:\n  get:\n/lockers:\n']], fails: 'compartments sits under a locker' },
      { swap: [['          compartmentNumber:\n            type: integer', '          compartmentNumber:\n            type: string']], fails: 'compartmentNumber' },
      { swap: [['            minimum: 1\n            maximum: 60\n', '            minimum: 1\n']], fails: 'compartmentNumber' },
      { swap: [['              type: Compartment[]', '              type: Compartment']], fails: 'returns a list of Compartment' },
      { swap: [['enum: [ S, M, L ]', 'enum: [ S, M, L, XL ]']], fails: 'size allows only' },
      { swap: [['        404:\n          description: No locker has this id.\n', '']], fails: 'unknown locker' },
      { swap: [['      occupied: boolean', '      occupied?: boolean']], fails: 'occupied' },
    ],
    right: [
      { swap: [['type: Compartment[]', 'type: array\n              items: Compartment'], ['enum: [ S, M, L ]', 'enum: [ L, M, S ]']] },
      { swap: [['pattern: ^LK-[0-9]{5}$', 'pattern: ^LK-\\d{5}$'], ['      number: integer', '      number:\n        type: integer\n        required: true']] },
    ],
  },
  {
    id: 'rm-060',
    wrong: [
      { swap: [['pattern: ^0[0-9]{2,4}$', 'pattern: 0[0-9]{2,4}']], fails: 'areaCode' },
      { swap: [['      areaCode:\n', '      areaCode?:\n']], fails: 'areaCode' },
      { swap: [['pattern: ^[0-9]{1,4}$', 'pattern: ^[0-9]+$']], fails: 'contains' },
      { swap: [['        default: mobile\n', '']], fails: 'lineType is optional' },
      { swap: [['      lineType?:\n        type: LineType', '      lineType?:\n        type: string']], fails: 'lineType is optional' },
      { swap: [['        maximum: 50\n', '        maximum: 500\n']], fails: 'limit' },
      { swap: [['      limit?:\n', '      limit:\n']], fails: 'limit' },
      { swap: [['          type: PhoneNumber[]', '          type: PhoneNumber']], fails: 'returns a list of PhoneNumber' },
      { swap: [['/available-numbers:\n  get:', '/available-numbers:\n  post:\n    description: Reserve a number.\n  get:']], fails: 'read only' },
    ],
    right: [
      { swap: [['pattern: ^0[0-9]{2,4}$', 'pattern: ^0\\d{2,4}$'], ['type: PhoneNumber[]', 'type: array\n          items: PhoneNumber']] },
      {
        swap: [
          ['      lineType?:\n        type: LineType\n        default: mobile\n', '      lineType:\n        required: false\n        type: string\n        enum: [ landline, mobile ]\n        default: mobile\n'],
          ['      limit?:\n        type: integer', '      limit:\n        type: integer\n        required: false'],
        ],
      },
    ],
  },
  {
    id: 'rm-061',
    wrong: [
      { swap: [['        maxLength: 100\n', '']], fails: 'substance' },
      { swap: [['enum: [ mild, moderate, severe ]', 'enum: [ mild, moderate, severe, unknown ]']], fails: 'severity' },
      { swap: [['reaction?: string', 'reaction: string']], fails: 'reaction' },
      { swap: [['recordedOn: date-only', 'recordedOn: datetime'], ['recordedOn: 2026-04-03', 'recordedOn: 2026-04-03T09:15:00Z']], fails: 'recordedOn' },
      { swap: [['pattern: ^[0-9]{10}$', 'pattern: ^[0-9]{9,10}$']], fails: 'patientId' },
      { swap: [['        body:\n          type: Allergy\n', '        body:\n          type: Allergy[]\n']], fails: 'takes an Allergy body' },
      { swap: [['            headers:\n              Location:\n                type: string\n                description: The URL of the new allergy record.\n', '']], fails: 'Location' },
      { swap: [['          400:\n            description: The body does not fit the Allergy type.\n          404:\n            description: No patient has this id.\n', '          400:\n            description: The body is bad or no patient has this id.\n']], fails: 'unknown patient' },
    ],
    right: [
      { swap: [['type: Allergy[]', 'type: array\n              items: Allergy'], ['pattern: ^[0-9]{10}$', 'pattern: ^\\d{10}$']] },
      {
        swap: [
          ['      severity:\n        type: string\n        enum: [ mild, moderate, severe ]\n', '      severity: Severity\n'],
          ['types:\n  Allergy:\n', 'types:\n  Severity:\n    type: string\n    enum: [ severe, moderate, mild ]\n  Allergy:\n'],
          ['reaction?: string', 'reaction:\n        type: string\n        required: false'],
        ],
      },
    ],
  },
  {
    id: 'rm-062',
    wrong: [
      { swap: [['      courseCode: CSC101\n', '      courseCode: csc101\n']], fails: valid },
      { swap: [['      level: undergraduate\n', '      level: Undergraduate\n']], fails: valid },
      { swap: [['pattern: ^[A-Z]{3}[0-9]{3}$', 'pattern: ^[A-Za-z]{3}[0-9]{3}$']], fails: 'courseCode' },
      { swap: [['        maxLength: 120\n', '        maxLength: 1200\n']], fails: 'title' },
      { swap: [['      credits:\n        type: integer', '      credits:\n        type: number']], fails: 'credits' },
      { swap: [['enum: [ undergraduate, postgraduate ]', 'enum: [ undergraduate, postgraduate, foundation ]']], fails: 'level allows' },
      { swap: [['    example:\n      courseCode: CSC101\n      title: Introduction to Artificial Intelligence\n      credits: 20\n      level: undergraduate\n', '']], fails: 'Course has an example' },
      { swap: [['          type: Course[]', '          type: Course']], fails: 'list of Course' },
    ],
    right: [
      { swap: [['type: Course[]', 'type: array\n          items: Course'], ['pattern: ^[A-Z]{3}[0-9]{3}$', 'pattern: ^[A-Z]{3}\\d{3}$']] },
      {
        swap: [
          ['    example:\n      courseCode: CSC101\n', '    examples:\n      firstYear:\n        courseCode: CSC101\n'],
          ['      title: Introduction to Artificial Intelligence\n      credits: 20\n      level: undergraduate\n', '        title: Introduction to Artificial Intelligence\n        credits: 20\n        level: undergraduate\n      masters:\n        courseCode: DSC710\n        title: Applied Machine Learning\n        credits: 60\n        level: postgraduate\n'],
        ],
      },
    ],
  },
  {
    id: 'rm-063',
    wrong: [
      { swap: [['          404:\n            description: No employee has this id.\n            body:\n              type: Error\n', '']], fails: 'unknown employee' },
      { swap: [['          409:\n            description: The dates overlap another request, or the allowance is used up.\n            body:\n              type: Error\n', '']], fails: '409' },
      { swap: [['          409:\n            description: The dates overlap another request, or the allowance is used up.\n            body:\n              type: Error\n', '          409:\n            description: The dates overlap another request, or the allowance is used up.\n']], fails: '409' },
      { swap: [['enum: [ annual, sick, parental, unpaid ]', 'enum: [ annual, sick, unpaid ]']], fails: 'leaveType' },
      { swap: [['      note?:\n', '      note:\n']], fails: 'note' },
      { swap: [['        maxLength: 500\n', '']], fails: 'note' },
      { swap: [['      endDate: date-only', '      endDate: string']], fails: 'startDate and endDate' },
      { swap: [['            headers:\n              Location:\n                type: string\n', '']], fails: 'Location' },
      { swap: [['    example:\n      code: LEAVE_OVERLAP\n      message: These dates overlap leave request LR-88213 from 2026-07-27 to 2026-08-02.\n', '']], fails: 'Error has' },
    ],
    right: [
      { swap: [['            headers:\n              Location:\n                type: string\n', '            headers:\n              Location: string\n'], ['enum: [ annual, sick, parental, unpaid ]', 'enum: [ unpaid, parental, sick, annual ]']] },
      {
        swap: [
          ['    example:\n      code: LEAVE_OVERLAP\n      message: These dates overlap leave request LR-88213 from 2026-07-27 to 2026-08-02.\n', '    examples:\n      overlap:\n        code: LEAVE_OVERLAP\n        message: These dates overlap another request.\n      allowance:\n        code: ALLOWANCE_EXCEEDED\n        message: Only 3 days of annual leave are left.\n'],
          ['      note?:\n        type: string', '      note:\n        type: string\n        required: false'],
        ],
      },
    ],
  },
  {
    id: 'rm-064',
    wrong: [
      { swap: [['            204:\n              description: The traveller was removed.\n', '            204:\n              description: The traveller was removed.\n              body:\n                type: Traveller\n']], fails: '204' },
      { swap: [['            204:\n              description: The traveller was removed.\n', '            200:\n              description: The traveller was removed.\n']], fails: '204' },
      { swap: [['            409:\n              description: This is the lead traveller, who cannot be removed.\n              body:\n                type: Error\n', '']], fails: '409' },
      { swap: [['      get:\n        responses:\n          200:\n            body:\n              type: Traveller[]\n', '      get:\n        responses:\n          200:\n            body:\n              type: Traveller[]\n      delete:\n        responses:\n          204:\n']], fails: 'not deleted as a whole' },
      { swap: [['pattern: ^[A-Z0-9]{6}$', 'pattern: ^[A-Za-z0-9]{6}$']], fails: 'tripRef' },
      { swap: [['            maximum: 9\n', '']], fails: 'travellerNumber' },
      { swap: [['dateOfBirth: date-only', 'dateOfBirth: datetime'], ['dateOfBirth: 1991-05-14', 'dateOfBirth: 1991-05-14T00:00:00Z']], fails: 'dateOfBirth' },
      { swap: [['            404:\n              description: The trip has no traveller with this number.\n            409:', '            409:']], fails: 'no such traveller' },
    ],
    right: [
      { swap: [['            204:\n              description: The traveller was removed.\n', '            204:\n']] },
      { swap: [['pattern: ^[A-Z0-9]{6}$', 'pattern: ^[0-9A-Z]{6}$'], ['type: Traveller[]', 'type: array\n              items: Traveller']] },
    ],
  },
  {
    id: 'rm-065',
    wrong: [
      { swap: [['enum: [ electricity, gas ]', 'enum: [ electricity, gas, oil ]']], fails: 'fuel allows only' },
      { swap: [['            - tariffCode: EV-7\n              fuel: electricity\n', '            - tariffCode: EV-7\n              fuel: Electric\n']], fails: valid },
      { swap: [['              unitRatePence: 7.9\n', '              unitRatePence: "7.9p"\n']], fails: valid },
      { swap: [['      fixedUntil: 2027-03-31\n', '      fixedUntil: 31/03/2027\n']], fails: valid },
      {
        swap: [['          example:\n            - tariffCode: FIX-24\n              fuel: electricity\n              unitRatePence: 24.5\n              standingChargePence: 53.1\n              fixedUntil: 2027-03-31\n            - tariffCode: EV-7\n              fuel: electricity\n              unitRatePence: 7.9\n              standingChargePence: 48.2\n            - tariffCode: GAS-12\n              fuel: gas\n              unitRatePence: 6.1\n              standingChargePence: 31.4\n', '']],
        fails: 'own example',
      },
      { swap: [['      fixedUntil?: date-only', '      fixedUntil: date-only'], ['              unitRatePence: 7.9\n              standingChargePence: 48.2\n', '              unitRatePence: 7.9\n              standingChargePence: 48.2\n              fixedUntil: 2027-06-30\n'], ['              unitRatePence: 6.1\n              standingChargePence: 31.4\n', '              unitRatePence: 6.1\n              standingChargePence: 31.4\n              fixedUntil: 2027-06-30\n']], fails: 'fixedUntil' },
      { swap: [['pattern: ^[A-Z]{2,4}-[0-9]{1,2}$', 'pattern: ^[A-Z]+-[0-9]+$']], fails: 'tariffCode' },
      { swap: [['      fuel?: Fuel', '      fuel: Fuel']], fails: 'fuel query parameter' },
      { swap: [['      standingChargePence:\n        type: number\n        minimum: 0\n', '      standingChargePence: number\n']], fails: 'standingChargePence' },
    ],
    right: [
      {
        swap: [
          ['  Fuel:\n    type: string\n    enum: [ electricity, gas ]\n', ''],
          ['      fuel: Fuel', '      fuel:\n        type: string\n        enum: [ gas, electricity ]'],
          ['      fuel?: Fuel', '      fuel?:\n        type: string\n        enum: [ electricity, gas ]'],
        ],
      },
      { swap: [['pattern: ^[A-Z]{2,4}-[0-9]{1,2}$', 'pattern: ^[A-Z]{2,4}-\\d{1,2}$'], ['          type: Tariff[]\n          example:', '          type: array\n          items: Tariff\n          example:']] },
    ],
  },
  {
    id: 'rm-066',
    wrong: [
      { swap: [['        X-Channel:\n', '        X-Channel?:\n']], fails: 'X-Channel' },
      { swap: [['      headers:\n        X-Channel:', '      queryParameters:\n        X-Channel:']], fails: 'X-Channel' },
      { swap: [['enum: [ app, web, branch ]', 'enum: [ app, web ]']], fails: 'X-Channel' },
      {
        swap: [
          ['          example: app\n', '          example: app\n        Cache-Control:\n          type: string\n'],
          ['            Cache-Control:\n              type: string\n              example: max-age=30\n', ''],
        ],
        fails: 'Cache-Control',
      },
      { swap: [['            X-Rate-Valid-Until:\n              type: datetime\n              example: 2026-11-09T10:15:30Z\n', '']], fails: 'X-Rate-Valid-Until' },
      { swap: [['pattern: ^[A-Z]{3}-[A-Z]{3}$', 'pattern: ^[A-Z]{6}$']], fails: 'pair' },
      { swap: [['validUntil: datetime', 'validUntil: datetime-only'], ['validUntil: 2026-11-09T10:15:30Z', 'validUntil: 2026-11-09T10:15:30']], fails: 'validUntil' },
      { swap: [['pattern: ^[A-Z]{3}$', 'pattern: ^[A-Za-z]{3}$']], fails: 'base and quote' },
    ],
    right: [
      { swap: [['      headers:\n        X-Channel:\n', '      headers:\n        x-channel:\n'], ['            Cache-Control:\n              type: string\n              example: max-age=30\n', '            Cache-Control: string\n']] },
      {
        swap: [
          ['  CurrencyCode:\n    type: string\n    pattern: ^[A-Z]{3}$\n', ''],
          ['      base: CurrencyCode\n      quote: CurrencyCode\n', '      base:\n        type: string\n        pattern: ^[A-Z]{3}$\n      quote:\n        type: string\n        pattern: ^[A-Z]{3}$\n'],
          ['          type: string\n          enum: [ app, web, branch ]', '          type: string\n          required: true\n          enum: [ branch, web, app ]'],
        ],
      },
    ],
  },
  {
    id: 'rm-067',
    wrong: [
      { swap: [['    minimum: 1\n    maximum: 10\n', '    minimum: 0\n    maximum: 10\n']], fails: 'NewItem' },
      { swap: [['  QuantityChange:\n    type: object\n    properties:\n      quantity: Quantity\n', '  QuantityChange:\n    type: object\n    properties:\n      sku: Sku\n      quantity: Quantity\n'], ['    example:\n      quantity: 3\n', '    example:\n      sku: "40012345"\n      quantity: 3\n']], fails: 'QuantityChange' },
      { swap: [['enum: [ INVALID_REQUEST, NOT_FOUND, OUT_OF_STOCK ]', 'enum: [ INVALID_REQUEST, NOT_FOUND ]'], ['      code: OUT_OF_STOCK\n', '      code: NOT_FOUND\n']], fails: 'Error code' },
      { swap: [['        body:\n          type: NewItem\n', '        body:\n          type: BasketItem\n']], fails: 'takes a NewItem' },
      { swap: [['            headers:\n              Location:\n                type: string\n', '']], fails: '201 with Location' },
      { swap: [['          409:\n            description: Not enough stock for this quantity.\n            body:\n              type: Error\n', '']], fails: 'POST returns 400, 404' },
      { swap: [['          body:\n            type: QuantityChange\n', '          body:\n            type: BasketItem\n']], fails: 'PATCH one item' },
      { swap: [['            409:\n              description: Not enough stock for the new quantity.\n              body:\n                type: Error\n', '']], fails: 'PATCH returns 404' },
      { swap: [['            204:\n              description: The line was removed.\n', '            204:\n              description: The line was removed.\n              body:\n                type: BasketItem\n']], fails: 'DELETE one item' },
      { swap: [['      unitPrice: number\n', '      unitPrice: string\n'], ['      unitPrice: 1.85\n', '      unitPrice: "1.85"\n']], fails: 'unitPrice' },
    ],
    right: [
      {
        swap: [
          ['  Sku:\n    type: string\n    pattern: ^[0-9]{8}$\n', ''],
          ['      sku: Sku\n      quantity: Quantity\n    example:\n      sku: "40012345"\n      quantity: 2\n  QuantityChange', '      sku:\n        type: string\n        pattern: ^\\d{8}$\n      quantity: Quantity\n    example:\n      sku: "40012345"\n      quantity: 2\n  QuantityChange'],
          ['      sku: Sku\n      quantity: Quantity\n      unitPrice', '      sku: string\n      quantity: Quantity\n      unitPrice'],
        ],
      },
      { swap: [['enum: [ INVALID_REQUEST, NOT_FOUND, OUT_OF_STOCK ]', 'enum: [ OUT_OF_STOCK, NOT_FOUND, INVALID_REQUEST ]'], ['            204:\n              description: The line was removed.\n', '            204:\n']] },
    ],
  },
  {
    id: 'rm-068',
    wrong: [
      { swap: [['        404:\n          description: No quote has this id, or it was deleted after 90 days.\n', '']], fails: 'GET /quotes/{quoteId}' },
      { swap: [['      coverType: CoverType\n    example:\n      registration', '      coverType: CoverType\n      premium?: number\n    example:\n      registration']], fails: 'no quoteId or premium' },
      { swap: [['    body:\n      type: QuoteRequest\n', '    body:\n      type: Quote\n']], fails: 'takes a QuoteRequest' },
      { swap: [['pattern: ^[A-Z]{2}[0-9]{2}[A-Z]{3}$', 'pattern: ^[A-Z0-9 ]{7,8}$']], fails: 'registration' },
      { swap: [['        minimum: 17\n', '        minimum: 16\n']], fails: 'driverAge' },
      { swap: [['      expiresAt: datetime', '      expiresAt: date-only'], ['      expiresAt: 2026-12-09T23:59:59Z', '      expiresAt: 2026-12-09']], fails: 'expiresAt' },
      { swap: [['      registration: AB12CDE\n', '      registration: AB12 CDE\n']], fails: valid },
      { swap: [['        headers:\n          Location:\n            type: string\n            example: /quotes/Q-00418822\n', '']], fails: 'Location' },
      { swap: [['      coverType: CoverType\n    example:\n      quoteId', '      coverType: string\n    example:\n      quoteId']], fails: 'coverType' },
      { swap: [['    example:\n      registration: AB12CDE\n      driverAge: 34\n      annualMileage: 8000\n      coverType: comprehensive\n', '']], fails: 'both have an example' },
    ],
    right: [
      { swap: [['pattern: ^[A-Z]{2}[0-9]{2}[A-Z]{3}$', 'pattern: ^[A-Z]{2}\\d{2}[A-Z]{3}$'], ['enum: [ comprehensive, third-party, third-party-fire-theft ]', 'enum: [ third-party, third-party-fire-theft, comprehensive ]']] },
      {
        swap: [
          ['  CoverType:\n    type: string\n    enum: [ comprehensive, third-party, third-party-fire-theft ]\n', ''],
          ['      coverType: CoverType\n    example:\n      registration', '      coverType:\n        type: string\n        enum: [ comprehensive, third-party, third-party-fire-theft ]\n    example:\n      registration'],
          ['      coverType: CoverType\n    example:\n      quoteId', '      coverType:\n        type: string\n        enum: [ comprehensive, third-party, third-party-fire-theft ]\n    example:\n      quoteId'],
          ['      premium: 612.40\n', '      premium: 0\n'],
        ],
      },
    ],
  },
  {
    id: 'rm-069',
    wrong: [
      { swap: [['            404:\n              description: This charger has no session with this id.\n', '']], fails: 'GET one session' },
      { swap: [['/chargers:\n', '/sessions:\n  /{sessionId}:\n    get:\n/chargers:\n']], fails: 'sessions sits under a charger' },
      { swap: [['pattern: ^CH-[0-9]{6}$', 'pattern: ^CH-[0-9]+$']], fails: 'chargerId' },
      { swap: [['      maxKwh?:\n', '      maxKwh:\n']], fails: 'StartSession' },
      { swap: [['        minimum: 1\n        maximum: 2\n', '        minimum: 1\n']], fails: 'StartSession' },
      { swap: [['enum: [ active, completed ]', 'enum: [ active, paused, completed ]']], fails: 'status allows only' },
      { swap: [['      endedAt?: datetime', '      endedAt: datetime']], fails: valid },
      { swap: [['      endedAt?: datetime', '      endedAt?: datetime-only']], fails: 'endedAt' },
      { swap: [['          from?:\n            type: datetime\n            example: 2026-11-01T00:00:00Z\n', '          from?:\n            type: date-only\n            example: 2026-11-01\n']], fails: 'from and to' },
      { swap: [['          409:\n            description: The connector is already in use.\n            body:\n              type: Error\n', '          409:\n            description: The connector is already in use.\n']], fails: '409' },
      { swap: [['        body:\n          type: StartSession\n', '        body:\n          type: ChargingSession\n']], fails: 'POST sessions takes StartSession' },
    ],
    right: [
      { swap: [['type: ChargingSession[]', 'type: array\n              items: ChargingSession'], ['pattern: ^CH-[0-9]{6}$', 'pattern: ^CH-\\d{6}$']] },
      {
        swap: [
          ['          status?: SessionStatus\n', '          status:\n            type: string\n            required: false\n            enum: [ completed, active ]\n'],
          ['      endedAt?: datetime', '      endedAt:\n        type: datetime\n        required: false'],
        ],
      },
    ],
  },
  {
    id: 'rm-070',
    wrong: [
      { swap: [['      orderId: string\n    example:', '      orderId?: string\n    example:']], fails: 'orderId' },
      { swap: [['pattern: ^[A-Z]{1,2}[0-9][A-Z0-9]?[0-9][A-Z]{2}$', 'pattern: ^[A-Z0-9 ]{5,8}$']], fails: 'postcode' },
      { swap: [['          date:\n            type: date-only', '          date?:\n            type: date-only']], fails: 'date is a required' },
      { swap: [['          date:\n            type: date-only\n            example: 2026-12-03\n', '          date:\n            type: datetime\n            example: 2026-12-03T00:00:00Z\n']], fails: 'date is a required' },
      {
        swap: [['              example:\n                - slotId: SL-118204\n                  start: 2026-12-03T08:00:00Z\n                  end: 2026-12-03T10:00:00Z\n                  price: 0\n                  dropsLeft: 3\n                - slotId: SL-118205\n                  start: 2026-12-03T10:00:00Z\n                  end: 2026-12-03T12:00:00Z\n                  price: 9.95\n                  dropsLeft: 0\n', '']],
        fails: 'example on the response',
      },
      { swap: [['                  dropsLeft: 0\n', '                  dropsLeft: -1\n']], fails: valid },
      { swap: [['      slotId: SlotId\n      orderId: string\n    example:', '      slotId: string\n      orderId: string\n    example:']], fails: 'slotId looks like' },
      { swap: [['      409:\n        description: The slot has no drops left.\n        body:\n          type: Error\n', '']], fails: '409' },
      { swap: [['    body:\n      type: BookingRequest\n', '    body:\n      type: Booking\n']], fails: 'takes a BookingRequest' },
      {
        swap: [
          ['          400:\n            description: The postcode or the date is not valid.\n', '          400:\n            description: The postcode or the date is not valid.\n    /delivery-bookings:\n      post:\n        body:\n          type: BookingRequest\n'],
        ],
        fails: 'not nested under the postcode',
      },
      { swap: [['      dropsLeft:\n        type: integer\n        minimum: 0\n', '      dropsLeft: integer\n']], fails: 'dropsLeft' },
    ],
    right: [
      { swap: [['pattern: ^[A-Z]{1,2}[0-9][A-Z0-9]?[0-9][A-Z]{2}$', 'pattern: ^[A-Z]{1,2}\\d[A-Z\\d]?\\d[A-Z]{2}$'], ['type: DeliverySlot[]', 'type: array\n              items: DeliverySlot']] },
      {
        swap: [
          ['          date:\n            type: date-only\n            example: 2026-12-03\n', '          date: date-only\n'],
          ['      slotId: SlotId\n      orderId: string\n    example:', '      slotId:\n        type: string\n        pattern: ^SL-[0-9]{6}$\n      orderId:\n        type: string\n        required: true\n    example:'],
        ],
      },
    ],
  },
]
