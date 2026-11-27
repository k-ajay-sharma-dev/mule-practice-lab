// The sample applications of the db-oracle-paging lab. Imports only platform-log.js and platform-led.js, so the engine can load it without a cycle.
import { info, line, muleError, needs, warn } from '../platform-log.js'

const FILE = 'customer-export-nightly'
const FLOW = 'customer-export-flow'
export const ROWS = 4000000 // rows of HARBOR.CUSTOMERS
const ROUND_TRIP_MS = 2 // one fetch of rows from Oracle over the network
const ROW_MS = 0.02 // reading and writing one row
const SKIP_PER_S = 40000 // rows Oracle reads and throws away each second to reach an OFFSET
const PAGE_MS = 300 // parse, plan and first rows of one page query
const whole = (value, fallback) => (String(value ?? '').trim() !== '' && Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : fallback)
const MODES = ['single', 'offset', 'keyset', 'stream']

export function settingsOf(props) {
  const mode = String(props['export.mode'] ?? '').trim()
  return {
    mode: MODES.includes(mode) ? mode : 'single',
    page: Math.max(1, whole(props['page.size'], 5000)),
    fetch: Math.max(1, whole(props['db.fetchSize'], 10)),
    timeout: whole(props['db.query.timeout'], 0),
  }
}
const fetchMs = (rows, fetch) => Math.ceil(rows / fetch) * ROUND_TRIP_MS + rows * ROW_MS
const time = (ms) => (ms < 120000 ? `${(ms / 1000).toFixed(1)} s` : ms < 2 * 3600000 ? `${Math.round(ms / 60000)} min` : `${(ms / 3600000).toFixed(1)} h`)
const number = (n) => n.toLocaleString('en-US')
const DEADLINE = 4 * 3600000 // the export must be on the share by 06:00, four hours after the start

export const PACKAGES = {
  [FILE]: {
    note: 'Exports every customer from Oracle (HARBOR.CUSTOMERS, 4 million rows) to a CSV file at 02:00. export.mode is single (one Select, then one Transform of the whole result), offset (OFFSET and FETCH NEXT pages ordered by customer_id), keyset (WHERE customer_id > the last ID of the page before) or stream (one Select read as a stream in a For Each). page.size, db.fetchSize and db.query.timeout (seconds, 0 is none) are read too.',
    boot: needs('db.host', 'export.mode'),
    schedules: [{ flow: FLOW, type: 'cron', value: '0 0 2 * * ?', tz: 'UTC', enabled: true }],
    run: {
      [FLOW]: ({ props }) => {
        const set = settingsOf(props)
        const log = [info(`Starting ${FLOW}, export.mode ${set.mode}, db.fetchSize ${set.fetch}${set.mode === 'offset' || set.mode === 'keyset' ? `, page.size ${set.page}` : ''}`)]
        const done = (ms, heap, extra = {}) => ({ ok: true, ms, heap, log, store: { last: { mode: set.mode, fetch: set.fetch, page: set.page, ok: true, rows: ROWS, ms, late: ms > DEADLINE } }, ...extra })

        if (set.mode === 'single') {
          log.push(info('SELECT customer_id, name, email, segment, updated_at FROM harbor.customers'))
          log.push(info('Transform Message "Build CSV" reads the whole result to write one CSV payload'))
          log.push(warn('Heap usage above 95 percent. Garbage collection takes most of the CPU.', 'com.mulesoft.cloudhub.runtime'))
          log.push(line('ERROR', `Exception in thread "[MuleRuntime].uber.04: ${FLOW}" java.lang.OutOfMemoryError: Java heap space\n\tat java.util.Arrays.copyOf\n\tat org.mule.weave.v2.module.csv.writer.CSVWriter.write\n\tat org.mule.weave.v2.runtime.WeaveExecutor.execute`, 'org.mule.runtime.core.internal.exception'))
          return { ok: false, ms: 9 * 60000, heap: 100, restart: true, errorType: 'java.lang.OutOfMemoryError', log, store: { last: { mode: set.mode, ok: false, rows: 0 } } }
        }

        if (set.mode === 'stream') {
          const ms = 1000 + fetchMs(ROWS, set.fetch)
          log.push(info('SELECT customer_id, name, email, segment, updated_at FROM harbor.customers ORDER BY customer_id'))
          log.push(info(`For Each with batchSize 1000 writes the rows to the file as they arrive. ${number(Math.ceil(ROWS / set.fetch))} fetches from Oracle with db.fetchSize ${set.fetch}.`))
          log.push(info(`Exported ${number(ROWS)} customers in ${time(ms)}. Heap stayed under 45 percent.`))
          if (ms > DEADLINE) log.push(warn('The export finished after 06:00.'))
          return done(ms, 42)
        }

        const pages = Math.ceil(ROWS / set.page)
        const heap = Math.min(99, Math.round(35 + set.page / 2000))
        if (set.mode === 'keyset') {
          const each = PAGE_MS + fetchMs(set.page, set.fetch)
          const ms = pages * each
          log.push(info(`Page 1: SELECT ... FROM harbor.customers WHERE customer_id > :lastId ORDER BY customer_id FETCH NEXT ${set.page} ROWS ONLY, lastId 0`))
          for (const p of [1, Math.ceil(pages / 2), pages]) log.push(info(`Page ${p} of ${pages} read in ${time(each)}. The index on customer_id starts each page at the right row.`))
          log.push(info(`Exported ${number(ROWS)} customers in ${pages} pages in ${time(ms)}. Heap stayed under ${heap + 5} percent.`))
          if (ms > DEADLINE) log.push(warn('The export finished after 06:00.'))
          return done(ms, heap)
        }

        // offset: Oracle reads and throws away every row before the page, so each page costs more than the one before
        const pageMs = (k) => PAGE_MS + fetchMs(set.page, set.fetch) + ((k * set.page) / SKIP_PER_S) * 1000
        log.push(info(`Page 1: SELECT ... FROM harbor.customers ORDER BY customer_id OFFSET 0 ROWS FETCH NEXT ${set.page} ROWS ONLY`))
        let ms = 0
        const shown = new Set([0, 99, 199, 299, 399, 599, 799].filter((k) => k < pages))
        for (let k = 0; k < pages; k++) {
          const each = pageMs(k)
          if (set.timeout > 0 && each > set.timeout * 1000) {
            const error = { flow: FLOW, file: FILE, at: 3, name: 'Select page', dsl: `<db:select doc:name="Select page" config-ref="Oracle_Config" queryTimeout="\${db.query.timeout}">`, type: 'DB:QUERY_EXECUTION', message: `ORA-01013: user requested cancel of current operation. Page ${k + 1} of ${pages}, OFFSET ${number(k * set.page)} ROWS, ran past the query timeout of ${set.timeout} s.` }
            log.push(muleError(error))
            log.push(info(`${number(k * set.page)} of ${number(ROWS)} customers were written before the failure, in ${time(ms)}.`))
            return { ok: false, ms, heap, errorType: error.type, log, store: { triedOffset: true, last: { mode: set.mode, fetch: set.fetch, page: set.page, ok: false, rows: k * set.page, ms } } }
          }
          if (shown.has(k)) log.push(info(`Page ${k + 1} of ${pages}, OFFSET ${number(k * set.page)} ROWS, read in ${time(each)}`))
          ms += each
        }
        log.push(info(`Exported ${number(ROWS)} customers in ${pages} pages in ${time(ms)}.`))
        if (ms > DEADLINE) log.push(warn(`The export finished ${time(ms - DEADLINE)} after 06:00. The reports that read the file at 06:00 used the file of the day before.`))
        return done(ms, heap, { store: { triedOffset: true, last: { mode: set.mode, fetch: set.fetch, page: set.page, ok: true, rows: ROWS, ms, late: ms > DEADLINE } } })
      },
    },
  },
}
