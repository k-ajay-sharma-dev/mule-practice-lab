// The sample application of the end to end lab of SQL Server: the Customers System API of Brightmart. Imports only
// platform-log.js and the import free platform-xml.js, so the engine can load it without a cycle. The app reaches SQL
// Server through ctx.db (src/lab/platform-db.js), so its login, its grants and its pool show in the Databases console.
// What a GET binds and what a failed POST answers come from its Mule configuration (ctx.xml): the learner fixes both
// in the Flow editor.
import { info, needs, warn } from '../platform-log.js'
import { errorLog, outcomeOf, parseMule, partOf, stepsOf } from '../platform-xml.js'

export const PKG = 'e2e-customers-sapi'
export const APP = 'brightmart-customers-sapi'
export const ASSET = 'customers-system-api'
export const DB = 'brightmart-sql'
export const DB_PRD = 'brightmart-sql-prd'
export const HOST = 'sql.brightmart.lab'
export const HOST_PRD = 'sql-prd.brightmart.lab'
export const DATABASE = 'BrightmartCustomers'
export const TABLE = 'dbo.shop_customers'
export const GET_FLOW = 'get-customer-flow'
export const POST_FLOW = 'post-customer-flow'
const keep = (list, item, n = 30) => [...(list ?? []), item].slice(-n)
const json = (x) => JSON.stringify(x)

const HEAD = `<?xml version="1.0" encoding="UTF-8"?>
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

  <http:listener-config name="Customers_Listener_Config" doc:name="HTTP Listener config">
    <http:listener-connection host="0.0.0.0" port="8081"/>
  </http:listener-config>

  <db:config name="Customers_DB" doc:name="Database Config">
    <db:mssql-connection host="\${db.host}" port="\${db.port}" databaseName="\${db.database}" user="\${db.user}" password="\${db.password}">
      <db:pooling-profile maxPoolSize="\${db.pool.max}" maxWait="10"/>
    </db:mssql-connection>
  </db:config>

  <flow name="${GET_FLOW}">
    <http:listener config-ref="Customers_Listener_Config" path="/api/customers/{customerId}" allowedMethods="GET" doc:name="GET /customers/{customerId}">
      <http:response statusCode="#[vars.httpStatus default 200]"/>
      <http:error-response statusCode="#[vars.httpStatus default 500]">
        <http:body><![CDATA[#[payload]]]></http:body>
      </http:error-response>
    </http:listener>
`
// the prototype builds the SQL text from the URI parameter
const SELECT_CONCAT = `    <db:select config-ref="Customers_DB" queryTimeout="5" doc:name="Select customer">
      <db:sql><![CDATA[#["SELECT customer_id, email, first_name, last_name, country FROM ${TABLE} WHERE customer_id = '$(attributes.uriParams.customerId)'"]]]></db:sql>
    </db:select>
`
export const SELECT_BOUND = `    <db:select config-ref="Customers_DB" queryTimeout="5" doc:name="Select customer">
      <db:sql><![CDATA[SELECT customer_id, email, first_name, last_name, country FROM ${TABLE} WHERE customer_id = :customerId]]></db:sql>
      <db:input-parameters><![CDATA[#[{ customerId: attributes.uriParams.customerId }]]]></db:input-parameters>
    </db:select>
`
const GET_REST = `    <choice doc:name="Found?">
      <when expression="#[isEmpty(payload)]">
        <raise-error type="CUSTOMERS:NOT_FOUND" description="No customer with this id" doc:name="Not found"/>
      </when>
    </choice>
    <ee:transform doc:name="Row to customer">
      <ee:message>
        <ee:set-payload><![CDATA[%dw 2.0
output application/json
var row = payload[0]
---
{ customerId: row.customer_id, email: row.email, firstName: row.first_name, lastName: row.last_name, country: row.country }]]></ee:set-payload>
      </ee:message>
    </ee:transform>
    <error-handler>
      <on-error-continue type="CUSTOMERS:NOT_FOUND" doc:name="Unknown id">
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
    </error-handler>
  </flow>

  <flow name="${POST_FLOW}">
    <http:listener config-ref="Customers_Listener_Config" path="/api/customers" allowedMethods="POST" doc:name="POST /customers">
      <http:response statusCode="#[vars.httpStatus default 201]"/>
      <http:error-response statusCode="#[vars.httpStatus default 500]">
        <http:body><![CDATA[#[payload]]]></http:body>
      </http:error-response>
    </http:listener>
    <ee:transform doc:name="Map to row">
      <ee:message>
        <ee:set-payload><![CDATA[%dw 2.0
output application/java
---
{
  customerId: vars.customerId,
  email: lower(trim(payload.email)),
  firstName: trim(payload.firstName),
  lastName: trim(payload.lastName),
  country: upper(payload.country)
}]]></ee:set-payload>
      </ee:message>
    </ee:transform>
    <db:insert config-ref="Customers_DB" queryTimeout="5" doc:name="Insert customer">
      <db:sql><![CDATA[INSERT INTO ${TABLE} (customer_id, email, first_name, last_name, country) VALUES (:customerId, :email, :firstName, :lastName, :country)]]></db:sql>
      <db:input-parameters><![CDATA[#[payload]]]></db:input-parameters>
    </db:insert>
    <ee:transform doc:name="Created">
      <ee:message>
        <ee:set-payload><![CDATA[%dw 2.0
output application/json
---
{ customerId: vars.customerId }]]></ee:set-payload>
      </ee:message>
    </ee:transform>
`
export const HANDLER = `    <error-handler>
      <on-error-continue type="DB:QUERY_EXECUTION" when="#[error.description contains 'duplicate key']" doc:name="Email exists">
        <set-variable variableName="httpStatus" value="409" doc:name="409"/>
        <ee:transform doc:name="Conflict body">
          <ee:message>
            <ee:set-payload><![CDATA[%dw 2.0
output application/json
---
{ message: "A customer with this email exists" }]]></ee:set-payload>
          </ee:message>
        </ee:transform>
      </on-error-continue>
      <on-error-propagate type="DB:CONNECTIVITY" doc:name="Database unavailable">
        <set-variable variableName="httpStatus" value="503" doc:name="503"/>
        <ee:transform doc:name="Unavailable body">
          <ee:message>
            <ee:set-payload><![CDATA[%dw 2.0
output application/json
---
{ message: "The customer store is not available. Send the request again later." }]]></ee:set-payload>
          </ee:message>
        </ee:transform>
      </on-error-propagate>
    </error-handler>
`
const TAIL = `  </flow>
</mule>
`
// The first cut that runs in Sandbox when the lab starts: SQL built from text, and no error handler on the POST
export const PROTO_XML = `${HEAD}${SELECT_CONCAT}${GET_REST}${TAIL}`
// The configuration the team merged: a bound parameter, and the database errors mapped to 409 and 503
export const FIXED_XML = `${HEAD}${SELECT_BOUND}${GET_REST}${HANDLER}${TAIL}`

// the Database config of the app (an MS SQL Server connection), read from its properties
export const cfgOf = (p) => ({ host: p['db.host'], port: p['db.port'], database: p['db.database'], user: p['db.user'], password: p['db.password'], maxPoolSize: p['db.pool.max'], maxWait: '10', queryTimeout: '5' })
// the server behind a host name; a host of neither leads to the Sandbox server, whose host check then fails
const dbOf = (p) => (String(p['db.host'] ?? '').trim().toLowerCase() === HOST_PRD ? DB_PRD : DB)

// Does the deployed Select bind its value? A db:sql that is an expression builds the SQL text from the request.
export function selectOf(xml) {
  const step = stepsOf(xml, GET_FLOW, 'db:select')[0]
  const sql = partOf(step, 'db:sql')?.text ?? ''
  const params = partOf(step, 'db:input-parameters')?.text ?? ''
  return { step, sql, bound: Boolean(step) && !/#\[/.test(sql) && /:customerId\b/.test(sql) && /customerId/.test(params) }
}
const valid = (o) => o && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(o.email ?? '').trim()) && String(o.firstName ?? '').trim() && String(o.lastName ?? '').trim() && /^[A-Za-z]{2}$/.test(String(o.country ?? '').trim())

export const PACKAGES = {
  [PKG]: {
    note: `Customers System API of Brightmart over SQL Server, database ${DATABASE}. POST /customers with {"email","firstName","lastName","country"} inserts one row into ${TABLE} with a new customerId. GET /customers/{customerId} reads one. The unique index on email refuses a second account for the same email. Properties: db.host, db.port, db.database, db.user, db.password (protected), db.pool.max (maxPoolSize), api.id and the client ID and secret of the environment.`,
    sample: { method: 'GET', path: '/customers/BC-10001' },
    traced: true,
    boot: needs('db.host', 'db.port', 'db.database', 'db.user', 'db.password', 'db.pool.max'),
    handle(ctx, req) {
      const store = (ctx.app.store ??= {})
      // lab: an app with no XML runs the configuration the team merged
      const xml = ctx.xml ?? parseMule(FIXED_XML)
      const cfg = cfgOf(ctx.props)
      const db = dbOf(ctx.props)
      const path = req.path.split('?')[0].replace(/\/+$/, '')
      const one = path.match(/^\/customers\/([^/]+)$/)
      if (req.method === 'GET' && one) {
        const id = decodeURIComponent(one[1])
        const sel = selectOf(xml)
        // the prototype puts the id into the SQL text; the fix sends it as a parameter
        const r = sel.bound
          ? ctx.db.select(db, cfg, `SELECT customer_id, email, first_name, last_name, country FROM ${TABLE} WHERE customer_id = :customerId`, { customerId: id })
          : ctx.db.select(db, cfg, `SELECT customer_id, email, first_name, last_name, country FROM ${TABLE} WHERE customer_id = '${id}'`)
        if (!r.ok) {
          const out = outcomeOf(xml, GET_FLOW, r.errorType, { description: r.text })
          return { status: out.status, ms: (r.ms ?? 20) + 10, flow: GET_FLOW, error: r.errorType, body: out.body || json({ message: r.text }), log: [errorLog({ name: ctx.app.name, xml, flow: GET_FLOW, step: sel.step, type: r.errorType, message: r.text })] }
        }
        const row = r.rows[0]
        if (!row) return { status: 404, ms: r.ms + 6, flow: GET_FLOW, body: json({ message: 'Customer not found' }) }
        return { status: 200, ms: r.ms + 8, flow: GET_FLOW, log: [info(`Customer ${row.customer_id} read from ${TABLE}${sel.bound ? ' with a bound parameter' : ''}`)], body: json({ customerId: row.customer_id, email: row.email, firstName: row.first_name, lastName: row.last_name, country: row.country }) }
      }
      if (path !== '/customers') return { status: 404, ms: 3, error: 'APIKIT:NOT_FOUND', body: json({ message: 'Resource not found' }) }
      if (req.method !== 'POST') return { status: 405, ms: 3, error: 'APIKIT:METHOD_NOT_ALLOWED', body: json({ message: 'Method not allowed' }) }
      let o = null
      try {
        o = JSON.parse(req.body || 'null')
      } catch {
        o = null
      }
      if (!valid(o)) return { status: 400, ms: 6, flow: POST_FLOW, error: 'APIKIT:BAD_REQUEST', log: [warn('APIKIT:BAD_REQUEST: the body needs email, firstName, lastName and a two letter country, as the NewCustomer type of the RAML says')], body: json({ message: 'Bad request: email, firstName, lastName and a two letter country are required' }) }
      store.n = (store.n ?? 0) + 1
      const id = `BC-${10040 + store.n}`
      // the Map to row transform
      const row = { customerId: id, email: String(o.email).trim().toLowerCase(), firstName: String(o.firstName).trim(), lastName: String(o.lastName).trim(), country: String(o.country).trim().toUpperCase() }
      const r = ctx.db.insert(db, cfg, `INSERT INTO ${TABLE} (customer_id, email, first_name, last_name, country) VALUES (:customerId, :email, :firstName, :lastName, :country)`, row)
      if (r.ok) {
        store.created = keep(store.created, { id, email: row.email, t: ctx.now, env: ctx.app.env })
        return { status: 201, ms: r.ms + 14, flow: POST_FLOW, log: [info(`Customer ${id} (${row.email}, ${row.country}) inserted into ${TABLE} as ${cfg.user}`)], body: json({ customerId: id }) }
      }
      const dup = r.code === 2601 || r.code === 2627
      let out = outcomeOf(xml, POST_FLOW, r.errorType, { description: r.text })
      // lab: the `when` of the 409 handler is read as "a duplicate key"; another query error passes it
      if (out.kind === 'continue' && out.handler?.when && !dup) out = outcomeOf(xml, POST_FLOW, 'MULE:UNKNOWN', { description: r.text })
      const insert = stepsOf(xml, POST_FLOW, 'db:insert')[0]
      const log = out.logged ? [errorLog({ name: ctx.app.name, xml, flow: POST_FLOW, step: insert, type: r.errorType, message: r.text, handler: out.kind })] : []
      let body = out.body
      if (dup && out.status === 409) {
        const had = ctx.db.select(db, cfg, `SELECT customer_id FROM ${TABLE} WHERE email = :email`, { email: row.email })
        body = json({ message: 'A customer with this email exists', customerId: had.ok ? (had.rows[0]?.customer_id ?? null) : null })
        log.push(warn(`Sign-up for ${row.email} came again. SQL Server error ${r.code}, answered 409 with the stored customerId. Nothing was written twice.`))
      }
      const kind = dup ? 'dups' : r.errorType === 'DB:CONNECTIVITY' ? 'down' : 'failed'
      store[kind] = keep(store[kind], { email: row.email, t: ctx.now, status: out.status, code: r.code ?? null, env: ctx.app.env })
      return { status: out.status, ms: (r.ms ?? 30) + 20, flow: POST_FLOW, ...(out.flowFailed && { error: r.errorType }), body: body || json({ message: r.text }), log }
    },
  },
}
