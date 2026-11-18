export default {
  id: 'rm-137',
  category: 'api-design',
  title: 'Branch Directory API: PUT with a Caller-Chosen Id Creates or Replaces',
  level: 'INTERMEDIATE',
  tags: ['raml', 'api-design', 'put', 'upsert', 'http-methods', 'status-codes', 'inheritance', 'franchise'],
  estMinutes: 20,
  description: `
Pippin Bakeries is a franchise with 300 branches. Each branch already has a code from the franchise system, such as \`BR-042\`. A Mule integration copies branches from that system into a new Branch Directory API every night.

The first draft used \`POST /branches\` and let the API make up a new id. When the nightly job ran twice, every branch was created twice. The franchise code is the real id, so the new contract uses **PUT on the item address**:

- \`PUT /branches/{branchCode}\` creates the branch if it is new and answers \`201\` with a \`Location\` header.
- The same call replaces the branch if it already exists and answers \`200\`.
- Sending the same PUT twice leaves the same result, so a rerun of the job is safe.

There is no \`POST /branches\`.

**Requirements**
- Title \`Branch Directory API\`, with JSON as the default media type.
- A type \`BranchInput\` with a required string \`name\`, a required string \`city\` and an optional string \`managerEmail\`.
- A type \`Branch\` that inherits from \`BranchInput\` and adds a required \`branchCode\` string.
- A type \`Error\` with a required string \`message\`.
- The URI parameter \`branchCode\` is \`BR-\` and three digits.
- \`PUT /branches/{branchCode}\` takes a \`BranchInput\` and returns a \`Branch\` with 201 and a \`Location\` header, a \`Branch\` with 200, and an \`Error\` with 400.
- \`GET /branches/{branchCode}\` returns a \`Branch\` with 200 and an \`Error\` with 404.
- \`GET /branches\` returns \`Branch[]\` with 200, and \`/branches\` has no POST.
`,
  starter: `#%RAML 1.0
title: Branch Directory API
mediaType: application/json

types:
  Branch:
    type: object
    properties:
      branchId: string
      name: string
      city: string

/branches:
  get:
    responses:
      200:
        body:
          type: Branch[]
  post:
    body:
      type: Branch
    responses:
      201:
        body:
          type: Branch
`,
  ramlChecks: [
    {
      label: 'The title is Branch Directory API and JSON is the default',
      rule: { type: 'all', rules: [{ type: 'root', key: 'title', want: 'Branch Directory API' }, { type: 'root', key: 'mediaType', want: 'application/json' }] },
    },
    {
      label: 'BranchInput has a required name and city and an optional managerEmail',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'BranchInput', prop: 'name', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'BranchInput', prop: 'city', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'BranchInput', prop: 'managerEmail', want: { type: 'string', required: false } },
        ],
      },
    },
    {
      label: 'Branch inherits BranchInput and adds a required branchCode',
      rule: {
        type: 'all',
        rules: [
          { type: 'typeDecl', name: 'Branch', extends: 'BranchInput' },
          { type: 'prop', typeName: 'Branch', prop: 'branchCode', want: { type: 'string', required: true } },
        ],
      },
    },
    {
      label: 'The URI parameter branchCode is BR- and three digits',
      rule: { type: 'param', path: '/branches/{}', in: 'uri', name: 'branchCode', want: { pattern: { accepts: ['BR-042', 'BR-999'], rejects: ['BR-42', 'br-042', 'BR-0420', 'BR042', 'XBR-042'] } } },
    },
    {
      label: 'PUT /branches/{branchCode} takes a BranchInput and returns a Branch with 201 and Location',
      rule: {
        type: 'all',
        rules: [
          { type: 'body', path: '/branches/{}', method: 'put', typeIs: 'BranchInput' },
          { type: 'response', path: '/branches/{}', method: 'put', status: '201', typeIs: 'Branch', header: 'Location' },
        ],
      },
    },
    {
      label: 'PUT also returns a Branch with 200 when it replaces, and an Error with 400',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/branches/{}', method: 'put', status: '200', typeIs: 'Branch' },
          { type: 'response', path: '/branches/{}', method: 'put', status: '400', typeIs: 'Error' },
        ],
      },
    },
    {
      label: 'GET /branches/{branchCode} returns a Branch with 200 and an Error with 404',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/branches/{}', method: 'get', status: '200', typeIs: 'Branch' },
          { type: 'response', path: '/branches/{}', method: 'get', status: '404', typeIs: 'Error' },
        ],
      },
    },
    {
      label: 'GET /branches returns Branch[] and there is no POST /branches',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/branches', method: 'get', status: '200', typeIs: 'Branch[]' },
          { type: 'noMethod', path: '/branches', method: 'post' },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Branch Directory API
version: v1
baseUri: https://api.example.com/branches/{version}
mediaType: application/json

types:
  BranchInput:
    type: object
    properties:
      name: string
      city: string
      managerEmail?: string
    example:
      name: Pippin Bakeries Market Street
      city: Leeds
      managerEmail: market.street@pippin.example.com
  Branch:
    type: BranchInput
    properties:
      branchCode: string
    example:
      branchCode: BR-042
      name: Pippin Bakeries Market Street
      city: Leeds
  Error:
    type: object
    properties:
      message: string

/branches:
  get:
    responses:
      200:
        body:
          type: Branch[]
  /{branchCode}:
    uriParameters:
      branchCode:
        type: string
        pattern: ^BR-[0-9]{3}$
        description: The branch code from the franchise system.
    put:
      description: Creates the branch if the code is new, or replaces it if it exists. Sending the same request again gives the same result.
      body:
        type: BranchInput
      responses:
        201:
          description: The branch was new and is now created.
          headers:
            Location:
              type: string
              example: /branches/BR-042
          body:
            type: Branch
        200:
          description: The branch existed and has been replaced.
          body:
            type: Branch
        400:
          body:
            type: Error
    get:
      responses:
        200:
          body:
            type: Branch
        404:
          body:
            type: Error
`,
  keyPoints: [
    'When the caller already owns the id, PUT on the item address can create or replace.',
    'PUT answers 201 when it created the resource and 200 when it replaced it.',
    'PUT is idempotent: sending it twice leaves the same state as sending it once.',
    'POST to a collection usually lets the server choose the id, so a retry can create a duplicate.',
    'The id lives in the URI, so the request body does not repeat it.',
    'PUT replaces the whole resource. A field left out is cleared, not kept.',
  ],
  solution: `
**Who owns the id.** The franchise system gives every branch its code. Since the caller knows the code, it can send the branch straight to its address, \`/branches/BR-042\`. The server does not need to make up an id, so \`POST /branches\` has no job left and is removed.

**One call, two outcomes.** PUT means "make the resource at this address look like this body". If nothing was there, the server creates it and answers \`201\` with a \`Location\` header. If a branch was there, it is replaced and the answer is \`200\`. The nightly job does not need to ask first whether the branch exists.

**Safe to repeat.** PUT is idempotent. Running the job twice sends the same bodies to the same addresses, and the directory ends up the same. With POST, each run created new branches.

**Request and response types.** \`BranchInput\` has no \`branchCode\`, because the code is in the URI. \`Branch\` inherits it and adds the code for responses, so the fields match by design.

**Replace means replace.** A PUT without \`managerEmail\` clears the email. If callers need to change one field and keep the rest, that is a job for PATCH.
`,
  followUps: [
    {
      q: 'The body also holds a branchCode that differs from the one in the URI. What should the API do?',
      a: 'Answer 400 and say the codes do not match. Keeping the code out of the request type avoids the question for most callers.',
    },
    {
      q: 'Two runs of the job send different data for BR-042 at the same moment. Which one wins?',
      a: 'The last one to be saved. If that matters, add an ETag and If-Match so a PUT based on old data fails with 412 instead of overwriting newer data.',
    },
    {
      q: 'How does the Mule app know whether to answer 201 or 200?',
      a: 'Many databases tell you whether an upsert inserted or updated a row. Otherwise, read the row first in the same transaction. Set the status in the response from that result.',
    },
  ],
}
