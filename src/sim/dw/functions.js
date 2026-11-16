// Built-in functions: dw::Core (always in scope) and the modules a script can import.
// Each entry is fn(rt, ...args); rt gives access to the run (ctx, now(), uuid(), calling lambdas).
import { DwError, SimUnsupported } from '../errors.js'
import { DwTemporal, DwPeriod, diffTemporal, convertTemporal } from './dates.js'
import {
  DwKey, DwBinary, DwFn, makeObject, entriesOf, entry, isPlainObject, unwrap, typeOf, describe, coerceString,
  coerceNumber, equals, compare, sortCompare, isEmptyValue, fixNumber, decimalOp, bytesToBase64, base64ToBytes, utf8,
} from './values.js'
import { readValue, render } from './formats.js'
import { hash, hmac, toHex } from './crypto.js'

function fail(name, args) {
  const shown = args.map((a, i) => `${i + 1}: ${describe(a)}`).join(', ')
  throw new DwError(`You called the function '${name}' with these arguments: ${shown}`)
}

function str(v, name, args) {
  v = unwrap(v)
  if (typeof v === 'string') return v
  if (v instanceof DwKey) return v.name
  if (typeof v === 'number' || typeof v === 'boolean' || v instanceof DwTemporal) return coerceString(v)
  return fail(name, args)
}

function bool(v, name) {
  v = unwrap(v)
  if (typeof v === 'boolean') return v
  throw new DwError(`The function passed to '${name}' must return a Boolean, but returned ${describe(v)}`)
}

function regexOf(v, global = true) {
  const flags = v.flags.includes('g') || !global ? v.flags : v.flags + 'g'
  return new RegExp(v.source, flags)
}

// Java replacement strings use $1 like JS, but \$ for a literal dollar.
function javaReplacement(s) {
  return s.replace(/\\\$/g, '$$$$')
}

function matchArray(m) {
  return Array.from(m, (x) => (x === undefined ? null : x))
}

function keyOf(e) {
  return new DwKey(e.key, e.attrs, e.ns)
}

function objOrFail(v, name, args) {
  if (!isPlainObject(v)) fail(name, args)
  return v
}

function arrOrFail(v, name, args) {
  if (!Array.isArray(v)) fail(name, args)
  return v
}

const mathRound = (n) => Math.sign(n) * Math.round(Math.abs(n))

function splitmix(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x9e3779b9) | 0
    let t = a ^ (a >>> 16)
    t = Math.imul(t, 0x21f0aaad)
    t ^= t >>> 15
    t = Math.imul(t, 0x735a2d97)
    t ^= t >>> 15
    return (t >>> 0) / 4294967296
  }
}

function groupKey(v) {
  v = unwrap(v)
  if (v === null) return 'null'
  return coerceString(v)
}

export const CORE = {
  sizeOf(rt, v) {
    v = unwrap(v)
    if (v === null) return 0
    if (typeof v === 'string' || Array.isArray(v)) return v.length
    if (isPlainObject(v)) return entriesOf(v).length
    if (v instanceof DwBinary) return v.bytes.length
    return fail('sizeOf', [v])
  },
  isEmpty: (rt, v) => isEmptyValue(v),
  isBlank(rt, v) {
    v = unwrap(v)
    if (v === null) return true
    return str(v, 'isBlank', [v]).trim() === ''
  },
  map(rt, a, fn) {
    if (a === null) return null
    if (typeof a === 'string') a = [...a]
    return arrOrFail(a, 'map', [a, fn]).map((x, i) => rt.call(fn, [x, i]))
  },
  mapObject(rt, o, fn) {
    if (o === null) return null
    const out = []
    entriesOf(objOrFail(o, 'mapObject', [o, fn])).forEach((e, i) => {
      const r = unwrap(rt.call(fn, [e.value, keyOf(e), i]))
      if (r === null) return
      if (!isPlainObject(r)) throw new DwError(`The function passed to 'mapObject' must return an Object, but returned ${describe(r)}`)
      out.push(...entriesOf(r))
    })
    return makeObject(out)
  },
  filter(rt, a, fn) {
    if (a === null) return null
    if (typeof a === 'string') return [...a].filter((c, i) => bool(rt.call(fn, [c, i]), 'filter')).join('')
    if (isPlainObject(a)) return CORE.filterObject(rt, a, fn)
    return arrOrFail(a, 'filter', [a, fn]).filter((x, i) => bool(rt.call(fn, [x, i]), 'filter'))
  },
  filterObject(rt, o, fn) {
    if (o === null) return null
    return makeObject(entriesOf(objOrFail(o, 'filterObject', [o, fn])).filter((e, i) => bool(rt.call(fn, [e.value, keyOf(e), i]), 'filterObject')))
  },
  pluck(rt, o, fn) {
    if (o === null) return null
    return entriesOf(objOrFail(o, 'pluck', [o, fn])).map((e, i) => rt.call(fn, [e.value, keyOf(e), i]))
  },
  reduce(rt, a, fn) {
    if (a === null) return null
    if (typeof a === 'string') a = [...a]
    arrOrFail(a, 'reduce', [a, fn])
    let acc
    let start = 0
    const def = fn instanceof DwFn && fn.getDefault ? fn.getDefault(1) : undefined
    if (def !== undefined) acc = def
    else {
      if (!a.length) return null
      acc = a[0]
      start = 1
    }
    for (let i = start; i < a.length; i++) acc = rt.call(fn, [a[i], acc])
    return acc
  },
  flatMap(rt, a, fn) {
    if (a === null) return null
    return CORE.flatten(rt, CORE.map(rt, a, fn))
  },
  flatten(rt, a) {
    if (a === null) return null
    const out = []
    for (const x of arrOrFail(a, 'flatten', [a])) {
      const y = unwrap(x)
      if (Array.isArray(y)) out.push(...y)
      else out.push(x)
    }
    return out
  },
  groupBy(rt, a, fn) {
    if (a === null) return null
    const groups = new Map()
    if (isPlainObject(a)) {
      entriesOf(a).forEach((e, i) => {
        const k = groupKey(rt.call(fn, [e.value, keyOf(e), i]))
        if (!groups.has(k)) groups.set(k, [])
        groups.get(k).push(e)
      })
      return makeObject([...groups].map(([k, es]) => entry(k, makeObject(es))))
    }
    if (typeof a === 'string') a = [...a]
    arrOrFail(a, 'groupBy', [a, fn]).forEach((x, i) => {
      const k = groupKey(rt.call(fn, [x, i]))
      if (!groups.has(k)) groups.set(k, [])
      groups.get(k).push(x)
    })
    return makeObject([...groups].map(([k, xs]) => entry(k, xs)))
  },
  orderBy(rt, a, fn) {
    if (a === null) return null
    if (isPlainObject(a)) {
      const es = entriesOf(a).map((e, i) => ({ e, k: rt.call(fn, [e.value, keyOf(e), i]) }))
      es.sort((x, y) => sortCompare(x.k, y.k))
      return makeObject(es.map((x) => x.e))
    }
    const items = arrOrFail(a, 'orderBy', [a, fn]).map((x, i) => ({ x, k: rt.call(fn, [x, i]) }))
    items.sort((p, q) => sortCompare(p.k, q.k))
    return items.map((p) => p.x)
  },
  distinctBy(rt, a, fn) {
    if (a === null) return null
    const seen = []
    if (isPlainObject(a)) {
      return makeObject(
        entriesOf(a).filter((e, i) => {
          const k = rt.call(fn, [e.value, keyOf(e), i])
          if (seen.some((s) => equals(s, k))) return false
          seen.push(k)
          return true
        }),
      )
    }
    return arrOrFail(a, 'distinctBy', [a, fn]).filter((x, i) => {
      const k = rt.call(fn, [x, i])
      if (seen.some((s) => equals(s, k))) return false
      seen.push(k)
      return true
    })
  },
  sum(rt, a) {
    if (a === null) return fail('sum', [a])
    return arrOrFail(a, 'sum', [a]).reduce((s, x) => decimalOp('+', s, coerceNumber(x)), 0)
  },
  avg(rt, a) {
    arrOrFail(a, 'avg', [a])
    if (!a.length) throw new DwError('avg of an empty array')
    return fixNumber(a.reduce((s, x) => s + coerceNumber(x), 0) / a.length)
  },
  max(rt, a) {
    if (a === null) return null
    arrOrFail(a, 'max', [a])
    return a.length ? a.reduce((m, x) => (compare(x, m) > 0 ? x : m)) : null
  },
  min(rt, a) {
    if (a === null) return null
    arrOrFail(a, 'min', [a])
    return a.length ? a.reduce((m, x) => (compare(x, m) < 0 ? x : m)) : null
  },
  maxBy(rt, a, fn) {
    if (a === null) return null
    arrOrFail(a, 'maxBy', [a, fn])
    if (!a.length) return null
    let best = a[0]
    let bk = rt.call(fn, [best])
    for (const x of a.slice(1)) {
      const k = rt.call(fn, [x])
      if (compare(k, bk) > 0) [best, bk] = [x, k]
    }
    return best
  },
  minBy(rt, a, fn) {
    if (a === null) return null
    arrOrFail(a, 'minBy', [a, fn])
    if (!a.length) return null
    let best = a[0]
    let bk = rt.call(fn, [best])
    for (const x of a.slice(1)) {
      const k = rt.call(fn, [x])
      if (compare(k, bk) < 0) [best, bk] = [x, k]
    }
    return best
  },
  abs: (rt, n) => Math.abs(coerceNumber(n)),
  ceil: (rt, n) => Math.ceil(coerceNumber(n)),
  floor: (rt, n) => Math.floor(coerceNumber(n)),
  round: (rt, n) => mathRound(coerceNumber(n)),
  sqrt: (rt, n) => fixNumber(Math.sqrt(coerceNumber(n))),
  pow: (rt, a, b) => fixNumber(Math.pow(coerceNumber(a), coerceNumber(b))),
  mod(rt, a, b) {
    const d = coerceNumber(b)
    if (d === 0) throw new DwError('Division by zero')
    return fixNumber(coerceNumber(a) % d)
  },
  isEven: (rt, n) => coerceNumber(n) % 2 === 0,
  isOdd: (rt, n) => Math.abs(coerceNumber(n) % 2) === 1,
  isInteger: (rt, n) => Number.isInteger(coerceNumber(n)),
  isDecimal: (rt, n) => !Number.isInteger(coerceNumber(n)),
  isLeapYear(rt, d) {
    const y = d instanceof DwTemporal ? d.y : coerceNumber(d)
    return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
  },
  contains(rt, a, x) {
    if (a === null) return false
    if (Array.isArray(a)) return a.some((y) => equals(y, x))
    const s = str(a, 'contains', [a, x])
    if (x instanceof RegExp) return regexOf(x, false).test(s)
    return s.includes(str(x, 'contains', [a, x]))
  },
  startsWith(rt, s, x) {
    if (s === null) return false
    return str(s, 'startsWith', [s, x]).startsWith(str(x, 'startsWith', [s, x]))
  },
  endsWith(rt, s, x) {
    if (s === null) return false
    return str(s, 'endsWith', [s, x]).endsWith(str(x, 'endsWith', [s, x]))
  },
  upper: (rt, s) => (s === null ? null : str(s, 'upper', [s]).toUpperCase()),
  lower: (rt, s) => (s === null ? null : str(s, 'lower', [s]).toLowerCase()),
  trim: (rt, s) => (s === null ? null : str(s, 'trim', [s]).trim()),
  replace(rt, s, m, r) {
    if (s === null) return null
    const text = str(s, 'replace', [s, m, r])
    if (r === undefined) throw new DwError("'replace' needs 'with': text replace matcher with replacement")
    if (m instanceof RegExp) {
      const re = regexOf(m)
      if (r instanceof DwFn) {
        return text.replace(re, (...g) => {
          const end = g.length - (typeof g[g.length - 1] === 'object' ? 3 : 2)
          return coerceString(rt.call(r, [matchArray(g.slice(0, end)), g[end]]))
        })
      }
      return text.replace(re, javaReplacement(str(r, 'replace', [s, m, r])))
    }
    const target = str(m, 'replace', [s, m, r])
    if (r instanceof DwFn) return text.split(target).join(coerceString(rt.call(r, [[target], 0])))
    return text.split(target).join(str(r, 'replace', [s, m, r]))
  },
  splitBy(rt, s, sep) {
    if (s === null) return null
    const text = str(s, 'splitBy', [s, sep])
    let parts
    if (sep instanceof RegExp) parts = text.split(regexOf(sep, false))
    else {
      const d = str(sep, 'splitBy', [s, sep])
      parts = d === '' ? [...text] : text.split(d)
    }
    // Java's String.split drops trailing empty strings.
    while (parts.length > 1 && parts[parts.length - 1] === '') parts.pop()
    if (parts.length === 1 && parts[0] === '' && text === '') return []
    return parts
  },
  joinBy(rt, a, sep) {
    if (a === null) return null
    return arrOrFail(a, 'joinBy', [a, sep])
      .map((x) => coerceString(x))
      .join(str(sep, 'joinBy', [a, sep]))
  },
  keysOf: (rt, o) => (o === null ? null : entriesOf(objOrFail(o, 'keysOf', [o])).map((e) => keyOf(e))),
  namesOf: (rt, o) => (o === null ? null : entriesOf(objOrFail(o, 'namesOf', [o])).map((e) => e.key)),
  valuesOf: (rt, o) => (o === null ? null : entriesOf(objOrFail(o, 'valuesOf', [o])).map((e) => e.value)),
  entriesOf: (rt, o) =>
    o === null
      ? null
      : entriesOf(objOrFail(o, 'entriesOf', [o])).map((e) =>
          makeObject([entry('key', keyOf(e)), entry('value', e.value), entry('attributes', e.attrs)]),
        ),
  now: (rt) => rt.now(),
  uuid: (rt) => rt.uuid(),
  random: (rt) => rt.random(),
  randomInt: (rt, n) => Math.floor(rt.random() * coerceNumber(n)),
  typeOf: (rt, v) => typeOf(v),
  log(rt, a, b) {
    const value = b === undefined ? a : b
    const prefix = b === undefined ? '' : coerceString(a) + ' - '
    rt.log(prefix + render(value, 'application/dw'))
    return value
  },
  write(rt, v, mime = 'application/dw', opts = null) {
    return render(v, coerceString(mime), opts ? plainOptions(opts) : {})
  },
  read(rt, v, mime = 'application/json', opts = null) {
    return readValue(v, coerceString(mime), opts ? plainOptions(opts) : {})
  },
  readUrl(rt, url) {
    throw new SimUnsupported('the function readUrl (reading files or URLs)')
  },
  p: (rt, key) => rt.property(str(key, 'p', [key])),
  indexOf(rt, a, x) {
    if (a === null) return -1
    if (Array.isArray(a)) return a.findIndex((y) => equals(y, x))
    return str(a, 'indexOf', [a, x]).indexOf(str(x, 'indexOf', [a, x]))
  },
  lastIndexOf(rt, a, x) {
    if (a === null) return -1
    if (Array.isArray(a)) {
      for (let i = a.length - 1; i >= 0; i--) if (equals(a[i], x)) return i
      return -1
    }
    return str(a, 'lastIndexOf', [a, x]).lastIndexOf(str(x, 'lastIndexOf', [a, x]))
  },
  find(rt, a, x) {
    if (a === null) return []
    if (Array.isArray(a)) return a.flatMap((y, i) => (equals(y, x) ? [i] : []))
    const s = str(a, 'find', [a, x])
    const out = []
    if (x instanceof RegExp) {
      for (const m of s.matchAll(regexOf(x))) out.push([m.index, m.index + m[0].length])
      return out
    }
    const t = str(x, 'find', [a, x])
    for (let i = s.indexOf(t); i >= 0 && t; i = s.indexOf(t, i + 1)) out.push(i)
    return out
  },
  daysBetween(rt, a, b) {
    if (!(a instanceof DwTemporal) || !(b instanceof DwTemporal)) fail('daysBetween', [a, b])
    const da = convertTemporal(a, 'Date')
    const db = convertTemporal(b, 'Date')
    return Math.round((db.localMillis() - da.localMillis()) / 86400000)
  },
  match(rt, s, re) {
    if (s === null) return null
    const m = regexOf(re, false).exec(str(s, 'match', [s, re]))
    return m ? matchArray(m) : []
  },
  matches(rt, s, re) {
    if (s === null) return false
    const text = str(s, 'matches', [s, re])
    const src = re instanceof RegExp ? re.source : str(re, 'matches', [s, re])
    return new RegExp(`^(?:${src})$`, re instanceof RegExp ? re.flags.replace('g', '') : '').test(text)
  },
  scan(rt, s, re) {
    if (s === null) return null
    return [...str(s, 'scan', [s, re]).matchAll(regexOf(re))].map(matchArray)
  },
  zip(rt, a, b) {
    const n = Math.min(a.length, b.length)
    return Array.from({ length: n }, (_, i) => [a[i], b[i]])
  },
  unzip(rt, a) {
    if (!a.length) return []
    const n = Math.min(...a.map((x) => x.length))
    return Array.from({ length: n }, (_, i) => a.map((x) => x[i]))
  },
  then: (rt, v, fn) => rt.call(fn, [v]),
}

function plainOptions(o) {
  o = unwrap(o)
  if (!isPlainObject(o)) return {}
  const out = {}
  for (const e of entriesOf(o)) out[e.key] = unwrap(e.value)
  return out
}

const words = (s) => s.replace(/([a-z\d])([A-Z])/g, '$1 $2').split(/[^A-Za-z\d]+/).filter(Boolean)

const STRINGS = {
  capitalize: (rt, s) => (s === null ? null : words(str(s, 'capitalize', [s])).map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(' ')),
  camelize(rt, s) {
    if (s === null) return null
    const t = str(s, 'camelize', [s]).replace(/^_+/, '')
    return t.replace(/[_\-\s]+([A-Za-z\d])/g, (_, c) => c.toUpperCase())
  },
  dasherize: (rt, s) => (s === null ? null : words(str(s, 'dasherize', [s])).map((w) => w.toLowerCase()).join('-')),
  underscore: (rt, s) => (s === null ? null : words(str(s, 'underscore', [s])).map((w) => w.toLowerCase()).join('_')),
  substringBefore(rt, s, sep) {
    if (s === null) return null
    const t = str(s, 'substringBefore', [s, sep])
    const i = t.indexOf(str(sep, 'substringBefore', [s, sep]))
    return i < 0 ? '' : t.slice(0, i)
  },
  substringAfter(rt, s, sep) {
    if (s === null) return null
    const t = str(s, 'substringAfter', [s, sep])
    const d = str(sep, 'substringAfter', [s, sep])
    const i = t.indexOf(d)
    return i < 0 ? '' : t.slice(i + d.length)
  },
  substringBeforeLast(rt, s, sep) {
    if (s === null) return null
    const t = str(s, 'substringBeforeLast', [s, sep])
    const i = t.lastIndexOf(str(sep, 'substringBeforeLast', [s, sep]))
    return i < 0 ? '' : t.slice(0, i)
  },
  substringAfterLast(rt, s, sep) {
    if (s === null) return null
    const t = str(s, 'substringAfterLast', [s, sep])
    const d = str(sep, 'substringAfterLast', [s, sep])
    const i = t.lastIndexOf(d)
    return i < 0 ? '' : t.slice(i + d.length)
  },
  leftPad: (rt, s, n, c = ' ') => (s === null ? null : coerceString(s).padStart(coerceNumber(n), coerceString(c))),
  rightPad: (rt, s, n, c = ' ') => (s === null ? null : coerceString(s).padEnd(coerceNumber(n), coerceString(c))),
  repeat: (rt, s, n) => (s === null ? null : str(s, 'repeat', [s, n]).repeat(Math.max(0, coerceNumber(n)))),
  isAlpha: (rt, s) => s !== null && /^[A-Za-z]+$/.test(str(s, 'isAlpha', [s])),
  isNumeric: (rt, s) => s !== null && /^\d+$/.test(str(s, 'isNumeric', [s])),
  isAlphanumeric: (rt, s) => s !== null && /^[A-Za-z\d]+$/.test(str(s, 'isAlphanumeric', [s])),
  isLowerCase: (rt, s) => s !== null && /^[a-z]+$/.test(str(s, 'isLowerCase', [s])),
  isUpperCase: (rt, s) => s !== null && /^[A-Z]+$/.test(str(s, 'isUpperCase', [s])),
  isWhitespace: (rt, s) => s !== null && /^\s*$/.test(str(s, 'isWhitespace', [s])),
  ordinalize(rt, n) {
    if (n === null) return null
    const v = coerceNumber(n)
    const t = v % 100
    const suf = t >= 11 && t <= 13 ? 'th' : { 1: 'st', 2: 'nd', 3: 'rd' }[v % 10] || 'th'
    return v + suf
  },
  wrapWith: (rt, s, w) => (s === null ? null : coerceString(w) + coerceString(s) + coerceString(w)),
  wrapIfMissing(rt, s, w) {
    if (s === null) return null
    let t = coerceString(s)
    const x = coerceString(w)
    if (!t.startsWith(x)) t = x + t
    if (!t.endsWith(x)) t = t + x
    return t
  },
  unwrap(rt, s, w) {
    if (s === null) return null
    const t = coerceString(s)
    const x = coerceString(w)
    return t.startsWith(x) && t.endsWith(x) && t.length >= 2 * x.length ? t.slice(x.length, t.length - x.length) : t
  },
  appendIfMissing: (rt, s, x) => (s === null ? null : coerceString(s).endsWith(coerceString(x)) ? coerceString(s) : coerceString(s) + coerceString(x)),
  prependIfMissing: (rt, s, x) => (s === null ? null : coerceString(s).startsWith(coerceString(x)) ? coerceString(s) : coerceString(x) + coerceString(s)),
  words: (rt, s) => (s === null ? null : str(s, 'words', [s]).split(/\s+/).filter(Boolean)),
  lines: (rt, s) => (s === null ? null : str(s, 'lines', [s]).split(/\r?\n/)),
  charCode: (rt, s) => str(s, 'charCode', [s]).charCodeAt(0),
  charCodeAt: (rt, s, i) => str(s, 'charCodeAt', [s, i]).charCodeAt(coerceNumber(i)),
  fromCharCode: (rt, n) => String.fromCharCode(coerceNumber(n)),
  reverse: (rt, s) => (s === null ? null : [...str(s, 'reverse', [s])].reverse().join('')),
  substring(rt, s, from, to) {
    if (s === null) return null
    const t = str(s, 'substring', [s, from, to])
    return t.substring(coerceNumber(from), to === undefined ? t.length : coerceNumber(to))
  },
  first: (rt, s, n) => (s === null ? null : str(s, 'first', [s, n]).slice(0, coerceNumber(n))),
  last: (rt, s, n) => (s === null ? null : str(s, 'last', [s, n]).slice(-coerceNumber(n) || undefined)),
  collapse: (rt, s) => (s === null ? null : str(s, 'collapse', [s]).replace(/(.)\1+/g, '$1')),
  remove: (rt, s, x) => (s === null ? null : str(s, 'remove', [s, x]).split(coerceString(x)).join('')),
  everyCharacter: (rt, s, fn) => s === null || [...str(s, 'everyCharacter', [s])].every((c) => bool(rt.call(fn, [c]), 'everyCharacter')),
  someCharacter: (rt, s, fn) => s !== null && [...str(s, 'someCharacter', [s])].some((c) => bool(rt.call(fn, [c]), 'someCharacter')),
  withMaxSize: (rt, s, n) => (s === null ? null : str(s, 'withMaxSize', [s, n]).slice(0, coerceNumber(n))),
  mask(rt, s, c = '*') {
    if (s === null) return null
    return coerceString(c).repeat(str(s, 'mask', [s]).length)
  },
  hammingDistance(rt, a, b) {
    const x = coerceString(a)
    const y = coerceString(b)
    if (x.length !== y.length) return null
    return [...x].filter((c, i) => c !== y[i]).length
  },
  levenshteinDistance(rt, a, b) {
    const x = coerceString(a)
    const y = coerceString(b)
    const d = Array.from({ length: x.length + 1 }, (_, i) => [i, ...Array(y.length).fill(0)])
    for (let j = 1; j <= y.length; j++) d[0][j] = j
    for (let i = 1; i <= x.length; i++)
      for (let j = 1; j <= y.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1))
    return d[x.length][y.length]
  },
}

const ARRAYS = {
  some: (rt, a, fn) => a !== null && arrOrFail(a, 'some', [a, fn]).some((x, i) => bool(rt.call(fn, [x, i]), 'some')),
  every: (rt, a, fn) => a === null || arrOrFail(a, 'every', [a, fn]).every((x, i) => bool(rt.call(fn, [x, i]), 'every')),
  take: (rt, a, n) => (a === null ? null : a.slice(0, Math.max(0, coerceNumber(n)))),
  drop: (rt, a, n) => (a === null ? null : a.slice(Math.max(0, coerceNumber(n)))),
  countBy: (rt, a, fn) => arrOrFail(a, 'countBy', [a, fn]).filter((x) => bool(rt.call(fn, [x]), 'countBy')).length,
  sumBy: (rt, a, fn) => arrOrFail(a, 'sumBy', [a, fn]).reduce((s, x) => decimalOp('+', s, coerceNumber(rt.call(fn, [x]))), 0),
  divideBy(rt, a, n) {
    if (a === null) return null
    const size = coerceNumber(n)
    const out = []
    for (let i = 0; i < a.length; i += size) out.push(a.slice(i, i + size))
    return out
  },
  indexOf: (rt, a, x) => CORE.indexOf(rt, a, x),
  indexWhere: (rt, a, fn) => arrOrFail(a, 'indexWhere', [a, fn]).findIndex((x) => bool(rt.call(fn, [x]), 'indexWhere')),
  lastIndexWhere(rt, a, fn) {
    for (let i = a.length - 1; i >= 0; i--) if (bool(rt.call(fn, [a[i]]), 'lastIndexWhere')) return i
    return -1
  },
  firstWith(rt, a, fn) {
    if (a === null) return null
    const i = arrOrFail(a, 'firstWith', [a, fn]).findIndex((x, j) => bool(rt.call(fn, [x, j]), 'firstWith'))
    return i < 0 ? null : a[i]
  },
  partition(rt, a, fn) {
    const yes = []
    const no = []
    for (const x of arrOrFail(a, 'partition', [a, fn])) (bool(rt.call(fn, [x]), 'partition') ? yes : no).push(x)
    return makeObject([entry('success', yes), entry('failure', no)])
  },
  slice: (rt, a, from, to) => a.slice(coerceNumber(from), coerceNumber(to)),
  splitAt: (rt, a, n) => makeObject([entry('l', a.slice(0, coerceNumber(n))), entry('r', a.slice(coerceNumber(n)))]),
  splitWhere(rt, a, fn) {
    let i = a.findIndex((x) => bool(rt.call(fn, [x]), 'splitWhere'))
    if (i < 0) i = a.length
    return makeObject([entry('l', a.slice(0, i)), entry('r', a.slice(i))])
  },
  takeWhile(rt, a, fn) {
    const out = []
    for (const x of a) {
      if (!bool(rt.call(fn, [x]), 'takeWhile')) break
      out.push(x)
    }
    return out
  },
  dropWhile(rt, a, fn) {
    let i = 0
    while (i < a.length && bool(rt.call(fn, [a[i]]), 'dropWhile')) i++
    return a.slice(i)
  },
  join(rt, l, r, lk, rk) {
    const out = []
    for (const x of l) for (const y of r) if (equals(coerceString(rt.call(lk, [x])), coerceString(rt.call(rk, [y])))) out.push(makeObject([entry('l', x), entry('r', y)]))
    return out
  },
  leftJoin(rt, l, r, lk, rk) {
    const out = []
    for (const x of l) {
      const ms = r.filter((y) => equals(coerceString(rt.call(lk, [x])), coerceString(rt.call(rk, [y]))))
      if (ms.length) for (const y of ms) out.push(makeObject([entry('l', x), entry('r', y)]))
      else out.push(makeObject([entry('l', x)]))
    }
    return out
  },
  outerJoin(rt, l, r, lk, rk) {
    const out = ARRAYS.leftJoin(rt, l, r, lk, rk)
    for (const y of r) {
      if (!l.some((x) => equals(coerceString(rt.call(lk, [x])), coerceString(rt.call(rk, [y]))))) out.push(makeObject([entry('r', y)]))
    }
    return out
  },
  first: (rt, a, n) => (a === null ? null : a.slice(0, coerceNumber(n))),
}

const OBJECTS = {
  mergeWith(rt, a, b) {
    if (a === null) return b
    if (b === null) return a
    const bes = entriesOf(b)
    return makeObject([...entriesOf(a).filter((e) => !bes.some((x) => x.key === e.key)), ...bes])
  },
  keySet: (rt, o) => entriesOf(o).map(keyOf),
  nameSet: (rt, o) => entriesOf(o).map((e) => e.key),
  valueSet: (rt, o) => entriesOf(o).map((e) => e.value),
  entrySet: (rt, o) => CORE.entriesOf(rt, o),
  divideBy(rt, o, n) {
    const es = entriesOf(o)
    const out = []
    for (let i = 0; i < es.length; i += coerceNumber(n)) out.push(makeObject(es.slice(i, i + coerceNumber(n))))
    return out
  },
  everyEntry: (rt, o, fn) => o === null || entriesOf(o).every((e) => bool(rt.call(fn, [e.value, keyOf(e)]), 'everyEntry')),
  someEntry: (rt, o, fn) => o !== null && entriesOf(o).some((e) => bool(rt.call(fn, [e.value, keyOf(e)]), 'someEntry')),
}

const BINARIES = {
  toHex: (rt, b) => (b === null ? null : toHex(binOf(b))),
  fromHex(rt, s) {
    const t = coerceString(s)
    return new DwBinary(Uint8Array.from(t.match(/../g) || [], (h) => parseInt(h, 16)))
  },
  toBase64: (rt, b) => (b === null ? null : bytesToBase64(binOf(b))),
  fromBase64: (rt, s) => (s === null ? null : new DwBinary(base64ToBytes(coerceString(s)))),
}

function binOf(v) {
  v = unwrap(v)
  if (v instanceof DwBinary) return v.bytes
  if (typeof v === 'string') return utf8(v)
  throw new DwError(`Expected a Binary but got ${describe(v)}`)
}

const CRYPTO = {
  MD5: (rt, b) => toHex(hash(binOf(b), 'MD5')),
  SHA1: (rt, b) => toHex(hash(binOf(b), 'SHA-1')),
  hashWith: (rt, b, alg = 'SHA-1') => new DwBinary(hash(binOf(b), coerceString(alg))),
  HMACBinary: (rt, k, b, alg = 'HmacSHA1') => new DwBinary(hmac(binOf(k), binOf(b), coerceString(alg))),
  HMACWith: (rt, k, b, alg = 'HmacSHA1') => toHex(hmac(binOf(k), binOf(b), coerceString(alg))),
}

function dateFrom(o, kind) {
  const f = {}
  for (const e of entriesOf(o)) f[e.key] = unwrap(e.value)
  return new DwTemporal(kind, {
    y: f.year, mo: f.month, d: f.day, h: f.hour, mi: f.minutes, s: Math.floor(f.seconds || 0),
    ns: Math.round(((f.seconds || 0) % 1) * 1e9), off: f.timeZone ? Number(String(f.timeZone).replace(/[^\d+-]/g, '')) * 36 : 0,
  })
}

const DATES = {
  today: (rt) => convertTemporal(rt.now(), 'Date'),
  yesterday: (rt) => new DwTemporal('Date', dayShift(rt.now(), -1)),
  tomorrow: (rt) => new DwTemporal('Date', dayShift(rt.now(), 1)),
  atBeginningOfDay: (rt, t) => t.with(t.kind, { h: 0, mi: 0, s: 0, ns: 0 }),
  atBeginningOfMonth: (rt, t) => t.with(t.kind, t.hasTime() ? { d: 1, h: 0, mi: 0, s: 0, ns: 0 } : { d: 1 }),
  atBeginningOfYear: (rt, t) => t.with(t.kind, t.hasTime() ? { mo: 1, d: 1, h: 0, mi: 0, s: 0, ns: 0 } : { mo: 1, d: 1 }),
  atBeginningOfHour: (rt, t) => t.with(t.kind, { mi: 0, s: 0, ns: 0 }),
  date: (rt, o) => dateFrom(o, 'Date'),
  dateTime: (rt, o) => dateFrom(o, 'DateTime'),
  localDateTime: (rt, o) => dateFrom(o, 'LocalDateTime'),
  localTime: (rt, o) => dateFrom(o, 'LocalTime'),
}

function dayShift(t, n) {
  const d = new Date(Date.UTC(t.y, t.mo - 1, t.d + n))
  return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate() }
}

const PERIODS = {
  years: (rt, n) => new DwPeriod(coerceNumber(n), 0, 0, 0),
  months: (rt, n) => new DwPeriod(0, coerceNumber(n), 0, 0),
  days: (rt, n) => new DwPeriod(0, 0, coerceNumber(n), 0),
  hours: (rt, n) => new DwPeriod(0, 0, 0, coerceNumber(n) * 3600),
  minutes: (rt, n) => new DwPeriod(0, 0, 0, coerceNumber(n) * 60),
  seconds: (rt, n) => new DwPeriod(0, 0, 0, coerceNumber(n)),
  between: (rt, a, b) => diffTemporal(a, b),
}

const NUMBERS = {
  fromHex: (rt, s) => parseInt(coerceString(s), 16),
  toHex: (rt, n) => coerceNumber(n).toString(16),
  fromBinary: (rt, s) => parseInt(coerceString(s), 2),
  toBinary: (rt, n) => coerceNumber(n).toString(2),
  fromRadixNumber: (rt, s, r) => parseInt(coerceString(s), coerceNumber(r)),
  toRadixNumber: (rt, n, r) => coerceNumber(n).toString(coerceNumber(r)),
}

const RUNTIME = {
  fail(rt, msg = 'Error') {
    throw new DwError(coerceString(msg))
  },
  prop: (rt, key) => rt.property(coerceString(key)),
  props: (rt) => rt.allProperties(),
  wait: (rt, v) => v,
  try(rt, fn) {
    try {
      return makeObject([entry('success', true), entry('result', rt.call(fn, []))])
    } catch (e) {
      if (!(e instanceof DwError)) throw e
      return makeObject([entry('success', false), entry('error', makeObject([entry('kind', 'UserException'), entry('message', e.message)]))])
    }
  },
  orElse(rt, v, fn) {
    return v
  },
}

const SYSTEM = {
  envVar: () => null,
  envVars: () => makeObject([]),
}

const URL_MODULE = {
  encodeURIComponent: (rt, s) => encodeURIComponent(coerceString(s)),
  decodeURIComponent: (rt, s) => decodeURIComponent(coerceString(s)),
  encodeURI: (rt, s) => encodeURI(coerceString(s)),
  decodeURI: (rt, s) => decodeURI(coerceString(s)),
}

export const MODULES = {
  'dw::Core': CORE,
  'dw::core::Strings': STRINGS,
  'dw::core::Arrays': ARRAYS,
  'dw::core::Objects': OBJECTS,
  'dw::core::Binaries': BINARIES,
  'dw::Crypto': CRYPTO,
  'dw::core::Dates': DATES,
  'dw::core::Periods': PERIODS,
  'dw::core::Numbers': NUMBERS,
  'dw::Runtime': RUNTIME,
  'dw::System': SYSTEM,
  'dw::core::URL': URL_MODULE,
}

// Modules that exist in DataWeave but that the simulator has no copy of.
export const KNOWN_MODULES = new Set([
  ...Object.keys(MODULES), 'dw::core::Types', 'dw::util::Values', 'dw::util::Tree', 'dw::util::Timer', 'dw::util::Diff',
  'dw::util::Math', 'dw::util::Coercions', 'dw::core::Ranges', 'dw::module::Mime', 'dw::module::Multipart', 'dw::Mime',
  'dw::extension::DataFormat', 'dw::xml::Dtd', 'dw::xtend::Xml', 'dw::io::file::FileSystem', 'dw::util::Collections',
])

// dw::Core functions the simulator does not implement: calling one is a SimUnsupported, not a learner error.
export const UNIMPLEMENTED_CORE = new Set(['onNull', 'unwrapXml', 'ofType', 'dash', 'nameOf', 'keySet', 'toBase64', 'fromBase64', 'version'])

