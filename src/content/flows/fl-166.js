import { design, flow, handler, route, router, source, step } from '../../flow/dsl.js'

const work = (messageId, messageType, senderId = 'RIDGEWAY-TOOLS') => ({
  message: { kind: 'jms', destination: 'PDH.INBOUND.WORK', payload: { messageId, messageType, senderId, blobName: `inbound/${senderId}/${messageId}.json` } },
})
const itemDoc = { senderDocumentId: 'RB-ITEM-20261113-01', lines: [{ gtin: '05012345678900', description: 'Cordless drill, 18V', brand: 'Ridgeway' }] }
const recadvDoc = { senderDocumentId: 'ND-RA-554120', lines: [{ lineNo: 1, gtin: '05012345678900', qtyReceived: 24, poNumber: 'PO-2026-118840' }] }
const known = { sender_id: 'RIDGEWAY-TOOLS', sender_document_id: 'RB-ITEM-20261112-07', message_id: 'MSG-90300' }

export default {
  id: 'fl-166',
  category: 'flows',
  title: 'Product Data Hub Router: Download the Claim Checked Blob, Validate It, Refuse a Repeated Sender Document, and Route by Message Type',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'azure-blob', 'claim-check', 'jms', 'json-schema', 'idempotency', 'oracle', 'choice', 'gs1'],
  estMinutes: 35,
  flowChecks: [
    { label: 'Work is read from PDH.INBOUND.WORK', rule: { type: 'source', component: 'jms-listener', where: { destination: 'PDH.INBOUND.WORK' } } },
    { label: 'The document is downloaded from pdh-inbound by the blob name in the notification', rule: { type: 'exists', component: 'azure-download-blob', where: { container: 'pdh-inbound', fileName: 'blobName' } } },
    { label: 'The document is validated after the download', rule: { type: 'before', first: 'azure-download-blob', then: 'validation', thenWhere: { check: 'json-schema' } } },
    {
      label: 'The sender document ID is checked for a repeat before routing',
      rule: { type: 'before', first: 'db-select', firstWhere: { sql: { all: ['pdh_sender_documents', 'sender_document_id'] } }, then: 'jms-publish', thenWhere: { destination: 'WORK' } },
    },
    { label: 'A Choice routes each message type to its own work queue', rule: { type: 'routes', component: 'choice', min: 2, routeWhere: { expression: 'messageType' } } },
    {
      label: 'A repeat, an invalid document or an unknown type gets a REJECTED ACK',
      rule: { type: 'inside', component: 'jms-publish', within: 'on-error-continue', where: { destination: 'PDH.ACK' } },
    },
  ],
  simulation: {
    systems: {
      db: { tables: { pdh_sender_documents: { key: ['sender_id', 'sender_document_id'], rows: [known] } } },
      calls: { 'azure-download-blob': { payload: itemDoc } },
      schemas: {
        'pdh-document.json': {
          type: 'object',
          required: ['senderDocumentId', 'lines'],
          properties: { senderDocumentId: { type: 'string', minLength: 1 }, lines: { type: 'array', minItems: 1 } },
        },
      },
    },
    tests: [
      {
        name: 'An Item document',
        about: 'The blob is downloaded and valid, the sender document ID is new, and the document goes to PDH.ITEM.WORK with the message ID added.',
        trigger: work('MSG-90501', 'Item'),
        expect: {
          ack: 'acked',
          connector: [{ type: 'azure-download-blob', settings: { container: 'pdh-inbound', fileName: 'inbound/RIDGEWAY-TOOLS/MSG-90501.json' }, count: 1 }],
          sent: [{ destination: 'PDH.ITEM.WORK', count: 1, has: { messageId: 'MSG-90501', senderDocumentId: 'RB-ITEM-20261113-01' } }],
          notSent: ['PDH.ACK', 'PDH.RECADV.WORK'],
          db: { pdh_sender_documents: { count: 2 } },
        },
      },
      {
        name: 'A ReceivingAdvice document',
        about: 'A distribution centre\'s receiving advice goes to PDH.RECADV.WORK.',
        trigger: work('MSG-90502', 'ReceivingAdvice', 'NORTHDALE-DC'),
        overrides: { systems: { calls: { 'azure-download-blob': { payload: recadvDoc } } } },
        expect: { sent: [{ destination: 'PDH.RECADV.WORK', count: 1, has: { messageId: 'MSG-90502' } }], notSent: ['PDH.ITEM.WORK', 'PDH.ACK'] },
      },
      {
        name: 'A sender document sent twice',
        about: 'Ridgeway uploads yesterday\'s document again under a new message ID. The sender document ID gives it away: a REJECTED ACK and no routing.',
        trigger: work('MSG-90503', 'Item'),
        overrides: { systems: { calls: { 'azure-download-blob': { payload: { ...itemDoc, senderDocumentId: 'RB-ITEM-20261112-07' } } } } },
        expect: { ack: 'acked', sent: [{ destination: 'PDH.ACK', count: 1, has: { messageId: 'MSG-90503', status: 'REJECTED' } }], notSent: ['PDH.ITEM.WORK'] },
      },
      {
        name: 'A document with no lines',
        about: 'The blob holds a document with an empty lines list. It fails validation and gets a REJECTED ACK.',
        trigger: work('MSG-90504', 'Item'),
        overrides: { systems: { calls: { 'azure-download-blob': { payload: { senderDocumentId: 'RB-ITEM-20261113-02', lines: [] } } } } },
        expect: { ack: 'acked', sent: [{ destination: 'PDH.ACK', count: 1, has: { status: 'REJECTED' } }], notSent: ['PDH.ITEM.WORK'], db: { pdh_sender_documents: { count: 1 } } },
      },
      {
        name: 'A message type the hub does not process',
        about: 'A Pricing document arrives. There is no process flow for it, so it is rejected, not lost.',
        trigger: work('MSG-90505', 'Pricing'),
        expect: { sent: [{ destination: 'PDH.ACK', count: 1, has: { status: 'REJECTED' } }], notSent: ['PDH.ITEM.WORK', 'PDH.RECADV.WORK'] },
      },
      {
        name: 'Blob storage is down',
        about: 'The download fails. The work message goes back to the broker to be tried again, and no ACK is sent.',
        trigger: work('MSG-90506', 'Item'),
        overrides: { systems: { calls: { 'azure-download-blob': { fault: { type: 'AZURE-STORAGE:CONNECTIVITY', description: 'Unable to reach the storage account' } } } } },
        expect: { ack: 'returned', notSent: ['PDH.ACK', 'PDH.ITEM.WORK'] },
      },
    ],
  },
  referenceFlow: design(
    flow(
      'pdh-route-inbound',
      source('jms-listener', { destination: 'PDH.INBOUND.WORK', ackMode: 'AUTO' }),
      [
        step('set-variable', { variableName: 'notification', value: '#[payload]' }),
        step('azure-download-blob', { container: 'pdh-inbound', fileName: '#[vars.notification.blobName]' }),
        step('validation', { check: 'json-schema', expression: 'schemas/pdh-document.json' }),
        step('set-variable', { variableName: 'document', value: '#[payload ++ { messageId: vars.notification.messageId, senderId: vars.notification.senderId, messageType: vars.notification.messageType }]' }),
        step('db-select', {
          database: 'Oracle',
          sql: 'SELECT message_id FROM pdh_sender_documents WHERE sender_id = :senderId AND sender_document_id = :senderDocumentId',
          inputParameters: '#[{ senderId: vars.document.senderId, senderDocumentId: vars.document.senderDocumentId }]',
          target: 'seen',
        }),
        router('choice', {}, [route({ expression: '#[not isEmpty(vars.seen)]' }, [step('raise-error', { type: 'PDH:DUPLICATE_DOCUMENT', description: '#["Sender document " ++ vars.document.senderDocumentId ++ " was received as " ++ vars.seen[0].message_id]' })])], { otherwise: [] }),
        step('db-insert', {
          database: 'Oracle',
          sql: 'INSERT INTO pdh_sender_documents (sender_id, sender_document_id, message_id) VALUES (:senderId, :senderDocumentId, :messageId)',
          inputParameters: '#[{ senderId: vars.document.senderId, senderDocumentId: vars.document.senderDocumentId, messageId: vars.document.messageId }]',
          target: 'recorded',
        }),
        step('set-payload', { value: '#[output application/json --- vars.document]' }),
        router(
          'choice',
          {},
          [
            route({ expression: '#[vars.document.messageType == "Item"]' }, [step('jms-publish', { destination: 'PDH.ITEM.WORK', destinationType: 'QUEUE', persistentDelivery: 'true' })]),
            route({ expression: '#[vars.document.messageType == "ReceivingAdvice"]' }, [step('jms-publish', { destination: 'PDH.RECADV.WORK', destinationType: 'QUEUE', persistentDelivery: 'true' })]),
          ],
          { otherwise: [step('raise-error', { type: 'PDH:UNKNOWN_TYPE', description: '#["No process flow for " ++ vars.document.messageType]' })] },
        ),
      ],
      [
        handler('on-error-continue', { type: 'PDH:DUPLICATE_DOCUMENT, PDH:UNKNOWN_TYPE, JSON:SCHEMA_NOT_HONOURED' }, [
          step('logger', { level: 'WARN', message: '#["Message " ++ vars.notification.messageId ++ " rejected: " ++ error.description]' }),
          step('set-payload', { value: '#[output application/json --- { messageId: vars.notification.messageId, senderId: vars.notification.senderId, status: "REJECTED", reason: error.description }]' }),
          step('jms-publish', { destination: 'PDH.ACK', destinationType: 'QUEUE', persistentDelivery: 'true' }),
        ]),
      ],
    ),
  ),
  description: `
Copperline Home Supply’s product data hub (fictional) takes in GS1 style documents by claim check: the sender uploads the JSON document to the Azure Blob Storage container \`pdh-inbound\`, and the intake flow puts a small notification on the JMS queue \`PDH.INBOUND.WORK\`:

\`{ "messageId": "MSG-90501", "messageType": "Item", "senderId": "RIDGEWAY-TOOLS", "blobName": "inbound/RIDGEWAY-TOOLS/MSG-90501.json" }\`

The document in the blob looks like \`{ "senderDocumentId": "RB-ITEM-20261113-01", "lines": [ ... ] }\`.

You build the **router**: the flow between the intake and the process flows. Each message type has its own work queue: \`PDH.ITEM.WORK\` for Item and \`PDH.RECADV.WORK\` for ReceivingAdvice. More types come later.

**Requirements**
- Download the document named in the notification.
- Validate it against \`schemas/pdh-document.json\`.
- Senders sometimes upload the same document again under a new message ID. Refuse a sender document ID that the Oracle table \`pdh_sender_documents\` (\`sender_id\`, \`sender_document_id\`, \`message_id\`) already holds for that sender. Record new ones.
- Send the document, with \`messageId\`, \`senderId\` and \`messageType\` added, to the work queue for its type.
- A repeat, an invalid document or a type without a process flow raises an error, answered with \`{ messageId, senderId, status: "REJECTED", reason }\` on \`PDH.ACK\`. These are acknowledged, not retried.
- If blob storage or Oracle is down, send nothing and let the broker deliver the work again.

**Facts**
- A document that fails the schema raises **JSON:SCHEMA_NOT_HONOURED**. Blob storage that is down raises **AZURE-STORAGE:CONNECTIVITY**, and Oracle down raises **DB:CONNECTIVITY**. Those two must fail the flow.
- Record a new sender document with its \`sender_id\`, \`sender_document_id\` and the \`message_id\` of this notification.
- The REJECTED ACK takes \`messageId\` and \`senderId\` from the notification.

**Design the flow.**
`,
  answerTemplate: `## Fetching the document

## Validating it

## The sender document check

## Routing by type

## Rejected or retried
`,
  keyPoints: [
    'The claim check is redeemed here: the notification\'s blob name says which document to download.',
    'Two duplicate checks, two jobs. The intake refuses a repeated message ID; the router refuses the same business document sent again under a new ID.',
    'The key is the sender and its document ID together, because two senders can use the same document number.',
    'A Choice on the message type sends each document to the queue of its process flow. The otherwise branch raises an error, so an unknown type is answered, not dropped.',
    'Only errors that will never succeed are continued with a REJECTED ACK. Connectivity errors propagate, and the broker redelivers the work.',
    'Keep the notification in a variable. The download replaces the payload.',
  ],
  solution: `
1. **JMS On New Message** on \`PDH.INBOUND.WORK\`. **Set Variable** \`notification\`.
2. **Download Blob**: container \`pdh-inbound\`, blob \`#[vars.notification.blobName]\`.
3. **Validate schema** \`schemas/pdh-document.json\`.
4. **Set Variable** \`document\`: the document plus \`messageId\`, \`senderId\` and \`messageType\`.
5. **Database Select** on \`pdh_sender_documents\` by sender and sender document ID, Target \`seen\`. **Choice**: found raises \`PDH:DUPLICATE_DOCUMENT\`.
6. **Database Insert** the new sender document.
7. **Set Payload** \`vars.document\`, then **Choice** on \`messageType\`: Item publishes to \`PDH.ITEM.WORK\`, ReceivingAdvice to \`PDH.RECADV.WORK\`, otherwise raise \`PDH:UNKNOWN_TYPE\`.
8. Error handler **On Error Continue** for \`PDH:DUPLICATE_DOCUMENT, PDH:UNKNOWN_TYPE, JSON:SCHEMA_NOT_HONOURED\`: WARN, REJECTED ACK, **JMS Publish** \`PDH.ACK\`.

**A missing blob.** If the blob is not there, Download Blob fails with a connector error. Find its exact type in Studio and decide: a sender that uploads late could be retried a few times, then rejected.

**Flow Reference instead of queues.** The router could call one process flow per type with Flow Reference. A queue per type lets each type scale and fail on its own, and a big SupplierItem file does not hold up small Item updates.

**Large documents.** The document is passed on in the work message here. For very large ones, pass the blob name again and let the process flow stream the download.
`,
  followUps: [
    {
      q: 'Why record the sender document before routing, and not after the process flow ends?',
      a: 'Two copies could then both pass the check while the first is still being processed. Recording first closes that window. If processing then fails, support replays it, and the replay must be allowed past this check.',
    },
    {
      q: 'Where would the blob be marked as processed?',
      a: 'In the process flow, once the load into staging has committed. Moving it earlier would hide a document that was never loaded.',
    },
  ],
}
