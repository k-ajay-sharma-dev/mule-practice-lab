export default {
  id: 'rm-123',
  category: 'api-design',
  title: 'Contract Vault API: HEAD to Check a File Without Downloading It',
  level: 'INTERMEDIATE',
  tags: ['raml', 'api-design', 'http-methods', 'head', 'binary', 'headers', 'legal'],
  estMinutes: 18,
  description: `
A law firm keeps signed contracts as PDF files behind a Mule API. Two clients use it:

- A mobile app for partners on the road. Before it downloads a 40 MB scan over a slow connection, it wants to show the file size and ask the user.
- A night job that copies every contract to a backup store. It wants to skip files that have not changed since the last run.

Today both download the whole file, only to read its headers.

HTTP has a method for this: **\`HEAD\`**. It works like \`GET\`, with the same status codes and headers, but the response **never has a body**. The client reads \`Content-Length\` for the size, and \`ETag\` to see whether the file changed. An ETag is a short value that changes whenever the file changes.

**Requirements**
- Title \`Contract Vault API\`, with JSON as the default media type.
- A type \`Error\` with a required string \`code\` and a required string \`message\`.
- A contract id looks like \`CTR-\` followed by 8 digits, such as \`CTR-20240117\`. \`{contractId}\` is a URI parameter with a pattern for that format.
- \`GET /contracts/{contractId}/file\`:
  - returns status 200 with an \`application/pdf\` body of type \`file\`, and the headers \`Content-Length\` and \`ETag\`
  - returns 404 with an \`Error\`
- \`HEAD /contracts/{contractId}/file\`:
  - returns status 200 with the headers \`Content-Length\` and \`ETag\`, and no body
  - returns 404 with no body
`,
  starter: `#%RAML 1.0
title: Contract Vault API
mediaType: application/json

types:
  Error:
    type: object
    properties:
      code: string
      message: string

/contracts:
  /{contractId}:
    /file:
      get:
        responses:
          200:
            body:
              application/pdf:
                type: file
`,
  ramlChecks: [
    {
      label: 'The title is Contract Vault API and JSON is the default',
      rule: { type: 'all', rules: [{ type: 'root', key: 'title', want: 'Contract Vault API' }, { type: 'root', key: 'mediaType', want: 'application/json' }] },
    },
    {
      label: 'contractId is CTR- followed by 8 digits',
      rule: {
        type: 'param',
        path: '/contracts/{}',
        in: 'uri',
        name: 'contractId',
        want: { pattern: { accepts: ['CTR-20240117', 'CTR-00000001'], rejects: ['ctr-20240117', 'CTR-2024011', 'CTR-202401170', 'CTR20240117', 'XCTR-20240117'] } },
      },
    },
    {
      label: 'GET returns the PDF with Content-Length and ETag',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/contracts/{}/file', method: 'get', status: '200', media: 'application/pdf', typeIs: 'file', header: 'Content-Length' },
          { type: 'response', path: '/contracts/{}/file', method: 'get', status: '200', header: 'ETag' },
        ],
      },
    },
    { label: 'GET returns 404 with an Error', rule: { type: 'response', path: '/contracts/{}/file', method: 'get', status: '404', typeIs: 'Error' } },
    { label: 'The file offers HEAD', rule: { type: 'method', path: '/contracts/{}/file', method: 'head' } },
    {
      label: 'HEAD returns 200 with Content-Length and ETag and no body',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/contracts/{}/file', method: 'head', status: '200', header: 'Content-Length', noBody: true },
          { type: 'response', path: '/contracts/{}/file', method: 'head', status: '200', header: 'ETag' },
        ],
      },
    },
    { label: 'HEAD returns 404 with no body', rule: { type: 'response', path: '/contracts/{}/file', method: 'head', status: '404', noBody: true } },
  ],
  referenceRaml: `#%RAML 1.0
title: Contract Vault API
mediaType: application/json

types:
  Error:
    type: object
    properties:
      code: string
      message: string

/contracts:
  /{contractId}:
    uriParameters:
      contractId:
        type: string
        pattern: ^CTR-[0-9]{8}$
    /file:
      get:
        responses:
          200:
            headers:
              Content-Length:
                type: integer
              ETag:
                type: string
                example: '"5f2c9a"'
            body:
              application/pdf:
                type: file
          404:
            body:
              type: Error
      head:
        description: The same headers as GET, with no body. Use it to read the size or to check for a change.
        responses:
          200:
            headers:
              Content-Length:
                type: integer
              ETag:
                type: string
          404:
            description: No contract has this id. A HEAD response never carries a body, so there is no Error here.
`,
  keyPoints: [
    'HEAD returns the same status and headers as GET, and never a body.',
    'Content-Length gives the size, so a client can warn before a large download.',
    'ETag changes when the file changes, so a sync job can skip files it already has.',
    'A HEAD error response has no body, so the status code alone must say what went wrong.',
    'A uriParameters pattern on the resource catches a bad id before any file store is touched.',
  ],
  solution: `
\`head\` sits beside \`get\` on the same resource. It describes the same 200 headers, so a client gets the same answers as from GET without the 40 MB body.

The mobile app sends HEAD, reads \`Content-Length\`, and asks the user before it downloads. The night job sends HEAD and compares \`ETag\` with the value it saved last time. Only a changed file is downloaded again.

The 404 on HEAD has no body. HTTP does not allow one on a HEAD response, so the \`Error\` type only appears on the GET 404. Callers rely on the status code alone.

The \`contractId\` pattern sits on the resource, so it covers both methods and every resource below it. \`^CTR-[0-9]{8}$\` needs both anchors, or \`XCTR-20240117\` would match.
`,
  followUps: [
    {
      q: 'Is HEAD safe to retry?',
      a: 'Yes. Like GET, it reads and never changes anything, so a client can retry it after a timeout with no side effects.',
    },
    {
      q: 'Could the night job use GET with If-None-Match instead?',
      a: 'Yes. It sends the saved ETag in If-None-Match, and the server answers 304 Not Modified with no body when nothing changed. That saves a second request when the file did change, because the 200 already carries it.',
    },
    {
      q: 'How do you make HEAD cheap in the implementation?',
      a: 'Read the size and the ETag from the file store metadata, not from the file. If the implementation reads the whole file to answer HEAD, the network is saved but the back end is not.',
    },
  ],
}
