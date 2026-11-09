export default {
  id: 'rm-064',
  category: 'api-design',
  title: 'Trip Travellers API: Removing an Item with 204 No Content',
  level: 'BEGINNER',
  tags: ['raml', 'api-design', 'http-methods', 'status-codes', 'nested-resources', 'travel'],
  estMinutes: 12,
  description: `
A tour operator sells group trips of up to 9 travellers on one booking. Customers often drop a friend from the group a few weeks before departure, and the website needs an API call for that.

Booking references are six capital letters or digits, such as \`K7Q2ZP\`. Each traveller on a trip has a number from 1 to 9.

\`delete\` removes one item. When it works there is nothing left to send back, so the usual answer is **204 No Content**: a success with **no body**. A 204 that declares a body is a contract that cannot be met.

The lead traveller holds the booking and pays for it. Removing them would leave a booking with no owner, so the API refuses with **409 Conflict** and an \`Error\` body. Callers can still list the travellers, but they cannot delete the whole list in one call.

**Requirements**
- A type \`Traveller\` with the required strings \`firstName\` and \`lastName\`, a required \`dateOfBirth\` with no time, and a required boolean \`lead\`.
- A type \`Error\` with the required strings \`code\` and \`message\`.
- \`tripRef\` is a string of exactly six capital letters or digits.
- \`travellerNumber\` is an integer from 1 to 9.
- \`GET /trips/{tripRef}/travellers\` returns a list of \`Traveller\`. There is no \`delete\` on this collection.
- \`GET /trips/{tripRef}/travellers/{travellerNumber}\` returns a \`Traveller\`, or 404.
- \`DELETE /trips/{tripRef}/travellers/{travellerNumber}\` returns 204 with no body, 404 when there is no such traveller, and 409 with an \`Error\` body for the lead traveller.
`,
  starter: `#%RAML 1.0
title: Trip Travellers API
mediaType: application/json

types:
  Traveller:
    type: object
    properties:
      firstName: string
      lastName: string

/trips:
  /{tripRef}:
    /travellers:
      get:
        responses:
          200:
            body:
              type: Traveller[]
`,
  ramlChecks: [
    {
      label: 'Traveller has a date-only dateOfBirth and a boolean lead',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Traveller', prop: 'dateOfBirth', want: { type: 'date-only', required: true } },
          { type: 'prop', typeName: 'Traveller', prop: 'lead', want: { type: 'boolean', required: true } },
        ],
      },
    },
    {
      label: 'tripRef is six capital letters or digits',
      rule: { type: 'param', path: '/trips/{}', in: 'uri', name: 'tripRef', want: { type: 'string', pattern: { accepts: ['K7Q2ZP', '123456', 'ABCDEF'], rejects: ['k7q2zp', 'K7Q2Z', 'K7Q2ZPX', 'K7-2ZP'] } } },
    },
    {
      label: 'travellerNumber is an integer from 1 to 9',
      rule: { type: 'param', path: '/trips/{}/travellers/{}', in: 'uri', name: 'travellerNumber', want: { type: 'integer', minimum: 1, maximum: 9 } },
    },
    {
      label: 'GET one traveller returns a Traveller or 404',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/trips/{}/travellers/{}', method: 'get', status: '200', typeIs: 'Traveller' },
          { type: 'response', path: '/trips/{}/travellers/{}', method: 'get', status: '404' },
        ],
      },
    },
    { label: 'DELETE one traveller returns 204 with no body', rule: { type: 'response', path: '/trips/{}/travellers/{}', method: 'delete', status: '204', noBody: true } },
    { label: 'DELETE one traveller returns 404 when there is no such traveller', rule: { type: 'response', path: '/trips/{}/travellers/{}', method: 'delete', status: '404' } },
    { label: 'DELETE returns 409 with an Error body for the lead traveller', rule: { type: 'response', path: '/trips/{}/travellers/{}', method: 'delete', status: '409', typeIs: 'Error' } },
    {
      label: 'The travellers list can be read but not deleted as a whole',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/trips/{}/travellers', method: 'get', status: '200', typeIs: 'Traveller[]' },
          { type: 'noMethod', path: '/trips/{}/travellers', method: 'delete' },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Trip Travellers API
mediaType: application/json

types:
  Traveller:
    type: object
    properties:
      firstName: string
      lastName: string
      dateOfBirth: date-only
      lead: boolean
    example:
      firstName: Amara
      lastName: Okafor
      dateOfBirth: 1991-05-14
      lead: false
  Error:
    type: object
    properties:
      code: string
      message: string

/trips:
  /{tripRef}:
    uriParameters:
      tripRef:
        type: string
        pattern: ^[A-Z0-9]{6}$
    /travellers:
      get:
        responses:
          200:
            body:
              type: Traveller[]
      /{travellerNumber}:
        uriParameters:
          travellerNumber:
            type: integer
            minimum: 1
            maximum: 9
        get:
          responses:
            200:
              body:
                type: Traveller
            404:
              description: The trip has no traveller with this number.
        delete:
          description: Remove one traveller from the trip.
          responses:
            204:
              description: The traveller was removed.
            404:
              description: The trip has no traveller with this number.
            409:
              description: This is the lead traveller, who cannot be removed.
              body:
                type: Error
`,
  keyPoints: [
    '204 No Content means success with no body, so the response must not declare one.',
    'delete belongs on the item resource. A delete on the collection would remove every traveller at once.',
    '409 fits a delete that breaks a rule about the current data, such as removing the booking owner.',
    'A 404 on delete tells the caller the item was never there, or is already gone.',
  ],
  solution: `
The \`delete\` sits on \`/{travellerNumber}\`, so one call removes one traveller. The collection has only \`get\`, so no one can wipe a group by mistake.

The 204 response has a description and nothing else. After a removal there is nothing useful to return, and a caller that needs the new list can call \`GET /travellers\`.

409 covers the lead traveller. The request is well formed and the traveller exists, but removing them would leave a booking with no owner. The \`Error\` body tells the website to offer "change lead traveller" first.
`,
  followUps: [
    {
      q: 'What should a second DELETE of the same traveller return?',
      a: 'Most APIs return 404, because the traveller is gone. The state on the server is the same after both calls, which is what makes DELETE idempotent.',
    },
    {
      q: 'When would you return 200 from a DELETE instead of 204?',
      a: 'When the response carries something useful, such as the updated trip price after the traveller left. Then 200 with that body fits better.',
    },
    {
      q: 'Is DELETE always a hard delete in the database?',
      a: 'No. The contract only says the resource is gone for callers. The implementation may keep a soft deleted row for audit and refunds.',
    },
  ],
}
