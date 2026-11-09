export default {
  id: 'rm-076',
  category: 'api-design',
  title: 'Fleet API: collection and item Resource Types Named from the Path',
  level: 'INTERMEDIATE',
  tags: ['raml', 'api-design', 'resource-types', 'parameters', 'reuse', 'logistics'],
  estMinutes: 25,
  description: `
A delivery company runs 8,000 vans and 11,000 drivers. Vans and drivers are managed in the same way: list, add, read, replace and remove. Two hand-written copies of the same resources drift apart, and last month the drivers list lost its 404.

A **resource type** describes the methods of a kind of resource once. A resource uses it with \`type: collection\`.

Inside a resource type, \`<<resourcePathName>>\` is the last part of the path, with URI parameters left out. On \`/vehicles\` and on \`/vehicles/{vehicleId}\` it is \`vehicles\`. Functions change the value: \`<<resourcePathName | !singularize | !uppercamelcase>>\` turns \`vehicles\` into \`Vehicle\`. So the resource type can name the right data type with no parameters at all.

**Requirements**
- Title \`Fleet API\`, with JSON as the default media type.
- \`Vehicle\` with required strings \`vehicleId\` and \`registration\`, and a required number \`capacityKg\`.
- \`Driver\` with required strings \`driverId\` and \`name\`, and a required string \`licenceClass\` that only allows \`B\`, \`C1\` and \`C\`.
- A resource type \`collection\`:
  - \`get\` returns a list of the type named from the path, with status 200.
  - \`post\` takes that type and returns 201.
- A resource type \`item\`:
  - \`get\` returns the type named from the path, or 404.
  - \`put\` takes that type and returns 200.
  - \`delete\` returns 204.
- \`/vehicles\` and \`/drivers\` use \`collection\`. \`/vehicles/{vehicleId}\` and \`/drivers/{driverId}\` use \`item\`.
- Methods and responses come from the resource types, so do not write them on the resources.
`,
  starter: `#%RAML 1.0
title: Fleet API
mediaType: application/json

types:

resourceTypes:
  collection:
  item:

/vehicles:
  /{vehicleId}:

/drivers:
  /{driverId}:
`,
  ramlChecks: [
    {
      label: 'The collection resource type has a get with a 200 and a post with a body',
      rule: { type: 'resourceType', name: 'collection', has: ['get.responses.200', 'post.body', 'post.responses.201'] },
    },
    {
      label: 'The item resource type has get with 404, put with a body, and delete with 204',
      rule: { type: 'resourceType', name: 'item', has: ['get.responses.404', 'put.body', 'delete.responses.204'] },
    },
    {
      label: '/vehicles uses collection, and its methods come from there',
      rule: { type: 'typed', path: '/vehicles', resourceType: 'collection', provides: ['get.responses.200', 'post.body'] },
    },
    { label: 'GET /vehicles returns Vehicle[]', rule: { type: 'response', path: '/vehicles', method: 'get', status: '200', typeIs: 'Vehicle[]' } },
    {
      label: 'POST /vehicles takes a Vehicle and returns 201',
      rule: {
        type: 'all',
        rules: [
          { type: 'body', path: '/vehicles', method: 'post', typeIs: 'Vehicle' },
          { type: 'response', path: '/vehicles', method: 'post', status: '201' },
        ],
      },
    },
    {
      label: '/vehicles/{vehicleId} uses item, and its methods come from there',
      rule: { type: 'typed', path: '/vehicles/{}', resourceType: 'item', provides: ['get.responses.200', 'get.responses.404', 'delete.responses.204'] },
    },
    {
      label: 'GET /vehicles/{vehicleId} returns a Vehicle or 404, and PUT takes a Vehicle',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/vehicles/{}', method: 'get', status: '200', typeIs: 'Vehicle' },
          { type: 'response', path: '/vehicles/{}', method: 'get', status: '404' },
          { type: 'body', path: '/vehicles/{}', method: 'put', typeIs: 'Vehicle' },
        ],
      },
    },
    { label: 'DELETE /vehicles/{vehicleId} returns 204 with no body', rule: { type: 'response', path: '/vehicles/{}', method: 'delete', status: '204', noBody: true } },
    {
      label: '/drivers uses collection and /drivers/{driverId} uses item',
      rule: {
        type: 'all',
        rules: [
          { type: 'typed', path: '/drivers', resourceType: 'collection', provides: ['get.responses.200'] },
          { type: 'typed', path: '/drivers/{}', resourceType: 'item', provides: ['get.responses.404'] },
        ],
      },
    },
    {
      label: 'GET /drivers returns Driver[] and GET /drivers/{driverId} returns a Driver or 404',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/drivers', method: 'get', status: '200', typeIs: 'Driver[]' },
          { type: 'response', path: '/drivers/{}', method: 'get', status: '200', typeIs: 'Driver' },
          { type: 'response', path: '/drivers/{}', method: 'get', status: '404' },
        ],
      },
    },
    { label: 'Driver.licenceClass only allows B, C1 and C', rule: { type: 'prop', typeName: 'Driver', prop: 'licenceClass', want: { required: true, enum: { exactly: ['B', 'C1', 'C'] } } } },
  ],
  referenceRaml: `#%RAML 1.0
title: Fleet API
mediaType: application/json

types:
  Vehicle:
    type: object
    properties:
      vehicleId: string
      registration: string
      capacityKg: number
  Driver:
    type: object
    properties:
      driverId: string
      name: string
      licenceClass:
        type: string
        enum: [ B, C1, C ]

resourceTypes:
  collection:
    usage: A list of <<resourcePathName>> that callers can add to.
    get:
      description: List the <<resourcePathName>>.
      responses:
        200:
          body:
            type: <<resourcePathName | !singularize | !uppercamelcase>>[]
    post:
      description: Add a <<resourcePathName | !singularize>>.
      body:
        type: <<resourcePathName | !singularize | !uppercamelcase>>
      responses:
        201:
          description: The <<resourcePathName | !singularize>> was added.
  item:
    usage: One member of a collection.
    get:
      responses:
        200:
          body:
            type: <<resourcePathName | !singularize | !uppercamelcase>>
        404:
          description: No <<resourcePathName | !singularize>> has this id.
    put:
      body:
        type: <<resourcePathName | !singularize | !uppercamelcase>>
      responses:
        200:
          description: The <<resourcePathName | !singularize>> was replaced.
    delete:
      responses:
        204:
          description: The <<resourcePathName | !singularize>> was removed.

/vehicles:
  type: collection
  /{vehicleId}:
    type: item

/drivers:
  type: collection
  /{driverId}:
    type: item
`,
  keyPoints: [
    '<<resourcePathName>> is the last path segment that is not a URI parameter.',
    'Functions are chained with |, such as !singularize then !uppercamelcase.',
    'A resource type built from the path needs no parameters when the type names follow the paths.',
    'Methods and responses written in the resource type are merged into each resource that uses it.',
  ],
  solution: `
The API file is now mostly types and four short resources. Everything about how a collection and an item behave lives in the two resource types.

On \`/drivers/{driverId}\`, \`<<resourcePathName>>\` is \`drivers\`, because the URI parameter is skipped. \`!singularize\` makes \`driver\`, and \`!uppercamelcase\` makes \`Driver\`, which is the name of the type.

This only works when the type names follow the paths. A resource called \`/people\` with a type \`Person\` would need a parameter instead, such as \`type: { collection: { itemType: Person } }\`.

The 404 that drivers lost last month cannot go missing again. It is written once, in \`item\`.
`,
  followUps: [
    {
      q: 'What if one resource must not offer delete?',
      a: 'Mark the method optional in the resource type with delete?. It then appears only on resources that write delete themselves.',
    },
    {
      q: 'Which reserved parameters can a resource type use?',
      a: 'A resource type can use <<resourcePath>> and <<resourcePathName>>. Inside a method of the resource type, <<methodName>> is also there.',
    },
    {
      q: 'When is a parameter better than <<resourcePathName>>?',
      a: 'When the path and the type name differ, such as /people and Person, or /fleet-vans and Vehicle. A parameter states the type plainly and survives a change to the path.',
    },
    {
      q: 'Can a resource add something the resource type does not have?',
      a: 'Yes. Anything written on the resource is merged with the resource type, and the resource wins where both set the same key.',
    },
  ],
}
