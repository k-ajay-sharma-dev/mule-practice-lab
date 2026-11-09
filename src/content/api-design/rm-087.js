export default {
  id: 'rm-087',
  category: 'api-design',
  title: 'Card Services API: Typed Annotations with allowedTargets',
  level: 'INTERMEDIATE',
  tags: ['raml', 'api-design', 'annotations', 'allowed-targets', 'governance', 'banking'],
  estMinutes: 25,
  description: `
A card issuer runs 140 APIs. Its platform team builds three tools that read every contract in Exchange: an owner directory, a PCI audit list of resources that touch card data, and an SLA dashboard. The tools need the same facts in the same shape in every contract, so free text descriptions will not do.

An **annotation type** can be any RAML type, including an object with properties. The parser then checks every value against it. \`allowedTargets\` limits where the annotation may sit. The targets used here are \`API\`, \`Resource\`, \`Method\` and \`TypeDeclaration\`, which covers types and their properties.

**Requirements**
- Title \`Card Services API\`, with JSON as the default media type.
- An annotation type \`owner\`: an object with a required string \`team\` and a required string \`email\`, allowed only on \`API\`.
- An annotation type \`pciScope\`: a boolean, allowed only on \`Resource\`.
- An annotation type \`sla\`: an object with a required integer \`p95Ms\` of at least 1 and a required number \`availability\`, allowed only on \`Method\`.
- An annotation type \`maskAs\`: a string that is one of \`LAST4\`, \`HASH\`, \`NONE\`, allowed only on \`TypeDeclaration\`.
- The API is marked \`(owner)\` with the team \`Card Platform\` and the email \`card-platform@example.com\`.
- A type \`Card\` with a required string \`cardId\`, a required string \`pan\` marked \`(maskAs): LAST4\`, and a required string \`status\`.
- \`GET /cards/{cardId}\` returns a \`Card\` with status 200, or 404. Its resource \`/cards/{cardId}\` is marked \`(pciScope): true\`. The method is marked \`(sla)\` with \`p95Ms: 250\` and \`availability: 99.95\`.
- \`GET /card-products\` returns the public list of card products with status 200. Its resource is marked \`(pciScope): false\`.
`,
  starter: `#%RAML 1.0
title: Card Services API
mediaType: application/json

annotationTypes:

types:
  Card:
    type: object
    properties:

/cards:

/card-products:
`,
  ramlChecks: [
    {
      label: 'owner is an object annotation with team and email, allowed only on API',
      rule: {
        type: 'all',
        rules: [
          { type: 'annotationType', name: 'owner', want: { type: 'object', properties: { holds: { team: { set: true }, email: { set: true } } } } },
          { type: 'any', rules: [{ type: 'annotationType', name: 'owner', want: { allowedTargets: { exactly: ['API'] } } }, { type: 'annotationType', name: 'owner', want: { allowedTargets: { is: 'API' } } }] },
        ],
      },
    },
    {
      label: 'pciScope is a boolean annotation, allowed only on Resource',
      rule: {
        type: 'all',
        rules: [
          { type: 'annotationType', name: 'pciScope', want: { type: 'boolean' } },
          { type: 'any', rules: [{ type: 'annotationType', name: 'pciScope', want: { allowedTargets: { exactly: ['Resource'] } } }, { type: 'annotationType', name: 'pciScope', want: { allowedTargets: { is: 'Resource' } } }] },
        ],
      },
    },
    {
      label: 'sla is an object annotation, allowed only on Method',
      rule: {
        type: 'all',
        rules: [
          { type: 'annotationType', name: 'sla', want: { type: 'object', properties: { holds: { p95Ms: { set: true }, availability: { set: true } } } } },
          { type: 'any', rules: [{ type: 'annotationType', name: 'sla', want: { allowedTargets: { exactly: ['Method'] } } }, { type: 'annotationType', name: 'sla', want: { allowedTargets: { is: 'Method' } } }] },
        ],
      },
    },
    {
      label: 'maskAs allows only LAST4, HASH and NONE, on TypeDeclaration only',
      rule: {
        type: 'all',
        rules: [
          { type: 'annotationType', name: 'maskAs', want: { type: 'string', enum: { exactly: ['LAST4', 'HASH', 'NONE'] } } },
          { type: 'any', rules: [{ type: 'annotationType', name: 'maskAs', want: { allowedTargets: { exactly: ['TypeDeclaration'] } } }, { type: 'annotationType', name: 'maskAs', want: { allowedTargets: { is: 'TypeDeclaration' } } }] },
        ],
      },
    },
    { label: 'The API is marked (owner) with team Card Platform and its email', rule: { type: 'annotated', name: 'owner', value: { holds: { team: { is: 'Card Platform' }, email: { is: 'card-platform@example.com' } } } } },
    {
      label: 'Card has cardId, status and a pan marked (maskAs): LAST4',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Card', prop: 'cardId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Card', prop: 'status', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Card', prop: 'pan', want: { type: 'string', required: true, '(maskAs)': { is: 'LAST4' } } },
        ],
      },
    },
    {
      label: 'GET /cards/{cardId} returns a Card or 404',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/cards/{}', method: 'get', status: '200', typeIs: 'Card' },
          { type: 'response', path: '/cards/{}', method: 'get', status: '404' },
        ],
      },
    },
    { label: 'The resource /cards/{cardId} is marked (pciScope): true', rule: { type: 'annotated', name: 'pciScope', path: '/cards/{}', value: true } },
    { label: 'GET /cards/{cardId} is marked (sla) with p95Ms 250 and availability 99.95', rule: { type: 'annotated', name: 'sla', path: '/cards/{}', method: 'get', value: { holds: { p95Ms: 250, availability: 99.95 } } } },
    {
      label: 'GET /card-products returns 200, and its resource is marked (pciScope): false',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/card-products', method: 'get', status: '200' },
          { type: 'annotated', name: 'pciScope', path: '/card-products', value: false },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Card Services API
mediaType: application/json

annotationTypes:
  owner:
    type: object
    properties:
      team: string
      email: string
    allowedTargets: [ API ]
  pciScope:
    type: boolean
    allowedTargets: [ Resource ]
  sla:
    type: object
    properties:
      p95Ms:
        type: integer
        minimum: 1
      availability: number
    allowedTargets: [ Method ]
  maskAs:
    type: string
    enum: [ LAST4, HASH, NONE ]
    allowedTargets: [ TypeDeclaration ]

(owner):
  team: Card Platform
  email: card-platform@example.com

types:
  Card:
    type: object
    properties:
      cardId: string
      pan:
        type: string
        (maskAs): LAST4
      status: string

/cards:
  /{cardId}:
    (pciScope): true
    get:
      (sla):
        p95Ms: 250
        availability: 99.95
      responses:
        200:
          body:
            type: Card
        404:
          description: No card has this id.

/card-products:
  (pciScope): false
  get:
    responses:
      200:
        description: The card products on sale, with fees and limits.
`,
  keyPoints: [
    'An annotation type can be an object, and the parser checks each value against it.',
    'allowedTargets limits where an annotation may sit, such as API, Resource, Method or TypeDeclaration.',
    'An annotation on a property uses the TypeDeclaration target.',
    'A false value is still a statement. (pciScope): false says someone checked.',
    'Annotations feed tools. They change nothing about how the API runs.',
  ],
  solution: `
Each annotation type has a shape and a place. \`(owner)\` can only sit at the top, \`(pciScope)\` only on a resource and \`(sla)\` only on a method. If someone puts \`(sla)\` on a resource by mistake, the parser reports it at once, and the dashboard never reads a value from the wrong level.

The object types catch bad values too. \`p95Ms: 250ms\` is not an integer, and an \`(owner)\` with no email is missing a required property. Both fail in the editor, long before the audit tool runs.

\`/card-products\` is marked \`false\`, not left blank. A missing value could mean "not in scope" or "nobody looked". The auditors can tell the two apart only when every resource carries an answer.
`,
  followUps: [
    {
      q: 'Why use an object annotation and not two string annotations for team and email?',
      a: 'The object keeps the two facts together, and making both required means neither can be forgotten. A tool reads one value in one shape.',
    },
    {
      q: 'Where would you keep these annotation types for 140 APIs?',
      a: 'In a shared RAML library published to Exchange, used with a prefix such as std. Every team then gets the same definitions and the same checks.',
    },
    {
      q: 'Can an annotation replace a policy in API Manager?',
      a: 'No. An annotation is metadata in the contract. A tool or a pipeline can read it and apply a policy, but the annotation alone enforces nothing.',
    },
  ],
}
