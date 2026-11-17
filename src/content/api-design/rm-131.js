export default {
  id: 'rm-131',
  category: 'api-design',
  title: 'Plant Catalogue API: A Renamed Resource That Answers 301 and 308',
  level: 'BEGINNER',
  tags: ['raml', 'api-design', 'redirects', 'status-codes', 'headers', 'resources', 'retail'],
  estMinutes: 15,
  description: `
Greenacre Garden Centres has a Plant Catalogue API. Its first version named the collection \`/plantlist\`. The new design standard says collections are plural nouns, so the resource is now \`/plants\`.

Two shop apps and a supplier still call \`/plantlist\`. Instead of breaking them, the old path stays in the contract and **redirects** callers to the new one:

- \`301 Moved Permanently\` for GET. The client should use the new address from now on.
- \`308 Permanent Redirect\` for POST. It also says the move is permanent, but the client must repeat the **same method and body**. With 301, some clients turn a POST into a GET.

Both redirects send the new address in a \`Location\` header and have no body.

**Requirements**
- Title \`Plant Catalogue API\`, with JSON as the default media type.
- A type \`Plant\` with:
  - \`plantId\`: required, \`PL-\` and four digits, such as \`PL-0412\`.
  - \`name\`: a required string.
  - \`potSizeCm\`: a required integer of at least 1.
- \`GET /plants\` returns \`Plant[]\` with 200.
- \`POST /plants\` takes a \`Plant\` and returns 201 with a \`Location\` header.
- \`GET /plantlist\` returns 301 with a \`Location\` header and no body.
- \`POST /plantlist\` returns 308 with a \`Location\` header and no body.
`,
  starter: `#%RAML 1.0
title: Plant Catalogue API
mediaType: application/json

types:
  Plant:
    type: object
    properties:
      plantId: string
      name: string

/plantlist:
  get:
    responses:
      200:
        body:
          type: Plant[]
`,
  ramlChecks: [
    {
      label: 'The title is Plant Catalogue API and JSON is the default',
      rule: { type: 'all', rules: [{ type: 'root', key: 'title', want: 'Plant Catalogue API' }, { type: 'root', key: 'mediaType', want: 'application/json' }] },
    },
    {
      label: 'plantId is PL- and four digits, and name is a required string',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Plant', prop: 'plantId', want: { required: true, pattern: { accepts: ['PL-0412', 'PL-9999'], rejects: ['PL-412', 'pl-0412', 'PL-04120', 'PL0412', 'XPL-0412'] } } },
          { type: 'prop', typeName: 'Plant', prop: 'name', want: { type: 'string', required: true } },
        ],
      },
    },
    {
      label: 'potSizeCm is a required integer of at least 1',
      rule: { type: 'prop', typeName: 'Plant', prop: 'potSizeCm', want: { type: 'integer', required: true, minimum: 1 } },
    },
    {
      label: 'GET /plants returns Plant[] with 200',
      rule: { type: 'response', path: '/plants', method: 'get', status: '200', typeIs: 'Plant[]' },
    },
    {
      label: 'POST /plants takes a Plant and returns 201 with Location',
      rule: {
        type: 'all',
        rules: [
          { type: 'body', path: '/plants', method: 'post', typeIs: 'Plant' },
          { type: 'response', path: '/plants', method: 'post', status: '201', header: 'Location' },
        ],
      },
    },
    {
      label: 'GET /plantlist answers 301 with Location and no body',
      rule: { type: 'response', path: '/plantlist', method: 'get', status: '301', header: 'Location', noBody: true },
    },
    {
      label: 'POST /plantlist answers 308 with Location and no body',
      rule: { type: 'response', path: '/plantlist', method: 'post', status: '308', header: 'Location', noBody: true },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Plant Catalogue API
version: v1
baseUri: https://api.example.com/plants/{version}
mediaType: application/json

types:
  Plant:
    type: object
    properties:
      plantId:
        type: string
        pattern: ^PL-[0-9]{4}$
      name: string
      potSizeCm:
        type: integer
        minimum: 1
    example:
      plantId: PL-0412
      name: Japanese maple
      potSizeCm: 23

/plants:
  get:
    responses:
      200:
        body:
          type: Plant[]
  post:
    body:
      type: Plant
    responses:
      201:
        headers:
          Location:
            type: string
            example: /plants/PL-0412

/plantlist:
  description: The old name of /plants. Kept so that existing callers are sent to the new address.
  get:
    responses:
      301:
        description: Moved for good. Use /plants from now on.
        headers:
          Location:
            type: string
            example: /plants
  post:
    responses:
      308:
        description: Moved for good. Send the same POST, with the same body, to /plants.
        headers:
          Location:
            type: string
            example: /plants
`,
  keyPoints: [
    'A redirect keeps old callers working after a resource is renamed.',
    '301 Moved Permanently tells the client to use the new address from now on.',
    'Some clients change a POST into a GET when they follow a 301.',
    '308 Permanent Redirect keeps the method and the body.',
    'A redirect sends the new address in a Location header and needs no body.',
  ],
  solution: `
**Keep the old path.** Removing \`/plantlist\` would break two apps and a supplier on the day of release. Keeping it as a redirect gives them time to move.

**301 for GET.** A GET has no body, so 301 is enough. Browsers and HTTP clients follow it, and many cache it, so later calls go straight to \`/plants\`.

**308 for POST.** Over the years, many clients answered a 301 to a POST by sending a GET to the new address. The plant would never be created. 308 says "the same request, at this address", so the body arrives at \`/plants\` as sent.

**No body.** A redirect only needs the status and the \`Location\` header. Leaving out the body makes that clear in the contract.

| Code | Permanent? | Keeps POST and body? |
|---|---|---|
| 301 | Yes | Not always |
| 308 | Yes | Yes |
| 302 | No | Not always |
| 307 | No | Yes |
`,
  followUps: [
    {
      q: 'When would you use 307 instead of 308?',
      a: 'When the move is only for a while, such as during maintenance. 307 keeps the method and body like 308, but tells the client to keep using the old address later.',
    },
    {
      q: 'How long should /plantlist stay in the contract?',
      a: 'Until the logs show no more calls to it. Tell the callers a date, watch the traffic, and remove the old path in a later version once it is quiet.',
    },
    {
      q: 'Does the Mule app behind this API have to follow the redirect?',
      a: 'No. The app answers /plantlist with the status and Location header, and the client follows it. The app does not call itself.',
    },
  ],
}
