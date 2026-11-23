import { design, flow, route, router, scope, source, step } from '../../flow/dsl.js'

const items = Array.from({ length: 2500 }, (_, i) => ({ item_id: `ITM-${String(i + 1).padStart(5, '0')}`, description: `Item ${i + 1}`, dept: ['CHILLED', 'SNACKS', 'BAKERY'][i % 3], status: 'NEW', job_id: null }))
const tablesWith = (rows) => ({
  outbound_item: { key: 'item_id', columns: ['item_id', 'description', 'dept', 'status', 'job_id'], rows },
  job_log: { key: 'job_id', columns: ['job_id', 'job_name', 'status', 'sent', 'failed'], rows: [{ job_id: 610, job_name: 'ITEM_OUT', status: 'COMPLETED', sent: 3110, failed: 0 }] },
})
const procedures = {
  JOB_START: (args, db) => {
    const rows = db.tables.job_log.rows
    const id = Math.max(0, ...rows.map((r) => r.job_id)) + 1
    rows.push({ job_id: id, job_name: args.jobName, status: 'STARTED', sent: null, failed: null })
    return { job_id: id }
  },
}
const ok = { payload: { eTag: '0x8DD2C11' } }
const down = { fault: { type: 'AZURE-STORAGE:CONNECTIVITY', description: 'The storage account did not answer' } }

export default {
  id: 'fl-288',
  category: 'flows',
  title: 'Outbound Items by Claim Check, One Blob per Group: a Batch Aggregator Uploads Each Thousand Items as One Message, Announces It on JMS, Marks Only Those Items SENT, and On Complete Closes the Job With the Real Counts',
  level: 'EXPERT',
  tags: ['myproject', 'batch', 'claim-check', 'azure-blob', 'oracle', 'jms', 'outbound', 'job-log', 'bulk-update'],
  estMinutes: 60,
  flowChecks: [
    { label: 'A job row is started before the items are read', rule: { type: 'before', first: 'db-stored-procedure', firstWhere: { sql: 'JOB_START' }, then: 'db-select', thenWhere: { sql: 'outbound_item' } } },
    { label: 'Each group is uploaded as one blob from a Batch Aggregator of at most 1,000', rule: { type: 'inside', component: 'azure-upload-blob', within: 'batch-aggregator', withinWhere: { size: { lte: 1000 } } } },
    { label: 'Each group is announced on pdh.outbound.notify from the aggregator', rule: { type: 'inside', component: 'jms-publish', within: 'batch-aggregator', where: { destination: 'pdh.outbound.notify' } } },
    { label: 'Items are marked SENT after their notice is published', rule: { type: 'before', first: 'jms-publish', then: 'db-bulk-update', thenWhere: { sql: 'SENT' } } },
    { label: 'On Complete closes the job row', rule: { type: 'inside', component: 'db-update', within: 'batch-job', inSlot: 'onComplete', where: { sql: 'job_log' } } },
  ],
  simulation: {
    systems: { db: { tables: tablesWith(items), procedures }, calls: { 'azure-upload-blob': ok } },
    tests: [
      {
        name: 'Twenty five hundred new items',
        about: 'Three groups: three blobs, three notices, every item SENT under job 611, and the job COMPLETED with 2,500 sent.',
        trigger: { schedule: {} },
        expect: {
          noError: true,
          connector: [{ type: 'azure-upload-blob', count: 3, settings: { container: 'pdh-outbound' } }],
          sent: [{ destination: 'pdh.outbound.notify', count: 3 }, { destination: 'pdh.outbound.notify', has: { jobId: 611, items: 1000 } }, { destination: 'pdh.outbound.notify', has: { items: 500 } }],
          db: { outbound_item: { lacks: [{ status: 'NEW' }], has: [{ item_id: 'ITM-02500', status: 'SENT', job_id: 611 }] }, job_log: { has: [{ job_id: 611, status: 'COMPLETED', sent: 2500, failed: 0 }] } },
        },
      },
      {
        name: 'The second upload fails',
        about: 'The storage account drops the second group. Its 1,000 items stay NEW for tomorrow, no notice points at a blob that is not there, and the job is PARTIAL.',
        trigger: { schedule: {} },
        overrides: { systems: { calls: { 'azure-upload-blob': [ok, down, ok] } } },
        expect: {
          sent: [{ destination: 'pdh.outbound.notify', count: 2 }],
          db: { outbound_item: { has: [{ item_id: 'ITM-01500', status: 'NEW' }, { item_id: 'ITM-00010', status: 'SENT' }] }, job_log: { has: [{ job_id: 611, status: 'PARTIAL', sent: 1500, failed: 1000 }] } },
        },
      },
      {
        name: 'The broker refuses the notices',
        about: 'Every blob uploads, but no notice can be published. No item is marked SENT, so all are sent again tomorrow, and the job is FAILED.',
        trigger: { schedule: {} },
        overrides: { systems: { queues: { 'pdh.outbound.notify': { fault: true } } } },
        expect: { db: { outbound_item: { lacks: [{ status: 'SENT' }] }, job_log: { has: [{ job_id: 611, status: 'FAILED', sent: 0, failed: 2500 }] } } },
      },
    ],
  },
  referenceFlow: design(
    flow('item-outbound', source('scheduler', { strategy: 'cron', expression: '0 0 22 * * ?' }), [
      step('db-stored-procedure', { database: 'Oracle', sql: '{ call JOB_START(:jobName, :jobId) }', inputParameters: '#[{ jobName: "ITEM_OUT" }]', target: 'job' }),
      step('set-variable', { variableName: 'jobId', value: '#[vars.job.job_id]' }),
      step('db-select', { database: 'Oracle', sql: "SELECT item_id, description, dept FROM outbound_item WHERE status = 'NEW' ORDER BY item_id", fetchSize: 1000 }),
      router(
        'batch-job',
        { jobName: 'item-outbound', blockSize: 500, maxFailedRecords: -1 },
        [
          route({ name: 'send', acceptPolicy: 'NO_FAILURES' }, [
            step('set-payload', { value: '#[{ itemId: payload.item_id, description: payload.description, department: payload.dept }]' }),
            scope('batch-aggregator', { size: 1000, streaming: 'false' }, [
              step('set-variable', { variableName: 'blobName', value: '#["item-out/" ++ (vars.jobId as String) ++ "/" ++ payload[0].itemId ++ ".json"]' }),
              step('set-variable', { variableName: 'ids', value: '#[payload map { item_id: $.itemId, job_id: vars.jobId }]' }),
              step('set-payload', { value: '#[output application/json --- { jobId: vars.jobId, messageType: "Item", items: payload }]' }),
              step('azure-upload-blob', { container: 'pdh-outbound', fileName: '#[vars.blobName]', fileStream: '#[payload]', contentType: 'application/json' }),
              step('set-payload', { value: '#[output application/json --- { jobId: vars.jobId, messageType: "Item", blobName: vars.blobName, items: sizeOf(vars.ids) }]' }),
              step('jms-publish', { destination: 'pdh.outbound.notify', destinationType: 'QUEUE', persistentDelivery: 'true' }),
              step('set-payload', { value: '#[vars.ids]' }),
              step('db-bulk-update', { database: 'Oracle', sql: "UPDATE outbound_item SET status = 'SENT', job_id = :job_id WHERE item_id = :item_id" }),
            ]),
          ]),
        ],
        {
          onComplete: [
            step('db-update', {
              database: 'Oracle',
              sql: 'UPDATE job_log SET status = :status, sent = :sent, failed = :failed WHERE job_id = :jobId',
              inputParameters:
                '#[{ jobId: vars.jobId, sent: payload.successfulRecords, failed: payload.failedRecords, status: if (payload.failedRecords == 0) "COMPLETED" else if (payload.successfulRecords == 0) "FAILED" else "PARTIAL" }]',
            }),
          ],
        },
      ),
    ]),
  ),
  description: `
Larkfield Grocers, a fictional grocery chain, sends changed items from its product data hub to the warehouse partner every night at 22:00. Items waiting to go out have \`status\` = \`NEW\` in the Oracle table \`outbound_item\` (\`item_id\`, \`description\`, \`dept\`, \`status\`, \`job_id\`). On a busy night there are **400,000**.

The partner's rules:
- Each message is a JSON blob in the \`pdh-outbound\` container: \`{ "jobId", "messageType": "Item", "items": [ { "itemId", "description", "department" } ] }\`, with **at most 1,000 items**.
- For each blob, a notice on the **JMS** queue \`pdh.outbound.notify\`: \`{ "jobId", "messageType": "Item", "blobName", "items": <count> }\`. A notice must never point at a blob that is not there.

Larkfield's rules:
- A job row, started by \`JOB_START(p_job_name IN, p_job_id OUT)\` with name \`ITEM_OUT\`, closed with \`COMPLETED\`, \`PARTIAL\` or \`FAILED\` and the \`sent\` and \`failed\` counts.
- An item is marked \`SENT\` with the job ID only when its message has gone out. Anything not sent stays \`NEW\` and goes tomorrow.

The first version built one message per item: 400,000 blobs and notices a night. The partner asked for groups.

**Facts**
- \`job_log\` has \`job_id\`, \`job_name\`, \`status\`, \`sent\` and \`failed\`. Call \`JOB_START\` with a target variable: the OUT parameter comes back as \`{ job_id }\`.
- Name each blob \`item-out/<jobId>/<first itemId>.json\`. Send the notices with **JMS Publish**.
- Let the job go on after a failed group: set max failed records to -1. \`sent\` and \`failed\` are the job's successful and failed record counts.

**What each system sends back**
- \`JOB_START\` gives \`{ "job_id": 611 }\`.
- The Database Select streams rows with the columns as named: \`{ "item_id": "ITM-00001", "description": "Item 1", "dept": "CHILLED" }\`.
- Inside a Batch Aggregator of 1,000 the payload is a list of up to 1,000 records.
- Upload Blob answers with the blob's details, such as \`{ "eTag": "0x8DD2C11" }\`. Nothing after it needs them.
- In On Complete the payload is the job result, with \`payload.successfulRecords\` and \`payload.failedRecords\`.

**What failures look like**
- The storage account drops one upload: Upload Blob fails with a connectivity error (\`AZURE-STORAGE:CONNECTIVITY\` here). That group's 1,000 records fail, so no notice goes out and its items stay \`NEW\`. With 1,500 sent and 1,000 failed the job is \`PARTIAL\`.
- The broker refuses the notices: every JMS Publish fails, so every group fails before the bulk update. No item is marked \`SENT\` and the job is \`FAILED\`.

**Design the flow.**
`,
  answerTemplate: `## The job row and the read

## One message per group

## Upload, notice, mark

## Closing the job
`,
  keyPoints: [
    'A Batch Aggregator of 1,000 turns the stream of items into the groups the partner wants: one blob and one notice per group.',
    'Order inside the group is the contract: upload, then publish, then mark SENT. A failure at any point leaves the group\'s items NEW, so they go again tomorrow.',
    'When the aggregator fails, every record in the group is counted as failed. On Complete then has the real numbers for the job row.',
    'Keep the item IDs in a variable before the payload becomes the document and then the notice. The bulk update needs them last.',
    'A blob uploaded for a group whose notice failed is an orphan. It does no harm because no notice points at it; a weekly sweep of blobs with no notice can tidy them.',
  ],
  solution: `
1. **Scheduler** cron \`0 0 22 * * ?\`. **Stored Procedure** \`JOB_START\`, **Set Variable** \`jobId\`.
2. **Database Select** the NEW items, fetch size 1000.
3. **Batch Job** (max failed records -1), step \`send\`:
   - **Set Payload** the partner's item shape.
   - **Batch Aggregator** (size 1000):
     - **Set Variable** \`blobName\` (job ID and first item) and \`ids\`.
     - **Set Payload** the document, **Upload Blob** to \`pdh-outbound\`.
     - **Set Payload** the notice, **JMS Publish** to \`pdh.outbound.notify\`.
     - **Set Payload** \`vars.ids\`, **Bulk Update** \`status = 'SENT'\`.
   - **On Complete**: **Update** \`job_log\` with the status and counts.

**Variables in the aggregator.** Variables set inside the aggregator belong to that group's run. They are fine for the steps that follow in the same group, and never reach On Complete.
`,
  followUps: [
    {
      q: 'The bulk update fails after the notice went out. What does the partner get tomorrow?',
      a: 'The same items again in a new blob, because they are still NEW. The partner must accept repeats, for example by keeping the latest version of each item. Saying so in the interface agreement is cheaper than a distributed transaction.',
    },
    {
      q: 'Why name the blob after the job and the first item instead of a UUID?',
      a: 'The name tells where the blob came from: support can go from a job row to its blobs, and from an item to the group it went in. A UUID would also be unique but says nothing. Items are read in item_id order, so the first item marks the group well.',
    },
  ],
}
