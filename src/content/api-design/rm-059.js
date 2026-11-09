export default {
  id: 'rm-059',
  category: 'api-design',
  title: 'Parcel Lockers API: Nested Resources with Typed URI Parameters',
  level: 'BEGINNER',
  tags: ['raml', 'api-design', 'resources', 'nested-resources', 'uri-parameters', 'logistics'],
  estMinutes: 12,
  description: `
A parcel carrier runs 4,200 self-service lockers at stations and supermarkets. Each locker has up to 60 numbered compartments in three sizes. The courier app needs to read a locker, list its compartments and read one compartment before it drops a parcel.

A compartment only exists inside a locker, so its URL sits **under** the locker: \`/lockers/LK-04821/compartments/12\`. In RAML you write that by putting one resource inside another. A **URI parameter** is the part of the path in curly braces, such as \`{lockerId}\`. If you do not declare it, RAML treats it as any string. Declare it under \`uriParameters\` on the resource that holds it, and give it a type and facets so bad ids are refused before any code runs.

Locker ids always look like \`LK-04821\`: the letters \`LK\`, a hyphen and five digits.

**Requirements**
- A type \`Locker\` with the required strings \`lockerId\` and \`siteName\`.
- A type \`Compartment\` with a required integer \`number\`, a required \`size\` that allows only \`S\`, \`M\` and \`L\`, and a required boolean \`occupied\`.
- \`GET /lockers/{lockerId}\` returns a \`Locker\` with 200, or 404.
- \`lockerId\` is a string with a pattern that accepts \`LK-04821\` and refuses anything else, such as \`LK-4821\` or \`LK-048210\`.
- \`GET /lockers/{lockerId}/compartments\` returns a list of \`Compartment\`.
- \`GET /lockers/{lockerId}/compartments/{compartmentNumber}\` returns a \`Compartment\`, or 404.
- \`compartmentNumber\` is an integer from 1 to 60.
- There is no top-level \`/compartments\` resource.
`,
  starter: `#%RAML 1.0
title: Parcel Lockers API
mediaType: application/json

types:

/lockers:
`,
  ramlChecks: [
    { label: 'Compartment size allows only S, M and L', rule: { type: 'prop', typeName: 'Compartment', prop: 'size', want: { required: true, enum: { exactly: ['S', 'M', 'L'] } } } },
    {
      label: 'Compartment has a required integer number and a required boolean occupied',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Compartment', prop: 'number', want: { type: 'integer', required: true } },
          { type: 'prop', typeName: 'Compartment', prop: 'occupied', want: { type: 'boolean', required: true } },
        ],
      },
    },
    { label: 'GET /lockers/{lockerId} returns a Locker', rule: { type: 'response', path: '/lockers/{}', method: 'get', status: '200', typeIs: 'Locker' } },
    { label: 'GET /lockers/{lockerId} returns 404 for an unknown locker', rule: { type: 'response', path: '/lockers/{}', method: 'get', status: '404' } },
    {
      label: 'lockerId is a string whose pattern accepts LK-04821 only',
      rule: {
        type: 'param',
        path: '/lockers/{}',
        in: 'uri',
        name: 'lockerId',
        want: { type: 'string', pattern: { accepts: ['LK-04821', 'LK-00001'], rejects: ['LK-4821', 'LK-048210', 'lk-04821', '04821', 'XLK-04821'] } },
      },
    },
    {
      label: 'compartments sits under a locker, not at the top level',
      rule: { type: 'all', rules: [{ type: 'resource', path: '/lockers/{}/compartments' }, { type: 'noResource', path: '/compartments' }] },
    },
    { label: 'GET /lockers/{lockerId}/compartments returns a list of Compartment', rule: { type: 'response', path: '/lockers/{}/compartments', method: 'get', status: '200', typeIs: 'Compartment[]' } },
    {
      label: 'GET one compartment returns a Compartment or 404',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/lockers/{}/compartments/{}', method: 'get', status: '200', typeIs: 'Compartment' },
          { type: 'response', path: '/lockers/{}/compartments/{}', method: 'get', status: '404' },
        ],
      },
    },
    {
      label: 'compartmentNumber is an integer from 1 to 60',
      rule: { type: 'param', path: '/lockers/{}/compartments/{}', in: 'uri', name: 'compartmentNumber', want: { type: 'integer', minimum: 1, maximum: 60 } },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Parcel Lockers API
mediaType: application/json

types:
  Locker:
    type: object
    properties:
      lockerId: string
      siteName: string
    example:
      lockerId: LK-04821
      siteName: Leeds Station, platform 1
  Compartment:
    type: object
    properties:
      number: integer
      size:
        type: string
        enum: [ S, M, L ]
      occupied: boolean
    example:
      number: 12
      size: M
      occupied: false

/lockers:
  /{lockerId}:
    uriParameters:
      lockerId:
        type: string
        pattern: ^LK-[0-9]{5}$
    get:
      responses:
        200:
          body:
            type: Locker
        404:
          description: No locker has this id.
    /compartments:
      get:
        responses:
          200:
            body:
              type: Compartment[]
      /{compartmentNumber}:
        uriParameters:
          compartmentNumber:
            type: integer
            minimum: 1
            maximum: 60
        get:
          responses:
            200:
              body:
                type: Compartment
            404:
              description: The locker or the compartment does not exist.
`,
  keyPoints: [
    'A nested resource is written inside its parent, and its full path joins both, as in /lockers/{lockerId}/compartments.',
    'Declare a URI parameter under uriParameters on the resource that has it in its path.',
    'Without a declaration, a URI parameter is any string, so LK-1 and hello both pass.',
    'A pattern needs ^ and $ to match the whole value. Without them it only has to appear somewhere inside it.',
    'minimum and maximum on an integer URI parameter refuse compartment 0 or 61 before the flow runs.',
  ],
  solution: `
\`/compartments\` sits inside \`/{lockerId}\`, so every compartment URL names its locker. A top-level \`/compartments\` would mix compartments from 4,200 lockers and would need a filter to make sense.

\`lockerId\` gets a pattern with \`^\` and \`$\`. Without the anchors, \`XLK-048210\` passes, because the pattern only has to appear somewhere inside the value. \`compartmentNumber\` is an integer from 1 to 60, so \`/compartments/abc\` and \`/compartments/0\` are refused with a 400 by APIkit before your flow runs.

The 404 on one compartment covers two cases: the locker does not exist, or that locker has fewer compartments than the number asked for.
`,
  followUps: [
    {
      q: 'When should a resource be nested, and when should it stand on its own?',
      a: 'Nest it when it cannot exist without the parent, as a compartment needs a locker. Give it its own top-level resource when callers look it up across many parents.',
    },
    {
      q: 'What happens in Mule when a URI parameter breaks its pattern?',
      a: 'APIkit validates the request against the RAML and raises APIKIT:BAD_REQUEST. The default error handler turns that into a 400 before the flow logic runs.',
    },
    {
      q: 'How deep should nesting go?',
      a: 'Two or three levels is usually the limit. Deeper URLs are hard to read, and an item with its own stable id can move to its own resource.',
    },
    {
      q: 'Why is compartmentNumber an integer rather than a string?',
      a: 'An integer type lets the contract refuse letters and set a range with minimum and maximum. A string would need a pattern to do the same work.',
    },
  ],
}
