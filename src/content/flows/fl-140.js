import { design, flow, handler, route, router, scope, source, step } from '../../flow/dsl.js'

const stamp = '2026-11-18T02:30:05Z'
const before = '2026-11-17T02:30:04Z'
const rows = [
  { store_id: 'FR-101', name: 'Riverside', city: 'Leeds', phone: '0113 555 0101', active: 1, last_seen: before },
  { store_id: 'FR-102', name: 'Market Square', city: 'York', phone: '01904 555 0102', active: 1, last_seen: before },
  { store_id: 'FR-103', name: 'Station Road', city: 'Hull', phone: '01482 555 0103', active: 1, last_seen: before },
  { store_id: 'FR-104', name: 'Abbey Park', city: 'Selby', phone: '01757 555 0104', active: 1, last_seen: before },
  { store_id: 'FR-105', name: 'Harbour View', city: 'Whitby', phone: '01947 555 0105', active: 1, last_seen: before },
  { store_id: 'FR-106', name: 'Old Mill', city: 'Ripon', phone: '01765 555 0106', active: 1, last_seen: before },
  { store_id: 'FR-090', name: 'Castle Gate', city: 'Malton', phone: '01653 555 0090', active: 0, last_seen: '2026-08-02T02:30:01Z' },
]
const store = (id, name, city, phone) => ({ storeId: id, name, city, phone })
const fullExport = {
  generatedAt: stamp,
  stores: [
    store('FR-101', 'Riverside', 'Leeds', '0113 555 0101'),
    store('FR-102', 'Market Square', 'York', '01904 555 0102'),
    store('FR-103', 'Station Road Express', 'Hull', '01482 555 0103'),
    store('FR-104', 'Abbey Park', 'Selby', '01757 555 0104'),
    // FR-105 has closed, so it is not in the export
    store('FR-106', 'Old Mill', 'Ripon', '01765 555 0106'),
    store('FR-090', 'Castle Gate', 'Malton', '01653 555 0090'),
    store('FR-107', 'Canal Wharf', 'Skipton', '01756 555 0107'),
  ],
}
const portal = (body) => ({ systems: { http: [{ method: 'GET', path: '/franchise-portal/v1/stores', respond: { status: 200, body } }] } })
const untouched = [
  { store_id: 'FR-105', active: 1, last_seen: before },
  { store_id: 'FR-103', name: 'Station Road' },
  { store_id: 'FR-090', active: 0 },
]

export default {
  id: 'fl-140',
  category: 'flows',
  title: 'A Nightly Full Sync That Also Catches Closed Stores: Stamp What the Export Holds, Close the Rest, and Refuse to Close Anything on a Short Export',
  level: 'EXPERT',
  tags: ['myproject', 'scheduler', 'full-sync', 'mark-and-sweep', 'soft-delete', 'database', 'safety-check', 'franchise'],
  estMinutes: 50,
  flowChecks: [
    { label: 'A Scheduler starts the nightly sync', rule: { type: 'source', component: 'scheduler' } },
    {
      label: 'The active stores are counted before anything is written',
      rule: { type: 'before', first: 'db-select', firstWhere: { sql: { all: ['count', 'stores', 'active'] } }, then: 'foreach' },
    },
    { label: 'A short export raises an error on its own Choice route', rule: { type: 'inside', component: 'raise-error', within: 'choice' } },
    { label: 'The stores are written only when the export passes that check', rule: { type: 'inside', component: 'foreach', within: 'choice' } },
    { label: 'Each store is upserted inside the For Each', rule: { type: 'inside', component: 'db-insert', within: 'foreach', where: { sql: { all: ['on conflict', 'do update'] } } } },
    {
      label: 'Stores missing from the export are marked inactive after the loop, never deleted',
      rule: {
        type: 'all',
        rules: [
          { type: 'before', first: 'foreach', then: 'db-update', thenWhere: { sql: { all: ['active = 0', 'last_seen'] } }, outside: true },
          { type: 'absent', component: 'db-delete' },
        ],
      },
    },
  ],
  simulation: {
    systems: { db: { tables: { stores: { key: 'store_id', rows } } }, ...portal(fullExport).systems },
    tests: [
      {
        name: 'A normal night',
        about: 'One store has closed, one is new, one was renamed and one closed store has reopened. Afterwards the table matches the export, and the closed store is inactive but still there.',
        trigger: { schedule: {} },
        expect: {
          noError: true,
          db: {
            stores: {
              count: 8,
              has: [
                { store_id: 'FR-105', active: 0 },
                { store_id: 'FR-107', name: 'Canal Wharf', active: 1, last_seen: stamp },
                { store_id: 'FR-103', name: 'Station Road Express', active: 1 },
                { store_id: 'FR-090', active: 1, last_seen: stamp },
                { store_id: 'FR-101', active: 1, last_seen: stamp },
              ],
            },
          },
        },
      },
      {
        name: 'The export is cut short',
        about: 'A fault in the portal sends 2 stores instead of 7. Six stores are active, so the export is far too short. Nothing is written or closed, and an ERROR is logged for the support team.',
        trigger: { schedule: {} },
        overrides: portal({ generatedAt: stamp, stores: fullExport.stores.slice(0, 2) }),
        expect: { error: 'APP:SHORT_EXPORT', logs: [{ level: 'ERROR' }], db: { stores: { count: 7, has: untouched } } },
      },
      {
        name: 'An empty export',
        about: 'The portal answers 200 with no stores at all. That must not close the whole network.',
        trigger: { schedule: {} },
        overrides: portal({ generatedAt: stamp, stores: [] }),
        expect: { error: 'APP:SHORT_EXPORT', db: { stores: { count: 7, has: untouched } } },
      },
      {
        name: 'The portal is down',
        about: 'The portal answers 503. The run fails before any write, and every store keeps its state.',
        trigger: { schedule: {} },
        overrides: { systems: { http: [{ method: 'GET', path: '/franchise-portal/v1/stores', respond: { status: 503, body: { message: 'Maintenance' } } }] } },
        expect: { error: 'HTTP:SERVICE_UNAVAILABLE', db: { stores: { count: 7, has: untouched } } },
      },
      {
        name: 'The database fails before the sweep',
        about: 'The upserts work, then the statement that closes stores fails. No store is closed by a half run, and the next night does the whole sync again.',
        trigger: { schedule: {} },
        overrides: { systems: { db: { failWhen: [{ match: 'SET active = 0', fault: 'CONNECTIVITY' }] } } },
        expect: { error: 'DB:CONNECTIVITY', db: { stores: { has: [{ store_id: 'FR-105', active: 1 }] } } },
      },
    ],
  },
  referenceFlow: design(
    flow(
      'store-directory-sync',
      source('scheduler', { strategy: 'cron', expression: '0 30 2 * * ?' }),
      [
        step('http-request', { method: 'GET', path: '/franchise-portal/v1/stores', responseTimeout: 60000 }),
        step('set-variable', { variableName: 'stamp', value: '#[payload.generatedAt]' }),
        step('db-select', { database: 'PostgreSQL', sql: 'SELECT COUNT(*) AS active_count FROM stores WHERE active = 1', target: 'current' }),
        router(
          'choice',
          {},
          [
            route({ expression: '#[sizeOf(payload.stores default []) < vars.current[0].active_count * 0.8]' }, [
              step('raise-error', { type: 'APP:SHORT_EXPORT', description: '#["The export has " ++ sizeOf(payload.stores default []) ++ " stores, but " ++ vars.current[0].active_count ++ " are active"]' }),
            ]),
          ],
          {
            otherwise: [
              scope('foreach', { collection: '#[payload.stores]' }, [
                step('db-insert', {
                  database: 'PostgreSQL',
                  sql: 'INSERT INTO stores (store_id, name, city, phone, active, last_seen) VALUES (:storeId, :name, :city, :phone, 1, :stamp) ON CONFLICT (store_id) DO UPDATE SET name = EXCLUDED.name, city = EXCLUDED.city, phone = EXCLUDED.phone, active = 1, last_seen = EXCLUDED.last_seen',
                  inputParameters: '#[{ storeId: payload.storeId, name: payload.name, city: payload.city, phone: payload.phone, stamp: vars.stamp }]',
                }),
              ]),
              step('db-update', {
                database: 'PostgreSQL',
                sql: 'UPDATE stores SET active = 0 WHERE active = 1 AND last_seen <> :stamp',
                inputParameters: '#[{ stamp: vars.stamp }]',
                target: 'closed',
              }),
              step('logger', { level: 'INFO', message: '#["Store sync done, " ++ sizeOf(payload.stores) ++ " in the export, " ++ vars.closed.affectedRows ++ " closed"]' }),
            ],
          },
        ),
      ],
      [handler('on-error-propagate', { type: 'ANY' }, [step('logger', { level: 'ERROR', message: '#["Store sync stopped, no store was closed: " ++ error.description]' })])],
    ),
  ),
  description: `
A coffee franchise shows its shops in a **store locator** on its website and app. The locator reads a PostgreSQL table \`stores\` with the columns \`store_id\`, \`name\`, \`city\`, \`phone\`, \`active\` (1 or 0) and \`last_seen\`. Orders and loyalty points refer to stores by \`store_id\`, so a store row is never deleted.

The **franchise portal** is the master for stores. It has no change feed. It offers one full export:

\`GET /franchise-portal/v1/stores\` answers \`{ "generatedAt": "2026-11-18T02:30:05Z", "stores": [ { "storeId", "name", "city", "phone" }, ... ] }\`

Today a nightly job inserts and updates the stores in the export. Closed stores are never in the export, so they stay in the locator for months, and customers walk to shops that are boarded up.

**Requirements**
- Run every night at 02:30.
- Every store in the export is in the table, active, with the export's details. A closed store that **reopens** becomes active again.
- Every store that is **not** in the export is set to \`active = 0\`.
- Last year a portal fault sent an export with a handful of stores, and a script closed most of the network on the website. **If the export has fewer than 80% of the stores that are active now, change nothing**, fail the run and log an ERROR.
- If the portal or the database fails, no store may be closed because of a half run.

**Design the flow.**
`,
  answerTemplate: `## Reading the export

## The safety check

## Writing the stores

## Closing the stores that are gone

## Failures part way
`,
  keyPoints: [
    'A full export with no change feed can only show deletes by what is missing. That is mark and sweep: mark every row the export holds, then sweep the rows that were not marked.',
    'Mark with a stamp from the export, such as generatedAt, written to last_seen in the same upsert. The sweep then closes active rows whose last_seen is not this stamp.',
    'Close stores with active = 0, never DELETE. Other data refers to them, and a mistake can be undone.',
    'Check the size of the export against the active stores before any write. A short or empty export is a fault in the source, not a mass closing.',
    'The sweep runs on the main path after the loop. Any failure before it, in the portal call or in the upserts, stops the run before a store is closed.',
    'The upsert also sets active = 1, so a store that reopens comes back without a special case.',
  ],
  solution: `
1. **Scheduler**: cron \`0 30 2 * * ?\`.
2. **HTTP Request** \`GET /franchise-portal/v1/stores\`, with a generous timeout.
3. **Set Variable** \`stamp\` = \`#[payload.generatedAt]\`.
4. **Database Select**, Target \`current\`: \`SELECT COUNT(*) AS active_count FROM stores WHERE active = 1\`.
5. **Choice**:
   - \`#[sizeOf(payload.stores default []) < vars.current[0].active_count * 0.8]\`: **Raise Error** \`APP:SHORT_EXPORT\`.
   - Otherwise:
     - **For Each** store: **Database Insert**
       \`\`\`sql
       INSERT INTO stores (store_id, name, city, phone, active, last_seen)
       VALUES (:storeId, :name, :city, :phone, 1, :stamp)
       ON CONFLICT (store_id) DO UPDATE SET name = EXCLUDED.name, city = EXCLUDED.city,
         phone = EXCLUDED.phone, active = 1, last_seen = EXCLUDED.last_seen
       \`\`\`
     - **Database Update** (the sweep): \`UPDATE stores SET active = 0 WHERE active = 1 AND last_seen <> :stamp\`.
     - **Logger** with the number closed.
6. **On Error Propagate** (ANY): log at ERROR that the sync stopped and no store was closed.

**Why the stamp and not a list of IDs.** A sweep written as \`WHERE store_id NOT IN (...)\` needs the whole list in one statement, which gets long for a big network. The stamp keeps each statement small, and the table itself shows when each store was last in an export.

**Why the threshold is 80%.** It is a business choice. Closing more than a fifth of the network in one night has never happened, so it is far more likely to be a fault. When it is real, someone confirms it and runs the sync with a manual override.

**If the run stops part way.** Some stores may have the new stamp and others the old one, but nothing was closed. The next run stamps every store again and sweeps then.
`,
  followUps: [
    {
      q: 'Two runs overlap, for example a manual run during the nightly one. What can go wrong?',
      a: 'The first run\'s sweep can close stores that only the second run has stamped so far, because their last_seen holds the other stamp. Keep runs from overlapping, for example with a lock row in the database that a run takes at the start.',
    },
    {
      q: 'How should the website know that a store has closed today?',
      a: 'Publish an event for each store the sweep closed. RETURNING store_id on the UPDATE, where the database supports it, gives the list in the same statement.',
    },
    {
      q: 'The export grows to 20,000 stores. What changes?',
      a: 'Use a Bulk Insert with the same upsert statement instead of one insert per store, or load the export into a staging table and run the upsert and the sweep as two set based statements.',
    },
  ],
}
