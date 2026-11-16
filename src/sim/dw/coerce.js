// The `as` and `is` operators: type checks, coercions with format/unit options, and Java DecimalFormat patterns.
import { DwError, SimUnsupported } from '../errors.js'
import { DwTemporal, DwPeriod, parseIso, convertTemporal, formatTemporal, parseTemporal } from './dates.js'
import {
  DwKey, DwBinary, DwFn, unwrap, typeOf, describe, coerceString, isPlainObject, numberToString, utf8,
} from './values.js'

const TEMPORAL = ['Date', 'DateTime', 'LocalDateTime', 'Time', 'LocalTime']

export function isType(v, type, aliases = {}) {
  if (type.name === 'Union') return type.union.some((t) => isType(v, t, aliases))
  const name = resolveAlias(type.name, aliases)
  const t = typeOf(v)
  switch (name) {
    case 'Any':
      return true
    case 'Nothing':
      return false
    case 'Null':
      return t === 'Null'
    case 'String':
      return t === 'String' || t === 'Key'
    case 'Key':
      return t === 'Key'
    case 'Number':
      return t === 'Number'
    case 'Boolean':
      return t === 'Boolean'
    case 'Array':
      return t === 'Array'
    case 'Object':
      return t === 'Object'
    case 'Function':
      return t === 'Function'
    case 'Binary':
      return t === 'Binary'
    case 'Regex':
      return t === 'Regex'
    case 'Period':
      return t === 'Period'
    case 'Range':
      return t === 'Array'
    case 'SimpleType':
      return ['String', 'Number', 'Boolean', ...TEMPORAL, 'Period', 'Regex', 'Key'].includes(t)
    case 'Comparable':
      return ['String', 'Number', 'Boolean', ...TEMPORAL, 'Key'].includes(t)
    default:
      if (TEMPORAL.includes(name)) return t === name
      throw new SimUnsupported(`the type ${name} in an 'is' check`)
  }
}

function resolveAlias(name, aliases) {
  let seen = 0
  while (aliases[name] && seen++ < 10) name = aliases[name]
  return name
}

export function coerceTo(v, type, opts, aliases = {}) {
  opts = opts || {}
  if (type.name === 'Union') {
    for (const t of type.union) {
      try {
        return coerceTo(v, t, opts, aliases)
      } catch (e) {
        if (!(e instanceof DwError)) throw e
      }
    }
    throw new DwError(`Cannot coerce ${describe(v)} to ${type.union.map((t) => t.name).join(' | ')}`)
  }
  const name = resolveAlias(type.name, aliases)
  const raw = v
  v = unwrap(v)
  if (v instanceof DwKey && name !== 'Key') v = v.name
  const t = typeOf(v)
  const fail = () => {
    throw new DwError(`Cannot coerce ${describe(v)} to ${name}`)
  }
  switch (name) {
    case 'Any':
      return raw
    case 'String':
      return toStringValue(v, opts, fail)
    case 'Number':
      return toNumberValue(v, opts, fail)
    case 'Boolean':
      if (t === 'Boolean') return v
      if (t === 'String' && /^(true|false)$/i.test(v.trim())) return v.trim().toLowerCase() === 'true'
      return fail()
    case 'Null':
      return t === 'Null' ? null : fail()
    case 'Array':
      if (t === 'Array') return v
      if (t === 'String') return [...v]
      return fail()
    case 'Object':
      return t === 'Object' ? v : fail()
    case 'Key':
      if (v instanceof DwKey) return v
      if (t === 'String') return new DwKey(v)
      return fail()
    case 'Binary':
      if (t === 'Binary') return v
      if (t === 'String') {
        const enc = String(opts.encoding || 'UTF-8').toUpperCase()
        if (enc === 'UTF-8' || enc === 'UTF8' || enc === 'US-ASCII' || enc === 'ASCII') return new DwBinary(utf8(v))
        if (enc === 'ISO-8859-1' || enc === 'LATIN1') return new DwBinary(Uint8Array.from([...v].map((c) => c.charCodeAt(0) & 255)))
        throw new SimUnsupported(`the ${enc} encoding`)
      }
      return fail()
    case 'Regex':
      if (t === 'Regex') return v
      if (t === 'String') return new RegExp(v)
      return fail()
    case 'Period':
      if (t === 'Period') return v
      if (t === 'String') return DwPeriod.parse(v)
      return fail()
    case 'Function':
      return v instanceof DwFn ? v : fail()
    case 'TimeZone':
      if (t === 'String') return v
      return fail()
    case 'Range':
      return t === 'Array' ? v : fail()
    case 'CData':
      return toStringValue(v, opts, fail)
  }
  if (TEMPORAL.includes(name)) return toTemporal(v, name, opts, fail)
  throw new SimUnsupported(`coercion to the type ${name}`)
}

function toStringValue(v, opts, fail) {
  const t = typeOf(v)
  if (t === 'String') return v
  if (t === 'Number') return opts.format !== undefined ? formatNumber(v, String(opts.format), opts.roundMode) : numberToString(v)
  if (t === 'Boolean') return String(v)
  if (v instanceof DwTemporal) return opts.format !== undefined ? formatTemporal(v, String(opts.format)) : v.toString()
  if (v instanceof DwPeriod) return v.toString()
  if (v instanceof DwBinary) return new TextDecoder().decode(v.bytes)
  if (v instanceof RegExp) return v.source
  if (isPlainObject(v)) {
    try {
      return coerceString(v)
    } catch {
      return fail()
    }
  }
  if (t === 'Array' && v.length && v.every((x) => typeof x === 'string')) return fail()
  return fail()
}

const UNIT_SECONDS = { nanos: 1e-9, milliseconds: 1e-3, seconds: 1, minutes: 60, hours: 3600, days: 86400 }

function toNumberValue(v, opts, fail) {
  const t = typeOf(v)
  if (t === 'Number') return v
  if (t === 'String') {
    let s = v.trim()
    if (opts.format !== undefined) s = s.replace(/,/g, '').replace(/[^\d.eE+-]/g, '')
    if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s)) return Number(s)
    if (/^0x[0-9a-f]+$/i.test(s)) return parseInt(s, 16)
    return fail()
  }
  if (t === 'Boolean') return fail()
  const unit = opts.unit || 'seconds'
  if (!(unit in UNIT_SECONDS)) throw new DwError(`Unknown unit '${unit}'`)
  if (v instanceof DwTemporal) {
    if (!v.hasDate()) return fail()
    const ms = v.epochMillis()
    if (unit === 'milliseconds') return ms
    if (unit === 'nanos') return ms * 1e6 + (v.ns % 1e6)
    return Math.floor(ms / 1000 / UNIT_SECONDS[unit])
  }
  if (v instanceof DwPeriod) {
    const secs = v.totalSeconds()
    return Math.trunc(Math.round((secs / UNIT_SECONDS[unit]) * 1e6) / 1e6)
  }
  return fail()
}

function toTemporal(v, kind, opts, fail) {
  if (v instanceof DwTemporal) return convertTemporal(v, kind)
  if (typeof v === 'number') {
    if (kind !== 'DateTime' && kind !== 'Date' && kind !== 'LocalDateTime') return fail()
    const unit = opts.unit || 'seconds'
    const ms = unit === 'milliseconds' ? v : unit === 'nanos' ? v / 1e6 : v * 1000 * (UNIT_SECONDS[unit] || 1)
    return convertTemporal(DwTemporal.fromEpochMillis(Math.round(ms), 0), kind)
  }
  if (typeof v !== 'string') return fail()
  if (opts.format !== undefined) return parseTemporal(v, String(opts.format), kind)
  const t = parseIso(v.trim())
  if (!t) return fail()
  try {
    return convertTemporal(t, kind)
  } catch {
    return fail()
  }
}

// Java DecimalFormat: "0.00", "#,##0.##", "000", "0.0%", "$#,##0.00", "0.###E0" (no exponent support).
export function formatNumber(n, pattern, roundMode = 'HALF_UP') {
  const pos = pattern.split(';')[0]
  const m = /^([^#0,.]*)([#0,]*)(?:\.([0#]*))?(.*)$/.exec(pos)
  if (!m) throw new DwError(`Invalid number format "${pattern}"`)
  const [, prefix, intPart, fracPart = '', suffix] = m
  if (/E/.test(suffix)) throw new SimUnsupported(`the scientific number format "${pattern}"`)
  let value = n
  if (suffix.includes('%')) value *= 100
  if (suffix.includes('‰')) value *= 1000
  const minFrac = (fracPart.match(/0/g) || []).length
  const maxFrac = fracPart.length
  const minInt = (intPart.replace(/,/g, '').match(/0/g) || []).length
  const groups = intPart.split(',')
  const groupSize = groups.length > 1 ? groups[groups.length - 1].length : 0
  const neg = value < 0
  let text = roundDecimal(Math.abs(value), maxFrac, roundMode)
  let [ip, fp = ''] = text.split('.')
  while (fp.length > minFrac && fp.endsWith('0')) fp = fp.slice(0, -1)
  if (ip === '0' && minInt === 0 && fp) ip = ''
  ip = ip.padStart(minInt, '0')
  if (groupSize > 0) ip = ip.replace(new RegExp(`\\B(?=(\\d{${groupSize}})+(?!\\d))`, 'g'), ',')
  const body = ip + (fp ? '.' + fp : '')
  const isZero = !/[1-9]/.test(body)
  return (neg && !isZero ? '-' : '') + prefix.replace(/'/g, '') + body + suffix.replace(/'/g, '')
}

// Round a non-negative number to `digits` decimals in decimal arithmetic (so 2.675 → 2.68 with HALF_UP).
function roundDecimal(x, digits, mode) {
  let s = x.toPrecision(15)
  if (/e/.test(s)) s = x.toFixed(Math.min(digits + 2, 20))
  s = String(Number(s))
  if (/e/.test(s)) s = x.toFixed(20)
  let [ip, fp = ''] = s.split('.')
  if (fp.length <= digits) return digits ? ip + '.' + fp.padEnd(digits, '0') : ip
  const keep = fp.slice(0, digits)
  const rest = fp.slice(digits)
  const first = Number(rest[0])
  const beyond = /[1-9]/.test(rest.slice(1))
  const lastKept = Number((ip + keep).slice(-1))
  let up
  switch (String(mode || 'HALF_UP').toUpperCase()) {
    case 'HALF_EVEN':
      up = first > 5 || (first === 5 && (beyond || lastKept % 2 === 1))
      break
    case 'HALF_DOWN':
      up = first > 5 || (first === 5 && beyond)
      break
    case 'UP':
    case 'CEILING':
      up = /[1-9]/.test(rest)
      break
    case 'DOWN':
    case 'FLOOR':
      up = false
      break
    default:
      up = first >= 5
  }
  let digitsStr = ip + keep
  if (up) {
    const arr = digitsStr.split('').map(Number)
    let k = arr.length - 1
    while (k >= 0) {
      if (arr[k] === 9) {
        arr[k] = 0
        k--
      } else {
        arr[k]++
        break
      }
    }
    if (k < 0) arr.unshift(1)
    digitsStr = arr.join('')
  }
  const intLen = digitsStr.length - digits
  return digits ? digitsStr.slice(0, intLen) + '.' + digitsStr.slice(intLen) : digitsStr
}

