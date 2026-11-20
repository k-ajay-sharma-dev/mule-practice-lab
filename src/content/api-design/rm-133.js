export default {
  id: 'rm-133',
  category: 'api-design',
  title: 'Bike Share Docks API: Find Docks Near a Point with Shared Latitude and Longitude Types',
  level: 'INTERMEDIATE',
  tags: ['raml', 'api-design', 'geo-search', 'query-parameters', 'data-types', 'facets', 'transport'],
  estMinutes: 20,
  description: `
Cycleway City Bikes runs 600 docking stations. Its app shows the docks near the rider, with how many bikes and free spaces each one has.

The old search took \`lat\` and \`lon\` as plain strings. Riders' phones sometimes sent \`0,0\` or swapped the two, and the API searched the sea off West Africa. The new contract types every coordinate, so bad values fail with 400 before any search runs.

A latitude is always between -90 and 90, and a longitude between -180 and 180. The same limits apply in the query and in the response, so each one is a **named scalar type** used in both places.

**Requirements**
- Title \`Bike Share Docks API\`, with JSON as the default media type.
- A type \`Latitude\`: a number from -90 to 90.
- A type \`Longitude\`: a number from -180 to 180.
- A type \`GeoPoint\` with required properties \`lat\` of type \`Latitude\` and \`lon\` of type \`Longitude\`.
- A type \`Dock\` with a required string \`dockId\`, a required \`location\` of type \`GeoPoint\`, required integers \`bikesAvailable\` and \`spacesFree\` (each at least 0), and a required integer \`distanceMetres\` of at least 0.
- A type \`Error\` with a required string \`message\`.
- \`GET /docks/nearby\` has query parameters:
  - \`lat\`: required, of type \`Latitude\`.
  - \`lon\`: required, of type \`Longitude\`.
  - \`radiusKm\`: optional number from 0.1 to 10, default 1.
  - \`limit\`: optional integer from 1 to 50, default 10.
- It returns \`Dock[]\` with 200 and an \`Error\` with 400.
`,
  starter: `#%RAML 1.0
title: Bike Share Docks API
mediaType: application/json

types:
  Dock:
    type: object
    properties:
      dockId: string
      lat: string
      lon: string

/docks:
  /nearby:
    get:
      queryParameters:
        lat: string
        lon: string
      responses:
        200:
          body:
            type: Dock[]
`,
  ramlChecks: [
    {
      label: 'The title is Bike Share Docks API and JSON is the default',
      rule: { type: 'all', rules: [{ type: 'root', key: 'title', want: 'Bike Share Docks API' }, { type: 'root', key: 'mediaType', want: 'application/json' }] },
    },
    {
      label: 'Latitude is a number from -90 to 90, and Longitude from -180 to 180',
      rule: {
        type: 'all',
        rules: [
          { type: 'typeDecl', name: 'Latitude', want: { type: 'number', minimum: -90, maximum: 90 } },
          { type: 'typeDecl', name: 'Longitude', want: { type: 'number', minimum: -180, maximum: 180 } },
        ],
      },
    },
    {
      label: 'GeoPoint has a required Latitude lat and Longitude lon',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'GeoPoint', prop: 'lat', want: { type: 'Latitude', required: true } },
          { type: 'prop', typeName: 'GeoPoint', prop: 'lon', want: { type: 'Longitude', required: true } },
        ],
      },
    },
    {
      label: 'Dock has a dockId and a GeoPoint location',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Dock', prop: 'dockId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Dock', prop: 'location', want: { type: 'GeoPoint', required: true } },
        ],
      },
    },
    {
      label: 'bikesAvailable, spacesFree and distanceMetres are required integers of at least 0',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Dock', prop: 'bikesAvailable', want: { type: 'integer', required: true, minimum: 0 } },
          { type: 'prop', typeName: 'Dock', prop: 'spacesFree', want: { type: 'integer', required: true, minimum: 0 } },
          { type: 'prop', typeName: 'Dock', prop: 'distanceMetres', want: { type: 'integer', required: true, minimum: 0 } },
        ],
      },
    },
    {
      label: 'lat and lon are required query parameters of type Latitude and Longitude',
      rule: {
        type: 'all',
        rules: [
          { type: 'param', path: '/docks/nearby', method: 'get', in: 'query', name: 'lat', want: { type: 'Latitude', required: true } },
          { type: 'param', path: '/docks/nearby', method: 'get', in: 'query', name: 'lon', want: { type: 'Longitude', required: true } },
        ],
      },
    },
    {
      label: 'radiusKm is an optional number from 0.1 to 10, default 1',
      rule: { type: 'param', path: '/docks/nearby', method: 'get', in: 'query', name: 'radiusKm', want: { type: 'number', required: false, minimum: 0.1, maximum: 10, default: 1 } },
    },
    {
      label: 'limit is an optional integer from 1 to 50, default 10',
      rule: { type: 'param', path: '/docks/nearby', method: 'get', in: 'query', name: 'limit', want: { type: 'integer', required: false, minimum: 1, maximum: 50, default: 10 } },
    },
    {
      label: 'GET /docks/nearby returns Dock[] with 200 and an Error with 400',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/docks/nearby', method: 'get', status: '200', typeIs: 'Dock[]' },
          { type: 'response', path: '/docks/nearby', method: 'get', status: '400', typeIs: 'Error' },
          { type: 'prop', typeName: 'Error', prop: 'message', want: { type: 'string', required: true } },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Bike Share Docks API
version: v1
baseUri: https://api.example.com/bikes/{version}
mediaType: application/json

types:
  Latitude:
    type: number
    minimum: -90
    maximum: 90
    description: Degrees north of the equator. Negative values are south.
  Longitude:
    type: number
    minimum: -180
    maximum: 180
    description: Degrees east of Greenwich. Negative values are west.
  GeoPoint:
    type: object
    properties:
      lat: Latitude
      lon: Longitude
  Dock:
    type: object
    properties:
      dockId: string
      location: GeoPoint
      bikesAvailable:
        type: integer
        minimum: 0
      spacesFree:
        type: integer
        minimum: 0
      distanceMetres:
        type: integer
        minimum: 0
    example:
      dockId: DK-0217
      location:
        lat: 53.4794
        lon: -2.2453
      bikesAvailable: 6
      spacesFree: 9
      distanceMetres: 240
  Error:
    type: object
    properties:
      message: string

/docks:
  /nearby:
    get:
      description: Docks within radiusKm of the point, nearest first.
      queryParameters:
        lat:
          type: Latitude
        lon:
          type: Longitude
        radiusKm?:
          type: number
          minimum: 0.1
          maximum: 10
          default: 1
        limit?:
          type: integer
          minimum: 1
          maximum: 50
          default: 10
      responses:
        200:
          body:
            type: Dock[]
        400:
          description: A coordinate is out of range, or radiusKm or limit is not allowed.
          body:
            type: Error
`,
  keyPoints: [
    'A named scalar type, such as a number with limits, can be reused in query parameters and in object properties.',
    'Typing coordinates as numbers with ranges makes bad values fail with 400 before any search runs.',
    'Latitude runs from -90 to 90 and longitude from -180 to 180.',
    'A maximum on radius and limit keeps each search small.',
    'Returning the distance saves every client from working it out again.',
  ],
  solution: `
**Named scalar types.** \`Latitude\` and \`Longitude\` are not objects. They are numbers with limits. Because they have names, the same limits apply to the \`lat\` query parameter and to \`GeoPoint.lat\` in the response. If the rule changes, it changes in one place.

**What the types catch.** A latitude of 182 or a longitude of -300 now fails with 400. Swapped values are caught only when the longitude is outside -90 to 90, such as 120. Near this city both swapped numbers are in range, so the app must still send them the right way round. A value such as \`0,0\` is a valid point, so the API cannot refuse it. The app should not send a point it does not have.

**Limits on the search.** \`radiusKm\` stops at 10 and \`limit\` at 50. A caller cannot ask for every dock in the city in one call, which keeps the search fast for everyone.

**Distance in the answer.** The server already knows the distance from the search. Returning \`distanceMetres\` saves every app from working it out, and keeps the numbers the same on every screen.

**A nested resource.** \`/docks/nearby\` sits under \`/docks\`, so a later \`/docks/{dockId}\` fits beside it.
`,
  followUps: [
    {
      q: 'Why not take the point as one parameter, such as near=53.47,-2.24?',
      a: 'One parameter needs a pattern, and the range check would be lost in it. Two typed numbers let RAML check each range and give a clear message for the one that is wrong.',
    },
    {
      q: 'How many decimal places should a coordinate have?',
      a: 'Four or five places are close to ten metres or one metre, which is enough to find a dock. More places add bytes but no real accuracy from a phone.',
    },
    {
      q: 'How would you also let riders search by postcode?',
      a: 'Turn the postcode into a point first, either in a separate lookup API or in the implementation. Keep one search that takes a point, so the distance logic lives in one place.',
    },
  ],
}
