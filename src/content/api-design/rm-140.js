export default {
  id: 'rm-140',
  category: 'api-design',
  title: 'Data Subject Requests Process API: Export and Erase Personal Data with Separate Scopes',
  level: 'EXPERT',
  tags: ['raml', 'api-design', 'process-api', 'privacy', 'gdpr', 'async', 'oauth2', 'scopes', 'idempotency', 'binary', 'retail'],
  estMinutes: 40,
  description: `
Mossley Home Stores must answer customers who ask for a copy of their personal data or ask for it to be erased. The data sits in five systems: the web shop, loyalty, marketing, customer service and the order archive. Today staff email each team and track the requests in a spreadsheet, and some answers miss the legal deadline.

A new **Process API** takes requests from the customer service tool and runs them across the systems in the background. The design rules:

- **Exports** and **erasures** are separate resources with separate OAuth 2.0 scopes. Many staff may start an export, but only a small team may erase data, because an erasure cannot be undone.
- Both requests are **asynchronous**. The API answers \`202 Accepted\` with a status object and a \`Location\` header, and the tool checks the status later.
- Both POSTs may be retried on a bad network, so both take an \`Idempotency-Key\` header through a trait.
- A finished export is a zip file. Its download link stops working after 7 days and then answers \`410 Gone\`.

**Requirements**
- Title \`Data Subject Requests API\`, with JSON as the default media type.
- An OAuth 2.0 security scheme \`oauth\` with token URL \`https://auth.example.com/oauth/token\` and the \`client_credentials\` grant.
- A trait \`idempotent\` with a required string header \`Idempotency-Key\` of 16 to 64 characters.
- A type \`DataRequest\` with a required \`customerId\`: \`CUS-\` and seven digits.
- A type \`ExportRequest\` that inherits \`DataRequest\` and adds a required \`format\`, one of \`JSON\`, \`CSV\`.
- A type \`ErasureRequest\` that inherits \`DataRequest\` and adds a required string \`confirmedBy\`, the staff id of the person who checked the customer's identity.
- A type \`RequestStatus\` with a required string \`requestId\`, a required \`kind\` (\`EXPORT\` or \`ERASURE\`), a required \`status\` (\`RECEIVED\`, \`IN_PROGRESS\`, \`COMPLETED\`, \`REJECTED\`) and a required \`dueBy\` date.
- A type \`Problem\` with a required string \`title\` and a required integer \`status\` from 400 to 599.
- \`POST /data-requests/exports\`: secured by \`oauth\` with scope \`dsr:export\` only, uses \`idempotent\`, takes an \`ExportRequest\`, returns a \`RequestStatus\` with 202 and \`Location\`, and a \`Problem\` with 404 for an unknown customer.
- \`POST /data-requests/erasures\`: secured by \`oauth\` with scope \`dsr:erase\` only, uses \`idempotent\`, takes an \`ErasureRequest\`, returns a \`RequestStatus\` with 202 and \`Location\`, a \`Problem\` with 404, and a \`Problem\` with 409 when an erasure for that customer is already running.
- \`GET /data-requests/{requestId}\`: scope \`dsr:read\`, returns a \`RequestStatus\` with 200 and a \`Problem\` with 404.
- \`GET /data-requests/{requestId}/download\`: scope \`dsr:export\`, returns the file as \`application/zip\` with 200, and a \`Problem\` with 410 when the link has expired.
`,
  starter: `#%RAML 1.0
title: Data Subject Requests API
mediaType: application/json

types:
  DataRequest:
    type: object
    properties:
      customerId: string
      action:
        type: string
        enum: [ EXPORT, ERASE ]

/data-requests:
  post:
    body:
      type: DataRequest
    responses:
      200:
        body:
          type: object
`,
  ramlChecks: [
    {
      label: 'The title is Data Subject Requests API and JSON is the default',
      rule: { type: 'all', rules: [{ type: 'root', key: 'title', want: 'Data Subject Requests API' }, { type: 'root', key: 'mediaType', want: 'application/json' }] },
    },
    {
      label: 'oauth is an OAuth 2.0 scheme with the token URL and the client_credentials grant',
      rule: {
        type: 'scheme',
        name: 'oauth',
        schemeType: 'OAuth 2.0',
        values: { 'settings.accessTokenUri': 'https://auth.example.com/oauth/token', 'settings.authorizationGrants': ['client_credentials'] },
      },
    },
    {
      label: 'The idempotent trait holds Idempotency-Key',
      rule: { type: 'trait', name: 'idempotent', has: 'headers.Idempotency-Key' },
    },
    {
      label: 'DataRequest has a customerId of CUS- and seven digits',
      rule: { type: 'prop', typeName: 'DataRequest', prop: 'customerId', want: { required: true, pattern: { accepts: ['CUS-0042817', 'CUS-9999999'], rejects: ['CUS-042817', 'cus-0042817', 'CUS-00428170', 'CUS0042817', 'XCUS-0042817'] } } },
    },
    {
      label: 'ExportRequest and ErasureRequest inherit DataRequest and add format and confirmedBy',
      rule: {
        type: 'all',
        rules: [
          { type: 'typeDecl', name: 'ExportRequest', extends: 'DataRequest' },
          { type: 'prop', typeName: 'ExportRequest', prop: 'format', want: { required: true, enum: { exactly: ['JSON', 'CSV'] } } },
          { type: 'typeDecl', name: 'ErasureRequest', extends: 'DataRequest' },
          { type: 'prop', typeName: 'ErasureRequest', prop: 'confirmedBy', want: { type: 'string', required: true } },
        ],
      },
    },
    {
      label: 'RequestStatus has requestId, kind, status and a dueBy date',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'RequestStatus', prop: 'requestId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'RequestStatus', prop: 'kind', want: { required: true, enum: { exactly: ['EXPORT', 'ERASURE'] } } },
          { type: 'prop', typeName: 'RequestStatus', prop: 'status', want: { required: true, enum: { exactly: ['RECEIVED', 'IN_PROGRESS', 'COMPLETED', 'REJECTED'] } } },
          { type: 'prop', typeName: 'RequestStatus', prop: 'dueBy', want: { type: 'date-only', required: true } },
        ],
      },
    },
    {
      label: 'Problem has a title and a status from 400 to 599',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Problem', prop: 'title', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Problem', prop: 'status', want: { type: 'integer', required: true, minimum: 400, maximum: 599 } },
        ],
      },
    },
    {
      label: 'POST /data-requests/exports needs dsr:export only, is idempotent, and answers 202 with Location or 404',
      rule: {
        type: 'all',
        rules: [
          { type: 'secured', path: '/data-requests/exports', method: 'post', scheme: 'oauth', scopes: ['dsr:export'], onlyScopes: true, required: true },
          { type: 'applied', path: '/data-requests/exports', method: 'post', trait: 'idempotent' },
          { type: 'body', path: '/data-requests/exports', method: 'post', typeIs: 'ExportRequest' },
          { type: 'response', path: '/data-requests/exports', method: 'post', status: '202', typeIs: 'RequestStatus', header: 'Location' },
          { type: 'response', path: '/data-requests/exports', method: 'post', status: '404', typeIs: 'Problem' },
        ],
      },
    },
    {
      label: 'POST /data-requests/erasures needs dsr:erase only, is idempotent, and answers 202 with Location',
      rule: {
        type: 'all',
        rules: [
          { type: 'secured', path: '/data-requests/erasures', method: 'post', scheme: 'oauth', scopes: ['dsr:erase'], onlyScopes: true, required: true },
          { type: 'applied', path: '/data-requests/erasures', method: 'post', trait: 'idempotent' },
          { type: 'body', path: '/data-requests/erasures', method: 'post', typeIs: 'ErasureRequest' },
          { type: 'response', path: '/data-requests/erasures', method: 'post', status: '202', typeIs: 'RequestStatus', header: 'Location' },
        ],
      },
    },
    {
      label: 'Erasures answer a Problem with 404 for an unknown customer and 409 when one is already running',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/data-requests/erasures', method: 'post', status: '404', typeIs: 'Problem' },
          { type: 'response', path: '/data-requests/erasures', method: 'post', status: '409', typeIs: 'Problem' },
        ],
      },
    },
    {
      label: 'GET /data-requests/{requestId} needs dsr:read and returns a RequestStatus or a Problem with 404',
      rule: {
        type: 'all',
        rules: [
          { type: 'secured', path: '/data-requests/{}', method: 'get', scheme: 'oauth', scopes: ['dsr:read'], required: true },
          { type: 'response', path: '/data-requests/{}', method: 'get', status: '200', typeIs: 'RequestStatus' },
          { type: 'response', path: '/data-requests/{}', method: 'get', status: '404', typeIs: 'Problem' },
        ],
      },
    },
    {
      label: 'The download needs dsr:export, returns application/zip with 200 and a Problem with 410',
      rule: {
        type: 'all',
        rules: [
          { type: 'secured', path: '/data-requests/{}/download', method: 'get', scheme: 'oauth', scopes: ['dsr:export'], required: true },
          { type: 'response', path: '/data-requests/{}/download', method: 'get', status: '200', media: 'application/zip' },
          { type: 'response', path: '/data-requests/{}/download', method: 'get', status: '410', typeIs: 'Problem' },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Data Subject Requests API
version: v1
baseUri: https://api.example.com/dsr/{version}
mediaType: application/json

securitySchemes:
  oauth:
    type: OAuth 2.0
    description: Tokens for the customer service tool. Scopes decide who may export and who may erase.
    settings:
      accessTokenUri: https://auth.example.com/oauth/token
      authorizationGrants: [ client_credentials ]
      scopes: [ dsr:read, dsr:export, dsr:erase ]

traits:
  idempotent:
    usage: For POSTs that start work and may be retried.
    headers:
      Idempotency-Key:
        type: string
        minLength: 16
        maxLength: 64
        description: A new random value per request. A retry with the same key returns the first answer.

types:
  DataRequest:
    type: object
    properties:
      customerId:
        type: string
        pattern: ^CUS-[0-9]{7}$
  ExportRequest:
    type: DataRequest
    properties:
      format:
        type: string
        enum: [ JSON, CSV ]
    example:
      customerId: CUS-0042817
      format: JSON
  ErasureRequest:
    type: DataRequest
    properties:
      confirmedBy:
        type: string
        description: Staff id of the person who checked the customer's identity.
    example:
      customerId: CUS-0042817
      confirmedBy: STF-2210
  RequestStatus:
    type: object
    properties:
      requestId: string
      kind:
        type: string
        enum: [ EXPORT, ERASURE ]
      status:
        type: string
        enum: [ RECEIVED, IN_PROGRESS, COMPLETED, REJECTED ]
      dueBy:
        type: date-only
        description: The legal deadline for the answer.
    example:
      requestId: DSR-55120
      kind: EXPORT
      status: RECEIVED
      dueBy: 2026-12-18
  Problem:
    type: object
    properties:
      title: string
      status:
        type: integer
        minimum: 400
        maximum: 599

/data-requests:
  /exports:
    post:
      is: [ idempotent ]
      securedBy: [ oauth: { scopes: [ dsr:export ] } ]
      body:
        type: ExportRequest
      responses:
        202:
          description: The export has started. Follow Location for its status.
          headers:
            Location:
              type: string
              example: /data-requests/DSR-55120
          body:
            type: RequestStatus
        404:
          description: No customer has this id.
          body:
            type: Problem
  /erasures:
    post:
      is: [ idempotent ]
      securedBy: [ oauth: { scopes: [ dsr:erase ] } ]
      description: Erases the customer's personal data in every system, apart from records the law requires us to keep. This cannot be undone.
      body:
        type: ErasureRequest
      responses:
        202:
          headers:
            Location:
              type: string
              example: /data-requests/DSR-55121
          body:
            type: RequestStatus
        404:
          body:
            type: Problem
        409:
          description: An erasure for this customer is already running.
          body:
            type: Problem
  /{requestId}:
    get:
      securedBy: [ oauth: { scopes: [ dsr:read ] } ]
      responses:
        200:
          body:
            type: RequestStatus
        404:
          body:
            type: Problem
    /download:
      get:
        securedBy: [ oauth: { scopes: [ dsr:export ] } ]
        description: The finished export. Available for 7 days after it completes.
        responses:
          200:
            body:
              application/zip:
                type: file
          404:
            body:
              type: Problem
          410:
            description: The export was deleted after 7 days. Start a new export.
            body:
              type: Problem
`,
  keyPoints: [
    'Separate resources for export and erasure let each one carry its own scope.',
    'An action that cannot be undone gets the narrowest scope and the fewest callers.',
    'Work that spans several systems answers 202 with a status resource and a Location header.',
    'POSTs that start work take an Idempotency-Key, so a retry does not start the work twice.',
    'A dueBy date in the status makes the legal deadline visible to the caller.',
    'A download that has been deleted after its time answers 410 Gone, not 404.',
    'The export file itself is personal data, so the download needs a scope too.',
  ],
  solution: `
**Two resources, two scopes.** One \`POST /data-requests\` with an \`action\` field would need one scope for both jobs, or a check inside the code that the contract cannot show. Splitting into \`/exports\` and \`/erasures\` lets the contract say who may do what. API Manager can then enforce \`dsr:erase\` for a small group, and an export token can never erase.

**Inheritance for the shared part.** \`DataRequest\` holds \`customerId\` once. \`ExportRequest\` adds \`format\`, and \`ErasureRequest\` adds \`confirmedBy\`, so the audit trail always shows who checked the customer's identity before an erasure.

**Asynchronous by design.** An erasure touches five systems, and some may take hours. The API answers \`202\` with a \`RequestStatus\` and a \`Location\` header. The tool polls \`GET /data-requests/{requestId}\` with \`dsr:read\`. \`dueBy\` shows the legal deadline, so the team can see what is at risk.

**Idempotency.** A retried erasure must not start a second run, and a retried export must not create two files. The \`idempotent\` trait puts the same \`Idempotency-Key\` rule on both POSTs. \`409\` covers a different case: a new request for a customer whose erasure is still running.

**The download.** The zip holds the customer's personal data, so it needs the \`dsr:export\` scope like the request that made it. It is kept for 7 days. After that the file is deleted on purpose, and \`410 Gone\` tells the tool to start a new export.

| Call | Scope |
|---|---|
| \`POST /data-requests/exports\` | dsr:export |
| \`POST /data-requests/erasures\` | dsr:erase |
| \`GET /data-requests/{requestId}\` | dsr:read |
| \`GET /data-requests/{requestId}/download\` | dsr:export |
`,
  followUps: [
    {
      q: 'The order archive must keep invoices for several years by law. How does an erasure handle that?',
      a: 'The process erases what it may and keeps what the law requires, often with the personal fields limited to what the invoice needs. The status can carry a note per system, so the team can explain to the customer what was kept and why.',
    },
    {
      q: 'Should an erasure need a second person to approve it?',
      a: 'Many teams add that for actions that cannot be undone. In the contract it can be a status such as AWAITING_APPROVAL and a separate approve action with its own scope, so the person who asked cannot approve.',
    },
    {
      q: 'How does the Process API run the work across five systems?',
      a: 'It stores the request, answers 202, and puts one task per system on a queue. Each system API handles its part and reports back. The request is COMPLETED when every part has finished, and a failed part is retried or flagged before the deadline.',
    },
  ],
}
