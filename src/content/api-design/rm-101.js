export default {
  id: 'rm-101',
  category: 'api-design',
  title: 'Premium Collections API: Two Ways to Make Creation Safe to Retry',
  level: 'ADVANCED',
  tags: ['raml', 'api-design', 'idempotency', 'http-methods', 'headers', 'insurance'],
  estMinutes: 35,
  description: `
An insurer collects 1.8 million monthly premiums by direct debit. Its billing engine talks to the payments API over a link that drops a few calls every night, and the engine retries. Last quarter a retry created a second collection for 3,000 customers.

There are two ways to make creation safe to repeat, and this API uses both:

**1. PUT with an id the client chooses.** A direct debit mandate already has a reference printed on the signed form, such as \`MD-2026-118274\`. The billing engine sends \`PUT /mandates/{reference}\`. PUT is idempotent by definition: sending it twice leaves one mandate. The first call answers **201**, and a repeat answers **200**.

**2. POST with an idempotency key.** A collection has no natural id, so the engine creates a UUID for each collection and sends it in an \`Idempotency-Key\` header, the same on every retry.
- Same key and same body: the server returns the original 201 and collects nothing new.
- Same key while the first request is still running: **409 Conflict**, so the caller waits and tries again.
- Same key with a different body: **422 Unprocessable Content**, because the caller has a bug.

**Requirements**
- Keep the title \`Premium Collections API\` and JSON as the default media type.
- A type \`Mandate\` with required strings \`reference\`, \`accountHolder\` and \`iban\`.
- A type \`CollectionRequest\` with a required string \`mandateReference\` and a required number \`amount\` of at least 0.01.
- A type \`Collection\` with required strings \`collectionId\` and \`mandateReference\`, a required number \`amount\`, and a required \`status\` that is exactly one of \`PENDING\`, \`COLLECTED\`, \`FAILED\`.
- A type \`Error\` with required strings \`code\` and \`message\`.
- Mandates are created only with \`PUT /mandates/{reference}\`. There is no \`POST /mandates\`.
- \`PUT /mandates/{reference}\` takes a \`Mandate\` and returns 201 with a \`Mandate\` when it is new, or 200 with a \`Mandate\` when it already existed.
- \`POST /collections\` takes a \`CollectionRequest\` and a required header \`Idempotency-Key\`, a string with a UUID pattern such as \`3f2c9a1e-8b7d-4c21-9f0e-2a6b5d4c3e1f\` in lower case.
- It returns 201 with a \`Collection\` and a \`Location\` header, 400 when the key is missing, 409 with an \`Error\` while the first request is running, and 422 with an \`Error\` when the key was used with a different body.
`,
  starter: `#%RAML 1.0
title: Premium Collections API
mediaType: application/json

types:
  Mandate:
    type: object
    properties:
      reference: string
      accountHolder: string
      iban: string

/mandates:
  post:
    body:
      type: Mandate
    responses:
      201:
        body:
          type: Mandate

/collections:
  post:
`,
  ramlChecks: [
    {
      label: 'Mandate has required reference, accountHolder and iban',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Mandate', prop: 'reference', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Mandate', prop: 'accountHolder', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Mandate', prop: 'iban', want: { type: 'string', required: true } },
        ],
      },
    },
    {
      label: 'Mandates are created with PUT on the reference, and there is no POST /mandates',
      rule: {
        type: 'all',
        rules: [
          { type: 'method', path: '/mandates/{}', method: 'put' },
          { type: 'noMethod', path: '/mandates', method: 'post' },
        ],
      },
    },
    { label: 'PUT takes a Mandate', rule: { type: 'body', path: '/mandates/{}', method: 'put', typeIs: 'Mandate' } },
    {
      label: 'PUT returns 201 for a new mandate and 200 for one that already existed',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/mandates/{}', method: 'put', status: '201', typeIs: 'Mandate' },
          { type: 'response', path: '/mandates/{}', method: 'put', status: '200', typeIs: 'Mandate' },
        ],
      },
    },
    {
      label: 'CollectionRequest has a required mandateReference and an amount of at least 0.01',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'CollectionRequest', prop: 'mandateReference', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'CollectionRequest', prop: 'amount', want: { type: 'number', required: true, minimum: 0.01 } },
        ],
      },
    },
    { label: 'Collection.status only allows PENDING, COLLECTED and FAILED', rule: { type: 'prop', typeName: 'Collection', prop: 'status', want: { required: true, enum: { exactly: ['PENDING', 'COLLECTED', 'FAILED'] } } } },
    {
      label: 'Idempotency-Key is a required header with a lower case UUID pattern',
      rule: {
        type: 'param',
        path: '/collections',
        method: 'post',
        in: 'header',
        name: 'Idempotency-Key',
        want: {
          type: 'string',
          required: true,
          pattern: { accepts: ['3f2c9a1e-8b7d-4c21-9f0e-2a6b5d4c3e1f', '00000000-0000-0000-0000-000000000000'], rejects: ['abc', '3f2c9a1e8b7d4c219f0e2a6b5d4c3e1f', '3f2c9a1e-8b7d-4c21-9f0e-2a6b5d4c3e1f-extra', 'x3f2c9a1e-8b7d-4c21-9f0e-2a6b5d4c3e1f'] },
        },
      },
    },
    { label: 'POST /collections takes a CollectionRequest', rule: { type: 'body', path: '/collections', method: 'post', typeIs: 'CollectionRequest' } },
    { label: 'POST returns 201 with a Collection and a Location header', rule: { type: 'response', path: '/collections', method: 'post', status: '201', typeIs: 'Collection', header: 'Location' } },
    { label: 'POST returns 400 when the key is missing', rule: { type: 'response', path: '/collections', method: 'post', status: '400' } },
    {
      label: 'POST returns 409 with an Error while the first request runs',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Error', prop: 'code', want: { type: 'string', required: true } },
          { type: 'response', path: '/collections', method: 'post', status: '409', typeIs: 'Error' },
        ],
      },
    },
    { label: 'POST returns 422 with an Error for a key reused with a different body', rule: { type: 'response', path: '/collections', method: 'post', status: '422', typeIs: 'Error' } },
  ],
  referenceRaml: `#%RAML 1.0
title: Premium Collections API
mediaType: application/json

types:
  Mandate:
    type: object
    properties:
      reference: string
      accountHolder: string
      iban: string
  CollectionRequest:
    type: object
    properties:
      mandateReference: string
      amount:
        type: number
        minimum: 0.01
  Collection:
    type: object
    properties:
      collectionId: string
      mandateReference: string
      amount: number
      status:
        type: string
        enum: [ PENDING, COLLECTED, FAILED ]
  Error:
    type: object
    properties:
      code: string
      message: string

/mandates:
  /{reference}:
    put:
      body:
        type: Mandate
      responses:
        201:
          description: The mandate is new.
          body:
            type: Mandate
        200:
          description: The mandate already existed and is unchanged or updated.
          body:
            type: Mandate

/collections:
  post:
    headers:
      Idempotency-Key:
        type: string
        pattern: ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$
        description: A UUID the caller creates once per collection and repeats on every retry.
    body:
      type: CollectionRequest
    responses:
      201:
        headers:
          Location:
            type: string
        body:
          type: Collection
      400:
        description: The Idempotency-Key header is missing or not a UUID.
      409:
        description: A request with this key is still being processed.
        body:
          type: Error
      422:
        description: This key was already used with a different body.
        body:
          type: Error
`,
  keyPoints: [
    'PUT on an id the client already knows is idempotent by definition, so retries are safe.',
    'PUT answers 201 when it creates and 200 when the resource already existed.',
    'POST needs an idempotency key when the resource has no natural id.',
    '409 means the first request with this key is still running. 422 means the key was reused with a different body.',
    'A UUID pattern keeps keys long and random enough not to collide.',
  ],
  solution: `
The mandate reference is printed on the customer's signed form, so it is a natural key. Using it in the path with \`PUT\` makes creation repeatable without any extra machinery. Removing \`POST /mandates\` leaves only one way to create a mandate, so no caller can make a duplicate by mistake.

A collection has no such key, because two collections on the same mandate for the same amount are normal from one month to the next. So the caller makes one, in the \`Idempotency-Key\` header. The server stores each key with the response it gave, for a stated period such as 24 hours.

The three outcomes for a known key each need a different reaction from the caller. A replay returns the saved 201, so the caller carries on. A 409 means wait and retry. A 422 means stop and fix the code, because retrying will never work.

The pattern \`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$\` anchors both ends, so extra text before or after is refused.
`,
  followUps: [
    {
      q: 'Where would a Mule application keep the idempotency keys?',
      a: 'In a shared store with a time to live, such as Object Store v2 or a database table with a unique index on the key. Every replica must see the same keys, so memory on one worker is not enough.',
    },
    {
      q: 'How does the server tell a replay from a key reused with a different body?',
      a: 'Store a hash of the request body next to the key. On a repeat, compare the new hash with the stored one. Equal means replay, different means 422.',
    },
    {
      q: 'Why not let the server deduplicate by mandate and amount instead of a key?',
      a: 'Two identical collections can be correct, such as a missed month collected with the current one. Only the caller knows whether a request is a retry, so the caller must say so with a key.',
    },
    {
      q: 'Is PUT always the better choice when the client knows the id?',
      a: 'It is when the id is meaningful and unique in the business, like a mandate reference. Letting clients pick ids for every resource can leak information or clash, so many APIs keep server ids for the rest.',
    },
  ],
}
