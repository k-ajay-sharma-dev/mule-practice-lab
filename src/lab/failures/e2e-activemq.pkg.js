// The sample applications of the end to end lab of ActiveMQ. Imports only platform-log.js and the import free JMS and
// XML engines, so the engine can load it without a cycle.
//
// e2e-refunds-sapi is the Refunds System API the team built in Studio on the spec of Exchange: POST /refunds puts one
// persistent JMS message per refund on an ActiveMQ Classic queue, with the refund ID as JMSCorrelationID.
// finance-refund-writer takes each message and writes the refund into the finance database on SQL Server through ctx.db
// (platform-db.js). How it acknowledges, rolls back and gives up comes from its Mule configuration (ctx.xml), which the
// learner fixes in the Flow editor: the transactionalAction of the jms:listener, the maxRedelivery of the factory
// configuration and the error handler of DB:QUERY_EXECUTION.
import { info, muleError, needs, warn } from '../platform-log.js'
import { connOf } from '../platform-jms.js'
import { errorHandlerOf, errorLog, flowOf, handlerFor, placeholdersOf, stepsOf } from '../platform-xml.js'

export const API_PKG = 'e2e-refunds-sapi'
export const WRITER_PKG = 'finance-refund-writer'
export const ASSET = 'refunds-system-api'
export const QUEUE = 'REFUNDS.IN'
export const DLQ = 'DLQ.REFUNDS.IN'
export const FLOW = 'refund-writer-flow'
export const AMQ_PRD = 'brightmart-amq-prd'
export const URL_SBX = 'failover:(tcp://amq1.brightmart.lab:61616,tcp://amq2.brightmart.lab:61616)?randomize=false'
export const URL_PRD = 'failover:(tcp://amq1-prd.brightmart.lab:61616,tcp://amq2-prd.brightmart.lab:61616)?randomize=false'
export const USERS = { api: 'mule-refunds-api', writer: 'mule-finance' }
export const GROUPS = { api: 'refunds-api', writer: 'finance' }
export const DB = 'brightmart-sql' // Sandbox: sql.brightmart.lab
export const DB_PRD = 'brightmart-sql-prd' // Production: sql-prd.brightmart.lab
export const DATABASE = 'BrightmartFinance'
export const DB_USER = 'svc_finance_mule'
export const TABLE = 'dbo.refunds'
export const CURRENCIES = 'dbo.currencies'
export const REFUND = '{"refundId":"RF-90001","returnId":"R-77012","orderId":"O-50017","amount":42.25,"currency":"EUR"}'
export const CAD = '{"refundId":"RF-90002","returnId":"R-77020","orderId":"O-50044","amount":64.0,"currency":"CAD"}'
const API_FLOW = 'post:\\refunds:application\\json:refunds-system-api-config'
const JMS_LOG = 'org.mule.extensions.jms.internal.source.JmsListener'

const clean = (v) => String(v ?? '').trim()
const keep = (list, item, n = 200) => [...(list ?? []), item].slice(-n)
export const serverFor = (props) => (/^sql-prd\./i.test(clean(props['db.host'])) ? DB_PRD : /^sql\./i.test(clean(props['db.host'])) ? DB : clean(props['db.host']) || DB)
const cfgOf = (p) => ({ host: p['db.host'], database: p['db.database'], user: p['db.user'], password: p['db.password'], maxPoolSize: '2', maxWait: '10', queryTimeout: '10' })
const CURRENCIES_DEF = { columns: [['currency_code', 'char(3)'], ['name', 'varchar(40)']], pk: ['currency_code'], rows: [{ currency_code: 'EUR', name: 'Euro' }, { currency_code: 'USD', name: 'US dollar' }, { currency_code: 'GBP', name: 'Pound sterling' }] }
const TABLE_DEF = {
  columns: [['refund_id', 'varchar(20)'], ['return_id', 'varchar(20)'], ['order_id', 'varchar(20)'], ['amount', 'decimal(12,2)'], ['currency_code', 'char(3)'], ['status', 'varchar(16)'], ['correlation_id', 'varchar(64)', true]],
  pk: ['refund_id'],
}
export function readRefund(body) {
  try {
    const r = typeof body === 'string' ? JSON.parse(body) : body
    return r && typeof r.refundId === 'string' && r.refundId && Number(r.amount) > 0 && /^[A-Z]{3}$/.test(String(r.currency ?? '')) ? r : null
  } catch {
    return null
  }
}

// ---------- the Mule configuration of finance-refund-writer ----------

const head = (body) => `<?xml version="1.0" encoding="UTF-8"?>
<mule xmlns="http://www.mulesoft.org/schema/mule/core"
      xmlns:jms="http://www.mulesoft.org/schema/mule/jms"
      xmlns:db="http://www.mulesoft.org/schema/mule/db"
      xmlns:ee="http://www.mulesoft.org/schema/mule/ee/core"
      xmlns:doc="http://www.mulesoft.org/schema/mule/documentation"
      xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
      xsi:schemaLocation="http://www.mulesoft.org/schema/mule/core http://www.mulesoft.org/schema/mule/core/current/mule.xsd
        http://www.mulesoft.org/schema/mule/jms http://www.mulesoft.org/schema/mule/jms/current/mule-jms.xsd
        http://www.mulesoft.org/schema/mule/db http://www.mulesoft.org/schema/mule/db/current/mule-db.xsd
        http://www.mulesoft.org/schema/mule/ee/core http://www.mulesoft.org/schema/mule/ee/core/current/mule-ee.xsd">

${body}</mule>
`
const xmlOf = ({ tx, redelivery, handler, insertTx }) =>
  head(`  <jms:config name="Finance_AMQ_Config" doc:name="JMS Config">
    <jms:active-mq-connection username="\${jms.user}" password="\${jms.password}">
      <jms:factory-configuration brokerUrl="\${jms.url}"${redelivery ? ` maxRedelivery="${redelivery}"` : ''}/>
    </jms:active-mq-connection>
  </jms:config>

  <db:config name="Finance_DB_Config" doc:name="Database Config">
    <db:mssql-connection host="\${db.host}" port="1433" databaseName="\${db.database}" user="\${db.user}" password="\${db.password}"/>
  </db:config>

  <flow name="${FLOW}">
    <jms:listener config-ref="Finance_AMQ_Config" destination="\${jms.queue}" ackMode="AUTO"${tx ? ' transactionalAction="ALWAYS_BEGIN"' : ''} doc:name="Refund received"/>
    <ee:transform doc:name="Refund to row">
      <ee:message>
        <ee:set-payload><![CDATA[%dw 2.0
output application/java
---
{
  refundId:      payload.refundId,
  returnId:      payload.returnId,
  orderId:       payload.orderId,
  amount:        payload.amount as Number,
  currencyCode:  upper(payload.currency),
  correlationId: attributes.headers.correlationId
}]]></ee:set-payload>
      </ee:message>
    </ee:transform>
    <db:insert config-ref="Finance_DB_Config"${insertTx ? ` transactionalAction="${insertTx}"` : ''} doc:name="Insert refund">
      <db:sql><![CDATA[IF NOT EXISTS (SELECT 1 FROM dbo.refunds WHERE refund_id = :refundId)
  INSERT INTO dbo.refunds (refund_id, return_id, order_id, amount, currency_code, status, correlation_id)
  VALUES (:refundId, :returnId, :orderId, :amount, :currencyCode, 'BOOKED', :correlationId)]]></db:sql>
      <db:input-parameters><![CDATA[#[payload]]]></db:input-parameters>
    </db:insert>
    <logger level="INFO" message="#['Refund ' ++ payload.refundId ++ ' booked']" doc:name="Booked"/>
    <error-handler>
      <on-error-${handler} type="DB:QUERY_EXECUTION" doc:name="${handler === 'continue' ? 'Log and go on' : 'Roll back'}">
        <logger level="ERROR" message="#['Refund not booked: ' ++ error.description]" doc:name="Log error"/>
      </on-error-${handler}>
    </error-handler>
  </flow>
`)
// what the jar of the finance team carries: no transaction, no redelivery limit, and an error handler that swallows
export const START_XML = xmlOf({ tx: false, redelivery: null, handler: 'continue' })
// the fix: a transacted listener, 3 redeliveries, the error leaves the flow; the insert stays out of the JMS transaction
export const FIXED_XML = xmlOf({ tx: true, redelivery: '3', handler: 'propagate', insertTx: 'NOT_SUPPORTED' })

// What the configuration says. Placeholders such as ${jms.maxRedelivery} are read from the properties.
export function writerConfig(xml, props = {}) {
  const f = flowOf(xml, FLOW)
  const src = f?.source?.kind === 'jms:listener' ? f.source : null
  const value = (v) => clean(v).replace(/^\$\{(.+)\}$/, (_, k) => clean(props[k]))
  const max = value((String(xml?.text ?? '').match(/<jms:factory-configuration\b[^>]*\bmaxRedelivery="([^"]*)"/) ?? [])[1])
  const h = handlerFor(errorHandlerOf(xml, FLOW), 'DB:QUERY_EXECUTION')
  const insert = stepsOf(xml, FLOW, 'db:insert')[0]
  return {
    ok: Boolean(src && insert),
    transacted: src?.attrs.transactionalAction === 'ALWAYS_BEGIN',
    ackMode: src?.attrs.ackMode ?? 'AUTO',
    queue: value(src?.attrs.destination),
    maxRedelivery: /^-?\d+$/.test(max) ? Number(max) : null,
    // the handler that takes a DB error: continue swallows it, propagate (or none) fails the flow
    swallows: h?.kind === 'continue',
    insertJoins: insert?.attrs.transactionalAction === 'ALWAYS_JOIN',
    handler: h,
    insert,
  }
}

export const PACKAGES = {
  [API_PKG]: {
    note: 'Refunds System API, built in Studio on the spec of Exchange. POST /refunds sends one persistent JMS message per refund to jms.queue on ActiveMQ, with the refundId as JMSCorrelationID and the correlation ID of the request as a property, and answers 202. GET /refunds/{refundId} answers when a refund was sent. Properties: jms.url (a failover: URL), jms.queue, jms.user, jms.password (protected), api.id and the environment client ID and secret.',
    traced: true,
    sample: { method: 'POST', path: '/refunds', body: REFUND },
    boot: needs('jms.url', 'jms.queue', 'jms.user', 'jms.password'),
    handle({ app, props, now, jms }, req) {
      const st = (app.store ??= {})
      const path = req.path.split('?')[0].replace(/\/+$/, '')
      const one = path.match(/^\/refunds\/([\w-]+)$/)
      if (req.method === 'GET' && one) {
        const x = st.sent?.[one[1]]
        return x ? { status: 200, ms: 5, flow: 'get:\\refunds\\(refundId):refunds-system-api-config', body: JSON.stringify({ refundId: one[1], status: 'SUBMITTED', ...x }) } : { status: 404, ms: 4, flow: 'get:\\refunds\\(refundId):refunds-system-api-config', body: JSON.stringify({ message: `No refund ${one[1]}` }) }
      }
      if (path !== '/refunds') return { status: 404, ms: 3, error: 'APIKIT:NOT_FOUND', body: '{"message":"Resource not found"}' }
      if (req.method !== 'POST') return { status: 405, ms: 3, error: 'APIKIT:METHOD_NOT_ALLOWED', body: '{"message":"Method not allowed"}' }
      const r = readRefund(req.body)
      if (!r) return { status: 400, ms: 5, flow: API_FLOW, error: 'APIKIT:BAD_REQUEST', body: '{"message":"Invalid refund: refundId, an amount above 0 and a currency code are required"}' }
      const cid = clean(req.cid) || r.refundId
      const queue = clean(props['jms.queue'])
      const p = jms.publish(connOf(props), queue, { ...r, currency: String(r.currency).toUpperCase() }, { correlationId: r.refundId, persistent: true, props: { correlationId: cid } })
      if (!p.ok) return { status: 503, ms: 600, flow: API_FLOW, error: p.muleType ?? 'JMS:PUBLISHING', body: JSON.stringify({ message: 'The refund could not be sent', error: p.text }), log: [muleError({ flow: API_FLOW, file: 'refunds-system-api', at: 2, name: 'Send refund', dsl: '<jms:publish config-ref="Refunds_AMQ_Config" destination="${jms.queue}" persistentDelivery="true">', type: p.muleType ?? 'JMS:PUBLISHING', message: p.text })] }
      st.sent = Object.fromEntries(Object.entries({ ...st.sent, [r.refundId]: { queue, correlationId: cid, t: now } }).slice(-100))
      return { status: 202, ms: 30, flow: API_FLOW, body: JSON.stringify({ refundId: r.refundId, status: 'SUBMITTED' }), log: [info(`correlationId=${cid} Refund ${r.refundId} sent to queue://${queue}, PERSISTENT, JMSCorrelationID ${r.refundId}: amount=${r.amount} ${String(r.currency).toUpperCase()}`)] }
    },
  },
  [WRITER_PKG]: {
    note: `Refund writer of the finance team. Its Mule configuration is in the Flow editor: a jms:listener on \${jms.queue} writes each refund into ${TABLE} of the finance database. The listener runs once a lab minute and takes what is on the queue. Properties: jms.url, jms.queue, jms.user, jms.password (protected), db.host, db.database, db.user, db.password (protected).`,
    boot: (ctx) => {
      const keys = ctx.xml ? placeholdersOf(ctx.xml) : ['jms.url', 'jms.queue', 'jms.user', 'jms.password', 'db.host', 'db.database', 'db.user', 'db.password']
      return needs(...keys)(ctx)
    },
    schedules: [{ flow: FLOW, type: 'cron', value: '0 * * * * ?', tz: 'UTC', enabled: true }],
    run: {
      [FLOW]: (ctx) => {
        const { props, store: st, jms, xml, now } = ctx
        const c = writerConfig(xml, props)
        if (!c.ok) return { ok: true, ms: 5, log: [], store: st }
        const cfg = { ...connOf(props), maxRedelivery: c.maxRedelivery }
        const db = serverFor(props)
        const dbc = cfgOf(props)
        ctx.db.ensureTable(db, CURRENCIES, CURRENCIES_DEF)
        ctx.db.ensureTable(db, TABLE, TABLE_DEF)
        const res = jms.listen(cfg, c.queue, { ackMode: c.ackMode, transactionalAction: c.transacted ? 'ALWAYS_BEGIN' : 'NONE', max: 30 }, (m) => {
          const r = readRefund(m.body)
          const cid = m.properties?.correlationId ?? m.correlationId ?? r?.refundId ?? m.id
          if (!r) return { ok: false, errorType: 'MULE:EXPRESSION', cid, text: `Unable to read the refund in message ${m.id}.` }
          // a local JMS transaction covers the JMS session only; an operation that must join it on another config fails
          if (c.transacted && c.insertJoins) return { ok: false, errorType: 'MULE:TRANSACTION', cid, refundId: r.refundId, text: 'Can not join transaction: the transaction of Finance_AMQ_Config is not of resource Finance_DB_Config. A local transaction spans one connector config.' }
          const had = ctx.db.select(db, dbc, `SELECT refund_id FROM ${TABLE} WHERE refund_id = :id`, { id: r.refundId })
          if (!had.ok) return { ok: false, errorType: had.errorType ?? 'DB:CONNECTIVITY', cid, refundId: r.refundId, text: had.text }
          if (had.rows.length) return { ok: true, cid, refundId: r.refundId, again: true, delivery: m.deliveryCount }
          // lab: the foreign key FK_refunds_currencies is modelled as a lookup the package does before the insert
          const cur = ctx.db.select(db, dbc, `SELECT currency_code FROM ${CURRENCIES} WHERE currency_code = :c`, { c: String(r.currency).toUpperCase() })
          const ins = !cur.ok
            ? cur
            : !cur.rows.length
              ? { ok: false, errorType: 'DB:QUERY_EXECUTION', text: `com.microsoft.sqlserver.jdbc.SQLServerException: The INSERT statement conflicted with the FOREIGN KEY constraint "FK_refunds_currencies". The conflict occurred in database "${clean(props['db.database'])}", table "${CURRENCIES}", column 'currency_code'.` }
              : ctx.db.insert(db, dbc, `INSERT INTO ${TABLE} (refund_id, return_id, order_id, amount, currency_code, status, correlation_id) VALUES (:id, :ret, :ord, :amount, :cur, 'BOOKED', :cid)`, { id: r.refundId, ret: String(r.returnId ?? ''), ord: String(r.orderId ?? ''), amount: Number(r.amount), cur: String(r.currency).toUpperCase(), cid })
          if (ins.ok) return { ok: true, cid, refundId: r.refundId, amount: r.amount, currency: String(r.currency).toUpperCase(), delivery: m.deliveryCount }
          const type = ins.errorType ?? 'DB:QUERY_EXECUTION'
          // on-error-continue for the DB error: the flow ends with success, so the listener acknowledges and the refund is gone
          if (c.swallows && type === 'DB:QUERY_EXECUTION') return { ok: true, lost: true, cid, refundId: r.refundId, type, text: ins.text }
          return { ok: false, errorType: type, cid, refundId: r.refundId, text: ins.text }
        })
        if (!res.ok) return { ok: false, ms: 400, errorType: res.muleType, log: [muleError({ flow: FLOW, file: 'finance-refund-writer', at: 0, name: 'Refund received', dsl: '<jms:listener config-ref="Finance_AMQ_Config" destination="${jms.queue}">', type: res.muleType ?? 'JMS:CONNECTIVITY', message: res.text })], store: st }
        const log = []
        let errors = 0
        for (const x of res.results) {
          const v = x.result ?? {}
          if (x.ok && v.lost) {
            errors++
            st.lost = keep(st.lost, { refundId: v.refundId, t: now }, 50)
            log.push(errorLog({ name: 'finance-refund-writer', xml, flow: FLOW, step: c.insert, type: v.type, message: v.text, handler: 'continue' }))
            log.push(warn(`correlationId=${v.cid} Refund ${v.refundId} was not booked. on-error-continue ended the flow with success, so the listener acknowledged message ${x.id} and the broker deleted it.`, JMS_LOG))
            continue
          }
          if (x.ok) {
            if (v.again) log.push(warn(`correlationId=${v.cid} Refund ${v.refundId} is in ${TABLE} already. Nothing written, delivery ${v.delivery}.`))
            else {
              st.done = keep(st.done, v.refundId)
              log.push(info(`correlationId=${v.cid} Refund ${v.refundId} booked in ${TABLE}: amount=${v.amount}, currency_code=${v.currency}, status=BOOKED. Delivery ${v.delivery}${c.transacted ? ', transaction committed' : ''}.`))
            }
            continue
          }
          errors++
          if (v.refundId) st.failed = { ...st.failed, [v.refundId]: Math.max(st.failed?.[v.refundId] ?? 0, x.deliveryCount ?? 1) }
          if ((x.deliveryCount ?? 1) === 1 || x.outcome === 'dlq') log.push(c.insert && v.errorType?.startsWith('DB:') ? errorLog({ name: 'finance-refund-writer', xml, flow: FLOW, step: c.insert, type: v.errorType, message: v.text }) : muleError({ flow: FLOW, file: 'finance-refund-writer', at: 2, name: 'Insert refund', dsl: '<db:insert config-ref="Finance_DB_Config">', type: v.errorType ?? 'MULE:UNKNOWN', message: v.text ?? 'The flow failed' }))
          if (x.outcome === 'dlq') log.push(warn(`correlationId=${v.cid} Message ${x.id}: delivery ${x.deliveryCount} is past maxRedelivery ${c.maxRedelivery ?? 6}. The ActiveMQ client sent a poison ack and the broker moved it to ${x.to}.`, JMS_LOG))
          else if (x.outcome === 'rolled back') log.push(info(`correlationId=${v.cid} Message ${x.id}: transaction rolled back, delivery ${x.deliveryCount}. The broker delivers it again with JMSRedelivered=true.`, JMS_LOG))
          else if (x.outcome === 'redelivery') log.push(info(`correlationId=${v.cid} Message ${x.id}: the session was recovered and the message comes again.`, JMS_LOG))
        }
        return { ok: errors === 0, ms: 600, ...(errors && { errorType: 'DB:QUERY_EXECUTION', errors }), log, store: st }
      },
    },
  },
}
