import { design, flow, scope, source, step } from '../../flow/dsl.js'

const name = 'ALLOC_20261113_R5120.csv'
const file = `/plan/alloc/${name}`
const csv = 'alloc_id,store,sku,qty\nA-5120-1,0101,LAMP-OAK-S,4\nA-5120-2,0103,RUG-JUTE-L,2'
const tables = {
  store_allocation: { key: 'alloc_id', columns: ['alloc_id', 'store', 'sku', 'qty', 'file_name'], rows: [] },
  outbox: { key: 'outbox_id', columns: ['outbox_id', 'event_type', 'aggregate_id', 'payload_json', 'status'], rows: [] },
}
const run = [{ file: { path: file } }, { schedule: { flow: 'outbox-relay' } }]

export default {
  id: 'fl-219',
  category: 'flows',
  title: 'Allocations Into SQL Server and Events to the WMS With an Outbox Table: Write Both in One Transaction, and Let a Relay Publish and Mark Them Sent',
  level: 'ADVANCED',
  tags: ['myproject', 'sql-server', 'outbox', 'transaction', 'jms', 'events', 'plans', 'ftp'],
  estMinutes: 45,
  flowChecks: [
    {
      label: 'The allocations and their outbox rows are written in one transaction',
      rule: {
        type: 'all',
        rules: [
          { type: 'inside', component: 'db-bulk-insert', within: 'try', withinWhere: { transactionalAction: 'ALWAYS_BEGIN' }, where: { sql: 'store_allocation' } },
          { type: 'inside', component: 'db-bulk-insert', within: 'try', withinWhere: { transactionalAction: 'ALWAYS_BEGIN' }, where: { sql: 'outbox' } },
        ],
      },
    },
    {
      label: 'Files are picked up from /plan/alloc, and that flow does not publish to the broker itself',
      rule: { type: 'all', rules: [{ type: 'source', component: 'ftp-listener', where: { directory: '/plan/alloc' } }, { type: 'absent', component: 'jms-publish', inFlowWith: { component: 'ftp-listener' } }] },
    },
    { label: 'A scheduled relay reads NEW outbox rows in key order', rule: { type: 'exists', component: 'db-select', where: { sql: { all: ['outbox', 'NEW', 'ORDER BY outbox_id'] } } } },
    { label: 'Each row is published to wms.allocations, then marked SENT', rule: { type: 'all', rules: [{ type: 'inside', component: 'jms-publish', within: 'foreach', where: { destination: 'wms.allocations' } }, { type: 'before', first: 'jms-publish', then: 'db-update', thenWhere: { sql: 'SENT' } }] } },
  ],
  simulation: {
    systems: { files: { [file]: csv }, db: { tables } },
    tests: [
      {
        name: 'A plan file, then the relay',
        about: 'Two allocations and two outbox rows are committed together. The relay publishes both to wms.allocations and marks them SENT.',
        triggers: run,
        expect: {
          noError: true,
          db: { store_allocation: { count: 2 }, outbox: { count: 2, has: [{ aggregate_id: 'A-5120-1', status: 'SENT' }, { aggregate_id: 'A-5120-2', status: 'SENT' }] } },
          sent: [{ destination: 'wms.allocations', count: 2 }],
          files: { [`/plan/alloc/archive/${name}`]: { exists: true } },
        },
      },
      {
        name: 'The broker is down',
        about: 'The allocations are safe in SQL Server. The relay cannot publish, so the outbox rows stay NEW for its next run, and no event is lost.',
        triggers: run,
        overrides: { systems: { queues: { 'wms.allocations': { fault: true } } } },
        expect: { db: { store_allocation: { count: 2 }, outbox: { count: 2, lacks: [{ status: 'SENT' }] } } },
      },
      {
        name: 'The outbox insert fails',
        about: 'The allocations are rolled back with it. There is never an allocation the WMS will not hear about.',
        trigger: { file: { path: file } },
        overrides: { systems: { db: { failWhen: [{ match: 'INSERT INTO dbo.outbox', fault: 'QUERY_EXECUTION' }] } } },
        expect: { db: { store_allocation: { count: 0 }, outbox: { count: 0 } } },
      },
    ],
  },
  referenceFlow: design(
    flow('allocations-in', source('ftp-listener', { directory: '/plan/alloc', matcher: 'ALLOC_*.csv', postAction: 'none', timeBetweenSizeCheck: 10000 }), [
      step('set-variable', { variableName: 'filePath', value: '#[attributes.path]' }),
      step('set-variable', { variableName: 'fileName', value: '#[attributes.fileName]' }),
      step('set-variable', { variableName: 'allocs', value: '#[payload map ((a) -> { alloc_id: a.alloc_id, store: a.store, sku: a.sku, qty: a.qty as Number, file_name: vars.fileName })]' }),
      scope('try', { transactionalAction: 'ALWAYS_BEGIN' }, [
        step('set-payload', { value: '#[vars.allocs]' }),
        step('db-bulk-insert', { database: 'SQL Server', sql: 'INSERT INTO dbo.store_allocation (alloc_id, store, sku, qty, file_name) VALUES (:alloc_id, :store, :sku, :qty, :file_name)' }),
        step('set-payload', {
          value: '#[vars.allocs map ((a) -> { event_type: "ALLOCATION_CREATED", aggregate_id: a.alloc_id, payload_json: write(a - "file_name", "application/json", { indent: false }), status: "NEW" })]',
        }),
        step('db-bulk-insert', { database: 'SQL Server', sql: 'INSERT INTO dbo.outbox (event_type, aggregate_id, payload_json, status) VALUES (:event_type, :aggregate_id, :payload_json, :status)' }),
      ]),
      step('ftp-move', { sourcePath: '#[vars.filePath]', targetPath: '/plan/alloc/archive', overwrite: 'true' }),
    ]),
    flow('outbox-relay', source('scheduler', { strategy: 'fixed-frequency', frequency: 30, timeUnit: 'SECONDS' }), [
      step('db-select', { database: 'SQL Server', sql: "SELECT TOP 100 outbox_id, aggregate_id, payload_json FROM dbo.outbox WHERE status = 'NEW' ORDER BY outbox_id" }),
      scope('foreach', { collection: '#[payload]' }, [
        step('set-variable', { variableName: 'outboxId', value: '#[payload.outbox_id]' }),
        step('set-payload', { value: '#[payload.payload_json]' }),
        step('jms-publish', { destination: 'wms.allocations' }),
        step('db-update', { database: 'SQL Server', sql: "UPDATE dbo.outbox SET status = 'SENT' WHERE outbox_id = :outboxId", inputParameters: '#[{ outboxId: vars.outboxId }]' }),
      ]),
    ]),
  ),
  description: `
Marrow & Pine Home, a fictional homewares retailer, gets store allocations from the planning platform as \`ALLOC_<date>_<run>.csv\` on its **FTP server**, folder \`/plan/alloc\`. Each allocation must be stored in SQL Server (\`dbo.store_allocation\`) **and** announced to the WMS as an event on the JMS queue \`wms.allocations\`, so the warehouse can reserve stock.

The first version inserted the rows and then published each event. When the broker restarted halfway, some allocations were in the database but the WMS never heard of them. Swapping the order made it worse: events for rows that then failed to insert.

The DBA has added an outbox table: \`dbo.outbox\` (\`outbox_id\` identity, \`event_type\`, \`aggregate_id\`, \`payload_json\`, \`status\`).

**Requirements**
- Write the allocations and one outbox row each (\`ALLOCATION_CREATED\`, status \`NEW\`) in one transaction. Archive the file to \`/plan/alloc/archive\`.
- A separate flow, every 30 seconds, reads up to 100 \`NEW\` outbox rows in key order, publishes each \`payload_json\` to \`wms.allocations\`, and marks it \`SENT\`.
- A broker outage must not lose an event.

**Facts**
- Name the relay flow \`outbox-relay\`.
- An outbox row's \`aggregate_id\` is the \`alloc_id\`, and \`payload_json\` is the allocation as JSON. \`outbox_id\` is filled by the database.
- Store \`qty\` as a number.

**Design the two flows.**
`,
  answerTemplate: `## Why the first version lost events

## Writing the outbox

## The relay

## Duplicates
`,
  keyPoints: [
    'A database write and a broker publish cannot share a LOCAL transaction. The outbox turns the publish into a database write, which can.',
    'The relay publishes, then marks SENT. If it fails in between, the row is published again later: at least once, never zero times.',
    'The WMS must ignore an event it has seen, by aggregate_id. That is the price of at least once.',
    'ORDER BY outbox_id keeps the events in the order they were written. TOP 100 keeps each run short.',
    'Run the relay on one node only, or claim rows first (UPDATE ... SET status = \'CLAIMED\' with a worker ID), so two relays do not publish the same row.',
  ],
  solution: `
**allocations-in** (FTP listener on \`/plan/alloc\`): keep \`filePath\`, \`fileName\` and the mapped \`allocs\`. **Try** ALWAYS_BEGIN: **Set Payload** allocs, **Bulk Insert** into \`dbo.store_allocation\`, **Set Payload** the outbox rows (JSON of each allocation), **Bulk Insert** into \`dbo.outbox\`. Then **FTP Move** to archive.

**outbox-relay** (Scheduler, every 30 seconds): **Select** \`TOP 100 ... WHERE status = 'NEW' ORDER BY outbox_id\`. **For Each**: keep \`outboxId\`, **Set Payload** \`payload_json\`, **JMS Publish** to \`wms.allocations\`, **Update** to \`SENT\`.

**Housekeeping.** Delete SENT rows older than a week in a nightly job, or the outbox grows without end.

**XA instead?** An XA transaction over the database and the broker also works, but it is slower and needs both sides to support it. The outbox needs only the database.
`,
  followUps: [
    {
      q: 'Why not Change Data Capture on dbo.store_allocation instead of an outbox?',
      a: 'CDC gives raw row changes, which then need mapping into business events. An outbox row is the event itself, written by the code that knows what happened.',
    },
    {
      q: 'One outbox row fails to publish every time. What happens to the rows after it?',
      a: 'In this design the loop stops and they wait, which keeps order. Add an attempts column and move a row that failed many times to a FAILED status with an alert, so it does not block the rest.',
    },
  ],
}
