import { design, flow, handler, route, router, scope, source, step } from '../../flow/dsl.js'

const notice = { messageId: 'SI-30417', messageType: 'SupplierItem', blobName: 'supplier-item/SI-30417.json' }
const lines = [
  { supplierId: 'SUP-ORCHARD', itemId: 'APPLE-GALA-1KG', cost: 1.12 },
  { supplierId: 'SUP-ORCHARD', itemId: 'PEAR-CONF-1KG', cost: 1.34 },
]
const tablesWith = (log = []) => ({
  message_log: { key: 'message_id', columns: ['message_id', 'status', 'reason'], rows: log },
  stg_supplier_item: { columns: ['message_id', 'supplier_id', 'item_id', 'cost'], rows: [] },
})
const arrives = (extra = {}) => ({ message: { kind: 'jms', destination: 'pdh.supplieritem.notify', payload: { ...notice, ...extra } } })
const found = { 'azure-list-blobs': { payload: [{ name: notice.blobName }] }, 'azure-download-blob': { payload: lines } }
const missing = { 'azure-list-blobs': { payload: [] }, 'azure-download-blob': { payload: lines } }
const ack = 'pdh.supplieritem.ack'

export default {
  id: 'fl-274',
  category: 'flows',
  title: 'A Notice That Arrives Before Its Blob: Check the Blob Exists, Send the Notice to a Wait Queue With an Attempt Count, Reject It After Five Tries, and Only Then Write the Message Log',
  level: 'EXPERT',
  tags: ['myproject', 'azure-blob', 'claim-check', 'queues', 'jms', 'oracle', 'ack', 'retry', 'message-log'],
  estMinutes: 60,
  flowChecks: [
    { label: 'Notices arrive on the JMS queue pdh.supplieritem.notify', rule: { type: 'source', component: 'jms-listener', where: { destination: 'pdh.supplieritem.notify' } } },
    { label: 'The message ID is looked up in message_log before the blob is checked', rule: { type: 'before', first: 'db-select', firstWhere: { sql: 'message_log' }, then: 'azure-list-blobs' } },
    { label: 'The blob\'s existence is checked before it is downloaded', rule: { type: 'before', first: 'azure-list-blobs', then: 'azure-download-blob' } },
    { label: 'A notice whose blob is missing goes to pdh.supplieritem.wait from a Choice', rule: { type: 'inside', component: 'jms-publish', within: 'choice', where: { destination: 'pdh.supplieritem.wait' } } },
    { label: 'A failed load marks the message FAILED in an On Error Continue', rule: { type: 'inside', component: 'db-update', within: 'on-error-continue', where: { sql: { all: ['message_log', 'FAILED'] } } } },
  ],
  simulation: {
    systems: { db: { tables: tablesWith() }, calls: found },
    tests: [
      {
        name: 'The blob is there',
        about: 'The blob exists. SI-30417 is logged, a RECEIVED ACK goes out, the two lines are staged and the final ACK says LOADED.',
        trigger: arrives(),
        expect: {
          noError: true,
          db: { message_log: { has: [{ message_id: 'SI-30417', status: 'LOADED' }] }, stg_supplier_item: { count: 2, has: [{ message_id: 'SI-30417', item_id: 'PEAR-CONF-1KG' }] } },
          sent: [
            { destination: ack, count: 2 },
            { destination: ack, has: { messageId: 'SI-30417', status: 'RECEIVED' } },
            { destination: ack, has: { messageId: 'SI-30417', status: 'LOADED', lines: 2 } },
          ],
          notSent: ['pdh.supplieritem.wait'],
          ack: 'acked',
        },
      },
      {
        name: 'The blob is not there yet',
        about: 'The supplier is still writing the blob. The notice goes to the wait queue with attempt 1. Nothing is logged and no ACK goes out yet, so the retried notice is not a duplicate.',
        trigger: arrives(),
        overrides: { systems: { calls: missing } },
        expect: {
          noError: true,
          sent: [{ destination: 'pdh.supplieritem.wait', count: 1, has: { messageId: 'SI-30417', blobName: notice.blobName, attempt: 1 } }],
          notSent: [ack],
          db: { message_log: { count: 0 } },
          connector: [{ type: 'azure-download-blob', count: 0 }],
          ack: 'acked',
        },
      },
      {
        name: 'Still missing on the fifth try',
        about: 'The notice comes back with attempt 4 and the blob is still missing. It is logged as REJECTED with reason BLOB_MISSING and the supplier gets a REJECTED ACK.',
        trigger: arrives({ attempt: 4 }),
        overrides: { systems: { calls: missing } },
        expect: {
          noError: true,
          db: { message_log: { has: [{ message_id: 'SI-30417', status: 'REJECTED', reason: 'BLOB_MISSING' }] } },
          sent: [{ destination: ack, count: 1, has: { messageId: 'SI-30417', status: 'REJECTED', reason: 'BLOB_MISSING' } }],
          notSent: ['pdh.supplieritem.wait'],
        },
      },
      {
        name: 'A repeated notice',
        about: 'SI-30417 was loaded yesterday. The adapter answers DUPLICATE and does not look at Blob Storage at all.',
        trigger: arrives(),
        overrides: { systems: { db: { tables: tablesWith([{ message_id: 'SI-30417', status: 'LOADED', reason: null }]) } } },
        expect: { noError: true, sent: [{ destination: ack, count: 1, has: { status: 'DUPLICATE' } }], connector: [{ type: 'azure-list-blobs', count: 0 }, { type: 'azure-download-blob', count: 0 }] },
      },
      {
        name: 'Oracle refuses the lines',
        about: 'The staging insert fails. The message is marked FAILED, the supplier gets a FAILED ACK after the RECEIVED one, and the notice is not redelivered: the restart app replays it after the fix.',
        trigger: arrives(),
        overrides: { systems: { db: { failWhen: [{ match: 'INSERT INTO stg_supplier_item', fault: 'QUERY_EXECUTION' }] } } },
        expect: {
          db: { message_log: { has: [{ message_id: 'SI-30417', status: 'FAILED' }] } },
          sent: [{ destination: ack, count: 2 }, { destination: ack, has: { status: 'FAILED' } }],
          ack: 'acked',
        },
      },
    ],
  },
  referenceFlow: design(
    flow('supplier-item-intake', source('jms-listener', { destination: 'pdh.supplieritem.notify', ackMode: 'AUTO', numberOfConsumers: 2 }), [
      step('set-variable', { variableName: 'notice', value: '#[payload]' }),
      step('set-variable', { variableName: 'attempt', value: '#[(payload.attempt default 0) + 1]' }),
      step('db-select', { database: 'Oracle', sql: 'SELECT status FROM message_log WHERE message_id = :messageId', inputParameters: '#[{ messageId: vars.notice.messageId }]', target: 'seen' }),
      router(
        'choice',
        {},
        [
          route({ expression: '#[not isEmpty(vars.seen)]' }, [
            step('logger', { level: 'WARN', message: '#["Duplicate notice " ++ vars.notice.messageId]' }),
            step('set-payload', { value: '#[output application/json --- { messageId: vars.notice.messageId, status: "DUPLICATE" }]' }),
            step('jms-publish', { destination: ack, destinationType: 'QUEUE', persistentDelivery: 'true' }),
          ]),
        ],
        {
          otherwise: [
            step('azure-list-blobs', { containerName: 'pdh-inbound', blobPath: '#[vars.notice.blobName]' }),
            router(
              'choice',
              {},
              [
                route({ expression: '#[isEmpty(payload) and vars.attempt < 5]' }, [
                  step('logger', { level: 'INFO', message: '#["Blob for " ++ vars.notice.messageId ++ " not there yet, attempt " ++ (vars.attempt as String)]' }),
                  step('set-payload', { value: '#[output application/json --- vars.notice ++ { attempt: vars.attempt }]' }),
                  step('jms-publish', { destination: 'pdh.supplieritem.wait', destinationType: 'QUEUE', persistentDelivery: 'true' }),
                ]),
                route({ expression: '#[isEmpty(payload)]' }, [
                  step('db-insert', {
                    database: 'Oracle',
                    sql: "INSERT INTO message_log (message_id, status, reason) VALUES (:messageId, 'REJECTED', 'BLOB_MISSING')",
                    inputParameters: '#[{ messageId: vars.notice.messageId }]',
                    target: 'logged',
                  }),
                  step('set-payload', { value: '#[output application/json --- { messageId: vars.notice.messageId, status: "REJECTED", reason: "BLOB_MISSING" }]' }),
                  step('jms-publish', { destination: ack, destinationType: 'QUEUE', persistentDelivery: 'true' }),
                ]),
              ],
              {
                otherwise: [
                  step('db-insert', { database: 'Oracle', sql: "INSERT INTO message_log (message_id, status) VALUES (:messageId, 'RECEIVED')", inputParameters: '#[{ messageId: vars.notice.messageId }]', target: 'logged' }),
                  step('set-payload', { value: '#[output application/json --- { messageId: vars.notice.messageId, status: "RECEIVED" }]' }),
                  step('jms-publish', { destination: ack, destinationType: 'QUEUE', persistentDelivery: 'true' }),
                  scope(
                    'try',
                    { transactionalAction: 'INDIFFERENT' },
                    [
                      step('azure-download-blob', { container: 'pdh-inbound', fileName: '#[vars.notice.blobName]' }),
                      step('transform', { script: '%dw 2.0\noutput application/java\n---\npayload map { message_id: vars.notice.messageId, supplier_id: $.supplierId, item_id: $.itemId, cost: $.cost }' }),
                      step('db-bulk-insert', { database: 'Oracle', sql: 'INSERT INTO stg_supplier_item (message_id, supplier_id, item_id, cost) VALUES (:message_id, :supplier_id, :item_id, :cost)', target: 'staged' }),
                      step('db-update', { database: 'Oracle', sql: "UPDATE message_log SET status = 'LOADED' WHERE message_id = :messageId", inputParameters: '#[{ messageId: vars.notice.messageId }]', target: 'marked' }),
                      step('set-payload', { value: '#[output application/json --- { messageId: vars.notice.messageId, status: "LOADED", lines: sizeOf(vars.staged) }]' }),
                      step('jms-publish', { destination: ack, destinationType: 'QUEUE', persistentDelivery: 'true' }),
                    ],
                    {
                      errorHandlers: [
                        handler('on-error-continue', { type: 'ANY' }, [
                          step('db-update', {
                            database: 'Oracle',
                            sql: "UPDATE message_log SET status = 'FAILED', reason = :reason WHERE message_id = :messageId",
                            inputParameters: '#[{ messageId: vars.notice.messageId, reason: error.errorType.asString }]',
                          }),
                          step('set-payload', { value: '#[output application/json --- { messageId: vars.notice.messageId, status: "FAILED", reason: error.errorType.asString }]' }),
                          step('jms-publish', { destination: ack, destinationType: 'QUEUE', persistentDelivery: 'true' }),
                        ]),
                      ],
                    },
                  ),
                ],
              },
            ),
          ],
        },
      ),
    ]),
  ),
  description: `
Larkfield Grocers, a fictional grocery chain, runs a product data hub. Suppliers send a small notice on the **JMS** queue \`pdh.supplieritem.notify\` and write the lines as a JSON blob to **Azure Blob Storage** (container \`pdh-inbound\`):

\`\`\`json
{ "messageId": "SI-30417", "messageType": "SupplierItem", "blobName": "supplier-item/SI-30417.json" }
\`\`\`

Some suppliers send the notice **before** their upload has finished. Today the download fails, the notice is logged as FAILED and support replays it by hand an hour later. About 40 notices a week go this way.

The Oracle side:
- \`message_log\` (key \`message_id\`, \`status\`, \`reason\`): one row per message the hub has accepted, rejected or loaded.
- \`stg_supplier_item\` (\`message_id\`, \`supplier_id\`, \`item_id\`, \`cost\`).

The broker team has set up \`pdh.supplieritem.wait\`: a message published there comes back to \`pdh.supplieritem.notify\` about two minutes later (on ActiveMQ this can be done with scheduled delivery or a small forwarding job; check what your broker offers).

ACKs go to \`pdh.supplieritem.ack\`: \`DUPLICATE\`, \`REJECTED\` with a reason, \`RECEIVED\`, then \`LOADED\` with the line count or \`FAILED\`.

**Requirements**
- A message ID already in \`message_log\`: ACK \`DUPLICATE\` and stop, without touching Blob Storage.
- Check that the blob exists before anything is written. If not, send the notice to the wait queue with an \`attempt\` count. On the **fifth** attempt, log it as \`REJECTED\` with reason \`BLOB_MISSING\` and ACK that.
- When the blob is there: log \`RECEIVED\` and ACK it, download, stage the lines with the message ID, mark the message \`LOADED\` and ACK with the count.
- A failure while loading: mark it \`FAILED\`, ACK \`FAILED\`, and do not leave the notice on the queue; the restart app replays it later.

**Facts**
- The listener uses ack mode \`AUTO\`.
- A notice with no \`attempt\` is the first try. The copy sent to the wait queue is the notice plus \`attempt\` = the tries made so far, so \`1\` after the first. A notice that arrives with \`attempt: 4\` is the fifth try.
- Check the blob with Azure **List Blobs** on \`pdh-inbound\`, with the blob name as the path. An empty list means it is not there.
- Every ACK is JSON with \`messageId\` and \`status\`. \`REJECTED\` adds \`reason\`, and \`LOADED\` adds \`lines\`, the number of lines staged.
- \`RECEIVED\` and \`REJECTED\` are inserts into \`message_log\`. \`LOADED\` and \`FAILED\` update that row.

**What each system sends back**
- The \`message_log\` select gives a list of rows, such as \`[ { "status": "LOADED" } ]\`, or an empty list for a new message.
- List Blobs gives \`[ { "name": "supplier-item/SI-30417.json" } ]\` when the blob is there and \`[]\` when it is not.
- Download Blob replaces the payload with the blob's JSON list of lines:
\`\`\`json
[ { "supplierId": "SUP-ORCHARD", "itemId": "APPLE-GALA-1KG", "cost": 1.12 } ]
\`\`\`
- Bulk Insert gives a list with one update count per line, so its size is the line count.

**What failures look like**
- Oracle refuses the staging lines: the Bulk Insert raises \`DB:QUERY_EXECUTION\`. Mark the message \`FAILED\` with that error type as the reason, ACK \`FAILED\`, and let the notice be acknowledged.

**Design the flow.**
`,
  answerTemplate: `## The duplicate check

## Does the blob exist?

## Waiting and giving up

## Loading and the ACKs

## Failures
`,
  keyPoints: [
    'Check the blob before writing anything. A notice that waits leaves no trace in message_log, so when it comes back it is not taken for a duplicate.',
    'The attempt count travels in the message itself. The adapter stays stateless, and any consumer can pick up the retried notice.',
    'The wait queue gives a delay without holding a thread. Retrying in the flow with Until Successful would block a consumer for minutes.',
    'Five attempts two minutes apart give a supplier about ten minutes. After that a clear REJECTED with BLOB_MISSING beats a silent wait.',
    'Only the load sits in the Try. The RECEIVED ACK is already out, so a failure answers FAILED and the notice is acknowledged; the restart app replays it.',
  ],
  solution: `
1. **JMS On New Message** on \`pdh.supplieritem.notify\`. **Set Variable** \`notice\` and \`attempt\` = \`(payload.attempt default 0) + 1\`.
2. **Database Select** \`message_log\` (target \`seen\`).
3. **Choice**:
   - seen: **Logger** WARN, **Set Payload** DUPLICATE, **JMS Publish** to the ACK queue.
   - otherwise: **List Blobs** with the blob name as the path, then a **Choice**:
     - empty and attempt < 5: **Set Payload** the notice with \`attempt\`, **JMS Publish** to \`pdh.supplieritem.wait\`.
     - empty: **Insert** \`message_log\` REJECTED / BLOB_MISSING, **JMS Publish** REJECTED.
     - otherwise: **Insert** RECEIVED, **JMS Publish** RECEIVED, then a **Try** { **Download Blob**, **Transform**, **Bulk Insert** staging, **Update** LOADED, **JMS Publish** LOADED } with **On Error Continue** { **Update** FAILED, **JMS Publish** FAILED }.

**List or download?** Listing with the blob name as prefix answers "is it there" without moving the data. A download that fails with "not found" works too, but then a missing blob and a storage outage look alike unless you read the error.
`,
  followUps: [
    {
      q: 'A prefix listing for supplier-item/SI-3041 would also find SI-30417. Is that a problem here?',
      a: 'Here the full blob name is used as the prefix, so only that name and longer names match. Compare the names returned with the one you expect, or call a get properties operation if your connector has one.',
    },
    {
      q: 'Two consumers take the same retried notice at once. What stops a double load?',
      a: 'The key on message_log.message_id. The second RECEIVED insert fails, that copy ends with an error, and the broker redelivers it, where it meets the duplicate check.',
    },
  ],
}
