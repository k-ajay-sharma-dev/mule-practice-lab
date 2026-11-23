import { design, flow, handler, route, router, source, step } from '../../flow/dsl.js'

const note = (messageId, extra = {}) => ({
  message: {
    kind: 'jms',
    destination: 'PDH.INBOUND.NOTIFY',
    payload: { messageId, messageType: 'SupplierItem', senderId: 'RIDGEWAY-TOOLS', blobName: `inbound/RIDGEWAY-TOOLS/${messageId}.json`, sentAt: '2026-11-13T08:15:00Z', ...extra },
  },
})
const seen = { message_id: 'MSG-90001', message_type: 'Item', blob_name: 'inbound/HALDEN-PAINTS/MSG-90001.json', sender_id: 'HALDEN-PAINTS', status: 'RECEIVED' }

export default {
  id: 'fl-154',
  category: 'flows',
  title: 'Product Data Hub Intake: Validate the JMS Notification, Refuse a Repeat, and Send a RECEIVED or REJECTED ACK',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'queues', 'jms', 'claim-check', 'json-schema', 'idempotency', 'oracle', 'gs1'],
  estMinutes: 30,
  flowChecks: [
    { label: 'Notifications are read from PDH.INBOUND.NOTIFY', rule: { type: 'source', component: 'jms-listener', where: { destination: 'PDH.INBOUND.NOTIFY' } } },
    { label: 'The notification is checked against its JSON schema first', rule: { type: 'before', first: 'validation', firstWhere: { check: 'json-schema' }, then: 'db-select' } },
    {
      label: 'The message ID is looked up in pdh_inbound_messages before anything is written',
      rule: { type: 'before', first: 'db-select', firstWhere: { sql: { all: ['pdh_inbound_messages', ':messageId'] } }, then: 'db-insert' },
    },
    {
      label: 'A repeat raises an error that a handler turns into a REJECTED ACK on PDH.ACK',
      rule: {
        type: 'linked',
        as: 'errorType',
        from: { component: 'raise-error', key: 'type' },
        to: { component: 'on-error-continue', key: 'type', holding: { component: 'jms-publish', where: { destination: 'PDH.ACK' } } },
      },
    },
    { label: 'An invalid notification is also answered with a REJECTED ACK', rule: { type: 'handler', component: 'on-error-continue', errorType: 'JSON:SCHEMA_NOT_HONOURED' } },
    {
      label: 'The RECEIVED ACK goes out on the main path, after the insert',
      rule: { type: 'before', first: 'db-insert', then: 'jms-publish', thenWhere: { destination: 'PDH.ACK' }, outside: true },
    },
  ],
  simulation: {
    systems: {
      db: { tables: { pdh_inbound_messages: { key: 'message_id', rows: [seen] } } },
      schemas: {
        'pdh-notification.json': {
          type: 'object',
          required: ['messageId', 'messageType', 'senderId', 'blobName'],
          properties: { messageId: { type: 'string', minLength: 1 }, messageType: { type: 'string' }, senderId: { type: 'string' }, blobName: { type: 'string', minLength: 1 } },
        },
      },
    },
    tests: [
      {
        name: 'A new SupplierItem notification',
        about: 'The notification is valid and new. It is recorded, a RECEIVED ACK goes back to the sender, and the notification is handed to PDH.INBOUND.WORK.',
        trigger: note('MSG-90412'),
        expect: {
          ack: 'acked',
          db: { pdh_inbound_messages: { count: 2, has: [{ message_id: 'MSG-90412', status: 'RECEIVED' }] } },
          sent: [
            { destination: 'PDH.ACK', count: 1, has: { messageId: 'MSG-90412', status: 'RECEIVED' } },
            { destination: 'PDH.INBOUND.WORK', count: 1, has: { messageId: 'MSG-90412', blobName: 'inbound/RIDGEWAY-TOOLS/MSG-90412.json' } },
          ],
        },
      },
      {
        name: 'The same message ID again',
        about: 'The sender resends MSG-90001 after a timeout on its side. It is refused with a REJECTED ACK, and nothing is handed on.',
        trigger: note('MSG-90001'),
        expect: { ack: 'acked', sent: [{ destination: 'PDH.ACK', count: 1, has: { messageId: 'MSG-90001', status: 'REJECTED' } }], notSent: ['PDH.INBOUND.WORK'], db: { pdh_inbound_messages: { count: 1 } } },
      },
      {
        name: 'A notification with no blob name',
        about: 'The sender forgot the blob name. The schema check fails, a REJECTED ACK goes back, and nothing is recorded.',
        trigger: note('MSG-90413', { blobName: undefined }),
        expect: { ack: 'acked', sent: [{ destination: 'PDH.ACK', count: 1, has: { status: 'REJECTED' } }], notSent: ['PDH.INBOUND.WORK'], db: { pdh_inbound_messages: { count: 1 } } },
      },
      {
        name: 'Oracle is down',
        about: 'The duplicate check cannot run. No ACK is sent, and the notification goes back to the queue to be tried again.',
        trigger: note('MSG-90414'),
        overrides: { systems: { db: { fault: 'CONNECTIVITY' } } },
        expect: { ack: 'returned', notSent: ['PDH.ACK', 'PDH.INBOUND.WORK'] },
      },
    ],
  },
  referenceFlow: design(
    flow(
      'pdh-inbound-intake',
      source('jms-listener', { destination: 'PDH.INBOUND.NOTIFY', ackMode: 'AUTO' }),
      [
        step('set-variable', { variableName: 'notification', value: '#[payload]' }),
        step('validation', { check: 'json-schema', expression: 'schemas/pdh-notification.json' }),
        step('db-select', {
          database: 'Oracle',
          sql: 'SELECT message_id FROM pdh_inbound_messages WHERE message_id = :messageId',
          inputParameters: '#[{ messageId: vars.notification.messageId }]',
          target: 'seen',
        }),
        router('choice', {}, [route({ expression: '#[not isEmpty(vars.seen)]' }, [step('raise-error', { type: 'PDH:DUPLICATE_MESSAGE', description: '#["Message " ++ vars.notification.messageId ++ " was received before"]' })])], { otherwise: [] }),
        step('db-insert', {
          database: 'Oracle',
          sql: "INSERT INTO pdh_inbound_messages (message_id, message_type, blob_name, sender_id, status) VALUES (:messageId, :messageType, :blobName, :senderId, 'RECEIVED')",
          inputParameters: '#[{ messageId: vars.notification.messageId, messageType: vars.notification.messageType, blobName: vars.notification.blobName, senderId: vars.notification.senderId }]',
        }),
        step('set-payload', { value: '#[output application/json --- { messageId: vars.notification.messageId, senderId: vars.notification.senderId, status: "RECEIVED" }]' }),
        step('jms-publish', { destination: 'PDH.ACK', destinationType: 'QUEUE', persistentDelivery: 'true' }),
        step('set-payload', { value: '#[output application/json --- vars.notification]' }),
        step('jms-publish', { destination: 'PDH.INBOUND.WORK', destinationType: 'QUEUE', persistentDelivery: 'true' }),
      ],
      [
        handler('on-error-continue', { type: 'PDH:DUPLICATE_MESSAGE, JSON:SCHEMA_NOT_HONOURED' }, [
          step('logger', { level: 'WARN', message: '#["Notification rejected: " ++ error.description]' }),
          step('set-payload', { value: '#[output application/json --- { messageId: vars.notification.messageId default null, senderId: vars.notification.senderId default null, status: "REJECTED", reason: error.description }]' }),
          step('jms-publish', { destination: 'PDH.ACK', destinationType: 'QUEUE', persistentDelivery: 'true' }),
        ]),
      ],
    ),
  ),
  description: `
Copperline Home Supply, a fictional home improvement retailer, runs a **product data hub**. Suppliers and internal systems exchange GS1 style messages with it: Item, SupplierItem, ReceivingAdvice, InventoryTransaction and others.

The documents can be large, so a sender does not put them on the queue. It uploads the JSON document to Azure Blob Storage and sends a small **notification** to the JMS queue \`PDH.INBOUND.NOTIFY\`. This is the claim check pattern:

\`{ "messageId": "MSG-90412", "messageType": "SupplierItem", "senderId": "RIDGEWAY-TOOLS", "blobName": "inbound/RIDGEWAY-TOOLS/MSG-90412.json", "sentAt": "..." }\`

You build the first flow of the hub: the intake. Downloading and processing the document happen in later flows that read \`PDH.INBOUND.WORK\`.

**Requirements**
- Check each notification against \`schemas/pdh-notification.json\`.
- Refuse a message ID that is already in the Oracle table \`pdh_inbound_messages\` (\`message_id\`, \`message_type\`, \`blob_name\`, \`sender_id\`, \`status\`). Senders do resend after a timeout on their side.
- Record a new notification with status \`RECEIVED\`, send the ACK \`{ messageId, senderId, status: "RECEIVED" }\` to \`PDH.ACK\`, and pass the notification on to \`PDH.INBOUND.WORK\`.
- A repeat or an invalid notification raises an error. Answer it with \`{ messageId, senderId, status: "REJECTED", reason }\` on \`PDH.ACK\`, and do not redeliver it.
- If Oracle is down, send nothing and let the broker deliver the notification again.

**Facts**
- In the duplicate check SQL, name the message ID parameter \`:messageId\`.
- A notification that fails the schema check raises **JSON:SCHEMA_NOT_HONOURED**.
- \`PDH.INBOUND.WORK\` gets the notification as it arrived.
- Oracle being down raises **DB:CONNECTIVITY**. Leave it unhandled: with AUTO acknowledgement, a flow that ends in error does not ack the message, so the broker delivers it again.

**What each system sends back**
- The JMS listener gives the notification JSON above as the payload.
- The duplicate check (Database Select) answers a list of rows with the column names as written: \`[ { "message_id": "MSG-90001" } ]\` for a repeat, or \`[]\` for a new ID.

**Design the flow.**
`,
  answerTemplate: `## Checking the notification

## Refusing a repeat

## The RECEIVED ACK and the hand-off

## Errors: rejected or retried
`,
  keyPoints: [
    'The queue carries a small notification, the blob carries the document. The intake can answer fast without downloading anything.',
    'Validate the notification first, so a bad one never reaches the database.',
    'The duplicate check reads the message ID table before the insert. A primary key on message_id is the safety net if two copies arrive at once.',
    'Raise your own error type for a repeat. One On Error Continue then answers both a repeat and an invalid notification with a REJECTED ACK.',
    'On Error Continue ends the flow well, so the JMS message is acknowledged. That is right for a message that can never succeed.',
    'Errors the handler does not name, such as DB:CONNECTIVITY, fail the flow, and the broker delivers the notification again.',
    'The notification is kept in a variable at the start, because the Select and the ACK replace the payload.',
  ],
  solution: `
1. **JMS On New Message** on \`PDH.INBOUND.NOTIFY\`.
2. **Set Variable** \`notification\` = \`#[payload]\`.
3. **Validate schema** with \`schemas/pdh-notification.json\`.
4. **Database Select**, Target \`seen\`: \`SELECT message_id FROM pdh_inbound_messages WHERE message_id = :messageId\`.
5. **Choice**: \`#[not isEmpty(vars.seen)]\` raises \`PDH:DUPLICATE_MESSAGE\`.
6. **Database Insert** the row with status \`RECEIVED\`.
7. **Set Payload** the RECEIVED ACK, **JMS Publish** to \`PDH.ACK\`.
8. **Set Payload** \`vars.notification\`, **JMS Publish** to \`PDH.INBOUND.WORK\`.
9. Error handler **On Error Continue** for \`PDH:DUPLICATE_MESSAGE, JSON:SCHEMA_NOT_HONOURED\`: a WARN log, the REJECTED ACK with \`error.description\`, **JMS Publish** to \`PDH.ACK\`.

**Order of the two publishes.** The ACK and the hand-off are two sends. If the second fails, the notification comes back, and the duplicate check refuses it. Send both in one JMS transaction, or let a later check find RECEIVED rows that never reached processing.

**Checking the blob.** The real hub also checks that the blob exists before it sends RECEIVED. That is an Azure Blob Storage step, covered in another problem.
`,
  followUps: [
    {
      q: 'Why not send the whole document on the JMS queue?',
      a: 'Brokers are tuned for small messages. Big ones use broker memory and disk and slow everyone. Blob storage keeps the document, and the queue carries a reference to it.',
    },
    {
      q: 'Two copies of the same notification arrive at the same moment on two consumers. What stops a double insert?',
      a: 'Both Selects can find nothing. The primary key on message_id makes the second insert fail with a unique key error. Map that error to PDH:DUPLICATE_MESSAGE too, so the second copy gets a REJECTED ACK.',
    },
  ],
}
