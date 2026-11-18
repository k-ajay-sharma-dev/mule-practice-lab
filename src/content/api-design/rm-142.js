export default {
  id: 'rm-142',
  category: 'api-design',
  title: 'Office Orders API: The Total Count in an X-Total-Count Header',
  level: 'BEGINNER',
  tags: ['raml', 'api-design', 'paging', 'headers', 'response-headers', 'query-parameters', 'wholesale'],
  estMinutes: 15,
  description: `
Pennine Office Supplies has a portal where business customers see their past orders, 20 per page. The portal team wants to show "Page 2 of 12", but the API only returns the orders on the current page. Today the portal asks for every order once to count them, which is slow for large customers.

The team agrees to keep the body a plain list, so existing callers do not break, and to send the total in a **response header**.

**Requirements**
- Title \`Office Orders API\`, with JSON as the default media type.
- A type \`OrderSummary\` with:
  - \`orderId\`: required, \`PO-\` and six digits, such as \`PO-104233\`
  - \`placedOn\`: a required \`date-only\`
  - \`total\`: a required number of at least 0
- A type \`Error\` with a required string \`message\`.
- \`GET /orders\` has two optional query parameters:
  - \`offset\`: an integer of at least 0, default 0
  - \`limit\`: an integer from 1 to 100, default 20
- It returns a list of \`OrderSummary\` with 200 and a response header \`X-Total-Count\`, an integer of at least 0 that counts every matching order, not only this page.
- It returns an \`Error\` with 400 when \`offset\` or \`limit\` is out of range.
`,
  starter: `#%RAML 1.0
title: Office Orders API
mediaType: application/json

types:
  OrderSummary:
    type: object
    properties:
      orderId: string
      placedOn: string
      total: number

/orders:
  get:
    queryParameters:
      page: integer
    responses:
      200:
        body:
          type: OrderSummary[]
`,
  ramlChecks: [
    {
      label: 'The title is Office Orders API and JSON is the default',
      rule: { type: 'all', rules: [{ type: 'root', key: 'title', want: 'Office Orders API' }, { type: 'root', key: 'mediaType', want: 'application/json' }] },
    },
    {
      label: 'OrderSummary has an orderId of PO- and six digits, a placedOn date and a total of at least 0',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'OrderSummary', prop: 'orderId', want: { required: true, pattern: { accepts: ['PO-104233', 'PO-000001'], rejects: ['PO-10423', 'po-104233', 'PO-1042330', 'PO104233', 'XPO-104233'] } } },
          { type: 'prop', typeName: 'OrderSummary', prop: 'placedOn', want: { type: 'date-only', required: true } },
          { type: 'prop', typeName: 'OrderSummary', prop: 'total', want: { type: 'number', required: true, minimum: 0 } },
        ],
      },
    },
    {
      label: 'Error has a required string message',
      rule: { type: 'prop', typeName: 'Error', prop: 'message', want: { type: 'string', required: true } },
    },
    {
      label: 'offset is an optional integer of at least 0 with default 0',
      rule: { type: 'param', path: '/orders', method: 'get', in: 'query', name: 'offset', want: { type: 'integer', required: false, minimum: 0, default: 0 } },
    },
    {
      label: 'limit is an optional integer from 1 to 100 with default 20',
      rule: { type: 'param', path: '/orders', method: 'get', in: 'query', name: 'limit', want: { type: 'integer', required: false, minimum: 1, maximum: 100, default: 20 } },
    },
    {
      label: 'GET /orders returns an OrderSummary list with 200 and an X-Total-Count header',
      rule: { type: 'response', path: '/orders', method: 'get', status: '200', typeIs: 'OrderSummary[]', header: 'X-Total-Count' },
    },
    {
      label: 'GET /orders returns an Error with 400',
      rule: { type: 'response', path: '/orders', method: 'get', status: '400', typeIs: 'Error' },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Office Orders API
version: v1
baseUri: https://api.example.com/office-orders/{version}
mediaType: application/json

types:
  OrderSummary:
    type: object
    properties:
      orderId:
        type: string
        pattern: ^PO-[0-9]{6}$
      placedOn: date-only
      total:
        type: number
        minimum: 0
    example:
      orderId: PO-104233
      placedOn: 2026-11-02
      total: 418.6
  Error:
    type: object
    properties:
      message: string

/orders:
  get:
    description: The customer's orders, newest first, one page at a time.
    queryParameters:
      offset:
        type: integer
        minimum: 0
        default: 0
        required: false
      limit:
        type: integer
        minimum: 1
        maximum: 100
        default: 20
        required: false
    responses:
      200:
        headers:
          X-Total-Count:
            type: integer
            minimum: 0
            description: Every order that matches, not only the ones on this page.
            example: 236
        body:
          type: OrderSummary[]
      400:
        description: offset or limit is out of range.
        body:
          type: Error
`,
  keyPoints: [
    'A response header can carry the total without changing the shape of the body.',
    'X-Total-Count counts every match, so the client can work out the number of pages.',
    'offset and limit with defaults make the first call work with no parameters.',
    'A maximum on limit stops one call from asking for every order at once.',
    'Out of range values answer 400 before any query runs.',
  ],
  solution: `
**Why a header.** The portal already reads the body as a list. Wrapping it in an object such as \`{ items, total }\` would break every existing caller. A header adds the total and leaves the body as it was. The name \`X-Total-Count\` is a common convention, not a standard, so the description says what it counts.

**What it counts.** It is the number of orders that match the request, before paging. With 236 orders and a limit of 20, the portal shows 12 pages. Without the header, the portal had to load every order to count them.

**offset and limit.** Both are optional with defaults, so \`GET /orders\` alone returns the first 20. The maximum of 100 protects the database. A value outside the range fails with 400, which the contract lists.

**Cost of counting.** A count over a large table is not free. The System API behind this may need an index on the customer and date, or a cached count, so check the cost before you promise it.
`,
  followUps: [
    {
      q: 'Can a browser app read X-Total-Count when it calls the API from another domain?',
      a: 'Only if the CORS response lists it in Access-Control-Expose-Headers. Browsers hide most response headers from scripts by default.',
    },
    {
      q: 'When would you put the total in the body instead?',
      a: 'In a new API, a wrapper object with items and total is often clearer and survives proxies that drop headers. Here the header was chosen so existing callers keep working.',
    },
    {
      q: 'New orders arrive while a user moves from page 1 to page 2. What can go wrong?',
      a: 'With offset paging, an order can appear twice or be skipped as the list shifts. Cursor paging, which continues after the last item seen, avoids that.',
    },
  ],
}
