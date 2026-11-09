const hex = 'a3f1c9e07b2d4f6a8c0e1b3d5f7a9c1e3b5d7f9a1c3e5b7d9f1a3c5e7b9d1f3a'

export default {
  id: 'rm-086',
  category: 'api-design',
  title: 'Payment Webhooks API: A Custom x- Scheme for HMAC Signatures',
  level: 'ADVANCED',
  tags: ['raml', 'api-design', 'security', 'webhooks', 'custom-security-scheme', 'headers', 'finance'],
  estMinutes: 30,
  description: `
An online retailer receives about 25,000 webhook calls a day from its payment provider: a payment succeeded, a payment failed, a refund was created. The provider cannot get OAuth tokens. It signs each call instead.

The provider takes the timestamp, a dot and the raw body, and computes an HMAC SHA-256 over them with a secret both sides share. It sends the result in \`X-Signature\` as \`sha256=\` followed by 64 lower case hex characters, and the timestamp in \`X-Signature-Timestamp\` as Unix seconds. The retailer recomputes the signature and refuses the call if it differs, or if the timestamp is more than 300 seconds old. The age limit stops an attacker replaying a captured call.

None of the built-in RAML scheme types describes this. RAML allows your own scheme type, as long as its name starts with \`x-\`. Its \`settings\` are free form, so you can record how the signature works.

The support team also reads stored events, with an OAuth 2.0 token.

**Requirements**
- Title \`Payment Webhooks API\`, with JSON as the default media type.
- A security scheme \`hmacSignature\` of type \`x-hmac-signature\`.
- Its \`settings\` hold \`algorithm: HMAC-SHA256\` and \`toleranceSeconds: 300\`.
- Its \`describedBy\` declares the header \`X-Signature\` with a pattern that accepts \`sha256=\` and 64 lower case hex characters, the integer header \`X-Signature-Timestamp\`, and a 401 response.
- A security scheme \`oauth2\` of type \`OAuth 2.0\` with \`accessTokenUri\` \`https://auth.example.com/token\`, the grant \`client_credentials\` and the scope \`events:read\`.
- A type \`PaymentEvent\` with a required string \`eventId\`, a required string \`eventType\` that is one of \`payment.succeeded\`, \`payment.failed\`, \`refund.created\`, a required datetime \`occurredAt\` and a required object \`data\`.
- \`POST /payment-events\` takes a \`PaymentEvent\`, returns 204 with no body, and is secured by \`hmacSignature\` alone.
- \`GET /payment-events/{eventId}\` returns a \`PaymentEvent\` with status 200, or 404. It needs \`oauth2\` with \`events:read\` only.
`,
  starter: `#%RAML 1.0
title: Payment Webhooks API
mediaType: application/json

securitySchemes:
  hmacSignature:

  oauth2:

types:

/payment-events:
`,
  ramlChecks: [
    { label: 'hmacSignature has the custom type x-hmac-signature', rule: { type: 'scheme', name: 'hmacSignature', schemeType: 'x-hmac-signature' } },
    {
      label: 'The settings hold algorithm HMAC-SHA256 and toleranceSeconds 300',
      rule: { type: 'scheme', name: 'hmacSignature', values: { 'settings.algorithm': 'HMAC-SHA256', 'settings.toleranceSeconds': 300 } },
    },
    {
      label: 'X-Signature has a pattern for sha256= and 64 lower case hex characters',
      rule: {
        type: 'scheme',
        name: 'hmacSignature',
        values: {
          'describedBy.headers.X-Signature.pattern': {
            accepts: [`sha256=${hex}`],
            rejects: [`sha1=${hex}`, `sha256=${hex.toUpperCase()}`, `sha256=${hex.slice(0, 40)}`, hex, `sha256=${hex}0`],
          },
        },
      },
    },
    {
      label: 'X-Signature-Timestamp is an integer header',
      rule: {
        type: 'any',
        rules: [
          { type: 'scheme', name: 'hmacSignature', values: { 'describedBy.headers.X-Signature-Timestamp.type': { is: 'integer' } } },
          { type: 'scheme', name: 'hmacSignature', values: { 'describedBy.headers.X-Signature-Timestamp': { is: 'integer' } } },
        ],
      },
    },
    { label: 'hmacSignature describes a 401 response', rule: { type: 'scheme', name: 'hmacSignature', has: 'describedBy.responses.401' } },
    {
      label: 'oauth2 is OAuth 2.0 with client_credentials and the scope events:read',
      rule: {
        type: 'scheme',
        name: 'oauth2',
        schemeType: 'OAuth 2.0',
        values: { 'settings.accessTokenUri': 'https://auth.example.com/token', 'settings.authorizationGrants': ['client_credentials'], 'settings.scopes': ['events:read'] },
      },
    },
    {
      label: 'PaymentEvent has eventId, an eventType enum, a datetime occurredAt and an object data',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'PaymentEvent', prop: 'eventId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'PaymentEvent', prop: 'eventType', want: { required: true, enum: { exactly: ['payment.succeeded', 'payment.failed', 'refund.created'] } } },
          { type: 'prop', typeName: 'PaymentEvent', prop: 'occurredAt', want: { type: 'datetime', required: true } },
          { type: 'prop', typeName: 'PaymentEvent', prop: 'data', want: { type: 'object', required: true } },
        ],
      },
    },
    {
      label: 'POST /payment-events takes a PaymentEvent and returns 204 with no body',
      rule: {
        type: 'all',
        rules: [
          { type: 'body', path: '/payment-events', method: 'post', typeIs: 'PaymentEvent' },
          { type: 'response', path: '/payment-events', method: 'post', status: '204', noBody: true },
        ],
      },
    },
    { label: 'POST /payment-events is secured by hmacSignature', rule: { type: 'secured', path: '/payment-events', method: 'post', scheme: 'hmacSignature', required: true } },
    {
      label: 'GET /payment-events/{eventId} returns a PaymentEvent or 404, and needs events:read only',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/payment-events/{}', method: 'get', status: '200', typeIs: 'PaymentEvent' },
          { type: 'response', path: '/payment-events/{}', method: 'get', status: '404' },
          { type: 'secured', path: '/payment-events/{}', method: 'get', scheme: 'oauth2', scopes: ['events:read'], onlyScopes: true, required: true },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Payment Webhooks API
mediaType: application/json

securitySchemes:
  hmacSignature:
    type: x-hmac-signature
    description: |
      The provider signs the timestamp, a dot and the raw body with HMAC SHA-256 and the shared secret.
      Calls with a wrong signature, or a timestamp older than 300 seconds, are refused.
    describedBy:
      headers:
        X-Signature:
          type: string
          pattern: ^sha256=[a-f0-9]{64}$
        X-Signature-Timestamp:
          type: integer
          description: Unix seconds when the provider signed the call.
      responses:
        401:
          description: The signature does not match, or the timestamp is too old.
    settings:
      algorithm: HMAC-SHA256
      signedContent: timestamp, a dot, then the raw body
      toleranceSeconds: 300
  oauth2:
    type: OAuth 2.0
    describedBy:
      responses:
        401:
          description: The token is missing, wrong or expired.
        403:
          description: The token does not hold events:read.
    settings:
      accessTokenUri: https://auth.example.com/token
      authorizationGrants: [ client_credentials ]
      scopes: [ events:read ]

types:
  PaymentEvent:
    type: object
    properties:
      eventId: string
      eventType:
        type: string
        enum: [ payment.succeeded, payment.failed, refund.created ]
      occurredAt: datetime
      data: object

/payment-events:
  post:
    securedBy: [ hmacSignature ]
    body:
      type: PaymentEvent
    responses:
      204:
        description: The event was stored. A repeat of a known eventId is also answered 204.
  /{eventId}:
    get:
      securedBy: [ oauth2: { scopes: [ events:read ] } ]
      responses:
        200:
          body:
            type: PaymentEvent
        404:
          description: No event has this id.
`,
  keyPoints: [
    'A custom scheme type starts with x-, and its settings can hold anything the callers need to know.',
    'describedBy works the same for a custom scheme: headers, query parameters and responses.',
    'A pattern on the signature header documents its exact shape.',
    'A signed timestamp with a short tolerance stops a captured call being replayed later.',
    'The receiver answers fast with 204 and treats a repeated eventId as already done.',
  ],
  solution: `
\`type: x-hmac-signature\` tells every reader that this is not a standard scheme. The \`settings\` record the algorithm, what is signed and the 300 second window, so a developer can build the check from the contract alone.

The two headers sit in \`describedBy\`. The pattern on \`X-Signature\` rejects an upper case or SHA-1 value before any code runs.

The webhook and the support read use different schemes. The provider never gets a token, and the support team never needs the shared secret. Each method names exactly one scheme, so neither credential opens the other door.

The 204 also covers a repeated event. Providers retry when they see a timeout, so the receiver stores each \`eventId\` once and answers 204 to the copies.
`,
  followUps: [
    {
      q: 'Does a custom x- scheme do anything in API Manager?',
      a: 'No built-in policy reads it. The signature check must be written in the Mule app, or in a custom policy, using the settings in the contract as the specification.',
    },
    {
      q: 'Why sign the timestamp together with the body?',
      a: 'If the timestamp were not signed, an attacker could change it on a captured call and replay it. Signing both ties the age check to the signature.',
    },
    {
      q: 'Why compare signatures in constant time?',
      a: 'A normal string compare stops at the first wrong character, and the timing leaks how much matched. A constant time compare takes the same time whatever the input.',
    },
    {
      q: 'Why answer the provider before processing the event?',
      a: 'Providers time out after a few seconds and retry. Storing the event and replying 204 at once avoids duplicate deliveries, and a queue does the slow work later.',
    },
  ],
}
