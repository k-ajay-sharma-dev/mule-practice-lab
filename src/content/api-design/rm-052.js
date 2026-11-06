export default {
  id: 'rm-052',
  category: 'api-design',
  title: 'Energy Bills API: A Binary PDF Download with Content-Disposition',
  level: 'ADVANCED',
  tags: ['raml', 'api-design', 'binary', 'file', 'headers', 'energy'],
  estMinutes: 25,
  description: `
An energy supplier shows bills in its customer portal. Customers want the PDF, either opened in the browser or saved to disk. The rest of the API is JSON, so one response has to be different.

RAML has a built-in type \`file\` for binary content. A body can name its own media type, which replaces the default from \`mediaType\` for that body only:

\`\`\`
body:
  application/pdf:
    type: file
\`\`\`

\`Content-Disposition\` is a response header that tells the browser what to do with the content. \`attachment; filename="bill.pdf"\` means save it under that name. \`inline\` means show it in the page.

Note that an error from this endpoint is still JSON. A caller who asks for a PDF and gets a 404 must not receive a broken PDF.

**Requirements**
- Title \`Energy Bills API\`, with JSON as the default media type.
- A type \`Bill\` with a required string \`billId\`, a required number \`amountDue\`, and a required \`dueOn\` that holds a date with no time.
- A type \`Error\` with a required string \`code\` and a required string \`message\`.
- \`GET /bills/{billId}\` returns a \`Bill\` with status 200, or 404 with an \`Error\`.
- \`GET /bills/{billId}/document\` returns status 200 with an \`application/pdf\` body of type \`file\`.
- That 200 has a \`Content-Disposition\` header and a \`Content-Length\` header, so a browser can show progress.
- It takes an optional query parameter \`disposition\` that is one of \`attachment\`, \`inline\`.
- It returns 404 with an \`Error\` body in JSON.
`,
  starter: `#%RAML 1.0
title: Energy Bills API
mediaType: application/json

types:

/bills:
  /{billId}:
`,
  ramlChecks: [
    {
      label: 'Bill has a required billId and amountDue',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Bill', prop: 'billId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Bill', prop: 'amountDue', want: { type: 'number', required: true } },
        ],
      },
    },
    { label: 'Bill.dueOn is a date with no time', rule: { type: 'prop', typeName: 'Bill', prop: 'dueOn', want: { type: 'date-only', required: true } } },
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
    {
      label: 'GET /bills/{billId} returns a Bill, or 404 with an Error',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/bills/{}', method: 'get', status: '200', typeIs: 'Bill' },
          { type: 'response', path: '/bills/{}', method: 'get', status: '404', typeIs: 'Error' },
        ],
      },
    },
    { label: 'The document is an application/pdf body of type file', rule: { type: 'response', path: '/bills/{}/document', method: 'get', status: '200', media: 'application/pdf', typeIs: 'file' } },
    { label: 'The 200 has a Content-Disposition header', rule: { type: 'response', path: '/bills/{}/document', method: 'get', status: '200', header: 'Content-Disposition' } },
    { label: 'The 200 has a Content-Length header', rule: { type: 'response', path: '/bills/{}/document', method: 'get', status: '200', header: 'Content-Length' } },
    {
      label: 'disposition is optional and allows attachment and inline only',
      rule: { type: 'param', path: '/bills/{}/document', method: 'get', in: 'query', name: 'disposition', want: { required: false, enum: { exactly: ['attachment', 'inline'] } } },
    },
    { label: 'A missing document is a 404 with an Error in JSON', rule: { type: 'response', path: '/bills/{}/document', method: 'get', status: '404', media: 'application/json', typeIs: 'Error' } },
  ],
  referenceRaml: `#%RAML 1.0
title: Energy Bills API
mediaType: application/json

types:
  Bill:
    type: object
    properties:
      billId: string
      amountDue: number
      dueOn: date-only
  Error:
    type: object
    properties:
      code: string
      message: string

/bills:
  /{billId}:
    get:
      responses:
        200:
          body:
            type: Bill
        404:
          body:
            type: Error
    /document:
      get:
        queryParameters:
          disposition?:
            type: string
            enum: [ attachment, inline ]
        responses:
          200:
            headers:
              Content-Disposition:
                type: string
                example: attachment; filename="bill-1001.pdf"
              Content-Length:
                type: integer
            body:
              application/pdf:
                type: file
          404:
            body:
              type: Error
`,
  keyPoints: [
    'file is the built-in RAML type for binary content.',
    'A media type written on a body replaces the mediaType default for that body only.',
    'Content-Disposition decides between saving the file and showing it.',
    'An error from a binary endpoint is still JSON, so callers can read it.',
  ],
  solution: `
The PDF is its own resource under the bill. \`GET /bills/{billId}\` stays plain JSON, and a client that only wants the amount never downloads the file.

The 200 names \`application/pdf\` itself. The 404 has no media type of its own, so it picks up JSON from \`mediaType\`. One method can answer in two formats, and the status code says which to expect.

The header tells a browser what to do, and the \`disposition\` parameter lets the portal choose. A file name in the header also spares every client from inventing one.
`,
  followUps: [
    {
      q: 'Why not return the PDF as Base64 inside a JSON field?',
      a: 'Base64 adds about a third to the size, and the whole document must sit in memory to parse the JSON. A binary response can stream straight to the browser.',
    },
    {
      q: 'How could the contract limit the file further?',
      a: 'The file type has the facets fileTypes, minLength and maxLength. They state which formats are allowed and how many bytes the content may hold.',
    },
    {
      q: 'What changes in a Mule flow for a large PDF?',
      a: 'Keep the payload as a stream and do not transform it. Loading the document into a string or a DataWeave object wastes memory and can corrupt binary content.',
    },
  ],
}
