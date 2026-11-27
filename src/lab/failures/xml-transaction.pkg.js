// The sample application of the xml-transaction lab. Imports only platform-log.js and the import free platform-xml.js, so
// the engine can load it without a cycle. Whether an order is saved whole comes from its Mule configuration (ctx.xml):
// the try scopes, the transactional actions and the until-successful of save-order-flow.
// lab: the ORDERS database lives in the package store, not in the Databases screen. A row lock is modelled as the time a
// transaction stays open while it holds the new ORDER_HEADER row.
import { needs, warn, info } from '../platform-log.js'
import { errorLog, flowOf, handlerFor, okStatus, outcomeOf, retryOf, stepsOf, txOf } from '../platform-xml.js'

export const NAME = 'harbor-order-store-sapi'
export const FLOW = 'save-order-flow'
export const READ_FLOW = 'get-orders-flow'
export const ORDER_BODY = '{"customerId":"C-100","lines":[{"sku":"FL-20","qty":4},{"sku":"FL-31","qty":2}]}'
export const BAD_BODY = '{"customerId":"C-100","lines":[{"sku":"FL-20","qty":4},{"sku":"FL-31","qty":null}]}'
const keep = (list, item, n = 40) => [...(list ?? []), item].slice(-n)
const NULL_QTY = "Cannot insert the value NULL into column 'QTY', table 'ORDERS.dbo.ORDER_LINE'; column does not allow nulls. INSERT fails."

const head = (body) => `<?xml version="1.0" encoding="UTF-8"?>
<mule xmlns="http://www.mulesoft.org/schema/mule/core"
      xmlns:http="http://www.mulesoft.org/schema/mule/http"
      xmlns:db="http://www.mulesoft.org/schema/mule/db"
      xmlns:ee="http://www.mulesoft.org/schema/mule/ee/core"
      xmlns:doc="http://www.mulesoft.org/schema/mule/documentation"
      xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
      xsi:schemaLocation="http://www.mulesoft.org/schema/mule/core http://www.mulesoft.org/schema/mule/core/current/mule.xsd
        http://www.mulesoft.org/schema/mule/http http://www.mulesoft.org/schema/mule/http/current/mule-http.xsd
        http://www.mulesoft.org/schema/mule/db http://www.mulesoft.org/schema/mule/db/current/mule-db.xsd
        http://www.mulesoft.org/schema/mule/ee/core http://www.mulesoft.org/schema/mule/ee/core/current/mule-ee.xsd">

  <configuration-properties file="config.yaml" doc:name="Configuration properties"/>

  <http:listener-config name="Store_Listener_Config" doc:name="HTTP Listener config">
    <http:listener-connection host="0.0.0.0" port="\${http.port}"/>
  </http:listener-config>

  <db:config name="Orders_DB" doc:name="Database Config">
    <db:mssql-connection host="\${db.host}" port="1433" databaseName="ORDERS" user="\${db.user}" password="\${db.password}"/>
  </db:config>

  <http:request-config name="Warehouse_Request_Config" doc:name="HTTP Request configuration">
    <http:request-connection protocol="HTTPS" host="\${warehouse.host}" port="443"/>
  </http:request-config>

  <flow name="${FLOW}">
    <http:listener config-ref="Store_Listener_Config" path="/api/orders" allowedMethods="POST" doc:name="POST /orders">
      <http:response statusCode="#[vars.httpStatus default 201]"/>
      <http:error-response statusCode="#[vars.httpStatus default 500]">
        <http:body><![CDATA[#[payload]]]></http:body>
      </http:error-response>
    </http:listener>
    <set-variable variableName="orderId" value="#[uuid()]" doc:name="Order id"/>
${body}    <ee:transform doc:name="Created">
      <ee:message>
        <ee:set-payload><![CDATA[%dw 2.0
output application/json
---
{ orderId: vars.orderId, status: "CREATED" }]]></ee:set-payload>
      </ee:message>
    </ee:transform>
    <error-handler>
      <on-error-propagate type="DB:QUERY_EXECUTION" doc:name="Bad order data">
        <set-variable variableName="httpStatus" value="400" doc:name="400"/>
        <ee:transform doc:name="Error body">
          <ee:message>
            <ee:set-payload><![CDATA[%dw 2.0
output application/json
---
{ message: "The order was not saved.", error: error.description }]]></ee:set-payload>
          </ee:message>
        </ee:transform>
      </on-error-propagate>
      <on-error-propagate doc:name="Other errors">
        <ee:transform doc:name="Error body">
          <ee:message>
            <ee:set-payload><![CDATA[%dw 2.0
output application/json
---
{ message: "The order was not saved. Try again later." }]]></ee:set-payload>
          </ee:message>
        </ee:transform>
      </on-error-propagate>
    </error-handler>
  </flow>

  <flow name="${READ_FLOW}">
    <http:listener config-ref="Store_Listener_Config" path="/api/orders" allowedMethods="GET" doc:name="GET /orders"/>
    <db:select config-ref="Orders_DB" doc:name="Latest orders">
      <db:sql><![CDATA[SELECT TOP 10 h.ORDER_ID, COUNT(l.LINE_NO) AS LINES FROM ORDER_HEADER h LEFT JOIN ORDER_LINE l ON l.ORDER_ID = h.ORDER_ID GROUP BY h.ORDER_ID, h.ORDER_DATE ORDER BY h.ORDER_DATE DESC]]></db:sql>
    </db:select>
    <ee:transform doc:name="To JSON">
      <ee:message>
        <ee:set-payload><![CDATA[%dw 2.0
output application/json
---
payload map { orderId: $.ORDER_ID, lines: $.LINES }]]></ee:set-payload>
      </ee:message>
    </ee:transform>
  </flow>
</mule>
`
const pad = (text, n) => text.replace(/^(?=.)/gm, ' '.repeat(n))
const HEADER = `<db:insert config-ref="Orders_DB" doc:name="Insert order header">
  <db:sql><![CDATA[INSERT INTO ORDER_HEADER (ORDER_ID, CUSTOMER_ID, ORDER_DATE, STATUS) VALUES (:orderId, :customerId, CURRENT_TIMESTAMP, 'OPEN')]]></db:sql>
  <db:input-parameters><![CDATA[#[{ orderId: vars.orderId, customerId: payload.customerId }]]]></db:input-parameters>
</db:insert>
`
const RESERVE = `<until-successful maxRetries="5" millisBetweenRetries="10000" doc:name="Retry warehouse">
  <http:request method="POST" config-ref="Warehouse_Request_Config" path="/wms/reservations" target="reservation" doc:name="Reserve stock"/>
</until-successful>
`
const LINES = `<foreach collection="#[payload.lines]" doc:name="For each line">
  <db:insert config-ref="Orders_DB" doc:name="Insert order line">
    <db:sql><![CDATA[INSERT INTO ORDER_LINE (ORDER_ID, LINE_NO, SKU, QTY) VALUES (:orderId, :lineNo, :sku, :qty)]]></db:sql>
    <db:input-parameters><![CDATA[#[{ orderId: vars.orderId, lineNo: vars.counter, sku: payload.sku, qty: payload.qty }]]]></db:input-parameters>
  </db:insert>
</foreach>
`
const tryScope = (inner) => `<try transactionalAction="ALWAYS_BEGIN" doc:name="Save order">\n${pad(inner, 2)}</try>\n`
// what runs when the lab starts: two inserts, each one commits on its own
export const START_XML = head(pad(HEADER + RESERVE + LINES, 4))
// one transaction, with the retries of the warehouse call inside it
export const TX_RETRY_XML = head(pad(tryScope(HEADER + RESERVE + LINES), 4))
// one transaction for the two inserts, the warehouse call after the commit
export const FIXED_XML = head(pad(tryScope(HEADER + LINES) + RESERVE, 4))

const sqlOf = (step) => step.parts.find((p) => p.kind === 'db:sql')?.text ?? ''

export const PACKAGES = {
  [NAME]: {
    note: 'Order System API of Harbor Foods on SQL Server. POST /orders writes the order header and then each line to ORDERS, and reserves the stock at the warehouse system. GET /orders lists the last orders with their number of lines, for the warehouse dashboard. Its Mule configuration is in the Flow editor. The shop sends a line without a quantity now and then, and the warehouse answers 503 twice in a row to some reservations this week.',
    boot: needs('http.port', 'db.host', 'db.user', 'db.password', 'warehouse.host'),
    sample: { method: 'POST', path: '/orders', body: ORDER_BODY },
    handle(ctx, req) {
      const { xml, store, now } = ctx
      const t = now + (req.offset ?? 0)
      const path = req.path.split('?')[0].replace(/\/+$/, '')
      if (path !== '/orders') return { status: 404, ms: 3, body: `No listener for endpoint: /api${path}` }
      if (req.method === 'GET') return read(ctx, t)
      if (req.method !== 'POST' || !flowOf(xml, FLOW)) return { status: 405, ms: 3, body: `Method not allowed for endpoint: /api${path}` }
      let order = {}
      try {
        order = JSON.parse(req.body || '{}') ?? {}
      } catch {
        order = {}
      }
      store.count = (store.count ?? 0) + 1
      const n = store.count
      const id = `SO-${7000 + n}`
      // the shop sends a line without a quantity in about one order in four
      const lines = (order.lines ?? []).map((l, i) => (n % 4 === 0 && i === (order.lines.length ?? 1) - 1 ? { ...l, qty: null } : l))
      const inserts = stepsOf(xml, FLOW, 'db:insert')
      const header = inserts.find((s) => /ORDER_HEADER/i.test(sqlOf(s)))
      const lineStep = inserts.find((s) => /ORDER_LINE/i.test(sqlOf(s)))
      const request = stepsOf(xml, FLOW, 'http:request')[0]
      const tx = txOf(xml, FLOW)
      const opOf = (step) => step && tx.ops.find((o) => o.line === step.line)
      const h = opOf(header)
      const l = opOf(lineStep)
      const scope = h?.joined ? tx.scopes[h.scope] : null
      const atomic = Boolean(scope && l?.joined && l.scope === h.scope)
      // the warehouse call is inside the transaction that holds the new header row
      const holds = Boolean(scope && request && scope.requests.includes(request.line))
      const retry = retryOf(xml, FLOW).find((r) => r.kinds.includes('http:request'))
      const log = []
      let error = null
      let open = 120 // ms the transaction of the header stays open
      // the warehouse answers 503 twice to the first reservation of each minute
      const failures = request && n % 3 === 1 ? 2 : 0
      let reserved = Boolean(request)
      if (failures) {
        if (retry && retry.maxRetries >= failures) {
          if (holds) open += failures * retry.millisBetweenRetries
          log.push(warn(`Reserve stock for ${id}: HTTP:SERVICE_UNAVAILABLE from the warehouse, retried ${failures} times by until-successful, then it worked.`))
        } else {
          reserved = false
          error = { type: retry ? 'MULE:RETRY_EXHAUSTED' : 'HTTP:SERVICE_UNAVAILABLE', step: request, message: `HTTP POST on resource 'https://${ctx.props['warehouse.host']}:443/wms/reservations' failed: service unavailable (503).` }
        }
      }
      if (holds && open > 1000) store.lockUntil = Math.max(store.lockUntil ?? 0, t + open)
      // the order of the steps: is the reservation before or after the lines?
      const reserveFirst = request && lineStep && request.line < lineStep.line
      const bad = lines.some((x) => x.qty == null)
      if (!error && bad && lineStep) error = { type: 'DB:QUERY_EXECUTION', step: lineStep, message: NULL_QTY }
      const dbError = error?.type === 'DB:QUERY_EXECUTION'
      if (dbError && !reserveFirst) reserved = false
      // a failure inside the try rolls the transaction back, unless the try's own on-error-continue ends it as a success
      const inScope = Boolean(error) && atomic && (dbError || holds)
      const rolledBack = inScope && handlerFor(scope.errorHandler, error.type)?.kind !== 'continue'
      const headerKept = Boolean(header) && !rolledBack
      const linesKept = headerKept && !dbError && !(error && reserveFirst) ? lines.length : 0
      store.orders = keep(store.orders, { id, t, lines: linesKept, header: headerKept }, 30)
      const orphan = headerKept && linesKept === 0 && lines.length > 0
      store.outcomes = keep(store.outcomes, { t, id, ok: !error, orphan, rolledBack, held: holds ? open : 0, reserved })
      if (rolledBack) log.push(info(`lab: the transaction of ${id} was rolled back. The ORDER_HEADER row was not kept.`))
      if (!error) return { status: okStatus(xml, FLOW), ms: open + 60, flow: FLOW, body: JSON.stringify({ orderId: id, status: 'CREATED' }), log }
      const out = outcomeOf(xml, FLOW, error.type, { description: error.message })
      if (out.logged) log.push(errorLog({ name: NAME, xml, flow: FLOW, step: error.step, type: error.type, message: error.message, handler: out.kind }))
      return { status: out.status, ms: open + 60, flow: FLOW, ...(out.flowFailed && { error: error.type }), body: out.body, log }
    },
  },
}

// GET /orders: the dashboard query reads ORDER_HEADER and waits for a row that an open transaction holds
function read(ctx, t) {
  const { xml, store } = ctx
  if (!flowOf(xml, READ_FLOW)) return { status: 405, ms: 3, body: 'Method not allowed for endpoint: /api/orders' }
  const wait = Math.max(0, (store.lockUntil ?? 0) - t)
  const log = []
  if (wait > 0) {
    store.blocked = keep(store.blocked, { t, ms: wait })
    log.push(warn(`lab: Latest orders waited ${(wait / 1000).toFixed(1)} s. The SELECT on ORDER_HEADER was blocked (LCK_M_S) by an open transaction of save-order-flow that holds a new row.`))
  }
  const list = (store.orders ?? []).slice(-10).reverse().filter((o) => o.header).map((o) => ({ orderId: o.id, lines: o.lines }))
  return { status: 200, ms: 40 + wait, flow: READ_FLOW, body: JSON.stringify(list), log }
}
