// The sample application of the end to end lab of FTP. Imports only platform-log.js, so the engine can load it
// without a cycle. The package stands for the flows the team builds in Studio on the Partner Price Files System API.
import { info, line, muleError, needs, warn } from '../platform-log.js'

export const PKG = 'kestrel-prices-sapi'
export const FLOW = 'price-file-listener'
export const HEADER = 'ART_NO|NET_PRICE_CT|CURR|VALID_FROM'
export const TABLE = 'BRIGHTMART.SUPPLIER_PRICES'
// Lab made: the Mule Database config names a host; the lab finds the database server of the lab by that host
export const DB_OF = { 'ora-sbx.brightmart.lab': 'pricing-ora-sbx', 'ora-prd.brightmart.lab': 'pricing-ora-prd' }
const dirOf = (v) => `/${String(v ?? '').trim().split('/').filter(Boolean).join('/')}`
const json = (x) => JSON.stringify(x)
// passive="true" and transferMode="BINARY" are the defaults of the FTP connection, so only another text changes them
const passiveOf = (p) => String(p['ftp.passive'] ?? 'true').trim().toLowerCase() !== 'false'
const modeOf = (p) => String(p['ftp.transferMode'] ?? 'BINARY').trim().toUpperCase() || 'BINARY'

export function cidOf(seed) {
  let h = 2166136261
  for (const c of String(seed)) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0
  return `${h.toString(16).padStart(8, '0')}-c7a1-11f1`
}

const lines = (text) => String(text ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
export function problemOf(text) {
  const all = lines(text)
  if (all[0] !== HEADER) return `the header is '${all[0] ?? ''}', expected '${HEADER}'`
  for (let i = 1; i < all.length; i++) {
    const c = all[i].split('|').map((x) => x.trim())
    if (c.length !== 4) return `line ${i + 1} has ${c.length} fields, expected 4`
    if (!/^\d+$/.test(c[1])) return `line ${i + 1}: NET_PRICE_CT '${c[1]}' is not a whole number of cents`
    if (!/^\d{8}$/.test(c[3])) return `line ${i + 1}: VALID_FROM '${c[3]}' is not a date yyyyMMdd`
  }
  return all.length > 1 ? null : 'the file has no prices'
}
// What the DataWeave mapping makes of one price file. Lab made: the lab keeps the text of the CSV inside the zip as
// the content of the zip, so the extract step is the identity here.
export const rowsOf = (text, file) =>
  lines(text)
    .slice(1)
    .map((l) => l.split('|').map((x) => x.trim()))
    .map(([art, cents, cur, from]) => ({ sku: `KF-${art}`, price: Number(cents) / 100, currency: cur, validFrom: `${from.slice(0, 4)}-${from.slice(4, 6)}-${from.slice(6, 8)}`, file }))

const el = {
  list: { at: 1, name: 'On new price file', dsl: '<ftp:listener config-ref="FTP_Config" directory="${ftp.inDir}">' },
  extract: { at: 2, name: 'Extract price list', dsl: '<compression:extract>' },
  upsert: { at: 5, name: 'Update price', dsl: '<db:update config-ref="Pricing_DB_Config">' },
  move: { at: 7, name: 'Move to done', dsl: '<ftp:move config-ref="FTP_Config" sourcePath="#[attributes.path]" targetPath="${ftp.doneDir}">' },
  reject: { at: 9, name: 'Move to error', dsl: '<ftp:move config-ref="FTP_Config" sourcePath="#[attributes.path]" targetPath="${ftp.errorDir}">' },
}
const fail = (log, where, type, message) => ({ ok: false, ms: 30000, errorType: type, log: [...log, muleError({ flow: FLOW, file: PKG, ...el[where], type, message })] })
const ftpOf = (ctx) => {
  const p = ctx.props
  return ctx.systems.files(String(p['ftp.host'] ?? '').trim(), { user: p['ftp.user'], password: p['ftp.password'], port: Number(p['ftp.port']), passive: passiveOf(p), transferMode: modeOf(p), protocol: 'FTP' })
}
const dbCfg = (p) => ({ user: p['db.user'], password: p['db.password'], host: p['db.host'], port: p['db.port'], service: p['db.service'] })
const dbName = (p) => DB_OF[String(p['db.host'] ?? '').trim().toLowerCase()] ?? String(p['db.host'] ?? '').trim()
const remember = (store, entry) => {
  store.files = [...(store.files ?? []).filter((x) => x.name !== entry.name), entry].slice(-20)
}

// An upsert that never lets an older price win: UPDATE only when the price in the table is not newer, then INSERT when
// the SKU has no row. A row that is newer stays and the line counts as skipped.
function upsert(ctx, row) {
  const p = ctx.props
  const u = ctx.db.update(dbName(p), dbCfg(p), `UPDATE ${TABLE} SET PRICE = :price, CURRENCY = :currency, VALID_FROM = :validFrom, FILE_NAME = :file WHERE SKU = :sku AND VALID_FROM <= :validFrom`, row)
  if (!u.ok) return u
  if (u.affected) return { ok: true, did: 'updated' }
  const had = ctx.db.select(dbName(p), dbCfg(p), `SELECT SKU FROM ${TABLE} WHERE SKU = :sku`, { sku: row.sku })
  if (!had.ok) return had
  if (had.rows.length) return { ok: true, did: 'skipped' }
  const i = ctx.db.insert(dbName(p), dbCfg(p), `INSERT INTO ${TABLE} (SKU, PRICE, CURRENCY, VALID_FROM, FILE_NAME) VALUES (:sku, :price, :currency, :validFrom, :file)`, row)
  return i.ok ? { ok: true, did: 'inserted' } : i
}

export const PACKAGES = {
  [PKG]: {
    layer: 'System',
    traced: true,
    note: 'Partner Price Files System API. Every 5 minutes an FTP listener on ftp.inDir picks up the price zips of Kestrel Foods, extracts the price list (ART_NO|NET_PRICE_CT|CURR|VALID_FROM), maps it to Brightmart SKUs in euros and upserts BRIGHTMART.SUPPLIER_PRICES on the pricing database, never over a newer price. A loaded zip goes to ftp.doneDir, a zip that does not open to ftp.errorDir. ftp.passive and ftp.transferMode set the FTP connection. GET /price-files shows each file with its correlation ID; POST /price-files/{name}/replay moves a file from the error folder back.',
    sample: { method: 'GET', path: '/price-files' },
    boot: needs('ftp.host', 'ftp.port', 'ftp.user', 'ftp.password', 'ftp.passive', 'ftp.transferMode', 'ftp.inDir', 'ftp.doneDir', 'ftp.errorDir', 'db.host', 'db.service', 'db.user', 'db.password'),
    schedules: [{ flow: FLOW, type: 'fixed', value: '5', unit: 'minutes', enabled: true }],
    run: {
      [FLOW]: (ctx) => {
        const { props, store, now } = ctx
        const log = [info(`Polling ${dirOf(props['ftp.inDir'])} on ${props['ftp.host']}:${props['ftp.port']}, passive ${passiveOf(props)}, transferMode ${modeOf(props)}`)]
        const f = ftpOf(ctx)
        const listed = f.list(dirOf(props['ftp.inDir']), { sizeCheck: 2000 })
        if (!listed.ok) return fail(log, 'list', listed.type ?? 'FTP:CONNECTIVITY', listed.error)
        const files = listed.files.filter((x) => !x.dir && x.name.toLowerCase().endsWith('.zip'))
        if (!files.length) return { ok: true, ms: 400, log: [...log, info('No new price files')] }
        for (const file of files) {
          const cid = cidOf(`${file.name}/${now}`)
          const say = (text) => info(`event:${cid} ${text}`)
          const r = f.read(file.path, { sizeCheck: 2000 })
          if (!r.ok && r.kind === 'being-written') continue
          if (!r.ok) return fail(log, 'list', r.type ?? 'FTP:CONNECTIVITY', r.error)
          log.push(say(`Picked up ${file.path}, ${r.size} bytes, ${modeOf(props)} mode`))
          const was = (store.files ?? []).find((x) => x.name === file.name)
          const problem = r.corrupt ? `COMPRESSION:INVALID_ARCHIVE, ${r.parseError}` : problemOf(r.content)
          if (problem) {
            // on-error-continue around the extract and the mapping: the zip is kept whole in the error folder
            const m = f.move(file.path, `${dirOf(props['ftp.errorDir'])}/`, { overwrite: true })
            if (!m.ok) return fail(log, 'reject', m.type ?? 'FTP:CONNECTIVITY', m.error)
            log.push(warn(`event:${cid} Rejected ${file.name}: ${problem}. Moved it to ${m.path}. No price of it was written`))
            remember(store, { name: file.name, status: 'rejected', problem, rows: 0, correlationId: cid, t: now, rejected: now })
            continue
          }
          const rows = rowsOf(r.content, file.name)
          const first = rows[0]
          log.push(say(`DataWeave mapped ${rows.length} prices. First: ART_NO ${first.sku.slice(3)} NET_PRICE_CT ${Math.round(first.price * 100)} to SKU ${first.sku}, PRICE ${first.price.toFixed(2)} ${first.currency}, VALID_FROM ${first.validFrom}`))
          const n = { updated: 0, inserted: 0, skipped: 0 }
          for (const row of rows) {
            const w = upsert(ctx, row)
            if (!w.ok) {
              // the zip stays in the inbox, so the next poll tries again: nothing is lost while the database is down
              remember(store, { name: file.name, status: 'waiting', problem: w.text, rows: 0, correlationId: cid, t: now })
              return fail([...log, line('ERROR', `event:${cid} ${w.text ?? 'The database call failed'}`)], 'upsert', w.errorType ?? 'DB:CONNECTIVITY', w.text ?? 'The database call failed')
            }
            n[w.did]++
          }
          log.push(say(`Wrote ${rows.length} prices to ${TABLE} on ${props['db.host']}: ${n.updated} updated, ${n.inserted} inserted, ${n.skipped} skipped because the table has a newer price`))
          const m = f.move(file.path, `${dirOf(props['ftp.doneDir'])}/`, { overwrite: true })
          if (!m.ok) return fail(log, 'move', m.type ?? 'FTP:CONNECTIVITY', m.error)
          log.push(say(`Moved ${file.path} to ${m.path}`))
          remember(store, { name: file.name, status: 'loaded', rows: rows.length, correlationId: cid, t: now, ...(was?.replayed && { replayed: was.replayed }), ...(was?.rejected && { rejected: was.rejected }) })
        }
        return { ok: true, ms: 1500, log, store }
      },
    },
    handle(ctx, req) {
      const path = req.path.split('?')[0]
      const store = (ctx.app.store ??= {})
      const list = store.files ?? []
      const cfg = `${PKG}-config`
      if (req.method === 'GET' && path === '/price-files') return { status: 200, ms: 12, flow: `get:\\price-files:${cfg}`, body: json(list.map(({ t, rejected, ...x }) => x)) }
      const one = path.match(/^\/price-files\/([^/]+)$/)
      if (req.method === 'GET' && one) {
        const x = list.find((y) => y.name === decodeURIComponent(one[1]))
        if (!x) return { status: 404, ms: 6, error: 'APIKIT:NOT_FOUND', flow: `get:\\price-files\\(name):${cfg}`, body: json({ message: 'No such price file' }) }
        const { t, rejected, ...rest } = x
        return { status: 200, ms: 8, flow: `get:\\price-files\\(name):${cfg}`, body: json(rest) }
      }
      const replay = path.match(/^\/price-files\/([^/]+)\/replay$/)
      if (req.method === 'POST' && replay) {
        const flow = `post:\\price-files\\(name)\\replay:${cfg}`
        const name = decodeURIComponent(replay[1])
        const p = ctx.props
        // RNFR and RNTO need no data connection, so a replay works even while passive ports are closed
        const m = ftpOf(ctx).move(`${dirOf(p['ftp.errorDir'])}/${name}`, `${dirOf(p['ftp.inDir'])}/`, { overwrite: true })
        if (!m.ok && m.kind === 'not-found') return { status: 404, ms: 40, error: 'APIKIT:NOT_FOUND', flow, body: json({ message: `${name} is not in the error folder` }) }
        if (!m.ok) return { status: 502, ms: 60, error: m.type ?? 'FTP:CONNECTIVITY', flow, log: [line('ERROR', `Replay of ${name} failed: ${m.error}`)], body: json({ message: m.error }) }
        const was = list.find((y) => y.name === name)
        store.files = [...list.filter((y) => y.name !== name), { ...(was ?? { name, rows: 0 }), status: 'replayed', replayed: ctx.now, t: ctx.now }].slice(-20)
        return { status: 202, ms: 45, flow, log: [info(`Replay of ${name}: moved it from ${dirOf(p['ftp.errorDir'])} to ${m.path}. The listener picks it up on its next poll`)], body: json({ name, status: 'replayed' }) }
      }
      return { status: 404, ms: 3, error: 'APIKIT:NOT_FOUND', flow: `${PKG}-main`, body: json({ message: 'Resource not found' }) }
    },
  },
}
