export default {
  id: 'rm-146',
  category: 'api-design',
  title: 'Store Prices API: Read Many Items by Id in One Call with a notFound List',
  level: 'ADVANCED',
  tags: ['raml', 'api-design', 'batch-read', 'query-parameters', 'arrays', 'partial-results', 'scalar-types', 'retail'],
  estMinutes: 25,
  description: `
Saltmarsh Grocers has a mobile app that shows the price of every item in a shopping list, up to 50 items. Today the app calls \`GET /stores/{storeId}/prices/{sku}\` once per item. On a weak phone signal, 50 calls take several seconds, and the API gateway counts each one against the app's rate limit.

The new contract adds a **batch read**: one GET with a list of SKUs. Some SKUs may have been withdrawn since the list was written. The call must still return the prices it found and say which SKUs it did not find, instead of failing the whole request.

**Requirements**
- Title \`Store Prices API\`, with JSON as the default media type.
- A scalar type \`Sku\`: a string of exactly 8 digits.
- A type \`Price\` with a required \`sku\` of type \`Sku\`, a required string \`storeId\`, and a required number \`amount\` of at least 0.
- A type \`PriceBatch\` with a required \`items\` list of \`Price\` and a required \`notFound\` list of \`Sku\`.
- A type \`Error\` with a required string \`message\`.
- \`GET /stores/{storeId}/prices\` takes a required query parameter \`sku\`: a list of \`Sku\` with at least 1 and at most 50 items. The caller repeats it, as in \`?sku=00104411&sku=00203318\`. It returns a \`PriceBatch\` with 200 and an \`Error\` with 400.
- \`GET /stores/{storeId}/prices/{sku}\` stays. It returns a \`Price\` with 200 and an \`Error\` with 404.
`,
  starter: `#%RAML 1.0
title: Store Prices API
mediaType: application/json

types:
  Price:
    type: object
    properties:
      sku: string
      storeId: string
      amount: number

/stores/{storeId}/prices:
  get:
    queryParameters:
      sku: string
    responses:
      200:
        body:
          type: Price[]
      404:
        description: One of the SKUs was not found.
  /{sku}:
    get:
      responses:
        200:
          body:
            type: Price
`,
  ramlChecks: [
    {
      label: 'The title is Store Prices API and JSON is the default',
      rule: { type: 'all', rules: [{ type: 'root', key: 'title', want: 'Store Prices API' }, { type: 'root', key: 'mediaType', want: 'application/json' }] },
    },
    {
      label: 'Sku is a string of exactly 8 digits',
      rule: { type: 'typeDecl', name: 'Sku', want: { type: 'string', pattern: { accepts: ['00104411', '99999999'], rejects: ['0010441', '001044110', '0010441A', 'S00104411'] } } },
    },
    {
      label: 'Price has a Sku, a storeId and an amount of at least 0',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Price', prop: 'sku', want: { type: 'Sku', required: true } },
          { type: 'prop', typeName: 'Price', prop: 'storeId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Price', prop: 'amount', want: { type: 'number', required: true, minimum: 0 } },
        ],
      },
    },
    {
      label: 'PriceBatch has a Price list items and a Sku list notFound',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'PriceBatch', prop: 'items', want: { type: 'Price[]', required: true } },
          { type: 'prop', typeName: 'PriceBatch', prop: 'notFound', want: { type: 'Sku[]', required: true } },
        ],
      },
    },
    {
      label: 'Error has a required string message',
      rule: { type: 'prop', typeName: 'Error', prop: 'message', want: { type: 'string', required: true } },
    },
    {
      label: 'The sku query parameter is a required list of Sku with 1 to 50 items',
      rule: { type: 'param', path: '/stores/{}/prices', method: 'get', in: 'query', name: 'sku', want: { type: 'Sku[]', required: true, minItems: 1, maxItems: 50 } },
    },
    {
      label: 'GET /stores/{storeId}/prices returns a PriceBatch with 200 and an Error with 400',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/stores/{}/prices', method: 'get', status: '200', typeIs: 'PriceBatch' },
          { type: 'response', path: '/stores/{}/prices', method: 'get', status: '400', typeIs: 'Error' },
        ],
      },
    },
    {
      label: 'GET /stores/{storeId}/prices/{sku} returns a Price with 200 and an Error with 404',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/stores/{}/prices/{}', method: 'get', status: '200', typeIs: 'Price' },
          { type: 'response', path: '/stores/{}/prices/{}', method: 'get', status: '404', typeIs: 'Error' },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Store Prices API
version: v1
baseUri: https://api.example.com/store-prices/{version}
mediaType: application/json

types:
  Sku:
    type: string
    pattern: ^[0-9]{8}$
    example: '00104411'
  Price:
    type: object
    properties:
      sku: Sku
      storeId: string
      amount:
        type: number
        minimum: 0
    example:
      sku: '00104411'
      storeId: ST-0412
      amount: 1.85
  PriceBatch:
    type: object
    properties:
      items: Price[]
      notFound: Sku[]
    example:
      items:
        - sku: '00104411'
          storeId: ST-0412
          amount: 1.85
        - sku: '00203318'
          storeId: ST-0412
          amount: 3.2
      notFound: [ '00999001' ]
  Error:
    type: object
    properties:
      message: string

/stores/{storeId}/prices:
  get:
    description: Prices for up to 50 SKUs in one call. SKUs that do not exist are listed in notFound, and the call still answers 200.
    queryParameters:
      sku:
        type: Sku[]
        minItems: 1
        maxItems: 50
        description: Repeat the parameter for each SKU.
    responses:
      200:
        body:
          type: PriceBatch
      400:
        description: No SKU, more than 50, or a SKU that is not 8 digits.
        body:
          type: Error
  /{sku}:
    get:
      responses:
        200:
          body:
            type: Price
        404:
          body:
            type: Error
`,
  keyPoints: [
    'A batch read turns many small calls into one, which helps on slow mobile networks.',
    'A named scalar type such as Sku keeps one pattern for the property, the list and the query parameter.',
    'An array query parameter is sent by repeating the name.',
    'maxItems caps the batch, which keeps the URL short and the backend query bounded.',
    'Missing items go in notFound, so one withdrawn SKU does not fail the whole call.',
    'GET keeps the call safe to retry and lets it be cached.',
  ],
  solution: `
**One call instead of 50.** Each request costs a round trip, and on a phone that is the slow part. A batch read sends one request and gets one answer. It also counts once against the rate limit.

**Why GET and not POST.** The call reads and changes nothing. GET says that, and lets caches and retries work as normal. With 50 eight digit SKUs the query string is under 1,000 characters, well inside common URL limits. That is one reason for the cap of 50.

**A named scalar type.** \`Sku\` holds the pattern once. \`Price.sku\`, \`notFound\` and the query parameter all use it, so a change to the SKU format happens in one place.

**Partial results.** A withdrawn SKU is normal for a shopping list written last week. Answering 404 for the whole call would hide 49 good prices. The batch answers 200 with what it found and lists the rest in \`notFound\`, and the app greys those items out. 400 is kept for requests that are wrong in themselves: no SKU, too many, or a badly formed one.

**The single read stays.** Other callers still use \`GET /prices/{sku}\`, where 404 is the right answer for one missing item.
`,
  followUps: [
    {
      q: 'The app sends the same SKU twice. What should happen?',
      a: 'Treat the list as a set and return the price once. Say so in the description, so the app does not expect one item per position.',
    },
    {
      q: 'How does the Mule app fetch 50 prices efficiently?',
      a: 'With one database query using an IN list or a join on the SKUs, not 50 separate queries. Then compare the results with the request to build the notFound list.',
    },
    {
      q: 'When would you move to POST for a batch read?',
      a: 'When the list can grow past what fits safely in a URL, or when the ids are sensitive and must stay out of logs. Then document that the POST changes nothing.',
    },
  ],
}
