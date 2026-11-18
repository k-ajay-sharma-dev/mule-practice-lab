import { design, flow, route, router, source, step } from '../../flow/dsl.js'

const store = (store_id, store_name, region, status, rv) => ({ store_id, store_name, region, status, rv })
const stores = [
  store('0101', 'Harbour Street', 'NORTH', 'OPEN', 50112),
  store('0102', 'Mill Lane', 'NORTH', 'OPEN', 50240),
  store('0103', 'Kingsway', 'SOUTH', 'REFIT', 50388),
  store('0104', 'Riverside', 'SOUTH', 'PLANNED', 50391),
]
const tables = { stores: { key: 'store_id', rows: stores }, sync_state: { key: 'extract_name', rows: [{ extract_name: 'STORES', last_rv: 50240 }] } }

export default {
  id: 'fl-212',
  category: 'flows',
  title: 'Changed Stores to the Planning Platform With a SQL Server rowversion: Send What Changed Since the Last Value, and Store the New Value Only After the File',
  level: 'BEGINNER',
  tags: ['myproject', 'sql-server', 'rowversion', 'delta', 'watermark', 'ftp', 'master-data'],
  estMinutes: 20,
  flowChecks: [
    { label: 'The last rowversion sent is read from dbo.sync_state', rule: { type: 'exists', component: 'db-select', where: { sql: { all: ['sync_state', 'last_rv'] } } } },
    { label: 'Stores changed since then are selected by rv', rule: { type: 'exists', component: 'db-select', where: { sql: { all: ['dbo.stores', 'rv >', ':lastRv'] } } } },
    { label: 'The changes are written to /inbound/locations only when there are some', rule: { type: 'inside', component: 'ftp-write', within: 'choice', where: { path: '/inbound/locations/' } } },
    { label: 'The new rowversion is stored after the file is written', rule: { type: 'before', first: 'ftp-write', then: 'db-update', thenWhere: { sql: 'sync_state' } } },
  ],
  simulation: {
    systems: { db: { tables } },
    tests: [
      {
        name: 'Two stores changed',
        about: 'Stores 0103 and 0104 have a rowversion above 50240. They go out, and sync_state becomes 50391.',
        trigger: { schedule: {} },
        expect: {
          noError: true,
          files: { '/inbound/locations/STORES_*.csv': { count: 1, has: 'Riverside' } },
          db: { sync_state: { has: [{ extract_name: 'STORES', last_rv: 50391 }] } },
        },
      },
      {
        name: 'Nothing changed',
        about: 'No rowversion is above the stored one. No file is written and sync_state stays as it was.',
        trigger: { schedule: {} },
        overrides: { systems: { db: { tables: { sync_state: { key: 'extract_name', rows: [{ extract_name: 'STORES', last_rv: 50391 }] } } } } },
        expect: { files: { '/inbound/locations/*': { count: 0 } }, db: { sync_state: { has: [{ last_rv: 50391 }] } } },
      },
      {
        name: 'The FTP server is down',
        about: 'The file cannot be written, so sync_state stays at 50240 and the next run sends the same two stores.',
        trigger: { schedule: {} },
        overrides: { systems: { files: { fault: true, faultOn: 'ftp' } } },
        expect: { error: 'FTP:CONNECTIVITY', db: { sync_state: { has: [{ last_rv: 50240 }] } } },
      },
    ],
  },
  referenceFlow: design(
    flow('changed-stores-to-planning', source('scheduler', { strategy: 'fixed-frequency', frequency: 1, timeUnit: 'HOURS' }), [
      step('db-select', { database: 'SQL Server', sql: "SELECT last_rv FROM dbo.sync_state WHERE extract_name = 'STORES'", target: 'state' }),
      step('db-select', {
        database: 'SQL Server',
        sql: 'SELECT store_id, store_name, region, status, rv FROM dbo.stores WHERE rv > :lastRv ORDER BY rv',
        inputParameters: '#[{ lastRv: vars.state[0].last_rv }]',
      }),
      router(
        'choice',
        {},
        [
          route({ expression: '#[not isEmpty(payload)]' }, [
            step('set-variable', { variableName: 'maxRv', value: '#[max(payload map $.rv)]' }),
            step('transform', { script: '%dw 2.0\noutput application/csv\n---\npayload map ((s) -> s - "rv")' }),
            step('ftp-write', { path: '#["/inbound/locations/STORES_" ++ (now() as String {format: "yyyyMMddHHmm"}) ++ ".csv"]', mode: 'OVERWRITE' }),
            step('db-update', { database: 'SQL Server', sql: "UPDATE dbo.sync_state SET last_rv = :maxRv WHERE extract_name = 'STORES'", inputParameters: '#[{ maxRv: vars.maxRv }]' }),
          ]),
        ],
        { otherwise: [step('logger', { level: 'INFO', message: 'No store changes' })] },
      ),
    ]),
  ),
  description: `
Marrow & Pine Home, a fictional homewares retailer, sends store master data to the planning platform. Stores change a few times a week: a refit, a new store, a closure. The platform wants only the stores that changed, every hour, on its **FTP server** in \`/inbound/locations\`, as \`STORES_<yyyyMMddHHmm>.csv\`.

The SQL Server table \`dbo.stores\` (\`store_id\`, \`store_name\`, \`region\`, \`status\`, \`rv\`) has a **rowversion** column \`rv\`: SQL Server gives it a new, higher value every time the row changes. Here it is read as a number.

The last value sent is in \`dbo.sync_state\` (\`extract_name\` = \`STORES\`, \`last_rv\`).

**Requirements**
- Send every store whose \`rv\` is above the stored value, without the \`rv\` column.
- Write no file when nothing changed.
- Store the highest \`rv\` sent, and only after the file is written.

**Design the flow.**
`,
  answerTemplate: `## Why a rowversion

## Finding the changes

## Moving the stored value
`,
  keyPoints: [
    'A rowversion changes on every update, with no clock involved. Time zones and clock drift do not matter.',
    'Read it as BIGINT (CAST(rv AS BIGINT)) or binary(8); a number is quicker to store and compare.',
    'Store the highest value actually sent, after the write. A failed write leaves the old value, so the rows go again.',
    'A rowversion says that a row changed, not what changed. The platform gets the whole row.',
  ],
  solution: `
1. **Scheduler**, every hour.
2. **Database Select** \`last_rv\` into \`vars.state\`.
3. **Database Select** \`... WHERE rv > :lastRv ORDER BY rv\`.
4. **Choice** not empty: **Set Variable** \`maxRv\`, **Transform** to CSV without \`rv\`, **FTP Write**, **Database Update** \`sync_state\`. Otherwise log.

**In-flight transactions.** A transaction that is still open can hold a lower rowversion than one already committed. Reading only up to \`MIN_ACTIVE_ROWVERSION()\` avoids skipping it. Check this with your DBA, because it depends on the workload.
`,
  followUps: [
    {
      q: 'A store is deleted. Does this flow send it?',
      a: 'No, a deleted row has no rowversion left to find. Use a status such as CLOSED instead of deleting, or a deletes table, or Change Tracking.',
    },
    {
      q: 'What is the difference with Change Data Capture?',
      a: 'CDC reads the transaction log and keeps every change with its before and after values. A rowversion only tells you the row is newer. For master data the latest row is enough.',
    },
  ],
}
