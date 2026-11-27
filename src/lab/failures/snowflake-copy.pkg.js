// The sample application of the snowflake-copy lab. Imports only platform-log.js and the import free Snowflake engine,
// so the engine can load it without a cycle.
import { info, muleError, warn } from '../platform-log.js'
import { cfgOf } from '../platform-snowflake.js'

export const POS_COPY = 'pos-sales-dw-copy'
export const POS_FLOW = 'pos-sales-nightly-flow'
export const POS_SQL = "COPY INTO POS_SALES FROM @POS_STAGE PATTERN = '.*store_.*[.]csv'"
const el = { flow: POS_FLOW, at: 1, name: 'COPY INTO POS_SALES', dsl: '<snowflake:execute-script doc:name="COPY INTO POS_SALES" config-ref="Snowflake_Config">' }
const needed = ['snowflake.account', 'snowflake.user', 'snowflake.privateKey', 'snowflake.warehouse', 'snowflake.database', 'snowflake.schema']

// lab-made sample data: the till lines of one store for one day. `bad` is the line number (1 based) with the amount N/A.
const SKUS = ['H-1250', 'H-1300', 'H-2000', 'H-2210', 'H-3105']
export function posCsv(store, date, n, bad = 0) {
  const rows = ['RECEIPT_ID,STORE,SOLD_AT,SKU,QTY,AMOUNT']
  for (let i = 1; i <= n; i++) {
    const hh = String(9 + i).padStart(2, '0')
    const amount = i === bad ? 'N/A' : (4.5 + ((store * 13 + i * 29) % 90) + 0.5).toFixed(2)
    rows.push(`R-${store}-${String(i).padStart(4, '0')},${store},${date} ${i === bad ? '14:05' : `${hh}:${String((i * 7) % 60).padStart(2, '0')}`}:00,${i === bad ? 'H-2000' : SKUS[(store + i) % 5]},${i === bad ? 1 : 1 + ((store + i) % 3)},${amount}`)
  }
  return `${rows.join('\n')}\n`
}

export const PACKAGES = {
  [POS_COPY]: {
    note: `Every night at 02:00 UTC it loads the till files that the stores wrote to the external stage @POS_STAGE (s3://brightmart-pos-exports/sales/) into POS_SALES: ${POS_SQL} ON_ERROR = the property snowflake.copy.onError, ABORT_STATEMENT when it is empty, the default of COPY. It logs the result of each file, and for rows that did not load it logs the query ID to pass to VALIDATE.`,
    boot: ({ props }) => {
      const gone = needed.filter((k) => !String(props[k] ?? '').trim())
      return gone.length ? `Couldn't find configuration property value for key \${${gone[0]}} from properties provider "Environment properties"` : null
    },
    schedules: [{ flow: POS_FLOW, type: 'cron', value: '0 0 2 * * ?', tz: 'UTC', enabled: true }],
    run: {
      [POS_FLOW]: (ctx) => {
        const onError = String(ctx.props['snowflake.copy.onError'] ?? '').trim() || 'ABORT_STATEMENT'
        const r = ctx.snowflake.execute(cfgOf(ctx.props), `${POS_SQL} ON_ERROR = ${onError}`)
        if (!r.ok) return { ok: false, ms: r.ms, errorType: r.type, log: [muleError({ ...el, file: POS_COPY, type: r.type, message: `net.snowflake.client.jdbc.SnowflakeSQLException: ${r.text}` })] }
        const files = r.stats?.files ?? []
        if (!files.length) return { ok: true, ms: r.ms, log: [info(`COPY INTO POS_SALES (query ${r.qid}): ${r.message}`)] }
        const log = files.map((f) => (f.status === 'LOADED' ? info(`${f.file}: LOADED, ${f.loaded} of ${f.parsed} rows`) : warn(`${f.file}: ${f.status}, ${f.loaded} of ${f.parsed} rows. First error at line ${f.firstLine}: ${f.firstError}`)))
        const rejected = files.reduce((n, f) => n + f.errors, 0)
        log.push(rejected ? warn(`COPY INTO POS_SALES (query ${r.qid}): ${r.stats.loaded} rows loaded, ${rejected} rejected. See them with SELECT * FROM TABLE(VALIDATE(POS_SALES, JOB_ID => '${r.qid}'))`) : info(`COPY INTO POS_SALES (query ${r.qid}): ${r.stats.loaded} rows loaded`))
        return { ok: true, ms: r.ms, log }
      },
    },
  },
}
