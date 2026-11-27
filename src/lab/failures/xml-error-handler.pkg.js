// The sample application of the xml-error-handler lab. Imports only platform-log.js and the import free platform-xml.js,
// so the engine can load it without a cycle. What the API answers comes from its Mule configuration (ctx.xml): the
// error handler of post-orders-flow decides the status and the body of each failed order.
import { needs } from '../platform-log.js'
import { errorLog, flowOf, mappedType, normalType, okStatus, outcomeOf, stepsOf } from '../platform-xml.js'

export const NAME = 'brightmart-order-intake-api'
export const FLOW = 'post-orders-flow'
// the customers the check-customer sub-flow knows (lab: the sub-flow reads them from a list, not a database)
export const KNOWN = ['C-100', 'C-200', 'C-300']
export const UNKNOWN_BODY = '{"customerId":"C-999","lines":[{"sku":"FL-20","qty":4}]}'
const keep = (list, item) => [...(list ?? []), item].slice(-40)

const HEAD = `<?xml version="1.0" encoding="UTF-8"?>
<mule xmlns="http://www.mulesoft.org/schema/mule/core"
      xmlns:http="http://www.mulesoft.org/schema/mule/http"
      xmlns:ee="http://www.mulesoft.org/schema/mule/ee/core"
      xmlns:doc="http://www.mulesoft.org/schema/mule/documentation"
      xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
      xsi:schemaLocation="http://www.mulesoft.org/schema/mule/core http://www.mulesoft.org/schema/mule/core/current/mule.xsd
        http://www.mulesoft.org/schema/mule/http http://www.mulesoft.org/schema/mule/http/current/mule-http.xsd
        http://www.mulesoft.org/schema/mule/ee/core http://www.mulesoft.org/schema/mule/ee/core/current/mule-ee.xsd">

  <configuration-properties file="config.yaml" doc:name="Configuration properties"/>

  <http:listener-config name="Orders_Listener_Config" doc:name="HTTP Listener config">
    <http:listener-connection host="0.0.0.0" port="\${http.port}"/>
  </http:listener-config>

  <http:request-config name="Warehouse_Request_Config" doc:name="HTTP Request configuration">
    <http:request-connection protocol="HTTPS" host="\${warehouse.host}" port="443"/>
  </http:request-config>

  <flow name="${FLOW}">
    <http:listener config-ref="Orders_Listener_Config" path="/api/orders" allowedMethods="POST" doc:name="POST /orders">
      <http:response statusCode="#[vars.httpStatus default 200]"/>
      <http:error-response statusCode="#[vars.httpStatus default 500]">
        <http:body><![CDATA[#[payload]]]></http:body>
      </http:error-response>
    </http:listener>
    <flow-ref name="check-customer" doc:name="Check customer"/>
    <http:request method="POST" config-ref="Warehouse_Request_Config" path="/wms/orders" doc:name="Send to warehouse"/>
    <ee:transform doc:name="Order accepted">
      <ee:message>
        <ee:set-payload><![CDATA[%dw 2.0
output application/json
---
{ orderId: payload.orderId, status: "ACCEPTED" }]]></ee:set-payload>
      </ee:message>
    </ee:transform>
`
const TAIL = `  </flow>

  <sub-flow name="check-customer">
    <choice doc:name="Known customer?">
      <when expression="#[not (['C-100', 'C-200', 'C-300'] contains payload.customerId)]">
        <raise-error type="APP:NOT_FOUND" description="Customer not found" doc:name="Customer not found"/>
      </when>
    </choice>
  </sub-flow>
</mule>
`
const BACKEND = `      <on-error-propagate doc:name="Backend failed">
        <set-variable variableName="httpStatus" value="502" doc:name="502"/>
        <ee:transform doc:name="Error body">
          <ee:message>
            <ee:set-payload><![CDATA[%dw 2.0
output application/json
---
{ message: "The order was not saved. The warehouse system did not answer.", error: error.description }]]></ee:set-payload>
          </ee:message>
        </ee:transform>
      </on-error-propagate>
`
const CUSTOMER = `      <on-error-continue type="APP:NOT_FOUND" doc:name="Unknown customer">
        <set-variable variableName="httpStatus" value="404" doc:name="404"/>
        <ee:transform doc:name="Not found body">
          <ee:message>
            <ee:set-payload><![CDATA[%dw 2.0
output application/json
---
{ message: "Customer not found" }]]></ee:set-payload>
          </ee:message>
        </ee:transform>
      </on-error-continue>
`
// The configuration that runs when the lab starts: one on-error-continue that catches every error and logs nothing
export const START_XML = `${HEAD}    <error-handler>
      <on-error-continue type="ANY" logException="false" enableNotifications="false" doc:name="On Error Continue"/>
    </error-handler>
${TAIL}`
// What a colleague left in the editor: the right handlers in the wrong order
export const DRAFT_XML = `${HEAD}    <error-handler>
${BACKEND}${CUSTOMER}    </error-handler>
${TAIL}`
// The handlers in an order the runtime accepts: the known business case first, the catch all last
export const FIXED_XML = `${HEAD}    <error-handler>
${CUSTOMER}${BACKEND}    </error-handler>
${TAIL}`

const DESCRIPTIONS = {
  'HTTP:SERVICE_UNAVAILABLE': (host) => `HTTP POST on resource 'https://${host}:443/wms/orders' failed: service unavailable (503).`,
  'HTTP:CONNECTIVITY': (host) => `HTTP POST on resource 'https://${host}:443/wms/orders' failed: Remotely closed.`,
  'HTTP:BAD_REQUEST': (host) => `HTTP POST on resource 'https://${host}:443/wms/orders' failed: bad request (400).`,
}

export const PACKAGES = {
  [NAME]: {
    note: 'Order intake API of Brightmart. POST /orders checks the customer in the sub-flow check-customer and sends the order to the warehouse system in warehouse.host. Its Mule configuration is in the Flow editor; the error handler of post-orders-flow decides what a caller gets when something fails. The warehouse answers 503 to about one order in three this week, and now and then closes the connection.',
    boot: needs('http.port', 'warehouse.host'),
    sample: { method: 'POST', path: '/orders', body: '{"customerId":"C-100","lines":[{"sku":"FL-20","qty":4}]}' },
    handle(ctx, req) {
      const { xml, store, props, now } = ctx
      const path = req.path.split('?')[0].replace(/\/+$/, '')
      if (!flowOf(xml, FLOW) || path !== '/orders') return { status: 404, ms: 3, body: `No listener for endpoint: /api${path}` }
      if (req.method !== 'POST') return { status: 405, ms: 3, body: `Method not allowed for endpoint: /api${path}` }
      let order = {}
      try {
        order = JSON.parse(req.body || '{}') ?? {}
      } catch {
        order = {}
      }
      store.count = (store.count ?? 0) + 1
      const n = store.count
      const id = `SO-${4000 + n}`
      const host = props['warehouse.host']
      let error = null
      // check-customer: the type the raise-error of the config gives, or the warehouse refuses the unknown customer
      if (!KNOWN.includes(order.customerId)) {
        const raise = stepsOf(xml, FLOW, 'raise-error')[0]
        error = raise ? { type: normalType(raise.attrs.type), description: raise.attrs.description ?? 'Customer not found', step: raise, cause: 'customer' } : { type: 'HTTP:BAD_REQUEST', description: DESCRIPTIONS['HTTP:BAD_REQUEST'](host), step: stepsOf(xml, FLOW, 'http:request')[0], cause: 'customer' }
      }
      const request = stepsOf(xml, FLOW, 'http:request')[0]
      if (!error && request) {
        const down = n % 3 === 0 ? 'HTTP:SERVICE_UNAVAILABLE' : n % 10 === 5 ? 'HTTP:CONNECTIVITY' : null
        if (down) error = { type: mappedType(request, down), description: DESCRIPTIONS[down](host), step: request, cause: 'backend' }
      }
      if (!error) {
        store.saved = (store.saved ?? 0) + 1
        return { status: okStatus(xml, FLOW), ms: 180, flow: FLOW, body: JSON.stringify({ orderId: id, status: 'ACCEPTED' }) }
      }
      const out = outcomeOf(xml, FLOW, error.type, { description: error.description, payload: req.body ?? '' })
      // what the caller was told against what happened: a failure that answers 2xx is hidden
      const result = error.cause === 'backend' ? (out.status < 400 ? 'hidden' : out.status >= 500 ? 'reported' : 'other') : out.status === 404 ? 'notFound' : out.status < 400 ? 'hiddenNotFound' : 'other'
      store.outcomes = keep(store.outcomes, { t: now, id, type: error.type, status: out.status, kind: out.kind, result })
      const log = out.logged ? [errorLog({ name: NAME, xml, flow: FLOW, step: error.step, type: error.type, message: error.description, handler: out.kind })] : []
      return { status: out.status, ms: error.cause === 'backend' ? 2400 : 25, flow: FLOW, ...(out.flowFailed && { error: error.type }), body: out.body, log }
    },
  },
}
