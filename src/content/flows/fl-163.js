import { design, flow, handler, source, step } from '../../flow/dsl.js'

const upload = (fileName = 'taxi-receipt.pdf') => ({ http: { method: 'POST', path: '/receipts', body: { employeeId: 'E-10442', fileName, content: '%PDF-1.7 receipt' } } })

export default {
  id: 'fl-163',
  category: 'flows',
  title: 'Expense Receipts to Azure Blob Storage: Give Every Upload a Name of Its Own So No Receipt Overwrites Another',
  level: 'BEGINNER',
  tags: ['myproject', 'azure-blob', 'upload', 'http', 'uuid', 'finance'],
  estMinutes: 15,
  flowChecks: [
    { label: 'Receipts come in on POST /receipts', rule: { type: 'source', component: 'http-listener', where: { path: '/receipts', allowedMethods: 'POST' } } },
    {
      label: 'Each receipt is uploaded to expense-receipts as a PDF',
      rule: { type: 'exists', component: 'azure-upload-blob', where: { container: 'expense-receipts', contentType: 'application/pdf' } },
    },
    {
      label: 'The blob name has a part that is new for every upload',
      rule: {
        type: 'any',
        rules: [
          { type: 'exists', component: 'azure-upload-blob', where: { fileName: 'uuid()' } },
          { type: 'exists', component: 'set-variable', where: { value: 'uuid()' } },
        ],
      },
    },
    { label: 'The caller gets 201 with the blob name after the upload', rule: { type: 'before', first: 'azure-upload-blob', then: 'set-variable', thenWhere: { variableName: 'httpStatus', value: '201' }, outside: true } },
  ],
  simulation: {
    tests: [
      {
        name: 'A taxi receipt',
        about: 'The receipt is stored under the employee\'s folder and the caller gets 201 with the blob name.',
        trigger: upload(),
        expect: {
          status: 201,
          connector: [{ type: 'azure-upload-blob', settings: { container: 'expense-receipts' }, count: 1, has: '%PDF-1.7 receipt' }],
        },
      },
      {
        name: 'Two receipts with the same file name',
        about: 'Every phone names its scans receipt.pdf. Two uploads must give two blobs, so the second does not replace the first.',
        triggers: [upload('receipt.pdf'), upload('receipt.pdf')],
        expect: { connector: [{ type: 'azure-upload-blob', count: 2 }], status: 201 },
      },
      {
        name: 'Blob storage cannot be reached',
        about: 'The storage account does not answer. The caller gets 503 and knows to try again.',
        trigger: upload(),
        overrides: { systems: { calls: { 'azure-upload-blob': { fault: { type: 'AZURE-STORAGE:CONNECTIVITY', description: 'Unable to reach the storage account' } } } } },
        expect: { status: 503, bodyHas: { message: 'Receipt not stored, please try again' } },
      },
    ],
  },
  referenceFlow: design(
    flow(
      'store-expense-receipt',
      source('http-listener', { path: '/receipts', allowedMethods: 'POST' }),
      [
        step('set-variable', { variableName: 'blobName', value: '#["receipts/" ++ payload.employeeId ++ "/" ++ uuid() ++ "-" ++ payload.fileName]' }),
        step('set-payload', { value: '#[payload.content]' }),
        step('azure-upload-blob', { container: 'expense-receipts', fileName: '#[vars.blobName]', fileStream: '#[payload]', contentType: 'application/pdf' }),
        step('set-variable', { variableName: 'httpStatus', value: '201' }),
        step('set-payload', { value: '#[output application/json --- { blobName: vars.blobName }]' }),
      ],
      [
        handler('on-error-propagate', { type: 'ANY' }, [
          step('set-variable', { variableName: 'httpStatus', value: '503' }),
          step('set-payload', { value: '#[output application/json --- { message: "Receipt not stored, please try again" }]' }),
        ]),
      ],
    ),
  ),
  description: `
Fenwick Consulting, a fictional firm, lets staff photograph expense receipts in its app. The app sends each one to \`POST /receipts\`:

\`{ "employeeId": "E-10442", "fileName": "taxi-receipt.pdf", "content": "..." }\`

Receipts are kept as PDFs in the Azure Blob Storage container \`expense-receipts\`. The first version named each blob after \`fileName\`. Most phones call every scan \`receipt.pdf\`, so each new receipt overwrote the one before, and finance lost months of receipts.

**Requirements**
- Store the receipt content in \`expense-receipts\`, with content type \`application/pdf\`.
- Name the blob \`receipts/{employeeId}/{something unique}-{fileName}\`, so two uploads never share a name and finance can still see the original name.
- Answer **201** with \`{ "blobName": "..." }\` once the receipt is stored.
- If blob storage cannot be reached, answer **503** with \`{ "message": "Receipt not stored, please try again" }\`.

**Facts**
- Make the unique part with DataWeave's \`uuid()\`.
- Upload the \`content\` field, not the whole request.
- Blob storage that cannot be reached raises **AZURE-STORAGE:CONNECTIVITY**.

**How the status gets out:** assume the listener's response status is \`#[vars.httpStatus default 200]\` and its body is \`#[payload]\`, for a success and for an error.

**Design the flow.**
`,
  answerTemplate: `## Naming the blob

## Uploading

## The answer and the failure
`,
  keyPoints: [
    'Uploading to a blob name that already exists replaces that blob, so the name must be unique when the content is new.',
    'uuid() gives a value that is new on every call. Keep the original file name after it, so people can still read it.',
    'A / in a blob name shows as a folder in the portal and in tools. Azure keeps a flat list, and the prefix only looks like a folder.',
    'Keep the blob name in a variable: the upload needs it and the answer returns it.',
    'Send the right content type, so a browser opens the PDF instead of downloading an unknown file.',
  ],
  solution: `
1. **HTTP Listener** \`POST /receipts\`.
2. **Set Variable** \`blobName\` = \`#["receipts/" ++ payload.employeeId ++ "/" ++ uuid() ++ "-" ++ payload.fileName]\`.
3. **Set Payload** \`#[payload.content]\`.
4. **Upload Blob**: container \`expense-receipts\`, blob name \`#[vars.blobName]\`, content \`#[payload]\`, content type \`application/pdf\`.
5. \`httpStatus\` = \`201\` and \`{ blobName }\`.
6. Error handler **On Error Propagate** (ANY): \`httpStatus\` = \`503\` and the message.

**Saving the link.** Store the blob name with the expense claim in the expenses database, so finance finds the receipt from the claim.

**Not trusting the file name.** Strip characters such as \`..\` and \`\\\` from \`fileName\`, and limit its length, before it goes into a blob name.
`,
  followUps: [
    {
      q: 'Would the time of upload be unique enough instead of a UUID?',
      a: 'No. Two uploads in the same millisecond, or on two workers, get the same time. A UUID does not collide in practice.',
    },
    {
      q: 'How could storage refuse to overwrite a blob instead?',
      a: 'Azure supports conditional writes, such as uploading only if no blob of that name exists. Check whether your connector version exposes that option before relying on it.',
    },
  ],
}
