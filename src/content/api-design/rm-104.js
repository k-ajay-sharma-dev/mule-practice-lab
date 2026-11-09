export default {
  id: 'rm-104',
  category: 'api-design',
  title: 'Energy Tariffs API: Run v1 and v2 Side by Side with Sunset Headers',
  level: 'EXPERT',
  tags: ['raml', 'api-design', 'versioning', 'backward-compatibility', 'traits', 'annotations', 'energy'],
  estMinutes: 45,
  description: `
An energy supplier publishes its tariffs to 120 price comparison sites. Regulation now requires the unit rate and the daily standing charge as separate amounts, each with a currency. v1 has one number, \`pricePerKwh\`, so this is a **breaking change**: it removes a field and changes the shape of the price.

The comparison sites cannot all move on the same day. The platform team agrees to run both major versions on one API instance for six months:
- \`baseUri\` holds **no version**. The resource tree has a \`/v1\` branch and a \`/v2\` branch, so the path is the only place a version appears.
- v1 stays exactly as it was, so existing callers see no change in their data.
- Every v1 response warns callers at run time with two standard headers. \`Deprecation\` says the version is deprecated. \`Sunset\` gives the date it stops working. Both come from one trait, so the warning cannot be forgotten on a method.
- The \`/v1\` branch carries a \`(sunset)\` annotation with the date, so governance tools and Exchange readers can find it too.

**Requirements**
- Keep the title \`Energy Tariffs API\` and JSON as the default media type. Set \`baseUri\` to \`https://api.example.com/tariffs\`.
- Keep \`TariffV1\` as it is: required strings \`tariffCode\` and \`name\`, and a required number \`pricePerKwh\`.
- A type \`Money\` with a required number \`amount\` and a required string \`currency\`.
- A type \`TariffV2\` with required strings \`tariffCode\` and \`name\`, a required \`unitRate\` of type \`Money\`, a required \`standingChargePerDay\` of type \`Money\`, and an optional integer \`greenPercent\` from 0 to 100. It has no \`pricePerKwh\`.
- A type \`Error\` with required strings \`code\` and \`message\`.
- An annotation type \`sunset\` of type \`date-only\`, and \`(sunset): 2027-06-30\` on the \`/v1\` resource.
- A trait \`deprecatedVersion\` whose 200 response has the headers \`Deprecation\` and \`Sunset\`.
- \`GET /v1/tariffs\` returns 200 with \`TariffV1[]\`. \`GET /v1/tariffs/{tariffCode}\` returns 200 with a \`TariffV1\`, or 404. Both use \`deprecatedVersion\`.
- \`GET /v2/tariffs\` returns 200 with \`TariffV2[]\`. \`GET /v2/tariffs/{tariffCode}\` returns 200 with a \`TariffV2\`, or 404 with an \`Error\`.
`,
  starter: `#%RAML 1.0
title: Energy Tariffs API
version: v1
baseUri: https://api.example.com/tariffs/{version}
mediaType: application/json

types:
  TariffV1:
    type: object
    properties:
      tariffCode: string
      name: string
      pricePerKwh: number

/tariffs:
  get:
    responses:
      200:
        body:
          type: TariffV1[]
  /{tariffCode}:
    get:
      responses:
        200:
          body:
            type: TariffV1
        404:
          description: No tariff has this code.
`,
  ramlChecks: [
    {
      label: 'baseUri is https://api.example.com/tariffs with no version in it',
      rule: {
        type: 'all',
        rules: [
          { type: 'root', key: 'baseUri', want: 'api.example.com/tariffs' },
          { type: 'root', key: 'baseUri', want: { not: '{version}' } },
          { type: 'root', key: 'baseUri', want: { not: '/v1' } },
          { type: 'root', key: 'baseUri', want: { not: '/v2' } },
        ],
      },
    },
    {
      label: 'TariffV1 is unchanged, with a required number pricePerKwh',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'TariffV1', prop: 'tariffCode', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'TariffV1', prop: 'name', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'TariffV1', prop: 'pricePerKwh', want: { type: 'number', required: true } },
        ],
      },
    },
    {
      label: 'Money has a required number amount and string currency',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Money', prop: 'amount', want: { type: 'number', required: true } },
          { type: 'prop', typeName: 'Money', prop: 'currency', want: { type: 'string', required: true } },
        ],
      },
    },
    {
      label: 'TariffV2 has a required unitRate and standingChargePerDay, both Money',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'TariffV2', prop: 'tariffCode', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'TariffV2', prop: 'unitRate', want: { type: 'Money', required: true } },
          { type: 'prop', typeName: 'TariffV2', prop: 'standingChargePerDay', want: { type: 'Money', required: true } },
        ],
      },
    },
    { label: 'greenPercent is an optional integer from 0 to 100', rule: { type: 'prop', typeName: 'TariffV2', prop: 'greenPercent', want: { type: 'integer', required: false, minimum: 0, maximum: 100 } } },
    {
      label: 'TariffV2 has no pricePerKwh, not even by inheritance',
      rule: { type: 'all', rules: [{ type: 'typeDecl', name: 'TariffV2' }, { type: 'noProp', typeName: 'TariffV2', prop: 'pricePerKwh' }] },
    },
    {
      label: 'The /v1 branch is annotated (sunset): 2027-06-30 with a date-only annotation type',
      rule: {
        type: 'all',
        rules: [
          { type: 'annotationType', name: 'sunset', want: { type: 'date-only' } },
          { type: 'annotated', name: 'sunset', path: '/v1', value: '2027-06-30' },
        ],
      },
    },
    {
      label: 'The deprecatedVersion trait puts Deprecation and Sunset on the 200 response',
      rule: {
        type: 'all',
        rules: [
          { type: 'trait', name: 'deprecatedVersion', has: 'responses.200.headers.Deprecation' },
          { type: 'trait', name: 'deprecatedVersion', has: 'responses.200.headers.Sunset' },
        ],
      },
    },
    {
      label: 'Both v1 methods use deprecatedVersion',
      rule: {
        type: 'all',
        rules: [
          { type: 'applied', path: '/v1/tariffs', method: 'get', trait: 'deprecatedVersion' },
          { type: 'applied', path: '/v1/tariffs/{}', method: 'get', trait: 'deprecatedVersion' },
        ],
      },
    },
    {
      label: 'v1 still returns TariffV1, now with a Sunset header',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/v1/tariffs', method: 'get', status: '200', typeIs: 'TariffV1[]', header: 'Sunset' },
          { type: 'response', path: '/v1/tariffs/{}', method: 'get', status: '200', typeIs: 'TariffV1', header: 'Sunset' },
          { type: 'response', path: '/v1/tariffs/{}', method: 'get', status: '404' },
        ],
      },
    },
    {
      label: 'v2 returns TariffV2, and 404 with an Error',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/v2/tariffs', method: 'get', status: '200', typeIs: 'TariffV2[]' },
          { type: 'response', path: '/v2/tariffs/{}', method: 'get', status: '200', typeIs: 'TariffV2' },
          { type: 'prop', typeName: 'Error', prop: 'code', want: { type: 'string', required: true } },
          { type: 'response', path: '/v2/tariffs/{}', method: 'get', status: '404', typeIs: 'Error' },
        ],
      },
    },
    { label: 'No unversioned /tariffs resource is left', rule: { type: 'all', rules: [{ type: 'resource', path: '/v2/tariffs' }, { type: 'noResource', path: '/tariffs' }] } },
  ],
  referenceRaml: `#%RAML 1.0
title: Energy Tariffs API
baseUri: https://api.example.com/tariffs
mediaType: application/json

annotationTypes:
  sunset:
    type: date-only
    allowedTargets: [ Resource ]

types:
  TariffV1:
    type: object
    properties:
      tariffCode: string
      name: string
      pricePerKwh: number
  Money:
    type: object
    properties:
      amount: number
      currency: string
  TariffV2:
    type: object
    properties:
      tariffCode: string
      name: string
      unitRate: Money
      standingChargePerDay: Money
      greenPercent?:
        type: integer
        minimum: 0
        maximum: 100
  Error:
    type: object
    properties:
      code: string
      message: string

traits:
  deprecatedVersion:
    responses:
      200:
        headers:
          Deprecation:
            type: string
            description: Says that this version is deprecated.
            example: "true"
          Sunset:
            type: datetime
            format: rfc2616
            description: When this version stops working.
          Link:
            type: string
            description: Points to the migration guide.

/v1:
  (sunset): 2027-06-30
  /tariffs:
    get:
      is: [ deprecatedVersion ]
      responses:
        200:
          body:
            type: TariffV1[]
    /{tariffCode}:
      get:
        is: [ deprecatedVersion ]
        responses:
          200:
            body:
              type: TariffV1
          404:
            description: No tariff has this code.

/v2:
  /tariffs:
    get:
      responses:
        200:
          body:
            type: TariffV2[]
    /{tariffCode}:
      get:
        responses:
          200:
            body:
              type: TariffV2
          404:
            body:
              type: Error
`,
  keyPoints: [
    'Removing a field or changing its shape is a breaking change, so it needs a new major version.',
    'When two majors share one contract, the version lives in one place only, here the path.',
    'v1 data stays exactly as it was. Only warning headers are added, which old callers can ignore.',
    'Deprecation and Sunset headers warn callers at run time. An annotation warns readers of the contract.',
    'A trait applies the warning to every v1 method, so none is missed.',
  ],
  solution: `
The starter put the version in \`baseUri\`. That works for one version per contract, but this contract serves two. Keeping \`{version}\` there and adding \`/v1\` and \`/v2\` paths would give URLs such as \`/tariffs/v1/v2/tariffs\`. So the version leaves \`baseUri\` and becomes the top of the resource tree.

\`TariffV2\` is its own type, not a subtype of \`TariffV1\`. Inheriting would bring \`pricePerKwh\` back as a required field, which is exactly what the regulation removed.

The trait adds headers to the 200 that each v1 method already declares. A caller that ignores unknown headers sees no change at all. A caller that logs them gets six months of warning. \`Link\` points to the migration guide, which is the usual companion of \`Sunset\`.

\`(sunset)\` uses \`date-only\` as its type, so a typo such as \`2027-6-30\` fails validation. \`allowedTargets: [ Resource ]\` keeps it on resources only.

In API Manager, a common follow-up is to apply this contract to one API instance, then watch analytics for the client ids still calling \`/v1\` and contact them before the sunset date.
`,
  followUps: [
    {
      q: 'When would you publish v2 as a separate API in Exchange instead?',
      a: 'When the versions differ a lot, have different owners, or need different policies and SLA tiers. Separate assets keep each contract small. One shared contract suits a short migration window where the data is mostly the same.',
    },
    {
      q: 'How does the Mule application serve both versions without duplicating logic?',
      a: 'APIkit generates flows for both branches. The v1 flows call the same core logic as v2 and map the result back to the old shape in DataWeave, adding unitRate and standingChargePerDay into one price.',
    },
    {
      q: 'What happens on the sunset date?',
      a: 'The v1 paths start answering 410 Gone with a message pointing to v2. Keep that for a while so late callers get a clear reason rather than a 404.',
    },
    {
      q: 'Why not add the new money fields to v1 and keep pricePerKwh as well?',
      a: 'That works as an additive change if pricePerKwh can still be computed. Here regulation forbids a single combined price, so keeping it would publish a figure the supplier may no longer show.',
    },
  ],
}
