export default {
  id: 'rm-073',
  category: 'api-design',
  title: 'Marketplace Search API: A searchable Trait with Parameters',
  level: 'INTERMEDIATE',
  tags: ['raml', 'api-design', 'traits', 'trait-parameters', 'search', 'retail'],
  estMinutes: 20,
  description: `
A second-hand marketplace has 2.1 million listings and 180,000 sellers. Both lists can be searched with free text and sorted. The rules are the same, but the default sort is not: listings show the newest first, and sellers show the best rated first.

A trait can take **parameters**. You write \`<<defaultSort>>\` inside the trait and pass the value where you apply it, such as \`is: [ searchable: { defaultSort: newest } ]\`.

RAML also fills in some parameters for you. \`<<resourcePathName>>\` becomes the last part of the resource path, so it is \`listings\` on \`/listings\`. You do not pass it.

**Requirements**
- Title \`Marketplace Search API\`, with JSON as the default media type.
- Types \`Listing\` (required strings \`listingId\` and \`title\`, required number \`price\`) and \`Seller\` (required strings \`sellerId\` and \`displayName\`, required number \`rating\`).
- A trait \`searchable\` with one parameter, \`defaultSort\`. It adds:
  - an optional string \`q\` of 2 to 100 characters. Its description names the resource with \`<<resourcePathName>>\`.
  - an optional string \`sort\` whose default is \`<<defaultSort>>\`
  - a 400 response for search text that is too short
- \`GET /listings\` is \`searchable\` with \`newest\` as the default sort, and returns \`Listing[]\`.
- \`GET /sellers\` is \`searchable\` with \`rating\` as the default sort, and returns \`Seller[]\`.
`,
  starter: `#%RAML 1.0
title: Marketplace Search API
mediaType: application/json

types:

traits:
  searchable:

/listings:
  get:

/sellers:
  get:
`,
  ramlChecks: [
    {
      label: 'The searchable trait adds q, sort and a 400 response',
      rule: {
        type: 'all',
        rules: [
          { type: 'trait', name: 'searchable', has: 'queryParameters.q' },
          { type: 'trait', name: 'searchable', has: 'queryParameters.sort' },
          { type: 'trait', name: 'searchable', has: 'responses.400' },
        ],
      },
    },
    {
      label: 'The default of sort is the <<defaultSort>> parameter',
      rule: {
        type: 'any',
        rules: ['queryParameters.sort.default', 'queryParameters.sort?.default'].map((key) => ({
          type: 'trait',
          name: 'searchable',
          values: { [key]: { oneOf: ['<<defaultSort>>', '<< defaultSort >>'] } },
        })),
      },
    },
    { label: 'GET /listings uses searchable', rule: { type: 'applied', path: '/listings', method: 'get', trait: 'searchable' } },
    {
      label: 'GET /listings: q is optional, at least 2 characters, and its description says listings',
      rule: { type: 'param', path: '/listings', method: 'get', in: 'query', name: 'q', want: { type: 'string', required: false, minLength: 2, maxLength: 100, description: 'listings' } },
    },
    { label: 'GET /listings sorts by newest by default', rule: { type: 'param', path: '/listings', method: 'get', in: 'query', name: 'sort', want: { type: 'string', required: false, default: 'newest' } } },
    { label: 'GET /sellers uses searchable', rule: { type: 'applied', path: '/sellers', method: 'get', trait: 'searchable' } },
    {
      label: 'GET /sellers: q is optional, at least 2 characters, and its description says sellers',
      rule: { type: 'param', path: '/sellers', method: 'get', in: 'query', name: 'q', want: { type: 'string', required: false, minLength: 2, description: 'sellers' } },
    },
    { label: 'GET /sellers sorts by rating by default', rule: { type: 'param', path: '/sellers', method: 'get', in: 'query', name: 'sort', want: { type: 'string', required: false, default: 'rating' } } },
    { label: 'GET /sellers gets the 400 response from the trait', rule: { type: 'response', path: '/sellers', method: 'get', status: '400' } },
    {
      label: 'GET /listings returns Listing[] and GET /sellers returns Seller[]',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/listings', method: 'get', status: '200', typeIs: 'Listing[]' },
          { type: 'response', path: '/sellers', method: 'get', status: '200', typeIs: 'Seller[]' },
        ],
      },
    },
    {
      label: 'Listing has a number price and Seller has a number rating',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Listing', prop: 'price', want: { type: 'number', required: true } },
          { type: 'prop', typeName: 'Seller', prop: 'rating', want: { type: 'number', required: true } },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Marketplace Search API
mediaType: application/json

types:
  Listing:
    type: object
    properties:
      listingId: string
      title: string
      price: number
  Seller:
    type: object
    properties:
      sellerId: string
      displayName: string
      rating:
        type: number
        minimum: 0
        maximum: 5

traits:
  searchable:
    usage: Apply to a list that callers can search. Pass defaultSort.
    queryParameters:
      q?:
        type: string
        minLength: 2
        maxLength: 100
        description: Free text to search the <<resourcePathName>> by.
      sort?:
        type: string
        default: <<defaultSort>>
        description: The field to sort the <<resourcePathName>> by.
    responses:
      400:
        description: The search text is shorter than 2 or longer than 100 characters.

/listings:
  get:
    is: [ searchable: { defaultSort: newest } ]
    responses:
      200:
        body:
          type: Listing[]

/sellers:
  get:
    is: [ searchable: { defaultSort: rating } ]
    responses:
      200:
        body:
          type: Seller[]
`,
  keyPoints: [
    'A trait parameter is written <<name>> and its value is passed in is: [ trait: { name: value } ].',
    '<<resourcePathName>> is filled in by RAML from the path, so it is never passed.',
    'A trait can add responses as well as query parameters and headers.',
    'Every parameter the trait uses, apart from the reserved ones, must be passed when it is applied.',
  ],
  solution: `
\`searchable\` holds the search rules once. The only thing that differs is the default sort, so that is the only parameter.

\`<<resourcePathName>>\` makes the documentation right on both lists. On \`/listings\` the description reads "Free text to search the listings by", and on \`/sellers\` it reads "the sellers". Writing "listings" by hand in the trait would be wrong on \`/sellers\`.

The 400 lives in the trait, because it exists only because of \`q\`. Any list that becomes searchable gets the response with it.

The method keeps its own 200. RAML merges the trait into the method, so the method ends up with both the 200 and the 400.
`,
  followUps: [
    {
      q: 'Which reserved parameters can a trait use?',
      a: 'In a trait you can use <<resourcePath>>, <<resourcePathName>> and <<methodName>>. RAML fills them in from the place where the trait is applied.',
    },
    {
      q: 'What would you add so sort only accepts known fields?',
      a: 'An enum on sort. The fields differ per list, so either pass a type name as a parameter and declare an enum type per list, or write the enum on each method.',
    },
    {
      q: 'Why return 400 for a one-letter search instead of running it?',
      a: 'A one-letter search over 2.1 million listings matches almost everything and loads the search index for nothing. Rejecting it early protects the backend and gives the caller a clear message.',
    },
  ],
}
