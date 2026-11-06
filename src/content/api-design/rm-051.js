export default {
  id: 'rm-051',
  category: 'api-design',
  title: 'Motor Policies API: Optimistic Concurrency with ETag and If-Match',
  level: 'ADVANCED',
  tags: ['raml', 'api-design', 'concurrency', 'etag', 'headers', 'insurance'],
  estMinutes: 30,
  description: `
Two insurance agents open the same policy. One changes the address and saves. The other changes the premium and saves a minute later, and the new address is lost. Nobody sees an error. This is called a **lost update**.

**Optimistic concurrency** stops it without locking anything. The server gives each version of a record a tag, and a write only works if the caller still holds the current tag.

- \`ETag\` is a response header that holds the tag of the version returned.
- \`If-Match\` is a request header. The caller sends back the tag it read.
- **412 Precondition Failed** means the tag is out of date, so someone else changed the record first.
- **428 Precondition Required** means the caller sent no tag at all.

Tags help reads too. With \`If-None-Match\`, a caller sends the tag it already has. If nothing changed, the server answers **304 Not Modified** with no body, which saves sending the record again.

**Requirements**
- Title \`Motor Policies API\`, with JSON as the default media type.
- A type \`Policy\` with a required string \`policyId\`, a required number \`premium\` and a required string \`address\`.
- A type \`Error\` with a required string \`code\` and a required string \`message\`.
- \`GET /policies/{policyId}\` takes an optional string header \`If-None-Match\`.
- It returns a \`Policy\` with status 200 and an \`ETag\` header, 304 with no body, or 404.
- \`PUT /policies/{policyId}\` takes a \`Policy\` and a required string header \`If-Match\`.
- It returns the saved \`Policy\` with status 200 and a new \`ETag\` header, or 404.
- It returns 412 with an \`Error\` when the tag is out of date, and 428 with an \`Error\` when no tag was sent.
`,
  starter: `#%RAML 1.0
title: Motor Policies API
mediaType: application/json

types:

/policies:
  /{policyId}:
`,
  ramlChecks: [
    {
      label: 'Policy has a required policyId, premium and address',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Policy', prop: 'policyId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Policy', prop: 'premium', want: { type: 'number', required: true } },
          { type: 'prop', typeName: 'Policy', prop: 'address', want: { type: 'string', required: true } },
        ],
      },
    },
    {
      label: 'Error has a required code and message',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Error', prop: 'code', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Error', prop: 'message', want: { type: 'string', required: true } },
        ],
      },
    },
    { label: 'GET takes an optional If-None-Match header', rule: { type: 'param', path: '/policies/{}', method: 'get', in: 'header', name: 'If-None-Match', want: { type: 'string', required: false } } },
    { label: 'GET returns a Policy with an ETag header', rule: { type: 'response', path: '/policies/{}', method: 'get', status: '200', typeIs: 'Policy', header: 'ETag' } },
    { label: 'GET returns 304 with no body', rule: { type: 'response', path: '/policies/{}', method: 'get', status: '304', noBody: true } },
    { label: 'GET returns 404 for an unknown policy', rule: { type: 'response', path: '/policies/{}', method: 'get', status: '404' } },
    { label: 'PUT takes a Policy', rule: { type: 'body', path: '/policies/{}', method: 'put', typeIs: 'Policy' } },
    { label: 'PUT needs a required If-Match header', rule: { type: 'param', path: '/policies/{}', method: 'put', in: 'header', name: 'If-Match', want: { type: 'string', required: true } } },
    { label: 'PUT returns the Policy with a new ETag header', rule: { type: 'response', path: '/policies/{}', method: 'put', status: '200', typeIs: 'Policy', header: 'ETag' } },
    { label: 'PUT returns 404 for an unknown policy', rule: { type: 'response', path: '/policies/{}', method: 'put', status: '404' } },
    { label: 'PUT returns 412 with an Error for an out of date tag', rule: { type: 'response', path: '/policies/{}', method: 'put', status: '412', typeIs: 'Error' } },
    { label: 'PUT returns 428 with an Error when no tag was sent', rule: { type: 'response', path: '/policies/{}', method: 'put', status: '428', typeIs: 'Error' } },
  ],
  referenceRaml: `#%RAML 1.0
title: Motor Policies API
mediaType: application/json

types:
  Policy:
    type: object
    properties:
      policyId: string
      premium: number
      address: string
  Error:
    type: object
    properties:
      code: string
      message: string

/policies:
  /{policyId}:
    get:
      headers:
        If-None-Match?:
          type: string
      responses:
        200:
          headers:
            ETag:
              type: string
          body:
            type: Policy
        304:
          description: The caller already holds this version.
        404:
          description: No policy has this id.
    put:
      headers:
        If-Match:
          type: string
      body:
        type: Policy
      responses:
        200:
          headers:
            ETag:
              type: string
          body:
            type: Policy
        404:
          description: No policy has this id.
        412:
          body:
            type: Error
        428:
          body:
            type: Error
`,
  keyPoints: [
    'A lost update happens when two writers both start from the same old version.',
    'ETag goes out on the response, and If-Match comes back on the write.',
    '412 means the tag is out of date. 428 means no tag was sent.',
    'The PUT returns a new ETag, so the caller can write again without another read.',
    '304 has no body, because the caller already holds the data.',
  ],
  solution: `
The read hands out a tag, and the write has to give it back. If another agent saved first, the tag no longer matches. The server answers 412 and nothing is lost.

428 is separate from 412 because the fix is different. A 412 means read again and redo the change. A 428 means the caller has a bug and must start sending the header.

No lock is held between the read and the write. That is why it is called optimistic: it assumes clashes are rare, and it only pays a cost when one happens.
`,
  followUps: [
    {
      q: 'Why use 412 here and not 409 Conflict?',
      a: 'A 412 says one exact thing: the If-Match condition in this request failed. A 409 is a general clash with the state of the record, such as closing a policy that is already closed.',
    },
    {
      q: 'What should a user interface do after a 412?',
      a: 'Fetch the latest version and show the agent what changed. Then let them apply their edit again, rather than overwrite the other agent without warning.',
    },
    {
      q: 'If If-Match is required in the contract, how can a caller ever reach the 428?',
      a: 'A router that validates the contract can reject the missing header with a 400 first. Map that case to 428 in the error handling, so the running API matches the contract.',
    },
  ],
}
