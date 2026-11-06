export default {
  id: 'rm-024',
  category: 'api-design',
  title: 'Mortgage Documents API: File Upload with multipart/form-data',
  level: 'ADVANCED',
  tags: ['raml', 'api-design', 'file-upload', 'multipart', 'data-types', 'lending'],
  estMinutes: 25,
  description: `
A mortgage lender asks applicants to upload proof of identity and income. The current API takes files as Base64 text inside JSON, which makes each file about a third larger and fills memory on the server.

**multipart/form-data** is the standard way to send files over HTTP. The body is split into parts, and each part can be a file or a plain field. In RAML you describe the parts as the properties of an object, and use the built-in type \`file\` for the file itself.

The \`file\` type has two useful facets. \`fileTypes\` lists the allowed media types. \`maxLength\` sets the largest size, in bytes.

**Requirements**
- Title \`Mortgage Documents API\`, with JSON as the default media type.
- A type \`DocumentType\`, a string that is one of \`ID\`, \`PAYSLIP\`, \`BANK_STATEMENT\`.
- A type \`DocumentUpload\` with a required \`file\` of type \`file\`, which allows only \`application/pdf\` and \`image/jpeg\`, up to 10 MB (\`10485760\` bytes).
- \`DocumentUpload\` also has a required \`documentType\` of type \`DocumentType\`.
- A type \`Document\` with required strings \`documentId\` and \`fileName\`, and a required \`documentType\` of type \`DocumentType\`.
- \`POST /applications/{applicationId}/documents\` takes a \`multipart/form-data\` body of type \`DocumentUpload\`.
- It returns a \`Document\` with status 201.
- It returns 404 for an unknown application, 413 for a file that is too large, and 415 for a file type that is not allowed.
`,
  starter: `#%RAML 1.0
title: Mortgage Documents API
mediaType: application/json

types:

/applications:
  /{applicationId}:
`,
  ramlChecks: [
    {
      label: 'The title is Mortgage Documents API and JSON is the default media type',
      rule: {
        type: 'all',
        rules: [
          { type: 'root', key: 'title', want: 'Mortgage Documents API' },
          { type: 'root', key: 'mediaType', want: 'application/json' },
        ],
      },
    },
    {
      label: 'file is a required file limited to PDF and JPEG',
      rule: { type: 'prop', typeName: 'DocumentUpload', prop: 'file', want: { type: 'file', required: true, fileTypes: { exactly: ['application/pdf', 'image/jpeg'] } } },
    },
    { label: 'file is limited to 10 MB', rule: { type: 'prop', typeName: 'DocumentUpload', prop: 'file', want: { maxLength: 10485760 } } },
    { label: 'DocumentType allows ID, PAYSLIP and BANK_STATEMENT', rule: { type: 'typeDecl', name: 'DocumentType', want: { enum: { exactly: ['ID', 'PAYSLIP', 'BANK_STATEMENT'] } } } },
    { label: 'DocumentUpload has a required documentType', rule: { type: 'prop', typeName: 'DocumentUpload', prop: 'documentType', want: { type: 'DocumentType', required: true } } },
    {
      label: 'Document has required documentId, fileName and documentType',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Document', prop: 'documentId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Document', prop: 'fileName', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Document', prop: 'documentType', want: { type: 'DocumentType', required: true } },
        ],
      },
    },
    {
      label: 'POST takes multipart/form-data with type DocumentUpload',
      rule: { type: 'body', path: '/applications/{}/documents', method: 'post', media: 'multipart/form-data', typeIs: 'DocumentUpload' },
    },
    { label: 'POST returns a Document with status 201', rule: { type: 'response', path: '/applications/{}/documents', method: 'post', status: '201', typeIs: 'Document' } },
    { label: 'POST returns 404 for an unknown application', rule: { type: 'response', path: '/applications/{}/documents', method: 'post', status: '404' } },
    { label: 'POST returns 413 for a file that is too large', rule: { type: 'response', path: '/applications/{}/documents', method: 'post', status: '413' } },
    { label: 'POST returns 415 for a file type that is not allowed', rule: { type: 'response', path: '/applications/{}/documents', method: 'post', status: '415' } },
  ],
  referenceRaml: `#%RAML 1.0
title: Mortgage Documents API
mediaType: application/json

types:
  DocumentType:
    type: string
    enum: [ ID, PAYSLIP, BANK_STATEMENT ]
  DocumentUpload:
    type: object
    properties:
      file:
        type: file
        fileTypes: [ application/pdf, image/jpeg ]
        maxLength: 10485760
      documentType: DocumentType
  Document:
    type: object
    properties:
      documentId: string
      fileName: string
      documentType: DocumentType

/applications:
  /{applicationId}:
    /documents:
      post:
        body:
          multipart/form-data:
            type: DocumentUpload
        responses:
          201:
            body:
              type: Document
          404:
            description: No application has this id.
          413:
            description: The file is larger than 10 MB.
          415:
            description: The file is not a PDF or a JPEG.
`,
  keyPoints: [
    'multipart/form-data sends files as raw bytes, without the size cost of Base64 in JSON.',
    'file is a built-in RAML type. fileTypes and maxLength set what it accepts.',
    'maxLength on a file is in bytes.',
    'A media type key on one body overrides the default mediaType for that body only.',
    '413 is for size and 415 is for format. Callers can tell the two apart and show the right message.',
  ],
  solution: `
The upload is the one place that differs from the rest of the API, so only its body names \`multipart/form-data\`. The response still uses the JSON default.

\`DocumentUpload\` puts the file and its label in one request. The two cannot end up separated, and a file never arrives without a \`documentType\`.

The limits belong in the contract because callers can then check a file before they send it. That is kinder to a user on a slow connection than failing after a 10 MB upload.
`,
  followUps: [
    {
      q: 'Is the fileTypes list enough to stop a dangerous upload?',
      a: 'No. A caller sets the part type itself, so it can claim anything. Treat it as a contract for honest callers. The server still has to inspect and scan what it receives.',
    },
    {
      q: 'What would you do for files of several gigabytes?',
      a: 'Keep them out of the API. Return a short-lived upload URL for object storage, let the client upload there directly, and have the API record the result.',
    },
    {
      q: 'How does a caller read this API differently from a JSON one?',
      a: 'It sends a Content-Type of multipart/form-data with a boundary, and HTTP clients build this for you. Each property in the type becomes a named part.',
    },
  ],
}
