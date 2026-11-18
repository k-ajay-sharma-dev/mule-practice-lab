export default {
  id: 'rm-150',
  category: 'api-design',
  title: 'Carrier Rates Experience API: Partial Results When Some Carriers Time Out',
  level: 'EXPERT',
  tags: ['raml', 'api-design', 'experience-api', 'partial-results', 'aggregation', 'traits', 'status-codes', 'timeouts', 'logistics'],
  estMinutes: 40,
  description: `
Marlow Parcel Hub's checkout page shows delivery options from four carriers. An Experience API asks the four carrier System APIs at the same time and has a budget of 3 seconds in total, because a slow checkout loses sales.

Carriers are not always quick. One is often slow on Monday mornings, and another may be down for maintenance. The product owner's rule: **show what we have**. If two carriers answer in time, the shopper sees their options. Only when no carrier answers does the checkout show an error.

**Requirements**
- Title \`Carrier Rates API\`, with JSON as the default media type.
- A trait \`traced\` with a required string header \`X-Correlation-ID\`, applied to the POST.
- A type \`Parcel\` with a required number \`weightKg\` from 0.01 to 30.
- A type \`RateRequest\` with a required string \`fromPostcode\`, a required string \`toPostcode\`, and a required \`parcels\` list of \`Parcel\` with 1 to 10 items.
- A type \`Quote\` with a required string \`carrier\`, a required string \`service\`, a required number \`price\` of at least 0, and a required integer \`deliveryDays\` of at least 0.
- A type \`CarrierStatus\` with a required string \`carrier\` and a required \`status\`, one of \`OK\`, \`TIMEOUT\`, \`ERROR\`, \`NO_SERVICE\`. \`NO_SERVICE\` means the carrier answered but does not deliver to that postcode.
- A type \`RateResult\` with a required \`quotes\` list of \`Quote\`, a required \`carriers\` list of \`CarrierStatus\`, and a required boolean \`complete\`, \`false\` when any carrier timed out or failed.
- A type \`Problem\` with a required string \`title\` and a required string \`detail\`.
- \`POST /rate-quotes\` takes a \`RateRequest\` and returns:
  - a \`RateResult\` with 200, also when only some carriers answered
  - a \`Problem\` with 400 for a bad request
  - a \`Problem\` with 504 when no carrier answered in time
`,
  starter: `#%RAML 1.0
title: Carrier Rates API
mediaType: application/json

types:
  Quote:
    type: object
    properties:
      carrier: string
      price: number

/rate-quotes:
  post:
    body:
      type: object
    responses:
      200:
        body:
          type: Quote[]
      500:
        description: A carrier failed.
`,
  ramlChecks: [
    {
      label: 'The title is Carrier Rates API and JSON is the default',
      rule: { type: 'all', rules: [{ type: 'root', key: 'title', want: 'Carrier Rates API' }, { type: 'root', key: 'mediaType', want: 'application/json' }] },
    },
    {
      label: 'The traced trait has a required X-Correlation-ID header and the POST uses it',
      rule: {
        type: 'all',
        rules: [
          { type: 'trait', name: 'traced', has: 'headers.X-Correlation-ID' },
          { type: 'applied', path: '/rate-quotes', method: 'post', trait: 'traced' },
          { type: 'param', path: '/rate-quotes', method: 'post', in: 'header', name: 'X-Correlation-ID', want: { type: 'string', required: true } },
        ],
      },
    },
    {
      label: 'Parcel has a weightKg from 0.01 to 30',
      rule: { type: 'prop', typeName: 'Parcel', prop: 'weightKg', want: { type: 'number', required: true, minimum: 0.01, maximum: 30 } },
    },
    {
      label: 'RateRequest has both postcodes and 1 to 10 parcels',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'RateRequest', prop: 'fromPostcode', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'RateRequest', prop: 'toPostcode', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'RateRequest', prop: 'parcels', want: { type: 'Parcel[]', required: true, minItems: 1, maxItems: 10 } },
        ],
      },
    },
    {
      label: 'Quote has carrier, service, a price of at least 0 and deliveryDays of at least 0',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Quote', prop: 'carrier', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Quote', prop: 'service', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Quote', prop: 'price', want: { type: 'number', required: true, minimum: 0 } },
          { type: 'prop', typeName: 'Quote', prop: 'deliveryDays', want: { type: 'integer', required: true, minimum: 0 } },
        ],
      },
    },
    {
      label: 'CarrierStatus has a carrier and a status of OK, TIMEOUT, ERROR or NO_SERVICE',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'CarrierStatus', prop: 'carrier', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'CarrierStatus', prop: 'status', want: { required: true, enum: { exactly: ['OK', 'TIMEOUT', 'ERROR', 'NO_SERVICE'] } } },
        ],
      },
    },
    {
      label: 'RateResult has a Quote list, a CarrierStatus list and a complete flag',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'RateResult', prop: 'quotes', want: { type: 'Quote[]', required: true } },
          { type: 'prop', typeName: 'RateResult', prop: 'carriers', want: { type: 'CarrierStatus[]', required: true } },
          { type: 'prop', typeName: 'RateResult', prop: 'complete', want: { type: 'boolean', required: true } },
        ],
      },
    },
    {
      label: 'Problem has a required title and a required detail',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Problem', prop: 'title', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Problem', prop: 'detail', want: { type: 'string', required: true } },
        ],
      },
    },
    {
      label: 'POST /rate-quotes takes a RateRequest and returns a RateResult with 200',
      rule: {
        type: 'all',
        rules: [
          { type: 'body', path: '/rate-quotes', method: 'post', typeIs: 'RateRequest' },
          { type: 'response', path: '/rate-quotes', method: 'post', status: '200', typeIs: 'RateResult' },
        ],
      },
    },
    {
      label: 'POST /rate-quotes returns a Problem with 400 and with 504',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/rate-quotes', method: 'post', status: '400', typeIs: 'Problem' },
          { type: 'response', path: '/rate-quotes', method: 'post', status: '504', typeIs: 'Problem' },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Carrier Rates API
version: v1
baseUri: https://api.example.com/carrier-rates/{version}
mediaType: application/json

traits:
  traced:
    usage: Every call carries an id that is passed on to each carrier call and written to the logs.
    headers:
      X-Correlation-ID:
        type: string
        minLength: 8
        maxLength: 64

types:
  Parcel:
    type: object
    properties:
      weightKg:
        type: number
        minimum: 0.01
        maximum: 30
  RateRequest:
    type: object
    properties:
      fromPostcode: string
      toPostcode: string
      parcels:
        type: Parcel[]
        minItems: 1
        maxItems: 10
    example:
      fromPostcode: SL7 1AA
      toPostcode: EH3 9QQ
      parcels:
        - weightKg: 2.4
        - weightKg: 0.8
  Quote:
    type: object
    properties:
      carrier: string
      service: string
      price:
        type: number
        minimum: 0
      deliveryDays:
        type: integer
        minimum: 0
  CarrierStatus:
    type: object
    properties:
      carrier: string
      status:
        type: string
        enum: [ OK, TIMEOUT, ERROR, NO_SERVICE ]
  RateResult:
    type: object
    properties:
      quotes: Quote[]
      carriers: CarrierStatus[]
      complete:
        type: boolean
        description: false when at least one carrier timed out or failed. NO_SERVICE does not make a result incomplete.
    example:
      quotes:
        - carrier: Swiftline
          service: Next day
          price: 7.95
          deliveryDays: 1
        - carrier: Fenwick Freight
          service: Economy
          price: 4.5
          deliveryDays: 3
      carriers:
        - carrier: Swiftline
          status: OK
        - carrier: Fenwick Freight
          status: OK
        - carrier: Pelham Post
          status: TIMEOUT
        - carrier: Corrie Express
          status: NO_SERVICE
      complete: false
  Problem:
    type: object
    properties:
      title: string
      detail: string

/rate-quotes:
  post:
    is: [ traced ]
    description: Asks every carrier at the same time and answers within about 3 seconds with the quotes that arrived.
    body:
      type: RateRequest
    responses:
      200:
        description: Quotes from the carriers that answered in time. Check complete and carriers to see who is missing.
        body:
          type: RateResult
      400:
        body:
          type: Problem
      504:
        description: No carrier answered in time.
        body:
          type: Problem
`,
  keyPoints: [
    'An aggregating API should answer 200 with what it has when some sources fail.',
    'A per source status list tells the client who is missing and why.',
    'A complete flag gives the client one field to check.',
    'A carrier that answered with no service is a normal answer, not a failure.',
    '504 is for the case where no source answered within the time budget.',
    'POST fits because the request carries a list of parcels and a quote is computed, not stored.',
    'A correlation header passed to every carrier call ties the logs together.',
  ],
  solution: `
**Partial results are a success.** The shopper needs some delivery options, not every option. Failing the whole call because one carrier is slow would lose the sale. So the API answers 200 with the quotes that arrived, and says what is missing.

**Who is missing.** \`carriers\` has one entry per carrier with its status. \`TIMEOUT\` and \`ERROR\` mean "we do not know", so \`complete\` is \`false\`. \`NO_SERVICE\` means the carrier answered "we do not deliver there", which is a full answer, so it does not make the result incomplete. The page can show "more options may appear if you refresh" only when \`complete\` is \`false\`.

**When to fail.** If no carrier answers within the budget, there is nothing to show. 504 Gateway Timeout fits: the API acts as a gateway to the carriers, and none of them answered in time. A bad request, such as 40 kg in one parcel, is 400 before any carrier is called.

**In Mule.** A Scatter-Gather fails the whole step if a route fails, so each route needs its own error handling that turns a timeout or error into a status entry. Set a response timeout on each HTTP request below the total budget, or the slowest carrier sets the speed of the checkout.

**Tracing.** \`X-Correlation-ID\` comes in through the \`traced\` trait and is passed on to each carrier call, so support can follow one checkout across five logs.
`,
  followUps: [
    {
      q: 'Why not answer 206 Partial Content for a partial result?',
      a: '206 is for range requests, where the client asked for part of a resource. Here the client asked for everything and got what was available, so 200 with a status per carrier is the honest answer.',
    },
    {
      q: 'One carrier is slow every Monday. How do you stop it slowing every checkout?',
      a: 'Keep its timeout short, and consider a circuit breaker that skips it for a while after repeated timeouts. Its status shows TIMEOUT or ERROR, and the other carriers still answer quickly.',
    },
    {
      q: 'Could the API cache quotes?',
      a: 'Briefly, keyed on postcodes and parcel weights. A short cache helps when shoppers go back and forth on the checkout page, but prices change, so keep the time to live in minutes, not hours.',
    },
  ],
}
