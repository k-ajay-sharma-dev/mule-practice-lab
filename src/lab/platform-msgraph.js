// Microsoft Dataverse (Dynamics 365) and SharePoint over Microsoft Graph, with Entra ID app registrations and throttling.
// Pure and import free. Lives in state.msgraph.
//
// State shape (state.msgraph, once filled; the open console seeds only { created } and fillMsgraph builds the rest on
// first use, so the saved console stays small):
//   tenant, tenantId, n (counter), limit (Graph requests per app per lab minute, lab-made)
//   apps: [{ appId, objectId, name, t,
//            secrets: [{ id, desc, value, start, end }], certs: [{ thumb, desc, start, end }],
//            perms: [{ api: 'Microsoft Graph' | 'Dynamics CRM', name, type: 'Application' | 'Delegated' }],
//            granted: ['api|name|type'] (admin consent), notify: { days, to } | null, told: [secret id] }]
//   dv: { tables: { account | contact | salesorder: { keys: [{ name, cols, status, t }], rows: [row] } },
//         roles: { name: { system, privs: { table: ['Create', 'Read', ...] } } },
//         users: [{ id, appId, name, roles: [name], t }] }   (application users)
//   sites: [{ id, name, grants: { appId: 'read' | 'write' }, drives: [{ id, name, items: [{ id, name, size, t, by }] }] }]
//   sessions: { guid: { drive, name, size, next, t, who } }   (Graph upload sessions)
//   quota: { app: { w, n, until } }                           (throttling window and penalty per app)
//   hits: { app: { n, th, last429, batch } }                  (counters the labs read)
//   log: [{ t, who, api, m, p, st, c }]                      (the request log, newest last)
//
// ctx.msgraph (see msgraphCtx). Each call returns { ok, status, body, headers, code, ms }.
//   token(cfg)   the client credentials grant at login.microsoftonline.com. cfg: { tenant, clientId, clientSecret | certificate,
//                scope }. On success body has access_token, token_type Bearer and expires_in 3599 (seconds).
//                Errors carry the AADSTS code in `code`: AADSTS7000215 (wrong secret), AADSTS7000222 (expired secret),
//                AADSTS65001 (no admin consent), AADSTS700016 (unknown client), AADSTS90002 (unknown tenant),
//                AADSTS1002012 (scope without /.default), AADSTS500011 (unknown resource).
//   dataverse(token, method, path, body, headers)   the Dataverse Web API at /api/data/v9.2 of ORG_URL: accounts,
//                contacts, salesorders by id or alternate key, WhoAmI, and $batch (lab-made: a JSON body
//                { requests: [{ id, method, url, body, headers }] } instead of multipart/mixed).
//   graph(token, method, path, body, headers)       Microsoft Graph v1.0: sites, drives and items, simple upload
//                (PUT .../content, up to 4 MB), createUploadSession and its uploadUrl, and $batch (up to 20 requests).
//                The size of an upload is body.size or the Content-Length header; fragments send Content-Range.
// Seen keys a screen marks: 'msgraph:entra', `msgraph:app:${appId}`, `msgraph:table:${name}`, 'msgraph:appusers',
// 'msgraph:roles', `msgraph:site:${id}`, `msgraph:drive:${id}`, 'msgraph:log'.

const MINUTE = 60000
const HOUR = 60 * MINUTE
export const DAY = 24 * HOUR

export const TENANT = 'brightmartretail.onmicrosoft.com'
export const TENANT_ID = '5d1f7e2a-8c3b-4e6f-a1d2-3b4c5d6e7f80'
export const TENANT_NAME = 'Brightmart Retail'
export const LOGIN_URL = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`
export const ORG_URL = 'https://brightmart.crm.dynamics.com'
export const API_PATH = '/api/data/v9.2'
export const GRAPH_URL = 'https://graph.microsoft.com'
export const SP_HOST = 'brightmartretail.sharepoint.com'
export const DV_SCOPE = `${ORG_URL}/.default`
export const GRAPH_SCOPE = `${GRAPH_URL}/.default`
export const KIB = 1024
export const MIB = 1048576
export const FRAGMENT = 320 * KIB // upload session fragments are a multiple of 320 KiB
export const MAX_FRAGMENT = 60 * MIB // and at most 60 MiB each
export const SIMPLE_LIMIT = 4 * MIB // lab: the long documented 4 MB limit of PUT .../content
export const BATCH_MAX = 20 // JSON batching of Graph
export const DEFAULT_LIMIT = 100 // lab-made: Graph requests per app per lab minute before a 429
export const SECRET_DAYS = [
  [90, '90 days (3 months)'],
  [180, '180 days (6 months)'],
  [365, '365 days (12 months)'],
  [545, '545 days (18 months)'],
  [730, '730 days (24 months)'],
]
export const PRIVS = ['Create', 'Read', 'Write', 'Delete', 'Append', 'AppendTo']
const MAX_LOG = 80
const PENALTY = 60 * 1000 // lab-made: the first 429 asks for 60 seconds
const EXTRA = 30 * 1000 // lab-made: each call that ignores Retry-After adds 30 seconds
const MAX_PENALTY = 5 * MINUTE

// Application and delegated permissions an app registration can request
export const PERMISSIONS = {
  'Microsoft Graph': [
    ['Sites.Selected', 'Application', 'Access selected site collections'],
    ['Sites.Read.All', 'Application', 'Read items in all site collections'],
    ['Sites.ReadWrite.All', 'Application', 'Read and write items in all site collections'],
    ['Sites.FullControl.All', 'Application', 'Have full control of all site collections'],
    ['Files.ReadWrite.All', 'Application', 'Read and write files in all site collections'],
    ['User.Read.All', 'Application', "Read all users' full profiles"],
    ['Directory.ReadWrite.All', 'Application', 'Read and write directory data'],
    ['User.Read', 'Delegated', 'Sign in and read user profile'],
    ['Sites.ReadWrite.All', 'Delegated', 'Edit or delete items in all site collections'],
  ],
  'Dynamics CRM': [['user_impersonation', 'Delegated', 'Access Common Data Service as organization users']],
}
export const permKey = (p) => `${p.api}|${p.name}|${p.type}`
const READ_ALL = ['Sites.Read.All', 'Sites.ReadWrite.All', 'Sites.FullControl.All', 'Files.ReadWrite.All']
const WRITE_ALL = ['Sites.ReadWrite.All', 'Sites.FullControl.All', 'Files.ReadWrite.All']

// The three tables of the lab: entity set, primary key, object type code, schema name and column lengths
export const TABLES = {
  account: { label: 'Account', set: 'accounts', id: 'accountid', otc: 1, schema: 'Account', primary: 'name', cols: { name: 160, accountnumber: 20, address1_city: 80, telephone1: 50, emailaddress1: 100 } },
  contact: { label: 'Contact', set: 'contacts', id: 'contactid', otc: 2, schema: 'Contact', primary: 'lastname', cols: { firstname: 50, lastname: 50, emailaddress1: 100, telephone1: 50, brightmart_customerno: 20 } },
  salesorder: { label: 'Sales Order', set: 'salesorders', id: 'salesorderid', otc: 1088, schema: 'SalesOrder', primary: 'name', cols: { name: 300, ordernumber: 100, brightmart_weborderid: 40, totalamount: 0 } },
}
const COL_LABELS = { name: 'Name', accountnumber: 'Account Number', address1_city: 'City', telephone1: 'Phone', emailaddress1: 'Email', firstname: 'First Name', lastname: 'Last Name', brightmart_customerno: 'Customer No', ordernumber: 'Order Number', brightmart_weborderid: 'Web Order ID', totalamount: 'Total Amount' }
export const colLabel = (c) => COL_LABELS[c] ?? c
const setToTable = Object.fromEntries(Object.entries(TABLES).map(([k, v]) => [v.set, k]))

// ---------- small helpers ----------

const word = (v) => String(v ?? '').trim()
const push = (list, e, max) => {
  list.push(e)
  if (list.length > max) list.splice(0, list.length - max)
}
const hexOf = (seed, len = 32) => {
  let h = 2166136261
  let out = ''
  for (let i = 0; out.length < len; i++) {
    for (const ch of `${seed}:${i}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0
    out += h.toString(16).padStart(8, '0')
  }
  return out.slice(0, len)
}
export const guidOf = (seed) => {
  const h = hexOf(seed)
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`
}
const next = (m, kind) => guidOf(`${kind}:${(m.n = (m.n ?? 0) + 1)}`)
const iso = (t) => new Date(Date.UTC(2026, 10, 2) + t).toISOString().replace('.000Z', 'Z')
const b64 = (text) => btoa(text).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
const unb64 = (text) => {
  const t = String(text).replace(/-/g, '+').replace(/_/g, '/')
  return atob(t)
}
// a client secret value close to the shape Entra ID shows (3 characters, a marker with Q~, 34 more). Lab-made: the
// marker is LabQ~ instead of a digit and Q~, so a value never looks like a real Entra ID secret.
const secretValue = (seed) => {
  const h = hexOf(`secret:${seed}`, 40)
  return `${h.slice(0, 3)}LabQ~${h.slice(3, 37)}`.replace(/[0-9]/g, (d, i) => (i % 3 === 0 ? 'abcdefghij'[d] : d))
}
const thumbOf = (seed) => hexOf(`cert:${seed}`, 40).toUpperCase()
export const secretState = (x, now) => (now >= x.end ? 'Expired' : x.end - now <= 30 * DAY ? 'Expiring soon' : 'Current')
export const secretHint = (x) => `${x.value.slice(0, 3)}${'*'.repeat(10)}`

// ---------- the default landscape (built on first use) ----------

export function newRegistration(m, { name, appId, t = 0, secrets = [], certs = [], perms = [], granted = [], notify = null }) {
  const id = appId ?? next(m, 'app')
  const reg = { appId: id, objectId: guidOf(`obj:${id}`), name, t, secrets: [], certs: [], perms: perms.map((p) => ({ ...p })), granted: [...granted], notify, told: [] }
  for (const x of secrets) reg.secrets.push({ id: x.id ?? guidOf(`sid:${id}:${reg.secrets.length}`), desc: x.desc ?? 'secret', value: x.value ?? secretValue(`${id}:${reg.secrets.length}`), start: x.start ?? t, end: x.end })
  for (const x of certs) reg.certs.push({ thumb: x.thumb ?? thumbOf(`${id}:${reg.certs.length}`), desc: x.desc ?? 'certificate', start: x.start ?? t, end: x.end })
  m.apps.push(reg)
  return reg
}
export function newRow(m, table, fields, t = 0, by = 'Brightmart Admin') {
  const d = TABLES[table]
  const row = { [d.id]: next(m, table), ...fields, createdon: t, modifiedon: t, by }
  m.dv.tables[table].rows.push(row)
  return row
}
export function newSite(m, name, drives = []) {
  const site = { id: `${SP_HOST},${guidOf(`site:${name}`)},${guidOf(`web:${name}`)}`, name, grants: {}, drives: [] }
  for (const d of drives) site.drives.push({ id: `b!${hexOf(`drive:${name}:${d}`, 40)}`, name: d, items: [] })
  m.sites.push(site)
  return site
}
export function newItem(drive, name, size, t = 0, by = 'Brightmart Admin') {
  const item = { id: `01${hexOf(`item:${drive.id}:${name}`, 32).toUpperCase()}`, name, size, t, by }
  const i = drive.items.findIndex((x) => x.name === name)
  if (i >= 0) drive.items[i] = { ...item, id: drive.items[i].id }
  else drive.items.push(item)
  return item
}
export const SYSTEM_ROLES = {
  'System Administrator': { system: true, privs: Object.fromEntries(Object.keys(TABLES).map((t) => [t, [...PRIVS]])) },
  'Basic User': { system: true, privs: { account: ['Read'], contact: ['Read'] } }, // lab-made: the real role has user level rights on many tables
}

// An empty organization: tenant, tables, roles and the four sites, nothing else
export function emptyMsgraph(now = 0) {
  const m = { created: now, tenant: TENANT, tenantId: TENANT_ID, n: 0, limit: DEFAULT_LIMIT, apps: [], dv: { tables: {}, roles: structuredClone(SYSTEM_ROLES), users: [] }, sites: [], sessions: {}, quota: {}, hits: {}, log: [] }
  for (const t of Object.keys(TABLES)) m.dv.tables[t] = { keys: [], rows: [] }
  return m
}

// The organization of the open console: two registrations, a few rows, four sites
export function newMsgraph(now = 0) {
  const m = emptyMsgraph(now)
  const t0 = now - 120 * DAY
  const sync = newRegistration(m, { name: 'brightmart-d365-sync', t: t0, secrets: [{ desc: 'mule-sandbox', start: t0, end: t0 + 365 * DAY }] })
  newRegistration(m, {
    name: 'brightmart-sp-archive',
    t: t0,
    secrets: [{ desc: 'mule-sandbox', start: t0, end: now + 20 * DAY }],
    perms: [{ api: 'Microsoft Graph', name: 'Sites.Selected', type: 'Application' }],
    granted: ['Microsoft Graph|Sites.Selected|Application'],
  })
  m.dv.roles['Brightmart Integration'] = { system: false, privs: { account: ['Create', 'Read', 'Write'], contact: ['Create', 'Read', 'Write'], salesorder: ['Create', 'Read', 'Write'] } }
  m.dv.users.push({ id: guidOf(`user:${sync.appId}`), appId: sync.appId, name: sync.name, roles: ['Brightmart Integration'], t: t0 })
  for (const [no, name, city] of [
    ['C-1001', 'Northgate Grocers', 'Leeds'],
    ['C-1002', 'Bluebay Kitchens', 'Bristol'],
    ['C-1003', 'Larch and Pine Stores', 'York'],
  ])
    newRow(m, 'account', { accountnumber: no, name, address1_city: city }, t0)
  newRow(m, 'contact', { firstname: 'Mara', lastname: 'Okafor', emailaddress1: 'mara@northgate-grocers.example', brightmart_customerno: 'C-1001' }, t0)
  newRow(m, 'salesorder', { name: 'Web order W-5001', ordernumber: 'ORD-01001-H7K2', brightmart_weborderid: 'W-5001', totalamount: 129.5 }, now - DAY)
  const ops = newSite(m, 'Operations', ['Documents'])
  newItem(ops.drives[0], 'Runbook.docx', 48211, t0)
  const merch = newSite(m, 'Merchandising', ['Product sheets'])
  newItem(merch.drives[0], 'H-1250.pdf', 812004, now - 3 * DAY)
  const logi = newSite(m, 'Logistics', ['Delivery notes'])
  newItem(logi.drives[0], 'DN-20261102-0007.pdf', 1902112, now - DAY)
  newSite(m, 'Sales', ['Contracts'])
  return m
}

// fills a missing or placeholder state.msgraph
export function fillMsgraph(m, now = 0) {
  if (!m) return newMsgraph(now)
  if (!m.tenant) {
    const base = newMsgraph(m.created ?? now)
    for (const k of Object.keys(base)) m[k] ??= base[k]
  }
  return m
}
export const isFilled = (m) => Boolean(m?.tenant)

// ---------- lookups the labs and the screen share ----------

export const regOf = (m, appId) => (m?.apps ?? []).find((a) => a.appId === appId)
export const regNamed = (m, name) => (m?.apps ?? []).find((a) => a.name === name)
export const rowsOf = (m, table) => m?.dv?.tables?.[table]?.rows ?? []
export const keysOf = (m, table) => m?.dv?.tables?.[table]?.keys ?? []
export const keyOn = (m, table, cols) => keysOf(m, table).find((k) => k.cols.join(',') === [].concat(cols).join(','))
export const siteNamed = (m, name) => (m?.sites ?? []).find((x) => x.name === name)
export const siteOf = (m, id) => (m?.sites ?? []).find((x) => x.id === id)
export const driveOf = (m, id) => {
  for (const site of m?.sites ?? []) for (const d of site.drives) if (d.id === id) return { site, drive: d }
  return null
}
export const hitsOf = (m, who) => m?.hits?.[who] ?? { n: 0, th: 0, last429: null, batch: null }
export const appUserOf = (m, appId) => (m?.dv?.users ?? []).find((u) => u.appId === appId)
export const isGranted = (reg, p) => reg.granted.includes(permKey(p))
// rows that share a value of the column with an older row: the duplicates to clean up
export function dupesOf(m, table, col) {
  const seen = new Map()
  const out = []
  for (const r of [...rowsOf(m, table)].sort((a, b) => a.createdon - b.createdon)) {
    const v = word(r[col]).toLowerCase()
    if (!v) continue
    if (seen.has(v)) out.push(r)
    else seen.set(v, r)
  }
  return out
}
export const privsOf = (m, user) => {
  const out = {}
  for (const r of user?.roles ?? []) for (const [t, list] of Object.entries(m.dv.roles[r]?.privs ?? {})) out[t] = [...new Set([...(out[t] ?? []), ...list])]
  return out
}
export const quotaOf = (m, who, now) => {
  const q = m?.quota?.[who]
  if (!q) return { used: 0, until: 0 }
  return { used: q.w === Math.floor(now / MINUTE) * MINUTE ? q.n : 0, until: q.until > now ? q.until : 0 }
}

// ---------- tokens ----------

const tokenText = (claims) => `eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImtpZCI6ImxhYiJ9.${b64(JSON.stringify(claims))}.${hexOf(JSON.stringify(claims), 43)}`
export function claimsOf(token) {
  try {
    const part = String(token ?? '').replace(/^Bearer\s+/i, '').split('.')[1]
    const c = JSON.parse(unb64(part))
    return c && c.appid ? c : null
  } catch {
    return null
  }
}

function log(m, e) {
  push(m.log, e, MAX_LOG)
  const h = (m.hits[e.who] ??= { n: 0, th: 0, last429: null, batch: null })
  h.n++
  if (e.st === 429) {
    h.th++
    h.last429 = e.t
  }
}
const aad = (now, status, error, code, text, appId) => ({
  ok: false,
  status,
  code,
  body: { error, error_description: `${code}: ${text} Trace ID: ${guidOf(`trace:${text}`)} Correlation ID: ${guidOf(`corr:${appId}`)} Timestamp: ${iso(now).replace('T', ' ')}`, error_codes: [Number(code.slice(6))] },
  headers: {},
  ms: 140,
})

function token(s, m, who, cfg = {}) {
  const now = s.clock ?? 0
  const tenant = word(cfg.tenant)
  const id = word(cfg.clientId)
  const scope = word(cfg.scope)
  const done = (r) => {
    log(m, { t: now, who, api: 'login', m: 'POST', p: `/${tenant || '(none)'}/oauth2/v2.0/token`, st: r.status, c: r.code ?? '' })
    return r
  }
  if (tenant !== TENANT_ID && tenant.toLowerCase() !== TENANT) return done(aad(now, 400, 'invalid_request', 'AADSTS90002', `Tenant '${tenant || '(empty)'}' not found. Check to make sure you have the correct tenant ID and are signing in to the correct cloud.`, id))
  const reg = regOf(m, id)
  if (!reg) return done(aad(now, 400, 'unauthorized_client', 'AADSTS700016', `Application with identifier '${id || '(empty)'}' was not found in the directory '${TENANT_NAME}'. This can happen if the application has not been installed by the administrator of the tenant or consented to by any user in the tenant. You may have sent your authentication request to the wrong tenant.`, id))
  if (!scope.endsWith('/.default')) return done(aad(now, 400, 'invalid_scope', 'AADSTS1002012', `The provided value for scope ${scope || '(empty)'} is not valid. Client credential flows must have a scope value with /.default suffixed to the resource identifier (application ID URI).`, id))
  const aud = scope.slice(0, -'/.default'.length)
  if (aud !== ORG_URL && aud !== GRAPH_URL) return done(aad(now, 400, 'invalid_resource', 'AADSTS500011', `The resource principal named ${aud} was not found in the tenant named ${TENANT_NAME}. This can happen if the application has not been installed by the administrator of the tenant or consented to by any user in the tenant.`, id))
  // the credential: a client secret, or a certificate (lab-made: the thumbprint stands for the signed client assertion)
  if (word(cfg.certificate)) {
    const c = reg.certs.find((x) => x.thumb === word(cfg.certificate).toUpperCase())
    if (!c) return done(aad(now, 401, 'invalid_client', 'AADSTS700027', `Client assertion failed signature validation. The key was not found for app '${reg.appId}'.`, id))
    if (now >= c.end) return done(aad(now, 401, 'invalid_client', 'AADSTS700027', `The certificate with identifier used to sign the client assertion is expired on application '${reg.appId}'.`, id))
  } else {
    const value = word(cfg.clientSecret)
    const x = reg.secrets.find((y) => y.value === value)
    if (!x) return done(aad(now, 401, 'invalid_client', 'AADSTS7000215', `Invalid client secret provided. Ensure the secret being sent in the request is the client secret value, not the client secret ID, for a secret added to app '${reg.appId}'.`, id))
    if (now >= x.end) return done(aad(now, 401, 'invalid_client', 'AADSTS7000222', `The provided client secret keys for app '${reg.appId}' are expired. Visit the Azure portal to create new keys for your app: https://aka.ms/NewClientSecret, or consider using certificate credentials for added security: https://aka.ms/certCreds.`, id))
  }
  // application permissions with admin consent become the roles claim. Dataverse needs none: it checks its application user.
  let roles = []
  if (aud === GRAPH_URL) {
    const asked = reg.perms.filter((p) => p.api === 'Microsoft Graph' && p.type === 'Application')
    roles = asked.filter((p) => isGranted(reg, p)).map((p) => p.name)
    // lab-made: Entra ID often issues a token without a roles claim here, and Graph then answers 401. The lab says it at once.
    if (asked.length && !roles.length) return done(aad(now, 400, 'invalid_grant', 'AADSTS65001', `The user or administrator has not consented to use the application with ID '${reg.appId}' named '${reg.name}'. Send an interactive authorization request for this user and resource.`, id))
  }
  const claims = { aud, iss: `https://sts.windows.net/${TENANT_ID}/`, tid: TENANT_ID, appid: reg.appId, oid: reg.objectId, roles, iat: now, exp: now + HOUR }
  return done({ ok: true, status: 200, code: '', body: { token_type: 'Bearer', expires_in: 3599, ext_expires_in: 3599, access_token: tokenText(claims) }, headers: {}, ms: 120 })
}

// ---------- Dataverse Web API ----------

const dvError = (status, code, message) => ({ ok: false, status, code, body: { error: { code, message } }, headers: {}, ms: 60 })
const header = (headers, name) => {
  for (const [k, v] of Object.entries(headers ?? {})) if (k.toLowerCase() === name.toLowerCase()) return word(v)
  return ''
}
function parseKey(text) {
  const t = word(text)
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t)) return { id: t.toLowerCase() }
  const pairs = {}
  for (const part of t.split(',')) {
    const x = part.match(/^\s*(\w+)\s*=\s*'((?:[^']|'')*)'\s*$/) ?? part.match(/^\s*(\w+)\s*=\s*([\w.-]+)\s*$/)
    if (!x) return null
    pairs[x[1]] = x[2].replace(/''/g, "'")
  }
  return Object.keys(pairs).length ? { pairs } : null
}
function filterOf(text) {
  const out = []
  for (const part of word(text).split(/\s+and\s+/i)) {
    if (!part) continue
    const x = part.match(/^(\w+)\s+eq\s+(?:'((?:[^']|'')*)'|([\w.-]+))$/i)
    if (!x) return null
    out.push([x[1], (x[2] ?? x[3]).replace(/''/g, "'")])
  }
  return out
}
const plain = (table, row) => {
  const d = TABLES[table]
  const out = { [d.id]: row[d.id] }
  for (const c of Object.keys(d.cols)) if (row[c] !== undefined) out[c] = row[c]
  out.createdon = iso(row.createdon)
  out.modifiedon = iso(row.modifiedon)
  return out
}

function dataverseCall(s, m, who, token, method, path, body, headers) {
  const now = s.clock ?? 0
  const verb = word(method).toUpperCase()
  const full = word(path).replace(ORG_URL, '')
  const done = (r) => {
    log(m, { t: now, who, api: 'dataverse', m: verb, p: full.replace(API_PATH, '').slice(0, 120), st: r.status, c: r.code ?? '' })
    return r
  }
  const c = claimsOf(token)
  const unauthorized = (why) => done({ ok: false, status: 401, code: 'invalid_token', body: '', headers: { 'WWW-Authenticate': `Bearer error=invalid_token, error_description=${why}, authorization_uri=https://login.microsoftonline.com/${TENANT_ID}/oauth2/authorize, resource_id=${ORG_URL}` }, ms: 20 })
  if (!c) return unauthorized('Error during token validation!')
  if (c.exp <= now) return unauthorized('The access token is expired')
  if (c.aud !== ORG_URL) return unauthorized(`The audience ${c.aud} is invalid`)
  const user = appUserOf(m, c.appid)
  if (!user) return done(dvError(403, '0x80072560', 'The user is not a member of the organization.'))
  if (!full.startsWith(API_PATH)) return done(dvError(404, '0x8006088a', `Resource not found for the segment '${full.split('/')[1] ?? ''}'.`))
  const [rest, query = ''] = full.slice(API_PATH.length + 1).split('?')
  if (rest === 'WhoAmI' && verb === 'GET') return done({ ok: true, status: 200, code: '', body: { '@odata.context': `${ORG_URL}${API_PATH}/$metadata#Microsoft.Dynamics.CRM.WhoAmIResponse`, BusinessUnitId: guidOf('bu:brightmart'), UserId: user.id, OrganizationId: guidOf('org:brightmart') }, headers: {}, ms: 40 })
  if (rest === '$batch' && verb === 'POST') {
    const list = Array.isArray(body?.requests) ? body.requests : null
    if (!list) return done(dvError(400, '0x80048d19', 'The batch request body could not be read.')) // lab-made wording
    if (list.length > 1000) return done(dvError(400, '0x80048d19', 'The number of requests in a batch is more than 1000.'))
    const responses = list.map((x, i) => {
      const r = dataverseCall(s, m, who, token, x.method, `${API_PATH}/${word(x.url).replace(/^\/+/, '').replace(/^api\/data\/v9\.2\//, '')}`, x.body, x.headers)
      return { id: x.id ?? String(i + 1), status: r.status, headers: r.headers, body: r.body }
    })
    return { ok: true, status: 200, code: '', body: { responses }, headers: {}, ms: 80 + list.length * 25 }
  }
  const seg = rest.match(/^(\w+)(?:\((.*)\))?$/)
  const table = seg && setToTable[seg[1]]
  if (!table) return done(dvError(404, '0x8006088a', `Resource not found for the segment '${seg?.[1] ?? rest}'.`))
  const d = TABLES[table]
  const tbl = m.dv.tables[table]
  const privs = privsOf(m, user)
  const need = (p) => (privs[table] ?? []).includes(p) ? null : done(dvError(403, '0x80040220', `Principal user (Id=${user.id}, type=8, roleCount=${user.roles.length}), is missing prv${p}${d.schema} privilege (Id=${guidOf(`prv:${p}:${table}`)}) on OTC=${d.otc} for entity '${table}'. context.Caller=${user.id}`))
  const check = (fields) => {
    if (!fields || typeof fields !== 'object' || Array.isArray(fields)) return done(dvError(400, '0x80048d19', 'Error identified in Payload provided by the user for Entity'))
    for (const [k, v] of Object.entries(fields)) {
      if (k.includes('@odata')) continue
      if (!(k in d.cols)) return done(dvError(400, '0x80060888', `The property '${k}' does not exist on type 'Microsoft.Dynamics.CRM.${table}'. Make sure to only use property names that are defined by the type.`))
      if (d.cols[k] > 0 && String(v ?? '').length > d.cols[k]) return done(dvError(400, '0x80044331', `A validation error occurred. The length of the '${k}' attribute of the '${table}' entity exceeded the maximum allowed length of '${d.cols[k]}'.`))
    }
    return null
  }
  const clean = (fields) => Object.fromEntries(Object.entries(fields).filter(([k]) => k in d.cols))
  // an alternate key in use: the key must be active, and a create must not repeat its values
  const live = tbl.keys.filter((k) => k.status === 'Active' || k.status === 'Pending')
  const clash = (fields, except) => {
    for (const k of live) {
      const vals = k.cols.map((c) => word(fields[c]).toLowerCase())
      if (vals.some((v) => !v)) continue
      if (tbl.rows.some((r) => r !== except && k.cols.every((c, i) => word(r[c]).toLowerCase() === vals[i])))
        return done(dvError(412, '0x80040237', `A record that has the attribute values ${k.cols.map(colLabel).join(', ')} already exists. The entity key ${k.name} requires that this set of attributes contains unique values. Select unique values and try again.`))
    }
    return null
  }
  const entityId = (row) => ({ 'OData-EntityId': `${ORG_URL}${API_PATH}/${d.set}(${row[d.id]})` })
  const create = (fields) => {
    const row = { [d.id]: next(m, table), ...clean(fields), createdon: now, modifiedon: now, by: who }
    tbl.rows.push(row)
    // lab-made: the oldest rows go once a table holds 400, so a saved lab stays small
    if (tbl.rows.length > 400) tbl.rows.shift()
    return row
  }
  const answer = (row, status) => (header(headers, 'Prefer').includes('return=representation') ? { ok: true, status: status === 204 ? 200 : 201, code: '', body: plain(table, row), headers: entityId(row), ms: 70 } : { ok: true, status: 204, code: '', body: '', headers: entityId(row), ms: 60 })

  if (seg[2] === undefined) {
    if (verb === 'GET') {
      const bad = need('Read')
      if (bad) return bad
      const q = Object.fromEntries(query.split('&').filter(Boolean).map((x) => x.split('=').map((y) => decodeURIComponent(y.replace(/\+/g, ' ')))))
      const f = q.$filter ? filterOf(q.$filter) : []
      if (!f) return done(dvError(400, '0x80060888', `The query parameter $filter '${q.$filter}' is not supported in the lab.`)) // lab-made: eq and 'and' only
      let rows = tbl.rows.filter((r) => f.every(([k, v]) => word(r[k]).toLowerCase() === v.toLowerCase()))
      if (q.$top) rows = rows.slice(0, Number(q.$top) || 0)
      const sel = q.$select ? q.$select.split(',').map(word) : null
      const value = rows.map((r) => {
        const p = plain(table, r)
        return sel ? Object.fromEntries(Object.entries(p).filter(([k]) => k === d.id || sel.includes(k))) : p
      })
      return done({ ok: true, status: 200, code: '', body: { '@odata.context': `${ORG_URL}${API_PATH}/$metadata#${d.set}`, value }, headers: {}, ms: 50 + rows.length })
    }
    if (verb === 'POST') {
      const bad = need('Create') ?? check(body) ?? clash(body)
      if (bad) return bad
      const row = create(body)
      return done(answer(row, 201))
    }
    return done(dvError(405, '0x80060888', `The HTTP method '${verb}' is not allowed on the collection ${d.set}.`)) // lab-made wording
  }

  const key = parseKey(seg[2])
  if (!key) return done(dvError(400, '0x80060888', `Bad Request: error in query syntax.`))
  let row
  if (key.id) row = tbl.rows.find((r) => r[d.id] === key.id)
  else {
    const cols = Object.keys(key.pairs)
    const k = tbl.keys.find((x) => x.cols.length === cols.length && x.cols.every((c) => cols.includes(c)))
    // lab-made wording for a key that is not defined or not active yet
    if (!k) return done(dvError(400, '0x80060888', `The key attribute${cols.length > 1 ? 's' : ''} ${cols.join(', ')} of entity ${table} is not a valid alternate key. Define an alternate key with ${cols.length > 1 ? 'these columns' : 'this column'} first.`))
    if (k.status !== 'Active') return done(dvError(400, '0x80060888', `The alternate key ${k.name} of entity ${table} is not active (status ${k.status}).`))
    row = tbl.rows.find((r) => cols.every((c) => word(r[c]).toLowerCase() === word(key.pairs[c]).toLowerCase()))
  }
  const missing = () => done(dvError(404, '0x80040217', key.id ? `${table} With Id = ${key.id} Does Not Exist` : `A record with the specified key values does not exist in ${table} entity`))
  if (verb === 'GET') {
    const bad = need('Read')
    if (bad) return bad
    return row ? done({ ok: true, status: 200, code: '', body: plain(table, row), headers: {}, ms: 40 }) : missing()
  }
  if (verb === 'DELETE') {
    const bad = need('Delete')
    if (bad) return bad
    if (!row) return missing()
    tbl.rows.splice(tbl.rows.indexOf(row), 1)
    return done({ ok: true, status: 204, code: '', body: '', headers: {}, ms: 50 })
  }
  if (verb === 'PATCH') {
    // PATCH is an upsert: it updates the row the id or key names, or creates it. If-Match: * stops the create,
    // If-None-Match: * stops the update.
    if (row && header(headers, 'If-None-Match') === '*') return done(dvError(412, '0x80040237', 'A record with matching key values already exists.'))
    if (!row && header(headers, 'If-Match') === '*') return missing()
    const bad = check(body)
    if (bad) return bad
    if (row) {
      const b2 = need('Write') ?? clash({ ...row, ...body }, row)
      if (b2) return b2
      Object.assign(row, clean(body), { modifiedon: now, by: who })
      return done(answer(row, 204))
    }
    const b3 = need('Create') ?? check({ ...body, ...(key.pairs ?? {}) }) ?? clash({ ...body, ...(key.pairs ?? {}) })
    if (b3) return b3
    const created = create({ ...body, ...(key.pairs ?? {}) })
    if (key.id) created[d.id] = key.id
    return done(answer(created, 201))
  }
  return done(dvError(405, '0x80060888', `The HTTP method '${verb}' is not allowed here.`)) // lab-made wording
}

// ---------- Microsoft Graph ----------

const gError = (status, code, message, headers = {}) => ({ ok: false, status, code, body: { error: { code, message, innerError: { date: '2026-11-03T09:00:00', 'request-id': guidOf(`req:${message}`) } } }, headers, ms: 50 })
const siteAccess = (m, roles, site, appId, write) => {
  if ((write ? WRITE_ALL : READ_ALL).some((r) => roles.includes(r))) return true
  if (!roles.includes('Sites.Selected')) return false
  const g = site.grants[appId]
  return write ? g === 'write' : g === 'read' || g === 'write'
}
const driveItem = (site, drive, x) => ({ id: x.id, name: x.name.split('/').at(-1), size: x.size, lastModifiedDateTime: iso(x.t), webUrl: `https://${SP_HOST}/sites/${site.name}/${encodeURIComponent(drive.name)}/${x.name}`, file: { mimeType: x.name.endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream' }, parentReference: { driveId: drive.id, siteId: site.id } })
const sizeOf = (body, headers) => Number(body?.size ?? header(headers, 'Content-Length') ?? 0) || 0

// throttling per app: a window of one lab minute. Lab-made numbers; real limits differ by service and tenant.
function admit(m, who, now, call) {
  const q = (m.quota[who] ??= { w: 0, n: 0, until: 0 })
  if (q.until > now) {
    // a call that arrives before Retry-After has passed keeps the app throttled for longer
    if (call) q.until = Math.min(q.until + EXTRA, now + MAX_PENALTY)
    return Math.ceil((q.until - now) / 1000)
  }
  const w = Math.floor(now / MINUTE) * MINUTE
  if (q.w !== w) Object.assign(q, { w, n: 0 })
  q.n++
  if (q.n > (m.limit ?? DEFAULT_LIMIT)) {
    q.until = now + PENALTY
    return Math.ceil(PENALTY / 1000)
  }
  return 0
}
const throttled = (wait) => gError(429, 'activityLimitReached', 'The request has been throttled', { 'Retry-After': String(wait) })

function uploadCall(s, m, who, method, url, body, headers) {
  const now = s.clock ?? 0
  const verb = word(method).toUpperCase()
  const sid = (word(url).match(/guid='([^']+)'/) ?? [])[1]
  const x = sid && m.sessions[sid]
  const done = (r) => {
    log(m, { t: now, who, api: 'sharepoint', m: verb, p: `uploadSession ${x?.name ?? ''} ${header(headers, 'Content-Range')}`.trim(), st: r.status, c: r.code ?? '' })
    return r
  }
  if (!x) return done(gError(404, 'itemNotFound', 'The upload session was not found. It may have expired or been cancelled.'))
  const found = driveOf(m, x.drive)
  const state = () => ({ expirationDateTime: iso(x.t + DAY), nextExpectedRanges: [`${x.next}-${x.size ? x.size - 1 : ''}`] })
  if (verb === 'GET') return done({ ok: true, status: 200, code: '', body: state(), headers: {}, ms: 20 })
  if (verb === 'DELETE') {
    delete m.sessions[sid]
    return done({ ok: true, status: 204, code: '', body: '', headers: {}, ms: 20 })
  }
  if (verb !== 'PUT') return done(gError(405, 'invalidRequest', 'Only PUT, GET and DELETE work on an upload URL.')) // lab-made wording
  const range = header(headers, 'Content-Range').match(/^bytes\s+(\d+)-(\d+)\/(\d+)$/i)
  if (!range) return done(gError(400, 'invalidRequest', 'The Content-Range header is missing or malformed. Use bytes start-end/total.'))
  const [from, to, total] = range.slice(1).map(Number)
  const len = to - from + 1
  if (len > MAX_FRAGMENT) return done(gError(413, 'requestEntityTooLarge', `The fragment is ${len} bytes. A fragment can be at most 60 MiB (62,914,560 bytes).`)) // lab-made wording
  if (x.size && total !== x.size) return done(gError(400, 'invalidRange', `The total size ${total} does not match the size of the session, ${x.size}.`))
  x.size ||= total
  if (from !== x.next) return done({ ...gError(416, 'invalidRange', 'The uploaded fragment overlaps with data that has already been received, or skips bytes.'), body: { error: { code: 'invalidRange', message: 'Requested Range Not Satisfiable' }, nextExpectedRanges: [`${x.next}-`] } })
  const last = to + 1 >= x.size
  // lab-made: the lab refuses the first fragment that breaks the 320 KiB rule; the real service may fail later, at the commit
  if (!last && len % FRAGMENT !== 0) return done(gError(400, 'invalidRange', `The fragment is ${len} bytes. Each fragment except the last must be a multiple of 320 KiB (327,680 bytes).`))
  x.next = to + 1
  x.t = now
  if (!last) return done({ ok: true, status: 202, code: '', body: state(), headers: {}, ms: 30 + Math.round((len / MIB) * 25) })
  delete m.sessions[sid]
  if (!found) return done(gError(404, 'itemNotFound', 'The drive of the upload session no longer exists.'))
  const item = newItem(found.drive, x.name, x.size, now, who)
  return done({ ok: true, status: 201, code: '', body: driveItem(found.site, found.drive, item), headers: {}, ms: 40 + Math.round((len / MIB) * 25) })
}

function graphCall(s, m, who, token, method, path, body, headers, inner = false) {
  const now = s.clock ?? 0
  const verb = word(method).toUpperCase()
  let p = word(path)
  if (p.startsWith(`https://${SP_HOST}/`)) return uploadCall(s, m, who, verb, p, body, headers)
  p = p.replace(GRAPH_URL, '')
  const done = (r) => {
    if (!inner) log(m, { t: now, who, api: 'graph', m: verb, p: p.slice(0, 120), st: r.status, c: r.code ?? '' })
    else log(m, { t: now, who, api: 'graph', m: verb, p: `$batch: ${p.slice(0, 110)}`, st: r.status, c: r.code ?? '' })
    return r
  }
  const c = claimsOf(token)
  if (!c) return done(gError(401, 'InvalidAuthenticationToken', 'Access token is empty.'))
  if (c.exp <= now) return done(gError(401, 'InvalidAuthenticationToken', 'Lifetime validation failed, the token is expired.'))
  if (c.aud !== GRAPH_URL) return done(gError(401, 'InvalidAuthenticationToken', 'Access token validation failure. Invalid audience.'))
  if (!c.roles?.length) return done(gError(401, 'InvalidAuthenticationToken', 'Either scp or roles claim need to be present in the token.'))
  if (!p.startsWith('/v1.0/')) return done(gError(400, 'BadRequest', `Invalid version: ${p.split('/')[1] ?? ''}`))
  const [rest, query = ''] = p.slice(5).split('?')

  if (rest === '/$batch' && verb === 'POST' && !inner) {
    const list = Array.isArray(body?.requests) ? body.requests : null
    if (!list || !list.length) return done(gError(400, 'BadRequest', 'Invalid batch payload format.'))
    if (list.length > BATCH_MAX) return done(gError(400, 'BadRequest', `Batch request has more than the maximum ${BATCH_MAX} requests.`)) // lab-made wording
    // the batch is one HTTP call; each request inside it counts against the throttling limits on its own
    const wait = admitCall(m, who, now)
    m.hits[who] ??= { n: 0, th: 0, last429: null, batch: null }
    m.hits[who].batch = now
    const responses = list.map((x, i) => {
      const id = word(x.id) || String(i + 1)
      if (wait) {
        log(m, { t: now, who, api: 'graph', m: word(x.method).toUpperCase(), p: `$batch: ${word(x.url).slice(0, 110)}`, st: 429, c: 'activityLimitReached' })
        return { id, status: 429, headers: { 'Retry-After': String(wait) }, body: throttled(wait).body }
      }
      const r = graphCall(s, m, who, token, x.method, `/v1.0${word(x.url).startsWith('/') ? '' : '/'}${word(x.url)}`, x.body, x.headers, true)
      return { id, status: r.status, headers: r.headers, body: r.body }
    })
    log(m, { t: now, who, api: 'graph', m: 'POST', p: `/v1.0/$batch (${list.length} requests)`, st: 200, c: '' })
    return { ok: true, status: 200, code: '', body: { responses }, headers: {}, ms: 90 + list.length * 15 }
  }
  const wait = inner ? admit(m, who, now, false) : admitCall(m, who, now)
  if (wait) return done(throttled(wait))

  let x
  // GET /sites/{hostname}:/sites/{path}
  if ((x = rest.match(/^\/sites\/([^/:]+):\/sites\/([^/:]+):?$/))) {
    const site = x[1] === SP_HOST && m.sites.find((y) => y.name.toLowerCase() === decodeURIComponent(x[2]).toLowerCase())
    if (!site) return done(gError(404, 'itemNotFound', 'Requested site could not be found'))
    if (!siteAccess(m, c.roles, site, c.appid, false)) return done(gError(403, 'accessDenied', 'Access denied'))
    return done({ ok: true, status: 200, code: '', body: { id: site.id, name: site.name, displayName: site.name, webUrl: `https://${SP_HOST}/sites/${site.name}` }, headers: {}, ms: 70 })
  }
  if ((x = rest.match(/^\/sites\/([^/]+)(\/drives)?$/))) {
    const site = siteOf(m, decodeURIComponent(x[1]))
    if (!site) return done(gError(404, 'itemNotFound', 'Requested site could not be found'))
    if (!siteAccess(m, c.roles, site, c.appid, false)) return done(gError(403, 'accessDenied', 'Access denied'))
    if (!x[2]) return done({ ok: true, status: 200, code: '', body: { id: site.id, name: site.name, displayName: site.name, webUrl: `https://${SP_HOST}/sites/${site.name}` }, headers: {}, ms: 60 })
    return done({ ok: true, status: 200, code: '', body: { value: site.drives.map((d) => ({ id: d.id, name: d.name, driveType: 'documentLibrary', webUrl: `https://${SP_HOST}/sites/${site.name}/${encodeURIComponent(d.name)}` })) }, headers: {}, ms: 70 })
  }
  if (!(x = rest.match(/^\/drives\/([^/]+)(\/.*)?$/))) return done(gError(400, 'BadRequest', `Resource not found for the segment '${rest.split('/')[1] ?? ''}'.`))
  const found = driveOf(m, decodeURIComponent(x[1]))
  if (!found) return done(gError(404, 'itemNotFound', 'The resource could not be found.'))
  const { site, drive } = found
  const sub = x[2] ?? ''
  const writing = verb !== 'GET'
  if (!siteAccess(m, c.roles, site, c.appid, writing)) return done(gError(403, 'accessDenied', 'Access denied'))
  if (sub === '' && verb === 'GET') return done({ ok: true, status: 200, code: '', body: { id: drive.id, name: drive.name, driveType: 'documentLibrary' }, headers: {}, ms: 50 })
  if (sub === '/root/children' && verb === 'GET') {
    const top = Number((query.match(/\$top=(\d+)/) ?? [])[1]) || 200
    return done({ ok: true, status: 200, code: '', body: { value: drive.items.slice(0, top).map((i) => driveItem(site, drive, i)), ...(drive.items.length > top && { '@odata.nextLink': `${GRAPH_URL}/v1.0/drives/${drive.id}/root/children?$skiptoken=${top}` }) }, headers: {}, ms: 80 + Math.min(top, drive.items.length) })
  }
  if ((x = sub.match(/^\/items\/([^/]+)$/))) {
    const item = drive.items.find((i) => i.id === x[1])
    if (!item) return done(gError(404, 'itemNotFound', 'The resource could not be found.'))
    if (verb === 'GET') return done({ ok: true, status: 200, code: '', body: driveItem(site, drive, item), headers: {}, ms: 45 })
    if (verb === 'DELETE') {
      drive.items.splice(drive.items.indexOf(item), 1)
      return done({ ok: true, status: 204, code: '', body: '', headers: {}, ms: 45 })
    }
  }
  if ((x = sub.match(/^\/root:\/(.+?)(:\/content|:\/createUploadSession|:)?$/))) {
    const name = decodeURIComponent(x[1]).replace(/^\/+|\/+$/g, '')
    const op = x[2] ?? ''
    if (!name) return done(gError(400, 'invalidRequest', 'The item path is empty.'))
    if (op === ':/content' && verb === 'PUT') {
      const size = sizeOf(body, headers)
      // lab: the long documented limit of a simple upload; above it use an upload session
      if (size > SIMPLE_LIMIT) return done(gError(413, 'requestEntityTooLarge', `The request body is ${size} bytes. A simple upload takes at most 4 MB (4,194,304 bytes); use createUploadSession for larger files.`)) // lab-made wording
      const item = newItem(drive, name, size, now, who)
      return done({ ok: true, status: 201, code: '', body: driveItem(site, drive, item), headers: {}, ms: 90 + Math.round((size / MIB) * 60) })
    }
    if (op === ':/createUploadSession' && verb === 'POST') {
      const conflict = body?.item?.['@microsoft.graph.conflictBehavior'] ?? 'replace'
      if (conflict === 'fail' && drive.items.some((i) => i.name === name)) return done(gError(409, 'nameAlreadyExists', 'The specified item name already exists.'))
      const sid = next(m, 'upload').replace(/-/g, '')
      m.sessions[sid] = { drive: drive.id, name, size: Number(body?.item?.fileSize ?? 0) || 0, next: 0, t: now, who }
      return done({ ok: true, status: 200, code: '', body: { uploadUrl: `https://${SP_HOST}/sites/${site.name}/_api/v2.0/drives/${drive.id}/items/root:/${encodeURIComponent(name)}:/uploadSession?guid='${sid}'&overwrite=True&tempauth=lab`, expirationDateTime: iso(now + DAY), nextExpectedRanges: ['0-'] }, headers: {}, ms: 70 })
    }
    if (op !== ':/content' && op !== ':/createUploadSession' && verb === 'GET') {
      const item = drive.items.find((i) => i.name === name)
      return item ? done({ ok: true, status: 200, code: '', body: driveItem(site, drive, item), headers: {}, ms: 45 }) : done(gError(404, 'itemNotFound', 'The resource could not be found.'))
    }
  }
  return done(gError(400, 'invalidRequest', `The request ${verb} ${rest} is not supported in the lab.`)) // lab-made wording
}
// one HTTP call: counts, or extends the penalty when it ignores Retry-After
function admitCall(m, who, now) {
  return admit(m, who, now, true)
}

// ---------- helpers for the sample apps ----------

// The token cache an app keeps: a new token only when the cached one has less than 5 minutes left
export function tokenFor(api, store, cfg, now, scope) {
  const key = scope === GRAPH_SCOPE ? 'tokGraph' : 'tokDv'
  const c = store[key]
  if (c && c.exp - 5 * MINUTE > now) return { ok: true, token: c.v }
  const r = api.token({ ...cfg, scope })
  if (!r.ok) return r
  store[key] = { v: r.body.access_token, exp: now + r.body.expires_in * 1000 }
  return { ok: true, token: r.body.access_token }
}
const REASONS = { 400: 'bad request', 401: 'unauthorized', 403: 'forbidden', 404: 'not found', 405: 'method not allowed', 409: 'conflict', 412: 'precondition failed', 413: 'payload too large', 416: 'range not satisfiable', 429: 'too many requests', 500: 'internal server error', 503: 'service unavailable' }
const TYPES = { 400: 'HTTP:BAD_REQUEST', 401: 'HTTP:UNAUTHORIZED', 403: 'HTTP:FORBIDDEN', 404: 'HTTP:NOT_FOUND', 405: 'HTTP:METHOD_NOT_ALLOWED', 429: 'HTTP:TOO_MANY_REQUESTS', 500: 'HTTP:INTERNAL_SERVER_ERROR', 503: 'HTTP:SERVICE_UNAVAILABLE' }
// the Mule error type of a failed HTTP request. Lab-made: statuses Mule has no own type for (409, 412, 413, 416) map to HTTP:BAD_REQUEST.
export const httpType = (status) => TYPES[status] ?? (status >= 500 ? 'HTTP:INTERNAL_SERVER_ERROR' : 'HTTP:BAD_REQUEST')
export const httpMessage = (method, url, r) => `HTTP ${method} on resource '${url}' failed: ${REASONS[r.status] ?? 'error'} (${r.status}).`
export const errorText = (r) => (typeof r.body === 'object' ? (r.body?.error_description ?? r.body?.error?.message ?? '') : '') || `HTTP ${r.status}`
export const clockText = (t) => iso(t).slice(11, 19)
export const isoTime = iso

// ---------- the ctx hook ----------

// The engine calls this for each run of an app with its draft state: the calls change `s` in place.
export function msgraphCtx(s, app) {
  const who = app?.name ?? 'app'
  const sys = () => (s.msgraph = fillMsgraph(s.msgraph, s.clock ?? 0))
  return {
    token: (cfg) => token(s, sys(), who, cfg),
    dataverse: (tok, method, path, body, headers) => dataverseCall(s, sys(), who, tok, method, path, body, headers),
    graph: (tok, method, path, body, headers) => graphCall(s, sys(), who, tok, method, path, body, headers),
  }
}

// ---------- the tick ----------

// runs once a lab minute while state.msgraph exists. Changes `s` in place.
export function msgraphTick(s) {
  const m = s?.msgraph
  if (!isFilled(m)) return s
  const now = s.clock ?? 0
  // Dataverse builds the index of a new alternate key in the background; it fails when the data has duplicates
  for (const [table, tbl] of Object.entries(m.dv.tables))
    for (const k of tbl.keys) {
      if (k.status !== 'Pending' || now - k.t < MINUTE) continue
      k.status = dupeRows(m, table, k.cols) ? 'Failed' : 'Active'
      k.t = now
    }
  // lab-made: an expiry notification of an app registration mails once per secret when the secret enters the window
  for (const reg of m.apps) {
    if (!reg.notify?.to) continue
    for (const x of reg.secrets) {
      if (reg.told.includes(x.id) || x.end - now > reg.notify.days * DAY) continue
      reg.told.push(x.id)
      s.mail?.push({
        t: now,
        to: reg.notify.to,
        subject: `${now >= x.end ? 'Expired' : 'Expiring'} client secret on ${reg.name}`,
        body: `The client secret "${x.desc}" (ID ${x.id}) of the app registration ${reg.name} (${reg.appId}) ${now >= x.end ? 'has expired' : `expires within ${reg.notify.days} days`}. Add a new secret, update the apps that use it, then delete the old one. Brightmart Entra ID notifications`,
        source: 'Microsoft Entra ID',
      })
      if (s.mail?.length > 40) s.mail.shift()
    }
  }
  // upload sessions without a fragment for a day expire
  for (const [id, x] of Object.entries(m.sessions)) if (now - x.t > DAY) delete m.sessions[id]
  return s
}
const dupeRows = (m, table, cols) => {
  const seen = new Set()
  for (const r of rowsOf(m, table)) {
    const v = cols.map((c) => word(r[c]).toLowerCase())
    if (v.some((x) => !x)) continue
    const k = v.join('|')
    if (seen.has(k)) return true
    seen.add(k)
  }
  return false
}

// ---------- screen actions (pure: state in, new state out) ----------

const edit = (state, fn) => {
  const s = structuredClone(state)
  s.msgraph = fillMsgraph(s.msgraph, s.clock ?? 0)
  const result = fn(s, s.msgraph, s.clock ?? 0)
  return { state: s, result }
}
const only = (r) => r.state
export const upgradeMsgraph = (state) => (isFilled(state?.msgraph) ? state : only(edit(state, () => null)))

// Entra ID: App registrations, New registration
export const registerApp = (state, name) =>
  edit(state, (s, m, now) => {
    const n = word(name)
    if (!n) return { error: 'Enter a display name.' }
    if (m.apps.some((a) => a.name.toLowerCase() === n.toLowerCase())) return { error: `An app registration named ${n} already exists.` } // lab-made: Entra allows duplicate names
    // a new registration gets the delegated permission User.Read of Microsoft Graph, as in Entra ID
    return { appId: newRegistration(m, { name: n, t: now, perms: [{ api: 'Microsoft Graph', name: 'User.Read', type: 'Delegated' }] }).appId }
  })
export const deleteRegistration = (state, appId) =>
  edit(state, (s, m) => {
    m.apps = m.apps.filter((a) => a.appId !== appId)
    return true
  })
// Certificates & secrets, New client secret. The value shows once; the result carries it.
export const addSecret = (state, appId, { desc, days }) =>
  edit(state, (s, m, now) => {
    const reg = regOf(m, appId)
    if (!reg) return null
    if (reg.secrets.length >= 10) return { error: 'An app registration in the lab holds at most 10 secrets.' } // lab-made limit
    const x = { id: next(m, 'secret'), desc: word(desc) || 'client secret', value: secretValue(`${appId}:${m.n}`), start: now, end: now + (Number(days) || 180) * DAY }
    reg.secrets.push(x)
    return { id: x.id, value: x.value }
  })
export const removeSecret = (state, appId, id) =>
  edit(state, (s, m) => {
    const reg = regOf(m, appId)
    if (!reg) return false
    reg.secrets = reg.secrets.filter((x) => x.id !== id)
    return true
  })
// Certificates: lab-made, the upload names a certificate and its expiry and the lab makes the thumbprint
export const addCert = (state, appId, { desc, days }) =>
  edit(state, (s, m, now) => {
    const reg = regOf(m, appId)
    if (!reg) return null
    const c = { thumb: thumbOf(`${appId}:${m.n++}`), desc: word(desc) || 'CN=brightmart-mule', start: now, end: now + (Number(days) || 365) * DAY }
    reg.certs.push(c)
    return c.thumb
  })
export const removeCert = (state, appId, thumb) =>
  edit(state, (s, m) => {
    const reg = regOf(m, appId)
    if (reg) reg.certs = reg.certs.filter((c) => c.thumb !== thumb)
    return true
  })
// API permissions: Add a permission, Remove permission, Grant admin consent
export const addPermission = (state, appId, p) =>
  edit(state, (s, m) => {
    const reg = regOf(m, appId)
    const known = PERMISSIONS[p?.api]?.some(([n, t]) => n === p.name && t === p.type)
    if (!reg || !known || reg.perms.some((x) => permKey(x) === permKey(p))) return false
    reg.perms.push({ api: p.api, name: p.name, type: p.type })
    return true
  })
export const removePermission = (state, appId, key) =>
  edit(state, (s, m) => {
    const reg = regOf(m, appId)
    if (!reg) return false
    reg.perms = reg.perms.filter((x) => permKey(x) !== key)
    reg.granted = reg.granted.filter((x) => x !== key)
    return true
  })
export const grantConsent = (state, appId) =>
  edit(state, (s, m) => {
    const reg = regOf(m, appId)
    if (!reg) return false
    reg.granted = reg.perms.map(permKey)
    return true
  })
export const revokeConsent = (state, appId) =>
  edit(state, (s, m) => {
    const reg = regOf(m, appId)
    if (reg) reg.granted = []
    return true
  })
// lab-made: a notification before a credential expires (in a real tenant: a script, Logic App or alert on the app's credentials)
export const setNotify = (state, appId, { days, to }) =>
  edit(state, (s, m) => {
    const reg = regOf(m, appId)
    if (!reg) return false
    const d = Number(days)
    reg.notify = word(to) && d > 0 ? { days: d, to: word(to) } : null
    reg.told = []
    return true
  })

// Dataverse: Power Platform admin center, Application users
export const createAppUser = (state, appId, roles = []) =>
  edit(state, (s, m, now) => {
    const reg = regOf(m, appId)
    if (!reg) return { error: 'Pick an app registration of the tenant.' }
    if (appUserOf(m, appId)) return { error: `${reg.name} is already an application user.` }
    m.dv.users.push({ id: guidOf(`user:${appId}`), appId, name: reg.name, roles: roles.filter((r) => m.dv.roles[r]), t: now })
    return { ok: true }
  })
export const setUserRoles = (state, appId, roles) =>
  edit(state, (s, m) => {
    const u = appUserOf(m, appId)
    if (!u) return false
    u.roles = roles.filter((r) => m.dv.roles[r])
    return true
  })
export const removeAppUser = (state, appId) =>
  edit(state, (s, m) => {
    m.dv.users = m.dv.users.filter((u) => u.appId !== appId)
    return true
  })
// Security roles: a custom role with privileges per table. Lab-made: every privilege is at Organization level.
export const saveRole = (state, name, privs) =>
  edit(state, (s, m) => {
    const n = word(name)
    if (!n) return { error: 'Enter a role name.' }
    if (m.dv.roles[n]?.system) return { error: `${n} is a system role and cannot be changed in the lab.` }
    const clean = {}
    for (const [t, list] of Object.entries(privs ?? {})) if (TABLES[t] && list?.length) clean[t] = PRIVS.filter((p) => list.includes(p))
    m.dv.roles[n] = { system: false, privs: clean }
    return { ok: true }
  })
export const deleteRole = (state, name) =>
  edit(state, (s, m) => {
    if (!m.dv.roles[name] || m.dv.roles[name].system) return false
    delete m.dv.roles[name]
    for (const u of m.dv.users) u.roles = u.roles.filter((r) => r !== name)
    return true
  })
// Tables, Keys: New key. The index is built in the background: Pending, then Active or Failed.
export const addKey = (state, table, { name, cols }) =>
  edit(state, (s, m, now) => {
    const tbl = m.dv.tables[table]
    const list = [].concat(cols).filter((c) => c in (TABLES[table]?.cols ?? {}))
    if (!tbl || !list.length) return { error: 'Pick at least one column.' }
    if (keyOn(m, table, list)) return { error: 'A key with these columns exists already.' }
    if (tbl.keys.length >= 10) return { error: 'A table can have at most 10 alternate keys.' }
    tbl.keys.push({ name: word(name) || `brightmart_${list.join('_')}_key`, cols: list, status: 'Pending', t: now })
    return { ok: true }
  })
export const reactivateKey = (state, table, name) =>
  edit(state, (s, m, now) => {
    const k = keysOf(m, table).find((x) => x.name === name)
    if (!k || k.status !== 'Failed') return false
    Object.assign(k, { status: 'Pending', t: now })
    return true
  })
export const deleteKey = (state, table, name) =>
  edit(state, (s, m) => {
    const tbl = m.dv.tables[table]
    if (tbl) tbl.keys = tbl.keys.filter((k) => k.name !== name)
    return true
  })
export const deleteRows = (state, table, ids) =>
  edit(state, (s, m) => {
    const tbl = m.dv.tables[table]
    const id = TABLES[table]?.id
    if (!tbl) return 0
    const n = tbl.rows.length
    tbl.rows = tbl.rows.filter((r) => !ids.includes(r[id]))
    return n - tbl.rows.length
  })
// SharePoint: the site permission an admin grants for Sites.Selected (POST /sites/{id}/permissions in Graph)
export const grantSite = (state, siteId, appId, role) =>
  edit(state, (s, m) => {
    const site = siteOf(m, siteId)
    if (!site || !regOf(m, appId)) return false
    if (role) site.grants[appId] = role === 'write' ? 'write' : 'read'
    else delete site.grants[appId]
    return true
  })

export const defaultMsgraph = (now) => ({ created: now })
