import { design, flow, handler, route, router, scope, source, step } from '../../flow/dsl.js'

const note = (messageId) => ({ message: { kind: 'jms', destination: 'INV.NOTIFY', payload: { messageId, messageType: 'InventoryTransaction', blobName: `inv/${messageId}.json` } } })
const line = (lineNo, sku, location, qty) => ({ lineNo, sku, location, qty })
const docOf = (senderDocId) => ({ senderDocId, lines: [line(1, 'FX-1001', 'FX-DC1', 40), line(2, 'FX-1002', 'FX-DC9', 12), line(3, 'FX-1003', 'FX-DC2', -5)] })
const msgRow = (message_id, status, sender_doc_id = null) => ({ message_id, message_type: 'InventoryTransaction', status, sender_doc_id })
const tables = (messages = []) => ({
  inbound_messages: { key: 'message_id', columns: ['message_id', 'message_type', 'status', 'sender_doc_id'], rows: messages },
  job_log: { key: 'job_id', columns: ['job_id', 'message_id', 'status', 'good_count', 'bad_count'], rows: [] },
  code_map: { rows: [{ map_name: 'LOCATION', ext_code: 'FX-DC1', int_code: '310' }, { map_name: 'LOCATION', ext_code: 'FX-DC2', int_code: '320' }] },
  inv_rejects: { columns: ['message_id', 'line_no', 'sku', 'reason'], rows: [] },
  stg_inventory_txn: { key: ['sender_doc_id', 'line_no'], columns: ['sender_doc_id', 'line_no', 'sku', 'location_id', 'qty', 'message_id'], rows: [] },
})
const blob = (senderDocId = 'FX-ADJ-20261113-07') => ({ 'azure-download-blob': { payload: docOf(senderDocId) } })

export default {
  id: 'fl-233',
  category: 'flows',
  title: 'Inventory Transactions End to End Into Oracle: Two Duplicate Checks, a RECEIVED ACK, a Code Map, a Reject Table, a MERGE Into Staging, a Job Log, a Final ACK and an Email That Never Blocks',
  level: 'EXPERT',
  tags: ['myproject', 'oracle', 'jms', 'claim-check', 'duplicate-check', 'code-map', 'reject-table', 'merge', 'job-log', 'ack', 'async'],
  estMinutes: 60,
  flowChecks: [
    { label: 'Notifications are read from INV.NOTIFY and the work from INV.WORK', rule: { type: 'all', rules: [{ type: 'source', component: 'jms-listener', where: { destination: 'INV.NOTIFY' } }, { type: 'source', component: 'jms-listener', where: { destination: 'INV.WORK' } }] } },
    {
      label: 'The intake records the message as RECEIVED, ACKs it, then hands it to INV.WORK',
      rule: {
        type: 'all',
        rules: [
          { type: 'before', first: 'db-insert', firstWhere: { sql: { all: ['inbound_messages', 'RECEIVED'] } }, then: 'jms-publish', thenWhere: { destination: 'INV.ACK' } },
          { type: 'before', first: 'db-insert', firstWhere: { sql: 'inbound_messages' }, then: 'jms-publish', thenWhere: { destination: 'INV.WORK' } },
        ],
      },
    },
    { label: 'The sender document ID is checked against messages already processed', rule: { type: 'exists', component: 'db-select', where: { sql: { all: ['inbound_messages', 'sender_doc_id'] } } } },
    { label: 'Locations are translated through the LOCATION code map, read once', rule: { type: 'exists', component: 'db-select', where: { sql: { all: ['code_map', 'LOCATION'] } } } },
    {
      label: 'Rejects and the staging MERGE are written in one transaction',
      rule: {
        type: 'all',
        rules: [
          { type: 'inside', component: 'db-bulk-insert', within: 'try', withinWhere: { transactionalAction: 'ALWAYS_BEGIN' }, where: { sql: 'inv_rejects' } },
          { type: 'inside', component: ['db-bulk-update', 'db-bulk-insert'], within: 'try', withinWhere: { transactionalAction: 'ALWAYS_BEGIN' }, where: { sql: { all: ['MERGE INTO stg_inventory_txn', 'sender_doc_id', 'line_no'] } } },
        ],
      },
    },
    { label: 'The job log is STARTED before the download and COMPLETED before the final ACK', rule: { type: 'all', rules: [{ type: 'before', first: 'db-insert', firstWhere: { sql: { all: ['job_log', 'STARTED'] } }, then: 'azure-download-blob' }, { type: 'before', first: 'db-update', firstWhere: { sql: { all: ['job_log', 'COMPLETED'] } }, then: 'jms-publish', thenWhere: { destination: 'INV.ACK' }, outside: true }] } },
    { label: 'The summary email is sent in an Async scope', rule: { type: 'inside', component: 'email-send', within: 'async' } },
    { label: 'A failed load marks the job FAILED and parks the notification on INV.FAILED', rule: { type: 'all', rules: [{ type: 'inside', component: 'jms-publish', within: 'on-error-continue', where: { destination: 'INV.FAILED' } }, { type: 'inside', component: 'db-update', within: 'on-error-continue', where: { sql: { all: ['job_log', 'FAILED'] } } }] } },
  ],
  simulation: {
    systems: { db: { tables: tables() }, calls: blob() },
    tests: [
      {
        name: 'A new document with two bad lines',
        about: 'RECEIVED goes out first. FX-DC9 is not in the code map and line 3 has a negative quantity, so they are rejected. Line 1 is merged into staging, the job is COMPLETED with 1 and 2, the final ACK says PROCESSED_WITH_ERRORS, and one email goes out.',
        trigger: note('MSG-80101'),
        expect: {
          noError: true,
          ack: 'acked',
          sent: [
            { destination: 'INV.ACK', count: 1, has: { messageId: 'MSG-80101', status: 'RECEIVED' } },
            { destination: 'INV.ACK', count: 1, has: { messageId: 'MSG-80101', status: 'PROCESSED_WITH_ERRORS', accepted: 1, rejected: 2 } },
          ],
          db: {
            inbound_messages: { has: [{ message_id: 'MSG-80101', status: 'PROCESSED', sender_doc_id: 'FX-ADJ-20261113-07' }] },
            stg_inventory_txn: { count: 1, has: [{ line_no: 1, location_id: '310', qty: 40 }] },
            inv_rejects: { count: 2, has: [{ line_no: 2, reason: 'UNKNOWN_LOCATION' }, { line_no: 3, reason: 'NEGATIVE_QTY' }] },
            job_log: { has: [{ message_id: 'MSG-80101', status: 'COMPLETED', good_count: 1, bad_count: 2 }] },
          },
          emails: [{ count: 1, subject: 'MSG-80101' }],
          notSent: ['INV.FAILED'],
        },
      },
      {
        name: 'The same message ID again',
        about: 'MSG-80101 is already recorded. The sender gets a DUPLICATE ACK and nothing else happens.',
        trigger: note('MSG-80101'),
        overrides: { systems: { db: { tables: tables([msgRow('MSG-80101', 'PROCESSED', 'FX-ADJ-20261113-07')]) } } },
        expect: { sent: [{ destination: 'INV.ACK', count: 1, has: { status: 'DUPLICATE' } }], notSent: ['INV.WORK'], db: { job_log: { count: 0 }, stg_inventory_txn: { count: 0 } }, noEmails: true },
      },
      {
        name: 'A new message ID for a document already loaded',
        about: 'The sender wrapped FX-ADJ-20261113-07 in a new message. The sender document check catches it: DUPLICATE ACK, job SKIPPED, nothing staged.',
        trigger: note('MSG-80102'),
        overrides: { systems: { db: { tables: tables([msgRow('MSG-80101', 'PROCESSED', 'FX-ADJ-20261113-07')]) } } },
        expect: {
          sent: [{ destination: 'INV.ACK', count: 1, has: { messageId: 'MSG-80102', status: 'DUPLICATE' } }],
          db: { stg_inventory_txn: { count: 0 }, inv_rejects: { count: 0 }, job_log: { has: [{ message_id: 'MSG-80102', status: 'SKIPPED' }] }, inbound_messages: { has: [{ message_id: 'MSG-80102', status: 'DUPLICATE' }] } },
          notSent: ['INV.FAILED'],
        },
      },
      {
        name: 'The staging MERGE fails',
        about: 'Oracle refuses the MERGE. The rejects in the same transaction are undone, the job is FAILED, no final ACK goes out, and the notification waits on INV.FAILED for the restart app.',
        trigger: note('MSG-80103'),
        overrides: { systems: { db: { failWhen: [{ match: 'MERGE INTO stg_inventory_txn', fault: 'QUERY_EXECUTION', description: 'ORA-01400: cannot insert NULL' }] } } },
        expect: {
          sent: [{ destination: 'INV.ACK', count: 1, has: { status: 'RECEIVED' } }, { destination: 'INV.FAILED', count: 1, has: { messageId: 'MSG-80103' } }],
          db: { inv_rejects: { count: 0 }, stg_inventory_txn: { count: 0 }, job_log: { has: [{ message_id: 'MSG-80103', status: 'FAILED' }] } },
        },
      },
      {
        name: 'The mail server is down',
        about: 'The summary cannot be sent. The load, the job log and the final ACK are not affected.',
        trigger: note('MSG-80104'),
        overrides: { systems: { email: { fault: true } } },
        expect: { sent: [{ destination: 'INV.ACK', count: 1, has: { status: 'PROCESSED_WITH_ERRORS' } }], db: { job_log: { has: [{ status: 'COMPLETED' }] } }, notSent: ['INV.FAILED'] },
      },
    ],
  },
  referenceFlow: design(
    flow('inv-intake', source('jms-listener', { destination: 'INV.NOTIFY', ackMode: 'AUTO' }), [
      step('set-variable', { variableName: 'note', value: '#[payload]' }),
      step('db-select', { database: 'Oracle', sql: 'SELECT message_id FROM inbound_messages WHERE message_id = :messageId', inputParameters: '#[{ messageId: vars.note.messageId }]', target: 'seen' }),
      router(
        'choice',
        {},
        [
          route({ expression: '#[not isEmpty(vars.seen)]' }, [
            step('logger', { level: 'WARN', message: '#["Message " ++ vars.note.messageId ++ " received before"]' }),
            step('set-payload', { value: '#[output application/json --- { messageId: vars.note.messageId, status: "DUPLICATE" }]' }),
            step('jms-publish', { destination: 'INV.ACK', persistentDelivery: 'true' }),
          ]),
        ],
        {
          otherwise: [
            step('db-insert', {
              database: 'Oracle',
              sql: "INSERT INTO inbound_messages (message_id, message_type, status) VALUES (:messageId, :messageType, 'RECEIVED')",
              inputParameters: '#[{ messageId: vars.note.messageId, messageType: vars.note.messageType }]',
              target: 'recorded',
            }),
            step('set-payload', { value: '#[output application/json --- { messageId: vars.note.messageId, status: "RECEIVED" }]' }),
            step('jms-publish', { destination: 'INV.ACK', persistentDelivery: 'true' }),
            step('set-payload', { value: '#[output application/json --- vars.note]' }),
            step('jms-publish', { destination: 'INV.WORK', persistentDelivery: 'true' }),
          ],
        },
      ),
    ]),
    flow(
      'inv-process',
      source('jms-listener', { destination: 'INV.WORK', ackMode: 'AUTO' }),
      [
        step('set-variable', { variableName: 'note', value: '#[payload]' }),
        step('set-variable', { variableName: 'jobId', value: '#[uuid()]' }),
        step('db-insert', {
          database: 'Oracle',
          sql: "INSERT INTO job_log (job_id, message_id, status) VALUES (:jobId, :messageId, 'STARTED')",
          inputParameters: '#[{ jobId: vars.jobId, messageId: vars.note.messageId }]',
          target: 'started',
        }),
        step('azure-download-blob', { container: 'fenwick-inbound', fileName: '#[vars.note.blobName]' }),
        step('set-variable', { variableName: 'doc', value: '#[payload]' }),
        step('db-select', {
          database: 'Oracle',
          sql: 'SELECT message_id FROM inbound_messages WHERE sender_doc_id = :senderDocId AND message_id <> :messageId',
          inputParameters: '#[{ senderDocId: vars.doc.senderDocId, messageId: vars.note.messageId }]',
          target: 'sameDoc',
        }),
        router('choice', {}, [route({ expression: '#[not isEmpty(vars.sameDoc)]' }, [step('raise-error', { type: 'APP:DUPLICATE_DOCUMENT', description: 'The sender document was loaded before' })])]),
        step('db-select', { database: 'Oracle', sql: "SELECT ext_code, int_code FROM code_map WHERE map_name = 'LOCATION'", target: 'locMap' }),
        step('transform', {
          target: 'variable',
          variableName: 'checked',
          script:
            '%dw 2.0\noutput application/java\nvar locs = { (vars.locMap map ((m) -> { (m.ext_code): m.int_code })) }\n---\nvars.doc.lines map ((l) -> {\n  line: { sender_doc_id: vars.doc.senderDocId, line_no: l.lineNo, sku: l.sku, location_id: locs[l.location], qty: l.qty, message_id: vars.note.messageId },\n  reason: if (locs[l.location] == null) "UNKNOWN_LOCATION" else if (l.qty < 0) "NEGATIVE_QTY" else ""\n})',
        }),
        step('set-variable', { variableName: 'good', value: '#[vars.checked filter ((c) -> c.reason == "") map ((c) -> c.line)]' }),
        step('set-variable', { variableName: 'bad', value: '#[vars.checked filter ((c) -> c.reason != "") map ((c) -> { message_id: vars.note.messageId, line_no: c.line.line_no, sku: c.line.sku, reason: c.reason })]' }),
        scope('try', { transactionalAction: 'ALWAYS_BEGIN' }, [
          router('choice', {}, [
            route({ expression: '#[not isEmpty(vars.bad)]' }, [
              step('set-payload', { value: '#[vars.bad]' }),
              step('db-bulk-insert', { database: 'Oracle', sql: 'INSERT INTO inv_rejects (message_id, line_no, sku, reason) VALUES (:message_id, :line_no, :sku, :reason)' }),
            ]),
          ]),
          router('choice', {}, [
            route({ expression: '#[not isEmpty(vars.good)]' }, [
              step('set-payload', { value: '#[vars.good]' }),
              step('db-bulk-update', {
                database: 'Oracle',
                sql: 'MERGE INTO stg_inventory_txn t USING (SELECT :sender_doc_id AS sender_doc_id, :line_no AS line_no, :sku AS sku, :location_id AS location_id, :qty AS qty, :message_id AS message_id FROM dual) s ON (t.sender_doc_id = s.sender_doc_id AND t.line_no = s.line_no) WHEN MATCHED THEN UPDATE SET t.sku = s.sku, t.location_id = s.location_id, t.qty = s.qty, t.message_id = s.message_id WHEN NOT MATCHED THEN INSERT (sender_doc_id, line_no, sku, location_id, qty, message_id) VALUES (s.sender_doc_id, s.line_no, s.sku, s.location_id, s.qty, s.message_id)',
              }),
            ]),
          ]),
          step('db-update', {
            database: 'Oracle',
            sql: "UPDATE inbound_messages SET status = 'PROCESSED', sender_doc_id = :senderDocId WHERE message_id = :messageId",
            inputParameters: '#[{ senderDocId: vars.doc.senderDocId, messageId: vars.note.messageId }]',
            target: 'marked',
          }),
        ]),
        step('db-update', {
          database: 'Oracle',
          sql: "UPDATE job_log SET status = 'COMPLETED', good_count = :good, bad_count = :bad WHERE job_id = :jobId",
          inputParameters: '#[{ good: sizeOf(vars.good), bad: sizeOf(vars.bad), jobId: vars.jobId }]',
          target: 'finished',
        }),
        step('set-payload', {
          value: '#[output application/json --- { messageId: vars.note.messageId, senderDocId: vars.doc.senderDocId, status: if (isEmpty(vars.bad)) "PROCESSED" else "PROCESSED_WITH_ERRORS", accepted: sizeOf(vars.good), rejected: sizeOf(vars.bad) }]',
        }),
        step('jms-publish', { destination: 'INV.ACK', persistentDelivery: 'true' }),
        scope('async', {}, [
          step('email-send', {
            toAddresses: 'inventory-support@fenwick.example',
            subject: '#["InventoryTransaction " ++ vars.note.messageId ++ " processed"]',
            content: '#["Accepted " ++ (sizeOf(vars.good) as String) ++ ", rejected " ++ (sizeOf(vars.bad) as String) ++ ". Job " ++ vars.jobId]',
          }),
        ]),
      ],
      [
        handler('on-error-continue', { type: 'APP:DUPLICATE_DOCUMENT' }, [
          step('db-update', { database: 'Oracle', sql: "UPDATE inbound_messages SET status = 'DUPLICATE' WHERE message_id = :messageId", inputParameters: '#[{ messageId: vars.note.messageId }]' }),
          step('db-update', { database: 'Oracle', sql: "UPDATE job_log SET status = 'SKIPPED' WHERE job_id = :jobId", inputParameters: '#[{ jobId: vars.jobId }]' }),
          step('set-payload', { value: '#[output application/json --- { messageId: vars.note.messageId, senderDocId: vars.doc.senderDocId, status: "DUPLICATE" }]' }),
          step('jms-publish', { destination: 'INV.ACK', persistentDelivery: 'true' }),
        ]),
        handler('on-error-continue', { type: 'ANY' }, [
          step('logger', { level: 'ERROR', message: '#["InventoryTransaction " ++ vars.note.messageId ++ " failed: " ++ error.description]' }),
          step('db-update', { database: 'Oracle', sql: "UPDATE job_log SET status = 'FAILED' WHERE job_id = :jobId", inputParameters: '#[{ jobId: vars.jobId }]' }),
          step('db-update', { database: 'Oracle', sql: "UPDATE inbound_messages SET status = 'FAILED' WHERE message_id = :messageId", inputParameters: '#[{ messageId: vars.note.messageId }]' }),
          step('set-payload', { value: '#[output application/json --- vars.note]' }),
          step('jms-publish', { destination: 'INV.FAILED', persistentDelivery: 'true' }),
        ]),
      ],
    ),
  ),
  optionalSteps: [
    { type: 'db-update', flow: 'inv-process', why: 'The FAILED status on inbound_messages helps support, but the job log row and the failure queue already record the failure.' },
  ],
  description: `
Fenwick Supply, a fictional builders' merchant, receives inventory transactions (stock adjustments from its distribution centres) through the planning platform. You build both halves of the inbound adapter.

**The notification.** A small JMS message on \`INV.NOTIFY\` points at a JSON document in Azure Blob Storage, container \`fenwick-inbound\`:
\`{ "messageId", "messageType": "InventoryTransaction", "blobName" }\`

**The document.** \`{ "senderDocId": "FX-ADJ-20261113-07", "lines": [ { "lineNo", "sku", "location", "qty" } ] }\`

**Oracle tables**
- \`inbound_messages\` (\`message_id\` key, \`message_type\`, \`status\`, \`sender_doc_id\`)
- \`job_log\` (\`job_id\`, \`message_id\`, \`status\`, \`good_count\`, \`bad_count\`)
- \`code_map\` (\`map_name\`, \`ext_code\`, \`int_code\`): rows with \`map_name = 'LOCATION'\` translate DC codes
- \`inv_rejects\` (\`message_id\`, \`line_no\`, \`sku\`, \`reason\`)
- \`stg_inventory_txn\` (\`sender_doc_id\` + \`line_no\` unique, \`sku\`, \`location_id\`, \`qty\`, \`message_id\`)

**Requirements**

*Intake flow (\`INV.NOTIFY\`)*
- A message ID already in \`inbound_messages\`: WARN, and ACK \`{ messageId, status: "DUPLICATE" }\` on \`INV.ACK\`. Nothing else.
- Otherwise record it as \`RECEIVED\`, ACK \`RECEIVED\`, and put the notification on \`INV.WORK\`.

*Process flow (\`INV.WORK\`)*
- Write a \`job_log\` row \`STARTED\`, then download the document.
- A sender document ID already loaded under another message ID: mark the message \`DUPLICATE\`, the job \`SKIPPED\`, and ACK \`DUPLICATE\`.
- Translate each location through the code map. Reject lines with an unknown location (\`UNKNOWN_LOCATION\`) or a negative quantity (\`NEGATIVE_QTY\`).
- In one transaction: bulk insert the rejects, MERGE the good lines into staging (the sender may resend a corrected document), and mark the message \`PROCESSED\` with its sender document ID.
- Mark the job \`COMPLETED\` with both counts, then send the final ACK \`{ messageId, senderDocId, status, accepted, rejected }\`, status \`PROCESSED\` or \`PROCESSED_WITH_ERRORS\`.
- Email \`inventory-support@fenwick.example\` a summary. A mail problem must never fail or slow the load.
- Any other failure: mark the job \`FAILED\` and put the notification on \`INV.FAILED\`, where the restart app picks it up. No final ACK.

**Facts**
- Make the \`job_id\` with \`uuid()\`.
- \`location_id\` is the code map's \`int_code\`, such as \`310\`.
- Put the notification on \`INV.FAILED\` as it arrived, with its \`messageId\`.
- The email subject carries the message ID.

**Design the flows.**
`,
  answerTemplate: `## The intake flow

## Why two flows

## Duplicate checks

## Code map and rejects

## The transaction

## Job log, final ACK and email

## When it fails
`,
  keyPoints: [
    'Two checks guard two different repeats: the same message ID (the sender retried a send) and the same sender document ID in a new message (someone resent the document). Each needs its own lookup.',
    'The intake flow answers fast with RECEIVED and hands the work on. The sender is not kept waiting while a large document is processed.',
    'The job log row is written outside the transaction, first. A rollback must never remove the record of a failed run.',
    'Rejects, staging and the PROCESSED mark commit together. Without that, a retry after a half failure writes the rejects twice.',
    'MERGE on sender document and line lets a corrected resend through the staging key without ORA-00001.',
    'The final ACK goes out only after COMPLETED, and the email runs in an Async scope, so a mail outage costs nothing.',
    'Two handlers in order: the specific duplicate first, then ANY. A duplicate is an answer to the sender, not a failure for the restart app.',
  ],
  solution: `
**Flow \`inv-intake\`**: **JMS On New Message** \`INV.NOTIFY\`, **Database Select** by message ID, **Choice**:
- seen: WARN, payload \`{ messageId, status: "DUPLICATE" }\`, **JMS Publish** \`INV.ACK\`.
- otherwise: **Database Insert** \`RECEIVED\`, **JMS Publish** the RECEIVED ACK to \`INV.ACK\`, **JMS Publish** the notification to \`INV.WORK\`.

**Flow \`inv-process\`**: **JMS On New Message** \`INV.WORK\`
1. \`note\`, \`jobId\`, **Database Insert** \`job_log\` \`STARTED\`.
2. **Download Blob** \`vars.note.blobName\` into \`doc\`.
3. **Database Select** \`inbound_messages\` with the same \`sender_doc_id\` and another message ID. **Choice**: found raises \`APP:DUPLICATE_DOCUMENT\`.
4. **Database Select** the LOCATION code map. **Transform** each line with \`location_id\` and a reason. **Set Variable** \`good\` and \`bad\`.
5. **Try** ALWAYS_BEGIN: **Choice** bad not empty, **Bulk Insert** \`inv_rejects\`. **Choice** good not empty, **Bulk Update** with the MERGE. **Database Update** the message to \`PROCESSED\`.
6. **Database Update** \`job_log\` \`COMPLETED\` with counts. **JMS Publish** the final ACK to \`INV.ACK\`.
7. **Async**: **Email Send** the summary.
8. Handlers: **On Error Continue** \`APP:DUPLICATE_DOCUMENT\` (message DUPLICATE, job SKIPPED, DUPLICATE ACK), then **On Error Continue** ANY (ERROR log, job FAILED, message FAILED, **JMS Publish** to \`INV.FAILED\`).

**A huge document.** Tens of thousands of lines belong in a Batch Job with an aggregator, with the job log closed in On Complete. Then the final ACK and the email move to On Complete too.
`,
  followUps: [
    {
      q: 'The final ACK publish fails after the transaction committed. What then?',
      a: 'The ANY handler marks the job FAILED and parks the message, although the data is in. A replay would find the sender document already PROCESSED and answer DUPLICATE. Better: let the restart app see PROCESSED and only resend the ACK.',
    },
    {
      q: 'How do you stop the intake and process flows drifting apart over time?',
      a: 'Keep one JSON schema for the notification, validate it in the intake flow, and share message status names in one place. The inbound_messages status is the contract between them.',
    },
  ],
}
