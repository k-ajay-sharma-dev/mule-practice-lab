export default {
  id: 'rm-019',
  category: 'api-design',
  title: 'Employee Directory API: Client ID Enforcement in the Contract',
  level: 'INTERMEDIATE',
  tags: ['raml', 'api-design', 'security', 'client-id-enforcement', 'hr'],
  estMinutes: 15,
  description: `
An HR team publishes an employee directory for internal apps. Each app registers on the API platform and receives a **client id** and a **client secret**, which are the app's own credentials. A **client ID enforcement** policy on the gateway refuses any call without valid ones.

The contract must tell callers to send them. In RAML, a security scheme of type \`Pass Through\` means the values are passed in a way the scheme itself describes. Its \`describedBy\` section holds the headers callers send and the responses they can get back.

**Requirements**
- Title \`Employee Directory API\`, with JSON as the default media type.
- A security scheme \`clientIdEnforcement\` of type \`Pass Through\`.
- Its \`describedBy\` lists the required string headers \`client_id\` and \`client_secret\`, and a 401 response for missing or wrong credentials.
- Every method in the API is secured by \`clientIdEnforcement\`.
- A type \`Employee\` with required strings \`employeeId\` and \`fullName\`.
- \`GET /employees\` returns \`Employee[]\` with status 200.
- \`GET /employees/{employeeId}\` returns an \`Employee\` with status 200, or 404.
`,
  starter: `#%RAML 1.0
title: Employee Directory API
mediaType: application/json

securitySchemes:

types:

/employees:
`,
  ramlChecks: [
    {
      label: 'The title is Employee Directory API and JSON is the default media type',
      rule: {
        type: 'all',
        rules: [
          { type: 'root', key: 'title', want: 'Employee Directory API' },
          { type: 'root', key: 'mediaType', want: 'application/json' },
        ],
      },
    },
    {
      label: 'clientIdEnforcement is a Pass Through scheme that describes both headers and the 401',
      rule: {
        type: 'scheme',
        name: 'clientIdEnforcement',
        schemeType: 'Pass Through',
        has: ['describedBy.headers.client_id', 'describedBy.headers.client_secret', 'describedBy.responses.401'],
        values: { 'describedBy.headers.client_id': { set: true }, 'describedBy.headers.client_secret': { set: true } },
      },
    },
    {
      label: 'Both methods are secured by clientIdEnforcement',
      rule: {
        type: 'all',
        rules: [
          { type: 'secured', path: '/employees', method: 'get', scheme: 'clientIdEnforcement' },
          { type: 'secured', path: '/employees/{}', method: 'get', scheme: 'clientIdEnforcement' },
        ],
      },
    },
    {
      label: 'Employee has required strings employeeId and fullName',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Employee', prop: 'employeeId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Employee', prop: 'fullName', want: { type: 'string', required: true } },
        ],
      },
    },
    { label: 'GET /employees returns Employee[]', rule: { type: 'response', path: '/employees', method: 'get', status: '200', typeIs: 'Employee[]' } },
    {
      label: 'GET /employees/{employeeId} returns an Employee, or 404',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/employees/{}', method: 'get', status: '200', typeIs: 'Employee' },
          { type: 'response', path: '/employees/{}', method: 'get', status: '404' },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Employee Directory API
mediaType: application/json

securitySchemes:
  clientIdEnforcement:
    type: Pass Through
    description: Each app sends the credentials it received when it registered.
    describedBy:
      headers:
        client_id:
          type: string
        client_secret:
          type: string
      responses:
        401:
          description: The client id or client secret is missing or wrong.

securedBy: [ clientIdEnforcement ]

types:
  Employee:
    type: object
    properties:
      employeeId: string
      fullName: string

/employees:
  get:
    responses:
      200:
        body:
          type: Employee[]
  /{employeeId}:
    get:
      responses:
        200:
          body:
            type: Employee
        404:
          description: No employee has this id.
`,
  keyPoints: [
    'Pass Through is a built-in scheme type. x-custom is the form for a custom type of your own.',
    'describedBy holds the headers and responses of a scheme, so methods do not repeat them.',
    'securedBy at the top of the file applies to every method in the API.',
    'A client id identifies the calling app. It says nothing about which person is using it.',
  ],
  solution: `
The scheme states once what every caller must send. Setting \`securedBy\` at the top of the file covers every method, including any added later.

The two headers sit in \`describedBy\`, not on each method. A tool that reads the contract can show them on every secured method, and a new method cannot forget them.

The 401 lives there too, because it can happen on any secured call. The 404 stays on the method, because only that method can return it.
`,
  followUps: [
    {
      q: 'Does this scheme enforce anything by itself?',
      a: 'No. It documents what callers must send. The client ID enforcement policy, applied to the API instance in API Manager, does the checking at runtime.',
    },
    {
      q: 'How does an app get its client id and client secret?',
      a: 'It registers as a client application and requests access to the API, usually from its Exchange page. Once access is granted, the app has its credentials.',
    },
    {
      q: 'When would you use OAuth 2.0 in place of this?',
      a: 'When you need to know which user is calling, or to limit what a call may do with scopes, or when you want short-lived tokens. A client id and secret are long-lived and identify only the app.',
    },
  ],
}
