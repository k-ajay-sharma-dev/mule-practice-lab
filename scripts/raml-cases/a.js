// Answers for rm-034 to rm-045, used by scripts/check-raml.js. swap: [from, to] applied to the model answer.
export default [
  {
    id: 'rm-034',
    wrong: [
      {
        swap: [[
          '  /{loanId}:\n    get:\n      responses:\n        200:\n          body:\n            type: Loan\n        404:\n          description: No loan has this id.\n',
          '/{loanId}:\n  get:\n    responses:\n      200:\n        body:\n          type: Loan\n      404:\n        description: No loan has this id.\n',
        ]],
        fails: 'nested under /loans',
      },
      { swap: [['dueDate: date-only', 'dueDate: datetime'], ['dueDate: 2026-03-14', 'dueDate: 2026-03-14T00:00:00Z']], fails: 'dueDate' },
      { swap: [['        404:\n          description: No loan has this id.\n', '']], fails: '404' },
      { swap: [['type: Loan[]', 'type: Loan']], fails: 'GET /loans returns' },
    ],
    right: [
      { swap: [['{loanId}', '{id}'], ['type: Loan[]', 'type: array\n          items: Loan']] },
      { swap: [['dueDate: date-only', 'dueDate:\n        type: date-only\n        required: true']] },
    ],
  },
  {
    id: 'rm-035',
    wrong: [
      { swap: [['protocols: [ HTTPS ]', 'protocols: [ HTTP, HTTPS ]']], fails: 'protocols' },
      { swap: [['enum: [ emea, amer, apac ]', 'enum: [ emea, amer ]']], fails: 'Region allows' },
      { swap: [['https://{region}.courier', 'https://emea.courier']], fails: 'base URI' },
      { swap: [['baseUriParameters:\n  region: Region\n', '']], fails: 'baseUriParameters' },
    ],
    right: [
      { swap: [['protocols: [ HTTPS ]', 'protocols: [ https ]']] },
      { swap: [['  region: Region\n', '  region:\n    type: Region\n'], ['enum: [ emea, amer, apac ]', 'enum: [ apac, amer, emea ]']] },
    ],
  },
  {
    id: 'rm-036',
    wrong: [
      { swap: [['limit?:', 'limit:']], fails: 'limit is' },
      { swap: [['showId: string', 'showId:\n        type: string\n        default: all']], fails: 'showId' },
      { swap: [['default: false', 'default: "false"']], fails: 'includeExplicit' },
      { swap: [['default: newest', 'default: popular']], fails: 'sort' },
    ],
    right: [
      { swap: [['limit?:\n        type: integer', 'limit:\n        required: false\n        type: integer']] },
      { swap: [['enum: [ newest, oldest, popular ]', 'enum: [ popular, newest, oldest ]'], ['showId: string', 'showId:\n        type: string\n        required: true']] },
    ],
  },
  {
    id: 'rm-037',
    wrong: [
      { swap: [['bookedAt: datetime', 'bookedAt: datetime-only'], ['bookedAt: 2026-02-20T17:45:10+01:00', 'bookedAt: 2026-02-20T17:45:10']], fails: 'bookedAt' },
      { swap: [['localStart: datetime-only', 'localStart: datetime'], ['localStart: 2026-03-14T09:30:00', 'localStart: 2026-03-14T09:30:00Z']], fails: 'localStart' },
      { swap: [['doorsOpen: time-only', 'doorsOpen: string']], fails: 'doorsOpen' },
      { swap: [['doorsOpen: time-only', 'doorsOpen: datetime-only'], ['doorsOpen: 08:00:00', 'doorsOpen: 2026-03-14T08:00:00']], fails: 'doorsOpen' },
      { swap: [['day: date-only', 'day: datetime-only']], fails: 'day query parameter' },
    ],
    right: [
      { swap: [['bookedAt: 2026-02-20T17:45:10+01:00', 'bookedAt: 2026-02-20T16:45:10Z']] },
      { swap: [['bookedAt: datetime', 'bookedAt:\n        type: datetime'], ['day: date-only', 'day:\n        type: date-only\n        required: true']] },
    ],
  },
  {
    id: 'rm-038',
    wrong: [
      { swap: [['type: integer\n        format: int64', 'type: number\n        format: int64']], fails: 'totalWattHours' },
      { swap: [['format: int64', 'format: int32']], fails: 'totalWattHours' },
      { swap: [['estimated: boolean', 'estimated: string'], ['estimated: false', 'estimated: "false"']], fails: 'estimated is' },
      { swap: [['type: boolean\n        default: false', 'type: boolean\n        default: true']], fails: 'estimatedOnly' },
      { swap: [['voltage: number', 'voltage: integer'], ['voltage: 229.6', 'voltage: 230']], fails: 'voltage' },
    ],
    right: [
      { swap: [['format: int64', 'format: long']] },
      { swap: [['estimated: boolean', 'estimated:\n        type: boolean'], ['estimatedOnly?:\n        type: boolean', 'estimatedOnly:\n        required: false\n        type: boolean']] },
    ],
  },
  {
    id: 'rm-039',
    wrong: [
      { swap: [['/me:\n  get:', '/me:\n  /{accountId}:\n    get:\n      responses:\n        200:\n          body:\n            type: Account\n  get:']], fails: 'No path holds' },
      { swap: [['/health:', '/accounts/{accountId}:\n  get:\n/health:']], fails: 'No path holds' },
      { swap: [['  patch:\n', '  delete:\n  patch:\n']], fails: 'no post and no delete' },
      { swap: [['      401:\n        description: The token is missing or not valid.\n', '']], fails: '401' },
      { swap: [['      503:\n        body:\n          type: Health\n', '']], fails: '503' },
      { swap: [['    body:\n      type: AccountUpdate', '    body:\n      type: Account']], fails: 'PATCH or PUT' },
    ],
    right: [
      { swap: [['  patch:\n', '  put:\n']] },
      { swap: [['enum: [ UP, DOWN ]', 'enum: [ DOWN, UP ]'], ['      401:\n        description: The token is missing or not valid.\n', '      401:\n']] },
    ],
  },
  {
    id: 'rm-040',
    wrong: [
      { swap: [['type: Size[]\n        maxItems: 4\n        uniqueItems: true', 'type: Size']], fails: 'size parameter is' },
      { swap: [['type: Size[]\n        maxItems: 4', 'type: string[]\n        maxItems: 4']], fails: 'size parameter is' },
      { swap: [['        uniqueItems: true\n', '']], fails: 'no duplicates' },
      { swap: [['type: string[]\n        maxItems: 10', 'type: string']], fails: 'brand' },
      { swap: [['q?: string', 'q?: string[]']], fails: 'q parameter' },
      { swap: [['size?:', 'size:']], fails: 'size parameter is' },
    ],
    right: [
      { swap: [['type: Size[]\n        maxItems: 4', 'type: array\n        items: Size\n        maxItems: 4']] },
      { swap: [['type: string[]\n        maxItems: 10', 'type: array\n        items: string\n        maxItems: 10\n        required: false'], ['brand?:', 'brand:'], ['enum: [ S, M, L, XL ]', 'enum: [ XL, L, M, S ]']] },
    ],
  },
  {
    id: 'rm-041',
    wrong: [
      { swap: [['grade: string?', 'grade?: string'], ['      grade: null\n', '']], fails: 'grade is' },
      { swap: [['finalScore: number | nil', 'finalScore?: number | nil']], fails: 'finalScore' },
      { swap: [['tutorNote?: string', 'tutorNote: string?'], ['      finalScore: null\n', '      finalScore: null\n      tutorNote: null\n']], fails: 'tutorNote' },
      { swap: [['tutorNote?: string', 'tutorNote?: string | nil']], fails: 'tutorNote' },
      { swap: [['grade: string?', 'grade: string'], ['grade: null', 'grade: A']], fails: 'grade is' },
      { swap: [['enrolmentId: string', 'enrolmentId: string?']], fails: 'enrolmentId' },
    ],
    right: [
      { swap: [['grade: string?', 'grade: string | nil'], ['finalScore: number | nil', 'finalScore: number?']] },
      { swap: [['finalScore: number | nil', 'finalScore: nil | number'], ['tutorNote?: string', 'tutorNote:\n        type: string\n        required: false'], ['grade: null', 'grade: B']] },
    ],
  },
  {
    id: 'rm-042',
    wrong: [
      { swap: [['type: [ Person, ContactDetails ]', 'type: Person | ContactDetails']], fails: 'both parents' },
      { swap: [['type: [ Person, ContactDetails ]', 'type: Person'], ['      policyNumber: string\n', '      policyNumber: string\n      email: string\n']], fails: 'both parents' },
      { swap: [['  Witness:\n    type: Person', '  Witness:\n    type: [ Person, ContactDetails ]']], fails: 'Witness inherits' },
      { swap: [['phone?: string', 'phone: string']], fails: 'optional phone' },
      { swap: [['dateOfBirth: date-only', 'dateOfBirth: string']], fails: 'Person has' },
    ],
    right: [
      { swap: [['type: [ Person, ContactDetails ]', 'type: [ ContactDetails, Person ]']] },
      { swap: [['phone?: string', 'phone:\n        type: string\n        required: false'], ['{claimantId}', '{id}']] },
    ],
  },
  {
    id: 'rm-043',
    wrong: [
      { swap: [['additionalProperties: false', 'additionalProperties: true']], fails: 'is closed' },
      { swap: [['    additionalProperties: false\n', '']], fails: 'is closed' },
      { swap: [['  StandingOrder:\n    type: object\n', '  StandingOrder:\n    type: object\n    additionalProperties: false\n']], fails: 'stays open' },
      { swap: [['      400:\n        description: The body does not fit the contract.\n', '']], fails: '400' },
      { swap: [['reference?:', 'reference:']], fails: 'reference is' },
      { swap: [['minimum: 0.01', 'minimum: 0']], fails: 'amount' },
    ],
    right: [
      { swap: [['    additionalProperties: false\n    properties:\n      fromAccount', '    properties:\n      fromAccount'], ['    example:\n      fromAccount', '    additionalProperties: false\n    example:\n      fromAccount']] },
      { swap: [['  StandingOrder:\n    type: object\n', '  StandingOrder:\n    type: object\n    additionalProperties: true\n'], ['enum: [ WEEKLY, MONTHLY ]', 'enum: [ MONTHLY, WEEKLY ]']] },
    ],
  },
  {
    id: 'rm-044',
    wrong: [
      {
        swap: [[
          '    examples:\n      regularMonth:\n        description: A normal month with tax taken off.\n        value:\n          payslipId: PS-1180\n          payDate: 2026-03-31\n          grossPay: 3200\n          netPay: 2480\n          deductions:\n            - code: TAX\n              amount: 720\n      unpaidLeave:\n        description: A full month of unpaid leave, so nothing is paid.\n        value:\n          payslipId: PS-1181\n          payDate: 2026-03-31\n          grossPay: 0\n          netPay: 0\n          deductions: []\n',
          '    example:\n      payslipId: PS-1180\n      payDate: 2026-03-31\n      grossPay: 3200\n      netPay: 2480\n      deductions:\n        - code: TAX\n          amount: 720\n',
        ]],
        fails: 'named examples',
      },
      { swap: [['    examples:\n', '    example:\n      payslipId: PS-1\n      payDate: 2026-03-31\n      grossPay: 1\n      netPay: 1\n      deductions: []\n    examples:\n']], fails: 'named examples' },
      { swap: [['      netPay:\n        type: number\n        minimum: 0\n', '      netPay:\n        type: number\n']], fails: 'grossPay and netPay' },
      { swap: [['        404:\n          description: No payslip has this id.\n', '']], fails: '404' },
      { swap: [['deductions: Deduction[]', 'deductions: Deduction'], ['          deductions:\n            - code: TAX\n              amount: 720\n', '          deductions:\n            code: TAX\n            amount: 720\n'], ['          deductions: []\n', '          deductions:\n            code: NONE\n            amount: 0\n']], fails: 'deductions is' },
    ],
    right: [
      {
        swap: [[
          '      unpaidLeave:\n        description: A full month of unpaid leave, so nothing is paid.\n        value:\n          payslipId: PS-1181\n          payDate: 2026-03-31\n          grossPay: 0\n          netPay: 0\n          deductions: []\n',
          '      unpaidLeave:\n        payslipId: PS-1181\n        payDate: 2026-03-31\n        grossPay: 0\n        netPay: 0\n        deductions: []\n',
        ]],
      },
      { swap: [['deductions: Deduction[]', 'deductions:\n        type: array\n        items: Deduction'], ['{payslipId}', '{id}']] },
    ],
  },
  {
    id: 'rm-045',
    wrong: [
      { swap: [['          Retry-After:\n            type: integer\n            description: Seconds to wait before the next call.\n', '']], fails: 'Retry-After' },
      {
        swap: [[
          '    responses:\n      429:\n        description: Too many calls. Wait before calling again.\n        headers:\n          Retry-After:\n            type: integer\n            description: Seconds to wait before the next call.\n          X-RateLimit-Remaining:\n            type: integer\n            description: Calls left in the current period.\n        body:\n          type: RateLimitError\n',
          '    headers:\n      Retry-After:\n        type: integer\n      X-RateLimit-Remaining:\n        type: integer\n    responses:\n      429:\n        description: Too many calls. Wait before calling again.\n        body:\n          type: RateLimitError\n',
        ]],
        fails: 'holds the 429',
      },
      { swap: [['      429:\n', '      503:\n']], fails: 'holds the 429' },
      { swap: [['    get:\n      is: [ rateLimited ]\n', '    get:\n']], fails: '{flightNumber} uses' },
      { swap: [['        body:\n          type: RateLimitError\n', '']], fails: 'returns a RateLimitError' },
    ],
    right: [
      { swap: [['/flights:\n  get:\n    is: [ rateLimited ]\n', '/flights:\n  is: [ rateLimited ]\n  get:\n'], ['{flightNumber}', '{number}']] },
      { swap: [['          Retry-After:\n            type: integer\n', '          retry-after:\n            type: string\n'], ['        body:\n          type: RateLimitError\n', '        body:\n          application/json:\n            type: RateLimitError\n']] },
    ],
  },
]
