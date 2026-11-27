// The sample application of the snowflake-setup lab. Imports only platform-log.js and the import free Snowflake engine,
// so the engine can load it without a cycle. It loads stock snapshots of the warehouse management system into Snowflake.
import { info, line, muleError, needs } from '../platform-log.js'
import { cfgOf, fileStamp, tsText } from '../platform-snowflake.js'

export const STOCK_APP = 'wms-stock-dw-loader'
export const STOCK_JAR = `${STOCK_APP}-1.0.0-mule-application.jar`
export const STOCK_FLOW = 'stock-snapshot-flow'
export const HEADER = 'SKU,WAREHOUSE_CODE,QTY,SNAPSHOT_AT'
const el = {
  put: (flow) => ({ flow, at: 2, name: 'PUT stock file', dsl: '<snowflake:execute-script doc:name="PUT stock file" config-ref="Snowflake_Config">' }),
  copy: (flow) => ({ flow, at: 3, name: 'COPY INTO STOCK_LEVELS', dsl: '<snowflake:execute-script doc:name="COPY INTO STOCK_LEVELS" config-ref="Snowflake_Config">' }),
  health: { flow: 'get:\\health', at: 1, name: 'Select health', dsl: '<snowflake:select doc:name="Select health" config-ref="Snowflake_Config">' },
}
const err = (r, e) => muleError({ ...e, file: STOCK_APP, type: r.type, message: `net.snowflake.client.jdbc.SnowflakeSQLException: ${r.text}` })
const json = (o) => JSON.stringify(o)

// lab-made sample data: the stock of 6 SKUs in 2 distribution centres of Brightmart
const SKUS = ['H-1250', 'H-1300', 'H-2000', 'H-2210', 'H-3105', 'H-4400']
export const snapshotCsv = (now, n) => `${HEADER}\n${SKUS.flatMap((sku, i) => ['DC-NORTH', 'DC-SOUTH'].map((dc, k) => `${sku},${dc},${(i * 37 + k * 11 + n * 3) % 200},${tsText(now)}`)).join('\n')}\n`

// PUT one file to the stage of snowflake.stage and COPY exactly that file; rejected rows stay visible to VALIDATE
function load(ctx, name, content, flow) {
  const cfg = cfgOf(ctx.props)
  const stage = `@${String(ctx.props['snowflake.stage'] ?? '').trim().replace(/^@/, '')}`
  const put = ctx.snowflake.put(cfg, stage, { name, content })
  if (!put.ok) return { ok: false, r: put, log: [err(put, el.put(flow))], ms: put.ms }
  const r = ctx.snowflake.execute(cfg, `COPY INTO STOCK_LEVELS FROM ${stage} FILES = ('${put.name}') ON_ERROR = CONTINUE`)
  if (!r.ok) return { ok: false, r, log: [info(`PUT ${name} to ${stage}: ${put.status}`), err(r, el.copy(flow))], ms: put.ms + r.ms }
  const f = r.stats?.files?.[0]
  const log = [info(`PUT ${name} to ${stage}: ${put.status}`)]
  if (!f) log.push(info(`COPY INTO STOCK_LEVELS (query ${r.qid}): ${r.message}`))
  else if (f.errors) log.push(line('ERROR', `COPY INTO STOCK_LEVELS (query ${r.qid}): ${f.file} ${f.status}, ${f.loaded} of ${f.parsed} rows loaded, ${f.errors} rejected. First error at line ${f.firstLine}: ${f.firstError}`))
  else log.push(info(`COPY INTO STOCK_LEVELS (query ${r.qid}): ${f.file} LOADED, ${f.loaded} rows`))
  return { ok: true, r, f, log, ms: put.ms + r.ms }
}

export const PACKAGES = {
  [STOCK_APP]: {
    note: `Loads the stock of the WMS into Snowflake. Every 15 minutes ${STOCK_FLOW} writes a snapshot as CSV with the header ${HEADER}, PUTs it to the internal stage snowflake.stage and runs COPY INTO STOCK_LEVELS FROM @stage FILES = (that file) ON_ERROR = CONTINUE. GET /health runs SELECT CURRENT_USER(), CURRENT_ROLE(), CURRENT_WAREHOUSE(), COUNT(*) FROM STOCK_LEVELS. POST /stock/upload takes a CSV file of a supplier in the body and loads it the same way; rejected rows give 422 with the first error. The Snowflake config uses key pair authentication: snowflake.account, snowflake.user, snowflake.role, snowflake.warehouse, snowflake.database, snowflake.schema and the protected property snowflake.privateKey.`,
    sample: { method: 'GET', path: '/health', body: '' },
    boot: needs('snowflake.account', 'snowflake.user', 'snowflake.privateKey', 'snowflake.role', 'snowflake.warehouse', 'snowflake.database', 'snowflake.schema', 'snowflake.stage'),
    schedules: [{ flow: STOCK_FLOW, type: 'fixed', value: '15', unit: 'minutes', enabled: true }],
    handle(ctx, req) {
      const path = req.path.split('?')[0]
      if (req.method === 'GET' && path === '/health') {
        const r = ctx.snowflake.execute(cfgOf(ctx.props), 'SELECT CURRENT_USER() AS USER_NAME, CURRENT_ROLE() AS ROLE_NAME, CURRENT_WAREHOUSE() AS WAREHOUSE_NAME, COUNT(*) AS ROWS_NOW FROM STOCK_LEVELS')
        if (!r.ok) return { status: 503, ms: r.ms, flow: el.health.flow, error: r.type, log: [err(r, el.health)], body: json({ status: 'DOWN', snowflake: r.text }) }
        const [user, role, warehouse, rows] = r.rows[0]
        return { status: 200, ms: r.ms, flow: el.health.flow, log: [info(`Snowflake is up: user ${user}, role ${role}, warehouse ${warehouse}, ${rows} rows in STOCK_LEVELS`)], body: json({ status: 'UP', user, role, warehouse, rows }) }
      }
      if (req.method === 'POST' && path === '/stock/upload') {
        const body = String(req.body ?? '').trim()
        if (!body.startsWith('SKU')) return { status: 400, ms: 5, flow: 'post:\\stock\\upload', error: 'APIKIT:BAD_REQUEST', body: json({ message: `The body must be a CSV file with the header ${HEADER}` }) }
        ctx.store.uploads = (ctx.store.uploads ?? 0) + 1
        const x = load(ctx, `upload_${fileStamp(ctx.now)}_${ctx.store.uploads}.csv`, `${body}\n`, 'post:\\stock\\upload')
        if (!x.ok) return { status: 500, ms: x.ms, flow: 'post:\\stock\\upload', error: x.r.type, log: x.log, body: json({ message: x.r.text }) }
        const f = x.f ?? { loaded: 0, errors: 0 }
        if (f.errors) return { status: 422, ms: x.ms, flow: 'post:\\stock\\upload', error: 'APP:REJECTED_ROWS', log: x.log, body: json({ loaded: f.loaded, rejected: f.errors, firstError: f.firstError, line: f.firstLine, queryId: x.r.qid }) } // lab-made error type
        return { status: 200, ms: x.ms, flow: 'post:\\stock\\upload', log: x.log, body: json({ loaded: f.loaded, rejected: 0, queryId: x.r.qid }) }
      }
      return { status: 404, ms: 3, error: 'APIKIT:NOT_FOUND', flow: `${STOCK_APP}-main`, body: json({ message: 'Resource not found' }) }
    },
    run: {
      [STOCK_FLOW]: (ctx) => {
        ctx.store.snapshots = (ctx.store.snapshots ?? 0) + 1
        const x = load(ctx, `stock_${fileStamp(ctx.now)}.csv`, snapshotCsv(ctx.now, ctx.store.snapshots), STOCK_FLOW)
        return { ok: x.ok && !x.f?.errors, ms: x.ms, errorType: x.ok ? (x.f?.errors ? 'APP:REJECTED_ROWS' : null) : x.r.type, log: x.log, store: ctx.store }
      },
    },
  },
}
