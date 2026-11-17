export default {
  id: 'rm-134',
  category: 'api-design',
  title: 'Oral History Archive API: Range Requests and 206 Partial Content for Audio',
  level: 'ADVANCED',
  tags: ['raml', 'api-design', 'range-requests', 'partial-content', 'binary', 'headers', 'status-codes', 'etag', 'heritage'],
  estMinutes: 30,
  description: `
Fenmere Heritage Trust keeps 9,000 oral history recordings, many over an hour long. Its web player downloads the whole MP3 before playing, so a visitor who wants minute 42 of a 200 MB file waits for all of it. On a train, a dropped signal means starting again.

HTTP has a fix: **range requests**. The client asks for part of a file with a \`Range\` header, such as \`bytes=0-1048575\` for the first megabyte. The server answers:

- \`206 Partial Content\` with that part, and a \`Content-Range\` header such as \`bytes 0-1048575/209715200\`.
- \`200 OK\` with the whole file if there is no \`Range\` header, or if \`If-Range\` shows the file has changed.
- \`416 Range Not Satisfiable\` if the range starts past the end of the file, with \`Content-Range: bytes */209715200\` and no body.

The server says it supports ranges with \`Accept-Ranges: bytes\`. An \`ETag\` lets the player resume safely: it sends the ETag back in \`If-Range\`, so it never joins parts of two different files.

The trust supports one range per request: \`bytes=start-end\`, \`bytes=start-\`, or \`bytes=-lastN\`.

**Requirements**
- Title \`Oral History Archive API\`, with JSON as the default media type.
- A type \`Recording\` with \`recordingId\` (required, \`REC-\` and six digits), a required string \`title\`, and required integers \`durationSeconds\` and \`sizeBytes\`, each at least 1.
- A type \`Error\` with a required string \`message\`.
- \`GET /recordings/{recordingId}\` returns a \`Recording\` with 200 and an \`Error\` with 404.
- \`GET /recordings/{recordingId}/audio\`:
  - takes an optional \`Range\` header that allows only one range in the three forms above, and an optional string \`If-Range\` header.
  - returns 200 with an \`audio/mpeg\` file body and the headers \`Accept-Ranges\` and \`ETag\`.
  - returns 206 with an \`audio/mpeg\` file body and the headers \`Content-Range\` and \`ETag\`.
  - returns 416 with a \`Content-Range\` header and no body.
  - returns an \`Error\` with 404.
`,
  starter: `#%RAML 1.0
title: Oral History Archive API
mediaType: application/json

types:
  Recording:
    type: object
    properties:
      recordingId: string
      title: string

/recordings:
  /{recordingId}:
    get:
      responses:
        200:
          body:
            type: Recording
    /audio:
      get:
        responses:
          200:
            body:
              audio/mpeg:
                type: file
`,
  ramlChecks: [
    {
      label: 'The title is Oral History Archive API and JSON is the default',
      rule: { type: 'all', rules: [{ type: 'root', key: 'title', want: 'Oral History Archive API' }, { type: 'root', key: 'mediaType', want: 'application/json' }] },
    },
    {
      label: 'Recording has recordingId as REC- and six digits, and a required title',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Recording', prop: 'recordingId', want: { required: true, pattern: { accepts: ['REC-004417', 'REC-999999'], rejects: ['REC-04417', 'rec-004417', 'REC-0044170', 'REC004417', 'XREC-004417'] } } },
          { type: 'prop', typeName: 'Recording', prop: 'title', want: { type: 'string', required: true } },
        ],
      },
    },
    {
      label: 'durationSeconds and sizeBytes are required integers of at least 1',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Recording', prop: 'durationSeconds', want: { type: 'integer', required: true, minimum: 1 } },
          { type: 'prop', typeName: 'Recording', prop: 'sizeBytes', want: { type: 'integer', required: true, minimum: 1 } },
        ],
      },
    },
    {
      label: 'GET /recordings/{recordingId} returns a Recording with 200 and an Error with 404',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/recordings/{}', method: 'get', status: '200', typeIs: 'Recording' },
          { type: 'response', path: '/recordings/{}', method: 'get', status: '404', typeIs: 'Error' },
          { type: 'prop', typeName: 'Error', prop: 'message', want: { type: 'string', required: true } },
        ],
      },
    },
    {
      label: 'The optional Range header allows one range in the three forms',
      rule: {
        type: 'param',
        path: '/recordings/{}/audio',
        method: 'get',
        in: 'header',
        name: 'Range',
        want: { required: false, pattern: { accepts: ['bytes=0-1048575', 'bytes=1048576-', 'bytes=-500'], rejects: ['bytes=-', '0-1048575', 'bytes=0-99,200-299', 'items=0-5', 'bytes=a-b'] } },
      },
    },
    {
      label: 'The audio GET takes an optional If-Range header',
      rule: { type: 'param', path: '/recordings/{}/audio', method: 'get', in: 'header', name: 'If-Range', want: { type: 'string', required: false } },
    },
    {
      label: '200 sends the whole audio/mpeg file with Accept-Ranges and ETag',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/recordings/{}/audio', method: 'get', status: '200', media: 'audio/mpeg', typeIs: 'file', header: 'Accept-Ranges' },
          { type: 'response', path: '/recordings/{}/audio', method: 'get', status: '200', header: 'ETag' },
        ],
      },
    },
    {
      label: '206 sends part of the audio/mpeg file with Content-Range and ETag',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/recordings/{}/audio', method: 'get', status: '206', media: 'audio/mpeg', typeIs: 'file', header: 'Content-Range' },
          { type: 'response', path: '/recordings/{}/audio', method: 'get', status: '206', header: 'ETag' },
        ],
      },
    },
    {
      label: '416 has a Content-Range header and no body, and 404 returns an Error',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/recordings/{}/audio', method: 'get', status: '416', header: 'Content-Range', noBody: true },
          { type: 'response', path: '/recordings/{}/audio', method: 'get', status: '404', typeIs: 'Error' },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Oral History Archive API
version: v1
baseUri: https://api.example.com/archive/{version}
mediaType: application/json

types:
  Recording:
    type: object
    properties:
      recordingId:
        type: string
        pattern: ^REC-[0-9]{6}$
      title: string
      durationSeconds:
        type: integer
        minimum: 1
      sizeBytes:
        type: integer
        minimum: 1
    example:
      recordingId: REC-004417
      title: Harvest work on the fens, 1950s
      durationSeconds: 5212
      sizeBytes: 209715200
  Error:
    type: object
    properties:
      message: string

/recordings:
  /{recordingId}:
    get:
      responses:
        200:
          body:
            type: Recording
        404:
          body:
            type: Error
    /audio:
      get:
        description: The recording as MP3. Send Range to get part of it.
        headers:
          Range?:
            type: string
            pattern: ^bytes=([0-9]+-[0-9]*|-[0-9]+)$
            description: One range only. bytes=start-end, bytes=start- or bytes=-lastN.
            example: bytes=0-1048575
          If-Range?:
            type: string
            description: The ETag the player already has. If the file has changed, the whole new file comes back with 200.
        responses:
          200:
            description: The whole file.
            headers:
              Accept-Ranges:
                type: string
                enum: [ bytes ]
              ETag:
                type: string
            body:
              audio/mpeg:
                type: file
          206:
            description: The part of the file named in Range.
            headers:
              Content-Range:
                type: string
                example: bytes 0-1048575/209715200
              ETag:
                type: string
            body:
              audio/mpeg:
                type: file
          416:
            description: The range starts past the end of the file. Content-Range gives the real size.
            headers:
              Content-Range:
                type: string
                example: bytes */209715200
          404:
            body:
              type: Error
`,
  keyPoints: [
    'A Range header asks for part of a file, and 206 Partial Content returns that part.',
    'Content-Range on a 206 says which bytes came back and the full size.',
    'Accept-Ranges: bytes tells clients they may ask for ranges.',
    '416 Range Not Satisfiable answers a range past the end, with Content-Range: bytes */size.',
    'If-Range with an ETag stops a client from joining parts of two versions of a file.',
    'A pattern on the Range header can limit callers to the forms the server supports.',
  ],
  solution: `
**Why ranges.** A player that can ask for bytes can start at minute 42 by asking for the bytes near it. A dropped download resumes from the last byte it has. Neither needs the API to cut files into pieces ahead of time.

**The Range pattern.** \`^bytes=([0-9]+-[0-9]*|-[0-9]+)$\` allows the three forms the trust supports:
| Range | Means |
|---|---|
| \`bytes=0-1048575\` | The first megabyte |
| \`bytes=1048576-\` | From the second megabyte to the end |
| \`bytes=-500\` | The last 500 bytes |

HTTP also allows several ranges in one header, answered as \`multipart/byteranges\`. The trust does not support that, so the pattern refuses a comma.

**200, 206 and 416.** No \`Range\` gives the whole file with 200 and \`Accept-Ranges: bytes\`, so the player learns it can ask for parts. A good range gives 206 with \`Content-Range\`. A range past the end gives 416 with \`Content-Range: bytes */209715200\`, which tells the player the real size so it can ask again.

**ETag and If-Range.** If the trust replaces a recording with a cleaner copy, a player resuming an old download would join two different files. Sending the ETag in \`If-Range\` makes the server check first. If the file is unchanged, the part comes back with 206. If not, the whole new file comes back with 200.

**JSON for errors.** The 404 body is JSON, so a missing recording is reported the same way as on the rest of the API. The 416 has no body, because the header says all there is to say.
`,
  followUps: [
    {
      q: 'Should a Mule app stream these files itself?',
      a: 'It can, but large media is often better served from object storage or a content delivery network that already supports ranges. The API can then return a short-lived link, and Mule handles the metadata and access checks.',
    },
    {
      q: 'What happens if the Range header has a bad form, such as bytes=a-b?',
      a: 'When APIkit validates requests against the contract, the pattern makes it reject the call with 400 before the flow logic runs. Some servers instead ignore a bad Range and send the whole file with 200. Say in the description which one the API does.',
    },
    {
      q: 'Why does the 200 response need Accept-Ranges?',
      a: 'A player cannot know in advance whether the server supports ranges. Accept-Ranges: bytes on the first full response tells it that it may seek and resume with Range from then on.',
    },
  ],
}
