// Snowflake: account HARBOR-DW with virtual warehouses (size, AUTO_SUSPEND, AUTO_RESUME, credits), resource monitors,
// databases, schemas, tables and views, internal and external stages with files, file formats, COPY INTO with ON_ERROR,
// VALIDATION_MODE and the load metadata, MERGE, INSERT, UPDATE, DELETE, roles with grants, key pair users, the query
// history with the Snowflake error codes and the copy history. A small SQL parser of its own runs the statements.
// Pure and import free. Lives in state.snowflake.
//
// State shape (state.snowflake, once filled; the open console seeds only { created } and fillSnowflake builds the rest
// on first use):
//   account, created, n (counter),
//   warehouses: { LOAD_WH: { size, state: 'STARTED' | 'SUSPENDED', autoSuspend (seconds, 0 = never), autoResume,
//                 monitor, credits, startedAt, lastUsed, suspendedBy, owner, log: [{ t, text }] } },
//   monitors: { LOAD_MONITOR: { quota, used, frequency, triggers: [{ pct, action }], fired: [pct] } },
//   dbs: { HARBOR_DW: { owner, schemas: { RAW: { tables: { ORDERS: { cols: [{ name, type }], rows: [[...]], owner } },
//          views: { V: { sql, owner } }, stages: { S: { url, format, inline, files: { name: { content, size, md5, t } } } },
//          formats: { F: { type, skipHeader, delimiter, enclosedBy, nullIf, emptyAsNull, mismatch, trim, skipBlank } } } } } },
//   roles: { LOADER: { grants: [{ priv, kind, name }], roles: [granted role names], builtin } },
//   users: { MULE_ETL: { type: 'PERSON' | 'SERVICE', password, rsa, defaultRole, defaultWarehouse, defaultNamespace,
//            roles: [], lastLogin: { t, client }, lastFail: { t, client, text } } },
//   meta: { 'DB.SCHEMA.TABLE|DB.SCHEMA.STAGE|file': { md5, t, status, rows } }  (the load metadata, 64 days)
//   queries: [{ id, t, user, role, wh, sql, ok, code, state, error, rows, ms, client, first }]
//   copies: [{ t, table, stage, file, status, parsed, loaded, errors, first, user, qid }]
//   rejects: { 'DB.SCHEMA.TABLE': { qid, session, rows: [error rows] } }  (what VALIDATE returns for the last load)
//   logins: [{ t, user, client, ok, text }]
//   ws: { role, wh, db, schema, text } (the Snowsight worksheet of HARBOR_ADMIN)
//
// ctx.snowflake (see snowflakeCtx) takes the connector configuration as cfg: { account, user, privateKey, password,
// role, warehouse, database, schema } (cfgOf builds it from the snowflake.* properties of an app).
//   execute(cfg, sql)               runs one or more statements in a new session. { ok, cols, rows, rowCount, qid, ms,
//                                   message, stats } or { ok: false, type, code, state, error, text, ms }.
//   put(cfg, stage, file)           PUT of { name, content } to an internal stage, compressed to name.gz like the
//                                   JDBC driver does. { ok, status: 'UPLOADED' | 'SKIPPED', target, ms }.
// Lab-made error types: SNOWFLAKE:CONNECTIVITY for a failed login, SNOWFLAKE:QUERY_EXECUTION for a failed statement.

export const ACCOUNT = 'HARBOR-DW'
export const SF_HOST = 'harbor-dw.snowflakecomputing.com'
export const ADMIN_USER = 'HARBOR_ADMIN'
export const OPS_MAIL = 'ops@harbor.example'
const MINUTE = 60000
const DAY = 1440 * MINUTE
const BASE = Date.UTC(2026, 10, 2)
// lab-made limits, so a saved console stays small
const MAX_QUERIES = 80
const MAX_COPIES = 80
const MAX_REJECTS = 20
const MAX_LOGINS = 20
// the load metadata of a table is kept for 64 days
export const META_DAYS = 64
// credits per hour of each warehouse size (standard warehouses)
export const SIZES = { XSMALL: 1, SMALL: 2, MEDIUM: 4, LARGE: 8, XLARGE: 16, XXLARGE: 32 }
export const SIZE_TEXT = { XSMALL: 'X-Small', SMALL: 'Small', MEDIUM: 'Medium', LARGE: 'Large', XLARGE: 'X-Large', XXLARGE: '2X-Large' }
const SIZE_ALIAS = { 'X-SMALL': 'XSMALL', 'X-LARGE': 'XLARGE', '2X-LARGE': 'XXLARGE', '2XLARGE': 'XXLARGE' }
export const BUILTIN_ROLES = ['ACCOUNTADMIN', 'SECURITYADMIN', 'USERADMIN', 'SYSADMIN', 'PUBLIC']
const KIND_TEXT = { TABLE: 'Table', VIEW: 'View', STAGE: 'Stage', 'FILE FORMAT': 'File format', WAREHOUSE: 'Warehouse', DATABASE: 'Database', SCHEMA: 'Schema' }
// the privileges each object type takes in a GRANT
const VALID = {
  ACCOUNT: ['CREATE WAREHOUSE', 'CREATE DATABASE', 'CREATE ROLE', 'CREATE USER', 'MONITOR USAGE', 'ALL'],
  WAREHOUSE: ['USAGE', 'OPERATE', 'MODIFY', 'MONITOR', 'OWNERSHIP', 'ALL'],
  DATABASE: ['USAGE', 'MONITOR', 'CREATE SCHEMA', 'OWNERSHIP', 'ALL'],
  SCHEMA: ['USAGE', 'MONITOR', 'MODIFY', 'CREATE TABLE', 'CREATE VIEW', 'CREATE STAGE', 'CREATE FILE FORMAT', 'OWNERSHIP', 'ALL'],
  TABLE: ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'OWNERSHIP', 'ALL'],
  VIEW: ['SELECT', 'REFERENCES', 'OWNERSHIP', 'ALL'],
  STAGE: ['READ', 'WRITE', 'USAGE', 'OWNERSHIP', 'ALL'],
  'FILE FORMAT': ['USAGE', 'OWNERSHIP', 'ALL'],
}
export const ADMIN_ROLES = ['ACCOUNTADMIN', 'SECURITYADMIN', 'SYSADMIN', 'USERADMIN']

// ---------- small helpers ----------

const p2 = (n) => String(n).padStart(2, '0')
export const tsText = (t) => {
  const d = new Date(BASE + t)
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())}`
}
export const fileStamp = (t) => tsText(t).replace(/[-: ]/g, '').slice(0, 12)
const hash = (text, n = 32) => {
  let h = 2166136261
  let out = ''
  for (let i = 0; out.length < n; i++) {
    for (const ch of `${text}:${i}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0
    out += h.toString(16).padStart(8, '0')
  }
  return out.slice(0, n)
}
const round = (x, d = 6) => Math.round(x * 10 ** d) / 10 ** d
const word = (v) => String(v ?? '').trim()
const up = (v) => word(v).toUpperCase()
const push = (list, entry, max) => {
  list.push(entry)
  if (list.length > max) list.splice(0, list.length - max)
}
const bool = (v) => v === true || up(v) === 'TRUE'
const E = (code, state, msg) => ({ sf: true, code, state, msg })
const fail = (code, state, msg) => {
  throw E(code, state, msg)
}
export const errText = (e) => `${e.code} (${e.state}): ${e.msg}`
const lab = (msg) => fail('000002', '0A000', `Unsupported feature: ${msg}`) // lab-made: something the lab does not model

// Lab-made key pair: the lab stands for a private key with a plain string, and its public key is derived from it.
// A real key pair comes from openssl genrsa and openssl rsa -pubout.
export const publicKeyOf = (priv) => {
  const k = String(priv ?? '').replace(/\s+/g, '')
  return k ? `MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA${hash(`pub:${k}`, 28)}IDAQAB` : ''
}
const normKey = (v) => String(v ?? '').replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '')
export const fingerprintOf = (pub) => (pub ? `SHA256:${hash(`fp:${pub}`, 40)}` : null)

// the connector configuration from the snowflake.* properties of an app
export const cfgOf = (p = {}) => ({
  account: p['snowflake.account'],
  user: p['snowflake.user'],
  privateKey: p['snowflake.privateKey'],
  password: p['snowflake.password'],
  role: p['snowflake.role'],
  warehouse: p['snowflake.warehouse'],
  database: p['snowflake.database'],
  schema: p['snowflake.schema'],
})

// ---------- the account ----------

const newSchema = () => ({ tables: {}, views: {}, stages: {}, formats: {} })
export function newSnowflake(now = 0) {
  return {
    created: now,
    account: ACCOUNT,
    n: 4100,
    warehouses: {
      COMPUTE_WH: { size: 'XSMALL', state: 'SUSPENDED', autoSuspend: 600, autoResume: true, monitor: null, credits: 0, startedAt: null, lastUsed: null, suspendedBy: 'Auto suspend', owner: 'SYSADMIN', log: [] },
    },
    monitors: {},
    dbs: {},
    roles: Object.fromEntries(BUILTIN_ROLES.map((r) => [r, { grants: [], roles: r === 'ACCOUNTADMIN' ? ['SECURITYADMIN', 'SYSADMIN'] : r === 'SECURITYADMIN' ? ['USERADMIN'] : [], builtin: true }])),
    users: {
      [ADMIN_USER]: { type: 'PERSON', password: 'lab-admin-password', rsa: null, defaultRole: 'ACCOUNTADMIN', defaultWarehouse: 'COMPUTE_WH', defaultNamespace: null, roles: ['ACCOUNTADMIN', 'SYSADMIN', 'SECURITYADMIN', 'USERADMIN'], lastLogin: null, lastFail: null },
    },
    meta: {},
    queries: [],
    copies: [],
    rejects: {},
    logins: [],
    ws: { role: 'ACCOUNTADMIN', wh: 'COMPUTE_WH', db: null, schema: null, text: '' },
  }
}
const KEYS = Object.keys(newSnowflake())
export const isFilled = (y) => Boolean(y?.account)

// The account of the open console: the nightly orders load of Harbor with its role, service user, stage and format.
export const MULE_ETL_KEY = 'lab-only-private-key-mule-etl'
// the connector properties of the apps that load as MULE_ETL; the private key goes in as a protected property
export const ETL_PROPS = { 'snowflake.account': 'harbor-dw', 'snowflake.user': 'MULE_ETL', 'snowflake.role': 'LOADER', 'snowflake.warehouse': 'LOAD_WH', 'snowflake.database': 'HARBOR_DW', 'snowflake.schema': 'RAW' }
export const ETL_SECRETS = { 'snowflake.privateKey': MULE_ETL_KEY }
export function defaultSnowflakeSystem(now = 0) {
  const y = harborOrders(newSnowflake(now), now)
  addFile(y, 'HARBOR_DW.RAW.ORDERS_STAGE', 'orders_20261101.csv', ordersCsv(70001, '2026-11-01', 6), now - 30 * 60 * MINUTE)
  addFile(y, 'HARBOR_DW.RAW.ORDERS_STAGE', 'orders_20261102.csv', ordersCsv(70007, '2026-11-02', 6), now - 6 * 60 * MINUTE)
  script(y, 'COPY INTO HARBOR_DW.RAW.ORDERS FROM @HARBOR_DW.RAW.ORDERS_STAGE', now - 5 * 60 * MINUTE, { user: 'MULE_ETL', role: 'LOADER' })
  y.monitors.LOAD_MONITOR.used = 12.4
  return y
}
// The Harbor orders load: database HARBOR_DW, schema RAW, warehouse LOAD_WH under LOAD_MONITOR, table ORDERS, format
// CSV_ORDERS, stage ORDERS_STAGE, role LOADER and the service user MULE_ETL with its key pair. No files yet.
export function harborOrders(y, now = 0) {
  script(
    y,
    `CREATE DATABASE HARBOR_DW; CREATE SCHEMA HARBOR_DW.RAW;
    CREATE WAREHOUSE LOAD_WH WITH WAREHOUSE_SIZE = 'XSMALL' AUTO_SUSPEND = 60 AUTO_RESUME = TRUE INITIALLY_SUSPENDED = TRUE;
    CREATE RESOURCE MONITOR LOAD_MONITOR WITH CREDIT_QUOTA = 100 FREQUENCY = MONTHLY TRIGGERS ON 80 PERCENT DO NOTIFY ON 100 PERCENT DO SUSPEND;
    ALTER WAREHOUSE LOAD_WH SET RESOURCE_MONITOR = LOAD_MONITOR;
    CREATE TABLE HARBOR_DW.RAW.ORDERS (ORDER_ID NUMBER(10,0), ORDER_DATE DATE, CUSTOMER_ID VARCHAR(20), STORE VARCHAR(10), AMOUNT NUMBER(10,2));
    CREATE FILE FORMAT HARBOR_DW.RAW.CSV_ORDERS TYPE = CSV SKIP_HEADER = 1 FIELD_OPTIONALLY_ENCLOSED_BY = '"';
    CREATE STAGE HARBOR_DW.RAW.ORDERS_STAGE FILE_FORMAT = (FORMAT_NAME = 'HARBOR_DW.RAW.CSV_ORDERS');
    CREATE ROLE LOADER;
    GRANT USAGE ON WAREHOUSE LOAD_WH TO ROLE LOADER; GRANT USAGE ON DATABASE HARBOR_DW TO ROLE LOADER; GRANT USAGE ON SCHEMA HARBOR_DW.RAW TO ROLE LOADER;
    GRANT SELECT, INSERT ON TABLE HARBOR_DW.RAW.ORDERS TO ROLE LOADER; GRANT READ, WRITE ON STAGE HARBOR_DW.RAW.ORDERS_STAGE TO ROLE LOADER;
    GRANT USAGE ON FILE FORMAT HARBOR_DW.RAW.CSV_ORDERS TO ROLE LOADER;
    CREATE USER MULE_ETL TYPE = SERVICE DEFAULT_ROLE = LOADER DEFAULT_WAREHOUSE = LOAD_WH DEFAULT_NAMESPACE = 'HARBOR_DW.RAW' RSA_PUBLIC_KEY = '${publicKeyOf(MULE_ETL_KEY)}';
    GRANT ROLE LOADER TO USER MULE_ETL;
    CREATE USER PRIYA_DATA TYPE = PERSON PASSWORD = 'lab-person-password' DEFAULT_ROLE = SYSADMIN DEFAULT_WAREHOUSE = COMPUTE_WH;
    GRANT ROLE SYSADMIN TO USER PRIYA_DATA;`,
    now,
  )
  y.ws = { role: 'ACCOUNTADMIN', wh: 'COMPUTE_WH', db: 'HARBOR_DW', schema: 'RAW', text: '' }
  return y
}
// runs SQL as a person of the lab story, so it shows in Query History
export function asUser(y, sql, now, { user = 'PRIYA_DATA', role = 'SYSADMIN', wh = 'COMPUTE_WH', db = 'HARBOR_DW', schema = 'RAW', client = 'Snowsight' } = {}) {
  return runText(y, { y, now, user, role, wh, db, schema, client, session: `${user}/story` }, sql)
}

// lab-made sample data: Harbor web shop orders as the order system exports them
const STORES = ['WEB', 'APP', 'S101', 'S102']
export const ordersCsv = (first, date, n) => ['ORDER_ID,ORDER_DATE,CUSTOMER_ID,STORE,AMOUNT', ...Array.from({ length: n }, (_, i) => `${first + i},${date},C-${1000 + ((first + i) % 37)},${STORES[(first + i) % 4]},${(19.5 + ((first + i) * 7) % 180).toFixed(2)}`)].join('\n') + '\n'

// fills a missing or placeholder state.snowflake, and any key an older save lacks
export function fillSnowflake(y) {
  if (!y) return defaultSnowflakeSystem(0)
  if (!y.account) {
    const base = defaultSnowflakeSystem(y.created ?? 0)
    for (const k of Object.keys(base)) y[k] ??= base[k]
    y.account = base.account
    return y
  }
  for (const k of KEYS) if (y[k] === undefined || y[k] === null) y[k] = newSnowflake(y.created ?? 0)[k]
  return y
}

// ---------- lookups for the screen and the labs ----------

export const splitFq = (fq) => String(fq).split('.')
export const schemaAt = (y, db, sc) => y?.dbs?.[db]?.schemas?.[sc]
export const tableAt = (y, fq) => {
  const [d, s, t] = splitFq(fq)
  return schemaAt(y, d, s)?.tables[t]
}
export const stageAt = (y, fq) => {
  const [d, s, t] = splitFq(fq)
  return schemaAt(y, d, s)?.stages[t]
}
export const viewAt = (y, fq) => {
  const [d, s, t] = splitFq(fq)
  return schemaAt(y, d, s)?.views[t]
}
export const formatAt = (y, fq) => {
  const [d, s, t] = splitFq(fq)
  return schemaAt(y, d, s)?.formats[t]
}
// the rows of a table as objects
export const rowsOf = (y, fq) => {
  const t = tableAt(y, fq)
  return t ? t.rows.map((r) => Object.fromEntries(t.cols.map((c, i) => [c.name, r[i]]))) : []
}
export const countOf = (y, fq) => tableAt(y, fq)?.rows.length ?? 0
export const fileKey = (table, stage, file) => `${table}|${stage}|${file}`
// files in a stage that the table has no fresh load metadata for
export const unloadedFiles = (y, table, stage, now = Infinity) => {
  const st = stageAt(y, stage)
  return Object.entries(st?.files ?? {})
    .filter(([name, f]) => {
      const m = y.meta?.[fileKey(table, stage, name)]
      return !m || m.md5 !== f.md5 || (Number.isFinite(now) && now - m.t > META_DAYS * DAY)
    })
    .map(([name]) => name)
}
export const stagePath = (fq, st, name) => (st.url ? `${st.url.replace(/\/?$/, '/')}${name}` : `${splitFq(fq)[2].toLowerCase()}/${name}`)
export const userRoles = (y, user) => [...new Set([...(y.users[user]?.roles ?? []), 'PUBLIC'])]
export function rolesOf(y, role) {
  const seen = new Set()
  const walk = (r) => {
    if (seen.has(r) || !y.roles[r]) return
    seen.add(r)
    for (const x of y.roles[r].roles ?? []) walk(x)
  }
  walk(role)
  seen.add('PUBLIC')
  return seen
}
// the monitor that keeps a warehouse from resuming, if any
export const blockerOf = (y, wh) => {
  const w = y.warehouses[wh]
  const m = w && y.monitors[w.monitor]
  return m && m.triggers.some((t) => t.action !== 'NOTIFY' && m.used >= (m.quota * t.pct) / 100 - 1e-9) ? w.monitor : null
}

export function addFile(y, stageFq, name, content, t) {
  const st = stageAt(y, stageFq)
  if (!st || name in Object.prototype) return false
  st.files[name] = { content, size: content.length, md5: hash(content), t }
  return true
}

// ---------- the lexer ----------

function where(text, at) {
  const before = text.slice(0, at)
  return { line: before.split('\n').length, pos: at - before.lastIndexOf('\n') - 1 }
}
function syntaxAt(text, at, unexpected) {
  const w = where(text, at)
  return E('001003', '42000', `SQL compilation error:\nsyntax error line ${w.line} at position ${w.pos} unexpected '${unexpected}'.`)
}
function lex(text) {
  const out = []
  let i = 0
  while (i < text.length) {
    const c = text[i]
    if (/\s/.test(c)) {
      i++
      continue
    }
    if (c === '-' && text[i + 1] === '-') {
      while (i < text.length && text[i] !== '\n') i++
      continue
    }
    if (c === '/' && text[i + 1] === '*') {
      const e = text.indexOf('*/', i + 2)
      i = e < 0 ? text.length : e + 2
      continue
    }
    const at = i
    if (c === "'") {
      let v = ''
      i++
      for (;;) {
        if (i >= text.length) throw syntaxAt(text, at, text.slice(at, at + 12))
        if (text[i] === "'") {
          if (text[i + 1] === "'") {
            v += "'"
            i += 2
            continue
          }
          break
        }
        if (text[i] === '\\' && i + 1 < text.length) {
          const n = text[i + 1]
          v += n === 'n' ? '\n' : n === 't' ? '\t' : n
          i += 2
          continue
        }
        v += text[i++]
      }
      i++
      out.push({ t: 's', v, at, end: i })
      continue
    }
    if (c === '"') {
      const e = text.indexOf('"', i + 1)
      if (e < 0) throw syntaxAt(text, at, '"')
      // lab-made: the lab keeps objects in plain maps, so a quoted name such as "constructor" or "__proto__" is refused
      if (text.slice(i + 1, e) in Object.prototype) throw E('001003', '42000', `SQL compilation error:\ninvalid identifier '"${text.slice(i + 1, e)}"'. The lab does not take this quoted name.`)
      out.push({ t: 'w', v: text.slice(i + 1, e), q: true, at, end: e + 1 })
      i = e + 1
      continue
    }
    if (c === '@') {
      let j = i + 1
      while (j < text.length && /[\w.%~/$=-]/.test(text[j])) j++
      out.push({ t: 'stage', v: text.slice(i + 1, j), at, end: j })
      i = j
      continue
    }
    if (/\d/.test(c) || (c === '.' && /\d/.test(text[i + 1] ?? ''))) {
      let j = i
      while (j < text.length && /[\d.]/.test(text[j])) j++
      if (/[eE]/.test(text[j] ?? '') && /[\d+-]/.test(text[j + 1] ?? '')) {
        j += 2
        while (j < text.length && /\d/.test(text[j])) j++
      }
      out.push({ t: 'n', v: Number(text.slice(i, j)), at, end: j })
      i = j
      continue
    }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i
      while (j < text.length && /[\w$]/.test(text[j])) j++
      out.push({ t: 'w', v: text.slice(i, j).toUpperCase(), at, end: j })
      i = j
      continue
    }
    const two = text.slice(i, i + 2)
    if (['<=', '>=', '<>', '!=', '=>', '||', '::'].includes(two)) {
      out.push({ t: 'p', v: two, at, end: i + 2 })
      i += 2
      continue
    }
    if ('(),;.=<>*+-/%'.includes(c)) {
      out.push({ t: 'p', v: c, at, end: i + 1 })
      i++
      continue
    }
    throw syntaxAt(text, i, c)
  }
  return out
}

// ---------- the parser ----------

// words that end a table name, so they are not taken as its alias
const RESERVED = new Set(['WHERE', 'GROUP', 'ORDER', 'QUALIFY', 'HAVING', 'LIMIT', 'ON', 'USING', 'WHEN', 'SET', 'UNION', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'FULL', 'CROSS', 'FROM', 'VALUES', 'SELECT', 'AS', 'AND', 'OR', 'NOT', 'THEN', 'ELSE', 'END', 'BY', 'INTO', 'FILES', 'PATTERN', 'FILE_FORMAT', 'ON_ERROR', 'VALIDATION_MODE', 'FORCE', 'PURGE', 'MINUS', 'EXCEPT', 'INTERSECT', 'OFFSET', 'FETCH', 'IS', 'IN', 'LIKE', 'ILIKE', 'BETWEEN', 'NULL', 'WINDOW'])

function parser(toks, text) {
  let i = 0
  const kw = (t, w) => t && ((t.t === 'w' && !t.q) || t.t === 'p') && t.v === w
  const p = {
    text,
    tok: (k = 0) => toks[i + k],
    pos: () => i,
    seek: (k) => (i = k),
    done: () => i >= toks.length,
    is: (...ws) => ws.every((w, k) => kw(toks[i + k], w)),
    accept: (...ws) => (p.is(...ws) ? ((i += ws.length), true) : false),
    expect: (...ws) => {
      for (const w of ws) if (!p.accept(w)) p.fail()
    },
    fail: () => {
      const t = toks[i]
      throw syntaxAt(text, t?.at ?? text.length, t ? text.slice(t.at, t.end) : '<EOF>')
    },
    end: () => {
      if (i < toks.length) p.fail()
    },
    next: () => toks[i++] ?? p.fail(),
    ident: () => {
      const t = toks[i]
      if (!t || t.t !== 'w') p.fail()
      i++
      return t.v
    },
    qname: () => {
      const parts = [p.ident()]
      while (p.is('.') && toks[i + 1]?.t === 'w') {
        i++
        parts.push(p.ident())
      }
      return parts
    },
    raw: (from) => text.slice(toks[from].at, toks[i - 1].end),
    where: (t = toks[i]) => where(text, t?.at ?? text.length),
    // a literal in a property list: a string, a number, a word, or ( ... )
    value: () => {
      const t = toks[i]
      if (!t) p.fail()
      if (t.t === 's' || t.t === 'n') return (i++, t.v)
      if (p.is('-') && toks[i + 1]?.t === 'n') return (i += 2, -toks[i - 1].v)
      if (t.t === 'w') return (i++, t.v)
      if (p.accept('(')) {
        if (p.accept(')')) return []
        if (toks[i]?.t === 'w' && kw(toks[i + 1], '=')) {
          const o = props(p)
          p.expect(')')
          return o
        }
        const list = [p.value()]
        while (p.accept(',')) list.push(p.value())
        p.expect(')')
        return list
      }
      p.fail()
    },
    number: () => {
      const neg = p.accept('-')
      const t = toks[i]
      if (t?.t !== 'n') p.fail()
      i++
      return neg ? -t.v : t.v
    },
  }
  return p
}

// NAME = value pairs, as CREATE WAREHOUSE, CREATE STAGE and COPY INTO take them
function props(p, stop = []) {
  const out = {}
  while (!p.done() && p.tok().t === 'w' && !stop.includes(p.tok().v) && p.tok(1)?.v === '=' && p.tok(1)?.t === 'p') {
    const k = p.ident()
    p.expect('=')
    out[k] = p.value()
    p.accept(',')
  }
  return out
}

function typeName(p) {
  let t = p.ident()
  if (t === 'DOUBLE' && p.accept('PRECISION')) t = 'DOUBLE'
  if (p.accept('(')) {
    const a = [p.number()]
    while (p.accept(',')) a.push(p.number())
    p.expect(')')
    t += `(${a.join(',')})`
  }
  return t
}

const AGG = new Set(['COUNT', 'SUM', 'MIN', 'MAX', 'AVG'])
const WIN = new Set(['ROW_NUMBER', 'RANK', 'DENSE_RANK'])
const NOARG = new Set(['CURRENT_DATE', 'CURRENT_TIMESTAMP', 'CURRENT_TIME', 'SYSDATE'])

function expr(p) {
  return orE(p)
}
function orE(p) {
  let l = andE(p)
  while (p.accept('OR')) l = { k: 'or', l, r: andE(p) }
  return l
}
function andE(p) {
  let l = notE(p)
  while (p.accept('AND')) l = { k: 'and', l, r: notE(p) }
  return l
}
function notE(p) {
  if (p.accept('NOT')) return { k: 'not', e: notE(p) }
  return cmpE(p)
}
function cmpE(p) {
  const l = addE(p)
  if (p.accept('IS')) {
    const not = p.accept('NOT')
    p.expect('NULL')
    return { k: 'isnull', e: l, not }
  }
  const not = p.is('NOT', 'IN') || p.is('NOT', 'LIKE') || p.is('NOT', 'ILIKE') || p.is('NOT', 'BETWEEN') ? (p.next(), true) : false
  if (p.accept('IN')) {
    p.expect('(')
    const list = [expr(p)]
    while (p.accept(',')) list.push(expr(p))
    p.expect(')')
    return { k: 'in', e: l, list, not }
  }
  if (p.is('LIKE') || p.is('ILIKE')) {
    const ci = p.next().v === 'ILIKE'
    return { k: 'like', e: l, pat: addE(p), not, ci }
  }
  if (p.accept('BETWEEN')) {
    const a = addE(p)
    p.expect('AND')
    return { k: 'between', e: l, a, b: addE(p), not }
  }
  if (not) p.fail()
  for (const op of ['=', '<>', '!=', '<=', '>=', '<', '>']) if (p.accept(op)) return { k: 'cmp', op, l, r: addE(p) }
  return l
}
function addE(p) {
  let l = mulE(p)
  while (p.is('+') || p.is('-') || p.is('||')) l = { k: 'bin', op: p.next().v, l, r: mulE(p) }
  return l
}
function mulE(p) {
  let l = unary(p)
  while (p.is('*') || p.is('/') || p.is('%')) l = { k: 'bin', op: p.next().v, l, r: unary(p) }
  return l
}
function unary(p) {
  if (p.accept('-')) return { k: 'neg', e: unary(p) }
  p.accept('+')
  let e = primary(p)
  while (p.accept('::')) e = { k: 'cast', e, type: typeName(p) }
  return e
}
function primary(p) {
  const t = p.tok()
  if (!t) p.fail()
  if (t.t === 'n') return (p.next(), { k: 'lit', v: t.v })
  if (t.t === 's') return (p.next(), { k: 'lit', v: t.v })
  if (p.accept('(')) {
    const e = expr(p)
    p.expect(')')
    return e
  }
  if (t.t !== 'w') p.fail()
  if (!t.q) {
    if (p.accept('NULL')) return { k: 'lit', v: null }
    if (p.accept('TRUE')) return { k: 'lit', v: true }
    if (p.accept('FALSE')) return { k: 'lit', v: false }
    if (p.accept('CASE')) {
      const whens = []
      while (p.accept('WHEN')) {
        const c = expr(p)
        p.expect('THEN')
        whens.push([c, expr(p)])
      }
      const other = p.accept('ELSE') ? expr(p) : { k: 'lit', v: null }
      p.expect('END')
      return { k: 'case', whens, other }
    }
    if ((t.v === 'DATE' || t.v === 'TIMESTAMP') && p.tok(1)?.t === 's') {
      p.next()
      return { k: 'cast', e: { k: 'lit', v: p.next().v }, type: t.v }
    }
  }
  const at = p.where()
  const name = p.ident()
  if (p.is('(') && !t.q) {
    p.next()
    const f = { k: 'fn', name, args: [], at }
    if (p.accept('*')) f.star = true
    else if (!p.is(')')) {
      f.distinct = p.accept('DISTINCT')
      f.args.push(expr(p))
      while (p.accept(',')) f.args.push(expr(p))
    }
    p.expect(')')
    if (p.accept('OVER')) {
      p.expect('(')
      const part = []
      if (p.accept('PARTITION', 'BY')) {
        part.push(expr(p))
        while (p.accept(',')) part.push(expr(p))
      }
      const order = p.accept('ORDER', 'BY') ? orderList(p) : []
      p.expect(')')
      f.over = { part, order }
    }
    return f
  }
  if (!t.q && NOARG.has(name)) return { k: 'fn', name, args: [], at }
  const parts = [name]
  while (p.is('.') && p.tok(1)?.t === 'w') {
    p.next()
    parts.push(p.ident())
  }
  return { k: 'col', parts, at }
}
function orderList(p) {
  const out = []
  do {
    const e = expr(p)
    const desc = p.accept('DESC') ? true : (p.accept('ASC'), false)
    let nullsFirst = desc
    if (p.accept('NULLS', 'FIRST')) nullsFirst = true
    else if (p.accept('NULLS', 'LAST')) nullsFirst = false
    out.push({ e, desc, nullsFirst })
  } while (p.accept(','))
  return out
}

function parseSource(p) {
  let src
  if (p.accept('(')) {
    if (!p.is('SELECT')) p.fail()
    src = { k: 'sub', q: parseSelect(p) }
    p.expect(')')
  } else if (p.is('TABLE', '(')) {
    p.expect('TABLE', '(')
    const name = p.qname().join('.')
    if (name !== 'VALIDATE') lab(`the table function ${name} is not part of the lab. Use Copy History in Snowsight`)
    p.expect('(')
    const table = p.qname()
    p.expect(',', 'JOB_ID', '=>')
    const t = p.next()
    if (t.t !== 's') p.fail()
    p.expect(')', ')')
    src = { k: 'validate', table, job: t.v }
  } else {
    if (p.tok()?.t === 'stage') lab('querying staged files with SELECT ... FROM @stage is not part of the lab. Use LIST, or COPY INTO with VALIDATION_MODE')
    src = { k: 'obj', parts: p.qname() }
  }
  if (p.accept('AS')) src.alias = p.ident()
  else if (p.tok()?.t === 'w' && !RESERVED.has(p.tok().v)) src.alias = p.ident()
  if (p.is('JOIN') || p.is('INNER') || p.is('LEFT') || p.is('RIGHT') || p.is('FULL') || p.is('CROSS') || p.is(',')) lab('joins are not part of the lab worksheet')
  return src
}

function parseSelect(p) {
  p.expect('SELECT')
  const distinct = p.accept('DISTINCT')
  let limit = null
  if (p.accept('TOP')) limit = p.number()
  const items = []
  do {
    if (p.accept('*')) items.push({ star: true })
    else if (p.tok()?.t === 'w' && p.tok(1)?.v === '.' && p.tok(2)?.v === '*') {
      p.next()
      p.next()
      p.next()
      items.push({ star: true })
    } else {
      const k = p.pos()
      const e = expr(p)
      const txt = p.raw(k).toUpperCase()
      let alias = null
      if (p.accept('AS')) alias = p.ident()
      else if (p.tok()?.t === 'w' && !RESERVED.has(p.tok().v)) alias = p.ident()
      items.push({ e, alias, txt })
    }
  } while (p.accept(','))
  const from = p.accept('FROM') ? parseSource(p) : null
  const where_ = p.accept('WHERE') ? expr(p) : null
  const group = []
  if (p.accept('GROUP', 'BY')) {
    group.push(expr(p))
    while (p.accept(',')) group.push(expr(p))
  }
  const having = p.accept('HAVING') ? expr(p) : null
  const qualify = p.accept('QUALIFY') ? expr(p) : null
  const order = p.accept('ORDER', 'BY') ? orderList(p) : []
  if (p.accept('LIMIT')) limit = p.number()
  if (p.is('UNION') || p.is('MINUS') || p.is('EXCEPT') || p.is('INTERSECT')) lab('set operators are not part of the lab worksheet')
  return { k: 'select', distinct, items, from, where: where_, group, having, qualify, order, limit }
}

// ---------- values ----------

const NUM = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/
const baseType = (type) => up(type).replace(/\(.*/, '')
const scaleOf = (type) => {
  const m = String(type).match(/\(\s*\d+\s*,\s*(\d+)\s*\)/)
  if (m) return Number(m[1])
  return ['NUMBER', 'NUMERIC', 'DECIMAL', 'INT', 'INTEGER', 'BIGINT', 'SMALLINT'].includes(baseType(type)) ? 0 : null
}
const validDate = (s) => {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return false
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
  return d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3]
}
// converts a value to a column type the way a load or an INSERT does
export function coerce(v, type) {
  if (v === null || v === undefined) return null
  const b = baseType(type)
  if (['NUMBER', 'NUMERIC', 'DECIMAL', 'INT', 'INTEGER', 'BIGINT', 'SMALLINT', 'FLOAT', 'DOUBLE', 'REAL'].includes(b)) {
    let n = typeof v === 'number' ? v : typeof v === 'boolean' ? Number(v) : NUM.test(String(v).trim()) ? Number(String(v).trim()) : NaN
    if (Number.isNaN(n)) fail('100038', '22018', `Numeric value '${v}' is not recognized`)
    const sc = scaleOf(type)
    if (sc !== null) n = round(n, sc)
    return n
  }
  if (b === 'DATE') {
    const m = String(v).trim().match(/^(\d{4}-\d{2}-\d{2})(?:[ T]\S.*)?$/)
    if (!m || !validDate(m[1])) fail('100040', '22007', `Date '${v}' is not recognized`)
    return m[1]
  }
  if (b.startsWith('TIMESTAMP') || b === 'DATETIME') {
    const s = String(v).trim()
    const m = s.match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?$/)
    if (!m || !validDate(m[1])) fail('100035', '22007', `Timestamp '${v}' is not recognized`)
    return `${m[1]} ${m[2] ?? '00'}:${m[3] ?? '00'}:${m[4] ?? '00'}`
  }
  if (b === 'BOOLEAN') {
    if (typeof v === 'boolean') return v
    const s = up(v)
    if (['TRUE', 'T', 'YES', 'Y', 'ON', '1'].includes(s)) return true
    if (['FALSE', 'F', 'NO', 'N', 'OFF', '0'].includes(s)) return false
    fail('100037', '22018', `Boolean value '${v}' is not recognized`)
  }
  const s = typeof v === 'number' ? String(round(v, 9)) : String(v)
  const len = Number(String(type).match(/^\w+\((\d+)\)/)?.[1])
  if (len && s.length > len) fail('100078', '22000', `String '${s}' is too long and would be truncated`)
  return s
}
const inferType = (vals) => {
  const xs = vals.filter((v) => v !== null && v !== undefined)
  if (xs.length && xs.every((v) => typeof v === 'number')) return xs.every(Number.isInteger) ? 'NUMBER(38,0)' : 'NUMBER(38,6)'
  if (xs.length && xs.every((v) => typeof v === 'boolean')) return 'BOOLEAN'
  return 'VARCHAR(16777216)'
}
function cmpv(a, b) {
  if (typeof a === 'number' && typeof b !== 'number') b = coerce(b, 'FLOAT')
  if (typeof b === 'number' && typeof a !== 'number') a = coerce(a, 'FLOAT')
  if (typeof a === 'number') return a - b
  const x = String(a)
  const z = String(b)
  return x < z ? -1 : x > z ? 1 : 0
}

// ---------- evaluation ----------

const colName = (e) => e.parts.at(-1)
function colOf(row, e) {
  const k = e.parts.length > 1 ? e.parts.slice(-2).join('.') : e.parts[0]
  if (Object.hasOwn(row, k)) return row[k]
  fail('000904', '42000', `SQL compilation error: error line ${e.at?.line ?? 1} at position ${e.at?.pos ?? 0}\ninvalid identifier '${e.parts.join('.')}'`)
}
const likeRe = (pat, ci) => new RegExp(`^${String(pat).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.')}$`, ci ? 'is' : 's')

function ev(e, row, env) {
  switch (e.k) {
    case 'lit':
      return e.v
    case 'col':
      return colOf(row, e)
    case 'neg': {
      const v = ev(e.e, row, env)
      return v === null ? null : -coerce(v, 'FLOAT')
    }
    case 'bin': {
      const a = ev(e.l, row, env)
      const b = ev(e.r, row, env)
      if (a === null || b === null) return null
      if (e.op === '||') return `${a}${b}`
      const x = coerce(a, 'FLOAT')
      const z = coerce(b, 'FLOAT')
      if (e.op === '/' && z === 0) fail('100051', '22012', 'Division by zero')
      return round(e.op === '+' ? x + z : e.op === '-' ? x - z : e.op === '*' ? x * z : e.op === '/' ? x / z : x % z, 9)
    }
    case 'cmp': {
      const a = ev(e.l, row, env)
      const b = ev(e.r, row, env)
      if (a === null || b === null) return null
      const c = cmpv(a, b)
      return { '=': c === 0, '<>': c !== 0, '!=': c !== 0, '<': c < 0, '>': c > 0, '<=': c <= 0, '>=': c >= 0 }[e.op]
    }
    case 'and': {
      const a = ev(e.l, row, env)
      if (a === false) return false
      const b = ev(e.r, row, env)
      return b === false ? false : a === null || b === null ? null : true
    }
    case 'or': {
      const a = ev(e.l, row, env)
      if (a === true) return true
      const b = ev(e.r, row, env)
      return b === true ? true : a === null || b === null ? null : false
    }
    case 'not': {
      const v = ev(e.e, row, env)
      return v === null ? null : !v
    }
    case 'isnull':
      return (ev(e.e, row, env) === null) !== e.not
    case 'in': {
      const v = ev(e.e, row, env)
      if (v === null) return null
      const hit = e.list.some((x) => {
        const w = ev(x, row, env)
        return w !== null && cmpv(v, w) === 0
      })
      return hit !== e.not
    }
    case 'like': {
      const v = ev(e.e, row, env)
      const pat = ev(e.pat, row, env)
      if (v === null || pat === null) return null
      return likeRe(pat, e.ci).test(String(v)) !== e.not
    }
    case 'between': {
      const v = ev(e.e, row, env)
      const a = ev(e.a, row, env)
      const b = ev(e.b, row, env)
      if (v === null || a === null || b === null) return null
      return (cmpv(v, a) >= 0 && cmpv(v, b) <= 0) !== e.not
    }
    case 'case':
      for (const [c, v] of e.whens) if (ev(c, row, env) === true) return ev(v, row, env)
      return ev(e.other, row, env)
    case 'cast':
      return coerce(ev(e.e, row, env), e.type)
    case 'fn':
      return fn(e, row, env)
  }
  return null
}

function aggregate(e, rows, env) {
  let vals = e.star ? rows.map(() => 1) : rows.map((r) => ev(e.args[0], r, env)).filter((v) => v !== null)
  if (e.distinct) vals = [...new Map(vals.map((v) => [JSON.stringify(v), v])).values()]
  if (e.name === 'COUNT') return vals.length
  if (!vals.length) return null
  if (e.name === 'SUM') return round(vals.reduce((n, v) => n + coerce(v, 'FLOAT'), 0), 6)
  if (e.name === 'AVG') return round(vals.reduce((n, v) => n + coerce(v, 'FLOAT'), 0) / vals.length, 6)
  return vals.reduce((m, v) => ((e.name === 'MIN' ? cmpv(v, m) < 0 : cmpv(v, m) > 0) ? v : m))
}

function fn(e, row, env) {
  if (e.over) {
    if (!WIN.has(e.name)) lab(`the window function ${e.name} is not part of the lab. Use ROW_NUMBER, RANK or DENSE_RANK`)
    return env.win?.get(e)?.get(row) ?? null
  }
  if (WIN.has(e.name)) fail('002063', '42601', `SQL compilation error:\nWindow function ${e.name} requires an OVER clause.`) // lab-made code
  if (AGG.has(e.name)) {
    if (!env.group) fail('002065', '42601', `SQL compilation error:\nAggregate function ${e.name} is not allowed here.`) // lab-made code
    return aggregate(e, env.group, env)
  }
  const a = e.args.map((x) => ev(x, row, env))
  switch (e.name) {
    case 'CURRENT_USER':
      return env.user
    case 'CURRENT_ROLE':
      return env.role
    case 'CURRENT_WAREHOUSE':
      return env.wh ?? null
    case 'CURRENT_DATABASE':
      return env.db ?? null
    case 'CURRENT_SCHEMA':
      return env.schema ?? null
    case 'CURRENT_ACCOUNT':
      return ACCOUNT
    case 'CURRENT_TIMESTAMP':
    case 'SYSDATE':
      return tsText(env.now)
    case 'CURRENT_DATE':
      return tsText(env.now).slice(0, 10)
    case 'UPPER':
      return a[0] === null ? null : String(a[0]).toUpperCase()
    case 'LOWER':
      return a[0] === null ? null : String(a[0]).toLowerCase()
    case 'TRIM':
      return a[0] === null ? null : String(a[0]).trim()
    case 'LENGTH':
    case 'LEN':
      return a[0] === null ? null : String(a[0]).length
    case 'COALESCE':
    case 'NVL':
    case 'IFNULL':
      return a.find((v) => v !== null) ?? null
    case 'IFF':
      return a[0] === true ? a[1] : a[2]
    case 'CONCAT':
      return a.some((v) => v === null) ? null : a.join('')
    case 'ROUND':
      return a[0] === null ? null : round(coerce(a[0], 'FLOAT'), Number(a[1] ?? 0))
    case 'ABS':
      return a[0] === null ? null : Math.abs(coerce(a[0], 'FLOAT'))
    case 'TO_DATE':
    case 'DATE':
      return coerce(a[0], 'DATE')
    case 'TO_TIMESTAMP':
    case 'TO_TIMESTAMP_NTZ':
      return coerce(a[0], 'TIMESTAMP_NTZ')
    case 'TO_NUMBER':
    case 'TO_DECIMAL':
      return coerce(a[0], a[2] !== undefined ? `NUMBER(${a[1]},${a[2]})` : 'NUMBER(38,0)')
    case 'TO_VARCHAR':
    case 'TO_CHAR':
      return a[0] === null ? null : String(a[0])
  }
  fail('002140', '42601', `SQL compilation error:\nUnknown function ${e.name}`)
}

const walk = (e, f) => {
  if (!e || typeof e !== 'object') return
  f(e)
  for (const v of Object.values(e)) {
    if (Array.isArray(v)) v.forEach((x) => (Array.isArray(x) ? x.forEach((z) => walk(z, f)) : walk(x, f)))
    else if (v && typeof v === 'object' && v.k) walk(v, f)
    else if (v && typeof v === 'object' && (v.part || v.order)) walk(v, f)
  }
}
const hasAgg = (e) => {
  let found = false
  walk(e, (x) => {
    if (x.k === 'fn' && AGG.has(x.name) && !x.over) found = true
  })
  return found
}
const windowsIn = (list) => {
  const out = []
  for (const e of list) walk(e, (x) => x.k === 'fn' && x.over && out.push(x))
  return out
}
const orderCmp = (order, key) => (a, b) => {
  for (const [i, o] of order.entries()) {
    const x = key(a, i)
    const z = key(b, i)
    if (x === null && z === null) continue
    if (x === null) return o.nullsFirst ? -1 : 1
    if (z === null) return o.nullsFirst ? 1 : -1
    const c = cmpv(x, z)
    if (c) return o.desc ? -c : c
  }
  return 0
}
function windows(nodes, rows, env) {
  const map = new Map()
  for (const w of nodes) {
    const vals = new Map()
    const parts = new Map()
    for (const r of rows) {
      const k = JSON.stringify(w.over.part.map((e) => ev(e, r, env)))
      if (!parts.has(k)) parts.set(k, [])
      parts.get(k).push(r)
    }
    for (const list of parts.values()) {
      const keys = new Map(list.map((r) => [r, w.over.order.map((o) => ev(o.e, r, env))]))
      const sorted = [...list].sort(orderCmp(w.over.order, (r, i) => keys.get(r)[i]))
      let rank = 0
      let dense = 0
      let prev = null
      sorted.forEach((r, i) => {
        const k = JSON.stringify(keys.get(r))
        if (k !== prev) {
          rank = i + 1
          dense++
          prev = k
        }
        vals.set(r, w.name === 'ROW_NUMBER' ? i + 1 : w.name === 'RANK' ? rank : dense)
      })
    }
    map.set(w, vals)
  }
  return map
}

// ---------- names, privileges and the warehouse ----------

function resolve(env, parts, what) {
  if (parts.length > 3) fail('001003', '42000', `SQL compilation error:\ninvalid object name '${parts.join('.')}'.`) // lab-made wording
  const [db, schema, name] = parts.length === 3 ? parts : parts.length === 2 ? [env.db, ...parts] : [env.db, env.schema, parts[0]]
  if (!db) fail('090105', '22000', `Cannot perform ${what}. This session does not have a current database. Call 'USE DATABASE', or use a qualified name.`)
  if (!schema) fail('090106', '22000', `Cannot perform ${what}. This session does not have a current schema. Call 'USE SCHEMA', or use a qualified name.`)
  return { db, schema, name, fq: `${db}.${schema}.${name}` }
}
function grantsOn(env, kind, name) {
  const out = []
  for (const r of rolesOf(env.y, env.role)) for (const g of env.y.roles[r]?.grants ?? []) if (g.kind === kind && g.name === name) out.push(g.priv)
  return out
}
const isSys = (env) => env.sys || rolesOf(env.y, env.role).has('SYSADMIN')
export function has(env, priv, kind, name) {
  if (isSys(env)) return true
  return grantsOn(env, kind, name).some((g) => g === priv || g === 'ALL' || g === 'OWNERSHIP')
}
const sees = (env, kind, name) => isSys(env) || grantsOn(env, kind, name).length > 0
const nsOk = (env, ref) => sees(env, 'DATABASE', ref.db) && has(env, 'USAGE', 'DATABASE', ref.db) && has(env, 'USAGE', 'SCHEMA', `${ref.db}.${ref.schema}`)
function notFound(kind, fq) {
  fail('002003', kind === 'TABLE' || kind === 'VIEW' ? '42S02' : '02000', `SQL compilation error:\n${KIND_TEXT[kind] ?? 'Object'} '${fq}' does not exist or not authorized.`)
}
function need(env, priv, kind, ref) {
  if (!has(env, priv, kind, ref.fq ?? ref)) fail('003001', '42501', `SQL access control error:\nInsufficient privileges to operate on ${(KIND_TEXT[kind] ?? kind).toLowerCase()} '${ref.name ?? ref}'`)
}
// a table or a view the session can see
function relation(env, parts, what, kinds = ['TABLE', 'VIEW']) {
  const ref = resolve(env, parts, what)
  const sch = schemaAt(env.y, ref.db, ref.schema)
  const t = sch?.tables[ref.name]
  const v = sch?.views[ref.name]
  const kind = t ? 'TABLE' : v ? 'VIEW' : null
  if (!sch || !kind || !kinds.includes(kind) || !nsOk(env, ref) || !sees(env, kind, ref.fq)) notFound(kinds.length === 1 ? kinds[0] : 'TABLE', ref.fq)
  return { ref, sch, obj: t ?? v, kind }
}
function inSchema(env, parts, what, map, kind) {
  const ref = resolve(env, parts, what)
  const sch = schemaAt(env.y, ref.db, ref.schema)
  const obj = sch?.[map][ref.name]
  if (!obj || !nsOk(env, ref) || !sees(env, kind, ref.fq)) notFound(kind, ref.fq)
  return { ref, sch, obj }
}
// the schema in which a new object goes, and that the role may create it there
function target(env, parts, what, priv) {
  const ref = resolve(env, parts, what)
  const sch = schemaAt(env.y, ref.db, ref.schema)
  if (!sch || !nsOk(env, ref)) fail('002003', '02000', `SQL compilation error:\nSchema '${ref.db}.${ref.schema}' does not exist or not authorized.`)
  if (!has(env, priv, 'SCHEMA', `${ref.db}.${ref.schema}`)) fail('003001', '42501', `SQL access control error:\nInsufficient privileges to operate on schema '${ref.schema}'`)
  return { ref, sch }
}
const ACCT = { WAREHOUSE: 'SYSADMIN', DATABASE: 'SYSADMIN', USER: 'USERADMIN', ROLE: 'USERADMIN', 'RESOURCE MONITOR': 'ACCOUNTADMIN', GRANTS: 'SECURITYADMIN' }
function acct(env, what) {
  if (env.sys) return
  const rs = rolesOf(env.y, env.role)
  if (rs.has(ACCT[what]) || (what === 'GRANTS' && rs.has('SYSADMIN'))) return
  fail('003001', '42501', `SQL access control error:\nInsufficient privileges to operate on account '${ACCOUNT}'`)
}
const noWarehouse = () => fail('000606', '57P03', "No active warehouse selected in the current session.  Select an active warehouse with the 'use warehouse' command.")
function start(w, now, by) {
  Object.assign(w, { state: 'STARTED', startedAt: now, lastUsed: now, suspendedBy: null })
  push(w.log, { t: now, text: `Resumed (${by})` }, 8)
}
function suspend(w, now, by) {
  Object.assign(w, { state: 'SUSPENDED', suspendedBy: by, suspendedAt: now })
  push(w.log, { t: now, text: `Suspended (${by})` }, 8)
}
// a statement that needs compute: the session warehouse runs it, and a suspended one with AUTO_RESUME resumes
function needWh(env) {
  if (env.sys) return
  const y = env.y
  const name = env.wh
  const w = name && y.warehouses[name]
  if (!w || !has(env, 'USAGE', 'WAREHOUSE', name)) noWarehouse()
  if (w.state === 'SUSPENDED') {
    const m = blockerOf(y, name)
    // lab-made code; the message is the one Snowflake gives
    if (m) fail('000630', '57014', `Warehouse '${name}' cannot be resumed because resource monitor '${m}' has exceeded its quota.`)
    // a suspended warehouse with AUTO_RESUME = FALSE is not started by a query: Snowflake answers as if the session had none
    if (!w.autoResume) noWarehouse()
    start(w, env.now, `AUTO_RESUME by a query of ${env.user}`)
    env.cold = true
  }
  w.lastUsed = env.now
  env.used = true
}

// ---------- SELECT ----------

function wrap(cols, types, rows, alias) {
  return {
    cols,
    types,
    rows: rows.map((vals) => {
      const o = {}
      cols.forEach((c, i) => {
        o[c] = vals[i]
        if (alias) o[`${alias}.${c}`] = vals[i]
      })
      return o
    }),
  }
}
function source(src, env) {
  if (src.k === 'sub') {
    const r = runSelect(src.q, env)
    return wrap(r.cols, r.types, r.rows, src.alias)
  }
  if (src.k === 'validate') {
    const { ref } = relation(env, src.table, 'SELECT', ['TABLE'])
    const rej = env.y.rejects[ref.fq]
    const job = up(src.job)
    // lab-made wording of both errors
    if (job === '_LAST' && (!rej || rej.session !== env.session)) fail('002003', '02000', `SQL compilation error:\nNo COPY INTO ${ref.name} ran in this session, so JOB_ID => '_last' has nothing to validate. Pass the query ID of the load.`)
    if (job !== '_LAST' && rej?.qid !== src.job) fail('002003', '02000', `SQL compilation error:\nQuery '${src.job}' is not the last load into ${ref.name}, or it had no errors.`)
    const cols = ['ERROR', 'FILE', 'LINE', 'CHARACTER', 'CATEGORY', 'CODE', 'SQL_STATE', 'COLUMN_NAME', 'ROW_NUMBER', 'REJECTED_RECORD']
    return wrap(cols, {}, rej.rows.map((r) => [r.error, r.file, r.line, r.character, r.category, Number(r.code), r.state, r.column, r.row, r.record]), src.alias)
  }
  const { ref, obj, kind } = relation(env, src.parts, 'SELECT')
  need(env, 'SELECT', kind, ref)
  const alias = src.alias ?? ref.name
  if (kind === 'VIEW') {
    // a view runs with the rights of its owner
    const q = parseSelect(parser(lex(obj.sql), obj.sql))
    const r = runSelect(q, { ...env, sys: true, noWh: true, db: ref.db, schema: ref.schema })
    return wrap(r.cols, r.types, r.rows, alias)
  }
  return wrap(
    obj.cols.map((c) => c.name),
    Object.fromEntries(obj.cols.map((c) => [c.name, c.type])),
    obj.rows,
    alias,
  )
}

function runSelect(q, env) {
  const src = q.from ? source(q.from, env) : { cols: [], types: {}, rows: [{}] }
  if (q.from && !env.noWh) needWh(env)
  let rows = q.where ? src.rows.filter((r) => ev(q.where, r, env) === true) : src.rows
  const wins = windowsIn([...q.items.map((x) => x.e).filter(Boolean), q.qualify, ...q.order.map((o) => o.e)].filter(Boolean))
  const wenv = wins.length ? { ...env, win: windows(wins, rows, env) } : env
  const groupBy = q.group.map((g) => (g.k === 'lit' && typeof g.v === 'number' ? q.items[g.v - 1]?.e ?? g : g))
  const grouped = groupBy.length > 0 || q.items.some((x) => x.e && hasAgg(x.e)) || Boolean(q.having)
  const names = []
  const types = []
  for (const it of q.items) {
    if (it.star) {
      if (!q.from) fail('001003', '42000', 'SQL compilation error:\nSELECT with no columns') // lab-made wording
      for (const c of src.cols) names.push(c), types.push(src.types[c] ?? null)
    } else {
      names.push(it.alias ?? (it.e.k === 'col' ? colName(it.e) : it.txt))
      types.push(it.e.k === 'col' ? (src.types[colName(it.e)] ?? null) : null)
    }
  }
  let out = []
  if (grouped) {
    if (q.items.some((x) => x.star)) fail('000979', '42601', `SQL compilation error:\n'*' in select clause is neither an aggregate nor in the group by clause.`)
    const keyCols = new Set()
    for (const g of groupBy) walk(g, (x) => x.k === 'col' && keyCols.add(colName(x)))
    for (const it of q.items) {
      if (hasAgg(it.e)) continue
      walk(it.e, (x) => {
        if (x.k === 'col' && !keyCols.has(colName(x))) fail('000979', '42601', `SQL compilation error: error line ${x.at?.line ?? 1} at position ${x.at?.pos ?? 0}\n'${x.parts.join('.')}' in select clause is neither an aggregate nor in the group by clause.`)
      })
    }
    const groups = new Map()
    for (const r of rows) {
      const k = JSON.stringify(groupBy.map((g) => ev(g, r, wenv)))
      if (!groups.has(k)) groups.set(k, [])
      groups.get(k).push(r)
    }
    if (!groupBy.length && !groups.size) groups.set('[]', [])
    for (const list of groups.values()) {
      const genv = { ...wenv, group: list }
      const rep = list[0] ?? {}
      if (q.having && ev(q.having, rep, genv) !== true) continue
      out.push({ vals: q.items.map((it) => ev(it.e, rep, genv)), ctx: rep, env: genv })
    }
  } else {
    for (const r of rows) {
      if (q.qualify && ev(q.qualify, r, wenv) !== true) continue
      const vals = []
      for (const it of q.items) {
        if (it.star) for (const c of src.cols) vals.push(r[c])
        else vals.push(ev(it.e, r, wenv))
      }
      out.push({ vals, ctx: r, env: wenv })
    }
  }
  if (q.distinct) {
    const seen = new Set()
    out = out.filter((x) => {
      const k = JSON.stringify(x.vals)
      return seen.has(k) ? false : seen.add(k)
    })
  }
  if (q.order.length) {
    const keys = new Map(
      out.map((x) => [
        x,
        q.order.map((o) => {
          if (o.e.k === 'lit' && typeof o.e.v === 'number') return x.vals[o.e.v - 1] ?? null
          if (o.e.k === 'col' && o.e.parts.length === 1 && names.includes(o.e.parts[0]) && !(o.e.parts[0] in x.ctx && q.items.every((it) => it.alias !== o.e.parts[0]))) return x.vals[names.indexOf(o.e.parts[0])]
          return ev(o.e, x.ctx, x.env)
        }),
      ]),
    )
    out.sort(orderCmp(q.order, (x, i) => keys.get(x)[i]))
  }
  if (q.limit !== null && q.limit !== undefined) out = out.slice(0, q.limit)
  const vals = out.map((x) => x.vals)
  return { cols: names, types: types.map((t, i) => t ?? inferType(vals.map((r) => r[i]))), rows: vals }
}

// ---------- the statements ----------

const status = (message) => ({ cols: ['status'], rows: [[message]], message })
const counts = (pairs) => ({ cols: pairs.map((x) => x[0]), rows: [pairs.map((x) => x[1])], message: pairs.map(([k, v]) => `${k}: ${v}`).join(', ') })
function exists(kind, name, replace, ifNot) {
  if (replace) return false
  if (ifNot) return true
  fail('002002', '42710', `SQL compilation error:\nObject '${name}' already exists.`)
}
// drops the privileges on an object; a table replaced without COPY GRANTS loses them too
const dropGrants = (y, kind, fq) => {
  for (const r of Object.values(y.roles)) r.grants = r.grants.filter((g) => !(g.kind === kind && g.name === fq))
}
const dropMeta = (y, table) => {
  for (const k of Object.keys(y.meta)) if (k.startsWith(`${table}|`)) delete y.meta[k]
}

function sizeOf(v) {
  const s = up(v).replace(/^'|'$/g, '')
  const k = SIZE_ALIAS[s] ?? s
  if (!SIZES[k]) fail('001008', '22023', `SQL compilation error:\ninvalid value '${v}' for property 'WAREHOUSE_SIZE'`) // lab-made code
  return k
}
const secondsOf = (v) => (v === null || up(v) === 'NULL' ? 0 : Number(v) || 0)

function formatOf(o, base = {}) {
  const f = { ...base }
  if (o.TYPE !== undefined) f.type = up(o.TYPE)
  if (o.SKIP_HEADER !== undefined) f.skipHeader = Number(o.SKIP_HEADER) || 0
  if (o.FIELD_DELIMITER !== undefined) f.delimiter = String(o.FIELD_DELIMITER)
  if (o.FIELD_OPTIONALLY_ENCLOSED_BY !== undefined) f.enclosedBy = up(o.FIELD_OPTIONALLY_ENCLOSED_BY) === 'NONE' ? null : String(o.FIELD_OPTIONALLY_ENCLOSED_BY)
  if (o.NULL_IF !== undefined) f.nullIf = [].concat(o.NULL_IF).map(String)
  if (o.EMPTY_FIELD_AS_NULL !== undefined) f.emptyAsNull = bool(o.EMPTY_FIELD_AS_NULL)
  if (o.ERROR_ON_COLUMN_COUNT_MISMATCH !== undefined) f.mismatch = bool(o.ERROR_ON_COLUMN_COUNT_MISMATCH)
  if (o.TRIM_SPACE !== undefined) f.trim = bool(o.TRIM_SPACE)
  if (o.SKIP_BLANK_LINES !== undefined) f.skipBlank = bool(o.SKIP_BLANK_LINES)
  if (o.DATE_FORMAT !== undefined) f.dateFormat = String(o.DATE_FORMAT)
  if (o.COMPRESSION !== undefined) f.compression = up(o.COMPRESSION)
  f.type ??= 'CSV'
  if (!['CSV', 'JSON', 'PARQUET', 'AVRO', 'ORC', 'XML'].includes(f.type)) fail('001008', '22023', `SQL compilation error:\ninvalid value '${f.type}' for property 'TYPE'`) // lab-made code
  return f
}
// the CSV defaults of Snowflake
export const csvOf = (f = {}) => ({ type: 'CSV', skipHeader: 0, delimiter: ',', enclosedBy: null, nullIf: ['\\N'], emptyAsNull: true, mismatch: true, trim: false, skipBlank: false, ...f })

const S = {}

S.USE = (p, env) => {
  p.expect('USE')
  const kind = p.accept('WAREHOUSE') ? 'WAREHOUSE' : p.accept('ROLE') ? 'ROLE' : p.accept('SCHEMA') ? 'SCHEMA' : (p.accept('DATABASE'), 'DATABASE')
  const parts = p.qname()
  p.end()
  const y = env.y
  const gone = () => fail('002043', '02000', 'SQL compilation error:\nObject does not exist, or operation cannot be performed.')
  if (kind === 'WAREHOUSE') {
    if (!y.warehouses[parts[0]] || !has(env, 'USAGE', 'WAREHOUSE', parts[0])) gone()
    env.wh = parts[0]
  } else if (kind === 'ROLE') {
    if (!y.roles[parts[0]] || !userRoles(y, env.user).includes(parts[0])) fail('003013', '42501', `Requested role '${parts[0]}' is not assigned to the executing user. Specify another role to activate.`)
    env.role = parts[0]
  } else if (kind === 'DATABASE') {
    const [db, sc] = parts
    if (!y.dbs[db] || !has(env, 'USAGE', 'DATABASE', db)) gone()
    if (sc && (!y.dbs[db].schemas[sc] || !has(env, 'USAGE', 'SCHEMA', `${db}.${sc}`))) gone()
    env.db = db
    env.schema = sc ?? (y.dbs[db].schemas.PUBLIC ? 'PUBLIC' : null)
  } else {
    const [db, sc] = parts.length === 2 ? parts : [env.db, parts[0]]
    if (!db || !y.dbs[db]?.schemas[sc] || !has(env, 'USAGE', 'DATABASE', db) || !has(env, 'USAGE', 'SCHEMA', `${db}.${sc}`)) gone()
    env.db = db
    env.schema = sc
  }
  return status('Statement executed successfully.')
}

S.CREATE = (p, env) => {
  const y = env.y
  const now = env.now
  p.expect('CREATE')
  const replace = p.accept('OR', 'REPLACE')
  p.accept('TRANSIENT') || p.accept('TEMPORARY') || p.accept('TEMP') // the lab keeps every table as a permanent one
  const ifNot = () => p.accept('IF', 'NOT', 'EXISTS')
  if (p.accept('WAREHOUSE')) {
    const ine = ifNot()
    const name = p.ident()
    p.accept('WITH')
    const o = props(p)
    p.end()
    acct(env, 'WAREHOUSE')
    if (y.warehouses[name] && exists('WAREHOUSE', name, replace, ine)) return status(`${name} already exists, statement succeeded.`)
    if (o.RESOURCE_MONITOR !== undefined && !y.monitors[up(o.RESOURCE_MONITOR)]) fail('002003', '02000', `SQL compilation error:\nResource monitor '${up(o.RESOURCE_MONITOR)}' does not exist or not authorized.`)
    const w = { size: sizeOf(o.WAREHOUSE_SIZE ?? 'XSMALL'), state: 'SUSPENDED', autoSuspend: o.AUTO_SUSPEND === undefined ? 600 : secondsOf(o.AUTO_SUSPEND), autoResume: o.AUTO_RESUME === undefined ? true : bool(o.AUTO_RESUME), monitor: o.RESOURCE_MONITOR ? up(o.RESOURCE_MONITOR) : null, credits: 0, startedAt: null, lastUsed: now, suspendedBy: 'Created suspended', owner: env.role, log: [], comment: o.COMMENT ?? '' }
    y.warehouses[name] = w
    if (!bool(o.INITIALLY_SUSPENDED)) start(w, now, 'Created')
    // a new warehouse becomes the warehouse of the session
    env.wh = name
    return status(`Warehouse ${name} successfully created.`)
  }
  if (p.accept('DATABASE')) {
    const ine = ifNot()
    const name = p.ident()
    p.end()
    acct(env, 'DATABASE')
    if (y.dbs[name] && exists('DATABASE', name, replace, ine)) return status(`${name} already exists, statement succeeded.`)
    y.dbs[name] = { owner: env.role, created: now, schemas: { PUBLIC: newSchema() } }
    env.db = name
    env.schema = 'PUBLIC'
    return status(`Database ${name} successfully created.`)
  }
  if (p.accept('SCHEMA')) {
    const ine = ifNot()
    const parts = p.qname()
    p.end()
    const [db, name] = parts.length === 2 ? parts : [env.db, parts[0]]
    if (!db) fail('090105', '22000', "Cannot perform CREATE SCHEMA. This session does not have a current database. Call 'USE DATABASE', or use a qualified name.")
    if (!y.dbs[db] || !has(env, 'USAGE', 'DATABASE', db)) notFound('DATABASE', db)
    need(env, 'CREATE SCHEMA', 'DATABASE', { fq: db, name: db })
    if (y.dbs[db].schemas[name] && exists('SCHEMA', name, replace, ine)) return status(`${name} already exists, statement succeeded.`)
    y.dbs[db].schemas[name] = newSchema()
    env.db = db
    env.schema = name
    return status(`Schema ${name} successfully created.`)
  }
  if (p.accept('TABLE')) {
    const ine = ifNot()
    const parts = p.qname()
    let cols = null
    let like = null
    let q = null
    let copyGrants = p.accept('COPY', 'GRANTS')
    if (p.accept('LIKE')) like = p.qname()
    else if (p.accept('(')) {
      cols = []
      do {
        const name = p.ident()
        const type = typeName(p)
        let depth = 0
        while (!p.done() && !(depth === 0 && (p.is(',') || p.is(')')))) {
          if (p.is('(')) depth++
          if (p.is(')')) depth--
          p.next()
        }
        cols.push({ name, type })
      } while (p.accept(','))
      p.expect(')')
    }
    copyGrants = p.accept('COPY', 'GRANTS') || copyGrants
    if (p.accept('AS')) q = parseSelect(p)
    p.end()
    if (!cols && !like && !q) p.fail()
    const { ref, sch } = target(env, parts, 'CREATE TABLE', 'CREATE TABLE')
    const old = sch.tables[ref.name]
    if ((old || sch.views[ref.name]) && exists('TABLE', ref.name, replace, ine)) return status(`${ref.name} already exists, statement succeeded.`)
    let rows = []
    if (like) cols = relation(env, like, 'CREATE TABLE', ['TABLE']).obj.cols.map((c) => ({ ...c }))
    if (q) {
      const r = runSelect(q, env)
      cols = r.cols.map((c, i) => ({ name: c, type: r.types[i] }))
      rows = r.rows
    }
    if (new Set(cols.map((c) => c.name)).size !== cols.length) fail('002025', '42S21', `SQL compilation error:\nduplicate column name '${cols.find((c, i) => cols.findIndex((x) => x.name === c.name) !== i).name}'`)
    if (old) {
      // the load metadata belongs to the table: a new table has none
      dropMeta(y, ref.fq)
      if (!copyGrants) dropGrants(y, 'TABLE', ref.fq)
    }
    delete sch.views[ref.name]
    sch.tables[ref.name] = { cols, rows, owner: env.role, created: now }
    return status(`Table ${ref.name} successfully created.`)
  }
  if (p.accept('VIEW')) {
    const ine = ifNot()
    const parts = p.qname()
    const copyGrants = p.accept('COPY', 'GRANTS')
    p.expect('AS')
    const k = p.pos()
    const q = parseSelect(p)
    const sql = p.raw(k)
    p.end()
    const { ref, sch } = target(env, parts, 'CREATE VIEW', 'CREATE VIEW')
    if ((sch.views[ref.name] || sch.tables[ref.name]) && exists('VIEW', ref.name, replace, ine)) return status(`${ref.name} already exists, statement succeeded.`)
    if (sch.tables[ref.name]) fail('002002', '42710', `SQL compilation error:\nObject '${ref.name}' already exists as TABLE`)
    // the view is compiled now, so a wrong name fails here
    runSelect(q, { ...env, noWh: true, db: ref.db, schema: ref.schema })
    if (sch.views[ref.name] && !copyGrants) dropGrants(y, 'VIEW', ref.fq)
    sch.views[ref.name] = { sql, owner: env.role, created: now }
    return status(`View ${ref.name} successfully created.`)
  }
  if (p.accept('STAGE')) {
    const ine = ifNot()
    const parts = p.qname()
    const o = props(p)
    p.end()
    const { ref, sch } = target(env, parts, 'CREATE STAGE', 'CREATE STAGE')
    if (sch.stages[ref.name] && exists('STAGE', ref.name, replace, ine)) return status(`${ref.name} already exists, statement succeeded.`)
    const st = { url: o.URL ? String(o.URL) : null, integration: o.STORAGE_INTEGRATION ? up(o.STORAGE_INTEGRATION) : null, format: null, inline: null, files: {}, owner: env.role, created: now }
    if (o.FILE_FORMAT && typeof o.FILE_FORMAT === 'object') {
      if (o.FILE_FORMAT.FORMAT_NAME) st.format = inSchema(env, splitFq(up(o.FILE_FORMAT.FORMAT_NAME)), 'CREATE STAGE', 'formats', 'FILE FORMAT').ref.fq
      else st.inline = formatOf(o.FILE_FORMAT)
    }
    if (st.url && !/^(s3|azure|gcs):\/\//i.test(st.url)) fail('001008', '22023', `SQL compilation error:\ninvalid value '${st.url}' for property 'URL'`) // lab-made code
    if (sch.stages[ref.name]) dropGrants(y, 'STAGE', ref.fq)
    sch.stages[ref.name] = st
    return status(`Stage area ${ref.name} successfully created.`)
  }
  if (p.accept('FILE', 'FORMAT')) {
    const ine = ifNot()
    const parts = p.qname()
    const o = props(p)
    p.end()
    const { ref, sch } = target(env, parts, 'CREATE FILE FORMAT', 'CREATE FILE FORMAT')
    if (sch.formats[ref.name] && exists('FILE FORMAT', ref.name, replace, ine)) return status(`${ref.name} already exists, statement succeeded.`)
    sch.formats[ref.name] = { ...formatOf(o), owner: env.role }
    return status(`File format ${ref.name} successfully created.`)
  }
  if (p.accept('ROLE')) {
    const ine = ifNot()
    const name = p.ident()
    p.end()
    acct(env, 'ROLE')
    if (y.roles[name] && exists('ROLE', name, replace, ine)) return status(`${name} already exists, statement succeeded.`)
    if (BUILTIN_ROLES.includes(name)) fail('003001', '42501', `SQL access control error:\nInsufficient privileges to operate on role '${name}'`)
    y.roles[name] = { grants: [], roles: [], owner: env.role, created: now }
    return status(`Role ${name} successfully created.`)
  }
  if (p.accept('USER')) {
    const ine = ifNot()
    const name = p.ident()
    const o = props(p)
    p.end()
    acct(env, 'USER')
    if (y.users[name] && exists('USER', name, replace, ine)) return status(`${name} already exists, statement succeeded.`)
    const type = up(o.TYPE ?? 'PERSON')
    if (!['PERSON', 'SERVICE', 'LEGACY_SERVICE'].includes(type)) fail('001008', '22023', `SQL compilation error:\ninvalid value '${o.TYPE}' for property 'TYPE'`)
    if (type === 'SERVICE' && o.PASSWORD !== undefined) fail('002048', '22023', 'SQL compilation error:\nA user of TYPE = SERVICE cannot have a password. Use key pair authentication.') // lab-made code and wording
    y.users[name] = { type, password: o.PASSWORD === undefined ? null : String(o.PASSWORD), rsa: o.RSA_PUBLIC_KEY ? normKey(o.RSA_PUBLIC_KEY) : null, defaultRole: o.DEFAULT_ROLE ? up(o.DEFAULT_ROLE) : null, defaultWarehouse: o.DEFAULT_WAREHOUSE ? up(o.DEFAULT_WAREHOUSE) : null, defaultNamespace: o.DEFAULT_NAMESPACE ? up(o.DEFAULT_NAMESPACE) : null, roles: [], disabled: bool(o.DISABLED), created: now, lastLogin: null, lastFail: null, comment: o.COMMENT ?? '' }
    return status(`User ${name} successfully created.`)
  }
  if (p.accept('RESOURCE', 'MONITOR')) {
    const ine = ifNot()
    const name = p.ident()
    p.accept('WITH')
    const o = props(p, ['TRIGGERS'])
    const triggers = parseTriggers(p)
    p.end()
    acct(env, 'RESOURCE MONITOR')
    if (y.monitors[name] && exists('RESOURCE MONITOR', name, replace, ine)) return status(`${name} already exists, statement succeeded.`)
    y.monitors[name] = { quota: Number(o.CREDIT_QUOTA ?? 0), used: 0, frequency: up(o.FREQUENCY ?? 'MONTHLY'), triggers: triggers ?? [], fired: [], created: now }
    return status(`Resource monitor ${name} successfully created.`)
  }
  p.fail()
}
function parseTriggers(p) {
  if (!p.accept('TRIGGERS')) return null
  const out = []
  while (p.accept('ON')) {
    const pct = p.number()
    p.expect('PERCENT', 'DO')
    const action = p.accept('SUSPEND_IMMEDIATE') ? 'SUSPEND_IMMEDIATE' : p.accept('SUSPEND') ? 'SUSPEND' : (p.expect('NOTIFY'), 'NOTIFY')
    out.push({ pct, action })
  }
  return out
}

function warehouseFor(env, name, priv) {
  const w = env.y.warehouses[name]
  if (!w || !(isSys(env) || grantsOn(env, 'WAREHOUSE', name).length)) notFound('WAREHOUSE', name)
  if (priv && !has(env, priv, 'WAREHOUSE', name)) fail('003001', '42501', `SQL access control error:\nInsufficient privileges to operate on warehouse '${name}'`)
  return w
}
const recheck = (m) => (m.fired = m.fired.filter((pct) => m.used >= (m.quota * pct) / 100))

S.ALTER = (p, env) => {
  const y = env.y
  const now = env.now
  p.expect('ALTER')
  if (p.accept('WAREHOUSE')) {
    const ifEx = p.accept('IF', 'EXISTS')
    const name = p.ident()
    if (ifEx && !y.warehouses[name]) return status('Statement executed successfully.')
    if (p.accept('RESUME')) {
      const ifs = p.accept('IF', 'SUSPENDED')
      p.end()
      const w = warehouseFor(env, name, 'OPERATE')
      if (w.state === 'STARTED') {
        if (ifs) return status('Statement executed successfully.')
        fail('090064', '22000', `Invalid state. Warehouse '${name}' cannot be resumed because it is not suspended.`) // lab-made code
      }
      const m = blockerOf(y, name)
      if (m) fail('000630', '57014', `Warehouse '${name}' cannot be resumed because resource monitor '${m}' has exceeded its quota.`)
      start(w, now, `ALTER WAREHOUSE by ${env.user}`)
      return status('Statement executed successfully.')
    }
    if (p.accept('SUSPEND')) {
      p.end()
      const w = warehouseFor(env, name, 'OPERATE')
      if (w.state === 'SUSPENDED') fail('090064', '22000', `Invalid state. Warehouse '${name}' cannot be suspended.`) // lab-made code
      suspend(w, now, `ALTER WAREHOUSE by ${env.user}`)
      return status('Statement executed successfully.')
    }
    if (p.accept('UNSET')) {
      const list = [p.ident()]
      while (p.accept(',')) list.push(p.ident())
      p.end()
      const w = warehouseFor(env, name, 'MODIFY')
      if (list.includes('RESOURCE_MONITOR')) acct(env, 'RESOURCE MONITOR'), (w.monitor = null)
      return status('Statement executed successfully.')
    }
    p.expect('SET')
    const o = props(p)
    p.end()
    const w = warehouseFor(env, name, 'MODIFY')
    if (!Object.keys(o).length) p.fail()
    if (o.RESOURCE_MONITOR !== undefined) {
      acct(env, 'RESOURCE MONITOR')
      const m = up(o.RESOURCE_MONITOR)
      if (m !== 'NULL' && m !== '' && !y.monitors[m]) fail('002003', '02000', `SQL compilation error:\nResource monitor '${m}' does not exist or not authorized.`)
    }
    const size = o.WAREHOUSE_SIZE !== undefined ? sizeOf(o.WAREHOUSE_SIZE) : w.size
    w.size = size
    if (o.AUTO_SUSPEND !== undefined) w.autoSuspend = secondsOf(o.AUTO_SUSPEND)
    if (o.AUTO_RESUME !== undefined) w.autoResume = bool(o.AUTO_RESUME)
    if (o.RESOURCE_MONITOR !== undefined) w.monitor = ['NULL', ''].includes(up(o.RESOURCE_MONITOR)) ? null : up(o.RESOURCE_MONITOR)
    if (o.COMMENT !== undefined) w.comment = String(o.COMMENT)
    push(w.log, { t: now, text: `Changed by ${env.user}: ${Object.entries(o).map(([k, v]) => `${k} = ${v}`).join(', ')}` }, 8)
    return status('Statement executed successfully.')
  }
  if (p.accept('RESOURCE', 'MONITOR')) {
    const name = p.ident()
    p.accept('SET')
    const o = props(p, ['TRIGGERS'])
    const triggers = parseTriggers(p)
    p.end()
    acct(env, 'RESOURCE MONITOR')
    const m = y.monitors[name]
    if (!m) fail('002003', '02000', `SQL compilation error:\nResource monitor '${name}' does not exist or not authorized.`)
    if (o.CREDIT_QUOTA !== undefined) m.quota = Number(o.CREDIT_QUOTA) || 0
    if (o.FREQUENCY !== undefined) m.frequency = up(o.FREQUENCY)
    if (triggers) m.triggers = triggers
    recheck(m)
    return status('Statement executed successfully.')
  }
  if (p.accept('USER')) {
    p.accept('IF', 'EXISTS')
    const name = p.ident()
    const set = p.accept('SET')
    const unset = !set && p.accept('UNSET')
    if (!set && !unset) p.fail()
    let o = {}
    const list = []
    if (set) o = props(p)
    else {
      list.push(p.ident())
      while (p.accept(',')) list.push(p.ident())
    }
    p.end()
    acct(env, 'USER')
    const u = y.users[name]
    if (!u) fail('002003', '02000', `SQL compilation error:\nUser '${name}' does not exist or not authorized.`)
    const type = o.TYPE !== undefined ? up(o.TYPE) : u.type
    if (type === 'SERVICE' && (o.PASSWORD !== undefined || (o.TYPE !== undefined && u.password))) fail('002048', '22023', 'SQL compilation error:\nA user of TYPE = SERVICE cannot have a password. Use key pair authentication.') // lab-made
    u.type = type
    if (o.PASSWORD !== undefined) u.password = String(o.PASSWORD)
    if (o.RSA_PUBLIC_KEY !== undefined) u.rsa = normKey(o.RSA_PUBLIC_KEY) || null
    if (o.DEFAULT_ROLE !== undefined) u.defaultRole = up(o.DEFAULT_ROLE)
    if (o.DEFAULT_WAREHOUSE !== undefined) u.defaultWarehouse = up(o.DEFAULT_WAREHOUSE)
    if (o.DEFAULT_NAMESPACE !== undefined) u.defaultNamespace = up(o.DEFAULT_NAMESPACE)
    if (o.DISABLED !== undefined) u.disabled = bool(o.DISABLED)
    for (const k of list) {
      if (k === 'PASSWORD') u.password = null
      if (k === 'RSA_PUBLIC_KEY') u.rsa = null
      if (k === 'DEFAULT_ROLE') u.defaultRole = null
      if (k === 'DEFAULT_WAREHOUSE') u.defaultWarehouse = null
    }
    return status('Statement executed successfully.')
  }
  if (p.accept('STAGE')) {
    const parts = p.qname()
    p.expect('SET')
    const o = props(p)
    p.end()
    const { ref, obj } = inSchema(env, parts, 'ALTER STAGE', 'stages', 'STAGE')
    need(env, 'OWNERSHIP', 'STAGE', ref)
    if (o.FILE_FORMAT && typeof o.FILE_FORMAT === 'object') {
      if (o.FILE_FORMAT.FORMAT_NAME) Object.assign(obj, { format: inSchema(env, splitFq(up(o.FILE_FORMAT.FORMAT_NAME)), 'ALTER STAGE', 'formats', 'FILE FORMAT').ref.fq, inline: null })
      else Object.assign(obj, { format: null, inline: formatOf(o.FILE_FORMAT) })
    }
    if (o.URL !== undefined) obj.url = String(o.URL)
    return status('Statement executed successfully.')
  }
  if (p.accept('FILE', 'FORMAT')) {
    const parts = p.qname()
    p.expect('SET')
    const o = props(p)
    p.end()
    const { ref, sch, obj } = inSchema(env, parts, 'ALTER FILE FORMAT', 'formats', 'FILE FORMAT')
    need(env, 'OWNERSHIP', 'FILE FORMAT', ref)
    sch.formats[ref.name] = { ...formatOf(o, obj), owner: obj.owner }
    return status('Statement executed successfully.')
  }
  lab('this ALTER statement is not part of the lab')
}

const DROP_KINDS = [['RESOURCE', 'MONITOR'], ['FILE', 'FORMAT'], ['WAREHOUSE'], ['DATABASE'], ['SCHEMA'], ['TABLE'], ['VIEW'], ['STAGE'], ['ROLE'], ['USER']]
S.DROP = (p, env) => {
  const y = env.y
  p.expect('DROP')
  const kw = DROP_KINDS.find((k) => p.accept(...k))
  if (!kw) p.fail()
  const kind = kw.join(' ')
  const ifEx = p.accept('IF', 'EXISTS')
  const parts = p.qname()
  p.end()
  const name = parts.at(-1)
  const ok = () => status(`${name} successfully dropped.`)
  const missing = () => (ifEx ? status(`Drop statement executed successfully (${name} already dropped).`) : fail('002003', '02000', `SQL compilation error:\n${KIND_TEXT[kind] ?? kind[0] + kind.slice(1).toLowerCase()} '${parts.join('.')}' does not exist or not authorized.`))
  if (['WAREHOUSE', 'ROLE', 'USER', 'RESOURCE MONITOR', 'DATABASE'].includes(kind)) {
    acct(env, kind)
    const map = { WAREHOUSE: y.warehouses, ROLE: y.roles, USER: y.users, 'RESOURCE MONITOR': y.monitors, DATABASE: y.dbs }[kind]
    if (!map[name]) return missing()
    if (kind === 'ROLE' && BUILTIN_ROLES.includes(name)) fail('003001', '42501', `SQL access control error:\nInsufficient privileges to operate on role '${name}'`)
    if (kind === 'USER' && name === ADMIN_USER) fail('003001', '42501', `SQL access control error:\nInsufficient privileges to operate on user '${name}'`) // lab-made: the lab keeps its admin
    delete map[name]
    if (kind === 'ROLE') {
      for (const u of Object.values(y.users)) u.roles = u.roles.filter((r) => r !== name)
      for (const r of Object.values(y.roles)) r.roles = r.roles.filter((x) => x !== name)
    }
    if (kind === 'RESOURCE MONITOR') for (const w of Object.values(y.warehouses)) if (w.monitor === name) w.monitor = null
    return ok()
  }
  if (kind === 'SCHEMA') {
    const [db, sc] = parts.length === 2 ? parts : [env.db, parts[0]]
    if (!isSys(env)) acct(env, 'DATABASE')
    if (!y.dbs[db]?.schemas[sc]) return missing()
    delete y.dbs[db].schemas[sc]
    return ok()
  }
  const map = { TABLE: 'tables', VIEW: 'views', STAGE: 'stages', 'FILE FORMAT': 'formats' }[kind]
  const ref = resolve(env, parts, `DROP ${kind}`)
  const sch = schemaAt(y, ref.db, ref.schema)
  if (!sch?.[map][ref.name] || !nsOk(env, ref)) return missing()
  need(env, 'OWNERSHIP', kind, ref)
  delete sch[map][ref.name]
  dropGrants(y, kind, ref.fq)
  if (kind === 'TABLE') dropMeta(y, ref.fq)
  return ok()
}

function grantTarget(p) {
  if (p.accept('ACCOUNT')) return { kind: 'ACCOUNT', parts: [ACCOUNT] }
  if (p.accept('FUTURE')) lab('future grants are not part of the lab. Grant on the table itself, or on ALL TABLES IN SCHEMA')
  if (p.accept('ALL')) {
    const kind = p.accept('TABLES') ? 'TABLE' : p.accept('VIEWS') ? 'VIEW' : p.accept('STAGES') ? 'STAGE' : p.fail()
    p.expect('IN', 'SCHEMA')
    return { kind, all: p.qname() }
  }
  const kw = [['FILE', 'FORMAT'], ['WAREHOUSE'], ['DATABASE'], ['SCHEMA'], ['TABLE'], ['VIEW'], ['STAGE']].find((k) => p.accept(...k))
  if (!kw) p.fail()
  return { kind: kw.join(' '), parts: p.qname() }
}
function privList(p) {
  const out = []
  let cur = []
  while (!p.done() && !p.is('ON')) {
    if (p.accept(',')) {
      out.push(cur.join(' '))
      cur = []
      continue
    }
    cur.push(p.ident())
  }
  if (cur.length) out.push(cur.join(' '))
  if (!out.length) p.fail()
  return out.map((x) => (x === 'ALL PRIVILEGES' ? 'ALL' : x))
}
// the fully qualified names a grant is about
function grantNames(env, t) {
  const y = env.y
  if (t.kind === 'ACCOUNT') return [ACCOUNT]
  if (t.all) {
    const [db, sc] = t.all.length === 2 ? t.all : [env.db, t.all[0]]
    const sch = schemaAt(y, db, sc)
    if (!sch) fail('002003', '02000', `SQL compilation error:\nSchema '${db}.${sc}' does not exist or not authorized.`)
    return Object.keys(sch[{ TABLE: 'tables', VIEW: 'views', STAGE: 'stages' }[t.kind]]).map((n) => `${db}.${sc}.${n}`)
  }
  const parts = t.parts
  if (t.kind === 'WAREHOUSE') return y.warehouses[parts[0]] ? [parts[0]] : notFound('WAREHOUSE', parts[0])
  if (t.kind === 'DATABASE') return y.dbs[parts[0]] ? [parts[0]] : notFound('DATABASE', parts[0])
  if (t.kind === 'SCHEMA') {
    const [db, sc] = parts.length === 2 ? parts : [env.db, parts[0]]
    if (!db) fail('090105', '22000', "Cannot perform GRANT. This session does not have a current database. Call 'USE DATABASE', or use a qualified name.")
    return schemaAt(y, db, sc) ? [`${db}.${sc}`] : notFound('SCHEMA', `${db}.${sc}`)
  }
  const ref = resolve(env, parts, 'GRANT')
  const map = { TABLE: 'tables', VIEW: 'views', STAGE: 'stages', 'FILE FORMAT': 'formats' }[t.kind]
  if (!schemaAt(y, ref.db, ref.schema)?.[map][ref.name]) notFound(t.kind, ref.fq)
  return [ref.fq]
}
function grantee(env, p) {
  const toUser = p.accept('USER')
  if (!toUser) p.accept('ROLE')
  return { toUser, name: p.ident() }
}
const roleMissing = (r) => fail('002003', '02000', `SQL compilation error:\nRole '${r}' does not exist or not authorized.`)
const userMissing = (u) => fail('002003', '02000', `SQL compilation error:\nUser '${u}' does not exist or not authorized.`)

S.GRANT = (p, env) => {
  const y = env.y
  p.expect('GRANT')
  if (p.accept('ROLE')) {
    const r = p.ident()
    p.expect('TO')
    const g = grantee(env, p)
    p.end()
    acct(env, 'ROLE')
    if (!y.roles[r]) roleMissing(r)
    if (g.toUser) {
      const u = y.users[g.name] ?? userMissing(g.name)
      if (!u.roles.includes(r)) u.roles.push(r)
    } else {
      const x = y.roles[g.name] ?? roleMissing(g.name)
      if (rolesOf(y, r).has(g.name)) fail('003014', '42601', `SQL compilation error:\nGranting role '${r}' to role '${g.name}' would create a cycle.`) // lab-made code
      if (!x.roles.includes(r)) x.roles.push(r)
    }
    return status('Statement executed successfully.')
  }
  const privs = privList(p)
  p.expect('ON')
  const t = grantTarget(p)
  p.expect('TO')
  p.accept('ROLE')
  const role = p.ident()
  p.accept('WITH', 'GRANT', 'OPTION')
  p.end()
  acct(env, 'GRANTS')
  if (!y.roles[role]) roleMissing(role)
  for (const x of privs) if (!VALID[t.kind]?.includes(x)) fail('003011', '42501', `SQL compilation error:\nInvalid privilege ${x} for ${t.kind === 'ACCOUNT' ? 'the account' : `object type ${t.kind}`}.`) // lab-made wording
  if (privs.includes('OWNERSHIP')) lab('the lab does not move the ownership of objects')
  const names = grantNames(env, t)
  for (const name of names) for (const priv of privs) if (!y.roles[role].grants.some((g) => g.priv === priv && g.kind === t.kind && g.name === name)) y.roles[role].grants.push({ priv, kind: t.kind, name })
  return status('Statement executed successfully.')
}
S.REVOKE = (p, env) => {
  const y = env.y
  p.expect('REVOKE')
  if (p.accept('ROLE')) {
    const r = p.ident()
    p.expect('FROM')
    const g = grantee(env, p)
    p.end()
    acct(env, 'ROLE')
    if (g.toUser) {
      const u = y.users[g.name] ?? userMissing(g.name)
      u.roles = u.roles.filter((x) => x !== r)
    } else {
      const x = y.roles[g.name] ?? roleMissing(g.name)
      x.roles = x.roles.filter((z) => z !== r)
    }
    return status('Statement executed successfully.')
  }
  const privs = privList(p)
  p.expect('ON')
  const t = grantTarget(p)
  p.expect('FROM')
  p.accept('ROLE')
  const role = p.ident()
  p.end()
  acct(env, 'GRANTS')
  if (!y.roles[role]) roleMissing(role)
  const names = grantNames(env, t)
  y.roles[role].grants = y.roles[role].grants.filter((g) => !(g.kind === t.kind && names.includes(g.name) && (privs.includes(g.priv) || privs.includes('ALL'))))
  return status('Statement executed successfully.')
}

S.SHOW = (p, env) => {
  const y = env.y
  p.expect('SHOW')
  const out = (cols, rows) => ({ cols, rows })
  if (p.accept('WAREHOUSES')) {
    p.end()
    const list = Object.entries(y.warehouses).filter(([n]) => isSys(env) || grantsOn(env, 'WAREHOUSE', n).length)
    return out(['name', 'state', 'type', 'size', 'auto_suspend', 'auto_resume', 'resource_monitor', 'owner'], list.map(([n, w]) => [n, w.state, 'STANDARD', SIZE_TEXT[w.size], w.autoSuspend || null, String(w.autoResume), w.monitor ?? 'null', w.owner]))
  }
  if (p.accept('RESOURCE', 'MONITORS')) {
    p.end()
    acct(env, 'RESOURCE MONITOR')
    const at = (m, a) => m.triggers.filter((t) => t.action === a).map((t) => `${t.pct}%`).join(',') || null
    return out(['name', 'credit_quota', 'used_credits', 'remaining_credits', 'frequency', 'notify_at', 'suspend_at', 'suspend_immediately_at'], Object.entries(y.monitors).map(([n, m]) => [n, m.quota, round(m.used, 2), round(Math.max(0, m.quota - m.used), 2), m.frequency, at(m, 'NOTIFY'), at(m, 'SUSPEND'), at(m, 'SUSPEND_IMMEDIATE')]))
  }
  if (p.accept('USERS')) {
    p.end()
    acct(env, 'USER')
    return out(['name', 'type', 'default_role', 'default_warehouse', 'has_password', 'has_rsa_public_key', 'disabled', 'last_success_login'], Object.entries(y.users).map(([n, u]) => [n, u.type, u.defaultRole, u.defaultWarehouse, String(Boolean(u.password)), String(Boolean(u.rsa)), String(Boolean(u.disabled)), u.lastLogin ? tsText(u.lastLogin.t) : null]))
  }
  if (p.accept('ROLES')) {
    p.end()
    return out(['name', 'assigned_to_users', 'granted_to_roles', 'owner'], Object.entries(y.roles).map(([n, r]) => [n, Object.values(y.users).filter((u) => u.roles.includes(n)).length, Object.values(y.roles).filter((x) => x.roles.includes(n)).length, r.owner ?? '']))
  }
  if (p.accept('GRANTS', 'TO')) {
    const g = grantee(env, p)
    p.end()
    if (g.toUser) {
      const u = y.users[g.name] ?? userMissing(g.name)
      return out(['role', 'granted_to', 'grantee_name'], u.roles.map((r) => [r, 'USER', g.name]))
    }
    const r = y.roles[g.name] ?? roleMissing(g.name)
    return out(['privilege', 'granted_on', 'name', 'granted_to', 'grantee_name'], [...r.grants.map((x) => [x.priv, x.kind.replace(' ', '_'), x.name, 'ROLE', g.name]), ...r.roles.map((x) => ['USAGE', 'ROLE', x, 'ROLE', g.name])])
  }
  if (p.accept('DATABASES')) {
    p.end()
    return out(['name', 'owner'], Object.entries(y.dbs).filter(([n]) => sees(env, 'DATABASE', n)).map(([n, d]) => [n, d.owner ?? 'SYSADMIN']))
  }
  const kw = [['SCHEMAS'], ['TABLES'], ['VIEWS'], ['STAGES'], ['FILE', 'FORMATS']].find((k) => p.accept(...k))
  if (!kw) lab('this SHOW command is not part of the lab')
  let db = env.db
  let sc = env.schema
  if (p.accept('IN')) {
    if (p.accept('DATABASE')) {
      db = p.ident()
      sc = null
    } else {
      p.accept('SCHEMA')
      const parts = p.qname()
      ;[db, sc] = parts.length === 2 ? parts : [env.db, parts[0]]
    }
  }
  p.end()
  if (!db || !y.dbs[db]) fail('090105', '22000', "Cannot perform SHOW. This session does not have a current database. Call 'USE DATABASE', or use a qualified name.")
  if (kw[0] === 'SCHEMAS') return out(['name', 'database_name'], Object.keys(y.dbs[db].schemas).filter((n) => sees(env, 'SCHEMA', `${db}.${n}`)).map((n) => [n, db]))
  const map = { TABLES: 'tables', VIEWS: 'views', STAGES: 'stages', FILE: 'formats' }[kw[0]]
  const kind = { TABLES: 'TABLE', VIEWS: 'VIEW', STAGES: 'STAGE', FILE: 'FILE FORMAT' }[kw[0]]
  const rows = []
  for (const [s, sch] of Object.entries(y.dbs[db].schemas)) {
    if (sc && s !== sc) continue
    for (const [n, o] of Object.entries(sch[map])) {
      if (!sees(env, kind, `${db}.${s}.${n}`)) continue
      rows.push(kind === 'TABLE' ? [n, db, s, o.rows.length, o.owner ?? ''] : kind === 'STAGE' ? [n, db, s, o.url ?? '', o.url ? 'EXTERNAL' : 'INTERNAL'] : kind === 'VIEW' ? [n, db, s, o.sql] : [n, db, s, o.type])
    }
  }
  return out(kind === 'TABLE' ? ['name', 'database_name', 'schema_name', 'rows', 'owner'] : kind === 'STAGE' ? ['name', 'database_name', 'schema_name', 'url', 'type'] : kind === 'VIEW' ? ['name', 'database_name', 'schema_name', 'text'] : ['name', 'database_name', 'schema_name', 'type'], rows)
}

const describe = (p, env) => {
  const y = env.y
  p.next()
  if (p.accept('USER')) {
    const name = p.ident()
    p.end()
    if (!(name === env.user)) acct(env, 'USER')
    const u = y.users[name] ?? userMissing(name)
    return {
      cols: ['property', 'value'],
      rows: [
        ['NAME', name],
        ['TYPE', u.type],
        ['DEFAULT_ROLE', u.defaultRole],
        ['DEFAULT_WAREHOUSE', u.defaultWarehouse],
        ['DEFAULT_NAMESPACE', u.defaultNamespace],
        ['HAS_PASSWORD', String(Boolean(u.password))],
        ['RSA_PUBLIC_KEY', u.rsa],
        ['RSA_PUBLIC_KEY_FP', fingerprintOf(u.rsa)],
        ['DISABLED', String(Boolean(u.disabled))],
      ],
    }
  }
  p.accept('TABLE') || p.accept('VIEW')
  const { obj, kind } = relation(env, p.qname(), 'DESCRIBE')
  p.end()
  if (kind === 'VIEW') return { cols: ['name', 'text'], rows: [['TEXT', obj.sql]] }
  return { cols: ['name', 'type', 'kind', 'null?'], rows: obj.cols.map((c) => [c.name, c.type, 'COLUMN', 'Y']) }
}
S.DESCRIBE = describe
S.DESC = describe

// @NAME or @DB.SCHEMA.NAME/path
function stageRef(env, v, what) {
  const [name, ...path] = String(v).split('/')
  if (name === '~' || name.startsWith('%')) lab('user stages and table stages are not part of the lab. Use a named stage')
  const parts = name.split('.').map((x) => x.toUpperCase())
  const { ref, obj } = inSchema(env, parts, what, 'stages', 'STAGE')
  return { ref, st: obj, path: path.join('/') }
}
const pickFiles = (st, path, files, pattern, fq) => {
  let list = Object.keys(st.files).filter((n) => !path || n.startsWith(path))
  if (files) {
    const want = [].concat(files).map(String)
    list = list.filter((n) => want.includes(n) || want.includes(n.replace(/\.gz$/, '')) || want.some((w) => stagePath(fq, st, n).endsWith(`/${w}`)))
  }
  if (pattern) {
    let re
    try {
      re = new RegExp(`^(?:${pattern})$`, 'i')
    } catch {
      fail('100049', '22023', `Invalid regular expression '${pattern}'`) // lab-made code
    }
    list = list.filter((n) => re.test(n) || re.test(stagePath(fq, st, n)))
  }
  return list.sort()
}

S.LIST = (p, env) => {
  p.next()
  const t = p.next()
  if (t.t !== 'stage') p.fail()
  const o = props(p)
  p.end()
  const { ref, st, path } = stageRef(env, t.v, 'LIST')
  need(env, st.url ? 'USAGE' : 'READ', 'STAGE', ref)
  const names = pickFiles(st, path, null, o.PATTERN, ref.fq)
  return { cols: ['name', 'size', 'md5', 'last_modified'], rows: names.map((n) => [stagePath(ref.fq, st, n), st.files[n].size, st.files[n].md5, tsText(st.files[n].t)]) }
}
S.LS = S.LIST
S.REMOVE = (p, env) => {
  p.next()
  const t = p.next()
  if (t.t !== 'stage') p.fail()
  const o = props(p)
  p.end()
  const { ref, st, path } = stageRef(env, t.v, 'REMOVE')
  need(env, st.url ? 'USAGE' : 'WRITE', 'STAGE', ref)
  const names = pickFiles(st, path, null, o.PATTERN, ref.fq)
  for (const n of names) delete st.files[n]
  return { cols: ['name', 'result'], rows: names.map((n) => [stagePath(ref.fq, st, n), 'removed']) }
}
S.RM = S.REMOVE
S.PUT = () => fail('000002', '0A000', "Unsupported feature 'PUT' in a worksheet. Upload files with + Files on the stage, or run PUT from SnowSQL or a driver.") // lab-made wording

// ---------- DML ----------

function tableFor(env, parts, what) {
  const r = relation(env, parts, what, ['TABLE', 'VIEW'])
  if (r.kind === 'VIEW') fail('002051', '42601', `SQL compilation error:\nInvalid operation on view '${r.ref.name}'.`) // lab-made code
  return r
}
function rowCtx(t, alias, vals) {
  const o = {}
  t.cols.forEach((c, i) => {
    o[c.name] = vals[i]
    if (alias) o[`${alias}.${c.name}`] = vals[i]
  })
  return o
}
const colIndex = (t, name, at) => {
  const i = t.cols.findIndex((c) => c.name === name)
  if (i < 0) fail('000904', '42000', `SQL compilation error: error line ${at?.line ?? 1} at position ${at?.pos ?? 0}\ninvalid identifier '${name}'`)
  return i
}

S.INSERT = (p, env) => {
  p.expect('INSERT')
  const overwrite = p.accept('OVERWRITE')
  p.expect('INTO')
  const parts = p.qname()
  let cols = null
  if (p.is('(') && !p.is('(', 'SELECT')) {
    p.next()
    cols = [p.ident()]
    while (p.accept(',')) cols.push(p.ident())
    p.expect(')')
  }
  let values = null
  let q = null
  if (p.accept('VALUES')) {
    values = []
    do {
      p.expect('(')
      const row = [expr(p)]
      while (p.accept(',')) row.push(expr(p))
      p.expect(')')
      values.push(row)
    } while (p.accept(','))
  } else if (p.is('SELECT')) q = parseSelect(p)
  else if (p.accept('(')) {
    q = parseSelect(p)
    p.expect(')')
  } else p.fail()
  p.end()
  const { ref, obj: t } = tableFor(env, parts, 'INSERT')
  need(env, 'INSERT', 'TABLE', ref)
  if (overwrite) need(env, 'DELETE', 'TABLE', ref)
  const idx = cols ? cols.map((c) => colIndex(t, c)) : t.cols.map((_, i) => i)
  let src
  if (q) src = runSelect(q, env).rows
  else src = values.map((row) => row.map((e) => ev(e, {}, env)))
  needWh(env)
  const out = src.map((row) => {
    if (row.length !== idx.length) fail('002020', '21S01', `SQL compilation error:\nInsert value list does not match column list expecting ${idx.length} but got ${row.length}`)
    const full = t.cols.map(() => null)
    idx.forEach((ci, k) => (full[ci] = coerce(row[k], t.cols[ci].type)))
    return full
  })
  t.rows = overwrite ? out : [...t.rows, ...out]
  return { ...counts([['number of rows inserted', out.length]]), stats: { inserted: out.length } }
}

S.UPDATE = (p, env) => {
  p.expect('UPDATE')
  const parts = p.qname()
  let alias = null
  if (p.accept('AS')) alias = p.ident()
  else if (p.tok()?.t === 'w' && !RESERVED.has(p.tok().v)) alias = p.ident()
  p.expect('SET')
  const sets = []
  do {
    const c = p.qname()
    p.expect('=')
    sets.push([c.at(-1), expr(p)])
  } while (p.accept(','))
  const cond = p.accept('WHERE') ? expr(p) : null
  p.end()
  const { ref, obj: t } = tableFor(env, parts, 'UPDATE')
  need(env, 'UPDATE', 'TABLE', ref)
  const a = alias ?? ref.name
  const idx = sets.map(([c]) => colIndex(t, c))
  needWh(env)
  let n = 0
  const rows = t.rows.map((vals) => {
    const ctx = rowCtx(t, a, vals)
    if (cond && ev(cond, ctx, env) !== true) return vals
    n++
    const next = [...vals]
    sets.forEach(([, e], k) => (next[idx[k]] = coerce(ev(e, ctx, env), t.cols[idx[k]].type)))
    return next
  })
  t.rows = rows
  return { ...counts([['number of rows updated', n], ['number of multi-joined rows updated', 0]]), stats: { updated: n } }
}

S.DELETE = (p, env) => {
  p.expect('DELETE', 'FROM')
  const parts = p.qname()
  let alias = null
  if (p.accept('AS')) alias = p.ident()
  else if (p.tok()?.t === 'w' && !RESERVED.has(p.tok().v)) alias = p.ident()
  const cond = p.accept('WHERE') ? expr(p) : null
  p.end()
  const { ref, obj: t } = tableFor(env, parts, 'DELETE')
  need(env, 'DELETE', 'TABLE', ref)
  const a = alias ?? ref.name
  needWh(env)
  const keep = t.rows.filter((vals) => !(cond ? ev(cond, rowCtx(t, a, vals), env) === true : true))
  const n = t.rows.length - keep.length
  t.rows = keep
  return { ...counts([['number of rows deleted', n]]), stats: { deleted: n } }
}

S.TRUNCATE = (p, env) => {
  p.expect('TRUNCATE')
  p.accept('TABLE')
  const ifEx = p.accept('IF', 'EXISTS')
  const parts = p.qname()
  p.end()
  if (ifEx) {
    const ref = resolve(env, parts, 'TRUNCATE')
    if (!schemaAt(env.y, ref.db, ref.schema)?.tables[ref.name]) return status('Statement executed successfully.')
  }
  const { ref, obj: t } = tableFor(env, parts, 'TRUNCATE')
  need(env, 'TRUNCATE', 'TABLE', ref)
  t.rows = []
  // TRUNCATE also deletes the load metadata of the table, so the same files load again; DELETE keeps it
  dropMeta(env.y, ref.fq)
  return status('Statement executed successfully.')
}

S.MERGE = (p, env) => {
  p.expect('MERGE', 'INTO')
  const parts = p.qname()
  let talias = null
  if (p.accept('AS')) talias = p.ident()
  else if (p.tok()?.t === 'w' && !RESERVED.has(p.tok().v)) talias = p.ident()
  p.expect('USING')
  const src = parseSource(p)
  p.expect('ON')
  const on = expr(p)
  const clauses = []
  while (p.accept('WHEN')) {
    const matched = !p.accept('NOT')
    p.expect('MATCHED')
    const cond = p.accept('AND') ? expr(p) : null
    p.expect('THEN')
    if (matched && p.accept('UPDATE', 'SET')) {
      const sets = []
      do {
        const c = p.qname()
        p.expect('=')
        sets.push([c.at(-1), expr(p)])
      } while (p.accept(','))
      clauses.push({ matched, cond, op: 'update', sets })
    } else if (matched && p.accept('DELETE')) clauses.push({ matched, cond, op: 'delete' })
    else if (!matched && p.accept('INSERT')) {
      let cols = null
      if (p.accept('(')) {
        cols = [p.qname().at(-1)]
        while (p.accept(',')) cols.push(p.qname().at(-1))
        p.expect(')')
      }
      p.expect('VALUES', '(')
      const vals = [expr(p)]
      while (p.accept(',')) vals.push(expr(p))
      p.expect(')')
      clauses.push({ matched, cond, op: 'insert', cols, vals })
    } else p.fail()
  }
  p.end()
  if (!clauses.length) p.fail()
  const { ref, obj: t } = tableFor(env, parts, 'MERGE')
  if (clauses.some((c) => c.op === 'insert')) need(env, 'INSERT', 'TABLE', ref)
  if (clauses.some((c) => c.op === 'update')) need(env, 'UPDATE', 'TABLE', ref)
  if (clauses.some((c) => c.op === 'delete')) need(env, 'DELETE', 'TABLE', ref)
  const s = source(src, env)
  needWh(env)
  const ta = talias ?? ref.name
  const tctx = t.rows.map((vals) => rowCtx(t, ta, vals))
  // lab-made: an unqualified column takes the source value when both sides have it; Snowflake calls that ambiguous
  const both = (a, b) => Object.assign({}, a, b)
  const hits = new Map()
  const unmatched = []
  for (const srow of s.rows) {
    let any = false
    tctx.forEach((tr, i) => {
      if (ev(on, both(tr, srow), env) === true) {
        any = true
        if (!hits.has(i)) hits.set(i, [])
        hits.get(i).push(srow)
      }
    })
    if (!any) unmatched.push(srow)
  }
  const fmt = (vals) => `[${vals.map((v) => (v === null ? 'NULL' : typeof v === 'string' ? `"${v}"` : v)).join(', ')}]`
  let updated = 0
  let deleted = 0
  const rows = t.rows.map((r) => [...r])
  const gone = new Set()
  const matchedClauses = clauses.filter((c) => c.matched)
  for (const [i, list] of hits) {
    if (!matchedClauses.length) continue
    // ERROR_ON_NONDETERMINISTIC_MERGE is TRUE by default: one target row may join only one source row
    if (list.length > 1) fail('100090', '42P18', `Duplicate row detected during DML action\nRow Values: ${fmt(t.rows[i])}`)
    const ctx = both(tctx[i], list[0])
    const c = matchedClauses.find((x) => !x.cond || ev(x.cond, ctx, env) === true)
    if (!c) continue
    if (c.op === 'delete') {
      gone.add(i)
      deleted++
    } else {
      c.sets.forEach(([col, e]) => {
        const ci = colIndex(t, col)
        rows[i][ci] = coerce(ev(e, ctx, env), t.cols[ci].type)
      })
      updated++
    }
  }
  const added = []
  const ins = clauses.filter((c) => !c.matched)
  for (const srow of unmatched) {
    const c = ins.find((x) => !x.cond || ev(x.cond, srow, env) === true)
    if (!c) continue
    const idx = c.cols ? c.cols.map((x) => colIndex(t, x)) : t.cols.map((_, i) => i)
    if (idx.length !== c.vals.length) fail('002020', '21S01', `SQL compilation error:\nInsert value list does not match column list expecting ${idx.length} but got ${c.vals.length}`)
    const full = t.cols.map(() => null)
    idx.forEach((ci, k) => (full[ci] = coerce(ev(c.vals[k], srow, env), t.cols[ci].type)))
    added.push(full)
  }
  t.rows = [...rows.filter((_, i) => !gone.has(i)), ...added]
  const pairs = [['number of rows inserted', added.length], ['number of rows updated', updated]]
  if (clauses.some((c) => c.op === 'delete')) pairs.push(['number of rows deleted', deleted])
  return { ...counts(pairs), stats: { inserted: added.length, updated, deleted } }
}

// ---------- COPY INTO ----------

function splitCsv(line, f) {
  const out = []
  const d = f.delimiter || ','
  const q = f.enclosedBy
  let i = 0
  for (;;) {
    const at = i
    if (q && line[i] === q) {
      let v = ''
      i++
      while (i < line.length) {
        if (line[i] === q) {
          if (line[i + 1] === q) {
            v += q
            i += 2
            continue
          }
          i++
          break
        }
        v += line[i++]
      }
      out.push({ v, at, quoted: true })
      const nx = line.indexOf(d, i)
      if (nx < 0) break
      i = nx + d.length
    } else {
      const nx = line.indexOf(d, i)
      out.push({ v: line.slice(i, nx < 0 ? line.length : nx), at })
      if (nx < 0) break
      i = nx + d.length
    }
  }
  return out
}

function parseOnError(v) {
  if (v === undefined) return { mode: 'ABORT', text: 'ABORT_STATEMENT' }
  const s = up(v)
  if (s === 'ABORT_STATEMENT') return { mode: 'ABORT', text: s }
  if (s === 'CONTINUE') return { mode: 'CONTINUE', text: s }
  if (s === 'SKIP_FILE') return { mode: 'SKIP', n: 1, text: s }
  let m = s.match(/^SKIP_FILE_(\d+)$/)
  if (m) return { mode: 'SKIP', n: Number(m[1]), text: s }
  m = s.match(/^SKIP_FILE_(\d+(?:\.\d+)?)%$/)
  if (m) return { mode: 'SKIP', pct: Number(m[1]), text: s }
  fail('001008', '22023', `SQL compilation error:\ninvalid value '${v}' for property 'ON_ERROR'`) // lab-made code
}

function readFile(t, tname, cols, fileName, content, f) {
  const lines = content.split(/\r?\n/)
  if (lines.at(-1) === '') lines.pop()
  const idx = cols ? cols.map((c) => colIndex(t, c)) : t.cols.map((_, i) => i)
  const good = []
  const errors = []
  let parsed = 0
  for (let li = 0; li < lines.length; li++) {
    if (li < (f.skipHeader ?? 0)) continue
    const line = lines[li]
    if (line === '' && f.skipBlank) continue
    parsed++
    const fields = splitCsv(line, f)
    const base = { file: fileName, line: li + 1, row: parsed, record: line, category: 'conversion' }
    if (fields.length !== idx.length && f.mismatch !== false) {
      errors.push({ ...base, error: `Number of columns in file (${fields.length}) does not match that of the corresponding table (${idx.length}), use file format option error_on_column_count_mismatch=false to ignore this error`, code: '100080', state: '22000', character: 1, column: `"${tname}"[${fields.length}]`, category: 'parsing' })
      continue
    }
    const full = t.cols.map(() => null)
    let bad = null
    for (let k = 0; k < idx.length; k++) {
      const fl = fields[k]
      let raw = fl ? fl.v : null
      if (raw !== null && f.trim) raw = raw.trim()
      if (raw !== null && ((f.nullIf ?? ['\\N']).includes(raw) || (raw === '' && f.emptyAsNull !== false && !fl.quoted))) raw = null
      const c = t.cols[idx[k]]
      try {
        full[idx[k]] = coerce(raw, c.type)
      } catch (e) {
        if (!e.sf) throw e
        bad = { ...base, error: e.msg, code: e.code, state: e.state, character: (fl?.at ?? 0) + 1, column: `"${tname}"["${c.name}":${idx[k] + 1}]` }
        break
      }
    }
    if (bad) errors.push(bad)
    else good.push(full)
  }
  return { parsed, good, errors }
}
const firstErrorText = (e) => `${e.error}\n  File '${e.file}', line ${e.line}, character ${e.character}\n  Row ${e.row}, column ${e.column}\n  If you would like to continue loading when an error is encountered, use other values such as 'SKIP_FILE' or 'CONTINUE' for the ON_ERROR option. For more information on loading options, please run 'info loading_data' in a SQL client.`
const COPY_STATUS = { LOADED: 'Loaded', PARTIALLY_LOADED: 'Partially loaded', LOAD_FAILED: 'Load failed' }

S.COPY = (p, env) => {
  const y = env.y
  const now = env.now
  p.expect('COPY', 'INTO')
  if (p.tok()?.t === 'stage') lab('unloading with COPY INTO @stage is not part of the lab')
  const tparts = p.qname()
  let cols = null
  if (p.accept('(')) {
    cols = [p.ident()]
    while (p.accept(',')) cols.push(p.ident())
    p.expect(')')
  }
  p.expect('FROM')
  if (p.is('(')) lab('COPY with a SELECT that transforms the staged columns is not part of the lab')
  const st = p.next()
  if (st.t !== 'stage') p.fail()
  const o = props(p)
  p.end()
  const known = ['FILES', 'PATTERN', 'FILE_FORMAT', 'ON_ERROR', 'VALIDATION_MODE', 'FORCE', 'PURGE', 'LOAD_UNCERTAIN_FILES', 'SIZE_LIMIT', 'RETURN_FAILED_ONLY', 'MATCH_BY_COLUMN_NAME', 'ENFORCE_LENGTH', 'TRUNCATECOLUMNS']
  const odd = Object.keys(o).find((k) => !known.includes(k))
  if (odd) fail('001008', '22023', `SQL compilation error:\ninvalid property '${odd}' for 'COPY'`) // lab-made wording
  const { ref, obj: t } = tableFor(env, tparts, 'COPY')
  need(env, 'INSERT', 'TABLE', ref)
  const sr = stageRef(env, st.v, 'COPY')
  need(env, sr.st.url ? 'USAGE' : 'READ', 'STAGE', sr.ref)
  // the file format: COPY options, then the format of the stage, then the CSV defaults
  let f
  if (o.FILE_FORMAT && typeof o.FILE_FORMAT === 'object' && o.FILE_FORMAT.FORMAT_NAME) {
    const ff = inSchema(env, splitFq(up(o.FILE_FORMAT.FORMAT_NAME)), 'COPY', 'formats', 'FILE FORMAT')
    need(env, 'USAGE', 'FILE FORMAT', ff.ref)
    f = csvOf(ff.obj)
  } else if (o.FILE_FORMAT && typeof o.FILE_FORMAT === 'object') f = csvOf(formatOf(o.FILE_FORMAT))
  else if (sr.st.format) f = csvOf(formatAt(y, sr.st.format) ?? {})
  else f = csvOf(sr.st.inline ?? {})
  if (f.type !== 'CSV') lab(`loading ${f.type} files is not part of the lab. The lab loads CSV`)
  const onError = parseOnError(o.ON_ERROR)
  const vm = o.VALIDATION_MODE !== undefined ? up(o.VALIDATION_MODE) : null
  const nRows = vm && vm.match(/^RETURN_(\d+)_ROWS$/)
  if (vm && !['RETURN_ERRORS', 'RETURN_ALL_ERRORS'].includes(vm) && !nRows) fail('001008', '22023', `SQL compilation error:\ninvalid value '${o.VALIDATION_MODE}' for property 'VALIDATION_MODE'`)
  const force = bool(o.FORCE)
  const names = pickFiles(sr.st, sr.path, o.FILES, o.PATTERN, sr.ref.fq)
  needWh(env)
  // the load metadata: a file this table loaded in the last 64 days with the same checksum is skipped, without a word
  const todo = []
  let skipped = 0
  for (const name of names) {
    const file = sr.st.files[name]
    const m = y.meta[fileKey(ref.fq, sr.ref.fq, name)]
    const fresh = m && now - m.t <= META_DAYS * DAY
    if (!force && fresh && m.md5 === file.md5) {
      skipped++
      continue
    }
    // older than 64 days with no metadata: Snowflake cannot tell, and skips it unless LOAD_UNCERTAIN_FILES
    if (!force && !fresh && now - file.t > META_DAYS * DAY && !bool(o.LOAD_UNCERTAIN_FILES)) {
      skipped++
      continue
    }
    todo.push(name)
  }
  const reads = todo.map((name) => ({ name, path: stagePath(sr.ref.fq, sr.st, name), ...readFile(t, ref.name, cols, stagePath(sr.ref.fq, sr.st, name), sr.st.files[name].content, f) }))
  env.work = reads.reduce((n, r) => n + r.parsed, 0)
  if (vm && !nRows) {
    const errs = reads.flatMap((r) => r.errors)
    return { cols: ['ERROR', 'FILE', 'LINE', 'CHARACTER', 'CATEGORY', 'CODE', 'SQL_STATE', 'COLUMN_NAME', 'ROW_NUMBER', 'REJECTED_RECORD'], rows: errs.map((e) => [e.error, e.file, e.line, e.character, e.category, Number(e.code), e.state, e.column, e.row, e.record]), message: `${errs.length} errors found`, stats: { validated: reads.length, errors: errs.length } }
  }
  if (nRows) {
    const n = Number(nRows[1])
    const out = []
    for (const r of reads) {
      for (const e of r.errors) if (e.row <= n) fail(e.code, e.state, firstErrorText(e))
      out.push(...r.good)
    }
    return { cols: t.cols.map((c) => c.name), rows: out.slice(0, n), stats: { validated: reads.length } }
  }
  if (!reads.length) return { ...status('Copy executed with 0 files processed.'), stats: { files: [], loaded: 0, skipped, errors: 0 } }
  const results = []
  for (const r of reads) {
    const n = r.errors.length
    let st_ = 'LOADED'
    if (n) {
      if (onError.mode === 'ABORT') {
        push(y.copies, { t: now, table: ref.fq, stage: sr.ref.fq, file: r.path, status: COPY_STATUS.LOAD_FAILED, parsed: r.parsed, loaded: 0, errors: n, first: r.errors[0].error, user: env.user, qid: env.qid }, MAX_COPIES)
        fail(r.errors[0].code, r.errors[0].state, firstErrorText(r.errors[0]))
      }
      if (onError.mode === 'CONTINUE') st_ = r.good.length ? 'PARTIALLY_LOADED' : 'LOAD_FAILED'
      // SKIP_FILE_n skips a file at n error rows or more; SKIP_FILE_n% when the share of error rows exceeds n percent
      else st_ = (onError.pct !== undefined ? (n / Math.max(1, r.parsed)) * 100 > onError.pct : n >= onError.n) ? 'LOAD_FAILED' : 'PARTIALLY_LOADED'
    }
    results.push({ ...r, status: st_, limit: onError.mode === 'CONTINUE' ? r.parsed : onError.mode === 'SKIP' ? (onError.n ?? `${onError.pct}%`) : 1 })
  }
  let loaded = 0
  const rejected = []
  for (const r of results) {
    const rows = r.status === 'LOAD_FAILED' ? [] : r.good
    t.rows.push(...rows)
    loaded += rows.length
    rejected.push(...r.errors)
    if (r.status !== 'LOAD_FAILED') y.meta[fileKey(ref.fq, sr.ref.fq, r.name)] = { md5: sr.st.files[r.name].md5, t: now, status: r.status, rows: rows.length }
    push(y.copies, { t: now, table: ref.fq, stage: sr.ref.fq, file: r.path, status: COPY_STATUS[r.status], parsed: r.parsed, loaded: rows.length, errors: r.errors.length, first: r.errors[0]?.error ?? null, user: env.user, qid: env.qid }, MAX_COPIES)
    if (bool(o.PURGE) && r.status !== 'LOAD_FAILED') delete sr.st.files[r.name]
  }
  if (rejected.length) y.rejects[ref.fq] = { qid: env.qid, session: env.session, t: now, rows: rejected.slice(0, MAX_REJECTS) }
  return {
    cols: ['file', 'status', 'rows_parsed', 'rows_loaded', 'error_limit', 'errors_seen', 'first_error', 'first_error_line', 'first_error_character', 'first_error_column_name'],
    rows: results.map((r) => [r.path, r.status, r.parsed, r.status === 'LOAD_FAILED' ? 0 : r.good.length, r.limit, r.errors.length, r.errors[0]?.error ?? null, r.errors[0]?.line ?? null, r.errors[0]?.character ?? null, r.errors[0]?.column ?? null]),
    stats: { files: results.map((r) => ({ file: r.path, name: r.name, status: r.status, parsed: r.parsed, loaded: r.status === 'LOAD_FAILED' ? 0 : r.good.length, errors: r.errors.length, firstError: r.errors[0]?.error ?? null, firstLine: r.errors[0]?.line ?? null })), loaded, skipped, errors: rejected.length },
  }
}

S.SELECT = (p, env) => {
  const q = parseSelect(p)
  p.end()
  const r = runSelect(q, env)
  return { cols: r.cols, rows: r.rows }
}
S.WITH = () => lab('common table expressions (WITH) are not part of the lab worksheet. Use a subquery in FROM')

// ---------- running SQL text ----------

const newQid = (y) => {
  y.n = (y.n ?? 0) + 1
  const h = hash(`q${y.n}`, 20)
  return `01b8${h.slice(0, 4)}-0306-${h.slice(4, 8)}-0000-${h.slice(8, 20)}`
}
function statements(toks) {
  const out = []
  let cur = []
  for (const t of toks) {
    if (t.t === 'p' && t.v === ';') {
      if (cur.length) out.push(cur)
      cur = []
    } else cur.push(t)
  }
  if (cur.length) out.push(cur)
  return out
}
// runs the statements of `sql` one after the other in the session `env`, and stops at the first error
export function runText(y, env, sql) {
  const results = []
  let toks
  try {
    toks = lex(sql)
  } catch (e) {
    if (!e.sf) throw e
    const qid = newQid(y)
    record(y, env, sql, qid, e, null)
    return { ok: false, results, error: { ...e, text: errText(e), qid }, qid, ms: 30 }
  }
  const list = statements(toks)
  if (!list.length) return { ok: true, results, ms: 0 }
  let ms = 0
  for (const part of list) {
    const text = sql.slice(part[0].at, part.at(-1).end)
    const qid = newQid(y)
    env.qid = qid
    env.cold = false
    env.used = false
    env.work = 0
    let r
    try {
      const p = parser(part, sql)
      const fnx = S[p.tok()?.t === 'w' ? p.tok().v : '']
      if (!fnx) p.fail()
      r = fnx(p, env)
    } catch (e) {
      const err = e?.sf ? e : E('000603', 'XX000', `SQL execution internal error: Processing aborted due to error 300002:${String(e?.message ?? e).slice(0, 80)}`)
      const took = record(y, env, text, qid, err, null)
      return { ok: false, results, error: { ...err, text: errText(err), qid }, qid, ms: ms + took }
    }
    const took = record(y, env, text, qid, null, r)
    ms += took
    results.push({ ...r, qid, ms: took, text })
  }
  const last = results.at(-1)
  return { ok: true, results, ...last, rowCount: last.rows.length, ms }
}
function record(y, env, text, qid, err, r) {
  const rows = r?.rows?.length ?? 0
  const ms = Math.round(25 + (env.used ? 90 + rows * 2 + (env.work ?? 0) * 6 : 0) + (env.cold ? 1400 : 0))
  if (env.sys) return ms
  const first = r?.rows?.[0]?.[0]
  push(y.queries, { id: qid, t: env.now, user: env.user, role: env.role, wh: env.wh ?? null, sql: text.length > 400 ? `${text.slice(0, 400)}...` : text, ok: !err, code: err?.code ?? null, state: err?.state ?? null, error: err?.msg ?? null, rows, ms, client: env.client, first: typeof first === 'number' || (typeof first === 'string' && first.length < 60) ? first : null }, MAX_QUERIES)
  return ms
}

// runs SQL as the lab itself, with every privilege and no warehouse: for building lab states
export function script(y, sql, now = y.created ?? 0, { user = ADMIN_USER, role = 'ACCOUNTADMIN', session = 'lab' } = {}) {
  const env = { y, now, user, role, wh: null, db: null, schema: null, client: 'lab', session, sys: true }
  const r = runText(y, env, sql)
  if (!r.ok) throw new Error(`Snowflake lab script failed: ${r.error.text}\n${sql.slice(0, 200)}`)
  return r
}

// ---------- sessions ----------

const loginFail = (y, now, user, client, code, state, msg) => {
  push(y.logins, { t: now, user: user || '(none)', client, ok: false, text: `${code} (${state}): ${msg}` }, MAX_LOGINS)
  if (y.users[user]) y.users[user].lastFail = { t: now, client, text: `${code}: ${msg}` }
  return { ok: false, type: 'SNOWFLAKE:CONNECTIVITY', code, state, error: msg, text: `${code} (${state}): ${msg}`, ms: 180 }
}
// a JDBC login with key pair (or password) authentication
export function login(y, cfg, now, client) {
  const acct = up(cfg?.account).replace(/^HTTPS?:\/\//, '').replace(/\.SNOWFLAKECOMPUTING\.COM\/?$/, '')
  if (acct !== ACCOUNT) return { ok: false, type: 'SNOWFLAKE:CONNECTIVITY', code: '200015', state: '08001', error: `JDBC driver encountered communication error. Message: Unknown host ${acct.toLowerCase() || '(empty)'}.snowflakecomputing.com.`, text: `JDBC driver encountered communication error. Message: Unknown host ${acct.toLowerCase() || '(empty)'}.snowflakecomputing.com.`, ms: 2000 } // lab-made code
  const user = up(cfg.user)
  const u = y.users[user]
  if (!u || u.disabled) return loginFail(y, now, user, client, '390100', '08004', 'Incorrect username or password was specified.')
  if (word(cfg.privateKey)) {
    if (!u.rsa || u.rsa !== publicKeyOf(cfg.privateKey)) return loginFail(y, now, user, client, '390144', '08004', 'JWT token is invalid.')
  } else if (!u.password || u.type === 'SERVICE' || u.password !== String(cfg.password ?? '')) return loginFail(y, now, user, client, '390100', '08004', 'Incorrect username or password was specified.')
  const role = up(cfg.role) || u.defaultRole || 'PUBLIC'
  if (!y.roles[role] || !userRoles(y, user).includes(role)) return loginFail(y, now, user, client, '390189', '08004', `Role '${role}' specified in the connect string is not granted to this user. Contact your local system administrator, or attempt to login with another role, e.g. PUBLIC.`)
  const env = { y, now, user, role, client, session: `${user}/${client}` }
  const wh = up(cfg.warehouse) || u.defaultWarehouse
  // a warehouse, database or schema the role cannot use is not set: the session has none
  env.wh = wh && y.warehouses[wh] && has(env, 'USAGE', 'WAREHOUSE', wh) ? wh : null
  const [nsDb, nsSc] = String(u.defaultNamespace ?? '').split('.')
  const db = up(cfg.database) || nsDb || null
  const sc = up(cfg.schema) || nsSc || (db && y.dbs[db]?.schemas.PUBLIC ? 'PUBLIC' : null)
  env.db = db && y.dbs[db] && has(env, 'USAGE', 'DATABASE', db) ? db : null
  env.schema = env.db && sc && y.dbs[env.db].schemas[sc] && has(env, 'USAGE', 'SCHEMA', `${env.db}.${sc}`) ? sc : null
  u.lastLogin = { t: now, client }
  push(y.logins, { t: now, user, client, ok: true, text: `Login with ${word(cfg.privateKey) ? 'key pair (SNOWFLAKE_JWT)' : 'password'}, role ${role}` }, MAX_LOGINS)
  return { ok: true, env }
}

// ---------- the ctx hook ----------

const noSystem = { ok: false, type: 'SNOWFLAKE:CONNECTIVITY', code: '200015', state: '08001', error: 'JDBC driver encountered communication error. Message: Connect timed out.', text: 'JDBC driver encountered communication error. Message: Connect timed out.', ms: 60000 } // lab-made code

// The engine calls this for each run of an app with its draft state: the calls change `s` in place.
export function snowflakeCtx(s, app) {
  const who = app?.name ?? 'app'
  const sys = () => (s.snowflake = fillSnowflake(s.snowflake))
  return {
    execute(cfg, sql) {
      if (!s.snowflake) return noSystem
      const y = sys()
      const l = login(y, cfg, s.clock ?? 0, who)
      if (!l.ok) return l
      const r = runText(y, l.env, String(sql ?? ''))
      if (!r.ok) return { ok: false, type: 'SNOWFLAKE:QUERY_EXECUTION', code: r.error.code, state: r.error.state, error: r.error.msg, text: r.error.text, qid: r.qid, ms: r.ms + 150 }
      return { ok: true, cols: r.cols ?? [], rows: r.rows ?? [], rowCount: r.rows?.length ?? 0, qid: r.qid, ms: r.ms + 150, message: r.message ?? null, stats: r.stats ?? null, results: r.results }
    },
    put(cfg, stage, file, { overwrite = false } = {}) {
      if (!s.snowflake) return noSystem
      const y = sys()
      const now = s.clock ?? 0
      const l = login(y, cfg, now, who)
      if (!l.ok) return l
      const env = l.env
      const name = `${String(file?.name ?? 'data.csv').split('/').pop()}${/\.gz$/.test(file?.name ?? '') ? '' : '.gz'}`
      const text = `PUT file:///tmp/${String(file?.name ?? 'data.csv').split('/').pop()} @${String(stage).replace(/^@/, '')} AUTO_COMPRESS = TRUE${overwrite ? ' OVERWRITE = TRUE' : ''}`
      const qid = newQid(y)
      Object.assign(env, { qid, used: false, cold: false, work: 0 })
      try {
        const sr = stageRef(env, String(stage).replace(/^@/, ''), 'PUT')
        if (sr.st.url) fail('000002', '0A000', "Unsupported feature 'PUT to an external stage'. Write the file to the cloud storage instead.") // lab-made wording
        need(env, 'WRITE', 'STAGE', sr.ref)
        const exists = Boolean(sr.st.files[name])
        if (!exists || overwrite) addFile(y, sr.ref.fq, name, String(file?.content ?? ''), now)
        const r = { cols: ['source', 'target', 'source_size', 'target_size', 'status'], rows: [[file?.name, name, String(file?.content ?? '').length, String(file?.content ?? '').length, exists && !overwrite ? 'SKIPPED' : 'UPLOADED']] }
        const ms = record(y, env, text, qid, null, r) + 300
        return { ok: true, status: r.rows[0][4], target: `${stagePath(sr.ref.fq, sr.st, name)}`, name, qid, ms }
      } catch (e) {
        if (!e.sf) throw e
        const ms = record(y, env, text, qid, e, null)
        return { ok: false, type: 'SNOWFLAKE:QUERY_EXECUTION', code: e.code, state: e.state, error: e.msg, text: errText(e), qid, ms }
      }
    },
  }
}

// ---------- the tick ----------

// runs once a lab minute while state.snowflake exists. Changes `s` in place.
export function snowflakeTick(s) {
  const y = s?.snowflake
  if (!isFilled(y)) return s
  const now = s.clock ?? 0
  if (!y.warehouses || !y.monitors) return s
  for (const w of Object.values(y.warehouses)) {
    if (w.state !== 'STARTED') continue
    // per second billing: the lab adds one minute of credits per lab minute that the warehouse runs
    const c = (SIZES[w.size] ?? 1) / 60
    w.credits = round((w.credits ?? 0) + c, 4)
    const m = y.monitors[w.monitor]
    if (m) m.used = round(m.used + c, 4)
    if (w.autoSuspend > 0 && now - (w.lastUsed ?? now) >= w.autoSuspend * 1000) suspend(w, now, 'Auto suspend')
  }
  for (const [name, m] of Object.entries(y.monitors)) {
    for (const t of [...m.triggers].sort((a, b) => a.pct - b.pct)) {
      if (m.used < (m.quota * t.pct) / 100 || m.fired.includes(t.pct)) continue
      m.fired.push(t.pct)
      const whs = Object.entries(y.warehouses).filter(([, w]) => w.monitor === name)
      if (t.action !== 'NOTIFY') for (const [, w] of whs) if (w.state === 'STARTED') suspend(w, now, `Resource monitor ${name}`)
      if (s.mail) {
        s.mail.push({ t: now, to: OPS_MAIL, subject: `Snowflake: resource monitor ${name} reached ${t.pct}% of its credit quota`, body: `Resource monitor ${name} of account ${ACCOUNT} has used ${round(m.used, 2)} of ${m.quota} credits (${t.pct}%) this ${m.frequency === 'MONTHLY' ? 'month' : 'period'}. Action: ${t.action}. Warehouses: ${whs.map(([n]) => n).join(', ') || 'none'}.`, source: 'Snowflake' })
        if (s.mail.length > 40) s.mail.shift()
      }
    }
  }
  return s
}

// ---------- screen actions (pure: state in, new state out) ----------

const edit = (state, fn) => {
  const s = structuredClone(state)
  s.snowflake = fillSnowflake(s.snowflake)
  const result = fn(s, s.snowflake, s.clock ?? 0)
  return { state: s, result }
}
export const upgradeSnowflake = (state) => (isFilled(state?.snowflake) ? state : edit(state, () => null).state)
const wsEnv = (y, now) => ({ y, now, user: ADMIN_USER, role: y.ws.role, wh: y.ws.wh, db: y.ws.db, schema: y.ws.schema, client: 'Snowsight', session: 'worksheet' })
// Run in the worksheet: the statements run in the session of the worksheet, and USE changes its context
export const runWorksheet = (state, sql) =>
  edit(state, (s, y, now) => {
    const env = wsEnv(y, now)
    const r = runText(y, env, sql)
    Object.assign(y.ws, { role: env.role, wh: env.wh, db: env.db, schema: env.schema, text: String(sql).slice(0, 4000) })
    return r
  })
// the context menus of the worksheet: role, warehouse, database and schema
export const setWorksheet = (state, patch) =>
  edit(state, (s, y) => {
    const next = { ...y.ws, ...patch }
    if (patch.db !== undefined) next.schema = y.dbs[patch.db]?.schemas.PUBLIC ? 'PUBLIC' : (Object.keys(y.dbs[patch.db]?.schemas ?? {})[0] ?? null)
    y.ws = next
    return true
  })
export const saveWorksheetText = (state, text) => edit(state, (s, y) => void (y.ws.text = String(text).slice(0, 4000))).state
// + Files on an internal stage in Snowsight: the file keeps its name (Snowsight does not compress it)
export const uploadFile = (state, stageFq, name, content) =>
  edit(state, (s, y, now) => {
    const st = stageAt(y, stageFq)
    const n = word(name).split('/').pop()
    if (!st) return { ok: false, text: `Stage ${stageFq} does not exist` }
    if (st.url) return { ok: false, text: 'Files of an external stage live in the cloud storage. Upload them there.' }
    if (!/^[\w.-]+$/.test(n) || n in Object.prototype) return { ok: false, text: 'Enter a file name of letters, digits, dots, hyphens or underscores' }
    if (!String(content ?? '').trim()) return { ok: false, text: 'The file is empty' }
    addFile(y, stageFq, n, String(content).endsWith('\n') ? String(content) : `${content}\n`, now)
    return { ok: true, text: `${n} uploaded to ${stageFq}` }
  })

// the placeholder the open console seeds: tiny; fillSnowflake builds the account on first use
export const defaultSnowflake = (now) => ({ created: now })
