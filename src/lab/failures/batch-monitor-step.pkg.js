// The sample applications of the batch-monitor-step lab. Imports only platform-log.js and the import free platform-batch.js,
// so the engine can load it without a cycle.
import { info, line, needs, warn } from '../platform-log.js'
import { instanceIdOf } from '../platform-batch.js'

export const NAME = 'harbor-catalog-price-sync'
export const JOB = 'product-sync-job'
export const FLOW = 'product-sync-flow'
export const CATALOG = 'catalog@harbor.example'
export const TOTAL = 25000 // products in the nightly file of the five suppliers
export const BAD_PRICE = 2986 // Nordvik products whose price comes as "12,50"
export const DUPLICATES = 14 // the same SKU twice in one supplier file, a different problem
export const MAP_STEP = 'map-and-load-price'
export const REPORT_STEP = 'report-failures'
const BASE = Date.UTC(2026, 10, 2) // day 0 of the lab clock
const ENGINE = 'com.mulesoft.mule.runtime.module.batch.engine.DefaultBatchEngine'
const WORK = 'com.mulesoft.mule.runtime.module.batch.internal.engine.threading.BatchRecordWork'
const number = (n) => n.toLocaleString('en-US')
const int = (value, fallback) => (String(value ?? '').trim() !== '' && Number.isInteger(Number(value)) ? Number(value) : fallback)
const pick = (value, list, fallback) => (list.includes(String(value ?? '').trim()) ? String(value).trim() : fallback)
const dayOf = (now) => new Date(BASE + now).toISOString().slice(0, 10)

// The rows of the file (from 1). The records of the five suppliers are mixed; a Nordvik product is every eighth row from row 217.
const PRICE_ROWS = Array.from({ length: BAD_PRICE }, (_, i) => 217 + i * 8)
const DUP_ROWS = Array.from({ length: DUPLICATES }, (_, i) => 5011 + i * 1300)
const nordvik = (row) => `{ "sku": "NVK-${30000 + row}", "supplier": "NVK", "name": "Fjord rain jacket", "price": "${12 + (row % 40)},${String(row % 100).padStart(2, '0')}", "currency": "EUR" }`
const duplicate = (row) => `{ "sku": "HBS-${String(row).padStart(5, '0')}", "supplier": "HBS", "name": "Harbor canvas tote", "price": 18.90, "currency": "EUR" }`

export function settingsOf(props) {
  const max = int(props['batch.maxFailedRecords'], 0)
  return {
    max: max < 0 ? -1 : max,
    blockSize: Math.max(1, int(props['batch.blockSize'], 100)),
    failures: pick(props['batch.failuresStep'], ['none', 'report'], 'none'),
    mapping: pick(props['mapping.price'], ['as-number', 'supplier-locale'], 'as-number'),
  }
}
// the limit lets a night with only the duplicates through
export const limitOk = (set) => set.max === -1 || set.max >= DUPLICATES

export const PACKAGES = {
  [NAME]: {
    note: `A Batch Job ${JOB} that loads the nightly product file of five suppliers into the price table of the Harbor webshop at 02:00. Step validate-product checks each product, step ${MAP_STEP} maps it with DataWeave and inserts the price into dbo.catalog_price, step publish-webshop sends the new prices to the webshop. mapping.price as-number reads the price with "payload.price as Number". supplier-locale reads it with the number format of the supplier (Nordvik sends a comma decimal). batch.maxFailedRecords (0 is the default, -1 has no limit) and batch.blockSize are attributes of the Batch Job. batch.failuresStep report adds the step ${REPORT_STEP} with acceptPolicy ONLY_FAILURES, which keeps each failed product with its error in dbo.product_sync_rejects, and On Complete mails the counts to ${CATALOG}.`,
    boot: needs('batch.maxFailedRecords', 'batch.blockSize', 'mapping.price'),
    schedules: [{ flow: FLOW, type: 'cron', value: '0 0 2 * * ?', tz: 'UTC', enabled: true }],
    run: {
      [FLOW]: ({ props, now }) => {
        const set = settingsOf(props)
        const id = instanceIdOf(`${JOB}|${now}`)
        const fixed = set.mapping === 'supplier-locale'
        const priceRows = fixed ? [] : PRICE_ROWS
        const badRows = [...priceRows, ...DUP_ROWS].sort((a, b) => a - b)
        // over the limit the instance stops: the blocks already taken finish, and the rest is never processed
        const stopped = set.max !== -1 && badRows.length > set.max
        const processed = stopped ? Math.min(TOTAL, Math.ceil(badRows[set.max] / set.blockSize) * set.blockSize) : TOTAL
        const priceFailed = priceRows.filter((r) => r <= processed)
        const dupFailed = DUP_ROWS.filter((r) => r <= processed)
        const failed = priceFailed.length + dupFailed.length
        const good = processed - failed
        const log = [
          info(`Starting ${FLOW}. maxFailedRecords ${set.max}, blockSize ${set.blockSize}, mapping.price ${set.mapping}, batch.failuresStep ${set.failures}`),
          info(`Created instance '${id}' for batch job '${JOB}'`, ENGINE),
          info(`Starting loading phase for instance '${id}' of job '${JOB}'`, ENGINE),
          info(`Finished loading phase for instance ${id} of job ${JOB}. ${number(TOTAL)} records were loaded`, ENGINE),
          info(`Started execution of instance '${id}' of job '${JOB}'`, ENGINE),
        ]
        const found = (type, message) => line('ERROR', `Found error processing record on step '${MAP_STEP}' for job instance '${id}' of job '${JOB}'.\nThis is the first record to show this exception on this step for this job instance. Subsequent records with the same failures will not be logged for performance and log readability reasons:\nError type            : ${type}\nMessage               : "${message}"`, WORK)
        const priceMessage = (row) => `Cannot coerce String ("${JSON.parse(nordvik(row)).price}") to Number`
        const dupMessage = (row) => `Violation of PRIMARY KEY constraint 'PK_catalog_price'. Cannot insert duplicate key in object 'dbo.catalog_price'. The duplicate key value is (HBS-${String(row).padStart(5, '0')}, ${dayOf(now)}).`
        const errors = []
        if (priceFailed.length) {
          errors.push({ type: 'MULE:EXPRESSION', message: priceMessage(priceFailed[0]), count: priceFailed.length, record: nordvik(priceFailed[0]) })
          log.push(found('MULE:EXPRESSION', priceMessage(priceFailed[0])))
        }
        if (dupFailed.length) {
          errors.push({ type: 'DB:QUERY_EXECUTION', message: dupMessage(dupFailed[0]), count: dupFailed.length, record: duplicate(dupFailed[0]) })
          log.push(found('DB:QUERY_EXECUTION', dupMessage(dupFailed[0])))
        }
        if (stopped) log.push(warn(`instance '${id}' of job '${JOB}' has reached the max allowed number of failed records. Record will be added to failed list and the instance will be removed from execution pool.`, ENGINE))
        log.push(info(`Step publish-webshop: sent ${number(good)} prices to the webshop.`))

        const steps = [
          { name: 'validate-product', accept: 'NO_FAILURES', processed, failed: 0, errors: [] },
          { name: MAP_STEP, accept: 'NO_FAILURES', processed, failed, errors },
          { name: 'publish-webshop', accept: 'NO_FAILURES', processed: good, failed: 0, errors: [] },
        ]
        let mail = null
        if (set.failures === 'report') {
          steps.push({ name: REPORT_STEP, accept: 'ONLY_FAILURES', processed: failed, failed: 0, errors: [] })
          log.push(info(`Step ${REPORT_STEP} (acceptPolicy ONLY_FAILURES): a Batch Aggregator of 500 inserted ${failed} failed ${failed === 1 ? 'record' : 'records'} with their error into dbo.product_sync_rejects.`))
          const lines = errors.map((e) => `${e.type}: ${number(e.count)} records, first one ${e.record}`)
          mail = {
            to: CATALOG,
            subject: `${JOB} ${dayOf(now)}: ${number(good)} successful, ${number(failed)} failed`,
            body: `Instance ${id}\nLoaded ${number(TOTAL)}, processed ${number(processed)}, successful ${number(good)}, failed ${number(failed)}.${stopped ? ` The job stopped at maxFailedRecords ${set.max}.` : ''}\n${lines.join('\n') || 'No failed records.'}\nThe failed records with their error are in dbo.product_sync_rejects.`,
            source: NAME,
          }
        }
        log.push(info(`Finished execution for instance '${id}' of job '${JOB}'. Total Records processed: ${number(processed)}. Successful records: ${number(good)}. Failed Records: ${number(failed)}`, ENGINE))

        const batch = { job: JOB, instance: id, status: stopped ? 'FAILED_PROCESS_RECORDS' : 'SUCCESSFUL', total: TOTAL, processed, ok: good, successful: good, failed, blockSize: set.blockSize, maxFailedRecords: set.max, loadMs: 25000, completeMs: 2000, steps }
        const last = { ...set, id, stopped, processed, good, failed, priceFailed: priceFailed.length, dupFailed: dupFailed.length }
        return { ok: !stopped, ms: stopped ? 70000 : 8 * 60000, errors: stopped ? 1 : 0, log, batch, store: { last }, ...(mail && { mail }) }
      },
    },
  },
}
