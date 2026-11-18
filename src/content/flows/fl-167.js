import { design, flow, route, router, source, step } from '../../flow/dsl.js'

const put = (fileName) => ({ http: { method: 'PUT', path: `/cases/CS-40921/attachments/${fileName}`, body: 'file content' } })

export default {
  id: 'fl-167',
  category: 'flows',
  title: 'Case Attachments Open in the Browser Again: Set the Blob Content Type From the File Extension, and Refuse Types You Do Not Store',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'azure-blob', 'content-type', 'upload', 'http', 'validation', 'customer-service'],
  estMinutes: 25,
  flowChecks: [
    {
      label: 'Attachments come in on PUT /cases/{caseId}/attachments/{fileName}',
      rule: { type: 'source', component: 'http-listener', where: { path: '/cases/{caseId}/attachments/{fileName}', allowedMethods: 'PUT' } },
    },
    { label: 'The content type is worked out from the file extension, not fixed', rule: { type: 'exists', component: 'azure-upload-blob', where: { container: 'case-attachments', contentType: 'vars.' } } },
    { label: 'An extension the service does not store gets 415', rule: { type: 'inside', component: 'set-variable', within: 'choice', where: { variableName: 'httpStatus', value: '415' } } },
    { label: 'The upload happens only for an allowed type', rule: { type: 'inside', component: 'azure-upload-blob', within: 'choice' } },
  ],
  simulation: {
    tests: [
      {
        name: 'A PDF in capitals',
        about: 'REPORT.PDF is stored with the content type application/pdf, so the agent\'s browser shows it.',
        trigger: put('REPORT.PDF'),
        expect: { status: 201, connector: [{ type: 'azure-upload-blob', settings: { container: 'case-attachments', contentType: 'application/pdf', fileName: 'CS-40921/REPORT.PDF' }, count: 1 }] },
      },
      {
        name: 'A photo',
        about: 'A .jpg is stored as image/jpeg.',
        trigger: put('damage.jpg'),
        expect: { status: 201, connector: [{ type: 'azure-upload-blob', settings: { contentType: 'image/jpeg' }, count: 1 }] },
      },
      {
        name: 'A program file',
        about: 'An .exe is refused with 415 and nothing is stored.',
        trigger: put('invoice.exe'),
        expect: { status: 415, connector: [{ type: 'azure-upload-blob', count: 0 }] },
      },
      {
        name: 'A file with no extension',
        about: 'A name with no dot cannot be typed, so it is refused too.',
        trigger: put('scan'),
        expect: { status: 415, connector: [{ type: 'azure-upload-blob', count: 0 }] },
      },
    ],
  },
  referenceFlow: design(
    flow('store-case-attachment', source('http-listener', { path: '/cases/{caseId}/attachments/{fileName}', allowedMethods: 'PUT' }), [
      step('set-variable', { variableName: 'fileName', value: '#[attributes.uriParams.fileName]' }),
      step('set-variable', {
        variableName: 'contentType',
        value: '#[if (vars.fileName contains ".") { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", txt: "text/plain" }[lower((vars.fileName splitBy ".")[-1])] else null]',
      }),
      router(
        'choice',
        {},
        [
          route({ expression: '#[vars.contentType == null]' }, [
            step('set-variable', { variableName: 'httpStatus', value: '415' }),
            step('set-payload', { value: '#[output application/json --- { message: "Allowed types: pdf, png, jpg, jpeg, txt" }]' }),
          ]),
        ],
        {
          otherwise: [
            step('azure-upload-blob', { container: 'case-attachments', fileName: '#[attributes.uriParams.caseId ++ "/" ++ vars.fileName]', fileStream: '#[payload]', contentType: '#[vars.contentType]' }),
            step('set-variable', { variableName: 'httpStatus', value: '201' }),
            step('set-payload', { value: '#[output application/json --- { stored: vars.fileName, contentType: vars.contentType }]' }),
          ],
        },
      ),
    ]),
  ),
  description: `
Mossgate Insurance, a fictional insurer, stores files that customers send to support cases in the Azure Blob Storage container \`case-attachments\`, as \`{caseId}/{fileName}\`. The case tool uploads each file with \`PUT /cases/{caseId}/attachments/{fileName}\`, with the file as the body.

The first flow uploaded every file with the content type \`application/octet-stream\`. Agents who open an attachment now get a download of an unknown file instead of the PDF or photo in the browser, and the security team found an \`.exe\` stored on a case.

**Requirements**
- Set the content type from the file extension, whatever its case: \`pdf\` application/pdf, \`png\` image/png, \`jpg\` and \`jpeg\` image/jpeg, \`txt\` text/plain.
- Any other extension, or none, gets **415** and nothing is stored.
- Answer **201** with \`{ stored, contentType }\` after the upload.

**Design the flow.**
`,
  answerTemplate: `## Reading the extension

## Choosing the content type

## Refusing other files
`,
  keyPoints: [
    'Blob storage keeps the content type it is given and sends it back as the Content-Type header when the blob is downloaded. That header decides whether a browser shows a file or saves it.',
    'Read the extension from the last part after a dot, in lower case, and look it up in a small map.',
    'An allow list is safer than a deny list: an extension nobody thought of is refused.',
    'The extension says what the sender claims. For more safety, also check the first bytes of the file, or scan it, before anyone opens it.',
    '415 Unsupported Media Type tells the caller the request was fine except for the kind of file.',
  ],
  solution: `
1. **HTTP Listener** \`PUT /cases/{caseId}/attachments/{fileName}\`.
2. **Set Variable** \`fileName\` from the URI parameter.
3. **Set Variable** \`contentType\`: a map from extension to type, looked up with \`lower((vars.fileName splitBy ".")[-1])\`, and \`null\` for a name with no dot.
4. **Choice**:
   - \`#[vars.contentType == null]\`: \`httpStatus\` = \`415\` and the list of allowed types.
   - Otherwise: **Upload Blob** to \`case-attachments\`, blob \`{caseId}/{fileName}\`, content type \`#[vars.contentType]\`, then \`201\` and \`{ stored, contentType }\`.

**Files already stored.** The blobs uploaded with the wrong type keep it. A one off job can set the right content type on each with the Azure tools, by extension.

**Content disposition.** If some files must always download, such as spreadsheets, set Content-Disposition on those blobs as well, where the connector allows it.
`,
  followUps: [
    {
      q: 'Why not let the case tool send the Content-Type header and use that?',
      a: 'You could start from it, but the client can send anything. Check it against the allow list, so the client cannot store an .exe as image/png.',
    },
    {
      q: 'Where else does the content type matter?',
      a: 'Caching and compression at a CDN in front of storage, and any app that reads the blob and decides how to parse it from the type.',
    },
  ],
}
