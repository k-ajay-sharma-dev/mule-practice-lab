// Answers for rm-083 to rm-094: security, annotations and fragments. Used by scripts/check-raml.js.
// swap: [from, to] or [from, to, file] applied to the model answer. See a.js and core.js.
const valid = 'The file is valid RAML 1.0'

export default [
  {
    id: 'rm-083',
    wrong: [
      { swap: [['  /{sku}:\n    securedBy: [ oauth2: { scopes: [ stock:read ] } ]\n', '  /{sku}:\n']], fails: 'GET /branches/{branchId}/stock/{sku} returns' },
      { swap: [['securedBy: [ oauth2: { scopes: [ stock:write ] } ]', 'securedBy: [ oauth2: { scopes: [ stock:read, stock:write ] } ]']], fails: 'PATCH needs stock:write' },
      { swap: [['securedBy: [ oauth2: { scopes: [ stock:admin ] } ]', 'securedBy: [ oauth2: { scopes: [ stock:write ] } ]']], fails: 'DELETE returns 204' },
      { swap: [['      scopes: [ stock:read, stock:write, stock:admin ]', '      scopes: [ stock:read, stock:write ]']], fails: 'exactly stock:read' },
      { swap: [['        403:\n          description: The token is valid but does not hold the scope this method needs.\n', '']], fails: 'a 401 and a 403' },
      { swap: [['      headers:\n        Authorization:\n          type: string\n          description: Bearer followed by the access token.\n', '']], fails: 'Authorization header' },
      { swap: [['      authorizationGrants: [ client_credentials ]', '      authorizationGrants: [ password ]']], fails: 'client_credentials grant' },
      { swap: [['        204:\n          description: The product line was removed from this branch.\n', '        204:\n          body:\n            type: StockLevel\n']], fails: 'DELETE returns 204' },
      { swap: [['        enum: [ DELIVERY, SALE, DAMAGED, EXPIRED ]', '        enum: [ DELIVERY, SALE, DAMAGED, EXPIRED, OTHER ]']], fails: 'reason allows only' },
    ],
    right: [
      {
        swap: [
          ['/branches/{branchId}/stock:\n  securedBy: [ oauth2: { scopes: [ stock:read ] } ]\n  get:\n', '/branches/{branchId}/stock:\n  get:\n    securedBy: [ oauth2: { scopes: [ stock:read ] } ]\n'],
          ['  /{sku}:\n    securedBy: [ oauth2: { scopes: [ stock:read ] } ]\n    get:\n', '  /{sku}:\n    get:\n      securedBy: [ oauth2: { scopes: [ stock:read ] } ]\n'],
        ],
      },
      {
        swap: [
          ['{sku}', '{productSku}'],
          ['securedBy: [ oauth2: { scopes: [ stock:admin ] } ]', 'securedBy:\n        - oauth2:\n            scopes: [ stock:admin ]'],
          ['      quantityChange: integer\n', '      quantityChange:\n        type: integer\n        required: true\n'],
        ],
      },
    ],
  },
  {
    id: 'rm-084',
    wrong: [
      { swap: [['securedBy: [ clientId ]\n', '']], fails: 'default for the whole API' },
      { swap: [['    securedBy: [ null ]\n', '']], fails: 'GET /health returns 200 with no credentials' },
      { swap: [['securedBy: [ clientId ]\n', 'securedBy: [ clientId, null ]\n']], fails: 'GET /rates returns Rate[]' },
      { swap: [['    type: Pass Through\n', '    type: Basic Authentication\n']], fails: 'clientId is a Pass Through scheme' },
      { swap: [['        client_secret:\n          type: string\n', '']], fails: 'client_id and client_secret' },
      { swap: [['          headers:\n            Retry-After:\n              type: integer\n              description: Seconds to wait before the next call.\n', '']], fails: 'Retry-After' },
      { swap: [['    pattern: ^[A-Z]{3}$\n', '    pattern: ^[A-Za-z]{3}$\n']], fails: 'three capital letters' },
      { swap: [['    pattern: ^[A-Z]{3}$\n', '    pattern: "[A-Z]{3}"\n']], fails: 'three capital letters' },
      { swap: [['      currency: CurrencyCode\n', '      currency: string\n']], fails: 'URI parameter is a CurrencyCode' },
      { swap: [['      asOf: datetime\n', '      asOf: datetime-only\n'], ['      asOf: 2026-11-09T10:15:00Z\n', '      asOf: 2026-11-09T10:15:00\n']], fails: 'datetime asOf' },
    ],
    right: [
      { swap: [['{currency}', '{code}'], ['      currency: CurrencyCode\n', '      code: CurrencyCode\n']] },
      {
        swap: [
          ['    securedBy: [ null ]\n', '    securedBy: [ null, clientId ]\n'],
          ['        client_id:\n          type: string\n', '        client_id: string\n'],
          ['            Retry-After:\n              type: integer\n', '            Retry-After:\n              type: string\n'],
        ],
      },
    ],
  },
  {
    id: 'rm-085',
    wrong: [
      { swap: [['securedBy: [ oauth2 ]\n', 'securedBy: [ oauth2, kioskBasic ]\n']], fails: 'oauth2 alone' },
      { swap: [['/kiosk-check-ins:\n  securedBy: [ kioskBasic ]\n  get:\n', '/kiosk-check-ins:\n  get:\n'], ['  post:\n    body:\n      type: CheckIn\n', '  post:\n    securedBy: [ kioskBasic ]\n    body:\n      type: CheckIn\n']], fails: 'Both kiosk methods' },
      { swap: [['    type: Basic Authentication\n', '    type: Pass Through\n']], fails: 'kioskBasic is a Basic Authentication scheme' },
      { swap: [['          headers:\n            WWW-Authenticate:\n              type: string\n', '']], fails: 'WWW-Authenticate' },
      { swap: [['authorizationGrants: [ authorization_code ]', 'authorizationGrants: [ client_credentials ]']], fails: 'authorization_code grant' },
      { swap: [['protocols: [ HTTPS ]', 'protocols: [ HTTP, HTTPS ]']], fails: 'HTTPS only' },
      { swap: [['securedBy: [ oauth2 ]\n', '']], fails: 'oauth2 alone' },
      { swap: [['      arrival: date-only\n', '      arrival: datetime\n']], fails: 'date-only arrival' },
    ],
    right: [
      {
        swap: [
          ['      lastName: string\n', '      lastName:\n        type: string\n        minLength: 1\n'],
          ['/kiosk-check-ins:\n  securedBy: [ kioskBasic ]\n', '/kiosk-check-ins:\n  description: Used only by the lobby kiosks.\n  securedBy: [ kioskBasic ]\n'],
        ],
      },
      { swap: [['{bookingRef}', '{ref}'], ['securedBy: [ oauth2 ]\n', 'securedBy:\n  - oauth2\n']] },
    ],
  },
  {
    id: 'rm-086',
    wrong: [
      { swap: [['    type: x-hmac-signature\n', '    type: Pass Through\n']], fails: 'custom type x-hmac-signature' },
      { swap: [['          pattern: ^sha256=[a-f0-9]{64}$\n', '          pattern: ^sha256=[a-fA-F0-9]{64}$\n']], fails: 'X-Signature has a pattern' },
      { swap: [['          pattern: ^sha256=[a-f0-9]{64}$\n', '          pattern: ^sha256=[a-f0-9]+$\n']], fails: 'X-Signature has a pattern' },
      { swap: [['          pattern: ^sha256=[a-f0-9]{64}$\n', '          pattern: sha256=[a-f0-9]{64}\n']], fails: 'X-Signature has a pattern' },
      { swap: [['        X-Signature-Timestamp:\n          type: integer\n', '        X-Signature-Timestamp:\n          type: datetime\n']], fails: 'X-Signature-Timestamp is an integer' },
      { swap: [['      toleranceSeconds: 300\n', '      toleranceSeconds: 3600\n']], fails: 'toleranceSeconds 300' },
      { swap: [['    securedBy: [ hmacSignature ]\n', '']], fails: 'secured by hmacSignature' },
      { swap: [['securedBy: [ oauth2: { scopes: [ events:read ] } ]', 'securedBy: [ hmacSignature ]']], fails: 'needs events:read only' },
      { swap: [['      204:\n        description: The event was stored. A repeat of a known eventId is also answered 204.\n', '      200:\n        body:\n          type: PaymentEvent\n']], fails: 'returns 204 with no body' },
      { swap: [['      occurredAt: datetime\n', '      occurredAt: string\n']], fails: 'datetime occurredAt' },
    ],
    right: [
      { swap: [['          pattern: ^sha256=[a-f0-9]{64}$\n', '          pattern: ^sha256=[0-9a-f]{64}$\n'], ['        X-Signature-Timestamp:\n          type: integer\n          description: Unix seconds when the provider signed the call.\n', '        X-Signature-Timestamp: integer\n']] },
      {
        swap: [
          ['{eventId}', '{id}'],
          ['securedBy: [ oauth2: { scopes: [ events:read ] } ]', 'securedBy:\n        - oauth2:\n            scopes: [ events:read ]'],
          ['      data: object\n', '      data:\n        type: object\n        description: The payment or refund, as the provider sends it.\n'],
        ],
      },
    ],
  },
  {
    id: 'rm-087',
    wrong: [
      { swap: [['    (pciScope): true\n    get:\n', '    get:\n      (pciScope): true\n']], fails: valid },
      { swap: [['        p95Ms: 250\n', '        p95Ms: 250ms\n']], fails: valid },
      { swap: [['  email: card-platform@example.com\n', '']], fails: valid },
      { swap: [['        (maskAs): LAST4\n', '        (maskAs): MASKED\n']], fails: valid },
      { swap: [['    allowedTargets: [ Resource ]\n', '    allowedTargets: [ Resource, Method ]\n']], fails: 'pciScope is a boolean annotation' },
      { swap: [['    allowedTargets: [ Method ]\n', '']], fails: 'sla is an object annotation' },
      { swap: [['    enum: [ LAST4, HASH, NONE ]\n', '    enum: [ LAST4, HASH, NONE, FULL ]\n']], fails: 'maskAs allows only' },
      { swap: [['  (pciScope): false\n', '']], fails: 'marked (pciScope): false' },
      { swap: [['    (pciScope): true\n', '    (pciScope): false\n']], fails: 'marked (pciScope): true' },
      { swap: [['        availability: 99.95\n', '        availability: 99.9\n']], fails: 'availability 99.95' },
      { swap: [['  team: Card Platform\n', '  team: Cards\n']], fails: 'team Card Platform' },
    ],
    right: [
      {
        swap: [
          ['    allowedTargets: [ API ]\n', '    allowedTargets: API\n'],
          ['    allowedTargets: [ Resource ]\n', '    allowedTargets: Resource\n'],
          ['{cardId}', '{id}'],
        ],
      },
      {
        swap: [
          ['(owner):\n  team: Card Platform\n  email: card-platform@example.com\n', '(owner): { team: Card Platform, email: card-platform@example.com }\n'],
          ['  owner:\n    type: object\n    properties:\n', '  owner:\n    properties:\n'],
          ['      (sla):\n        p95Ms: 250\n        availability: 99.95\n', '      (sla): { p95Ms: 250, availability: 99.95 }\n'],
        ],
      },
    ],
  },
  {
    id: 'rm-088',
    wrong: [
      { swap: [['#%RAML 1.0 SecurityScheme\n', '#%RAML 1.0 Trait\n', 'security/oauth2.raml']], fails: valid },
      {
        swap: [['  oauth2: !include security/oauth2.raml\n', '  oauth2:\n    type: OAuth 2.0\n    describedBy:\n      responses:\n        401:\n          description: x\n        403:\n          description: y\n    settings:\n      accessTokenUri: https://auth.example.com/oauth2/token\n      authorizationGrants: [ client_credentials ]\n      scopes: [ dispatch:write ]\n']],
        fails: 'oauth2 comes from security/oauth2.raml',
      },
      { swap: [['    403:\n      description: The token does not hold dispatch:write.\n', '', 'security/oauth2.raml']], fails: 'oauth2 describes a 401 and a 403' },
      { swap: [['    client_secret:\n      type: string\n', '', 'security/client-id.raml']], fails: 'client_id and client_secret' },
      { swap: [['type: Pass Through\n', 'type: Basic Authentication\n', 'security/client-id.raml']], fails: 'is Pass Through' },
      { swap: [['securedBy: [ oauth2: { scopes: [ dispatch:write ] } ]', 'securedBy: [ clientId ]']], fails: 'needs oauth2 with dispatch:write' },
      { swap: [['    securedBy: [ null ]\n', '']], fails: 'GET /health returns 200 with no credentials' },
      { swap: [['securedBy: [ clientId ]\n', '']], fails: 'clientId is the default' },
      { swap: [['  scopes: [ dispatch:write ]\n', '  scopes: [ dispatch ]\n', 'security/oauth2.raml']], fails: 'token URL, client_credentials and dispatch:write' },
      { swap: [['        minimum: -90\n        maximum: 90\n', '        minimum: 0\n        maximum: 90\n']], fails: 'latitude and longitude' },
    ],
    right: [
      {
        swap: [
          ['describedBy:\n  headers:\n    Authorization:\n      type: string\n  responses:\n', 'describedBy:\n  responses:\n', 'security/oauth2.raml'],
          ['{vehicleId}', '{id}'],
        ],
      },
      {
        swap: [
          ['securedBy: [ clientId ]\n', 'securedBy:\n  - clientId\n'],
          ['    client_id:\n      type: string\n', '    client_id: string\n', 'security/client-id.raml'],
        ],
      },
    ],
  },
  {
    id: 'rm-089',
    wrong: [
      { swap: [['<<writeScope>>', 'returns:write', 'resource-types/secured-collection.raml']], fails: '/refunds is read with refunds:read and written with refunds:approve' },
      { swap: [['      writeScope: refunds:approve\n', '      writeScope: refunds:read\n']], fails: '/refunds is read with refunds:read and written with refunds:approve' },
      {
        swap: [
          ['  securedBy: [ oauth2: { scopes: [ <<readScope>> ] } ]\n', '', 'resource-types/secured-collection.raml'],
          ['/returns:\n  type:\n', '/returns:\n  get:\n    securedBy: [ oauth2: { scopes: [ returns:read ] } ]\n  type:\n'],
          ['/refunds:\n  type:\n', '/refunds:\n  get:\n    securedBy: [ oauth2: { scopes: [ refunds:read ] } ]\n  type:\n'],
        ],
        fails: 'securedBy comes from it',
      },
      { swap: [['#%RAML 1.0 ResourceType\n', '#%RAML 1.0 Trait\n', 'resource-types/secured-collection.raml']], fails: valid },
      { swap: [['  paged: !include traits/paged.raml\n', '  paged:\n    queryParameters:\n      page?:\n        type: integer\n        minimum: 1\n      pageSize?:\n        type: integer\n        minimum: 1\n        maximum: 100\n']], fails: 'paged comes from traits/paged.raml' },
      { swap: [['    minimum: 1\n    maximum: 100\n', '    minimum: 1\n    maximum: 1000\n', 'traits/paged.raml']], fails: 'page and pageSize are optional' },
      { swap: [['  page?:\n', '  page:\n', 'traits/paged.raml']], fails: 'page and pageSize are optional' },
      { swap: [['  is: [ paged ]\n', '', 'resource-types/secured-collection.raml']], fails: 'GET /returns uses paged' },
      { swap: [['        type: <<itemType>>[]\n', '        type: <<itemType>>\n', 'resource-types/secured-collection.raml']], fails: 'GET /returns returns ReturnRequest[]' },
      { swap: [['      scopes: [ returns:read, returns:write, refunds:read, refunds:approve ]\n', '      scopes: [ returns:read, returns:write, refunds:read, refunds:write ]\n']], fails: 'exactly the four scopes' },
      { swap: [['        minimum: 0.01\n', '        minimum: 0\n']], fails: 'amount of at least 0.01' },
    ],
    right: [
      {
        swap: [
          ['get:\n  is: [ paged ]\n', 'get:\n  is: [ paged ]\n  description: List the <<resourcePathName>>.\n', 'resource-types/secured-collection.raml'],
          ['usage: Apply to any list that can grow without limit.\n', '', 'traits/paged.raml'],
        ],
      },
      {
        swap: [
          ['/refunds:\n  type:\n    securedCollection:\n      itemType: Refund\n      readScope: refunds:read\n      writeScope: refunds:approve\n', '/refunds:\n  description: Refunds that finance approves.\n  type: { securedCollection: { itemType: Refund, readScope: "refunds:read", writeScope: "refunds:approve" } }\n'],
          ['    201:\n      body:\n        type: <<itemType>>\n', '    201:\n      body:\n        type: <<itemType>>\n      headers:\n        Location:\n          type: string\n', 'resource-types/secured-collection.raml'],
        ],
      },
    ],
  },
  {
    id: 'rm-090',
    wrong: [
      { swap: [['examples: !include ../examples/quotes.raml\n', 'example: !include ../examples/quotes.raml\n', 'types/quote.raml']], fails: valid },
      { swap: [['  annualPremium?: number\n', '  annualPremium: number\n', 'types/quote.raml']], fails: valid },
      { swap: [['declined:\n  quoteId: Q-88122\n  status: DECLINED\n  currency: GBP\n  validUntil: 2026-11-09\n', '', 'examples/quotes.raml']], fails: 'standardCover, youngDriver and declined' },
      { swap: [['    enum: [ QUOTED, REFERRED, DECLINED ]\n', '    enum: [ QUOTED, DECLINED ]\n', 'types/quote.raml']], fails: valid },
      { swap: [['  Quote: !include types/quote.raml\n', '  Quote: !include examples/quotes.raml\n']], fails: valid },
      { swap: [['examples: !include ../examples/quotes.raml\n', 'examples: !include examples/quotes.raml\n', 'types/quote.raml']], fails: valid },
      { swap: [['  driverAge: 19\n', '  driverAge: 16\n', 'examples/quote-requests.raml']], fails: valid },
      { swap: [['      examples: !include examples/quote-requests.raml\n', '']], fails: 'examples from examples/quote-requests.raml' },
      { swap: [['        minimum: 17\n', '        minimum: 16\n'], ['  driverAge: 19\n', '  driverAge: 16\n', 'examples/quote-requests.raml']], fails: 'driverAge from 17 to 99' },
      { swap: [['    pattern: ^[A-Z]{3}$\n', '    pattern: ^[A-Z]+$\n', 'types/quote.raml']], fails: 'three letter currency' },
      { swap: [['  validUntil: date-only\n', '  validUntil: string\n', 'types/quote.raml']], fails: 'date-only validUntil' },
    ],
    right: [
      {
        swap: [
          ['  validUntil: date-only\n', '  validUntil:\n    type: date-only\n    description: The last day the price holds.\n', 'types/quote.raml'],
          ['type: object\nproperties:\n', 'properties:\n', 'types/quote.raml'],
        ],
      },
      {
        swap: [
          ['{quoteId}', '{id}'],
          ['youngDriver:\n  registration: YK19XRT\n  driverAge: 19\n  postcode: M14 5RG\n', '', 'examples/quote-requests.raml'],
          ['declined:\n  quoteId: Q-88122\n  status: DECLINED\n  currency: GBP\n  validUntil: 2026-11-09\n', 'declined:\n  displayName: Declined\n  value:\n    quoteId: Q-88122\n    status: DECLINED\n    currency: GBP\n    validUntil: 2026-11-09\n', 'examples/quotes.raml'],
        ],
      },
    ],
  },
  {
    id: 'rm-091',
    wrong: [
      { swap: [['  (retention):\n    days: 2555\n    basis: CONTRACT\n  post:\n', '  post:\n    (retention):\n      days: 2555\n      basis: CONTRACT\n']], fails: valid },
      { swap: [['  email:\n    type: string\n    (pii): DIRECT\n', '  email:\n    type: string\n    (pii): PERSONAL\n', 'types/customer.raml']], fails: valid },
      { swap: [['    days: 730\n', '    days: two years\n']], fails: valid },
      { swap: [['#%RAML 1.0 AnnotationTypeDeclaration\n', '#%RAML 1.0 DataType\n', 'annotations/pii.raml']], fails: valid },
      { swap: [['  postcode:\n    type: string\n    (pii): INDIRECT\n', '  postcode:\n    type: string\n    (pii): DIRECT\n', 'types/customer.raml']], fails: 'postcode is marked (pii): INDIRECT' },
      { swap: [['  customerId: string\n', '  customerId:\n    type: string\n    (pii): INDIRECT\n', 'types/customer.raml']], fails: 'customerId carries no (pii)' },
      { swap: [['allowedTargets: [ TypeDeclaration ]\n', 'allowedTargets: [ TypeDeclaration, Resource ]\n', 'annotations/pii.raml']], fails: 'pii is allowed only on TypeDeclaration' },
      { swap: [['  pii: !include annotations/pii.raml\n', '  pii:\n    type: string\n    enum: [ DIRECT, INDIRECT ]\n    allowedTargets: [ TypeDeclaration ]\n']], fails: 'pii comes from annotations/pii.raml' },
      { swap: [['        basis: CONSENT\n', '        basis: CONTRACT\n']], fails: 'basis CONSENT' },
      { swap: [['    days: 2555\n', '    days: 365\n']], fails: '2555 days' },
      { swap: [['  email:\n    type: string\n    (pii): DIRECT\n', '  email:\n    type: string\n', 'types/customer.raml']], fails: 'fullName and email are marked' },
    ],
    right: [
      {
        swap: [
          ['allowedTargets: [ TypeDeclaration ]\n', 'allowedTargets: TypeDeclaration\n', 'annotations/pii.raml'],
          ['  (retention):\n    days: 2555\n    basis: CONTRACT\n', '  (retention): { days: 2555, basis: CONTRACT }\n'],
          ['{customerId}', '{id}'],
        ],
      },
      {
        swap: [
          ['description: DIRECT identifies a person alone. INDIRECT identifies a person together with other data.\n', '', 'annotations/pii.raml'],
          ['type: object\nproperties:\n  days:\n', 'properties:\n  days:\n', 'annotations/retention.raml'],
          ['type: object\nproperties:\n', 'properties:\n', 'types/customer.raml'],
        ],
      },
    ],
  },
  {
    id: 'rm-092',
    wrong: [
      { swap: [['securedBy: [ sec.oauth2: { scopes: [ leave:approve ] } ]', 'securedBy: [ sec.oauth2: { scopes: [ leave:write ] } ]']], fails: 'needs leave:approve only' },
      { swap: [['(sec.dataClass): CONFIDENTIAL', '(dataClass): CONFIDENTIAL']], fails: valid },
      { swap: [['securedBy: [ sec.clientId ]', 'securedBy: [ clientId ]']], fails: valid },
      { swap: [['(sec.dataClass): CONFIDENTIAL', '(sec.dataClass): INTERNAL']], fails: 'marked (sec.dataClass): CONFIDENTIAL' },
      { swap: [['    allowedTargets: [ API ]\n', '    allowedTargets: [ API, Resource ]\n', 'libraries/security.raml']], fails: 'on API only' },
      { swap: [['      scopes: [ leave:read, leave:write, leave:approve ]\n', '      scopes: [ leave:read, leave:write ]\n', 'libraries/security.raml']], fails: 'exactly leave:read' },
      { swap: [['      authorizationGrants: [ authorization_code ]\n', '      authorizationGrants: [ password ]\n', 'libraries/security.raml']], fails: 'authorization_code grant' },
      { swap: [['securedBy: [ sec.clientId ]\n', 'securedBy: [ sec.clientId, null ]\n']], fails: 'GET /leave-types uses it' },
      { swap: [['securedBy: [ sec.oauth2: { scopes: [ leave:write ] } ]', 'securedBy: [ sec.oauth2: { scopes: [ leave:read, leave:write ] } ]']], fails: 'needs leave:write only' },
      { swap: [['  sec: libraries/security.raml\n', '  sec: !include libraries/security.raml\n']], fails: valid },
      { swap: [['#%RAML 1.0 Library\n', '#%RAML 1.0 SecurityScheme\n', 'libraries/security.raml']], fails: 'uses libraries/security.raml' },
    ],
    right: [
      {
        swap: [
          ['    allowedTargets: [ API ]\n', '    allowedTargets: API\n', 'libraries/security.raml'],
          ['{requestId}', '{id}'],
          ['securedBy: [ sec.oauth2: { scopes: [ leave:read ] } ]', 'securedBy:\n        - sec.oauth2:\n            scopes: [ leave:read ]'],
        ],
      },
      {
        swap: [
          ['securedBy: [ sec.clientId ]\n', 'securedBy:\n  - sec.clientId\n'],
          ['      from: date-only\n      to: date-only\n', '      from:\n        type: date-only\n        description: The first day of leave.\n      to:\n        type: date-only\n        description: The last day of leave.\n'],
        ],
      },
    ],
  },
  {
    id: 'rm-093',
    wrong: [
      { swap: [['  authorizationGrants: [ authorization_code, client_credentials ]\n', '  authorizationGrants: [ authorization_code ]\n', 'security/oauth2.raml']], fails: 'authorization_code and client_credentials grants' },
      { swap: [['    securedBy: [ oauth2: { scopes: [ fundsconfirmations ] } ]\n', '    securedBy: [ oauth2: { scopes: [ accounts ] } ]\n']], fails: 'needs fundsconfirmations only' },
      { swap: [['    is: [ idempotent ]\n', '']], fails: 'idempotent comes from traits/idempotent.raml' },
      { swap: [['    maxLength: 40\n', '', 'traits/idempotent.raml']], fails: 'x-idempotency-key of at most 40' },
      { swap: [['  x-idempotency-key:\n', '  x-idempotency-key?:\n', 'traits/idempotent.raml']], fails: 'x-idempotency-key of at most 40' },
      { swap: [['  post:\n    (sca): PER_CALL\n', '  (sca): PER_CALL\n  post:\n']], fails: valid },
      { swap: [['    (sca): PER_CALL\n', '    (sca): PERIODIC\n']], fails: 'the POST is marked PER_CALL' },
      { swap: [['    securedBy: [ null ]\n', '']], fails: 'GET /health returns 200 with no token' },
      { swap: [['securedBy: [ oauth2 ]\n', 'securedBy: [ null, oauth2 ]\n'], ['  /{paymentId}:\n    get:\n      securedBy: [ oauth2: { scopes: [ payments ] } ]\n', '  /{paymentId}:\n    get:\n']], fails: 'Both payment methods need payments only' },
      { swap: [['        pattern: ^[0-9]{6}$\n', '        pattern: ^[0-9-]{6,8}$\n']], fails: 'sort code' },
      { swap: [['        maxLength: 18\n', '        maxLength: 35\n']], fails: 'sort code, account number, amount and reference' },
      { swap: [['        headers:\n          Location:\n            type: string\n', '']], fails: 'PaymentStatus with Location' },
      { swap: [['#%RAML 1.0 SecurityScheme\n', '#%RAML 1.0 Trait\n', 'security/oauth2.raml']], fails: valid },
      { swap: [['    403:\n      description: The token does not hold the scope this method needs.\n', '', 'security/oauth2.raml']], fails: 'a 401 and a 403' },
      { swap: [['  scopes: [ accounts, payments, fundsconfirmations ]\n', '  scopes: [ accounts, payments, fundsconfirmations, admin ]\n', 'security/oauth2.raml']], fails: 'exactly accounts, payments and fundsconfirmations' },
    ],
    right: [
      {
        swap: [
          ['securedBy: [ oauth2 ]\n\n', ''],
          ['{paymentId}', '{id}'],
          ['    allowedTargets: [ Method ]\n', '    allowedTargets: Method\n'],
        ],
      },
      {
        swap: [
          ['        pattern: ^[0-9]{6}$\n', '        pattern: ^\\d{6}$\n'],
          ['        pattern: ^[0-9]{8}$\n', '        pattern: "^[0-9]{8}$"\n'],
          ['/accounts:\n  get:\n', '/accounts:\n  description: Accounts the customer chose to share.\n  get:\n'],
        ],
      },
    ],
  },
  {
    id: 'rm-094',
    wrong: [
      { swap: [['    type: OAuth 2.0\n', '    type: OAuth2\n']], fails: 'Finding 1' },
      { swap: [['securedBy: [ oauth2 ]\n', 'securedBy: [ null, oauth2 ]\n']], fails: 'Finding 3: the default' },
      {
        swap: [['    get:\n      securedBy: [ oauth2: { scopes: [ claims:read ] } ]\n      responses:\n        200:\n          body:\n            type: Claim\n', '    get:\n      responses:\n        200:\n          body:\n            type: Claim\n']],
        fails: 'Finding 3: GET /claims/{claimId}',
      },
      { swap: [['/health:\n  get:\n    securedBy: [ null ]\n', '/health:\n  get:\n']], fails: 'Finding 3: GET /health' },
      { swap: [['securedBy: [ oauth2: { scopes: [ claims:admin ] } ]\n      responses:\n        204:', 'securedBy: [ oauth2: { scopes: [ claims:write, claims:admin ] } ]\n      responses:\n        204:']], fails: 'Finding 4' },
      { swap: [['        403:\n          description: The token does not hold the scope this method needs.\n', '']], fails: 'Finding 5' },
      { swap: [['    securedBy: [ oauth2: { scopes: [ claims:admin ] } ]\n    responses:\n      202:', '    securedBy: [ null, oauth2: { scopes: [ claims:admin ] } ]\n    responses:\n      202:']], fails: 'Finding 6' },
      { swap: [['protocols: [ HTTPS ]', 'protocols: [ HTTP, HTTPS ]']], fails: 'Finding 7: protocols' },
      {
        swap: [
          ['      scopes: [ claims:read, claims:write, claims:admin ]\n', '      scopes: [ claims:read, claims:write, claims:admin ]\n  legacyBasic:\n    type: Basic Authentication\n'],
          ['        securedBy: [ oauth2: { scopes: [ claims:read ] } ]\n', '        securedBy: [ legacyBasic ]\n'],
        ],
        fails: 'Finding 7: GET /claims/{claimId}/documents',
      },
      { swap: [['#%RAML 1.0 DataType\n', '#%RAML 1.0 Library\n', 'types/claim.raml']], fails: valid },
      { swap: [['  lossDate: date-only\n', '  lossDate?: date-only\n', 'types/claim.raml']], fails: 'Finding 8' },
      { swap: [['      scopes: [ claims:read, claims:write, claims:admin ]\n', '      scopes: [ claims:read, claims:write ]\n']], fails: 'Finding 2' },
    ],
    right: [
      {
        swap: [
          ['      scopes: [ claims:read, claims:write, claims:admin ]\n', '      scopes: [ claims:read, claims:write, claims:admin ]\n  legacyBasic:\n    type: Basic Authentication\n'],
          ['{claimId}', '{id}'],
        ],
      },
      {
        swap: [
          ['/admin/reindex:\n  post:\n', '/admin/reindex:\n  securedBy: [ oauth2: { scopes: [ claims:admin ] } ]\n  post:\n'],
          ['    securedBy: [ oauth2: { scopes: [ claims:admin ] } ]\n    responses:\n      202:', '    responses:\n      202:'],
          ['type: object\nproperties:\n', 'properties:\n', 'types/claim.raml'],
        ],
      },
    ],
  },
]
