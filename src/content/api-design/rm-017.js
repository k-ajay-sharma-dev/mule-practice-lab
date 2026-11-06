export default {
  id: 'rm-017',
  category: 'api-design',
  title: 'Depot API: A Resource Type with Parameters',
  level: 'INTERMEDIATE',
  tags: ['raml', 'api-design', 'resource-types', 'parameters', 'logistics'],
  estMinutes: 20,
  description: `
A logistics company has depots and carriers. Both are managed the same way: list them, add one, read one. Writing that pattern twice means two copies to keep in step.

A **resource type** holds a resource pattern once. It can take **parameters**, written \`<<name>>\`, and each resource fills them in when it applies the type. RAML also fills some parameters for you. \`<<resourcePathName>>\` is the last part of the path with no URI parameter, so it is \`depots\` for \`/depots\`. A **function** changes the value: \`<<resourcePathName | !singularize>>\` gives \`depot\`.

**Requirements**
- Title \`Depot API\`, with JSON as the default media type.
- A type \`Depot\` with required strings \`depotId\` and \`city\`.
- A type \`Carrier\` with required strings \`carrierId\` and \`name\`.
- A resource type \`collection\` that takes the item type as a parameter. Its \`get\` returns a list of that type with status 200. Its \`post\` takes one of that type and returns 201.
- The \`get\` in \`collection\` has an optional string query parameter named after the singular resource, followed by \`Code\`. Write it once with \`<<resourcePathName | !singularize>>Code\`, so \`/depots\` gets \`depotCode\` and \`/carriers\` gets \`carrierCode\`.
- A resource type \`item\` that also takes the item type. Its \`get\` returns one of that type with status 200, or 404.
- \`/depots\` and \`/carriers\` use \`collection\`.
- \`/depots/{depotId}\` and \`/carriers/{carrierId}\` use \`item\`.
`,
  starter: `#%RAML 1.0
title: Depot API
mediaType: application/json

types:

resourceTypes:
  collection:

  item:

/depots:
`,
  ramlChecks: [
    {
      label: 'The title is Depot API and JSON is the default media type',
      rule: {
        type: 'all',
        rules: [
          { type: 'root', key: 'title', want: 'Depot API' },
          { type: 'root', key: 'mediaType', want: 'application/json' },
        ],
      },
    },
    {
      label: 'Depot has required strings depotId and city',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Depot', prop: 'depotId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Depot', prop: 'city', want: { type: 'string', required: true } },
        ],
      },
    },
    {
      label: 'Carrier has required strings carrierId and name',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Carrier', prop: 'carrierId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Carrier', prop: 'name', want: { type: 'string', required: true } },
        ],
      },
    },
    {
      label: '/depots and /carriers use the collection resource type',
      rule: {
        type: 'all',
        rules: [
          { type: 'resourceType', name: 'collection' },
          { type: 'typed', path: '/depots', resourceType: 'collection' },
          { type: 'typed', path: '/carriers', resourceType: 'collection' },
        ],
      },
    },
    {
      label: '/depots/{depotId} and /carriers/{carrierId} use the item resource type',
      rule: {
        type: 'all',
        rules: [
          { type: 'resourceType', name: 'item' },
          { type: 'typed', path: '/depots/{}', resourceType: 'item' },
          { type: 'typed', path: '/carriers/{}', resourceType: 'item' },
        ],
      },
    },
    {
      label: 'The list response gets its type from the parameter: Depot[] and Carrier[]',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/depots', method: 'get', status: '200', typeIs: 'Depot[]' },
          { type: 'response', path: '/carriers', method: 'get', status: '200', typeIs: 'Carrier[]' },
        ],
      },
    },
    {
      label: 'POST takes one item and returns 201 on both collections',
      rule: {
        type: 'all',
        rules: [
          { type: 'body', path: '/depots', method: 'post', typeIs: 'Depot' },
          { type: 'response', path: '/depots', method: 'post', status: '201' },
          { type: 'body', path: '/carriers', method: 'post', typeIs: 'Carrier' },
          { type: 'response', path: '/carriers', method: 'post', status: '201' },
        ],
      },
    },
    {
      label: '!singularize gives GET /depots an optional depotCode and GET /carriers an optional carrierCode',
      rule: {
        type: 'all',
        rules: [
          { type: 'param', path: '/depots', method: 'get', in: 'query', name: 'depotCode', want: { type: 'string', required: false } },
          { type: 'param', path: '/carriers', method: 'get', in: 'query', name: 'carrierCode', want: { type: 'string', required: false } },
        ],
      },
    },
    {
      label: 'GET on one depot or carrier returns that type, or 404',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/depots/{}', method: 'get', status: '200', typeIs: 'Depot' },
          { type: 'response', path: '/depots/{}', method: 'get', status: '404' },
          { type: 'response', path: '/carriers/{}', method: 'get', status: '200', typeIs: 'Carrier' },
          { type: 'response', path: '/carriers/{}', method: 'get', status: '404' },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Depot API
mediaType: application/json

types:
  Depot:
    type: object
    properties:
      depotId: string
      city: string
  Carrier:
    type: object
    properties:
      carrierId: string
      name: string

resourceTypes:
  collection:
    get:
      description: List the <<resourcePathName>>.
      queryParameters:
        <<resourcePathName | !singularize>>Code?:
          type: string
      responses:
        200:
          body:
            type: <<itemType>>[]
    post:
      description: Add one <<resourcePathName | !singularize>>.
      body:
        type: <<itemType>>
      responses:
        201:
          description: The <<resourcePathName | !singularize>> was added.
  item:
    get:
      description: Get one <<resourcePathName | !singularize>>.
      responses:
        200:
          body:
            type: <<itemType>>
        404:
          description: No <<resourcePathName | !singularize>> has this id.

/depots:
  type: { collection: { itemType: Depot } }
  /{depotId}:
    type: { item: { itemType: Depot } }

/carriers:
  type: { collection: { itemType: Carrier } }
  /{carrierId}:
    type: { item: { itemType: Carrier } }
`,
  keyPoints: [
    'A resource type parameter is written <<name>> and filled in where the type is applied.',
    'To pass a value, apply the type as a map: type: { collection: { itemType: Depot } }.',
    '<<resourcePathName>> is reserved, so RAML fills it in and you never pass it.',
    '<<resourcePathName>> skips URI parameters, so /depots/{depotId} also gives depots.',
    '!singularize turns depots into depot. A parameter can appear in a key as well as in a value.',
  ],
  solution: `
Each resource is now one line. The pattern lives in \`collection\` and \`item\`, so a change to it reaches every resource.

\`itemType\` is passed in because a type name is a choice, not something the path can always tell you. \`<<resourcePathName | !singularize>>\` needs no input, so it suits the \`depotCode\` query parameter and the descriptions.

Note the shape of \`type\` on a resource. With no parameters it is a name, as in \`type: collection\`. With parameters it is a map of the name to its values.
`,
  followUps: [
    {
      q: 'Which parameters does RAML fill in for you?',
      a: 'resourcePath and resourcePathName, in both resource types and traits. Traits also get methodName. Everything else must be passed where the type or trait is applied.',
    },
    {
      q: 'What happens if a resource states its own get as well as using collection?',
      a: 'The two are merged, and what the resource states itself wins. So one resource can add a response or change a description and still reuse the pattern.',
    },
    {
      q: 'How do you make a method optional in a resource type?',
      a: 'Add a question mark, as in delete?. The method is then only added to resources that declare delete themselves.',
    },
  ],
}
