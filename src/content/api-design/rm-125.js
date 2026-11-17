export default {
  id: 'rm-125',
  category: 'api-design',
  title: 'Charity Donations Process API: One-Off and Monthly Gifts, Refunds and Scopes',
  level: 'EXPERT',
  tags: ['raml', 'api-design', 'process-api', 'discriminator', 'idempotency', 'oauth2', 'traits', 'money', 'charity'],
  estMinutes: 45,
  description: `
A national charity takes donations on its website, at events on card readers, and through two fundraising partners. All of them will call one new **Process API**. It talks to the payment provider, the donor database and the finance system.

A donation is either **one-off**, paid now with a card token, or **monthly**, collected on a set day of each month. The two have different fields, and the old API made every field optional to fit both. Half of the monthly gifts arrived with no collection day.

Finance also asks for three things:

- Card readers at events lose signal and retry. A retried donation must never charge the donor twice.
- A donation can be refunded in part or in full, but never for more than was paid.
- Only the supporter care team may refund. Partners may create and read donations.

**Brief**
- Amounts are in pounds, with at most two decimal places. One gift is 1 to 25,000.
- Currency is a three-letter code in capitals.
- A monthly gift is collected on a day from 1 to 28, so every month has that day.
- A refund reason is one of \`DONOR_REQUEST\`, \`DUPLICATE\`, \`FRAUD\`.

**Requirements**
- Title \`Charity Donations Process API\`, with JSON as the default media type.
- \`Money\` has a required number \`amount\` from 1 to 25000 in steps of 0.01, and a required \`currency\` with a pattern of three capital letters.
- \`Donation\` has a required string \`donorId\`, a required \`gift\` of type \`Money\`, and a required string \`kind\` that is its **discriminator**.
- \`OneOffDonation\` inherits from \`Donation\` with the discriminator value \`ONE_OFF\`, and adds a required string \`cardToken\`.
- \`MonthlyDonation\` inherits from \`Donation\` with the discriminator value \`MONTHLY\`, and adds a required integer \`collectionDay\` from 1 to 28, and a required \`startOn\` that is a date with no time.
- \`RefundRequest\` has a required \`refund\` of type \`Money\` and a required \`reason\` from the list above. \`Refund\` inherits from it and adds a required string \`refundId\`.
- A type \`Error\` with a required string \`code\` and a required string \`message\`.
- An OAuth 2.0 security scheme with the scopes \`donations:read\`, \`donations:write\` and \`refunds:write\`.
- Trait \`idempotent\` has a required string header \`Idempotency-Key\`. Trait \`paged\` has the integer query parameters \`page\` and \`pageSize\`.
- \`POST /donations\` is secured with \`donations:write\`, uses \`idempotent\`, takes a \`Donation\`, and returns a \`Donation\` with 201 and a \`Location\` header. It returns an \`Error\` with 422 when the payment is declined.
- \`GET /donations\` is secured with \`donations:read\`, uses \`paged\`, and returns a list of \`Donation\`.
- \`GET /donations/{donationId}\` is secured with \`donations:read\` and returns a \`Donation\`, or 404.
- \`POST /donations/{donationId}/refunds\` is secured with \`refunds:write\` only, uses \`idempotent\`, takes a \`RefundRequest\`, and returns a \`Refund\` with 201 and a \`Location\` header. It returns an \`Error\` with 409 when the donation is already fully refunded, and with 422 when the refund is more than what is left.
- \`/donations/{donationId}\` has no \`put\`, \`patch\` or \`delete\`. Money moves only through the actions above.
`,
  starter: `#%RAML 1.0
title: Charity Donations Process API
mediaType: application/json

types:
  Donation:
    type: object
    properties:
      donorId: string
      amount?: number
      currency?: string
      cardToken?: string
      collectionDay?: integer
      startOn?: string

/donations:
  post:
    body:
      type: Donation
`,
  ramlChecks: [
    {
      label: 'The title is Charity Donations Process API and JSON is the default',
      rule: { type: 'all', rules: [{ type: 'root', key: 'title', want: 'Charity Donations Process API' }, { type: 'root', key: 'mediaType', want: 'application/json' }] },
    },
    {
      label: 'Money has an amount from 1 to 25000 in steps of 0.01, and a currency code',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Money', prop: 'amount', want: { type: 'number', required: true, minimum: 1, maximum: 25000, multipleOf: 0.01 } },
          { type: 'prop', typeName: 'Money', prop: 'currency', want: { required: true, pattern: { accepts: ['GBP', 'EUR'], rejects: ['gbp', 'GB', 'POUND', 'XGBP'] } } },
        ],
      },
    },
    {
      label: 'Donation has donorId, a Money gift and kind as its discriminator',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Donation', prop: 'donorId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Donation', prop: 'gift', want: { type: 'Money', required: true } },
          { type: 'prop', typeName: 'Donation', prop: 'kind', want: { type: 'string', required: true } },
          { type: 'typeDecl', name: 'Donation', want: { discriminator: 'kind' } },
        ],
      },
    },
    {
      label: 'OneOffDonation is ONE_OFF and adds cardToken',
      rule: {
        type: 'all',
        rules: [
          { type: 'typeDecl', name: 'OneOffDonation', extends: 'Donation', want: { discriminatorValue: { is: 'ONE_OFF' } } },
          { type: 'prop', typeName: 'OneOffDonation', prop: 'cardToken', want: { type: 'string', required: true } },
        ],
      },
    },
    {
      label: 'MonthlyDonation is MONTHLY and adds collectionDay 1 to 28 and startOn',
      rule: {
        type: 'all',
        rules: [
          { type: 'typeDecl', name: 'MonthlyDonation', extends: 'Donation', want: { discriminatorValue: { is: 'MONTHLY' } } },
          { type: 'prop', typeName: 'MonthlyDonation', prop: 'collectionDay', want: { type: 'integer', required: true, minimum: 1, maximum: 28 } },
          { type: 'prop', typeName: 'MonthlyDonation', prop: 'startOn', want: { type: 'date-only', required: true } },
        ],
      },
    },
    {
      label: 'RefundRequest has a Money refund and a reason, and Refund adds refundId',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'RefundRequest', prop: 'refund', want: { type: 'Money', required: true } },
          { type: 'prop', typeName: 'RefundRequest', prop: 'reason', want: { required: true, enum: { exactly: ['DONOR_REQUEST', 'DUPLICATE', 'FRAUD'] } } },
          { type: 'typeDecl', name: 'Refund', extends: 'RefundRequest' },
          { type: 'prop', typeName: 'Refund', prop: 'refundId', want: { type: 'string', required: true } },
        ],
      },
    },
    {
      label: 'An OAuth 2.0 scheme lists the three scopes',
      rule: { type: 'scheme', schemeType: 'OAuth 2.0', values: { 'settings.scopes': ['donations:read', 'donations:write', 'refunds:write'] } },
    },
    {
      label: 'idempotent and paged traits are declared',
      rule: {
        type: 'all',
        rules: [
          { type: 'trait', name: 'idempotent', has: 'headers.Idempotency-Key' },
          { type: 'trait', name: 'paged', values: { 'queryParameters.page.type': 'integer', 'queryParameters.pageSize.type': 'integer' } },
        ],
      },
    },
    {
      label: 'POST /donations needs donations:write and an Idempotency-Key',
      rule: {
        type: 'all',
        rules: [
          { type: 'secured', path: '/donations', method: 'post', scheme: 'oauth', scopes: ['donations:write'], required: true },
          { type: 'applied', path: '/donations', method: 'post', trait: 'idempotent' },
          { type: 'param', path: '/donations', method: 'post', in: 'header', name: 'Idempotency-Key', want: { type: 'string', required: true } },
        ],
      },
    },
    {
      label: 'POST /donations takes a Donation and returns 201 with Location, or 422',
      rule: {
        type: 'all',
        rules: [
          { type: 'body', path: '/donations', method: 'post', typeIs: 'Donation' },
          { type: 'response', path: '/donations', method: 'post', status: '201', typeIs: 'Donation', header: 'Location' },
          { type: 'response', path: '/donations', method: 'post', status: '422', typeIs: 'Error' },
        ],
      },
    },
    {
      label: 'Reading donations needs donations:read, and the list is paged',
      rule: {
        type: 'all',
        rules: [
          { type: 'secured', path: '/donations', method: 'get', scheme: 'oauth', scopes: ['donations:read'], required: true },
          { type: 'applied', path: '/donations', method: 'get', trait: 'paged' },
          { type: 'response', path: '/donations', method: 'get', status: '200', typeIs: 'Donation[]' },
          { type: 'secured', path: '/donations/{}', method: 'get', scheme: 'oauth', scopes: ['donations:read'], required: true },
          { type: 'response', path: '/donations/{}', method: 'get', status: '200', typeIs: 'Donation' },
          { type: 'response', path: '/donations/{}', method: 'get', status: '404' },
        ],
      },
    },
    {
      label: 'Refunds need refunds:write only and an Idempotency-Key',
      rule: {
        type: 'all',
        rules: [
          { type: 'secured', path: '/donations/{}/refunds', method: 'post', scheme: 'oauth', scopes: ['refunds:write'], onlyScopes: true, required: true },
          { type: 'applied', path: '/donations/{}/refunds', method: 'post', trait: 'idempotent' },
        ],
      },
    },
    {
      label: 'A refund returns 201 with Location, 409 or 422',
      rule: {
        type: 'all',
        rules: [
          { type: 'body', path: '/donations/{}/refunds', method: 'post', typeIs: 'RefundRequest' },
          { type: 'response', path: '/donations/{}/refunds', method: 'post', status: '201', typeIs: 'Refund', header: 'Location' },
          { type: 'response', path: '/donations/{}/refunds', method: 'post', status: '409', typeIs: 'Error' },
          { type: 'response', path: '/donations/{}/refunds', method: 'post', status: '422', typeIs: 'Error' },
        ],
      },
    },
    {
      label: 'A donation cannot be replaced, patched or deleted',
      rule: {
        type: 'all',
        rules: [
          { type: 'resource', path: '/donations/{}' },
          { type: 'noMethod', path: '/donations/{}', method: 'put' },
          { type: 'noMethod', path: '/donations/{}', method: 'patch' },
          { type: 'noMethod', path: '/donations/{}', method: 'delete' },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Charity Donations Process API
version: v1
baseUri: https://api.example.com/donations/{version}
mediaType: application/json

securitySchemes:
  oauth2:
    type: OAuth 2.0
    describedBy:
      headers:
        Authorization:
          description: The access token, as Bearer followed by the token.
          type: string
      responses:
        401:
          description: The token is missing, expired or not valid.
        403:
          description: The token does not hold the scope this method needs.
    settings:
      accessTokenUri: https://auth.example.com/token
      authorizationGrants: [ client_credentials ]
      scopes: [ donations:read, donations:write, refunds:write ]

types:
  Money:
    type: object
    properties:
      amount:
        type: number
        minimum: 1
        maximum: 25000
        multipleOf: 0.01
      currency:
        type: string
        pattern: ^[A-Z]{3}$
  Donation:
    type: object
    discriminator: kind
    properties:
      donorId: string
      gift: Money
      kind: string
  OneOffDonation:
    type: Donation
    discriminatorValue: ONE_OFF
    properties:
      cardToken: string
    example:
      donorId: D-448812
      gift:
        amount: 25
        currency: GBP
      kind: ONE_OFF
      cardToken: tok_9f3a7c21
  MonthlyDonation:
    type: Donation
    discriminatorValue: MONTHLY
    properties:
      collectionDay:
        type: integer
        minimum: 1
        maximum: 28
      startOn: date-only
    example:
      donorId: D-448812
      gift:
        amount: 10
        currency: GBP
      kind: MONTHLY
      collectionDay: 15
      startOn: 2026-12-15
  RefundRequest:
    type: object
    properties:
      refund: Money
      reason:
        type: string
        enum: [ DONOR_REQUEST, DUPLICATE, FRAUD ]
  Refund:
    type: RefundRequest
    properties:
      refundId: string
  Error:
    type: object
    properties:
      code: string
      message: string

traits:
  idempotent:
    headers:
      Idempotency-Key:
        type: string
        minLength: 16
        description: A unique value per attempt. A retry with the same key returns the first result.
  paged:
    queryParameters:
      page:
        type: integer
        minimum: 1
        default: 1
      pageSize:
        type: integer
        minimum: 1
        maximum: 100
        default: 20

/donations:
  get:
    securedBy: [ oauth2: { scopes: [ donations:read ] } ]
    is: [ paged ]
    responses:
      200:
        body:
          type: Donation[]
  post:
    securedBy: [ oauth2: { scopes: [ donations:write ] } ]
    is: [ idempotent ]
    body:
      type: Donation
    responses:
      201:
        headers:
          Location:
            type: string
        body:
          type: Donation
      422:
        description: The payment provider declined the card, or the mandate could not be set up.
        body:
          type: Error
  /{donationId}:
    get:
      securedBy: [ oauth2: { scopes: [ donations:read ] } ]
      responses:
        200:
          body:
            type: Donation
        404:
          description: No donation has this id.
    /refunds:
      post:
        securedBy: [ oauth2: { scopes: [ refunds:write ] } ]
        is: [ idempotent ]
        body:
          type: RefundRequest
        responses:
          201:
            headers:
              Location:
                type: string
            body:
              type: Refund
          409:
            description: The donation is already fully refunded.
            body:
              type: Error
          422:
            description: The refund is more than the amount left on the donation.
            body:
              type: Error
`,
  keyPoints: [
    'A discriminator gives each kind of donation its own strict shape, instead of one type where every field is optional.',
    'A body typed as the base type lets the discriminator value tell a validator which subtype to apply.',
    'One Money type with multipleOf: 0.01 keeps every amount to whole pence, on gifts and on refunds alike.',
    'Every POST that moves money and can be retried takes an Idempotency-Key.',
    'Separate scopes let partners create donations without being able to refund them.',
    '409 says the state forbids the action. 422 says this request breaks a business rule.',
    'Refunds are their own resource, so each one is recorded, and nobody can edit a donation amount.',
  ],
  solution: `
**Two kinds, two shapes.** \`Donation\` holds what every gift has, and names \`kind\` as its discriminator. \`OneOffDonation\` and \`MonthlyDonation\` each add their own required fields. A caller sends \`"kind": "MONTHLY"\`, and a validator that supports discriminators checks \`collectionDay\` and \`startOn\` as required. The monthly gifts with no collection day are now refused with a 400.

**Money.** \`gift\` and \`refund\` both use \`Money\`. \`multipleOf: 0.01\` refuses fractions of a penny, and \`collectionDay\` stops at 28 so every month has the day.

**Retries.** The card reader sends a new \`Idempotency-Key\` for each gift and the same key on each retry. The API stores the key with the first result and returns that result again, so the donor is charged once. Refunds use the same trait, so a double click in the care team's tool cannot refund twice.

**Scopes.**
| Caller | Scopes |
|---|---|
| Website, card readers, partners | \`donations:read\`, \`donations:write\` |
| Supporter care team tool | \`donations:read\`, \`refunds:write\` |

The refund method asks for \`refunds:write\` and nothing else. A partner token can never reach it.

**Refund rules.**
| Case | Status |
|---|---|
| Refund of 10 on a gift of 25, nothing refunded yet | 201 |
| Refund of 20 when 10 is already refunded | 422, more than what is left |
| Any refund on a fully refunded gift | 409, the state forbids it |

**No edits.** \`/donations/{donationId}\` has no \`put\`, \`patch\` or \`delete\`. A wrong amount is fixed with a refund and a new gift, so finance keeps a full record of every change.
`,
  followUps: [
    {
      q: 'Why type the POST body as Donation and not as a union of the two kinds?',
      a: 'Both can work. With a discriminator on the base type, the value of kind tells a validator which subtype to use. A union, OneOffDonation | MonthlyDonation, says the same thing more openly. Check what your validator supports, and test both kinds against it.',
    },
    {
      q: 'How would a partner cancel a monthly gift?',
      a: 'With an action resource such as POST /donations/{donationId}/cancellation, which stops future collections and keeps the record. Give it its own scope if partners should not be able to do it.',
    },
    {
      q: 'Where does the card token come from?',
      a: 'The website or card reader sends the card details straight to the payment provider and gets a token back. The API only sees the token, which keeps raw card numbers out of Mule and out of the logs.',
    },
    {
      q: 'Should the Idempotency-Key be checked against the request body?',
      a: 'Yes. Store a hash of the body with the key. If the same key arrives with a different body, answer 422 instead of returning the first result, because the caller has reused a key by mistake.',
    },
  ],
}
