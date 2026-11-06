export default {
  id: 'rm-020',
  category: 'api-design',
  title: 'Policy API: One Resource, JSON and XML',
  level: 'INTERMEDIATE',
  tags: ['raml', 'api-design', 'media-types', 'content-negotiation', 'xml', 'insurance'],
  estMinutes: 20,
  description: `
An insurer's website reads policies as JSON. Its older broker systems only speak XML, and they will not change soon. One resource must serve both, so the team does not run two APIs.

This is called **content negotiation**. A caller says what it wants to receive with the \`Accept\` header, and what it is sending with the \`Content-Type\` header. The contract lists the formats each body supports.

The data is the same in both formats, so one RAML type can describe both. The \`xml\` facet on a property controls how it appears in XML, for example as an attribute.

**Requirements**
- Title \`Policy API\`.
- A type \`Policy\` with a required string \`policyId\`, a required string \`holderName\`, and a required number \`premium\`.
- In XML, \`policyId\` is an attribute. Set this with the \`xml\` facet.
- \`GET /policies/{policyId}\` returns a \`Policy\` with status 200, in both \`application/json\` and \`application/xml\`.
- It returns 404 when the policy does not exist, and 406 when the caller asks for a format the API does not offer.
- \`POST /policies\` accepts a \`Policy\` in both \`application/json\` and \`application/xml\`, and returns 201.
- It returns 415 when the body is in any other format.

You can list the two formats under each \`body\`, or set both once in \`mediaType\`. Either is fine.
`,
  starter: `#%RAML 1.0
title: Policy API

types:
  Policy:
    type: object
    properties:

/policies:
`,
  ramlChecks: [
    { label: 'The title is Policy API', rule: { type: 'root', key: 'title', want: 'Policy API' } },
    {
      label: 'Policy has required policyId, holderName and premium',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Policy', prop: 'policyId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Policy', prop: 'holderName', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Policy', prop: 'premium', want: { type: 'number', required: true } },
        ],
      },
    },
    { label: 'policyId has an xml facet', rule: { type: 'prop', typeName: 'Policy', prop: 'policyId', want: { xml: { set: true } } } },
    {
      label: 'GET /policies/{policyId} returns Policy as JSON and as XML',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/policies/{}', method: 'get', status: '200', media: 'application/json', typeIs: 'Policy' },
          { type: 'response', path: '/policies/{}', method: 'get', status: '200', media: 'application/xml', typeIs: 'Policy' },
        ],
      },
    },
    { label: 'GET /policies/{policyId} returns 404 for an unknown policy', rule: { type: 'response', path: '/policies/{}', method: 'get', status: '404' } },
    { label: 'GET /policies/{policyId} returns 406 for a format it does not offer', rule: { type: 'response', path: '/policies/{}', method: 'get', status: '406' } },
    {
      label: 'POST /policies accepts Policy as JSON and as XML',
      rule: {
        type: 'all',
        rules: [
          { type: 'body', path: '/policies', method: 'post', media: 'application/json', typeIs: 'Policy' },
          { type: 'body', path: '/policies', method: 'post', media: 'application/xml', typeIs: 'Policy' },
        ],
      },
    },
    { label: 'POST /policies returns 201', rule: { type: 'response', path: '/policies', method: 'post', status: '201' } },
    { label: 'POST /policies returns 415 for any other format', rule: { type: 'response', path: '/policies', method: 'post', status: '415' } },
  ],
  referenceRaml: `#%RAML 1.0
title: Policy API

types:
  Policy:
    type: object
    properties:
      policyId:
        type: string
        xml:
          attribute: true
      holderName: string
      premium: number

/policies:
  post:
    body:
      application/json:
        type: Policy
      application/xml:
        type: Policy
    responses:
      201:
        description: The policy was created.
      415:
        description: The body is not JSON or XML.
  /{policyId}:
    get:
      responses:
        200:
          body:
            application/json:
              type: Policy
            application/xml:
              type: Policy
        404:
          description: No policy has this id.
        406:
          description: The Accept header asks for a format this API does not offer.
`,
  keyPoints: [
    'Accept says what the caller wants back. Content-Type says what the caller is sending.',
    '406 Not Acceptable is about the response format. 415 Unsupported Media Type is about the request format.',
    'One RAML type can describe both formats, so the two cannot drift apart.',
    'The xml facet shapes a property in XML, with keys such as attribute, name and wrapped.',
    'mediaType can be a list, which gives every body both formats.',
  ],
  solution: `
Each body lists its two formats, and both point at the same \`Policy\` type. A new field added to \`Policy\` reaches JSON and XML together.

The two error codes look alike but answer different mistakes. \`406\` means the API cannot send what the caller asked for. \`415\` means the API cannot read what the caller sent.

Setting \`mediaType: [ application/json, application/xml ]\` at the top is a good alternative. Bodies then need no media keys, and every body offers both formats.
`,
  followUps: [
    {
      q: 'What should the API do when a caller sends no Accept header?',
      a: 'The caller has no preference, so the API can pick its default format. State which one in the documentation, so callers are not surprised.',
    },
    {
      q: 'Why not offer /policies.xml and /policies.json as separate paths?',
      a: 'Those are two URLs for one thing. Content negotiation keeps one resource, and a new format does not add new paths.',
    },
    {
      q: 'Where would the work of producing XML happen in Mule?',
      a: 'DataWeave can write both formats from one payload, so a flow can read the Accept header and set the output format. The business logic stays the same for both.',
    },
  ],
}
