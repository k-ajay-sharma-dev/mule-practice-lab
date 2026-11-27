// The sample application of the db-console-plan lab. Imports only platform-log.js, so the engine can load it without a
// cycle. The job reads SQL Server through ctx.db (src/lab/platform-db.js), so its time comes from the plan the engine
// picks for the query: a scan reads every row of dbo.order_lines, a seek reads the rows of one day.
import { info, muleError, needs, warn } from '../platform-log.js'

export const DB = 'harbor-sql'
export const NAME = 'harbor-nightly-settlement'
export const FLOW = 'settlement-flow'
export const SLOW_SQL = 'SELECT line_id, order_id, sku, qty, amount FROM dbo.order_lines WHERE CONVERT(varchar(10), shipped_at, 23) = :day'
const WRITE_MS = 1800 // writing the settlement file to the finance share
const DAY = 24 * 3600000
// the lab day 0 is 2026-11-02
const dayOf = (t) => new Date(Date.UTC(2026, 10, 2) + t).toISOString().slice(0, 10)
const number = (n) => Math.round(n).toLocaleString('en-US')
const time = (ms) => (ms >= 60000 ? `${Math.floor(ms / 60000)} min ${Math.round((ms % 60000) / 1000)} s` : `${(ms / 1000).toFixed(1)} s`)
export const cfgOf = (p) => ({ user: p['db.user'], password: p['db.password'], maxPoolSize: p['db.pool.max'], queryTimeout: p['db.queryTimeout'], fetchSize: p['db.fetchSize'] })
// the input parameters the job binds: the day to settle and the day after it
export const paramsAt = (now) => ({ day: dayOf(now - DAY), nextDay: dayOf(now) })

export const PACKAGES = {
  [NAME]: {
    note: `Settles the order lines shipped the day before, at 02:00, from SQL Server ${DB}, and writes a file for finance. settlement.sql is the Select of the job (lab-made: in a real app it sits in the XML). It may use the input parameters :day (yyyy-mm-dd, the day to settle) and :nextDay (the day after). db.queryTimeout is in seconds, 0 is none.`,
    boot: needs('db.user', 'db.password', 'settlement.sql'),
    schedules: [{ flow: FLOW, type: 'cron', value: '0 0 2 * * ?', tz: 'UTC', enabled: true }],
    run: {
      [FLOW]: (ctx) => {
        const { props, now } = ctx
        const params = paramsAt(now)
        const sql = String(props['settlement.sql'] ?? '')
        const log = [info(`Starting ${FLOW} for ${params.day}`), info(`${sql.replace(/\s+/g, ' ')} with :day ${params.day}, :nextDay ${params.nextDay}`)]
        const r = ctx.db.select(DB, cfgOf(props), sql, params)
        if (!r.ok) {
          const error = { flow: FLOW, file: NAME, at: 2, name: 'Select shipped lines', dsl: '<db:select doc:name="Select shipped lines" config-ref="SqlServer_Config" queryTimeout="${db.queryTimeout}">', type: r.errorType ?? 'DB:QUERY_EXECUTION', message: r.text }
          log.push(muleError(error))
          ctx.store.last = { t: now, ok: false, ms: r.ms ?? 0 }
          return { ok: false, ms: (r.ms ?? 0) + 50, errorType: error.type, log, store: ctx.store }
        }
        const ms = r.ms + WRITE_MS
        log.push(info(`Read ${number(r.count)} order lines in ${time(r.ms)} (${r.plan.op} on ${r.plan.index ?? 'the heap'}, ${number(r.plan.rowsRead)} rows read)`))
        log.push(info(`Wrote settlement-${params.day}.csv to the finance share`))
        if (ms > 60000) log.push(warn(`${FLOW} took ${time(ms)}. Finance needs the file by 02:02.`))
        ctx.store.last = { t: now, ok: true, ms, access: r.plan.access, index: r.plan.index, lines: r.rows.length, sql }
        return { ok: true, ms, log, store: ctx.store }
      },
    },
  },
}
