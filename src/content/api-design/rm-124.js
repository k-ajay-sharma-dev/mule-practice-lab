export default {
  id: 'rm-124',
  category: 'api-design',
  title: 'Parking Sessions Process API: Action Resources to Extend and End a Session',
  level: 'ADVANCED',
  tags: ['raml', 'api-design', 'process-api', 'action-resources', 'idempotency', 'state', 'transport'],
  estMinutes: 30,
  description: `
A city council runs pay-by-phone parking in 400 zones. Drivers start a session in an app, add time while they are away, and end it early to stop paying. Wardens check a car's plate against active sessions.

The first API let the app \`PATCH\` a session with any \`status\` and any \`endsAt\`. Some apps set \`endsAt\` to a time three days later without paying, and some set \`status\` back to \`ACTIVE\` after the session had ended.

The new **Process API** offers only the changes the business allows, each as its own **action resource**. An action resource is a sub-resource that stands for one business action, called with \`POST\`. Extending is \`POST /sessions/{sessionId}/extensions\`. Ending is \`POST /sessions/{sessionId}/end\`. A session is never deleted, because wardens and billing still need it.

Phones on a bad signal retry, so both POSTs that cost money need an idempotency key.

**Brief**
- A zone id is \`Z\` and three digits, such as \`Z104\`.
- Time is bought in steps of 15 minutes. A new session is 15 to 240 minutes. One extension is 15 to 120 minutes.

**Requirements**
- Title \`Parking Sessions Process API\`, with JSON as the default media type.
- \`SessionRequest\` has a required \`zoneId\` with a pattern for the format above, a required string \`plate\`, and a required integer \`minutes\` from 15 to 240 in steps of 15.
- \`Session\` inherits from \`SessionRequest\` and adds a required string \`sessionId\`, a required \`endsAt\` that is a date and time with a time zone, and a required \`status\` that is one of \`ACTIVE\`, \`ENDED\`.
- \`ExtensionRequest\` has a required integer \`minutes\` from 15 to 120 in steps of 15.
- A type \`Error\` with a required string \`code\` and a required string \`message\`.
- Trait \`idempotent\` has a required string header \`Idempotency-Key\`.
- \`POST /sessions\` uses \`idempotent\`, takes a \`SessionRequest\`, and returns a \`Session\` with 201 and a \`Location\` header, or an \`Error\` with 422 when the zone is closed.
- \`GET /sessions/{sessionId}\` returns a \`Session\` with 200, or 404.
- \`POST /sessions/{sessionId}/extensions\` uses \`idempotent\`, takes an \`ExtensionRequest\`, and returns the updated \`Session\` with 200. It returns an \`Error\` with 409 when the session has ended, and with 422 when the new end time passes the zone's longest stay.
- \`POST /sessions/{sessionId}/end\` takes no body and returns the ended \`Session\` with 200, or an \`Error\` with 409 when it has already ended.
- \`/sessions/{sessionId}\` has no \`put\`, \`patch\` or \`delete\`.
`,
  starter: `#%RAML 1.0
title: Parking Sessions Process API
mediaType: application/json

types:
  Session:
    type: object
    properties:
      sessionId: string
      status: string
      endsAt: string

/sessions:
  /{sessionId}:
    patch:
      body:
        type: Session
`,
  ramlChecks: [
    {
      label: 'The title is Parking Sessions Process API and JSON is the default',
      rule: { type: 'all', rules: [{ type: 'root', key: 'title', want: 'Parking Sessions Process API' }, { type: 'root', key: 'mediaType', want: 'application/json' }] },
    },
    {
      label: 'zoneId is Z and three digits',
      rule: { type: 'prop', typeName: 'SessionRequest', prop: 'zoneId', want: { required: true, pattern: { accepts: ['Z104', 'Z001'], rejects: ['z104', 'Z10', 'Z1040', 'ZA04', 'XZ104'] } } },
    },
    {
      label: 'plate is a required string and minutes is 15 to 240 in steps of 15',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'SessionRequest', prop: 'plate', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'SessionRequest', prop: 'minutes', want: { type: 'integer', required: true, minimum: 15, maximum: 240, multipleOf: 15 } },
        ],
      },
    },
    {
      label: 'Session inherits SessionRequest and adds sessionId, endsAt and status',
      rule: {
        type: 'all',
        rules: [
          { type: 'typeDecl', name: 'Session', extends: 'SessionRequest' },
          { type: 'prop', typeName: 'Session', prop: 'sessionId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Session', prop: 'endsAt', want: { type: 'datetime', required: true } },
          { type: 'prop', typeName: 'Session', prop: 'status', want: { required: true, enum: { exactly: ['ACTIVE', 'ENDED'] } } },
        ],
      },
    },
    {
      label: 'An extension is 15 to 120 minutes in steps of 15',
      rule: { type: 'prop', typeName: 'ExtensionRequest', prop: 'minutes', want: { type: 'integer', required: true, minimum: 15, maximum: 120, multipleOf: 15 } },
    },
    {
      label: 'Both paid POSTs use idempotent with a required Idempotency-Key',
      rule: {
        type: 'all',
        rules: [
          { type: 'applied', path: '/sessions', method: 'post', trait: 'idempotent' },
          { type: 'applied', path: '/sessions/{}/extensions', method: 'post', trait: 'idempotent' },
          { type: 'param', path: '/sessions', method: 'post', in: 'header', name: 'Idempotency-Key', want: { type: 'string', required: true } },
        ],
      },
    },
    {
      label: 'POST /sessions returns a Session with 201 and Location, or 422',
      rule: {
        type: 'all',
        rules: [
          { type: 'body', path: '/sessions', method: 'post', typeIs: 'SessionRequest' },
          { type: 'response', path: '/sessions', method: 'post', status: '201', typeIs: 'Session', header: 'Location' },
          { type: 'response', path: '/sessions', method: 'post', status: '422', typeIs: 'Error' },
        ],
      },
    },
    {
      label: 'GET /sessions/{sessionId} returns a Session or 404',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/sessions/{}', method: 'get', status: '200', typeIs: 'Session' },
          { type: 'response', path: '/sessions/{}', method: 'get', status: '404' },
        ],
      },
    },
    {
      label: 'Extending returns the Session with 200, 409 or 422',
      rule: {
        type: 'all',
        rules: [
          { type: 'body', path: '/sessions/{}/extensions', method: 'post', typeIs: 'ExtensionRequest' },
          { type: 'response', path: '/sessions/{}/extensions', method: 'post', status: '200', typeIs: 'Session' },
          { type: 'response', path: '/sessions/{}/extensions', method: 'post', status: '409', typeIs: 'Error' },
          { type: 'response', path: '/sessions/{}/extensions', method: 'post', status: '422', typeIs: 'Error' },
        ],
      },
    },
    {
      label: 'Ending returns the Session with 200, or 409',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/sessions/{}/end', method: 'post', status: '200', typeIs: 'Session' },
          { type: 'response', path: '/sessions/{}/end', method: 'post', status: '409', typeIs: 'Error' },
        ],
      },
    },
    {
      label: 'A session cannot be replaced, patched or deleted',
      rule: {
        type: 'all',
        rules: [
          { type: 'resource', path: '/sessions/{}' },
          { type: 'noMethod', path: '/sessions/{}', method: 'put' },
          { type: 'noMethod', path: '/sessions/{}', method: 'patch' },
          { type: 'noMethod', path: '/sessions/{}', method: 'delete' },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Parking Sessions Process API
version: v1
baseUri: https://api.example.com/parking/{version}
mediaType: application/json

types:
  SessionRequest:
    type: object
    properties:
      zoneId:
        type: string
        pattern: ^Z[0-9]{3}$
      plate: string
      minutes:
        type: integer
        minimum: 15
        maximum: 240
        multipleOf: 15
  Session:
    type: SessionRequest
    properties:
      sessionId: string
      endsAt: datetime
      status:
        type: string
        enum: [ ACTIVE, ENDED ]
    example:
      sessionId: PS-88120
      zoneId: Z104
      plate: KL19ABC
      minutes: 60
      endsAt: 2026-11-17T15:30:00Z
      status: ACTIVE
  ExtensionRequest:
    type: object
    properties:
      minutes:
        type: integer
        minimum: 15
        maximum: 120
        multipleOf: 15
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

/sessions:
  post:
    is: [ idempotent ]
    body:
      type: SessionRequest
    responses:
      201:
        headers:
          Location:
            type: string
        body:
          type: Session
      422:
        description: The zone is closed at this time.
        body:
          type: Error
  /{sessionId}:
    get:
      responses:
        200:
          body:
            type: Session
        404:
          description: No session has this id.
    /extensions:
      post:
        is: [ idempotent ]
        body:
          type: ExtensionRequest
        responses:
          200:
            description: The session with its new end time.
            body:
              type: Session
          409:
            description: The session has ended and cannot be extended.
            body:
              type: Error
          422:
            description: The new end time passes the longest stay allowed in this zone.
            body:
              type: Error
    /end:
      post:
        description: End the session now. Unused time is refunded.
        responses:
          200:
            body:
              type: Session
          409:
            description: The session has already ended.
            body:
              type: Error
`,
  keyPoints: [
    'An action resource stands for one business action, such as /extensions or /end, and is called with POST.',
    'Offering only allowed actions stops callers from setting any status or end time they like.',
    'A session is ended, not deleted, because other parts of the business still need the record.',
    '409 means the action does not fit the current state. 422 means the request is well formed but breaks a business rule.',
    'multipleOf: 15 states the step in which parking time is sold.',
    'Every POST that costs money and can be retried needs an Idempotency-Key.',
  ],
  solution: `
**Why action resources.** A PATCH on the session let callers write any field, so the API could not tell an honest extension from a free one. Now the only ways to change a session are the two actions the council sells: extend, and end. The server works out the new \`endsAt\` and the price itself.

**Why ending is not DELETE.** DELETE says the resource is gone. Wardens still check ended sessions, and billing needs them for refunds. \`POST /sessions/{sessionId}/end\` changes the state and keeps the record. It has no body, because there is nothing to choose. The time is now.

**Status codes.**
| Case | Status | Why |
|---|---|---|
| Extend an ended session | 409 | The action conflicts with the current state |
| Extension passes the longest stay | 422 | The request is valid JSON but breaks a business rule |
| End a session twice | 409 | It has already ended |
| Zone closed | 422 | The request is well formed but cannot be served |

**Retries.** A driver taps Extend on a weak signal and the phone retries. With \`Idempotency-Key\`, the second call returns the same result and the driver pays once. \`/end\` does not need the trait: a second call returns 409, and no money moves.

**Facets.** \`multipleOf: 15\` on \`minutes\` states the step in which time is sold, so a request for 50 minutes fails before any payment is taken.
`,
  followUps: [
    {
      q: 'Why does extending return 200 and not 201?',
      a: 'The caller cares about the session, and the session is returned with its new end time. If the API kept each extension as its own record with an id, 201 with a Location for that record would fit too. Pick one and keep it the same across the API.',
    },
    {
      q: 'Should the end action use the Idempotency-Key trait too?',
      a: 'It can. Today a retry returns 409, which the app must read as success. If that confuses app developers, the trait lets a retry return the same 200 as the first call.',
    },
    {
      q: 'How would a warden check a plate?',
      a: 'With a separate read, such as GET /sessions?plate=KL19ABC&status=ACTIVE, secured with a scope that only warden devices have. Drivers should not be able to look up other plates.',
    },
  ],
}
