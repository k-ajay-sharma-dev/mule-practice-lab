import { design, flow, handler, route, router, scope, source, step } from '../../flow/dsl.js'

const line = (lineNo, gtin, qtyReceived) => ({ lineNo, gtin, qtyReceived, poNumber: 'PO-2026-118840' })
const doc = (messageId, lines) => ({
  message: { kind: 'jms', destination: 'PDH.RECADV.WORK', payload: { messageId, messageType: 'ReceivingAdvice', senderId: 'NORTHDALE-DC', senderDocumentId: `RA-${messageId}`, lines } },
})
const mixed = [line(1, '05012345678900', 24), line(2, '05012345678917', 12), line(3, '0501234', 6), line(4, '05012345678924', 48)]
const tables = {
  pdh_job_log: { key: 'job_id', columns: ['job_id', 'message_id', 'status', 'good_count', 'bad_count'], rows: [] },
  pdh_rejects: { columns: ['message_id', 'line_no', 'gtin', 'reason'], rows: [] },
  stg_receiving_advice: { columns: ['message_id', 'line_no', 'gtin', 'po_number', 'qty_received'], rows: [] },
}

export default {
  id: 'fl-161',
  category: 'flows',
  title: 'ReceivingAdvice Processing: Job Log, Rejects Table, One Transaction for the Staging Load, a Final ACK, and an Email That Never Holds It Up',
  level: 'EXPERT',
  tags: ['myproject', 'queues', 'jms', 'oracle', 'bulk-insert', 'transactions', 'job-log', 'async', 'gs1'],
  estMinutes: 55,
  flowChecks: [
    { label: 'ReceivingAdvice documents are read from PDH.RECADV.WORK', rule: { type: 'source', component: 'jms-listener', where: { destination: 'PDH.RECADV.WORK' } } },
    {
      label: 'The job is logged as STARTED before anything is loaded',
      rule: { type: 'before', first: 'db-insert', firstWhere: { sql: { all: ['pdh_job_log', 'STARTED'] } }, then: 'db-bulk-insert' },
    },
    { label: 'Bad lines are bulk inserted into pdh_rejects', rule: { type: 'exists', component: 'db-bulk-insert', where: { sql: 'pdh_rejects' } } },
    {
      label: 'Good lines are bulk loaded into stg_receiving_advice inside a transaction',
      rule: { type: 'inside', component: 'db-bulk-insert', within: 'try', withinWhere: { transactionalAction: 'ALWAYS_BEGIN' }, where: { sql: 'stg_receiving_advice' } },
    },
    {
      label: 'The final ACK goes out after the job is marked COMPLETE',
      rule: { type: 'before', first: 'db-update', firstWhere: { sql: 'COMPLETE' }, then: 'jms-publish', thenWhere: { destination: 'PDH.ACK' }, outside: true },
    },
    { label: 'The notification email is sent in an Async scope', rule: { type: 'inside', component: 'email-send', within: 'async' } },
    {
      label: 'A failed load marks the job FAILED and parks the document on PDH.INBOUND.FAILED',
      rule: {
        type: 'all',
        rules: [
          { type: 'inside', component: 'jms-publish', within: ['on-error-continue', 'on-error-propagate'], where: { destination: 'PDH.INBOUND.FAILED' } },
          { type: 'inside', component: 'db-update', within: ['on-error-continue', 'on-error-propagate'], where: { sql: 'FAILED' } },
        ],
      },
    },
  ],
  simulation: {
    systems: { db: { tables } },
    tests: [
      {
        name: 'Four lines, one with a short GTIN',
        about: 'Three lines load into staging, the short GTIN goes to pdh_rejects, the job ends COMPLETE with the counts, and the ACK says PROCESSED_WITH_ERRORS.',
        trigger: doc('MSG-92001', mixed),
        expect: {
          ack: 'acked',
          db: {
            stg_receiving_advice: { count: 3 },
            pdh_rejects: { count: 1, has: [{ message_id: 'MSG-92001', line_no: 3 }] },
            pdh_job_log: { count: 1, has: [{ message_id: 'MSG-92001', status: 'COMPLETE', good_count: 3, bad_count: 1 }] },
          },
          sent: [{ destination: 'PDH.ACK', count: 1, has: { messageId: 'MSG-92001', status: 'PROCESSED_WITH_ERRORS', accepted: 3, rejected: 1 } }],
          notSent: ['PDH.INBOUND.FAILED'],
          emails: [{ count: 1 }],
        },
      },
      {
        name: 'A clean document',
        about: 'Every line is good. Nothing goes to pdh_rejects and the ACK says PROCESSED.',
        trigger: doc('MSG-92002', [line(1, '05012345678900', 10), line(2, '05012345678917', 4)]),
        expect: { db: { stg_receiving_advice: { count: 2 }, pdh_rejects: { count: 0 } }, sent: [{ destination: 'PDH.ACK', count: 1, has: { status: 'PROCESSED' } }] },
      },
      {
        name: 'The staging load fails',
        about: 'Oracle refuses the staging insert. The rejects written in the same transaction are undone, the job is FAILED, no ACK goes out, and the document waits on the failure queue for the restart app.',
        trigger: doc('MSG-92003', mixed),
        overrides: { systems: { db: { failWhen: [{ match: 'INSERT INTO stg_receiving_advice', fault: 'QUERY_EXECUTION', description: 'ORA-01400: cannot insert NULL' }] } } },
        expect: {
          ack: 'acked',
          db: { pdh_rejects: { count: 0 }, stg_receiving_advice: { count: 0 }, pdh_job_log: { has: [{ message_id: 'MSG-92003', status: 'FAILED' }] } },
          sent: [{ destination: 'PDH.INBOUND.FAILED', count: 1, has: { messageId: 'MSG-92003' } }],
          notSent: ['PDH.ACK'],
        },
      },
      {
        name: 'The mail server is down',
        about: 'The email cannot be sent. The load, the job log and the ACK are not affected.',
        trigger: doc('MSG-92004', mixed),
        overrides: { systems: { email: { fault: true } } },
        expect: { db: { pdh_job_log: { has: [{ message_id: 'MSG-92004', status: 'COMPLETE' }] } }, sent: [{ destination: 'PDH.ACK', count: 1 }], notSent: ['PDH.INBOUND.FAILED'] },
      },
    ],
  },
  referenceFlow: design(
    flow(
      'pdh-process-receiving-advice',
      source('jms-listener', { destination: 'PDH.RECADV.WORK', ackMode: 'AUTO' }),
      [
        step('set-variable', { variableName: 'doc', value: '#[payload]' }),
        step('set-variable', { variableName: 'jobId', value: '#[uuid()]' }),
        step('db-insert', {
          database: 'Oracle',
          sql: "INSERT INTO pdh_job_log (job_id, message_id, status) VALUES (:jobId, :messageId, 'STARTED')",
          inputParameters: '#[{ jobId: vars.jobId, messageId: vars.doc.messageId }]',
          target: 'started',
        }),
        step('set-variable', {
          variableName: 'good',
          value: '#[vars.doc.lines filter ((l) -> sizeOf(l.gtin default "") == 14 and (l.qtyReceived default 0) > 0) map ((l) -> { message_id: vars.doc.messageId, line_no: l.lineNo, gtin: l.gtin, po_number: l.poNumber, qty_received: l.qtyReceived })]',
        }),
        step('set-variable', {
          variableName: 'bad',
          value: '#[vars.doc.lines filter ((l) -> not (sizeOf(l.gtin default "") == 14 and (l.qtyReceived default 0) > 0)) map ((l) -> { message_id: vars.doc.messageId, line_no: l.lineNo, gtin: l.gtin, reason: if (sizeOf(l.gtin default "") != 14) "GTIN must have 14 digits" else "Quantity must be above 0" })]',
        }),
        scope('try', { transactionalAction: 'ALWAYS_BEGIN' }, [
          router('choice', {}, [
            route({ expression: '#[not isEmpty(vars.bad)]' }, [
              step('set-payload', { value: '#[vars.bad]' }),
              step('db-bulk-insert', { database: 'Oracle', sql: 'INSERT INTO pdh_rejects (message_id, line_no, gtin, reason) VALUES (:message_id, :line_no, :gtin, :reason)' }),
            ]),
          ], { otherwise: [] }),
          router('choice', {}, [
            route({ expression: '#[not isEmpty(vars.good)]' }, [
              step('set-payload', { value: '#[vars.good]' }),
              step('db-bulk-insert', {
                database: 'Oracle',
                sql: 'INSERT INTO stg_receiving_advice (message_id, line_no, gtin, po_number, qty_received) VALUES (:message_id, :line_no, :gtin, :po_number, :qty_received)',
              }),
            ]),
          ], { otherwise: [] }),
        ]),
        step('logger', { level: 'INFO', message: '#["ReceivingAdvice " ++ vars.doc.messageId ++ " loaded=" ++ (sizeOf(vars.good) as String) ++ " rejected=" ++ (sizeOf(vars.bad) as String)]' }),
        step('db-update', {
          database: 'Oracle',
          sql: "UPDATE pdh_job_log SET status = 'COMPLETE', good_count = :good, bad_count = :bad WHERE job_id = :jobId",
          inputParameters: '#[{ good: sizeOf(vars.good), bad: sizeOf(vars.bad), jobId: vars.jobId }]',
          target: 'finished',
        }),
        step('set-payload', {
          value: '#[output application/json --- { messageId: vars.doc.messageId, senderDocumentId: vars.doc.senderDocumentId, status: if (isEmpty(vars.bad)) "PROCESSED" else "PROCESSED_WITH_ERRORS", accepted: sizeOf(vars.good), rejected: sizeOf(vars.bad) }]',
        }),
        step('jms-publish', { destination: 'PDH.ACK', destinationType: 'QUEUE', persistentDelivery: 'true' }),
        scope('async', {}, [
          step('email-send', {
            toAddresses: 'pdh-support@copperline.example',
            subject: '#["ReceivingAdvice " ++ vars.doc.messageId ++ " processed"]',
            content: '#["Accepted " ++ (sizeOf(vars.good) as String) ++ ", rejected " ++ (sizeOf(vars.bad) as String)]',
          }),
        ]),
      ],
      [
        handler('on-error-continue', { type: 'ANY' }, [
          step('logger', { level: 'ERROR', message: '#["ReceivingAdvice " ++ vars.doc.messageId ++ " failed: " ++ error.description]' }),
          step('db-update', {
            database: 'Oracle',
            sql: "UPDATE pdh_job_log SET status = 'FAILED' WHERE job_id = :jobId",
            inputParameters: '#[{ jobId: vars.jobId }]',
          }),
          step('set-payload', { value: '#[output application/json --- vars.doc - "lines"]' }),
          step('jms-publish', { destination: 'PDH.INBOUND.FAILED', destinationType: 'QUEUE', persistentDelivery: 'true' }),
        ]),
      ],
    ),
  ),
  description: `
Copperline Home Supply’s product data hub (fictional) routes each document type to a process flow of its own. You build the one for **ReceivingAdvice**: a distribution centre telling the hub what it received against purchase orders.

The router has already downloaded the document and puts it on the JMS queue \`PDH.RECADV.WORK\`:

\`{ "messageId", "messageType": "ReceivingAdvice", "senderId", "senderDocumentId", "lines": [ { "lineNo", "gtin", "qtyReceived", "poNumber" } ] }\`

A line is **good** when \`gtin\` has 14 digits and \`qtyReceived\` is above 0. Everything else is **bad**.

Oracle tables:
- \`pdh_job_log\` (\`job_id\`, \`message_id\`, \`status\`, \`good_count\`, \`bad_count\`): one row per run.
- \`pdh_rejects\` (\`message_id\`, \`line_no\`, \`gtin\`, \`reason\`).
- \`stg_receiving_advice\` (\`message_id\`, \`line_no\`, \`gtin\`, \`po_number\`, \`qty_received\`): the staging table the ERP load reads.

**Requirements**
- Log the job as \`STARTED\` before loading anything.
- Bulk insert the bad lines into \`pdh_rejects\` and the good lines into \`stg_receiving_advice\`. Both or neither: a half load confuses the ERP team.
- Log the counts, then mark the job \`COMPLETE\` with them.
- Send the final ACK to \`PDH.ACK\`: \`{ messageId, senderDocumentId, status, accepted, rejected }\`, with status \`PROCESSED\` or \`PROCESSED_WITH_ERRORS\`.
- Email \`pdh-support@copperline.example\` a summary. A mail problem must not fail or slow the run.
- If the load fails, mark the job \`FAILED\` and put the document's header (without the lines) on \`PDH.INBOUND.FAILED\`, where the restart app picks it up later. No ACK in that case.

**Facts**
- \`job_id\` is a new UUID made in the flow.
- Write the statuses \`'STARTED'\`, \`'COMPLETE'\` and \`'FAILED'\` as literals in the SQL.
- \`accepted\` and \`rejected\` in the ACK are the good and bad line counts, the same numbers as \`good_count\` and \`bad_count\`.
- A failed load is handled: the run ends without an error, so the broker does not deliver the document again. The failure queue is how it comes back.

**Design the flow.**
`,
  answerTemplate: `## The job log

## Good and bad lines

## Loading in one transaction

## The ACK and the email

## When the load fails
`,
  keyPoints: [
    'The job log row is written first and outside the transaction, so a failed run still leaves a STARTED row that the handler turns into FAILED.',
    'Split the lines once into two variables. Each list is then bulk inserted in one call, which is far faster than a row at a time.',
    'A Try with ALWAYS_BEGIN puts both bulk inserts in one database transaction. If the staging load fails, the rejects are rolled back too.',
    'The ACK goes out only after the job is COMPLETE, so the sender is never told about a load that did not finish.',
    'An Async scope runs the email on its own. Its errors do not reach the flow, and the flow does not wait for the mail server.',
    'On Error Continue at the end means the JMS message is acknowledged: the document is now safe on the failure queue, so it must not also come back from the broker.',
  ],
  solution: `
1. **JMS On New Message** on \`PDH.RECADV.WORK\`.
2. **Set Variable** \`doc\` and \`jobId\` (\`#[uuid()]\`).
3. **Database Insert** into \`pdh_job_log\` with status \`STARTED\`, with a Target.
4. **Set Variable** \`good\` and **Set Variable** \`bad\`: two filters over \`vars.doc.lines\`, each mapped to the column names of its table, with a reason on each bad line.
5. **Try**, transactional action **ALWAYS_BEGIN**:
   - **Choice** \`not isEmpty(vars.bad)\`: payload = \`vars.bad\`, **Bulk Insert** into \`pdh_rejects\`.
   - **Choice** \`not isEmpty(vars.good)\`: payload = \`vars.good\`, **Bulk Insert** into \`stg_receiving_advice\`.
6. **Logger** with the counts.
7. **Database Update** \`pdh_job_log\` to \`COMPLETE\` with \`good_count\` and \`bad_count\`.
8. **Set Payload** the ACK, **JMS Publish** to \`PDH.ACK\`.
9. **Async**: **Email Send** to \`pdh-support@copperline.example\`.
10. Flow handler **On Error Continue** (ANY): ERROR log, **Database Update** the job to \`FAILED\`, payload = the header, **JMS Publish** to \`PDH.INBOUND.FAILED\`.

**Sequence numbers.** The real hub takes a batch number from an Oracle sequence before the load and stamps every staging row with it. Add a Select of the sequence before step 5 if the ERP load needs it.

**Very large documents.** For tens of thousands of lines, load with a Batch Job and a Batch Aggregator, as in the SupplierItem flow.
`,
  followUps: [
    {
      q: 'Why is the job log insert not inside the transaction?',
      a: 'A rollback would remove it, and support would see no trace of the failed run. The log must survive the failure it describes.',
    },
    {
      q: 'The ACK publish fails after the job is COMPLETE. What happens?',
      a: 'The handler marks the job FAILED and parks the document, although the data is loaded. A restart would load it again. Check the job log for a COMPLETE row before loading, or put the staging load and the ACK in an XA transaction.',
    },
  ],
}
