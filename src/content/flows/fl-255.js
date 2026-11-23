import { design, flow, handler, route, router, scope, source, step } from '../../flow/dsl.js'

const tables = {
  message_failures: {
    key: 'message_id',
    rows: [
      { message_id: 'ITM-30211', message_type: 'Item', body: '{"item":"SEED-TOM-CHERRY","status":"ACTIVE"}', status: 'FAILED' },
      { message_id: 'ITM-30212', message_type: 'Item', body: '{"item":"POT-30CM-TERRA","status":"ACTIVE"}', status: 'FAILED' },
      { message_id: 'BAR-11870', message_type: 'Barcode', body: '{"gtin":"05012345678900"}', status: 'FAILED' },
      { message_id: 'ITM-30100', message_type: 'Item', body: '{"item":"HOSE-25M-GRN"}', status: 'REPLAYED' },
    ],
  },
}
const replay = { trigger: { http: { method: 'POST', path: '/replay', query: { type: 'Item' } } } }

export default {
  id: 'fl-255',
  category: 'flows',
  title: 'A Restart Flow That Replays Failed Messages Through a Batch Job: Check the Database and the Blob Store First, Republish Each Message, and Mark the Ones That Fail Again',
  level: 'ADVANCED',
  tags: ['myproject', 'batch', 'restart', 'replay', 'jms', 'health-check', 'only-failures', 'sql-server'],
  estMinutes: 45,
  flowChecks: [
    {
      label: 'The database and the blob store are checked before any message is replayed',
      rule: {
        type: 'all',
        rules: [
          { type: 'before', first: 'db-select', firstWhere: { sql: 'SELECT 1' }, then: 'batch-job' },
          { type: 'before', first: 'azure-list-blobs', then: 'batch-job' },
        ],
      },
    },
    { label: 'Only FAILED messages of the requested type are read', rule: { type: 'exists', component: 'db-select', where: { sql: { all: ['message_failures', "status = 'FAILED'", 'message_type'] } } } },
    { label: 'A NO_FAILURES step republishes each message to items.inbound', rule: { type: 'inside', component: 'jms-publish', within: 'batch-job', routeWhere: { acceptPolicy: 'NO_FAILURES' }, where: { destination: 'items.inbound' } } },
    { label: 'An ONLY_FAILURES step marks a message REPLAY_FAILED', rule: { type: 'inside', component: 'db-update', within: 'batch-job', routeWhere: { acceptPolicy: 'ONLY_FAILURES' }, where: { sql: 'REPLAY_FAILED' } } },
  ],
  simulation: {
    systems: { db: { tables } },
    tests: [
      {
        name: 'A replay after the fix',
        about: 'The two failed Item messages are republished and marked REPLAYED. The Barcode message and the old replayed one are left alone. The caller gets 202.',
        ...replay,
        expect: {
          status: 202,
          sent: [
            { destination: 'items.inbound', count: 2 },
            { destination: 'items.inbound', has: { item: 'POT-30CM-TERRA' } },
          ],
          db: { message_failures: { has: [{ message_id: 'ITM-30211', status: 'REPLAYED' }, { message_id: 'ITM-30212', status: 'REPLAYED' }, { message_id: 'BAR-11870', status: 'FAILED' }] } },
        },
      },
      {
        name: 'The database is down',
        about: 'The health check fails, so nothing is replayed and the caller gets 503. Replaying into a dead database would only fail every message again.',
        ...replay,
        overrides: { systems: { db: { fault: true } } },
        expect: { status: 503, notSent: ['items.inbound'] },
      },
      {
        name: 'The blob store is down',
        about: 'The adapter downloads each message\'s body from the blob store, so a replay now would fail. The caller gets 503 and nothing is sent.',
        ...replay,
        overrides: { systems: { calls: { 'azure-list-blobs': { fault: { type: 'AZURE-STORAGE:CONNECTIVITY', description: 'The storage account does not answer.' } } } } },
        expect: { status: 503, notSent: ['items.inbound'], db: { message_failures: { has: [{ message_id: 'ITM-30211', status: 'FAILED' }] } } },
      },
      {
        name: 'The broker refuses the messages',
        about: 'The queue is full and every publish fails. Each message is marked REPLAY_FAILED, so support can see the replay did not happen.',
        ...replay,
        overrides: { systems: { queues: { 'items.inbound': { fault: true } } } },
        expect: { db: { message_failures: { has: [{ message_id: 'ITM-30211', status: 'REPLAY_FAILED' }, { message_id: 'ITM-30212', status: 'REPLAY_FAILED' }, { message_id: 'BAR-11870', status: 'FAILED' }] } } },
      },
    ],
  },
  referenceFlow: design(
    flow(
      'replay-failed-messages',
      source('http-listener', { path: '/replay', allowedMethods: 'POST' }),
      [
        step('set-variable', { variableName: 'messageType', value: '#[attributes.queryParams.type]' }),
        scope('try', {}, [step('db-select', { database: 'SQL Server', sql: 'SELECT 1 AS ok', target: 'dbOk' }), step('azure-list-blobs', { containerName: 'inbound', blobPath: 'health/' })], {
          errorHandlers: [
            handler('on-error-propagate', { type: 'ANY' }, [
              step('set-variable', { variableName: 'httpStatus', value: '503' }),
              step('set-payload', { value: '#[output application/json --- { status: "UNHEALTHY", reason: error.description }]' }),
            ]),
          ],
        }),
        step('db-select', {
          database: 'SQL Server',
          sql: "SELECT message_id, message_type, body FROM dbo.message_failures WHERE status = 'FAILED' AND message_type = :messageType ORDER BY message_id",
          inputParameters: '#[{ messageType: vars.messageType }]',
        }),
        step('set-variable', { variableName: 'count', value: '#[sizeOf(payload)]' }),
        router(
          'batch-job',
          { jobName: 'replay-failed-messages', blockSize: 100, maxFailedRecords: -1 },
          [
            route({ name: 'republish', acceptPolicy: 'NO_FAILURES' }, [
              step('set-variable', { variableName: 'messageId', value: '#[payload.message_id]' }),
              step('set-payload', { value: '#[read(payload.body, "application/json")]' }),
              step('jms-publish', { destination: 'items.inbound', destinationType: 'QUEUE', persistentDelivery: 'true' }),
              step('db-update', { database: 'SQL Server', sql: "UPDATE dbo.message_failures SET status = 'REPLAYED' WHERE message_id = :messageId", inputParameters: '#[{ messageId: vars.messageId }]' }),
            ]),
            route({ name: 'mark-failed', acceptPolicy: 'ONLY_FAILURES' }, [
              step('db-update', { database: 'SQL Server', sql: "UPDATE dbo.message_failures SET status = 'REPLAY_FAILED' WHERE message_id = :messageId", inputParameters: '#[{ messageId: payload.message_id }]' }),
            ]),
          ],
          {
            onComplete: [step('logger', { level: 'INFO', message: '#["Replay done: republished=" ++ (payload.successfulRecords as String) ++ " failed=" ++ (payload.failedRecords as String)]' })],
          },
        ),
        step('set-variable', { variableName: 'httpStatus', value: '202' }),
        step('set-payload', { value: '#[output application/json --- { status: "REPLAY_STARTED", type: vars.messageType, messages: vars.count }]' }),
      ],
    ),
  ),
  description: `
Hollin Garden Supply, a fictional garden centre chain, runs an inbound adapter: it reads item and barcode messages from the JMS queue \`items.inbound\`, fetches each body from **Azure Blob Storage** and loads it into the merchandising database. When a message fails for good, the adapter parks it in SQL Server:

\`\`\`
dbo.message_failures (message_id, message_type, body, status)
ITM-30211, Item, {"item":"SEED-TOM-CHERRY",...}, FAILED
\`\`\`

Last month a database outage parked 60,000 Item messages. Once the database was back, support replayed them by hand, a few hundred at a time, for two days.

You are asked for a restart flow. Support calls \`POST /replay?type=Item\` after a fix.

**Requirements**
- First check that the database and the blob store answer. If either does not, answer \`503\` and replay nothing.
- Read only the \`FAILED\` messages of the requested type.
- Through a Batch Job, republish each body to \`items.inbound\` and mark the row \`REPLAYED\`.
- A message whose republish fails is marked \`REPLAY_FAILED\`.
- Answer \`202\` with the number of messages queued for replay. The caller must not wait for 60,000 publishes.

**Facts**
- The message type comes in the query parameter \`type\`.
- Check the database with \`SELECT 1 AS ok\` and the blob store with Azure **List Blobs** on the container \`inbound\`.
- \`body\` holds the message as JSON text. Publish it as JSON, not as a string.
- Put the status code in the variable \`httpStatus\`. The listener answers with it, also on the error path.

**What each system sends back**
- \`SELECT 1 AS ok\` returns \`[ { "ok": 1 } ]\`. List Blobs returns a list of blob entries. Neither result is used; only success matters.
- **Database Select** on \`dbo.message_failures\` returns a list of rows, with \`body\` as text:
\`\`\`json
[ { "message_id": "ITM-30211", "message_type": "Item", "body": "{\\"item\\":\\"SEED-TOM-CHERRY\\",\\"status\\":\\"ACTIVE\\"}" },
  { "message_id": "ITM-30212", "message_type": "Item", "body": "{\\"item\\":\\"POT-30CM-TERRA\\",\\"status\\":\\"ACTIVE\\"}" } ]
\`\`\`

**What failures look like**
- The database is down: the health select raises \`DB:CONNECTIVITY\`. Answer **503**.
- The blob store is down: List Blobs raises \`AZURE-STORAGE:CONNECTIVITY\` (\`The storage account does not answer.\`). Answer **503**.
- The broker refuses a publish: JMS Publish raises a \`JMS\` error inside the batch step. The record fails, and the ONLY_FAILURES step marks it \`REPLAY_FAILED\`.

**Design the flow.**
`,
  answerTemplate: `## Health checks

## Which messages

## The Batch Job

## The answer
`,
  keyPoints: [
    'A replay into a system that is still down fails every message again and buries the real problem. Check the dependencies first.',
    'A cheap query (SELECT 1) and a list call on the container are enough as health checks. They prove the connection and the credentials.',
    'The Batch Job returns at once, so the caller gets 202 while the replay runs. The job log or the table shows the progress.',
    'ONLY_FAILURES marks the messages whose publish failed, so a second replay picks up exactly those.',
    'Mark a message REPLAYED after the publish, not before. If the app dies in between, the message is replayed again, so the adapter must ignore a duplicate message ID.',
  ],
  solution: `
1. **HTTP Listener** \`POST /replay\`. **Set Variable** \`messageType\` from the query.
2. **Try**: **Database Select** \`SELECT 1 AS ok\` and **Azure List Blobs** on the container. **On Error Propagate**: status 503 and an UNHEALTHY body.
3. **Database Select** the \`FAILED\` rows of that type. **Set Variable** \`count\`.
4. **Batch Job** (max failed records -1):
   - Step \`republish\`: **Set Variable** \`messageId\`, **Set Payload** the body, **JMS Publish** to \`items.inbound\`, **Database Update** to \`REPLAYED\`.
   - Step \`mark-failed\` (ONLY_FAILURES): **Database Update** to \`REPLAY_FAILED\`.
   - **On Complete**: log the counts.
5. **Set Variable** \`httpStatus\` 202, **Set Payload** the count.

**Pace.** 60,000 publishes in a few minutes can flood the adapter. Lower the block size or the job's concurrency, or replay in slices of a few thousand per call.
`,
  followUps: [
    {
      q: 'Support calls /replay twice by mistake. What happens?',
      a: 'The second call reads the rows still FAILED, which may be the same rows the first job has not reached yet, so some messages go out twice. A run lock row, or marking the rows REPLAYING when they are read, stops that.',
    },
    {
      q: 'The failed messages are on a JMS failure queue, not in a table. How would the restart flow change?',
      a: 'Consume from the failure queue in a loop until it is empty or a limit is reached, and publish each message to the main queue in the same transaction as the consume, so a crash cannot lose one.',
    },
  ],
}
