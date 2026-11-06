export default {
  id: 'rm-005',
  category: 'api-design',
  title: 'Job Applications API: Request Body, 201 and Location',
  level: 'BEGINNER',
  tags: ['raml', 'api-design', 'request-body', 'status-codes', 'headers', 'hr'],
  estMinutes: 12,
  description: `
The HR team of a large employer wants its careers site to send job applications to an API.

A **request body** is the data a caller sends with a method such as \`post\`. In RAML you describe it with \`body\` on the method. To say what the data looks like, declare a named type under \`types\` at the top of the file and refer to it from the body.

When a POST creates something, the usual answer is status **201 Created**. A 201 normally carries a \`Location\` **response header**, which holds the URL of the new item. Headers of a response go under \`headers\`, next to \`body\` and \`description\` in that response.

**Requirements**
- A type \`JobApplication\` with a required string \`fullName\`, a required string \`email\`, a required string \`roleId\`, and an optional \`availableFrom\` of type \`date-only\`.
- \`POST /applications\` takes a \`JobApplication\` body.
- It returns 201 with a \`Location\` header.
- It returns 400 when the body is not valid.
- \`GET /applications/{applicationId}\` returns 200 or 404, so the URL in \`Location\` leads somewhere.
`,
  starter: `#%RAML 1.0
title: Job Applications API
mediaType: application/json

types:

/applications:
  post:
`,
  ramlChecks: [
    { label: 'JobApplication has a required string fullName', rule: { type: 'prop', typeName: 'JobApplication', prop: 'fullName', want: { type: 'string', required: true } } },
    { label: 'JobApplication has a required string email', rule: { type: 'prop', typeName: 'JobApplication', prop: 'email', want: { type: 'string', required: true } } },
    { label: 'JobApplication has a required string roleId', rule: { type: 'prop', typeName: 'JobApplication', prop: 'roleId', want: { type: 'string', required: true } } },
    { label: 'availableFrom is an optional date-only', rule: { type: 'prop', typeName: 'JobApplication', prop: 'availableFrom', want: { type: 'date-only', required: false } } },
    { label: 'POST /applications takes a JobApplication body', rule: { type: 'body', path: '/applications', method: 'post', typeIs: 'JobApplication' } },
    { label: 'POST /applications returns 201 with a Location header', rule: { type: 'response', path: '/applications', method: 'post', status: '201', header: 'Location' } },
    { label: 'POST /applications returns 400 for a bad body', rule: { type: 'response', path: '/applications', method: 'post', status: '400' } },
    {
      label: 'GET /applications/{applicationId} returns 200 or 404',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/applications/{}', method: 'get', status: '200' },
          { type: 'response', path: '/applications/{}', method: 'get', status: '404' },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Job Applications API
mediaType: application/json

types:
  JobApplication:
    type: object
    properties:
      fullName: string
      email: string
      roleId: string
      availableFrom?: date-only

/applications:
  post:
    description: Send a job application.
    body:
      type: JobApplication
    responses:
      201:
        description: The application was received.
        headers:
          Location:
            type: string
            description: The URL of the new application.
      400:
        description: The body is not valid.
  /{applicationId}:
    get:
      responses:
        200:
          description: The application.
        404:
          description: No application has this id.
`,
  keyPoints: [
    'body under a method is what the caller sends. body under a response is what the API sends back.',
    '201 means something new now exists, which says more than a plain 200.',
    'The Location header goes under headers inside the 201 response, not on the method.',
    'date-only is the RAML type for a date with no time, such as 2026-03-01.',
  ],
  solution: `
\`body\` on \`post\` points at \`JobApplication\`, so the shape is written once and has a name. \`availableFrom?\` has a question mark because a candidate might not know yet.

The 201 tells the caller something new was created, and \`Location\` tells it where to find that thing. The header sits inside the 201 response, because it is the response that carries it.

\`GET /applications/{applicationId}\` is part of the same design. A \`Location\` value is only useful if a caller can follow it.
`,
  followUps: [
    {
      q: 'Why return 201 rather than 200 from a POST that creates something?',
      a: '201 tells the caller that a new item now exists. A 200 only says the request worked, so the caller cannot tell whether anything was created.',
    },
    {
      q: 'Should the 201 also return the new item in its body?',
      a: 'It can. Returning it saves the caller a second request, while returning only Location keeps the response small. Either is fine if the contract says which one you chose.',
    },
    {
      q: 'What status would you use if the application is only queued and handled later?',
      a: '202 Accepted. It says the request was taken but the work is not finished, so nothing may exist yet.',
    },
  ],
}
