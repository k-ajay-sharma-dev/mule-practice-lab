// The sample application of the end to end lab of SFTP. Imports only platform-log.js, so the engine can load it
// without a cycle. The package stands for the flows the team builds in Studio on the Supplier Stock Files System API.
import { info, line, muleError, needs, warn } from '../platform-log.js'

export const PKG = 'glenmore-stock-sapi'
export const FLOW = 'stock-file-listener'
export const HEADER = 'item_code;site;on_hand'
// the sites of Glenmore Supplies and the warehouses of Brightmart they stand for (a lookup in the DataWeave mapping)
export const SITES = { D1: 'DUB-1', R2: 'ROT-2' }
export const TABLE = 'dbo.supplier_stock'
// Lab made: the Mule Database config names a host; the lab finds the database server of the lab by that host
export const DB_OF = { 'sql-sbx.brightmart.lab': 'stock-sql-sbx', 'sql-prd.brightmart.lab': 'stock-sql-prd' }
const dirOf = (v) => `/${String(v ?? '').trim().split('/').filter(Boolean).join('/')}`
const json = (x) => JSON.stringify(x)

// A correlation ID for each file the listener picks up, in the form the runtime gives to a request
export function cidOf(seed) {
  let h = 2166136261
  for (const c of String(seed)) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0
  return `${h.toString(16).padStart(8, '0')}-c7a1-11f1`
}

const lines = (text) => String(text ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
// The first problem of a stock file, or null
export function problemOf(text) {
  const all = lines(text)
  if (all[0] !== HEADER) return `the header is '${all[0] ?? ''}', expected '${HEADER}'`
  for (let i = 1; i < all.length; i++) {
    const c = all[i].split(';').map((x) => x.trim())
    if (c.length !== 3) return `line ${i + 1} has ${c.length} fields, expected 3`
    if (!SITES[c[1]]) return `line ${i + 1}: site '${c[1]}' is not a known site of Glenmore`
    if (!/^\d+$/.test(c[2])) return `line ${i + 1}: on_hand '${c[2]}' is not a whole number`
  }
  return all.length > 1 ? null : 'the file has no stock lines'
}
// What the DataWeave mapping of the flow makes of one file
export const rowsOf = (text, file) =>
  lines(text)
    .slice(1)
    .map((l) => l.split(';').map((x) => x.trim()))
    .map(([code, site, qty]) => ({ sku: `GLM-${code}`, warehouse: SITES[site], available: Number(qty), supplier: 'GLENMORE', file_name: file }))

const el = {
  list: { at: 1, name: 'On new stock file', dsl: '<sftp:listener config-ref="SFTP_Config" directory="${sftp.inDir}" timeBetweenSizeCheck="${sftp.timeBetweenSizeCheck}" timeBetweenSizeCheckUnit="SECONDS">' },
  upsert: { at: 4, name: 'Update stock row', dsl: '<db:update config-ref="Stock_DB_Config">' },
  move: { at: 6, name: 'Move to archive', dsl: '<sftp:move config-ref="SFTP_Config" sourcePath="#[attributes.path]" targetPath="${sftp.archiveDir}">' },
  reject: { at: 8, name: 'Move to error', dsl: '<sftp:move config-ref="SFTP_Config" sourcePath="#[attributes.path]" targetPath="${sftp.errorDir}">' },
}
const fail = (log, where, type, message) => ({ ok: false, ms: 20000, errorType: type, log: [...log, muleError({ flow: FLOW, file: PKG, ...el[where], type, message })] })
const sftpOf = (ctx) => {
  const p = ctx.props
  return ctx.systems.files(String(p['sftp.host'] ?? '').trim(), { user: p['sftp.user'], key: p['sftp.identityFile'], port: Number(p['sftp.port']), knownHosts: p['sftp.knownHosts'] })
}
const dbCfg = (p) => ({ user: p['db.user'], password: p['db.password'], host: p['db.host'], port: p['db.port'], database: p['db.database'] })
const dbName = (p) => DB_OF[String(p['db.host'] ?? '').trim().toLowerCase()] ?? String(p['db.host'] ?? '').trim()
const remember = (store, entry) => {
  store.files = [...(store.files ?? []).filter((x) => x.name !== entry.name), entry].slice(-20)
}

// The upsert of one row: UPDATE by the key of the table, and INSERT when no row was there (SQL Server MERGE does the
// same in one statement; the lab uses the two statements the Database connector runs most often)
function upsert(ctx, row) {
  const p = ctx.props
  const u = ctx.db.update(dbName(p), dbCfg(p), `UPDATE ${TABLE} SET available = :available, supplier = :supplier, file_name = :file_name, updated_at = SYSDATETIME() WHERE sku = :sku AND warehouse = :warehouse`, row)
  if (!u.ok || u.affected) return { ...u, updated: Boolean(u.affected) }
  return ctx.db.insert(dbName(p), dbCfg(p), `INSERT INTO ${TABLE} (sku, warehouse, available, supplier, file_name, updated_at) VALUES (:sku, :warehouse, :available, :supplier, :file_name, SYSDATETIME())`, row)
}

export const PACKAGES = {
  [PKG]: {
    layer: 'System',
    traced: true,
    note: 'Supplier Stock Files System API. An SFTP listener on sftp.inDir picks up the stock files of Glenmore Supplies (item_code;site;on_hand), maps them to Brightmart SKUs and warehouses and upserts them into dbo.supplier_stock on the stock database. A loaded file goes to sftp.archiveDir, a file that does not parse to sftp.errorDir. GET /stock-files and GET /stock-files/{name} show what happened to each file with its correlation ID; POST /stock-files/{name}/replay moves a fixed file from the error folder back to the inbox.',
    sample: { method: 'GET', path: '/stock-files' },
    boot: needs('sftp.host', 'sftp.port', 'sftp.user', 'sftp.identityFile', 'sftp.knownHosts', 'sftp.inDir', 'sftp.archiveDir', 'sftp.errorDir', 'sftp.timeBetweenSizeCheck', 'db.host', 'db.database', 'db.user', 'db.password'),
    // the listener polls once a minute (fixed-frequency 60000 ms)
    schedules: [{ flow: FLOW, type: 'fixed', value: '1', unit: 'minutes', enabled: true }],
    run: {
      [FLOW]: (ctx) => {
        const { props, store, now } = ctx
        const wait = Number(props['sftp.timeBetweenSizeCheck']) || 0
        const opts = wait > 0 ? { sizeCheck: wait * 1000 } : {}
        const log = [info(`Polling ${dirOf(props['sftp.inDir'])} on ${props['sftp.host']}:${props['sftp.port']} as ${props['sftp.user']}`)]
        const f = sftpOf(ctx)
        const listed = f.list(dirOf(props['sftp.inDir']), opts)
        if (!listed.ok) return fail(log, 'list', listed.type ?? 'SFTP:CONNECTIVITY', listed.error)
        const files = listed.files.filter((x) => !x.dir && x.name.toLowerCase().endsWith('.csv'))
        if (!files.length) return { ok: true, ms: 200, log: [...log, info('No new stock files')] }
        for (const file of files) {
          const cid = cidOf(`${file.name}/${now}`)
          const say = (text) => info(`event:${cid} ${text}`)
          const r = f.read(file.path, opts)
          if (!r.ok && r.kind === 'being-written') {
            log.push(say(`Skipped ${file.name}: its size changed within ${wait} seconds, so the upload is still running`))
            continue
          }
          if (!r.ok) return fail(log, 'list', r.type ?? 'SFTP:CONNECTIVITY', r.error)
          log.push(say(`Picked up ${file.path}, ${r.size} bytes`))
          const problem = problemOf(r.content)
          if (problem) {
            // on-error-continue around the mapping: the file is kept for the supplier in the error folder, never deleted
            const m = f.move(file.path, `${dirOf(props['sftp.errorDir'])}/`, { overwrite: true })
            if (!m.ok) return fail(log, 'reject', m.type ?? 'SFTP:CONNECTIVITY', m.error)
            log.push(warn(`event:${cid} Rejected ${file.name}: ${problem}. Moved it to ${m.path}. No row of it was written`))
            remember(store, { name: file.name, status: 'rejected', problem, rows: 0, correlationId: cid, t: now, rejected: now })
            continue
          }
          const rows = rowsOf(r.content, file.name)
          log.push(say(`DataWeave mapped ${rows.length} lines to ${TABLE}. First: item ${rows[0].sku.slice(4)} site ${Object.keys(SITES).find((k) => SITES[k] === rows[0].warehouse)} on_hand ${rows[0].available} to sku ${rows[0].sku}, warehouse ${rows[0].warehouse}, available ${rows[0].available}`))
          let updated = 0
          let inserted = 0
          for (const row of rows) {
            const w = upsert(ctx, row)
            if (!w.ok) {
              // the file stays in the inbox, so the next poll tries it again: nothing is lost while the database is down
              remember(store, { name: file.name, status: 'waiting', problem: w.text, rows: 0, correlationId: cid, t: now })
              return fail([...log, line('ERROR', `event:${cid} ${w.text ?? 'The database call failed'}`)], 'upsert', w.errorType ?? 'DB:CONNECTIVITY', w.text ?? 'The database call failed')
            }
            if (w.updated) updated++
            else inserted++
          }
          log.push(say(`Upserted ${rows.length} rows into ${TABLE} on ${props['db.host']}: ${updated} updated, ${inserted} inserted`))
          const m = f.move(file.path, `${dirOf(props['sftp.archiveDir'])}/`, { overwrite: true })
          if (!m.ok) return fail(log, 'move', m.type ?? 'SFTP:CONNECTIVITY', m.error)
          log.push(say(`Moved ${file.path} to ${m.path}`))
          const was = (store.files ?? []).find((x) => x.name === file.name)
          remember(store, { name: file.name, status: 'loaded', rows: rows.length, correlationId: cid, t: now, ...(was?.replayed && { replayed: was.replayed }), ...(was?.rejected && { rejected: was.rejected }) })
        }
        return { ok: true, ms: 900, log, store }
      },
    },
    handle(ctx, req) {
      const path = req.path.split('?')[0]
      const store = (ctx.app.store ??= {})
      const list = store.files ?? []
      if (req.method === 'GET' && path === '/stock-files') return { status: 200, ms: 12, flow: 'get:\\stock-files:glenmore-stock-sapi-config', body: json(list.map(({ t, ...x }) => x)) }
      const one = path.match(/^\/stock-files\/([^/]+)$/)
      if (req.method === 'GET' && one) {
        const x = list.find((y) => y.name === decodeURIComponent(one[1]))
        if (!x) return { status: 404, ms: 6, error: 'APIKIT:NOT_FOUND', flow: 'get:\\stock-files\\(name):glenmore-stock-sapi-config', body: json({ message: 'No such stock file' }) }
        const { t, ...rest } = x
        return { status: 200, ms: 8, flow: 'get:\\stock-files\\(name):glenmore-stock-sapi-config', body: json(rest) }
      }
      const replay = path.match(/^\/stock-files\/([^/]+)\/replay$/)
      if (req.method === 'POST' && replay) {
        const flow = 'post:\\stock-files\\(name)\\replay:glenmore-stock-sapi-config'
        const name = decodeURIComponent(replay[1])
        const p = ctx.props
        const m = sftpOf(ctx).move(`${dirOf(p['sftp.errorDir'])}/${name}`, `${dirOf(p['sftp.inDir'])}/`, { overwrite: true })
        if (!m.ok && m.kind === 'not-found') return { status: 404, ms: 40, error: 'APIKIT:NOT_FOUND', flow, body: json({ message: `${name} is not in the error folder` }) }
        if (!m.ok) return { status: 502, ms: 60, error: m.type ?? 'SFTP:CONNECTIVITY', flow, log: [line('ERROR', `Replay of ${name} failed: ${m.error}`)], body: json({ message: m.error }) }
        const was = list.find((y) => y.name === name)
        store.files = [...list.filter((y) => y.name !== name), { ...(was ?? { name, rows: 0 }), status: 'replayed', replayed: ctx.now, t: ctx.now }].slice(-20)
        return { status: 202, ms: 45, flow, log: [info(`Replay of ${name}: moved it from ${dirOf(p['sftp.errorDir'])} to ${m.path}. The listener picks it up on its next poll`)], body: json({ name, status: 'replayed' }) }
      }
      return { status: 404, ms: 3, error: 'APIKIT:NOT_FOUND', flow: `${PKG}-main`, body: json({ message: 'Resource not found' }) }
    },
  },
}
