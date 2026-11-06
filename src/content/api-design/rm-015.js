export default {
  id: 'rm-015',
  category: 'api-design',
  title: 'Property Listings API: PUT, PATCH and DELETE',
  level: 'INTERMEDIATE',
  tags: ['raml', 'api-design', 'http-methods', 'status-codes', 'real-estate'],
  estMinutes: 18,
  description: `
An estate agency needs an API for its listings. Agents edit a listing in three different ways, and each maps to its own HTTP method.

- **PUT** replaces the whole item. The caller sends every required field.
- **PATCH** changes part of an item. The caller sends only the fields that change.
- **DELETE** removes the item.

**204 No Content** means the request worked and there is nothing to send back.

**Requirements**
- A type \`Listing\` with a required string \`address\`, a required number \`price\`, and a required \`status\` that is one of \`FOR_SALE\`, \`SOLD\`.
- A type \`ListingPatch\` with an optional number \`price\` and an optional \`status\` of the same two values.
- \`PUT /listings/{listingId}\` takes a \`Listing\` body and returns the saved \`Listing\` with status 200.
- \`PATCH /listings/{listingId}\` takes a \`ListingPatch\` body and returns the saved \`Listing\` with status 200.
- \`DELETE /listings/{listingId}\` returns 204, because nothing is left to return.
- All three return 404 when the listing does not exist.
- New listings are made by \`POST /listings\`, which takes a \`Listing\` body and returns 201. There is no POST on a single listing.
`,
  starter: `#%RAML 1.0
title: Property Listings API
mediaType: application/json

types:
  Listing:
    type: object
    properties:
      address: string

/listings:
  /{listingId}:
`,
  ramlChecks: [
    {
      label: 'Listing has a required address, price and status',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Listing', prop: 'address', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Listing', prop: 'price', want: { type: 'number', required: true } },
          { type: 'prop', typeName: 'Listing', prop: 'status', want: { required: true, enum: { exactly: ['FOR_SALE', 'SOLD'] } } },
        ],
      },
    },
    {
      label: 'In ListingPatch, price and status are optional',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'ListingPatch', prop: 'price', want: { type: 'number', required: false } },
          { type: 'prop', typeName: 'ListingPatch', prop: 'status', want: { required: false, enum: { exactly: ['FOR_SALE', 'SOLD'] } } },
        ],
      },
    },
    {
      label: 'PUT takes a whole Listing and returns it with 200',
      rule: {
        type: 'all',
        rules: [
          { type: 'body', path: '/listings/{}', method: 'put', typeIs: 'Listing' },
          { type: 'response', path: '/listings/{}', method: 'put', status: '200', typeIs: 'Listing' },
        ],
      },
    },
    {
      label: 'PATCH takes a ListingPatch and returns the Listing with 200',
      rule: {
        type: 'all',
        rules: [
          { type: 'body', path: '/listings/{}', method: 'patch', typeIs: 'ListingPatch' },
          { type: 'response', path: '/listings/{}', method: 'patch', status: '200', typeIs: 'Listing' },
        ],
      },
    },
    { label: 'DELETE returns 204 with no body', rule: { type: 'response', path: '/listings/{}', method: 'delete', status: '204', noBody: true } },
    {
      label: 'PUT, PATCH and DELETE return 404 for an unknown listing',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/listings/{}', method: 'put', status: '404' },
          { type: 'response', path: '/listings/{}', method: 'patch', status: '404' },
          { type: 'response', path: '/listings/{}', method: 'delete', status: '404' },
        ],
      },
    },
    {
      label: 'POST /listings takes a Listing and returns 201',
      rule: {
        type: 'all',
        rules: [
          { type: 'body', path: '/listings', method: 'post', typeIs: 'Listing' },
          { type: 'response', path: '/listings', method: 'post', status: '201' },
        ],
      },
    },
    {
      label: 'A single listing offers no POST',
      rule: {
        type: 'all',
        rules: [
          { type: 'resource', path: '/listings/{}' },
          { type: 'noMethod', path: '/listings/{}', method: 'post' },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Property Listings API
mediaType: application/json

types:
  Listing:
    type: object
    properties:
      address: string
      price: number
      status:
        type: string
        enum: [ FOR_SALE, SOLD ]
  ListingPatch:
    type: object
    properties:
      price?: number
      status?:
        type: string
        enum: [ FOR_SALE, SOLD ]

/listings:
  post:
    body:
      type: Listing
    responses:
      201:
        description: The listing was created.
  /{listingId}:
    put:
      body:
        type: Listing
      responses:
        200:
          body:
            type: Listing
        404:
          description: No listing has this id.
    patch:
      body:
        type: ListingPatch
      responses:
        200:
          body:
            type: Listing
        404:
          description: No listing has this id.
    delete:
      responses:
        204:
          description: The listing was removed.
        404:
          description: No listing has this id.
`,
  keyPoints: [
    'PUT sends the whole item. PATCH sends only what changes.',
    'A PATCH body needs its own type, because the required rules of the full type would force every field.',
    '204 means success with no body, so a 204 response declares no body.',
    'POST belongs on the collection. PUT, PATCH and DELETE belong on the single item.',
  ],
  solution: `
\`PUT\` takes \`Listing\`, so all its required properties must be sent. A property left out is a mistake, since PUT replaces the whole item.

\`PATCH\` needs \`ListingPatch\`. If it used \`Listing\`, a caller changing the price would also have to send the address, and the point of PATCH would be lost.

\`DELETE\` returns 204 with no body, as nothing is left to describe. \`PUT\` and \`PATCH\` return 200 here because they send the saved listing back.

\`POST\` stays on \`/listings\`, because the server creates the new item in the collection and chooses its id.
`,
  followUps: [
    {
      q: 'What does idempotent mean, and which of these methods are?',
      a: 'Sending the same request twice leaves the same result as sending it once. PUT and DELETE are idempotent. POST is not, and PATCH is not guaranteed to be.',
    },
    {
      q: 'What should a second DELETE of the same listing return?',
      a: 'A 404 is common, since the listing is gone. The state of the server does not change, so DELETE stays idempotent even though the status code differs.',
    },
    {
      q: 'Could PUT return 204 instead of 200?',
      a: 'Yes, if the design chooses not to send the item back. Here the contract promises the saved listing, so it needs 200 with a body.',
    },
  ],
}
