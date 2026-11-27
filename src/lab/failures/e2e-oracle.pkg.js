// The sample application of the end to end lab of Oracle: the product sync of Brightmart. Imports only platform-log.js,
// so the engine can load it without a cycle. Every 5 minutes it reads the products that changed in Oracle since its
// watermark, page by page with a keyset on (UPDATED_AT, PRODUCT_ID), and upserts them into the catalog database of the
// web shop on SQL Server. Both databases are reached through ctx.db (src/lab/platform-db.js), so the users, grants,
// sessions and rows show in the Databases console.
import { info, line, needs, warn } from '../platform-log.js'

export const PKG = 'e2e-product-sync'
export const APP = 'brightmart-product-sync'
export const ASSET = 'product-sync-api'
export const FLOW = 'product-sync-flow'
export const ORA = 'brightmart-ora'
export const ORA_PRD = 'brightmart-ora-prd'
export const ORA_HOST = 'ora.brightmart.lab'
export const ORA_HOST_PRD = 'ora-prd.brightmart.lab'
export const SHOP_DB = 'brightmart-catalog-sql'
export const SHOP_DB_PRD = 'brightmart-catalog-sql-prd'
export const SHOP_HOST = 'catalog-sql.brightmart.lab'
export const SHOP_HOST_PRD = 'catalog-sql-prd.brightmart.lab'
export const PRODUCTS = 'BRIGHTMART.PRODUCTS'
export const CATALOG = 'dbo.catalog_products'
export const ERRORS = 'dbo.catalog_sync_errors'
export const START_WM = { at: '1900-01-01 00:00:00', id: 0 } // no watermark yet: the first run is the initial load
const keep = (list, item, n = 30) => [...(list ?? []), item].slice(-n)
const json = (x) => JSON.stringify(x)
const hex = (n) => ((n * 2654435761) >>> 0).toString(16).padStart(8, '0')

// The Oracle JDBC thin URL: //host:port/service for a service name, host:port:SID for a SID
export function urlOf(url) {
  const text = String(url ?? '').trim()
  let m = text.match(/^jdbc:oracle:thin:@\/\/([\w.-]+):(\d+)\/([\w.$#]+)$/i)
  if (m) return { host: m[1], port: m[2], service: m[3] }
  m = text.match(/^jdbc:oracle:thin:@([\w.-]+):(\d+):([\w$#]+)$/i)
  if (m) return { host: m[1], port: m[2], sid: m[3] }
  return null
}
const oraCfg = (p) => ({ ...(urlOf(p['db.url']) ?? { host: 'invalid-url' }), user: p['db.user'], password: p['db.password'], maxPoolSize: '2', maxWait: '10', queryTimeout: '30', fetchSize: p['sync.pageSize'] })
const shopCfg = (p) => ({ host: p['catalog.db.host'], port: p['catalog.db.port'], database: p['catalog.db.database'], user: p['catalog.db.user'], password: p['catalog.db.password'], maxPoolSize: '2', maxWait: '10', queryTimeout: '10' })
// the server behind a host name; a host of neither leads to the Sandbox server, whose host check then fails
const oraOf = (p) => (String(urlOf(p['db.url'])?.host ?? '').toLowerCase() === ORA_HOST_PRD ? ORA_PRD : ORA)
const shopOf = (p) => (String(p['catalog.db.host'] ?? '').trim().toLowerCase() === SHOP_HOST_PRD ? SHOP_DB_PRD : SHOP_DB)
export const pageSizeOf = (p) => {
  const n = Math.floor(Number(p['sync.pageSize']))
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 5000) : 500
}
// the mapping of the flow (the DataWeave of the Studio project): Oracle columns to catalog columns
export const STATUS = { ACTIVE: 'live', DISCONTINUED: 'hidden', DRAFT: 'hidden' }
const mapRow = (r) => ({ sku: String(r.SKU).trim(), name: String(r.NAME ?? '').trim(), price: r.PRICE === null || r.PRICE === undefined ? null : Math.round(Number(r.PRICE) * 100) / 100, status: STATUS[r.STATUS] ?? 'hidden', updatedAt: String(r.UPDATED_AT).slice(0, 19) })
// the keyset page after the watermark; ties on UPDATED_AT are broken by PRODUCT_ID
export const pageSql = (size) => `SELECT PRODUCT_ID, SKU, NAME, PRICE, STATUS, UPDATED_AT FROM ${PRODUCTS} WHERE UPDATED_AT > :wmAt OR UPDATED_AT = :wmAt AND PRODUCT_ID > :wmId ORDER BY UPDATED_AT, PRODUCT_ID FETCH FIRST ${size} ROWS ONLY`

export const PACKAGES = {
  [PKG]: {
    note: `Product sync of Brightmart. Every 5 minutes ${FLOW} reads the products changed in Oracle (${PRODUCTS}) since the watermark in the object store, in pages of sync.pageSize ordered by UPDATED_AT and PRODUCT_ID, maps them and upserts them into ${CATALOG} of the web shop catalog on SQL Server. A product the catalog refuses goes to ${ERRORS} and the sync goes on. GET /sync/status shows the watermark and the last run; PUT /sync/watermark sets it back for a replay. Properties: db.url, db.user, db.password (Oracle), catalog.db.host, catalog.db.port, catalog.db.database, catalog.db.user, catalog.db.password, sync.pageSize, api.id and the credentials of the environment.`,
    sample: { method: 'GET', path: '/sync/status' },
    traced: true,
    boot: needs('db.url', 'db.user', 'db.password', 'catalog.db.host', 'catalog.db.database', 'catalog.db.user', 'catalog.db.password'),
    schedules: [{ flow: FLOW, type: 'fixed', value: 5, unit: 'minutes', enabled: true, noOverlap: true }],
    run: {
      [FLOW]: (ctx) => {
        const { props, now } = ctx
        const st = ctx.app.store ?? {}
        const cid = `${hex(Math.floor(now / 1000))}-5f0e-11f1`
        const say = (text, level = 'INFO') => line(level, `event:${cid} ${text}`)
        const size = pageSizeOf(props)
        const ora = oraOf(props)
        const shop = shopOf(props)
        let wm = { ...START_WM, ...st.watermark }
        const log = [say(`Starting ${FLOW}. Watermark UPDATED_AT ${wm.at}, PRODUCT_ID ${wm.id}. Page size ${size}.`)]
        let synced = st.synced
        let failedList = st.failed
        let read = 0
        let written = 0
        let failed = 0
        let page = 0
        for (;;) {
          page++
          const r = ctx.db.select(ora, oraCfg(props), pageSql(size), { wmAt: wm.at, wmId: wm.id })
          if (!r.ok) {
            log.push(say(`Select page ${page} from ${PRODUCTS} failed. ${r.errorType}: ${r.text}`, 'ERROR'))
            return { ok: false, ms: 800, errorType: r.errorType, errors: 1, log, store: { watermark: wm, last: { t: now, ok: false, read, written, failed, error: r.errorType } } }
          }
          const rows = r.rows
          read += rows.length
          if (rows.length) log.push(say(`Page ${page}: ${rows.length} changed product${rows.length === 1 ? '' : 's'} from ${PRODUCTS}, UPDATED_AT ${String(rows[0].UPDATED_AT).slice(0, 19)} to ${String(rows.at(-1).UPDATED_AT).slice(0, 19)}`))
          for (const raw of rows) {
            const p = mapRow(raw)
            const set = { sku: p.sku, name: p.name, price: p.price, status: p.status, updatedAt: p.updatedAt }
            let w = ctx.db.update(shop, shopCfg(props), `UPDATE ${CATALOG} SET name = :name, price = :price, status = :status, source_updated_at = :updatedAt, synced_at = SYSDATETIME() WHERE sku = :sku`, set)
            let how = 'updated'
            if (w.ok && w.affected === 0) {
              w = ctx.db.insert(shop, shopCfg(props), `INSERT INTO ${CATALOG} (sku, name, price, status, source_updated_at) VALUES (:sku, :name, :price, :status, :updatedAt)`, set)
              how = 'inserted'
            }
            if (!w.ok && w.errorType === 'DB:CONNECTIVITY') {
              // the catalog is not reachable: stop here and keep the watermark, so the next run starts again from this product
              log.push(say(`The catalog database is not reachable. ${w.text} The watermark stays at ${wm.at}, so the next run starts from here.`, 'ERROR'))
              return { ok: false, ms: 800, errorType: w.errorType, errors: 1, log, store: { watermark: wm, synced, failed: failedList, last: { t: now, ok: false, read, written, failed, error: w.errorType } } }
            }
            if (!w.ok) {
              // a product the catalog refuses goes to the error table with the reason, and the sync goes on
              failed++
              const reason = w.text.replace(/^[\w.]+Exception: /, '').slice(0, 190)
              const e = ctx.db.insert(shop, shopCfg(props), `INSERT INTO ${ERRORS} (sku, error, source_updated_at) VALUES (:sku, :error, :updatedAt)`, { sku: p.sku, error: reason, updatedAt: p.updatedAt })
              failedList = keep(failedList, { sku: p.sku, t: now, code: w.code ?? null, kept: e.ok, env: ctx.app.env })
              log.push(say(`Product ${p.sku} was refused by ${CATALOG}. ${w.errorType}: ${reason} ${e.ok ? `It is kept in ${ERRORS}.` : `Writing it to ${ERRORS} failed too: ${e.text}`}`, 'WARN'))
            } else {
              written++
              synced = keep(synced, { sku: p.sku, price: p.price, at: p.updatedAt, t: now, how, env: ctx.app.env })
              log.push(say(`Product ${p.sku} ${how} in ${CATALOG}: name "${p.name}", price ${p.price}, status ${p.status}`))
            }
            // the value as Oracle has it, so the next page starts right after this row
            wm = { at: String(raw.UPDATED_AT), id: raw.PRODUCT_ID }
          }
          if (rows.length < size) break
        }
        if (!read) log.push(say(`No product changed since ${wm.at}.`))
        log.push(say(`Finished ${FLOW}: ${read} read, ${written} written, ${failed} refused. New watermark UPDATED_AT ${wm.at}, PRODUCT_ID ${wm.id}, saved in the object store.`))
        // lab-made: a run of a few dozen products ends within a second of the lab clock, so a second Run is not skipped
        return { ok: true, ms: Math.min(900, 300 + read * 20), errors: 0, log, store: { watermark: wm, synced, failed: failedList, last: { t: now, ok: true, read, written, failed, pages: page } } }
      },
    },
    handle(ctx, req) {
      const store = (ctx.app.store ??= {})
      const path = req.path.split('?')[0].replace(/\/+$/, '')
      if (req.method === 'GET' && path === '/sync/status') {
        const wm = { ...START_WM, ...store.watermark }
        return { status: 200, ms: 6, log: [info(`Status read: watermark ${wm.at}`)], body: json({ watermark: { updatedAt: wm.at, productId: wm.id }, lastRun: store.last ?? null }) }
      }
      if (req.method === 'PUT' && path === '/sync/watermark') {
        let o = null
        try {
          o = JSON.parse(req.body || 'null')
        } catch {
          o = null
        }
        if (!o || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(String(o.updatedAt ?? ''))) return { status: 400, ms: 4, error: 'APIKIT:BAD_REQUEST', body: json({ message: 'updatedAt is required, as yyyy-MM-dd HH:mm:ss' }) }
        store.watermark = { at: o.updatedAt, id: Number(o.productId) || 0 }
        return { status: 200, ms: 8, log: [warn(`Watermark set back to ${o.updatedAt} by ${req.client ?? 'a caller'}. The next run reads every product changed since then again.`)], body: json({ watermark: { updatedAt: o.updatedAt, productId: store.watermark.id } }) }
      }
      return { status: 404, ms: 3, error: 'APIKIT:NOT_FOUND', body: json({ message: 'Resource not found' }) }
    },
  },
}
