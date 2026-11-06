export default {
  id: 'rm-050',
  category: 'api-design',
  title: 'Store Prices API: A Bulk Endpoint with 207 and Per-Item Results',
  level: 'ADVANCED',
  tags: ['raml', 'api-design', 'bulk', 'status-codes', 'retail'],
  estMinutes: 30,
  description: `
Every night a retailer sends up to 500 price changes from its pricing tool. Making 500 calls is slow, so the team wants one bulk call. The hard question is what to answer when 498 changes work and 2 fail.

A 200 would hide the 2 failures. A 400 would suggest that nothing worked. **207 Multi-Status** is the HTTP status for this case: the call was handled, and the body gives a separate result for each item. A caller must read that body to know what happened.

A 400 still has a place. It means the batch as a whole was refused, so nothing was applied.

**Requirements**
- Title \`Store Prices API\`, with JSON as the default media type.
- A type \`PriceChange\` with a required string \`sku\` and a required number \`price\` of at least 0.
- A type \`PriceBatch\` with a required \`changes\`, a list of \`PriceChange\` with at least 1 item and at most 500.
- A type \`ItemResult\` with a required string \`sku\`, a required \`outcome\` that is one of \`UPDATED\`, \`REJECTED\`, and an optional string \`errorCode\`. A change that worked has no \`errorCode\`.
- A type \`BulkResult\` with a required integer \`succeeded\`, a required integer \`failed\`, and a required \`results\`, a list of \`ItemResult\`.
- A type \`Error\` with a required string \`code\` and a required string \`message\`.
- \`POST /prices/bulk\` takes a \`PriceBatch\`.
- It returns 207 with a \`BulkResult\`. The response body has its own example, with one \`UPDATED\` item and one \`REJECTED\` item.
- It returns 400 with an \`Error\` when the batch itself is refused.
`,
  starter: `#%RAML 1.0
title: Store Prices API
mediaType: application/json

types:

/prices:
  /bulk:
`,
  ramlChecks: [
    {
      label: 'PriceChange has a required sku, and a price of at least 0',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'PriceChange', prop: 'sku', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'PriceChange', prop: 'price', want: { type: 'number', required: true, minimum: 0 } },
        ],
      },
    },
    { label: 'PriceBatch.changes holds 1 to 500 PriceChange items', rule: { type: 'prop', typeName: 'PriceBatch', prop: 'changes', want: { type: 'PriceChange[]', required: true, minItems: 1, maxItems: 500 } } },
    { label: 'ItemResult has a required sku', rule: { type: 'prop', typeName: 'ItemResult', prop: 'sku', want: { type: 'string', required: true } } },
    { label: 'outcome only allows UPDATED and REJECTED', rule: { type: 'prop', typeName: 'ItemResult', prop: 'outcome', want: { required: true, enum: { exactly: ['UPDATED', 'REJECTED'] } } } },
    { label: 'errorCode is optional', rule: { type: 'prop', typeName: 'ItemResult', prop: 'errorCode', want: { type: 'string', required: false } } },
    {
      label: 'BulkResult has the two counts and a list of ItemResult',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'BulkResult', prop: 'succeeded', want: { type: 'integer', required: true } },
          { type: 'prop', typeName: 'BulkResult', prop: 'failed', want: { type: 'integer', required: true } },
          { type: 'prop', typeName: 'BulkResult', prop: 'results', want: { type: 'ItemResult[]', required: true } },
        ],
      },
    },
    {
      label: 'Error has a required code and message',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Error', prop: 'code', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Error', prop: 'message', want: { type: 'string', required: true } },
        ],
      },
    },
    { label: 'POST /prices/bulk takes a PriceBatch', rule: { type: 'body', path: '/prices/bulk', method: 'post', typeIs: 'PriceBatch' } },
    { label: 'It returns 207 with a BulkResult', rule: { type: 'response', path: '/prices/bulk', method: 'post', status: '207', typeIs: 'BulkResult' } },
    { label: 'The 207 body has its own example', rule: { type: 'response', path: '/prices/bulk', method: 'post', status: '207', example: 'own' } },
    { label: 'It returns 400 with an Error when the batch is refused', rule: { type: 'response', path: '/prices/bulk', method: 'post', status: '400', typeIs: 'Error' } },
  ],
  referenceRaml: `#%RAML 1.0
title: Store Prices API
mediaType: application/json

types:
  PriceChange:
    type: object
    properties:
      sku: string
      price:
        type: number
        minimum: 0
  PriceBatch:
    type: object
    properties:
      changes:
        type: PriceChange[]
        minItems: 1
        maxItems: 500
  ItemResult:
    type: object
    properties:
      sku: string
      outcome:
        type: string
        enum: [ UPDATED, REJECTED ]
      errorCode?: string
  BulkResult:
    type: object
    properties:
      succeeded: integer
      failed: integer
      results: ItemResult[]
  Error:
    type: object
    properties:
      code: string
      message: string

/prices:
  /bulk:
    post:
      body:
        type: PriceBatch
      responses:
        207:
          body:
            type: BulkResult
            example:
              succeeded: 1
              failed: 1
              results:
                - sku: TS-1001
                  outcome: UPDATED
                - sku: TS-1002
                  outcome: REJECTED
                  errorCode: UNKNOWN_SKU
        400:
          body:
            type: Error
`,
  keyPoints: [
    '207 Multi-Status means each item has its own result, and the caller must read the body.',
    'A 400 on a bulk call means the whole batch was refused and nothing was applied.',
    'A limit such as maxItems: 500 keeps one call from running for too long.',
    'An error field that only failed items carry must be optional.',
  ],
  solution: `
\`PriceBatch\` wraps the list in an object. The limits on \`changes\` now live in a named type, and the body can gain new fields later without breaking callers.

\`ItemResult\` carries \`sku\`, so a caller can match each result to what it sent. \`errorCode\` is optional, since a change that worked has none.

The two counts let a caller decide at a glance whether it needs to walk the list. The example shows both outcomes, so a mock server teaches consumers that partial failure is normal.
`,
  followUps: [
    {
      q: 'What should a caller do with the items that failed?',
      a: 'Read each REJECTED result and act on its errorCode. Fix or drop those items, then resend only them, because the items that worked are already applied.',
    },
    {
      q: 'Why not process the batch in one transaction, so it is all or nothing?',
      a: 'One bad SKU would then block 499 good prices. All or nothing suits changes that depend on each other, and these prices do not.',
    },
    {
      q: 'When should a large batch return 202 instead of 207?',
      a: 'Return 202 when the work takes too long to finish inside one request. The caller then polls a status resource, and that resource holds the per-item results.',
    },
  ],
}
