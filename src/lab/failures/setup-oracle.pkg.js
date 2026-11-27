// The sample application of the setup-oracle lab. Imports only platform-log.js, so the engine can load it without a
// cycle. The app reaches Oracle through ctx.db (src/lab/platform-db.js), so its user, its grants and its pool show in
// the Databases console.
import { info, muleError, needs, warn } from '../platform-log.js'

export const DB = 'harbor-ora'
export const NAME = 'harbor-carrier-events-sapi'
export const JAR = `${NAME}-1.0.0-mule-application.jar`
export const EVENTS = 'HARBOR.SHIPMENT_EVENTS'
export const SHIPMENTS = 'HARBOR.SHIPMENTS'
const FLOW = 'post:\\tracking-events:application\\json:carrier-events-config'
const keep = (list, item, n = 30) => [...(list ?? []), item].slice(-n)
const json = (x) => JSON.stringify(x)

// The Oracle JDBC thin URL: //host:port/service for a service name, host:port:SID for a SID
export function urlOf(url) {
  const text = String(url ?? '').trim()
  let m = text.match(/^jdbc:oracle:thin:@\/\/([\w.-]+):(\d+)\/([\w.$#]+)$/i)
  if (m) return { host: m[1], port: m[2], service: m[3] }
  m = text.match(/^jdbc:oracle:thin:@([\w.-]+):(\d+):([\w$#]+)$/i)
  if (m) return { host: m[1], port: m[2], sid: m[3] }
  return null
}
// a Generic Connection with driverClassName oracle.jdbc.OracleDriver, read from the properties of the app
export const cfgOf = (p) => ({ ...urlOf(p['db.url']), user: p['db.user'], password: p['db.password'], maxPoolSize: p['db.pool.max'], maxWait: '10', queryTimeout: p['db.queryTimeout'] })
const el = (at, name, op) => ({ flow: FLOW, file: NAME, at, name, dsl: `<db:${op} doc:name="${name}" config-ref="Oracle_Config" queryTimeout="\${db.queryTimeout}">` })
const failed = (r, at, status = 500) => ({ status, ms: (r.ms ?? 30) + 20, error: r.errorType, log: [muleError({ ...at, type: r.errorType, message: r.text })], body: json({ message: status === 503 ? 'Database unavailable' : 'Internal server error' }) })
const badUrl = (url) => ({ ok: false, errorType: 'DB:CONNECTIVITY', text: `java.sql.SQLException: Invalid Oracle URL specified: ${url || '(empty)'}`, ms: 5 })

export const PACKAGES = {
  [NAME]: {
    note: `Carrier tracking events into Oracle ${DB}. POST /tracking-events with {"shipmentId","status","location"} inserts one row into ${EVENTS} and sets STATUS in ${SHIPMENTS}, in one transaction. An event for a shipment that does not exist fails on the foreign key (ORA-02291), is rolled back and answered 422. GET /health reads one row of ${EVENTS}. Properties: db.url (the JDBC URL), db.user, db.password (protected), db.pool.max (maxPoolSize), db.queryTimeout (seconds).`,
    sample: { method: 'GET', path: '/health' },
    boot: needs('db.url', 'db.user', 'db.password'),
    handle(ctx, req) {
      const store = (ctx.app.store ??= {})
      const cfg = cfgOf(ctx.props)
      const path = req.path.split('?')[0]
      const url = urlOf(ctx.props['db.url'])
      if (req.method === 'GET' && path === '/health') {
        const r = url ? ctx.db.select(DB, cfg, `SELECT EVENT_ID FROM ${EVENTS} FETCH FIRST 1 ROWS ONLY`) : badUrl(ctx.props['db.url'])
        if (!r.ok) return failed(r, el(1, 'Check database', 'select'), 503)
        return { status: 200, ms: r.ms + 6, log: [info(`Health check: SELECT on ${EVENTS} as ${String(cfg.user).toUpperCase()} answered in ${r.ms} ms`)], body: json({ status: 'UP', service: url.service ?? null, maxPoolSize: Number(cfg.maxPoolSize) || 5 }) }
      }
      if (req.method !== 'POST' || path !== '/tracking-events') return { status: 404, ms: 4, error: 'APIKIT:NOT_FOUND', body: json({ message: 'Resource not found' }) }
      let e = null
      try {
        e = JSON.parse(req.body || 'null')
      } catch {
        e = null
      }
      if (!e || !Number.isFinite(Number(e.shipmentId)) || !String(e.status ?? '').trim()) return { status: 400, ms: 6, error: 'APIKIT:BAD_REQUEST', log: [warn('APIKIT:BAD_REQUEST: the body needs a numeric shipmentId and a status')], body: json({ message: 'Bad request: shipmentId and status are required' }) }
      if (!url) return failed(badUrl(ctx.props['db.url']), el(1, 'Insert event', 'insert'))
      store.n = (store.n ?? 0) + 1
      const id = 900000 + store.n
      const ship = Number(e.shipmentId)
      const status = String(e.status).trim().toUpperCase()
      const r = ctx.db.transaction(DB, cfg, (tx) => {
        const ins = tx.insert(`INSERT INTO ${EVENTS} (EVENT_ID, SHIPMENT_ID, STATUS, EVENT_AT, LOCATION) VALUES (:id, :ship, :status, SYSTIMESTAMP, :loc)`, { id, ship, status, loc: String(e.location ?? '') })
        if (!ins.ok) return { step: el(2, 'Insert event', 'insert') }
        const up = tx.update(`UPDATE ${SHIPMENTS} SET STATUS = :status WHERE SHIPMENT_ID = :ship`, { status, ship })
        if (!up.ok) return { step: el(3, 'Update shipment status', 'update') }
        return {}
      })
      if (r.ok) {
        store.created = keep(store.created, { id, ship, status, t: ctx.now })
        return { status: 201, ms: r.ms + 14, log: [info(`Event ${id}: shipment ${ship} is ${status}. Inserted and committed in one transaction.`)], body: json({ eventId: id, shipmentId: ship, status }) }
      }
      // on-error-continue for DB:QUERY_EXECUTION with ORA-02291: the transaction is rolled back and the carrier gets 422
      if (r.code === 2291) {
        store.rejected = keep(store.rejected, { ship, status, t: ctx.now })
        return { status: 422, ms: (r.ms ?? 5) + 20, error: 'DB:QUERY_EXECUTION', log: [warn(`Event for shipment ${ship} rejected: ${r.text.replace(/^[\w.]+Exception: /, '')} The transaction was rolled back. Body kept in the log for the carrier desk: ${req.body}`)], body: json({ message: `Unknown shipment ${ship}` }) }
      }
      return failed(r, r.value?.step ?? el(2, 'Insert event', 'insert'))
    },
  },
}
