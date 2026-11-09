export default {
  id: 'rm-118',
  category: 'api-design',
  title: 'Shipment Tracking System API: ETags and Cursor Paging over a Warehouse System',
  level: 'ADVANCED',
  tags: ['raml', 'api-design', 'system-api', 'etag', 'paging', 'client-id-enforcement', 'logistics'],
  estMinutes: 35,
  description: `
A third-party logistics company runs 22 warehouses for online retailers. Each retailer shows "where is my order" on its own site, and those pages ask for tracking data 1.2 million times a day. Nine times out of ten nothing has changed since the last look.

Every scan in a warehouse adds a tracking event: received, picked, packed, dispatched and so on. A parcel collects 10 to 40 events, and new ones keep arriving while a caller reads the list.

You are writing the read-only **System API** in front of the warehouse management system. The design must keep load low, since the warehouse system also runs the scanners on the floor.

**Brief**
- A tracking number has two capital letters, nine digits and two capital letters, such as \`RX123456789GB\`.
- A warehouse code is \`WH\` and three digits, such as \`WH014\`.
- Retailers prove who they are with \`client_id\` and \`client_secret\` headers, checked by a Client ID Enforcement policy in API Manager.

**Requirements**
- Title \`Shipment Tracking System API\`, version \`v1\`, and JSON as the default media type.
- \`/shipments/{trackingNumber}\` has a pattern on \`trackingNumber\` for the format above.
- \`EventType\` is one of \`RECEIVED\`, \`PICKED\`, \`PACKED\`, \`DISPATCHED\`, \`IN_TRANSIT\`, \`OUT_FOR_DELIVERY\`, \`DELIVERED\`, \`EXCEPTION\`.
- \`TrackingEvent\` has a required \`eventType\` of type \`EventType\`, a required \`occurredAt\` with a time zone, and an optional \`warehouseCode\` with a pattern for the format above.
- \`GET /shipments/{trackingNumber}\` returns a \`Shipment\` with status 200 and an \`ETag\` header. It takes an optional \`If-None-Match\` header and returns 304 with no body when nothing changed. It returns an \`Error\` with status 404 for an unknown number.
- Trait \`cursorPaged\` has an optional string \`after\` and an optional integer \`limit\` from 1 to 200.
- \`GET /shipments/{trackingNumber}/events\` uses \`cursorPaged\`, has an optional \`since\` query parameter with a time zone, and returns an \`EventPage\` with status 200, or an \`Error\` with status 404.
- \`EventPage\` has a required \`items\` of type \`TrackingEvent[]\` and an optional string \`nextCursor\`.
- A scheme \`clientId\` of type \`Pass Through\` describes the headers \`client_id\` and \`client_secret\`. Both methods are secured by it.
- The API is read-only: no \`post\` on the events, and no \`put\` or \`delete\` on a shipment.
`,
  starter: `#%RAML 1.0
title: Shipment Tracking System API

types:

traits:

securitySchemes:

/shipments:
`,
  ramlChecks: [
    {
      label: 'The title, version v1 and JSON',
      rule: {
        type: 'all',
        rules: [
          { type: 'root', key: 'title', want: 'Shipment Tracking System API' },
          { type: 'root', key: 'version', want: 'v1' },
          { type: 'root', key: 'mediaType', want: 'application/json' },
        ],
      },
    },
    {
      label: 'trackingNumber has the two letters, nine digits, two letters pattern',
      rule: { type: 'param', path: '/shipments/{}', in: 'uri', name: 'trackingNumber', want: { pattern: { accepts: ['RX123456789GB', 'AB000000001CD'], rejects: ['RX12345678GB', 'rx123456789gb', '123456789GB', 'RX123456789GBX', 'RX1234567890B', 'R1X23456789GB'] } } },
    },
    { label: 'EventType allows the eight scan events', rule: { type: 'typeDecl', name: 'EventType', want: { enum: { exactly: ['RECEIVED', 'PICKED', 'PACKED', 'DISPATCHED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'EXCEPTION'] } } } },
    {
      label: 'TrackingEvent has eventType, occurredAt and an optional warehouseCode',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'TrackingEvent', prop: 'eventType', want: { type: 'EventType', required: true } },
          { type: 'prop', typeName: 'TrackingEvent', prop: 'occurredAt', want: { type: 'datetime', required: true } },
          { type: 'prop', typeName: 'TrackingEvent', prop: 'warehouseCode', want: { required: false, pattern: { accepts: ['WH014', 'WH999'], rejects: ['WH14', 'WH0140', 'wh014', 'XH014'] } } },
        ],
      },
    },
    { label: 'GET a shipment returns a Shipment with an ETag header', rule: { type: 'response', path: '/shipments/{}', method: 'get', status: '200', typeIs: 'Shipment', header: 'ETag' } },
    {
      label: 'GET a shipment takes an optional If-None-Match and returns 304 with no body',
      rule: {
        type: 'all',
        rules: [
          { type: 'param', path: '/shipments/{}', method: 'get', in: 'header', name: 'If-None-Match', want: { required: false } },
          { type: 'response', path: '/shipments/{}', method: 'get', status: '304', noBody: true },
        ],
      },
    },
    {
      label: 'Both methods return an Error with 404',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/shipments/{}', method: 'get', status: '404', typeIs: 'Error' },
          { type: 'response', path: '/shipments/{}/events', method: 'get', status: '404', typeIs: 'Error' },
        ],
      },
    },
    {
      label: 'GET events uses cursorPaged, with an optional after and a limit from 1 to 200',
      rule: {
        type: 'all',
        rules: [
          { type: 'applied', path: '/shipments/{}/events', method: 'get', trait: 'cursorPaged' },
          { type: 'param', path: '/shipments/{}/events', method: 'get', in: 'query', name: 'after', want: { type: 'string', required: false } },
          { type: 'param', path: '/shipments/{}/events', method: 'get', in: 'query', name: 'limit', want: { type: 'integer', required: false, minimum: 1, maximum: 200 } },
        ],
      },
    },
    { label: 'GET events has an optional since with a time zone', rule: { type: 'param', path: '/shipments/{}/events', method: 'get', in: 'query', name: 'since', want: { type: 'datetime', required: false } } },
    {
      label: 'GET events returns an EventPage with items and an optional nextCursor',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/shipments/{}/events', method: 'get', status: '200', typeIs: 'EventPage' },
          { type: 'prop', typeName: 'EventPage', prop: 'items', want: { type: 'TrackingEvent[]', required: true } },
          { type: 'prop', typeName: 'EventPage', prop: 'nextCursor', want: { type: 'string', required: false } },
        ],
      },
    },
    {
      label: 'clientId is a Pass Through scheme with client_id and client_secret, securing both methods',
      rule: {
        type: 'all',
        rules: [
          { type: 'scheme', name: 'clientId', schemeType: 'Pass Through', has: ['describedBy.headers.client_id', 'describedBy.headers.client_secret'] },
          { type: 'secured', path: '/shipments/{}', method: 'get', scheme: 'clientId', required: true },
          { type: 'secured', path: '/shipments/{}/events', method: 'get', scheme: 'clientId', required: true },
        ],
      },
    },
    {
      label: 'The API is read-only',
      rule: {
        type: 'all',
        rules: [
          { type: 'method', path: '/shipments/{}/events', method: 'get' },
          { type: 'noMethod', path: '/shipments/{}/events', method: 'post' },
          { type: 'noMethod', path: '/shipments/{}', method: 'put' },
          { type: 'noMethod', path: '/shipments/{}', method: 'delete' },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Shipment Tracking System API
version: v1
baseUri: https://api.example.com/tracking/{version}
mediaType: application/json

types:
  WarehouseCode:
    type: string
    pattern: ^WH[0-9]{3}$
  EventType:
    type: string
    enum: [ RECEIVED, PICKED, PACKED, DISPATCHED, IN_TRANSIT, OUT_FOR_DELIVERY, DELIVERED, EXCEPTION ]
  Shipment:
    type: object
    properties:
      trackingNumber: string
      status: EventType
      lastUpdated: datetime
      promisedDate?: date-only
    example:
      trackingNumber: RX123456789GB
      status: IN_TRANSIT
      lastUpdated: 2026-03-11T14:02:37Z
      promisedDate: 2026-03-12
  TrackingEvent:
    type: object
    properties:
      eventId: string
      eventType: EventType
      occurredAt: datetime
      warehouseCode?: WarehouseCode
      exceptionCode?: string
  EventPage:
    type: object
    properties:
      items: TrackingEvent[]
      nextCursor?: string
    example:
      items:
        - eventId: EV-90017733
          eventType: PACKED
          occurredAt: 2026-03-11T09:41:05Z
          warehouseCode: WH014
        - eventId: EV-90017802
          eventType: DISPATCHED
          occurredAt: 2026-03-11T11:15:44Z
          warehouseCode: WH014
      nextCursor: ZXYtOTAwMTc4MDI
  Error:
    type: object
    properties:
      code: string
      message: string

securitySchemes:
  clientId:
    type: Pass Through
    describedBy:
      headers:
        client_id:
          type: string
        client_secret:
          type: string
      responses:
        401:
          description: The client credentials are missing or not valid.

securedBy: [ clientId ]

traits:
  cursorPaged:
    queryParameters:
      after?:
        type: string
        description: The nextCursor from the previous page.
      limit?:
        type: integer
        minimum: 1
        maximum: 200
        default: 50

/shipments/{trackingNumber}:
  uriParameters:
    trackingNumber:
      type: string
      pattern: ^[A-Z]{2}[0-9]{9}[A-Z]{2}$
  get:
    headers:
      If-None-Match?:
        type: string
        description: The ETag from an earlier response.
    responses:
      200:
        headers:
          ETag:
            type: string
        body:
          type: Shipment
      304:
        description: Nothing changed since the ETag in If-None-Match.
      404:
        body:
          type: Error
  /events:
    get:
      is: [ cursorPaged ]
      queryParameters:
        since?: datetime
      responses:
        200:
          body:
            type: EventPage
        404:
          body:
            type: Error
`,
  keyPoints: [
    'An ETag with If-None-Match lets callers ask "has it changed?" and get a 304 with no body when it has not.',
    'Cursor paging stays correct while new events arrive. Offset paging would skip or repeat events as the list grows.',
    'A since filter lets a caller fetch only the events after its last look.',
    'A System API over an operational system protects it: read-only, cacheable and paged.',
    'Pass Through describes the client_id and client_secret headers that the Client ID Enforcement policy checks.',
  ],
  solution: `
The design is about load. Nine in ten lookups find nothing new, so the shipment GET returns an \`ETag\`. A retailer sends it back in \`If-None-Match\`, and when nothing changed the API answers 304 with no body. The Mule app can serve that from a cache without touching the warehouse system.

Events use a cursor, not an offset. While a retailer reads page one, a new scan arrives. With offsets, page two would shift by one and repeat an event. A cursor marks the last event seen, so the next page starts after it whatever was added. \`nextCursor\` is missing on the last page. \`since\` lets a caller that polls ask only for what is new.

\`EventPage\` wraps the list so the cursor has a home. A bare \`TrackingEvent[]\` has nowhere to put it except a header.

The scheme is \`Pass Through\` because API Manager's Client ID Enforcement policy does the checking. The contract only documents which headers to send and that a 401 can come back.

Nothing writes. Scans come from the warehouse floor, not from retailers, so the API offers no \`post\`, \`put\` or \`delete\`.
`,
  followUps: [
    {
      q: 'How would the Mule application produce the ETag?',
      a: 'Hash the fields of the Shipment, or use the lastUpdated time and a version number from the warehouse system. The same data must always give the same ETag.',
    },
    {
      q: 'Why is a cursor opaque, such as a base64 string?',
      a: 'Callers must not build or edit it. The server can change what is inside, such as an event id or a timestamp, without breaking anyone.',
    },
    {
      q: 'A large retailer wants every event for 50,000 parcels each night. Is this API the right tool?',
      a: 'No. Offer an event stream or a nightly file instead, for example events published to Anypoint MQ. Polling 50,000 parcels would put heavy load on the warehouse system.',
    },
    {
      q: 'Where else could caching happen?',
      a: 'Add Cache-Control with a short max-age so a CDN or the retailer can reuse answers. The HTTP Caching policy in API Manager can also cache responses at the gateway.',
    },
  ],
}
