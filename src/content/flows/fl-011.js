import { design, flow, handler, route, router, scope, source, step } from '../../flow/dsl.js'

export default {
  id: 'fl-011',
  category: 'flows',
  title: 'Database Polling with a Watermark (CDC-style Sync)',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'database', 'watermark', 'polling', 'scheduler', 'object-store'],
  estMinutes: 25,
  flowChecks: [
    {
      label: 'The table is polled on a schedule (Scheduler or Database On Table Row)',
      rule: { type: 'source', component: ['scheduler', 'db-listener'] },
    },
    {
      label: 'The last watermark is read from a persistent store before querying',
      rule: { type: 'before', first: 'os-retrieve', then: 'db-select' },
    },
    {
      label: 'The query selects rows changed since the watermark, on LAST_UPDATED',
      rule: { type: 'exists', component: 'db-select', where: { sql: 'LAST_UPDATED' } },
    },
    {
      label: 'Rows that share a LAST_UPDATED value are not missed (tie-break on CUST_ID or a >= filter)',
      rule: {
        type: 'any',
        rules: [
          { type: 'exists', component: 'db-select', where: { sql: 'CUST_ID' } },
          { type: 'exists', component: 'db-select', where: { sql: '>=' } },
        ],
      },
    },
    { label: 'DataWeave maps ERP columns to the CRM customer model', rule: { type: 'before', first: 'transform', then: 'http-request' } },
    {
      label: 'Changes are delivered to the CRM in chunks / per record',
      rule: { type: 'inside', component: 'http-request', within: ['foreach', 'parallel-foreach', 'batch-job', 'batch-aggregator'] },
    },
    {
      label: 'The watermark is advanced only after delivery succeeded, on the main path',
      rule: { type: 'before', first: 'http-request', then: 'os-store', every: true, outside: true },
    },
    {
      label: 'A failed poll propagates its error so the watermark stays untouched',
      rule: {
        type: 'all',
        rules: [
          { type: 'handler', component: 'on-error-propagate' },
          { type: 'absent', component: 'os-store', within: ['on-error-propagate', 'on-error-continue'] },
        ],
      },
    },
  ],
  simulation: {
    systems: {
      http: [{ method: 'POST', path: '/customers/bulk-upsert', latencyMs: 900, respond: { status: 200, body: { upserted: 3 } } }],
      objectStore: { 'watermark-store': { 'customers.watermark': { ts: '2026-11-12T08:00:00', id: 1002 } } },
      db: {
        tables: {
          CUSTOMERS: {
            key: 'CUST_ID',
            rows: [
              { CUST_ID: 1001, CUST_NAME: 'Acme Retail', EMAIL: 'ap@acme.example', LAST_UPDATED: '2026-11-11T17:30:00' },
              { CUST_ID: 1002, CUST_NAME: 'Globex', EMAIL: 'billing@globex.example', LAST_UPDATED: '2026-11-12T08:00:00' },
              { CUST_ID: 1003, CUST_NAME: 'Initech', EMAIL: 'finance@initech.example', LAST_UPDATED: '2026-11-12T09:15:00' },
              { CUST_ID: 1004, CUST_NAME: 'Umbrella', EMAIL: 'ar@umbrella.example', LAST_UPDATED: '2026-11-12T09:15:00' },
            ],
          },
        },
      },
    },
    tests: [
      {
        name: 'Changed customers are synced',
        about: 'The poll finds customers 1003 and 1004, changed since the watermark, and sends them to the CRM. Customer 1001 has not changed.',
        trigger: { schedule: {} },
        expect: {
          noError: true,
          calls: [
            { method: 'POST', path: '/customers/bulk-upsert', has: [{ customerId: '1003', name: 'Initech' }], min: 1 },
            { method: 'POST', path: '/customers/bulk-upsert', has: [{ customerId: '1004', email: 'ar@umbrella.example' }], min: 1 },
            { method: 'POST', path: '/customers/bulk-upsert', has: [{ customerId: '1001' }], count: 0 },
          ],
          stored: [{ key: 'customers.watermark', has: { ts: '2026-11-12T09:15:00' } }],
        },
      },
      {
        name: 'The CRM is down',
        about: 'The delivery fails, so the watermark keeps its old value and no customer is skipped.',
        trigger: { schedule: {} },
        overrides: { systems: { http: [{ method: 'POST', path: '/customers/bulk-upsert', respond: { fault: 'CONNECTIVITY' } }] } },
        expect: { calls: [{ method: 'POST', path: '/customers/bulk-upsert', min: 1 }], stored: [{ key: 'customers.watermark', value: { ts: '2026-11-12T08:00:00', id: 1002 } }] },
      },
      {
        name: 'The next poll sends them again',
        about: 'The first delivery fails. The watermark must stay where it was, so the next poll sends the same customers again.',
        triggers: [{ schedule: {} }, { afterMs: 120000, schedule: {} }],
        overrides: {
          systems: { http: [{ method: 'POST', path: '/customers/bulk-upsert', responses: [{ fault: 'CONNECTIVITY' }, { status: 200, body: { upserted: 2 } }] }] },
        },
        expect: { noError: true, calls: [{ method: 'POST', path: '/customers/bulk-upsert', has: [{ customerId: '1003' }], min: 2 }] },
      },
      {
        name: 'A row shares the last timestamp',
        about: 'The only change is customer 1005, updated in the same second as the watermark row 1002. It must still be sent.',
        trigger: { schedule: {} },
        overrides: {
          systems: {
            db: {
              tables: {
                CUSTOMERS: {
                  key: 'CUST_ID',
                  rows: [
                    { CUST_ID: 1001, CUST_NAME: 'Acme Retail', EMAIL: 'ap@acme.example', LAST_UPDATED: '2026-11-11T17:30:00' },
                    { CUST_ID: 1002, CUST_NAME: 'Globex', EMAIL: 'billing@globex.example', LAST_UPDATED: '2026-11-12T08:00:00' },
                    { CUST_ID: 1005, CUST_NAME: 'Hooli', EMAIL: 'ap@hooli.example', LAST_UPDATED: '2026-11-12T08:00:00' },
                  ],
                },
              },
            },
          },
        },
        expect: { noError: true, calls: [{ method: 'POST', path: '/customers/bulk-upsert', has: [{ customerId: '1005' }], min: 1 }] },
      },
    ],
  },
  referenceFlow: design(
    flow(
      'erp-customers-sync',
      source('scheduler', { strategy: 'fixed-frequency', frequency: 2, timeUnit: 'MINUTES' }),
      [
        step('os-retrieve', {
          key: 'customers.watermark',
          defaultValue: '#[{ ts: "1970-01-01T00:00:00", id: 0 }]',
          objectStore: 'watermark-store',
        }),
        step('set-variable', { variableName: 'watermark', value: '#[payload]' }),
        step('db-select', {
          sql:
            'SELECT * FROM CUSTOMERS\nWHERE (LAST_UPDATED > :ts) OR (LAST_UPDATED = :ts AND CUST_ID > :id)\nORDER BY LAST_UPDATED, CUST_ID\nFETCH FIRST 5000 ROWS ONLY',
        }),
        router(
          'choice',
          {},
          [
            route({ expression: '#[not isEmpty(payload)]' }, [
              step('set-variable', {
                variableName: 'newWatermark',
                value: '#[{ ts: payload[-1].LAST_UPDATED, id: payload[-1].CUST_ID }]',
              }),
              step('transform', {
                script:
                  '%dw 2.0\noutput application/json\n---\npayload map (c) -> {\n  customerId: c.CUST_ID as String,\n  name: c.CUST_NAME,\n  email: c.EMAIL,\n  updatedAt: c.LAST_UPDATED\n}',
              }),
              scope('foreach', { collection: '#[payload]', batchSize: 200 }, [
                step('http-request', { method: 'POST', path: '/customers/bulk-upsert', responseTimeout: 30000 }),
              ]),
              step('os-store', { key: 'customers.watermark', value: '#[vars.newWatermark]', objectStore: 'watermark-store' }),
              step('logger', { level: 'INFO', message: '#["Synced " ++ (sizeOf(payload) as String) ++ " customers"]' }),
            ]),
          ],
          { otherwise: [step('logger', { level: 'DEBUG', message: 'No changed customers' })] },
        ),
      ],
      [
        handler('on-error-propagate', { type: 'ANY' }, [
          step('logger', { level: 'ERROR', message: '#["Customer sync failed, watermark kept: " ++ error.description]' }),
        ]),
      ],
    ),
  ),
  description: `
A legacy **Oracle ERP** table \`CUSTOMERS\` (2M rows) has a \`LAST_UPDATED\` timestamp column and a numeric primary key \`CUST_ID\`. The ERP has no events, no triggers you're allowed to add, and the DBA only allows read access.

**Requirements**
- Changed customers must reach the **CRM System API** within **5 minutes** (2,000 to 10,000 changes a day, bursts of 20k after month-end jobs). Its \`POST /customers/bulk-upsert\` takes a list of customers, each \`{ "customerId": "1003", "name": "...", "email": "...", "updatedAt": "..." }\`, with \`customerId\` the \`CUST_ID\` as text.
- After a restart or redeploy, the sync must continue from where it stopped, with no full re-scan and no missed rows. If you keep the watermark in an Object Store, use the store \`watermark-store\` and the key \`customers.watermark\` with a value like \`{ "ts": "2026-11-12T08:00:00", "id": 1002 }\` (the last \`LAST_UPDATED\` and \`CUST_ID\` sent).
- Two rows can share the same \`LAST_UPDATED\` value (bulk updates in one transaction).
- The app runs on **2 replicas** for HA.

**Design the flow(s):** trigger, how the watermark is stored and advanced, duplicate/missed-row handling, and behaviour with two replicas.
`,
  answerTemplate: `## Trigger

## Watermark storage and query

## Processing and delivery to CRM

## Advancing the watermark safely

## Equal timestamps / missed rows

## Running on two replicas
`,
  keyPoints: [
    'Either Database On Table Row listener with watermarkColumn/idColumn, or Scheduler + Database Select with the watermark kept in a persistent Object Store.',
    'Query uses LAST_UPDATED >= (or >) the stored watermark, ordered by LAST_UPDATED, CUST_ID, with a row limit per poll.',
    'Watermark is advanced only after the batch was delivered successfully, to the max LAST_UPDATED actually processed.',
    'Equal timestamps handled by a composite watermark (timestamp + id) or an overlap window plus idempotent upserts in the CRM.',
    'Only one replica polls: scheduler runs on primary node in a cluster, or concurrency is guarded with a lock / disallowConcurrentExecution and single-poller design.',
  ],
  solution: `
**Option 1: Database \`On Table Row\` source**
- Configure \`table="CUSTOMERS"\`, \`watermarkColumn="LAST_UPDATED"\`, \`idColumn="CUST_ID"\`, scheduling frequency 1 to 2 min. The connector stores the watermark in an Object Store and fires one event per row. Quick to build, less control over batching.

**Option 2: Scheduler + Select (more control, common in projects)**
1. **Scheduler** every 2 min with \`disallowConcurrentExecution="true"\` so a long run doesn't overlap the next.
2. **Object Store Retrieve** \`customers.watermark\` from a **persistent** Object Store (default value e.g. \`1970-01-01T00:00:00\` or an initial-load date).
3. **Database Select** with parameterised input: \`WHERE (LAST_UPDATED > :ts) OR (LAST_UPDATED = :ts AND CUST_ID > :id) ORDER BY LAST_UPDATED, CUST_ID FETCH FIRST 5000 ROWS ONLY\`. The composite watermark solves the equal-timestamp problem.
4. **Transform (DataWeave)** ERP columns → CRM canonical customer.
5. Deliver in chunks: For Each \`batchSize="200"\` → HTTP Request to CRM System API **bulk upsert** keyed by \`CUST_ID\` (idempotent, so replays are harmless).
6. **Object Store Store** the new watermark = \`{ ts, id }\` of the *last row processed*, only after delivery succeeded. If 5000 rows came back, there may be more, and the next poll continues from there.
7. **Error handling:** On Error Propagate leaves the watermark untouched (next poll retries the same window) and alerts after N consecutive failures.

**Two replicas:** in a Mule runtime cluster, polling sources run on the primary node only. On CloudHub 2.0 / RTF replicas are independent unless clustering is enabled for the app. So either enable clustering or run the poller in a single-replica app. The other option is to acquire a distributed lock / Object Store key before polling so only one replica processes a window.
`,
  followUps: [
    { q: 'What if a long-running ERP transaction commits rows with an older LAST_UPDATED after you already moved the watermark?', a: 'Those rows are missed. Mitigate with an overlap window (re-read the last few minutes each poll) combined with idempotent upserts, or switch to real CDC (log-based) if the DBA allows.' },
    { q: 'How do you detect deletes?', a: 'Timestamp polling cannot see hard deletes. You need a soft-delete flag, an audit/tombstone table, log-based CDC, or a periodic full key reconciliation.' },
    { q: 'Why store the watermark only after the CRM call?', a: 'If you store it first and the delivery fails, those rows are never picked up again; storing after makes the process at-least-once, which the idempotent upsert tolerates.' },
  ],
}
