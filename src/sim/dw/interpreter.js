// Evaluates a parsed DataWeave script against a Mule event (ctx).
import { DwError, SimUnsupported } from '../errors.js'
import { DwTemporal, DwPeriod, DwTimeZone, parseIso, addPeriod, diffTemporal, zoneOffset } from './dates.js'
import {
  DwKey, DwAttr, DwFn, DwBinary, AS_STRING, makeObject, entriesOf, entry, isPlainObject, unwrap, typeOf, describe, coerceString,
  canCoerceString, isNumericText, equals, similar, compare, fixNumber, decimalOp, importValue,
} from './values.js'
import { isType, coerceTo } from './coerce.js'
import { MODULES, KNOWN_MODULES, UNIMPLEMENTED_CORE } from './functions.js'
import { readValue } from './formats.js'

const TYPE_NAMES = new Set([
  'String', 'Number', 'Boolean', 'Null', 'Array', 'Object', 'Date', 'DateTime', 'LocalDateTime', 'Time', 'LocalTime',
  'Period', 'Binary', 'Key', 'Regex', 'Any', 'Nothing', 'Range', 'TimeZone', 'Uri', 'Function', 'Type', 'Namespace',
  'CData', 'SimpleType', 'Comparable',
])

// The instant used when ctx.now is missing, so runs stay repeatable.
const DEFAULT_NOW = Date.UTC(2026, 0, 1, 9, 0, 0)

class Lazy {
  constructor(fn) {
    this.fn = fn
    this.state = 0
  }
  get() {
    if (this.state === 1) return this.value
    if (this.state === 2) throw new DwError('A variable refers to itself')
    this.state = 2
    try {
      this.value = this.fn()
    } catch (e) {
      this.state = 0
      throw e
    }
    this.state = 1
    return this.value
  }
}

class Scope {
  constructor(parent) {
    this.parent = parent
    this.vars = new Map()
  }
  define(name, value) {
    this.vars.set(name, value)
  }
  has(name) {
    for (let s = this; s; s = s.parent) if (s.vars.has(name)) return true
    return false
  }
  get(name) {
    for (let s = this; s; s = s.parent) {
      if (s.vars.has(name)) {
        const v = s.vars.get(name)
        return v instanceof Lazy ? v.get() : v
      }
    }
    return undefined
  }
}

function bool(v, what) {
  v = unwrap(v)
  if (typeof v === 'boolean') return v
  throw new DwError(`${what} needs a Boolean, but got ${describe(v)}`)
}

function opError(op, a, b) {
  return new DwError(`You called the function '${op}' with these arguments: 1: ${describe(a)}, 2: ${describe(b)}`)
}

function num(v, op, a, b) {
  v = unwrap(v)
  if (typeof v === 'number') return v
  if (isNumericText(v)) return Number(v.trim())
  throw opError(op, a, b)
}

// Values stored in a new object or array lose selection wrappers and keys become strings.
function stored(v) {
  if (v instanceof DwAttr) return v.value
  if (v instanceof DwKey) return v.name
  return v
}

function jsRegex(source, flags) {
  let f = flags.replace(/[^gimsu]/g, '')
  let src = source
  const inline = /^\(\?([imsx]+)\)/.exec(src)
  if (inline) {
    src = src.slice(inline[0].length)
    f += inline[1].replace(/x/g, '')
  }
  try {
    return new RegExp(src, [...new Set(f)].join(''))
  } catch {
    throw new SimUnsupported(`the regular expression /${source}/`)
  }
}

export class Runtime {
  constructor(ctx) {
    this.ctx = ctx || {}
    this.aliases = {}
    this.namespaces = {}
    this.moduleAliases = {}
    this.builtins = new Map()
    this.depth = 0
  }

  now() {
    const n = this.ctx.now
    const ms = n instanceof Date ? n.getTime() : typeof n === 'number' ? n : typeof n === 'string' ? Date.parse(n) : DEFAULT_NOW
    return DwTemporal.fromEpochMillis(ms, 0)
  }

  // Repeatable ids: each call advances ctx.uuidSeed.
  uuid() {
    const seed = (this.ctx.uuidSeed = (this.ctx.uuidSeed ?? 0) + 1)
    let a = (seed * 0x9e3779b1) >>> 0
    const bytes = []
    for (let i = 0; i < 16; i++) {
      a = (a + 0x6d2b79f5) >>> 0
      let t = Math.imul(a ^ (a >>> 15), 1 | a)
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t)
      bytes.push(((t ^ (t >>> 14)) >>> 0) & 255)
    }
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const h = bytes.map((b) => b.toString(16).padStart(2, '0')).join('')
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
  }

  random() {
    const seed = (this.ctx.randomSeed = (this.ctx.randomSeed ?? 0) + 1)
    let t = (seed * 0x6d2b79f5) >>> 0
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  property(key) {
    const props = this.ctx.properties || {}
    if (Object.prototype.hasOwnProperty.call(props, key)) return importValue(props[key])
    const bare = key.replace(/^secure::/, '')
    if (Object.prototype.hasOwnProperty.call(props, bare)) return importValue(props[bare])
    return null
  }

  allProperties() {
    return importValue({ ...(this.ctx.properties || {}) })
  }

  log(text) {
    if (Array.isArray(this.ctx.logs)) this.ctx.logs.push(text)
  }

  call(fn, args) {
    fn = unwrap(fn)
    if (!(fn instanceof DwFn)) throw new DwError(`Expected a Function but got ${describe(fn)}`)
    if (++this.depth > 400) {
      this.depth = 0
      throw new DwError('Stack overflow: the script recurses too deeply')
    }
    try {
      return fn.call(args)
    } finally {
      this.depth--
    }
  }

  builtin(module, name) {
    const key = module + '::' + name
    if (this.builtins.has(key)) return this.builtins.get(key)
    const impl = MODULES[module]?.[name]
    if (!impl) return null
    const keepKeys = name === 'typeOf'
    const fn = new DwFn(name, [], (args) =>
      impl(this, ...args.map((a) => (a instanceof DwAttr ? a.value : a instanceof DwKey && !keepKeys ? a.name : a))),
    )
    this.builtins.set(key, fn)
    return fn
  }

  moduleFunction(module, name) {
    const fn = this.builtin(module, name)
    if (fn) return fn
    if (MODULES[module] || KNOWN_MODULES.has(module)) throw new SimUnsupported(`the function ${module}::${name}`)
    throw new DwError(`Unknown module ${module}`)
  }

  rootScope() {
    const ctx = this.ctx
    const root = new Scope(null)
    const lazy = (name, fn) => root.define(name, new Lazy(fn))
    lazy('payload', () => {
      const p = importValue(ctx.payload ?? null)
      // payload.^raw is the text the message arrived as, while the payload is still that message
      const u = unwrap(p)
      if (ctx.payloadRaw !== undefined && u !== null && typeof u === 'object') (this.rawOf ??= new WeakMap()).set(u, ctx.payloadRaw)
      return p
    })
    lazy('attributes', () => importValue(ctx.attributes ?? null))
    lazy('vars', () => importValue(ctx.vars ?? {}))
    lazy('error', () => importError(ctx.error))
    lazy('correlationId', () => ctx.correlationId ?? null)
    lazy('flow', () => makeObject([entry('name', ctx.flowName ?? null)]))
    lazy('app', () => importValue(ctx.app ?? { name: ctx.appName ?? 'app' }))
    lazy('authentication', () => importValue(ctx.authentication ?? null))
    lazy('message', () => makeObject([entry('payload', root.get('payload')), entry('attributes', root.get('attributes'))]))
    lazy('mule', () => importValue({ version: '4.6.0', home: '/opt/mule' }))
    lazy('server', () => importValue({ host: 'localhost', ip: '127.0.0.1' }))
    for (const [k, v] of Object.entries(ctx.inputs || {})) lazy(k, () => importValue(v))
    return root
  }

  declare(decls, scope) {
    const funs = new Map()
    for (const d of decls) {
      switch (d.kind) {
        case 'var':
          scope.define(d.name, new Lazy(() => this.eval(d.expr, scope)))
          break
        case 'fun':
          if (!funs.has(d.name)) funs.set(d.name, [])
          funs.get(d.name).push(d)
          break
        case 'ns':
          this.namespaces[d.prefix] = d.uri
          break
        case 'type': {
          const def = d.def
          this.aliases[d.name] = def.startsWith('{') ? 'Object' : def.includes('|') ? 'Any' : (/^[A-Za-z_][\w:]*/.exec(def)?.[0] || 'Any').split('::').pop()
          break
        }
        case 'import':
          this.importDecl(d, scope)
          break
      }
    }
    for (const [name, overloads] of funs) scope.define(name, this.makeFun(name, overloads, scope))
    // The engine evaluates every var, used or not, so a var that fails stops the script.
    for (const d of decls) if (d.kind === 'var') scope.vars.get(d.name)?.get?.()
  }

  importDecl(d, scope) {
    const mod = d.module
    if (!MODULES[mod] && !KNOWN_MODULES.has(mod)) {
      if (/^dw::/.test(mod)) throw new SimUnsupported(`the module ${mod}`)
      throw new SimUnsupported(`importing the custom module ${mod}`)
    }
    if (d.all) {
      for (const name of Object.keys(MODULES[mod] || {})) scope.define(name, this.builtin(mod, name))
      if (!MODULES[mod]) throw new SimUnsupported(`the module ${mod}`)
    } else if (d.names) {
      for (const { name, alias } of d.names) scope.define(alias, this.moduleFunction(mod, name))
    } else {
      this.moduleAliases[d.alias] = mod
    }
  }

  makeFun(name, overloads, scope) {
    const fns = overloads.map((d) => this.makeLambda({ params: d.params, body: d.body }, scope, name))
    if (fns.length === 1) return fns[0]
    return new DwFn(name, overloads[0].params, (args) => {
      const i = overloads.findIndex(
        (d) =>
          args.length <= d.params.length &&
          d.params.every((p, j) => (j >= args.length ? !!p.def : !p.type || isType(args[j], p.type, this.aliases))),
      )
      if (i < 0) throw new DwError(`No overload of ${name} accepts ${args.map(describe).join(', ')}`)
      return fns[i].call(args)
    })
  }

  makeLambda(node, scope, name = 'anonymous function') {
    const params = node.params
    const impl = (args) => {
      const s = new Scope(scope)
      params.forEach((p, i) => {
        let v = args[i]
        if (v === undefined) {
          if (p.def) v = this.eval(p.def, s)
          else if (node.implicit) v = null
          else throw new DwError(`Too few arguments calling ${name}: missing '${p.name}'`)
        }
        s.define(p.name, v)
      })
      return this.eval(node.body, s)
    }
    const getDefault = (i) => (params[i]?.def ? this.eval(params[i].def, new Scope(scope)) : undefined)
    return new DwFn(name, params.map((p) => ({ name: p.name, hasDefault: !!p.def })), impl, getDefault)
  }

  resolve(name, scope) {
    const v = scope.get(name)
    if (v !== undefined) return v
    if (TYPE_NAMES.has(name) || this.aliases[name]) return this.aliases[name] || name
    const fn = this.builtin('dw::Core', name)
    if (fn) return fn
    if (UNIMPLEMENTED_CORE.has(name)) throw new SimUnsupported(`the function ${name}`)
    for (const [mod, fns] of Object.entries(MODULES)) {
      if (mod !== 'dw::Core' && fns[name]) throw new DwError(`Unable to resolve reference of: ${name}. It is in ${mod}: add 'import ${name} from ${mod}'`)
    }
    if (name.startsWith('$')) throw new DwError(`${name} can only be used inside a function argument such as map or filter`)
    throw new DwError(`Unable to resolve reference of: ${name}`)
  }

  eval(node, scope) {
    switch (node.t) {
      case 'lit':
        return node.v
      case 'paren':
        return this.eval(node.e, scope)
      case 'str':
        return node.parts
          .map((p) => {
            if (p.text !== undefined) return p.text
            const v = unwrap(this.eval(p.node, scope))
            if (v === null) throw new DwError('Cannot coerce Null (null) to String in a $( ) interpolation')
            return coerceString(v)
          })
          .join('')
      case 'id':
        return this.resolve(node.name, scope)
      case 'qname': {
        const mod = this.moduleAliases[node.module] || node.module
        return this.moduleFunction(mod, node.name)
      }
      case 'date': {
        const text = node.text
        if (/^-?P/.test(text)) return DwPeriod.parse(text)
        // A region name such as |America/Chicago| is not a valid literal in the engine; it takes "America/Chicago" as text.
        if (/^(Z|UTC|GMT|[+-]\d{2}:?\d{2})$/.test(text)) return new DwTimeZone(text)
        const t = parseIso(text)
        if (!t) throw new DwError(`Invalid date literal |${text}|`)
        return t
      }
      case 'regex':
        return jsRegex(node.source, node.flags)
      case 'arr': {
        const out = []
        for (const it of node.items) {
          if (it.cond && !bool(this.eval(it.cond, scope), 'A conditional element')) continue
          out.push(stored(this.eval(it.node, scope)))
        }
        return out
      }
      case 'obj':
        return makeObject(this.fields(node.fields, scope))
      case 'sel':
        return this.select(this.eval(node.target, scope), node.sel, scope)
      case 'exists':
        return this.exists(node.e, scope)
      case 'call': {
        const fn = this.eval(node.fn, scope)
        const args = node.args.map((a) => this.eval(a, scope))
        if (!(unwrap(fn) instanceof DwFn)) {
          const name = node.fn.name || 'expression'
          throw new DwError(`${name} is ${describe(fn)}, not a function`)
        }
        return this.call(fn, args)
      }
      case 'lambda':
        return this.makeLambda(node, scope)
      case 'bin':
        return this.binary(node.op, this.eval(node.l, scope), this.eval(node.r, scope))
      case 'and':
        return bool(this.eval(node.l, scope), "'and'") ? bool(this.eval(node.r, scope), "'and'") : false
      case 'or':
        return bool(this.eval(node.l, scope), "'or'") ? true : bool(this.eval(node.r, scope), "'or'")
      case 'not':
        return !bool(this.eval(node.e, scope), "'not'")
      case 'neg': {
        const v = unwrap(this.eval(node.e, scope))
        if (typeof v === 'number') return -v
        if (v instanceof DwPeriod) return v.negate()
        throw new DwError(`Cannot negate ${describe(v)}`)
      }
      case 'default': {
        // A failed `as` coercion on the left falls back to the default, as in the engine; other errors still fail.
        let inner = node.l
        while (inner.t === 'paren') inner = inner.e
        let l
        if (inner.t === 'as') {
          try {
            l = this.eval(node.l, scope)
          } catch (e) {
            if (e instanceof DwError && /^Cannot coerce/.test(e.message)) return this.eval(node.r, scope)
            throw e
          }
        } else l = this.eval(node.l, scope)
        return unwrap(l) === null ? this.eval(node.r, scope) : l
      }
      case 'as': {
        const opts = node.opts ? this.options(node.opts, scope) : null
        return coerceTo(this.eval(node.e, scope), node.type, opts, this.aliases)
      }
      case 'is':
        return isType(this.eval(node.e, scope), node.type, this.aliases)
      case 'if':
        return bool(this.eval(node.c, scope), 'An if condition') ? this.eval(node.a, scope) : this.eval(node.b, scope)
      case 'range': {
        const from = this.eval(node.from, scope)
        const to = this.eval(node.to, scope)
        const a = num(from, 'to', from, to)
        const b = num(to, 'to', from, to)
        const out = []
        if (a <= b) for (let i = a; i <= b; i++) out.push(i)
        else for (let i = a; i >= b; i--) out.push(i)
        return out
      }
      case 'do': {
        const s = new Scope(scope)
        this.declare(node.decls, s)
        return this.eval(node.body, s)
      }
      case 'match':
        return this.match(node, scope)
      case 'update':
        return this.update(node, scope)
      default:
        throw new SimUnsupported(`the ${node.t} expression`)
    }
  }

  options(objNode, scope) {
    const o = this.eval(objNode, scope)
    const out = {}
    for (const e of entriesOf(o)) out[e.key] = unwrap(e.value)
    return out
  }

  fields(fields, scope) {
    const entries = []
    for (const f of fields) {
      if (f.cond && !bool(this.eval(f.cond, scope), 'A conditional field')) continue
      if (f.kind === 'spread') {
        const v = unwrap(this.eval(f.expr, scope))
        if (v === null) continue
        const items = Array.isArray(v) ? v : [v]
        for (const it of items) {
          const o = unwrap(it)
          if (o === null) continue
          if (!isPlainObject(o)) throw new DwError(`Cannot spread ${describe(o)} into an object; only Objects (or an Array of Objects) can be`)
          entries.push(...entriesOf(o))
        }
        continue
      }
      let name
      let attrs = null
      let ns = null
      if (f.key.expr) {
        const k = unwrap(this.eval(f.key.expr, scope))
        if (k instanceof DwKey) {
          name = k.name
          attrs = k.attrs
          ns = k.ns
        } else if (k === null) throw new DwError('Cannot use null as an object key')
        else name = coerceString(k, 'Key')
      } else {
        name = f.key.name
        if (f.key.ns) ns = { prefix: f.key.ns, uri: this.namespaces[f.key.ns] ?? '' }
      }
      if (f.key.attrs) {
        const a = this.fields(f.key.attrs, scope)
        attrs = a.length ? makeObject(a) : null
      }
      entries.push(entry(name, stored(this.eval(f.value, scope)), attrs, ns))
    }
    return entries
  }

  select(v, sel, scope) {
    switch (sel.kind) {
      case 'key':
        return selectKey(v, sel.name ?? keyName(this.eval(sel.expr, scope)))
      case 'multi':
        return selectMulti(v, sel.name ?? keyName(this.eval(sel.expr, scope)))
      case 'multiDyn':
        return selectMulti(v, keyName(this.eval(sel.expr, scope)))
      case 'desc': {
        const out = []
        descend(unwrap(v), sel.name ?? keyName(this.eval(sel.expr, scope)), out)
        return out.length ? out : null
      }
      case 'attrs':
        if (Array.isArray(unwrap(v))) return unwrap(v).map(attrsOf).filter((a) => a !== null)
        return attrsOf(v)
      case 'attr':
        if (Array.isArray(unwrap(v))) return unwrap(v).map((x) => attrValue(x, sel.name)).filter((a) => a !== null)
        return attrValue(v, sel.name)
      case 'meta': {
        const u = unwrap(v)
        if (sel.name === 'raw') return (u !== null && typeof u === 'object' ? this.rawOf?.get(u) : undefined) ?? u
        if (sel.name === 'mimeType' || sel.name === 'mediaType') return null
        if (sel.name === 'contentLength') return typeof u === 'string' ? u.length : null
        return null
      }
      case 'namespace':
        return null
      case 'index': {
        const idx = unwrap(this.eval(sel.expr, scope))
        if (typeof idx === 'number') return selectIndex(v, idx)
        if (idx === null) return null
        return selectKey(v, keyName(idx))
      }
      case 'range':
        return selectRange(v, num(this.eval(sel.from, scope), 'to'), num(this.eval(sel.to, scope), 'to'))
      case 'filter': {
        const u = unwrap(v)
        if (u === null) return null
        const fn = this.makeLambda(sel.cond, scope)
        const keep = (x, i) => unwrap(this.call(fn, [x, i])) === true
        if (Array.isArray(u)) return u.filter(keep)
        if (isPlainObject(u)) return makeObject(entriesOf(u).filter((e, i) => keep(e.value, i)))
        throw new DwError(`Cannot filter ${describe(u)} with [?( )]`)
      }
    }
    throw new SimUnsupported(`the ${sel.kind} selector`)
  }

  exists(node, scope) {
    if (node.t === 'sel' && node.sel.kind === 'key' && node.sel.name !== undefined) {
      const parent = unwrap(this.eval(node.target, scope))
      if (isPlainObject(parent)) return entriesOf(parent).some((e) => e.key === node.sel.name)
      if (Array.isArray(parent)) return parent.some((x) => isPlainObject(unwrap(x)) && entriesOf(unwrap(x)).some((e) => e.key === node.sel.name))
      return false
    }
    return unwrap(this.eval(node, scope)) !== null
  }

  binary(op, a, b) {
    const ua = unwrap(a)
    const ub = unwrap(b)
    switch (op) {
      case '==':
        return equals(ua, ub)
      case '!=':
        return !equals(ua, ub)
      case '~=':
        return similar(ua, ub)
      case '<':
        return compare(ua, ub) < 0
      case '>':
        return compare(ua, ub) > 0
      case '<=':
        return compare(ua, ub) <= 0
      case '>=':
        return compare(ua, ub) >= 0
      case '+':
        return plus(ua, ub)
      case '-':
        return minus(ua, ub)
      case '*':
        return decimalOp('*', num(ua, '*', ua, ub), num(ub, '*', ua, ub))
      case '/': {
        const d = num(ub, '/', ua, ub)
        if (d === 0) throw new DwError('Division by zero')
        return fixNumber(num(ua, '/', ua, ub) / d)
      }
      case '++':
        return concat(ua, ub)
      case '--':
        return removeAll(ua, ub)
      case '>>':
        if (ua instanceof DwTemporal && (typeof ub === 'string' || ub instanceof DwTimeZone)) {
          // The engine keeps only the offset: it prints 2026-01-01T04:00:00-06:00 and .timezone gives "-06:00".
          const r = ua.inZone(String(ub))
          return r.with(r.kind, { zone: null })
        }
        if (Array.isArray(ub)) return [stored(ua), ...ub]
        throw opError('>>', ua, ub)
      case '<<':
        if (Array.isArray(ua)) return [...ua, stored(ub)]
        throw opError('<<', ua, ub)
    }
    throw new SimUnsupported(`the ${op} operator`)
  }

  match(node, scope) {
    const v = this.eval(node.e, scope)
    const u = unwrap(v)
    for (const c of node.cases) {
      const s = new Scope(scope)
      if (c.kind === 'else') return this.eval(c.body, s)
      let ok = false
      switch (c.kind) {
        case 'any':
          ok = true
          break
        case 'type':
          ok = isType(u, c.type, this.aliases)
          break
        case 'value':
          ok = equals(u, this.eval(c.value, scope))
          break
        case 'regex': {
          if (typeof u !== 'string' && !(u instanceof DwKey)) break
          const re = unwrap(this.eval(c.re, scope))
          const m = new RegExp(`^(?:${re.source})$`, re.flags.replace('g', '')).exec(String(u))
          if (m) {
            ok = true
            if (c.bind) s.define(c.bind, Array.from(m, (x) => x ?? null))
          }
          break
        }
      }
      if (!ok) continue
      if (c.bind && c.kind !== 'regex') s.define(c.bind, v)
      if (c.guard && !bool(this.eval(c.guard, s), 'A case guard')) continue
      return this.eval(c.body, s)
    }
    throw new DwError(`No case matched ${describe(u)}`)
  }

  update(node, scope) {
    let v = unwrap(this.eval(node.e, scope))
    for (const c of node.cases) v = this.updateAt(v, c, 0, scope)
    return v
  }

  updateAt(cur, c, i, scope) {
    if (i === c.path.length) {
      const s = new Scope(scope)
      if (c.bind) s.define(c.bind, cur)
      if (c.guard && !bool(this.eval(c.guard, s), 'An update guard')) return cur
      return stored(this.eval(c.body, s))
    }
    const seg = c.path[i]
    const u = unwrap(cur)
    if (seg.key !== undefined) {
      if (Array.isArray(u)) return u.map((x) => this.updateAt(x, c, i, scope))
      if (!isPlainObject(u) && !(u === null && c.upsert)) return cur
      const es = u === null ? [] : entriesOf(u)
      const at = es.findIndex((e) => e.key === seg.key)
      if (at < 0) return c.upsert ? makeObject([...es, entry(seg.key, this.updateAt(null, c, i + 1, scope))]) : cur
      return makeObject(es.map((e, j) => (j === at ? { ...e, value: this.updateAt(e.value, c, i + 1, scope) } : e)))
    }
    if (seg.index !== undefined) {
      const idx = unwrap(this.eval(seg.index, scope))
      if (!Array.isArray(u)) return cur
      const k = idx < 0 ? u.length + idx : idx
      if (k < 0 || k >= u.length) return cur
      return u.map((x, j) => (j === k ? this.updateAt(x, c, i + 1, scope) : x))
    }
    throw new SimUnsupported('this update path')
  }
}

function importError(err) {
  if (!err) return null
  const e = importValue(err)
  const et = isPlainObject(e) ? entriesOf(e).find((x) => x.key === 'errorType') : null
  if (et && isPlainObject(et.value) && et.value[AS_STRING] === undefined) {
    const t = et.value
    const ns = entriesOf(t).find((x) => x.key === 'namespace')?.value
    const id = entriesOf(t).find((x) => x.key === 'identifier')?.value
    Object.defineProperty(t, AS_STRING, { value: `${ns ?? 'MULE'}:${id ?? 'UNKNOWN'}`, enumerable: false })
  }
  return e
}

function keyName(k) {
  k = unwrap(k)
  if (k instanceof DwKey) return k.name
  if (typeof k === 'string') return k
  if (canCoerceString(k)) return coerceString(k)
  throw new DwError(`Cannot use ${describe(k)} as a key`)
}

function withAttrs(e) {
  return e.attrs ? new DwAttr(e.value, e.attrs) : e.value
}

function invalidSelector(u, name) {
  return new DwError(`Invalid selector '${name}' on ${describe(u)}: only Objects and Arrays of Objects have keys`)
}

export function selectKey(v, name) {
  const u = unwrap(v)
  if (u === null || u === undefined) return null
  if (isPlainObject(u)) {
    const e = entriesOf(u).find((x) => x.key === name)
    return e ? withAttrs(e) : null
  }
  if (Array.isArray(u)) {
    const out = []
    for (const x of u) {
      const o = unwrap(x)
      if (isPlainObject(o)) {
        const e = entriesOf(o).find((y) => y.key === name)
        if (e) out.push(withAttrs(e))
      } else if (Array.isArray(o)) {
        const inner = selectKey(o, name)
        if (Array.isArray(inner) && inner.length) out.push(inner)
      }
    }
    // As in the engine: when no element has the key (or the array is empty) the result is null, not [].
    return out.length ? out : null
  }
  if (u instanceof DwTemporal || u instanceof DwPeriod) return u.field(name)
  throw invalidSelector(u, name)
}

function selectMulti(v, name) {
  const u = unwrap(v)
  if (u === null || u === undefined) return null
  if (isPlainObject(u)) {
    const out = entriesOf(u).filter((e) => e.key === name).map(withAttrs)
    return out.length ? out : null
  }
  if (Array.isArray(u)) {
    const out = []
    for (const x of u) {
      const r = selectMulti(x, name)
      if (Array.isArray(r)) out.push(...r)
    }
    return out.length ? out : null
  }
  throw invalidSelector(u, name)
}

function descend(u, name, out) {
  if (Array.isArray(u)) {
    for (const x of u) descend(unwrap(x), name, out)
  } else if (isPlainObject(u)) {
    for (const e of entriesOf(u)) {
      if (e.key === name) out.push(withAttrs(e))
      descend(unwrap(e.value), name, out)
    }
  }
}

function attrsOf(v) {
  if (v instanceof DwAttr || v instanceof DwKey) return v.attrs
  return null
}

function attrValue(v, name) {
  const a = attrsOf(v)
  if (a === null) return null
  const e = entriesOf(a).find((x) => x.key === name)
  return e ? e.value : null
}

function selectIndex(v, i) {
  const u = unwrap(v)
  if (u === null) return null
  let seq
  if (Array.isArray(u)) seq = u
  else if (typeof u === 'string') seq = [...u]
  else if (isPlainObject(u)) seq = entriesOf(u).map(withAttrs)
  else if (u instanceof DwKey) seq = [...u.name]
  else throw new DwError(`Cannot index ${describe(u)} with [${i}]`)
  const k = i < 0 ? seq.length + i : i
  return k >= 0 && k < seq.length ? seq[k] ?? null : null
}

function selectRange(v, a, b) {
  const u = unwrap(v)
  if (u === null) return null
  const isStr = typeof u === 'string'
  const seq = isStr ? [...u] : Array.isArray(u) ? u : null
  if (!seq) throw new DwError(`Cannot select a range of ${describe(u)}`)
  const n = seq.length
  const from = a < 0 ? n + a : a
  const to = b < 0 ? n + b : b
  // The engine gives null when either end is outside the value; it does not clip the range.
  if (from < 0 || to < 0 || from >= n || to >= n) return null
  const out = from <= to ? seq.slice(from, to + 1) : seq.slice(to, from + 1).reverse()
  return isStr ? out.join('') : out
}

function plus(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return decimalOp('+', a, b)
  if (a instanceof DwTemporal && b instanceof DwPeriod) return addPeriod(a, b, 1)
  if (a instanceof DwPeriod && b instanceof DwTemporal) return addPeriod(b, a, 1)
  if (a instanceof DwPeriod && b instanceof DwPeriod) return new DwPeriod(a.y + b.y, a.m + b.m, a.d + b.d, a.secs + b.secs)
  if (a instanceof DwTemporal && b instanceof DwTemporal) return joinDateTime(a, b, '+')
  if (Array.isArray(a)) return [...a, stored(b)]
  if ((typeof a === 'number' || isNumericText(a)) && (typeof b === 'number' || isNumericText(b))) return decimalOp('+', Number(a), Number(b))
  throw opError('+', a, b)
}

function minus(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return decimalOp('-', a, b)
  if (a instanceof DwTemporal && b instanceof DwPeriod) return addPeriod(a, b, -1)
  if (a instanceof DwTemporal && b instanceof DwTemporal) return diffTemporal(a, b)
  if (a instanceof DwPeriod && b instanceof DwPeriod) return new DwPeriod(a.y - b.y, a.m - b.m, a.d - b.d, a.secs - b.secs)
  if (Array.isArray(a)) {
    const i = a.findIndex((x) => equals(x, b))
    return i < 0 ? a : [...a.slice(0, i), ...a.slice(i + 1)]
  }
  if (isPlainObject(a) && (typeof b === 'string' || b instanceof DwKey)) {
    const k = b instanceof DwKey ? b.name : b
    return makeObject(entriesOf(a).filter((e) => e.key !== k))
  }
  if ((typeof a === 'number' || isNumericText(a)) && (typeof b === 'number' || isNumericText(b))) return decimalOp('-', Number(a), Number(b))
  throw opError('-', a, b)
}

function joinDateTime(a, b, op) {
  if (a.kind === 'Date' && (b.kind === 'LocalTime' || b.kind === 'Time')) {
    return new DwTemporal(b.kind === 'Time' ? 'DateTime' : 'LocalDateTime', { y: a.y, mo: a.mo, d: a.d, h: b.h, mi: b.mi, s: b.s, ns: b.ns, off: b.off })
  }
  if (b.kind === 'Date' && (a.kind === 'LocalTime' || a.kind === 'Time')) return joinDateTime(b, a, op)
  throw opError(op, a, b)
}

function concat(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) return [...a, ...b]
  if (isPlainObject(a) && isPlainObject(b) && a[AS_STRING] === undefined && b[AS_STRING] === undefined) return makeObject([...entriesOf(a), ...entriesOf(b)])
  if (a instanceof DwTemporal && b instanceof DwTemporal) return joinDateTime(a, b, '++')
  if (a instanceof DwTemporal && b instanceof DwTimeZone && (a.kind === 'LocalDateTime' || a.kind === 'LocalTime')) {
    const off = zoneOffset(b.zone, a.localMillis())
    return a.with(a.kind === 'LocalTime' ? 'Time' : 'DateTime', { off, zone: /^[+-Z]/.test(b.zone) ? null : b.zone })
  }
  if (a !== null && b !== null && canCoerceString(a) && canCoerceString(b) && !Array.isArray(a) && !Array.isArray(b)) return coerceString(a) + coerceString(b)
  throw opError('++', a, b)
}

function removeAll(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) return a.filter((x) => !b.some((y) => equals(x, y)))
  if (isPlainObject(a)) {
    let keys
    if (isPlainObject(b)) keys = entriesOf(b).map((e) => e.key)
    else if (Array.isArray(b)) keys = b.map((k) => keyName(k))
    else throw opError('--', a, b)
    return makeObject(entriesOf(a).filter((e) => !keys.includes(e.key)))
  }
  throw opError('--', a, b)
}

export function runAst(ast, ctx) {
  const rt = new Runtime(ctx)
  const root = rt.rootScope()
  // `input payload application/csv separator=";"` tells how to read an input that is still raw text.
  for (const inp of ast.header.inputs || []) {
    if (!root.vars.has(inp.name)) continue
    const raw = root.vars.get(inp.name)
    root.define(inp.name, new Lazy(() => {
      const v = raw instanceof Lazy ? raw.get() : raw
      const u = unwrap(v)
      return typeof u === 'string' || u instanceof DwBinary ? readValue(u, inp.mime, inp.options) : v
    }))
  }
  const scope = new Scope(root)
  rt.declare(ast.header.decls, scope)
  return rt.eval(ast.body, scope)
}

