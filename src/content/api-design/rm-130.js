export default {
  id: 'rm-130',
  category: 'api-design',
  title: 'Pet Records Experience API: Sparse Fields and Expand for a Mobile App',
  level: 'EXPERT',
  tags: ['raml', 'api-design', 'experience-api', 'sparse-fieldsets', 'expand', 'trait-parameters', 'libraries', 'security', 'scopes', 'veterinary'],
  estMinutes: 40,
  description: `
Meadowbank Vets has 30 clinics. Its mobile app shows a pet list, a pet card, and a pet's visit history. Today each screen calls \`GET /pets/{petId}\` and gets every field, then calls the owner and visit APIs one by one. On a weak signal the pet card takes six seconds.

The new **Experience API** lets the app shape each response:

- \`fields\` names the pet fields to return. \`petId\` always comes back. With no \`fields\`, every field comes back.
- \`expand\` asks for related records inside the pet: \`owner\` and \`visits\`. Without it, the pet carries only \`ownerId\`.

Both parameters are lists of values from a fixed set, so a typo fails fast with 400 instead of being ignored. They sit in one trait that takes the allowed values as **parameters**, so other resources can reuse it with their own field lists.

The organisation keeps its error type and its OAuth 2.0 scheme in a shared library. Reading pets needs the \`pets.read\` scope. Expanding the owner shows personal data, so the server also needs \`owners.read\` for \`expand=owner\` and answers 403 without it.

This problem has two files. Use the tabs above the editor to move between them.

**Requirements for \`libraries/common.raml\`**
- A type \`Problem\` with a required string \`title\`, a required integer \`status\`, and an optional string \`detail\`.
- An OAuth 2.0 security scheme \`oauth\` with the token URL \`https://auth.example.com/oauth2/token\` and the \`authorization_code\` grant.

**Requirements for \`api.raml\`**
- Title \`Pet Records Experience API\`, with JSON as the default media type.
- Bring in the library with the prefix \`common\`. \`Problem\` lives only in the library.
- A type \`PetField\`: a string that is one of \`name\`, \`species\`, \`dateOfBirth\`, \`ownerId\`, \`microchip\`.
- A type \`PetExpansion\`: a string that is one of \`owner\`, \`visits\`.
- Types \`Owner\` (required strings \`ownerId\` and \`fullName\`) and \`Visit\` (a required string \`visitId\`, a required \`date\` with no time, and a required string \`reason\`).
- A type \`Pet\` with a required string \`petId\`. Every other property is optional: \`name\`, \`species\`, \`dateOfBirth\` (a date with no time), \`ownerId\`, \`microchip\`, \`owner\` of type \`Owner\`, and \`visits\` as an array of \`Visit\`.
- A trait \`shaped\` with two parameters, \`fieldType\` and \`expandType\`. It adds optional query parameters \`fields\` (an array of \`<<fieldType>>\` with no repeats) and \`expand\` (an array of \`<<expandType>>\` with no repeats).
- \`GET /pets\` and \`GET /pets/{petId}\` use \`shaped\` with \`PetField\` and \`PetExpansion\`, and are secured by \`common.oauth\` with the scope \`pets.read\`. Neither can be called without a token.
- \`GET /pets\` returns \`Pet[]\` with 200, and a \`common.Problem\` with 400 and 403.
- \`GET /pets/{petId}\` returns a \`Pet\` with 200 and its own example of a sparse pet, and a \`common.Problem\` with 403 and 404.
`,
  starter: `#%RAML 1.0
title: Pet Records Experience API
mediaType: application/json

uses:

types:
  Pet:
    type: object
    properties:
      petId: string
      name: string
      species: string
      dateOfBirth: date-only
      ownerId: string
      microchip: string

/pets:
  get:
    queryParameters:
      fields?: string
  /{petId}:
    get:
`,
  files: {
    'libraries/common.raml': `#%RAML 1.0 Library
usage: Shared error type and security for every Meadowbank API.

types:

securitySchemes:
`,
  },
  ramlChecks: [
    {
      label: 'The title is Pet Records Experience API and JSON is the default',
      rule: { type: 'all', rules: [{ type: 'root', key: 'title', want: 'Pet Records Experience API' }, { type: 'root', key: 'mediaType', want: 'application/json' }] },
    },
    {
      label: 'The API brings in libraries/common.raml as common, and Problem lives only there',
      rule: {
        type: 'all',
        rules: [
          { type: 'library', prefix: 'common', file: 'libraries/common.raml' },
          { type: 'prop', typeName: 'common.Problem', prop: 'title', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'common.Problem', prop: 'status', want: { type: 'integer', required: true } },
          { type: 'prop', typeName: 'common.Problem', prop: 'detail', want: { type: 'string', required: false } },
          { type: 'noType', name: 'Problem' },
        ],
      },
    },
    {
      label: 'PetField and PetExpansion allow only their values',
      rule: {
        type: 'all',
        rules: [
          { type: 'typeDecl', name: 'PetField', want: { enum: { exactly: ['name', 'species', 'dateOfBirth', 'ownerId', 'microchip'] } } },
          { type: 'typeDecl', name: 'PetExpansion', want: { enum: { exactly: ['owner', 'visits'] } } },
        ],
      },
    },
    {
      label: 'Owner and Visit have their required properties',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Owner', prop: 'ownerId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Owner', prop: 'fullName', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Visit', prop: 'visitId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Visit', prop: 'date', want: { type: 'date-only', required: true } },
          { type: 'prop', typeName: 'Visit', prop: 'reason', want: { type: 'string', required: true } },
        ],
      },
    },
    {
      label: 'Pet has a required petId and every other field is optional',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Pet', prop: 'petId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Pet', prop: 'name', want: { required: false } },
          { type: 'prop', typeName: 'Pet', prop: 'species', want: { required: false } },
          { type: 'prop', typeName: 'Pet', prop: 'dateOfBirth', want: { type: 'date-only', required: false } },
          { type: 'prop', typeName: 'Pet', prop: 'ownerId', want: { required: false } },
          { type: 'prop', typeName: 'Pet', prop: 'microchip', want: { required: false } },
        ],
      },
    },
    {
      label: 'Pet can carry an optional Owner and an optional list of Visit',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Pet', prop: 'owner', want: { type: 'Owner', required: false } },
          { type: 'prop', typeName: 'Pet', prop: 'visits', want: { type: 'Visit[]', required: false } },
        ],
      },
    },
    {
      label: 'The shaped trait holds fields and expand',
      rule: {
        type: 'all',
        rules: [
          { type: 'trait', name: 'shaped', has: 'queryParameters.fields' },
          { type: 'trait', name: 'shaped', has: 'queryParameters.expand' },
        ],
      },
    },
    {
      label: 'GET /pets uses shaped, giving optional PetField[] fields and PetExpansion[] expand with no repeats',
      rule: {
        type: 'all',
        rules: [
          { type: 'applied', path: '/pets', method: 'get', trait: 'shaped' },
          { type: 'param', path: '/pets', method: 'get', in: 'query', name: 'fields', want: { type: 'PetField[]', required: false, uniqueItems: true } },
          { type: 'param', path: '/pets', method: 'get', in: 'query', name: 'expand', want: { type: 'PetExpansion[]', required: false, uniqueItems: true } },
        ],
      },
    },
    {
      label: 'GET /pets/{petId} uses shaped in the same way',
      rule: {
        type: 'all',
        rules: [
          { type: 'applied', path: '/pets/{}', method: 'get', trait: 'shaped' },
          { type: 'param', path: '/pets/{}', method: 'get', in: 'query', name: 'fields', want: { type: 'PetField[]', required: false, uniqueItems: true } },
          { type: 'param', path: '/pets/{}', method: 'get', in: 'query', name: 'expand', want: { type: 'PetExpansion[]', required: false, uniqueItems: true } },
        ],
      },
    },
    {
      label: 'Both reads need common.oauth with pets.read and no anonymous access',
      rule: {
        type: 'all',
        rules: [
          { type: 'scheme', schemeType: 'OAuth 2.0', values: { 'settings.accessTokenUri': 'https://auth.example.com/oauth2/token', 'settings.authorizationGrants': ['authorization_code'] } },
          { type: 'secured', path: '/pets', method: 'get', scheme: 'common.oauth', scopes: ['pets.read'], required: true },
          { type: 'secured', path: '/pets/{}', method: 'get', scheme: 'common.oauth', scopes: ['pets.read'], required: true },
        ],
      },
    },
    {
      label: 'GET /pets returns Pet[] with 200, and common.Problem with 400 and 403',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/pets', method: 'get', status: '200', typeIs: 'Pet[]' },
          { type: 'response', path: '/pets', method: 'get', status: '400', typeIs: 'common.Problem' },
          { type: 'response', path: '/pets', method: 'get', status: '403', typeIs: 'common.Problem' },
        ],
      },
    },
    {
      label: 'GET /pets/{petId} returns a Pet with its own example, and common.Problem with 403 and 404',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/pets/{}', method: 'get', status: '200', typeIs: 'Pet', example: 'own' },
          { type: 'response', path: '/pets/{}', method: 'get', status: '403', typeIs: 'common.Problem' },
          { type: 'response', path: '/pets/{}', method: 'get', status: '404', typeIs: 'common.Problem' },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Pet Records Experience API
version: v1
baseUri: https://api.example.com/pet-app/{version}
mediaType: application/json

uses:
  common: libraries/common.raml

types:
  PetField:
    type: string
    enum: [ name, species, dateOfBirth, ownerId, microchip ]
  PetExpansion:
    type: string
    enum: [ owner, visits ]
  Owner:
    type: object
    properties:
      ownerId: string
      fullName: string
  Visit:
    type: object
    properties:
      visitId: string
      date: date-only
      reason: string
  Pet:
    type: object
    properties:
      petId: string
      name?: string
      species?:
        type: string
        enum: [ DOG, CAT, RABBIT, OTHER ]
      dateOfBirth?: date-only
      ownerId?: string
      microchip?:
        type: string
        pattern: ^[0-9]{15}$
      owner?: Owner
      visits?: Visit[]

traits:
  shaped:
    usage: Lets the client choose fields and related records. Pass the allowed values as parameters.
    queryParameters:
      fields?:
        type: <<fieldType>>[]
        uniqueItems: true
        description: The fields of the <<resourcePathName | !singularize>> to return. The id always comes back. Leave it out for every field.
      expand?:
        type: <<expandType>>[]
        uniqueItems: true
        description: Related records to put inside the <<resourcePathName | !singularize>>.

/pets:
  get:
    is: [ shaped: { fieldType: PetField, expandType: PetExpansion } ]
    securedBy: [ common.oauth: { scopes: [ pets.read ] } ]
    responses:
      200:
        body:
          type: Pet[]
      400:
        description: A fields or expand value is not in the allowed list.
        body:
          type: common.Problem
      403:
        description: expand=owner needs the owners.read scope too.
        body:
          type: common.Problem
  /{petId}:
    get:
      is: [ shaped: { fieldType: PetField, expandType: PetExpansion } ]
      securedBy: [ common.oauth: { scopes: [ pets.read ] } ]
      responses:
        200:
          body:
            type: Pet
            example:
              petId: PET-20931
              name: Biscuit
              visits:
                - visitId: V-88120
                  date: 2026-10-02
                  reason: Annual vaccination
        403:
          description: expand=owner needs the owners.read scope too.
          body:
            type: common.Problem
        404:
          body:
            type: common.Problem
`,
  referenceFiles: {
    'libraries/common.raml': `#%RAML 1.0 Library
usage: Shared error type and security for every Meadowbank API.

types:
  Problem:
    type: object
    properties:
      title: string
      status: integer
      detail?: string

securitySchemes:
  oauth:
    type: OAuth 2.0
    description: Tokens from the Meadowbank sign-in service.
    settings:
      accessTokenUri: https://auth.example.com/oauth2/token
      authorizationGrants: [ authorization_code ]
`,
  },
  keyPoints: [
    'A fields parameter lets a client ask only for the data a screen shows, which makes responses smaller.',
    'An expand parameter puts related records inside the response, which saves round trips on a slow network.',
    'Typing both as arrays of an enum makes a typo fail with 400 instead of being ignored.',
    'uniqueItems: true refuses the same value twice.',
    'Trait parameters let one trait carry different allowed values for each resource.',
    'Every field except the id is optional, because a sparse response may leave any of them out.',
    'Expanding personal data can need its own scope, checked by the server, with 403 when it is missing.',
  ],
  solution: `
**Why shape responses here.** This is an Experience API for one app on mobile networks. The list screen needs the name and species. The card needs the owner and the last visits. Without \`fields\` and \`expand\`, the card cost one large pet call, one owner call and one visits call. Now it is one call: \`GET /pets/PET-20931?fields=name&expand=visits\`.

**Typed lists.** \`fields\` is \`PetField[]\`, so \`fields=nmae\` fails with 400 and the developer sees the mistake at once. A plain string would be ignored on the server, and the app would get a pet with no name and no clue why. \`uniqueItems: true\` refuses \`fields=name&fields=name\`.

**One trait, many resources.** \`shaped\` does not know about pets. It takes \`fieldType\` and \`expandType\` as parameters. A future \`/clinics\` resource can use \`shaped: { fieldType: ClinicField, expandType: ClinicExpansion }\`. \`<<resourcePathName | !singularize>>\` makes the description read "fields of the pet".

**Everything optional.** If \`name\` were required, the response to \`fields=species\` would break the contract. Only \`petId\` is always there, so the client can match records.

**The example.** The 200 example shows a real sparse answer: the id, the name and the expanded visits, nothing else.

**Security.** The library holds \`oauth\`, so every Meadowbank API shares one scheme. Both reads need \`pets.read\`. The extra rule for \`expand=owner\` depends on a query value, which RAML cannot express, so it is written in the 403 description and checked in the implementation.
`,
  followUps: [
    {
      q: 'Does sparse fields make the back end faster as well?',
      a: 'Only if the implementation passes the field list down, for example by selecting fewer columns or calling fewer systems. If it fetches everything and trims at the end, the network saves bytes but the back end does the same work.',
    },
    {
      q: 'Why not use GraphQL instead?',
      a: 'GraphQL gives clients full control of the shape, and suits many screens with changing needs. For one app with a few screens, two typed query parameters give most of the gain while keeping a REST contract, HTTP caching, and the same gateway policies as the other APIs.',
    },
    {
      q: 'How do fields and expand affect caching?',
      a: 'Each combination is a different URL, so caches store each one apart. Ask clients to send values in a fixed order, or sort them at the gateway, so the same request does not fill the cache twice.',
    },
  ],
}
