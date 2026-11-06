export default {
  id: 'rm-010',
  category: 'api-design',
  title: 'Energy Customers API: Nested Resources',
  level: 'BEGINNER',
  tags: ['raml', 'api-design', 'resources', 'nested-resources', 'energy'],
  estMinutes: 12,
  description: `
An energy supplier keeps supply addresses for each customer. An address has no meaning on its own: it always belongs to one customer.

A **nested resource** is written inside its parent, and its path adds to the parent path. Nesting shows who owns what. \`/customers/{customerId}/addresses\` says these are the addresses of one customer.

**Requirements**
- \`GET /customers/{customerId}\` returns 200, or 404.
- \`GET /customers/{customerId}/addresses\` returns \`Address[]\` with status 200.
- \`POST /customers/{customerId}/addresses\` takes an \`Address\` body and returns 201.
- \`GET /customers/{customerId}/addresses/{addressId}\` returns an \`Address\` with status 200, or 404.
- Addresses are only reached through their customer, so there is no top-level \`/addresses\` resource.

The \`Address\` type is in the starter.
`,
  starter: `#%RAML 1.0
title: Energy Customers API
mediaType: application/json

types:
  Address:
    type: object
    properties:
      line1: string
      city: string
      postcode: string

/customers:
`,
  ramlChecks: [
    {
      label: 'GET /customers/{customerId} returns 200, or 404',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/customers/{}', method: 'get', status: '200' },
          { type: 'response', path: '/customers/{}', method: 'get', status: '404' },
        ],
      },
    },
    { label: 'GET /customers/{customerId}/addresses returns Address[]', rule: { type: 'response', path: '/customers/{}/addresses', method: 'get', status: '200', typeIs: 'Address[]' } },
    {
      label: 'POST /customers/{customerId}/addresses takes an Address and returns 201',
      rule: {
        type: 'all',
        rules: [
          { type: 'body', path: '/customers/{}/addresses', method: 'post', typeIs: 'Address' },
          { type: 'response', path: '/customers/{}/addresses', method: 'post', status: '201' },
        ],
      },
    },
    {
      label: 'GET /customers/{customerId}/addresses/{addressId} returns an Address, or 404',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/customers/{}/addresses/{}', method: 'get', status: '200', typeIs: 'Address' },
          { type: 'response', path: '/customers/{}/addresses/{}', method: 'get', status: '404' },
        ],
      },
    },
    {
      label: 'Addresses live under their customer, with no top-level /addresses',
      rule: {
        type: 'all',
        rules: [
          { type: 'resource', path: '/customers/{}/addresses' },
          { type: 'noResource', path: '/addresses' },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Energy Customers API
mediaType: application/json

types:
  Address:
    type: object
    properties:
      line1: string
      city: string
      postcode: string

/customers:
  /{customerId}:
    get:
      responses:
        200:
          description: The customer.
        404:
          description: No customer has this id.
    /addresses:
      get:
        responses:
          200:
            body:
              type: Address[]
      post:
        body:
          type: Address
        responses:
          201:
            description: The address was added.
      /{addressId}:
        get:
          responses:
            200:
              body:
                type: Address
            404:
              description: This customer has no such address.
`,
  keyPoints: [
    'A nested resource adds its path to the path of its parent.',
    'Nesting says the child belongs to the parent, so a POST there needs no customer id in the body.',
    'Collection and item are two levels: /addresses for the list, /{addressId} for one address.',
    'Resources are named with plural nouns, and the HTTP method says what happens.',
  ],
  solution: `
\`/addresses\` sits inside \`/{customerId}\`, so the path carries the owner. A POST there already knows the customer, and the \`Address\` body does not need a \`customerId\`.

\`/{addressId}\` sits one level further in, so the list and the single item stay separate resources with their own methods.

The 404 on the single address also covers an address that exists but belongs to another customer. The path promises this pair, so the API must honour the pair.
`,
  followUps: [
    {
      q: 'When would you make something a top-level resource instead of a nested one?',
      a: 'When it has a life of its own and callers look it up without the parent. An order might be nested for browsing under a customer, but also needs /orders/{orderId} for support staff.',
    },
    {
      q: 'How deep should nesting go?',
      a: 'Two levels is a common limit. Long paths are hard to use and force callers to know every parent id, so deeper items often get their own top-level resource.',
    },
    {
      q: 'What should GET /customers/42/addresses return if customer 42 does not exist?',
      a: 'A 404, since the parent is missing. A customer who exists but has no addresses gets a 200 with an empty list.',
    },
  ],
}
