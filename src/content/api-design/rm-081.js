export default {
  id: 'rm-081',
  category: 'api-design',
  title: 'Museum Collections API: Library Traits That Name the Resource',
  level: 'INTERMEDIATE',
  tags: ['raml', 'api-design', 'libraries', 'uses', 'traits', 'trait-parameters', 'public-sector'],
  estMinutes: 25,
  description: `
A national museum puts its collection online: 640,000 objects and 31,000 artists. Its digital team will build four more APIs this year, for exhibitions, loans, archives and images. They want paging, search and the error shape in one shared library, so each API looks the same to the schools and researchers who use them.

A library trait can use reserved parameters too. \`<<resourcePathName>>\` is filled in by the API that applies the trait, so one trait in the library writes the right words on \`/objects\` and on \`/artists\`. A function changes the value: \`<<resourcePathName | !singularize>>\` turns \`artists\` into \`artist\`.

This problem has two files. Use the tabs above the editor to move between them.

**Requirements for \`libraries/patterns.raml\`**
- A type \`ApiError\` with a required string \`code\` and a required string \`message\`.
- A trait \`paged\` with an optional integer \`page\` of at least 1 and an optional integer \`pageSize\` from 1 to 50.
- A trait \`searchable\` with an optional string \`q\`. Its description must read \`Words to find in the <<resourcePathName | !singularize>> record.\`

**Requirements for \`api.raml\`**
- Title \`Museum Collections API\`, with JSON as the default media type.
- Bring in the library with the prefix \`pat\`.
- Types \`MuseumObject\` (required strings \`objectId\` and \`title\`) and \`Artist\` (required strings \`artistId\` and \`name\`).
- \`GET /objects\` and \`GET /artists\` use both \`pat.paged\` and \`pat.searchable\`, and return \`MuseumObject[]\` and \`Artist[]\`.
- \`GET /objects/{objectId}\` returns a \`MuseumObject\`, or 404 with a \`pat.ApiError\` body.
- \`ApiError\` lives only in the library.
`,
  starter: `#%RAML 1.0
title: Museum Collections API
mediaType: application/json

uses:

types:

/objects:
  get:
  /{objectId}:
    get:

/artists:
  get:
`,
  files: {
    'libraries/patterns.raml': `#%RAML 1.0 Library
usage: Shared patterns for every museum API.

types:

traits:
`,
  },
  ramlChecks: [
    { label: 'The API brings in libraries/patterns.raml with the prefix pat', rule: { type: 'library', prefix: 'pat', file: 'libraries/patterns.raml' } },
    {
      label: 'The library holds ApiError with a required code and message, and api.raml does not declare it',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'pat.ApiError', prop: 'code', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'pat.ApiError', prop: 'message', want: { type: 'string', required: true } },
          { type: 'noType', name: 'ApiError' },
        ],
      },
    },
    { label: 'The library holds the searchable trait with q', rule: { type: 'trait', name: 'pat.searchable', has: 'queryParameters.q' } },
    {
      label: 'GET /objects uses pat.paged and pat.searchable',
      rule: {
        type: 'all',
        rules: [
          { type: 'applied', path: '/objects', method: 'get', trait: 'pat.paged' },
          { type: 'applied', path: '/objects', method: 'get', trait: 'pat.searchable' },
        ],
      },
    },
    {
      label: 'pat.paged gives GET /objects a page of at least 1 and a pageSize from 1 to 50',
      rule: {
        type: 'all',
        rules: [
          { type: 'param', path: '/objects', method: 'get', in: 'query', name: 'page', want: { type: 'integer', required: false, minimum: 1 } },
          { type: 'param', path: '/objects', method: 'get', in: 'query', name: 'pageSize', want: { type: 'integer', required: false, minimum: 1, maximum: 50 } },
        ],
      },
    },
    {
      label: 'GET /artists uses pat.paged and pat.searchable',
      rule: {
        type: 'all',
        rules: [
          { type: 'applied', path: '/artists', method: 'get', trait: 'pat.paged' },
          { type: 'applied', path: '/artists', method: 'get', trait: 'pat.searchable' },
        ],
      },
    },
    { label: 'On GET /objects, q is optional and its description says object record', rule: { type: 'param', path: '/objects', method: 'get', in: 'query', name: 'q', want: { type: 'string', required: false, description: 'object record' } } },
    { label: 'On GET /artists, q is optional and its description says artist record', rule: { type: 'param', path: '/artists', method: 'get', in: 'query', name: 'q', want: { type: 'string', required: false, description: 'artist record' } } },
    {
      label: 'GET /objects returns MuseumObject[] and GET /artists returns Artist[]',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/objects', method: 'get', status: '200', typeIs: 'MuseumObject[]' },
          { type: 'response', path: '/artists', method: 'get', status: '200', typeIs: 'Artist[]' },
        ],
      },
    },
    {
      label: 'GET /objects/{objectId} returns a MuseumObject, or 404 with pat.ApiError',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/objects/{}', method: 'get', status: '200', typeIs: 'MuseumObject' },
          { type: 'response', path: '/objects/{}', method: 'get', status: '404', typeIs: 'pat.ApiError' },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Museum Collections API
mediaType: application/json

uses:
  pat: libraries/patterns.raml

types:
  MuseumObject:
    type: object
    properties:
      objectId: string
      title: string
  Artist:
    type: object
    properties:
      artistId: string
      name: string

/objects:
  get:
    is: [ pat.paged, pat.searchable ]
    responses:
      200:
        body:
          type: MuseumObject[]
  /{objectId}:
    get:
      responses:
        200:
          body:
            type: MuseumObject
        404:
          body:
            type: pat.ApiError

/artists:
  get:
    is: [ pat.paged, pat.searchable ]
    responses:
      200:
        body:
          type: Artist[]
`,
  referenceFiles: {
    'libraries/patterns.raml': `#%RAML 1.0 Library
usage: Shared patterns for every museum API.

types:
  ApiError:
    type: object
    properties:
      code: string
      message: string

traits:
  paged:
    queryParameters:
      page?:
        type: integer
        minimum: 1
      pageSize?:
        type: integer
        minimum: 1
        maximum: 50
  searchable:
    queryParameters:
      q?:
        type: string
        description: Words to find in the <<resourcePathName | !singularize>> record.
`,
  },
  keyPoints: [
    'A trait from a library is applied with its prefix, such as pat.paged.',
    'Reserved parameters in a library trait are filled in by the API that applies it.',
    '!singularize turns the plural path name into one item, which reads well in a description.',
    'Types in the library are named with the prefix too, such as pat.ApiError.',
  ],
  solution: `
The library holds what all five museum APIs share. \`api.raml\` holds only the museum's own types and resources.

\`searchable\` does not know which API or resource will use it. \`<<resourcePathName | !singularize>>\` is left open in the library and filled in at \`/objects\` and \`/artists\`, so the docs read "Words to find in the object record" and "Words to find in the artist record".

Writing "object" by hand in the trait would make the artists docs wrong, and writing \`<<resourcePathName>>\` with no function would read "artists record".

The 404 uses \`pat.ApiError\`, so an error from this API looks the same as an error from the loans API next year.
`,
  followUps: [
    {
      q: 'Can two libraries both declare a type called ApiError?',
      a: 'Yes. Each library gets its own prefix in the API, such as pat.ApiError and legacy.ApiError, so the names never clash.',
    },
    {
      q: 'How do the other four teams get this library?',
      a: 'Publish it to Exchange as a RAML fragment with a version. Each team adds it as a dependency in Design Center and moves to a newer version when it is ready.',
    },
    {
      q: 'What does !singularize do with a name like categories?',
      a: 'It gives category. RAML follows English plural rules, but odd words can come out wrong, so check the rendered docs.',
    },
  ],
}
