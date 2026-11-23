import { design, flow, handler, source, step } from '../../flow/dsl.js'

const notice = { messageId: 'IT-5001', messageType: 'Item', blobName: 'items/IT-5001.json' }
const tables = { item_notice: { key: 'message_id', columns: ['message_id', 'message_type', 'blob_name', 'status'], rows: [] } }
const trigger = { message: { kind: 'jms', destination: 'pdh.items.notify', payload: notice } }

export default {
  id: 'fl-271',
  category: 'flows',
  title: 'Feed the Restart App: When a Notice Fails, Publish the Original Message and the Reason to the Failure Queue, and Let the Main Queue Move On',
  level: 'BEGINNER',
  tags: ['myproject', 'queues', 'jms', 'failure-queue', 'restart', 'oracle', 'error-handling'],
  estMinutes: 20,
  flowChecks: [
    { label: 'Notices arrive on the JMS queue pdh.items.notify', rule: { type: 'source', component: 'jms-listener', where: { destination: 'pdh.items.notify' } } },
    { label: 'The original notice is kept in a variable before it is changed', rule: { type: 'before', first: 'set-variable', firstWhere: { value: 'payload' }, then: 'transform' } },
    { label: 'A failed notice is published to pdh.items.failure from an On Error Continue', rule: { type: 'inside', component: 'jms-publish', within: 'on-error-continue', where: { destination: 'pdh.items.failure' } } },
  ],
  simulation: {
    systems: { db: { tables } },
    tests: [
      {
        name: 'A notice that loads',
        about: 'Oracle takes the row. Nothing goes to the failure queue and the notice is acknowledged.',
        trigger,
        expect: { noError: true, db: { item_notice: { count: 1, has: [{ message_id: 'IT-5001', status: 'NEW' }] } }, notSent: ['pdh.items.failure'], ack: 'acked' },
      },
      {
        name: 'Oracle is down',
        about: 'The insert fails. The failure queue gets the notice as it arrived, with the error type and reason, and the main queue moves on.',
        trigger,
        overrides: { systems: { db: { failWhen: [{ match: 'INSERT INTO item_notice', fault: 'CONNECTIVITY' }] } } },
        expect: {
          sent: [{ destination: 'pdh.items.failure', count: 1, has: { message: { messageId: 'IT-5001', blobName: 'items/IT-5001.json' }, errorType: 'DB:CONNECTIVITY' } }],
          ack: 'acked',
        },
      },
      {
        name: 'The failure queue is down too',
        about: 'Oracle and the failure queue both fail. The notice must not be lost, so it goes back to pdh.items.notify for redelivery.',
        trigger,
        overrides: { systems: { db: { failWhen: [{ match: 'INSERT INTO item_notice', fault: 'CONNECTIVITY' }] }, queues: { 'pdh.items.failure': { fault: true } } } },
        expect: { ack: 'returned' },
      },
    ],
  },
  referenceFlow: design(
    flow(
      'item-notice-in',
      source('jms-listener', { destination: 'pdh.items.notify', ackMode: 'AUTO', numberOfConsumers: 2 }),
      [
        step('set-variable', { variableName: 'original', value: '#[payload]' }),
        step('transform', { script: '%dw 2.0\noutput application/java\n---\n{ message_id: payload.messageId, message_type: payload.messageType, blob_name: payload.blobName, status: "NEW" }' }),
        step('db-insert', { database: 'Oracle', sql: 'INSERT INTO item_notice (message_id, message_type, blob_name, status) VALUES (:message_id, :message_type, :blob_name, :status)' }),
        step('logger', { level: 'INFO', message: '#["Notice " ++ vars.original.messageId ++ " stored"]' }),
      ],
      [
        handler('on-error-continue', { type: 'ANY' }, [
          step('logger', { level: 'ERROR', message: '#["Notice " ++ (vars.original.messageId default "?") ++ " failed: " ++ error.description]' }),
          step('set-payload', { value: '#[output application/json --- { message: vars.original, errorType: error.errorType.asString, reason: error.description, failedAt: now() }]' }),
          step('jms-publish', { destination: 'pdh.items.failure', destinationType: 'QUEUE', persistentDelivery: 'true' }),
        ]),
      ],
    ),
  ),
  description: `
Larkfield Grocers, a fictional grocery chain, runs a product data hub. Suppliers send item notices on the **JMS** queue \`pdh.items.notify\`:

\`\`\`json
{ "messageId": "IT-5001", "messageType": "Item", "blobName": "items/IT-5001.json" }
\`\`\`

The adapter turns each notice into a row of the Oracle table \`item_notice\` (\`message_id\`, \`message_type\`, \`blob_name\`, \`status\` = \`NEW\`).

A separate **restart app** already exists. Support runs it after an outage: it reads \`pdh.items.failure\` and republishes each \`message\` it finds there to \`pdh.items.notify\`. It expects this shape:

\`\`\`json
{ "message": { "messageId": "IT-5001", "messageType": "Item", "blobName": "items/IT-5001.json" }, "errorType": "DB:CONNECTIVITY", "reason": "...", "failedAt": "..." }
\`\`\`

Today a failed notice goes back to the broker and is redelivered again and again while Oracle is down. The queue fills up and new notices wait behind old ones.

**Requirements**
- Store each notice in \`item_notice\`.
- When anything fails, publish the notice **exactly as it arrived**, with the error type and reason, to \`pdh.items.failure\`, then let the main queue move on.
- If even the failure queue cannot be reached, the notice must not be lost.

**Facts**
- The listener uses ack mode \`AUTO\`.
- Keep the notice in a variable before you transform it.
- \`errorType\` is \`error.errorType.asString\` and \`reason\` is \`error.description\`.

**What failures look like**
- Oracle is down: the Database Insert raises \`DB:CONNECTIVITY\`. The failure queue gets the notice with \`errorType\` \`DB:CONNECTIVITY\`, and the notice on \`pdh.items.notify\` is acknowledged.
- The failure queue is down too: the JMS Publish in the handler fails, so the flow ends with an error. The listener does not acknowledge, and the notice goes back to \`pdh.items.notify\` for redelivery.

**Design the flow.**
`,
  answerTemplate: `## Storing the notice

## Keeping the original

## The failure queue
`,
  keyPoints: [
    'The restart app replays what is on the failure queue, so the failure message must hold the notice as it arrived, not the row you built from it.',
    'Keep the original in a variable before any step changes the payload. In the handler the payload is whatever the failing step had.',
    'On Error Continue ends the flow as a success, so the broker removes the notice. It is safe because a copy is now on the failure queue.',
    'If the publish in the handler fails, the handler itself fails and the flow ends with an error. The notice goes back for redelivery and nothing is lost.',
    'error.errorType.asString gives the type as text, such as DB:CONNECTIVITY. Support can sort failures by it before a replay.',
  ],
  solution: `
1. **JMS On New Message** on \`pdh.items.notify\`.
2. **Set Variable** \`original\` = \`#[payload]\`.
3. **Transform** to the row, **Database Insert** into \`item_notice\`.
4. **On Error Continue** (ANY):
   - **Logger** ERROR.
   - **Set Payload** \`{ message: vars.original, errorType: error.errorType.asString, reason: error.description, failedAt: now() }\`.
   - **JMS Publish** to \`pdh.items.failure\`, persistent.

**Which errors.** Here every error goes to the failure queue. A notice that can never load, such as one with a bad message type, could go to a separate reject queue, so a replay does not send it round again.
`,
  followUps: [
    {
      q: 'Why not use On Error Propagate and let the broker redeliver?',
      a: 'During a long outage every redelivery fails again and the queue backs up. With a redelivery limit the broker would park the notice on a dead letter queue without the reason. The failure queue holds the reason and is what the restart app reads.',
    },
    {
      q: 'The same notice is in the failure queue and is replayed after it was loaded by hand. What protects the hub?',
      a: 'message_id is the key of item_notice, so the second insert fails. Better, the adapter checks the message ID first and answers DUPLICATE, as the intake flow does.',
    },
  ],
}
