// Workday: workers, business processes with effective dates, custom reports exposed as RaaS, integration system users
// (ISU) with their security groups and domain security policies, the password rules of the tenant, and SOAP web services
// of Human_Resources (Get_Workers, Change_Job, Change_Work_Contact_Information) with validation faults. Pure and import
// free. Lives in state.workday.
//
// State shape (state.workday, once filled; the open console seeds only { created } and fillWorkday builds the rest on
// first use):
//   tenant, host,
//   workers: { '21001': { name, job, loc, org, email, hire, term, upd } }   hire and term are effective dates (lab ms),
//            upd is the moment of the last change (Last Functionally Updated)
//   pop: { n, hire, upd }              lab-made: more active workers that are counted and reported but not stored
//   bulk: [{ n, from, to, label, loc, prefix }]  lab-made: a load of hires spread over [from, to), counted, not stored
//   events: [{ id, type, worker, eff, done, by, status, text }]   business process history: eff is the effective date,
//            done the moment it completed (the entry moment). They differ for back dated and future dated events.
//   reports: { INT_All_Workers: { name, owner, source, fields: [], prompts: [{ name, field, op }], ws, share: [] } }
//   isus: { ISU_X: { password, set, requireNew, noUi, timeout } }
//   groups: { ISSG_X: { type, members: [], domains: { [domain]: ['Get', 'Put'] } } }
//   pending: [{ group, domain, perms }]   domain policy changes that wait for Activate Pending Security Policy Changes
//   activations: [{ t, comment, n }]
//   rules: { expiryDays, exempt: [] }      Maintain Password Rules
//   locations, jobs: { id: name }          the reference IDs of Location_ID and Job_Profile_ID
//   log: [{ t, user, app, kind, op, ok, rows, ms, msg, detail }]   the integration event log (web service requests)
//   signons: [{ t, user, ok, reason }]     Signons and Attempted Signons
//   n (counter)
//
// ctx.workday (see workdayCtx) takes the connection of the app as cfg: { host, tenant, username, password, timeout, owner }.
//   raas(cfg, report, params)   GET /ccx/service/customreport2/{tenant}/{owner}/{report}?format=json with the prompts as
//                               query parameters. { ok, status, ms, rows, url } or { ok: false, type, status, error, ms }.
//   soap(cfg, op, body)         POST /ccx/service/{tenant}/Human_Resources/v43.0. { ok, ms, ...result } or
//                               { ok: false, type: 'WSC:SOAP_FAULT', error, fault: { code, string, errors }, ms }.

export const WD_HOST = 'wd5-impl-services1.workday.lab'
export const TENANT = 'brightmart1'
export const WWS = 'v43.0'
export const SCREEN_USER = 'kbrand' // Kofi Brand, the integration developer the screen signs in as
export const DAY = 86400000
// the same day 0 as platform.js: Monday 2 November 2026
const BASE = Date.UTC(2026, 10, 2)
// lab-made limits, so a saved console stays small
const MAX_LOG = 60
const MAX_SIGNONS = 40
const MAX_EVENTS = 80

// ---------- dates in the Workday format ----------

const two = (n) => String(n).padStart(2, '0')
export const wdDate = (t) => new Date(BASE + t).toISOString().slice(0, 10)
export const wdTime = (t) => `${new Date(BASE + t).toISOString().slice(0, 19)}.000+00:00`
// reads 2026-11-03, 2026-11-03T09:00:00.000+00:00 or a lab time in ms; NaN when it is not a date
export function parseWd(v) {
  if (typeof v === 'number') return v
  const x = String(v ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}/.test(x)) return NaN
  const t = Date.parse(/T/.test(x) ? x : `${x}T00:00:00Z`)
  return Number.isNaN(t) ? NaN : t - BASE
}
export const shortTime = (t) => {
  const d = new Date(BASE + t)
  return `${wdDate(t)} ${two(d.getUTCHours())}:${two(d.getUTCMinutes())}`
}

// ---------- security: domains and the fields they guard ----------

// Real domain names of Workday HCM. The lab has a subset of them.
export const DOMAINS = {
  PUBLIC: 'Worker Data: Public Worker Reports',
  STAFFING: 'Worker Data: Current Staffing Information',
  CONTACT: 'Person Data: Work Contact Information',
  COMP: 'Worker Data: Compensation',
  PERSONAL: 'Person Data: Personal Data',
}
export const DOMAIN_LIST = Object.values(DOMAINS)
export const GROUP_TYPE = 'Integration System Security Group (Unconstrained)'
// the report fields and the domain that guards each. A field the user cannot see comes back empty, without an error.
export const FIELDS = {
  Employee_ID: DOMAINS.PUBLIC,
  Worker: DOMAINS.PUBLIC,
  Supervisory_Organization: DOMAINS.PUBLIC,
  Last_Functionally_Updated: DOMAINS.PUBLIC,
  Email: DOMAINS.CONTACT,
  Job_Profile: DOMAINS.STAFFING,
  Location: DOMAINS.STAFFING,
  Hire_Date: DOMAINS.STAFFING,
  Annual_Salary: DOMAINS.COMP,
  Date_of_Birth: DOMAINS.PERSONAL,
  Event_ID: DOMAINS.STAFFING,
  Worker_ID: DOMAINS.PUBLIC,
  Business_Process: DOMAINS.STAFFING,
  Effective_Date: DOMAINS.STAFFING,
  Completed_On: DOMAINS.STAFFING,
  Status: DOMAINS.STAFFING,
}
// data sources of custom reports. 'All Active Workers' is a real data source; the event source is lab-made.
export const SOURCES = {
  'All Active Workers': {
    domain: DOMAINS.PUBLIC,
    fields: ['Employee_ID', 'Worker', 'Email', 'Job_Profile', 'Location', 'Supervisory_Organization', 'Hire_Date', 'Last_Functionally_Updated', 'Annual_Salary', 'Date_of_Birth'],
    dates: ['Last_Functionally_Updated', 'Hire_Date'],
  },
  'Worker Business Process Events': {
    domain: DOMAINS.STAFFING,
    fields: ['Event_ID', 'Worker_ID', 'Worker', 'Business_Process', 'Effective_Date', 'Completed_On', 'Status'],
    dates: ['Completed_On', 'Effective_Date'],
  },
}
export const BP_TYPES = ['Hire', 'Terminate', 'Change Job', 'Contact Change']
// SOAP operations of Human_Resources and the domain each needs with which permission
export const OPERATIONS = {
  Get_Workers: [DOMAINS.PUBLIC, 'Get'],
  Change_Job: [DOMAINS.STAFFING, 'Put'],
  Change_Work_Contact_Information: [DOMAINS.CONTACT, 'Put'],
}

// ---------- builders ----------

const w = (name, job, loc, org, hire, upd = hire, extra = {}) => ({ name, job, loc, org, email: `${name.split(' ')[0].toLowerCase()}.${name.split(' ')[1].toLowerCase()}@brightmart.example`, hire, term: null, upd, ...extra })
export function newWorkday(now = 0, extra = {}) {
  const old = now - 400 * DAY
  return {
    created: now,
    tenant: TENANT,
    host: WD_HOST,
    workers: {
      21001: w('Lena Hart', 'JP_HR_ANALYST', 'LOC_BRIGHTMART_HQ', 'Human Resources', old),
      21002: w('Omar Feld', 'JP_STORE_MANAGER', 'LOC_PIER_02', 'Stores', old),
      21003: w('Ruth Okafor', 'JP_WAREHOUSE_LEAD', 'LOC_DOCK_01', 'Warehouse', old),
      21004: w('Tobin Reyes', 'JP_PICKER', 'LOC_DOCK_01', 'Warehouse', old),
      21005: w('Ines Calder', 'JP_BUYER', 'LOC_BRIGHTMART_HQ', 'Purchasing', old),
      21006: w('Pavel Marsh', 'JP_DRIVER', 'LOC_DOCK_01', 'Warehouse', old),
      21008: w('Joan Vey', 'JP_SALES_ASSOCIATE', 'LOC_PIER_01', 'Stores', old),
      21009: w('Kofi Brand', 'JP_INTEGRATION_DEV', 'LOC_BRIGHTMART_HQ', 'Information Technology', old),
      21010: w('Sana Dorr', 'JP_CASHIER', 'LOC_PIER_01', 'Stores', old),
    },
    pop: { n: 2440, hire: old, upd: now - 30 * DAY },
    bulk: [],
    events: [],
    reports: {
      INT_All_Workers: { name: 'INT_All_Workers', owner: 'lhart', source: 'All Active Workers', fields: ['Employee_ID', 'Worker', 'Email', 'Job_Profile', 'Location', 'Supervisory_Organization', 'Last_Functionally_Updated'], prompts: [], ws: true, share: ['ISSG_Brightmart_HCM'] },
      INT_Worker_Events: {
        name: 'INT_Worker_Events',
        owner: 'lhart',
        source: 'Worker Business Process Events',
        fields: ['Event_ID', 'Worker_ID', 'Worker', 'Business_Process', 'Effective_Date', 'Completed_On', 'Status'],
        prompts: [
          { name: 'Entry_From', field: 'Completed_On', op: 'from' },
          { name: 'Entry_To', field: 'Completed_On', op: 'to' },
        ],
        ws: true,
        share: ['ISSG_Brightmart_HCM'],
      },
    },
    isus: { ISU_BRIGHTMART_HCM: { password: 'Hcm-Lab-Pass-0826', set: now - 20 * DAY, requireNew: false, noUi: true, timeout: 0 } },
    groups: {
      ISSG_Brightmart_HCM: {
        type: GROUP_TYPE,
        members: ['ISU_BRIGHTMART_HCM'],
        domains: { [DOMAINS.PUBLIC]: ['Get'], [DOMAINS.STAFFING]: ['Get', 'Put'], [DOMAINS.CONTACT]: ['Get', 'Put'] },
      },
    },
    pending: [],
    activations: [],
    rules: { expiryDays: 90, exempt: ['ISU_BRIGHTMART_HCM'] },
    locations: { LOC_BRIGHTMART_HQ: 'Brightmart HQ', LOC_PIER_01: 'Pier 01 store', LOC_PIER_02: 'Pier 02 store', LOC_DOCK_01: 'Dock 01 warehouse' },
    jobs: { JP_HR_ANALYST: 'HR Analyst', JP_STORE_MANAGER: 'Store Manager', JP_WAREHOUSE_LEAD: 'Warehouse Lead', JP_PICKER: 'Picker', JP_BUYER: 'Buyer', JP_DRIVER: 'Driver', JP_SALES_ASSOCIATE: 'Sales Associate', JP_INTEGRATION_DEV: 'Integration Developer', JP_CASHIER: 'Cashier' },
    log: [],
    signons: [],
    n: 1200,
    ...extra,
  }
}
const SYSTEM_KEYS = Object.keys(newWorkday())

// fills a missing or placeholder state.workday, and any key an older save lacks
export function fillWorkday(y) {
  if (!y) return newWorkday(0)
  if (!y.tenant || SYSTEM_KEYS.some((k) => y[k] === undefined || y[k] === null)) {
    const base = newWorkday(y.created ?? 0)
    for (const k of SYSTEM_KEYS) y[k] ??= base[k]
  }
  return y
}
export const isFilled = (y) => Boolean(y?.tenant)

// ---------- small helpers ----------

const word = (v) => String(v ?? '').trim()
const push = (list, entry, max) => {
  list.push(entry)
  if (list.length > max) list.splice(0, list.length - max)
}
const next = (y) => (y.n = (y.n ?? 1200) + 1)
// WIDs are 32 hex characters in Workday; the lab makes a stable one from the ID
export function widOf(id) {
  let h = 2166136261
  let out = ''
  for (let i = 0; out.length < 32; i++) {
    for (const ch of `${id}:${i}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0
    out += h.toString(16).padStart(8, '0')
  }
  return out.slice(0, 32)
}
export const isActive = (x, t) => x.hire <= t && !(x.term !== null && x.term !== undefined && x.term <= t)
export const statusOf = (x, t) => (x.hire > t ? 'Pre-Hire' : x.term !== null && x.term !== undefined && x.term <= t ? 'Terminated' : 'Active')
export const jobName = (y, id) => y?.jobs?.[id] ?? id
export const locName = (y, id) => y?.locations?.[id] ?? id

// every active worker as of t: the stored ones and the lab population, as compact rows
function workersAt(y, t, { from = -Infinity, to = Infinity } = {}) {
  const out = []
  for (const [id, x] of Object.entries(y.workers)) if (isActive(x, t) && x.upd >= from && x.upd < to) out.push({ id, ...x })
  const p = y.pop
  if (p?.n && p.hire <= t && p.upd >= from && p.upd < to) for (let i = 0; i < p.n; i++) out.push(popWorker(30000 + i, p.hire, p.upd, 'LOC_DOCK_01', 'Warehouse'))
  for (const b of y.bulk ?? []) {
    for (let i = 0; i < b.n; i++) {
      const upd = b.from + Math.floor(((b.to - b.from) * i) / b.n)
      if (upd <= t && upd >= from && upd < to) out.push(popWorker(`${b.prefix}${i}`, upd, upd, b.loc, b.label))
    }
  }
  return out
}
const popWorker = (id, hire, upd, loc, org) => ({ id: String(id), name: `Worker ${id}`, job: 'JP_PICKER', loc, org, email: `w${id}@brightmart.example`, hire, term: null, upd, synthetic: true })
export const activeCount = (y, t) => (isFilled(y) ? workersAt(y, t).length : 0)
// how many active workers changed in [from, to): the rows a delta of Last_Functionally_Updated must bring
export const updatedCount = (y, from, to, t = to) => (isFilled(y) ? workersAt(y, t, { from, to }).length : 0)

export const groupsOf = (y, user) => Object.entries(y.groups ?? {}).filter(([, g]) => g.members.includes(user)).map(([n]) => n)
// the permissions that are active for a user: pending changes do not count until they are activated
export function permsOf(y, user) {
  const out = {}
  for (const g of groupsOf(y, user)) for (const [d, p] of Object.entries(y.groups[g].domains ?? {})) out[d] = [...new Set([...(out[d] ?? []), ...p])]
  return out
}
const can = (y, user, domain, perm) => user === SCREEN_USER || (permsOf(y, user)[domain] ?? []).includes(perm)
export const expiresAt = (y, user) => {
  const u = y.isus?.[user]
  if (!u || !(y.rules?.expiryDays > 0) || (y.rules.exempt ?? []).includes(user)) return null
  return u.set + y.rules.expiryDays * DAY
}
// the connection of an app, from its properties (workday.host, workday.tenant, workday.username, the secure
// workday.password, workday.responseTimeout in ms and raas.owner)
export const wdConfig = (p) => ({ host: p['workday.host'], tenant: p['workday.tenant'], username: p['workday.username'], password: p['workday.password'], timeout: Number(p['workday.responseTimeout']) || 30000, owner: p['raas.owner'] })
export const raasUrl = (rep, host = WD_HOST, tenant = TENANT) => `https://${host}/ccx/service/customreport2/${tenant}/${rep.owner}/${rep.name}?format=json`
export const soapUrl = (host = WD_HOST, tenant = TENANT) => `https://${host}/ccx/service/${tenant}/Human_Resources/${WWS}`
export const wsdlUrl = (rep, host = WD_HOST, tenant = TENANT) => `https://${host}/ccx/service/customreport2/${tenant}/${rep.owner}/${rep.name}?wsdl`

// ---------- business processes ----------

// records a business process event. `eff` is the effective date, `done` the moment it completed.
export function addEvent(y, { type, worker, eff, done, by = 'lhart', text = '' }) {
  const e = { id: `BP-${String(next(y)).padStart(6, '0')}`, type, worker, eff, done, by, status: 'Successfully Completed', text }
  push(y.events, e, MAX_EVENTS)
  const x = y.workers[worker]
  if (x) x.upd = Math.max(x.upd ?? 0, done)
  return e
}
// a hire: the worker exists from the moment it completed; it is active from the effective date
export function hire(y, id, { name, job, loc, org, eff, done, email, by }) {
  y.workers[id] = { ...w(name, job, loc, org, eff, done), ...(email !== undefined && { email }) }
  return addEvent(y, { type: 'Hire', worker: id, eff, done, by, text: `Hire ${name} as ${jobName(y, job)}, ${locName(y, loc)}` })
}
export function terminate(y, id, { eff, done, by, reason = 'Resignation' }) {
  y.workers[id].term = eff
  return addEvent(y, { type: 'Terminate', worker: id, eff, done, by, text: `Terminate ${y.workers[id].name}: ${reason}` })
}

// ---------- sign on ----------

function signon(y, t, user, ok, reason = '') {
  push(y.signons, { t, user, ok, reason, how: 'Web Service' }, MAX_SIGNONS)
}
// Workday answers every failed web service logon the same way; the reason is in Signons and Attempted Signons
function login(y, cfg, t) {
  const raw = word(cfg?.username)
  const [user, tenant] = raw.split('@')
  if (tenant && tenant !== y.tenant) return { ok: false, user, reason: 'Invalid Tenant' }
  const u = y.isus?.[user]
  if (!u || cfg?.password !== u.password) {
    signon(y, t, user || '(empty)', false, 'Invalid Credentials')
    return { ok: false, user }
  }
  const exp = expiresAt(y, user)
  if (exp !== null && t >= exp) {
    signon(y, t, user, false, 'Password Expired')
    return { ok: false, user }
  }
  if (u.requireNew) {
    signon(y, t, user, false, 'Password Change Required')
    return { ok: false, user }
  }
  signon(y, t, user, true)
  return { ok: true, user }
}

// ---------- reports ----------

const valueOf = (y, x, f, kind) => {
  if (kind === 'events') {
    const wk = y.workers[x.worker]
    return { Event_ID: x.id, Worker_ID: x.worker, Worker: wk?.name ?? x.worker, Business_Process: x.type, Effective_Date: wdDate(x.eff), Completed_On: wdTime(x.done), Status: x.status }[f]
  }
  return {
    Employee_ID: x.id,
    Worker: x.name,
    Email: x.email || undefined,
    Job_Profile: jobName(y, x.job),
    Location: locName(y, x.loc),
    Supervisory_Organization: x.org,
    Hire_Date: wdDate(x.hire),
    Last_Functionally_Updated: wdTime(x.upd),
    Annual_Salary: 41000 + (Number(String(x.id).replace(/\D/g, '')) % 50) * 500,
    Date_of_Birth: `19${70 + (Number(String(x.id).replace(/\D/g, '')) % 30)}-0${1 + (Number(String(x.id).replace(/\D/g, '')) % 9)}-14`,
  }[f]
}
const DATE_KEY = { Completed_On: 'done', Effective_Date: 'eff', Last_Functionally_Updated: 'upd', Hire_Date: 'hire' }

// Runs a report as `user` at time t. Prompts that are not given do not filter. From is inclusive and To exclusive in
// the lab. For the event source, a Completed_On range and an Effective_Date range together match an event in either
// one (lab-made: the report filter has the two ranges joined with OR).
export function runReport(y, rep, params, t, user) {
  const src = SOURCES[rep.source]
  const ranges = {}
  for (const p of rep.prompts) {
    const v = params?.[p.name]
    if (v === undefined || v === '') continue
    const at = parseWd(v)
    if (Number.isNaN(at)) return { error: `Processing error occurred. The value '${v}' of prompt ${p.name} is not a valid date.`, status: 400 } // lab-made wording
    ranges[p.field] = { ...(ranges[p.field] ?? { from: -Infinity, to: Infinity }), [p.op]: at }
  }
  const inRange = (x, f) => !ranges[f] || (x[DATE_KEY[f]] >= ranges[f].from && x[DATE_KEY[f]] < ranges[f].to)
  let list
  if (src.dates[0] === 'Completed_On') {
    const keys = Object.keys(ranges)
    list = y.events.filter((e) => e.status === 'Successfully Completed' && e.done <= t && (keys.length === 0 || keys.some((f) => inRange(e, f))))
  } else {
    const r = ranges.Last_Functionally_Updated
    list = workersAt(y, t, r ? { from: r.from, to: r.to } : {}).filter((x) => inRange(x, 'Hire_Date'))
  }
  const kind = src.dates[0] === 'Completed_On' ? 'events' : 'workers'
  const seen = rep.fields.filter((f) => can(y, user, FIELDS[f], 'Get'))
  const rows = list.map((x) => {
    const row = {}
    for (const f of seen) {
      const v = valueOf(y, x, f, kind)
      if (v !== undefined && v !== '') row[f] = v
    }
    return row
  })
  // lab-made cost: about 2.5 ms per field and row, plus the start of the report
  return { rows, ms: 400 + Math.round(rows.length * rep.fields.length * 2.5), hidden: rep.fields.filter((f) => !seen.includes(f)) }
}

// ---------- the integration event log ----------

const record = (y, e) => push(y.log, e, MAX_LOG)

// ---------- the ctx hook ----------

const fail = (type, error, ms = 40, extra = {}) => ({ ok: false, type, error, ms, ...extra })
const fault = (code, string, errors = [], ms = 120) => fail('WSC:SOAP_FAULT', string, ms, { fault: { code, string, errors } })
const validation = (message, xpath, detail = message) => fault('SOAP-ENV:Client.validationError', `Validation error occurred. ${message}`, [{ message, detail, xpath }])
const XP = '/bsvc:Change_Job_Request[1]/bsvc:Change_Job_Data[1]'
const idOk = (y, type, id) => (type === 'Location_ID' ? Boolean(y.locations[id]) : type === 'Job_Profile_ID' ? Boolean(y.jobs[id]) : type === 'Employee_ID' ? Boolean(y.workers[id]) : type === 'WID' ? [...Object.keys(y.locations), ...Object.keys(y.jobs), ...Object.keys(y.workers)].some((k) => widOf(k) === id) : false)
const byWid = (y, id) => [...Object.keys(y.locations), ...Object.keys(y.jobs)].find((k) => widOf(k) === id)
const refOk = (y, ref, want) => {
  const type = word(ref?.type)
  const id = word(ref?.id)
  if (!idOk(y, type, id)) return { error: `Invalid ID value. '${id}' is not a valid ID value for type = '${type}'` }
  const key = type === 'WID' ? byWid(y, id) : id
  if (!key || !(want === 'loc' ? y.locations[key] : y.jobs[key])) return { error: `Invalid ID value. '${id}' is not a valid ID value for type = '${type}'` }
  return { key }
}

// The engine calls this for each run of an app with its draft state: the calls change `s` in place.
export function workdayCtx(s, app) {
  const who = app?.name ?? 'app'
  const sys = () => (s.workday = fillWorkday(s.workday))
  const now = () => s.clock ?? 0
  const where = (cfg) => {
    const host = word(cfg?.host).toLowerCase()
    const tenant = word(cfg?.tenant)
    return { host, tenant }
  }
  return {
    raas(cfg, name, params = {}) {
      const y = sys()
      const t = now()
      const { host, tenant } = where(cfg)
      const owner = word(cfg?.owner)
      const rname = word(name)
      const url = `https://${host || '(empty)'}/ccx/service/customreport2/${tenant}/${owner}/${rname}?format=json`
      const timeout = Number(cfg?.timeout) > 0 ? Number(cfg.timeout) : 30000
      const http = (status, type, text, ms = 200) => fail(type, `HTTP GET on resource '${url}' failed: ${text} (${status}).`, ms, { status, url })
      if (host !== y.host) return fail('HTTP:CONNECTIVITY', `HTTP GET on resource '${url}' failed: Couldn't resolve host ${host || '(empty)'}.`, 2000, { url })
      if (tenant !== y.tenant) return http(404, 'HTTP:NOT_FOUND', 'not found') // lab-made: an unknown tenant answers 404
      const l = login(y, cfg, t)
      const entry = { t, user: l.user || '(empty)', app: who, kind: 'RaaS', op: rname }
      if (!l.ok) {
        record(y, { ...entry, ok: false, msg: 'Authentication failed', ms: 90 })
        return http(401, 'HTTP:UNAUTHORIZED', 'unauthorized', 90)
      }
      const rep = y.reports[rname]
      if (!rep || rep.owner !== owner || !rep.ws) {
        record(y, { ...entry, ok: false, msg: !rep || rep.owner !== owner ? `No report ${rname} of owner ${owner}` : `Report ${rname} is not enabled as a web service`, ms: 60 }) // lab-made wording
        return http(404, 'HTTP:NOT_FOUND', 'not found', 60)
      }
      const shared = rep.owner === l.user || rep.share.some((g) => y.groups[g]?.members.includes(l.user))
      if (!shared || !can(y, l.user, SOURCES[rep.source].domain, 'Get')) {
        record(y, { ...entry, ok: false, msg: 'The task submitted is not authorized.', detail: shared ? `No Get on ${SOURCES[rep.source].domain}` : `The report is not shared with a group of ${l.user}`, ms: 80 })
        return http(403, 'HTTP:FORBIDDEN', 'forbidden', 80) // lab-made status; the message is the one Workday gives
      }
      const unknown = Object.keys(params ?? {}).filter((k) => k !== 'format' && !rep.prompts.some((p) => p.name === k))
      if (unknown.length) {
        record(y, { ...entry, ok: false, msg: `Processing error occurred. ${unknown[0]} is not a prompt of report ${rname}.`, ms: 50 }) // lab-made wording
        return http(400, 'HTTP:BAD_REQUEST', 'bad request', 50)
      }
      const r = runReport(y, rep, params, t, l.user)
      if (r.error) {
        record(y, { ...entry, ok: false, msg: r.error, ms: 50 })
        return http(r.status, 'HTTP:BAD_REQUEST', 'bad request', 50)
      }
      const late = r.ms > timeout
      const range = Object.entries(params ?? {}).filter(([k]) => k !== 'format').map(([k, v]) => `${k}=${v}`).join(' ')
      record(y, { ...entry, ok: true, rows: r.rows.length, ms: r.ms, msg: late ? `Completed. The caller closed the connection after ${Math.round(timeout / 1000)} s` : 'Completed', detail: [range, r.hidden.length ? `Empty for this user: ${r.hidden.join(', ')}` : ''].filter(Boolean).join('. ') })
      if (late) return fail('HTTP:TIMEOUT', `HTTP GET on resource '${url}' failed: Timeout exceeded.`, timeout, { url })
      return { ok: true, status: 200, ms: r.ms, rows: r.rows, url }
    },
    soap(cfg, op, body = {}) {
      const y = sys()
      const t = now()
      const { host, tenant } = where(cfg)
      if (host !== y.host) return fail('WSC:CONNECTIVITY', `Couldn't resolve host ${host || '(empty)'}`, 2000)
      if (tenant !== y.tenant) return fail('WSC:BAD_RESPONSE', 'The response is not a SOAP message: 404 Not Found', 200) // lab-made wording
      const l = login(y, cfg, t)
      const entry = { t, user: l.user || '(empty)', app: who, kind: 'SOAP', op }
      const out = (r) => {
        record(y, { ...entry, ok: r.ok, ms: r.ms, rows: r.rows, msg: r.ok ? 'Completed' : `${r.fault?.code ?? ''} ${r.error}`.trim(), detail: r.ok ? r.detail : r.fault?.errors?.map((e) => `${e.detail} Xpath ${e.xpath}`).join(' | ') })
        return r
      }
      if (!l.ok) return out(fault('SOAP-ENV:Client.authenticationError', 'invalid username or password', [], 90))
      const need = OPERATIONS[op]
      if (!need) return out(fault('SOAP-ENV:Client', `Unknown operation ${op}`, [], 40)) // lab-made wording
      if (!can(y, l.user, need[0], need[1])) return out(fault('SOAP-ENV:Client', 'The task submitted is not authorized.', [{ message: 'The task submitted is not authorized.', detail: `No ${need[1]} on ${need[0]}`, xpath: '' }], 80))
      if (op === 'Get_Workers') {
        const count = body.count === undefined ? 100 : Number(body.count)
        const page = body.page === undefined ? 1 : Number(body.page)
        if (!(count >= 1 && count <= 999)) return out(validation(`Count must be between 1 and 999.`, '/bsvc:Get_Workers_Request[1]/bsvc:Response_Filter[1]/bsvc:Count[1]')) // lab-made wording of the schema limit
        let all = workersAt(y, t)
        if (body.ids?.length) {
          const bad = body.ids.find((i) => !y.workers[i])
          if (bad) return out(validation(`Invalid ID value. '${bad}' is not a valid ID value for type = 'Employee_ID'`, '/bsvc:Get_Workers_Request[1]/bsvc:Request_References[1]/bsvc:Worker_Reference[1]'))
          all = body.ids.map((i) => ({ id: i, ...y.workers[i] }))
        }
        const pages = Math.max(1, Math.ceil(all.length / count))
        const list = all.slice((page - 1) * count, page * count)
        const contact = can(y, l.user, DOMAINS.CONTACT, 'Get')
        const staffing = can(y, l.user, DOMAINS.STAFFING, 'Get')
        const workers = list.map((x) => ({ Employee_ID: x.id, Worker: x.name, Status: statusOf(x, t), ...(contact && x.email && { Email: x.email }), ...(staffing && { Location_ID: x.loc, Job_Profile_ID: x.job }) }))
        return out({ ok: true, ms: 200 + list.length * 6, rows: list.length, workers, results: { Total_Results: all.length, Total_Pages: pages, Page_Results: list.length, Page: page }, detail: `Page ${page} of ${pages}, ${list.length} of ${all.length}` })
      }
      if (op === 'Change_Work_Contact_Information') {
        const x = y.workers[body.worker]
        if (!x) return out(validation(`Invalid ID value. '${body.worker}' is not a valid ID value for type = 'Employee_ID'`, '/bsvc:Change_Work_Contact_Information_Request[1]/bsvc:Change_Work_Contact_Information_Data[1]/bsvc:Person_Reference[1]'))
        if (!/^[^@\s]+@[^@\s]+\.[a-z]+$/i.test(word(body.email))) return out(validation('Email Address is not valid.', '/bsvc:Change_Work_Contact_Information_Request[1]/bsvc:Change_Work_Contact_Information_Data[1]/bsvc:Person_Contact_Information_Data[1]/bsvc:Person_Email_Information_Data[1]')) // lab-made wording
        x.email = word(body.email)
        addEvent(y, { type: 'Contact Change', worker: body.worker, eff: t, done: t, by: l.user, text: `Work email ${x.email}` })
        return out({ ok: true, ms: 260, rows: 1, detail: `Worker ${body.worker}` })
      }
      // Change_Job
      const x = y.workers[body.worker]
      if (!x) return out(validation(`Invalid ID value. '${body.worker}' is not a valid ID value for type = 'Employee_ID'`, `${XP}/bsvc:Worker_Reference[1]`))
      const eff = parseWd(body.effective)
      if (Number.isNaN(eff)) return out(validation(`Element content '${body.effective ?? ''}' is not valid for type 'date'.`, `${XP}/bsvc:Effective_Date[1]`)) // lab-made wording
      if (body.location) {
        const r = refOk(y, body.location, 'loc')
        if (r.error) return out(validation(r.error, `${XP}/bsvc:Change_Job_Detail_Data[1]/bsvc:Location_Reference[1]/bsvc:ID[1]`))
      }
      if (body.job) {
        const r = refOk(y, body.job, 'job')
        if (r.error) return out(validation(r.error, `${XP}/bsvc:Change_Job_Detail_Data[1]/bsvc:Job_Profile_Reference[1]/bsvc:ID[1]`))
      }
      if (eff < x.hire) return out(validation(`The effective date ${wdDate(eff)} is before the hire date ${wdDate(x.hire)} of ${x.name}.`, `${XP}/bsvc:Effective_Date[1]`)) // lab-made wording
      if (x.term !== null && x.term <= eff) return out(validation(`${x.name} is not active as of ${wdDate(eff)}.`, `${XP}/bsvc:Worker_Reference[1]`)) // lab-made wording
      if (!body.reason) return out(validation("Element content '' is required, on 'Reason_Reference'.", `${XP}/bsvc:Change_Job_Detail_Data[1]/bsvc:Reason_Reference[1]`)) // lab-made wording
      const loc = body.location ? refOk(y, body.location, 'loc').key : x.loc
      const job = body.job ? refOk(y, body.job, 'job').key : x.job
      // lab-made: the worker shows the new job at once, also when the effective date is later
      Object.assign(x, { loc, job })
      addEvent(y, { type: 'Change Job', worker: body.worker, eff, done: t, by: l.user, text: `${jobName(y, job)}, ${locName(y, loc)}` })
      return out({ ok: true, ms: 340, rows: 1, detail: `Worker ${body.worker} to ${loc}` })
    },
  }
}

// runs once a lab minute while state.workday exists. Statuses come from the effective dates, so time alone moves a
// future dated hire to Active; nothing else runs on its own.
export const workdayTick = (s) => s

// ---------- screen actions (pure: state in, new state out) ----------

const edit = (state, fn) => {
  const s = structuredClone(state)
  s.workday = fillWorkday(s.workday)
  const result = fn(s, s.workday, s.clock ?? 0)
  return { state: s, result }
}
export const upgradeWorkday = (state) => (isFilled(state?.workday) ? state : edit(state, () => null).state)

const ISU_NAME = /^[A-Za-z][A-Za-z0-9_]{2,59}$/
// Create Integration System User
export const createIsu = (state, { user, password, requireNew = false, noUi = true, timeout = 0 }) =>
  edit(state, (s, y, t) => {
    const n = word(user)
    if (!ISU_NAME.test(n)) return { ok: false, text: 'Enter a user name of letters, digits and _' }
    if (y.isus[n] || n === SCREEN_USER) return { ok: false, text: `User Name ${n} is already in use.` }
    if (String(password ?? '').length < 8) return { ok: false, text: 'The password does not meet the password rules: at least 8 characters.' } // lab-made: the minimum of the Brightmart tenant
    y.isus[n] = { password: String(password), set: t, requireNew: Boolean(requireNew), noUi: Boolean(noUi), timeout: Math.max(0, Number(timeout) || 0) }
    return { ok: true, text: `Integration System User ${n} created.` }
  })
// Edit Integration System User: a new password, and the options
export const editIsu = (state, user, { password, requireNew, noUi, timeout }) =>
  edit(state, (s, y, t) => {
    const u = y.isus[user]
    if (!u) return { ok: false, text: `No user ${user}` }
    if (password !== undefined && password !== '') {
      if (String(password).length < 8) return { ok: false, text: 'The password does not meet the password rules: at least 8 characters.' }
      u.password = String(password)
      u.set = t
    }
    if (requireNew !== undefined) u.requireNew = Boolean(requireNew)
    if (noUi !== undefined) u.noUi = Boolean(noUi)
    if (timeout !== undefined) u.timeout = Math.max(0, Number(timeout) || 0)
    return { ok: true, text: `Integration System User ${user} saved.` }
  })
// Maintain Password Rules
export const setPasswordRules = (state, { expiryDays, exempt }) =>
  edit(state, (s, y) => {
    if (expiryDays !== undefined) y.rules.expiryDays = Math.max(0, Number(expiryDays) || 0)
    if (exempt !== undefined) y.rules.exempt = exempt.filter((u) => y.isus[u])
    return { ok: true, text: 'Password rules saved.' }
  })
// Create Security Group
export const createGroup = (state, { name, members = [] }) =>
  edit(state, (s, y) => {
    const n = word(name)
    if (!/^[A-Za-z][A-Za-z0-9_ ]{2,59}$/.test(n)) return { ok: false, text: 'Enter a group name of letters, digits, spaces and _' }
    if (y.groups[n]) return { ok: false, text: `Security group ${n} already exists.` }
    y.groups[n] = { type: GROUP_TYPE, members: members.filter((u) => y.isus[u]), domains: {} }
    return { ok: true, text: `Security group ${n} created.` }
  })
// Edit Security Group: the integration system users in it. Membership counts at once.
export const setMembers = (state, group, members) =>
  edit(state, (s, y) => {
    const g = y.groups[group]
    if (!g) return { ok: false, text: `No group ${group}` }
    g.members = members.filter((u) => y.isus[u])
    return { ok: true, text: `Members of ${group} saved.` }
  })
// Maintain Permissions for Security Group: a change of a domain security policy waits until it is activated
export const setPermissions = (state, group, domain, perms) =>
  edit(state, (s, y) => {
    if (!y.groups[group] || !DOMAIN_LIST.includes(domain)) return { ok: false, text: 'Pick a group and a domain' }
    const p = ['Get', 'Put'].filter((x) => perms.includes(x))
    // Put on a domain implies Get in the lab, the way Modify implies View
    const want = p.includes('Put') ? ['Get', 'Put'] : p
    y.pending = y.pending.filter((x) => !(x.group === group && x.domain === domain))
    const now = y.groups[group].domains[domain] ?? []
    if (now.join() !== want.join()) y.pending.push({ group, domain, perms: want })
    return { ok: true, text: 'Saved. Activate Pending Security Policy Changes to make it work.' }
  })
// Activate Pending Security Policy Changes
export const activatePending = (state, comment) =>
  edit(state, (s, y, t) => {
    if (!word(comment)) return { ok: false, text: 'Enter a comment.' }
    if (!y.pending.length) return { ok: false, text: 'There are no pending security policy changes.' }
    for (const c of y.pending) {
      const g = y.groups[c.group]
      if (!g) continue
      if (c.perms.length) g.domains[c.domain] = c.perms
      else delete g.domains[c.domain]
    }
    const n = y.pending.length
    y.pending = []
    y.activations.push({ t, comment: word(comment), n })
    if (y.activations.length > 10) y.activations.shift()
    return { ok: true, text: `${n} change${n === 1 ? '' : 's'} activated.` }
  })

const REPORT_NAME = /^[A-Za-z][A-Za-z0-9_]{2,59}$/
// Create Custom Report: the owner is the user who creates it, and it is part of the RaaS URL
export const createReport = (state, { name, source }) =>
  edit(state, (s, y) => {
    const n = word(name)
    if (!REPORT_NAME.test(n)) return { ok: false, text: 'A report name for a web service has letters, digits and _ only.' }
    if (y.reports[n]) return { ok: false, text: `Report ${n} already exists.` }
    if (!SOURCES[source]) return { ok: false, text: 'Pick a data source.' }
    y.reports[n] = { name: n, owner: SCREEN_USER, source, fields: [], prompts: [], ws: false, share: [] }
    return { ok: true, text: `Report ${n} created.` }
  })
// Edit Custom Report: fields, Enable As Web Service, sharing
export const editReport = (state, name, { fields, ws, share }) =>
  edit(state, (s, y) => {
    const r = y.reports[name]
    if (!r) return { ok: false, text: `No report ${name}` }
    if (fields !== undefined) r.fields = SOURCES[r.source].fields.filter((f) => fields.includes(f))
    if (ws !== undefined) r.ws = Boolean(ws)
    if (share !== undefined) r.share = share.filter((g) => y.groups[g])
    return { ok: true, text: `Report ${name} saved.` }
  })
// Prompts tab: a prompt on a date field of the data source, as the lower (from) or upper (to) bound
export const addPrompt = (state, report, { name, field, op }) =>
  edit(state, (s, y) => {
    const r = y.reports[report]
    const n = word(name)
    if (!r) return { ok: false, text: `No report ${report}` }
    if (!/^[A-Za-z][A-Za-z0-9_]{1,40}$/.test(n)) return { ok: false, text: 'A prompt name has letters, digits and _ only.' }
    if (r.prompts.some((p) => p.name === n)) return { ok: false, text: `Prompt ${n} already exists.` }
    if (!SOURCES[r.source].dates.includes(field)) return { ok: false, text: `Pick a date field of ${r.source}.` }
    if (r.prompts.some((p) => p.field === field && p.op === op)) return { ok: false, text: `${field} already has a ${op === 'from' ? 'From' : 'To'} prompt.` }
    r.prompts.push({ name: n, field, op: op === 'to' ? 'to' : 'from' })
    return { ok: true, text: `Prompt ${n} added.` }
  })
export const removePrompt = (state, report, name) =>
  edit(state, (s, y) => {
    const r = y.reports[report]
    if (r) r.prompts = r.prompts.filter((p) => p.name !== name)
    return { ok: Boolean(r), text: `Prompt ${name} removed.` }
  })
// Run the report in the screen, as the signed in user, who sees every field
export const testReport = (state, name, params) =>
  edit(state, (s, y, t) => {
    const r = y.reports[name]
    if (!r) return { ok: false, text: `No report ${name}` }
    const out = runReport(y, r, params, t, SCREEN_USER)
    return out.error ? { ok: false, text: out.error } : { ok: true, rows: out.rows.slice(0, 15), total: out.rows.length, ms: out.ms }
  })
// Change Contact Information on the worker profile, as the signed in user
export const changeEmail = (state, worker, email) =>
  edit(state, (s, y, t) => {
    const x = y.workers[worker]
    if (!x) return { ok: false, text: `No worker ${worker}` }
    const e = word(email)
    if (e && !/^[^@\s]+@[^@\s]+\.[a-z]+$/i.test(e)) return { ok: false, text: 'Email Address is not valid.' }
    x.email = e
    addEvent(y, { type: 'Contact Change', worker, eff: t, done: t, by: SCREEN_USER, text: e ? `Work email ${e}` : 'Work email removed' })
    return { ok: true, text: `Contact Change for ${x.name} completed.` }
  })

// Hire Employee, as an HR partner enters it on the screen. The next free Employee ID is given, the worker is active from
// the hire date, and Last Functionally Updated is the moment the hire completed. Lab-made: no approval step, so the
// business process completes at once; no position or pay data.
export function nextEmployeeId(y) {
  const ids = Object.keys(y?.workers ?? {}).map(Number).filter((n) => n >= 21000 && n < 30000)
  return String(Math.max(21000, ...ids) + 1)
}
export const hireWorker = (state, { first, last, job, loc, email = '', hireDate }) =>
  edit(state, (s, y, t) => {
    const f = word(first)
    const l = word(last)
    if (!/^[A-Za-z][A-Za-z' -]{0,39}$/.test(f) || !/^[A-Za-z][A-Za-z' -]{0,39}$/.test(l)) return { ok: false, text: 'Enter the legal first and last name.' }
    if (!y.jobs[job]) return { ok: false, text: 'Pick a job profile.' }
    if (!y.locations[loc]) return { ok: false, text: 'Pick a location.' }
    const e = word(email)
    if (e && !/^[^@\s]+@[^@\s]+\.[a-z]+$/i.test(e)) return { ok: false, text: 'Email Address is not valid.' }
    const eff = word(hireDate) ? parseWd(word(hireDate)) : t - (t % DAY)
    if (Number.isNaN(eff)) return { ok: false, text: 'Enter the hire date as 2026-11-03.' }
    const id = nextEmployeeId(y)
    hire(y, id, { name: `${f} ${l}`, job, loc, org: y.workers[Object.keys(y.workers).find((k) => y.workers[k].loc === loc)]?.org ?? 'Stores', eff, done: t, email: e, by: SCREEN_USER })
    return { ok: true, id, text: `Hire Employee for ${f} ${l} completed. Employee ID ${id}.` }
  })

// the placeholder the open console seeds: tiny; fillWorkday builds the system on first use
export const defaultWorkday = (now) => ({ created: now })
