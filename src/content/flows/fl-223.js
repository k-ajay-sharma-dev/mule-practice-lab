import { design, flow, route, router, source, step } from '../../flow/dsl.js'

const note = (messageId, deliveryCount = 1) => ({
  message: { kind: 'jms', destination: 'ITEM.NOTIFY', deliveryCount, payload: { messageId, messageType: 'SupplierItem', blobName: `inbound/${messageId}.json` } },
})
const tables = (rows = []) => ({ inbound_messages: { key: 'message_id', columns: ['message_id', 'message_type', 'blob_name', 'status'], rows } })

export default {
  id: 'fl-223',
  category: 'flows',
  title: 'A Repeated JMS Notification: Look the Message ID Up in Oracle, Record It as RECEIVED, and Send the RECEIVED ACK Only Once',
  level: 'BEGINNER',
  tags: ['myproject', 'oracle', 'jms', 'idempotency', 'duplicate-check', 'ack', 'claim-check'],
  estMinutes: 20,
  flowChecks: [
    { label: 'Notifications are read from the JMS queue ITEM.NOTIFY', rule: { type: 'source', component: 'jms-listener', where: { destination: 'ITEM.NOTIFY' } } },
    { label: 'The message ID is looked up in inbound_messages before it is recorded', rule: { type: 'before', first: 'db-select', firstWhere: { sql: 'inbound_messages' }, then: 'db-insert', thenWhere: { sql: 'inbound_messages' } } },
    { label: 'The RECEIVED ACK goes to ITEM.ACK after the row is written', rule: { type: 'before', first: 'db-insert', then: 'jms-publish', thenWhere: { destination: 'ITEM.ACK' } } },
    { label: 'A repeat is logged as a WARN inside the Choice', rule: { type: 'inside', component: 'logger', within: 'choice', where: { level: 'WARN' } } },
  ],
  simulation: {
    systems: { db: { tables: tables() } },
    tests: [
      {
        name: 'A new notification',
        about: 'The message ID is not in Oracle yet. It is recorded as RECEIVED and one RECEIVED ACK goes out.',
        trigger: note('MSG-30411'),
        expect: {
          noError: true,
          ack: 'acked',
          db: { inbound_messages: { count: 1, has: [{ message_id: 'MSG-30411', status: 'RECEIVED' }] } },
          sent: [{ destination: 'ITEM.ACK', count: 1, has: { messageId: 'MSG-30411', status: 'RECEIVED' } }],
        },
      },
      {
        name: 'The same notification again',
        about: 'The sender resent MSG-30411 after a timeout on its side. Oracle already has it, so nothing is written and no second ACK goes out.',
        trigger: note('MSG-30411', 1),
        overrides: { systems: { db: { tables: tables([{ message_id: 'MSG-30411', message_type: 'SupplierItem', blob_name: 'inbound/MSG-30411.json', status: 'RECEIVED' }]) } } },
        expect: { ack: 'acked', db: { inbound_messages: { count: 1 } }, notSent: ['ITEM.ACK'], logs: [{ level: 'WARN', has: 'MSG-30411' }] },
      },
    ],
  },
  referenceFlow: design(
    flow('item-notification-intake', source('jms-listener', { destination: 'ITEM.NOTIFY', ackMode: 'AUTO' }), [
      step('set-variable', { variableName: 'note', value: '#[payload]' }),
      step('db-select', {
        database: 'Oracle',
        sql: 'SELECT message_id FROM inbound_messages WHERE message_id = :messageId',
        inputParameters: '#[{ messageId: vars.note.messageId }]',
        target: 'seen',
      }),
      router(
        'choice',
        {},
        [route({ expression: '#[not isEmpty(vars.seen)]' }, [step('logger', { level: 'WARN', message: '#["Notification " ++ vars.note.messageId ++ " was received before, ignored"]' })])],
        {
          otherwise: [
            step('db-insert', {
              database: 'Oracle',
              sql: "INSERT INTO inbound_messages (message_id, message_type, blob_name, status) VALUES (:messageId, :messageType, :blobName, 'RECEIVED')",
              inputParameters: '#[{ messageId: vars.note.messageId, messageType: vars.note.messageType, blobName: vars.note.blobName }]',
              target: 'recorded',
            }),
            step('set-payload', { value: '#[output application/json --- { messageId: vars.note.messageId, status: "RECEIVED" }]' }),
            step('jms-publish', { destination: 'ITEM.ACK', destinationType: 'QUEUE', persistentDelivery: 'true' }),
          ],
        },
      ),
    ]),
  ),
  description: `
Brindle Outdoor, a fictional outdoor gear retailer, gets supplier item updates from the planning platform. Each update arrives as a small JMS notification on the queue \`ITEM.NOTIFY\`. The document itself waits in blob storage, and the notification only points at it (a claim check):

\`\`\`json
{ "messageId": "MSG-30411", "messageType": "SupplierItem", "blobName": "inbound/MSG-30411.json" }
\`\`\`

The sender expects a **RECEIVED ACK** on \`ITEM.ACK\`: \`{ "messageId", "status": "RECEIVED" }\`. When it gets no ACK in time, it sends the same notification again, with the same message ID.

Every notification is recorded in the Oracle table \`inbound_messages\` (\`message_id\` primary key, \`message_type\`, \`blob_name\`, \`status\`).

**Requirements**
- Read notifications from \`ITEM.NOTIFY\`.
- If the message ID is already in \`inbound_messages\`, log a WARN with the ID and do nothing else.
- Otherwise record it with status \`RECEIVED\`, then publish the RECEIVED ACK.

**What each system sends back**
- The JMS listener gives the notification above as the payload.
- A select by \`message_id\` answers an empty list \`[]\` for a new ID, and a list with one row for an ID already recorded. Keep it in a target variable, so the payload stays the notification.

**Design the flow.**
`,
  answerTemplate: `## Reading the notification

## Spotting a repeat

## Recording it and the ACK
`,
  keyPoints: [
    'The message ID is the sender\'s promise that two notifications mean the same thing. Look it up before doing any work.',
    'Write the row before the ACK. An ACK that goes out for a message Oracle never recorded tells the sender a lie.',
    'A repeat is not an error. Log it and let the listener acknowledge the message, or it comes back for ever.',
    'The primary key on message_id is the real guard. Two copies read at the same moment both pass the select, but only one insert can succeed.',
    'Keep the notification small. The document stays in blob storage until the process flow needs it.',
  ],
  solution: `
1. **JMS On New Message** on \`ITEM.NOTIFY\`.
2. **Set Variable** \`note\` = the payload.
3. **Database Select** \`SELECT message_id FROM inbound_messages WHERE message_id = :messageId\`, Target \`seen\`.
4. **Choice**:
   - \`not isEmpty(vars.seen)\`: **Logger** WARN with the message ID.
   - Otherwise: **Database Insert** the row with status \`RECEIVED\`, **Set Payload** \`{ messageId, status: "RECEIVED" }\`, **JMS Publish** to \`ITEM.ACK\`.

**Two copies at once.** With several consumers, two copies can pass the select together. The second insert then fails with ORA-00001. Catch \`DB:QUERY_EXECUTION\` when the description holds ORA-00001 and treat it as a repeat.
`,
  followUps: [
    {
      q: 'Why not use the Idempotent Message Validator instead of Oracle?',
      a: 'It works for one app, but its object store is not shared with the restart app or with support queries. The Oracle row also carries the status that later steps update.',
    },
    {
      q: 'How long do you keep rows in inbound_messages?',
      a: 'Longer than the sender could ever resend, for example 90 days, then purge them in a nightly job. Agree the window with the sender.',
    },
  ],
}
