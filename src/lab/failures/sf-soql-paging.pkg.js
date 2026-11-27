// The sample application of the sf-soql-paging lab. Imports only platform-log.js and the import free Salesforce engine.
import { info, muleError, needs } from '../platform-log.js'
import { API_VERSION, BASE } from '../platform-salesforce.js'

export const NAME = 'sf-hub-account-sync'
export const FLOW = 'account-sync-scheduler'
export const FIELDS = 'Id, Name, Brightmart_Customer_Id__c, BillingCountry, SystemModstamp'
const word = (v) => String(v ?? '').trim()
const yes = (v) => word(v).toLowerCase() === 'true'
const stamp = (t) => new Date(BASE + t).toISOString()

const el = {
  full: { at: 1, name: 'GET query (full load)', dsl: '<http:request doc:name="GET query (full load)" method="GET" config-ref="Salesforce_REST" path="/services/data/v61.0/query">' },
  delta: { at: 2, name: 'GET query (changed accounts)', dsl: '<http:request doc:name="GET query (changed accounts)" method="GET" config-ref="Salesforce_REST" path="/services/data/v61.0/query">' },
}
const block = (where, type, message) => muleError({ flow: FLOW, file: NAME, ...el[where], type, message })
const restError = (body) => [].concat(body ?? []).map((e) => `${e.errorCode}: ${e.message}`).join('; ')

// GET /query and, with follow, every nextRecordsUrl until done is true. Returns { ok, rows, totalSize, pages, done }.
function read(sf, soql, follow) {
  let res = sf.rest('GET', `/services/data/v${API_VERSION}/query?q=${encodeURIComponent(soql)}`)
  if (res.status !== 200) return { ok: false, status: res.status, error: restError(res.body) }
  let rows = res.body.records.length
  let pages = 1
  const totalSize = res.body.totalSize
  let last = res.body.records.at(-1) ?? null
  while (follow && !res.body.done && res.body.nextRecordsUrl) {
    res = sf.rest('GET', res.body.nextRecordsUrl)
    if (res.status !== 200) return { ok: false, status: res.status, error: restError(res.body) }
    rows += res.body.records.length
    pages += 1
    last = res.body.records.at(-1) ?? last
  }
  return { ok: true, rows, totalSize, pages, done: Boolean(res.body.done), nextRecordsUrl: res.body.nextRecordsUrl, last }
}

export const PACKAGES = {
  [NAME]: {
    note: 'Every 15 minutes copies the Accounts of Salesforce to the Brightmart customer hub with an HTTP Request to the REST query resource /services/data/v61.0/query. The first run, or a new configuration with sync.fullReload true, makes a full load of every Account. The other runs read the Accounts changed since the last run, with a WHERE on the field in sync.changedField. Salesforce returns at most 2000 records per batch. With sf.followNextRecordsUrl true the flow calls each nextRecordsUrl until done is true; otherwise it maps only the records of the first response.',
    boot: needs('salesforce.url', 'salesforce.username', 'salesforce.password', 'salesforce.securityToken', 'sync.changedField'),
    schedules: [{ flow: FLOW, type: 'fixed', value: '15', unit: 'minutes', enabled: true }],
    run: {
      [FLOW]: (ctx) => {
        const { props } = ctx
        const sf = ctx.salesforce
        const store = { ...ctx.store }
        const follow = yes(props['sf.followNextRecordsUrl'])
        const fresh = store.cfg !== ctx.app.config
        const log = []
        if (store.watermark === undefined || (fresh && yes(props['sync.fullReload']))) {
          const soql = `SELECT ${FIELDS} FROM Account ORDER BY Id`
          const r = read(sf, soql, follow)
          if (!r.ok) return { ok: false, ms: 900, errorType: 'HTTP:BAD_REQUEST', log: [block('full', 'HTTP:BAD_REQUEST', `HTTP GET on resource '/services/data/v${API_VERSION}/query' failed: bad request (${r.status}). ${r.error}`)] }
          log.push(info(`GET /services/data/v${API_VERSION}/query?q=${soql}: totalSize ${r.totalSize}, ${r.pages} ${r.pages === 1 ? 'batch' : 'batches'}, done ${r.done}${r.done ? '' : `, nextRecordsUrl ${r.nextRecordsUrl}`}`))
          log.push(info(`Full load finished: ${r.rows} Accounts written to the customer hub. Last record ${r.last?.Brightmart_Customer_Id__c ?? ''} ${r.last?.Name ?? ''}`))
          Object.assign(store, { count: r.rows, total: r.totalSize, full: { t: ctx.now, rows: r.rows, total: r.totalSize }, watermark: ctx.now, cfg: ctx.app.config })
          return { ok: true, ms: 400 * r.pages, log, store }
        }
        const field = word(props['sync.changedField'])
        const soql = `SELECT ${FIELDS} FROM Account WHERE ${field} > ${stamp(store.watermark)}`
        const r = read(sf, soql, follow)
        store.cfg = ctx.app.config
        if (!r.ok) {
          // QUERY_TIMEOUT comes back after the query ran for its two minutes
          const slow = /QUERY_TIMEOUT/.test(r.error)
          return { ok: false, ms: slow ? 120000 : 600, errorType: 'HTTP:BAD_REQUEST', store: { ...store, lastDelta: { t: ctx.now, ok: false } }, log: [block('delta', 'HTTP:BAD_REQUEST', `HTTP GET on resource '/services/data/v${API_VERSION}/query' failed: bad request (${r.status}). ${r.error}\nQuery: ${soql}`)] }
        }
        log.push(info(`Changed accounts since ${stamp(store.watermark)} on ${field}: totalSize ${r.totalSize}, ${r.rows} written to the customer hub`))
        Object.assign(store, { watermark: ctx.now, lastDelta: { t: ctx.now, ok: true, rows: r.rows, total: r.totalSize }, changed: (store.changed ?? 0) + r.rows })
        return { ok: true, ms: 300 * r.pages, log, store }
      },
    },
  },
}
