export default {
  id: 'rm-006',
  category: 'api-design',
  title: 'Shipment Tracking API: A Named Data Type in Responses',
  level: 'BEGINNER',
  tags: ['raml', 'api-design', 'data-types', 'responses', 'logistics'],
  estMinutes: 12,
  description: `
A parcel carrier wants to let online shops track shipments. Two endpoints return the same shipment data, and the team does not want to describe it twice.

A **data type** describes the shape of some data: which properties it has and what type each one is. You declare it once under \`types\`, give it a name, and use that name wherever the data appears. A type can also use another named type for one of its properties.

\`Shipment[]\` means a list of \`Shipment\`.

**Requirements**
- A type \`Carrier\` with a required string \`name\` and a required string \`phone\`.
- A type \`Shipment\` with these required properties: a string \`trackingNumber\`, a number \`weightKg\`, a \`date-only\` \`shippedOn\`, and a \`carrier\` of type \`Carrier\`.
- \`GET /shipments\` returns a list of \`Shipment\` with status 200.
- \`GET /shipments/{trackingNumber}\` returns one \`Shipment\` with status 200, or 404 when the number is unknown.
`,
  starter: `#%RAML 1.0
title: Shipment Tracking API
mediaType: application/json

types:
  Carrier:

/shipments:
`,
  ramlChecks: [
    { label: 'Carrier has a required string name', rule: { type: 'prop', typeName: 'Carrier', prop: 'name', want: { type: 'string', required: true } } },
    { label: 'Carrier has a required string phone', rule: { type: 'prop', typeName: 'Carrier', prop: 'phone', want: { type: 'string', required: true } } },
    { label: 'Shipment has a required string trackingNumber', rule: { type: 'prop', typeName: 'Shipment', prop: 'trackingNumber', want: { type: 'string', required: true } } },
    { label: 'Shipment has a required number weightKg', rule: { type: 'prop', typeName: 'Shipment', prop: 'weightKg', want: { type: 'number', required: true } } },
    { label: 'Shipment has a required date-only shippedOn', rule: { type: 'prop', typeName: 'Shipment', prop: 'shippedOn', want: { type: 'date-only', required: true } } },
    { label: 'Shipment.carrier uses the Carrier type', rule: { type: 'prop', typeName: 'Shipment', prop: 'carrier', want: { type: 'Carrier', required: true } } },
    { label: 'GET /shipments returns Shipment[]', rule: { type: 'response', path: '/shipments', method: 'get', status: '200', typeIs: 'Shipment[]' } },
    { label: 'GET /shipments/{trackingNumber} returns a Shipment', rule: { type: 'response', path: '/shipments/{}', method: 'get', status: '200', typeIs: 'Shipment' } },
    { label: 'GET /shipments/{trackingNumber} returns 404 for an unknown number', rule: { type: 'response', path: '/shipments/{}', method: 'get', status: '404' } },
  ],
  referenceRaml: `#%RAML 1.0
title: Shipment Tracking API
mediaType: application/json

types:
  Carrier:
    type: object
    properties:
      name: string
      phone: string
  Shipment:
    type: object
    properties:
      trackingNumber: string
      weightKg: number
      shippedOn: date-only
      carrier: Carrier

/shipments:
  get:
    responses:
      200:
        body:
          type: Shipment[]
  /{trackingNumber}:
    get:
      responses:
        200:
          body:
            type: Shipment
        404:
          description: No shipment has this tracking number.
`,
  keyPoints: [
    'Declare a type once under types, then use its name wherever the data appears.',
    'A property can use another named type, as carrier uses Carrier here.',
    'Shipment[] is a list of Shipment, the same as type: array with items: Shipment.',
    'A property with no question mark is required.',
  ],
  solution: `
\`Shipment\` is declared once, so the list and the single item cannot drift apart. If the team adds a property later, both endpoints get it.

\`carrier\` uses \`Carrier\` as its type, so the shape of a carrier also has one home. It can be reused by any later type that needs it.

The list returns \`Shipment[]\` and the single item returns \`Shipment\`. Getting this difference right matters to whoever generates code from the file.
`,
  followUps: [
    {
      q: 'What goes wrong if you write the properties inline in each response?',
      a: 'The same shape lives in several places. Someone will change one and forget another, and consumers then see two versions of the same thing.',
    },
    {
      q: 'What does type: object add if properties are already listed?',
      a: 'Nothing changes here. A declaration with properties is an object by default, and writing it out only makes that clear to the reader.',
    },
    {
      q: 'How would several APIs share the Carrier type?',
      a: 'Put it in a data type fragment or a RAML library, publish that to Exchange, and bring it in with !include or uses. Each API then points at one definition.',
    },
  ],
}
