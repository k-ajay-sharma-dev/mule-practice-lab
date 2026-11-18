export default {
  id: 'rm-149',
  category: 'api-design',
  title: 'Survey Uploads API: Resumable Uploads of Large Files with an Upload Offset',
  level: 'EXPERT',
  tags: ['raml', 'api-design', 'file-upload', 'resumable-upload', 'binary', 'headers', 'oauth2', 'status-codes', 'construction'],
  estMinutes: 40,
  description: `
Northcliffe Survey Partners flies drones over building sites and uploads the survey files from vans on site. A file can be up to 20 GB, and the mobile signal drops often. With a single upload request, a drop at 18 GB means starting again from zero.

The team designs a **resumable upload**, borrowing the shape of the open tus protocol:

1. \`POST /uploads\` creates an upload session for a file of a known size and returns where to send the bytes.
2. \`PATCH /uploads/{uploadId}\` sends the next chunk of bytes. The \`Upload-Offset\` header says where the chunk starts. The answer says the new offset.
3. After a drop, \`HEAD /uploads/{uploadId}\` asks how many bytes the server already has, and the van carries on from there.
4. A session that sits unused for 24 hours expires and answers \`410 Gone\`.

**Requirements**
- Title \`Survey Uploads API\`, with JSON as the default media type.
- An OAuth 2.0 security scheme \`oauth\` with token URL \`https://auth.example.com/oauth/token\` and the \`client_credentials\` grant. Every method needs the scope \`surveys:upload\`.
- A type \`UploadRequest\` with a required string \`fileName\`, a required integer \`sizeBytes\` from 1 to 21474836480, and a required \`sha256\`: 64 characters of \`0\` to \`9\` and \`a\` to \`f\`.
- A type \`UploadSession\` with a required string \`uploadId\`, a required integer \`offset\` of at least 0, a required integer \`sizeBytes\`, a required \`status\` (\`IN_PROGRESS\`, \`COMPLETE\`, \`EXPIRED\`) and a required \`expiresAt\` \`datetime\`.
- A type \`Problem\` with a required string \`title\` and a required string \`detail\`.
- \`POST /uploads\` takes an \`UploadRequest\` and returns an \`UploadSession\` with 201 and a \`Location\` header.
- \`GET /uploads/{uploadId}\` returns an \`UploadSession\` with 200 and a \`Problem\` with 404.
- \`HEAD /uploads/{uploadId}\` returns 200 with an \`Upload-Offset\` header, 404, and 410 when expired.
- \`PATCH /uploads/{uploadId}\`:
  - needs a request header \`Upload-Offset\`, an integer of at least 0
  - takes the bytes as \`application/offset+octet-stream\`, type \`file\`
  - returns 204 with an \`Upload-Offset\` header and no body
  - returns a \`Problem\` with 409 when \`Upload-Offset\` does not match what the server has, and a \`Problem\` with 410 when expired
`,
  starter: `#%RAML 1.0
title: Survey Uploads API
mediaType: application/json

/uploads:
  post:
    body:
      multipart/form-data:
        properties:
          file:
            type: file
    responses:
      201:
        body:
          type: object
`,
  ramlChecks: [
    {
      label: 'The title is Survey Uploads API and JSON is the default',
      rule: { type: 'all', rules: [{ type: 'root', key: 'title', want: 'Survey Uploads API' }, { type: 'root', key: 'mediaType', want: 'application/json' }] },
    },
    {
      label: 'oauth is an OAuth 2.0 scheme with the token URL and the client_credentials grant',
      rule: {
        type: 'scheme',
        name: 'oauth',
        schemeType: 'OAuth 2.0',
        values: { 'settings.accessTokenUri': 'https://auth.example.com/oauth/token', 'settings.authorizationGrants': ['client_credentials'] },
      },
    },
    {
      label: 'UploadRequest has fileName, sizeBytes from 1 to 21474836480 and a sha256 of 64 hex characters',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'UploadRequest', prop: 'fileName', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'UploadRequest', prop: 'sizeBytes', want: { type: 'integer', required: true, minimum: 1, maximum: 21474836480 } },
          {
            type: 'prop',
            typeName: 'UploadRequest',
            prop: 'sha256',
            want: { type: 'string', required: true, pattern: { accepts: ['9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08'], rejects: ['9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a0', '9F86D081884C7D659A2FEAA0C55AD015A3BF4F1B2B0B822CD15D6C15B0F00A08', 'zf86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08', '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a081'] } },
          },
        ],
      },
    },
    {
      label: 'UploadSession has uploadId, offset of at least 0, sizeBytes, status and expiresAt',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'UploadSession', prop: 'uploadId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'UploadSession', prop: 'offset', want: { type: 'integer', required: true, minimum: 0 } },
          { type: 'prop', typeName: 'UploadSession', prop: 'sizeBytes', want: { type: 'integer', required: true } },
          { type: 'prop', typeName: 'UploadSession', prop: 'status', want: { required: true, enum: { exactly: ['IN_PROGRESS', 'COMPLETE', 'EXPIRED'] } } },
          { type: 'prop', typeName: 'UploadSession', prop: 'expiresAt', want: { type: 'datetime', required: true } },
        ],
      },
    },
    {
      label: 'Problem has a required title and a required detail',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Problem', prop: 'title', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Problem', prop: 'detail', want: { type: 'string', required: true } },
        ],
      },
    },
    {
      label: 'POST /uploads needs surveys:upload, takes an UploadRequest and returns an UploadSession with 201 and Location',
      rule: {
        type: 'all',
        rules: [
          { type: 'secured', path: '/uploads', method: 'post', scheme: 'oauth', scopes: ['surveys:upload'], required: true },
          { type: 'body', path: '/uploads', method: 'post', typeIs: 'UploadRequest' },
          { type: 'response', path: '/uploads', method: 'post', status: '201', typeIs: 'UploadSession', header: 'Location' },
        ],
      },
    },
    {
      label: 'GET /uploads/{uploadId} needs surveys:upload and returns an UploadSession or a Problem with 404',
      rule: {
        type: 'all',
        rules: [
          { type: 'secured', path: '/uploads/{}', method: 'get', scheme: 'oauth', scopes: ['surveys:upload'], required: true },
          { type: 'response', path: '/uploads/{}', method: 'get', status: '200', typeIs: 'UploadSession' },
          { type: 'response', path: '/uploads/{}', method: 'get', status: '404', typeIs: 'Problem' },
        ],
      },
    },
    {
      label: 'HEAD /uploads/{uploadId} needs surveys:upload and returns Upload-Offset with 200, or 404 and 410',
      rule: {
        type: 'all',
        rules: [
          { type: 'secured', path: '/uploads/{}', method: 'head', scheme: 'oauth', scopes: ['surveys:upload'], required: true },
          { type: 'response', path: '/uploads/{}', method: 'head', status: '200', header: 'Upload-Offset' },
          { type: 'response', path: '/uploads/{}', method: 'head', status: '404' },
          { type: 'response', path: '/uploads/{}', method: 'head', status: '410' },
        ],
      },
    },
    {
      label: 'PATCH needs surveys:upload and a required integer Upload-Offset header of at least 0',
      rule: {
        type: 'all',
        rules: [
          { type: 'secured', path: '/uploads/{}', method: 'patch', scheme: 'oauth', scopes: ['surveys:upload'], required: true },
          { type: 'param', path: '/uploads/{}', method: 'patch', in: 'header', name: 'Upload-Offset', want: { type: 'integer', required: true, minimum: 0 } },
        ],
      },
    },
    {
      label: 'PATCH takes a file as application/offset+octet-stream and answers 204 with Upload-Offset and no body',
      rule: {
        type: 'all',
        rules: [
          { type: 'body', path: '/uploads/{}', method: 'patch', media: 'application/offset+octet-stream', typeIs: 'file' },
          { type: 'response', path: '/uploads/{}', method: 'patch', status: '204', header: 'Upload-Offset', noBody: true },
        ],
      },
    },
    {
      label: 'PATCH answers a Problem with 409 for a wrong offset and with 410 for an expired session',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/uploads/{}', method: 'patch', status: '409', typeIs: 'Problem' },
          { type: 'response', path: '/uploads/{}', method: 'patch', status: '410', typeIs: 'Problem' },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Survey Uploads API
version: v1
baseUri: https://api.example.com/survey-uploads/{version}
mediaType: application/json

securitySchemes:
  oauth:
    type: OAuth 2.0
    description: Tokens for the upload app in the survey vans.
    settings:
      accessTokenUri: https://auth.example.com/oauth/token
      authorizationGrants: [ client_credentials ]
      scopes: [ surveys:upload ]

securedBy: [ oauth: { scopes: [ surveys:upload ] } ]

types:
  UploadRequest:
    type: object
    properties:
      fileName:
        type: string
        maxLength: 255
      sizeBytes:
        type: integer
        format: int64
        minimum: 1
        maximum: 21474836480
      sha256:
        type: string
        pattern: ^[0-9a-f]{64}$
        description: Checked when the last byte arrives.
    example:
      fileName: site-41-north-elevation.las
      sizeBytes: 18253611008
      sha256: 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08
  UploadSession:
    type: object
    properties:
      uploadId: string
      offset:
        type: integer
        format: int64
        minimum: 0
        description: Bytes received so far. The next PATCH starts here.
      sizeBytes:
        type: integer
        format: int64
      status:
        type: string
        enum: [ IN_PROGRESS, COMPLETE, EXPIRED ]
      expiresAt: datetime
    example:
      uploadId: UP-7f3c91
      offset: 0
      sizeBytes: 18253611008
      status: IN_PROGRESS
      expiresAt: 2026-11-19T09:00:00Z
  Problem:
    type: object
    properties:
      title: string
      detail: string

/uploads:
  post:
    body:
      type: UploadRequest
    responses:
      201:
        headers:
          Location:
            type: string
            example: /uploads/UP-7f3c91
        body:
          type: UploadSession
  /{uploadId}:
    get:
      responses:
        200:
          body:
            type: UploadSession
        404:
          body:
            type: Problem
    head:
      description: Asks how many bytes the server has. Used to resume after a dropped connection.
      responses:
        200:
          headers:
            Upload-Offset:
              type: integer
              format: int64
              minimum: 0
        404:
          description: No upload has this id.
        410:
          description: The upload expired after 24 hours without a chunk.
    patch:
      description: Sends the next chunk. The chunk must start at the offset the server already has.
      headers:
        Upload-Offset:
          type: integer
          format: int64
          minimum: 0
      body:
        application/offset+octet-stream:
          type: file
      responses:
        204:
          description: Chunk stored. Upload-Offset is the new position.
          headers:
            Upload-Offset:
              type: integer
              format: int64
        409:
          description: Upload-Offset does not match the bytes the server has. Ask with HEAD and send from there.
          body:
            type: Problem
        410:
          body:
            type: Problem
`,
  keyPoints: [
    'A resumable upload splits one large file into chunks, so a dropped connection only loses the current chunk.',
    'The server is the source of truth for the offset, and HEAD reads it cheaply after a drop.',
    'Each PATCH says where its chunk starts, and a mismatch answers 409 instead of corrupting the file.',
    'A dedicated media type tells the server the body is raw bytes at an offset, not a whole file.',
    'Expired sessions answer 410 Gone, so the client knows to start again.',
    'A checksum checked at the end proves the file arrived whole.',
    'Sizes over 2 GB need format int64.',
  ],
  solution: `
**Why chunks.** A single 20 GB request on a mobile link fails often and always restarts from zero. With chunks of, say, 50 MB, a drop costs at most one chunk.

**Create first.** \`POST /uploads\` sends only the metadata: name, size and checksum. The server answers 201 with an \`UploadSession\` and a \`Location\`, so the van knows where to send bytes before sending any.

**The offset is the contract.** Every \`PATCH\` carries \`Upload-Offset\`. The server stores the chunk only if the offset equals the bytes it already has, then answers 204 with the new offset. If a chunk was half received before a drop, the van's idea of the offset may be wrong. 409 says so, and \`HEAD\` gives the real offset. Without this check, a resent chunk could be stored twice and corrupt the file.

**HEAD for the cheap question.** "How far did I get?" needs only a number, so \`HEAD\` answers with a header and no body. \`GET\` returns the whole session for screens and support staff.

**Ending.** When the offset reaches \`sizeBytes\`, the server checks \`sha256\` and sets \`COMPLETE\`. Sessions that sit idle for 24 hours are cleaned up, and their URLs answer 410 so the van starts a new upload.

**In Mule.** Each chunk can be written to object storage as it arrives. Keep the chunk out of memory: stream it to storage, and log the offsets, never the bytes.
`,
  followUps: [
    {
      q: 'Why not let the van send several chunks in parallel?',
      a: 'It needs the server to accept chunks out of order and track gaps, which the offset rule forbids. Parallel parts are a separate design, as some object stores offer with multipart uploads.',
    },
    {
      q: 'The checksum fails at the end. What now?',
      a: 'Mark the session as failed with a Problem that says the file does not match, keep nothing, and let the van start a new upload. A partial fix is hard to trust.',
    },
    {
      q: 'Where does the API gateway get in the way?',
      a: 'Gateways and load balancers often limit body size and request time. Keep each chunk well under those limits and check them before choosing a chunk size.',
    },
  ],
}
