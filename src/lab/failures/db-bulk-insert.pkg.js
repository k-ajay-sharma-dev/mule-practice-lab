// The sample applications of the db-bulk-insert lab. Imports only platform-log.js and platform-led.js, so the engine can load it without a cycle.
import { info, muleError, needs, warn } from '../platform-log.js'

const FILE = 'price-file-import'
export const FLOW = 'price-import-flow'
export const ROWS = 50000 // rows of the nightly price file
export const BAD_ROW = 31207 // a price that is twice in the file
export const BAD_SKU = 'H-2231'
const ROW_MS = 70 // one Insert on its own: a round trip and a commit
const BULK_ROW_MS = 0.6 // one row inside a Bulk insert
const BLOCK_MS = 40 // one Bulk insert statement
const whole = (value, fallback) => (String(value ?? '').trim() !== '' && Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : fallback)
const pick = (value, list, fallback) => (list.includes(String(value ?? '').trim()) ? String(value).trim() : fallback)
const number = (n) => n.toLocaleString('en-US')
const time = (ms) => (ms < 120000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms / 60000)} min`)

export function settingsOf(props) {
  return {
    mode: pick(props['insert.mode'], ['single', 'bulk'], 'single'),
    size: Math.max(1, whole(props['bulk.size'], 1000)),
    tx: pick(props['tx.scope'], ['none', 'per-block', 'whole-file'], 'none'),
    fallback: pick(props['bulk.fallback'], ['none', 'row-by-row'], 'none'),
  }
}
const DUPLICATE = `com.microsoft.sqlserver.jdbc.SQLServerException: Violation of PRIMARY KEY constraint 'PK_price_staging'. Cannot insert duplicate key in object 'dbo.price_staging'. The duplicate key value is (${BAD_SKU}).`

export const PACKAGES = {
  [FILE]: {
    note: 'Loads the nightly price file of 50,000 rows into the SQL Server table dbo.price_staging at 01:00, after it empties the table. insert.mode is single (one Insert per row in a For Each) or bulk (For Each with batchSize bulk.size around a Bulk insert). tx.scope is none, per-block or whole-file. bulk.fallback row-by-row inserts the rows of a failed block one at a time to find the bad one.',
    boot: needs('db.host', 'insert.mode'),
    schedules: [{ flow: FLOW, type: 'cron', value: '0 0 1 * * ?', tz: 'UTC', enabled: true }],
    run: {
      [FLOW]: ({ props }) => {
        const set = settingsOf(props)
        const log = [info(`Starting ${FLOW}. Read ${number(ROWS)} rows from prices.csv. Emptied dbo.price_staging.`), info(`insert.mode ${set.mode}${set.mode === 'bulk' ? `, bulk.size ${set.size}, tx.scope ${set.tx}, bulk.fallback ${set.fallback}` : ''}`)]
        const result = (ok, ms, inserted, rejected, errors = ok ? 0 : 1, extra = {}) => ({ ok, ms, errors, log, store: { last: { ...set, ok, ms, inserted, rejected }, ...extra } })

        if (set.mode === 'single') {
          const ms = ROWS * ROW_MS
          log.push(warn(`Row ${number(BAD_ROW)} (sku ${BAD_SKU}) failed: ${DUPLICATE} On Error Continue in the For Each logged it and went on.`))
          log.push(info(`Inserted ${number(ROWS - 1)} rows one at a time in ${time(ms)}: ${number(ROWS)} separate statements and round trips.`))
          return result(true, ms, ROWS - 1, 1)
        }

        const blocks = Math.ceil(ROWS / set.size)
        const b = Math.floor((BAD_ROW - 1) / set.size) // the block that holds the bad row
        const first = b * set.size + 1
        const length = Math.min(set.size, ROWS - b * set.size)
        const pos = BAD_ROW - first + 1
        let ms = blocks * (BLOCK_MS + set.size * BULK_ROW_MS)
        const error = { flow: FLOW, file: FILE, at: 3, name: 'Bulk insert prices', dsl: '<db:bulk-insert doc:name="Bulk insert prices" config-ref="SqlServer_Config">', type: 'DB:QUERY_EXECUTION', message: `${DUPLICATE} Block ${b + 1} of ${blocks}, rows ${number(first)} to ${number(first + length - 1)}.` }
        log.push(muleError(error))

        if (set.tx === 'whole-file') {
          log.push(info(`The transaction around the whole file rolled back. 0 of ${number(ROWS)} rows are in dbo.price_staging. The locks on the table were held for the whole run of ${time(ms)}.`))
          return result(false, ms, 0, 0, 1, { triedBulk: true })
        }
        // without a transaction the driver stopped at the bad row: the rows before it stay, the rest of the block is lost
        const kept = set.tx === 'none' ? pos - 1 : 0
        log.push(info(set.tx === 'none'
          ? `No transaction: the driver stopped at the bad row. ${kept} rows of block ${b + 1} were written and ${length - kept} were not. Another driver could behave in another way.`
          : `The transaction of block ${b + 1} rolled back. None of its ${number(length)} rows were written.`))
        let inserted = ROWS - length + kept
        if (set.fallback === 'none') {
          log.push(info(`Finished in ${time(ms)}. ${number(inserted)} of ${number(ROWS)} rows inserted. The Bulk insert error gives the block, not the row number.`))
          return result(false, ms, inserted, 0, 1, { triedBulk: true })
        }
        // the fallback inserts each row of the failed block on its own
        ms += length * ROW_MS
        const rejected = 1 + kept // rows that were kept are now duplicates of themselves
        inserted = ROWS - 1
        if (kept) log.push(warn(`The fallback inserted block ${b + 1} row by row. Rows ${number(first)} to ${number(first + kept - 1)} were already written, so they failed as duplicates and were rejected with the bad row: ${rejected} rejected rows where there is 1.`))
        log.push(warn(`Rejected row ${number(BAD_ROW)} (sku ${BAD_SKU}): ${DUPLICATE} Written to the rejects file with its row number.`))
        log.push(info(`Finished in ${time(ms)}. ${number(inserted)} of ${number(ROWS)} rows inserted, ${rejected} rejected.`))
        return result(true, ms, inserted, rejected, 0, { triedBulk: true })
      },
    },
  },
}
