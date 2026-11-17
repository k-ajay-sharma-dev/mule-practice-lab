export default {
  id: 'rm-129',
  category: 'api-design',
  title: 'Ferry Fares API: Effective-Dated Prices with validFrom, validTo and asOf',
  level: 'ADVANCED',
  tags: ['raml', 'api-design', 'effective-dating', 'dates', 'traits', 'uri-parameters', 'status-codes', 'transport'],
  estMinutes: 30,
  description: `
Gullrock Ferries sells tickets for eight island routes. Fares change twice a year, and the pricing team loads the new fares weeks in advance. The booking site must price a sailing with the fare that is valid **on the day of travel**, not the fare valid today. Customer service also needs to see the fare that applied on a past date, to answer complaints.

Each fare is a version with a \`validFrom\` date and an optional \`validTo\` date. A fare with no \`validTo\` runs until a newer version replaces it. Two versions of the same route and vehicle must not overlap.

Every read that depends on a date takes the same optional \`asOf\` query parameter, defined once in a trait.

**Brief**
- A route code is three capital letters, a dash, and three capital letters, such as \`OBN-CRA\`.
- Prices are whole pence, as an integer.

**Requirements**
- Title \`Ferry Fares API\`, with JSON as the default media type.
- A type \`RouteCode\`: a string with a pattern for the format above.
- A type \`FareVersion\` with a required \`vehicle\` that is one of \`FOOT\`, \`CAR\`, \`VAN\`, a required integer \`pricePence\` of at least 0, a required \`validFrom\` date with no time, and an optional \`validTo\` date with no time.
- A type \`Fare\` that inherits from \`FareVersion\` and adds a required string \`fareId\` and a required \`route\` of type \`RouteCode\`.
- A type \`Error\` with a required string \`code\` and a required string \`message\`.
- A trait \`asOfDate\` with an optional \`asOf\` query parameter that is a date with no time.
- \`/routes/{routeCode}\` declares \`routeCode\` as a \`RouteCode\`.
- \`GET /routes/{routeCode}/fares\` uses \`asOfDate\` and returns \`Fare[]\` with 200, or 404.
- \`GET /routes/{routeCode}/sailings\` uses \`asOfDate\` too, and returns 200.
- \`POST /routes/{routeCode}/fares\` takes a \`FareVersion\` and returns a \`Fare\` with 201 and a \`Location\` header. It returns an \`Error\` with 409 when the dates overlap another version, and with 422 when \`validFrom\` is in the past.
`,
  starter: `#%RAML 1.0
title: Ferry Fares API
mediaType: application/json

types:
  Fare:
    type: object
    properties:
      vehicle: string
      price: number

/routes:
  /{routeCode}:
    /fares:
      get:
        responses:
          200:
            body:
              type: Fare[]
`,
  ramlChecks: [
    {
      label: 'The title is Ferry Fares API and JSON is the default',
      rule: { type: 'all', rules: [{ type: 'root', key: 'title', want: 'Ferry Fares API' }, { type: 'root', key: 'mediaType', want: 'application/json' }] },
    },
    {
      label: 'RouteCode is three capitals, a dash and three capitals',
      rule: { type: 'typeDecl', name: 'RouteCode', want: { pattern: { accepts: ['OBN-CRA', 'ABC-XYZ'], rejects: ['obn-cra', 'OBNCRA', 'OB-CRA', 'OBN-CRAX', 'XOBN-CRA', 'OBN_CRA'] } } },
    },
    {
      label: 'vehicle is FOOT, CAR or VAN and pricePence is an integer of at least 0',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'FareVersion', prop: 'vehicle', want: { required: true, enum: { exactly: ['FOOT', 'CAR', 'VAN'] } } },
          { type: 'prop', typeName: 'FareVersion', prop: 'pricePence', want: { type: 'integer', required: true, minimum: 0 } },
        ],
      },
    },
    {
      label: 'validFrom is a required date-only and validTo an optional date-only',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'FareVersion', prop: 'validFrom', want: { type: 'date-only', required: true } },
          { type: 'prop', typeName: 'FareVersion', prop: 'validTo', want: { type: 'date-only', required: false } },
        ],
      },
    },
    {
      label: 'Fare inherits FareVersion and adds fareId and a RouteCode route',
      rule: {
        type: 'all',
        rules: [
          { type: 'typeDecl', name: 'Fare', extends: 'FareVersion' },
          { type: 'prop', typeName: 'Fare', prop: 'fareId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Fare', prop: 'route', want: { type: 'RouteCode', required: true } },
        ],
      },
    },
    {
      label: 'The asOfDate trait holds the asOf query parameter',
      rule: { type: 'trait', name: 'asOfDate', has: 'queryParameters.asOf' },
    },
    { label: 'routeCode is declared as a RouteCode', rule: { type: 'param', path: '/routes/{}', in: 'uri', name: 'routeCode', want: { type: 'RouteCode' } } },
    {
      label: 'GET fares and GET sailings both use asOfDate, which gives an optional date-only asOf',
      rule: {
        type: 'all',
        rules: [
          { type: 'applied', path: '/routes/{}/fares', method: 'get', trait: 'asOfDate' },
          { type: 'applied', path: '/routes/{}/sailings', method: 'get', trait: 'asOfDate' },
          { type: 'param', path: '/routes/{}/fares', method: 'get', in: 'query', name: 'asOf', want: { type: 'date-only', required: false } },
          { type: 'response', path: '/routes/{}/sailings', method: 'get', status: '200' },
        ],
      },
    },
    {
      label: 'GET fares returns Fare[] or 404',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/routes/{}/fares', method: 'get', status: '200', typeIs: 'Fare[]' },
          { type: 'response', path: '/routes/{}/fares', method: 'get', status: '404' },
        ],
      },
    },
    {
      label: 'POST fares takes a FareVersion and returns a Fare with 201 and Location',
      rule: {
        type: 'all',
        rules: [
          { type: 'body', path: '/routes/{}/fares', method: 'post', typeIs: 'FareVersion' },
          { type: 'response', path: '/routes/{}/fares', method: 'post', status: '201', typeIs: 'Fare', header: 'Location' },
        ],
      },
    },
    {
      label: 'POST fares returns an Error with 409 for an overlap and 422 for a past date',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/routes/{}/fares', method: 'post', status: '409', typeIs: 'Error' },
          { type: 'response', path: '/routes/{}/fares', method: 'post', status: '422', typeIs: 'Error' },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Ferry Fares API
version: v1
baseUri: https://api.example.com/ferries/{version}
mediaType: application/json

types:
  RouteCode:
    type: string
    pattern: ^[A-Z]{3}-[A-Z]{3}$
    example: OBN-CRA
  FareVersion:
    type: object
    properties:
      vehicle:
        type: string
        enum: [ FOOT, CAR, VAN ]
      pricePence:
        type: integer
        minimum: 0
      validFrom:
        type: date-only
        description: The first day of travel this price applies to.
      validTo?:
        type: date-only
        description: The last day of travel this price applies to. Leave it out for no end date.
  Fare:
    type: FareVersion
    properties:
      fareId: string
      route: RouteCode
    example:
      fareId: FR-2027-0412
      route: OBN-CRA
      vehicle: CAR
      pricePence: 8450
      validFrom: 2027-04-01
  Error:
    type: object
    properties:
      code: string
      message: string

traits:
  asOfDate:
    queryParameters:
      asOf?:
        type: date-only
        description: The day of travel to answer for. Leave it out for today.

/routes:
  /{routeCode}:
    uriParameters:
      routeCode:
        type: RouteCode
    /fares:
      get:
        is: [ asOfDate ]
        description: The fares valid on the asOf date, one per vehicle.
        responses:
          200:
            body:
              type: Fare[]
          404:
            description: No route has this code.
      post:
        description: Schedule a new fare version.
        body:
          type: FareVersion
        responses:
          201:
            headers:
              Location:
                type: string
            body:
              type: Fare
          409:
            description: The dates overlap another version for this route and vehicle.
            body:
              type: Error
          422:
            description: validFrom is in the past. Past prices cannot change.
            body:
              type: Error
    /sailings:
      get:
        is: [ asOfDate ]
        description: The sailings on the asOf date.
        responses:
          200:
            description: The sailings, in departure order.
`,
  keyPoints: [
    'Effective dating keeps every version of a price with the dates it applies to, instead of overwriting one price.',
    'date-only fits validFrom and validTo, because a fare applies to whole days of travel.',
    'An optional validTo means open-ended. The next version closes the gap.',
    'An asOf parameter answers for any date, past or future, and defaults to today.',
    'A trait keeps asOf the same on every read that depends on a date.',
    '409 fits an overlap with another version. 422 fits a well-formed request that breaks a rule, such as a date in the past.',
  ],
  solution: `
**Versions, not updates.** If the pricing team overwrote the price, the site would show the summer price before summer and customer service could not see last year's price. Each \`Fare\` is one version with the days it covers. Loading a new price is a \`POST\` of a new version, never a \`PUT\` on the old one.

**Dates.** A fare applies to days of travel, so \`date-only\` fits. A \`datetime\` would bring in time zones and the question of whether midnight counts. \`validTo\` is optional, because the newest version usually has no end yet.

**asOf.**
| Caller | asOf |
|---|---|
| Booking site pricing a sailing in May | The sailing date |
| Customer service checking a complaint | The past travel date |
| A screen of today's prices | Left out, which means today |

The trait puts the same parameter, with the same type and description, on both reads.

**Errors.** An overlap is a clash with data that exists, so 409. A start date in the past is well formed but breaks a rule, so 422. Both return the \`Error\` type with a code the pricing tool can show.

**The route code.** \`RouteCode\` is a named type, so the URI parameter and the \`route\` property share one pattern.
`,
  followUps: [
    {
      q: 'Is validTo inclusive or exclusive?',
      a: 'Either can work, but the contract must say which. Here the description says it is the last day the price applies, so it is inclusive. Many systems use an exclusive end because the next version can then start on the same date, which keeps overlap checks short.',
    },
    {
      q: 'How would the pricing team correct a future price that has a typo?',
      a: 'Allow a DELETE or a PUT on a version whose validFrom is still in the future, and refuse it with 409 once the version has started. Past versions stay as they were, because tickets were sold at that price.',
    },
    {
      q: 'Should asOf be a datetime for a ferry that sails after midnight?',
      a: 'The fare follows the date of the sailing as printed on the ticket, in the local time of the port. Keep asOf as a date and let the sailing carry its own local date. That avoids one sailing being priced on two days.',
    },
  ],
}
