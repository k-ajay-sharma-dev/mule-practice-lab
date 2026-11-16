// Splits a SQL statement into tokens. Strings, quoted identifiers and comments are read whole first, so a :name or a
// time such as '10:30' inside a string literal is never taken for a parameter.
import { SqlError, SimUnsupported } from '../errors.js'

// token: { type: 'id' | 'str' | 'num' | 'param' | 'op' | 'eof', value, upper?, quoted?, start, end }
export function tokenize(sql) {
  const tokens = []
  let i = 0
  const push = (type, value, start, extra = {}) => tokens.push({ type, value, start, end: i, ...extra })
  while (i < sql.length) {
    const c = sql[i]
    const start = i
    if (/\s/.test(c)) { i++; continue }
    if (c === '-' && sql[i + 1] === '-') { while (i < sql.length && sql[i] !== '\n') i++; continue }
    if (c === '/' && sql[i + 1] === '*') {
      const close = sql.indexOf('*/', i + 2)
      if (close < 0) throw new SqlError('Syntax error: a /* comment is never closed')
      i = close + 2
      continue
    }
    // N'...' (SQL Server) and E'...' (Postgres) are plain strings here
    if ((c === "'") || (/[nNeE]/.test(c) && sql[i + 1] === "'" && !/[\w$#]/.test(sql[i - 1] ?? ''))) {
      if (c !== "'") i++
      i++
      let text = ''
      for (;;) {
        if (i >= sql.length) throw new SqlError('Syntax error: a string literal is never closed')
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") { text += "'"; i += 2; continue }
          i++
          break
        }
        text += sql[i++]
      }
      push('str', text, start)
      continue
    }
    if (c === '"' || c === '`' || c === '[') {
      const closeCh = c === '[' ? ']' : c
      const close = sql.indexOf(closeCh, i + 1)
      if (close < 0) throw new SqlError(`Syntax error: a quoted name starting with ${c} is never closed`)
      const name = sql.slice(i + 1, close)
      i = close + 1
      push('id', name, start, { upper: name.toUpperCase(), quoted: true })
      continue
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(sql[i + 1] ?? ''))) {
      const m = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(sql.slice(i))
      i += m[0].length
      push('num', Number(m[0]), start)
      continue
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][\w$#]*/.exec(sql.slice(i))
      i += m[0].length
      push('id', m[0], start, { upper: m[0].toUpperCase(), quoted: false })
      continue
    }
    if (c === ':' && sql[i + 1] === ':') { i += 2; push('op', '::', start); continue }
    if (c === ':' && /[A-Za-z_]/.test(sql[i + 1] ?? '')) {
      const m = /^[A-Za-z_][\w]*/.exec(sql.slice(i + 1))
      i += 1 + m[0].length
      push('param', m[0], start)
      continue
    }
    if (c === '?') throw new SimUnsupported('positional ? parameters (use :name placeholders)')
    const two = sql.slice(i, i + 2)
    if (['<=', '>=', '<>', '!=', '||'].includes(two)) { i += 2; push('op', two, start); continue }
    if ('(),.;+-*/%=<>{}'.includes(c)) { i++; push('op', c, start); continue }
    throw new SqlError(`Syntax error at or near "${c}"`)
  }
  tokens.push({ type: 'eof', value: '', start: sql.length, end: sql.length })
  return tokens
}
