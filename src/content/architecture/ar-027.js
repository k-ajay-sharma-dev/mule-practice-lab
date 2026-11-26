export default {
  id: 'ar-027',
  category: 'architecture',
  title: 'REST API Design: Resources, Pagination and Errors',
  level: 'BEGINNER',
  tags: ['api-design', 'rest', 'pagination', 'error-model', 'raml-oas'],
  estMinutes: 20,
  quiz: [
    {
      type: 'match',
      prompt: 'Match each draft operation to its corrected REST form.',
      pairs: [
        ['POST /getOrders with customerId in the body', 'GET /customers/{customerId}/orders'],
        ['GET /orders/deleteOrder?id=55', 'DELETE /orders/55'],
        ['POST /orders/update (partial)', 'PATCH /orders/{orderId}'],
        ['Create a new order', 'POST /orders → 201 Created + Location'],
      ],
      explain: 'Resources are plural nouns; the HTTP method carries the action. Verbs in the path are RPC style over HTTP.',
    },
    {
      type: 'single',
      prompt: 'Why is `GET /orders/deleteOrder?id=55` dangerous, and not only badly named?',
      options: [
        'GET requests cannot carry query parameters such as id',
        'Software that treats GET as safe may call it with no user action',
        'Browsers block GET requests that change data on the server',
        'APIkit cannot route a GET to a flow that deletes data',
      ],
      answer: 1,
      explain: 'GET must be safe, with no side effects. Crawlers, link prefetchers and retrying proxies call GET freely and may trigger the delete. Query parameters on a GET are normal. The method semantics are a contract with every intermediary, not only with your clients. Browsers and APIkit do not stop such a GET, which is why it is dangerous.',
    },
    {
      type: 'single',
      prompt: 'How do you model "cancel an order", which is more than simple CRUD?',
      options: [
        'An action endpoint such as POST /cancelOrder?id=55',
        'An action link such as GET /orders/{orderId}/cancel',
        'A sub-resource such as POST /orders/{orderId}/cancellation',
        'A full update such as PUT /orders/55 with action=cancel',
      ],
      answer: 2,
      explain: 'Modelling the business action as a resource keeps verbs out of the path while staying explicit.',
    },
    {
      type: 'single',
      prompt: 'A REST API exposes an orders collection with millions of rows. How should the API stop one call from returning all of them?',
      options: [
        'Stream the rows from a database cursor, so memory stays flat for any result size',
        'Rate limit the endpoint per client, so no client can call it too often',
        'Apply a default page size and enforce a maximum page size',
        'Add a `total` count to the paging metadata in the response',
      ],
      answer: 2,
      explain: 'An unbounded collection is a memory, timeout and security problem, so the API sets a default `limit` (for example 20) and enforces a maximum (for example 100). Streaming keeps Mule memory flat, but the call still runs for minutes and sends millions of rows to the client. A rate limit counts calls, and one call is enough here. A `total` count describes the result; it does not bound it. The rest of the design builds on this. Offset/limit is fine for simple cases, and cursors stay consistent on deep pages of large or fast-changing data. Filters and sort are query parameters with an allow-list of fields. Paging metadata can omit `total` when counting is expensive.',
    },
    {
      type: 'match',
      prompt: 'Match each situation to the HTTP status code.',
      pairs: [
        ['Malformed request body', '400'],
        ['No or invalid credentials', '401'],
        ['Order already shipped, cannot be changed', '409'],
        ['Client exceeded its rate limit', '429'],
        ['Backend system unavailable', '503'],
      ],
      explain: 'Correct status codes let clients, gateways and monitoring react properly; the error body adds a code, message and correlation ID.',
    },
    {
      type: 'single',
      prompt: 'The team lead asks whether HATEOAS is mandatory. What is a pragmatic position?',
      options: [
        'Yes: without full hypermedia it is not REST and must not be published',
        'Add self, next and prev links for paging, and keep the spec as the real contract',
        'Add no links at all, because clients code against the spec',
        'Use HATEOAS links in place of a published spec',
      ],
      answer: 1,
      explain: 'Mobile and web teams code against the spec in Exchange, so full HATEOAS need not be mandated. Cheap pagination links still add value; full hypermedia rarely does for known clients.',
    },
  ],
  description: `
A retailer asks you to review a draft spec for a new **Customer Orders** Experience API before it is published to Exchange. The draft looks like this:

| Draft operation | Notes from the draft |
|---|---|
| \`POST /getOrders\` | Body: \`{ "customerId": "C1", "page": 1 }\` |
| \`GET /orders/deleteOrder?id=55\` | Deletes an order |
| \`GET /customerOrdersList\` | Returns **all** orders of all customers (~2 million) |
| \`POST /orders/update\` | Full or partial update, body decides |
| Errors | Always HTTP 200 with \`{ "success": false, "msg": "..." }\` |

Constraints:
- Mobile and web teams will consume it; a partner may consume it later.
- The spec will be designed in Design Center (RAML or OAS) and implemented with APIkit.
- The team lead asks whether "HATEOAS links are mandatory for REST".

**Questions:**
- What is wrong with the resource naming and HTTP method usage? Propose corrected operations.
- How do you design pagination, filtering and sorting for the orders collection?
- Propose a standard error model and the HTTP status codes to use.
- What is your opinion on HATEOAS for this API?
`,
  answerTemplate: `## Problems in the draft

## Corrected resource model

## Pagination, filtering, sorting

## Error model and status codes

## HATEOAS opinion
`,
  keyPoints: [
    'Resources are plural nouns (/orders, /customers/{customerId}/orders); the HTTP method expresses the action, so verbs like getOrders or deleteOrder do not belong in the path.',
    'GET is safe and must never change state; DELETE, PUT (full replace) and PATCH (partial update) are used for their real semantics.',
    'Collections are always paginated with a default and maximum page size, using offset/limit for simple cases or cursor-based paging for large or fast-changing data.',
    'Filtering and sorting use query parameters with an allow-list of fields (e.g. status, fromDate, sort=-createdAt).',
    'Errors use correct HTTP status codes (400, 401, 403, 404, 409, 422, 429, 5xx) plus one consistent error body with a code, message, correlation ID and optional field details.',
    'HATEOAS is optional in practice: simple next/prev pagination links add value, full hypermedia rarely does for known clients.',
  ],
  solution: `
**Problems in the draft.**
- Verbs in paths (\`getOrders\`, \`deleteOrder\`, \`update\`): RPC style over HTTP. The method already says the action.
- \`GET\` used to delete: unsafe. Crawlers, prefetchers and caches assume GET has no side effects.
- \`POST\` used for reads: loses cacheability and makes the API harder to understand.
- Unbounded collection of 2 million rows: memory, timeout and security problems (one client can read every customer's orders).
- Always-200 errors: clients, gateways, monitoring and retries cannot tell success from failure.

**Corrected resource model.**

| Operation | Purpose |
|---|---|
| \`GET /customers/{customerId}/orders\` | List one customer's orders (paginated) |
| \`GET /orders/{orderId}\` | One order |
| \`POST /orders\` | Create → \`201 Created\` + \`Location\` header |
| \`PATCH /orders/{orderId}\` | Partial update (e.g. delivery address) |
| \`PUT /orders/{orderId}\` | Full replace (only if really needed) |
| \`DELETE /orders/{orderId}\` | Cancel/delete → \`204 No Content\` |

Business actions that are not simple CRUD can be modelled as sub-resources, e.g. \`POST /orders/{orderId}/cancellation\`, instead of verbs in the path.

**Pagination, filtering, sorting.**
- \`GET /customers/C1/orders?status=SHIPPED&fromDate=2026-01-01&sort=-createdAt&limit=50&offset=0\`
- Default \`limit\` (e.g. 20) and a **maximum** (e.g. 100) enforced by the API.
- Offset/limit is simple but slow and inconsistent on deep pages of changing data; for large exports or feeds use **cursor-based** paging (\`?cursor=opaqueToken\`) returning \`nextCursor\`.
- Return paging metadata: \`{ "data": [...], "page": { "limit": 50, "offset": 0, "total": 312 } }\`, or omit \`total\` when counting is expensive.
- Define these as reusable **traits/components** in the spec so every API in the organisation pages the same way.

**Error model and status codes.**
\`\`\`json
{
  "code": "ORDER_NOT_FOUND",
  "message": "Order 55 does not exist",
  "correlationId": "7f2c...",
  "details": [ { "field": "orderId", "issue": "unknown" } ]
}
\`\`\`
- 400 malformed request / validation (APIkit returns \`APIKIT:BAD_REQUEST\` which you map to this body), 401 no/invalid credentials, 403 not allowed, 404 not found, 409 conflict (e.g. order already shipped), 422 business rule violation (if your standard distinguishes it from 400), 429 rate limited, 500 unexpected, 502/503/504 downstream problems.
- Never leak stack traces or backend messages; log them with the correlation ID instead.

**HATEOAS.** Full hypermedia-driven clients are rare; the mobile and web teams code against the spec. A pragmatic position: include \`self\`/\`next\`/\`prev\` links for pagination (cheap, useful), do not mandate full HATEOAS. Be ready to say this is an opinion and that the spec plus Exchange documentation is the real contract.
`,
  followUps: [
    { q: 'Should the customer ID come from the path or from the token?', a: 'For a customer-facing Experience API, derive it from the authenticated token (or verify the path value matches it) so a user cannot read another customer\'s orders by changing the URL. Path parameters are fine for internal/system APIs with proper authorization.' },
    { q: 'When would you use POST for a search?', a: 'When the search criteria are too large or too sensitive for a URL (query strings end up in logs). Model it explicitly, e.g. POST /orders/search, and document that it does not change state.' },
    { q: 'How do you keep 30 teams consistent on these rules?', a: 'Publish shared RAML fragments/OAS components (error type, paging traits) in Exchange and enforce them with API governance rulesets during design review and CI.' },
  ],
}
