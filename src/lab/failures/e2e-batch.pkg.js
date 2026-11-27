// The sample application of the end to end lab of batch: the nightly order load of Brightmart. Imports only
// platform-log.js and the import free platform-xml.js and platform-batch.js, so the engine can load it without a cycle.
// The app takes the order file of the stores from the POS SFTP server (ctx.systems), runs it through the Batch Job of
// its Mule configuration (ctx.xml: block size, max failed records, the aggregator, the failed records step and On
// Complete are read from the XML the learner fixes) and writes to SQL Server through ctx.db.
// Lab-made: a file of 300,000 orders keeps a few sample lines and a trailer with the record count. The sample lines
// stand for the rest; FILE_FACTS says how many orders of a store the whole file has.
import { info, line, needs, warn } from '../platform-log.js'
import { instanceIdOf } from '../platform-batch.js'
import { batchOf, parseMule, partOf, stepsOf } from '../platform-xml.js'

export const PKG = 'e2e-order-load'
export const APP = 'brightmart-order-load'
export const ASSET = 'order-loads-api'
export const FLOW = 'nightly-orders-flow'
export const JOB = 'nightly-orders-job'
export const DB = 'brightmart-sales-sql'
export const DB_PRD = 'brightmart-sales-sql-prd'
export const HOST = 'sales-sql.brightmart.lab'
export const HOST_PRD = 'sales-sql-prd.brightmart.lab'
export const DATABASE = 'BrightmartSales'
export const SFTP = 'pos-sftp.brightmart.lab'
export const SFTP_PRD = 'pos-sftp-prd.brightmart.lab'
export const DIR = '/out/orders'
export const ARCHIVE = '/out/orders/archive'
export const STORES = 'dbo.stores'
export const ORDERS = 'dbo.store_orders'
export const REJECTS = 'dbo.order_rejects'
export const UNKNOWN = 'ORDERS:UNKNOWN_STORE'
// lab-made: orders per store in a whole file whose sample lines show that store, and where the first one is
export const FILE_FACTS = { 'ST-212': { orders: 37, firstRow: 4137, every: 8443 } }
const ENGINE = 'com.mulesoft.mule.runtime.module.batch.engine.DefaultBatchEngine'
const BASE = Date.UTC(2026, 10, 2)
const number = (n) => n.toLocaleString('en-US')
const json = (x) => JSON.stringify(x)
const keep = (list, item, n = 20) => [...(list ?? []), item].slice(-n)
const int = (v, d) => (/^-?\d+$/.test(String(v ?? '').trim()) ? Number(v) : d)
export const INSERT_SQL = `INSERT INTO ${ORDERS} (order_id, store_code, order_date, line_count, total, load_id) VALUES (:orderId, :storeCode, :orderDate, :lineCount, :total, :loadId)`
export const REJECT_SQL = `INSERT INTO ${REJECTS} (load_id, order_id, store_code, error, raw) VALUES (:loadId, :orderId, :storeCode, :error, :raw)`

// ---------- the Mule configuration ----------

const HEAD = `<?xml version="1.0" encoding="UTF-8"?>
<mule xmlns="http://www.mulesoft.org/schema/mule/core"
      xmlns:db="http://www.mulesoft.org/schema/mule/db"
      xmlns:ee="http://www.mulesoft.org/schema/mule/ee/core"
      xmlns:batch="http://www.mulesoft.org/schema/mule/ee/batch"
      xmlns:doc="http://www.mulesoft.org/schema/mule/documentation"
      xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
      xsi:schemaLocation="http://www.mulesoft.org/schema/mule/core http://www.mulesoft.org/schema/mule/core/current/mule.xsd
        http://www.mulesoft.org/schema/mule/db http://www.mulesoft.org/schema/mule/db/current/mule-db.xsd
        http://www.mulesoft.org/schema/mule/ee/core http://www.mulesoft.org/schema/mule/ee/core/current/mule-ee.xsd
        http://www.mulesoft.org/schema/mule/ee/batch http://www.mulesoft.org/schema/mule/ee/batch/current/mule-batch-ee.xsd">

  <configuration-properties file="config.yaml" doc:name="Configuration properties"/>

  <db:config name="Sales_DB" doc:name="Database Config">
    <db:mssql-connection host="\${db.host}" port="\${db.port}" databaseName="\${db.database}" user="\${db.user}" password="\${db.password}"/>
  </db:config>

  <flow name="${FLOW}">
    <scheduler doc:name="Every night at 02:00">
      <scheduling-strategy>
        <cron expression="0 0 2 * * ?" timeZone="UTC"/>
      </scheduling-strategy>
    </scheduler>
    <!-- lab: sftp:list and sftp:read of /out/orders are outside the XML model of the lab. The app lists the new files,
         reads each one as a repeatable file store stream with the CSV reader in streaming mode, sets vars.loadId to the
         file name without .csv, and the records go into the job one by one. -->
    <db:select config-ref="Sales_DB" target="storeCodes" doc:name="Known stores">
      <db:sql><![CDATA[SELECT store_code FROM ${STORES}]]></db:sql>
    </db:select>
`
const job = (max) => `    <batch:job jobName="${JOB}" blockSize="100" maxFailedRecords="${max}">
      <batch:process-records>
        <batch:step name="validate-and-map">
          <choice doc:name="Known store?">
            <when expression="#[not (vars.storeCodes.store_code contains payload.store_code)]">
              <raise-error type="${UNKNOWN}" description="#['Store ' ++ payload.store_code ++ ' is not in ${STORES}']" doc:name="Unknown store"/>
            </when>
          </choice>
          <ee:transform doc:name="Map order">
            <ee:message>
              <ee:set-payload><![CDATA[%dw 2.0
output application/java
---
{
  orderId: payload.order_id,
  storeCode: payload.store_code,
  orderDate: payload.order_date as Date,
  lineCount: payload.line_count as Number,
  total: payload.total as Number,
  loadId: vars.loadId
}]]></ee:set-payload>
            </ee:message>
          </ee:transform>
        </batch:step>
`
const INSERT_ONE = `        <batch:step name="insert-orders">
          <db:insert config-ref="Sales_DB" doc:name="Insert order">
            <db:sql><![CDATA[${INSERT_SQL}]]></db:sql>
            <db:input-parameters><![CDATA[#[payload]]]></db:input-parameters>
          </db:insert>
        </batch:step>
`
export const INSERT_BULK = `        <batch:step name="insert-orders">
          <batch:aggregator size="1000" doc:name="1000 orders per insert">
            <db:bulk-insert config-ref="Sales_DB" doc:name="Bulk insert orders">
              <db:sql><![CDATA[${INSERT_SQL}]]></db:sql>
            </db:bulk-insert>
          </batch:aggregator>
        </batch:step>
`
export const REJECT_STEP = `        <batch:step name="save-rejects" acceptPolicy="ONLY_FAILURES">
          <ee:transform doc:name="Reject row">
            <ee:message>
              <ee:set-payload><![CDATA[%dw 2.0
output application/java
---
{
  loadId: vars.loadId,
  orderId: payload.order_id,
  storeCode: payload.store_code,
  error: Batch::getFirstException().message default "unknown",
  raw: write(payload, "application/json")
}]]></ee:set-payload>
            </ee:message>
          </ee:transform>
          <db:insert config-ref="Sales_DB" doc:name="Insert reject">
            <db:sql><![CDATA[${REJECT_SQL}]]></db:sql>
            <db:input-parameters><![CDATA[#[payload]]]></db:input-parameters>
          </db:insert>
        </batch:step>
`
const END_RECORDS = `      </batch:process-records>
`
export const ON_COMPLETE = `      <batch:on-complete>
        <logger level="INFO" doc:name="Load report" message="#['Load report: ' ++ (payload.totalRecords as String) ++ ' records, ' ++ (payload.successfulRecords as String) ++ ' successful, ' ++ (payload.failedRecords as String) ++ ' failed']"/>
        <!-- lab: email:send of the same report to the address in report.to is outside the XML model of the lab -->
      </batch:on-complete>
`
const TAIL = `    </batch:job>
  </flow>
</mule>
`
// The first cut that runs in Sandbox: the first failed record stops the job, one INSERT per order, failures only in the log
export const PROTO_XML = `${HEAD}${job(0)}${INSERT_ONE}${END_RECORDS}${TAIL}`
// The configuration the team merged
export const FIXED_XML = `${HEAD}${job(-1)}${INSERT_BULK}${REJECT_STEP}${END_RECORDS}${ON_COMPLETE}${TAIL}`

// What the job of the deployed configuration does: { blockSize, max, insert: { bulk, size }, rejects, onComplete }
export function jobOf(xml) {
  const b = batchOf(xml, FLOW)[0]
  const node = stepsOf(xml, FLOW, 'batch:job')[0]
  if (!b || !node) return null
  const steps = (partOf(node, 'batch:process-records')?.parts ?? []).filter((p) => p.kind === 'batch:step').map((st) => {
    const agg = partOf(st, 'batch:aggregator')
    const ops = [...st.steps, ...(agg?.steps ?? [])].filter((x) => x.kind.startsWith('db:')).map((x) => ({ kind: x.kind, sql: partOf(x, 'db:sql')?.text ?? '', inAggregator: Boolean(agg?.steps.includes(x)) }))
    return { name: st.attrs.name, accept: st.attrs.acceptPolicy ?? 'NO_FAILURES', aggregator: agg ? { size: int(agg.attrs.size, 0) } : null, ops }
  })
  const writes = (st, table) => st.ops.some((o) => ['db:insert', 'db:bulk-insert'].includes(o.kind) && o.sql.toLowerCase().includes(table.split('.')[1]))
  const ins = steps.find((st) => st.accept !== 'ONLY_FAILURES' && writes(st, ORDERS))
  const insAt = steps.indexOf(ins)
  const bulk = Boolean(ins?.aggregator && ins.ops.some((o) => o.kind === 'db:bulk-insert' && o.inAggregator) && !ins.ops.some((o) => o.kind === 'db:insert'))
  const rejectStep = steps.find((st, i) => st.accept === 'ONLY_FAILURES' && i > insAt && writes(st, REJECTS))
  return { blockSize: b.blockSize, max: b.maxFailedRecords, steps, insert: ins ? { name: ins.name, bulk, size: ins.aggregator?.size ?? 0 } : null, rejects: rejectStep ? rejectStep.name : null, onComplete: Boolean(partOf(node, 'batch:on-complete')) }
}

// ---------- the order file ----------

export const HEADER = 'order_id,store_code,order_date,line_count,total'
// a CSV with a trailer line: TRAILER,<number of orders>
export function readOrders(content) {
  const lines = String(content ?? '').split(/\r?\n/).filter((x) => x.trim())
  const trailer = lines.find((x) => x.startsWith('TRAILER,'))
  const rows = lines
    .filter((x) => x !== lines[0] && !x.startsWith('TRAILER,'))
    .map((x) => {
      const [order_id, store_code, order_date, line_count, total] = x.split(',')
      return { order_id, store_code, order_date, line_count, total }
    })
  return { header: lines[0], rows, total: trailer ? Number(trailer.split(',')[1]) : rows.length }
}
const mapOrder = (r, loadId) => ({ orderId: r.order_id, storeCode: r.store_code, orderDate: r.order_date, lineCount: Number(r.line_count), total: Number(r.total), loadId })
const dayOf = (now) => new Date(BASE + now).toISOString().slice(0, 10)

const sftpAuth = (p) => ({ user: p['sftp.user'], password: p['sftp.password'] })
export const cfgOf = (p) => ({ host: p['db.host'], port: p['db.port'], database: p['db.database'], user: p['db.user'], password: p['db.password'], maxPoolSize: '4', maxWait: '10', queryTimeout: '60' })
const dbOf = (p) => (String(p['db.host'] ?? '').trim().toLowerCase() === HOST_PRD ? DB_PRD : DB)

function runLoad(ctx) {
  const { props, now } = ctx
  const model = ctx.xml ?? parseMule(FIXED_XML) // lab: an app with no XML runs the configuration the team merged
  const j = jobOf(model)
  const db = dbOf(props)
  const cfg = cfgOf(props)
  const files = ctx.systems.files(props['sftp.host'], sftpAuth(props))
  const list = files.list(DIR)
  if (!list.ok) return { ok: false, ms: 1500, errorType: list.type ?? 'SFTP:CONNECTIVITY', errors: 1, log: [line('ERROR', `sftp:list of ${props['sftp.host']}${DIR} failed. ${list.type ?? 'SFTP:CONNECTIVITY'}: ${list.error}`, 'org.mule.runtime.core.internal.exception.OnErrorPropagateHandler')] }
  const next = list.files.filter((f) => !f.dir && f.name.endsWith('.csv')).sort((a, b) => a.t - b.t || a.name.localeCompare(b.name))[0]
  if (!next) return { ok: true, ms: 400, log: [info(`No new order file in ${DIR}. Nothing to load.`)] }
  const read = files.read(next.path)
  if (!read.ok) return { ok: false, ms: 1500, errorType: read.type ?? 'SFTP:CONNECTIVITY', errors: 1, log: [line('ERROR', `sftp:read of ${next.path} failed. ${read.error}`, 'org.mule.runtime.core.internal.exception.OnErrorPropagateHandler')] }
  const loadId = next.name.replace(/\.csv$/, '')
  const file = readOrders(read.content)
  const id = instanceIdOf(`${JOB}|${loadId}|${now}`)
  const log = [info(`Reading ${next.path} (${number(next.size)} bytes) as a stream with the CSV reader. Load ${loadId}.`)]
  if (!j) return { ok: false, ms: 1000, errorType: 'MULE:UNKNOWN', errors: 1, log: [...log, line('ERROR', `The flow ${FLOW} has no batch:job.`)] }
  const known = ctx.db.select(db, cfg, `SELECT store_code FROM ${STORES}`)
  if (!known.ok) return { ok: false, ms: 1500, errorType: known.errorType, errors: 1, log: [...log, line('ERROR', `Known stores: ${known.errorType}: ${known.text}`, 'org.mule.runtime.core.internal.exception.OnErrorPropagateHandler')] }
  const stores = new Set(known.rows.map((r) => r.store_code))
  const sample = file.rows
  const whole = file.total > sample.length // the sample lines stand for a larger file
  // the rows that fail validate-and-map, as positions in the file
  const badStores = [...new Set(sample.filter((r) => !stores.has(r.store_code)).map((r) => r.store_code))]
  let badRows = []
  for (const code of badStores) {
    const f = whole ? FILE_FACTS[code] : null
    if (f) badRows.push(...Array.from({ length: f.orders }, (_, i) => f.firstRow + i * f.every))
    else sample.forEach((r, i) => r.store_code === code && badRows.push(i + 1))
  }
  badRows = badRows.sort((a, b) => a - b)
  const total = file.total
  const stopped = j.max !== -1 && badRows.length > j.max
  const processed = stopped ? Math.min(total, Math.ceil(badRows[j.max] / j.blockSize) * j.blockSize) : total
  const failedRows = badRows.filter((r) => r <= processed)
  let failed = failedRows.length
  let good = processed - failed
  log.push(info(`Created instance '${id}' for batch job '${JOB}'`, ENGINE), info(`Finished loading phase for instance ${id} of job ${JOB}. ${number(total)} records were loaded`, ENGINE), info(`Started execution of instance '${id}' of job '${JOB}'. blockSize ${j.blockSize}, maxFailedRecords ${j.max}`, ENGINE))
  const firstBad = sample.find((r) => !stores.has(r.store_code))
  const unknownMsg = firstBad ? `Store ${firstBad.store_code} is not in ${STORES}` : ''
  if (failed) log.push(line('ERROR', `Found error processing record on step 'validate-and-map' for job instance '${id}' of job '${JOB}'.\nThis is the first record to show this exception on this step for this job instance. Subsequent records with the same failures will not be logged for performance and log readability reasons:\nError type            : ${UNKNOWN}\nMessage               : "${unknownMsg}"`, 'com.mulesoft.mule.runtime.module.batch.internal.engine.threading.BatchRecordWork'))
  if (stopped) log.push(warn(`instance '${id}' of job '${JOB}' has reached the max allowed number of failed records. Record will be added to failed list and the instance will be removed from execution pool.`, ENGINE))
  // insert-orders: the good sample lines, standing for every good record
  const goodSample = sample.filter((r) => stores.has(r.store_code)).map((r) => mapOrder(r, loadId))
  const ins = good > 0 && j.insert ? ctx.db.bulkInsert(db, cfg, INSERT_SQL, goodSample, { represents: good }) : { ok: true, affected: 0 }
  const insertErrors = []
  if (!ins.ok) {
    insertErrors.push({ type: ins.errorType, message: ins.text, count: good, record: json(goodSample[0] ?? {}) })
    log.push(line('ERROR', `Step insert-orders: ${ins.errorType}: ${ins.text}`, ENGINE))
    failed += good
    good = 0
  } else if (good > 0) {
    log.push(info(j.insert?.bulk ? `Step insert-orders: a Batch Aggregator of ${j.insert.size} sent ${number(Math.ceil(good / Math.max(1, j.insert.size)))} bulk inserts for ${number(good)} orders into ${ORDERS}.` : `Step insert-orders: one INSERT per order, ${number(good)} round trips to SQL Server.`))
    if (!j.insert?.bulk && good > 10000) log.push(warn(`Step insert-orders took ${Math.round((good * 9) / 60000)} minutes: ${number(good)} single INSERT statements, each one a round trip and a commit.`))
  }
  // save-rejects: each failed record with its error, so nobody has to read the log to find them
  let rejected = 0
  if (j.rejects && failedRows.length) {
    const rows = failedRows.map((pos, i) => {
      const r = whole ? { order_id: `POS-0212-${String(100 + i).padStart(6, '0')}`, store_code: badStores[0], order_date: sample[0]?.order_date ?? dayOf(now), line_count: String(1 + (i % 4)), total: (19.5 + i * 3.25).toFixed(2) } : sample[pos - 1]
      return { loadId, orderId: r.order_id, storeCode: r.store_code, error: `${UNKNOWN}: Store ${r.store_code} is not in ${STORES}`, raw: json(r) }
    })
    const rj = ctx.db.bulkInsert(db, cfg, REJECT_SQL, rows)
    if (rj.ok) {
      rejected = rows.length
      log.push(info(`Step ${j.rejects} (acceptPolicy ONLY_FAILURES): ${rejected} failed orders saved in ${REJECTS} with their error.`))
    } else log.push(line('ERROR', `Step ${j.rejects}: ${rj.errorType}: ${rj.text}`, ENGINE))
  }
  // the file goes to the archive once every record was processed; a stopped load leaves it for the next run
  if (!stopped) {
    const mv = files.move(next.path, `${ARCHIVE}/`)
    log.push(mv.ok ? info(`Moved ${next.name} to ${ARCHIVE}.`) : warn(`Could not move ${next.name} to ${ARCHIVE}: ${mv.error}`))
  }
  const steps = [
    { name: 'validate-and-map', accept: 'NO_FAILURES', processed, failed: failedRows.length, errors: failedRows.length ? [{ type: UNKNOWN, message: unknownMsg, count: failedRows.length, record: json(firstBad) }] : [] },
    { name: j.insert?.name ?? 'insert-orders', accept: 'NO_FAILURES', processed: processed - failedRows.length, failed: ins.ok ? 0 : processed - failedRows.length, errors: insertErrors },
    ...(j.rejects ? [{ name: j.rejects, accept: 'ONLY_FAILURES', processed: failed, failed: 0, errors: [] }] : []),
  ]
  log.push(info(`Finished execution for instance '${id}' of job '${JOB}'. Total Records processed: ${number(processed)}. Successful records: ${number(good)}. Failed Records: ${number(failed)}`, ENGINE))
  let mail = null
  if (j.onComplete) {
    log.push(info(`Load report: ${number(total)} records, ${number(good)} successful, ${number(failed)} failed`))
    mail = { to: props['report.to'] || 'ops@brightmart.example', subject: `Order load ${loadId}: ${number(good)} successful, ${number(failed)} failed`, body: `Batch job ${JOB}, instance ${id}.\nFile ${next.name}, ${number(total)} orders. Processed ${number(processed)}, successful ${number(good)}, failed ${number(failed)}.${stopped ? ` The job stopped at maxFailedRecords ${j.max}; the file stays in ${DIR}.` : ''}${rejected ? `\nThe ${rejected} failed orders are in ${REJECTS} with load_id ${loadId}. After the cause is fixed, POST /loads/${loadId}/replay loads them.` : ''}`, source: APP }
  }
  const ms = stopped ? 60000 : Math.max(1000, Math.round(total * (j.insert?.bulk ? 1.2 : 9)))
  const status = stopped ? 'FAILED_PROCESS_RECORDS' : 'SUCCESSFUL'
  const load = { loadId, file: next.name, instance: id, status, total, processed, successful: good, failed, rejected, t: now, env: ctx.app.env, sample: ins.ok ? goodSample.slice(0, 5).map((o) => o.orderId) : [] }
  const st = ctx.app.store ?? {}
  return {
    ok: !stopped,
    ms,
    errors: stopped ? 1 : 0,
    log,
    batch: { job: JOB, instance: id, status, total, processed, successful: good, failed, blockSize: j.blockSize, maxFailedRecords: j.max, loadMs: Math.min(ms / 4, 30000), completeMs: 1000, steps },
    store: { loads: { ...st.loads, [loadId]: load }, last: load },
    ...(mail && { mail }),
  }
}

// POST /loads/{loadId}/replay: the rejects of a load go through the mapping and the insert again
function replay(ctx, loadId) {
  const db = dbOf(ctx.props)
  const cfg = cfgOf(ctx.props)
  const open = ctx.db.select(db, cfg, `SELECT order_id, store_code, raw FROM ${REJECTS} WHERE load_id = :loadId AND status = 'NEW'`, { loadId })
  if (!open.ok) return { status: 500, ms: 30, error: open.errorType, log: [line('ERROR', `Replay of ${loadId}: ${open.errorType}: ${open.text}`)], body: json({ message: open.text }) }
  const known = ctx.db.select(db, cfg, `SELECT store_code FROM ${STORES}`)
  const stores = new Set(known.ok ? known.rows.map((r) => r.store_code) : [])
  let replayed = 0
  let still = 0
  let error = null
  for (const r of open.rows) {
    if (!stores.has(r.store_code)) {
      still++
      continue
    }
    let row = null
    try {
      row = JSON.parse(r.raw)
    } catch {
      row = null
    }
    const ins = row ? ctx.db.insert(db, cfg, INSERT_SQL, mapOrder(row, loadId)) : { ok: false, code: 0, text: 'The raw record cannot be read.' }
    // an order that is in the table already (a replay that ran before) counts as done
    if (ins.ok || ins.code === 2627 || ins.code === 2601) {
      const up = ctx.db.update(db, cfg, `UPDATE ${REJECTS} SET status = 'REPLAYED' WHERE load_id = :loadId AND order_id = :orderId`, { loadId, orderId: r.order_id })
      if (!up.ok) error = up
      replayed++
    } else {
      still++
      error = ins
    }
  }
  const store = (ctx.app.store ??= {})
  store.replays = keep(store.replays, { loadId, replayed, still, t: ctx.now, env: ctx.app.env })
  const log = [info(`Replay of ${loadId}: ${replayed} orders loaded into ${ORDERS}, ${still} still failing.`)]
  if (error) log.push(warn(`Replay of ${loadId}: ${error.errorType ?? 'DB:QUERY_EXECUTION'}: ${error.text}`))
  return { status: 200, ms: 40 + replayed * 3, log, body: json({ loadId, replayed, stillFailing: still }) }
}

export const PACKAGES = {
  [PKG]: {
    note: `Nightly order load of Brightmart. At 02:00 ${FLOW} takes the oldest new CSV file in ${DIR} on the POS SFTP server, streams it into the Batch Job ${JOB} and writes the orders to ${ORDERS} on SQL Server ${DATABASE}. The job settings, the aggregator, the failed records step and On Complete come from its Mule configuration. A loaded file moves to ${ARCHIVE}. GET /loads/{loadId} shows a load; POST /loads/{loadId}/replay loads its rejects again. Properties: sftp.host, sftp.user, sftp.password, db.host, db.port, db.database, db.user, db.password, report.to, api.id and the credentials of the environment.`,
    sample: { method: 'GET', path: '/loads/orders-test-20261103' },
    traced: true,
    boot: needs('sftp.host', 'sftp.user', 'sftp.password', 'db.host', 'db.port', 'db.database', 'db.user', 'db.password'),
    schedules: [{ flow: FLOW, type: 'cron', value: '0 0 2 * * ?', tz: 'UTC', enabled: true, noOverlap: true }],
    run: { [FLOW]: runLoad },
    handle(ctx, req) {
      const store = (ctx.app.store ??= {})
      const path = req.path.split('?')[0].replace(/\/+$/, '')
      const again = path.match(/^\/loads\/([\w.-]+)\/replay$/)
      if (again && req.method === 'POST') return replay(ctx, again[1])
      const one = path.match(/^\/loads\/([\w.-]+)$/)
      if (one && req.method === 'GET') {
        const l = store.loads?.[one[1]]
        return l ? { status: 200, ms: 6, body: json(l) } : { status: 404, ms: 4, body: json({ message: `No load ${one[1]}` }) }
      }
      return { status: 404, ms: 3, error: 'APIKIT:NOT_FOUND', body: json({ message: 'Resource not found' }) }
    },
  },
}
