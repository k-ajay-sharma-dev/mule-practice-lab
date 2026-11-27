// The sample application of the setup-sqlserver lab. Imports only platform-log.js, so the engine can load it without a
// cycle. The app reaches SQL Server through ctx.db (src/lab/platform-db.js), so its login, its grants and its pool show
// in the Databases console.
import { info, muleError, needs, warn } from '../platform-log.js'

export const DB = 'brightmart-sql'
export const NAME = 'brightmart-mkt-orders-sapi'
export const JAR = `${NAME}-1.0.0-mule-application.jar`
export const DATABASE = 'BrightmartMarketplace'
export const TABLE = 'dbo.orders'
const FLOW = 'post:\\orders:application\\json:mkt-orders-config'
const keep = (list, item, n = 30) => [...(list ?? []), item].slice(-n)
const json = (x) => JSON.stringify(x)

// the Mule Database config of the app (an MS SQL Server connection), read from its properties
export const cfgOf = (p) => ({ host: p['db.host'], port: p['db.port'], database: p['db.database'], user: p['db.user'], password: p['db.password'], maxPoolSize: p['db.pool.max'], maxWait: '10', queryTimeout: p['db.queryTimeout'] })
const el = (at, name, op) => ({ flow: FLOW, file: NAME, at, name, dsl: `<db:${op} doc:name="${name}" config-ref="Database_Config" queryTimeout="\${db.queryTimeout}">` })
const failed = (r, at, status = 500) => ({ status, ms: (r.ms ?? 30) + 20, error: r.errorType, log: [muleError({ ...at, type: r.errorType, message: r.text })], body: json({ message: status === 503 ? 'Database unavailable' : 'Internal server error' }) })

export const PACKAGES = {
  [NAME]: {
    note: `Marketplace orders into SQL Server ${DB}. POST /orders with {"marketplaceRef","customerId","total"} inserts one row into ${TABLE} with a new Brightmart order_id. A duplicate key error (2601 or 2627) is caught by on-error-continue and answered 409 with the stored order. GET /orders/{marketplaceRef} reads one order, GET /health runs a SELECT TOP 1 on the table. Properties: db.host, db.port, db.database, db.user, db.password (protected), db.pool.max (maxPoolSize), db.queryTimeout (seconds).`,
    sample: { method: 'GET', path: '/health' },
    boot: needs('db.host', 'db.port', 'db.database', 'db.user', 'db.password'),
    handle(ctx, req) {
      const store = (ctx.app.store ??= {})
      const cfg = cfgOf(ctx.props)
      const path = req.path.split('?')[0]
      if (req.method === 'GET' && path === '/health') {
        const r = ctx.db.select(DB, cfg, `SELECT TOP 1 order_id FROM ${TABLE}`)
        if (!r.ok) return failed(r, el(1, 'Check database', 'select'), 503)
        return { status: 200, ms: r.ms + 6, log: [info(`Health check: SELECT on ${TABLE} as ${cfg.user} answered in ${r.ms} ms`)], body: json({ status: 'UP', database: cfg.database, maxPoolSize: Number(cfg.maxPoolSize) || 5 }) }
      }
      const one = path.match(/^\/orders\/([\w-]+)$/)
      if (req.method === 'GET' && one) {
        const r = ctx.db.select(DB, cfg, `SELECT order_id, marketplace_ref, customer_id, status, total FROM ${TABLE} WHERE marketplace_ref = :ref`, { ref: one[1] })
        if (!r.ok) return failed(r, el(1, 'Select order', 'select'))
        return r.rows.length ? { status: 200, ms: r.ms + 8, body: json(r.rows[0]) } : { status: 404, ms: r.ms + 8, body: json({ message: `No order ${one[1]}` }) }
      }
      if (req.method !== 'POST' || path !== '/orders') return { status: 404, ms: 4, error: 'APIKIT:NOT_FOUND', body: json({ message: 'Resource not found' }) }
      let o = null
      try {
        o = JSON.parse(req.body || 'null')
      } catch {
        o = null
      }
      if (!o || !String(o.marketplaceRef ?? '').trim() || !String(o.customerId ?? '').trim() || !Number.isFinite(Number(o.total))) {
        return { status: 400, ms: 6, error: 'APIKIT:BAD_REQUEST', log: [warn('APIKIT:BAD_REQUEST: the body needs marketplaceRef, customerId and a numeric total')], body: json({ message: 'Bad request: marketplaceRef, customerId and total are required' }) }
      }
      store.n = (store.n ?? 0) + 1
      const id = `HO-${4000 + store.n}`
      const ref = String(o.marketplaceRef).trim()
      const r = ctx.db.insert(DB, cfg, `INSERT INTO ${TABLE} (order_id, marketplace_ref, customer_id, status, total, created_at) VALUES (:id, :ref, :customer, 'NEW', :total, SYSDATETIME())`, { id, ref, customer: String(o.customerId), total: Number(o.total) })
      if (r.ok) {
        store.created = keep(store.created, { id, ref, t: ctx.now })
        return { status: 201, ms: r.ms + 12, log: [info(`Order ${ref} stored as ${id} in ${TABLE}`)], body: json({ orderId: id, marketplaceRef: ref, status: 'NEW' }) }
      }
      // on-error-continue type="DB:QUERY_EXECUTION" when="#[error.errorMessage.payload.errorCode == 2601 or ... == 2627]"
      if (r.code === 2601 || r.code === 2627) {
        const had = ctx.db.select(DB, cfg, `SELECT order_id FROM ${TABLE} WHERE marketplace_ref = :ref`, { ref })
        const stored = had.ok ? had.rows[0]?.order_id : null
        store.duplicates = keep(store.duplicates, { ref, t: ctx.now, code: r.code })
        return { status: 409, ms: r.ms + 20, error: 'DB:QUERY_EXECUTION', log: [warn(`Order ${ref} came again. SQL Server error ${r.code}: ${r.text.replace(/^[\w.]+Exception: /, '')} on-error-continue answered 409, nothing was written twice.`)], body: json({ message: `Order ${ref} is stored already`, orderId: stored }) }
      }
      return failed(r, el(2, 'Insert order', 'insert'))
    },
  },
}
