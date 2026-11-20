import { design, flow, route, router, scope, source, step } from '../../flow/dsl.js'

const notice = { messageId: 'MD-40912', blobName: 'masterdata/MD-40912.json' }
const item = (itemId, description, dept) => ({ recordType: 'ITEM', itemId, description, dept })
const barcode = (itemId, gtin) => ({ recordType: 'BARCODE', itemId, gtin })
const mixed = [item('CRISPS-SALT-150', 'Ready salted crisps 150 g', 'SNACKS'), barcode('CRISPS-SALT-150', '5012345678900'), item('JUICE-ORG-1L', 'Orange juice 1 l', 'CHILLED'), barcode('JUICE-ORG-1L', '5012345678917')]
const messy = [mixed[0], mixed[1], mixed[2], barcode('JUICE-ORG-1L', '501234567891'), { recordType: 'PRICE', itemId: 'JUICE-ORG-1L', price: 1.45 }]
const tables = {
  stg_item: { columns: ['message_id', 'item_id', 'description', 'dept'], rows: [] },
  stg_barcode: { columns: ['message_id', 'item_id', 'gtin'], rows: [] },
  stg_reject: { columns: ['message_id', 'record_type', 'item_id'], rows: [] },
}
const trigger = { message: { kind: 'jms', destination: 'pdh.masterdata.process', payload: notice } }

export default {
  id: 'fl-287',
  category: 'flows',
  title: 'One Master Data Message, Several Record Types: Batch Steps With Accept Expressions Send Items and Barcodes to Their Own Staging Tables, an Unknown Type Fails on Purpose, and One ONLY_FAILURES Step Catches Every Reject',
  level: 'ADVANCED',
  tags: ['myproject', 'batch', 'accept-expression', 'oracle', 'staging', 'reject-table', 'claim-check', 'gs1'],
  estMinutes: 45,
  flowChecks: [
    { label: 'Requests arrive on the JMS queue pdh.masterdata.process', rule: { type: 'source', component: 'jms-listener', where: { destination: 'pdh.masterdata.process' } } },
    { label: 'Items are bulk inserted into stg_item from a step that accepts only ITEM records', rule: { type: 'inside', component: 'db-bulk-insert', within: 'batch-job', routeWhere: { acceptExpression: 'ITEM' }, where: { sql: 'stg_item' } } },
    { label: 'Barcodes are bulk inserted into stg_barcode from a step that accepts only BARCODE records', rule: { type: 'inside', component: 'db-bulk-insert', within: 'batch-job', routeWhere: { acceptExpression: 'BARCODE' }, where: { sql: 'stg_barcode' } } },
    { label: 'An ONLY_FAILURES step writes stg_reject', rule: { type: 'inside', component: 'db-insert', within: 'batch-job', routeWhere: { acceptPolicy: 'ONLY_FAILURES' }, where: { sql: 'stg_reject' } } },
    { label: 'On Complete publishes the ACK to pdh.masterdata.ack', rule: { type: 'inside', component: 'jms-publish', within: 'batch-job', inSlot: 'onComplete', where: { destination: 'pdh.masterdata.ack' } } },
  ],
  simulation: {
    systems: { db: { tables }, calls: { 'azure-download-blob': { payload: mixed } } },
    tests: [
      {
        name: 'A mixed message',
        about: 'Two items and two barcodes. Each lands in its own table and the ACK says COMPLETED with 4 loaded.',
        trigger,
        expect: {
          noError: true,
          db: { stg_item: { count: 2, has: [{ message_id: 'MD-40912', item_id: 'JUICE-ORG-1L', dept: 'CHILLED' }] }, stg_barcode: { count: 2, has: [{ item_id: 'CRISPS-SALT-150', gtin: '5012345678900' }] }, stg_reject: { count: 0 } },
          sent: [{ destination: 'pdh.masterdata.ack', count: 1, has: { messageId: 'MD-40912', status: 'COMPLETED', loaded: 4, failed: 0 } }],
        },
      },
      {
        name: 'A short barcode and an unknown type',
        about: 'One barcode has 12 digits and one record is a PRICE, which this hub does not take. Both are rejected with their type; the rest load and the ACK says PARTIAL.',
        trigger,
        overrides: { systems: { calls: { 'azure-download-blob': { payload: messy } } } },
        expect: {
          db: { stg_item: { count: 2 }, stg_barcode: { count: 1 }, stg_reject: { count: 2, has: [{ record_type: 'BARCODE', item_id: 'JUICE-ORG-1L' }, { record_type: 'PRICE' }] } },
          sent: [{ destination: 'pdh.masterdata.ack', has: { status: 'PARTIAL', loaded: 3, failed: 2 } }],
        },
      },
      {
        name: 'Oracle refuses the barcodes',
        about: 'The barcode insert fails. Both barcodes are rejected, the items still load, and the ACK says PARTIAL.',
        trigger,
        overrides: { systems: { db: { failWhen: [{ match: 'INSERT INTO stg_barcode', fault: 'QUERY_EXECUTION' }] } } },
        expect: { db: { stg_item: { count: 2 }, stg_barcode: { count: 0 }, stg_reject: { count: 2 } }, sent: [{ destination: 'pdh.masterdata.ack', has: { status: 'PARTIAL', loaded: 2, failed: 2 } }] },
      },
    ],
  },
  referenceFlow: design(
    flow('masterdata-process', source('jms-listener', { destination: 'pdh.masterdata.process', ackMode: 'AUTO', numberOfConsumers: 2 }), [
      step('set-variable', { variableName: 'messageId', value: '#[payload.messageId]' }),
      step('azure-download-blob', { container: 'pdh-inbound', fileName: '#[payload.blobName]' }),
      router(
        'batch-job',
        { jobName: 'masterdata-process', blockSize: 200, maxFailedRecords: -1 },
        [
          route({ name: 'items', acceptPolicy: 'NO_FAILURES', acceptExpression: '#[payload.recordType == "ITEM"]' }, [
            step('validation', { check: 'is-not-blank-string', expression: '#[payload.description]', message: 'NO_DESCRIPTION' }),
            step('set-payload', { value: '#[{ message_id: vars.messageId, item_id: payload.itemId, description: payload.description, dept: payload.dept, recordType: payload.recordType }]' }),
            scope('batch-aggregator', { size: 500, streaming: 'false' }, [step('db-bulk-insert', { database: 'Oracle', sql: 'INSERT INTO stg_item (message_id, item_id, description, dept) VALUES (:message_id, :item_id, :description, :dept)' })]),
          ]),
          route({ name: 'barcodes', acceptPolicy: 'NO_FAILURES', acceptExpression: '#[payload.recordType == "BARCODE"]' }, [
            step('validation', { check: 'is-true', expression: '#[payload.gtin matches /\\d{13}/]', message: 'BAD_GTIN' }),
            step('set-payload', { value: '#[{ message_id: vars.messageId, item_id: payload.itemId, gtin: payload.gtin, recordType: payload.recordType }]' }),
            scope('batch-aggregator', { size: 500, streaming: 'false' }, [step('db-bulk-insert', { database: 'Oracle', sql: 'INSERT INTO stg_barcode (message_id, item_id, gtin) VALUES (:message_id, :item_id, :gtin)' })]),
          ]),
          route({ name: 'unknown', acceptPolicy: 'NO_FAILURES', acceptExpression: '#[not (["ITEM", "BARCODE"] contains payload.recordType)]' }, [
            step('raise-error', { type: 'APP:UNKNOWN_RECORD_TYPE', description: '#["Record type " ++ (payload.recordType default "none") ++ " is not taken"]' }),
          ]),
          route({ name: 'rejects', acceptPolicy: 'ONLY_FAILURES' }, [
            step('db-insert', {
              database: 'Oracle',
              sql: 'INSERT INTO stg_reject (message_id, record_type, item_id) VALUES (:messageId, :recordType, :itemId)',
              inputParameters: '#[{ messageId: vars.messageId, recordType: payload.recordType, itemId: payload.itemId default payload.item_id }]',
            }),
          ]),
        ],
        {
          onComplete: [
            step('set-payload', {
              value:
                '#[output application/json --- { messageId: vars.messageId, status: if (payload.failedRecords == 0) "COMPLETED" else if (payload.successfulRecords == 0) "FAILED" else "PARTIAL", loaded: payload.successfulRecords, failed: payload.failedRecords }]',
            }),
            step('jms-publish', { destination: 'pdh.masterdata.ack', destinationType: 'QUEUE', persistentDelivery: 'true' }),
          ],
        },
      ),
    ]),
  ),
  description: `
Larkfield Grocers, a fictional grocery chain, receives master data messages from its central merchandising team. One message can hold several **record types**, in the GS1 style: items, their barcodes, and now and then types this hub does not take yet. A notice on the **JMS** queue \`pdh.masterdata.process\` points to the blob (container \`pdh-inbound\`):

\`\`\`json
[
  { "recordType": "ITEM", "itemId": "CRISPS-SALT-150", "description": "Ready salted crisps 150 g", "dept": "SNACKS" },
  { "recordType": "BARCODE", "itemId": "CRISPS-SALT-150", "gtin": "5012345678900" }
]
\`\`\`

A message can hold **300,000 records**. The Oracle staging tables:
- \`stg_item\` (\`message_id\`, \`item_id\`, \`description\`, \`dept\`): an item needs a description.
- \`stg_barcode\` (\`message_id\`, \`item_id\`, \`gtin\`): a GTIN is 13 digits.
- \`stg_reject\` (\`message_id\`, \`record_type\`, \`item_id\`): every record that did not load, whatever its type and whatever the reason.

The first version split the list into two lists with DataWeave filters and ran two Batch Jobs. It held the message three times in memory, and the ACK was sent after the first job.

**Requirements**
- One Batch Job. Each type goes through its own step with its own check and its own bulk insert.
- A record of an unknown type must **fail**, so it is rejected and counted.
- One step writes every failed record to \`stg_reject\`, with its type.
- When the job is done, publish \`{ messageId, status, loaded, failed }\` on \`pdh.masterdata.ack\`, with status \`COMPLETED\`, \`PARTIAL\` or \`FAILED\`.

**Facts**
- Download the blob named in the notice from \`pdh-inbound\`. It holds a JSON array of records.
- \`message_id\` is the notice's \`messageId\`. A GTIN is valid when it is exactly 13 digits.
- Let the job go on after failed records: set max failed records to -1.
- Raise \`APP:UNKNOWN_RECORD_TYPE\` for a type this hub does not take.
- \`loaded\` and \`failed\` are the job's successful and failed record counts.

**Design the flow.**
`,
  answerTemplate: `## One job, a step per type

## The unknown type

## Rejects

## The ACK
`,
  keyPoints: [
    'An accept expression lets a step take only some records. A record a step does not accept passes on to the next step untouched, and is not a failure.',
    'Without a step for unknown types, a PRICE record would pass every step and count as successful. A step that accepts the rest and raises an error turns it into a reject.',
    'Each step\'s aggregator groups only the records that step accepted, so items and barcodes get separate bulk inserts.',
    'Keep recordType on the record as it is shaped. Later steps test it in their accept expressions, so an item shaped without it would fall into the unknown step. The reject step needs it too.',
    'One job means one On Complete with the counts for the whole message. The ACK goes there.',
  ],
  solution: `
1. **JMS On New Message** on \`pdh.masterdata.process\`. **Set Variable** \`messageId\`. **Download Blob**.
2. **Batch Job** (max failed records -1):
   - Step \`items\`, accept \`payload.recordType == "ITEM"\`: **Validate** the description, **Set Payload** the row, keeping \`recordType\`, **Batch Aggregator** with **Bulk Insert** into \`stg_item\`.
   - Step \`barcodes\`, accept \`payload.recordType == "BARCODE"\`: **Validate** 13 digits, shape, **Batch Aggregator** with **Bulk Insert** into \`stg_barcode\`.
   - Step \`unknown\`, accept the other types: **Raise Error** \`APP:UNKNOWN_RECORD_TYPE\`.
   - Step \`rejects\` (ONLY_FAILURES): **Insert** into \`stg_reject\`.
   - **On Complete**: **Set Payload** the ACK, **JMS Publish** to \`pdh.masterdata.ack\`.

**Order of types.** Mule moves records through the steps block by block, so a barcode can reach staging before its item does. If the apply procedure needs every item first, let it apply items before barcodes; do not rely on the order inside the job.
`,
  followUps: [
    {
      q: 'An item is rejected. Should its barcode load?',
      a: 'In staging it does no harm: the procedure that applies staging can skip barcodes whose item is missing. Checking it in Mule would need a lookup per barcode, which costs more than it saves.',
    },
    {
      q: 'A new record type, SUPPLIER, arrives next quarter. What changes?',
      a: 'A new step with its own accept expression, check and table, and SUPPLIER added to the known list in the unknown step. Until then SUPPLIER records are rejected and counted, which is the safe default.',
    },
  ],
}
