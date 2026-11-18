export default {
  id: 'rm-139',
  category: 'api-design',
  title: 'Product Changes Feed API: Delta Sync with a Change Token, Deletes and 410 for an Old Token',
  level: 'ADVANCED',
  tags: ['raml', 'api-design', 'delta-sync', 'change-feed', 'tombstones', 'paging', 'status-codes', 'headers', 'wholesale'],
  estMinutes: 30,
  description: `
Thornbury Wholesale has 180,000 products. Four Mule integrations copy them into other systems: the web shop, the warehouse, a marketplace and a pricing tool. Each one downloads the full catalogue every hour, which takes 20 minutes and loads the product database all day.

The new contract adds a **changes feed**, so each integration fetches only what changed since its last run:

- A full load with \`GET /products\` returns every product and a response header \`X-Changes-Token\`. That token marks the point in time of the load.
- \`GET /product-changes?since=<token>\` returns the changes after that point, oldest first, and a \`nextToken\` for the next call. \`hasMore\` says whether another page is waiting.
- A deleted product appears as a change with operation \`DELETE\` and no product data. Without it, the other systems would keep selling a product that is gone.
- Changes are kept for 7 days. A token older than that answers \`410 Gone\`, and the integration must do a full load again.

**Requirements**
- Title \`Product Changes Feed API\`, with JSON as the default media type.
- A type \`Product\` with a required \`sku\` (\`TW-\` and six digits), a required string \`name\` and a required number \`price\` of at least 0.
- A type \`Change\` with:
  - \`sku\`: a required string.
  - \`operation\`: required, one of \`UPSERT\`, \`DELETE\`.
  - \`changedAt\`: a required date and time with an offset.
  - \`product\`: an optional \`Product\`, left out for deletes.
- A type \`ChangesPage\` with a required \`changes\` list of \`Change\`, a required string \`nextToken\` and a required boolean \`hasMore\`.
- A type \`Problem\` with a required string \`message\`.
- \`GET /products\` returns \`Product[]\` with 200 and a \`X-Changes-Token\` response header.
- \`GET /product-changes\` has a required string query parameter \`since\` and an optional integer \`limit\` from 1 to 500, default 100.
- It returns a \`ChangesPage\` with 200, a \`Problem\` with 400, and a \`Problem\` with 410.
`,
  starter: `#%RAML 1.0
title: Product Changes Feed API
mediaType: application/json

types:
  Product:
    type: object
    properties:
      sku: string
      name: string
      price: number

/products:
  get:
    queryParameters:
      updatedAfter?: datetime
    responses:
      200:
        body:
          type: Product[]
`,
  ramlChecks: [
    {
      label: 'The title is Product Changes Feed API and JSON is the default',
      rule: { type: 'all', rules: [{ type: 'root', key: 'title', want: 'Product Changes Feed API' }, { type: 'root', key: 'mediaType', want: 'application/json' }] },
    },
    {
      label: 'Product has a sku of TW- and six digits, a name and a price of at least 0',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Product', prop: 'sku', want: { required: true, pattern: { accepts: ['TW-104233', 'TW-000001'], rejects: ['TW-10423', 'tw-104233', 'TW-1042330', 'TW104233', 'XTW-104233'] } } },
          { type: 'prop', typeName: 'Product', prop: 'name', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Product', prop: 'price', want: { type: 'number', required: true, minimum: 0 } },
        ],
      },
    },
    {
      label: 'Change has a sku, an operation of UPSERT or DELETE, a datetime changedAt and an optional Product',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Change', prop: 'sku', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Change', prop: 'operation', want: { required: true, enum: { exactly: ['UPSERT', 'DELETE'] } } },
          { type: 'prop', typeName: 'Change', prop: 'changedAt', want: { type: 'datetime', required: true } },
          { type: 'prop', typeName: 'Change', prop: 'product', want: { type: 'Product', required: false } },
        ],
      },
    },
    {
      label: 'ChangesPage has a Change list, a nextToken and a boolean hasMore',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'ChangesPage', prop: 'changes', want: { type: 'Change[]', required: true } },
          { type: 'prop', typeName: 'ChangesPage', prop: 'nextToken', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'ChangesPage', prop: 'hasMore', want: { type: 'boolean', required: true } },
        ],
      },
    },
    {
      label: 'GET /products returns Product[] with an X-Changes-Token header',
      rule: { type: 'response', path: '/products', method: 'get', status: '200', typeIs: 'Product[]', header: 'X-Changes-Token' },
    },
    {
      label: 'GET /product-changes needs a since token and takes a limit from 1 to 500, default 100',
      rule: {
        type: 'all',
        rules: [
          { type: 'param', path: '/product-changes', method: 'get', in: 'query', name: 'since', want: { type: 'string', required: true } },
          { type: 'param', path: '/product-changes', method: 'get', in: 'query', name: 'limit', want: { type: 'integer', required: false, minimum: 1, maximum: 500, default: 100 } },
        ],
      },
    },
    {
      label: 'GET /product-changes returns a ChangesPage with 200 and a Problem with 400',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/product-changes', method: 'get', status: '200', typeIs: 'ChangesPage' },
          { type: 'response', path: '/product-changes', method: 'get', status: '400', typeIs: 'Problem' },
        ],
      },
    },
    {
      label: 'An expired token answers 410 with a Problem',
      rule: { type: 'response', path: '/product-changes', method: 'get', status: '410', typeIs: 'Problem' },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Product Changes Feed API
version: v1
baseUri: https://api.example.com/catalogue/{version}
mediaType: application/json

types:
  Product:
    type: object
    properties:
      sku:
        type: string
        pattern: ^TW-[0-9]{6}$
      name: string
      price:
        type: number
        minimum: 0
  Change:
    type: object
    properties:
      sku: string
      operation:
        type: string
        enum: [ UPSERT, DELETE ]
      changedAt: datetime
      product?:
        type: Product
        description: The product as it is now. Left out when operation is DELETE.
  ChangesPage:
    type: object
    properties:
      changes: Change[]
      nextToken:
        type: string
        description: Send this as since on the next call, even when changes is empty.
      hasMore:
        type: boolean
        description: True when another page is ready now.
    example:
      changes:
        - sku: TW-104233
          operation: UPSERT
          changedAt: 2026-11-18T09:14:02Z
          product:
            sku: TW-104233
            name: Catering foil, 450 mm
            price: 18.4
        - sku: TW-088120
          operation: DELETE
          changedAt: 2026-11-18T09:20:45Z
      nextToken: c2VxPTg4MTI0MDE
      hasMore: false
  Problem:
    type: object
    properties:
      message: string

/products:
  get:
    description: The full catalogue. Use it for the first load and after a 410 from the changes feed.
    responses:
      200:
        headers:
          X-Changes-Token:
            type: string
            description: Start the changes feed from this token after the load.
            example: c2VxPTg4MTAwMDA
        body:
          type: Product[]

/product-changes:
  get:
    description: Changes after the since token, oldest first.
    queryParameters:
      since:
        type: string
        description: A token from X-Changes-Token or from nextToken. Clients must not build or change it.
      limit:
        type: integer
        minimum: 1
        maximum: 500
        default: 100
        required: false
    responses:
      200:
        body:
          type: ChangesPage
      400:
        description: The token is not one this API gave out.
        body:
          type: Problem
      410:
        description: The token is older than the 7 days of kept changes. Do a full load with GET /products.
        body:
          type: Problem
`,
  keyPoints: [
    'A changes feed lets each consumer fetch only what changed since its last run.',
    'A full load returns a token that marks where the feed should start.',
    'Deletes must appear in the feed as their own change, or other systems keep stale data.',
    'An opaque token from the server is safer than a timestamp chosen by the client.',
    'Return changes oldest first, with a next token and a hasMore flag.',
    '410 Gone says the token is too old, and the client must do a full load again.',
  ],
  solution: `
**Why a feed.** Four integrations reading 180,000 products every hour is about 720,000 rows an hour, for maybe a few hundred real changes. A feed sends only those changes, so each run takes seconds.

**Start with a full load.** \`GET /products\` returns everything and an \`X-Changes-Token\` header. The integration stores that token. Changes made during the load are still in the feed after the token, so nothing is missed.

**Read the feed.** Each call sends \`since\` and gets changes oldest first, plus \`nextToken\`. The integration applies the changes in order and then saves \`nextToken\`. When \`hasMore\` is true, it calls again at once.

**Deletes.** A change with \`operation: DELETE\` and no \`product\` tells every consumer to remove the item. A feed that only listed changed products, like the old \`updatedAfter\` filter, could never show that a product was removed.

**Token, not timestamp.** With \`updatedAfter\`, clocks and changes that commit late can make a client skip a row. An opaque token, such as a sequence number the server encodes, marks an exact position. The client stores it and sends it back without reading it.

**410 Gone.** Changes are kept for 7 days. An integration that was off for two weeks sends a token whose changes are gone. \`410\` tells it to do a full load and start again, instead of quietly missing changes.

| Status | Meaning | Client action |
|---|---|---|
| 200 | Changes after the token | Apply them, save nextToken |
| 400 | Not a token from this API | Fix the client |
| 410 | Token too old | Full load, then use the new token |
`,
  followUps: [
    {
      q: 'The warehouse integration crashes after applying half a page. What happens on the next run?',
      a: 'It still has the previous token, so it reads the same page again and applies some changes twice. That is fine if each change sets the full current state, as an upsert or delete does. Save the new token only after the whole page is applied.',
    },
    {
      q: 'A product changes five times in an hour. Does the feed send five changes?',
      a: 'It may. Some feeds keep only the latest change per item before a page is built. Either way, each change carries the full product, so applying them in order ends in the right state.',
    },
    {
      q: 'Could this be a webhook instead?',
      a: 'Webhooks push changes at once, but a consumer that is down misses them unless the sender retries. Many designs use both: a webhook as a nudge to call the feed, and the feed as the reliable record.',
    },
  ],
}
