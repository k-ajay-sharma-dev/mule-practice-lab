// The sample applications of the chain-db-to-api lab. Imports only platform-log.js, so the engine can load it without a cycle.
// Four apps of Harbor: the mobile Experience API, the prices Process API, the prices System API on SQL Server (through
// ctx.db, so its sessions and locks show in the Databases console) and the price import that loads the file of the
// pricing system from SFTP (through ctx.systems).
import { info, muleError, needs, warn } from '../platform-log.js'

export const DB = 'harbor-sql'
export const HOST = 'sftp.harbor.lab'
export const EAPI = 'harbor-mobile-eapi'
export const PAPI = 'harbor-prices-papi'
export const SAPI = 'harbor-prices-sapi'
export const IMPORT = 'harbor-price-import'
export const IMPORT_FLOW = 'price-import-flow'
export const PRICE_DIR = '/inbound/prices'
export const OPS_MAIL = 'ops@harbor.example'
// lab-made: a flow that waits on a lock never answers; the lab records its call as 60 s, and the caller cuts it at its own timeout
const HUNG_MS = 60000
const MINUTE = 60000
const BASE = Date.UTC(2026, 10, 2) // the lab clock starts on Monday 2 November 2026, as in platform.js
export const dayOf = (t) => new Date(BASE + t).toISOString().slice(0, 10)
const hhmm = (t) => new Date(BASE + t).toISOString().slice(11, 16)
const minuteOfDay = (t) => Math.floor((((t % 86400000) + 86400000) % 86400000) / MINUTE)
export const fileOf = (t) => `prices-${dayOf(t)}.csv`

const num = (v) => (String(v ?? '').trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null)
const json = (v) => JSON.stringify(v)
const word = (v) => String(v ?? '').trim().toLowerCase()
// '06:00' as minutes of the day, or null
export const timeOf = (v) => {
  const m = String(v ?? '').trim().match(/^(\d{1,2}):(\d{2})$/)
  return m && Number(m[1]) < 24 && Number(m[2]) < 60 ? Number(m[1]) * 60 + Number(m[2]) : null
}
export const settingsOf = (p) => ({
  queryTimeout: num(p['db.queryTimeout']) ?? 0,
  sapiTimeout: num(p['sapi.timeout']) ?? 10000,
  papiTimeout: num(p['papi.timeout']) ?? 10000,
  fallback: word(p['prices.fallback']) || 'none',
  commitSize: num(p['import.commitSize']) ?? 0,
  notAfter: timeOf(p['import.notAfter']),
})
const cfgOf = (p) => ({ user: p['db.user'], password: p['db.password'], maxPoolSize: p['db.pool.max'], maxWait: p['db.pool.maxWait'], queryTimeout: p['db.queryTimeout'] })

const OUTCOME = { 'HTTP:TIMEOUT': 504, 'HTTP:GATEWAY_TIMEOUT': 504, 'HTTP:CONNECTIVITY': 503, 'HTTP:SERVICE_UNAVAILABLE': 503 }
const at = (flow, file, n, name, dsl) => ({ flow, file, at: n, name, dsl })
// one full error block a minute, a short line for the rest, so a saved console stays small (lab-made)
function errorLog(ctx, error) {
  const minute = Math.floor(ctx.now / MINUTE)
  if (ctx.store.logged === minute) return [warn(`${error.type}: ${String(error.message).slice(0, 140)}`)]
  ctx.store.logged = minute
  return [muleError(error)]
}
function relay(ctx, r, flow, file, name, body) {
  const status = OUTCOME[r.error] ?? 502
  const error = { ...at(flow, file, 2, name, `<http:request method="GET" doc:name="${name}" config-ref="${name.replace(/\W+/g, '_')}_Config" path="${r.path}" responseTimeout="\${${file === EAPI ? 'papi' : 'sapi'}.timeout}">`), type: r.error, message: `HTTP GET on resource '${r.url}${r.path}' failed: ${r.text}.` }
  return { status, ms: r.ms + 12, flow, error: r.error, log: errorLog(ctx, error), body: json(body) }
}

export const PACKAGES = {
  [EAPI]: {
    layer: 'Experience',
    traced: true,
    note: 'The API of the Harbor mobile app. GET /products/{sku}/price and POST /checkout call the prices Process API at papi.url. papi.timeout is the responseTimeout of that call in milliseconds.',
    sample: { method: 'GET', path: '/products/SKU-22/price' },
    boot: needs('papi.url'),
    handle(ctx, req) {
      const path = req.path.split('?')[0]
      const price = path.match(/^\/products\/([\w-]+)\/price$/)
      const checkout = path === '/checkout' && req.method === 'POST'
      if (!(price && req.method === 'GET') && !checkout) return { status: 404, ms: 4, error: 'APIKIT:NOT_FOUND', flow: `${EAPI}-main`, body: json({ message: 'Resource not found' }) }
      let sku = price?.[1]
      let qty = 1
      if (checkout) {
        try {
          const b = JSON.parse(req.body || '{}')
          sku = b.sku
          qty = Number(b.qty) || 1
        } catch {
          sku = null
        }
        if (!sku) return { status: 400, ms: 6, error: 'APIKIT:BAD_REQUEST', flow: 'post:\\checkout', body: json({ message: 'sku is required' }) }
      }
      const flow = checkout ? 'post:\\checkout' : 'get:\\products\\(sku)\\price'
      const r = ctx.call('papi.url', { method: 'GET', path: `/prices/${sku}` }, settingsOf(ctx.props).papiTimeout)
      if (r.error) return relay(ctx, r, flow, EAPI, 'Prices Process API', { message: checkout ? 'Checkout failed: price unavailable' : 'price unavailable' })
      const p = JSON.parse(r.body)
      if (checkout) return { status: 201, ms: r.ms + 30, flow, body: json({ orderId: `O-${2000 + (Math.floor(ctx.now / MINUTE) % 7000)}`, sku, qty, total: Math.round(p.price * qty * 100) / 100, currency: p.currency, priceSource: p.source }) }
      return { status: 200, ms: r.ms + 8, flow, body: json(p) }
    },
  },
  [PAPI]: {
    layer: 'Process',
    traced: true,
    note: 'Prices for every channel. GET /prices/{sku} calls the prices System API at sapi.url with responseTimeout sapi.timeout (ms). prices.fallback is none or last-known: with last-known an On Error Continue answers the last price this API served, from a persistent Object Store, marked as source last-known.',
    sample: { method: 'GET', path: '/prices/SKU-22' },
    boot: needs('sapi.url'),
    handle(ctx, req) {
      const m = req.path.split('?')[0].match(/^\/prices\/([\w-]+)$/)
      if (!m || req.method !== 'GET') return { status: 404, ms: 4, error: 'APIKIT:NOT_FOUND', flow: `${PAPI}-main`, body: json({ message: 'Resource not found' }) }
      const sku = m[1]
      const flow = 'get:\\prices\\(sku)'
      const set = settingsOf(ctx.props)
      const r = ctx.call('sapi.url', { method: 'GET', path: `/prices/${sku}` }, set.sapiTimeout)
      ctx.store.last ??= {}
      if (!r.error) {
        const p = JSON.parse(r.body)
        ctx.store.last[sku] = { price: p.price, currency: p.currency, t: ctx.now }
        return { status: 200, ms: r.ms + 10, flow, body: json({ ...p, source: 'database' }) }
      }
      const known = ctx.store.last[sku]
      if (set.fallback === 'last-known' && known) {
        // lab-made: one line a minute, so the log stays readable
        const minute = Math.floor(ctx.now / MINUTE)
        const log = ctx.store.fellBack === minute ? [] : [warn(`On Error Continue (${r.error}): answered the last known price of ${sku}, ${known.price} ${known.currency} stored at ${hhmm(known.t)}, from the Object Store.`)]
        ctx.store.fellBack = minute
        return { status: 200, ms: r.ms + 6, flow, log, body: json({ sku, price: known.price, currency: known.currency, source: 'last-known', asOf: hhmm(known.t) }) }
      }
      return relay(ctx, r, flow, PAPI, 'Prices System API', { message: { 504: 'The prices system did not answer in time', 503: 'The prices system is not available' }[OUTCOME[r.error]] ?? 'Prices system error' })
    },
  },
  [SAPI]: {
    layer: 'System',
    traced: true,
    note: `GET /prices/{sku} reads dbo.prices on SQL Server ${DB}. The Select has queryTimeout from db.queryTimeout (seconds, 0 is none). The pooling profile reads maxPoolSize from db.pool.max and maxWait (seconds, 0 waits with no limit) from db.pool.maxWait.`,
    sample: { method: 'GET', path: '/prices/SKU-22' },
    boot: needs('db.user', 'db.password', 'db.pool.max'),
    handle(ctx, req) {
      const m = req.path.split('?')[0].match(/^\/prices\/([\w-]+)$/)
      if (!m || req.method !== 'GET') return { status: 404, ms: 4, error: 'APIKIT:NOT_FOUND', flow: `${SAPI}-main`, body: json({ message: 'Resource not found' }) }
      const flow = 'get:\\prices\\(sku)'
      const r = ctx.db.select(DB, cfgOf(ctx.props), 'SELECT sku, price, currency, valid_from FROM dbo.prices WHERE sku = :sku', { sku: m[1] })
      if (r.hung) {
        const minute = Math.floor(ctx.now / MINUTE)
        const log = ctx.store.waited === minute ? [] : [warn(`GET /prices/${m[1]}: the Select gets no answer. ${r.text}`)]
        ctx.store.waited = minute
        return { status: 504, ms: HUNG_MS, flow, error: 'HTTP:TIMEOUT', log, body: json({ message: 'Gateway timeout' }) }
      }
      if (!r.ok) {
        const error = { ...at(flow, SAPI, 1, 'Select price', '<db:select doc:name="Select price" config-ref="SqlServer_Config" queryTimeout="${db.queryTimeout}">'), type: r.errorType, message: r.text }
        return { status: 500, ms: Math.round(r.ms ?? 30) + 15, flow, error: r.errorType, log: errorLog(ctx, error), body: json({ message: 'Internal server error' }) }
      }
      if (!r.rows.length) return { status: 404, ms: r.ms + 10, flow, error: 'APIKIT:NOT_FOUND', body: json({ message: `No price for ${m[1]}` }) }
      const row = r.rows[0]
      return { status: 200, ms: r.ms + 14, flow, body: json({ sku: row.sku, price: Number(row.price), currency: row.currency, validFrom: row.valid_from }) }
    },
  },
  [IMPORT]: {
    note: `Every 15 minutes it looks for the price file of the day (prices-YYYY-MM-DD.csv) in sftp.dir on ${HOST}, and loads it once into dbo.prices with one UPDATE per row. import.commitSize empty or 0 loads the whole file in one transaction that commits at the end of the file; a number commits after that many rows. import.notAfter (HH:MM, UTC) is the latest time of day a load may start; a file that comes later is not loaded and Operations gets a mail. Empty means any time.`,
    boot: needs('sftp.host', 'sftp.user', 'sftp.password', 'sftp.dir', 'db.user', 'db.password'),
    schedules: [{ flow: IMPORT_FLOW, type: 'cron', value: '0 0/15 * * * ?', tz: 'UTC', enabled: true }],
    run: {
      [IMPORT_FLOW]: (ctx) => {
        const { props, now, store } = ctx
        const day = dayOf(now)
        const set = settingsOf(props)
        const log = []
        // the run of the earlier poll is still in its open transaction, or its session was killed
        if (store.held) {
          const alive = (ctx.db.pool(DB)?.sessions ?? []).includes(store.held.session)
          if (alive) return { ok: true, ms: 500, log: [], store }
          log.push(muleError({ ...at(IMPORT_FLOW, IMPORT, 3, 'Update price', '<db:update doc:name="Update price" config-ref="SqlServer_Config">'), type: 'DB:CONNECTIVITY', message: `com.microsoft.sqlserver.jdbc.SQLServerException: The connection is closed. Session ${store.held.session} was ended and SQL Server rolled back its transaction. No price of ${store.held.file} was saved.` }))
          store.runs = [...(store.runs ?? []), { t: now, file: store.held.file, result: 'rolled back' }].slice(-10)
          store.held = null
        }
        if (store.done === day) return { ok: log.length === 0, ms: 300, log, store, errorType: log.length ? 'DB:CONNECTIVITY' : null }
        const f = ctx.systems.files(props['sftp.host'], { user: props['sftp.user'], password: props['sftp.password'] })
        const name = fileOf(now)
        const listed = f.list(props['sftp.dir'])
        if (!listed.ok) return { ok: false, ms: 1200, errorType: listed.type ?? 'SFTP:CONNECTIVITY', log: [...log, muleError({ ...at(IMPORT_FLOW, IMPORT, 1, 'List price files', '<sftp:list doc:name="List price files" config-ref="SFTP_Config" directoryPath="${sftp.dir}">'), type: listed.type ?? 'SFTP:CONNECTIVITY', message: listed.error })], store }
        const file = listed.files.find((x) => x.name === name)
        if (!file) return { ok: log.length === 0, ms: 400, log, store, errorType: log.length ? 'DB:CONNECTIVITY' : null }
        if (set.notAfter !== null && minuteOfDay(now) > set.notAfter) {
          if (store.late === day) return { ok: true, ms: 300, log, store }
          store.late = day
          log.push(warn(`${name} arrived at ${hhmm(file.t)}, after import.notAfter ${props['import.notAfter']}. Not loaded during the day. Operations was told.`))
          return { ok: true, ms: 400, log, store, mail: { to: OPS_MAIL, subject: `Price file ${name} came late and was not loaded`, body: `${IMPORT} found ${name} at ${hhmm(now)}. The file arrived on ${props['sftp.host']} at ${hhmm(file.t)}, after the latest start of ${props['import.notAfter']}. The shop keeps the prices of yesterday. Load the file in the evening window or ask the pricing team to send it again tonight.` } }
        }
        const read = f.read(`${props['sftp.dir']}/${name}`)
        if (!read.ok) return { ok: false, ms: 900, errorType: read.type ?? 'SFTP:CONNECTIVITY', log: [...log, muleError({ ...at(IMPORT_FLOW, IMPORT, 2, 'Read price file', '<sftp:read doc:name="Read price file" config-ref="SFTP_Config">'), type: read.type ?? 'SFTP:CONNECTIVITY', message: read.error })], store }
        const rows = String(read.content).trim().split('\n').slice(1).map((l) => l.split(',')).filter((x) => x.length >= 4).map(([sku, price, currency, from]) => ({ sku, price: Number(price), currency, from }))
        const cfg = { user: props['db.user'], password: props['db.password'], maxPoolSize: 2 }
        const update = (tx, x) => tx.update('UPDATE dbo.prices SET price = :price, currency = :currency, valid_from = :from WHERE sku = :sku', x)
        if (set.commitSize > 0) {
          let n = 0
          for (let i = 0; i < rows.length; i += set.commitSize) {
            const part = rows.slice(i, i + set.commitSize)
            const r = ctx.db.transaction(DB, cfg, (tx) => void part.forEach((x) => update(tx, x)))
            if (!r.ok) return { ok: false, ms: 2000, errorType: r.errorType ?? 'DB:QUERY_EXECUTION', log: [...log, muleError({ ...at(IMPORT_FLOW, IMPORT, 3, 'Update price', '<db:update doc:name="Update price" config-ref="SqlServer_Config">'), type: r.errorType ?? 'DB:QUERY_EXECUTION', message: r.text })], store }
            n++
          }
          store.done = day
          store.runs = [...(store.runs ?? []), { t: now, file: name, result: `loaded in ${n} transactions` }].slice(-10)
          // lab-made: the lab file carries the first rows of the real file, and each chunk of the real file commits in a few seconds
          log.push(info(`Loaded ${name} into dbo.prices in transactions of at most ${set.commitSize} rows. Each commit releases its locks.`))
          return { ok: true, ms: 4000, log, store }
        }
        // the whole file in one transaction: the locks of every row stay until the end of the file
        const r = ctx.db.transaction(DB, cfg, (tx) => {
          rows.forEach((x) => update(tx, x))
          tx.hold(`${IMPORT} loads ${name} in one transaction. It has updated the first rows and keeps their locks until the last of the 5,412 rows is done.`)
        })
        if (!r.ok) return { ok: false, ms: 2000, errorType: r.errorType ?? 'DB:QUERY_EXECUTION', log: [...log, muleError({ ...at(IMPORT_FLOW, IMPORT, 3, 'Update price', '<db:update doc:name="Update price" config-ref="SqlServer_Config">'), type: r.errorType ?? 'DB:QUERY_EXECUTION', message: r.text })], store }
        store.held = { session: r.session, file: name, t: now }
        log.push(info(`Found ${name} (arrived ${hhmm(file.t)}). Loading 5,412 rows into dbo.prices in one transaction, on session ${r.session}.`))
        // lab-made: at day load the file needs about two hours, and the lab keeps the transaction open until someone ends
        // it. The next polls see the open run and do nothing, the way disallowConcurrentExecution would.
        return { ok: true, ms: 3000, log, store }
      },
    },
  },
}
