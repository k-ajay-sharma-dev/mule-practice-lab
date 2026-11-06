export default {
  id: 'rm-055',
  category: 'api-design',
  title: 'My Account Mobile API: A Small Experience Type from a Large Library Type',
  level: 'ADVANCED',
  tags: ['raml', 'api-design', 'experience-api', 'libraries', 'inheritance', 'telecom'],
  estMinutes: 40,
  description: `
A telecom's mobile app opens with a home screen: the customer's first name, plan and data left. Today it calls an API that returns the whole \`Subscriber\` record, including the national id and credit score. That is slow on a weak signal, and the phone holds data it has no reason to hold.

An **Experience API** is the layer in API-led connectivity shaped for one consumer, here the mobile app. It returns what that screen needs and no more.

The library \`libraries/subscriber.raml\` is shared by other APIs, and it holds the large \`Subscriber\` type. You want a small type built from it. There is a catch: RAML inheritance only **adds** properties. A type that inherits from \`Subscriber\` gets all of its fields, and it cannot remove any.

So turn it around. Move the few safe fields into a small parent type. \`Subscriber\` inherits from that parent, so it stays exactly as it was for other APIs, and the mobile type inherits from the same parent.

\`msisdn\` is the telecom word for a mobile phone number.

This problem has two files. Use the tabs above the editor to move between them.

**Requirements for \`libraries/subscriber.raml\`**
- A new type \`SubscriberCore\` with required strings \`msisdn\`, \`firstName\` and \`planCode\`.
- \`Subscriber\` inherits from \`SubscriberCore\`. It no longer declares those three itself, and it keeps all its other properties.
- \`SubscriberCore\` holds none of the sensitive fields: \`nationalId\`, \`creditScore\`, \`dateOfBirth\`, \`billingAddress\`.

**Requirements for \`api.raml\`**
- Title \`My Account Mobile API\`, with JSON as the default media type.
- Bring in the library with the prefix \`crm\`.
- A type \`AccountCard\` that inherits from \`crm.SubscriberCore\`. It adds a required string \`planName\` and a required integer \`dataLeftMb\` of at least 0.
- A type \`UsageDay\` with a required \`day\`, a date with no time, and a required integer \`dataMb\`.
- A trait \`mobileClient\` with a required string header \`X-App-Version\`. Its pattern allows three numbers with dots between them, such as \`4.12.0\`.
- \`GET /me/card\` uses \`mobileClient\` and returns an \`AccountCard\` with status 200. The response body has its own example.
- \`GET /me/usage\` uses \`mobileClient\` and returns \`UsageDay[]\` with status 200.
- \`GET /me/usage\` has an optional integer query parameter \`limit\` with a default of 7 and a maximum of 31.
`,
  starter: `#%RAML 1.0
title: My Account Mobile API
mediaType: application/json

uses:

types:

traits:

/me:
`,
  files: {
    'libraries/subscriber.raml': `#%RAML 1.0 Library
usage: Subscriber records shared by the telecom APIs.

types:
  Subscriber:
    type: object
    properties:
      msisdn: string
      firstName: string
      lastName: string
      planCode: string
      nationalId: string
      dateOfBirth: date-only
      billingAddress: string
      creditScore: integer
`,
  },
  ramlChecks: [
    { label: 'The API brings in libraries/subscriber.raml with the prefix crm', rule: { type: 'library', prefix: 'crm', file: 'libraries/subscriber.raml' } },
    {
      label: 'SubscriberCore has a required msisdn, firstName and planCode',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'crm.SubscriberCore', prop: 'msisdn', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'crm.SubscriberCore', prop: 'firstName', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'crm.SubscriberCore', prop: 'planCode', want: { type: 'string', required: true } },
        ],
      },
    },
    {
      label: 'SubscriberCore holds no sensitive fields',
      rule: {
        type: 'all',
        rules: [
          { type: 'typeDecl', name: 'crm.SubscriberCore' },
          { type: 'noProp', typeName: 'crm.SubscriberCore', prop: 'nationalId' },
          { type: 'noProp', typeName: 'crm.SubscriberCore', prop: 'creditScore' },
          { type: 'noProp', typeName: 'crm.SubscriberCore', prop: 'dateOfBirth' },
          { type: 'noProp', typeName: 'crm.SubscriberCore', prop: 'billingAddress' },
        ],
      },
    },
    { label: 'Subscriber inherits from SubscriberCore', rule: { type: 'typeDecl', name: 'crm.Subscriber', extends: 'crm.SubscriberCore' } },
    {
      label: 'Subscriber keeps all its properties for other APIs',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'crm.Subscriber', prop: 'msisdn' },
          { type: 'prop', typeName: 'crm.Subscriber', prop: 'lastName' },
          { type: 'prop', typeName: 'crm.Subscriber', prop: 'nationalId' },
          { type: 'prop', typeName: 'crm.Subscriber', prop: 'dateOfBirth', want: { type: 'date-only' } },
          { type: 'prop', typeName: 'crm.Subscriber', prop: 'billingAddress' },
          { type: 'prop', typeName: 'crm.Subscriber', prop: 'creditScore', want: { type: 'integer' } },
        ],
      },
    },
    { label: 'AccountCard inherits from crm.SubscriberCore', rule: { type: 'typeDecl', name: 'AccountCard', extends: 'crm.SubscriberCore' } },
    {
      label: 'AccountCard does not carry the sensitive fields',
      rule: {
        type: 'all',
        rules: [
          { type: 'typeDecl', name: 'AccountCard' },
          { type: 'noProp', typeName: 'AccountCard', prop: 'nationalId' },
          { type: 'noProp', typeName: 'AccountCard', prop: 'creditScore' },
        ],
      },
    },
    {
      label: 'AccountCard adds planName and dataLeftMb of at least 0',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'AccountCard', prop: 'planName', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'AccountCard', prop: 'dataLeftMb', want: { type: 'integer', required: true, minimum: 0 } },
        ],
      },
    },
    {
      label: 'UsageDay has a required day with no time, and dataMb',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'UsageDay', prop: 'day', want: { type: 'date-only', required: true } },
          { type: 'prop', typeName: 'UsageDay', prop: 'dataMb', want: { type: 'integer', required: true } },
        ],
      },
    },
    {
      label: 'mobileClient gives GET /me/card a required X-App-Version with a version pattern',
      rule: {
        type: 'all',
        rules: [
          { type: 'applied', path: '/me/card', method: 'get', trait: 'mobileClient' },
          { type: 'param', path: '/me/card', method: 'get', in: 'header', name: 'X-App-Version', want: { type: 'string', required: true, pattern: { accepts: ['4.12.0', '10.0.31'], rejects: ['4.12', 'v4.12.0', '4.12.0-beta'] } } },
        ],
      },
    },
    { label: 'GET /me/usage uses mobileClient', rule: { type: 'applied', path: '/me/usage', method: 'get', trait: 'mobileClient' } },
    { label: 'GET /me/card returns an AccountCard', rule: { type: 'response', path: '/me/card', method: 'get', status: '200', typeIs: 'AccountCard' } },
    { label: 'The AccountCard response has its own example', rule: { type: 'response', path: '/me/card', method: 'get', status: '200', example: 'own' } },
    { label: 'GET /me/usage returns UsageDay[]', rule: { type: 'response', path: '/me/usage', method: 'get', status: '200', typeIs: 'UsageDay[]' } },
    {
      label: 'limit is optional, with a default of 7 and a maximum of 31',
      rule: { type: 'param', path: '/me/usage', method: 'get', in: 'query', name: 'limit', want: { type: 'integer', required: false, default: 7, maximum: 31 } },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: My Account Mobile API
mediaType: application/json

uses:
  crm: libraries/subscriber.raml

types:
  AccountCard:
    type: crm.SubscriberCore
    properties:
      planName: string
      dataLeftMb:
        type: integer
        minimum: 0
  UsageDay:
    type: object
    properties:
      day: date-only
      dataMb: integer

traits:
  mobileClient:
    headers:
      X-App-Version:
        type: string
        pattern: '^[0-9]+[.][0-9]+[.][0-9]+$'

/me:
  /card:
    get:
      is: [ mobileClient ]
      responses:
        200:
          body:
            type: AccountCard
            example:
              msisdn: '447700900123'
              firstName: Asha
              planCode: UNL-20
              planName: Unlimited 20
              dataLeftMb: 8192
  /usage:
    get:
      is: [ mobileClient ]
      queryParameters:
        limit?:
          type: integer
          default: 7
          maximum: 31
      responses:
        200:
          body:
            type: UsageDay[]
`,
  referenceFiles: {
    'libraries/subscriber.raml': `#%RAML 1.0 Library
usage: Subscriber records shared by the telecom APIs.

types:
  SubscriberCore:
    type: object
    properties:
      msisdn: string
      firstName: string
      planCode: string
  Subscriber:
    type: SubscriberCore
    properties:
      lastName: string
      nationalId: string
      dateOfBirth: date-only
      billingAddress: string
      creditScore: integer
`,
  },
  keyPoints: [
    'An Experience API is shaped for one consumer, so its types are small.',
    'RAML inheritance only adds properties. A child type cannot remove what it inherits.',
    'To make a small type from a large one, move the shared fields into a parent.',
    'The other APIs see no change, because Subscriber still has every property.',
    '/me takes the customer from the token, so a caller cannot ask for someone else.',
  ],
  solution: `
A type that inherits from \`Subscriber\` would bring \`nationalId\` to every phone, and RAML has no way to drop it. So the shared fields move up into \`SubscriberCore\`.

\`Subscriber\` keeps the same set of properties, so its consumers do not notice. \`AccountCard\` shares only the safe fields and adds what the screen shows.

The extra values have no home in the library. \`planName\` and \`dataLeftMb\` come from other System APIs, and the layers below put them together for this screen.

\`X-App-Version\` lets the API behave differently for old app versions. Phones update slowly, so several versions are always live at once.
`,
  followUps: [
    {
      q: 'Why not filter the fields in the app and keep one API?',
      a: 'The sensitive data would still reach the phone, where it can be read from traffic or logs. Extra bytes also cost time on a weak signal.',
    },
    {
      q: 'Why does the Experience API not call the core database directly?',
      a: 'It would tie the app layer to one backend. It calls Process and System APIs instead, so a backend can change with no effect on the mobile contract.',
    },
    {
      q: 'Should each mobile screen get its own endpoint?',
      a: 'Only for screens that are central and called often, such as a home screen. One endpoint per screen makes the API hard to maintain, so group screens that share data.',
    },
  ],
}
