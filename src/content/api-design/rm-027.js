export default {
  id: 'rm-027',
  category: 'api-design',
  title: 'Ticket Purchase API: An Idempotent POST',
  level: 'ADVANCED',
  tags: ['raml', 'api-design', 'idempotency', 'headers', 'traits', 'ticketing'],
  estMinutes: 30,
  description: `
A concert ticketing company has a problem on busy sale days. A phone sends a purchase, the connection drops before the reply arrives, and the app tries again. The customer now has two sets of tickets and two charges.

An operation is **idempotent** if doing it twice has the same effect as doing it once. \`PUT\` and \`DELETE\` work that way by definition. \`POST\` does not, so a retry can create a second purchase.

The usual fix is an **idempotency key**. The client makes a unique value for each purchase and sends it in an \`Idempotency-Key\` header. It sends the same key on every retry. The server remembers each key and the result it gave.

**Requirements**
- Title \`Ticket Purchase API\`, with JSON as the default media type.
- A type \`Purchase\` with required strings \`purchaseId\` and \`eventId\`, and a required integer \`quantity\` (minimum 1).
- A type \`Refund\` with required strings \`refundId\` and \`purchaseId\`.
- A type \`Error\` with required strings \`code\` and \`message\`.
- A trait \`idempotent\` holds what follows, so any POST can reuse it:
  - A required string header \`Idempotency-Key\`, with a minimum length of 16 and a maximum length of 64.
  - A 400 response with an \`Error\` body, for a missing key.
  - A 409 response with an \`Error\` body, for a key that was already used with a different body.
- \`POST /purchases\` and \`POST /refunds\` both use \`idempotent\`.
- \`POST /purchases\` takes a \`Purchase\` and returns 201 with a \`Purchase\` body.
- \`POST /refunds\` takes a \`Refund\` and returns 201 with a \`Refund\` body.
- A retry with the same key and the same body returns the original 201 and creates nothing new. So that a client can tell, the 201 on \`POST /purchases\` has an \`Idempotent-Replayed\` header.
`,
  starter: `#%RAML 1.0
title: Ticket Purchase API
mediaType: application/json

types:

traits:

/purchases:
  post:

/refunds:
  post:
`,
  ramlChecks: [
    {
      label: 'The title is Ticket Purchase API and JSON is the default media type',
      rule: {
        type: 'all',
        rules: [
          { type: 'root', key: 'title', want: 'Ticket Purchase API' },
          { type: 'root', key: 'mediaType', want: 'application/json' },
        ],
      },
    },
    {
      label: 'Purchase has required purchaseId, eventId and a quantity of at least 1',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Purchase', prop: 'purchaseId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Purchase', prop: 'eventId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Purchase', prop: 'quantity', want: { type: 'integer', required: true, minimum: 1 } },
        ],
      },
    },
    {
      label: 'Error has required code and message',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Error', prop: 'code', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Error', prop: 'message', want: { type: 'string', required: true } },
        ],
      },
    },
    {
      label: 'Refund has required refundId and purchaseId',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Refund', prop: 'refundId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Refund', prop: 'purchaseId', want: { type: 'string', required: true } },
        ],
      },
    },
    {
      label: 'The idempotent trait holds the header and the 400 and 409 responses',
      rule: {
        type: 'all',
        rules: [
          { type: 'trait', name: 'idempotent', has: 'headers.Idempotency-Key' },
          { type: 'trait', name: 'idempotent', has: 'responses.400' },
          { type: 'trait', name: 'idempotent', has: 'responses.409' },
        ],
      },
    },
    {
      label: 'Both POST methods use the idempotent trait',
      rule: {
        type: 'all',
        rules: [
          { type: 'applied', path: '/purchases', method: 'post', trait: 'idempotent' },
          { type: 'applied', path: '/refunds', method: 'post', trait: 'idempotent' },
        ],
      },
    },
    {
      label: 'Idempotency-Key is a required string of 16 to 64 characters',
      rule: { type: 'param', path: '/purchases', method: 'post', in: 'header', name: 'Idempotency-Key', want: { type: 'string', required: true, minLength: 16, maxLength: 64 } },
    },
    { label: 'A missing key gets a 400 with an Error body', rule: { type: 'response', path: '/purchases', method: 'post', status: '400', typeIs: 'Error' } },
    { label: 'A reused key with a different body gets a 409 with an Error body', rule: { type: 'response', path: '/purchases', method: 'post', status: '409', typeIs: 'Error' } },
    {
      label: 'Each POST takes its own type and returns it with 201',
      rule: {
        type: 'all',
        rules: [
          { type: 'body', path: '/purchases', method: 'post', typeIs: 'Purchase' },
          { type: 'response', path: '/purchases', method: 'post', status: '201', typeIs: 'Purchase' },
          { type: 'body', path: '/refunds', method: 'post', typeIs: 'Refund' },
          { type: 'response', path: '/refunds', method: 'post', status: '201', typeIs: 'Refund' },
        ],
      },
    },
    { label: 'The 201 on POST /purchases has an Idempotent-Replayed header', rule: { type: 'response', path: '/purchases', method: 'post', status: '201', header: 'Idempotent-Replayed' } },
  ],
  referenceRaml: `#%RAML 1.0
title: Ticket Purchase API
mediaType: application/json

types:
  Purchase:
    type: object
    properties:
      purchaseId: string
      eventId: string
      quantity:
        type: integer
        minimum: 1
  Refund:
    type: object
    properties:
      refundId: string
      purchaseId: string
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
        maxLength: 64
    responses:
      400:
        description: The Idempotency-Key header is missing.
        body:
          type: Error
      409:
        description: This key was already used with a different body.
        body:
          type: Error

/purchases:
  post:
    is: [ idempotent ]
    body:
      type: Purchase
    responses:
      201:
        description: The purchase, new or replayed.
        headers:
          Idempotent-Replayed?:
            description: Present and true when this is a replay of an earlier result.
            type: boolean
        body:
          type: Purchase

/refunds:
  post:
    is: [ idempotent ]
    body:
      type: Refund
    responses:
      201:
        body:
          type: Refund
`,
  keyPoints: [
    'POST is not idempotent by definition, so a retry can repeat the effect.',
    'The client makes the key, and it stays the same across retries of one purchase.',
    'The server stores each key with its result and replays that result on a repeat.',
    'A reused key with a different body is a client bug, so the contract refuses it.',
    'A trait lets every POST that moves money share one rule.',
  ],
  solution: `
The header is required, so no client can forget it. The length limits stop a client from sending a weak key such as \`1\`.

There are three cases for the server. A new key does the work and stores the result. A known key with the same body returns the stored result, with no second charge. A known key with a different body returns 409, because the client has made a mistake.

The trait means \`/refunds\` gets the same protection for free. Note that the replay header sits on the 201 itself, since the status does not change on a replay.
`,
  followUps: [
    {
      q: 'What happens if two requests with the same key arrive at the same moment?',
      a: 'Both could miss the stored key and do the work. The key must be claimed in one atomic step, such as an insert with a unique constraint. The loser then waits, or is told the request is in progress.',
    },
    {
      q: 'How long should the server remember a key?',
      a: 'Long enough to cover every realistic retry, often 24 hours. Then it can be removed. State the period in the documentation, because it is part of the promise to callers.',
    },
    {
      q: 'Is 409 the only choice for a key reused with a different body?',
      a: 'No. Some APIs use 422 or 400 for this. What matters is that the contract states one, so that clients can handle it.',
    },
  ],
}
