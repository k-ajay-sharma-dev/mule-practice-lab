// The sample application of the end to end lab of Snowflake. Imports only platform-log.js and the import free Snowflake
// engine, so the engine can load it without a cycle. The daily sales of the order database (SQL Server BrightmartOrders,
// dbo.orders) are staged as CSV in Snowflake, copied into a staging table and merged into DAILY_SALES.
import { info, line, muleError, needs } from '../platform-log.js'
import { cfgOf, fileStamp, tsText } from '../platform-snowflake.js'

export const SF_PKG = 'brightmart-e2e-sales-dw-loader'
export const SF_FLOW = 'daily-sales-flow'
export const SF_HEADER = 'ORDER_ID,CUSTOMER_ID,STATUS,TOTAL,ORDER_TS,BUSINESS_DATE'
// lab-made: the app reaches the database server of its db.host; the lab has a Sandbox and a Production order database
export const SOURCES = { 'sql.brightmart.lab': 'brightmart-sql', 'sql-prd.brightmart.lab': 'brightmart-sql-prd' }
const BASE = Date.UTC(2026, 10, 2)
const DAY = 86400000
const dayOf = (t) => new Date(BASE + t).toISOString().slice(0, 10)
const word = (v) => String(v ?? '').trim()
const json = (o) => JSON.stringify(o)
const SELECT = 'SELECT order_id, customer_id, status, total, created_at FROM dbo.orders WHERE created_at >= :from AND created_at < :to'
const MERGE = (now) =>
  `MERGE INTO DAILY_SALES t USING SALES_STG s ON t.ORDER_ID = s.ORDER_ID WHEN MATCHED THEN UPDATE SET CUSTOMER_ID = s.CUSTOMER_ID, STATUS = s.STATUS, TOTAL = s.TOTAL, ORDER_TS = s.ORDER_TS, BUSINESS_DATE = s.BUSINESS_DATE, LOADED_AT = '${now}' WHEN NOT MATCHED THEN INSERT (ORDER_ID, CUSTOMER_ID, STATUS, TOTAL, ORDER_TS, BUSINESS_DATE, LOADED_AT) VALUES (s.ORDER_ID, s.CUSTOMER_ID, s.STATUS, s.TOTAL, s.ORDER_TS, s.BUSINESS_DATE, '${now}')`
const el = (flow) => ({
  select: { flow, at: 1, name: 'Select orders of the day', dsl: '<db:select doc:name="Select orders of the day" config-ref="Orders_Database_Config">' },
  stage: { flow, at: 3, name: 'PUT sales file', dsl: '<snowflake:execute-script doc:name="PUT sales file" config-ref="Snowflake_Config">' },
  copy: { flow, at: 4, name: 'COPY INTO SALES_STG', dsl: '<snowflake:execute-script doc:name="COPY INTO SALES_STG" config-ref="Snowflake_Config">' },
  merge: { flow, at: 5, name: 'MERGE INTO DAILY_SALES', dsl: '<snowflake:execute-script doc:name="MERGE INTO DAILY_SALES" config-ref="Snowflake_Config">' },
})
const sfErr = (r, e) => muleError({ ...e, file: SF_PKG, type: r.type, message: `net.snowflake.client.jdbc.SnowflakeSQLException: ${r.text}` })

// The DataWeave mapping of the flow: rows of dbo.orders to the CSV the stage takes
export const toCsv = (rows, date) => `${SF_HEADER}\n${rows.map((r) => [r.order_id, r.customer_id, r.status, Number(r.total).toFixed(2), r.created_at, date].join(',')).join('\n')}\n`

// Loads one business date: extract from SQL Server, PUT, COPY into the empty staging table, MERGE into DAILY_SALES.
// A row COPY rejects stays out of the merge and is kept by Snowflake for VALIDATE; the load of that date is PARTIAL
// until it is loaded again after the fix. Loading a date again is safe: MERGE updates what is there.
function load(ctx, date, cid, flow) {
  const p = ctx.props
  const e = el(flow)
  const src = SOURCES[word(p['db.host']).toLowerCase()] ?? 'brightmart-sql'
  const db = ctx.db.select(src, { host: p['db.host'], database: p['db.database'], user: p['db.user'], password: p['db.password'] }, SELECT, { from: `${date} 00:00:00`, to: `${dayOf(Date.parse(`${date}T00:00:00Z`) - BASE + DAY)} 00:00:00` })
  if (!db.ok) return { ok: false, type: db.errorType, log: [muleError({ ...e.select, file: SF_PKG, type: db.errorType, message: db.text })], ms: db.ms ?? 30 }
  const log = [info(`correlationId=${cid} ${db.rows.length} orders of ${date} read from ${p['db.database']} on ${p['db.host']}`)]
  const cfg = cfgOf(p)
  const stage = `@${word(p['snowflake.stage']).replace(/^@/, '')}`
  const trunc = ctx.snowflake.execute(cfg, 'TRUNCATE TABLE SALES_STG')
  if (!trunc.ok) return { ok: false, type: trunc.type, log: [...log, sfErr(trunc, e.copy)], ms: trunc.ms }
  const csv = toCsv(db.rows, date)
  const put = ctx.snowflake.put(cfg, stage, { name: `sales_${date.replace(/-/g, '')}_${fileStamp(ctx.now)}.csv`, content: csv })
  if (!put.ok) return { ok: false, type: put.type, log: [...log, sfErr(put, e.stage)], ms: put.ms }
  const copy = ctx.snowflake.execute(cfg, `COPY INTO SALES_STG FROM ${stage} FILES = ('${put.name}') ON_ERROR = CONTINUE`)
  if (!copy.ok) return { ok: false, type: copy.type, log: [...log, info(`PUT ${put.name}: ${put.status}`), sfErr(copy, e.copy)], ms: put.ms + copy.ms }
  const f = copy.stats?.files?.[0] ?? { loaded: 0, errors: 0, parsed: 0, status: 'LOADED' }
  log.push(info(`correlationId=${cid} PUT ${put.name} ${put.status}; COPY INTO SALES_STG (query ${copy.qid}): ${f.status ?? 'LOADED'}, ${f.loaded} of ${f.parsed} rows`))
  if (f.errors) log.push(line('ERROR', `correlationId=${cid} COPY rejected ${f.errors} row${f.errors === 1 ? '' : 's'} of ${put.name}. First error at line ${f.firstLine} (ORDER_ID ${csv.split('\n')[f.firstLine - 1]?.split(',')[0] ?? '?'}): ${f.firstError}. The row is not merged; Snowflake keeps it for VALIDATE(SALES_STG, JOB_ID => '${copy.qid}'). Load ${date} again after the fix.`))
  const merge = ctx.snowflake.execute(cfg, MERGE(tsText(ctx.now)))
  if (!merge.ok) return { ok: false, type: merge.type, log: [...log, sfErr(merge, e.merge)], ms: put.ms + copy.ms + merge.ms }
  const [inserted, updated] = merge.rows[0] ?? [0, 0]
  log.push(info(`correlationId=${cid} MERGE INTO DAILY_SALES (query ${merge.qid}): ${inserted} inserted, ${updated} updated`))
  const result = { t: ctx.now, cid, source: db.rows.length, loaded: f.loaded, rejected: f.errors ?? 0, inserted, updated, file: put.name, copyQuery: copy.qid, ...(f.errors && { firstError: f.firstError }), status: f.errors ? 'PARTIAL' : 'COMPLETE' }
  return { ok: true, result, log, ms: put.ms + copy.ms + merge.ms + 60 }
}
const keepLoads = (loads, date, r) => Object.fromEntries(Object.entries({ ...loads, [date]: r }).slice(-10))

export const PACKAGES = {
  [SF_PKG]: {
    note: `Sales Load API of Brightmart. The flow ${SF_FLOW} runs at 02:30 UTC and loads the business date before: it selects the orders of that date from dbo.orders of db.database on db.host, writes them as CSV with the header ${SF_HEADER}, TRUNCATEs SALES_STG, PUTs the file to the internal stage snowflake.stage with a name that holds the date and the run time, runs COPY INTO SALES_STG FILES = (that file) ON_ERROR = CONTINUE and MERGEs SALES_STG into DAILY_SALES on ORDER_ID. A row COPY rejects is logged with the Snowflake error and the load of the date is PARTIAL. GET /loads/{date} shows the last load of a date; POST /loads with {"date":"2026-11-02"} loads a date again (422 when rows were rejected). Logs carry correlationId per load. Properties: db.host, db.database, db.user, the secure db.password, snowflake.account, snowflake.user, the secure snowflake.privateKey, snowflake.role, snowflake.warehouse, snowflake.database, snowflake.schema, snowflake.stage.`,
    sample: { method: 'GET', path: '/loads/2026-11-02', body: '' },
    traced: true,
    boot: needs('db.host', 'db.database', 'db.user', 'db.password', 'snowflake.account', 'snowflake.user', 'snowflake.privateKey', 'snowflake.role', 'snowflake.warehouse', 'snowflake.database', 'snowflake.schema', 'snowflake.stage'),
    schedules: [{ flow: SF_FLOW, type: 'cron', value: '0 30 2 * * ?', tz: 'UTC', enabled: true }],
    handle(ctx, req) {
      const path = req.path.split('?')[0].replace(/\/+$/, '')
      const m = path.match(/^\/loads\/(\d{4}-\d{2}-\d{2})$/)
      if (req.method === 'GET' && m) {
        const r = ctx.store.loads?.[m[1]]
        return r ? { status: 200, ms: 8, flow: 'get:\\loads\\(date):sales-load-api-config', body: json({ date: m[1], ...r }) } : { status: 404, ms: 6, flow: 'get:\\loads\\(date):sales-load-api-config', body: json({ message: `No load of ${m[1]} yet` }) }
      }
      if (req.method === 'POST' && path === '/loads') {
        const flow = 'post:\\loads:application\\json:sales-load-api-config'
        let b = {}
        try {
          b = JSON.parse(req.body || '{}') ?? {}
        } catch {
          b = {}
        }
        const date = word(b.date)
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Date.parse(`${date}T00:00:00Z`) - BASE > ctx.now) return { status: 400, ms: 4, flow, error: 'APIKIT:BAD_REQUEST', body: json({ message: 'Give date as 2026-11-02, not in the future' }) }
        const cid = `sales-${date}-${fileStamp(ctx.now)}`
        const x = load(ctx, date, cid, flow)
        if (!x.ok) return { status: 502, ms: x.ms, flow, error: x.type, log: x.log, body: json({ message: 'The load failed', error: x.type }) }
        ctx.app.store = { ...ctx.store, loads: keepLoads(ctx.store.loads, date, x.result) }
        // lab-made error type for a load with rejected rows
        if (x.result.rejected) return { status: 422, ms: x.ms, flow, error: 'SALES:REJECTED_ROWS', log: x.log, body: json({ date, ...x.result }) }
        return { status: 200, ms: x.ms, flow, log: x.log, body: json({ date, ...x.result }) }
      }
      return { status: 404, ms: 3, error: 'APIKIT:NOT_FOUND', flow: 'sales-load-api-main', body: json({ message: 'Resource not found' }) }
    },
    run: {
      [SF_FLOW]: (ctx) => {
        const date = dayOf(ctx.now - DAY)
        const cid = `sales-${date}-${fileStamp(ctx.now)}`
        const x = load(ctx, date, cid, SF_FLOW)
        if (!x.ok) return { ok: false, ms: x.ms, errorType: x.type, log: x.log }
        return { ok: !x.result.rejected, ms: x.ms, errors: x.result.rejected, errorType: x.result.rejected ? 'SALES:REJECTED_ROWS' : null, log: x.log, store: { loads: keepLoads(ctx.store.loads, date, x.result) } }
      },
    },
  },
}
