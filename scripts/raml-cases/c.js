// Answers for rm-002 to rm-033. swap: [from, to] or [from, to, file] applied to the model answer. See a.js and core.js.
const valid = 'The file is valid RAML 1.0'

export default [
  {
    id: 'rm-002',
    wrong: [
      { swap: [['type: Order[]', 'type: Order']], fails: 'GET /orders returns Order[]' },
      {
        swap: [['    is: [ paged ]\n', '    queryParameters:\n      page?:\n        type: integer\n        minimum: 1\n      pageSize?:\n        type: integer\n        minimum: 1\n        maximum: 200\n']],
        fails: 'GET /orders uses the paged trait',
      },
      { swap: [['        minimum: 1\n        maximum: 200\n', '        minimum: 1\n']], fails: 'limits pageSize' },
      { swap: [['        minimum: 1\n        maximum: 200\n', '        maximum: 200\n']], fails: 'limits pageSize' },
      { swap: [['      page?:\n', '      page:\n']], fails: 'optional page' },
      { swap: [['  type: collection\n', '']], fails: 'The collection resource type' },
      { swap: [['enum: [ NEW, PAID, SHIPPED ]', 'enum: [ NEW, PAID, SHIPPED, RETURNED ]']], fails: 'status only allows' },
    ],
    right: [
      { swap: [['type: Order[]', 'type: array\n          items: Order'], ['{orderId}', '{id}']] },
      {
        swap: [
          ['      status:\n        type: string\n        enum: [ NEW, PAID, SHIPPED ]\n', '      status: OrderStatus\n'],
          ['types:\n  Order:\n', 'types:\n  OrderStatus:\n    type: string\n    enum: [ NEW, PAID, SHIPPED ]\n  Order:\n'],
        ],
      },
      { swap: [['    example:\n      orderId: O-1001\n      total: 49.90\n      status: NEW\n', '    examples:\n      newOrder:\n        orderId: O-1001\n        total: 49.90\n        status: NEW\n']] },
      { swap: [['    get:\n      description: List', '    get?:\n      description: List'], ['    post:\n      description: Add', '    post?:\n      description: Add']] },
    ],
  },
  {
    id: 'rm-003',
    wrong: [
      { swap: [['      q:\n', '      q?:\n']], fails: 'q is a required string' },
      { swap: [['      category?:\n        type: string\n', '      category?: string[]\n']], fails: 'category is an optional string' },
      { swap: [['      maxPrice?:\n        type: number\n', '      maxPrice?:\n        type: integer\n']], fails: 'maxPrice is an optional number' },
      { swap: [['      maxPrice?:\n        type: number\n        minimum: 0\n', '      maxPrice?: number\n']], fails: 'maxPrice is an optional number' },
      { swap: [['        minimum: 1\n        default: 1\n', '        minimum: 1\n']], fails: 'page is an optional integer' },
      { swap: [['      page?:\n', '      page:\n']], fails: 'page is an optional integer' },
      { swap: [['      inStock?:\n        type: boolean\n', '      inStock?:\n        type: string\n']], fails: 'inStock is an optional boolean' },
      { swap: [['      400:\n        description: The search text q is missing.\n', '']], fails: 'returns 400' },
    ],
    right: [
      { swap: [['      q:\n        type: string\n        description: The search text.\n', '      q: string\n'], ['      inStock?:\n        type: boolean\n', '      inStock?: boolean\n']] },
      { swap: [['      category?:\n        type: string\n', '      category:\n        type: string\n        required: false\n'], ['      page?:\n        type: integer\n', '      page:\n        required: false\n        type: integer\n']] },
    ],
  },
  {
    id: 'rm-004',
    wrong: [
      { swap: [['        type: string\n        minLength: 10\n        maxLength: 10\n', '        type: integer\n        minimum: 1000000000\n        maximum: 9999999999\n']], fails: 'accountId is a string' },
      { swap: [['        minLength: 10\n        maxLength: 10\n', '        maxLength: 10\n']], fails: 'accountId is a string' },
      { swap: [['        minLength: 10\n        maxLength: 10\n', '        pattern: ^[0-9]+$\n']], fails: 'accountId is a string' },
      { swap: [['          year:\n', '          yr:\n']], fails: 'year is an integer' },
      { swap: [['            minimum: 2000\n', '']], fails: 'year is an integer' },
      { swap: [['              minimum: 1\n              maximum: 12\n', '              minimum: 1\n']], fails: 'month is an integer' },
      { swap: [['              404:\n                description: There is no statement for this month.\n', '']], fails: '{month} returns 200, or 404' },
    ],
    right: [
      {
        swap: [
          ['      accountId:\n        type: string\n        minLength: 10\n        maxLength: 10\n', '      accountId: AccountId\n'],
          ['/accounts:\n', 'types:\n  AccountId:\n    type: string\n    minLength: 10\n    maxLength: 10\n\n/accounts:\n'],
        ],
      },
      { swap: [['        minLength: 10\n        maxLength: 10\n', '        pattern: ^[0-9]{10}$\n']] },
      { swap: [['{accountId}', '{id}'], ['      accountId:\n', '      id:\n']] },
      {
        swap: [[
          '    /statements:\n      /{year}:\n        uriParameters:\n          year:\n            type: integer\n            minimum: 2000\n        get:\n          responses:\n            200:\n              description: The statements for this year.\n        /{month}:\n          uriParameters:\n            month:\n              type: integer\n              minimum: 1\n              maximum: 12\n          get:\n            responses:\n              200:\n                description: The statement for this month.\n              404:\n                description: There is no statement for this month.\n',
          '    /statements/{year}:\n      uriParameters:\n        year:\n          type: integer\n          minimum: 2000\n      get:\n        responses:\n          200:\n            description: The statements for this year.\n      /{month}:\n        uriParameters:\n          month:\n            type: integer\n            minimum: 1\n            maximum: 12\n        get:\n          responses:\n            200:\n              description: The statement for this month.\n            404:\n              description: There is no statement for this month.\n',
        ]],
      },
    ],
  },
  {
    id: 'rm-005',
    wrong: [
      { swap: [['availableFrom?: date-only', 'availableFrom?: datetime']], fails: 'availableFrom is an optional date-only' },
      { swap: [['availableFrom?: date-only', 'availableFrom: date-only']], fails: 'availableFrom is an optional date-only' },
      { swap: [['        headers:\n          Location:\n            type: string\n            description: The URL of the new application.\n', '']], fails: '201 with a Location header' },
      {
        swap: [
          ['    body:\n      type: JobApplication\n', '    headers:\n      Location:\n        type: string\n    body:\n      type: JobApplication\n'],
          ['        headers:\n          Location:\n            type: string\n            description: The URL of the new application.\n', ''],
        ],
        fails: '201 with a Location header',
      },
      { swap: [['      201:\n', '      200:\n']], fails: '201 with a Location header' },
      { swap: [['      type: JobApplication\n', '      type: object\n']], fails: 'takes a JobApplication body' },
      { swap: [['      400:\n        description: The body is not valid.\n', '']], fails: 'returns 400' },
    ],
    right: [
      { swap: [['{applicationId}', '{id}'], ['    body:\n      type: JobApplication\n', '    body:\n      application/json:\n        type: JobApplication\n']] },
      { swap: [['availableFrom?: date-only', 'availableFrom:\n        type: date-only\n        required: false'], ['    body:\n      type: JobApplication\n', '    body: JobApplication\n']] },
    ],
  },
  {
    id: 'rm-006',
    wrong: [
      {
        swap: [
          ['      carrier: Carrier\n', '      carrier: Courier\n  Courier:\n    type: Carrier\n    properties:\n      depot: string\n'],
        ],
        fails: 'Shipment.carrier uses the Carrier type',
      },
      { swap: [['      carrier: Carrier\n', '      carrier:\n        type: object\n        properties:\n          name: string\n          phone: string\n']], fails: 'Shipment.carrier uses the Carrier type' },
      { swap: [['      carrier: Carrier\n', '      carrier: Carrier[]\n']], fails: 'Shipment.carrier uses the Carrier type' },
      { swap: [['      carrier: Carrier\n', '      carrier?: Carrier\n']], fails: 'Shipment.carrier uses the Carrier type' },
      { swap: [['shippedOn: date-only', 'shippedOn: string']], fails: 'shippedOn' },
      { swap: [['weightKg: number', 'weightKg: integer']], fails: 'weightKg' },
      { swap: [['type: Shipment[]', 'type: Shipment']], fails: 'GET /shipments returns Shipment[]' },
      { swap: [['        404:\n          description: No shipment has this tracking number.\n', '']], fails: 'returns 404' },
    ],
    right: [
      {
        swap: [
          ['          type: Shipment[]\n', '          type: ShipmentList\n'],
          ['      carrier: Carrier\n', '      carrier: Carrier\n  ShipmentList:\n    type: Shipment[]\n'],
        ],
      },
      { swap: [['      carrier: Carrier\n', '      carrier: Courier\n  Courier:\n    type: Carrier\n']] },
      { swap: [['type: Shipment[]', 'type: array\n          items: Shipment'], ['{trackingNumber}', '{number}']] },
      { swap: [['type: Shipment[]', 'type: array\n          items:\n            type: Shipment'], ['      carrier: Carrier\n', '      carrier:\n        type: Carrier\n        required: true\n']] },
    ],
  },
  {
    id: 'rm-007',
    wrong: [
      { swap: [['cancelledOn?: date-only', 'cancelledOn: date-only?']], fails: 'cancelledOn is an optional date-only' },
      { swap: [['      coverLevel?:\n', '      coverLevel:\n']], fails: 'coverLevel is optional' },
      { swap: [['enum: [ ACTIVE, LAPSED, CANCELLED ]', 'enum: [ active, lapsed, cancelled ]']], fails: 'status is required' },
      { swap: [['      status:\n        type: string\n        enum: [ ACTIVE, LAPSED, CANCELLED ]\n', '      status: string\n']], fails: 'status is required' },
      { swap: [['      status:\n', '      status?:\n']], fails: 'status is required' },
      { swap: [['enum: [ BASIC, STANDARD, PREMIUM ]', 'enum: [ BASIC, STANDARD, PREMIUM, GOLD ]']], fails: 'coverLevel is optional' },
    ],
    right: [
      {
        swap: [
          ['      status:\n        type: string\n        enum: [ ACTIVE, LAPSED, CANCELLED ]\n', '      status: PolicyStatus\n'],
          ['      coverLevel?:\n        type: string\n        enum: [ BASIC, STANDARD, PREMIUM ]\n', '      coverLevel?: CoverLevel\n'],
          ['types:\n  Policy:\n', 'types:\n  PolicyStatus:\n    type: string\n    enum: [ ACTIVE, LAPSED, CANCELLED ]\n  CoverLevel:\n    type: string\n    enum: [ BASIC, STANDARD, PREMIUM ]\n  Policy:\n'],
        ],
      },
      { swap: [['enum: [ ACTIVE, LAPSED, CANCELLED ]', 'enum: [ CANCELLED, ACTIVE, LAPSED ]'], ['cancelledOn?: date-only', 'cancelledOn:\n        type: date-only\n        required: false'], ['{policyNumber}', '{number}']] },
    ],
  },
  {
    id: 'rm-008',
    wrong: [
      { swap: [['quantity: integer', 'quantity: number']], fails: 'quantity is still an integer' },
      { swap: [['issuedOn: date-only', 'issuedOn: string']], fails: 'issuedOn is still a date-only' },
      { swap: [['patientId: string', 'patientId?: string']], fails: 'patientId is still a required string' },
      { swap: [['enum: [ ISSUED, DISPENSED, CANCELLED ]', 'enum: [ ISSUED, DISPENSED, CANCELLED, EXPIRED ]']], fails: 'status keeps its enum' },
      { swap: [['      quantity: 30\n', '      quantity: "30"\n']], fails: valid },
      { swap: [['      issuedOn: 2026-03-12\n', '      issuedOn: 12/03/2026\n']], fails: valid },
      {
        swap: [['            - prescriptionId: RX-2041\n              patientId: P-7788\n              drug: Amoxicillin 500mg\n              quantity: 30\n              status: ISSUED\n              issuedOn: 2026-03-12\n', '            prescriptionId: RX-2041\n            patientId: P-7788\n            drug: Amoxicillin 500mg\n            quantity: 30\n            status: ISSUED\n            issuedOn: 2026-03-12\n']],
        fails: valid,
      },
      { swap: [['    example:\n      prescriptionId: RX-2041\n      patientId: P-7788\n      drug: Amoxicillin 500mg\n      quantity: 30\n      status: ISSUED\n      issuedOn: 2026-03-12\n', '']], fails: 'Prescription keeps an example' },
    ],
    right: [
      { swap: [['    example:\n      prescriptionId: RX-2041\n      patientId: P-7788\n      drug: Amoxicillin 500mg\n      quantity: 30\n      status: ISSUED\n      issuedOn: 2026-03-12\n', '    examples:\n      issued:\n        prescriptionId: RX-2041\n        patientId: P-7788\n        drug: Amoxicillin 500mg\n        quantity: 30\n        status: ISSUED\n        issuedOn: 2026-03-12\n']] },
      { swap: [['          type: Prescription[]\n', '          type: array\n          items: Prescription\n']] },
      { swap: [['          example:\n            - prescriptionId: RX-2041\n              patientId: P-7788\n              drug: Amoxicillin 500mg\n              quantity: 30\n              status: ISSUED\n              issuedOn: 2026-03-12\n', '']] },
    ],
  },
  {
    id: 'rm-009',
    wrong: [
      { swap: [['    get:\n      headers:\n        X-Correlation-ID:\n', '    get:\n      headers:\n        X-Correlation-ID?:\n']], fails: 'GET /subscribers/{msisdn} requires' },
      { swap: [['    get:\n      headers:\n', '    get:\n      queryParameters:\n']], fails: 'GET /subscribers/{msisdn} requires' },
      {
        swap: [['  /{msisdn}:\n    get:\n      headers:\n        X-Correlation-ID:\n          type: string\n          description: Identifies this request across all systems.\n', '  /{msisdn}:\n    headers:\n      X-Correlation-ID:\n        type: string\n    get:\n']],
        fails: 'GET /subscribers/{msisdn} requires',
      },
      { swap: [['      post:\n        headers:\n          X-Correlation-ID:\n            type: string\n            description: Identifies this request across all systems.\n', '      post:\n']], fails: 'sim-swaps requires' },
      { swap: [['          headers:\n            X-Correlation-ID:\n              type: string\n        404:', '        404:']], fails: 'The 200 sends X-Correlation-ID back' },
      { swap: [['            headers:\n              X-Correlation-ID:\n                type: string\n          400:', '          400:']], fails: 'The 202 sends X-Correlation-ID back' },
      { swap: [['          202:\n', '          200:\n']], fails: 'The 202 sends X-Correlation-ID back' },
      { swap: [['          400:\n            description: The X-Correlation-ID header is missing.\n', '']], fails: 'returns 400' },
    ],
    right: [
      {
        swap: [
          ['/subscribers:\n', 'traits:\n  correlated:\n    headers:\n      X-Correlation-ID:\n        type: string\n\n/subscribers:\n'],
          ['    get:\n      headers:\n        X-Correlation-ID:\n          type: string\n          description: Identifies this request across all systems.\n', '    get:\n      is: [ correlated ]\n'],
          ['      post:\n        headers:\n          X-Correlation-ID:\n            type: string\n            description: Identifies this request across all systems.\n', '      post:\n        is: [ correlated ]\n'],
        ],
      },
      { swap: [['          headers:\n            X-Correlation-ID:\n              type: string\n        404:', '          headers:\n            x-correlation-id:\n              type: string\n        404:'], ['{msisdn}', '{number}']] },
    ],
  },
  {
    id: 'rm-010',
    wrong: [
      { swap: [['/customers:\n', '/addresses:\n  get:\n    responses:\n      200:\n        body:\n          type: Address[]\n/customers:\n']], fails: 'no top-level /addresses' },
      { swap: [['              type: Address[]\n', '              type: Address\n']], fails: 'addresses returns Address[]' },
      {
        swap: [['      /{addressId}:\n        get:\n          responses:\n            200:\n              body:\n                type: Address\n            404:\n              description: This customer has no such address.\n', '    /{addressId}:\n      get:\n        responses:\n          200:\n            body:\n              type: Address\n          404:\n            description: This customer has no such address.\n']],
        fails: '{addressId} returns an Address',
      },
      { swap: [['          201:\n', '          200:\n']], fails: 'takes an Address and returns 201' },
      { swap: [['        404:\n          description: No customer has this id.\n', '']], fails: 'GET /customers/{customerId} returns 200, or 404' },
    ],
    right: [
      {
        swap: [[
          '/customers:\n  /{customerId}:\n    get:\n      responses:\n        200:\n          description: The customer.\n        404:\n          description: No customer has this id.\n    /addresses:\n      get:\n        responses:\n          200:\n            body:\n              type: Address[]\n      post:\n        body:\n          type: Address\n        responses:\n          201:\n            description: The address was added.\n      /{addressId}:\n',
          '/customers/{customerId}:\n  get:\n    responses:\n      200:\n        description: The customer.\n      404:\n        description: No customer has this id.\n  /addresses:\n    get:\n      responses:\n        200:\n          body:\n            type: Address[]\n    post:\n      body:\n        type: Address\n      responses:\n        201:\n          description: The address was added.\n    /{addressId}:\n',
        ]],
      },
      { swap: [['{customerId}', '{id}'], ['{addressId}', '{addressNumber}'], ['              type: Address[]\n', '              type: array\n              items: Address\n']] },
    ],
  },
  {
    id: 'rm-011',
    wrong: [
      { swap: [['correlationId?: string', 'correlationId: string'], ['      message: No rooms of this kind are free on these dates.\n', '      message: No rooms of this kind are free on these dates.\n      correlationId: abc\n']], fails: 'optional string correlationId' },
      { swap: [['      500:\n        body:\n          type: Error\n  /{reservationId}:', '  /{reservationId}:']], fails: 'POST /reservations returns Error on 400 and 500' },
      { swap: [['      400:\n        body:\n          type: Error\n', '      400:\n        body:\n          type: object\n          properties:\n            error: string\n']], fails: 'POST /reservations returns Error on 400 and 500' },
      { swap: [['        404:\n          body:\n            type: Error\n', '        404:\n          description: No reservation has this id.\n']], fails: 'returns Error on 400, 404 and 500' },
      { swap: [['    example:\n      code: ROOM_NOT_AVAILABLE\n      message: No rooms of this kind are free on these dates.\n', '']], fails: 'Error has an example' },
      { swap: [['      code: string\n', '      code?: string\n']], fails: 'Error has a required string code' },
    ],
    right: [
      {
        swap: [
          ['/reservations:\n', 'traits:\n  failures:\n    responses:\n      400:\n        body:\n          type: Error\n      500:\n        body:\n          type: Error\n\n/reservations:\n'],
          ['  post:\n    responses:\n      201:\n        description: The reservation was created.\n      400:\n        body:\n          type: Error\n      500:\n        body:\n          type: Error\n', '  post:\n    is: [ failures ]\n    responses:\n      201:\n        description: The reservation was created.\n'],
          ['    get:\n      responses:\n        200:\n          description: The reservation.\n        400:\n          body:\n            type: Error\n        404:\n          body:\n            type: Error\n        500:\n          body:\n            type: Error\n', '    get:\n      is: [ failures ]\n      responses:\n        200:\n          description: The reservation.\n        404:\n          body:\n            type: Error\n'],
        ],
      },
      {
        swap: [
          ['    example:\n      code: ROOM_NOT_AVAILABLE\n      message: No rooms of this kind are free on these dates.\n', '    examples:\n      noRooms:\n        code: ROOM_NOT_AVAILABLE\n        message: No rooms of this kind are free on these dates.\n'],
          ['{reservationId}', '{id}'],
          ['correlationId?: string', 'correlationId:\n        type: string\n        required: false'],
        ],
      },
    ],
  },
  {
    id: 'rm-012',
    wrong: [
      { swap: [['  Lecturer:\n    type: Staff\n', '  Lecturer:\n    type: Person\n']], fails: 'Lecturer inherits from Staff' },
      { swap: [['  Student:\n    type: Person\n    properties:\n', '  Student:\n    type: object\n    properties:\n      personId: string\n      fullName: string\n      email: string\n']], fails: 'Student inherits from Person' },
      { swap: [['      department: Physics\n', '']], fails: valid },
      { swap: [['officeRoom?: string', 'officeRoom: string']], fails: 'Lecturer adds an optional string officeRoom' },
      { swap: [['enrolledOn: date-only', 'enrolledOn: datetime-only']], fails: 'Student adds studentNumber and enrolledOn' },
      { swap: [['  Staff:\n    type: Person\n    properties:\n      department: string\n', '  Staff:\n    type: Person\n']], fails: 'Staff adds a required string department' },
    ],
    right: [
      { swap: [['  Staff:\n    type: Person\n', '  Staff:\n    type: [ Person ]\n']] },
      { swap: [['{studentId}', '{id}'], ['{lecturerId}', '{id}'], ['officeRoom?: string', 'officeRoom:\n        type: string\n        required: false']] },
      { swap: [['    example:\n      personId: P-3310\n      fullName: Maya Rao\n      email: maya.rao@example.edu\n      department: Physics\n      officeRoom: B-214\n', '    examples:\n      withOffice:\n        personId: P-3310\n        fullName: Maya Rao\n        email: maya.rao@example.edu\n        department: Physics\n        officeRoom: B-214\n      noOffice:\n        personId: P-3311\n        fullName: Tom Hale\n        email: tom.hale@example.edu\n        department: Physics\n']] },
    ],
  },
  {
    id: 'rm-013',
    wrong: [
      { swap: [['pattern: ^[A-Z0-9]{6}$', "pattern: '[A-Z0-9]{6}'"]], fails: 'reference has a pattern' },
      { swap: [['pattern: ^[A-Z0-9]{6}$', 'pattern: ^[A-Z0-9]{6,}$']], fails: 'reference has a pattern' },
      { swap: [['pattern: ^[A-Z0-9]{6}$', 'pattern: ^[A-Za-z0-9]{6}$']], fails: 'reference has a pattern' },
      { swap: [['        minItems: 1\n', '']], fails: 'passengers is a list of Passenger' },
      { swap: [['        maxItems: 9\n', '        maxItems: 10\n']], fails: 'passengers is a list of Passenger' },
      { swap: [['        minLength: 2\n', '']], fails: 'fullName is a string of 2 to 60' },
      { swap: [['      age:\n        type: integer\n', '      age:\n        type: number\n']], fails: 'age is an integer' },
      { swap: [['        maximum: 32\n', '']], fails: 'baggageKg is a number from 0 to 32' },
    ],
    right: [
      { swap: [['        type: Passenger[]\n', '        type: array\n        items: Passenger\n']] },
      { swap: [['pattern: ^[A-Z0-9]{6}$', "pattern: '^[0-9A-Z]{6}$'"]] },
      {
        swap: [
          ['      reference:\n        type: string\n        pattern: ^[A-Z0-9]{6}$\n', '      reference: BookingReference\n'],
          ['types:\n  Passenger:\n', 'types:\n  BookingReference:\n    type: string\n    pattern: ^[A-Z0-9]{6}$\n  Passenger:\n'],
        ],
      },
    ],
  },
  {
    id: 'rm-014',
    wrong: [
      { swap: [['type: CardPayment | DirectDebit', 'type: [ CardPayment, DirectDebit ]']], fails: 'Payment is a union' },
      { swap: [['promoCode: string | nil', 'promoCode?: string']], fails: 'promoCode is always present' },
      { swap: [['promoCode: string | nil', 'promoCode: string']], fails: 'promoCode is always present' },
      { swap: [['promoCode: string | nil', 'promoCode?: string | nil']], fails: 'promoCode is always present' },
      { swap: [['enum: [ CARD ]', 'enum: [ CARD, DIRECT_DEBIT ]']], fails: 'CardPayment has kind CARD' },
      { swap: [['enum: [ DIRECT_DEBIT ]', 'enum: [ CARD, DIRECT_DEBIT ]']], fails: 'DirectDebit has kind DIRECT_DEBIT' },
      { swap: [['      payment: Payment\n', '      payment: CardPayment\n']], fails: 'Membership.payment uses Payment' },
      { swap: [['              type: Payment[]\n', '              type: Payment\n']], fails: 'returns Payment[]' },
    ],
    right: [
      { swap: [['type: CardPayment | DirectDebit', 'type: DirectDebit | CardPayment'], ['promoCode: string | nil', 'promoCode: string?']] },
      { swap: [['    examples:\n      card:\n        kind: CARD\n        cardToken: tok_8841\n      debit:\n        kind: DIRECT_DEBIT\n        mandateId: MD-20-7731\n', '    example:\n      kind: CARD\n      cardToken: tok_8841\n'], ['promoCode: string | nil', 'promoCode: nil | string']] },
      { swap: [['promoCode: string | nil', 'promoCode:\n        type: string | nil\n        required: true'], ['              type: Payment[]\n', '              type: array\n              items: Payment\n']] },
    ],
  },
  {
    id: 'rm-015',
    wrong: [
      { swap: [['      price?: number\n', '      price: number\n']], fails: 'In ListingPatch' },
      { swap: [['        type: ListingPatch\n', '        type: Listing\n']], fails: 'PATCH takes a ListingPatch' },
      { swap: [['        204:\n          description: The listing was removed.\n', '        204:\n          body:\n            type: Listing\n']], fails: 'DELETE returns 204 with no body' },
      { swap: [['        204:\n', '        200:\n']], fails: 'DELETE returns 204 with no body' },
      { swap: [['  /{listingId}:\n    put:\n', '  /{listingId}:\n    post:\n      body:\n        type: Listing\n      responses:\n        201:\n          description: The listing was saved.\n    put:\n']], fails: 'A single listing offers no POST' },
      { swap: [['          description: The listing was removed.\n        404:\n          description: No listing has this id.\n', '          description: The listing was removed.\n']], fails: 'PUT, PATCH and DELETE return 404' },
      { swap: [['      body:\n        type: Listing\n      responses:\n        200:\n          body:\n            type: Listing\n', '      body:\n        type: ListingPatch\n      responses:\n        200:\n          body:\n            type: Listing\n']], fails: 'PUT takes a whole Listing' },
    ],
    right: [
      {
        swap: [
          ['      status:\n        type: string\n        enum: [ FOR_SALE, SOLD ]\n', '      status: ListingStatus\n'],
          ['      status?:\n        type: string\n        enum: [ FOR_SALE, SOLD ]\n', '      status?: ListingStatus\n'],
          ['types:\n  Listing:\n', 'types:\n  ListingStatus:\n    type: string\n    enum: [ FOR_SALE, SOLD ]\n  Listing:\n'],
        ],
      },
      {
        swap: [
          ['/listings:\n', 'traits:\n  notFound:\n    responses:\n      404:\n        description: No listing has this id.\n\n/listings:\n'],
          ['  /{listingId}:\n', '  /{id}:\n    is: [ notFound ]\n'],
          ['        404:\n          description: No listing has this id.\n', ''],
          ['        404:\n          description: No listing has this id.\n', ''],
          ['        404:\n          description: No listing has this id.\n', ''],
        ],
      },
      { swap: [['  ListingPatch:\n    type: object\n', '  ListingPatch:\n    type: object\n    minProperties: 1\n']] },
    ],
  },
  {
    id: 'rm-016',
    wrong: [
      {
        swap: [
          ['        type: <<fieldType>>\n', '        type: string\n'],
          ['    is: [ filterable: { field: priority, fieldType: integer } ]\n', '    is: [ filterable: { field: priority, fieldType: integer } ]\n    queryParameters:\n      priority?: integer\n'],
        ],
        fails: 'is <<fieldType>>',
      },
      { swap: [['        required: false\n', '']], fails: 'GET /machines has an optional string plant' },
      { swap: [['      <<field>>:\n        type: <<fieldType>>\n', '      plant:\n        type: string\n']], fails: 'adds a query parameter named <<field>>' },
      { swap: [['{ field: priority, fieldType: integer }', '{ field: priority, fieldType: string }']], fails: 'GET /work-orders has an optional integer priority' },
      { swap: [['    is: [ filterable: { field: priority, fieldType: integer } ]\n', '    queryParameters:\n      priority?: integer\n']], fails: 'GET /work-orders uses filterable' },
      { swap: [['{ field: plant, fieldType: string }', '{ field: plantCode, fieldType: string }']], fails: 'GET /machines has an optional string plant' },
    ],
    right: [
      { swap: [['      <<field>>:\n        type: <<fieldType>>\n        required: false\n        description: Keep only the items that match this <<field>>.\n', '      <<field>>?: <<fieldType>>\n']] },
      { swap: [['      <<field>>:\n        type: <<fieldType>>\n', '      << field >>:\n        type: << fieldType >>\n']] },
      { swap: [['      <<field>>:\n        type: <<fieldType>>\n        required: false\n', '      <<field>>?:\n        type: <<fieldType>>\n']] },
      { swap: [['/machines:\n  get:\n    is: [ filterable: { field: plant, fieldType: string } ]\n', '/machines:\n  is: [ filterable: { field: plant, fieldType: string } ]\n  get:\n']] },
      { swap: [['    is: [ filterable: { field: priority, fieldType: integer } ]\n', '    is:\n      - filterable:\n          field: priority\n          fieldType: integer\n']] },
    ],
  },
  {
    id: 'rm-017',
    wrong: [
      { swap: [['<<resourcePathName | !singularize>>Code?:', '<<resourcePathName>>Code?:']], fails: '!singularize gives' },
      { swap: [['            type: <<itemType>>[]\n', '            type: <<itemType>>\n']], fails: 'The list response gets its type' },
      { swap: [['/depots:\n  type: { collection: { itemType: Depot } }\n', '/depots:\n  type: { collection: { itemType: Depot } }\n  get:\n    responses:\n      200:\n        body:\n          type: Depot[]\n']], fails: '/depots and /carriers use the collection' },
      { swap: [['{ item: { itemType: Carrier } }', '{ item: { itemType: Depot } }']], fails: 'GET on one depot or carrier' },
      { swap: [['        404:\n          description: No <<resourcePathName | !singularize>> has this id.\n', '']], fails: 'GET on one depot or carrier' },
      { swap: [['  /{carrierId}:\n    type: { item: { itemType: Carrier } }\n', '  /{carrierId}:\n    get:\n      responses:\n        200:\n          body:\n            type: Carrier\n        404:\n          description: No carrier has this id.\n']], fails: 'use the item resource type' },
      { swap: [['    get:\n      description: List the', '    get?:\n      description: List the']], fails: 'The list response gets its type' },
    ],
    right: [
      { swap: [['  type: { collection: { itemType: Depot } }\n', '  type:\n    collection:\n      itemType: Depot\n']] },
      { swap: [['            type: <<itemType>>[]\n', '            type: array\n            items: <<itemType>>\n']] },
      {
        swap: [
          ['<<itemType>>[]', '<<entity>>[]'],
          ['<<itemType>>', '<<entity>>'],
          ['<<itemType>>', '<<entity>>'],
          ['{ itemType: Depot }', '{ entity: Depot }'],
          ['{ itemType: Depot }', '{ entity: Depot }'],
          ['{ itemType: Carrier }', '{ entity: Carrier }'],
          ['{ itemType: Carrier }', '{ entity: Carrier }'],
        ],
      },
      { swap: [['<<resourcePathName | !singularize>>Code?:\n          type: string\n', '<<resourcePathName | !singularize>>Code:\n          type: string\n          required: false\n'], ['{depotId}', '{id}'], ['{carrierId}', '{id}']] },
    ],
  },
  {
    id: 'rm-018',
    wrong: [
      { swap: [['  post:\n    is: [ writeAccess ]\n', '  post:\n    is: [ readAccess ]\n']], fails: 'POST /accounts uses writeAccess' },
      { swap: [['  writeAccess:\n    securedBy: [ oauth2: { scopes: [ accounts:write ] } ]\n', '  writeAccess:\n    securedBy: [ oauth2: { scopes: [ accounts:read ] } ]\n']], fails: 'POST /accounts needs accounts:write' },
      { swap: [['  readAccess:\n    securedBy: [ oauth2: { scopes: [ accounts:read ] } ]\n', '  readAccess:\n    securedBy: [ oauth2: { scopes: [ accounts:read, accounts:write ] } ]\n']], fails: 'Both GET methods need accounts:read' },
      { swap: [['  readAccess:\n    securedBy: [ oauth2: { scopes: [ accounts:read ] } ]\n', '  readAccess:\n    securedBy: [ oauth2 ]\n']], fails: 'Both GET methods need accounts:read' },
      { swap: [['      scopes: [ accounts:read, accounts:write ]\n', '      scopes: [ accounts:read ]\n']], fails: 'oauth2 is an OAuth 2.0 scheme' },
      { swap: [['authorizationGrants: [ authorization_code ]', 'authorizationGrants: [ client_credentials ]']], fails: 'oauth2 is an OAuth 2.0 scheme' },
      { swap: [['      accessTokenUri: https://auth.example.com/token\n', '      accessTokenUri: https://auth.example.com/authorize\n']], fails: 'oauth2 is an OAuth 2.0 scheme' },
      { swap: [['  readAccess:\n    securedBy: [ oauth2: { scopes: [ accounts:read ] } ]\n', '  readAccess:\n    description: Read access.\n']], fails: 'readAccess and writeAccess each hold securedBy' },
      { swap: [['    responses:\n      403:\n        description: The token does not hold the write scope.\n', '']], fails: 'returns 403' },
    ],
    right: [
      { swap: [['  readAccess:\n    securedBy: [ oauth2: { scopes: [ accounts:read ] } ]\n', '  readAccess:\n    securedBy:\n      - oauth2:\n          scopes:\n            - accounts:read\n']] },
      { swap: [['  /{accountId}:\n    get:\n      is: [ readAccess ]\n', '  /{id}:\n    is: [ readAccess ]\n    get:\n']] },
      {
        swap: [
          ['    responses:\n      403:\n        description: The token does not hold the write scope.\n', ''],
          ['        description: The account was opened.\n', '        description: The account was opened.\n      403:\n        description: The token does not hold the write scope.\n'],
        ],
      },
    ],
  },
  {
    id: 'rm-019',
    wrong: [
      { swap: [['securedBy: [ clientIdEnforcement ]\n\n', '']], fails: 'Both methods are secured' },
      { swap: [['securedBy: [ clientIdEnforcement ]\n\n', ''], ['/employees:\n  get:\n', '/employees:\n  get:\n    securedBy: [ clientIdEnforcement ]\n']], fails: 'Both methods are secured' },
      { swap: [['    type: Pass Through\n', '    type: Basic Authentication\n']], fails: 'clientIdEnforcement is a Pass Through scheme' },
      { swap: [['        client_secret:\n          type: string\n', '']], fails: 'clientIdEnforcement is a Pass Through scheme' },
      { swap: [['        client_id:\n', '        client_id?:\n']], fails: 'clientIdEnforcement is a Pass Through scheme' },
      { swap: [['      headers:\n        client_id:', '      queryParameters:\n        client_id:']], fails: 'clientIdEnforcement is a Pass Through scheme' },
      { swap: [['      responses:\n        401:\n          description: The client id or client secret is missing or wrong.\n', '']], fails: 'clientIdEnforcement is a Pass Through scheme' },
    ],
    right: [
      { swap: [['securedBy: [ clientIdEnforcement ]\n\n', ''], ['/employees:\n  get:\n', '/employees:\n  get:\n    securedBy: [ clientIdEnforcement ]\n'], ['  /{employeeId}:\n    get:\n', '  /{employeeId}:\n    get:\n      securedBy: [ clientIdEnforcement ]\n']] },
      { swap: [['securedBy: [ clientIdEnforcement ]\n\n', ''], ['/employees:\n  get:\n', '/employees:\n  securedBy: [ clientIdEnforcement ]\n  get:\n'], ['  /{employeeId}:\n    get:\n', '  /{id}:\n    securedBy: [ clientIdEnforcement ]\n    get:\n']] },
      { swap: [['        client_id:\n          type: string\n        client_secret:\n          type: string\n', '        client_id: string\n        client_secret: string\n'], ['          type: Employee[]\n', '          type: array\n          items: Employee\n']] },
    ],
  },
  {
    id: 'rm-020',
    wrong: [
      { swap: [['          attribute: true\n', '          attribute: false\n']], fails: 'policyId is an attribute' },
      { swap: [['          attribute: true\n', '          name: id\n']], fails: 'policyId is an attribute' },
      { swap: [['        xml:\n          attribute: true\n', '']], fails: 'policyId is an attribute' },
      { swap: [['            application/xml:\n              type: Policy\n', '']], fails: 'returns Policy as JSON and as XML' },
      { swap: [['      application/xml:\n        type: Policy\n', '']], fails: 'POST /policies accepts Policy as JSON and as XML' },
      { swap: [['      application/xml:\n        type: Policy\n', '      text/xml:\n        type: Policy\n']], fails: 'POST /policies accepts Policy as JSON and as XML' },
      { swap: [['      415:\n', '      406:\n']], fails: 'returns 415' },
      { swap: [['        406:\n', '        415:\n']], fails: 'returns 406' },
    ],
    right: [
      {
        swap: [
          ['title: Policy API\n', 'title: Policy API\nmediaType: [ application/json, application/xml ]\n'],
          ['    body:\n      application/json:\n        type: Policy\n      application/xml:\n        type: Policy\n', '    body:\n      type: Policy\n'],
          ['          body:\n            application/json:\n              type: Policy\n            application/xml:\n              type: Policy\n', '          body:\n            type: Policy\n'],
        ],
      },
      { swap: [['          attribute: true\n', '          attribute: true\n          name: id\n'], ['{policyId}', '{id}']] },
    ],
  },
  {
    id: 'rm-021',
    wrong: [
      { swap: [['(owner): Patient Systems\n\n', '']], fails: 'The API is marked with (owner)' },
      { swap: [['      fullName:\n        type: string\n        (dataClass): SENSITIVE\n', '      fullName:\n        type: string\n        (dataClass): INTERNAL\n']], fails: 'fullName and dateOfBirth are marked SENSITIVE' },
      { swap: [['        type: date-only\n        (dataClass): SENSITIVE\n', '        type: date-only\n']], fails: 'fullName and dateOfBirth are marked SENSITIVE' },
      { swap: [['        (dataClass): INTERNAL\n', '        description: Internal data.\n']], fails: 'patientId is marked INTERNAL' },
      { swap: [['    enum: [ PUBLIC, INTERNAL, SENSITIVE ]\n', '']], fails: 'owner is a string annotation' },
      { swap: [['        type: date-only\n', '        type: datetime\n'], ['dateOfBirth: 1984-03-12', 'dateOfBirth: 1984-03-12T00:00:00Z']], fails: 'Patient has required patientId' },
      { swap: [['allowedTargets: TypeDeclaration', 'allowedTargets: Method']], fails: valid },
      { swap: [['documentation:\n  - title: Getting started\n    content: Ask the Patient Systems team for access, then read one patient by id.\n\n', '']], fails: 'documentation section' },
      { swap: [['    example:\n      patientId: P-20417\n      fullName: Asha Rao\n      dateOfBirth: 1984-03-12\n', '']], fails: 'returns a Patient with an example' },
    ],
    right: [
      { swap: [['  owner:\n    type: string\n', '  owner: string\n'], ['allowedTargets: TypeDeclaration', 'allowedTargets: [ TypeDeclaration ]']] },
      {
        swap: [
          ['    example:\n      patientId: P-20417\n      fullName: Asha Rao\n      dateOfBirth: 1984-03-12\n', ''],
          ['            type: Patient\n', '            type: Patient\n            example:\n              patientId: P-20417\n              fullName: Asha Rao\n              dateOfBirth: 1984-03-12\n'],
          ['{patientId}', '{id}'],
        ],
      },
    ],
  },
  {
    id: 'rm-022',
    wrong: [
      { swap: [['        maximum: 100\n', '']], fails: 'Paging is optional' },
      { swap: [['        default: 20\n', '']], fails: 'Paging is optional' },
      { swap: [['      limit?:\n', '      limit:\n']], fails: 'Paging is optional' },
      { swap: [['      offset?:\n        type: integer\n        minimum: 0\n        default: 0\n', '      page?:\n        type: integer\n        minimum: 1\n']], fails: 'Paging is optional' },
      { swap: [['      sortBy?:\n        type: string\n        enum: [ name, price, newest ]\n', '      sortBy?: string\n']], fails: 'sortBy is optional' },
      { swap: [['        default: asc\n', '']], fails: 'order is optional' },
      { swap: [['      maxPrice?:\n        type: number\n        minimum: 0\n', '      maxPrice?: number\n']], fails: 'minPrice and maxPrice' },
      { swap: [['      400:\n        body:\n          type: Error\n', '      400:\n        description: A value is out of range.\n']], fails: 'returns an Error with status 400' },
      { swap: [['          type: ProductPage\n', '          type: Product[]\n']], fails: 'returns ProductPage' },
      { swap: [['    example:\n      items:\n        - sku: SKU-1042\n          name: Trail Backpack\n          category: outdoor\n          price: 79.50\n      total: 1\n', '']], fails: 'returns ProductPage' },
    ],
    right: [
      { swap: [['      limit?:\n        type: integer\n        minimum: 1\n        maximum: 100\n        default: 20\n      offset?:\n        type: integer\n        minimum: 0\n        default: 0\n', '      pageSize?:\n        type: integer\n        minimum: 1\n        maximum: 100\n        default: 20\n      page?:\n        type: integer\n        minimum: 1\n']] },
      {
        swap: [
          ['traits:\n  paged:\n    queryParameters:\n      limit?:\n        type: integer\n        minimum: 1\n        maximum: 100\n        default: 20\n      offset?:\n        type: integer\n        minimum: 0\n        default: 0\n\n', ''],
          ['    is: [ paged ]\n    queryParameters:\n', '    queryParameters:\n      limit?:\n        type: integer\n        minimum: 1\n        maximum: 100\n        default: 20\n      offset?:\n        type: integer\n        minimum: 0\n'],
        ],
      },
      { swap: [['      sortBy?:\n        type: string\n        enum: [ name, price, newest ]\n', '      sortBy?: SortField\n'], ['types:\n  Product:\n', 'types:\n  SortField:\n    type: string\n    enum: [ name, price, newest ]\n  Product:\n'], ['      items: Product[]\n', '      items:\n        type: array\n        items: Product\n']] },
    ],
  },
  {
    id: 'rm-023',
    wrong: [
      { swap: [['      202:\n', '      201:\n']], fails: 'returns 202 with a BillingRun and a Location header' },
      { swap: [['        headers:\n          Location:\n            description: The URL of the status resource.\n            type: string\n', '']], fails: 'returns 202 with a BillingRun and a Location header' },
      { swap: [['        body:\n          type: BillingRun\n      409:', '      409:']], fails: 'returns 202 with a BillingRun and a Location header' },
      {
        swap: [
          ['          headers:\n            Retry-After:\n              description: Seconds to wait before asking again.\n              type: integer\n', ''],
          ['        headers:\n          Location:\n', '        headers:\n          Retry-After:\n            type: integer\n          Location:\n'],
        ],
        fails: 'The status resource returns a BillingRun and a Retry-After header',
      },
      { swap: [['enum: [ QUEUED, RUNNING, COMPLETED, FAILED ]', 'enum: [ QUEUED, RUNNING, COMPLETED ]']], fails: 'has the four job states' },
      { swap: [['        maximum: 100\n', '']], fails: 'percentComplete is an optional integer' },
      { swap: [['          409:\n            description: The run has not completed yet.\n', '          404:\n            description: The run has not completed yet.\n']], fails: 'The invoices resource returns 200' },
      { swap: [['      409:\n        description: A run for this period already exists.\n', '']], fails: 'returns 409 for a period' },
    ],
    right: [
      { swap: [['{runId}', '{id}'], ['              description: Seconds to wait before asking again.\n              type: integer\n', '              description: Seconds to wait, or a date.\n              type: string\n']] },
      {
        swap: [
          ['      status:\n        type: string\n        enum: [ QUEUED, RUNNING, COMPLETED, FAILED ]\n', '      status: RunStatus\n'],
          ['types:\n  BillingRunRequest:\n', 'types:\n  RunStatus:\n    type: string\n    enum: [ QUEUED, RUNNING, COMPLETED, FAILED ]\n  BillingRunRequest:\n'],
        ],
      },
      {
        swap: [
          ['/billing-runs:\n', 'traits:\n  polled:\n    responses:\n      200:\n        headers:\n          Retry-After:\n            type: integer\n\n/billing-runs:\n'],
          ['    get:\n      responses:\n        200:\n          headers:\n            Retry-After:\n              description: Seconds to wait before asking again.\n              type: integer\n          body:\n', '    get:\n      is: [ polled ]\n      responses:\n        200:\n          body:\n'],
        ],
      },
    ],
  },
  {
    id: 'rm-024',
    wrong: [
      { swap: [['          multipart/form-data:\n            type: DocumentUpload\n', '          application/json:\n            type: DocumentUpload\n']], fails: 'POST takes multipart/form-data' },
      { swap: [['          multipart/form-data:\n            type: DocumentUpload\n', '          type: DocumentUpload\n']], fails: 'POST takes multipart/form-data' },
      { swap: [['fileTypes: [ application/pdf, image/jpeg ]', 'fileTypes: [ application/pdf ]']], fails: 'file is a required file limited to PDF and JPEG' },
      { swap: [['fileTypes: [ application/pdf, image/jpeg ]', 'fileTypes: [ application/pdf, image/jpeg, image/png ]']], fails: 'file is a required file limited to PDF and JPEG' },
      { swap: [['        type: file\n        fileTypes: [ application/pdf, image/jpeg ]\n        maxLength: 10485760\n', '        type: string\n        maxLength: 10485760\n']], fails: 'file is a required file limited to PDF and JPEG' },
      { swap: [['maxLength: 10485760', 'maxLength: 10000000']], fails: 'file is limited to 10 MB' },
      { swap: [['      documentType: DocumentType\n', '      documentType: string\n']], fails: 'DocumentUpload has a required documentType' },
      { swap: [['          413:\n            description: The file is larger than 10 MB.\n', '']], fails: 'returns 413' },
      { swap: [['          415:\n', '          400:\n']], fails: 'returns 415' },
    ],
    right: [
      { swap: [['fileTypes: [ application/pdf, image/jpeg ]', 'fileTypes: [ image/jpeg, application/pdf ]'], ['      documentType: DocumentType\n', '      documentType:\n        type: DocumentType\n        required: true\n']] },
      {
        swap: [[
          '/applications:\n  /{applicationId}:\n    /documents:\n      post:\n        body:\n          multipart/form-data:\n            type: DocumentUpload\n        responses:\n          201:\n            body:\n              type: Document\n          404:\n            description: No application has this id.\n          413:\n            description: The file is larger than 10 MB.\n          415:\n            description: The file is not a PDF or a JPEG.\n',
          '/applications/{id}/documents:\n  post:\n    body:\n      multipart/form-data:\n        type: DocumentUpload\n    responses:\n      201:\n        body:\n          type: Document\n      404:\n        description: No application has this id.\n      413:\n        description: The file is larger than 10 MB.\n      415:\n        description: The file is not a PDF or a JPEG.\n',
        ]],
      },
    ],
  },
  {
    id: 'rm-025',
    wrong: [
      { swap: [['    discriminator: paymentType\n', '']], fails: 'Payment uses paymentType as its discriminator' },
      { swap: [['    discriminator: paymentType\n', '    discriminator: type\n']], fails: 'Payment uses paymentType as its discriminator' },
      { swap: [['discriminatorValue: CARD', 'discriminatorValue: card']], fails: 'CardPayment extends Payment' },
      { swap: [['    discriminatorValue: WALLET\n', '']], fails: 'WalletPayment extends Payment' },
      { swap: [['  CardPayment:\n    type: Payment\n', '  CardPayment:\n    type: object\n']], fails: 'CardPayment extends Payment' },
      { swap: [['      last4: "4242"\n', '      last4: 4242\n']], fails: valid },
      { swap: [['      last4: string\n', '      last4?: string\n']], fails: 'CardPayment extends Payment' },
      { swap: [['        body:\n          type: Payment\n        responses:\n', '        body:\n          type: CardPayment\n        responses:\n']], fails: 'POST takes a Payment body' },
      { swap: [['          422:\n', '          400:\n']], fails: 'POST returns 404 for an unknown booking and 422' },
    ],
    right: [
      { swap: [['      paymentType: string\n', '      paymentType:\n        type: string\n        enum: [ CARD, BANK_TRANSFER, WALLET ]\n'], ['{bookingId}', '{id}']] },
      { swap: [['    example:\n      paymentType: CARD\n      amount: 240.00\n      currency: EUR\n      last4: "4242"\n', '    examples:\n      visa:\n        paymentType: CARD\n        amount: 240.00\n        currency: EUR\n        last4: "4242"\n']] },
    ],
  },
  {
    id: 'rm-026',
    wrong: [
      { swap: [['enum: [ ACTIVE, SUSPENDED, CLOSED ]', 'enum: [ A, S, C ]'], ['      status: ACTIVE\n', '      status: A\n']], fails: 'CustomerStatus uses business words' },
      { swap: [['      customerId: string\n', '      CUST_ID: string\n'], ['      customerId: C-88213\n', '      CUST_ID: C-88213\n']], fails: 'The database path is gone' },
      { swap: [['/customers:\n  get:\n', '/CUST_MSTR:\n  get:\n']], fails: 'The database path is gone' },
      { swap: [['      status: CustomerStatus\n', '      status: string\n']], fails: 'Customer has a required status of type CustomerStatus' },
      { swap: [['joinedOn: date-only', 'joinedOn: datetime'], ['joinedOn: 2019-06-14', 'joinedOn: 2019-06-14T00:00:00Z']], fails: 'joinedOn is a required date-only' },
      { swap: [['      status?: CustomerStatus\n', '      status?: string\n']], fails: 'optional status filter' },
      { swap: [['        headers:\n          Retry-After:\n            description: Seconds to wait before trying again.\n            type: integer\n', '']], fails: 'Both methods return an Error with 503' },
      { swap: [['      is: [ backendErrors ]\n', '']], fails: 'Both methods return an Error with 503' },
      { swap: [['        404:\n          body:\n            type: Error\n', '        404:\n          description: No customer has this id.\n']], fails: 'or an Error with 404' },
    ],
    right: [
      {
        swap: [
          ['traits:\n  backendErrors:\n    responses:\n      503:\n        description: The customer data cannot be reached right now.\n        headers:\n          Retry-After:\n            description: Seconds to wait before trying again.\n            type: integer\n        body:\n          type: Error\n\n', ''],
          ['    is: [ backendErrors ]\n    queryParameters:\n      status?: CustomerStatus\n    responses:\n      200:\n        body:\n          type: Customer[]\n', '    queryParameters:\n      status?: CustomerStatus\n    responses:\n      200:\n        body:\n          type: Customer[]\n      503:\n        headers:\n          Retry-After:\n            type: integer\n        body:\n          type: Error\n'],
          ['      is: [ backendErrors ]\n      responses:\n        200:\n          body:\n            type: Customer\n', '      responses:\n        200:\n          body:\n            type: Customer\n        503:\n          headers:\n            Retry-After:\n              type: integer\n          body:\n            type: Error\n'],
        ],
      },
      {
        swap: [
          ['/customers:\n  get:\n    is: [ backendErrors ]\n', '/customers:\n  is: [ backendErrors ]\n  get:\n'],
          ['  /{customerId}:\n    get:\n      is: [ backendErrors ]\n', '  /{id}:\n    is: [ backendErrors ]\n    get:\n'],
          ['      status?: CustomerStatus\n', '      status:\n        type: CustomerStatus\n        required: false\n'],
        ],
      },
    ],
  },
  {
    id: 'rm-027',
    wrong: [
      {
        swap: [
          ['    headers:\n      Idempotency-Key:\n        type: string\n        minLength: 16\n        maxLength: 64\n    responses:\n      400:', '    responses:\n      400:'],
          ['/purchases:\n  post:\n    is: [ idempotent ]\n', '/purchases:\n  post:\n    is: [ idempotent ]\n    headers:\n      Idempotency-Key:\n        type: string\n        minLength: 16\n        maxLength: 64\n'],
        ],
        fails: 'The idempotent trait holds',
      },
      { swap: [['        minLength: 16\n', '']], fails: 'Idempotency-Key is a required string' },
      { swap: [['      Idempotency-Key:\n', '      Idempotency-Key?:\n']], fails: 'Idempotency-Key is a required string' },
      { swap: [['/refunds:\n  post:\n    is: [ idempotent ]\n', '/refunds:\n  post:\n']], fails: 'Both POST methods use the idempotent trait' },
      { swap: [['        description: This key was already used with a different body.\n        body:\n          type: Error\n', '        description: This key was already used with a different body.\n']], fails: 'A reused key with a different body' },
      { swap: [['      409:\n', '      422:\n']], fails: 'The idempotent trait holds' },
      { swap: [['        headers:\n          Idempotent-Replayed?:\n            description: Present and true when this is a replay of an earlier result.\n            type: boolean\n', '']], fails: 'Idempotent-Replayed header' },
      { swap: [['      201:\n        description: The purchase, new or replayed.\n', '      200:\n        description: The purchase, new or replayed.\n']], fails: 'Each POST takes its own type' },
    ],
    right: [
      { swap: [['/purchases:\n  post:\n    is: [ idempotent ]\n', '/purchases:\n  is: [ idempotent ]\n  post:\n'], ['/refunds:\n  post:\n    is: [ idempotent ]\n', '/refunds:\n  is: [ idempotent ]\n  post:\n']] },
      { swap: [['          Idempotent-Replayed?:\n', '          Idempotent-Replayed:\n            required: false\n'], ['        minLength: 16\n', "        pattern: '^[A-Za-z0-9-]+$'\n        minLength: 16\n"]] },
    ],
  },
  {
    id: 'rm-028',
    wrong: [
      { swap: [['      status?:\n', '      status:\n']], fails: 'The filters are optional' },
      {
        swap: [['  get:\n    queryParameters:\n      status?:\n        type: string\n        enum: [ NEW, PICKED, DELIVERED, CANCELLED ]\n      customerId?: string\n', '  get:\n    body:\n      type: object\n      properties:\n        status?: string\n        customerId?: string\n']],
        fails: 'The filters are optional',
      },
      { swap: [['/orders:\n', '/getOrders:\n  post:\n    responses:\n      200:\n        body:\n          type: Order[]\n\n/orders:\n']], fails: 'The read paths are gone' },
      { swap: [['/orders:\n', '/createOrder:\n  post:\n    body:\n      type: Order\n\n/orders:\n']], fails: 'The write paths are gone' },
      { swap: [['    patch:\n', '    post:\n      responses:\n        200:\n          body:\n            type: Order\n    patch:\n']], fails: 'Reading one order is a GET' },
      { swap: [['    patch:\n', '    post:\n']], fails: 'An update is a PUT or PATCH' },
      { swap: [['          409:\n            description: The order was already delivered.\n', '          400:\n            description: The order was already delivered.\n']], fails: 'Cancelling returns 409' },
      { swap: [['        headers:\n          Location:\n            description: The URL of the new order.\n            type: string\n', '']], fails: '201 with a Location header' },
      { swap: [['      customerId: string\n', '      customerId?: string\n']], fails: 'Order keeps its properties' },
    ],
    right: [
      { swap: [['    patch:\n      body:\n        type: object\n', '    put:\n      body:\n        type: Order\n']] },
      {
        swap: [[
          '    /cancellation:\n      post:\n        responses:\n          201:\n            description: The order is cancelled and stays on record.\n          404:\n            description: No order has this id.\n          409:\n            description: The order was already delivered.\n',
          '    delete:\n      responses:\n        204:\n          description: The order is cancelled.\n        404:\n          description: No order has this id.\n        409:\n          description: The order was already delivered.\n',
        ]],
      },
      {
        swap: [
          ['        type: object\n      responses:\n        200:\n', '        type: OrderChange\n      responses:\n        200:\n'],
          ['types:\n  Order:\n', 'types:\n  OrderChange:\n    type: object\n    properties:\n      status?: string\n      total?: number\n  Order:\n'],
          ['{orderId}', '{id}'],
        ],
      },
    ],
  },
  {
    id: 'rm-029',
    wrong: [
      { swap: [['version: v2', 'version: v1']], fails: 'The version is v2' },
      { swap: [['      loyaltyNumber?: string\n      roomPreferences', '      loyaltyNumber: string\n      roomPreferences']], fails: 'loyaltyNumber is an optional string on Reservation' },
      { swap: [['      phone:\n        type: string\n        (deprecatedSince): v2\n', '']], fails: 'Every v1 property of Reservation' },
      { swap: [['      phone:\n', '      phone?:\n']], fails: 'Every v1 property of Reservation' },
      { swap: [['enum: [ CONFIRMED, CANCELLED ]', 'enum: [ CONFIRMED ]']], fails: 'status still allows' },
      { swap: [['      hotelCode?: string\n', '      hotelCode: string\n']], fails: 'hotelCode is still optional' },
      { swap: [['        (deprecatedSince): v2\n', '        description: Deprecated since v2.\n']], fails: 'phone is marked deprecated' },
      { swap: [['        (deprecatedSince): v2\n', '        (deprecatedSince): v3\n']], fails: 'phone is marked deprecated' },
      { swap: [['roomPreferences?: string[]', 'roomPreferences?: string']], fails: 'roomPreferences is an optional string[]' },
      { swap: [['      loyaltyNumber?: string\n    responses:', '      loyaltyNumber: string\n    responses:']], fails: 'new optional loyaltyNumber filter' },
    ],
    right: [
      { swap: [['roomPreferences?: string[]', 'roomPreferences?:\n        type: array\n        items: string']] },
      { swap: [['  deprecatedSince:\n    type: string\n', '  deprecatedSince: string\n'], ['{reservationId}', '{id}']] },
    ],
  },
  {
    id: 'rm-030',
    wrong: [
      { swap: [['baseUri: https://api.example.com/enrolment/{version}', 'baseUri: https://api.example.com/enrolment/v1']], fails: 'The base URI uses {version}' },
      { swap: [['  Enrolment:\n    type: EnrolmentRequest\n    properties:\n', '  Enrolment:\n    type: object\n    properties:\n      studentId: string\n      courseCode: string\n      startDate: date-only\n']], fails: 'Enrolment extends EnrolmentRequest' },
      { swap: [['securedBy: [ oauth2 ]\n\n', '']], fails: 'oauth2 is an OAuth 2.0 scheme' },
      { swap: [['authorizationGrants: [ client_credentials ]', 'authorizationGrants: [ authorization_code ]']], fails: 'oauth2 is an OAuth 2.0 scheme' },
      { swap: [['accessTokenUri: https://auth.example.com/token', 'accessTokenUri: https://auth.example.com/oauth']], fails: 'oauth2 is an OAuth 2.0 scheme' },
      { swap: [['  /{enrolmentId}:\n    is: [ traced, downstreamErrors ]\n', '  /{enrolmentId}:\n']], fails: 'All three methods use traced' },
      { swap: [['  /{enrolmentId}:\n    is: [ traced, downstreamErrors ]\n', '  /{enrolmentId}:\n    is: [ traced ]\n']], fails: 'All three methods use downstreamErrors' },
      { swap: [['      X-Correlation-Id:\n', '      X-Correlation-Id?:\n']], fails: 'All three methods use traced' },
      { swap: [['    is: [ paged ]\n', '']], fails: 'GET /enrolments uses paged' },
      { swap: [['        maximum: 100\n', '']], fails: 'GET /enrolments uses paged' },
      { swap: [['{ itemType: Enrolment, requestType: EnrolmentRequest }', '{ itemType: EnrolmentRequest, requestType: Enrolment }']], fails: 'GET /enrolments returns Enrolment[]' },
      { swap: [['  post:\n    responses:\n      409:', '  post:\n    body:\n      type: EnrolmentRequest\n    responses:\n      409:']], fails: '/enrolments uses the collection resource type' },
      { swap: [['          headers:\n            Location:\n              type: string\n', '']], fails: '201 and a Location header' },
      { swap: [['        description: The course is full, or the student is already enrolled.\n        body:\n          type: Error\n', '        description: The course is full, or the student is already enrolled.\n']], fails: 'returns an Error with status 409' },
    ],
    right: [
      {
        swap: [
          ['  is: [ traced, downstreamErrors ]\n  get:\n    is: [ paged ]\n', '  get:\n    is: [ paged, traced, downstreamErrors ]\n'],
          ['  post:\n    responses:\n      409:', '  post:\n    is: [ traced, downstreamErrors ]\n    responses:\n      409:'],
          ['  /{enrolmentId}:\n    is: [ traced, downstreamErrors ]\n    get:\n', '  /{enrolmentId}:\n    get:\n      is: [ traced, downstreamErrors ]\n'],
        ],
      },
      {
        swap: [
          ['<<itemType>>[]', '<<item>>[]'],
          ['<<requestType>>', '<<request>>'],
          ['<<itemType>>', '<<item>>'],
          ['{ itemType: Enrolment, requestType: EnrolmentRequest }', '{ item: Enrolment, request: EnrolmentRequest }'],
        ],
      },
      { swap: [['baseUri: https://api.example.com/enrolment/{version}', 'baseUri: https://api.example.com/{version}/enrolment'], ['{enrolmentId}', '{id}']] },
    ],
  },
  {
    id: 'rm-031',
    wrong: [
      {
        swap: [
          ['      total: common.Money\n', '      total: Money\n'],
          ['types:\n  Invoice:\n', 'types:\n  Money:\n    type: object\n    properties:\n      amount: number\n      currency: string\n  Invoice:\n'],
        ],
        fails: 'Money and Error are not declared again',
      },
      { swap: [['            type: common.Error\n', '            type: Error\n']], fails: '404 with a common.Error' },
      { swap: [['    is: [ common.paged ]\n', '    is: [ paged ]\n']], fails: 'GET /invoices uses common.paged' },
      { swap: [['  common: libraries/common.raml\n', '  common: !include libraries/common.raml\n']], fails: 'with the prefix common' },
      { swap: [['      amount: number\n', '      value: number\n', 'libraries/common.raml']], fails: 'The library holds Money' },
      { swap: [['      message: string\n', '      message?: string\n', 'libraries/common.raml']], fails: 'The library holds Error' },
      { swap: [['      page?: integer\n', '      page: integer\n', 'libraries/common.raml']], fails: 'The trait gives GET /invoices' },
      { swap: [['      pageSize?: integer\n', '', 'libraries/common.raml']], fails: 'The trait gives GET /invoices' },
    ],
    right: [
      { swap: [['usage: Shared parts for all finance APIs.\n\n', '', 'libraries/common.raml'], ['{invoiceId}', '{id}']] },
      { swap: [['/invoices:\n  get:\n    is: [ common.paged ]\n', '/invoices:\n  is: [ common.paged ]\n  get:\n'], ['          type: Invoice[]\n', '          type: array\n          items: Invoice\n']] },
      { swap: [['  common: libraries/common.raml\n', '  common: ./libraries/common.raml\n'], ['      page?: integer\n', '      page?:\n        type: integer\n        minimum: 1\n', 'libraries/common.raml']] },
    ],
  },
  {
    id: 'rm-032',
    wrong: [
      { swap: [['  Product: !include types/product.raml\n', '  Product:\n    type: object\n    properties:\n      sku: string\n      name: string\n      price: number\n']], fails: 'Product comes from types/product.raml' },
      { swap: [['  traced: !include traits/traced.raml\n', '  traced:\n    headers:\n      X-Correlation-Id:\n        type: string\n']], fails: 'traced comes from traits/traced.raml' },
      { swap: [['#%RAML 1.0 DataType\n', '#%RAML 1.0 Trait\n', 'types/product.raml']], fails: 'Product has a required sku' },
      { swap: [['  "price": 89.5\n', '  "price": "89.50"\n', 'examples/product.json']], fails: valid },
      { swap: [['  "name": "Trail Shoe",\n', '', 'examples/product.json']], fails: valid },
      { swap: [['            example: !include examples/product.json\n', '            example:\n              sku: TS-1001\n              name: Trail Shoe\n              price: 89.5\n']], fails: 'with the example file on the body' },
      { swap: [['            example: !include examples/product.json\n', ''], ['  price: number\n', '  price: number\nexample: !include ../examples/product.json\n', 'types/product.raml']], fails: 'with the example file on the body' },
      { swap: [['  X-Correlation-Id:\n', '  X-Correlation-Id?:\n', 'traits/traced.raml']], fails: 'required X-Correlation-Id header' },
      { swap: [['      is: [ traced ]\n', '']], fails: 'GET /products/{sku} uses traced' },
    ],
    right: [
      { swap: [['            example: !include examples/product.json\n', '            examples:\n              shoe: !include examples/product.json\n'], ['{sku}', '{productSku}']] },
      { swap: [['type: object\nproperties:\n', 'properties:\n', 'types/product.raml'], ['#%RAML 1.0 Trait\n', '#%RAML 1.0 Trait\nusage: Apply to any method.\n', 'traits/traced.raml']] },
      { swap: [['  /{sku}:\n    get:\n      is: [ traced ]\n', '  /{sku}:\n    is: [ traced ]\n    get:\n']] },
    ],
  },
  {
    id: 'rm-033',
    wrong: [
      { swap: [['    is: [ core.paged ]\n', '    is: [ core.paged ]\n    responses:\n      200:\n        body:\n          type: Claim[]\n']], fails: '/claims uses core.collection' },
      { swap: [['  get:\n    is: [ core.paged ]\n', '  get:\n    is: [ core.paged ]\n  post:\n    responses:\n      409:\n        body:\n          type: core.errors.Error\n']], fails: valid },
      { swap: [['types:\n  Claim:\n', 'types:\n  Error:\n    type: object\n    properties:\n      code: string\n      message: string\n  Claim:\n']], fails: 'The Error type sits in the inner library' },
      { swap: [['  errors: errors.raml\n', '  errors: standards/errors.raml\n', 'standards/core.raml']], fails: 'The Error type sits in the inner library' },
      { swap: [['            type: <<itemType>>[]\n', '            type: <<itemType>>\n', 'standards/core.raml']], fails: 'GET /claims returns Claim[]' },
      { swap: [['        minimum: 1\n', '', 'standards/core.raml']], fails: 'core.paged gives GET /claims' },
      { swap: [['    is: [ core.paged ]\n', '    is: [ paged ]\n']], fails: 'core.paged gives GET /claims' },
      { swap: [['  type: { core.collection: { itemType: Claim } }\n', '  type: core.collection\n']], fails: 'GET /claims returns Claim[]' },
      { swap: [['      message: string\n', '      message?: string\n', 'standards/errors.raml']], fails: 'The Error type sits in the inner library' },
      { swap: [['        400:\n          body:\n            type: errors.Error\n', '        400:\n          description: The body is not valid.\n', 'standards/core.raml']], fails: 'POST /claims takes a Claim' },
    ],
    right: [
      { swap: [['  type: { core.collection: { itemType: Claim } }\n', '  type:\n    core.collection:\n      itemType: Claim\n']] },
      { swap: [['            type: <<itemType>>[]\n', '            type: array\n            items: <<itemType>>\n', 'standards/core.raml']] },
      { swap: [['  errors: errors.raml\n', '  errors: ./errors.raml\n', 'standards/core.raml'], ['usage: The standard error shape.\n\n', '', 'standards/errors.raml']] },
    ],
  },
]
