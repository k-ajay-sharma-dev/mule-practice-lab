export default {
  id: 'rm-039',
  category: 'api-design',
  title: 'My Mobile Account API: A Singleton Resource with /me',
  level: 'BEGINNER',
  tags: ['raml', 'api-design', 'resources', 'singleton', 'health-check', 'telecom'],
  estMinutes: 12,
  description: `
A mobile network is building an app where customers manage their own account. A security test on the old API found that changing the id in \`/accounts/{id}\` showed another customer's data.

A **singleton resource** is a resource with only one instance for the caller, so its path has no id. The server works out who the caller is from their access token. \`/me\` is the common name for this. Since no id is sent, a caller has no way to ask for someone else.

\`/health\` is another singleton. There is one health status for the whole API, and monitoring tools call it to see if the API is working.

**Requirements**
- A type \`Account\` has the required strings \`phoneNumber\` and \`plan\`, and a required number \`balance\`.
- A type \`AccountUpdate\` has a required string \`plan\`.
- A type \`Health\` has a required \`status\` that allows only \`UP\` and \`DOWN\`.
- \`GET /me\` returns an \`Account\` with status 200, or 401 when the token is missing or not valid.
- The caller can change their plan through \`/me\`, with \`PATCH\` or \`PUT\`. The method takes an \`AccountUpdate\` body and returns an \`Account\` with status 200.
- There is no id anywhere: no \`/me/{id}\` and no \`/accounts/{id}\`.
- \`/me\` has no \`post\` and no \`delete\`. The account already exists, and the app cannot close it.
- \`GET /health\` returns a \`Health\` with status 200, or a \`Health\` with status 503 when the API is not working.
`,
  starter: `#%RAML 1.0
title: My Mobile Account API
mediaType: application/json

types:

/me:

/health:
`,
  ramlChecks: [
    {
      label: 'Account has its required properties',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Account', prop: 'phoneNumber', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Account', prop: 'plan', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Account', prop: 'balance', want: { type: 'number', required: true } },
        ],
      },
    },
    { label: 'AccountUpdate has a required plan', rule: { type: 'prop', typeName: 'AccountUpdate', prop: 'plan', want: { type: 'string', required: true } } },
    { label: 'Health status allows only UP and DOWN', rule: { type: 'prop', typeName: 'Health', prop: 'status', want: { required: true, enum: { exactly: ['UP', 'DOWN'] } } } },
    { label: 'GET /me returns an Account', rule: { type: 'response', path: '/me', method: 'get', status: '200', typeIs: 'Account' } },
    { label: 'GET /me returns 401 for a bad token', rule: { type: 'response', path: '/me', method: 'get', status: '401' } },
    {
      label: 'PATCH or PUT /me takes an AccountUpdate and returns an Account',
      rule: {
        type: 'any',
        rules: [
          {
            type: 'all',
            rules: [
              { type: 'body', path: '/me', method: 'patch', typeIs: 'AccountUpdate' },
              { type: 'response', path: '/me', method: 'patch', status: '200', typeIs: 'Account' },
            ],
          },
          {
            type: 'all',
            rules: [
              { type: 'body', path: '/me', method: 'put', typeIs: 'AccountUpdate' },
              { type: 'response', path: '/me', method: 'put', status: '200', typeIs: 'Account' },
            ],
          },
        ],
      },
    },
    {
      label: 'No path holds an account id',
      rule: {
        type: 'all',
        rules: [
          { type: 'resource', path: '/me' },
          { type: 'noResource', path: '/me/{}' },
          { type: 'noResource', path: '/accounts/{}' },
        ],
      },
    },
    {
      label: '/me has no post and no delete',
      rule: {
        type: 'all',
        rules: [
          { type: 'resource', path: '/me' },
          { type: 'noMethod', path: '/me', method: 'post' },
          { type: 'noMethod', path: '/me', method: 'delete' },
        ],
      },
    },
    { label: 'GET /health returns a Health with 200', rule: { type: 'response', path: '/health', method: 'get', status: '200', typeIs: 'Health' } },
    { label: 'GET /health returns a Health with 503', rule: { type: 'response', path: '/health', method: 'get', status: '503', typeIs: 'Health' } },
  ],
  referenceRaml: `#%RAML 1.0
title: My Mobile Account API
mediaType: application/json

types:
  Account:
    type: object
    properties:
      phoneNumber: string
      plan: string
      balance: number
  AccountUpdate:
    type: object
    properties:
      plan: string
  Health:
    type: object
    properties:
      status:
        type: string
        enum: [ UP, DOWN ]

/me:
  get:
    responses:
      200:
        body:
          type: Account
      401:
        description: The token is missing or not valid.
  patch:
    body:
      type: AccountUpdate
    responses:
      200:
        body:
          type: Account

/health:
  get:
    responses:
      200:
        body:
          type: Health
      503:
        body:
          type: Health
`,
  keyPoints: [
    'A singleton resource has one instance for the caller, so its path has no id.',
    '/me takes the identity from the access token, so a caller cannot ask for another customer.',
    'A singleton usually has no post, since there is nothing new to add to it.',
    'A health resource returns 503 when it is not working, so monitoring tools see the problem from the status alone.',
  ],
  solution: `
\`/me\` has no URI parameter, because the access token already says who is calling. Changing a value in the URL can no longer reach another customer, which removes the bug the security test found.

\`post\` and \`delete\` stay out because the contract offers only what the app may do. A method that is not listed is not offered.

\`/health\` returns a body in both cases. The 503 tells the tool there is a problem, and the \`Health\` body gives the same shape to read.
`,
  followUps: [
    {
      q: 'Does /me remove the need for an authorisation check?',
      a: 'No. The server must still validate the token and read the identity from it. The path only removes one way to make a mistake.',
    },
    {
      q: 'Can a singleton have child resources?',
      a: 'Yes. /me/invoices lists the invoices of the caller, and /me/invoices/{invoiceId} is one of them. The server must still confirm that the invoice belongs to the caller.',
    },
    {
      q: 'Why should a health resource return 503 and not 200 with status DOWN?',
      a: 'Load balancers and monitors act on the status code alone. A 200 would look healthy to them, whatever the body says.',
    },
  ],
}
