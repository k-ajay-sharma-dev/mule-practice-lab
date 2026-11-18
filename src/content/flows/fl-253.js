import { design, flow, route, router, scope, source, step } from '../../flow/dsl.js'

const notice = { messageId: 'RA-1001', blobName: 'receiving/RA-1001.json', lineCount: 3 }
const lines = [
  { line: 1, po: 'PO-55120', item: 'SEED-TOM-CHERRY', qty: 240 },
  { line: 2, po: 'PO-55120', item: 'POT-30CM-TERRA', qty: 60 },
  { line: 3, po: 'PO-55121', item: 'HOSE-25M-GRN', qty: 18 },
]
const tables = { stg_receiving_line: { columns: ['message_id', 'line_no', 'po', 'item', 'qty'], rows: [] } }

export default {
  id: 'fl-253',
  category: 'flows',
  title: 'A Claim Check Into a Batch Job: a Small JMS Notice Points to a Blob, the Lines Are Bulk Inserted Into Oracle Staging, and On Complete Publishes the ACK With the Real Counts',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'batch', 'claim-check', 'azure-blob', 'jms', 'oracle', 'ack', 'on-complete'],
  estMinutes: 35,
  flowChecks: [
    { label: 'Notices arrive on the JMS queue receiving.notify', rule: { type: 'source', component: 'jms-listener', where: { destination: 'receiving.notify' } } },
    { label: 'The blob the notice names is downloaded before the Batch Job', rule: { type: 'before', first: 'azure-download-blob', firstWhere: { fileName: 'blobName' }, then: 'batch-job' } },
    { label: 'A Batch Aggregator bulk inserts the lines into stg_receiving_line', rule: { type: 'inside', component: 'db-bulk-insert', within: 'batch-aggregator', where: { sql: 'stg_receiving_line' } } },
    { label: 'On Complete publishes the ACK to receiving.ack', rule: { type: 'inside', component: 'jms-publish', within: 'batch-job', inSlot: 'onComplete', where: { destination: 'receiving.ack' } } },
  ],
  simulation: {
    systems: { db: { tables }, calls: { 'azure-download-blob': { payload: lines } } },
    tests: [
      {
        name: 'A normal advice',
        about: 'The three lines are staged with message ID RA-1001, and the ACK says LOADED with 3 loaded and 0 failed.',
        trigger: { message: { kind: 'jms', destination: 'receiving.notify', payload: notice } },
        expect: {
          noError: true,
          connector: [{ type: 'azure-download-blob', settings: { fileName: 'receiving/RA-1001.json' }, count: 1 }],
          db: { stg_receiving_line: { count: 3, has: [{ message_id: 'RA-1001', line_no: 3, item: 'HOSE-25M-GRN' }] } },
          sent: [{ destination: 'receiving.ack', count: 1, has: { messageId: 'RA-1001', status: 'LOADED', loaded: 3, failed: 0 } }],
        },
      },
      {
        name: 'Oracle refuses the group',
        about: 'The bulk insert fails, so all three lines fail. The ACK says FAILED with 3 failed, and the warehouse partner knows to resend.',
        trigger: { message: { kind: 'jms', destination: 'receiving.notify', payload: notice } },
        overrides: { systems: { db: { failWhen: [{ match: 'INSERT INTO stg_receiving_line', fault: 'QUERY_EXECUTION' }] } } },
        expect: { sent: [{ destination: 'receiving.ack', count: 1, has: { messageId: 'RA-1001', status: 'FAILED', failed: 3 } }] },
      },
    ],
  },
  referenceFlow: design(
    flow('receiving-advice-in', source('jms-listener', { destination: 'receiving.notify', ackMode: 'AUTO', numberOfConsumers: 2 }), [
      step('set-variable', { variableName: 'messageId', value: '#[payload.messageId]' }),
      step('azure-download-blob', { container: 'inbound', fileName: '#[payload.blobName]' }),
      router(
        'batch-job',
        { jobName: 'receiving-advice-in', blockSize: 200, maxFailedRecords: -1 },
        [
          route({ name: 'stage-lines', acceptPolicy: 'NO_FAILURES' }, [
            step('transform', { script: '%dw 2.0\noutput application/java\n---\n{ message_id: vars.messageId, line_no: payload.line, po: payload.po, item: payload.item, qty: payload.qty }' }),
            scope('batch-aggregator', { size: 500, streaming: 'false' }, [
              step('db-bulk-insert', { database: 'Oracle', sql: 'INSERT INTO stg_receiving_line (message_id, line_no, po, item, qty) VALUES (:message_id, :line_no, :po, :item, :qty)' }),
            ]),
          ]),
        ],
        {
          onComplete: [
            step('set-payload', {
              value:
                '#[output application/json --- { messageId: vars.messageId, status: if (payload.failedRecords == 0) "LOADED" else if (payload.successfulRecords == 0) "FAILED" else "PARTIAL", loaded: payload.successfulRecords, failed: payload.failedRecords }]',
            }),
            step('jms-publish', { destination: 'receiving.ack', destinationType: 'QUEUE', persistentDelivery: 'true' }),
          ],
        },
      ),
    ]),
  ),
  description: `
Hollin Garden Supply, a fictional garden centre chain, receives goods from a warehouse partner. For each delivery the partner writes a receiving advice as a JSON file to **Azure Blob Storage** (container \`inbound\`) and sends a small notice on the **JMS** queue \`receiving.notify\`:

\`\`\`json
{ "messageId": "RA-1001", "blobName": "receiving/RA-1001.json", "lineCount": 3 }
\`\`\`

The blob is a list of lines, up to **200,000** for a distribution centre delivery:

\`\`\`json
[ { "line": 1, "po": "PO-55120", "item": "SEED-TOM-CHERRY", "qty": 240 } ]
\`\`\`

The lines go to the Oracle staging table \`stg_receiving_line\` (\`message_id\`, \`line_no\`, \`po\`, \`item\`, \`qty\`). The partner waits for an ACK on \`receiving.ack\`:

\`\`\`json
{ "messageId": "RA-1001", "status": "LOADED", "loaded": 3, "failed": 0 }
\`\`\`

Status is \`LOADED\` when nothing failed, \`FAILED\` when nothing loaded, and \`PARTIAL\` otherwise.

The first version published the ACK right after the Batch Job step. Every ACK said \`LOADED\`, even for advices Oracle refused.

**Requirements**
- Download the blob the notice names. The notice itself carries no lines.
- Load the lines through a Batch Job, bulk inserting groups into staging with the message ID.
- Publish the ACK with the real counts once the job is done.

**Design the flow.**
`,
  answerTemplate: `## The notice and the blob

## The Batch Job

## The ACK
`,
  keyPoints: [
    'A claim check keeps big bodies off the broker: the message carries a pointer, the store carries the data.',
    'The Batch Job returns at once. A step after it runs before any record is loaded, so it cannot know the counts.',
    'On Complete runs when every record is done, with successfulRecords and failedRecords. The ACK belongs there.',
    'Keep the message ID in a variable before the job. The payload changes to the blob, then to the job result.',
    'The JMS message that started the flow is acknowledged when the flow ends, before the job finishes. If the app dies mid job, Mule batch keeps its records, but plan for a notice that is never ACKed: the partner resends after a timeout.',
  ],
  solution: `
1. **JMS On New Message** on \`receiving.notify\`.
2. **Set Variable** \`messageId\`.
3. **Azure Blob Storage Download Blob**, container \`inbound\`, blob \`#[payload.blobName]\`.
4. **Batch Job** (max failed records -1), step \`stage-lines\`:
   - **Transform** with \`message_id\`.
   - **Batch Aggregator** (size 500): **Bulk Insert** into \`stg_receiving_line\`.
   - **On Complete**: **Set Payload** the ACK from the counts, **JMS Publish** to \`receiving.ack\`.

**Streaming the blob.** For 200,000 lines, keep the download as a stream and let the Batch Job read it record by record. Check that your connector version returns a stream and that nothing in between reads it whole.
`,
  followUps: [
    {
      q: 'The partner sends the same notice twice. What happens?',
      a: 'The lines are staged twice. Check the message ID against a message log table before the download, and skip a notice you have already loaded.',
    },
    {
      q: 'Why not send the lines on the JMS queue itself?',
      a: 'Brokers are tuned for many small messages. A 50 MB message strains the broker\'s memory and disk, and some brokers refuse it. The blob store is built for large objects.',
    },
  ],
}
