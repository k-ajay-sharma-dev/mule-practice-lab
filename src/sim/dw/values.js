// The DataWeave value model used by the evaluator.
//
// Plain JS values stand for most DataWeave values: string, number, boolean, null, array, and a plain object.
// A DataWeave object can repeat a key and carry XML attributes or a namespace on a key, which a plain object cannot,
// so such objects keep their full entry list under the hidden META symbol; the visible properties hold the first value
// of each key, which is also what a `.key` selector returns.
import { DwError } from '../errors.js'
import { DwTemporal, DwPeriod, DwTimeZone } from './dates.js'

export const META = Symbol('dw.entries')
// A plain object that should print as a fixed string when coerced, such as error.errorType.
export const AS_STRING = Symbol('dw.asString')

export class DwKey {
  constructor(name, attrs = null, ns = null) {
    this.name = name
    this.attrs = attrs
    this.ns = ns
  }
  toString() {
    return this.name
  }
}

// A value selected from an entry that has XML attributes, so that `.@attr` still works on it.
export class DwAttr {
  constructor(value, attrs) {
    this.value = value
    this.attrs = attrs
  }
}

export class DwBinary {
  constructor(bytes) {
    this.bytes = bytes
  }
  toJSON() {
    return bytesToBase64(this.bytes)
  }
}

// A callable: a lambda, a fun declaration or a built-in. params: [{ name, hasDefault }].
// getDefault(i) evaluates the default of parameter i (reduce uses it for its accumulator).
export class DwFn {
  constructor(name, params, impl, getDefault = null) {
    this.name = name
    this.params = params
    this.impl = impl
    this.getDefault = getDefault
  }
  call(args) {
    return this.impl(args)
  }
}

export class DwNamespace {
  constructor(prefix, uri) {
    this.prefix = prefix
    this.uri = uri
  }
}

const INDEX_KEY = /^(0|[1-9]\d*)$/

export function isPlainObject(v) {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return false
  const proto = Object.getPrototypeOf(v)
  return proto === Object.prototype || proto === null
}

export function entry(key, value, attrs = null, ns = null) {
  return { key, value, attrs, ns }
}

function setProp(o, k, v) {
  if (k === '__proto__') Object.defineProperty(o, k, { value: v, enumerable: true, writable: true, configurable: true })
  else o[k] = v
}

export function makeObject(entries) {
  const o = {}
  let special = false
  for (const e of entries) {
    if (Object.prototype.hasOwnProperty.call(o, e.key)) special = true
    else setProp(o, e.key, e.value)
    if (e.attrs || e.ns || INDEX_KEY.test(e.key)) special = true
  }
  if (special) Object.defineProperty(o, META, { value: entries, enumerable: false })
  return o
}

export function entriesOf(o) {
  if (o[META]) return o[META]
  return Object.keys(o).map((k) => ({ key: k, value: o[k], attrs: null, ns: null }))
}

export function unwrap(v) {
  return v instanceof DwAttr ? v.value : v
}

export function isObject(v) {
  return isPlainObject(unwrap(v))
}

// Deep-convert outside values (ctx, parsed inputs) into the model: JS Date → DateTime, bytes → Binary,
// an object with its own toString function → an object that prints as that string.
export function importValue(v) {
  if (v === undefined) return null
  if (v === null || typeof v !== 'object') {
    if (typeof v === 'bigint') return Number(v)
    return v
  }
  if (v instanceof Date) return DwTemporal.fromEpochMillis(v.getTime(), 0)
  if (v instanceof Uint8Array) return new DwBinary(v)
  if (v instanceof ArrayBuffer) return new DwBinary(new Uint8Array(v))
  if (Array.isArray(v)) {
    let changed = false
    const out = v.map((x) => {
      const y = importValue(x)
      if (y !== x) changed = true
      return y
    })
    return changed ? out : v
  }
  if (!isPlainObject(v)) return v
  if (v[META]) return v
  const hasOwnToString = Object.prototype.hasOwnProperty.call(v, 'toString') && typeof v.toString === 'function'
  let changed = hasOwnToString
  const entries = []
  for (const k of Object.keys(v)) {
    if (hasOwnToString && k === 'toString') continue
    const x = v[k]
    if (typeof x === 'function') {
      changed = true
      continue
    }
    const y = importValue(x)
    if (y !== x) changed = true
    entries.push(entry(k, y))
  }
  if (!changed) return v
  const o = makeObject(entries)
  if (hasOwnToString) Object.defineProperty(o, AS_STRING, { value: String(v.toString()), enumerable: false })
  return o
}

// Convert a result for the outside world: keys become strings, attribute wrappers are dropped.
export function exportValue(v) {
  if (v instanceof DwAttr) return exportValue(v.value)
  if (v instanceof DwKey) return v.name
  if (Array.isArray(v)) return v.map(exportValue)
  if (isPlainObject(v)) {
    const es = entriesOf(v)
    if (!v[META] && es.every((e) => !needsExport(e.value))) return v
    const out = makeObject(es.map((e) => ({ ...e, value: exportValue(e.value) })))
    if (v[AS_STRING]) Object.defineProperty(out, AS_STRING, { value: v[AS_STRING], enumerable: false })
    return out
  }
  return v
}

function needsExport(v) {
  if (v instanceof DwAttr || v instanceof DwKey) return true
  if (Array.isArray(v)) return v.some(needsExport)
  if (isPlainObject(v)) return !!v[META] || entriesOf(v).some((e) => needsExport(e.value))
  return false
}

export function typeOf(v) {
  v = unwrap(v)
  if (v === null || v === undefined) return 'Null'
  switch (typeof v) {
    case 'string':
      return 'String'
    case 'number':
      return 'Number'
    case 'boolean':
      return 'Boolean'
    case 'function':
      return 'Function'
  }
  if (Array.isArray(v)) return 'Array'
  if (v instanceof DwTemporal) return v.kind
  if (v instanceof DwPeriod) return 'Period'
  if (v instanceof DwTimeZone) return 'TimeZone'
  if (v instanceof DwBinary) return 'Binary'
  if (v instanceof DwKey) return 'Key'
  if (v instanceof RegExp) return 'Regex'
  if (v instanceof DwNamespace) return 'Namespace'
  if (v instanceof DwFn) return 'Function'
  if (isPlainObject(v)) return 'Object'
  return 'Any'
}

// How DataWeave describes a value in an error message: "String (abc)".
export function describe(v) {
  v = unwrap(v)
  const t = typeOf(v)
  if (t === 'Null') return 'Null (null)'
  if (t === 'String') return `String ("${v.length > 40 ? v.slice(0, 40) + '...' : v}")`
  if (t === 'Number' || t === 'Boolean') return `${t} (${v})`
  if (t === 'Key') return `Key (${v.name})`
  return t
}

// Arithmetic on JS doubles, trimmed so that 0.1 + 0.2 prints 0.3 as DataWeave's decimals do.
export function fixNumber(n) {
  if (!Number.isFinite(n) || Number.isInteger(n)) return n
  return parseFloat(n.toPrecision(15))
}

function decimals(n) {
  const s = String(n)
  const e = s.indexOf('e')
  if (e >= 0) return Math.max(0, (s.slice(0, e).split('.')[1] || '').length - Number(s.slice(e + 1)))
  return (s.split('.')[1] || '').length
}

// Decimal arithmetic for + - *: the result has no more decimals than the operands allow, so 75.01 - 75 is 0.01.
export function decimalOp(op, a, b) {
  const r = op === '+' ? a + b : op === '-' ? a - b : a * b
  if (!Number.isFinite(r) || Number.isInteger(r)) return r
  const d = op === '*' ? decimals(a) + decimals(b) : Math.max(decimals(a), decimals(b))
  return d <= 20 ? Number(r.toFixed(d)) : fixNumber(r)
}

export function numberToString(n) {
  if (Object.is(n, -0)) return '0'
  if (Number.isInteger(n) && Math.abs(n) < 1e21) return String(n)
  const s = String(n)
  if (!/e/i.test(s)) return s
  const [m, e] = s.split('e')
  return m.replace(/\.?$/, '') + 'E' + (e.startsWith('-') ? e : e.replace('+', ''))
}

// The implicit String coercion DataWeave applies to ++, interpolation and string functions.
export function coerceString(v, what = 'String') {
  v = unwrap(v)
  if (typeof v === 'string') return v
  if (typeof v === 'number') return numberToString(v)
  if (typeof v === 'boolean') return String(v)
  if (v instanceof DwKey) return v.name
  if (v instanceof DwTemporal || v instanceof DwPeriod || v instanceof DwTimeZone) return v.toString()
  if (v instanceof RegExp) return v.source
  if (v instanceof DwBinary) return new TextDecoder().decode(v.bytes)
  if (isPlainObject(v) && v[AS_STRING] !== undefined) return v[AS_STRING]
  throw new DwError(`Cannot coerce ${describe(v)} to ${what}`)
}

export function canCoerceString(v) {
  v = unwrap(v)
  return (
    typeof v === 'string' ||
    typeof v === 'number' ||
    typeof v === 'boolean' ||
    v instanceof DwKey ||
    v instanceof DwTemporal ||
    v instanceof DwPeriod ||
    v instanceof DwTimeZone ||
    (isPlainObject(v) && v[AS_STRING] !== undefined)
  )
}

const NUMBER_TEXT = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/

export function coerceNumber(v) {
  v = unwrap(v)
  if (typeof v === 'number') return v
  if (v instanceof DwKey) v = v.name
  if (typeof v === 'string' && NUMBER_TEXT.test(v.trim())) return Number(v.trim())
  throw new DwError(`Cannot coerce ${describe(v)} to Number`)
}

export function isNumericText(s) {
  return typeof s === 'string' && NUMBER_TEXT.test(s.trim())
}

export function equals(a, b) {
  a = unwrap(a)
  b = unwrap(b)
  if (a instanceof DwKey) a = a.name
  if (b instanceof DwKey) b = b.name
  if (a === b) return true
  if (a === null || b === null || a === undefined || b === undefined) return false
  if (typeof a !== 'object' || typeof b !== 'object') return false
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false
    return a.every((x, i) => equals(x, b[i]))
  }
  if (a instanceof DwTemporal && b instanceof DwTemporal) return a.kind === b.kind && a.compareTo(b) === 0
  if (a instanceof DwPeriod && b instanceof DwPeriod) return a.toString() === b.toString()
  if (a instanceof DwBinary && b instanceof DwBinary)
    return a.bytes.length === b.bytes.length && a.bytes.every((x, i) => x === b.bytes[i])
  if (a instanceof RegExp && b instanceof RegExp) return a.source === b.source
  if (isPlainObject(a) && isPlainObject(b)) {
    const ea = entriesOf(a)
    const eb = entriesOf(b)
    if (ea.length !== eb.length) return false
    // DataWeave compares objects without regard to key order.
    const used = new Set()
    for (const x of ea) {
      const i = eb.findIndex((y, j) => !used.has(j) && y.key === x.key && equals(x.value, y.value))
      if (i < 0) return false
      used.add(i)
    }
    return true
  }
  return false
}

// The ~= operator: equal after coercing one side to the other's type.
export function similar(a, b) {
  if (equals(a, b)) return true
  a = unwrap(a)
  b = unwrap(b)
  try {
    if (typeof a === 'number' || typeof b === 'number') return coerceNumber(a) === coerceNumber(b)
    if (canCoerceString(a) && canCoerceString(b)) return coerceString(a) === coerceString(b)
  } catch {
    return false
  }
  return false
}

export function compare(a, b) {
  a = unwrap(a)
  b = unwrap(b)
  if (a instanceof DwKey) a = a.name
  if (b instanceof DwKey) b = b.name
  if (typeof a === 'number' && typeof b === 'number') return a < b ? -1 : a > b ? 1 : 0
  if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b)
  if (a instanceof DwTemporal && b instanceof DwTemporal) return a.compareTo(b)
  if (a instanceof DwPeriod && b instanceof DwPeriod) return Math.sign(a.totalSeconds() - b.totalSeconds())
  if (typeof a === 'number' && isNumericText(b)) return compare(a, Number(b))
  if (typeof b === 'number' && isNumericText(a)) return compare(Number(a), b)
  if (a instanceof DwTemporal && typeof b === 'string') return a.compareTo(DwTemporal.parseAs(b, a.kind))
  if (b instanceof DwTemporal && typeof a === 'string') return DwTemporal.parseAs(a, b.kind).compareTo(b)
  throw new DwError(`Cannot compare ${describe(a)} with ${describe(b)}`)
}

// Sort comparison for orderBy/max/min: mixed types order by type name so sorting never throws.
export function sortCompare(a, b) {
  a = unwrap(a)
  b = unwrap(b)
  const ta = typeOf(a)
  const tb = typeOf(b)
  if (ta === 'Null' && tb === 'Null') return 0
  if (ta === 'Null') return -1
  if (tb === 'Null') return 1
  try {
    return compare(a, b)
  } catch {
    return ta < tb ? -1 : ta > tb ? 1 : 0
  }
}

export function isEmptyValue(v) {
  v = unwrap(v)
  if (v === null || v === undefined) return true
  if (typeof v === 'string') return v.length === 0
  if (Array.isArray(v)) return v.length === 0
  if (isPlainObject(v)) return entriesOf(v).length === 0
  return false
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

export function bytesToBase64(bytes) {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0)
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63]
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63] : '='
    out += i + 2 < bytes.length ? B64[n & 63] : '='
  }
  return out
}

export function base64ToBytes(s) {
  const clean = s.replace(/[\s=]/g, '').replace(/-/g, '+').replace(/_/g, '/')
  const out = []
  let buf = 0
  let bits = 0
  for (const ch of clean) {
    const v = B64.indexOf(ch)
    if (v < 0) throw new DwError(`Invalid Base64 character '${ch}'`)
    buf = (buf << 6) | v
    bits += 6
    if (bits >= 8) {
      bits -= 8
      out.push((buf >> bits) & 255)
    }
  }
  return new Uint8Array(out)
}

export function utf8(s) {
  return new TextEncoder().encode(s)
}
