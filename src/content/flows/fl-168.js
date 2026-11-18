import { design, flow, source, step } from '../../flow/dsl.js'

const doc = {
  messageId: 'MSG-90501',
  senderId: 'RIDGEWAY-BRAKES',
  messageType: 'Item',
  blobName: 'inbound/RIDGEWAY-BRAKES/MSG-90501.json',
  lines: [
    { gtin: '05012345678900', description: 'Brake pad set, front', brand: 'Ridgeway' },
    { gtin: '05012345678917', description: 'Brake pad set, rear', brand: 'Ridgeway' },
  ],
}
const msg = { message: { kind: 'jms', destination: 'PDH.ITEM.WORK', payload: doc } }
const tables = {
  stg_item: { columns: ['message_id', 'gtin', 'description', 'brand'], rows: [] },
  pdh_inbound_messages: { key: 'message_id', rows: [{ message_id: 'MSG-90501', status: 'RECEIVED' }] },
}

export default {
  id: 'fl-168',
  category: 'flows',
  title: 'Product Data Hub Item Load: Stage the Lines, Then Mark the Blob Processed by Moving It to pdh-processed, in That Order',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'azure-blob', 'jms', 'claim-check', 'archive', 'bulk-insert', 'oracle', 'gs1'],
  estMinutes: 30,
  flowChecks: [
    { label: 'Item documents are read from PDH.ITEM.WORK', rule: { type: 'source', component: 'jms-listener', where: { destination: 'PDH.ITEM.WORK' } } },
    { label: 'The lines are bulk inserted into stg_item', rule: { type: 'exists', component: 'db-bulk-insert', where: { sql: 'stg_item' } } },
    { label: 'The document is copied to pdh-processed only after the load', rule: { type: 'before', first: 'db-bulk-insert', then: 'azure-upload-blob', thenWhere: { container: 'pdh-processed' }, outside: true } },
    { label: 'The inbound blob is deleted only after the copy', rule: { type: 'before', first: 'azure-upload-blob', then: 'azure-delete-blob', thenWhere: { container: 'pdh-inbound' }, every: true, outside: true } },
    { label: 'The message is marked PROCESSED last', rule: { type: 'before', first: 'azure-delete-blob', then: 'db-update', thenWhere: { sql: 'PROCESSED' }, outside: true } },
  ],
  simulation: {
    systems: { db: { tables }, calls: { 'azure-upload-blob': { payload: true }, 'azure-delete-blob': { payload: true } } },
    tests: [
      {
        name: 'An Item document is loaded',
        about: 'Two lines are staged, the document is copied to pdh-processed under the same name, removed from pdh-inbound, and the message is PROCESSED.',
        trigger: msg,
        expect: {
          ack: 'acked',
          db: { stg_item: { count: 2 }, pdh_inbound_messages: { has: [{ message_id: 'MSG-90501', status: 'PROCESSED' }] } },
          connector: [
            { type: 'azure-upload-blob', settings: { container: 'pdh-processed', fileName: 'inbound/RIDGEWAY-BRAKES/MSG-90501.json' }, count: 1 },
            { type: 'azure-delete-blob', settings: { container: 'pdh-inbound', fileName: 'inbound/RIDGEWAY-BRAKES/MSG-90501.json' }, count: 1 },
          ],
        },
      },
      {
        name: 'The staging load fails',
        about: 'Oracle refuses the insert. The blob stays in pdh-inbound, untouched, and the message goes back for another try.',
        trigger: msg,
        overrides: { systems: { db: { failWhen: [{ match: 'INSERT INTO stg_item', fault: 'CONNECTIVITY' }] } } },
        expect: { ack: 'returned', connector: [{ type: 'azure-upload-blob', count: 0 }, { type: 'azure-delete-blob', count: 0 }] },
      },
      {
        name: 'The copy to pdh-processed fails',
        about: 'Blob storage refuses the copy. The original must not be deleted, or the document would exist nowhere.',
        trigger: msg,
        overrides: { systems: { calls: { 'azure-upload-blob': { fault: { type: 'AZURE-STORAGE:CONNECTIVITY', description: 'Unable to reach the storage account' } } } } },
        expect: { ack: 'returned', connector: [{ type: 'azure-delete-blob', count: 0 }], db: { pdh_inbound_messages: { has: [{ message_id: 'MSG-90501', status: 'RECEIVED' }] } } },
      },
    ],
  },
  referenceFlow: design(
    flow('pdh-load-item', source('jms-listener', { destination: 'PDH.ITEM.WORK', ackMode: 'AUTO' }), [
      step('set-variable', { variableName: 'doc', value: '#[payload]' }),
      step('set-payload', { value: '#[vars.doc.lines map ((l) -> { message_id: vars.doc.messageId, gtin: l.gtin, description: l.description, brand: l.brand })]' }),
      step('db-bulk-insert', { database: 'Oracle', sql: 'INSERT INTO stg_item (message_id, gtin, description, brand) VALUES (:message_id, :gtin, :description, :brand)' }),
      step('set-payload', { value: '#[output application/json --- vars.doc - "messageType"]' }),
      step('azure-upload-blob', { container: 'pdh-processed', fileName: '#[vars.doc.blobName]', fileStream: '#[payload]', contentType: 'application/json' }),
      step('azure-delete-blob', { container: 'pdh-inbound', fileName: '#[vars.doc.blobName]' }),
      step('db-update', {
        database: 'Oracle',
        sql: "UPDATE pdh_inbound_messages SET status = 'PROCESSED' WHERE message_id = :messageId",
        inputParameters: '#[{ messageId: vars.doc.messageId }]',
      }),
      step('logger', { level: 'INFO', message: '#["Item " ++ vars.doc.messageId ++ " loaded, " ++ (sizeOf(vars.doc.lines) as String) ++ " lines"]' }),
    ]),
  ),
  description: `
Copperline Home Supply' product data hub (fictional) receives each document as a JSON blob in the Azure Blob Storage container \`pdh-inbound\`. The router passes Item documents to the JMS queue \`PDH.ITEM.WORK\`:

\`{ "messageId", "senderId", "messageType": "Item", "blobName": "inbound/RIDGEWAY-BRAKES/MSG-90501.json", "lines": [ { "gtin", "description", "brand" } ] }\`

You build the Item process flow. Support finds unprocessed documents by looking in \`pdh-inbound\`: anything there has not been loaded. So a document must leave \`pdh-inbound\` once it is safely loaded, and never before.

**Requirements**
- Bulk insert the lines into the Oracle staging table \`stg_item\` (\`message_id\`, \`gtin\`, \`description\`, \`brand\`).
- Mark the blob processed: copy the document to the container \`pdh-processed\` under the same blob name, then delete it from \`pdh-inbound\`.
- Then set \`status\` to \`PROCESSED\` in \`pdh_inbound_messages\`.
- If any step fails, leave the blob in \`pdh-inbound\` (or in both containers) and let the broker deliver the message again.

**Design the flow.**
`,
  answerTemplate: `## Staging the lines

## Moving the blob

## The order of the steps
`,
  keyPoints: [
    'There is no rename or move between containers in this design: a move is a copy, then a delete of the original.',
    'Copy before delete, and delete only after the copy worked. A failure between the two leaves the document in both places, which is safe. The other order can lose it.',
    'Move the blob only after the staging insert has committed. The blob\'s place is support\'s view of what is done, so it must not run ahead of the data.',
    'A redelivery after a failed copy loads the lines again. Key the staging rows on message_id and line, or delete the message\'s rows before the insert, so a retry does not double them.',
    'Some teams flag a blob as processed with metadata or a blob index tag instead of moving it. That avoids the copy, but every reader must then check the flag.',
  ],
  solution: `
1. **JMS On New Message** on \`PDH.ITEM.WORK\`. **Set Variable** \`doc\`.
2. **Set Payload** the lines mapped to the staging columns, with \`message_id\`.
3. **Bulk Insert** into \`stg_item\`.
4. **Set Payload** the document. **Upload Blob** to \`pdh-processed\`, blob \`#[vars.doc.blobName]\`, content type \`application/json\`.
5. **Delete Blob** from \`pdh-inbound\`, same name.
6. **Database Update** \`pdh_inbound_messages\` to \`PROCESSED\`.
7. **Logger** with the line count.

**A server side copy.** Uploading the document again sends it through Mule. Azure also has a server side Copy Blob operation. If your connector version offers it, use it for large documents, then delete.

**Retention.** Give \`pdh-processed\` a lifecycle rule, such as moving blobs to a cooler tier after 30 days and deleting them after a year.
`,
  followUps: [
    {
      q: 'The delete fails after the copy worked. What does support see?',
      a: 'The document in both containers and the message still RECEIVED. The redelivery stages the lines again and finishes the move. That is why the staging load must be safe to repeat.',
    },
    {
      q: 'Why not move the blob first, then load?',
      a: 'If the load then failed, the document would sit in pdh-processed although nothing was loaded, and support would never look for it.',
    },
  ],
}
