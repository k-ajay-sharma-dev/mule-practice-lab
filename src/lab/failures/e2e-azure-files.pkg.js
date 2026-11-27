// The sample application of the end to end lab of Azure Files. Imports only platform-log.js, so the engine can load it
// without a cycle (platform-xml.js is import free too). The package stands for the flows the team builds in Studio on
// the Store Reports System API. Its mule-config.xml (START_XML) travels in the Studio project and the jar; what the poll
// does with a report that does not parse comes from the error handler of the try scope in that XML (ctx.xml).
import { info, line, muleError, needs, warn } from '../platform-log.js'
import { errorHandlerOf, handlerFor, stepsOf } from '../platform-xml.js'

export const PKG = 'store-reports-sapi'
export const FLOW = 'store-report-poll'
export const HEADER = 'STORE;BUSINESS_DATE;TILL;GROSS;REFUNDS'
export const TABLE = 'dbo.store_daily_sales'
// Lab made: the Mule Database config names a host; the lab finds the database server of the lab by that host
export const DB_OF = { 'sql-reports-sbx.brightmart.lab': 'reports-sql-sbx', 'sql-reports-prd.brightmart.lab': 'reports-sql-prd' }
const dir = (v) => String(v ?? '').trim().replace(/^\/+|\/+$/g, '')
const json = (x) => JSON.stringify(x)
const money = (n) => Math.round(n * 100) / 100

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

  <!-- the File REST API of Azure Files, with the SAS as the query: CloudHub cannot mount SMB -->
  <http:request-config name="Files_Config" doc:name="Azure Files">
    <http:request-connection protocol="HTTPS" host="\${share.account}.file.core.windows.net" port="443"/>
  </http:request-config>
  <db:config name="Reports_DB_Config" doc:name="Reporting database">
    <db:mssql-connection host="\${db.host}" port="\${db.port}" databaseName="\${db.database}" user="\${db.user}" password="\${secure::db.password}"/>
  </db:config>

  <flow name="store-report-poll">
    <scheduler doc:name="Every minute">
      <scheduling-strategy><fixed-frequency frequency="1" timeUnit="MINUTES"/></scheduling-strategy>
    </scheduler>
    <http:request method="GET" config-ref="Files_Config" path="#['/' ++ p('share.name') ++ '/' ++ p('share.inboxDir') ++ '?restype=directory&amp;comp=list&amp;' ++ p('secure::share.sas')]" doc:name="List the inbox"/>
    <foreach collection="#[payload.files]" doc:name="Each report">
      <try doc:name="One report">
        <http:request method="GET" config-ref="Files_Config" path="#[vars.filePath]" doc:name="Get File"/>
        <ee:transform doc:name="Tills to daily sales">
          <ee:message>
            <ee:set-payload><![CDATA[%dw 2.0
input payload application/csv separator=";"
output application/java
---
payload groupBy ($.STORE ++ "|" ++ $.BUSINESS_DATE) pluck ((tills) -> do {
  var gross = sum(tills.GROSS map ($ as Number))
  var refunds = sum(tills.REFUNDS map ($ as Number))
  ---
  {
    store_id: tills[0].STORE,
    sales_date: tills[0].BUSINESS_DATE as Date { format: "dd.MM.yyyy" },
    tills: sizeOf(tills),
    gross: gross, refunds: refunds, net: gross - refunds,
    file_name: vars.fileName
  }
})]]></ee:set-payload>
          </ee:message>
        </ee:transform>
        <foreach doc:name="Each row">
          <!-- upsert on store_id and sales_date: UPDATE, then INSERT when no row was updated -->
          <db:update config-ref="Reports_DB_Config" doc:name="Upsert daily sales">
            <db:sql>UPDATE dbo.store_daily_sales SET tills = :tills, gross = :gross, refunds = :refunds, net = :net WHERE store_id = :store_id AND sales_date = :sales_date</db:sql>
            <db:input-parameters>#[payload]</db:input-parameters>
          </db:update>
        </foreach>
        <http:request method="PUT" config-ref="Files_Config" path="#[vars.processedPath ++ '?comp=rename']" doc:name="Rename to processed"/>
        <error-handler>
`
const TAIL = `        </error-handler>
      </try>
    </foreach>
  </flow>
</mule>
`
// What the team wrote: any error of a report fails the whole poll, so a bad report stays in inbox and blocks the rest
const PROPAGATE = `          <on-error-propagate type="ANY" doc:name="Fail the poll">
            <logger level="ERROR" message="#[error.description]" doc:name="Log the error"/>
          </on-error-propagate>
`
// The fix: a report that does not parse is renamed into errors and the poll goes on with the next one
const CONTINUE = `          <on-error-continue type="EXPRESSION" doc:name="Bad report to errors">
            <logger level="WARN" message="#['Rejected ' ++ vars.fileName ++ ': ' ++ error.description]" doc:name="Log the rejection"/>
            <http:request method="PUT" config-ref="Files_Config" path="#[vars.errorPath ++ '?comp=rename']" doc:name="Rename to errors"/>
          </on-error-continue>
`
export const START_XML = `${HEAD}${PROPAGATE}${TAIL}`
export const FIXED_XML = `${HEAD}${CONTINUE}${PROPAGATE}${TAIL}`
// The handler of the try scope that runs for a report that does not parse: does it rename the report into errors?
export function rejectsToErrors(xml) {
  if (!xml) return true // lab: an app deployed without a Mule configuration of its own runs the flow as the package has it
  const scope = stepsOf(xml, FLOW, 'try')[0]
  const h = handlerFor(scope?.errorHandler ?? errorHandlerOf(xml, FLOW), 'MULE:EXPRESSION')
  return h?.kind === 'continue' && h.steps.some((x) => x.kind === 'http:request' && /error/i.test(String(x.attrs.path ?? '')))
}

export function cidOf(seed) {
  let h = 2166136261
  for (const c of String(seed)) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0
  return `${h.toString(16).padStart(8, '0')}-c7a1-11f1`
}

const lines = (text) => String(text ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
export function problemOf(text) {
  const all = lines(text)
  if (all[0] !== HEADER) return `the header is '${all[0] ?? ''}', expected '${HEADER}'`
  for (let i = 1; i < all.length; i++) {
    const c = all[i].split(';').map((x) => x.trim())
    if (c.length !== 5) return `line ${i + 1} has ${c.length} fields, expected 5`
    if (!/^S\d{3}$/.test(c[0])) return `line ${i + 1}: STORE '${c[0]}' is not a store such as S014`
    if (!/^\d{2}\.\d{2}\.\d{4}$/.test(c[1])) return `line ${i + 1}: BUSINESS_DATE '${c[1]}' is not dd.MM.yyyy`
    for (const [k, v] of [['GROSS', c[3]], ['REFUNDS', c[4]]]) if (!/^\d+(\.\d{1,2})?$/.test(v)) return `line ${i + 1}: ${k} '${v}' is not an amount such as 1840.50`
  }
  return all.length > 1 ? null : 'the report has no tills'
}
// What the DataWeave mapping makes of one report: one row per store and day, the tills summed
export function rowsOf(text, file) {
  const groups = new Map()
  for (const l of lines(text).slice(1)) {
    const [store, date, , gross, refunds] = l.split(';').map((x) => x.trim())
    const k = `${store}|${date}`
    const g = groups.get(k) ?? { store_id: store, sales_date: `${date.slice(6, 10)}-${date.slice(3, 5)}-${date.slice(0, 2)}`, tills: 0, gross: 0, refunds: 0, file_name: file }
    g.tills++
    g.gross = money(g.gross + Number(gross))
    g.refunds = money(g.refunds + Number(refunds))
    groups.set(k, g)
  }
  return [...groups.values()].map((g) => ({ ...g, net: money(g.gross - g.refunds) }))
}

const el = {
  list: { at: 1, name: 'List the inbox', dsl: '<http:request method="GET" config-ref="Files_Config" path="#[vars.inbox ++ \'?restype=directory&amp;comp=list\']">' },
  transform: { at: 4, name: 'Tills to daily sales', dsl: '<ee:transform doc:name="Tills to daily sales">' },
  upsert: { at: 5, name: 'Update daily sales', dsl: '<db:update config-ref="Reports_DB_Config">' },
  move: { at: 6, name: 'Rename to processed', dsl: '<http:request method="PUT" config-ref="Files_Config" path="#[vars.processedPath ++ \'?comp=rename\']">' },
}
const fail = (log, where, type, message) => ({ ok: false, ms: 2000, errorType: type, log: [...log, muleError({ flow: FLOW, file: PKG, ...el[where], type, message })] })
const httpType = (e) => (e.status === 403 ? 'HTTP:FORBIDDEN' : e.status === 404 ? 'HTTP:NOT_FOUND' : e.status === 503 ? 'HTTP:SERVICE_UNAVAILABLE' : 'HTTP:CONNECTIVITY')
const shareOf = (ctx) => ctx.systems.files(`share:${String(ctx.props['share.account'] ?? '').trim()}/${String(ctx.props['share.name'] ?? '').trim()}`, { sas: ctx.props['share.sas'] })
const dbCfg = (p) => ({ user: p['db.user'], password: p['db.password'], host: p['db.host'], port: p['db.port'], database: p['db.database'] })
const dbName = (p) => DB_OF[String(p['db.host'] ?? '').trim().toLowerCase()] ?? String(p['db.host'] ?? '').trim()
const remember = (store, entry) => {
  store.reports = [...(store.reports ?? []).filter((x) => x.name !== entry.name), entry].slice(-20)
}
function upsert(ctx, row) {
  const p = ctx.props
  const u = ctx.db.update(dbName(p), dbCfg(p), `UPDATE ${TABLE} SET tills = :tills, gross = :gross, refunds = :refunds, net = :net, file_name = :file_name, loaded_at = SYSDATETIME() WHERE store_id = :store_id AND sales_date = :sales_date`, row)
  if (!u.ok || u.affected) return { ...u, updated: Boolean(u.affected) }
  return ctx.db.insert(dbName(p), dbCfg(p), `INSERT INTO ${TABLE} (store_id, sales_date, tills, gross, refunds, net, file_name, loaded_at) VALUES (:store_id, :sales_date, :tills, :gross, :refunds, :net, :file_name, SYSDATETIME())`, row)
}

export const PACKAGES = {
  [PKG]: {
    layer: 'System',
    traced: true,
    note: 'Store Reports System API. Every minute it lists share.inboxDir on the Azure file share share.name over the File REST API with the SAS in share.sas, maps each end of day report (STORE;BUSINESS_DATE;TILL;GROSS;REFUNDS) to one row per store and day and upserts dbo.store_daily_sales on the reporting database. A loaded report is renamed into share.processedDir, a report that does not parse into share.errorDir. GET /reports shows each report with its correlation ID; POST /reports/{name}/replay moves a fixed report back to the inbox.',
    sample: { method: 'GET', path: '/reports' },
    boot: needs('share.account', 'share.name', 'share.sas', 'share.inboxDir', 'share.processedDir', 'share.errorDir', 'db.host', 'db.database', 'db.user', 'db.password'),
    schedules: [{ flow: FLOW, type: 'fixed', value: '1', unit: 'minutes', enabled: true }],
    run: {
      [FLOW]: (ctx) => {
        const { props, store, now } = ctx
        const f = shareOf(ctx)
        const log = [info(`Polling ${props['share.name']}/${dir(props['share.inboxDir'])}`)]
        // a file on a share is visible while a store server still writes it: list and read with a size check
        const listed = f.list(dir(props['share.inboxDir']), { sizeCheck: 2000 })
        if (!listed.ok) return fail([...log, line('ERROR', `Azure Files answered ${listed.error}`)], 'list', httpType(listed), `HTTP GET failed: ${listed.status ? `(${listed.status}) ${listed.code}` : listed.error}`)
        const files = listed.files.filter((x) => !x.dir && x.name.toLowerCase().endsWith('.csv'))
        if (!files.length) return { ok: true, ms: 200, log: [...log, info('No new store reports')] }
        for (const file of files) {
          const cid = cidOf(`${file.name}/${now}`)
          const say = (text) => info(`event:${cid} ${text}`)
          const r = f.read(file.path, { sizeCheck: 2000 })
          if (!r.ok && r.kind === 'being-written') continue
          if (!r.ok) return fail(log, 'list', httpType(r), `HTTP GET failed: ${r.error}`)
          log.push(say(`Picked up ${file.path}, ${r.size} bytes`))
          const was = (store.reports ?? []).find((x) => x.name === file.name)
          const problem = problemOf(r.content)
          if (problem && !rejectsToErrors(ctx.xml)) {
            // on-error-propagate: the poll fails at this report, the report stays in inbox and the next poll fails again
            remember(store, { name: file.name, status: 'failing', problem, rows: 0, correlationId: cid, t: now, failing: was?.failing ?? now })
            return { ...fail(log, 'transform', 'MULE:EXPRESSION', `Cannot read ${file.name}: ${problem}. The handler of the try scope propagates, so the report stays in ${dir(props['share.inboxDir'])} and the reports after it wait`), store }
          }
          if (problem) {
            const m = f.move(file.path, `${dir(props['share.errorDir'])}/${file.name}`, { overwrite: true })
            if (!m.ok) return fail(log, 'move', httpType(m), `HTTP PUT failed: ${m.error}`)
            log.push(warn(`event:${cid} Rejected ${file.name}: ${problem}. Moved it to ${m.path}. No row of it was written`))
            remember(store, { name: file.name, status: 'rejected', problem, rows: 0, correlationId: cid, t: now, rejected: now, ...(was?.failing && { failing: was.failing }) })
            continue
          }
          const rows = rowsOf(r.content, file.name)
          const g = rows[0]
          log.push(say(`DataWeave grouped ${lines(r.content).length - 1} tills into ${rows.length} row${rows.length === 1 ? '' : 's'}. First: ${g.store_id} on ${g.sales_date}, ${g.tills} tills, gross ${g.gross.toFixed(2)}, refunds ${g.refunds.toFixed(2)}, net ${g.net.toFixed(2)}`))
          let updated = 0
          for (const row of rows) {
            const w = upsert(ctx, row)
            if (!w.ok) {
              // the report stays in the inbox, so the next poll tries again: nothing is lost while the database is down
              remember(store, { name: file.name, status: 'waiting', problem: w.text, rows: 0, correlationId: cid, t: now })
              return fail([...log, line('ERROR', `event:${cid} ${w.text ?? 'The database call failed'}`)], 'upsert', w.errorType ?? 'DB:CONNECTIVITY', w.text ?? 'The database call failed')
            }
            if (w.updated) updated++
          }
          log.push(say(`Upserted ${rows.length} rows into ${TABLE} on ${props['db.host']}: ${updated} updated, ${rows.length - updated} inserted`))
          const m = f.move(file.path, `${dir(props['share.processedDir'])}/${file.name}`, { overwrite: true })
          if (!m.ok) return fail(log, 'move', httpType(m), `HTTP PUT failed: ${m.error}`)
          log.push(say(`Renamed ${file.path} to ${m.path}`))
          remember(store, { name: file.name, status: 'loaded', rows: rows.length, correlationId: cid, t: now, ...(was?.replayed && { replayed: was.replayed }), ...(was?.rejected && { rejected: was.rejected }), ...(was?.failing && { failing: was.failing }) })
        }
        return { ok: true, ms: 700, log, store }
      },
    },
    handle(ctx, req) {
      const path = req.path.split('?')[0]
      const store = (ctx.app.store ??= {})
      const list = store.reports ?? []
      const cfg = `${PKG}-config`
      if (req.method === 'GET' && path === '/reports') return { status: 200, ms: 12, flow: `get:\\reports:${cfg}`, body: json(list.map(({ t, rejected, failing, ...x }) => x)) }
      const one = path.match(/^\/reports\/([^/]+)$/)
      if (req.method === 'GET' && one) {
        const x = list.find((y) => y.name === decodeURIComponent(one[1]))
        if (!x) return { status: 404, ms: 6, error: 'APIKIT:NOT_FOUND', flow: `get:\\reports\\(name):${cfg}`, body: json({ message: 'No such report' }) }
        const { t, rejected, failing, ...rest } = x
        return { status: 200, ms: 8, flow: `get:\\reports\\(name):${cfg}`, body: json(rest) }
      }
      const replay = path.match(/^\/reports\/([^/]+)\/replay$/)
      if (req.method === 'POST' && replay) {
        const flow = `post:\\reports\\(name)\\replay:${cfg}`
        const name = decodeURIComponent(replay[1])
        const p = ctx.props
        const m = shareOf(ctx).move(`${dir(p['share.errorDir'])}/${name}`, `${dir(p['share.inboxDir'])}/${name}`, { overwrite: true })
        if (!m.ok && m.kind === 'not-found') return { status: 404, ms: 40, error: 'APIKIT:NOT_FOUND', flow, body: json({ message: `${name} is not in the error directory` }) }
        if (!m.ok) return { status: 502, ms: 60, error: httpType(m), flow, log: [line('ERROR', `Replay of ${name} failed: ${m.error}`)], body: json({ message: m.error }) }
        const was = list.find((y) => y.name === name)
        store.reports = [...list.filter((y) => y.name !== name), { ...(was ?? { name, rows: 0 }), status: 'replayed', replayed: ctx.now, t: ctx.now }].slice(-20)
        return { status: 202, ms: 45, flow, log: [info(`Replay of ${name}: renamed it from ${dir(p['share.errorDir'])} to ${m.path}. The poll picks it up within a minute`)], body: json({ name, status: 'replayed' }) }
      }
      return { status: 404, ms: 3, error: 'APIKIT:NOT_FOUND', flow: `${PKG}-main`, body: json({ message: 'Resource not found' }) }
    },
  },
}
