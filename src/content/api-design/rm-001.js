export default {
  id: 'rm-001',
  category: 'api-design',
  title: 'Store Finder API: Your First RAML File',
  level: 'BEGINNER',
  tags: ['raml', 'api-design', 'resources', 'retail'],
  estMinutes: 10,
  description: `
A retail chain wants a small API so its website can list its stores. Before anyone builds it, the team agrees the contract in a RAML file. This way of working is called **design first**.

A **resource** is a thing the API exposes, written as a path that starts with a slash. Under a resource you list the HTTP **methods** it offers, in lower case.

**Requirements**
- The API is called \`Store Finder API\`, version \`v1\`.
- Its base URI is \`https://api.example.com/stores/{version}\`.
- All bodies are JSON, set once with \`mediaType\`.
- \`GET /stores\` returns the list of stores with status 200.
- \`GET /stores/{storeId}\` returns one store with status 200, or 404 when the store does not exist.

Write the RAML. You do not need types yet.
`,
  starter: `#%RAML 1.0
title:
`,
  ramlChecks: [
    { label: 'The API is called Store Finder API', rule: { type: 'root', key: 'title', want: 'Store Finder API' } },
    { label: 'The version is v1', rule: { type: 'root', key: 'version', want: 'v1' } },
    { label: 'The base URI uses {version}', rule: { type: 'root', key: 'baseUri', want: '{version}' } },
    { label: 'JSON is set once with mediaType', rule: { type: 'root', key: 'mediaType', want: 'application/json' } },
    { label: 'GET /stores returns 200', rule: { type: 'response', path: '/stores', method: 'get', status: '200' } },
    { label: 'GET /stores/{storeId} returns 200', rule: { type: 'response', path: '/stores/{}', method: 'get', status: '200' } },
    { label: 'GET /stores/{storeId} returns 404 for an unknown store', rule: { type: 'response', path: '/stores/{}', method: 'get', status: '404' } },
  ],
  referenceRaml: `#%RAML 1.0
title: Store Finder API
version: v1
baseUri: https://api.example.com/stores/{version}
mediaType: application/json

/stores:
  get:
    description: List all stores.
    responses:
      200:
        description: The stores.
  /{storeId}:
    get:
      description: Get one store.
      responses:
        200:
          description: The store.
        404:
          description: No store has this id.
`,
  keyPoints: [
    'The first line of a RAML file is exactly #%RAML 1.0.',
    'A nested resource adds to the path of its parent, so /{storeId} under /stores is /stores/{storeId}.',
    '{version} in baseUri is filled in from the version key.',
    'mediaType sets the default once, so bodies do not repeat it.',
  ],
  solution: `
The file starts with the RAML header, then the API details, then the resources.

\`/{storeId}\` sits under \`/stores\`, so it inherits that path. Curly brackets mark a **URI parameter**, a value that changes per request.

The 404 belongs in the contract. Callers can then plan for it before the API exists.
`,
  followUps: [
    {
      q: 'Why agree the RAML before building the API?',
      a: 'Consumers and developers can work at the same time from one contract, and a mock can serve it. Changing a file is much cheaper than changing a deployed API.',
    },
    {
      q: 'What does baseUri add to a resource path?',
      a: 'It is the front of every URL. GET /stores here is called at https://api.example.com/stores/v1/stores.',
    },
    {
      q: 'Why are the methods lower case?',
      a: 'RAML defines the method keys as get, post, put, patch, delete, options and head. GET in capitals is not a valid key.',
    },
  ],
}
