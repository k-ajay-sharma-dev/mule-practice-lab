export default {
  id: 'rm-069',
  category: 'api-design',
  title: 'EV Charging API: Sessions Nested under a Charger',
  level: 'INTERMEDIATE',
  tags: ['raml', 'api-design', 'nested-resources', 'query-parameters', 'status-codes', 'dates', 'energy'],
  estMinutes: 20,
  description: `
An energy company runs 3,100 public EV chargers. Each charger has one or two connectors. Drivers start a charge from an app, and the app later shows their past sessions at that charger. A charge is a **session**, and a session only makes sense on the charger where it happened.

Charger ids look like \`CH-204381\`: \`CH\`, a hyphen and six digits.

Starting a session can fail in three ways the app must tell apart:
- the body breaks the type: **400**,
- no charger has that id: **404**,
- the connector is already in use by another car: **409** with an \`Error\` body.

The history list takes filters. \`status\` picks active or completed sessions. \`from\` and \`to\` limit the start time, and they are exact moments with a time zone, because sessions near midnight must not land on the wrong day.

**Requirements**
- \`chargerId\` is a string such as \`CH-204381\`.
- A type \`StartSession\` with a required integer \`connector\` of 1 or 2 (a range from 1 to 2), and an optional number \`maxKwh\` from 1 to 150.
- A type \`ChargingSession\` with a required string \`sessionId\`, a required \`status\` of only \`active\` or \`completed\`, a required number \`energyKwh\` of at least 0, a required \`startedAt\` date and time with a time zone, and an optional \`endedAt\` of the same kind.
- A type \`Error\` with the required strings \`code\` and \`message\`.
- \`POST /chargers/{chargerId}/sessions\` takes \`StartSession\` and returns 201 with \`Location\` and a \`ChargingSession\`, 400, 404, and 409 with an \`Error\`.
- \`GET /chargers/{chargerId}/sessions\` returns a list of \`ChargingSession\`, with the optional query parameters \`status\` (active or completed), \`from\` and \`to\` (dates and times with a time zone).
- \`GET /chargers/{chargerId}/sessions/{sessionId}\` returns a \`ChargingSession\`, or 404.
- There is no top-level \`/sessions\` resource.
`,
  starter: `#%RAML 1.0
title: EV Charging API
mediaType: application/json

types:
  ChargingSession:
    type: object
    properties:
      sessionId: string

/chargers:
  /{chargerId}:
`,
  ramlChecks: [
    {
      label: 'chargerId is a string such as CH-204381',
      rule: { type: 'param', path: '/chargers/{}', in: 'uri', name: 'chargerId', want: { type: 'string', pattern: { accepts: ['CH-204381', 'CH-000001'], rejects: ['CH-20438', 'ch-204381', 'CH204381', 'CH-2043810'] } } },
    },
    {
      label: 'sessions sits under a charger, not at the top level',
      rule: { type: 'all', rules: [{ type: 'resource', path: '/chargers/{}/sessions/{}' }, { type: 'noResource', path: '/sessions' }, { type: 'noResource', path: '/sessions/{}' }] },
    },
    {
      label: 'StartSession has a connector from 1 to 2 and an optional maxKwh from 1 to 150',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'StartSession', prop: 'connector', want: { type: 'integer', required: true, minimum: 1, maximum: 2 } },
          { type: 'prop', typeName: 'StartSession', prop: 'maxKwh', want: { type: 'number', required: false, minimum: 1, maximum: 150 } },
        ],
      },
    },
    {
      label: 'ChargingSession status allows only active and completed, and energyKwh is at least 0',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'ChargingSession', prop: 'status', want: { required: true, enum: { exactly: ['active', 'completed'] } } },
          { type: 'prop', typeName: 'ChargingSession', prop: 'energyKwh', want: { type: 'number', required: true, minimum: 0 } },
        ],
      },
    },
    {
      label: 'startedAt is a required datetime and endedAt an optional datetime',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'ChargingSession', prop: 'startedAt', want: { type: 'datetime', required: true } },
          { type: 'prop', typeName: 'ChargingSession', prop: 'endedAt', want: { type: 'datetime', required: false } },
        ],
      },
    },
    {
      label: 'POST sessions takes StartSession and returns 201 with Location and a ChargingSession',
      rule: {
        type: 'all',
        rules: [
          { type: 'body', path: '/chargers/{}/sessions', method: 'post', typeIs: 'StartSession' },
          { type: 'response', path: '/chargers/{}/sessions', method: 'post', status: '201', typeIs: 'ChargingSession', header: 'Location' },
        ],
      },
    },
    {
      label: 'POST sessions returns 400, 404, and 409 with an Error for a busy connector',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/chargers/{}/sessions', method: 'post', status: '400' },
          { type: 'response', path: '/chargers/{}/sessions', method: 'post', status: '404' },
          { type: 'response', path: '/chargers/{}/sessions', method: 'post', status: '409', typeIs: 'Error' },
        ],
      },
    },
    {
      label: 'GET sessions returns a list, filtered by an optional status of active or completed',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/chargers/{}/sessions', method: 'get', status: '200', typeIs: 'ChargingSession[]' },
          { type: 'param', path: '/chargers/{}/sessions', method: 'get', in: 'query', name: 'status', want: { required: false, enum: { exactly: ['active', 'completed'] } } },
        ],
      },
    },
    {
      label: 'from and to are optional datetime query parameters',
      rule: {
        type: 'all',
        rules: ['from', 'to'].map((name) => ({ type: 'param', path: '/chargers/{}/sessions', method: 'get', in: 'query', name, want: { type: 'datetime', required: false } })),
      },
    },
    {
      label: 'GET one session returns a ChargingSession or 404',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/chargers/{}/sessions/{}', method: 'get', status: '200', typeIs: 'ChargingSession' },
          { type: 'response', path: '/chargers/{}/sessions/{}', method: 'get', status: '404' },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: EV Charging API
mediaType: application/json

types:
  SessionStatus:
    type: string
    enum: [ active, completed ]
  StartSession:
    type: object
    properties:
      connector:
        type: integer
        minimum: 1
        maximum: 2
      maxKwh?:
        type: number
        minimum: 1
        maximum: 150
    example:
      connector: 2
      maxKwh: 40
  ChargingSession:
    type: object
    properties:
      sessionId: string
      status: SessionStatus
      energyKwh:
        type: number
        minimum: 0
      startedAt: datetime
      endedAt?: datetime
    example:
      sessionId: S-9918204
      status: active
      energyKwh: 12.6
      startedAt: 2026-11-08T23:41:00Z
  Error:
    type: object
    properties:
      code: string
      message: string
    example:
      code: CONNECTOR_BUSY
      message: Connector 2 on CH-204381 is charging another car.

/chargers:
  /{chargerId}:
    uriParameters:
      chargerId:
        type: string
        pattern: ^CH-[0-9]{6}$
    /sessions:
      get:
        description: Past and current sessions on this charger.
        queryParameters:
          status?: SessionStatus
          from?:
            type: datetime
            example: 2026-11-01T00:00:00Z
          to?:
            type: datetime
            example: 2026-11-08T23:59:59Z
        responses:
          200:
            body:
              type: ChargingSession[]
          404:
            description: No charger has this id.
      post:
        description: Start charging on one connector.
        body:
          type: StartSession
        responses:
          201:
            headers:
              Location:
                type: string
            body:
              type: ChargingSession
          400:
            description: The body does not fit StartSession.
          404:
            description: No charger has this id.
          409:
            description: The connector is already in use.
            body:
              type: Error
      /{sessionId}:
        get:
          responses:
            200:
              body:
                type: ChargingSession
            404:
              description: This charger has no session with this id.
`,
  keyPoints: [
    'A session belongs to one charger, so it lives at /chargers/{chargerId}/sessions/{sessionId}.',
    'One collection can carry get with filters and post that creates an item.',
    'datetime holds a time zone, which matters for times near midnight or across clock changes.',
    'endedAt is optional because an active session has not ended. The example leaves it out.',
    '409 fits a busy connector: the request is valid, but the current state blocks it.',
  ],
  solution: `
\`/sessions\` sits under \`/{chargerId}\`, so every session URL names its charger and the 404 for a missing charger falls out of the path. A top-level \`/sessions\` would hold 3,100 chargers' worth of data with no natural owner.

\`StartSession\` holds what the driver picks: the connector and an optional energy cap. \`ChargingSession\` holds what the charger reports. \`endedAt?\` is optional, and the example is an active session without it, so the app learns early that the field can be missing.

\`from\` and \`to\` are \`datetime\`, not \`date-only\`. A session that starts at 23:41 UTC is on a different calendar day in other time zones, and only a full timestamp avoids that doubt. \`status\` reuses \`SessionStatus\`, so the filter and the data offer the same two values.

The 409 has an \`Error\` body with \`CONNECTOR_BUSY\`, so the app can suggest the other connector.
`,
  followUps: [
    {
      q: 'How would you design stopping a session?',
      a: 'A PATCH on the session that sets status to completed is one option. Another is a DELETE that ends it and returns the final session. Pick one and keep it the same across the API.',
    },
    {
      q: 'Should the API check that from is before to?',
      a: 'Yes, in the implementation. RAML cannot compare two parameters, so the flow returns 400 when from is after to.',
    },
    {
      q: 'What happens if two drivers press start on the same connector at the same moment?',
      a: 'The implementation must lock the connector so only one session is created. The other request gets 409 with CONNECTOR_BUSY.',
    },
    {
      q: 'Why not list sessions for a driver under /chargers?',
      a: 'The history of one driver spans many chargers. That view belongs on a driver resource such as /drivers/{driverId}/sessions, or in an experience API for the app.',
    },
  ],
}
