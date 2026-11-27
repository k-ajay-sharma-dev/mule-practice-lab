// The sample applications of the end to end lab of Anypoint MQ. Imports only platform-log.js, so the engine can load it
// without a cycle.
//
// e2e-returns-eapi is the Returns Experience API the team built in Studio on the spec of Exchange: POST /returns checks
// the request, maps it in DataWeave and publishes it to an Anypoint MQ queue, and the portal gets 202 at once.
// returns-process-papi is the Process API of the returns team: its Subscriber takes each request and writes it into
// the returns database on SQL Server through ctx.db (platform-db.js), so the record shows in the Databases screen. A
// request whose store is not in dbo.stores fails, and the queue moves it to its dead letter queue after its deliveries.
import { info, needs, warn } from '../platform-log.js'

export const EAPI_PKG = 'e2e-returns-eapi'
export const PAPI_PKG = 'returns-process-papi'
export const ASSET = 'returns-experience-api'
export const QUEUE = 'returns.requests'
export const DLQ = 'returns.requests.dlq'
export const MQ_URL = 'https://mq-us-east-1.anypoint.mulesoft.com/api/v1'
export const DB = 'brightmart-sql' // Sandbox: sql.brightmart.lab
export const DB_PRD = 'brightmart-sql-prd' // Production: sql-prd.brightmart.lab
export const DATABASE = 'BrightmartReturns'
export const DB_USER = 'svc_returns_mule'
export const DB_PW = { sbx: 'Returns-Lab-2026', prd: 'Returns-Prd-Lab-2026' }
export const TABLE = 'dbo.return_requests'
export const STORES = 'dbo.stores'
export const RETURN = '{"returnId":"R-77012","orderId":"O-50017","storeId":"S-12","sku":"FL-20","qty":1,"amount":42.25,"reason":"damaged"}'
export const NEW_STORE = '{"returnId":"R-77013","orderId":"O-50031","storeId":"S-31","sku":"LM-31","qty":2,"amount":31.8,"reason":"wrong size"}'
const EAPI_FLOW = 'post:\\returns:application\\json:returns-experience-api-config'
const FLOW = 'return-request-subscriber-flow'

const clean = (v) => String(v ?? '').trim()
const keep = (list, item, n = 200) => [...(list ?? []), item].slice(-n)
const BROKER = /^https:\/\/mq-[a-z]{2}-[a-z]+-\d\.anypoint\.mulesoft\.com\/api\/v1\/?$/
// the Database config of the Process API. The lab has one server per environment, picked by the host.
export const serverFor = (props) => (/^sql-prd\./i.test(clean(props['db.host'])) ? DB_PRD : /^sql\./i.test(clean(props['db.host'])) ? DB : clean(props['db.host']) || DB)
const cfgOf = (p) => ({ host: p['db.host'], database: p['db.database'], user: p['db.user'], password: p['db.password'], maxPoolSize: '2', maxWait: '10', queryTimeout: '10' })
const STORES_DEF = {
  columns: [['store_id', 'varchar(8)'], ['name', 'varchar(60)'], ['region', 'varchar(12)']],
  pk: ['store_id'],
  rows: [
    { store_id: 'S-10', name: 'Brightmart Old Town', region: 'east' },
    { store_id: 'S-11', name: 'Brightmart Mill Lane', region: 'east' },
    { store_id: 'S-12', name: 'Brightmart Port Elm', region: 'east' },
    { store_id: 'S-13', name: 'Brightmart Westgate', region: 'west' },
    { store_id: 'S-14', name: 'Brightmart Cedar Point', region: 'west' },
  ],
}
const TABLE_DEF = {
  columns: [['return_id', 'varchar(20)'], ['order_id', 'varchar(20)'], ['store_id', 'varchar(8)'], ['sku', 'varchar(20)'], ['qty', 'int'], ['refund_amount', 'decimal(12,2)'], ['reason_code', 'varchar(20)'], ['status', 'varchar(16)'], ['correlation_id', 'varchar(64)', true]],
  pk: ['return_id'],
}

export function readReturn(body) {
  try {
    const r = JSON.parse(body)
    return r && typeof r.returnId === 'string' && r.returnId && typeof r.storeId === 'string' && r.storeId && Number(r.amount) > 0 && Number(r.qty) > 0 ? r : null
  } catch {
    return null
  }
}
// The DataWeave of the Experience API: the request of the portal as the message of the queue
export const toMessage = (r, cid) => ({ returnId: r.returnId, orderId: r.orderId, storeId: r.storeId, sku: r.sku, qty: Number(r.qty), refundAmount: Number(r.amount), reasonCode: String(r.reason ?? 'other').toUpperCase().replace(/\s+/g, '_'), channel: 'PORTAL', correlationId: cid })

export const PACKAGES = {
  [EAPI_PKG]: {
    note: 'Returns Experience API, built in Studio on the spec of Exchange. POST /returns checks the request, maps it in DataWeave and publishes it to the Anypoint MQ queue in mq.queue, then answers 202. GET /returns/{returnId} answers when a request was queued. Properties: mq.url (the broker URL of the region), mq.queue, mq.clientId and mq.clientSecret of the client app (protected), api.id and the environment client ID and secret.',
    traced: true,
    sample: { method: 'POST', path: '/returns', body: RETURN },
    boot: (ctx) => {
      const gone = needs('mq.url', 'mq.queue', 'mq.clientId', 'mq.clientSecret')(ctx)
      if (gone) return gone
      return BROKER.test(clean(ctx.props['mq.url'])) ? null : `Anypoint MQ Connector: the broker URL ${clean(ctx.props['mq.url'])} is not valid. Use https://mq-<region>.anypoint.mulesoft.com/api/v1`
    },
    handle({ app, props, now, put }, req) {
      const st = (app.store ??= {})
      const path = req.path.split('?')[0].replace(/\/+$/, '')
      const one = path.match(/^\/returns\/([\w-]+)$/)
      if (req.method === 'GET' && one) {
        const x = st.queued?.[one[1]]
        return x ? { status: 200, ms: 6, flow: 'get:\\returns\\(returnId):returns-experience-api-config', body: JSON.stringify({ returnId: one[1], status: 'QUEUED', ...x }) } : { status: 404, ms: 4, flow: 'get:\\returns\\(returnId):returns-experience-api-config', body: JSON.stringify({ message: `No return request ${one[1]}` }) }
      }
      if (path !== '/returns') return { status: 404, ms: 3, error: 'APIKIT:NOT_FOUND', body: '{"message":"Resource not found"}' }
      if (req.method !== 'POST') return { status: 405, ms: 3, error: 'APIKIT:METHOD_NOT_ALLOWED', body: '{"message":"Method not allowed"}' }
      const r = readReturn(req.body)
      if (!r) return { status: 400, ms: 5, flow: EAPI_FLOW, error: 'APIKIT:BAD_REQUEST', body: '{"message":"Invalid return request: returnId, storeId, qty and amount above 0 are required"}' }
      const cid = clean(req.cid) || r.returnId
      const queue = clean(props['mq.queue'])
      // lab: the connector sends the correlation ID as a message property; the lab queue keeps only the body, so it is a field
      put(queue, JSON.stringify(toMessage(r, cid)))
      st.queued = Object.fromEntries(Object.entries({ ...st.queued, [r.returnId]: { queue, correlationId: cid, t: now } }).slice(-100))
      return { status: 202, ms: 40, flow: EAPI_FLOW, body: JSON.stringify({ returnId: r.returnId, status: 'QUEUED' }), log: [info(`correlationId=${cid} Return ${r.returnId} of store ${r.storeId} published to ${queue}: refundAmount=${Number(r.amount)}, reasonCode=${toMessage(r, cid).reasonCode}`)] }
    },
  },
  [PAPI_PKG]: {
    note: `Returns Process API of the returns team. Its Subscriber on mq.queue (acknowledgementMode AUTO) writes each return request into ${TABLE} of the returns database, after it checks the store in ${STORES}; a request it has already is acknowledged without a second row. A failed request is nacked and delivered again, and the queue moves it to its dead letter queue after its delivery attempts. Properties: mq.url, mq.queue, mq.clientId and mq.clientSecret (protected), db.host, db.database, db.user, db.password (protected).`,
    boot: (ctx) => {
      const gone = needs('mq.url', 'mq.queue', 'mq.clientId', 'mq.clientSecret', 'db.host', 'db.database', 'db.user', 'db.password')(ctx)
      if (gone) return gone
      return BROKER.test(clean(ctx.props['mq.url'])) ? null : `Anypoint MQ Connector: the broker URL ${clean(ctx.props['mq.url'])} is not valid. Use https://mq-<region>.anypoint.mulesoft.com/api/v1`
    },
    consumes: 'mq.queue',
    consume(ctx, message) {
      const st = (ctx.app.store ??= {})
      const fail = (at, name, dsl, type, text) => ({ ok: false, flow: FLOW, errorType: type, error: { flow: FLOW, file: 'returns-process-papi', at, name, dsl, type, message: text } })
      let m
      try {
        m = JSON.parse(message.body)
      } catch {
        m = null
      }
      if (!m?.returnId || !m.storeId) return fail(1, 'Read return request', '<ee:transform doc:name="Read return request">', 'MULE:EXPRESSION', `Message ${message.id} is not a return request: JSON with a returnId and a storeId.`)
      const db = serverFor(ctx.props)
      const cfg = cfgOf(ctx.props)
      ctx.db.ensureTable(db, STORES, STORES_DEF)
      ctx.db.ensureTable(db, TABLE, TABLE_DEF)
      const cid = m.correlationId ?? m.returnId
      const had = ctx.db.select(db, cfg, `SELECT return_id FROM ${TABLE} WHERE return_id = :id`, { id: m.returnId })
      if (!had.ok) return fail(2, 'Find return', `<db:select config-ref="Returns_Database_Config" doc:name="Find return">`, had.errorType ?? 'DB:CONNECTIVITY', had.text)
      if (had.rows.length) return { ok: true, flow: FLOW, log: [warn(`correlationId=${cid} Return ${m.returnId} is in ${TABLE} already. Acknowledged without a second row. Delivery ${message.deliveries}`)] }
      // lab: the foreign key FK_return_requests_stores is modelled as a lookup the package does before the insert
      const store = ctx.db.select(db, cfg, `SELECT store_id FROM ${STORES} WHERE store_id = :id`, { id: m.storeId })
      if (!store.ok) return fail(2, 'Find store', `<db:select config-ref="Returns_Database_Config" doc:name="Find store">`, store.errorType ?? 'DB:CONNECTIVITY', store.text)
      if (!store.rows.length) st.failed = { ...st.failed, [m.returnId]: message.deliveries }
      if (!store.rows.length)
        return fail(3, 'Insert return', `<db:insert config-ref="Returns_Database_Config" doc:name="Insert return"> INSERT INTO ${TABLE}`, 'DB:QUERY_EXECUTION', `com.microsoft.sqlserver.jdbc.SQLServerException: The INSERT statement conflicted with the FOREIGN KEY constraint "FK_return_requests_stores". The conflict occurred in database "${clean(ctx.props['db.database'])}", table "${STORES}", column 'store_id'. (store_id ${m.storeId}, return ${m.returnId}, correlationId=${cid})`)
      const r = ctx.db.insert(db, cfg, `INSERT INTO ${TABLE} (return_id, order_id, store_id, sku, qty, refund_amount, reason_code, status, correlation_id) VALUES (:id, :order, :store, :sku, :qty, :amount, :reason, 'RECEIVED', :cid)`, {
        id: m.returnId, order: String(m.orderId ?? ''), store: m.storeId, sku: String(m.sku ?? ''), qty: Number(m.qty ?? 1), amount: Number(m.refundAmount ?? 0), reason: String(m.reasonCode ?? 'OTHER'), cid,
      })
      if (!r.ok) return fail(3, 'Insert return', `<db:insert config-ref="Returns_Database_Config" doc:name="Insert return"> INSERT INTO ${TABLE}`, r.errorType ?? 'DB:QUERY_EXECUTION', r.text)
      st.done = keep(st.done, m.returnId)
      return { ok: true, flow: FLOW, log: [info(`correlationId=${cid} Return ${m.returnId} stored in ${TABLE}: store_id=${m.storeId}, sku=${m.sku}, qty=${m.qty}, refund_amount=${m.refundAmount}, reason_code=${m.reasonCode}. Message ${message.id} acknowledged, delivery ${message.deliveries}.`)] }
    },
  },
}
