// ServiceNow: incidents, the Table API, integration users and ACLs, rate limit rules. Pure and import free. Lives in state.servicenow.
// One instance, harbor.service-now.lab, with the tables incident, sys_user, sys_user_group and cmdb_ci, the history in
// sys_audit, the REST transactions and the system log. Apps reach it through ctx.servicenow.table(cfg, method, table,
// params, body), the way a Mule app calls the Table API with the HTTP Request operation. Screens call the pure actions
// at the end of this file. The open console holds a { created } placeholder that is filled on first use.
export const INSTANCE = 'harbor.service-now.lab'
export const INSTANCE_URL = `https://${INSTANCE}`
export const ADMIN_USER = 'harbor.admin'
export const REST_ROLE = 'snc_platform_rest_api_access'
const MINUTE = 60000
const HOUR = 60 * MINUTE
const BASE = Date.UTC(2026, 10, 2) // the lab clock starts on Monday 2 November 2026, as in platform.js
const MAX_TX = 60
const MAX_LOG = 40
const MAX_AUDIT = 120
const MAX_INCIDENTS = 400

// ---------- the data model ----------

export const CHOICES = {
  state: { 1: 'New', 2: 'In Progress', 3: 'On Hold', 6: 'Resolved', 7: 'Closed', 8: 'Canceled' },
  impact: { 1: '1 High', 2: '2 Medium', 3: '3 Low' },
  urgency: { 1: '1 High', 2: '2 Medium', 3: '3 Low' },
  priority: { 1: '1 Critical', 2: '2 High', 3: '3 Moderate', 4: '4 Low', 5: '5 Planning' },
  category: { inquiry: 'Inquiry / Help', software: 'Software', hardware: 'Hardware', network: 'Network', database: 'Database' },
  close_code: { 'Solution provided': 'Solution provided', 'Workaround provided': 'Workaround provided', Duplicate: 'Duplicate', 'Resolved by caller': 'Resolved by caller', 'No resolution provided': 'No resolution provided' },
  operational_status: { 1: 'Operational', 2: 'Non-Operational', 6: 'Retired' },
}
const SYS = ['sys_id', 'sys_created_on', 'sys_created_by', 'sys_updated_on', 'sys_updated_by', 'sys_mod_count']
// type of each field: s string, c choice, r:<table> reference, b boolean, d date time, i integer, j journal, l role list (lab-made)
export const SCHEMA = {
  incident: {
    label: 'Incidents',
    display: 'number',
    list: ['number', 'opened_at', 'short_description', 'caller_id', 'priority', 'state', 'assignment_group', 'correlation_id', 'sys_updated_on'],
    fields: {
      number: 's', opened_at: 'd', short_description: 's', description: 's', caller_id: 'r:sys_user', category: 'c', impact: 'c', urgency: 'c', priority: 'c', state: 'c',
      assignment_group: 'r:sys_user_group', assigned_to: 'r:sys_user', cmdb_ci: 'r:cmdb_ci', correlation_id: 's', correlation_display: 's', close_code: 'c', close_notes: 's', work_notes: 'j',
      sys_id: 's', sys_created_on: 'd', sys_created_by: 's', sys_updated_on: 'd', sys_updated_by: 's', sys_mod_count: 'i',
    },
  },
  sys_user: {
    label: 'Users',
    display: 'name',
    list: ['user_name', 'name', 'email', 'active', 'web_service_access_only', 'locked_out', 'roles'],
    fields: { user_name: 's', first_name: 's', last_name: 's', name: 's', email: 's', active: 'b', web_service_access_only: 'b', internal_integration_user: 'b', locked_out: 'b', roles: 'l', sys_id: 's', sys_created_on: 'd', sys_created_by: 's', sys_updated_on: 'd', sys_updated_by: 's', sys_mod_count: 'i' },
  },
  sys_user_group: {
    label: 'Groups',
    display: 'name',
    list: ['name', 'description', 'email'],
    fields: { name: 's', description: 's', email: 's', sys_id: 's', sys_created_on: 'd', sys_created_by: 's', sys_updated_on: 'd', sys_updated_by: 's', sys_mod_count: 'i' },
  },
  cmdb_ci: {
    label: 'Configuration Items',
    display: 'name',
    list: ['name', 'sys_class_name', 'support_group', 'operational_status', 'location'],
    fields: { name: 's', sys_class_name: 's', support_group: 'r:sys_user_group', operational_status: 'c', location: 's', sys_id: 's', sys_created_on: 'd', sys_created_by: 's', sys_updated_on: 'd', sys_updated_by: 's', sys_mod_count: 'i' },
  },
}
export const TABLES = Object.keys(SCHEMA)
export const typeOf = (table, field) => SCHEMA[table]?.fields[field]
export const refTable = (table, field) => (String(typeOf(table, field) ?? '').startsWith('r:') ? typeOf(table, field).slice(2) : null)

// The roles of the lab. The names are real ServiceNow roles; admin passes every ACL.
export const ROLES = {
  admin: 'System administrator. Passes every ACL.',
  security_admin: 'Elevated role to change ACLs.',
  itil: 'Fulfiller: works incidents, problems and changes. Needs a fulfiller license.',
  sn_incident_read: 'Read incidents.',
  sn_incident_write: 'Create and update incidents.',
  cmdb_read: 'Read the CMDB.',
  [REST_ROLE]: 'Call the REST APIs of the instance.',
  rest_api_explorer: 'Use the REST API Explorer.',
  import_set_loader: 'Load data into import set tables.',
  import_transformer: 'Run transform maps.',
  user_admin: 'Manage users and groups.',
}
export const WIDE_ROLES = ['admin', 'security_admin', 'itil', 'user_admin']
export const GROUP_NAMES = ['Service Desk', 'Store Systems', 'Warehouse Systems', 'Network', 'Database', 'Integration Support']

// ---------- time and ids ----------

const pad = (n, w = 2) => String(n).padStart(w, '0')
export const dt = (t) => {
  const d = new Date(BASE + (t ?? 0))
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
}
export const epochOf = (t) => Math.floor((BASE + t) / 1000)
const hexOf = (seed) => {
  let h = 2166136261
  let out = ''
  for (let i = 0; out.length < 32; i++) {
    for (const ch of `${seed}:${i}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0
    out += h.toString(16).padStart(8, '0')
  }
  return out.slice(0, 32)
}
const newId = (y) => hexOf(`sn${(y.n.id = (y.n.id ?? 0) + 1)}`)
const push = (list, entry, max) => {
  list.push(entry)
  if (list.length > max) list.splice(0, list.length - max)
}
const word = (v) => String(v ?? '').trim()
const same = (a, b) => word(a).toLowerCase() === word(b).toLowerCase()

// ---------- the instance ----------

const stampRec = (y, rec, now, by) => Object.assign(rec, { sys_id: rec.sys_id ?? newId(y), sys_created_on: dt(now), sys_created_by: by, sys_updated_on: dt(now), sys_updated_by: by, sys_mod_count: 0 })
export function newServicenow(now = 0, extra = {}) {
  const y = { created: now, instance: INSTANCE, n: { id: 0, inc: 10000, iset: 10000 }, tables: { incident: [], sys_user: [], sys_user_group: [], cmdb_ci: [] }, acls: [], rateRules: [], oauth: [], transforms: [], audit: [], tx: [], syslog: [], rate: {}, churn: false }
  for (const name of GROUP_NAMES) y.tables.sys_user_group.push(stampRec(y, { name, description: `${name} of Harbor`, email: `${name.toLowerCase().replace(/ /g, '-')}@harbor.example` }, now, 'system'))
  const user = (user_name, first_name, last_name, roles, pw) => y.tables.sys_user.push(stampRec(y, { user_name, first_name, last_name, name: `${first_name} ${last_name}`, email: `${user_name}@harbor.example`, active: true, web_service_access_only: false, internal_integration_user: false, locked_out: false, roles, pw }, now, 'system'))
  user(ADMIN_USER, 'Harbor', 'Admin', ['admin'], 'Admin-Harbor-2611')
  user('beth.okafor', 'Beth', 'Okafor', ['itil'], 'Beth-Harbor-2611')
  user('sam.reyes', 'Sam', 'Reyes', ['itil'], 'Sam-Harbor-2611')
  const g = (name) => groupId(y, name)
  for (const [name, cls, group, location] of [
    ['WMS-DB-01', 'cmdb_ci_db_mssql_instance', 'Database', 'Harbor DC Dublin'],
    ['WMS-APP-01', 'cmdb_ci_app_server', 'Warehouse Systems', 'Harbor DC Dublin'],
    ['STORE-0042-POS', 'cmdb_ci_computer', 'Store Systems', 'Store 0042 Galway'],
    ['EDGE-RTR-07', 'cmdb_ci_ip_router', 'Network', 'Harbor DC Dublin'],
    ['HARBOR-MULE-SBX', 'cmdb_ci_app_server', 'Integration Support', 'CloudHub 2.0'],
  ])
    y.tables.cmdb_ci.push(stampRec(y, { name, sys_class_name: cls, support_group: g(group), operational_status: '1', location }, now, 'system'))
  const acl = (name, operation, roles, description) => y.acls.push({ sys_id: newId(y), type: 'record', name, operation, roles, active: true, description })
  acl('incident', 'read', ['itil', 'sn_incident_read', 'sn_incident_write'], 'Fulfillers and incident roles read incidents')
  acl('incident', 'create', ['itil', 'sn_incident_write'], 'Fulfillers and incident writers create incidents')
  acl('incident', 'write', ['itil', 'sn_incident_write'], 'Fulfillers and incident writers update incidents')
  acl('incident', 'delete', ['admin'], 'Only admins delete incidents')
  acl('incident.close_notes', 'write', ['itil', 'sn_incident_write'], 'Close notes need an incident role')
  acl('cmdb_ci', 'read', ['itil', 'cmdb_read'], 'Fulfillers and CMDB readers read CIs')
  acl('cmdb_ci', 'write', ['admin'], 'Only admins change CIs')
  acl('sys_user', 'read', ['itil', 'user_admin'], 'Fulfillers see users')
  acl('sys_user', 'write', ['user_admin'], 'User admins change users')
  acl('sys_user_group', 'read', ['itil', 'user_admin', 'sn_incident_write'], 'Groups are read by fulfillers and incident writers')
  y.transforms.push({ sys_id: newId(y), name: 'Harbor alert to incident', source: 'u_harbor_alert_import', target: 'incident', active: true, fields: [{ source: 'u_alert_key', target: 'correlation_id', coalesce: false }, { source: 'u_summary', target: 'short_description', coalesce: false }, { source: 'u_ci', target: 'cmdb_ci', coalesce: false }, { source: 'u_group', target: 'assignment_group', coalesce: false }, { source: 'u_impact', target: 'impact', coalesce: false }] })
  return Object.assign(y, extra)
}
export const isFilled = (y) => Boolean(y?.instance)
// fills a missing or placeholder state.servicenow, and any key an older save lacks
export function fillServicenow(y) {
  if (!y) return newServicenow(0)
  if (!y.instance) {
    const base = newServicenow(y.created ?? 0)
    for (const k of Object.keys(base)) y[k] ??= base[k]
  }
  return y
}

export const rowsOf = (y, table) => (table === 'sys_audit' ? (y?.audit ?? []) : (y?.tables?.[table] ?? []))
export const recordOf = (y, table, id) => rowsOf(y, table).find((r) => r.sys_id === id)
export const userOf = (y, name) => rowsOf(y, 'sys_user').find((u) => same(u.user_name, name))
export const groupId = (y, name) => rowsOf(y, 'sys_user_group').find((g) => same(g.name, name))?.sys_id ?? ''
export const ciId = (y, name) => rowsOf(y, 'cmdb_ci').find((c) => same(c.name, name))?.sys_id ?? ''
// the display value of a field: the name of a referenced record, the label of a choice
export function displayOf(y, table, field, value) {
  const t = typeOf(table, field)
  if (value === undefined || value === null || value === '') return ''
  if (t === 'b') return value ? 'true' : 'false'
  if (t === 'l') return (value ?? []).join(',')
  if (t === 'j') return (value ?? []).map((e) => `${e.t} ${e.by}: ${e.text}`).join('\n')
  if (t === 'c') return CHOICES[field]?.[value] ?? String(value)
  const ref = refTable(table, field)
  if (ref) {
    const r = recordOf(y, ref, value)
    return r ? String(r[SCHEMA[ref].display] ?? '') : ''
  }
  return String(value)
}
const PRIORITY = { '11': '1', '12': '2', '21': '2', '13': '3', '22': '3', '31': '3', '23': '4', '32': '4', '33': '5' }
export const priorityOf = (impact, urgency) => PRIORITY[`${impact ?? 3}${urgency ?? 3}`] ?? '5'

// a new incident made by a lab or a person, with the fields of the form
export function addIncident(y, values, now, by = ADMIN_USER) {
  const rec = stampRec(y, { number: `INC${pad((y.n.inc = (y.n.inc ?? 10000) + 1), 7)}`, opened_at: dt(now), state: '1', impact: '3', urgency: '3', caller_id: userOf(y, by)?.sys_id ?? '' }, now, by)
  for (const [k, v] of Object.entries(values)) if (typeOf('incident', k) && !SYS.includes(k)) rec[k] = v
  rec.priority = priorityOf(rec.impact, rec.urgency)
  y.tables.incident.push(rec)
  if (y.tables.incident.length > MAX_INCIDENTS) y.tables.incident.splice(0, y.tables.incident.length - MAX_INCIDENTS)
  return rec
}
export const addUser = (y, { user_name, first_name = '', last_name = '', roles = [], pw = '', web_service_access_only = false, internal_integration_user = false, email }, now, by = ADMIN_USER) => {
  const rec = stampRec(y, { user_name, first_name, last_name, name: `${first_name} ${last_name}`.trim() || user_name, email: email ?? `${user_name}@harbor.example`, active: true, web_service_access_only, internal_integration_user, locked_out: false, roles: [...roles], pw }, now, by)
  y.tables.sys_user.push(rec)
  return rec
}
export const log = (y, now, level, source, message) => push(y.syslog, { t: now, level, source, message }, MAX_LOG)

// ---------- ACLs ----------

const rolesOf = (u) => u?.roles ?? []
const passes = (u, acl) => rolesOf(u).includes('admin') || !acl.roles?.length || acl.roles.some((r) => rolesOf(u).includes(r))
// table ACLs: deny unless an active ACL of the operation exists and one of its roles is held (admin passes all)
export function canTable(y, u, table, op) {
  if (rolesOf(u).includes('admin')) return true
  const list = y.acls.filter((a) => a.active && a.name === table && a.operation === op)
  return list.some((a) => passes(u, a))
}
// field ACLs: a field without its own ACL follows the table
export function canField(y, u, table, field, op) {
  if (rolesOf(u).includes('admin')) return true
  const list = y.acls.filter((a) => a.active && a.name === `${table}.${field}` && a.operation === op)
  return !list.length || list.some((a) => passes(u, a))
}

// ---------- encoded queries ----------

const OPS = ['ISNOTEMPTY', 'ISEMPTY', 'NOT LIKE', 'NOTLIKE', 'LIKE', 'STARTSWITH', 'ENDSWITH', 'NOT IN', 'IN', '!=', '>=', '<=', '=', '>', '<']
export const OPERATORS = [
  ['=', 'is'],
  ['!=', 'is not'],
  ['LIKE', 'contains'],
  ['STARTSWITH', 'starts with'],
  ['ISEMPTY', 'is empty'],
  ['ISNOTEMPTY', 'is not empty'],
  ['>', 'greater than'],
  ['<', 'less than'],
  ['IN', 'is one of'],
]
// sysparm_query: terms joined by ^ (and) or ^OR (or), with ORDERBY and ORDERBYDESC. Returns the terms that are invalid too.
export function parseQuery(table, q) {
  const groups = []
  const order = []
  const invalid = []
  for (const raw of String(q ?? '').split('^')) {
    let part = raw.trim()
    if (!part || part === 'EQ' || part.startsWith('NQ')) continue
    if (part.startsWith('ORDERBYDESC')) {
      order.push({ field: part.slice(11), desc: true })
      continue
    }
    if (part.startsWith('ORDERBY')) {
      order.push({ field: part.slice(7), desc: false })
      continue
    }
    const or = part.startsWith('OR') && /^OR[a-z_]/.test(part)
    if (or) part = part.slice(2)
    const m = part.match(/^([a-z_][a-z0-9_]*(?:\.[a-z_][a-z0-9_]*)?)(.*)$/)
    const op = m && OPS.find((o) => m[2].startsWith(o))
    const field = m?.[1]
    const base = field?.split('.')[0]
    if (!op || !typeOf(table, base) || (field.includes('.') && !refTable(table, base))) {
      invalid.push(part)
      continue
    }
    const term = { field, op: op.replace(' ', ''), value: m[2].slice(op.length) }
    if (or && groups.length) groups.at(-1).push(term)
    else groups.push([term])
  }
  return { groups, order, invalid }
}
const valueFor = (y, table, rec, field) => {
  const [base, sub] = field.split('.')
  if (!sub) return rec[base]
  const ref = recordOf(y, refTable(table, base), rec[base])
  return ref?.[sub]
}
function test(y, table, rec, { field, op, value }) {
  const raw = valueFor(y, table, rec, field)
  const v = Array.isArray(raw) ? raw.join(',') : typeof raw === 'boolean' ? String(raw) : String(raw ?? '')
  // a reference compares by sys_id, and the lab also takes the display value
  const shown = field.includes('.') ? v : displayOf(y, table, field, raw)
  const eq = (x) => v === x || (refTable(table, field) && same(shown, x))
  const low = v.toLowerCase()
  const val = String(value ?? '')
  switch (op) {
    case '=':
      return eq(val)
    case '!=':
      return !eq(val)
    case 'LIKE':
      return low.includes(val.toLowerCase()) || shown.toLowerCase().includes(val.toLowerCase())
    case 'NOTLIKE':
      return !low.includes(val.toLowerCase())
    case 'STARTSWITH':
      return low.startsWith(val.toLowerCase())
    case 'ENDSWITH':
      return low.endsWith(val.toLowerCase())
    case 'IN':
      return val.split(',').some((x) => eq(x.trim()))
    case 'NOTIN':
      return !val.split(',').some((x) => eq(x.trim()))
    case 'ISEMPTY':
      return v === ''
    case 'ISNOTEMPTY':
      return v !== ''
    default: {
      const [a, b] = /^-?\d+(\.\d+)?$/.test(v) && /^-?\d+(\.\d+)?$/.test(val) ? [Number(v), Number(val)] : [v, val]
      return op === '>' ? a > b : op === '>=' ? a >= b : op === '<' ? a < b : a <= b
    }
  }
}
// the rows of a query in order. An invalid term is left out and the rest still runs: the instance default of
// glide.invalid_query.returns_no_rows is false, so a typo in a field name widens the result.
export function select(y, table, q) {
  const { groups, order, invalid } = parseQuery(table, q)
  const rows = rowsOf(y, table).filter((r) => groups.every((g) => g.some((t) => test(y, table, r, t))))
  // lab-made: without ORDERBY the rows come in the order they were stored
  if (order.length)
    rows.sort((a, b) => {
      for (const k of order) {
        const x = String(valueFor(y, table, a, k.field) ?? '')
        const z = String(valueFor(y, table, b, k.field) ?? '')
        if (x !== z) return (x < z ? -1 : 1) * (k.desc ? -1 : 1)
      }
      return 0
    })
  return { rows, invalid }
}

// a record as the Table API returns it: sysparm_fields picks the fields, sysparm_display_value says value, display
// value or both, and a field the user cannot read is left out
export function asJson(y, table, rec, { fields, display = 'false', excludeLink = false, user } = {}) {
  const names = fields?.length ? fields.filter((f) => typeOf(table, f)) : Object.keys(SCHEMA[table]?.fields ?? {})
  const out = {}
  for (const f of names) {
    if (user && !canField(y, user, table, f, 'read')) continue
    const t = typeOf(table, f)
    const raw = rec[f]
    const value = t === 'b' ? String(Boolean(raw)) : t === 'l' ? (raw ?? []).join(',') : t === 'j' ? '' : t === 'i' ? String(raw ?? 0) : String(raw ?? '')
    const shown = t === 'j' ? '' : displayOf(y, table, f, raw)
    const ref = refTable(table, f)
    if (display === 'true') out[f] = shown
    else if (display === 'all') out[f] = ref && value && !excludeLink ? { display_value: shown, link: `${INSTANCE_URL}/api/now/table/${ref}/${value}`, value } : { display_value: shown, value }
    else out[f] = ref && value && !excludeLink ? { link: `${INSTANCE_URL}/api/now/table/${ref}/${value}`, value } : value
  }
  return out
}

// ---------- writes ----------

// a value for a field: a reference takes a sys_id or a display value, a choice takes a value or a label
function coerce(y, table, field, v) {
  const t = typeOf(table, field)
  if (v === null || v === undefined) return ''
  if (typeof v === 'object' && !Array.isArray(v)) v = v.value ?? v.display_value ?? ''
  if (t === 'b') return v === true || same(v, 'true') || v === '1'
  if (t === 'l') return (Array.isArray(v) ? v : String(v).split(',')).map(word).filter(Boolean)
  if (t === 'c') {
    const map = CHOICES[field] ?? {}
    const s = word(v)
    return map[s] !== undefined ? s : (Object.entries(map).find(([, label]) => same(label, s))?.[0] ?? s)
  }
  const ref = refTable(table, field)
  if (ref) {
    const s = word(v)
    if (!s) return ''
    if (recordOf(y, ref, s)) return s
    return rowsOf(y, ref).find((r) => same(r[SCHEMA[ref].display], s) || (ref === 'sys_user' && same(r.user_name, s)))?.sys_id ?? null
  }
  return String(v)
}
const audit = (y, table, rec, field, oldvalue, newvalue, user, now) => push(y.audit, { sys_id: newId(y), tablename: table, documentkey: rec.sys_id, fieldname: field, oldvalue: String(oldvalue ?? ''), newvalue: String(newvalue ?? ''), user, sys_created_on: dt(now), record_checkpoint: rec.sys_mod_count }, MAX_AUDIT)
// sets the fields of `body` that exist and that the user may write; the Table API leaves out the rest without an error
export function writeFields(y, table, rec, body, u, now, isNew = false) {
  const changed = []
  for (const [k, v] of Object.entries(body ?? {})) {
    if (!typeOf(table, k) || SYS.includes(k) || k === 'number' || (table === 'incident' && k === 'priority')) continue
    if (u && !canField(y, u, table, k, isNew ? 'create' : 'write') && !(isNew && canField(y, u, table, k, 'write'))) continue
    const t = typeOf(table, k)
    if (t === 'j') {
      if (!word(v)) continue
      rec[k] = [...(rec[k] ?? []), { t: dt(now), by: u?.user_name ?? ADMIN_USER, text: String(v).slice(0, 300) }].slice(-5)
      changed.push([k, '', String(v).slice(0, 80)])
      continue
    }
    const val = coerce(y, table, k, v)
    if (val === null) {
      log(y, now, 'Warning', 'Table API', `Invalid reference value '${word(v)}' for field ${table}.${k}. The field is left empty.`) // lab-made wording
      continue
    }
    if (JSON.stringify(rec[k] ?? '') === JSON.stringify(val)) continue
    changed.push([k, rec[k], val])
    rec[k] = val
  }
  if (table === 'incident') {
    const p = priorityOf(rec.impact, rec.urgency)
    if (p !== rec.priority) {
      changed.push(['priority', rec.priority, p])
      rec.priority = p
    }
  }
  if (table === 'sys_user' && changed.some(([k]) => k === 'first_name' || k === 'last_name')) rec.name = `${rec.first_name ?? ''} ${rec.last_name ?? ''}`.trim()
  if (!isNew && changed.length) {
    rec.sys_mod_count = (rec.sys_mod_count ?? 0) + 1
    rec.sys_updated_on = dt(now)
    rec.sys_updated_by = u?.user_name ?? ADMIN_USER
  }
  // lab-made: an insert is one history entry, Record created, not one entry per field
  if (!isNew) for (const [k, a, b] of changed) audit(y, table, rec, k, Array.isArray(a) ? a.join(',') : a, Array.isArray(b) ? b.join(',') : b, u?.user_name ?? ADMIN_USER, now)
  return changed.length
}

// ---------- logins and rate limits ----------

const host = (v) => word(v).toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
const ERR = { 400: 'HTTP:BAD_REQUEST', 401: 'HTTP:UNAUTHORIZED', 403: 'HTTP:FORBIDDEN', 404: 'HTTP:NOT_FOUND', 405: 'HTTP:METHOD_NOT_ALLOWED', 429: 'HTTP:TOO_MANY_REQUESTS', 500: 'HTTP:INTERNAL_SERVER_ERROR' }
const failure = (message, detail) => ({ error: { message, detail }, status: 'failure' })
const answer = (status, body, headers = {}, ms = 80) => ({ ok: status < 400, status, body, headers, ms, ...(status >= 400 && { type: ERR[status] ?? 'HTTP:INTERNAL_SERVER_ERROR', error: body?.error?.message ?? body?.error_description ?? `HTTP ${status}` }) })
// the configuration a Mule app reads from its properties
export const cfgOf = (p = {}) => ({ instance: p['snow.instance'], auth: p['snow.auth'] || 'basic', username: p['snow.username'], password: p['snow.password'], clientId: p['snow.clientId'], clientSecret: p['snow.clientSecret'] })

// basic auth logs in as the user; OAuth here is the client credentials grant, which acts as the OAuth application user
// of the Application Registry entry (lab-made: the token call and its cache are folded into each request)
export function login(y, cfg, now) {
  if (host(cfg?.instance) !== INSTANCE) return { ok: false, status: 0, type: 'HTTP:CONNECTIVITY', error: `Couldn't connect. The host ${host(cfg?.instance) || '(empty)'} cannot be resolved`, body: null, headers: {}, ms: 30 }
  if (same(cfg.auth, 'oauth')) {
    const reg = y.oauth.find((o) => o.client_id === word(cfg.clientId))
    const u = reg && userOf(y, reg.user)
    if (!reg || !reg.active || reg.client_secret !== String(cfg.clientSecret ?? '') || !u || !u.active || u.locked_out) {
      log(y, now, 'Warning', 'OAuth', `OAuth client ${word(cfg.clientId) || '(empty)'}: access denied`)
      return answer(401, { error_description: 'access_denied', error: 'server_error' }, {}, 40)
    }
    return { ok: true, user: u }
  }
  const u = userOf(y, cfg?.username)
  if (!u || !u.active || u.locked_out || !u.pw || u.pw !== String(cfg.password ?? '')) {
    log(y, now, 'Warning', 'Authentication', `Failed login for user ${word(cfg?.username) || '(empty)'} over basic auth`)
    return answer(401, failure('User Not Authenticated', 'Required to provide Auth information'), {}, 40)
  }
  return { ok: true, user: u }
}
// the rate limit rules that apply to a user: a rule for the user wins over one for a role, which wins over all users
export function ruleFor(y, u) {
  const live = y.rateRules.filter((r) => r.active)
  const pick = (list) => list.sort((a, b) => Number(a.limit) - Number(b.limit))[0]
  return pick(live.filter((r) => r.type === 'User' && same(r.who, u.user_name))) ?? pick(live.filter((r) => r.type === 'Role' && rolesOf(u).includes(r.who))) ?? pick(live.filter((r) => r.type === 'All users'))
}
export const usedThisHour = (y, user, now) => {
  const c = y.rate[user]
  return c && c.h === Math.floor(now / HOUR) ? c.n : 0
}
// counts one request; returns the headers, or a 429 once the limit of the hour is used
function rateGate(y, u, now) {
  const rule = ruleFor(y, u)
  if (!rule) return { headers: {} }
  const h = Math.floor(now / HOUR)
  const c = (y.rate[u.user_name] = y.rate[u.user_name]?.h === h ? y.rate[u.user_name] : { h, n: 0, rejected: 0 })
  const limit = Number(rule.limit)
  const reset = epochOf((h + 1) * HOUR)
  if (c.n >= limit) {
    c.rejected++
    if (c.rejected === 1 || c.rejected % 25 === 0) log(y, now, 'Warning', 'Rate limit', `Rate limit exceeded for user ${u.user_name}: rule ${rule.name}, ${limit} requests per hour. ${c.rejected} rejected this hour.`)
    const retry = Math.max(1, Math.ceil(((h + 1) * HOUR - now) / 1000))
    return { blocked: answer(429, failure('Rate limit exceeded', `The rate limit of ${limit} requests per hour for rule ${rule.name} is reached. Try again later.`), { 'X-RateLimit-Limit': String(limit), 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': String(reset), 'Retry-After': String(retry) }, 15) }
  }
  c.n++
  return { headers: { 'X-RateLimit-Limit': String(limit), 'X-RateLimit-Remaining': String(Math.max(0, limit - c.n)), 'X-RateLimit-Reset': String(reset) } }
}

// ---------- the Table API ----------

const qs = (params) =>
  Object.entries(params ?? {})
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${v}`)
    .join('&')
const short = (v, n = 160) => {
  const t = typeof v === 'string' ? v : JSON.stringify(v ?? '')
  return t.length > n ? `${t.slice(0, n)}...` : t
}
function record(y, now, entry) {
  push(y.tx, { t: now, ...entry }, MAX_TX)
}
// lab-made: an agent works on a ticket while a paged read is in progress, so a record moves within a sort on
// sys_updated_on. Only labs that set y.churn see this.
function churn(y, now) {
  const open = y.tables.incident.filter((r) => ['1', '2', '3'].includes(r.state))
  if (!open.length) return
  const oldest = open.reduce((a, b) => (String(a.sys_updated_on) <= String(b.sys_updated_on) ? a : b))
  const agent = userOf(y, 'beth.okafor')
  writeFields(y, 'incident', oldest, { state: '2', work_notes: 'Looking into it' }, agent, now)
  oldest.sys_updated_on = dt(now + (y.n.churn = (y.n.churn ?? 0) + 1) * 1000)
}

// One call of the Table API. `table` is a table name, or a table name and a sys_id: 'incident/<sys_id>'.
export function tableCall(y, u, { method = 'GET', table, params = {}, body, now, src, headers = {} }) {
  const m = String(method).toUpperCase()
  const [name, sysId] = String(table ?? '').split('/')
  const path = `/api/now/table/${name}${sysId ? `/${sysId}` : ''}`
  const query = qs(params)
  const url = `${path}${query ? `?${query}` : ''}`
  const done = (r, rows) => {
    record(y, now, { user: u.user_name, src, m, url, st: r.status, ms: r.ms, n: rows ?? (r.ok && r.body?.result ? (Array.isArray(r.body.result) ? r.body.result.length : 1) : 0), req: body === undefined ? '' : short(body), res: short(r.body), ...(r.headers?.['X-Total-Count'] && { tot: Number(r.headers['X-Total-Count']) }) })
    r.headers = { ...headers, ...r.headers }
    return r
  }
  if (!SCHEMA[name]) return done(answer(400, failure(`Invalid table ${name}`, null), {}, 20))
  // lab-made: the Table API needs the REST API role
  if (!rolesOf(u).includes('admin') && !rolesOf(u).includes(REST_ROLE)) return done(answer(403, failure('User Not Authorized', `The user ${u.user_name} does not have the role ${REST_ROLE} to call the REST API`), {}, 20))
  const opts = { fields: word(params.sysparm_fields) ? word(params.sysparm_fields).split(',').map(word) : null, display: word(params.sysparm_display_value || 'false').toLowerCase(), excludeLink: same(params.sysparm_exclude_reference_link, 'true'), user: u }
  if (m === 'GET' && !sysId) {
    if (!canTable(y, u, name, 'read')) return done(answer(403, failure('User Not Authorized', `ACL Exception: read on ${name} failed due to security constraints`), {}, 30)) // lab-made detail
    if (y.churn && Number(params.sysparm_offset) > 0) churn(y, now)
    const { rows, invalid } = select(y, name, params.sysparm_query)
    if (invalid.length) log(y, now, 'Warning', 'QueryEventLogger', `Invalid query detected, please check logs for details [Unknown field ${invalid[0]} in table ${name}]`)
    const limit = Math.max(1, Math.min(10000, Number(params.sysparm_limit) || 10000))
    const offset = Math.max(0, Number(params.sysparm_offset) || 0)
    const page = rows.slice(offset, offset + limit)
    const base = `${INSTANCE_URL}${path}?${qs({ ...params, sysparm_offset: undefined, sysparm_limit: limit })}`
    const link = [`<${base}&sysparm_offset=0>;rel="first"`, offset + limit < rows.length && `<${base}&sysparm_offset=${offset + limit}>;rel="next"`, `<${base}&sysparm_offset=${Math.max(0, Math.floor((rows.length - 1) / limit) * limit)}>;rel="last"`].filter(Boolean).join(',')
    return done(answer(200, { result: page.map((r) => asJson(y, name, r, opts)) }, { 'X-Total-Count': String(rows.length), Link: link }, 60 + page.length), page.length)
  }
  if (m === 'POST') {
    if (sysId) return done(answer(405, failure('Method not Supported', 'POST method not supported for API'), {}, 10))
    if (!canTable(y, u, name, 'create')) return done(answer(403, failure('Operation Failed', 'ACL Exception Insert Failed due to security constraints'), {}, 30))
    if (typeof body !== 'object' || body === null || Array.isArray(body)) return done(answer(400, failure('Exception while reading request', 'The payload is not valid JSON.'), {}, 10))
    const rec = name === 'incident' ? addIncident(y, {}, now, u.user_name) : stampRec(y, {}, now, u.user_name)
    if (name === 'incident') rec.caller_id = ''
    if (name !== 'incident') y.tables[name].push(rec)
    writeFields(y, name, rec, body, u, now, true)
    audit(y, name, rec, 'sys_created', '', 'Record created', u.user_name, now)
    return done(answer(201, { result: asJson(y, name, rec, opts) }, { Location: `${INSTANCE_URL}${path}/${rec.sys_id}` }, 140))
  }
  const rec = sysId && recordOf(y, name, sysId)
  if (!sysId) return done(answer(405, failure('Method not Supported', `${m} method not supported for API`), {}, 10))
  if (!rec || (m === 'GET' && !canTable(y, u, name, 'read'))) return done(answer(404, failure('No Record found', "Record doesn't exist or ACL restricts the record retrieval"), {}, 30))
  if (m === 'GET') return done(answer(200, { result: asJson(y, name, rec, opts) }, {}, 50))
  if (m === 'PATCH' || m === 'PUT') {
    if (!canTable(y, u, name, 'write')) return done(answer(403, failure('Operation Failed', 'ACL Exception Update Failed due to security constraints'), {}, 30))
    writeFields(y, name, rec, body, u, now)
    return done(answer(200, { result: asJson(y, name, rec, opts) }, {}, 110))
  }
  if (m === 'DELETE') {
    if (!canTable(y, u, name, 'delete')) return done(answer(403, failure('Operation Failed', 'ACL Exception Delete Failed due to security constraints'), {}, 30))
    y.tables[name] = y.tables[name].filter((r) => r !== rec)
    audit(y, name, rec, 'sys_deleted', '', 'Record deleted', u.user_name, now)
    return done(answer(204, null, {}, 60))
  }
  return done(answer(405, failure('Method not Supported', `${m} method not supported for API`), {}, 10))
}

// The Import Set API: POST /api/now/import/{staging table}. The transform map of the staging table writes the target;
// a coalesce field finds the record to update, so a repeated row updates instead of inserting again.
// Lab-made: the staging rows are not kept, only the result.
export function importCall(y, u, { staging, body, now, src }) {
  const path = `/api/now/import/${staging}`
  const done = (r) => {
    record(y, now, { user: u.user_name, src, m: 'POST', url: path, st: r.status, ms: r.ms, n: r.ok ? 1 : 0, req: short(body), res: short(r.body) })
    return r
  }
  if (!rolesOf(u).includes('admin') && !rolesOf(u).includes(REST_ROLE)) return done(answer(403, failure('User Not Authorized', `The user ${u.user_name} does not have the role ${REST_ROLE} to call the REST API`), {}, 20))
  if (!rolesOf(u).includes('admin') && !rolesOf(u).includes('import_set_loader')) return done(answer(403, failure('Operation Failed', 'ACL Exception Insert Failed due to security constraints'), {}, 20))
  const map = y.transforms.find((x) => x.active && x.source === staging)
  if (!map) return done(answer(400, failure(`Invalid table ${staging}`, null), {}, 20))
  const values = {}
  for (const f of map.fields) if (body?.[f.source] !== undefined) values[f.target] = body[f.source]
  const keys = map.fields.filter((f) => f.coalesce)
  const target = map.target
  const iset = `ISET${pad((y.n.iset = (y.n.iset ?? 10000) + 1), 7)}`
  let rec = keys.length ? rowsOf(y, target).find((r) => keys.every((f) => word(r[f.target]) !== '' && String(r[f.target]) === String(coerce(y, target, f.target, values[f.target]) ?? ''))) : null
  let status = 'updated'
  if (!rec) {
    status = 'inserted'
    rec = target === 'incident' ? addIncident(y, {}, now, u.user_name) : null
    if (!rec) return done(answer(500, failure('Transform failed', `Target ${target} is not supported in the lab`), {}, 20)) // lab-made
    rec.caller_id = ''
    writeFields(y, target, rec, values, null, now, true)
    audit(y, target, rec, 'sys_created', '', 'Record created', u.user_name, now)
  } else if (!writeFields(y, target, rec, { ...values, work_notes: `Updated by import set ${iset}` }, null, now)) status = 'ignored'
  log(y, now, 'Information', 'Transform', `Import set ${iset}: ${map.name} ${status} ${target} ${rec.number ?? rec.sys_id}`)
  return done(answer(201, { import_set: iset, staging_table: staging, result: [{ transform_map: map.name, table: target, display_name: SCHEMA[target].display, display_value: rec[SCHEMA[target].display], record_link: `${INSTANCE_URL}/api/now/table/${target}/${rec.sys_id}`, status, sys_id: rec.sys_id }] }, {}, 180))
}

// ---------- the ctx hook ----------

// The engine calls this for each run of an app with its draft state: the calls change `s` in place.
export function servicenowCtx(s, app) {
  const who = app?.name ?? 'app'
  const sys = () => (s.servicenow = fillServicenow(s.servicenow))
  const now = () => s.clock ?? 0
  const enter = (cfg) => {
    const y = sys()
    const l = login(y, cfg ?? {}, now())
    if (!l.ok) {
      if (l.status) record(y, now(), { user: word(cfg?.username || cfg?.clientId) || '(none)', src: who, m: '', url: '(login)', st: l.status, ms: l.ms, n: 0, req: '', res: short(l.body) })
      return { y, fail: l }
    }
    const gate = rateGate(y, l.user, now())
    return { y, user: l.user, gate }
  }
  return {
    // table(cfg, 'GET', 'incident', { sysparm_query, sysparm_limit, sysparm_offset, sysparm_fields, sysparm_display_value }, body)
    table(cfg, method, table, params = {}, body) {
      const { y, user, gate, fail } = enter(cfg)
      if (fail) return fail
      if (gate.blocked) {
        record(y, now(), { user: user.user_name, src: who, m: String(method).toUpperCase(), url: `/api/now/table/${table}`, st: 429, ms: 15, n: 0, req: '', res: short(gate.blocked.body) })
        return gate.blocked
      }
      return tableCall(y, user, { method, table, params, body, now: now(), src: who, headers: gate.headers })
    },
    importSet(cfg, staging, body) {
      const { y, user, gate, fail } = enter(cfg)
      if (fail) return fail
      if (gate.blocked) return gate.blocked
      return importCall(y, user, { staging, body, now: now(), src: who })
    },
  }
}

// runs once a lab minute while state.servicenow exists: nothing waits in the instance, so it only keeps a placeholder small
export const servicenowTick = (s) => s

// ---------- screen actions (pure: state in, new state out) ----------

const edit = (state, fn) => {
  const s = structuredClone(state)
  s.servicenow = fillServicenow(s.servicenow)
  const result = fn(s, s.servicenow, s.clock ?? 0)
  return { state: s, result }
}
const admin = (y) => userOf(y, ADMIN_USER)
export const upgradeServicenow = (state) => (isFilled(state?.servicenow) ? state : edit(state, () => null).state)
export const defaultServicenow = (now) => ({ created: now })

// REST API Explorer. Lab-made: it runs as the user picked under Run as, the way an admin tests after impersonating
// the integration user. The real explorer runs as the logged in user.
export const explore = (state, { as = ADMIN_USER, method = 'GET', table, sysId, params = {}, body } = {}) =>
  edit(state, (s, y, now) => {
    const u = userOf(y, as)
    if (!u) return { status: 0, error: `No user ${as}` }
    let parsed = body
    if (typeof body === 'string' && word(body)) {
      try {
        parsed = JSON.parse(body)
      } catch {
        parsed = 'not json'
      }
    } else if (typeof body === 'string') parsed = undefined
    const gate = rateGate(y, u, now)
    if (gate.blocked) {
      record(y, now, { user: u.user_name, src: 'REST API Explorer', m: method, url: `/api/now/table/${table}`, st: 429, ms: 15, n: 0, req: '', res: short(gate.blocked.body) })
      return gate.blocked
    }
    return tableCall(y, u, { method, table: sysId ? `${table}/${sysId}` : table, params, body: parsed, now, src: 'REST API Explorer', headers: gate.headers })
  })

// list and form actions of the admin
export const saveRecord = (state, table, sysId, values) =>
  edit(state, (s, y, now) => {
    const rec = recordOf(y, table, sysId)
    if (!rec) return { error: 'Record not found' }
    return { changed: writeFields(y, table, rec, values, admin(y), now) }
  })
export const updateSelected = (state, table, ids, values) =>
  edit(state, (s, y, now) => {
    let n = 0
    for (const id of ids) {
      const rec = recordOf(y, table, id)
      if (rec && writeFields(y, table, rec, values, admin(y), now)) n++
    }
    return { changed: n }
  })
export const newIncident = (state, values) =>
  edit(state, (s, y, now) => {
    if (!word(values.short_description)) return { error: 'Short description is mandatory' }
    const rec = addIncident(y, {}, now, ADMIN_USER)
    writeFields(y, 'incident', rec, values, admin(y), now, true)
    return { sysId: rec.sys_id, number: rec.number }
  })

// users and roles
const NAME_OK = /^[a-z0-9._-]{3,40}$/i
export const createUser = (state, { user_name, first_name = '', last_name = '', password = '', web_service_access_only = false, internal_integration_user = false, email } = {}) =>
  edit(state, (s, y, now) => {
    const name = word(user_name)
    if (!NAME_OK.test(name)) return { error: 'User ID has 3 to 40 letters, digits, dots, dashes or underscores' }
    if (userOf(y, name)) return { error: `User ID ${name} already exists` }
    const u = addUser(y, { user_name: name, first_name: word(first_name), last_name: word(last_name), pw: String(password), web_service_access_only: Boolean(web_service_access_only), internal_integration_user: Boolean(internal_integration_user), email: word(email) || undefined }, now)
    audit(y, 'sys_user', u, 'sys_created', '', 'Record created', ADMIN_USER, now)
    return { sysId: u.sys_id }
  })
export const setUserFields = (state, userName, values) =>
  edit(state, (s, y, now) => {
    const u = userOf(y, userName)
    if (!u) return { error: 'No such user' }
    const { password, ...rest } = values
    if (password !== undefined) {
      if (String(password).length < 8) return { error: 'The password needs at least 8 characters' }
      u.pw = String(password)
      audit(y, 'sys_user', u, 'user_password', '', '(changed)', ADMIN_USER, now)
    }
    return { changed: writeFields(y, 'sys_user', u, rest, admin(y), now) }
  })
export const setRole = (state, userName, role, on) =>
  edit(state, (s, y, now) => {
    const u = userOf(y, userName)
    if (!u || !ROLES[role]) return { error: 'No such user or role' }
    const roles = on ? [...new Set([...u.roles, role])] : u.roles.filter((r) => r !== role)
    return { changed: writeFields(y, 'sys_user', u, { roles }, admin(y), now) }
  })

// ACLs
export const saveAcl = (state, sysId, patch) =>
  edit(state, (s, y, now) => {
    const a = y.acls.find((x) => x.sys_id === sysId)
    if (!a) return { error: 'No such ACL' }
    const before = JSON.stringify(a.roles)
    if (patch.roles) a.roles = [...new Set(patch.roles.filter((r) => ROLES[r]))]
    if (patch.active !== undefined) a.active = Boolean(patch.active)
    log(y, now, 'Information', 'Security', `ACL ${a.name} ${a.operation} changed by ${ADMIN_USER}: roles ${before} to ${JSON.stringify(a.roles)}, active ${a.active}`)
    return { ok: true }
  })
export const createAcl = (state, { name, operation, roles = [], description = '' }) =>
  edit(state, (s, y, now) => {
    const [t, f] = word(name).split('.')
    if (!SCHEMA[t] || (f && f !== '*' && !typeOf(t, f))) return { error: `${word(name) || 'The name'} is not a table or a field of a table` }
    if (!['read', 'write', 'create', 'delete'].includes(operation)) return { error: 'Pick an operation' }
    const a = { sys_id: newId(y), type: 'record', name: word(name), operation, roles: roles.filter((r) => ROLES[r]), active: true, description: word(description) }
    y.acls.push(a)
    log(y, now, 'Information', 'Security', `ACL ${a.name} ${a.operation} created by ${ADMIN_USER}`)
    return { sysId: a.sys_id }
  })

// rate limit rules (System Web Services, REST, Rate Limits)
export const saveRateRule = (state, rule) =>
  edit(state, (s, y, now) => {
    const limit = Number(rule.limit)
    if (!word(rule.name)) return { error: 'Name is mandatory' }
    if (!(limit >= 1)) return { error: 'Rate limit per hour must be 1 or more' }
    if (!['User', 'Role', 'All users'].includes(rule.type)) return { error: 'Pick who the rule applies to' }
    if (rule.type === 'User' && !userOf(y, rule.who)) return { error: `No user ${word(rule.who)}` }
    if (rule.type === 'Role' && !ROLES[rule.who]) return { error: `No role ${word(rule.who)}` }
    const fields = { name: word(rule.name), resource: 'Table API', type: rule.type, who: rule.type === 'All users' ? '' : word(rule.who), limit, active: rule.active !== false }
    const old = rule.sys_id && y.rateRules.find((r) => r.sys_id === rule.sys_id)
    if (old) Object.assign(old, fields)
    else y.rateRules.push({ sys_id: newId(y), ...fields })
    log(y, now, 'Information', 'Rate limit', `Rate limit rule ${fields.name} saved: ${fields.limit} per hour for ${fields.type}${fields.who ? ` ${fields.who}` : ''}`)
    return { ok: true }
  })

// Application Registry: an OAuth API endpoint for external clients. The secret is shown once on the screen.
export const createOAuth = (state, { name, user }) =>
  edit(state, (s, y, now) => {
    if (!word(name)) return { error: 'Name is mandatory' }
    if (!userOf(y, user)) return { error: 'Pick the OAuth application user' }
    const id = newId(y)
    const reg = { sys_id: id, name: word(name), client_id: id, client_secret: `sn-${hexOf(`secret${id}`).slice(0, 14)}`, user: userOf(y, user).user_name, active: true }
    y.oauth.push(reg)
    log(y, now, 'Information', 'OAuth', `Application Registry entry ${reg.name} created, OAuth application user ${reg.user}`)
    return { clientId: reg.client_id, clientSecret: reg.client_secret }
  })
export const setOAuthActive = (state, id, active) => edit(state, (s, y) => void (y.oauth.find((o) => o.sys_id === id) && (y.oauth.find((o) => o.sys_id === id).active = Boolean(active))))

// transform map: the coalesce flag of one field map
export const setCoalesce = (state, mapId, target, on) =>
  edit(state, (s, y, now) => {
    const f = y.transforms.find((m) => m.sys_id === mapId)?.fields.find((x) => x.target === target)
    if (!f) return { error: 'No such field map' }
    f.coalesce = Boolean(on)
    log(y, now, 'Information', 'Transform', `Field map ${f.source} to ${target}: coalesce ${f.coalesce}`)
    return { ok: true }
  })
