// Turns one SQL statement into a tree the engine runs. It reads the dialects Mule flows use (Oracle, Postgres,
// SQL Server, MySQL) loosely: it accepts what any of them accept, and names what it cannot run with SimUnsupported.
import { SqlError, SimUnsupported } from '../errors.js'
import { tokenize } from './lexer.js'

// Words that end an expression or a list, so they are never read as a column name or an implicit alias.
const RESERVED = new Set(`SELECT FROM WHERE GROUP HAVING ORDER BY LIMIT OFFSET FETCH UNION INTERSECT EXCEPT MINUS JOIN
  INNER LEFT RIGHT FULL CROSS OUTER NATURAL ON USING AND OR NOT AS SET VALUES INTO IS IN LIKE ILIKE BETWEEN CASE WHEN
  THEN ELSE END NULL TRUE FALSE FOR DISTINCT EXISTS CONNECT WITH RETURNING TOP ALL ANY SOME ESCAPE INTERVAL ASC DESC`.split(/\s+/))

const AGGREGATES = new Set(['COUNT', 'SUM', 'AVG', 'MIN', 'MAX'])
export const isAggregate = (node) => node.t === 'fn' && AGGREGATES.has(node.name) && !node.over

export function parse(sql) {
  const p = new Parser(sql)
  const stmt = p.statement()
  if (p.isOp(';')) {
    p.next()
    if (p.peek().type !== 'eof') {
      throw new SqlError('Only one SQL statement can run in a Database operation, but this text holds more than one (separated by ;)')
    }
  }
  if (p.peek().type !== 'eof') p.fail()
  return stmt
}

class Parser {
  constructor(sql) {
    this.sql = sql
    this.tokens = tokenize(sql)
    this.pos = 0
  }

  peek(n = 0) { return this.tokens[Math.min(this.pos + n, this.tokens.length - 1)] }
  next() { return this.tokens[this.pos++] }
  isKw(word, n = 0) { const t = this.peek(n); return t.type === 'id' && !t.quoted && t.upper === word }
  isOp(op, n = 0) { const t = this.peek(n); return t.type === 'op' && t.value === op }
  acceptKw(...words) {
    if (!words.every((w, i) => this.isKw(w, i))) return false
    this.pos += words.length
    return true
  }
  acceptOp(op) { if (this.isOp(op)) { this.pos++; return true } return false }
  expectKw(...words) { if (!this.acceptKw(...words)) this.fail() }
  expectOp(op) { if (!this.acceptOp(op)) this.fail() }
  fail(t = this.peek()) {
    if (t.type === 'eof') throw new SqlError('Syntax error at end of statement')
    throw new SqlError(`Syntax error at or near "${this.sql.slice(t.start, t.end)}"`)
  }
  // a name that can be a column, table or alias (quoted names are always names)
  isName(n = 0) { const t = this.peek(n); return t.type === 'id' && (t.quoted || !RESERVED.has(t.upper)) }
  name() {
    const t = this.peek()
    if (t.type !== 'id') this.fail()
    this.pos++
    return t.value
  }
  // schema.table or table; the schema is ignored
  tableName() {
    const parts = [this.name()]
    while (this.isOp('.')) { this.next(); parts.push(this.name()) }
    return parts[parts.length - 1]
  }
  optAlias() {
    if (this.acceptKw('AS')) return this.name()
    return this.isName() ? this.name() : null
  }

  statement() {
    const t = this.peek()
    if (t.type === 'op' && t.value === '{') return this.callEscape()
    if (t.type === 'op' && t.value === '(') return this.select()
    if (t.type !== 'id') this.fail()
    switch (t.upper) {
      case 'SELECT': case 'WITH': return this.select()
      case 'INSERT': return this.insert()
      case 'UPDATE': return this.update()
      case 'DELETE': return this.delete()
      case 'TRUNCATE': return this.truncate()
      case 'MERGE': return this.merge()
      case 'CALL': this.next(); return this.callBody()
      case 'EXEC': case 'EXECUTE': return this.exec()
      case 'BEGIN': case 'DECLARE': throw new SimUnsupported('PL/SQL or T-SQL blocks (BEGIN ... END)')
      case 'CREATE': case 'ALTER': case 'DROP': case 'GRANT': case 'REVOKE': case 'COMMENT': case 'RENAME':
        throw new SimUnsupported(`${t.upper} statements`)
      case 'COMMIT': case 'ROLLBACK': case 'SAVEPOINT': throw new SimUnsupported('transaction statements (COMMIT, ROLLBACK)')
      case 'REPLACE': case 'UPSERT': throw new SimUnsupported(`${t.upper} statements`)
      default: this.fail()
    }
  }

  // ---- procedures -------------------------------------------------------------------------------------------------
  callEscape() {
    this.expectOp('{')
    if (this.isOp('?') || this.isOp('=')) throw new SimUnsupported('function calls of the form {? = call ...}')
    this.expectKw('CALL')
    const call = this.callBody()
    this.expectOp('}')
    return call
  }
  callBody() {
    const parts = [this.name()]
    while (this.acceptOp('.')) parts.push(this.name())
    const args = []
    if (this.acceptOp('(')) {
      if (!this.isOp(')')) do args.push(this.expr()); while (this.acceptOp(','))
      this.expectOp(')')
    }
    return { type: 'call', name: parts.join('.'), args }
  }
  exec() {
    this.next()
    const parts = [this.name()]
    while (this.acceptOp('.')) parts.push(this.name())
    const args = []
    if (this.peek().type !== 'eof' && !this.isOp(';')) {
      do {
        // T-SQL named arguments: @p = :value
        if (this.peek().type === 'id' && this.isOp('=', 1)) { this.next(); this.next() }
        args.push(this.expr())
      } while (this.acceptOp(','))
    }
    return { type: 'call', name: parts.join('.'), args }
  }

  // ---- SELECT -----------------------------------------------------------------------------------------------------
  select() {
    if (this.isKw('WITH')) throw new SimUnsupported('WITH clauses (common table expressions)')
    const cores = [this.selectCore()]
    const ops = []
    for (;;) {
      if (this.acceptKw('UNION')) { ops.push(this.acceptKw('ALL') ? 'UNION ALL' : (this.acceptKw('DISTINCT'), 'UNION')); cores.push(this.selectCore()); continue }
      if (this.isKw('INTERSECT') || this.isKw('EXCEPT') || this.isKw('MINUS')) throw new SimUnsupported(`${this.peek().upper} queries`)
      break
    }
    const q = { type: 'select', cores, ops, orderBy: [], limit: null, offset: null }
    for (;;) {
      if (this.acceptKw('ORDER', 'BY')) {
        do {
          const item = { e: this.expr(), desc: false, nulls: null }
          if (this.acceptKw('DESC')) item.desc = true
          else this.acceptKw('ASC')
          if (this.acceptKw('NULLS')) item.nulls = this.acceptKw('FIRST') ? 'first' : (this.expectKw('LAST'), 'last')
          q.orderBy.push(item)
        } while (this.acceptOp(','))
      } else if (this.acceptKw('LIMIT')) {
        const a = this.expr()
        if (this.acceptOp(',')) { q.offset = a; q.limit = this.expr() } else q.limit = a // MySQL LIMIT offset, count
      } else if (this.acceptKw('OFFSET')) {
        q.offset = this.expr()
        this.acceptKw('ROWS') || this.acceptKw('ROW')
      } else if (this.acceptKw('FETCH')) {
        if (!this.acceptKw('FIRST')) this.expectKw('NEXT')
        q.limit = this.isKw('ROW') || this.isKw('ROWS') ? { t: 'lit', v: 1 } : this.expr()
        if (!this.acceptKw('ROWS')) this.expectKw('ROW')
        if (this.isKw('WITH')) throw new SimUnsupported('FETCH ... WITH TIES')
        this.expectKw('ONLY')
      } else if (this.acceptKw('FOR')) {
        // row locks mean nothing to a single learner's run
        if (!this.acceptKw('UPDATE')) this.expectKw('SHARE')
        if (this.acceptKw('OF')) do this.tableName(); while (this.acceptOp(','))
        if (this.acceptKw('SKIP')) this.expectKw('LOCKED')
        else if (this.acceptKw('NOWAIT')) { /* ignored */ }
        else if (this.acceptKw('WAIT')) this.next()
      } else break
    }
    return q
  }

  selectCore() {
    if (this.acceptOp('(')) { // a parenthesised SELECT used as a whole query
      const inner = this.select()
      this.expectOp(')')
      if (inner.cores.length !== 1 || inner.orderBy.length || inner.limit || inner.offset) throw new SimUnsupported('parenthesised queries with their own ORDER BY or paging inside UNION')
      return inner.cores[0]
    }
    this.expectKw('SELECT')
    const core = { distinct: false, top: null, items: [], from: [], where: null, connectBy: null, groupBy: [], having: null }
    if (this.acceptKw('DISTINCT')) core.distinct = true
    else this.acceptKw('ALL')
    if (this.acceptKw('TOP')) {
      core.top = this.isOp('(') ? (this.next(), this.finish(this.expr(), ')')) : this.primary()
      if (this.isKw('PERCENT')) throw new SimUnsupported('TOP ... PERCENT')
    }
    do core.items.push(this.selectItem()); while (this.acceptOp(','))
    if (this.isKw('INTO')) throw new SimUnsupported('SELECT ... INTO')
    if (this.acceptKw('FROM')) core.from = this.fromList()
    if (this.acceptKw('WHERE')) core.where = this.expr()
    if (this.isKw('START')) throw new SimUnsupported('START WITH hierarchical queries')
    if (this.acceptKw('CONNECT', 'BY')) { this.acceptKw('NOCYCLE'); core.connectBy = this.expr() }
    if (this.acceptKw('GROUP', 'BY')) do core.groupBy.push(this.expr()); while (this.acceptOp(','))
    if (this.acceptKw('HAVING')) core.having = this.expr()
    return core
  }
  finish(value, op) { this.expectOp(op); return value }

  selectItem() {
    if (this.isOp('*')) { this.next(); return { star: true } }
    if (this.peek().type === 'id' && this.isOp('.', 1) && this.isOp('*', 2)) {
      const qual = this.name(); this.next(); this.next()
      return { star: true, qual }
    }
    const start = this.peek().start
    const e = this.expr()
    const text = this.sql.slice(start, this.tokens[this.pos - 1].end)
    return { e, text, alias: this.optAlias() }
  }

  fromList() {
    const items = [{ join: 'first', src: this.tableItem() }]
    for (;;) {
      if (this.acceptOp(',')) { items.push({ join: 'cross', src: this.tableItem() }); continue }
      if (this.isKw('NATURAL')) throw new SimUnsupported('NATURAL JOIN')
      if (this.isKw('CROSS') && this.isKw('APPLY', 1)) throw new SimUnsupported('CROSS APPLY')
      if (this.isKw('OUTER') && this.isKw('APPLY', 1)) throw new SimUnsupported('OUTER APPLY')
      let join = null
      if (this.acceptKw('JOIN') || this.acceptKw('INNER', 'JOIN')) join = 'inner'
      else if (this.acceptKw('CROSS', 'JOIN')) join = 'cross'
      else for (const kind of ['LEFT', 'RIGHT', 'FULL']) {
        if (this.acceptKw(kind, 'JOIN') || this.acceptKw(kind, 'OUTER', 'JOIN')) { join = kind.toLowerCase(); break }
      }
      if (!join) break
      const item = { join, src: this.tableItem() }
      if (join !== 'cross') {
        if (this.isKw('USING')) throw new SimUnsupported('JOIN ... USING (write the join with ON)')
        this.expectKw('ON')
        item.on = this.expr()
      }
      items.push(item)
    }
    return items
  }

  tableItem() {
    if (this.isKw('LATERAL')) throw new SimUnsupported('LATERAL subqueries')
    if (this.acceptOp('(')) {
      if (!this.isKw('SELECT') && !this.isKw('WITH')) throw new SimUnsupported('parenthesised joins in FROM')
      const sub = this.select()
      this.expectOp(')')
      return { sub, alias: this.optAlias() }
    }
    const name = this.tableName()
    if (this.isOp('(')) throw new SimUnsupported(`table functions in FROM (${name}(...))`)
    const alias = this.optAlias()
    if (this.isKw('WITH') && this.isOp('(', 1)) { // SQL Server table hints such as WITH (NOLOCK)
      this.next(); this.next()
      while (!this.isOp(')')) { if (this.peek().type === 'eof') this.fail(); this.next() }
      this.next()
    }
    return { name, alias }
  }

  // ---- INSERT / UPDATE / DELETE / MERGE ----------------------------------------------------------------------------
  insert() {
    this.expectKw('INSERT')
    const s = { type: 'insert', ignore: this.acceptKw('IGNORE'), columns: null, rows: null, query: null, onConflict: null, onDuplicate: null }
    if (this.isKw('ALL') || this.isKw('FIRST')) throw new SimUnsupported('multi-table INSERT ALL')
    this.expectKw('INTO')
    s.table = this.tableName()
    s.alias = this.acceptKw('AS') ? this.name() : null
    if (this.isOp('(') && !this.isKw('SELECT', 1) && !this.isKw('WITH', 1)) {
      this.next()
      s.columns = []
      do s.columns.push(this.columnName()); while (this.acceptOp(','))
      this.expectOp(')')
    }
    if (this.acceptKw('VALUES') || this.acceptKw('VALUE')) {
      s.rows = []
      do {
        this.expectOp('(')
        const row = []
        if (!this.isOp(')')) do row.push(this.isKw('DEFAULT') ? (this.next(), { t: 'default' }) : this.expr()); while (this.acceptOp(','))
        this.expectOp(')')
        s.rows.push(row)
      } while (this.acceptOp(','))
    } else if (this.isKw('SELECT') || this.isKw('WITH') || this.isOp('(')) {
      s.query = this.select()
    } else if (this.isKw('DEFAULT')) {
      throw new SimUnsupported('INSERT ... DEFAULT VALUES')
    } else this.fail()
    if (this.acceptKw('ON', 'CONFLICT')) {
      const oc = { target: null, action: 'nothing', sets: [], where: null }
      if (this.acceptOp('(')) {
        oc.target = []
        do oc.target.push(this.name()); while (this.acceptOp(','))
        this.expectOp(')')
      } else if (this.isKw('ON', 0) && this.isKw('CONSTRAINT', 1)) throw new SimUnsupported('ON CONFLICT ON CONSTRAINT')
      this.expectKw('DO')
      if (this.acceptKw('NOTHING')) { /* nothing */ } else {
        this.expectKw('UPDATE'); this.expectKw('SET')
        oc.action = 'update'
        oc.sets = this.setList()
        if (this.acceptKw('WHERE')) oc.where = this.expr()
      }
      s.onConflict = oc
    } else if (this.acceptKw('ON', 'DUPLICATE', 'KEY', 'UPDATE')) {
      s.onDuplicate = this.setList()
    }
    if (this.isKw('RETURNING')) throw new SimUnsupported('RETURNING clauses')
    return s
  }

  columnName() {
    // a column may be written qualified (a.col); only the last part matters
    let n = this.name()
    while (this.acceptOp('.')) n = this.name()
    return n
  }
  setList() {
    const sets = []
    do {
      if (this.isOp('(')) throw new SimUnsupported('SET (a, b) = (...) multi-column assignments')
      const col = this.columnName()
      this.expectOp('=')
      sets.push({ col, e: this.isKw('DEFAULT') ? (this.next(), { t: 'default' }) : this.expr() })
    } while (this.acceptOp(','))
    return sets
  }

  update() {
    this.expectKw('UPDATE')
    if (this.isKw('TOP')) throw new SimUnsupported('UPDATE TOP (n)')
    const s = { type: 'update', table: this.tableName(), alias: null, sets: [], where: null }
    if (!this.isKw('SET')) s.alias = this.optAlias()
    this.expectKw('SET')
    s.sets = this.setList()
    if (this.isKw('FROM')) throw new SimUnsupported('UPDATE ... FROM (write the join as a subquery)')
    if (this.acceptKw('WHERE')) {
      if (this.isKw('CURRENT')) throw new SimUnsupported('WHERE CURRENT OF cursors')
      s.where = this.expr()
    }
    if (this.isKw('RETURNING')) throw new SimUnsupported('RETURNING clauses')
    if (this.isKw('ORDER') || this.isKw('LIMIT')) throw new SimUnsupported('UPDATE with ORDER BY or LIMIT')
    return s
  }

  delete() {
    this.expectKw('DELETE')
    if (this.isKw('TOP')) throw new SimUnsupported('DELETE TOP (n)')
    this.acceptKw('FROM') // Oracle allows DELETE table WHERE ...
    const s = { type: 'delete', table: this.tableName(), alias: null, where: null }
    if (!this.isKw('WHERE')) s.alias = this.optAlias()
    if (this.isKw('USING') || this.isKw('FROM')) throw new SimUnsupported('DELETE with a join (USING / FROM)')
    if (this.acceptKw('WHERE')) s.where = this.expr()
    if (this.isKw('RETURNING')) throw new SimUnsupported('RETURNING clauses')
    if (this.isKw('ORDER') || this.isKw('LIMIT')) throw new SimUnsupported('DELETE with ORDER BY or LIMIT')
    return s
  }

  truncate() {
    this.expectKw('TRUNCATE')
    this.acceptKw('TABLE')
    const s = { type: 'truncate', table: this.tableName() }
    while (this.acceptKw('RESTART', 'IDENTITY') || this.acceptKw('CONTINUE', 'IDENTITY') || this.acceptKw('CASCADE') ||
      this.acceptKw('DROP', 'STORAGE') || this.acceptKw('REUSE', 'STORAGE')) { /* options that change nothing here */ }
    return s
  }

  merge() {
    this.expectKw('MERGE')
    this.acceptKw('INTO')
    const s = { type: 'merge', table: this.tableName(), alias: null, matched: [], notMatched: [] }
    if (!this.isKw('USING')) s.alias = this.optAlias()
    this.expectKw('USING')
    s.src = this.tableItem()
    this.expectKw('ON')
    s.on = this.expr()
    while (this.acceptKw('WHEN')) {
      const not = this.acceptKw('NOT')
      this.expectKw('MATCHED')
      if (not && this.acceptKw('BY')) {
        if (this.acceptKw('SOURCE')) throw new SimUnsupported('MERGE ... WHEN NOT MATCHED BY SOURCE')
        this.expectKw('TARGET')
      }
      const cond = this.acceptKw('AND') ? this.expr() : null
      this.expectKw('THEN')
      if (not) {
        this.expectKw('INSERT')
        const w = { cond, columns: null, values: [] }
        if (this.acceptOp('(')) { w.columns = []; do w.columns.push(this.columnName()); while (this.acceptOp(',')); this.expectOp(')') }
        this.expectKw('VALUES')
        this.expectOp('(')
        do w.values.push(this.expr()); while (this.acceptOp(','))
        this.expectOp(')')
        if (this.isKw('WHERE')) throw new SimUnsupported('MERGE ... INSERT ... WHERE')
        s.notMatched.push(w)
      } else {
        if (this.isKw('DELETE')) throw new SimUnsupported('MERGE ... WHEN MATCHED THEN DELETE')
        this.expectKw('UPDATE'); this.expectKw('SET')
        const w = { cond, sets: this.setList(), where: null }
        if (this.isKw('DELETE')) throw new SimUnsupported('MERGE ... DELETE WHERE')
        if (this.acceptKw('WHERE')) w.where = this.expr()
        s.matched.push(w)
      }
    }
    if (!s.matched.length && !s.notMatched.length) this.fail()
    return s
  }

  // ---- expressions ------------------------------------------------------------------------------------------------
  expr() { return this.or() }
  or() {
    let l = this.and()
    while (this.acceptKw('OR')) l = { t: 'bin', op: 'OR', l, r: this.and() }
    return l
  }
  and() {
    let l = this.not()
    while (this.acceptKw('AND')) l = { t: 'bin', op: 'AND', l, r: this.not() }
    return l
  }
  not() {
    if (this.acceptKw('NOT')) return { t: 'not', e: this.not() }
    return this.comparison()
  }
  comparison() {
    const l = this.additive()
    const t = this.peek()
    if (t.type === 'op' && ['=', '<>', '!=', '<', '>', '<=', '>='].includes(t.value)) {
      this.next()
      const op = t.value === '!=' ? '<>' : t.value
      if (this.isKw('ANY') || this.isKw('SOME') || this.isKw('ALL')) {
        const all = this.next().upper === 'ALL'
        this.expectOp('(')
        const node = { t: 'any', op, all, e: l }
        if (this.isKw('SELECT') || this.isKw('WITH')) node.sub = this.select()
        else node.arr = this.expr()
        this.expectOp(')')
        return node
      }
      return { t: 'bin', op, l, r: this.additive() }
    }
    if (this.acceptKw('IS')) {
      const not = this.acceptKw('NOT')
      if (this.acceptKw('NULL')) return { t: 'isnull', e: l, not }
      if (this.acceptKw('TRUE')) return { t: 'istrue', e: l, v: true, not }
      if (this.acceptKw('FALSE')) return { t: 'istrue', e: l, v: false, not }
      if (this.isKw('DISTINCT')) throw new SimUnsupported('IS [NOT] DISTINCT FROM')
      this.fail()
    }
    const not = this.isKw('NOT') && (this.isKw('IN', 1) || this.isKw('LIKE', 1) || this.isKw('ILIKE', 1) || this.isKw('BETWEEN', 1))
    if (not) this.next()
    if (this.acceptKw('IN')) {
      this.expectOp('(')
      const node = { t: 'in', e: l, not }
      if (this.isKw('SELECT') || this.isKw('WITH')) node.sub = this.select()
      else { node.list = []; do node.list.push(this.expr()); while (this.acceptOp(',')) }
      this.expectOp(')')
      return node
    }
    if (this.isKw('LIKE') || this.isKw('ILIKE')) {
      const ci = this.next().upper === 'ILIKE'
      const node = { t: 'like', e: l, pat: this.additive(), not, ci, esc: null }
      if (this.acceptKw('ESCAPE')) node.esc = this.primary()
      return node
    }
    if (this.acceptKw('BETWEEN')) {
      const lo = this.additive()
      this.expectKw('AND')
      return { t: 'between', e: l, lo, hi: this.additive(), not }
    }
    if (not) this.fail()
    return l
  }
  additive() {
    let l = this.multiplicative()
    for (;;) {
      const t = this.peek()
      if (t.type === 'op' && (t.value === '+' || t.value === '-' || t.value === '||')) {
        this.next()
        l = { t: 'bin', op: t.value, l, r: this.multiplicative() }
      } else return l
    }
  }
  multiplicative() {
    let l = this.unary()
    for (;;) {
      const t = this.peek()
      if (t.type === 'op' && (t.value === '*' || t.value === '/' || t.value === '%')) {
        this.next()
        l = { t: 'bin', op: t.value, l, r: this.unary() }
      } else return l
    }
  }
  unary() {
    if (this.acceptOp('-')) return { t: 'neg', e: this.unary() }
    if (this.acceptOp('+')) return this.unary()
    let e = this.primary()
    while (this.acceptOp('::')) e = { t: 'cast', e, type: this.typeName() }
    return e
  }

  typeName() {
    const words = [this.name().toUpperCase()]
    while (this.isName() && !this.isOp('(', 0)) words.push(this.next().upper) // DOUBLE PRECISION, CHARACTER VARYING
    if (this.acceptOp('(')) { while (!this.acceptOp(')')) { if (this.peek().type === 'eof') this.fail(); this.next() } }
    while (this.acceptKw('WITH') || this.acceptKw('WITHOUT')) { this.acceptKw('LOCAL'); this.expectKw('TIME'); this.expectKw('ZONE') }
    return words.join(' ')
  }

  primary() {
    const t = this.peek()
    if (t.type === 'num') { this.next(); return { t: 'lit', v: t.value } }
    if (t.type === 'str') { this.next(); return { t: 'lit', v: t.value } }
    if (t.type === 'param') { this.next(); return { t: 'param', name: t.value } }
    if (t.type === 'op' && t.value === '(') {
      this.next()
      if (this.isKw('SELECT') || this.isKw('WITH')) {
        const sub = this.select()
        this.expectOp(')')
        return { t: 'sub', q: sub }
      }
      const e = this.expr()
      if (this.isOp(',')) throw new SimUnsupported('row values such as (a, b) IN (...)')
      this.expectOp(')')
      return e
    }
    if (t.type !== 'id') this.fail()
    if (!t.quoted) {
      switch (t.upper) {
        case 'NULL': this.next(); return { t: 'lit', v: null }
        case 'TRUE': this.next(); return { t: 'lit', v: true }
        case 'FALSE': this.next(); return { t: 'lit', v: false }
        case 'CASE': return this.caseExpr()
        case 'EXISTS': {
          this.next(); this.expectOp('(')
          const sub = this.select()
          this.expectOp(')')
          return { t: 'exists', sub }
        }
        case 'INTERVAL': return this.interval()
        case 'CAST': case 'TRY_CAST': {
          this.next(); this.expectOp('(')
          const e = this.expr()
          this.expectKw('AS')
          const type = this.typeName()
          this.expectOp(')')
          return { t: 'cast', e, type }
        }
        case 'EXTRACT': {
          this.next(); this.expectOp('(')
          const field = this.name().toUpperCase()
          this.expectKw('FROM')
          const e = this.expr()
          this.expectOp(')')
          return { t: 'fn', name: 'EXTRACT', args: [{ t: 'lit', v: field }, e] }
        }
        case 'DATE': case 'TIMESTAMP':
          if (this.peek(1).type === 'str') { this.next(); return { t: 'cast', e: { t: 'lit', v: this.next().value }, type: t.upper } }
          break
        case 'CURRENT_TIMESTAMP': case 'SYSDATE': case 'SYSTIMESTAMP': case 'LOCALTIMESTAMP': case 'CURRENT_DATE': case 'ROWNUM':
          if (!this.isOp('(', 1)) { this.next(); return { t: 'special', name: t.upper } }
          break
        case 'LEVEL':
          if (!this.isOp('(', 1) && !this.isOp('.', 1)) { this.next(); return { t: 'special', name: 'LEVEL' } }
          break
      }
      if (RESERVED.has(t.upper) && !(this.isOp('(', 1) && ['LEFT', 'RIGHT', 'VALUES'].includes(t.upper))) this.fail()
    }
    this.next()
    if (this.isOp('(') && !t.quoted) return this.funcCall(t.upper)
    const parts = [t.value]
    while (this.isOp('.') && this.peek(1).type === 'id') { this.next(); parts.push(this.next().value) }
    const last = parts[parts.length - 1].toUpperCase()
    if (parts.length > 1 && (last === 'NEXTVAL' || last === 'CURRVAL')) return { t: 'seq', name: parts.slice(0, -1).join('.'), op: last }
    if (this.isOp('(') && this.isOp('+', 1)) throw new SimUnsupported('Oracle (+) outer joins (write LEFT JOIN ... ON)')
    if (this.isOp('(')) throw new SimUnsupported(`package function calls (${parts.join('.')}(...))`)
    return { t: 'col', parts }
  }

  funcCall(name) {
    this.expectOp('(')
    const node = { t: 'fn', name, args: [], distinct: false, star: false, filter: null }
    if (this.isOp('*')) { this.next(); node.star = true } else if (!this.isOp(')')) {
      if (this.acceptKw('DISTINCT')) node.distinct = true
      else this.acceptKw('ALL')
      node.args.push(this.expr())
      if (name === 'SUBSTRING' && this.acceptKw('FROM')) {
        node.args.push(this.expr())
        if (this.acceptKw('FOR')) node.args.push(this.expr())
      }
      if (name === 'TRIM' && this.isKw('FROM')) throw new SimUnsupported('TRIM(... FROM ...)')
      while (this.acceptOp(',')) node.args.push(this.expr())
    }
    this.expectOp(')')
    if (this.isKw('WITHIN')) throw new SimUnsupported(`${name} ... WITHIN GROUP`)
    if (this.acceptKw('FILTER')) {
      this.expectOp('('); this.expectKw('WHERE')
      node.filter = this.expr()
      this.expectOp(')')
    }
    if (this.isKw('OVER')) throw new SimUnsupported('window functions (OVER ...)')
    return node
  }

  caseExpr() {
    this.expectKw('CASE')
    const node = { t: 'case', base: null, whens: [], else: null }
    if (!this.isKw('WHEN')) node.base = this.expr()
    while (this.acceptKw('WHEN')) {
      const c = this.expr()
      this.expectKw('THEN')
      node.whens.push([c, this.expr()])
    }
    if (!node.whens.length) this.fail()
    if (this.acceptKw('ELSE')) node.else = this.expr()
    this.expectKw('END')
    return node
  }

  // INTERVAL '15' MINUTE (Oracle / standard) or INTERVAL '15 minutes' (Postgres)
  interval() {
    this.expectKw('INTERVAL')
    const t = this.next()
    if (t.type !== 'str' && t.type !== 'num') this.fail(t)
    let text = String(t.value).trim()
    if (/^-?\d+(\.\d+)?$/.test(text) && this.isName()) {
      const unit = this.next().upper
      this.acceptOp('(') && (this.next(), this.expectOp(')'))
      if (this.acceptKw('TO')) throw new SimUnsupported('INTERVAL ... TO ... ranges')
      text = `${text} ${unit}`
    }
    const UNIT_MS = { SECOND: 1e3, MINUTE: 6e4, HOUR: 3.6e6, DAY: 8.64e7, WEEK: 6.048e8 }
    let ms = 0
    let months = 0
    const re = /(-?\d+(?:\.\d+)?)\s*([a-z]+)/gi
    let m
    let found = false
    while ((m = re.exec(text))) {
      found = true
      const n = Number(m[1])
      const unit = m[2].toUpperCase().replace(/S$/, '').replace(/^(MIN|MINS)$/, 'MINUTE').replace(/^SEC$/, 'SECOND')
      if (UNIT_MS[unit]) ms += n * UNIT_MS[unit]
      else if (unit === 'MONTH' || unit === 'MON') months += n
      else if (unit === 'YEAR') months += 12 * n
      else throw new SqlError(`Invalid interval unit "${m[2]}"`)
    }
    if (!found) throw new SqlError(`Invalid interval '${text}'`)
    return { t: 'lit', v: { interval: true, ms, months } }
  }
}
