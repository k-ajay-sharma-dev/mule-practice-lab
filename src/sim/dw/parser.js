// Parses DataWeave source into an AST: { header: { output, decls }, body }.
//
// Precedence follows the DataWeave table, loosest first: lambda body / if-else; default, match, update, to, ++, --
// and every infix function call (map, filter, replace ... with), left-associative together; or; and; == != ~=;
// < > <= >= is; + - >> <<; * /; as; unary; selectors and calls. `not` and a minus before a non-literal take the rest of
// the expression to their right (down to the level-9 boundary); `!` takes only the next operand.
import { DwError, SimUnsupported } from '../errors.js'
import { tokenize, lineCol } from './lexer.js'

// Functions whose argument at these positions is a function: an argument there that uses $ becomes a lambda.
export const FUNCTION_ARGS = {
  map: [1], mapObject: [1], filter: [1], filterObject: [1], pluck: [1], reduce: [1], flatMap: [1], groupBy: [1],
  orderBy: [1], distinctBy: [1], maxBy: [1], minBy: [1], some: [1], every: [1], then: [1], countBy: [1], sumBy: [1],
  partition: [1], indexWhere: [1], firstWith: [1], takeWhile: [1], dropWhile: [1], splitWhere: [1], replace: [2],
  find: [], scan: [], mapEntries: [1], everyEntry: [1], someEntry: [1], filterEntries: [1], mergeWith: [],
  sortBy: [1], lastIndexWhere: [1], update: [], do: [], join: [2, 3], leftJoin: [2, 3], outerJoin: [2, 3],
  everyCharacter: [1], someCharacter: [1], collapse: [], mapLeafValues: [1], filterLeafValues: [1],
}

const KEYWORDS = new Set([
  'and', 'or', 'not', 'as', 'is', 'default', 'if', 'else', 'case', 'var', 'fun', 'type', 'ns', 'import', 'output', 'input',
  'to', 'with', 'at', 'do', 'using', 'unless', 'otherwise', 'true', 'false', 'null', 'from', 'annotation',
])

const DECL_WORDS = new Set(['var', 'fun', 'type', 'ns', 'import', 'output', 'input', 'annotation'])

const SHORT_MIMES = {
  json: 'application/json', xml: 'application/xml', csv: 'application/csv', java: 'application/java', dw: 'application/dw',
  text: 'text/plain', yaml: 'application/yaml', urlencoded: 'application/x-www-form-urlencoded', multipart: 'multipart/form-data',
  excel: 'application/xlsx', flatfile: 'application/flatfile', ndjson: 'application/x-ndjson',
}

export function parseScript(src) {
  return new Parser(src).script()
}

export function parseExpression(src) {
  const p = new Parser(src)
  const e = p.expr()
  p.expectEof()
  return e
}

// Read `mime key=value, key="value"` as written after output.
export function parseDirective(text) {
  const m = /^\s*([^\s]+)\s*(.*)$/s.exec(text)
  if (!m) return { mime: 'application/json', options: {} }
  let mime = m[1]
  if (!mime.includes('/')) mime = SHORT_MIMES[mime] || mime
  const options = {}
  const re = /([A-Za-z_][\w.]*)\s*=\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^\s,]+)/g
  let o
  while ((o = re.exec(m[2]))) {
    let v = o[2]
    if (/^["']/.test(v)) {
      const esc = { n: '\n', r: '\r', t: '\t' }
      v = v.slice(1, -1).replace(/\\(.)/g, (_, c) => esc[c] ?? c)
    } else if (v === 'true' || v === 'false') v = v === 'true'
    else if (/^-?\d+(\.\d+)?$/.test(v)) v = Number(v)
    options[o[1]] = v
  }
  return { mime: mime.toLowerCase(), options }
}

class Parser {
  constructor(src, offset = 0) {
    this.src = src
    this.toks = tokenize(src)
    this.i = 0
    this.offset = offset
  }

  peek(k = 0) {
    return this.toks[Math.min(this.i + k, this.toks.length - 1)]
  }
  next() {
    return this.toks[this.i++]
  }
  isOp(v, k = 0) {
    const t = this.peek(k)
    return t.type === 'op' && t.value === v
  }
  isWord(v, k = 0) {
    const t = this.peek(k)
    return t.type === 'ident' && t.value === v
  }
  eatOp(v) {
    if (this.isOp(v)) return this.next()
    return null
  }
  eatWord(v) {
    if (this.isWord(v)) return this.next()
    return null
  }
  fail(msg, tok = this.peek()) {
    throw new DwError(`${msg} at ${lineCol(this.src, tok.start)}`)
  }
  expectOp(v) {
    if (!this.isOp(v)) this.fail(`Expected '${v}' but found '${this.peek().value ?? this.peek().type}'`)
    return this.next()
  }
  expectWord(v) {
    if (!this.isWord(v)) this.fail(`Expected '${v}' but found '${this.peek().value ?? this.peek().type}'`)
    return this.next()
  }
  expectEof() {
    if (this.peek().type !== 'eof') this.fail(`Unexpected '${this.peek().value ?? this.peek().type}'`)
  }
  name() {
    const t = this.peek()
    if (t.type !== 'ident') this.fail(`Expected a name but found '${t.value ?? t.type}'`)
    return this.next().value
  }

  // Raw text from the end of the current token to the end of its line (or a --- on that line).
  restOfLine() {
    const from = this.toks[this.i - 1].end
    let end = this.src.indexOf('\n', from)
    if (end < 0) end = this.src.length
    const sep = this.src.indexOf('---', from)
    if (sep >= 0 && sep < end) end = sep
    while (this.peek().type !== 'eof' && this.peek().start < end) this.i++
    return this.src.slice(from, end).trim()
  }

  hasTopLevelSeparator() {
    let depth = 0
    for (const t of this.toks) {
      if (t.type !== 'op') continue
      if ('([{'.includes(t.value)) depth++
      else if (')]}'.includes(t.value)) depth--
      else if (t.value === '---' && depth === 0) return true
    }
    return false
  }

  script() {
    const header = { output: null, inputs: [], decls: [] }
    if (this.hasTopLevelSeparator()) {
      this.decls(header, true)
      this.expectOp('---')
    }
    const body = this.peek().type === 'eof' ? { t: 'lit', v: null } : this.body()
    this.expectEof()
    return { header, body }
  }

  // Header or do-block declarations up to '---'.
  decls(header, topLevel) {
    while (!this.isOp('---') && this.peek().type !== 'eof') {
      const t = this.peek()
      if (t.type === 'op' && t.value === '%') {
        this.next()
        this.restOfLine()
        continue
      }
      if (t.type !== 'ident') this.fail(`Unexpected '${t.value}' in the script header`)
      switch (t.value) {
        case 'output': {
          this.next()
          const d = parseDirective(this.restOfLine())
          if (topLevel) header.output = d
          break
        }
        case 'input': {
          this.next()
          const m = /^(\w+)\s+(.*)$/s.exec(this.restOfLine())
          if (m && topLevel) header.inputs.push({ name: m[1], ...parseDirective(m[2]) })
          break
        }
        case 'ns': {
          this.next()
          const m = /^(\S+)\s+(\S+)/.exec(this.restOfLine())
          if (m) header.decls.push({ kind: 'ns', prefix: m[1], uri: m[2] })
          break
        }
        case 'type': {
          this.next()
          const m = /^(\w+)(?:<[^=]*>)?\s*=\s*(.*)$/.exec(this.restOfLine())
          if (m) header.decls.push({ kind: 'type', name: m[1], def: m[2].trim() })
          break
        }
        case 'annotation':
          this.next()
          this.restOfLine()
          break
        case 'import':
          header.decls.push(this.importDecl())
          break
        case 'var':
          header.decls.push(this.varDecl())
          break
        case 'fun':
          header.decls.push(this.funDecl())
          break
        default:
          if (t.value === 'dw' && t.nl) {
            this.next()
            this.restOfLine()
            break
          }
          this.fail(`Unexpected '${t.value}' in the script header`)
      }
    }
  }

  qualified() {
    const parts = [this.name()]
    while (this.isOp('::')) {
      this.next()
      if (this.isOp('*')) {
        this.next()
        parts.push('*')
        break
      }
      parts.push(this.name())
    }
    return parts
  }

  importDecl() {
    this.expectWord('import')
    if (this.eatOp('*')) {
      this.expectWord('from')
      return { kind: 'import', module: this.qualified().join('::'), all: true }
    }
    const first = this.qualified()
    if (first.length === 1 && (this.isOp(',') || this.isWord('from') || this.isWord('as'))) {
      const names = []
      let cur = first[0]
      for (;;) {
        let alias = cur
        if (this.eatWord('as')) alias = this.name()
        names.push({ name: cur, alias })
        if (!this.eatOp(',')) break
        cur = this.name()
      }
      this.expectWord('from')
      return { kind: 'import', module: this.qualified().join('::'), names }
    }
    let alias = first[first.length - 1]
    if (this.eatWord('as')) alias = this.name()
    return { kind: 'import', module: first.join('::'), alias }
  }

  varDecl() {
    this.expectWord('var')
    const name = this.name()
    if (this.eatOp(':')) this.type()
    this.expectOp('=')
    return { kind: 'var', name, expr: this.expr() }
  }

  funDecl() {
    this.expectWord('fun')
    const name = this.name()
    if (this.isOp('<')) this.skipGenerics()
    const params = this.params()
    if (this.eatOp(':')) this.type()
    this.expectOp('=')
    return { kind: 'fun', name, params, body: this.expr() }
  }

  params() {
    this.expectOp('(')
    const params = []
    while (!this.isOp(')')) {
      const p = { name: this.name(), type: null, def: null }
      if (this.eatOp(':')) p.type = this.type()
      if (this.eatOp('=')) p.def = this.expr()
      params.push(p)
      if (!this.eatOp(',')) break
    }
    this.expectOp(')')
    return params
  }

  skipGenerics() {
    let depth = 0
    do {
      const t = this.next()
      if (t.type === 'op' && t.value === '<') depth++
      else if (t.type === 'op' && t.value === '>') depth--
      else if (t.type === 'op' && t.value === '>>') depth -= 2
      else if (t.type === 'eof') this.fail('Unclosed <')
    } while (depth > 0)
  }

  skipBalanced(open, close) {
    let depth = 0
    do {
      const t = this.next()
      if (t.type === 'op' && t.value === open) depth++
      else if (t.type === 'op' && t.value === close) depth--
      else if (t.type === 'eof') this.fail(`Unclosed ${open}`)
    } while (depth > 0)
  }

  // A type expression. Only the name matters to the evaluator; generics and object shapes are skipped.
  type(allowObject = true) {
    let t
    if (this.isOp('{') && allowObject) {
      this.skipBalanced('{', '}')
      t = { name: 'Object' }
    } else if (this.isOp('(')) {
      this.skipBalanced('(', ')')
      if (this.eatOp('->')) this.type(allowObject)
      t = { name: 'Function' }
    } else if (this.peek().type === 'string') {
      this.next()
      t = { name: 'String' }
    } else {
      const parts = this.qualified()
      t = { name: parts[parts.length - 1] }
      if (this.isOp('<')) this.skipGenerics()
    }
    if (this.isOp('|')) {
      const union = [t]
      while (this.eatOp('|')) union.push(this.type(allowObject))
      return { name: 'Union', union }
    }
    return t
  }

  body() {
    if (this.looksLikeField()) {
      const fields = [this.field()]
      return { t: 'obj', fields }
    }
    return this.expr()
  }

  // name: / name @( / ns#name: / "name": starts an object field.
  looksLikeField(k = 0) {
    const t = this.peek(k)
    if (t.type !== 'ident' && t.type !== 'string' && t.type !== 'number') return false
    let j = k + 1
    if (t.type === 'ident' && this.isOp('#', j) && this.peek(j + 1).type === 'ident') j += 2
    if (this.isOp(':', j)) return true
    return this.isOp('@', j) && this.isOp('(', j + 1)
  }

  expr() {
    return this.infix()
  }

  // Level 9 of the DataWeave precedence table: default, match, update, `to`, ++, -- and every infix function call
  // (map, filter, joinBy, contains, a user function...) share one left-associative level, looser than or/and and the
  // comparisons, so `payload filter $.price < 500` filters on the comparison.
  infix() {
    let l = this.orExpr()
    for (;;) {
      const t = this.peek()
      if (t.type === 'op' && (t.value === '++' || t.value === '--')) {
        this.next()
        l = { t: 'bin', op: t.value, l, r: this.orExpr() }
        continue
      }
      if (t.type !== 'ident' || t.value.startsWith('$')) return l
      if (t.value === 'default') {
        this.next()
        l = { t: 'default', l, r: this.orExpr() }
        continue
      }
      if (t.value === 'to') {
        this.next()
        l = { t: 'range', from: l, to: this.orExpr() }
        continue
      }
      if (KEYWORDS.has(t.value)) return l
      if (t.value === 'match' && this.isOp('{', 1)) {
        this.next()
        l = this.matchBlock(l)
        continue
      }
      if (t.value === 'update' && this.isOp('{', 1)) {
        this.next()
        l = this.updateBlock(l)
        continue
      }
      // An identifier that starts a new field (`name:`) ends the expression.
      if (this.looksLikeField()) return l
      this.next()
      const args = [l, this.orExpr()]
      if (t.value === 'replace' && this.eatWord('with')) args.push(this.orExpr())
      l = this.call({ t: 'id', name: t.value }, args, t.value)
    }
  }

  orExpr() {
    let l = this.andExpr()
    while (this.eatWord('or')) l = { t: 'or', l, r: this.andExpr() }
    return l
  }

  andExpr() {
    let l = this.equality()
    while (this.eatWord('and')) l = { t: 'and', l, r: this.equality() }
    return l
  }

  equality() {
    let l = this.relational()
    for (;;) {
      const t = this.peek()
      if (t.type === 'op' && (t.value === '==' || t.value === '!=' || t.value === '~=')) {
        this.next()
        l = { t: 'bin', op: t.value, l, r: this.relational() }
      } else return l
    }
  }

  relational() {
    let l = this.additive()
    for (;;) {
      const t = this.peek()
      if (t.type === 'op' && ['<', '>', '<=', '>='].includes(t.value)) {
        this.next()
        l = { t: 'bin', op: t.value, l, r: this.additive() }
      } else if (t.type === 'ident' && t.value === 'is') {
        this.next()
        l = { t: 'is', e: l, type: this.type(false) }
      } else return l
    }
  }

  call(fn, args, name) {
    const positions = FUNCTION_ARGS[name] || []
    for (const p of positions) {
      if (args[p] && args[p].t !== 'lambda' && usesDollar(args[p])) args[p] = implicitLambda(args[p])
    }
    return { t: 'call', fn, args }
  }

  additive() {
    let l = this.multiplicative()
    for (;;) {
      const t = this.peek()
      if (t.type === 'op' && ['+', '-', '>>', '<<'].includes(t.value)) {
        this.next()
        l = { t: 'bin', op: t.value, l, r: this.multiplicative() }
      } else return l
    }
  }

  multiplicative() {
    let l = this.asExpr()
    for (;;) {
      const t = this.peek()
      if (t.type === 'op' && (t.value === '*' || t.value === '/')) {
        this.next()
        l = { t: 'bin', op: t.value, l, r: this.asExpr() }
      } else return l
    }
  }

  asExpr() {
    let e = this.unary()
    while (this.eatWord('as')) {
      const type = this.type(false)
      const opts = this.isOp('{') ? this.objectLiteral() : null
      e = { t: 'as', e, type, opts }
    }
    return e
  }

  unary() {
    if (this.isOp('-')) {
      this.next()
      const t = this.peek()
      if (t.type === 'number') {
        this.next()
        return this.postfix({ t: 'lit', v: -t.value })
      }
      // -x + 3 is -(x + 3): a minus before a non-literal takes the whole sum to its right.
      return { t: 'neg', e: this.additive() }
    }
    // not takes the rest of the expression (not true or true is not (true or true)); ! binds to the next operand only.
    if (this.isWord('not')) {
      this.next()
      return { t: 'not', e: this.orExpr() }
    }
    if (this.isOp('!')) {
      this.next()
      return { t: 'not', e: this.unary() }
    }
    return this.postfix(this.primary())
  }

  postfix(e) {
    for (;;) {
      const t = this.peek()
      if (t.type !== 'op') return e
      if (t.value === '.') {
        this.next()
        e = { t: 'sel', target: e, sel: this.selector() }
      } else if (t.value === '..') {
        this.next()
        const multi = !!this.eatOp('*')
        e = { t: 'sel', target: e, sel: { kind: 'desc', ...this.selName(), multi } }
      } else if (t.value === '[') {
        this.next()
        if (this.eatOp('?')) {
          this.expectOp('(')
          const cond = this.expr()
          this.expectOp(')')
          this.expectOp(']')
          e = { t: 'sel', target: e, sel: { kind: 'filter', cond: implicitLambda(cond) } }
          continue
        }
        if (this.isOp('@')) {
          this.next()
          const n = this.selName()
          this.expectOp(']')
          e = { t: 'sel', target: e, sel: { kind: 'attr', name: n.name } }
          continue
        }
        if (this.isOp('*')) {
          this.next()
          const expr = this.expr()
          this.expectOp(']')
          e = { t: 'sel', target: e, sel: { kind: 'multiDyn', expr } }
          continue
        }
        const expr = this.expr()
        this.expectOp(']')
        e = { t: 'sel', target: e, sel: expr.t === 'range' ? { kind: 'range', from: expr.from, to: expr.to } : { kind: 'index', expr } }
      } else if (t.value === '(' && !t.nl) {
        this.next()
        const args = this.args()
        e = this.call(e, args, e.t === 'id' ? e.name : e.t === 'qname' ? e.name : null)
      } else if (t.value === '?') {
        this.next()
        e = { t: 'exists', e }
      } else return e
    }
  }

  args() {
    const args = []
    while (!this.isOp(')')) {
      args.push(this.expr())
      if (!this.eatOp(',')) break
    }
    this.expectOp(')')
    return args
  }

  // The part after a dot: key, "key", ns#key, *key, @, @attr, ^meta, #.
  selector() {
    if (this.eatOp('*')) return { kind: 'multi', ...this.selName() }
    if (this.eatOp('@')) {
      const t = this.peek()
      if (t.type === 'ident' || t.type === 'string') return { kind: 'attr', ...this.selName() }
      return { kind: 'attrs' }
    }
    if (this.eatOp('^')) return { kind: 'meta', name: this.name() }
    if (this.eatOp('#')) return { kind: 'namespace' }
    if (this.eatOp('&')) throw new SimUnsupported('the .& object selector')
    return { kind: 'key', ...this.selName() }
  }

  selName() {
    const t = this.peek()
    if (t.type === 'string') {
      this.next()
      if (t.parts.some((p) => p.expr !== undefined)) return { expr: this.stringNode(t) }
      return { name: t.parts.map((p) => p.text).join('') }
    }
    if (t.type === 'ident') {
      this.next()
      if (this.isOp('#') && (this.peek(1).type === 'ident' || this.peek(1).type === 'string') && !this.peek(1).nl) {
        this.next()
        const n = this.next()
        return { ns: t.value, name: n.type === 'string' ? n.parts.map((p) => p.text).join('') : n.value }
      }
      return { name: t.value }
    }
    if (t.type === 'number') {
      this.next()
      return { name: t.text }
    }
    this.fail(`Expected a selector name but found '${t.value ?? t.type}'`)
  }

  primary() {
    const t = this.peek()
    switch (t.type) {
      case 'number':
        this.next()
        return { t: 'lit', v: t.value }
      case 'string':
        this.next()
        return this.stringNode(t)
      case 'date':
        this.next()
        return { t: 'date', text: t.value }
      case 'regex':
        this.next()
        return { t: 'regex', source: t.value, flags: t.flags }
      case 'eof':
        this.fail('Unexpected end of script')
    }
    if (t.type === 'op') {
      switch (t.value) {
        case '(':
          if (this.isLambdaAhead()) return this.lambda()
          this.next()
          {
            const e = this.expr()
            this.expectOp(')')
            return { t: 'paren', e }
          }
        case '[':
          return this.arrayLiteral()
        case '{':
          return this.objectLiteral()
        case '-':
          return this.unary()
        case '!':
          return this.unary()
      }
      this.fail(`Unexpected '${t.value}'`)
    }
    // identifiers and keywords
    switch (t.value) {
      case 'true':
        this.next()
        return { t: 'lit', v: true }
      case 'false':
        this.next()
        return { t: 'lit', v: false }
      case 'null':
        this.next()
        return { t: 'lit', v: null }
      case 'if':
        return this.ifExpr()
      case 'unless': {
        this.next()
        this.expectOp('(')
        const c = this.expr()
        this.expectOp(')')
        const a = this.expr()
        this.expectWord('otherwise')
        return { t: 'if', c: { t: 'not', e: c }, a, b: this.expr() }
      }
      case 'do':
        return this.doBlock()
      case 'using':
        return this.usingExpr()
      case 'not':
        return this.unary()
      case 'fun':
        this.fail('A fun declaration must be in the header or a do block')
    }
    this.next()
    if (this.isOp('::')) {
      const parts = [t.value]
      while (this.eatOp('::')) parts.push(this.name())
      return { t: 'qname', module: parts.slice(0, -1).join('::'), name: parts[parts.length - 1] }
    }
    // A bare `ns#name` outside a selector is a namespaced key used as a value; treat it as the name.
    return { t: 'id', name: t.value }
  }

  stringNode(t) {
    if (t.parts.every((p) => p.expr === undefined)) return { t: 'lit', v: t.parts.map((p) => p.text).join('') }
    return {
      t: 'str',
      parts: t.parts.map((p) => (p.expr === undefined ? p : { node: parseExpression(p.expr) })),
    }
  }

  isLambdaAhead() {
    let depth = 0
    let j = this.i
    for (; j < this.toks.length; j++) {
      const t = this.toks[j]
      if (t.type === 'eof') return false
      if (t.type !== 'op') continue
      if (t.value === '(' || t.value === '[' || t.value === '{') depth++
      else if (t.value === ')' || t.value === ']' || t.value === '}') {
        depth--
        if (depth === 0) break
      }
    }
    const after = this.toks[j + 1]
    if (!after || after.type !== 'op' || after.caseArrow) return false
    if (after.value === '->') return true
    if (after.value !== ':') return false
    // (x): Type -> body
    for (let k = j + 2; k < Math.min(j + 12, this.toks.length); k++) {
      const t = this.toks[k]
      if (t.type === 'op' && t.value === '->') return true
      if (t.type === 'op' && [',', '}', ')', '='].includes(t.value)) return false
    }
    return false
  }

  lambda() {
    const params = this.params()
    if (this.eatOp(':')) this.type()
    this.expectOp('->')
    return { t: 'lambda', params, body: this.body() }
  }

  // Mark the '->' that ends a case pattern, so that a parenthesised guard before it is not taken for a lambda.
  markCaseArrow() {
    let depth = 0
    for (let j = this.i; j < this.toks.length; j++) {
      const t = this.toks[j]
      if (t.type === 'eof') return
      if (t.type !== 'op') continue
      if ('([{'.includes(t.value)) depth++
      else if (')]}'.includes(t.value)) depth--
      else if (t.value === '->' && depth === 0) {
        t.caseArrow = true
        return
      }
    }
  }

  ifExpr() {
    this.expectWord('if')
    this.expectOp('(')
    const c = this.expr()
    this.expectOp(')')
    const a = this.expr()
    this.expectWord('else')
    return { t: 'if', c, a, b: this.expr() }
  }

  doBlock() {
    this.expectWord('do')
    this.expectOp('{')
    const header = { output: null, inputs: [], decls: [] }
    let hasSep = false
    // A do block without --- is just an expression.
    {
      let depth = 0
      for (let j = this.i; j < this.toks.length; j++) {
        const t = this.toks[j]
        if (t.type !== 'op') continue
        if ('([{'.includes(t.value)) depth++
        else if (')]}'.includes(t.value)) {
          if (depth === 0) break
          depth--
        } else if (t.value === '---' && depth === 0) {
          hasSep = true
          break
        }
      }
    }
    if (hasSep) {
      this.decls(header, false)
      this.expectOp('---')
    }
    const body = this.body()
    this.expectOp('}')
    return { t: 'do', decls: header.decls, body }
  }

  usingExpr() {
    this.expectWord('using')
    this.expectOp('(')
    const decls = []
    while (!this.isOp(')')) {
      const name = this.name()
      this.expectOp('=')
      decls.push({ kind: 'var', name, expr: this.expr() })
      if (!this.eatOp(',')) break
    }
    this.expectOp(')')
    return { t: 'do', decls, body: this.expr() }
  }

  arrayLiteral() {
    this.expectOp('[')
    const items = []
    while (!this.isOp(']')) {
      const node = this.expr()
      let cond = null
      if (this.eatWord('if')) cond = this.conditionAfterIf()
      items.push({ node, cond })
      if (!this.eatOp(',')) break
    }
    this.expectOp(']')
    return { t: 'arr', items }
  }

  conditionAfterIf() {
    return this.orExpr()
  }

  objectLiteral() {
    this.expectOp('{')
    const fields = this.fieldList('}')
    this.expectOp('}')
    return { t: 'obj', fields }
  }

  fieldList(close) {
    const fields = []
    while (!this.isOp(close)) {
      fields.push(this.field())
      if (!this.eatOp(',')) break
    }
    return fields
  }

  field() {
    if (this.isOp('(')) {
      if (this.looksLikeField(1)) {
        this.next()
        const f = this.field()
        this.expectOp(')')
        if (this.eatWord('if')) f.cond = this.conditionAfterIf()
        return f
      }
      this.next()
      const e = this.expr()
      this.expectOp(')')
      if (this.isOp(':') || (this.isOp('@') && this.isOp('(', 1))) {
        const attrs = this.attrsAfterKey()
        this.expectOp(':')
        const f = { kind: 'kv', key: { expr: e, attrs }, value: this.expr(), cond: null }
        if (this.eatWord('if')) f.cond = this.conditionAfterIf()
        return f
      }
      const f = { kind: 'spread', expr: e, cond: null }
      if (this.eatWord('if')) f.cond = this.conditionAfterIf()
      return f
    }
    const t = this.peek()
    let key
    if (t.type === 'string') {
      this.next()
      key = t.parts.some((p) => p.expr !== undefined) ? { expr: this.stringNode(t) } : { name: t.parts.map((p) => p.text).join('') }
    } else if (t.type === 'ident') {
      this.next()
      key = { name: t.value }
      if (this.isOp('#') && this.peek(1).type === 'ident') {
        this.next()
        key = { ns: t.value, name: this.next().value }
      }
    } else if (t.type === 'number') {
      this.next()
      key = { name: t.text }
    } else this.fail(`Expected an object key but found '${t.value ?? t.type}'`)
    key.attrs = this.attrsAfterKey()
    this.expectOp(':')
    return { kind: 'kv', key, value: this.expr(), cond: null }
  }

  attrsAfterKey() {
    if (!(this.isOp('@') && this.isOp('(', 1))) return null
    this.next()
    this.next()
    const fields = this.fieldList(')')
    this.expectOp(')')
    return fields
  }

  matchBlock(subject) {
    this.expectOp('{')
    const cases = []
    while (!this.isOp('}')) {
      if (this.eatWord('else')) {
        this.eatOp('->')
        cases.push({ kind: 'else', body: this.expr() })
        continue
      }
      this.expectWord('case')
      this.markCaseArrow()
      const c = this.pattern()
      if (this.eatWord('if')) c.guard = this.expr()
      this.expectOp('->')
      c.body = this.expr()
      cases.push(c)
    }
    this.expectOp('}')
    return { t: 'match', e: subject, cases }
  }

  pattern() {
    if (this.eatWord('is')) return { kind: 'type', type: this.type(false) }
    if (this.eatWord('matches')) return { kind: 'regex', re: this.orExpr() }
    const t = this.peek()
    if (t.type === 'ident' && !KEYWORDS.has(t.value)) {
      const after = this.peek(1)
      if (after.type === 'ident' && after.value === 'is') {
        this.next()
        this.next()
        return { kind: 'type', bind: t.value, type: this.type(false) }
      }
      if (after.type === 'ident' && after.value === 'matches') {
        this.next()
        this.next()
        return { kind: 'regex', bind: t.value, re: this.orExpr() }
      }
      if (after.type === 'ident' && after.value === 'if') {
        this.next()
        return { kind: 'any', bind: t.value }
      }
      if (after.type === 'op' && after.value === '->') {
        this.next()
        return { kind: 'any', bind: t.value }
      }
      if (after.type === 'op' && after.value === ':') {
        this.next()
        this.next()
        return { kind: 'value', bind: t.value, value: this.orExpr() }
      }
    }
    if (t.type === 'regex') {
      this.next()
      return { kind: 'regex', re: { t: 'regex', source: t.value, flags: t.flags } }
    }
    return { kind: 'value', value: this.orExpr() }
  }

  updateBlock(subject) {
    this.expectOp('{')
    const cases = []
    while (!this.isOp('}')) {
      this.expectWord('case')
      this.markCaseArrow()
      let bind = null
      if (this.peek().type === 'ident' && !this.isWord('at')) bind = this.name()
      if (bind || this.isWord('at')) this.expectWord('at')
      const path = []
      let upsert = false
      for (;;) {
        if (this.eatOp('.')) {
          if (this.eatOp('@')) path.push({ attr: this.selName().name })
          else if (this.eatOp('*')) path.push({ multi: this.selName().name })
          else path.push({ key: this.selName().name })
        } else if (this.isOp('[')) {
          this.next()
          path.push({ index: this.expr() })
          this.expectOp(']')
        } else if (this.isOp('!')) {
          this.next()
          upsert = true
        } else break
      }
      let guard = null
      if (this.eatWord('if')) guard = this.expr()
      this.expectOp('->')
      cases.push({ bind, path, upsert, guard, body: this.expr() })
    }
    this.expectOp('}')
    return { t: 'update', e: subject, cases }
  }
}

// Does this expression use $, $$ or $$$ outside a nested lambda?
export function usesDollar(node) {
  if (!node || typeof node !== 'object') return false
  if (Array.isArray(node)) return node.some(usesDollar)
  if (node.t === 'lambda') return false
  if (node.t === 'id' && (node.name === '$' || node.name === '$$' || node.name === '$$$')) return true
  for (const k of Object.keys(node)) {
    const v = node[k]
    if (v && typeof v === 'object' && usesDollar(v)) return true
  }
  return false
}

function implicitLambda(body) {
  return { t: 'lambda', params: [{ name: '$' }, { name: '$$' }, { name: '$$$' }], body, implicit: true }
}
