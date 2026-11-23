import { design, flow, handler, route, router, source, step } from '../../flow/dsl.js'

const notice = { messageId: 'INV-88214', blobName: 'invtxn/INV-88214.json' }
const lines = [
  { store: '0204', sku: 'MILK-2L-SEMI', qty: -4, uom: 'EA', reason: 'WASTE' },
  { store: '0204', sku: 'CRISPS-MULTI-6', qty: 12, uom: 'CS', reason: 'RECEIPT' },
]
const tables = {
  uom_code_map: { key: 'source_code', columns: ['source_code', 'target_code'], rows: [{ source_code: 'EA', target_code: 'EACH' }, { source_code: 'CS', target_code: 'CASE' }] },
  stg_inv_txn: { columns: ['message_id', 'store', 'sku', 'qty', 'uom', 'reason'], rows: [] },
  message_log: { key: 'message_id', columns: ['message_id', 'status'], rows: [{ message_id: 'INV-88214', status: 'RECEIVED' }] },
}
const trigger = { message: { kind: 'jms', destination: 'pdh.invtxn.process', payload: notice } }
const blobFault = { fault: { type: 'AZURE-STORAGE:CONNECTIVITY', description: 'The archive container did not answer' } }

export default {
  id: 'fl-284',
  category: 'flows',
  title: 'Archive and Stage in Parallel, Commit Only When Both Worked: a Scatter-Gather Uploads the Transformed Document and Bulk Inserts the Lines Into Oracle, the Source Blob Is Deleted Last, and a Failed Route Cleans Up Staging',
  level: 'EXPERT',
  tags: ['myproject', 'oracle', 'azure-blob', 'scatter-gather', 'code-map', 'staging', 'claim-check', 'jms', 'ack'],
  estMinutes: 60,
  flowChecks: [
    { label: 'Process requests arrive on the JMS queue pdh.invtxn.process', rule: { type: 'source', component: 'jms-listener', where: { destination: 'pdh.invtxn.process' } } },
    { label: 'The unit of measure code map is read before the Scatter-Gather', rule: { type: 'before', first: 'db-select', firstWhere: { sql: 'uom_code_map' }, then: 'scatter-gather' } },
    {
      label: 'A Scatter-Gather uploads the transformed document and stages the lines',
      rule: { type: 'all', rules: [{ type: 'inside', component: 'azure-upload-blob', within: 'scatter-gather', where: { container: 'pdh-archive' } }, { type: 'inside', component: 'db-bulk-insert', within: 'scatter-gather', where: { sql: 'stg_inv_txn' } }] },
    },
    { label: 'The source blob is deleted after the Scatter-Gather', rule: { type: 'before', first: 'scatter-gather', then: 'azure-delete-blob', outside: true } },
    { label: 'A failure removes the message\'s staged lines in the handler', rule: { type: 'inside', component: 'db-delete', within: 'on-error-continue', where: { sql: 'stg_inv_txn' } } },
  ],
  simulation: {
    systems: { db: { tables }, calls: { 'azure-download-blob': { payload: lines } } },
    tests: [
      {
        name: 'Both routes work',
        about: 'The document is archived and the lines staged with their mapped units. Then the source blob is deleted, the message is LOADED and the ACK says so.',
        trigger,
        expect: {
          noError: true,
          db: { stg_inv_txn: { count: 2, has: [{ message_id: 'INV-88214', sku: 'CRISPS-MULTI-6', uom: 'CASE' }, { sku: 'MILK-2L-SEMI', uom: 'EACH' }] }, message_log: { has: [{ message_id: 'INV-88214', status: 'LOADED' }] } },
          connector: [
            { type: 'azure-upload-blob', count: 1, settings: { container: 'pdh-archive', fileName: 'invtxn/INV-88214.json' } },
            { type: 'azure-delete-blob', count: 1, settings: { container: 'pdh-inbound', fileName: 'invtxn/INV-88214.json' } },
          ],
          sent: [{ destination: 'pdh.invtxn.ack', count: 1, has: { messageId: 'INV-88214', status: 'LOADED', lines: 2 } }],
        },
      },
      {
        name: 'The archive upload fails',
        about: 'The archive container does not answer, while the staging route works. The staged lines are removed, the source blob stays for a replay, and the message is FAILED.',
        trigger,
        overrides: { systems: { calls: { 'azure-upload-blob': blobFault } } },
        expect: {
          noError: true,
          db: { stg_inv_txn: { count: 0 }, message_log: { has: [{ message_id: 'INV-88214', status: 'FAILED' }] } },
          connector: [{ type: 'azure-delete-blob', count: 0 }],
          sent: [{ destination: 'pdh.invtxn.ack', count: 1, has: { status: 'FAILED' } }],
          ack: 'acked',
        },
      },
      {
        name: 'Oracle refuses the lines',
        about: 'The bulk insert fails. The source blob is not deleted and the message is FAILED, so the restart app can replay it after the fix.',
        trigger,
        overrides: { systems: { db: { failWhen: [{ match: 'INSERT INTO stg_inv_txn', fault: 'QUERY_EXECUTION' }] } } },
        expect: { noError: true, db: { message_log: { has: [{ status: 'FAILED' }] } }, connector: [{ type: 'azure-delete-blob', count: 0 }], sent: [{ destination: 'pdh.invtxn.ack', has: { status: 'FAILED' } }] },
      },
      {
        name: 'An unknown unit code',
        about: 'A line comes with unit PK, which the code map does not hold. It is staged with UNKNOWN, as the data team asked, and the message still loads.',
        trigger,
        overrides: { systems: { calls: { 'azure-download-blob': { payload: [{ ...lines[0], uom: 'PK' }, lines[1]] } } } },
        expect: { noError: true, db: { stg_inv_txn: { count: 2, has: [{ sku: 'MILK-2L-SEMI', uom: 'UNKNOWN' }] } } },
      },
    ],
  },
  referenceFlow: design(
    flow(
      'invtxn-process',
      source('jms-listener', { destination: 'pdh.invtxn.process', ackMode: 'AUTO', numberOfConsumers: 2 }),
      [
        step('set-variable', { variableName: 'messageId', value: '#[payload.messageId]' }),
        step('set-variable', { variableName: 'blobName', value: '#[payload.blobName]' }),
        step('db-select', { database: 'Oracle', sql: 'SELECT source_code, target_code FROM uom_code_map', target: 'uomRows' }),
        step('set-variable', { variableName: 'uomMap', value: '#[{ (vars.uomRows map { ($.SOURCE_CODE): $.TARGET_CODE }) }]' }),
        step('azure-download-blob', { container: 'pdh-inbound', fileName: '#[vars.blobName]' }),
        step('transform', {
          script: '%dw 2.0\noutput application/java\n---\npayload map { message_id: vars.messageId, store: $.store, sku: $.sku, qty: $.qty, uom: vars.uomMap[$.uom] default "UNKNOWN", reason: $.reason }',
        }),
        step('set-variable', { variableName: 'lineCount', value: '#[sizeOf(payload)]' }),
        router('scatter-gather', { timeout: 120000, maxConcurrency: 2 }, [
          route({}, [
            step('set-payload', { value: '#[output application/json --- { messageId: vars.messageId, lines: payload }]' }),
            step('azure-upload-blob', { container: 'pdh-archive', fileName: '#[vars.blobName]', fileStream: '#[payload]', contentType: 'application/json' }),
          ]),
          route({}, [step('db-bulk-insert', { database: 'Oracle', sql: 'INSERT INTO stg_inv_txn (message_id, store, sku, qty, uom, reason) VALUES (:message_id, :store, :sku, :qty, :uom, :reason)' })]),
        ]),
        step('azure-delete-blob', { container: 'pdh-inbound', fileName: '#[vars.blobName]' }),
        step('db-update', { database: 'Oracle', sql: "UPDATE message_log SET status = 'LOADED' WHERE message_id = :messageId", inputParameters: '#[{ messageId: vars.messageId }]' }),
        step('set-payload', { value: '#[output application/json --- { messageId: vars.messageId, status: "LOADED", lines: vars.lineCount }]' }),
        step('jms-publish', { destination: 'pdh.invtxn.ack', destinationType: 'QUEUE', persistentDelivery: 'true' }),
      ],
      [
        handler('on-error-continue', { type: 'ANY' }, [
          step('logger', { level: 'ERROR', message: '#["Message " ++ vars.messageId ++ " failed: " ++ error.description]' }),
          step('db-delete', { database: 'Oracle', sql: 'DELETE FROM stg_inv_txn WHERE message_id = :messageId', inputParameters: '#[{ messageId: vars.messageId }]' }),
          step('db-update', { database: 'Oracle', sql: "UPDATE message_log SET status = 'FAILED' WHERE message_id = :messageId", inputParameters: '#[{ messageId: vars.messageId }]' }),
          step('set-payload', { value: '#[output application/json --- { messageId: vars.messageId, status: "FAILED", reason: error.errorType.asString }]' }),
          step('jms-publish', { destination: 'pdh.invtxn.ack', destinationType: 'QUEUE', persistentDelivery: 'true' }),
        ]),
      ],
    ),
  ),
  description: `
Larkfield Grocers, a fictional grocery chain, runs a product data hub. After an inventory transaction message has passed its intake checks, a request arrives on the **JMS** queue \`pdh.invtxn.process\`:

\`\`\`json
{ "messageId": "INV-88214", "blobName": "invtxn/INV-88214.json" }
\`\`\`

The blob in the \`pdh-inbound\` container holds the lines: \`{ "store": "0204", "sku": "MILK-2L-SEMI", "qty": -4, "uom": "EA", "reason": "WASTE" }\`.

The process step must:
- Translate each unit of measure through the Oracle code map \`uom_code_map\` (\`source_code\`, \`target_code\`). A code the map does not hold becomes \`UNKNOWN\`; the data team fixes those from staging.
- **Archive** the transformed document as JSON in the \`pdh-archive\` container, under the same blob name. Auditors read it there.
- **Stage** the lines in \`stg_inv_txn\` (\`message_id\`, \`store\`, \`sku\`, \`qty\`, \`uom\`, \`reason\`).
- Then **commit** the message: delete the source blob from \`pdh-inbound\`, set \`message_log\` to \`LOADED\` and send the ACK \`{ "messageId", "status": "LOADED", "lines": n }\` on \`pdh.invtxn.ack\`.

Archive and staging are independent and each takes a while for large messages, so they should run **at the same time**.

If anything fails, the source blob must stay so the restart app can replay the message; no staged lines may be left for it; \`message_log\` says \`FAILED\` and the ACK says \`FAILED\` with the error type. The request itself is acknowledged.

**Facts**
- The source blob holds a JSON array of lines. \`message_log\` has \`message_id\` and \`status\`.
- Stage \`uom\` as the mapped code, such as \`EACH\` for \`EA\`.
- The failed ACK is \`{ "messageId", "status": "FAILED", "reason": "<error type>" }\`. Send both ACKs with **JMS Publish**.
- The listener uses the ack mode \`AUTO\`. A flow handler **On Error Continue** does the cleanup, so the request is acknowledged.

**What each system sends back**
- Oracle returns unquoted column names in upper case, so a row reads \`{ "SOURCE_CODE": ..., "TARGET_CODE": ... }\`.
- The code map select gives a list of rows: \`[ { "SOURCE_CODE": "EA", "TARGET_CODE": "EACH" }, { "SOURCE_CODE": "CS", "TARGET_CODE": "CASE" } ]\`.
- Download Blob replaces the payload with the JSON array of lines shown above.
- After a Scatter-Gather the payload is an object keyed by route index (\`"0"\`, \`"1"\`), each holding that route's result. Keep the line count in a variable before it.

**What failures look like**
- The archive container does not answer: Upload Blob fails with a connectivity error (\`AZURE-STORAGE:CONNECTIVITY\` here). The staging route still runs, then the Scatter-Gather raises \`MULE:COMPOSITE_ROUTING\`.
- Oracle refuses the lines: the Bulk Insert raises \`DB:QUERY_EXECUTION\`, and the Scatter-Gather raises \`MULE:COMPOSITE_ROUTING\` after the archive route ends.
- In both cases the source blob is not deleted, the staged lines are removed, and the ACK says \`FAILED\`.

**Design the flow.**
`,
  answerTemplate: `## The code map

## Archive and stage in parallel

## The commit

## When a route fails
`,
  keyPoints: [
    'Read the code map once and turn it into an object keyed by the source code. Each line then costs a key lookup, not a query.',
    'Scatter-Gather runs both routes and waits for both. If either fails, it raises MULE:COMPOSITE_ROUTING after the other route has finished, so the good route\'s work is already done.',
    'That is why the handler deletes the staged lines: the staging route may have worked while the archive route failed.',
    'Deleting the source blob is the commit. It comes after the Scatter-Gather, on the main path, so it happens only when both routes worked.',
    'A replay overwrites the archive blob and finds no staged lines, so it is safe to run again.',
  ],
  solution: `
1. **JMS On New Message** on \`pdh.invtxn.process\`. **Set Variable** \`messageId\`, \`blobName\`.
2. **Database Select** \`uom_code_map\` (target), **Set Variable** \`uomMap\` = \`{ (vars.uomRows map { ($.SOURCE_CODE): $.TARGET_CODE }) }\`.
3. **Download Blob** from \`pdh-inbound\`. **Transform** the lines with \`vars.uomMap[$.uom] default "UNKNOWN"\`. **Set Variable** \`lineCount\`.
4. **Scatter-Gather**:
   - Route 1: **Set Payload** the JSON document, **Upload Blob** to \`pdh-archive\`.
   - Route 2: **Bulk Insert** into \`stg_inv_txn\`.
5. **Delete Blob** from \`pdh-inbound\`. **Update** \`message_log\` LOADED. **JMS Publish** the LOADED ACK.
6. **On Error Continue** (ANY): **Logger**, **Delete** the message's staged lines, **Update** FAILED, **JMS Publish** the FAILED ACK.

**Memory.** Each route gets its own copy of the payload. For very large messages, stage through a Batch Job instead and archive from the stream, so the lines are not held twice.
`,
  followUps: [
    {
      q: 'Why not wrap the staging insert in a transaction and skip the delete in the handler?',
      a: 'The staging route ends before the Scatter-Gather reports the archive failure, so its transaction has already committed by then. Cleaning up by message ID is what makes a failure leave nothing behind.',
    },
    {
      q: 'The delete of the source blob fails after both routes worked. What then?',
      a: 'The handler removes the staged lines and marks the message FAILED, so the replay starts clean. The archive copy is overwritten on the replay. It is a little wasted work, but nothing is lost or doubled.',
    },
  ],
}
