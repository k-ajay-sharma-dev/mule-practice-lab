// The sample application of the end to end lab of Workday. Imports only platform-log.js and the import free Workday
// engine, so the engine can load it without a cycle. New hires and changed workers of Workday become badge holders in
// the store access database of Brightmart (SQL Server StoreAccess, table dbo.badge_holders).
import { info, line, muleError, needs, warn } from '../platform-log.js'
import { wdConfig, wdTime } from '../platform-workday.js'

export const WD_PKG = 'brightmart-e2e-wd-badge-sync'
export const WD_FLOW = 'badge-sync-flow'
export const WD_DB = 'brightmart-access'
// the site code of the door controllers for each Workday location
export const SITES = { 'Pier 01 store': 'S101', 'Pier 02 store': 'S102', 'Dock 01 warehouse': 'W01', 'Brightmart HQ': 'HQ' }
const BASE = Date.UTC(2026, 10, 2)
const sqlTime = (t) => new Date(BASE + t).toISOString().replace('T', ' ').slice(0, 19)
const keep = (list, items, n = 20) => [...(list ?? []), ...items].slice(-n)
const word = (v) => String(v ?? '').trim()
const el = {
  raas: { flow: WD_FLOW, at: 1, name: 'Get new hires', dsl: '<http:request method="GET" doc:name="Get new hires" config-ref="Workday_RaaS_Config" path="/${raas.owner}/${raas.report}">' },
  upsert: { flow: WD_FLOW, at: 4, name: 'Update badge holder', dsl: '<db:update doc:name="Update badge holder" config-ref="Badge_Database_Config">' },
}
const dbCfg = (p) => ({ host: p['db.host'], database: p['db.database'], user: p['db.user'], password: p['db.password'] })
const UPDATE = 'UPDATE dbo.badge_holders SET full_name = :name, email = :email, site_code = :site, job_title = :job, badge_status = :status, valid_from = :from, updated_at = :now WHERE employee_id = :id'
const INSERT = 'INSERT INTO dbo.badge_holders (employee_id, full_name, email, site_code, job_title, badge_status, valid_from, updated_at) VALUES (:id, :name, :email, :site, :job, :status, :from, :now)'

// The DataWeave mapping of the flow: a RaaS row to a badge holder, or the reason it cannot be one
export function toBadge(row, now) {
  const site = SITES[row.Location]
  if (!word(row.Email)) return { reject: 'Work email missing' }
  if (!site) return { reject: `No site code for location ${row.Location ?? '(empty)'}` }
  return { id: row.Employee_ID, name: row.Worker, email: word(row.Email).toLowerCase(), site, job: row.Job_Profile ?? null, status: 'ACTIVE', from: row.Hire_Date ?? null, now: sqlTime(now) }
}

// One sync over the window [from, to): RaaS with the two prompts, then an upsert per worker. A worker that cannot be
// mapped goes to the rejected list and is not written; it comes back in a later window once HR fixes it in Workday,
// because the fix changes Last_Functionally_Updated.
function sync(ctx, from, to, cid) {
  const { props: p, store, now } = ctx
  const r = ctx.workday.raas(wdConfig(p), p['raas.report'], { Updated_From: wdTime(from), Updated_To: wdTime(to) })
  if (!r.ok) return { ok: false, ms: r.ms, type: r.type, log: [muleError({ ...el.raas, file: WD_PKG, type: r.type, message: r.error })] }
  const log = [info(`correlationId=${cid} ${p['raas.report']} from ${wdTime(from)} to ${wdTime(to)}: ${r.rows.length} worker${r.rows.length === 1 ? '' : 's'}`)]
  const rejected = []
  let inserted = 0
  let updated = 0
  let ms = r.ms
  for (const row of r.rows) {
    const b = toBadge(row, now)
    if (b.reject) {
      rejected.push({ id: row.Employee_ID, name: row.Worker, reason: b.reject, t: now })
      log.push(warn(`correlationId=${cid} Worker ${row.Employee_ID} ${row.Worker ?? ''} rejected: ${b.reject}. Added to the rejected list, no badge written.`))
      continue
    }
    const u = ctx.db.update(WD_DB, dbCfg(p), UPDATE, b)
    if (!u.ok) return { ok: false, ms: ms + (u.ms ?? 0), type: u.errorType, log: [...log, muleError({ ...el.upsert, file: WD_PKG, type: u.errorType, message: u.text })] }
    let how = 'updated'
    if (!u.affected) {
      const n = ctx.db.insert(WD_DB, dbCfg(p), INSERT, b)
      if (!n.ok) return { ok: false, ms: ms + (n.ms ?? 0), type: n.errorType, log: [...log, muleError({ ...el.upsert, at: 5, name: 'Insert badge holder', dsl: '<db:insert doc:name="Insert badge holder" config-ref="Badge_Database_Config">', file: WD_PKG, type: n.errorType, message: n.text })] }
      how = 'inserted'
      inserted++
    } else updated++
    ms += 20
    log.push(info(`correlationId=${cid} Badge holder ${b.id} ${b.name} ${how}: site ${b.site}, job ${b.job}, email ${b.email}, valid from ${b.from}`))
  }
  log.push(info(`correlationId=${cid} Sync done: ${inserted} inserted, ${updated} updated, ${rejected.length} rejected`))
  const fixed = new Set(r.rows.filter((x) => !toBadge(x, now).reject).map((x) => x.Employee_ID))
  return {
    ok: true,
    ms: ms + 40,
    rejected,
    log,
    store: {
      sent: (store.sent ?? 0) + inserted + updated,
      // a worker leaves the rejected list once a later window writes it
      rejected: keep((store.rejected ?? []).filter((x) => !fixed.has(x.id)), rejected),
      last: { t: now, cid, rows: r.rows.length, inserted, updated, rejected: rejected.length },
    },
  }
}
const sinceOf = (p) => {
  const t = Date.parse(/T/.test(word(p['sync.since'])) ? `${word(p['sync.since'])}Z`.replace(/ZZ$/, 'Z') : `${word(p['sync.since'])}T00:00:00Z`)
  return Number.isNaN(t) ? 0 : t - BASE
}
const json = (o) => JSON.stringify(o)
const runId = (now) => `wd-badge-${sqlTime(now).replace(/\D/g, '').slice(0, 12)}`

export const PACKAGES = {
  [WD_PKG]: {
    note: `Badge Sync API of Brightmart. The flow ${WD_FLOW} runs every 15 minutes: it calls the custom report raas.report of raas.owner over RaaS with the prompts Updated_From (the watermark, first sync.since) and Updated_To (now), maps each worker to a badge holder (Location to a site code, Job_Profile to the job title) and upserts it in dbo.badge_holders of the database db.database on db.host: UPDATE by employee_id, and INSERT when no row was updated. A worker without a work email or a mapped location is not written: it goes to the rejected list in the object store and the run counts an error. The watermark moves when the window is written. GET /sync/status shows the last run; POST /sync/replay with {"from":"2026-11-03T00:00:00"} runs the same sync again from that time without moving the watermark. Logs carry correlationId per run. Properties: workday.host, workday.tenant, workday.username, the secure workday.password, raas.owner, raas.report, db.host, db.database, db.user, the secure db.password, sync.since.`,
    sample: { method: 'GET', path: '/sync/status', body: '' },
    traced: true,
    boot: needs('workday.host', 'workday.tenant', 'workday.username', 'workday.password', 'raas.owner', 'raas.report', 'db.host', 'db.database', 'db.user', 'db.password', 'sync.since'),
    schedules: [{ flow: WD_FLOW, type: 'fixed', value: '15', unit: 'minutes', enabled: true }],
    handle(ctx, req) {
      const path = req.path.split('?')[0].replace(/\/+$/, '')
      if (req.method === 'GET' && path === '/sync/status') return { status: 200, ms: 8, flow: 'get:\\sync\\status:badge-sync-api-config', body: json({ watermark: ctx.store.watermark === undefined ? null : wdTime(ctx.store.watermark), sent: ctx.store.sent ?? 0, last: ctx.store.last ?? null, rejected: ctx.store.rejected ?? [] }) }
      if (req.method === 'POST' && path === '/sync/replay') {
        let b = {}
        try {
          b = JSON.parse(req.body || '{}') ?? {}
        } catch {
          b = {}
        }
        const from = Date.parse(/T/.test(word(b.from)) ? `${word(b.from)}Z`.replace(/ZZ$/, 'Z') : `${word(b.from)}T00:00:00Z`) - BASE
        if (Number.isNaN(from) || from > ctx.now) return { status: 400, ms: 4, flow: 'post:\\sync\\replay:application\\json:badge-sync-api-config', error: 'APIKIT:BAD_REQUEST', body: json({ message: 'Give from as 2026-11-03T00:00:00, not in the future' }) }
        if (ctx.app.env === 'Production') return { status: 503, ms: 4, flow: 'post:\\sync\\replay:application\\json:badge-sync-api-config', body: json({ message: 'Lab: the Production tenant is outside the lab' }) }
        const x = sync(ctx, from, ctx.now, runId(ctx.now))
        if (!x.ok) return { status: 502, ms: x.ms, flow: 'post:\\sync\\replay:application\\json:badge-sync-api-config', error: x.type, log: x.log, body: json({ message: 'The replay failed', error: x.type }) }
        // the replay keeps the watermark: only the counts and the rejected list change
        ctx.app.store = { ...ctx.store, ...x.store }
        return { status: 200, ms: x.ms, flow: 'post:\\sync\\replay:application\\json:badge-sync-api-config', log: x.log, body: json(x.store.last) }
      }
      return { status: 404, ms: 3, error: 'APIKIT:NOT_FOUND', flow: 'badge-sync-api-main', body: json({ message: 'Resource not found' }) }
    },
    run: {
      [WD_FLOW]: (ctx) => {
        const { store, now, props: p } = ctx
        // lab-made: the Production tenant and database are outside the lab, so a run there only says so
        if (ctx.app.env === 'Production') return { ok: true, ms: 5, log: [info(`Lab: ${WD_FLOW} would read ${p['raas.report']} on ${p['workday.host']} tenant ${p['workday.tenant']}. The Production tenant is outside the lab, so nothing is sent.`)] }
        const from = store.watermark ?? sinceOf(p)
        const cid = runId(now)
        const x = sync(ctx, from, now, cid)
        if (!x.ok) return { ok: false, ms: x.ms, errorType: x.type, log: [...x.log, line('WARN', `correlationId=${cid} The watermark stays at ${wdTime(from)}, so the next run reads the same window again.`)] }
        // lab-made error type of the flow for a rejected worker
        return { ok: x.rejected.length === 0, ms: x.ms, errors: x.rejected.length, errorType: x.rejected.length ? 'BADGE:INVALID_WORKER' : null, log: x.log, store: { ...x.store, watermark: now } }
      },
    },
  },
}
