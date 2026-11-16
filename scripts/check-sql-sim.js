// Checks the flow simulator's SQL engine (src/sim/sql.js):
// 1. every SQL statement in the reference flows runs against a database built from the statement itself;
// 2. exact cases with known results for each statement family, joins, ordering, paging, nulls, keys and errors.
// Exits 1 if fewer than 95% of the reference statements run without SimUnsupported, or if any exact case fails.
// Usage: node scripts/check-sql-sim.js [corpus.json]   (a JSON file with a "sqls" array replaces the reference flows)
import { deepStrictEqual } from 'node:assert'
import { readFileSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { SimUnsupported, SqlError } from '../src/sim/errors.js'
import { runSql, tableNamesIn } from '../src/sim/sql.js'
import { parse } from '../src/sim/sql/parser.js'
import { walk as walkFlow } from '../src/flow/model.js'

const failures = []
const fail = (msg) => failures.push(msg)

// ---- 1. the reference flows' SQL -----------------------------------------------------------------------------------
async function referenceSqls() {
  if (process.argv[2]) return JSON.parse(readFileSync(process.argv[2], 'utf8')).sqls
  const dir = join(import.meta.dirname, '..', 'src', 'content', 'flows')
  const sqls = []
  for (const file of (await readdir(dir)).filter((f) => f.endsWith('.js')).sort()) {
    const p = (await import(pathToFileURL(join(dir, file)))).default
    if (!p.referenceFlow) continue
    walkFlow(p.referenceFlow, (item) => {
      if (item.type?.startsWith('db-') && typeof item.config?.sql === 'string') sqls.push(item.config.sql)
    })
  }
  return sqls
}

// A plausible value for a column or parameter, from its name. Ids are 1 on both sides, so joins and WHERE id = :id match.
function plausible(name) {
  const n = name.toLowerCase().replace(/_/g, '')
  if (n.endsWith('csv')) return 'A1,B2'
  if (n === 'q') return '%a%'
  if (/^(limit|pagesize|size)$/.test(n)) return 10
  if (n === 'offset') return 0
  if (/^(published|active|enabled)$/.test(n)) return false
  if (/^(legalhold|migrated|creditblocked)$/.test(n)) return 'N'
  if (/(qty|quantity|amount|total|price|count|kwh|attempts|stock|version|value|balance|km|minutes|temp|tempc|claims|blockers|events|reading)$/.test(n)) return 10
  if (/(at|ts|date|time|cutoff|updated)$/.test(n) || /^(from|to|period)$/.test(n) || n.startsWith('lastupdated')) return '2026-11-12T09:00:00Z'
  if (/(id|no|number|icn|key|sku|isin|sscc|iban|serial|dn|chunks)$/.test(n) || n === 'id') return 1
  if (/(json|payload|body|raw|signal|errors|refs|reserved)$/.test(n)) return '{"a":1}'
  return 'sample'
}

// Which tables and columns a statement names: qualified columns go to their table, bare ones to the first table of
// the innermost query that has one.
function analyze(stmt) {
  const tables = new Map()
  const params = new Set()
  const addTable = (name) => {
    const key = name.toLowerCase()
    if (!tables.has(key)) tables.set(key, { name, cols: new Map() })
    return key
  }
  const addCol = (table, col) => { if (table && table !== 'dual') tables.get(table).cols.set(col.toLowerCase(), col) }
  const binding = (name, alias) => ({ table: addTable(name), alias: alias?.toLowerCase() ?? null })

  function attribute(parts, scope) {
    const col = parts[parts.length - 1]
    if (parts.length > 1) {
      const qual = parts[parts.length - 2].toLowerCase()
      for (let s = scope; s; s = s.parent) {
        const b = s.bindings.find((x) => x.alias === qual) ?? s.bindings.find((x) => x.table === qual)
        if (b) return addCol(b.table, col)
      }
      return
    }
    for (let s = scope; s; s = s.parent) {
      const b = s.bindings.find((x) => x.table)
      if (b) return addCol(b.table, col)
    }
  }
  function visit(node, scope) {
    if (Array.isArray(node)) { for (const n of node) visit(n, scope); return }
    if (!node || typeof node !== 'object') return
    if (node.type === 'select') return visitSelect(node, scope)
    if (node.t === 'col') return attribute(node.parts, scope)
    if (node.t === 'param') return params.add(node.name)
    for (const v of Object.values(node)) visit(v, scope)
  }
  function visitSelect(q, parent) {
    let first = null
    for (const core of q.cores) {
      const scope = { parent, bindings: [] }
      for (const item of core.from) {
        if (item.src.sub) { visitSelect(item.src.sub, parent); scope.bindings.push({ table: null, alias: item.src.alias?.toLowerCase() }) }
        else scope.bindings.push(binding(item.src.name, item.src.alias))
      }
      first ??= scope
      visit([core.items, core.from.map((f) => f.on), core.where, core.connectBy, core.groupBy, core.having, core.top], scope)
    }
    visit([q.orderBy, q.limit, q.offset], first)
  }

  switch (stmt.type) {
    case 'select': visitSelect(stmt, null); break
    case 'insert': {
      const t = addTable(stmt.table)
      for (const c of stmt.columns ?? []) addCol(t, c)
      visit(stmt.rows, { parent: null, bindings: [] })
      if (stmt.query) visitSelect(stmt.query, null)
      const scope = { parent: null, bindings: [{ table: t, alias: stmt.alias?.toLowerCase() ?? null }, { table: null, alias: 'excluded' }] }
      for (const c of stmt.onConflict?.target ?? []) addCol(t, c)
      for (const x of [...(stmt.onConflict?.sets ?? []), ...(stmt.onDuplicate ?? [])]) { addCol(t, x.col); visit(x.e, scope) }
      visit(stmt.onConflict?.where, scope)
      break
    }
    case 'update': case 'delete': {
      const b = binding(stmt.table, stmt.alias)
      const scope = { parent: null, bindings: [b] }
      for (const x of stmt.sets ?? []) { addCol(b.table, x.col); visit(x.e, scope) }
      visit(stmt.where, scope)
      break
    }
    case 'truncate': addTable(stmt.table); break
    case 'merge': {
      const b = binding(stmt.table, stmt.alias)
      const src = stmt.src.sub ? { table: null, alias: stmt.src.alias?.toLowerCase() } : binding(stmt.src.name, stmt.src.alias)
      if (stmt.src.sub) visitSelect(stmt.src.sub, null)
      visit([stmt.on, stmt.matched, stmt.notMatched], { parent: null, bindings: [b, src] })
      break
    }
    case 'call': visit(stmt.args, { parent: null, bindings: [] }); break
  }
  tables.delete('dual')
  return { tables, params }
}

function buildDb(stmt, analysis) {
  const db = { tables: {}, procedures: {} }
  for (const { name, cols } of analysis.tables.values()) {
    const columns = [...cols.values()]
    db.tables[name] = columns.length ? { columns, rows: [Object.fromEntries(columns.map((c) => [c, plausible(c)]))] } : { rows: [] }
  }
  if (stmt.type === 'call') db.procedures[stmt.name] = (params) => ({ called: stmt.name, params })
  return db
}

const sqls = await referenceSqls()
let ran = 0
const unsupported = new Map()
const sqlErrors = []
for (const [i, sql] of sqls.entries()) {
  try {
    const stmt = parse(sql)
    const analysis = analyze(stmt)
    const params = Object.fromEntries([...analysis.params].map((p) => [p, plausible(p)]))
    const result = runSql(sql, params, buildDb(stmt, analysis))
    if (!['select', 'update', 'procedure'].includes(result.kind)) fail(`corpus #${i}: unexpected result kind ${result.kind}`)
    ran++
    const expectedTables = [...analysis.tables.keys()].sort()
    const traced = tableNamesIn(sql).sort()
    if (JSON.stringify(traced) !== JSON.stringify(expectedTables)) fail(`corpus #${i}: tableNamesIn gives ${traced} but the statement names ${expectedTables}`)
  } catch (e) {
    if (e instanceof SimUnsupported) {
      if (!unsupported.has(e.feature)) unsupported.set(e.feature, [])
      unsupported.get(e.feature).push(i)
    } else if (e instanceof SqlError) sqlErrors.push(`#${i} ${e.message}\n      ${sql.replace(/\s+/g, ' ').slice(0, 160)}`)
    else fail(`corpus #${i}: engine bug ${e.stack?.split('\n').slice(0, 3).join(' | ')}`)
  }
}
const unsupportedCount = [...unsupported.values()].reduce((n, l) => n + l.length, 0)
console.log(`Reference SQL: ${sqls.length} statements, ${ran} ran, ${unsupportedCount} SimUnsupported, ${sqlErrors.length} SqlError`)
for (const [feature, ids] of unsupported) console.log(`  unsupported: ${feature}  (${ids.map((i) => `#${i}`).join(' ')})`)
for (const e of sqlErrors) console.log(`  SqlError ${e}`)
const share = (sqls.length - unsupportedCount) / sqls.length
if (share < 0.95) fail(`only ${(share * 100).toFixed(1)}% of the reference statements run without SimUnsupported (needs 95%)`)

// ---- 2. exact cases -------------------------------------------------------------------------------------------------
const baseDb = () => ({
  tables: {
    customers: {
      columns: ['id', 'name', 'country', 'tier', 'created_at'],
      key: 'id',
      rows: [
        { id: 1, name: 'Ann', country: 'NL', tier: 'GOLD', created_at: '2026-01-05T08:00:00Z' },
        { id: 2, name: 'Bob', country: 'DE', tier: null, created_at: '2026-03-10T12:30:00Z' },
        { id: 3, name: 'Cy', country: 'NL', tier: 'SILVER', created_at: '2026-11-13T09:55:00Z' },
        { id: 4, name: 'Dee', country: 'US', tier: 'GOLD', created_at: '2025-12-31T23:59:59Z' },
      ],
    },
    orders: {
      columns: ['order_id', 'customer_id', 'total', 'status'],
      key: 'order_id',
      rows: [
        { order_id: 10, customer_id: 1, total: 100, status: 'NEW' },
        { order_id: 11, customer_id: 1, total: 50.5, status: 'PAID' },
        { order_id: 12, customer_id: 2, total: 20, status: 'NEW' },
        { order_id: 13, customer_id: 9, total: null, status: 'CANCELLED' },
      ],
    },
    'crm.Accounts': {
      columns: ['Id', { name: 'Name', notNull: true }, { name: 'Status', default: 'ACTIVE' }],
      key: 'Id',
      rows: [{ Id: 1, Name: 'Acme', Status: 'ACTIVE' }],
    },
    meter_reading: { columns: ['meter_id', 'read_at', 'kwh'], rows: [{ meter_id: 'M1', read_at: '2026-11-01', kwh: 5 }] },
    tickets: { columns: ['id', 'subject', 'updated_at'], key: 'id', rows: [{ id: 1, subject: 'old', updated_at: '2026-11-10T00:00:00Z' }] },
    outbox: { rows: [{ event_id: 'e1', published: false, body: '{}' }, { event_id: 'e2', published: true, body: '{}' }] },
    empty_log: { columns: ['id', 'message'], rows: [] },
    sap: { rows: [{ sku: 'A', price: 1 }, { sku: 'B', price: 2 }] },
    shop: { rows: [{ sku: 'B', price: 3 }, { sku: 'C', price: 4 }] },
  },
  procedures: { 'INV_PKG.RESERVE_STOCK': (p) => ({ status: 'OK', reservationId: `R-${p.sku}` }) },
})

const ids = (rows) => rows.map((r) => Object.values(r)[0])
const CASES = [
  // SELECT basics and naming
  { name: 'select * with a parameter', sql: 'SELECT * FROM orders WHERE status = :status ORDER BY order_id', params: { status: 'NEW' },
    rows: [{ order_id: 10, customer_id: 1, total: 100, status: 'NEW' }, { order_id: 12, customer_id: 2, total: 20, status: 'NEW' }] },
  { name: 'names are case-insensitive, a schema prefix is ignored, rows use the table spelling', sql: 'SELECT NAME, Country FROM CRM.CUSTOMERS WHERE ID = 1', rows: [{ name: 'Ann', country: 'NL' }] },
  { name: 'quoted identifiers', sql: 'SELECT "name", [country] FROM "customers" WHERE id = 2', rows: [{ name: 'Bob', country: 'DE' }] },
  { name: 'schema-prefixed table key in db', sql: 'SELECT name FROM accounts', rows: [{ Name: 'Acme' }] },
  { name: 'aliases and expressions', sql: 'SELECT name AS "Who", total + 1 AS t, total * 2 doubled FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.order_id = 11',
    rows: [{ Who: 'Ann', t: 51.5, doubled: 101 }] },
  { name: 'UPPER, COALESCE, NVL', sql: "SELECT UPPER(name) AS u, COALESCE(tier, 'NONE') AS t, NVL(tier, '-') n FROM customers WHERE id = 2", rows: [{ u: 'BOB', t: 'NONE', n: '-' }] },
  { name: 'an unaliased expression is named as written', sql: 'SELECT COUNT(*) FROM orders', rows: [{ 'COUNT(*)': 4 }] },
  { name: "string literal with ''", sql: "SELECT 'it''s' AS s FROM dual", rows: [{ s: "it's" }] },
  { name: 'GROUP BY with HAVING and aggregates', sql: 'SELECT customer_id, COUNT(*) AS n, SUM(total) AS s, MAX(total) mx, MIN(total) mn FROM orders GROUP BY customer_id HAVING COUNT(*) > 1',
    rows: [{ customer_id: 1, n: 2, s: 150.5, mx: 100, mn: 50.5 }] },
  { name: 'aggregates skip nulls; COUNT over no rows is 0', sql: "SELECT COUNT(total) AS c, SUM(total) AS s, COUNT(*) AS z FROM orders WHERE status = 'CANCELLED'", rows: [{ c: 0, s: null, z: 1 }] },
  { name: 'aggregate over an empty table', sql: 'SELECT COUNT(*) AS n, MAX(id) AS m FROM empty_log', rows: [{ n: 0, m: null }] },
  { name: 'COUNT ... FILTER (WHERE)', sql: "SELECT COUNT(*) FILTER (WHERE status = 'NEW') AS fresh, COUNT(order_id) FILTER (WHERE status = 'PAID') AS paid FROM orders", rows: [{ fresh: 2, paid: 1 }] },
  { name: 'DISTINCT', sql: 'SELECT DISTINCT country FROM customers ORDER BY country', rows: [{ country: 'DE' }, { country: 'NL' }, { country: 'US' }] },
  // joins
  { name: 'INNER JOIN', sql: "SELECT c.name, o.total FROM customers c JOIN orders o ON o.customer_id = c.id WHERE o.status = 'NEW' ORDER BY o.total DESC",
    rows: [{ name: 'Ann', total: 100 }, { name: 'Bob', total: 20 }] },
  { name: 'LEFT JOIN keeps unmatched rows with nulls', sql: 'SELECT c.id, o.order_id FROM customers c LEFT OUTER JOIN orders o ON o.customer_id = c.id ORDER BY c.id, o.order_id',
    rows: [{ id: 1, order_id: 10 }, { id: 1, order_id: 11 }, { id: 2, order_id: 12 }, { id: 3, order_id: null }, { id: 4, order_id: null }] },
  { name: 'FULL OUTER JOIN', sql: 'SELECT COALESCE(s.sku, p.sku) AS sku, s.price AS a, p.price AS b FROM sap s FULL OUTER JOIN shop p ON s.sku = p.sku ORDER BY sku',
    rows: [{ sku: 'A', a: 1, b: null }, { sku: 'B', a: 2, b: 3 }, { sku: 'C', a: null, b: 4 }] },
  { name: 'c.* with a joined column', sql: 'SELECT c.*, o.total FROM customers c JOIN orders o ON o.customer_id = c.id WHERE o.order_id = 12',
    rows: [{ id: 2, name: 'Bob', country: 'DE', tier: null, created_at: '2026-03-10T12:30:00Z', total: 20 }] },
  // WHERE
  { name: 'NOT, OR and parentheses', sql: "SELECT id FROM customers WHERE NOT (country = 'NL' OR tier IS NULL) ORDER BY id", rows: [{ id: 4 }] },
  { name: 'IN with an array parameter', sql: 'SELECT id FROM customers WHERE id IN (:ids) ORDER BY id DESC', params: { ids: [1, 3] }, rows: [{ id: 3 }, { id: 1 }] },
  { name: 'NOT IN list', sql: "SELECT id FROM customers WHERE country NOT IN ('NL', 'US')", rows: [{ id: 2 }] },
  { name: 'LIKE with % and _', sql: "SELECT name FROM customers WHERE name LIKE '_e%' OR name LIKE 'A%' ORDER BY name", rows: [{ name: 'Ann' }, { name: 'Dee' }] },
  { name: 'BETWEEN dates', sql: 'SELECT id FROM customers WHERE created_at BETWEEN :from AND :to ORDER BY id', params: { from: '2026-01-01', to: '2026-06-30' }, rows: [{ id: 1 }, { id: 2 }] },
  { name: 'IS NULL / IS NOT NULL', sql: 'SELECT order_id FROM orders WHERE total IS NULL OR (status IS NOT NULL AND order_id = 10) ORDER BY order_id', rows: [{ order_id: 10 }, { order_id: 13 }] },
  { name: '!= and <>', sql: "SELECT COUNT(*) AS n FROM orders WHERE status != 'NEW' AND status <> 'PAID'", rows: [{ n: 1 }] },
  { name: '= NULL matches nothing', sql: 'SELECT id FROM customers WHERE tier = NULL', rows: [] },
  { name: 'a number column matches a numeric string parameter', sql: 'SELECT name FROM customers WHERE id = :id', params: { id: '3' }, rows: [{ name: 'Cy' }] },
  { name: 'boolean column', sql: 'SELECT event_id FROM outbox WHERE published = false', rows: [{ event_id: 'e1' }] },
  { name: 'subquery in IN', sql: "SELECT name FROM customers WHERE id IN (SELECT customer_id FROM orders WHERE status = 'NEW') ORDER BY name", rows: [{ name: 'Ann' }, { name: 'Bob' }] },
  { name: 'correlated NOT EXISTS', sql: 'SELECT c.id FROM customers c WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id) ORDER BY c.id', rows: [{ id: 3 }, { id: 4 }] },
  { name: 'CASE WHEN', sql: "SELECT id, CASE WHEN tier = 'GOLD' THEN 'G' ELSE 'O' END AS t FROM customers WHERE id IN (1, 2) ORDER BY id", rows: [{ id: 1, t: 'G' }, { id: 2, t: 'O' }] },
  { name: '= ANY(string_to_array(...))', sql: "SELECT id FROM customers WHERE country = ANY(string_to_array(:csv, ',')) ORDER BY id", params: { csv: 'DE,US' }, rows: [{ id: 2 }, { id: 4 }] },
  { name: 'placeholders and times inside strings are text; :: is a cast', sql: "SELECT id::text AS t FROM customers WHERE name <> ':name at 10:30' AND id = :id::int", params: { id: '2' }, rows: [{ t: '2' }] },
  { name: 'UNION removes duplicates', sql: "SELECT country FROM customers WHERE id < 3 UNION SELECT country FROM customers WHERE country = 'NL' ORDER BY country", rows: [{ country: 'DE' }, { country: 'NL' }] },
  // ordering and paging
  { name: 'ORDER BY several columns', sql: 'SELECT id FROM customers ORDER BY country DESC, tier ASC', rows: [{ id: 4 }, { id: 1 }, { id: 3 }, { id: 2 }] },
  { name: 'nulls sort last going up', sql: 'SELECT id FROM customers ORDER BY tier, id', rows: [{ id: 1 }, { id: 4 }, { id: 3 }, { id: 2 }] },
  { name: 'nulls sort first going down', sql: 'SELECT id FROM customers ORDER BY tier DESC, id', rows: [{ id: 2 }, { id: 3 }, { id: 1 }, { id: 4 }] },
  { name: 'NULLS FIRST', sql: 'SELECT id FROM customers ORDER BY tier NULLS FIRST, id', rows: [{ id: 2 }, { id: 1 }, { id: 4 }, { id: 3 }] },
  { name: 'ORDER BY an alias and a position', sql: 'SELECT name AS who, id FROM customers ORDER BY 2 DESC', check: (r) => deepStrictEqual(ids(r.rows), ['Dee', 'Cy', 'Bob', 'Ann']) },
  { name: 'LIMIT n OFFSET m', sql: 'SELECT id FROM customers ORDER BY id LIMIT 2 OFFSET 1', rows: [{ id: 2 }, { id: 3 }] },
  { name: 'OFFSET m ROWS FETCH NEXT n ROWS ONLY', sql: 'SELECT id FROM customers ORDER BY id OFFSET 2 ROWS FETCH NEXT 1 ROWS ONLY', rows: [{ id: 3 }] },
  { name: 'FETCH FIRST :n ROWS ONLY', sql: 'SELECT id FROM customers ORDER BY id FETCH FIRST :n ROWS ONLY', params: { n: 2 }, rows: [{ id: 1 }, { id: 2 }] },
  { name: 'TOP n', sql: 'SELECT TOP 2 id FROM customers ORDER BY id DESC', rows: [{ id: 4 }, { id: 3 }] },
  { name: 'TOP (n)', sql: 'SELECT TOP (1) id FROM dbo.customers ORDER BY id', rows: [{ id: 1 }] },
  { name: 'ROWNUM <= n', sql: 'SELECT id FROM customers WHERE ROWNUM <= 2', rows: [{ id: 1 }, { id: 2 }] },
  { name: 'FOR UPDATE SKIP LOCKED is ignored', sql: 'SELECT id FROM customers WHERE id = 1 FOR UPDATE SKIP LOCKED', rows: [{ id: 1 }] },
  { name: 'a trailing semicolon is fine', sql: 'SELECT id FROM customers WHERE id = 1;', rows: [{ id: 1 }] },
  // time
  { name: 'the current time is fixed', sql: 'SELECT CURRENT_TIMESTAMP AS a, NOW() AS b, SYSDATE c, GETDATE() d, SYSTIMESTAMP e FROM dual',
    rows: [{ a: '2026-11-13T10:00:00Z', b: '2026-11-13T10:00:00Z', c: '2026-11-13T10:00:00Z', d: '2026-11-13T10:00:00Z', e: '2026-11-13T10:00:00Z' }] },
  { name: 'db.now sets the current time', sql: 'SELECT NOW() AS t FROM dual', db: () => ({ ...baseDb(), now: '2026-01-02T03:04:05Z' }), rows: [{ t: '2026-01-02T03:04:05Z' }] },
  { name: 'INTERVAL arithmetic', sql: "SELECT id FROM customers WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '10' MINUTE", rows: [{ id: 3 }] },
  { name: 'Postgres interval text', sql: "SELECT now() + interval '2 hours' AS t, CURRENT_TIMESTAMP + INTERVAL '15' MINUTE AS u FROM dual", rows: [{ t: '2026-11-13T12:00:00Z', u: '2026-11-13T10:15:00Z' }] },
  { name: 'TRUNC(SYSDATE) + days', sql: 'SELECT TRUNC(SYSDATE) + 2 AS d FROM dual', rows: [{ d: '2026-11-15T00:00:00Z' }] },
  // Oracle helpers
  { name: 'CONNECT BY LEVEL splits a CSV', sql: "SELECT REGEXP_SUBSTR(:csv, '[^,]+', 1, LEVEL) AS v FROM DUAL CONNECT BY REGEXP_SUBSTR(:csv, '[^,]+', 1, LEVEL) IS NOT NULL",
    params: { csv: 'a,b,c' }, rows: [{ v: 'a' }, { v: 'b' }, { v: 'c' }] },
  { name: 'sequence NEXTVAL counts up', sql: 'SELECT ORDER_SEQ.NEXTVAL AS n FROM dual', db: () => ({ ...baseDb(), sequences: { order_seq: 41 } }), rows: [{ n: 42 }] },
  // INSERT
  { name: 'INSERT gets a generated key', sql: "INSERT INTO customers (name, country) VALUES (:n, 'FR')", params: { n: 'Eve' }, affected: 1, generatedKeys: { id: 5 },
    after: (db) => deepStrictEqual(db.tables.customers.rows[4], { id: 5, name: 'Eve', country: 'FR', tier: null, created_at: null }) },
  { name: 'INSERT fills declared defaults', sql: "INSERT INTO ACCOUNTS (name) VALUES ('Beta')", affected: 1, generatedKeys: { Id: 2 },
    after: (db) => deepStrictEqual(db.tables['crm.Accounts'].rows[1], { Id: 2, Name: 'Beta', Status: 'ACTIVE' }) },
  { name: 'multi-row VALUES', sql: "INSERT INTO orders (order_id, customer_id, total, status) VALUES (20, 1, 1, 'NEW'), (21, 2, 2, 'NEW')", affected: 2,
    after: (db) => deepStrictEqual(db.tables.orders.rows.length, 6) },
  { name: 'INSERT ... SELECT', sql: "INSERT INTO orders (order_id, customer_id, total, status) SELECT id + 100, id, 0, 'GIFT' FROM customers WHERE country = 'NL'", affected: 2,
    after: (db) => deepStrictEqual(db.tables.orders.rows.slice(4), [{ order_id: 101, customer_id: 1, total: 0, status: 'GIFT' }, { order_id: 103, customer_id: 3, total: 0, status: 'GIFT' }]) },
  { name: 'INSERT with CURRENT_TIMESTAMP', sql: "INSERT INTO empty_log (id, message) VALUES (1, 'at ' || CURRENT_TIMESTAMP)", affected: 1,
    after: (db) => deepStrictEqual(db.tables.empty_log.rows, [{ id: 1, message: 'at 2026-11-13T10:00:00Z' }]) },
  { name: 'ON CONFLICT DO NOTHING skips a duplicate', sql: "INSERT INTO meter_reading (meter_id, read_at, kwh) VALUES ('M1', '2026-11-01', 9) ON CONFLICT (meter_id, read_at) DO NOTHING", affected: 0,
    after: (db) => deepStrictEqual(db.tables.meter_reading.rows, [{ meter_id: 'M1', read_at: '2026-11-01', kwh: 5 }]) },
  { name: 'ON CONFLICT DO NOTHING inserts a new row', sql: "INSERT INTO meter_reading (meter_id, read_at, kwh) VALUES ('M1', '2026-11-02', 9) ON CONFLICT (meter_id, read_at) DO NOTHING", affected: 1 },
  { name: 'ON CONFLICT DO UPDATE ... WHERE (newer wins)', sql: 'INSERT INTO tickets (id, subject, updated_at) VALUES (:id, :s, :u) ON CONFLICT (id) DO UPDATE SET subject = EXCLUDED.subject, updated_at = EXCLUDED.updated_at WHERE tickets.updated_at <= EXCLUDED.updated_at',
    params: { id: 1, s: 'new', u: '2026-11-12T00:00:00Z' }, affected: 1, after: (db) => deepStrictEqual(db.tables.tickets.rows, [{ id: 1, subject: 'new', updated_at: '2026-11-12T00:00:00Z' }]) },
  { name: 'ON CONFLICT DO UPDATE ... WHERE (older is skipped)', sql: 'INSERT INTO tickets (id, subject, updated_at) VALUES (:id, :s, :u) ON CONFLICT (id) DO UPDATE SET subject = EXCLUDED.subject WHERE tickets.updated_at <= EXCLUDED.updated_at',
    params: { id: 1, s: 'stale', u: '2026-11-01T00:00:00Z' }, affected: 0, after: (db) => deepStrictEqual(db.tables.tickets.rows[0].subject, 'old') },
  { name: 'MySQL ON DUPLICATE KEY UPDATE', sql: "INSERT INTO tickets (id, subject) VALUES (1, 'dup') ON DUPLICATE KEY UPDATE subject = VALUES(subject)", affected: 2,
    after: (db) => deepStrictEqual(db.tables.tickets.rows[0].subject, 'dup') },
  { name: 'MySQL INSERT IGNORE', sql: "INSERT IGNORE INTO tickets (id, subject) VALUES (1, 'x')", affected: 0 },
  // UPDATE / DELETE / TRUNCATE / MERGE
  { name: 'UPDATE with parameter, literal and arithmetic', sql: 'UPDATE orders SET status = :s, total = total + 1 WHERE customer_id = 1', params: { s: 'SHIPPED' }, affected: 2,
    after: (db) => deepStrictEqual(db.tables.orders.rows.slice(0, 2).map((r) => [r.status, r.total]), [['SHIPPED', 101], ['SHIPPED', 51.5]]) },
  { name: 'UPDATE with IN (SELECT ...)', sql: "UPDATE customers SET tier = 'VIP' WHERE id IN (SELECT customer_id FROM orders WHERE total > 60)", affected: 1,
    after: (db) => deepStrictEqual(db.tables.customers.rows.map((r) => r.tier), ['VIP', null, 'SILVER', 'GOLD']) },
  { name: 'UPDATE with an alias and a correlated scalar subquery', sql: 'UPDATE customers c SET c.tier = (SELECT MAX(o.status) FROM orders o WHERE o.customer_id = c.id) WHERE c.id <= 2', affected: 2,
    after: (db) => deepStrictEqual(db.tables.customers.rows.slice(0, 2).map((r) => r.tier), ['PAID', 'NEW']) },
  { name: 'UPDATE ... ROWNUM <= n', sql: "UPDATE customers SET tier = 'X' WHERE country = 'NL' AND ROWNUM <= 1", affected: 1 },
  { name: 'UPDATE matching nothing', sql: "UPDATE customers SET tier = 'X' WHERE id = 99", affected: 0 },
  { name: 'DELETE', sql: "DELETE FROM orders WHERE status = 'NEW'", affected: 2, after: (db) => deepStrictEqual(db.tables.orders.rows.map((r) => r.order_id), [11, 13]) },
  { name: 'TRUNCATE TABLE', sql: 'TRUNCATE TABLE orders', affected: 0, after: (db) => deepStrictEqual(db.tables.orders.rows, []) },
  { name: 'MERGE updates a match', sql: "MERGE INTO customers c USING (SELECT :id AS id, :name AS name FROM dual) s ON (c.id = s.id) WHEN MATCHED THEN UPDATE SET c.name = s.name WHEN NOT MATCHED THEN INSERT (id, name, country) VALUES (s.id, s.name, 'BE')",
    params: { id: 1, name: 'Anna' }, affected: 1, after: (db) => deepStrictEqual(db.tables.customers.rows[0].name, 'Anna') },
  { name: 'MERGE inserts a miss', sql: "MERGE INTO customers c USING (SELECT :id AS id, :name AS name FROM dual) s ON (c.id = s.id) WHEN MATCHED THEN UPDATE SET c.name = s.name WHEN NOT MATCHED THEN INSERT (id, name, country) VALUES (s.id, s.name, 'BE')",
    params: { id: 7, name: 'Gus' }, affected: 1, after: (db) => deepStrictEqual(db.tables.customers.rows[4], { id: 7, name: 'Gus', country: 'BE', tier: null, created_at: null }) },
  // procedures
  { name: '{call PKG.NAME(...)}', sql: '{ call INV_PKG.RESERVE_STOCK(:orderId, :sku, :reservationId) }', params: { orderId: 1, sku: 'AB' }, result: { status: 'OK', reservationId: 'R-AB' } },
  { name: 'CALL without the package prefix, any case', sql: 'CALL reserve_stock(:sku)', params: { sku: 'Z' }, result: { status: 'OK', reservationId: 'R-Z' } },
  // errors
  { name: 'unknown table', sql: 'SELECT * FROM nope', error: [SqlError, 'Table or view "nope" does not exist'] },
  { name: 'unknown column on an empty table', sql: 'SELECT bogus FROM empty_log', error: [SqlError, 'Column "bogus" does not exist'] },
  { name: 'unknown qualified column', sql: 'SELECT c.nme FROM customers c', error: [SqlError, 'Column c.nme does not exist (table c has no column "nme")'] },
  { name: 'unknown column in INSERT', sql: "INSERT INTO customers (id, nme) VALUES (9, 'x')", error: [SqlError, 'Column "nme" of table "customers" does not exist'] },
  { name: 'unknown column in UPDATE WHERE on any data', sql: "UPDATE empty_log SET message = 'x' WHERE lvl = 1", error: [SqlError, 'Column "lvl" does not exist'] },
  { name: 'parameter with no value', sql: 'SELECT * FROM orders WHERE status = :status', error: [SqlError, 'No value for parameter :status'] },
  { name: 'two statements', sql: 'SELECT 1 FROM dual; SELECT 2 FROM dual', error: [SqlError, /^Only one SQL statement/] },
  { name: 'syntax error', sql: 'SELEC * FROM orders', error: [SqlError, 'Syntax error at or near "SELEC"'] },
  { name: 'syntax error at the end', sql: 'SELECT * FROM orders WHERE', error: [SqlError, 'Syntax error at end of statement'] },
  { name: 'ambiguous column', sql: 'SELECT name FROM customers a JOIN customers b ON a.id = b.id', error: [SqlError, /^Column reference "name" is ambiguous/] },
  { name: 'column outside GROUP BY', sql: 'SELECT name, COUNT(*) FROM customers GROUP BY country', error: [SqlError, /must appear in the GROUP BY clause/] },
  { name: 'aggregate in WHERE', sql: 'SELECT id FROM customers WHERE COUNT(*) > 1', error: [SqlError, /^Aggregate function COUNT\(\) is not allowed here/] },
  { name: 'duplicate primary key', sql: 'INSERT INTO orders (order_id, customer_id) VALUES (10, 1)', error: [SqlError, 'Duplicate key: table "orders" already has a row with order_id = 10 (primary key violation)'] },
  { name: 'NOT NULL column', sql: 'INSERT INTO accounts (Name) VALUES (NULL)', error: [SqlError, 'Cannot insert NULL into column "Name" of table "Accounts": it is NOT NULL'] },
  { name: 'UPDATE onto an existing key', sql: 'UPDATE orders SET order_id = 10 WHERE order_id = 11', error: [SqlError, /^Duplicate key/] },
  { name: 'a scalar subquery with two rows', sql: 'SELECT (SELECT id FROM customers) AS x FROM dual', error: [SqlError, 'A subquery used as a value returned more than one row'] },
  { name: 'missing procedure', sql: '{ call PKG.MISSING(:a) }', params: { a: 1 }, error: [SqlError, "Stored procedure PKG.MISSING does not exist (identifier 'PKG.MISSING' must be declared)"] },
  { name: 'value count does not match', sql: 'INSERT INTO orders (order_id, customer_id) VALUES (30)', error: [SqlError, 'INSERT has more target columns than values'] },
  { name: 'unsupported: WITH', sql: 'WITH x AS (SELECT 1 FROM dual) SELECT * FROM x', error: [SimUnsupported, 'WITH clauses (common table expressions)'] },
  { name: 'unsupported: window functions', sql: 'SELECT ROW_NUMBER() OVER (ORDER BY id) AS n FROM customers', error: [SimUnsupported, 'window functions (OVER ...)'] },
  { name: 'unsupported: DDL', sql: 'CREATE TABLE t (id INT)', error: [SimUnsupported, 'CREATE statements'] },
]

const TRACE = [
  ['INSERT INTO crm.Orders (a) SELECT x FROM "Staging" s JOIN dbo.[Other] o ON 1 = 1', ['orders', 'staging', 'other']],
  ['UPDATE t SET a = (SELECT MAX(b) FROM u) WHERE EXISTS (SELECT 1 FROM v)', ['t', 'u', 'v']],
  ['SELECT 1 FROM dual', []],
  ['{ call PKG.X(:a) }', []],
  ['MERGE INTO tgt USING src ON (tgt.id = src.id) WHEN MATCHED THEN UPDATE SET a = 1', ['tgt', 'src']],
  ['SELECT * FROM a WHERE x = 1 GARBAGE (', ['a']],
]

let passed = 0
for (const c of CASES) {
  const db = (c.db ?? baseDb)()
  try {
    const r = runSql(c.sql, c.params ?? {}, db)
    if (c.error) throw new Error(`expected ${c.error[0].name} but it ran: ${JSON.stringify(r)}`)
    if (c.rows) deepStrictEqual(r, { kind: 'select', rows: c.rows })
    if (c.affected !== undefined) deepStrictEqual(r, c.generatedKeys ? { kind: 'update', affectedRows: c.affected, generatedKeys: c.generatedKeys } : { kind: 'update', affectedRows: c.affected })
    if (c.result) deepStrictEqual(r, { kind: 'procedure', result: c.result })
    c.check?.(r)
    c.after?.(db)
    passed++
  } catch (e) {
    if (c.error && e instanceof c.error[0] && !(c.error[0] === SqlError && e instanceof SimUnsupported)) {
      const [, want] = c.error
      const got = e instanceof SimUnsupported ? e.feature : e.message
      if (want instanceof RegExp ? want.test(got) : got === want) { passed++; continue }
      fail(`${c.name}: message\n      got  ${got}\n      want ${want}`)
    } else fail(`${c.name}: ${e.message.split('\n').slice(0, 6).join('\n      ')}`)
  }
}
for (const [sql, want] of TRACE) {
  try { deepStrictEqual(tableNamesIn(sql), want); passed++ } catch { fail(`tableNamesIn(${sql}) gives ${JSON.stringify(tableNamesIn(sql))}, wants ${JSON.stringify(want)}`) }
}
console.log(`Exact cases: ${passed} of ${CASES.length + TRACE.length} pass`)

for (const f of failures) console.log(`FAIL  ${f}`)
if (failures.length) process.exit(1)
console.log('OK')
