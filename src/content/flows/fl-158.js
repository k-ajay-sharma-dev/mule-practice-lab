import { design, flow, handler, scope, source, step } from '../../flow/dsl.js'

const restart = { http: { method: 'POST', path: '/pdh/restart' } }
const failed = (n) => ({ payload: { messageId: `MSG-9100${n}`, messageType: 'ReceivingAdvice', senderId: 'NORTHDALE-DC', blobName: `inbound/NORTHDALE-DC/MSG-9100${n}.json` } })
const empty = { fault: { type: 'JMS:TIMEOUT', description: 'No message was received within the maximum wait' } }

export default {
  id: 'fl-158',
  category: 'flows',
  title: 'Product Data Hub Restart App: Check Oracle and Blob Storage, Then Move Failed Messages Back to the Main Queue',
  level: 'ADVANCED',
  tags: ['myproject', 'queues', 'jms', 'replay', 'health-check', 'azure-blob', 'oracle', 'operations', 'gs1'],
  estMinutes: 40,
  flowChecks: [
    { label: 'Support starts a restart with POST /pdh/restart', rule: { type: 'source', component: 'http-listener', where: { path: '/pdh/restart', allowedMethods: 'POST' } } },
    {
      label: 'Oracle and blob storage are both checked before any message is taken',
      rule: {
        type: 'all',
        rules: [
          { type: 'before', first: 'db-select', then: 'jms-consume' },
          { type: 'before', first: 'azure-list-blobs', then: 'jms-consume' },
        ],
      },
    },
    { label: 'Failed messages are taken from PDH.INBOUND.FAILED inside a loop', rule: { type: 'inside', component: 'jms-consume', within: 'foreach', where: { destination: 'PDH.INBOUND.FAILED' } } },
    { label: 'Each one is published back to PDH.INBOUND.NOTIFY in the same loop', rule: { type: 'inside', component: 'jms-publish', within: 'foreach', where: { destination: 'PDH.INBOUND.NOTIFY' } } },
    {
      label: 'An empty failure queue ends the loop without failing the restart',
      rule: { type: 'handler', component: 'on-error-continue', errorType: 'JMS:TIMEOUT', within: 'try' },
    },
    { label: 'A failed health check answers 503', rule: { type: 'inside', component: 'set-variable', within: ['on-error-propagate', 'on-error-continue'], where: { variableName: 'httpStatus', value: '503' } } },
  ],
  simulation: {
    systems: {
      db: { tables: { pdh_inbound_messages: { rows: [] } } },
      calls: {
        'azure-list-blobs': { payload: [{ name: 'health/ping.txt' }] },
        'jms-consume': [failed(1), failed(2), failed(3), empty],
      },
    },
    tests: [
      {
        name: 'Three failed messages',
        about: 'Oracle and blob storage answer. The three messages on the failure queue go back to the main queue, and the answer says 3 were moved.',
        trigger: restart,
        expect: {
          status: 200,
          bodyHas: { status: 'DONE', moved: 3 },
          sent: [{ destination: 'PDH.INBOUND.NOTIFY', count: 3 }, { destination: 'PDH.INBOUND.NOTIFY', count: 1, has: { messageId: 'MSG-91002' } }],
        },
      },
      {
        name: 'Nothing has failed',
        about: 'The failure queue is empty. The restart ends at once with 0 moved.',
        trigger: restart,
        overrides: { systems: { calls: { 'jms-consume': [empty] } } },
        expect: { status: 200, bodyHas: { moved: 0 }, notSent: ['PDH.INBOUND.NOTIFY'] },
      },
      {
        name: 'Oracle is still down',
        about: 'The database check fails. Not one message is taken from the failure queue, because it would only fail again, and the answer is 503.',
        trigger: restart,
        overrides: { systems: { db: { fault: 'CONNECTIVITY' } } },
        expect: { status: 503, notSent: ['PDH.INBOUND.NOTIFY'], connector: [{ type: 'jms-consume', count: 0 }] },
      },
      {
        name: 'Blob storage is down',
        about: 'The documents cannot be read, so the messages stay where they are and the answer is 503.',
        trigger: restart,
        overrides: { systems: { calls: { 'azure-list-blobs': { fault: { type: 'AZURE-STORAGE:CONNECTIVITY', description: 'Unable to reach the storage account' } } } } },
        expect: { status: 503, notSent: ['PDH.INBOUND.NOTIFY'], connector: [{ type: 'jms-consume', count: 0 }] },
      },
    ],
  },
  referenceFlow: design(
    flow(
      'pdh-restart-failed',
      source('http-listener', { path: '/pdh/restart', allowedMethods: 'POST' }),
      [
        step('db-select', { database: 'Oracle', sql: 'SELECT COUNT(*) AS n FROM pdh_inbound_messages WHERE 1 = 0', target: 'dbCheck' }),
        step('azure-list-blobs', { containerName: 'pdh-inbound', blobPath: 'health/' }),
        step('set-variable', { variableName: 'moved', value: '#[0]' }),
        scope(
          'try',
          {},
          [
            scope('foreach', { collection: '#[1 to 500]' }, [
              step('jms-consume', { destination: 'PDH.INBOUND.FAILED', ackMode: 'IMMEDIATE', maximumWait: 2000 }),
              step('jms-publish', { destination: 'PDH.INBOUND.NOTIFY', destinationType: 'QUEUE', persistentDelivery: 'true' }),
              step('set-variable', { variableName: 'moved', value: '#[vars.moved + 1]' }),
            ]),
          ],
          {
            errorHandlers: [handler('on-error-continue', { type: 'JMS:TIMEOUT' }, [step('logger', { level: 'INFO', message: '#["Failure queue is empty after " ++ (vars.moved as String) ++ " messages"]' })])],
          },
        ),
        step('set-payload', { value: '#[output application/json --- { status: "DONE", moved: vars.moved }]' }),
      ],
      [
        handler('on-error-propagate', { type: 'ANY' }, [
          step('logger', { level: 'ERROR', message: '#["Restart not started: " ++ error.description]' }),
          step('set-variable', { variableName: 'httpStatus', value: '503' }),
          step('set-payload', { value: '#[output application/json --- { status: "NOT_STARTED", reason: error.description }]' }),
        ]),
      ],
    ),
  ),
  description: `
Copperline Home Supply’s product data hub (fictional) moves a notification to the JMS queue \`PDH.INBOUND.FAILED\` when processing fails for a reason outside the message, such as Oracle or blob storage being down. Once the cause is fixed, support must put those messages back on the main queue \`PDH.INBOUND.NOTIFY\`.

Today a support engineer does this by hand in the broker console. You build a small **restart app** they call with \`POST /pdh/restart\`.

**Requirements**
- Before moving anything, check that the Oracle database answers and that blob storage answers (list the \`health/\` folder of the container \`pdh-inbound\`). A message moved while either is down only fails again.
- If a check fails, move nothing and answer **503** with \`{ "status": "NOT_STARTED", "reason" }\`.
- Otherwise take the messages from \`PDH.INBOUND.FAILED\` one at a time and publish each to \`PDH.INBOUND.NOTIFY\`, until the failure queue is empty. Move at most 500 per call.
- Answer \`{ "status": "DONE", "moved": n }\`.

**Facts**
- JMS Consume waits up to its maximum wait for a message and raises \`JMS:TIMEOUT\` when none comes. An empty queue is a success, not a failure.
- Check Oracle with a Database Select that returns no rows. If Oracle is down it raises **DB:CONNECTIVITY**. Blob storage that is down raises **AZURE-STORAGE:CONNECTIVITY**.
- Publish each message unchanged.

**What each system sends back**
- Listing \`health/\` in \`pdh-inbound\` answers a list of blobs, for example \`[ { "name": "health/ping.txt" } ]\`. The flow only needs the call to succeed.
- Each JMS Consume gives one message as the payload, the notification as it was published:
\`\`\`json
{ "messageId": "MSG-91001", "messageType": "ReceivingAdvice", "senderId": "NORTHDALE-DC", "blobName": "inbound/NORTHDALE-DC/MSG-91001.json" }
\`\`\`

**How the status gets out:** assume the listener's response status is \`#[vars.httpStatus default 200]\` and its body is \`#[payload]\`, for a success and for an error.

**Design the flow.**
`,
  answerTemplate: `## Health checks

## Taking and republishing

## Stopping when the queue is empty

## The answer
`,
  keyPoints: [
    'Check every system the processing needs before replaying. Replaying into a system that is still down sends the messages straight back to the failure queue.',
    'A source such as a JMS listener runs for ever. A replay is an action someone starts, so JMS Consume in a loop fits better.',
    'A For Each over a fixed range with a Try around it is a bounded loop: JMS:TIMEOUT means the queue is empty, and On Error Continue ends the loop as a success.',
    'The cap of 500 stops one call from running for ever while new failures keep arriving.',
    'Publish the message unchanged, so the intake treats it like the first time. The intake\'s duplicate check must allow a replay of a message that never got past processing.',
    'Consume with IMMEDIATE acknowledgement removes the message before the publish. If the publish fails, that message is lost, so use MANUAL acknowledgement or a JMS transaction when that matters.',
  ],
  solution: `
1. **HTTP Listener** \`POST /pdh/restart\`.
2. **Database Select** with a query that touches the hub's tables and returns nothing, Target \`dbCheck\`. It fails if Oracle does not answer.
3. **Azure Blob Storage List Blobs** in \`pdh-inbound\`, folder \`health/\`.
4. **Set Variable** \`moved\` = \`0\`.
5. **Try**:
   - **For Each** over \`#[1 to 500]\`: **JMS Consume** from \`PDH.INBOUND.FAILED\` (maximum wait 2 seconds), **JMS Publish** to \`PDH.INBOUND.NOTIFY\`, \`moved\` + 1.
   - **On Error Continue** \`JMS:TIMEOUT\`: an INFO log. The queue is empty.
6. **Set Payload** \`{ status: "DONE", moved }\`.
7. Flow error handler **On Error Propagate** (ANY): an ERROR log, \`httpStatus\` = \`503\`, \`{ status: "NOT_STARTED", reason }\`.

**Not losing a message.** Consume and publish in one JMS transaction (a Try with a transactional action), so a failed publish puts the message back on the failure queue.

**Replays that never end.** Count replays per message ID in Oracle. A message that has been replayed three times goes to a manual review queue instead.
`,
  followUps: [
    {
      q: 'Why not run the restart on a Scheduler every 15 minutes?',
      a: 'It would replay into an outage over and over. The health checks help, but someone usually wants to know the cause was fixed first. A Scheduler is fine once the failures are known to clear by themselves.',
    },
    {
      q: 'How do you replay only one sender\'s messages?',
      a: 'JMS Consume takes a message selector. With a property such as senderId set on each failed message, the restart can take only that sender\'s.',
    },
  ],
}
