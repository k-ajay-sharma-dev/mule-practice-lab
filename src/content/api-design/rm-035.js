export default {
  id: 'rm-035',
  category: 'api-design',
  title: 'Courier Depots API: Regional Hosts with baseUriParameters',
  level: 'BEGINNER',
  tags: ['raml', 'api-design', 'base-uri', 'base-uri-parameters', 'protocols', 'logistics'],
  estMinutes: 12,
  description: `
A courier company runs the same API in three regions, and each region has its own host name. Security also wants the contract to say that plain HTTP is not offered.

A placeholder in \`baseUri\` other than \`{version}\` is a **base URI parameter**. You describe it under \`baseUriParameters\` at the top of the file. Callers then know which values it can take.

\`protocols\` lists the protocols the API speaks, as a list such as \`[ HTTP, HTTPS ]\`.

**Requirements**
- The API is called \`Courier Depots API\`, version \`v2\`, with JSON as the default media type.
- Its base URI is \`https://{region}.courier.example.com/api/{version}\`.
- A type \`Region\` is a string that allows only \`emea\`, \`amer\` and \`apac\`.
- \`baseUriParameters\` declares \`region\` with the type \`Region\`.
- The API offers HTTPS and nothing else, stated with \`protocols\`.
- A type \`Depot\` has the required strings \`depotId\` and \`city\`.
- \`GET /depots\` returns \`Depot[]\` with status 200.
`,
  starter: `#%RAML 1.0
title: Courier Depots API
version: v2
mediaType: application/json

types:

/depots:
`,
  ramlChecks: [
    { label: 'The API is called Courier Depots API', rule: { type: 'root', key: 'title', want: 'Courier Depots API' } },
    { label: 'The version is v2', rule: { type: 'root', key: 'version', want: 'v2' } },
    { label: 'JSON is the default media type', rule: { type: 'root', key: 'mediaType', want: 'application/json' } },
    { label: 'The base URI uses {region} and {version}', rule: { type: 'root', key: 'baseUri', want: ['https://', '{region}.courier.example.com', '{version}'] } },
    { label: 'Region allows only emea, amer and apac', rule: { type: 'typeDecl', name: 'Region', want: { type: 'string', enum: { exactly: ['emea', 'amer', 'apac'] } } } },
    { label: 'baseUriParameters declares region with the type Region', rule: { type: 'param', in: 'base', name: 'region', want: { type: 'Region' } } },
    {
      label: 'protocols offers only HTTPS',
      rule: {
        type: 'any',
        rules: [
          { type: 'root', key: 'protocols', want: { exactly: ['HTTPS'] } },
          { type: 'root', key: 'protocols', want: { exactly: ['https'] } },
        ],
      },
    },
    {
      label: 'depotId and city are required strings',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Depot', prop: 'depotId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Depot', prop: 'city', want: { type: 'string', required: true } },
        ],
      },
    },
    { label: 'GET /depots returns Depot[]', rule: { type: 'response', path: '/depots', method: 'get', status: '200', typeIs: 'Depot[]' } },
  ],
  referenceRaml: `#%RAML 1.0
title: Courier Depots API
version: v2
baseUri: https://{region}.courier.example.com/api/{version}
baseUriParameters:
  region: Region
protocols: [ HTTPS ]
mediaType: application/json

types:
  Region:
    type: string
    enum: [ emea, amer, apac ]
  Depot:
    type: object
    properties:
      depotId: string
      city: string

/depots:
  get:
    responses:
      200:
        body:
          type: Depot[]
`,
  keyPoints: [
    'Any placeholder in baseUri other than {version} is described under baseUriParameters.',
    '{version} is filled in from the version key, so it is not declared.',
    'A base URI parameter is a normal type declaration, so it can use a named type with an enum.',
    'protocols is a list. Leave HTTP out and the contract says it is not offered.',
  ],
  solution: `
\`{region}\` turns three host names into one contract. The \`Region\` enum tells callers which hosts exist, so nobody has to guess.

\`protocols: [ HTTPS ]\` makes the security rule part of the contract. The base URI already starts with \`https\`, but stating it removes any doubt, and tools can read it.

\`{version}\` needs no declaration, because the \`version\` key fills it in.
`,
  followUps: [
    {
      q: 'What happens if you leave protocols out?',
      a: 'The protocol in the baseUri is used, here HTTPS. Stating protocols makes the decision explicit and is needed if the API offers both.',
    },
    {
      q: 'Can one method use a different protocol from the rest of the API?',
      a: 'Yes. A method can have its own protocols key, which overrides the value at the top of the file.',
    },
    {
      q: 'Why use one API with a region parameter and not three API specifications?',
      a: 'The resources and types are identical in every region. One contract keeps them in step, and only the host changes.',
    },
  ],
}
