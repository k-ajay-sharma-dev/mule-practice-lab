import { design, flow, route, router, scope, source, step } from '../../flow/dsl.js'

const notice = { setId: 'CD-20261113-01', blobName: 'customs/CD-20261113-01.json' }
const lines = [
  { declaration: 'D-1001', line: 1, hsCode: '6306220000', value: { amount: 1820.5, currency: 'GBP' } },
  { declaration: 'D-1001', line: 2, hsCode: '6201400000', value: { amount: 940.0, currency: 'GBP' } },
  { declaration: 'D-1003', line: 1, hsCode: '7323930000', value: { amount: 310.75, currency: 'GBP' } },
]
const out = '/erp/in/CUSTOMS_CD-20261113-01.csv'

export default {
  id: 'fl-265',
  category: 'flows',
  title: 'Two Million Customs Lines From a Blob Into One CSV File for the ERP: Map Each Record in a Batch Step and Write the File Once From a Streaming Batch Aggregator',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'large-files', 'batch', 'batch-aggregator', 'streaming', 'azure-blob', 'claim-check', 'csv'],
  estMinutes: 30,
  flowChecks: [
    { label: 'The blob named in the notice is downloaded before the Batch Job', rule: { type: 'before', first: 'azure-download-blob', then: 'batch-job' } },
    { label: 'A streaming Batch Aggregator writes the output file', rule: { type: 'inside', component: 'file-write', within: 'batch-aggregator', withinWhere: { streaming: 'true' }, where: { path: '/erp/in/CUSTOMS_' } } },
    { label: 'The aggregator turns the records into CSV before the write', rule: { type: 'inside', component: 'transform', within: 'batch-aggregator', where: { script: 'application/csv' } } },
  ],
  simulation: {
    systems: { calls: { 'azure-download-blob': { payload: lines } } },
    tests: [
      {
        name: 'A customs set',
        about: 'One CSV file holds every line of the set, the first declaration and the last.',
        trigger: { message: { kind: 'jms', destination: 'customs.ready', payload: notice } },
        expect: {
          noError: true,
          connector: [{ type: 'azure-download-blob', settings: { fileName: 'customs/CD-20261113-01.json' }, count: 1 }],
          files: { [out]: { exists: true, has: 'D-1001,1,6306220000,1820.5,GBP' }, '/erp/in/*.csv': { count: 1 } },
        },
      },
      {
        name: 'The last line is there too',
        about: 'A design that writes a file per group, or overwrites the file with each group, loses lines. This one keeps D-1003.',
        trigger: { message: { kind: 'jms', destination: 'customs.ready', payload: notice } },
        expect: { files: { [out]: { has: 'D-1003,1,7323930000,310.75,GBP' } } },
      },
    ],
  },
  referenceFlow: design(
    flow('customs-lines-to-erp', source('jms-listener', { destination: 'customs.ready', ackMode: 'AUTO', numberOfConsumers: 1 }), [
      step('set-variable', { variableName: 'setId', value: '#[payload.setId]' }),
      step('azure-download-blob', { container: 'inbound', fileName: '#[payload.blobName]' }),
      router(
        'batch-job',
        { jobName: 'customs-lines-to-erp', blockSize: 500, maxFailedRecords: -1 },
        [
          route({ name: 'map-line', acceptPolicy: 'NO_FAILURES' }, [
            step('transform', {
              script: '%dw 2.0\noutput application/java\n---\n{ declaration: payload.declaration, line: payload.line, hs_code: payload.hsCode, amount: payload.value.amount, currency: payload.value.currency }',
            }),
            scope('batch-aggregator', { streaming: 'true' }, [
              step('transform', { script: '%dw 2.0\noutput application/csv\n---\npayload' }),
              step('file-write', { path: '#["/erp/in/CUSTOMS_" ++ vars.setId ++ ".csv"]', mode: 'OVERWRITE' }),
            ]),
          ]),
        ],
        { onComplete: [step('logger', { level: 'INFO', message: '#["Customs set " ++ vars.setId ++ ": written=" ++ (payload.successfulRecords as String) ++ " failed=" ++ (payload.failedRecords as String)]' })] },
      ),
    ]),
  ),
  description: `
Quayle Freight, a fictional freight forwarder, gets customs declaration lines from its customs broker. For each set the broker writes a JSON list to **Azure Blob Storage** (container \`inbound\`) and sends a notice on the **JMS** queue \`customs.ready\`:

\`\`\`json
{ "setId": "CD-20261113-01", "blobName": "customs/CD-20261113-01.json" }
\`\`\`

A set can hold **2 million lines**:

\`\`\`json
[ { "declaration": "D-1001", "line": 1, "hsCode": "6306220000", "value": { "amount": 1820.5, "currency": "GBP" } } ]
\`\`\`

The ERP loads **one CSV file per set** from a mounted folder \`/erp/in\`, named \`CUSTOMS_<setId>.csv\`:

\`\`\`
declaration,line,hs_code,amount,currency
D-1001,1,6306220000,1820.5,GBP
\`\`\`

A first version mapped the whole list in one Transform and ran out of memory. A second used a Batch Aggregator of 500 that wrote the file each time: only the last 500 lines survived.

**Requirements**
- Download the blob the notice names.
- Map each line in a batch step.
- Write one CSV file with every line and one header, without holding the whole set in one list.

**Facts**
- Download the blob from container \`inbound\` with the name in \`blobName\`.
- The file's columns are \`declaration\`, \`line\`, \`hs_code\`, \`amount\` and \`currency\`, in that order, as in the example.

**What each system sends back**
- The JMS listener gives the notice as the payload, so the blob name is \`payload.blobName\`.
- Download Blob replaces the payload with the blob's content: the JSON list of lines shown above. The notice is gone after it, so keep \`setId\` in a variable first.

**Design the flow.**
`,
  answerTemplate: `## Mapping each line

## One file from many records

## Why the earlier versions failed
`,
  keyPoints: [
    'A streaming Batch Aggregator gives its steps every record of the job as one stream, read once and in order, instead of groups.',
    'A Transform to CSV over that stream writes as it reads, so one File Write produces the whole file with one header.',
    'With a sized aggregator each group is a separate list. OVERWRITE keeps only the last group; APPEND repeats the header in every group.',
    'A streaming aggregator\'s stream can be read only once, so do not log sizeOf(payload) or touch it twice before the write.',
    'Check what your Mule version allows inside a streaming aggregator: some components need random access and will fail on a stream.',
  ],
  solution: `
1. **JMS On New Message** on \`customs.ready\`. **Set Variable** \`setId\`.
2. **Azure Blob Storage Download Blob**, blob \`#[payload.blobName]\`.
3. **Batch Job**, step \`map-line\`:
   - **Transform** each line to the ERP columns.
   - **Batch Aggregator** with streaming true: **Transform** to \`application/csv\`, **File Write** \`/erp/in/CUSTOMS_<setId>.csv\`.
4. **On Complete**: log the counts.

**The ERP must not read a half written file.** Write \`.tmp\` and rename after the write, or write a marker, as the ERP's loader expects.
`,
  followUps: [
    {
      q: 'Why use a Batch Job at all, and not a Transform straight from the blob stream to the file?',
      a: 'A single streaming Transform can work when the mapping needs nothing else. The Batch Job adds per line failure handling and counts, and lets a bad line fail on its own instead of stopping the whole file.',
    },
    {
      q: 'Some lines fail mapping. Are they in the file?',
      a: 'No. The aggregator gets only the records that did not fail. Add an ONLY_FAILURES step to write them to a reject list, and tell the ERP team the count.',
    },
  ],
}
