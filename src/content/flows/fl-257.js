import { design, flow, route, router, scope, source, step } from '../../flow/dsl.js'

const notice = { messageId: 'SI-77120', blobName: 'supplier-items/SI-77120.json' }
const items = [
  { supplier_id: 'SUP-HARTLEY', item_id: 'BOLT-M8-50', cost: 0.11 },
  { supplier_id: 'SUP-HARTLEY', item_id: 'NUT-M8', cost: 0.04 },
  { supplier_id: 'SUP-VANCE', item_id: 'HINGE-75-SS', cost: 1.9 },
]
const oneBad = [items[0], { supplier_id: 'SUP-HARTLEY', item_id: 'NUT-M8', cost: null }, items[2]]
const tables = {
  msg_log: { key: 'message_id', columns: ['message_id', 'status'], rows: [{ message_id: 'SI-77001', status: 'PROCESSED' }] },
  stg_supplier_item: {
    key: ['supplier_id', 'item_id'],
    columns: ['supplier_id', 'item_id', 'cost', 'job_id'],
    rows: [{ supplier_id: 'SUP-HARTLEY', item_id: 'BOLT-M8-50', cost: 0.1, job_id: 880 }],
  },
  supplier_item_rejects: { columns: ['job_id', 'supplier_id', 'item_id', 'reason'], rows: [] },
  job_log: { key: 'job_id', columns: ['job_id', 'job_name', 'status', 'loaded', 'failed'], rows: [{ job_id: 880, job_name: 'SUPPLIER_ITEMS_IN', status: 'COMPLETED', loaded: 5120, failed: 0 }] },
}
const seen = { ...tables, msg_log: { ...tables.msg_log, rows: [{ message_id: 'SI-77120', status: 'PROCESSED' }] } }
const procedures = {
  JOB_START: (args, db) => {
    const rows = db.tables.job_log.rows
    const id = Math.max(0, ...rows.map((r) => r.job_id)) + 1
    rows.push({ job_id: id, job_name: args.jobName, status: 'STARTED', loaded: null, failed: null })
    return { job_id: id }
  },
}
const merge =
  'MERGE INTO stg_supplier_item t\nUSING (SELECT :supplier_id AS supplier_id, :item_id AS item_id, :cost AS cost, :job_id AS job_id FROM dual) s\nON (t.supplier_id = s.supplier_id AND t.item_id = s.item_id)\nWHEN MATCHED THEN UPDATE SET cost = s.cost, job_id = s.job_id\nWHEN NOT MATCHED THEN INSERT (supplier_id, item_id, cost, job_id) VALUES (s.supplier_id, s.item_id, s.cost, s.job_id)'
const trigger = { message: { kind: 'jms', destination: 'supplier.items.notify', payload: notice } }

export default {
  id: 'fl-257',
  category: 'flows',
  title: 'A Supplier Item Adapter End to End: a Duplicate Check, a RECEIVED ACK, a Claim Check Blob, a Batch Job That MERGEs Into Oracle Staging, Rejects From an ONLY_FAILURES Step, a Job Log, a Final ACK and an Email That Never Blocks',
  level: 'EXPERT',
  tags: ['myproject', 'batch', 'oracle', 'claim-check', 'azure-blob', 'jms', 'merge', 'job-log', 'reject-table', 'async'],
  estMinutes: 70,
  flowChecks: [
    { label: 'Notices arrive on the JMS queue supplier.items.notify', rule: { type: 'source', component: 'jms-listener', where: { destination: 'supplier.items.notify' } } },
    { label: 'The message ID is looked up in msg_log before the blob is downloaded', rule: { type: 'before', first: 'db-select', firstWhere: { sql: 'msg_log' }, then: 'azure-download-blob' } },
    { label: 'A Batch Aggregator MERGEs the items into stg_supplier_item', rule: { type: 'inside', component: ['db-bulk-update', 'db-bulk-insert'], within: 'batch-aggregator', where: { sql: { all: ['MERGE INTO stg_supplier_item', 'WHEN MATCHED', 'WHEN NOT MATCHED'] } } } },
    { label: 'An ONLY_FAILURES step writes supplier_item_rejects', rule: { type: 'inside', component: 'db-insert', within: 'batch-job', routeWhere: { acceptPolicy: 'ONLY_FAILURES' }, where: { sql: 'supplier_item_rejects' } } },
    { label: 'On Complete closes the job row and publishes the final ACK', rule: { type: 'all', rules: [{ type: 'inside', component: 'db-update', within: 'batch-job', inSlot: 'onComplete', where: { sql: 'job_log' } }, { type: 'inside', component: 'jms-publish', within: 'batch-job', inSlot: 'onComplete', where: { destination: 'supplier.items.ack' } }] } },
    { label: 'The report email is sent from an Async scope', rule: { type: 'inside', component: 'email-send', within: 'async' } },
  ],
  simulation: {
    systems: { db: { tables, procedures }, calls: { 'azure-download-blob': { payload: items } } },
    tests: [
      {
        name: 'A new message',
        about: 'SI-77120 is new. A RECEIVED ACK goes out, BOLT-M8-50 is updated and the two new items inserted under job 881, the job is COMPLETED, the final ACK says COMPLETED and support gets the report.',
        trigger,
        expect: {
          noError: true,
          db: {
            stg_supplier_item: { count: 3, has: [{ item_id: 'BOLT-M8-50', cost: 0.11, job_id: 881 }, { item_id: 'HINGE-75-SS', job_id: 881 }] },
            msg_log: { has: [{ message_id: 'SI-77120', status: 'PROCESSED' }] },
            job_log: { has: [{ job_id: 881, status: 'COMPLETED', loaded: 3, failed: 0 }] },
          },
          sent: [
            { destination: 'supplier.items.ack', count: 2 },
            { destination: 'supplier.items.ack', has: { messageId: 'SI-77120', status: 'RECEIVED' } },
            { destination: 'supplier.items.ack', has: { messageId: 'SI-77120', status: 'COMPLETED', loaded: 3 } },
          ],
          emails: [{ to: 'merch-support@pellrook.example', subject: 'SI-77120', count: 1 }],
        },
      },
      {
        name: 'The same notice again',
        about: 'SI-77120 was processed before. The adapter logs a WARN and answers DUPLICATE. The blob is not downloaded and staging is not touched.',
        trigger,
        overrides: { systems: { db: { tables: seen } } },
        expect: {
          noError: true,
          connector: [{ type: 'azure-download-blob', count: 0 }],
          db: { stg_supplier_item: { count: 1, has: [{ item_id: 'BOLT-M8-50', cost: 0.1 }] } },
          sent: [{ destination: 'supplier.items.ack', count: 1, has: { status: 'DUPLICATE' } }],
          logs: [{ level: 'WARN', has: 'SI-77120' }],
        },
      },
      {
        name: 'An item with no cost',
        about: 'NUT-M8 has no cost and fails its check. It goes to the reject table under job 881. The other two are merged, and the job and the final ACK say PARTIAL.',
        trigger,
        overrides: { systems: { calls: { 'azure-download-blob': { payload: oneBad } } } },
        expect: {
          db: {
            stg_supplier_item: { count: 2 },
            supplier_item_rejects: { count: 1, has: [{ job_id: 881, item_id: 'NUT-M8' }] },
            job_log: { has: [{ job_id: 881, status: 'PARTIAL', loaded: 2, failed: 1 }] },
          },
          sent: [{ destination: 'supplier.items.ack', has: { status: 'PARTIAL', failed: 1 } }],
        },
      },
      {
        name: 'The mail server is down',
        about: 'The report email fails, but it runs on its own. The job row is COMPLETED and the final ACK still goes out.',
        trigger,
        overrides: { systems: { email: { fault: true } } },
        expect: { db: { job_log: { has: [{ job_id: 881, status: 'COMPLETED' }] } }, sent: [{ destination: 'supplier.items.ack', has: { status: 'COMPLETED' } }] },
      },
    ],
  },
  referenceFlow: design(
    flow('supplier-items-adapter', source('jms-listener', { destination: 'supplier.items.notify', ackMode: 'AUTO', numberOfConsumers: 1 }), [
      step('set-variable', { variableName: 'messageId', value: '#[payload.messageId]' }),
      step('set-variable', { variableName: 'blobName', value: '#[payload.blobName]' }),
      step('db-select', { database: 'Oracle', sql: 'SELECT status FROM msg_log WHERE message_id = :messageId', inputParameters: '#[{ messageId: vars.messageId }]', target: 'seen' }),
      router(
        'choice',
        {},
        [
          route({ expression: '#[not isEmpty(vars.seen)]' }, [
            step('logger', { level: 'WARN', message: '#["Duplicate notice " ++ vars.messageId ++ ", skipped"]' }),
            step('set-payload', { value: '#[output application/json --- { messageId: vars.messageId, status: "DUPLICATE" }]' }),
            step('jms-publish', { destination: 'supplier.items.ack', destinationType: 'QUEUE', persistentDelivery: 'true' }),
          ]),
        ],
        {
          otherwise: [
            step('db-insert', { database: 'Oracle', sql: "INSERT INTO msg_log (message_id, status) VALUES (:messageId, 'RECEIVED')", inputParameters: '#[{ messageId: vars.messageId }]', target: 'logged' }),
            step('set-payload', { value: '#[output application/json --- { messageId: vars.messageId, status: "RECEIVED" }]' }),
            step('jms-publish', { destination: 'supplier.items.ack', destinationType: 'QUEUE', persistentDelivery: 'true' }),
            // outputParameters: job_id (NUMERIC). The result map is keyed by this name.
            step('db-stored-procedure', { database: 'Oracle', sql: '{ call JOB_START(:jobName, :job_id) }', inputParameters: '#[{ jobName: "SUPPLIER_ITEMS_IN" }]', target: 'job' }),
            step('set-variable', { variableName: 'jobId', value: '#[vars.job.job_id]' }),
            step('azure-download-blob', { container: 'inbound', fileName: '#[vars.blobName]' }),
            router(
              'batch-job',
              { jobName: 'supplier-items-adapter', blockSize: 200, maxFailedRecords: -1 },
              [
                route({ name: 'stage', acceptPolicy: 'NO_FAILURES' }, [
                  step('validation', { check: 'is-not-null', expression: '#[payload.cost]', message: 'NO_COST' }),
                  step('transform', { script: '%dw 2.0\noutput application/java\n---\n{ supplier_id: payload.supplier_id, item_id: payload.item_id, cost: payload.cost, job_id: vars.jobId }' }),
                  scope('batch-aggregator', { size: 500, streaming: 'false' }, [step('db-bulk-update', { database: 'Oracle', sql: merge })]),
                ]),
                route({ name: 'reject', acceptPolicy: 'ONLY_FAILURES' }, [
                  step('db-insert', {
                    database: 'Oracle',
                    sql: 'INSERT INTO supplier_item_rejects (job_id, supplier_id, item_id, reason) VALUES (:jobId, :supplierId, :itemId, :reason)',
                    inputParameters: '#[{ jobId: vars.jobId, supplierId: payload.supplier_id, itemId: payload.item_id, reason: "LOAD_FAILED" }]',
                  }),
                ]),
              ],
              {
                onComplete: [
                  step('set-variable', { variableName: 'status', value: '#[if (payload.failedRecords == 0) "COMPLETED" else if (payload.successfulRecords == 0) "FAILED" else "PARTIAL"]' }),
                  step('set-variable', { variableName: 'loaded', value: '#[payload.successfulRecords]' }),
                  step('set-variable', { variableName: 'failed', value: '#[payload.failedRecords]' }),
                  step('db-update', {
                    database: 'Oracle',
                    sql: 'UPDATE job_log SET status = :status, loaded = :loaded, failed = :failed WHERE job_id = :jobId',
                    inputParameters: '#[{ jobId: vars.jobId, status: vars.status, loaded: vars.loaded, failed: vars.failed }]',
                  }),
                  step('db-update', { database: 'Oracle', sql: "UPDATE msg_log SET status = 'PROCESSED' WHERE message_id = :messageId", inputParameters: '#[{ messageId: vars.messageId }]' }),
                  step('set-payload', { value: '#[output application/json --- { messageId: vars.messageId, status: vars.status, loaded: vars.loaded, failed: vars.failed }]' }),
                  step('jms-publish', { destination: 'supplier.items.ack', destinationType: 'QUEUE', persistentDelivery: 'true' }),
                  scope('async', {}, [
                    step('email-send', {
                      toAddresses: 'merch-support@pellrook.example',
                      subject: '#["Supplier items " ++ vars.messageId ++ ": " ++ vars.status]',
                      content: '#["Job " ++ (vars.jobId as String) ++ " loaded=" ++ (vars.loaded as String) ++ " failed=" ++ (vars.failed as String)]',
                      contentType: 'text/plain',
                    }),
                  ]),
                ],
              },
            ),
          ],
        },
      ),
    ]),
  ),
  description: `
Pell & Rook Hardware, a fictional hardware chain, receives supplier item costs from a supplier portal. For each upload the portal writes a JSON list to **Azure Blob Storage** (container \`inbound\`) and sends a notice on the **JMS** queue \`supplier.items.notify\`:

\`\`\`json
{ "messageId": "SI-77120", "blobName": "supplier-items/SI-77120.json" }
\`\`\`

A blob holds up to **400,000 items**: \`[ { "supplier_id": "SUP-HARTLEY", "item_id": "BOLT-M8-50", "cost": 0.11 } ]\`.

The Oracle side, built by the DBA team:
- \`msg_log\` (\`message_id\`, \`status\`): one row per notice ever received.
- \`JOB_START(p_job_name IN, p_job_id OUT)\`: inserts a \`STARTED\` row in \`job_log\` (\`job_id\`, \`job_name\`, \`status\`, \`loaded\`, \`failed\`).
- \`stg_supplier_item\` (key \`supplier_id\` + \`item_id\`, \`cost\`, \`job_id\`): a resent item replaces its cost.
- \`supplier_item_rejects\` (\`job_id\`, \`supplier_id\`, \`item_id\`, \`reason\`).

The portal expects ACKs on \`supplier.items.ack\`: \`RECEIVED\` as soon as a notice is accepted, then a final one with the status and counts. Merchandising support (\`merch-support@pellrook.example\`) wants a report email per message; the mail server goes down a few times a month.

**Requirements**
- A notice whose message ID is already in \`msg_log\`: log a WARN, ACK \`DUPLICATE\`, do nothing else.
- A new notice: record it as \`RECEIVED\` and send the \`RECEIVED\` ACK, start a job row \`SUPPLIER_ITEMS_IN\`, download the blob.
- Through a Batch Job: an item with no cost fails; the others are MERGEd into staging in groups; each failed item goes to the reject table with reason \`LOAD_FAILED\`.
- When the job ends: job row and final ACK with \`COMPLETED\`, \`PARTIAL\` or \`FAILED\` and the counts, \`msg_log\` to \`PROCESSED\`, then the email, which must never hold up or fail the rest.

**Facts**
- Status is \`COMPLETED\` when nothing failed, \`FAILED\` when nothing loaded, and \`PARTIAL\` otherwise.
- Every ACK is JSON with \`messageId\` and \`status\`. The final ACK adds \`loaded\` and \`failed\`.
- The WARN for a duplicate and the email subject both name the message ID.
- Call it as \`{ call JOB_START(:jobName, :job_id) }\` and declare \`job_id\` as an output parameter (NUMERIC). The Stored Procedure result is a map keyed by the output parameter names, so it holds the new ID as \`job_id\`.
- Download the blob from container \`inbound\` with the name in \`blobName\`.
- In On Complete the payload is the job result, with \`successfulRecords\` and \`failedRecords\`.

**What each system sends back**
- **Database Select** on \`msg_log\`: \`[ { "STATUS": "PROCESSED" } ]\` for a notice seen before, or an empty list. Oracle returns unquoted column names in upper case.
- \`JOB_START\` returns \`{ "job_id": 881 }\` in the tests. With Target \`job\`, read it as \`vars.job.job_id\`.
- **Download Blob** puts the JSON list of items in the payload. The Batch Job splits it into one record per item, such as \`{ "supplier_id": "SUP-HARTLEY", "item_id": "NUT-M8", "cost": null }\`.

**What failures look like**
- An item with no cost: a Validation **Is Not Null** on \`payload.cost\` raises \`VALIDATION:NULL\` for that record only. It goes on to the ONLY_FAILURES step.
- The mail server is down: Email Send raises an \`EMAIL\` error, but inside Async it never reaches On Complete. The job row and the final ACK are already done.

**Design the flow.**
`,
  answerTemplate: `## Duplicate check and RECEIVED

## The job row and the blob

## The Batch Job

## On Complete

## The email
`,
  keyPoints: [
    'The duplicate check comes before the download: a repeated notice costs one select, not a 400,000 item blob.',
    'The claim check keeps the JMS message tiny. The data stays in Blob Storage until the adapter asks for it.',
    'A per record check before the aggregator fails one item, not the group. The ONLY_FAILURES step then writes it to the reject table.',
    'MERGE makes a resent item an update, not a key violation. Oracle MERGE takes no semicolon in JDBC and needs FROM dual for a one row source.',
    'Everything that needs the counts lives in On Complete. The email sits in an Async scope there, so a mail outage cannot stop the final ACK.',
  ],
  solution: `
1. **JMS On New Message** on \`supplier.items.notify\`. **Set Variable** \`messageId\`, \`blobName\`.
2. **Database Select** \`msg_log\` by message ID (target \`seen\`).
3. **Choice**:
   - seen: **Logger** WARN, **Set Payload** DUPLICATE, **JMS Publish** to \`supplier.items.ack\`.
   - otherwise: **Insert** \`msg_log\` RECEIVED, **JMS Publish** RECEIVED, **Stored Procedure** \`JOB_START\`, **Set Variable** \`jobId\`, **Download Blob**, then the **Batch Job** (max failed records -1):
     - Step \`stage\`: **Validation** cost is not null, **Transform**, **Batch Aggregator** (size 500) with **Bulk Update** MERGE.
     - Step \`reject\` (ONLY_FAILURES): **Insert** into \`supplier_item_rejects\`.
     - **On Complete**: **Set Variable** \`status\`, \`loaded\`, \`failed\`; **Update** \`job_log\`; **Update** \`msg_log\` PROCESSED; **Set Payload** and **JMS Publish** the final ACK; **Async** { **Email Send** }.

**Two adapters at once.** With several consumers, two copies of the same notice can pass the select together. The primary key on \`msg_log.message_id\` stops the second insert, which then fails that copy before the download.
`,
  followUps: [
    {
      q: 'The app dies after the RECEIVED ACK but before the job ends. What does the portal see, and how do you recover?',
      a: 'It sees RECEIVED and no final ACK. msg_log says RECEIVED and job_log says STARTED. A restart flow finds such messages older than an hour, sets them back so the notice can be replayed, and a replay goes through because the MERGE is idempotent.',
    },
    {
      q: 'Why publish the final ACK after the job row update and not before?',
      a: 'The portal may query the job state after the ACK. Writing the job row first means the ACK never points at a state that is not there yet.',
    },
  ],
}
