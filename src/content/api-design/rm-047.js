export default {
  id: 'rm-047',
  category: 'api-design',
  title: 'Workforce API: Optional Methods in a Resource Type',
  level: 'INTERMEDIATE',
  tags: ['raml', 'api-design', 'resource-types', 'optional-methods', 'hr'],
  estMinutes: 20,
  description: `
An HR team has many single records behind one API. They all follow the same pattern, so a **resource type** should hold it. A resource type holds a whole resource pattern, applied with \`type\`.

There is a catch. Payslips can be read but never deleted, because the law says to keep them. A lost door badge can be cancelled, but nobody reads a badge through this API.

If a resource type has \`get\` and \`delete\`, every resource that uses it offers both. A question mark changes that. \`get?\` is an **optional method**: it is left out unless the resource names it too. Naming it with an empty \`get:\` is enough, and the resource then receives everything the resource type wrote for it.

**Requirements**
- Title \`Workforce API\`, with JSON as the default media type.
- A type \`Payslip\` with a required string \`payslipId\` and a required number \`netPay\`.
- A type \`Badge\` with a required string \`badgeId\`.
- A type \`Error\` with a required string \`code\` and a required string \`message\`.
- A resource type \`record\` with a parameter \`<<recordType>>\`. It has two optional methods:
  - \`get?\` returns \`<<recordType>>\` with status 200, and 404 with an \`Error\` body.
  - \`delete?\` returns 204 with no body, and 404 with an \`Error\` body.
- \`/payslips/{payslipId}\` uses \`record\` with \`Payslip\`, and offers \`get\` only.
- \`/badges/{badgeId}\` uses \`record\` with \`Badge\`, and offers \`delete\` only.
- The responses come from the resource type, so do not write them on the resources.
`,
  starter: `#%RAML 1.0
title: Workforce API
mediaType: application/json

types:

resourceTypes:

/payslips:

/badges:
`,
  ramlChecks: [
    {
      label: 'Payslip, Badge and Error have their required properties',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Payslip', prop: 'payslipId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Payslip', prop: 'netPay', want: { type: 'number', required: true } },
          { type: 'prop', typeName: 'Badge', prop: 'badgeId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Error', prop: 'code', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Error', prop: 'message', want: { type: 'string', required: true } },
        ],
      },
    },
    { label: 'The record resource type has get and delete', rule: { type: 'resourceType', name: 'record', has: ['get', 'delete'] } },
    {
      label: 'GET /payslips/{payslipId} exists and delete stays out, so delete is optional',
      rule: {
        type: 'all',
        rules: [
          { type: 'method', path: '/payslips/{}', method: 'get' },
          { type: 'noMethod', path: '/payslips/{}', method: 'delete' },
        ],
      },
    },
    {
      label: 'DELETE /badges/{badgeId} exists and get stays out, so get is optional',
      rule: {
        type: 'all',
        rules: [
          { type: 'method', path: '/badges/{}', method: 'delete' },
          { type: 'noMethod', path: '/badges/{}', method: 'get' },
        ],
      },
    },
    {
      label: '/payslips/{payslipId} gets its responses from record',
      rule: { type: 'typed', path: '/payslips/{}', resourceType: 'record', provides: ['get.responses.200', 'get.responses.404'] },
    },
    {
      label: '/badges/{badgeId} gets its responses from record',
      rule: { type: 'typed', path: '/badges/{}', resourceType: 'record', provides: ['delete.responses.204', 'delete.responses.404'] },
    },
    {
      label: 'GET /payslips/{payslipId} returns a Payslip, or 404 with an Error',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/payslips/{}', method: 'get', status: '200', typeIs: 'Payslip' },
          { type: 'response', path: '/payslips/{}', method: 'get', status: '404', typeIs: 'Error' },
        ],
      },
    },
    {
      label: 'DELETE /badges/{badgeId} returns 204 with no body, or 404 with an Error',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/badges/{}', method: 'delete', status: '204', noBody: true },
          { type: 'response', path: '/badges/{}', method: 'delete', status: '404', typeIs: 'Error' },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Workforce API
mediaType: application/json

types:
  Payslip:
    type: object
    properties:
      payslipId: string
      netPay: number
  Badge:
    type: object
    properties:
      badgeId: string
  Error:
    type: object
    properties:
      code: string
      message: string

resourceTypes:
  record:
    get?:
      responses:
        200:
          body:
            type: <<recordType>>
        404:
          body:
            type: Error
    delete?:
      responses:
        204:
          description: The record is gone.
        404:
          body:
            type: Error

/payslips:
  /{payslipId}:
    type: { record: { recordType: Payslip } }
    get:

/badges:
  /{badgeId}:
    type: { record: { recordType: Badge } }
    delete:
`,
  keyPoints: [
    'A question mark on a method in a resource type makes that method optional.',
    'An optional method only appears on a resource that names it.',
    'An empty get: on the resource is enough to receive everything the resource type wrote.',
    'One resource type can serve read only records and delete only records with no copying.',
  ],
  solution: `
\`record\` holds every response once. Each resource then chooses its methods by naming them.

\`/payslips/{payslipId}\` names \`get\` and nothing else, so \`DELETE\` is not part of the contract. That is what the law asks for here. If \`delete\` had no question mark, every payslip would gain a delete method with no warning.

\`Badge\` is still passed as \`recordType\` on the badge resource. The value is not used by \`delete?\`, but a resource type gets a value for each parameter it declares.
`,
  followUps: [
    {
      q: 'What does a question mark mean on a property compared with a method?',
      a: 'On a property it means a caller may leave the value out. On a method in a resource type it means the method only exists if the resource names it.',
    },
    {
      q: 'Can a resource add something the resource type does not have?',
      a: 'Yes, anything written on the resource is merged with the resource type. A resource could add a query parameter to get, and its own value wins over a clash.',
    },
    {
      q: 'Why not make two resource types, readOnly and deleteOnly?',
      a: 'Each new mix of methods would need another resource type, and the 404 would be repeated in all of them. Optional methods keep one pattern with one set of responses.',
    },
  ],
}
