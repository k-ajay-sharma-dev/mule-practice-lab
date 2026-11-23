import { design, flow, handler, scope, source, step } from '../../flow/dsl.js'

const row = (id, recipient, status = 'READY', attempts = 0) => ({
  message_id: id,
  message_type: 'Item',
  recipient_id: recipient,
  body: `{"messageId":"${id}","items":[{"gtin":"05012345678900","description":"Cordless drill, 18V"}]}`,
  status,
  attempts,
  blob_name: null,
})
const rows = [row('OUT-70001', 'STORE-GRP-NORTH'), row('OUT-70002', 'HALDEN-PAINTS'), row('OUT-69990', 'STORE-GRP-SOUTH', 'SENT')]
const down = { 'azure-upload-blob': { fault: { type: 'AZURE-STORAGE:CONNECTIVITY', description: 'Unable to reach the storage account' } } }

export default {
  id: 'fl-173',
  category: 'flows',
  title: 'Product Data Hub Outbound Claim Check: Upload Each Generated Message to Blob Storage, Announce It on JMS, Then Mark It Sent, and Give Up After Five Tries',
  level: 'EXPERT',
  tags: ['myproject', 'azure-blob', 'claim-check', 'outbound', 'jms', 'scheduler', 'oracle', 'retry', 'gs1'],
  estMinutes: 50,
  flowChecks: [
    {
      label: 'A Scheduler picks up READY messages',
      rule: {
        type: 'all',
        rules: [
          { type: 'source', component: 'scheduler' },
          { type: 'exists', component: 'db-select', where: { sql: { all: ['pdh_outbound_messages', "'READY'"] } } },
        ],
      },
    },
    { label: 'Each message is uploaded to pdh-outbound inside the loop', rule: { type: 'inside', component: 'azure-upload-blob', within: 'foreach', where: { container: 'pdh-outbound' } } },
    { label: 'The notification is published only after the upload', rule: { type: 'before', first: 'azure-upload-blob', then: 'jms-publish', thenWhere: { destination: 'PDH.OUTBOUND.NOTIFY' }, outside: true } },
    {
      label: 'The row is marked SENT after the publish, only if it is still READY',
      rule: { type: 'before', first: 'jms-publish', then: 'db-update', thenWhere: { sql: { all: ["'SENT'", "status = 'READY'"] } }, outside: true },
    },
    {
      label: 'A failure counts an attempt and ends at FAILED after five',
      rule: { type: 'inside', component: 'db-update', within: 'on-error-continue', where: { sql: { all: ['attempts', 'FAILED'] } } },
    },
  ],
  simulation: {
    systems: {
      db: { tables: { pdh_outbound_messages: { key: 'message_id', rows } } },
      calls: { 'azure-upload-blob': { payload: true } },
    },
    tests: [
      {
        name: 'Two messages are ready',
        about: 'Both READY messages are uploaded under their recipient\'s folder, announced with the blob name, and marked SENT. The message already SENT is left alone.',
        trigger: { schedule: {} },
        expect: {
          noError: true,
          connector: [
            { type: 'azure-upload-blob', settings: { container: 'pdh-outbound' }, count: 2 },
            { type: 'azure-upload-blob', settings: { fileName: 'outbound/HALDEN-PAINTS/OUT-70002.json' }, count: 1 },
          ],
          sent: [
            { destination: 'PDH.OUTBOUND.NOTIFY', count: 2 },
            { destination: 'PDH.OUTBOUND.NOTIFY', count: 1, has: { messageId: 'OUT-70001', recipientId: 'STORE-GRP-NORTH', blobName: 'outbound/STORE-GRP-NORTH/OUT-70001.json' } },
          ],
          db: { pdh_outbound_messages: { has: [{ message_id: 'OUT-70001', status: 'SENT', blob_name: 'outbound/STORE-GRP-NORTH/OUT-70001.json' }, { message_id: 'OUT-70002', status: 'SENT' }] } },
        },
      },
      {
        name: 'Blob storage is down',
        about: 'No upload works. Nothing is announced, because a notification would point at a blob that is not there. Each message counts one attempt and stays READY.',
        trigger: { schedule: {} },
        overrides: { systems: { calls: down } },
        expect: { notSent: ['PDH.OUTBOUND.NOTIFY'], db: { pdh_outbound_messages: { has: [{ message_id: 'OUT-70001', status: 'READY', attempts: 1 }] } } },
      },
      {
        name: 'The JMS broker is down',
        about: 'The blobs are uploaded but cannot be announced. The rows stay READY, so the next run uploads them again under the same name and announces them.',
        trigger: { schedule: {} },
        overrides: { systems: { queues: { 'PDH.OUTBOUND.NOTIFY': { fault: true } } } },
        expect: { db: { pdh_outbound_messages: { has: [{ message_id: 'OUT-70002', status: 'READY', attempts: 1 }], lacks: [{ message_id: 'OUT-70002', status: 'SENT' }] } } },
      },
      {
        name: 'The fifth failure',
        about: 'OUT-70001 has failed four times. It fails again, and is marked FAILED so it stops using every run.',
        trigger: { schedule: {} },
        overrides: { systems: { calls: down, db: { tables: { pdh_outbound_messages: { key: 'message_id', rows: [row('OUT-70001', 'STORE-GRP-NORTH', 'READY', 4)] } } } } },
        expect: { db: { pdh_outbound_messages: { has: [{ message_id: 'OUT-70001', status: 'FAILED', attempts: 5 }] } } },
      },
    ],
  },
  referenceFlow: design(
    flow('pdh-send-outbound', source('scheduler', { strategy: 'fixed-frequency', frequency: 1, timeUnit: 'MINUTES' }), [
      step('db-select', {
        database: 'Oracle',
        sql: "SELECT message_id, message_type, recipient_id, body, attempts FROM pdh_outbound_messages WHERE status = 'READY' ORDER BY message_id FETCH FIRST 50 ROWS ONLY",
      }),
      scope('foreach', { collection: '#[payload]' }, [
        step('set-variable', { variableName: 'row', value: '#[payload]' }),
        step('set-variable', { variableName: 'blobName', value: '#["outbound/" ++ vars.row.RECIPIENT_ID ++ "/" ++ vars.row.MESSAGE_ID ++ ".json"]' }),
        scope(
          'try',
          {},
          [
            step('set-payload', { value: '#[vars.row.BODY]' }),
            step('azure-upload-blob', { container: 'pdh-outbound', fileName: '#[vars.blobName]', fileStream: '#[payload]', contentType: 'application/json' }),
            step('set-payload', { value: '#[output application/json --- { messageId: vars.row.MESSAGE_ID, messageType: vars.row.MESSAGE_TYPE, recipientId: vars.row.RECIPIENT_ID, blobName: vars.blobName }]' }),
            step('jms-publish', { destination: 'PDH.OUTBOUND.NOTIFY', destinationType: 'QUEUE', persistentDelivery: 'true' }),
            step('db-update', {
              database: 'Oracle',
              sql: "UPDATE pdh_outbound_messages SET status = 'SENT', blob_name = :blobName WHERE message_id = :messageId AND status = 'READY'",
              inputParameters: '#[{ blobName: vars.blobName, messageId: vars.row.MESSAGE_ID }]',
            }),
          ],
          {
            errorHandlers: [
              handler('on-error-continue', { type: 'ANY' }, [
                step('logger', { level: 'WARN', message: '#["Outbound " ++ vars.row.MESSAGE_ID ++ " attempt " ++ ((vars.row.ATTEMPTS + 1) as String) ++ " failed: " ++ error.description]' }),
                step('db-update', {
                  database: 'Oracle',
                  sql: "UPDATE pdh_outbound_messages SET attempts = attempts + 1, status = CASE WHEN attempts + 1 >= 5 THEN 'FAILED' ELSE 'READY' END WHERE message_id = :messageId",
                  inputParameters: '#[{ messageId: vars.row.MESSAGE_ID }]',
                }),
              ]),
            ],
          },
        ),
      ]),
    ]),
  ),
  description: `
Copperline Home Supply’s product data hub (fictional) generates outbound messages in Oracle (Item updates for store groups, orders for suppliers). Each one lands in the table \`pdh_outbound_messages\` (\`message_id\`, \`message_type\`, \`recipient_id\`, \`body\`, \`status\`, \`attempts\`, \`blob_name\`) with status \`READY\`. \`body\` is the JSON document.

Recipients take them the same way the hub takes inbound documents, by claim check: the document goes to the Azure Blob Storage container \`pdh-outbound\`, and a small notification goes to the JMS queue \`PDH.OUTBOUND.NOTIFY\`:

\`{ "messageId", "messageType", "recipientId", "blobName" }\`

**Requirements**
- Every minute, take up to 50 \`READY\` messages, oldest first.
- Upload each body to \`pdh-outbound\` as \`outbound/{recipientId}/{messageId}.json\`.
- Announce it on \`PDH.OUTBOUND.NOTIFY\`. A notification must never point at a blob that is not there.
- Then set \`status\` to \`SENT\` and save the blob name. If a support user cancelled the message meanwhile (status no longer READY), do not overwrite that.
- A failure on one message must not stop the others. Count it in \`attempts\`. On the **fifth** failure set \`status\` to \`FAILED\`.

**Facts**
- Message IDs grow over time, so oldest first means ordered by \`message_id\`.
- Write the statuses as literals in the SQL: the Select reads \`status = 'READY'\`, and the final update sets \`'SENT'\` with the guard \`AND status = 'READY'\`.
- Count a failure and set \`'FAILED'\` in one update of \`attempts\`. A message below five failures stays \`READY\`.
- The notification's fields come from the row: \`MESSAGE_ID\`, \`MESSAGE_TYPE\`, \`RECIPIENT_ID\` and the blob name.

**What each system sends back**
- The Database Select answers a list of rows. Oracle returns unquoted column names in upper case:
\`\`\`json
[ { "MESSAGE_ID": "OUT-70001", "MESSAGE_TYPE": "Item", "RECIPIENT_ID": "STORE-GRP-NORTH", "BODY": "{\\"messageId\\":\\"OUT-70001\\",\\"items\\":[...]}", "ATTEMPTS": 0 } ]
\`\`\`
\`BODY\` is the JSON document as text. Upload it as it is.

**What failures look like**
- Blob storage is down: Upload Blob raises **AZURE-STORAGE:CONNECTIVITY**.
- The broker is down: JMS Publish raises a JMS error (for example **JMS:CONNECTIVITY**).
- Catch either one per message (an On Error Continue for any error inside the For Each), count the attempt, and go on with the next message.

**Design the flow.**
`,
  answerTemplate: `## Picking up the work

## Upload, announce, mark

## Repeats and recipients

## Failures and giving up
`,
  keyPoints: [
    'The order is the whole design: upload, then announce, then mark SENT. Each step only runs once the one before has worked.',
    'If Mule stops after the announce and before the mark, the next run sends the message again. Recipients must ignore a repeat messageId: at least once delivery is the honest promise.',
    'The blob name is built from the recipient and message ID, so a retry writes the same blob again instead of leaving copies.',
    'WHERE status = READY on the final update means a message cancelled by support during the run stays cancelled.',
    'Counting attempts in the row turns endless retries into a clear FAILED state that support can see and act on.',
    'Taking 50 at a time keeps each run short, so one minute\'s run does not overlap the next.',
  ],
  solution: `
1. **Scheduler** every minute.
2. **Database Select**: \`... WHERE status = 'READY' ORDER BY message_id FETCH FIRST 50 ROWS ONLY\`.
3. **For Each** row: \`row\` and \`blobName\` = \`outbound/{RECIPIENT_ID}/{MESSAGE_ID}.json\`, then a **Try**:
   - **Set Payload** the body, **Upload Blob** to \`pdh-outbound\`, content type \`application/json\`.
   - **Set Payload** the notification, **JMS Publish** to \`PDH.OUTBOUND.NOTIFY\`.
   - **Database Update** \`SET status = 'SENT', blob_name = :blobName WHERE message_id = :messageId AND status = 'READY'\`.
   - **On Error Continue** (ANY): WARN, then \`SET attempts = attempts + 1, status = CASE WHEN attempts + 1 >= 5 THEN 'FAILED' ELSE 'READY' END\`.

**Two workers.** The Scheduler runs on the primary node of a cluster. If the job ever runs in two places, claim the rows first (set them to SENDING with a run ID) so each message is taken once.

**A failed message.** Alert when a row becomes FAILED. Support fixes the cause, resets \`attempts\` and \`status\`, and the next run sends it.
`,
  followUps: [
    {
      q: 'Why not publish the body itself on JMS, since Oracle already has it?',
      a: 'Some bodies are megabytes. Recipients agreed to the claim check for inbound and outbound alike, so brokers only carry small messages and documents stay readable in storage for support.',
    },
    {
      q: 'Why does the failure handler not move the blob somewhere?',
      a: 'A failed upload has no blob. A failed publish leaves one, but the retry writes the same name again, so nothing is left behind when it finally works.',
    },
  ],
}
