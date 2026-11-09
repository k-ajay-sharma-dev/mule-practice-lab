export default {
  id: 'rm-077',
  category: 'api-design',
  title: 'Weather Observations API: A Resource Type That Passes a Parameter to a Trait',
  level: 'ADVANCED',
  tags: ['raml', 'api-design', 'resource-types', 'trait-parameters', 'paging', 'headers', 'energy'],
  estMinutes: 30,
  description: `
A weather service for wind farm operators has 12,000 stations. Each station sends an observation every 10 minutes, about 1.7 million a day. Both lists use cursor paging, but the page size limits differ. A page of stations is small, so a caller may ask for up to 500. A page of observations is heavy, so the limit is 100.

A resource type can apply a trait to its methods, and it can pass its own parameter on to that trait:

\`\`\`
get:
  is: [ paged: { maxLimit: <<maxLimit>> } ]
\`\`\`

The resource sets \`maxLimit\` once, the resource type hands it to the trait, and the trait puts it on \`limit\`.

**Requirements**
- Title \`Weather Observations API\`, with JSON as the default media type.
- \`Station\` with required strings \`stationId\` and \`name\`, and a required number \`elevationM\`.
- \`Observation\` with a required datetime \`observedAt\`, a required number \`temperatureC\` and a required number \`windKph\` of at least 0.
- A trait \`paged\` with a parameter \`maxLimit\`. It adds an optional string \`cursor\` and an optional integer \`limit\` with a minimum of 1 and a maximum of \`<<maxLimit>>\`.
- A resource type \`pagedCollection\` with parameters \`itemType\` and \`maxLimit\`. Its \`get\` applies \`paged\` with \`maxLimit\` passed on, and returns \`<<itemType>>[]\` with status 200 and an optional string header \`X-Next-Cursor\`.
- \`/stations\` uses \`pagedCollection\` with \`Station\` and a limit of 500.
- \`/stations/{stationId}/observations\` uses \`pagedCollection\` with \`Observation\` and a limit of 100. Its \`get\` also has its own required datetime query parameter \`from\`.
`,
  starter: `#%RAML 1.0
title: Weather Observations API
mediaType: application/json

types:

traits:
  paged:

resourceTypes:
  pagedCollection:

/stations:
  /{stationId}:
    /observations:
`,
  ramlChecks: [
    {
      label: 'The paged trait sets the maximum of limit to <<maxLimit>>',
      rule: {
        type: 'any',
        rules: ['queryParameters.limit.maximum', 'queryParameters.limit?.maximum'].map((key) => ({
          type: 'trait',
          name: 'paged',
          values: { [key]: { oneOf: ['<<maxLimit>>', '<< maxLimit >>'] } },
        })),
      },
    },
    { label: 'The pagedCollection resource type applies a trait on get and returns 200', rule: { type: 'resourceType', name: 'pagedCollection', has: ['get.is', 'get.responses.200'] } },
    { label: '/stations uses pagedCollection, and its 200 comes from there', rule: { type: 'typed', path: '/stations', resourceType: 'pagedCollection', provides: ['get.responses.200'] } },
    { label: 'GET /stations uses paged', rule: { type: 'applied', path: '/stations', method: 'get', trait: 'paged' } },
    {
      label: 'GET /stations has an optional integer limit from 1 to 500, and an optional cursor',
      rule: {
        type: 'all',
        rules: [
          { type: 'param', path: '/stations', method: 'get', in: 'query', name: 'limit', want: { type: 'integer', required: false, minimum: 1, maximum: 500 } },
          { type: 'param', path: '/stations', method: 'get', in: 'query', name: 'cursor', want: { type: 'string', required: false } },
        ],
      },
    },
    { label: 'GET /stations returns Station[] with the X-Next-Cursor header', rule: { type: 'response', path: '/stations', method: 'get', status: '200', typeIs: 'Station[]', header: 'X-Next-Cursor' } },
    {
      label: '/stations/{stationId}/observations uses pagedCollection and paged',
      rule: {
        type: 'all',
        rules: [
          { type: 'typed', path: '/stations/{}/observations', resourceType: 'pagedCollection', provides: ['get.responses.200'] },
          { type: 'applied', path: '/stations/{}/observations', method: 'get', trait: 'paged' },
        ],
      },
    },
    {
      label: 'GET observations has an optional integer limit from 1 to 100',
      rule: { type: 'param', path: '/stations/{}/observations', method: 'get', in: 'query', name: 'limit', want: { type: 'integer', required: false, minimum: 1, maximum: 100 } },
    },
    { label: 'GET observations returns Observation[]', rule: { type: 'response', path: '/stations/{}/observations', method: 'get', status: '200', typeIs: 'Observation[]' } },
    { label: 'GET observations has its own required datetime from', rule: { type: 'param', path: '/stations/{}/observations', method: 'get', in: 'query', name: 'from', want: { type: 'datetime', required: true } } },
    {
      label: 'Observation has a datetime observedAt and a windKph of at least 0',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Observation', prop: 'observedAt', want: { type: 'datetime', required: true } },
          { type: 'prop', typeName: 'Observation', prop: 'windKph', want: { type: 'number', required: true, minimum: 0 } },
          { type: 'prop', typeName: 'Observation', prop: 'temperatureC', want: { type: 'number', required: true } },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Weather Observations API
mediaType: application/json

types:
  Station:
    type: object
    properties:
      stationId: string
      name: string
      elevationM: number
  Observation:
    type: object
    properties:
      observedAt: datetime
      temperatureC: number
      windKph:
        type: number
        minimum: 0

traits:
  paged:
    usage: Cursor paging. Pass maxLimit, the largest page this list allows.
    queryParameters:
      cursor?:
        type: string
        description: The value of X-Next-Cursor from the last page.
      limit?:
        type: integer
        minimum: 1
        maximum: <<maxLimit>>
        description: How many items to return, up to <<maxLimit>>.

resourceTypes:
  pagedCollection:
    usage: A read-only list. Pass itemType and maxLimit.
    get:
      is: [ paged: { maxLimit: <<maxLimit>> } ]
      responses:
        200:
          headers:
            X-Next-Cursor?:
              type: string
              description: Send this as cursor to get the next page. Missing on the last page.
          body:
            type: <<itemType>>[]

/stations:
  type: { pagedCollection: { itemType: Station, maxLimit: 500 } }
  /{stationId}:
    /observations:
      type: { pagedCollection: { itemType: Observation, maxLimit: 100 } }
      get:
        queryParameters:
          from:
            type: datetime
            description: The earliest observation to return.
`,
  keyPoints: [
    'A resource type can apply a trait inside its methods with is.',
    'A parameter of the resource type can be passed on to the trait as <<name>>.',
    'Each resource passes its own values, so one pattern gives different limits.',
    'A method written on the resource merges with the method from the resource type.',
    'A cursor in a response header keeps the body a plain list.',
  ],
  solution: `
The paging rules live in \`paged\`, and the shape of a list lives in \`pagedCollection\`. The resources only state what differs: the item type and the limit.

\`maxLimit\` travels in two steps. \`/stations\` gives \`500\` to the resource type, the resource type writes it into \`is: [ paged: { maxLimit: <<maxLimit>> } ]\`, and the trait puts it on \`limit\`. The observations resource gives \`100\`, so its \`limit\` stops at 100.

\`from\` is only for observations, so it is written on that resource's \`get\`. RAML merges it with the \`get\` from the resource type, so the method has \`from\`, \`cursor\` and \`limit\`.

\`X-Next-Cursor\` is optional because the last page has no next page. A caller keeps asking until the header is missing.
`,
  followUps: [
    {
      q: 'Why cursor paging here and not offset paging?',
      a: 'New observations arrive every 10 minutes, so offsets shift while a caller is paging and rows get skipped or repeated. A cursor points at a fixed place in the data, and deep pages stay fast.',
    },
    {
      q: 'What goes inside the cursor?',
      a: 'Usually the sort key of the last item, such as observedAt and the station id, encoded so callers treat it as opaque. Callers must never build a cursor themselves.',
    },
    {
      q: 'What happens if a resource forgets to pass maxLimit?',
      a: 'The parameter has no value, so the parser reports an error. A resource type with parameters forces every resource to state them.',
    },
    {
      q: 'Could the cursor go in the body instead of a header?',
      a: 'Yes, with a wrapper such as data and nextCursor. A header keeps the body a plain array, while a wrapper is easier for some clients to read. Pick one style for all your APIs.',
    },
  ],
}
