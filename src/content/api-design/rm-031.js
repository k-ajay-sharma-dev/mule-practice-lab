export default {
  id: 'rm-031',
  category: 'api-design',
  title: 'Invoices API: Share Types and Traits Through a RAML Library',
  level: 'INTERMEDIATE',
  tags: ['raml', 'api-design', 'libraries', 'uses', 'reuse', 'finance'],
  estMinutes: 25,
  description: `
A finance team has four APIs, and each one defines money and errors in its own way. One says \`amount\`, another says \`value\`. You will move the shared parts into one file.

A **library** is a RAML file that holds types, traits and other reusable parts. Its first line is \`#%RAML 1.0 Library\`. An API brings it in with \`uses\`, which gives the library a **prefix**. Every name from the library is then written with that prefix, such as \`common.Money\`.

This problem has two files. Use the tabs above the editor to move between them.

**Requirements for \`libraries/common.raml\`**
- A type \`Money\` with a required number \`amount\` and a required string \`currency\`.
- A type \`Error\` with a required string \`code\` and a required string \`message\`.
- A trait \`paged\` with an optional integer \`page\` and an optional integer \`pageSize\`.

**Requirements for \`api.raml\`**
- Title \`Invoices API\`, with JSON as the default media type.
- Bring in the library with the prefix \`common\`.
- A type \`Invoice\` with a required string \`invoiceId\` and a required \`total\` that is a \`common.Money\`.
- \`GET /invoices\` uses the \`paged\` trait from the library and returns \`Invoice[]\` with status 200.
- \`GET /invoices/{invoiceId}\` returns an \`Invoice\`, or 404 with a \`common.Error\` body.
- \`Money\` and \`Error\` live only in the library, so \`api.raml\` does not declare them.
`,
  starter: `#%RAML 1.0
title: Invoices API
mediaType: application/json

uses:

types:

/invoices:
`,
  files: {
    'libraries/common.raml': `#%RAML 1.0 Library
usage: Shared parts for all finance APIs.

types:

traits:
`,
  },
  ramlChecks: [
    { label: 'The API brings in libraries/common.raml with the prefix common', rule: { type: 'library', prefix: 'common', file: 'libraries/common.raml' } },
    {
      label: 'The library holds Money with a required number amount and string currency',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'common.Money', prop: 'amount', want: { type: 'number', required: true } },
          { type: 'prop', typeName: 'common.Money', prop: 'currency', want: { type: 'string', required: true } },
        ],
      },
    },
    {
      label: 'The library holds Error with a required code and message',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'common.Error', prop: 'code', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'common.Error', prop: 'message', want: { type: 'string', required: true } },
        ],
      },
    },
    { label: 'The library holds the paged trait', rule: { type: 'trait', name: 'common.paged', has: 'queryParameters.page' } },
    {
      label: 'Money and Error are not declared again in api.raml',
      rule: {
        type: 'all',
        rules: [
          { type: 'library', prefix: 'common' },
          { type: 'noType', name: 'Money' },
          { type: 'noType', name: 'Error' },
        ],
      },
    },
    { label: 'Invoice.total is a common.Money', rule: { type: 'prop', typeName: 'Invoice', prop: 'total', want: { type: 'common.Money', required: true } } },
    { label: 'GET /invoices uses common.paged', rule: { type: 'applied', path: '/invoices', method: 'get', trait: 'common.paged' } },
    {
      label: 'The trait gives GET /invoices its optional page and pageSize',
      rule: {
        type: 'all',
        rules: [
          { type: 'param', path: '/invoices', method: 'get', in: 'query', name: 'page', want: { type: 'integer', required: false } },
          { type: 'param', path: '/invoices', method: 'get', in: 'query', name: 'pageSize', want: { type: 'integer', required: false } },
        ],
      },
    },
    { label: 'GET /invoices returns Invoice[]', rule: { type: 'response', path: '/invoices', method: 'get', status: '200', typeIs: 'Invoice[]' } },
    {
      label: 'GET /invoices/{invoiceId} returns an Invoice, or 404 with a common.Error',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/invoices/{}', method: 'get', status: '200', typeIs: 'Invoice' },
          { type: 'response', path: '/invoices/{}', method: 'get', status: '404', typeIs: 'common.Error' },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Invoices API
mediaType: application/json

uses:
  common: libraries/common.raml

types:
  Invoice:
    type: object
    properties:
      invoiceId: string
      total: common.Money

/invoices:
  get:
    is: [ common.paged ]
    responses:
      200:
        body:
          type: Invoice[]
  /{invoiceId}:
    get:
      responses:
        200:
          body:
            type: Invoice
        404:
          body:
            type: common.Error
`,
  referenceFiles: {
    'libraries/common.raml': `#%RAML 1.0 Library
usage: Shared parts for all finance APIs.

types:
  Money:
    type: object
    properties:
      amount: number
      currency: string
  Error:
    type: object
    properties:
      code: string
      message: string

traits:
  paged:
    queryParameters:
      page?: integer
      pageSize?: integer
`,
  },
  keyPoints: [
    'A library starts with #%RAML 1.0 Library and has no title or resources.',
    'uses takes a plain path. !include is not used there.',
    'Names from a library always carry the prefix, such as common.Money.',
    'Inside the library, its own names need no prefix.',
  ],
  solution: `
The shared parts now have one home. If the finance team changes \`Money\`, every API that uses the library gets the change.

\`uses\` gives the library a short name for this file only. Another API could pick a different prefix, because the prefix belongs to the API that chose it.

\`Order\` with no prefix would fail here, even if the library declares it. A prefix is what stops names from two libraries clashing.
`,
  followUps: [
    {
      q: 'How would several teams share this library in Anypoint?',
      a: 'Publish it to Exchange as a RAML fragment, then add it as a dependency in Design Center. Each API then uses a named version of it.',
    },
    {
      q: 'What is the risk of changing a shared library?',
      a: 'A change reaches every API that picks up the new version, so a breaking change spreads. Version the library, and treat a change to it like a change to an API.',
    },
    {
      q: 'When would you use a library instead of a single !include?',
      a: 'Use a library for a set of named parts that many files share. A single !include fits one piece, such as one type or one example.',
    },
  ],
}
