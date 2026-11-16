// The flow simulator's in-memory database: runs the SQL of a Database connector step against the scenario's tables.
//
// db = { tables: { [name]: { columns?: [...], key?: 'id' | ['a', 'b'], rows: [ {...} ] } },
//        procedures?: { [name]: (params, db) => result }, now?: ISO timestamp, sequences?: { [name]: lastValue } }
// A column may be a name or { name, notNull?, default? }. params = { name: value } for :name placeholders.
// The engine changes db in place; the caller passes its own copy.
import { SqlError } from './errors.js'
import { parse } from './sql/parser.js'
import { execute, walk } from './sql/engine.js'

// → { kind: 'select', rows } | { kind: 'update', affectedRows, generatedKeys? } | { kind: 'procedure', result }
export function runSql(sql, params, db) {
  if (typeof sql !== 'string' || !sql.trim()) throw new SqlError('The SQL statement is empty')
  return execute(parse(sql), params ?? {}, db)
}

// The lower-case names of the tables a statement touches (schema prefixes dropped), for the simulator's trace.
export function tableNamesIn(sql) {
  const names = new Set()
  let stmt
  try {
    stmt = parse(sql)
  } catch {
    // a statement the engine cannot read still gets a best guess for the trace
    const re = /\b(?:from|join|into|update|table)\s+([\w$#."[\]`]+)/gi
    let m
    while ((m = re.exec(sql ?? ''))) names.add(m[1].replace(/["[\]`]/g, '').split('.').pop().toLowerCase())
    names.delete('dual')
    names.delete('select')
    return [...names]
  }
  walk(stmt, (n) => {
    if (n.type && n.table && n.type !== 'select') names.add(n.table.split('.').pop().toLowerCase())
    if (n.src?.name) names.add(n.src.name.toLowerCase())
  })
  names.delete('dual')
  return [...names]
}
