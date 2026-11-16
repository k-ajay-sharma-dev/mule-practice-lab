// Runs a parsed statement against the scenario's tables. Tables are { columns?, key?, rows }, rows are plain objects,
// and every change is made in place on db.
import { SqlError, SimUnsupported } from '../errors.js'
import { isAggregate } from './parser.js'
import { DEFAULT_NOW, arith, callFunction, cast, compare, isoOf, dateMs, isDate, likeToRegex, toNumber, truth } from './values.js'

const bare = (name) => name.split('.').pop().toLowerCase()
const DUAL = { columns: ['DUMMY'], rows: [{ DUMMY: 'X' }] }
const DEFAULT = Symbol('DEFAULT')

export function execute(stmt, params, db) {
  if (!db.tables) db.tables = {}
  let now = db.now ?? DEFAULT_NOW
  if (isDate(now)) now = isoOf(dateMs(now))
  // a JavaScript Date binds as its ISO text, like every other date the engine sees
  const bound = Object.fromEntries(Object.entries(params ?? {}).map(([k, v]) => [k, v instanceof Date ? isoOf(v.getTime()) : v]))
  const env = { db, params: bound, now }
  if (stmt.type !== 'call') checkParams(stmt, env.params)
  switch (stmt.type) {
    case 'select': return { kind: 'select', rows: runSelect(stmt, null, env).map((r) => r.out) }
    case 'insert': return runInsert(stmt, env)
    case 'update': return runUpdate(stmt, env)
    case 'delete': return runDelete(stmt, env)
    case 'truncate': {
      const t = openTable(env, stmt.table)
      t.def.rows.splice(0)
      return { kind: 'update', affectedRows: 0 }
    }
    case 'merge': return runMerge(stmt, env)
    case 'call': return runCall(stmt, env)
  }
  throw new SimUnsupported(`${stmt.type} statements`)
}

// ---- walking the tree ---------------------------------------------------------------------------------------------
export function walk(node, fn) {
  if (Array.isArray(node)) { for (const n of node) walk(n, fn); return }
  if (!node || typeof node !== 'object') return
  fn(node)
  for (const v of Object.values(node)) if (v && typeof v === 'object') walk(v, fn)
}

function checkParams(stmt, params) {
  walk(stmt, (n) => {
    if (n.t === 'param' && params[n.name] === undefined) throw new SqlError(`No value for parameter :${n.name}`)
  })
}

// the expressions directly inside an expression, leaving out subqueries (they are their own scope)
function children(n) {
  switch (n.t) {
    case 'bin': return [n.l, n.r]
    case 'not': case 'neg': case 'isnull': case 'istrue': case 'cast': return [n.e]
    case 'in': return [n.e, ...(n.list ?? [])]
    case 'like': return [n.e, n.pat, n.esc].filter(Boolean)
    case 'between': return [n.e, n.lo, n.hi]
    case 'any': return [n.e, n.arr].filter(Boolean)
    case 'fn': return [...n.args, n.filter].filter(Boolean)
    case 'case': return [n.base, ...n.whens.flat(), n.else].filter(Boolean)
    default: return []
  }
}
function subqueriesOf(n) {
  if (n.t === 'sub') return [n.q]
  if (n.t === 'exists' || ((n.t === 'in' || n.t === 'any') && n.sub)) return [n.sub]
  return []
}
function hasAggregate(e) {
  if (!e || !e.t) return false
  return isAggregate(e) || children(e).some(hasAggregate)
}

const keyCache = new WeakMap()
function keyOf(node) {
  if (!keyCache.has(node)) keyCache.set(node, JSON.stringify(node))
  return keyCache.get(node)
}

// ---- tables and name resolution -----------------------------------------------------------------------------------
function openTable(env, name) {
  const lower = bare(name)
  const key = Object.keys(env.db.tables).find((k) => bare(k) === lower)
  let def = key ? env.db.tables[key] : null
  if (!def && lower === 'dual') def = DUAL
  if (!def) throw new SqlError(`Table or view "${name}" does not exist`)
  if (!Array.isArray(def.rows)) def.rows = []
  const declared = def.columns ? def.columns.map((c) => (typeof c === 'string' ? { name: c } : c)) : null
  let cols = declared ? declared.map((c) => c.name) : null
  if (!cols) {
    const seen = new Map()
    for (const r of def.rows) for (const k of Object.keys(r)) if (!seen.has(k.toLowerCase())) seen.set(k.toLowerCase(), k)
    cols = seen.size ? [...seen.values()] : null // no columns and no rows: any column name is accepted
  }
  const t = { name: key ? key.split('.').pop() : name, def, declared, cols, colMap: cols ? new Map(cols.map((c) => [c.toLowerCase(), c])) : null }
  const keyDef = def.key ? (Array.isArray(def.key) ? def.key : [def.key]) : []
  t.keyCols = keyDef.map((k) => columnOf(t, k))
  return t
}

// the column's name as the table spells it; for a table whose columns are unknown, the name as written
function columnOf(t, name) {
  if (!t.colMap) {
    for (const r of t.def.rows) for (const k of Object.keys(r)) if (k.toLowerCase() === name.toLowerCase()) return k
    return name
  }
  const c = t.colMap.get(name.toLowerCase())
  if (c === undefined) throw new SqlError(`Column "${name}" of table "${t.name}" does not exist`)
  return c
}

function getValue(row, col) {
  if (!row) return null
  if (col in row) return row[col] ?? null
  const lower = col.toLowerCase()
  for (const k of Object.keys(row)) if (k.toLowerCase() === lower) return row[k] ?? null
  return null
}

// A binding is one table (or derived table) in a FROM clause: { alias, name, label, cols, colMap }.
function bindingOf(t, alias) {
  return { alias: alias ? alias.toLowerCase() : null, name: bare(t.name), label: alias ?? t.name, cols: t.cols, colMap: t.colMap }
}

function resolveIn(metas, qual, col, parts) {
  if (qual) {
    let i = metas.findIndex((m) => m.alias === qual)
    if (i < 0) i = metas.findIndex((m) => m.name === qual)
    if (i < 0) return null
    const m = metas[i]
    if (!m.colMap) return { i, col }
    const c = m.colMap.get(col.toLowerCase())
    if (c === undefined) throw new SqlError(`Column ${parts.join('.')} does not exist (table ${m.label} has no column "${col}")`)
    return { i, col: c }
  }
  const hits = []
  metas.forEach((m, i) => { if (!m.qualifiedOnly && m.colMap?.has(col.toLowerCase())) hits.push({ i, col: m.colMap.get(col.toLowerCase()) }) })
  if (hits.length > 1) throw new SqlError(`Column reference "${col}" is ambiguous: it is in ${hits.map((h) => metas[h.i].label).join(' and ')}`)
  if (hits.length) return hits[0]
  const open = metas.findIndex((m) => !m.colMap && !m.qualifiedOnly)
  return open >= 0 ? { i: open, col } : null
}

function resolve(ctx, parts) {
  const col = parts[parts.length - 1]
  const qual = parts.length > 1 ? parts[parts.length - 2].toLowerCase() : null
  let depth = 0
  for (let c = ctx; c; c = c.parent, depth++) {
    const r = resolveIn(c.metas, qual, col, parts)
    if (r) return { ...r, ctx: c, depth }
  }
  if (qual) throw new SqlError(`Column ${parts.join('.')} does not exist: no table or alias "${parts[parts.length - 2]}" in this statement`)
  throw new SqlError(`Column "${col}" does not exist`)
}

// ---- expressions --------------------------------------------------------------------------------------------------
// ctx: { env, metas, rows, parent, rownum?, level?, group?, groupKeys?, groupCols?, inAgg?, insertRow? }
function evalExpr(n, ctx) {
  // in a grouped query, an expression the query groups by has one value per group
  if (ctx.group && !ctx.inAgg && ctx.groupKeys?.size && n.t !== 'col' && n.t !== 'lit' && ctx.groupKeys.has(keyOf(n))) {
    return evalExpr(n, { ...ctx, inAgg: true })
  }
  switch (n.t) {
    case 'lit': return n.v
    case 'default': throw new SqlError('DEFAULT is only allowed as a whole value in INSERT or UPDATE')
    case 'param': return ctx.env.params[n.name]
    case 'col': return columnValue(n, ctx)
    case 'special': return special(n, ctx)
    case 'seq': return sequence(ctx.env, n.name, n.op)
    case 'bin': return binary(n, ctx)
    case 'not': { const v = truth(evalExpr(n.e, ctx), 'NOT'); return v === null ? null : !v }
    case 'neg': { const v = evalExpr(n.e, ctx); return v === null || v === undefined ? null : arith('-', 0, v) }
    case 'isnull': { const v = evalExpr(n.e, ctx); return (v === null || v === undefined) !== n.not }
    case 'istrue': { const v = truth(evalExpr(n.e, ctx), 'IS'); return (v === n.v) !== n.not }
    case 'cast': return cast(evalExpr(n.e, ctx), n.type)
    case 'in': return inList(n, ctx)
    case 'like': {
      const v = evalExpr(n.e, ctx)
      const p = evalExpr(n.pat, ctx)
      if (v === null || v === undefined || p === null || p === undefined) return null
      const esc = n.esc ? evalExpr(n.esc, ctx) : null
      return likeToRegex(String(p), esc, n.ci).test(String(v)) !== n.not
    }
    case 'between': {
      const v = evalExpr(n.e, ctx)
      const lo = compare(v, evalExpr(n.lo, ctx))
      const hi = compare(v, evalExpr(n.hi, ctx))
      if (lo === null || hi === null) return (lo !== null && lo < 0) || (hi !== null && hi > 0) ? n.not : null
      return (lo >= 0 && hi <= 0) !== n.not
    }
    case 'exists': return runSelect(n.sub, ctx, ctx.env).length > 0
    case 'sub': {
      const rows = runSelect(n.q, ctx, ctx.env)
      if (rows.length > 1) throw new SqlError('A subquery used as a value returned more than one row')
      return rows.length ? rows[0].vals[0] ?? null : null
    }
    case 'any': {
      const left = evalExpr(n.e, ctx)
      let values
      if (n.sub) values = runSelect(n.sub, ctx, ctx.env).map((r) => r.vals[0] ?? null)
      else {
        values = evalExpr(n.arr, ctx)
        if (values === null) return null
        if (!Array.isArray(values)) throw new SqlError(`${n.all ? 'ALL' : 'ANY'}(...) needs an array or a subquery, not ${JSON.stringify(values)}`)
      }
      const results = values.map((v) => compareOp(n.op, compare(left, v)))
      if (n.all) return results.includes(false) ? false : results.includes(null) ? null : true
      return results.includes(true) ? true : results.includes(null) ? null : false
    }
    case 'fn': return callFn(n, ctx)
    case 'case': {
      const base = n.base ? evalExpr(n.base, ctx) : undefined
      for (const [cond, value] of n.whens) {
        const hit = n.base ? compare(base, evalExpr(cond, ctx)) === 0 : truth(evalExpr(cond, ctx), 'CASE WHEN') === true
        if (hit) return evalExpr(value, ctx)
      }
      return n.else ? evalExpr(n.else, ctx) : null
    }
  }
  throw new SqlError(`Cannot evaluate ${n.t}`)
}


function columnValue(n, ctx) {
  const r = resolve(ctx, n.parts)
  if (ctx.group && !ctx.inAgg && r.depth === 0 && !ctx.groupCols.has(`${r.i}.${r.col}`)) {
    throw new SqlError(`Column ${n.parts.join('.')} must appear in the GROUP BY clause or be used in an aggregate function`)
  }
  return getValue(r.ctx.rows[r.i], r.col)
}

function special(n, ctx) {
  switch (n.name) {
    case 'CURRENT_TIMESTAMP': case 'SYSDATE': case 'SYSTIMESTAMP': case 'LOCALTIMESTAMP': return ctx.env.now
    case 'CURRENT_DATE': return ctx.env.now.slice(0, 10)
    case 'ROWNUM': return ctx.rownum ?? 1
    case 'LEVEL':
      for (let c = ctx; c; c = c.parent) if (c.level !== undefined) return c.level
      return columnValue({ t: 'col', parts: ['LEVEL'] }, ctx)
  }
  throw new SqlError(`Unknown keyword ${n.name}`)
}

function sequence(env, name, op) {
  const seqs = env.db.sequences ?? (env.db.sequences = {})
  // sequences are made on first use, starting at 1, so a scenario need not declare them
  const key = Object.keys(seqs).find((k) => bare(k) === bare(name)) ?? name
  if (op === 'CURRVAL') {
    if (seqs[key] === undefined) throw new SqlError(`CURRVAL of sequence ${name} is not yet defined in this session (call NEXTVAL first)`)
    return seqs[key]
  }
  seqs[key] = (seqs[key] ?? 0) + 1
  return seqs[key]
}

const compareOp = (op, c) => {
  if (c === null) return null
  switch (op) {
    case '=': return c === 0
    case '<>': return c !== 0
    case '<': return c < 0
    case '>': return c > 0
    case '<=': return c <= 0
    case '>=': return c >= 0
  }
}

function binary(n, ctx) {
  if (n.op === 'AND') {
    const l = truth(evalExpr(n.l, ctx), 'AND')
    if (l === false) return false
    const r = truth(evalExpr(n.r, ctx), 'AND')
    return r === false ? false : l === null || r === null ? null : true
  }
  if (n.op === 'OR') {
    const l = truth(evalExpr(n.l, ctx), 'OR')
    if (l === true) return true
    const r = truth(evalExpr(n.r, ctx), 'OR')
    return r === true ? true : l === null || r === null ? null : false
  }
  const l = evalExpr(n.l, ctx)
  const r = evalExpr(n.r, ctx)
  if (['=', '<>', '<', '>', '<=', '>='].includes(n.op)) {
    if (Array.isArray(l) || Array.isArray(r)) throw new SqlError(`A list of values (${JSON.stringify(Array.isArray(l) ? l : r)}) cannot be compared with ${n.op}; use IN (...)`)
    return compareOp(n.op, compare(l, r))
  }
  return arith(n.op, l, r)
}

function inList(n, ctx) {
  const v = evalExpr(n.e, ctx)
  let values
  if (n.sub) values = runSelect(n.sub, ctx, ctx.env).map((r) => r.vals[0] ?? null)
  else values = n.list.flatMap((e) => { const x = evalExpr(e, ctx); return Array.isArray(x) ? x : [x] }) // IN (:ids) with an array
  if (!values.length) return n.not
  if (v === null || v === undefined) return null
  if (values.some((x) => compare(v, x) === 0)) return !n.not
  return values.some((x) => x === null || x === undefined) ? null : n.not
}

function callFn(n, ctx) {
  if (isAggregate(n)) return aggregate(n, ctx)
  if (n.star) throw new SqlError(`${n.name}(*) is not allowed; only COUNT(*) takes *`)
  if (n.filter) throw new SqlError(`FILTER (WHERE ...) is only allowed on aggregate functions, not ${n.name}()`)
  if (n.name === 'VALUES' && ctx.insertRow) return getValue(ctx.insertRow, n.args[0].parts?.at(-1) ?? '') // MySQL ON DUPLICATE KEY UPDATE
  const args = n.args.map((a) => evalExpr(a, ctx))
  if (n.name === 'NEXTVAL' || n.name === 'CURRVAL') return sequence(ctx.env, String(args[0]), n.name)
  if (n.name === 'SYSDATE') return ctx.env.now
  return callFunction(n.name, args, ctx.env.now)
}

function aggregate(n, ctx) {
  if (!ctx.group) throw new SqlError(`Aggregate function ${n.name}() is not allowed here (only in the SELECT list, HAVING or ORDER BY)`)
  if (ctx.inAgg) throw new SqlError(`Aggregate function calls cannot be nested (${n.name}() inside another aggregate)`)
  if (n.star && n.name !== 'COUNT') throw new SqlError(`${n.name}(*) is not allowed; only COUNT(*) takes *`)
  let values = []
  for (const rows of ctx.group) {
    const c = { ...ctx, rows, inAgg: true }
    if (n.filter && truth(evalExpr(n.filter, c), 'FILTER') !== true) continue
    values.push(n.star ? 1 : evalExpr(n.args[0], c))
  }
  values = values.filter((v) => v !== null && v !== undefined)
  if (n.distinct) {
    const seen = new Set()
    values = values.filter((v) => { const k = JSON.stringify(v); if (seen.has(k)) return false; seen.add(k); return true })
  }
  switch (n.name) {
    case 'COUNT': return values.length
    case 'SUM': return values.length ? arithSum(values) : null
    case 'AVG': return values.length ? arith('/', arithSum(values), values.length) : null
    case 'MIN': return values.length ? values.reduce((a, b) => (compare(b, a) < 0 ? b : a)) : null
    case 'MAX': return values.length ? values.reduce((a, b) => (compare(b, a) > 0 ? b : a)) : null
  }
}
const arithSum = (values) => values.reduce((s, v) => arith('+', s, toNumber(v, 'value to add up')), 0)

// ---- SELECT -------------------------------------------------------------------------------------------------------
// Opens every table of a FROM clause: { metas, sources: [{ rows }] }. A derived table (subquery) is run here.
function openSources(from, parent, env) {
  const metas = []
  const sources = []
  for (const item of from) {
    const src = item.src
    if (src.sub) {
      const result = runSelect(src.sub, parent, env)
      const cols = result.columns
      const t = { name: src.alias ?? 'subquery', cols, colMap: new Map(cols.map((c) => [c.toLowerCase(), c])) }
      metas.push(bindingOf(t, src.alias))
      sources.push(result.map((r) => r.out))
    } else {
      const t = openTable(env, src.name)
      metas.push(bindingOf(t, src.alias))
      sources.push(t.def.rows)
    }
    const m = metas[metas.length - 1]
    const effective = m.alias ?? m.name
    if (metas.slice(0, -1).some((o) => (o.alias ?? o.name) === effective)) {
      throw new SqlError(`Table name "${m.label}" is used more than once in FROM; give each one its own alias`)
    }
  }
  return { metas, sources }
}

// joins the FROM tables into frames: one array of rows (one per binding, null for an outer join's missing side)
function joinFrames(from, metas, sources, parent, env) {
  if (!from.length) return [[]]
  let frames = sources[0].map((r) => [r])
  for (let j = 1; j < from.length; j++) {
    const { join, on } = from[j]
    const right = sources[j]
    const scope = metas.slice(0, j + 1)
    const matches = (f, r) => !on || truth(evalExpr(on, { env, metas: scope, rows: [...f, r], parent }), 'ON') === true
    const out = []
    const rightUsed = new Set()
    for (const f of frames) {
      let any = false
      right.forEach((r, ri) => {
        if (matches(f, r)) { out.push([...f, r]); any = true; rightUsed.add(ri) }
      })
      if (!any && (join === 'left' || join === 'full')) out.push([...f, null])
    }
    if (join === 'right' || join === 'full') {
      right.forEach((r, ri) => { if (!rightUsed.has(ri)) out.push([...metas.slice(0, j).map(() => null), r]) })
    }
    frames = out
  }
  return frames
}

// checks every column name in the query, so a mistake shows even when a table is empty
function validateQuery(q, parent, env) {
  for (const core of q.cores) {
    const { metas } = openSources(core.from, parent, env)
    validateCore(core, { env, metas, rows: [], parent }, q.cores.length === 1 ? q.orderBy : [])
  }
}
function validateExpr(e, ctx) {
  if (!e || !e.t) return
  if (e.t === 'col') resolve(ctx, e.parts)
  for (const s of subqueriesOf(e)) validateQuery(s, ctx, ctx.env)
  for (const c of children(e)) validateExpr(c, ctx)
}
function validateCore(core, ctx, orderBy) {
  core.from.forEach((item, j) => { if (item.on) validateExpr(item.on, { ...ctx, metas: ctx.metas.slice(0, j + 1) }) })
  const aliases = new Set(core.items.filter((i) => i.alias).map((i) => i.alias.toLowerCase()))
  for (const item of core.items) {
    if (item.star && item.qual && !ctx.metas.some((m) => m.alias === item.qual.toLowerCase() || m.name === item.qual.toLowerCase())) {
      throw new SqlError(`${item.qual}.* names no table or alias in this query`)
    }
    if (!item.star) validateExpr(item.e, ctx)
  }
  validateExpr(core.where, ctx)
  for (const g of core.groupBy) if (!isOutputRef(g, aliases)) validateExpr(g, ctx)
  validateExpr(core.having, ctx)
  for (const o of orderBy) if (!isOutputRef(o.e, aliases)) validateExpr(o.e, ctx)
}
const isOutputRef = (e, aliases) => (e.t === 'lit' && typeof e.v === 'number') || (e.t === 'col' && e.parts.length === 1 && aliases.has(e.parts[0].toLowerCase()))

// Runs a query; returns [{ out, ctx }] (ctx is the source row or group, for ORDER BY), with .columns set.
function runSelect(q, parent, env) {
  validateQuery(q, parent, env)
  let results = runCore(q.cores[0], parent, env)
  let columns = results.columns
  q.ops.forEach((op, i) => {
    const more = runCore(q.cores[i + 1], parent, env)
    if (more.columns.length !== columns.length) throw new SqlError('Each query in a UNION must select the same number of columns')
    // rows of later queries take the first query's column names
    const renamed = more.map((r) => ({ out: Object.fromEntries(columns.map((c, k) => [c, r.vals[k]])), vals: r.vals, ctx: null }))
    results = results.concat(renamed)
    if (op === 'UNION') results = distinct(results)
  })
  if (q.ops.length) results = results.map((r) => ({ ...r, ctx: null }))

  if (q.orderBy.length) {
    const aliasOf = (e) => (e.t === 'col' && e.parts.length === 1 ? columns.find((c) => c.toLowerCase() === e.parts[0].toLowerCase()) : undefined)
    const keyed = results.map((r) => ({
      r,
      keys: q.orderBy.map(({ e }) => {
        if (e.t === 'lit' && typeof e.v === 'number') {
          if (e.v < 1 || e.v > columns.length) throw new SqlError(`ORDER BY position ${e.v} is not in the select list`)
          return r.vals[e.v - 1]
        }
        const alias = aliasOf(e)
        const selfNamed = alias !== undefined && q.cores[0].items.some((i) => !i.star && i.alias && i.alias.toLowerCase() === alias.toLowerCase())
        if (alias !== undefined && (selfNamed || !r.ctx)) return r.out[alias]
        if (!r.ctx) throw new SqlError(`ORDER BY ${e.parts?.join('.') ?? 'expression'} must name a column of the result`)
        return evalExpr(e, r.ctx)
      }),
    }))
    keyed.sort((a, b) => {
      for (let k = 0; k < q.orderBy.length; k++) {
        const { desc, nulls } = q.orderBy[k]
        const x = a.keys[k] ?? null
        const y = b.keys[k] ?? null
        if (x === null && y === null) continue
        // nulls sort last going up and first going down (Oracle and Postgres), unless NULLS FIRST/LAST says otherwise
        const nullsFirst = nulls ? nulls === 'first' : desc
        if (x === null) return nullsFirst ? -1 : 1
        if (y === null) return nullsFirst ? 1 : -1
        const c = compare(x, y)
        if (c) return desc ? -c : c
      }
      return 0
    })
    results = keyed.map((k) => k.r)
  }
  const top = q.cores.length === 1 ? q.cores[0].top : null
  const empty = { env, metas: [], rows: [], parent }
  const count = (e, what) => {
    const v = toNumber(evalExpr(e, empty), what)
    if (v < 0 || !Number.isInteger(v)) throw new SqlError(`${what} must be a whole number of 0 or more, not ${v}`)
    return v
  }
  const offset = q.offset ? count(q.offset, 'OFFSET') : 0
  let limit = q.limit ? count(q.limit, 'LIMIT') : Infinity
  if (top) limit = Math.min(limit, count(top, 'TOP'))
  results = results.slice(offset, offset + limit)
  results.columns = columns
  return results
}

function distinct(results) {
  const seen = new Set()
  return results.filter((r) => { const k = JSON.stringify(r.vals); if (seen.has(k)) return false; seen.add(k); return true })
}

function runCore(core, parent, env) {
  const { metas, sources } = openSources(core.from, parent, env)
  const base = { env, metas, parent }
  let frames = joinFrames(core.from, metas, sources, parent, env).map((rows) => ({ rows }))

  if (core.connectBy) {
    // Oracle's row generator: SELECT ... FROM DUAL CONNECT BY LEVEL <= n (or a condition on LEVEL)
    if (frames.length !== 1) throw new SimUnsupported('CONNECT BY over a table (only the FROM DUAL row generator runs)')
    const rows = frames[0].rows
    frames = [{ rows, level: 1 }]
    for (let level = 2; level <= 10000; level++) {
      if (truth(evalExpr(core.connectBy, { ...base, rows, level }), 'CONNECT BY') !== true) break
      frames.push({ rows, level })
    }
  }
  if (core.where) {
    let n = 0
    frames = frames.filter((f) => {
      // ROWNUM counts the rows accepted so far, so WHERE ROWNUM <= 10 keeps the first ten
      const ok = truth(evalExpr(core.where, { ...base, rows: f.rows, level: f.level, rownum: n + 1 })) === true
      if (ok) n++
      return ok
    })
  }
  frames.forEach((f, i) => { f.rownum = i + 1 })

  const items = core.items
  const grouped = core.groupBy.length > 0 || items.some((i) => !i.star && hasAggregate(i.e)) || hasAggregate(core.having)
  let contexts
  if (grouped) {
    const groupBy = core.groupBy.map((g) => {
      if (g.t === 'lit' && typeof g.v === 'number') {
        const item = items[g.v - 1]
        if (!item || item.star) throw new SqlError(`GROUP BY position ${g.v} is not in the select list`)
        return item.e
      }
      if (g.t === 'col' && g.parts.length === 1) {
        let resolvable = true
        try { resolve(base, g.parts) } catch { resolvable = false }
        const item = items.find((i) => i.alias && i.alias.toLowerCase() === g.parts[0].toLowerCase())
        if (!resolvable && item) return item.e
      }
      return g
    })
    const groupCols = new Set()
    const groupKeys = new Set()
    for (const g of groupBy) {
      if (g.t === 'col') {
        const r = resolve(base, g.parts)
        if (r.depth === 0) groupCols.add(`${r.i}.${r.col}`)
      } else groupKeys.add(keyOf(g))
    }
    const groups = new Map()
    for (const f of frames) {
      const key = JSON.stringify(groupBy.map((g) => evalExpr(g, { ...base, rows: f.rows, level: f.level, rownum: f.rownum })))
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(f)
    }
    if (!groupBy.length && !groups.size) groups.set('[]', []) // an aggregate over no rows still gives one row
    contexts = [...groups.values()].map((fs) => ({
      ...base,
      rows: fs[0]?.rows ?? metas.map(() => null),
      level: fs[0]?.level,
      rownum: fs[0]?.rownum,
      group: fs.map((f) => f.rows),
      groupKeys,
      groupCols,
    }))
    if (core.having) contexts = contexts.filter((c) => truth(evalExpr(core.having, c), 'HAVING') === true)
  } else {
    if (core.having) throw new SqlError('HAVING needs GROUP BY or an aggregate function')
    contexts = frames.map((f) => ({ ...base, rows: f.rows, level: f.level, rownum: f.rownum }))
  }

  let results = contexts.map((ctx) => ({ ...project(items, ctx), ctx }))
  const columns = results.length ? results[0].names : staticColumns(items, base)
  if (core.distinct) results = distinct(results)
  results.columns = columns
  return results
}

// → { out, names, vals }: the row object, plus the select list's names and values in order (an object puts keys
// such as '0' first, and two columns can share a name)
function project(items, ctx) {
  const names = []
  const vals = []
  for (const item of items) {
    if (item.star) {
      if (ctx.group) throw new SqlError('SELECT * cannot be used with GROUP BY or aggregates; list the columns')
      ctx.metas.forEach((m, i) => {
        if (item.qual && m.alias !== item.qual.toLowerCase() && m.name !== item.qual.toLowerCase()) return
        const row = ctx.rows[i]
        for (const c of m.cols ?? (row ? Object.keys(row) : [])) { names.push(c); vals.push(getValue(row, c)) }
      })
      continue
    }
    names.push(outputName(item, ctx))
    const v = evalExpr(item.e, ctx)
    vals.push(v === undefined ? null : v)
  }
  const out = {}
  names.forEach((n, i) => { out[n] = vals[i] })
  return { out, names, vals }
}

function outputName(item, ctx) {
  if (item.alias) return item.alias
  if (item.e.t === 'col') return resolve(ctx, item.e.parts).col
  return item.text
}

// column names of a query that returned no rows (needed by INSERT ... SELECT and derived tables)
function staticColumns(items, ctx) {
  const names = []
  for (const item of items) {
    if (item.star) {
      ctx.metas.forEach((m) => {
        if (!item.qual || m.alias === item.qual.toLowerCase() || m.name === item.qual.toLowerCase()) names.push(...(m.cols ?? []))
      })
    } else names.push(outputName(item, ctx))
  }
  return [...new Set(names)]
}

// ---- INSERT / UPDATE / DELETE / MERGE -------------------------------------------------------------------------------
function checkRow(t, row) {
  for (const c of t.declared ?? []) {
    if ((c.notNull || c.nullable === false || c.primaryKey) && (row[c.name] === null || row[c.name] === undefined)) {
      throw new SqlError(`Cannot insert NULL into column "${c.name}" of table "${t.name}": it is NOT NULL`)
    }
  }
  for (const k of t.keyCols) {
    if (row[k] === null || row[k] === undefined) throw new SqlError(`Cannot insert NULL into column "${k}" of table "${t.name}": it is the primary key`)
  }
}

const sameKey = (t, a, b) => t.keyCols.every((k) => compare(getValue(a, k), getValue(b, k)) === 0)
function duplicateKeyError(t, row) {
  const desc = t.keyCols.map((k) => `${k} = ${JSON.stringify(row[k])}`).join(', ')
  return new SqlError(`Duplicate key: table "${t.name}" already has a row with ${desc} (primary key violation)`)
}

function nextKey(t, col) {
  let max = 0
  for (const r of t.def.rows) {
    const v = getValue(r, col)
    if (typeof v === 'number' && v > max) max = v
    else if (typeof v === 'string' && /^\d+$/.test(v) && Number(v) > max) max = Number(v)
  }
  return max + 1
}

// builds a new row from columns and values; fills a missing single-column key with max + 1
function newRow(t, cols, values) {
  const row = {}
  for (const c of t.declared ?? []) row[c.name] = c.default ?? null
  cols.forEach((c, i) => {
    const v = values[i]
    row[c] = v === DEFAULT ? (t.declared?.find((d) => d.name === c)?.default ?? null) : v === undefined ? null : v
  })
  let generated = null
  if (t.keyCols.length === 1) {
    const k = t.keyCols[0]
    if (row[k] === null || row[k] === undefined) { row[k] = nextKey(t, k); generated = { [k]: row[k] } }
  }
  checkRow(t, row)
  return { row, generated }
}

function runInsert(s, env) {
  const t = openTable(env, s.table)
  let cols = s.columns ? s.columns.map((c) => columnOf(t, c)) : t.cols
  if (s.columns && new Set(cols.map((c) => c.toLowerCase())).size !== cols.length) throw new SqlError('A column is named more than once in the INSERT column list')
  let valueRows
  if (s.rows) {
    const ctx = { env, metas: [], rows: [], parent: null }
    valueRows = s.rows.map((r) => r.map((e) => (e.t === 'default' ? DEFAULT : evalExpr(e, ctx))))
  } else {
    const result = runSelect(s.query, null, env)
    valueRows = result.map((r) => r.vals)
    if (!cols) cols = result.columns
    else if (result.columns.length && result.columns.length !== cols.length && result.length) {
      throw new SqlError(`INSERT has ${cols.length} target columns but the SELECT gives ${result.columns.length} values`)
    }
  }
  if (!cols) throw new SqlError(`INSERT INTO ${s.table} needs a column list: the table's columns are not known`)
  for (const v of valueRows) {
    if (v.length > cols.length) throw new SqlError('INSERT has more values than target columns')
    if (v.length < cols.length) throw new SqlError('INSERT has more target columns than values')
  }

  let conflictCols = null
  if (s.onConflict) conflictCols = s.onConflict.target ? s.onConflict.target.map((c) => columnOf(t, c)) : t.keyCols
  else if (s.ignore || s.onDuplicate) conflictCols = t.keyCols
  const target = bindingOf(t, s.alias)
  // EXCLUDED.col (Postgres) is the row that could not go in; a bare column name means the table's row
  const excluded = { ...bindingOf(t, 'excluded'), qualifiedOnly: true }

  let affected = 0
  let generatedKeys = null
  for (const values of valueRows) {
    const { row, generated } = newRow(t, cols, values)
    const existing = conflictCols?.length
      ? t.def.rows.find((r) => conflictCols.every((c) => compare(getValue(r, c), row[c]) === 0))
      : null
    if (existing) {
      const sets = s.onConflict?.action === 'update' ? s.onConflict.sets : s.onDuplicate
      if (!sets) continue // DO NOTHING / INSERT IGNORE
      const ctx = { env, metas: [target, excluded], rows: [existing, row], parent: null, insertRow: row }
      if (s.onConflict?.where && truth(evalExpr(s.onConflict.where, ctx), 'ON CONFLICT WHERE') !== true) continue
      applyUpdates(t, [{ row: existing, ctx }], sets)
      affected += s.onDuplicate ? 2 : 1 // MySQL reports an updated duplicate as 2 rows
      continue
    }
    if (t.keyCols.length && t.def.rows.some((r) => sameKey(t, r, row))) {
      if (s.ignore) continue
      throw duplicateKeyError(t, row)
    }
    t.def.rows.push(row)
    affected++
    if (generated) generatedKeys = generated
  }
  return generatedKeys ? { kind: 'update', affectedRows: affected, generatedKeys } : { kind: 'update', affectedRows: affected }
}

// works out every new row first, then checks and applies them, so one row's change never feeds another's
function applyUpdates(t, targets, sets) {
  const cols = sets.map((x) => columnOf(t, x.col))
  const changes = targets.map(({ row, ctx }) => {
    const next = { ...row }
    sets.forEach((x, i) => {
      next[cols[i]] = x.e.t === 'default' ? (t.declared?.find((d) => d.name === cols[i])?.default ?? null) : evalExpr(x.e, ctx)
      if (next[cols[i]] === undefined) next[cols[i]] = null
    })
    return { row, next }
  })
  for (const { next } of changes) {
    for (const c of t.declared ?? []) {
      if ((c.notNull || c.nullable === false || c.primaryKey) && next[c.name] === null) throw new SqlError(`Cannot set column "${c.name}" of table "${t.name}" to NULL: it is NOT NULL`)
    }
    for (const k of t.keyCols) if (next[k] === null) throw new SqlError(`Cannot set column "${k}" of table "${t.name}" to NULL: it is the primary key`)
  }
  if (t.keyCols.length && cols.some((c) => t.keyCols.includes(c))) {
    const changed = new Map(changes.map((c) => [c.row, c.next]))
    const final = t.def.rows.map((r) => changed.get(r) ?? r)
    const seen = new Set()
    for (const r of final) {
      const k = JSON.stringify(t.keyCols.map((c) => getValue(r, c)))
      if (seen.has(k)) throw duplicateKeyError(t, r)
      seen.add(k)
    }
  }
  for (const { row, next } of changes) Object.assign(row, next)
}

function matchingRows(t, binding, where, env) {
  const metas = [binding]
  validateExpr(where, { env, metas, rows: [], parent: null })
  let n = 0
  return t.def.rows.filter((row) => {
    if (!where) return true
    const ok = truth(evalExpr(where, { env, metas, rows: [row], parent: null, rownum: n + 1 })) === true
    if (ok) n++
    return ok
  })
}

function runUpdate(s, env) {
  const t = openTable(env, s.table)
  const binding = bindingOf(t, s.alias)
  for (const x of s.sets) {
    columnOf(t, x.col)
    validateExpr(x.e, { env, metas: [binding], rows: [], parent: null })
  }
  const rows = matchingRows(t, binding, s.where, env)
  applyUpdates(t, rows.map((row) => ({ row, ctx: { env, metas: [binding], rows: [row], parent: null } })), s.sets)
  return { kind: 'update', affectedRows: rows.length }
}

function runDelete(s, env) {
  const t = openTable(env, s.table)
  const doomed = new Set(matchingRows(t, bindingOf(t, s.alias), s.where, env))
  const kept = t.def.rows.filter((r) => !doomed.has(r))
  t.def.rows.splice(0, t.def.rows.length, ...kept)
  return { kind: 'update', affectedRows: doomed.size }
}

function runMerge(s, env) {
  const t = openTable(env, s.table)
  const target = bindingOf(t, s.alias)
  const { metas, sources } = openSources([{ src: s.src }], null, env)
  const metasBoth = [target, metas[0]]
  validateExpr(s.on, { env, metas: metasBoth, rows: [], parent: null })
  let affected = 0
  let generatedKeys = null
  for (const srcRow of sources[0].slice()) {
    const ctxFor = (row) => ({ env, metas: metasBoth, rows: [row, srcRow], parent: null })
    const matches = t.def.rows.filter((row) => truth(evalExpr(s.on, ctxFor(row)), 'MERGE ON') === true)
    if (matches.length) {
      for (const row of matches) {
        const ctx = ctxFor(row)
        const w = s.matched.find((m) => !m.cond || truth(evalExpr(m.cond, ctx)) === true)
        if (!w || (w.where && truth(evalExpr(w.where, ctx)) !== true)) continue
        applyUpdates(t, [{ row, ctx }], w.sets)
        affected++
      }
    } else {
      const ctx = ctxFor(null)
      const w = s.notMatched.find((m) => !m.cond || truth(evalExpr(m.cond, ctx)) === true)
      if (!w) continue
      const cols = w.columns ? w.columns.map((c) => columnOf(t, c)) : t.cols
      if (!cols) throw new SqlError(`MERGE INSERT into ${s.table} needs a column list: the table's columns are not known`)
      if (cols.length !== w.values.length) throw new SqlError('MERGE INSERT has a different number of columns and values')
      const { row, generated } = newRow(t, cols, w.values.map((e) => evalExpr(e, ctx)))
      if (t.keyCols.length && t.def.rows.some((r) => sameKey(t, r, row))) throw duplicateKeyError(t, row)
      t.def.rows.push(row)
      affected++
      if (generated) generatedKeys = generated
    }
  }
  return generatedKeys ? { kind: 'update', affectedRows: affected, generatedKeys } : { kind: 'update', affectedRows: affected }
}

// ---- stored procedures --------------------------------------------------------------------------------------------
function runCall(s, env) {
  const procs = env.db.procedures ?? {}
  const wanted = s.name.toLowerCase()
  const names = Object.keys(procs)
  // the exact name first, then the name without its package or schema prefix, on either side
  const key = names.find((k) => k.toLowerCase() === wanted) ?? names.find((k) => bare(k) === bare(wanted))
  if (!key || typeof procs[key] !== 'function') {
    throw new SqlError(`Stored procedure ${s.name} does not exist (identifier '${s.name.toUpperCase()}' must be declared)`)
  }
  // a procedure gets its named arguments; an OUT parameter has no value yet, so it arrives as null
  const args = {}
  for (const a of s.args) if (a.t === 'param') args[a.name] = env.params[a.name] ?? null
  return { kind: 'procedure', result: procs[key](args, env.db) ?? null }
}
