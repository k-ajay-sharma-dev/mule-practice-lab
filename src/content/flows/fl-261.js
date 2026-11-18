import { design, flow, source, step } from '../../flow/dsl.js'

const name = 'SALES_EXPORT_20261113.csv'
const file = `/exports/out/${name}`
const csv = 'store,sku,units\n0101,TENT-2P-OLV,2\n0102,JKT-RAIN-M,5\n0101,BOTTLE-1L,11'

export default {
  id: 'fl-261',
  category: 'flows',
  title: 'A Claim Check for a 1.2 GB Sales Export: Upload the File to Azure Blob Storage and Put Only Its Name on the Queue',
  level: 'BEGINNER',
  tags: ['myproject', 'large-files', 'claim-check', 'azure-blob', 'jms', 'queues'],
  estMinutes: 20,
  flowChecks: [
    { label: 'The file is uploaded to the claims container', rule: { type: 'exists', component: 'azure-upload-blob', where: { container: 'claims' } } },
    { label: 'The notice is published after the upload', rule: { type: 'before', first: 'azure-upload-blob', then: 'jms-publish', thenWhere: { destination: 'sales.export.ready' } } },
    { label: 'The message body is a small notice with the blob name, built before the publish', rule: { type: 'before', first: 'set-payload', firstWhere: { value: 'blobName' }, then: 'jms-publish' } },
    { label: 'The file is moved to /exports/sent after the notice', rule: { type: 'before', first: 'jms-publish', then: 'file-move', thenWhere: { targetPath: '/exports/sent' } } },
  ],
  simulation: {
    systems: { files: { [file]: csv } },
    tests: [
      {
        name: 'A nightly export',
        about: 'The file goes to the blob store as sales/SALES_EXPORT_20261113.csv. The queue gets one small notice with that name and the size, not the rows. The file moves to sent.',
        trigger: { file: { path: file } },
        expect: {
          noError: true,
          connector: [{ type: 'azure-upload-blob', settings: { container: 'claims', fileName: `sales/${name}` }, count: 1 }],
          sent: [{ destination: 'sales.export.ready', count: 1, has: { blobName: `sales/${name}`, container: 'claims' } }],
          files: { [`/exports/sent/${name}`]: { exists: true } },
        },
      },
    ],
  },
  referenceFlow: design(
    flow('sales-export-claim-check', source('file-listener', { directory: '/exports/out', matcher: 'SALES_EXPORT_*.csv', postAction: 'none', timeBetweenSizeCheck: 20000 }), [
      step('set-variable', { variableName: 'filePath', value: '#[attributes.path]' }),
      step('set-variable', { variableName: 'blobName', value: '#["sales/" ++ attributes.fileName]' }),
      step('set-variable', { variableName: 'size', value: '#[attributes.size]' }),
      step('azure-upload-blob', { container: 'claims', fileName: '#[vars.blobName]', fileStream: '#[payload]', contentType: 'text/csv' }),
      step('set-payload', { value: '#[output application/json --- { container: "claims", blobName: vars.blobName, sizeBytes: vars.size }]' }),
      step('jms-publish', { destination: 'sales.export.ready', destinationType: 'QUEUE', persistentDelivery: 'true' }),
      step('file-move', { sourcePath: '#[vars.filePath]', targetPath: '/exports/sent' }),
    ]),
  ),
  description: `
Brindle Outdoor, a fictional outdoor gear retailer, produces a nightly sales export for the planning platform loader. The export lands in \`/exports/out\` as \`SALES_EXPORT_<date>.csv\`, about **1.2 GB**.

A developer first published the whole file as one message on the JMS queue \`sales.export.ready\`. The broker refused messages that large. Splitting the file into thousands of messages filled the broker's disk on the first night.

The team wants a claim check: the file goes to **Azure Blob Storage** (container \`claims\`), and the queue carries a notice like:

\`\`\`json
{ "container": "claims", "blobName": "sales/SALES_EXPORT_20261113.csv", "sizeBytes": 1288490188 }
\`\`\`

**Requirements**
- Upload the file as \`sales/<file name>\` to the \`claims\` container.
- Only after the upload, publish the notice to \`sales.export.ready\`. The notice holds no rows.
- Move the file to \`/exports/sent\`.

**Design the flow.**
`,
  answerTemplate: `## The upload

## The notice

## Order of the steps
`,
  keyPoints: [
    'A claim check splits a big message in two: the data goes to a store built for size, a small claim ticket goes through the broker.',
    'Publish after the upload. A consumer that gets the notice first would look for a blob that is not there yet.',
    'Pass the file stream to the upload. Nothing in the flow should read the content into memory.',
    'Keep the size in the notice, so a consumer can refuse a file it cannot handle before downloading it.',
    'Plan the clean up: a lifecycle rule on the container can delete claims after, say, 14 days.',
  ],
  solution: `
1. **File On New or Updated File** on \`/exports/out\`, size check wait 20 seconds.
2. **Set Variable** \`filePath\`, \`blobName\` (\`"sales/" ++ attributes.fileName\`), \`size\` (\`attributes.size\`).
3. **Azure Blob Storage Upload Blob**, container \`claims\`, blob \`vars.blobName\`, content \`payload\` (the stream).
4. **Set Payload** the notice. **JMS Publish** to \`sales.export.ready\`.
5. **File Move** to \`/exports/sent\`.

**Very large uploads.** Check whether your connector version uploads a big stream in blocks. If not, a server side tool such as AzCopy on the export host may be the better path, with Mule sending only the notice.
`,
  followUps: [
    {
      q: 'The upload works but the publish fails. What is left behind?',
      a: 'A blob nobody knows about. The file is still in /exports/out, so the next run uploads it again under the same name and publishes. Overwriting the same blob name keeps it harmless.',
    },
    {
      q: 'Finance and a fraud check want the same export. Queue or topic?',
      a: 'A topic, or one queue per consumer, so each gets its own copy. A single queue gives each notice to only one of them.',
    },
  ],
}
