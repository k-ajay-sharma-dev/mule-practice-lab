export default {
  id: 'rm-036',
  category: 'api-design',
  title: 'Podcast Episodes API: Default Values on Query Parameters',
  level: 'BEGINNER',
  tags: ['raml', 'api-design', 'query-parameters', 'default-values', 'media'],
  estMinutes: 12,
  description: `
A podcast app lists the episodes of a show. Most callers want the same thing, so the team wants callers to send as little as possible and still get a sensible page.

The \`default\` facet states the value the server uses when the caller leaves a parameter out. A **facet** is a rule or detail added to a type. The caller does not have to send the default. So a parameter with a default is optional.

**Requirements**
- A type \`Episode\` has the required strings \`episodeId\` and \`title\`.
- \`GET /episodes\` returns \`Episode[]\` with status 200.
- \`GET /episodes\` has these query parameters:
  - \`showId\`: a required string with no default, because no value makes sense for every caller.
  - \`limit\`: an optional integer from 1 to 100, with a default of 20.
  - \`sort\`: an optional string that allows only \`newest\`, \`oldest\` and \`popular\`, with a default of \`newest\`.
  - \`includeExplicit\`: an optional boolean with a default of \`false\`.
`,
  starter: `#%RAML 1.0
title: Podcast Episodes API
mediaType: application/json

types:

/episodes:
  get:
`,
  ramlChecks: [
    {
      label: 'episodeId and title are required strings',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Episode', prop: 'episodeId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Episode', prop: 'title', want: { type: 'string', required: true } },
        ],
      },
    },
    { label: 'GET /episodes returns Episode[]', rule: { type: 'response', path: '/episodes', method: 'get', status: '200', typeIs: 'Episode[]' } },
    {
      label: 'showId is a required string with no default',
      rule: { type: 'param', path: '/episodes', method: 'get', in: 'query', name: 'showId', want: { type: 'string', required: true, default: { set: false } } },
    },
    {
      label: 'limit is an optional integer from 1 to 100 with a default of 20',
      rule: { type: 'param', path: '/episodes', method: 'get', in: 'query', name: 'limit', want: { type: 'integer', required: false, minimum: 1, maximum: 100, default: 20 } },
    },
    {
      label: 'sort is optional, has three values and defaults to newest',
      rule: { type: 'param', path: '/episodes', method: 'get', in: 'query', name: 'sort', want: { type: 'string', required: false, enum: { exactly: ['newest', 'oldest', 'popular'] }, default: 'newest' } },
    },
    {
      label: 'includeExplicit is an optional boolean with a default of false',
      rule: { type: 'param', path: '/episodes', method: 'get', in: 'query', name: 'includeExplicit', want: { type: 'boolean', required: false, default: false } },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Podcast Episodes API
mediaType: application/json

types:
  Episode:
    type: object
    properties:
      episodeId: string
      title: string

/episodes:
  get:
    queryParameters:
      showId: string
      limit?:
        type: integer
        minimum: 1
        maximum: 100
        default: 20
      sort?:
        type: string
        enum: [ newest, oldest, popular ]
        default: newest
      includeExplicit?:
        type: boolean
        default: false
    responses:
      200:
        body:
          type: Episode[]
`,
  keyPoints: [
    'default is the value the server uses when the caller sends nothing.',
    'A parameter with a default is optional. If it were required, the default could never apply.',
    'Keep a default inside the allowed values, or the contract contradicts itself.',
    'A boolean default is written as false with no quotes. In quotes it is a string.',
  ],
  solution: `
A caller can now send only \`showId\` and get the 20 newest episodes, with explicit ones left out.

\`showId\` has no default, because a default show would hide a caller's mistake and return the wrong data.

The question mark on \`limit?\` marks it as optional. \`required: false\` says the same thing, so either form works.
`,
  followUps: [
    {
      q: 'Does a default mean the client must send that value?',
      a: 'No. It is the value the server applies when the client sends nothing, so the client can leave the parameter out.',
    },
    {
      q: 'Why is a default on a required parameter a design smell?',
      a: 'A required parameter is always sent, so its default can never be used. The contract then says two things that cannot both matter.',
    },
    {
      q: 'What is the risk of changing a default in a later release?',
      a: 'Callers who rely on the old default get different results without changing their code. Treat it as a breaking change and plan a new version.',
    },
  ],
}
