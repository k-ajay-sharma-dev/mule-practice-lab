// Answers for rm-046 to rm-058. swap: [from, to] or [from, to, file] applied to the model answer. See core.js.
export default [
  {
    id: 'rm-046',
    wrong: [
      { swap: [['type: Basic Authentication', 'type: Digest Authentication']], fails: 'basicAuth is a Basic Authentication scheme' },
      { swap: [['          headers:\n            WWW-Authenticate:\n              type: string\n', '']], fails: 'WWW-Authenticate' },
      { swap: [['securedBy: [ basicAuth ]\n', '']], fails: 'POST /scans is secured' },
      { swap: [['protocols: [ HTTPS ]', 'protocols: [ HTTP, HTTPS ]']], fails: 'HTTPS only' },
    ],
    right: [
      {
        swap: [
          ['securedBy: [ basicAuth ]\n\n', ''],
          ['  post:\n', '  post:\n    securedBy: [ basicAuth ]\n'],
          ['    get:\n', '    get:\n      securedBy: [ basicAuth ]\n'],
        ],
      },
    ],
  },
  {
    id: 'rm-047',
    wrong: [
      { swap: [['    delete?:', '    delete:']], fails: 'delete is optional' },
      { swap: [['    get?:', '    get:']], fails: 'get is optional' },
      {
        swap: [['type: { record: { recordType: Payslip } }\n    get:\n', 'type: { record: { recordType: Payslip } }\n    get:\n      responses:\n        200:\n          body:\n            type: Payslip\n']],
        fails: '/payslips/{payslipId} gets its responses from record',
      },
      { swap: [['          description: The record is gone.\n', '          body:\n            type: <<recordType>>\n']], fails: '204 with no body' },
    ],
    right: [
      { swap: [['type: { record: { recordType: Payslip } }', 'type:\n      record:\n        recordType: Payslip']] },
      {
        swap: [
          ['  record:\n    get?:', '  record:\n    usage: Use on any single record.\n    get?:'],
          ['        404:\n          body:\n            type: Error\n    delete?:', '        404:\n          body:\n            application/json:\n              type: Error\n    delete?:'],
        ],
      },
    ],
  },
  {
    id: 'rm-048',
    wrong: [
      { swap: [['securedBy: [ null, oauth2 ]', 'securedBy: [ oauth2 ]']], fails: 'The default is securedBy' },
      { swap: [['    securedBy: [ oauth2: { scopes: [ watchlist:write ] } ]\n', '']], fails: 'POST /watchlist replaces the default' },
      { swap: [['      resumeAt?: integer', '      resumeAt: integer']], fails: 'resumeAt is optional' },
    ],
    right: [
      { swap: [['securedBy: [ null, oauth2 ]', 'securedBy: [ oauth2, null ]']] },
      { swap: [['    securedBy: [ oauth2: { scopes: [ watchlist:read ] } ]\n', '    securedBy:\n      - oauth2:\n          scopes: [ watchlist:read ]\n']] },
    ],
  },
  {
    id: 'rm-049',
    wrong: [
      { swap: [['scopes: [ grades:write, courses:read ]', 'scopes: [ grades:write ]']], fails: 'needs both grades:write and courses:read' },
      { swap: [['    securedBy: [ oauth2: { scopes: [ courses:write ] } ]\n', '    securedBy: [ oauth2: { scopes: [ courses:read ] } ]\n']], fails: 'POST /courses needs courses:write' },
      { swap: [['        403:\n          description: The token does not hold the scopes this method needs.\n', '']], fails: 'a 401 and a 403' },
      { swap: [['        maximum: 100\n', '']], fails: 'from 0 to 100' },
    ],
    right: [
      { swap: [['scopes: [ grades:write, courses:read ]', 'scopes: [ courses:read, grades:write ]']] },
      { swap: [['        securedBy: [ oauth2: { scopes: [ grades:read ] } ]\n', '        securedBy:\n          - oauth2:\n              scopes:\n                - grades:read\n']] },
    ],
  },
  {
    id: 'rm-050',
    wrong: [
      { swap: [['        207:\n', '        200:\n']], fails: 'It returns 207' },
      { swap: [['        maxItems: 500\n', '']], fails: 'PriceBatch.changes holds 1 to 500' },
      { swap: [['enum: [ UPDATED, REJECTED ]', 'enum: [ UPDATED, REJECTED, PARTIAL ]']], fails: 'outcome only allows' },
      {
        swap: [['            example:\n              succeeded: 1\n              failed: 1\n              results:\n                - sku: TS-1001\n                  outcome: UPDATED\n                - sku: TS-1002\n                  outcome: REJECTED\n                  errorCode: UNKNOWN_SKU\n', '']],
        fails: 'The 207 body has its own example',
      },
    ],
    right: [
      { swap: [['      results: ItemResult[]', '      results:\n        type: array\n        items: ItemResult']] },
      { swap: [['        400:\n          body:\n            type: Error\n', '        400:\n          body:\n            application/json:\n              type: Error\n        401:\n          description: Not signed in.\n']] },
    ],
  },
  {
    id: 'rm-051',
    wrong: [
      { swap: [['        412:\n', '        409:\n']], fails: 'PUT returns 412' },
      { swap: [['        If-Match:\n', '        If-Match?:\n']], fails: 'PUT needs a required If-Match' },
      {
        swap: [['    put:\n      headers:\n        If-Match:\n          type: string\n      body:\n        type: Policy\n      responses:\n        200:\n          headers:\n            ETag:\n              type: string\n', '    put:\n      headers:\n        If-Match:\n          type: string\n      body:\n        type: Policy\n      responses:\n        200:\n']],
        fails: 'PUT returns the Policy with a new ETag',
      },
      { swap: [['        304:\n          description: The caller already holds this version.\n', '        304:\n          body:\n            type: Policy\n']], fails: 'GET returns 304 with no body' },
    ],
    right: [
      {
        swap: [
          ['/policies:\n', 'traits:\n  conditional:\n    headers:\n      If-Match:\n        type: string\n    responses:\n      412:\n        body:\n          type: Error\n      428:\n        body:\n          type: Error\n\n/policies:\n'],
          ['    put:\n      headers:\n        If-Match:\n          type: string\n', '    put:\n      is: [ conditional ]\n'],
          ['        412:\n          body:\n            type: Error\n        428:\n          body:\n            type: Error\n', ''],
        ],
      },
      { swap: [['        If-None-Match?:\n          type: string\n', '        If-None-Match:\n          type: string\n          required: false\n']] },
    ],
  },
  {
    id: 'rm-052',
    wrong: [
      { swap: [['              application/pdf:\n                type: file\n', '              type: file\n']], fails: 'application/pdf body of type file' },
      { swap: [['                type: file\n', '                type: string\n']], fails: 'application/pdf body of type file' },
      { swap: [['              Content-Disposition:\n                type: string\n                example: attachment; filename="bill-1001.pdf"\n', '']], fails: 'Content-Disposition' },
      { swap: [['          404:\n            body:\n              type: Error\n', '          404:\n            body:\n              application/pdf:\n                type: file\n']], fails: 'Error in JSON' },
    ],
    right: [
      { swap: [['          404:\n            body:\n              type: Error\n', '          404:\n            body:\n              application/json:\n                type: Error\n']] },
      { swap: [['                type: file\n', '                type: file\n                fileTypes: [ application/pdf ]\n                maxLength: 10485760\n']] },
    ],
  },
  {
    id: 'rm-053',
    wrong: [
      { swap: [['      X-Signature:\n', '      X-Signature?:\n']], fails: 'X-Signature is required' },
      { swap: [["pattern: '^sha256=[a-f0-9]{64}$'", 'pattern: ^sha256=.+$']], fails: 'X-Signature is required' },
      { swap: [['      X-Delivery-Id:\n        type: string\n', '']], fails: 'X-Delivery-Id is required' },
      { swap: [['      401:\n        description: The signature did not match.\n', '']], fails: 'A wrong signature gets a 401' },
      { swap: [['baseUri: https://{partnerHost}/webhooks\nbaseUriParameters:\n  partnerHost:\n    type: string\n    description: The host name each partner gives during onboarding.\n', 'baseUri: https://api.partner.example.com/webhooks\n']], fails: 'The host in baseUri is a parameter' },
      { swap: [['      occurredAt: datetime', '      occurredAt: datetime-only'], ['occurredAt: 2026-03-14T09:30:00Z', 'occurredAt: 2026-03-14T09:30:00']], fails: 'with a time zone' },
    ],
    right: [
      {
        swap: [
          ['/flight-events:\n  post:\n    headers:\n      X-Signature:\n        type: string\n        pattern: \'^sha256=[a-f0-9]{64}$\'\n      X-Delivery-Id:\n        type: string\n', "traits:\n  signed:\n    headers:\n      X-Signature:\n        type: string\n        pattern: ^sha256=[a-f0-9]{64}$\n      X-Delivery-Id:\n        type: string\n\n/flight-events:\n  post:\n    is: [ signed ]\n"],
        ],
      },
      { swap: [["pattern: '^[A-Z0-9]{2}[0-9]{1,4}$'", 'pattern: ^[A-Z0-9][A-Z0-9][0-9]{1,4}$']] },
    ],
  },
  {
    id: 'rm-054',
    wrong: [
      { swap: [['  /search:\n    post:\n      body:\n        type: OrderSearch\n      responses:\n        200:\n', '  /search:\n    post:\n      body:\n        type: OrderSearch\n      responses:\n        201:\n']], fails: 'POST /orders/search returns 200' },
      { swap: [['  /search:\n    post:\n', '  /search:\n    get:\n      responses:\n        200:\n          body:\n            type: OrderPage\n    post:\n']], fails: 'with no GET on /orders/search' },
      { swap: [['        maxItems: 200\n', '']], fails: 'at most 200' },
      { swap: [['      raisedBetween?: DateRange', '      raisedBetween?: string']], fails: 'raisedBetween is an optional DateRange' },
      { swap: [['    queryParameters:\n      status?:\n        type: OrderStatus\n', '']], fails: 'Simple filtering stays on GET /orders' },
    ],
    right: [
      {
        swap: [
          ['  OrderSearch:\n    type: object\n', '  Paged:\n    type: object\n    properties:\n      page?:\n        type: integer\n        minimum: 1\n      pageSize?:\n        type: integer\n        maximum: 100\n  OrderSearch:\n    type: Paged\n'],
          ['      minValue?: number\n      page?:\n        type: integer\n        minimum: 1\n      pageSize?:\n        type: integer\n        maximum: 100\n', '      minValue?: number\n'],
        ],
      },
      { swap: [['      statuses?: OrderStatus[]', '      statuses?:\n        type: array\n        items: OrderStatus']] },
    ],
  },
  {
    id: 'rm-055',
    wrong: [
      { swap: [['    type: crm.SubscriberCore\n', '    type: crm.Subscriber\n']], fails: 'AccountCard inherits from crm.SubscriberCore' },
      {
        swap: [['  Subscriber:\n    type: SubscriberCore\n    properties:\n', '  Subscriber:\n    type: object\n    properties:\n      msisdn: string\n      firstName: string\n      planCode: string\n', 'libraries/subscriber.raml']],
        fails: 'Subscriber inherits from SubscriberCore',
      },
      { swap: [['      planCode: string\n  Subscriber:', '      planCode: string\n      creditScore: integer\n  Subscriber:', 'libraries/subscriber.raml']], fails: 'SubscriberCore holds no sensitive fields' },
      { swap: [['      creditScore: integer\n', '', 'libraries/subscriber.raml']], fails: 'Subscriber keeps all its properties' },
      { swap: [['          maximum: 31\n', '          maximum: 365\n']], fails: 'limit is optional' },
      { swap: [["pattern: '^[0-9]+[.][0-9]+[.][0-9]+$'", 'pattern: ^[0-9.]+$']], fails: 'X-App-Version with a version pattern' },
    ],
    right: [
      { swap: [['    type: crm.SubscriberCore\n', '    type: [ crm.SubscriberCore ]\n']] },
      { swap: [["pattern: '^[0-9]+[.][0-9]+[.][0-9]+$'", 'pattern: ^[0-9]+\\.[0-9]+\\.[0-9]+$']] },
      {
        swap: [
          ['      is: [ mobileClient ]\n      responses:\n        200:\n          body:\n            type: AccountCard\n', '      responses:\n        200:\n          body:\n            type: AccountCard\n'],
          ['      is: [ mobileClient ]\n      queryParameters:', '      queryParameters:'],
          ['/me:\n  /card:\n    get:\n', '/me:\n  /card:\n    is: [ mobileClient ]\n    get:\n'],
          ['  /usage:\n    get:\n', '  /usage:\n    is: [ mobileClient ]\n    get:\n'],
        ],
      },
    ],
  },
  {
    id: 'rm-056',
    wrong: [
      { swap: [['example: !include ../examples/lab-result.json\n', 'example:\n  resultId: R-1\n  testCode: HBA1C\n  value: 41.5\n  unit: mmol/mol\n  collectedAt: 2026-02-03T08:15:00Z\n  range:\n    low: 20\n    high: 42\n', 'types/lab-result.raml']], fails: 'LabResult has its example from examples/lab-result.json' },
      { swap: [['  range: !include reference-range.raml\n', '  range: ReferenceRange\n', 'types/lab-result.raml']], fails: 'brought in as a fragment' },
      { swap: [['            type: common.Error\n', '            type: Error\n'], ['types:\n  LabResult:', 'types:\n  Error:\n    type: object\n    properties:\n      code: string\n      message: string\n  LabResult:']], fails: 'The 404 is a common.Error' },
      { swap: [['            example: !include examples/not-found.json\n', '']], fails: 'The 404 is a common.Error' },
      { swap: [['  collectedAt: datetime\n', '  collectedAt: datetime-only\n', 'types/lab-result.raml'], ['"2026-02-03T08:15:00Z"', '"2026-02-03T08:15:00"', 'examples/lab-result.json']], fails: 'with a time zone' },
    ],
    right: [
      { swap: [['            example: !include examples/not-found.json\n', '            examples:\n              notFound: !include examples/not-found.json\n']] },
      {
        swap: [
          ['  /{resultId}:\n    get:\n      is: [ common.traced ]\n', '  /{resultId}:\n    is: [ common.traced ]\n    get:\n'],
        ],
      },
    ],
  },
  {
    id: 'rm-057',
    wrong: [
      { swap: [['  marketingConsent?: boolean\n', '  marketingConsent: boolean\n', 'types/member.raml']], fails: 'Finding 6: marketingConsent is optional' },
      { swap: [['securedBy: [ common.oauth2 ]\n\n', '']], fails: 'Finding 4' },
      { swap: [['    /points:\n', '    /addPoints:\n']], fails: 'Finding 1: the verb paths are gone' },
      { swap: [['      201:\n        body:\n          type: Member\n', '      200:\n        body:\n          type: Member\n']], fails: 'Finding 2' },
      {
        swap: [
          ['          404:\n            body:\n              type: common.Error\n', '          404:\n            body:\n              type: NotFoundMessage\n'],
          ['  PointsAward:\n', '  NotFoundMessage:\n    type: object\n    properties:\n      msg: string\n  PointsAward:\n'],
        ],
        fails: 'Finding 3: every 404',
      },
      { swap: [['  email: string\n', '  email?: string\n', 'types/member.raml']], fails: 'the other Member properties stay required' },
      { swap: [['  get:\n    is: [ common.traced ]\n', '  get:\n']], fails: 'Finding 5' },
    ],
    right: [
      { swap: [['  marketingConsent?: boolean\n', '  marketingConsent:\n    type: boolean\n    required: false\n', 'types/member.raml']] },
      {
        swap: [
          ['securedBy: [ common.oauth2 ]\n\n', ''],
          ['/members:\n  get:\n', '/members:\n  securedBy: [ common.oauth2 ]\n  get:\n    securedBy: [ common.oauth2 ]\n'],
          ['  post:\n    is: [ common.traced ]\n', '  post:\n    securedBy: [ common.oauth2 ]\n    is: [ common.traced ]\n'],
          ['  /{memberId}:\n    get:\n', '  /{memberId}:\n    get:\n      securedBy: [ common.oauth2 ]\n'],
          ['      post:\n        is: [ common.traced ]\n', '      post:\n        securedBy: [ common.oauth2 ]\n        is: [ common.traced ]\n'],
        ],
      },
    ],
  },
  {
    id: 'rm-058',
    wrong: [
      { swap: [['enum: [ CURRENT, SAVINGS ]', 'enum: [ CA, SV ]', 'types/account.raml'], ['"accountType": "CURRENT"', '"accountType": "CA"', 'examples/account.json']], fails: 'accountType uses business values' },
      { swap: [['        headers:\n          Retry-After:\n            type: integer\n', '', 'libraries/banking.raml']], fails: 'The coreErrors trait holds 503 with Retry-After' },
      { swap: [['          422:\n            body:\n              type: bank.Error\n', '          400:\n            body:\n              type: bank.Error\n']], fails: 'Return code 51 maps to 422' },
      {
        swap: [['    get:\n    /transactions:', '    get:\n      responses:\n        404:\n          body:\n            type: bank.Error\n    /transactions:']],
        fails: 'gets its responses from bank.coreRecord',
      },
      { swap: [["pattern: '^[0-9]{12}$'", "pattern: '[0-9]+'"]], fails: 'exactly 12 digits' },
      { swap: [['securedBy: [ bank.oauth2 ]\n\n', '']], fails: 'All three methods are secured' },
      { swap: [['      is: [ coreErrors, traced ]\n', '      is: [ traced ]\n', 'libraries/banking.raml']], fails: 'gets the 503 and 504 mapping' },
    ],
    right: [
      { swap: [["pattern: '^[0-9]{12}$'", 'pattern: ^[0-9]{12,12}$']] },
      { swap: [["type: { bank.coreRecord: { recordType: 'Transaction[]' } }", 'type:\n        bank.coreRecord:\n          recordType: Transaction[]']] },
      { swap: [['      amount:\n        type: number\n        minimum: 0.01\n      reason: string\n', '      amount:\n        type: number\n        minimum: 0.01\n        multipleOf: 0.01\n      reason:\n        type: string\n        maxLength: 100\n']] },
    ],
  },
]
