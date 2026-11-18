import { design, flow, handler, route, router, scope, source, step } from '../../flow/dsl.js'

const row = (id, store, status = 'READY', attempts = 0) => ({ id, store_id: store, price_json: `{"store":"${store}","sku":"BRD-SOUR-800","price":2.35}`, status, attempts })
const tables = (rows) => ({ price_outbox: { key: 'id', rows } })
const normal = [row(501, '0412'), row(502, '0415'), row(503, '0418', 'SENDING'), row(499, '0412', 'SENT')]
const storeApi = (fail) => [{ method: 'POST', path: '/stores/{storeId}/prices', respond: fail ? (req) => (req.params.storeId === '0415' ? { fault: 'CONNECTIVITY' } : { status: 200, body: { ok: true } }) : { status: 200, body: { ok: true } } }]

export default {
  id: 'fl-231',
  category: 'flows',
  title: 'Two Mule Workers Share One Oracle Work Table: Claim Rows With FOR UPDATE SKIP LOCKED, Commit the Claim, Then Call the Stores Outside the Transaction',
  level: 'ADVANCED',
  tags: ['myproject', 'oracle', 'skip-locked', 'work-table', 'outbox', 'transaction', 'scheduler', 'cluster'],
  estMinutes: 45,
  flowChecks: [
    { label: 'A Scheduler polls the work table', rule: { type: 'source', component: 'scheduler' } },
    {
      label: 'READY rows are read with FOR UPDATE SKIP LOCKED inside a transaction',
      rule: { type: 'inside', component: 'db-select', within: 'try', withinWhere: { transactionalAction: 'ALWAYS_BEGIN' }, where: { sql: { all: ['price_outbox', 'READY', 'FOR UPDATE SKIP LOCKED'] } } },
    },
    {
      label: 'The rows are marked SENDING in the same transaction',
      rule: { type: 'inside', component: ['db-bulk-update', 'db-update'], within: 'try', withinWhere: { transactionalAction: 'ALWAYS_BEGIN' }, where: { sql: 'SENDING' } },
    },
    {
      label: 'The store calls are made after the claim commits, never inside the transaction',
      rule: {
        type: 'all',
        rules: [
          { type: 'exists', component: 'http-request' },
          { type: 'absent', component: 'http-request', within: 'try', withinWhere: { transactionalAction: 'ALWAYS_BEGIN' } },
        ],
      },
    },
    { label: 'A failed call puts the row back to READY and counts the attempt', rule: { type: 'inside', component: 'db-update', within: 'on-error-continue', where: { sql: { all: ['READY', 'attempts + 1'] } } } },
  ],
  simulation: {
    systems: { db: { tables: tables(normal) }, http: storeApi(false) },
    tests: [
      {
        name: 'Two rows are ready',
        about: 'Rows 501 and 502 are claimed, sent and marked SENT. Row 503 belongs to the other worker and is left alone.',
        trigger: { schedule: {} },
        expect: {
          noError: true,
          calls: [{ method: 'POST', path: '/stores/{storeId}/prices', count: 2 }],
          db: { price_outbox: { has: [{ id: 501, status: 'SENT' }, { id: 502, status: 'SENT' }, { id: 503, status: 'SENDING' }] } },
        },
      },
      {
        name: 'Store 0415 does not answer',
        about: 'Row 501 is sent. Row 502 goes back to READY with one attempt, for the next poll.',
        trigger: { schedule: {} },
        overrides: { systems: { http: storeApi(true) } },
        expect: { noError: true, db: { price_outbox: { has: [{ id: 501, status: 'SENT' }, { id: 502, status: 'READY', attempts: 1 }] } } },
      },
      {
        name: 'Nothing is ready',
        about: 'No READY rows, so no store is called.',
        trigger: { schedule: {} },
        overrides: { systems: { db: { tables: tables([row(503, '0418', 'SENDING')]) } } },
        expect: { calls: [{ path: '/stores/{storeId}/prices', count: 0 }] },
      },
    ],
  },
  referenceFlow: design(
    flow('store-price-sender', source('scheduler', { strategy: 'fixed-frequency', frequency: 30, timeUnit: 'SECONDS' }), [
      scope('try', { transactionalAction: 'ALWAYS_BEGIN' }, [
        step('db-select', {
          database: 'Oracle',
          sql: "SELECT id, store_id, price_json FROM price_outbox WHERE status = 'READY' AND ROWNUM <= 50 FOR UPDATE SKIP LOCKED",
          target: 'claimed',
        }),
        router('choice', {}, [
          route({ expression: '#[not isEmpty(vars.claimed)]' }, [
            step('set-payload', { value: '#[vars.claimed]' }),
            step('db-bulk-update', { database: 'Oracle', sql: "UPDATE price_outbox SET status = 'SENDING' WHERE id = :id" }),
          ]),
        ]),
      ]),
      scope('foreach', { collection: '#[vars.claimed]' }, [
        step('set-variable', { variableName: 'rowId', value: '#[payload.id]' }),
        scope('try', {}, [
          step('set-payload', { value: '#[read(payload.price_json, "application/json")]' }),
          step('http-request', { method: 'POST', path: '#["/stores/" ++ payload.store ++ "/prices"]', responseTimeout: 5000 }),
          step('db-update', { database: 'Oracle', sql: "UPDATE price_outbox SET status = 'SENT' WHERE id = :rowId", inputParameters: '#[{ rowId: vars.rowId }]' }),
        ], {
          errorHandlers: [
            handler('on-error-continue', { type: 'ANY' }, [
              step('logger', { level: 'WARN', message: '#["Price row " ++ (vars.rowId as String) ++ " not sent: " ++ error.description]' }),
              step('db-update', { database: 'Oracle', sql: "UPDATE price_outbox SET status = 'READY', attempts = attempts + 1 WHERE id = :rowId", inputParameters: '#[{ rowId: vars.rowId }]' }),
            ]),
          ],
        }),
      ]),
    ]),
  ),
  description: `
Larkfield Grocers, a fictional grocery chain, sends price changes to its stores. Head office writes each change to the Oracle work table \`price_outbox\` (\`id\`, \`store_id\`, \`price_json\`, \`status\`, \`attempts\`) with status \`READY\`. Each store's system takes \`POST /stores/{storeId}/prices\` with the JSON in \`price_json\`.

The sender app runs on **two workers** in a cluster, both polling the table every 30 seconds. Before Christmas the first version sent some prices twice (both workers read the same rows), and once it held row locks for minutes while a slow store answered, which blocked head office from writing new prices.

**Requirements**
- Poll every 30 seconds and take up to 50 \`READY\` rows that no other worker is taking.
- Mark them \`SENDING\` in the same transaction as the read, and commit before calling any store.
- Send each row. Mark it \`SENT\` when the store accepts it. If the call fails, set it back to \`READY\` and add 1 to \`attempts\`, so the next poll tries again.
- One store failing must not stop the others.

**Design the flow.**
`,
  answerTemplate: `## Claiming rows without clashing

## Keeping the transaction short

## Sending and marking
`,
  keyPoints: [
    'FOR UPDATE locks the rows read. SKIP LOCKED makes the other worker skip them instead of waiting, so the two workers take different rows at the same time.',
    'Marking the rows SENDING in the same transaction turns a short lock into a lasting claim. After the commit no lock is held, but the status keeps others away.',
    'Never call a slow system while holding database locks. The transaction ends before the first HTTP call.',
    'Each row has its own Try, so a store that is down puts only its own row back to READY.',
    'A worker that crashes after the claim leaves rows in SENDING. A sweeper that resets SENDING rows older than a few minutes, or a claimed_at column, covers that.',
  ],
  solution: `
1. **Scheduler** every 30 seconds (no Primary Node Only: both workers poll).
2. **Try** ALWAYS_BEGIN:
   - **Database Select** \`... WHERE status = 'READY' AND ROWNUM <= 50 FOR UPDATE SKIP LOCKED\`, Target \`claimed\`.
   - **Choice** not empty: payload = \`vars.claimed\`, **Bulk Update** \`SET status = 'SENDING' WHERE id = :id\`.
3. **For Each** \`vars.claimed\`: \`rowId\`, then a **Try**:
   - payload = the parsed \`price_json\`, **HTTP Request** \`POST /stores/{store}/prices\`, timeout 5 s.
   - **Database Update** \`SENT\`.
   - **On Error Continue**: WARN, **Database Update** \`status = 'READY', attempts = attempts + 1\`.

**ROWNUM and SKIP LOCKED.** Oracle applies ROWNUM before skipping locked rows, so a poll can return fewer than 50 even when more are free. That is fine here, the next poll takes them. Fetching with a larger limit and claiming 50 is the usual fix when it matters.

**Give up after a while.** Stop at, say, 10 attempts: set the row to \`FAILED\` and alert, so a store that is gone for good does not get tried for ever.
`,
  followUps: [
    {
      q: 'Why not run the Scheduler on the primary node only?',
      a: 'That also stops the clash, but then one worker does all the sending and the other sits idle. SKIP LOCKED lets both share the work and keeps going if one dies.',
    },
    {
      q: 'Could the rows be sent in the same transaction and marked SENT at the end?',
      a: 'The locks would be held for the whole send, and a crash half way would roll back the SENT marks for stores that already got their prices, so they would get them twice.',
    },
  ],
}
