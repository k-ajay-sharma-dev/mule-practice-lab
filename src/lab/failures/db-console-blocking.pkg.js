// The sample applications of the db-console-blocking lab. Imports only platform-log.js, so the engine can load it
// without a cycle. The apps reach SQL Server through ctx.db (src/lab/platform-db.js), so their locks, sessions and
// pools show in the Databases console.
import { info, muleError, needs, warn } from '../platform-log.js'

export const DB = 'harbor-sql'
export const REFUND = 'harbor-refund-sapi'
export const STATUS = 'harbor-order-status-sapi'
export const STOCK = 'harbor-stock-sapi'
// lab-made: the caller of a read API gives up after 30 seconds and the lab writes that as 504
const CALLER_TIMEOUT_MS = 30000
const body500 = '{"message":"Internal server error"}'

const num = (v) => (String(v ?? '').trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null)
// the Mule Database config of an app, read from its properties
export const cfgOf = (p) => ({ user: p['db.user'], password: p['db.password'], maxPoolSize: p['db.pool.max'], maxWait: p['db.pool.maxWait'], queryTimeout: p['db.queryTimeout'], transactionTimeout: p['tx.timeout'] })
export const settingsOf = (p) => ({ outside: String(p['tx.remoteCall'] ?? '').trim().toLowerCase() === 'outside', queryTimeout: num(p['db.queryTimeout']) ?? 0, txTimeout: num(p['tx.timeout']) ?? 0 })

const where = (flow, file, at, name, dsl) => ({ flow, file, at, name, dsl })
const failed = (r, at, flow) => {
  const error = { ...at, type: r.errorType, message: r.text }
  return { status: 500, ms: Math.round(r.ms ?? 30) + 20, flow, error: r.errorType, log: [muleError(error)], body: body500 }
}
// a read that waits on a lock or on a free connection: the flow does not answer and the caller gives up
const waiting = (r, flow, what) => ({ status: 504, ms: CALLER_TIMEOUT_MS, flow, error: 'HTTP:TIMEOUT', log: [warn(`${what}: no answer after ${CALLER_TIMEOUT_MS / 1000} s. ${r.text}`)], body: '{"message":"Gateway timeout"}' })

function reader(file, flow, name, sql, param) {
  return {
    note: `A read API on SQL Server ${DB}. The Select has queryTimeout from db.queryTimeout (seconds, 0 is none). The pooling profile reads maxPoolSize from db.pool.max and maxWait (seconds) from db.pool.maxWait.`,
    boot: needs('db.user', 'db.password', 'db.pool.max'),
    handle(ctx, req) {
      const path = req.path.split('?')[0]
      const value = param(path, req.path)
      if (!value) return { status: 404, ms: 5, error: 'APIKIT:NOT_FOUND', flow: `${file}-main`, body: '{"message":"Resource not found"}' }
      const at = where(flow, file, 1, name, `<db:select doc:name="${name}" config-ref="SqlServer_Config" queryTimeout="\${db.queryTimeout}">`)
      const r = ctx.db.select(DB, cfgOf(ctx.props), sql, value)
      if (r.hung) return waiting(r, flow, `${req.method} ${req.path}`)
      if (!r.ok) {
        // lab-made: one full error block a minute, a short line for the rest, so a saved console stays small
        const minute = Math.floor(ctx.now / 60000)
        if (ctx.store.logged === minute) return { ...failed(r, at, flow), log: [warn(`${r.errorType}: ${r.text.slice(0, 120)}`)] }
        ctx.store.logged = minute
        return failed(r, at, flow)
      }
      return { status: 200, ms: r.ms + 18, flow, body: JSON.stringify(r.rows) }
    },
  }
}

export const PACKAGES = {
  [REFUND]: {
    note: `Refunds on SQL Server ${DB}. POST /refunds/{orderId} sets the order to REFUND_PENDING and puts its items back in stock in one transaction, and calls the payment provider at provider.url. tx.remoteCall is inside (the provider is called inside the transaction) or outside (after the commit). tx.timeout is the transaction timeout in seconds, empty for none. db.queryTimeout is the queryTimeout of each statement in seconds.`,
    sample: { method: 'POST', path: '/refunds/O-1007' },
    boot: needs('db.user', 'db.password', 'db.pool.max', 'provider.url', 'tx.remoteCall'),
    handle(ctx, req) {
      const m = req.path.split('?')[0].match(/^\/refunds\/([\w-]+)$/)
      if (!m || req.method !== 'POST') return { status: 404, ms: 5, error: 'APIKIT:NOT_FOUND', flow: `${REFUND}-main`, body: '{"message":"Resource not found"}' }
      const id = m[1]
      const set = settingsOf(ctx.props)
      const flow = 'post:\\refunds\\(orderId)'
      const at = (n, name) => where(flow, REFUND, n, name, `<db:update doc:name="${name}" config-ref="SqlServer_Config" queryTimeout="\${db.queryTimeout}">`)
      const provider = `${ctx.props['provider.url']}/refunds`
      // the payment provider takes the call and never answers (lab-made)
      const r = ctx.db.transaction(DB, cfgOf(ctx.props), (tx) => {
        const order = tx.update("UPDATE dbo.orders SET status = 'REFUND_PENDING' WHERE order_id = :id", { id })
        if (!order.ok) return { step: at(2, 'Mark order refund pending') }
        const lines = tx.select('SELECT sku, qty FROM dbo.order_lines WHERE order_id = :id', { id })
        if (!lines.ok) return { step: at(3, 'Read order lines') }
        for (const l of lines.rows) {
          const back = tx.update('UPDATE dbo.stock SET qty = qty + :qty WHERE sku = :sku', { qty: l.qty, sku: l.sku })
          if (!back.ok) return { step: at(4, 'Put items back in stock') }
        }
        if (!set.outside) tx.hold(`POST ${provider} for ${id} is waiting for an answer inside the transaction.`)
        return { lines: lines.rows.length }
      })
      if (r.hung) return { status: 504, ms: CALLER_TIMEOUT_MS, flow, error: 'HTTP:TIMEOUT', log: [warn(`Refund ${id}: the flow waits on the database. ${r.text}`)], body: '{"message":"Gateway timeout"}' }
      if (!r.ok) return failed(r, r.value?.step ?? at(2, 'Mark order refund pending'), flow)
      if (r.held) {
        ctx.store.held = { id, session: r.session, t: ctx.now }
        return { status: 504, ms: CALLER_TIMEOUT_MS, flow, error: 'HTTP:TIMEOUT', log: [info(`Refund ${id}: order and stock updated in the open transaction. Calling POST ${provider}.`), warn(`Refund ${id}: POST ${provider} has not answered. The flow still waits inside the Try scope, so the transaction stays open.`)], body: '{"message":"Gateway timeout"}' }
      }
      // outside: the transaction is committed and the provider call runs after it (lab-made: a retry from a queue)
      ctx.store.lastOk = ctx.now
      return { status: 202, ms: r.ms + 40, flow, log: [info(`Refund ${id}: committed in ${r.ms} ms. The provider call runs after the commit and holds no lock.`)], body: `{"orderId":"${id}","status":"REFUND_PENDING"}` }
    },
  },
  [STATUS]: reader(STATUS, 'get:\\customers\\(customerId)\\orders', 'Select orders of customer', 'SELECT order_id, status, total FROM dbo.orders WHERE customer_id = :c', (path) => {
    const m = path.match(/^\/customers\/([\w-]+)\/orders$/)
    return m && { c: m[1] }
  }),
  [STOCK]: reader(STOCK, 'get:\\stock', 'Select stock of warehouse', 'SELECT sku, qty, reserved FROM dbo.stock WHERE warehouse = :w', (path, full) => {
    const w = path === '/stock' && (full.match(/[?&]warehouse=([\w-]+)/) ?? [])[1]
    return w && { w }
  }),
}
