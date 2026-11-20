// Dates, times and periods: ISO parsing and printing, Java-style format patterns, period arithmetic and time zones.
import { DwError } from '../errors.js'

const pad = (n, w = 2) => String(Math.abs(n)).padStart(w, '0')
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

function offsetText(off, zeroAsZ = true) {
  if (off === 0 && zeroAsZ) return 'Z'
  const sign = off < 0 ? '-' : '+'
  const a = Math.abs(off)
  return `${sign}${pad(Math.floor(a / 3600))}:${pad(Math.floor((a % 3600) / 60))}`
}

// Offset in seconds of a zone ('Z', 'UTC', '+02:00', 'Europe/Paris') at the given instant.
export function zoneOffset(zone, epochMs) {
  if (zone === 'Z' || zone === 'UTC' || zone === 'GMT' || zone === 'UT') return 0
  const m = /^(?:UTC|GMT)?([+-])(\d{1,2}):?(\d{2})?$/.exec(zone)
  if (m) return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 3600 + Number(m[3] || 0) * 60)
  let parts
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    }).formatToParts(new Date(epochMs))
  } catch {
    throw new DwError(`Unknown time zone '${zone}'`)
  }
  const get = (t) => Number(parts.find((p) => p.type === t).value)
  const local = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'))
  return Math.round((local - Math.floor(epochMs / 1000) * 1000) / 60000) * 60
}

function isOffsetZone(zone) {
  return zone === null || zone === 'Z' || /^[+-]\d/.test(zone)
}

export class DwTemporal {
  // kind: Date | DateTime | LocalDateTime | Time | LocalTime. off is the UTC offset in seconds (DateTime and Time).
  constructor(kind, f) {
    this.kind = kind
    this.y = f.y ?? 1970
    this.mo = f.mo ?? 1
    this.d = f.d ?? 1
    this.h = f.h ?? 0
    this.mi = f.mi ?? 0
    this.s = f.s ?? 0
    this.ns = f.ns ?? 0
    this.off = f.off ?? 0
    this.zone = f.zone ?? null
  }

  static fromEpochMillis(ms, off = 0, zone = null) {
    const local = new Date(ms + off * 1000)
    return new DwTemporal('DateTime', {
      y: local.getUTCFullYear(),
      mo: local.getUTCMonth() + 1,
      d: local.getUTCDate(),
      h: local.getUTCHours(),
      mi: local.getUTCMinutes(),
      s: local.getUTCSeconds(),
      ns: (((ms % 1000) + 1000) % 1000) * 1e6,
      off,
      zone,
    })
  }

  hasDate() {
    return this.kind === 'Date' || this.kind === 'DateTime' || this.kind === 'LocalDateTime'
  }
  hasTime() {
    return this.kind !== 'Date'
  }
  hasOffset() {
    return this.kind === 'DateTime' || this.kind === 'Time'
  }

  localMillis() {
    const base = this.hasDate() ? Date.UTC(this.y, this.mo - 1, this.d) : 0
    const t = this.hasTime() ? (this.h * 3600 + this.mi * 60 + this.s) * 1000 : 0
    return base + t + Math.floor(this.ns / 1e6)
  }

  epochMillis() {
    return this.localMillis() - (this.hasOffset() ? this.off * 1000 : 0)
  }

  compareTo(o) {
    const a = this.epochMillis() * 1e6 + (this.ns % 1e6)
    const b = o.epochMillis() * 1e6 + (o.ns % 1e6)
    return a < b ? -1 : a > b ? 1 : 0
  }

  with(kind, extra = {}) {
    return new DwTemporal(kind, { ...this, ...extra })
  }

  // DateTime >> "zone": the same instant seen from another zone.
  inZone(zone) {
    if (!this.hasOffset()) return this.with(this.kind === 'LocalDateTime' ? 'DateTime' : 'Time', { off: zoneOffset(zone, this.localMillis()), zone })
    const ms = this.epochMillis()
    const off = zoneOffset(zone, ms)
    const t = DwTemporal.fromEpochMillis(ms, off, zone === 'Z' ? null : zone)
    t.ns = this.ns
    return this.kind === 'Time' ? t.with('Time') : t
  }

  fraction() {
    if (!this.ns) return ''
    let f = String(this.ns).padStart(9, '0')
    while (f.length > 3 && f.endsWith('000')) f = f.slice(0, -3)
    return '.' + f
  }

  toString() {
    const date = `${this.y < 0 ? '-' : ''}${pad(this.y, 4)}-${pad(this.mo)}-${pad(this.d)}`
    const time = `${pad(this.h)}:${pad(this.mi)}:${pad(this.s)}${this.fraction()}`
    const zoneTail = this.zone && !isOffsetZone(this.zone) ? `[${this.zone}]` : ''
    switch (this.kind) {
      case 'Date':
        return date
      case 'LocalDateTime':
        return `${date}T${time}`
      case 'DateTime':
        return `${date}T${time}${offsetText(this.off)}${zoneTail}`
      case 'Time':
        return `${time}${offsetText(this.off)}`
      default:
        return time
    }
  }

  toJSON() {
    return this.toString()
  }

  field(name) {
    const dow = this.hasDate() ? new Date(Date.UTC(this.y, this.mo - 1, this.d)).getUTCDay() : null
    switch (name) {
      case 'year':
        return this.hasDate() ? this.y : null
      case 'month':
        return this.hasDate() ? this.mo : null
      case 'day':
        return this.hasDate() ? this.d : null
      case 'hour':
        return this.hasTime() ? this.h : null
      case 'minutes':
        return this.hasTime() ? this.mi : null
      case 'seconds':
        return this.hasTime() ? this.s : null
      case 'milliseconds':
        return Math.floor(this.ns / 1e6)
      case 'nanoseconds':
        return this.ns
      case 'dayOfWeek':
        return dow === null ? null : dow === 0 ? 7 : dow
      case 'dayOfYear':
        return this.hasDate() ? Math.round((Date.UTC(this.y, this.mo - 1, this.d) - Date.UTC(this.y, 0, 1)) / 86400000) + 1 : null
      case 'quarter':
        return this.hasDate() ? Math.ceil(this.mo / 3) : null
      case 'offsetSeconds':
        return this.hasOffset() ? this.off : null
      case 'timezone':
      case 'zone':
        return this.hasOffset() ? this.zone || offsetText(this.off) : null
      default:
        throw new DwError(`Invalid selector '${name}' on ${this.kind}`)
    }
  }

  static parseAs(text, kind) {
    const t = parseIso(String(text).trim())
    if (!t) throw new DwError(`Cannot coerce String ("${text}") to ${kind}`)
    return convertTemporal(t, kind)
  }
}

export function convertTemporal(t, kind) {
  if (t.kind === kind) return t
  switch (kind) {
    case 'Date':
      if (!t.hasDate()) break
      return new DwTemporal('Date', { y: t.y, mo: t.mo, d: t.d })
    case 'DateTime':
      if (!t.hasDate()) break
      return t.with('DateTime', t.hasOffset() ? {} : { off: 0, zone: null })
    case 'LocalDateTime':
      if (!t.hasDate()) break
      return t.with('LocalDateTime', { off: 0, zone: null })
    case 'Time':
      if (!t.hasTime()) break
      return t.with('Time', t.hasOffset() ? {} : { off: 0 })
    case 'LocalTime':
      if (!t.hasTime()) break
      return t.with('LocalTime')
  }
  throw new DwError(`Cannot coerce ${t.kind} (${t}) to ${kind}`)
}

const ISO =
  /^([+-]?\d{4,})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,9}))?)?)?(Z|[+-]\d{2}(?::?\d{2})?)?(?:\[([^\]]+)\])?$/
const ISO_TIME = /^(\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,9}))?)?(Z|[+-]\d{2}(?::?\d{2})?)?$/

function offsetSeconds(text) {
  if (!text || text === 'Z') return 0
  const m = /^([+-])(\d{2}):?(\d{2})?$/.exec(text)
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 3600 + Number(m[3] || 0) * 60)
}

// Parse ISO text into the most specific temporal it describes, or null.
export function parseIso(text) {
  let m = ISO.exec(text)
  if (m) {
    const f = { y: Number(m[1]), mo: Number(m[2]), d: Number(m[3]) }
    if (f.mo < 1 || f.mo > 12 || f.d < 1 || f.d > daysInMonth(f.y, f.mo)) return null
    if (m[4] === undefined) return new DwTemporal('Date', f)
    Object.assign(f, { h: Number(m[4]), mi: Number(m[5]), s: Number(m[6] || 0), ns: m[7] ? Number(m[7].padEnd(9, '0')) : 0 })
    if (m[8] === undefined && m[9] === undefined) return new DwTemporal('LocalDateTime', f)
    if (m[8] === undefined) {
      const local = Date.UTC(f.y, f.mo - 1, f.d, f.h, f.mi, f.s)
      return new DwTemporal('DateTime', { ...f, off: zoneOffset(m[9], local), zone: m[9] })
    }
    return new DwTemporal('DateTime', { ...f, off: offsetSeconds(m[8]), zone: m[9] || null })
  }
  m = ISO_TIME.exec(text)
  if (m) {
    const f = { h: Number(m[1]), mi: Number(m[2]), s: Number(m[3] || 0), ns: m[4] ? Number(m[4].padEnd(9, '0')) : 0 }
    return m[5] === undefined ? new DwTemporal('LocalTime', f) : new DwTemporal('Time', { ...f, off: offsetSeconds(m[5]) })
  }
  return null
}

// A time zone literal such as |Z|, |-03:00| or |America/New_York|.
export class DwTimeZone {
  constructor(zone) {
    this.zone = zone
  }
  toString() {
    return this.zone
  }
  toJSON() {
    return this.zone
  }
}

export class DwPeriod {
  // A calendar part (years, months, days) and a time part in seconds, as Java's Period and Duration.
  constructor(y = 0, m = 0, d = 0, secs = 0) {
    this.y = y
    this.m = m
    this.d = d
    this.secs = secs
  }

  static parse(text) {
    const m = /^([+-])?P(?:(-?\d+)Y)?(?:(-?\d+)M)?(?:(-?\d+)W)?(?:(-?\d+)D)?(?:T(?:(-?\d+)H)?(?:(-?\d+)M)?(?:(-?\d+(?:\.\d+)?)S)?)?$/.exec(
      String(text).trim(),
    )
    if (!m || text.trim().endsWith('T') || /^[+-]?P$/.test(text.trim())) throw new DwError(`Cannot coerce String ("${text}") to Period`)
    const n = (x) => Number(x || 0)
    const sign = m[1] === '-' ? -1 : 1
    return new DwPeriod(sign * n(m[2]), sign * n(m[3]), sign * (n(m[4]) * 7 + n(m[5])), sign * (n(m[6]) * 3600 + n(m[7]) * 60 + n(m[8])))
  }

  totalSeconds() {
    return (this.y * 365 + this.m * 30 + this.d) * 86400 + this.secs
  }

  negate() {
    return new DwPeriod(-this.y, -this.m, -this.d, -this.secs)
  }

  // p.days, p.hours and so on. A time-based period answers as Java's Duration: days in total, then the hour,
  // minute and second parts, so (|2026-01-15| - |2026-01-01|).days is 14 and .hours is 0.
  field(name) {
    const s = Math.trunc(this.secs)
    switch (name) {
      case 'years':
        return this.y
      case 'months':
        return this.m
      case 'days':
        return this.d + Math.trunc(s / 86400)
      case 'hours':
        return Math.trunc((s % 86400) / 3600)
      case 'minutes':
        return Math.trunc((s % 3600) / 60)
      case 'seconds':
        return s % 60
      default:
        throw new DwError(`Invalid selector '${name}' on Period`)
    }
  }

  toString() {
    let out = 'P'
    if (this.y) out += this.y + 'Y'
    if (this.m) out += this.m + 'M'
    if (this.d) out += this.d + 'D'
    if (this.secs) {
      let s = Math.abs(this.secs)
      const sign = this.secs < 0 ? '-' : ''
      out += 'T'
      const h = Math.floor(s / 3600)
      s -= h * 3600
      const mi = Math.floor(s / 60)
      s = parseFloat((s - mi * 60).toFixed(9))
      if (h) out += sign + h + 'H'
      if (mi) out += sign + mi + 'M'
      if (s) out += sign + s + 'S'
    }
    return out === 'P' ? (this.y === 0 && this.m === 0 && this.d === 0 ? 'PT0S' : out) : out
  }

  toJSON() {
    return this.toString()
  }
}

export function addPeriod(t, p, sign = 1) {
  let { y, mo, d } = t
  if (t.hasDate()) {
    const months = y * 12 + (mo - 1) + sign * (p.y * 12 + p.m)
    y = Math.floor(months / 12)
    mo = (months % 12 + 12) % 12 + 1
    d = Math.min(d, daysInMonth(y, mo))
    const nd = new Date(Date.UTC(y, mo - 1, d + sign * p.d))
    y = nd.getUTCFullYear()
    mo = nd.getUTCMonth() + 1
    d = nd.getUTCDate()
  } else if (p.y || p.m || p.d) {
    throw new DwError(`Cannot add ${p} to a ${t.kind}`)
  }
  if (!p.secs) return t.with(t.kind, { y, mo, d })
  if (!t.hasTime()) {
    // Adding hours to a Date moves whole days only, as Java's LocalDate.plus(Duration) refuses; keep the date part.
    const nd = new Date(Date.UTC(y, mo - 1, d) + Math.trunc((sign * p.secs) / 86400) * 86400000)
    return t.with('Date', { y: nd.getUTCFullYear(), mo: nd.getUTCMonth() + 1, d: nd.getUTCDate() })
  }
  const totalNs = BigInt(Math.round(sign * p.secs * 1e9)) + BigInt(t.ns)
  const base = t.hasDate() ? Date.UTC(y, mo - 1, d, t.h, t.mi, t.s) : (t.h * 3600 + t.mi * 60 + t.s) * 1000
  const msDelta = Number(totalNs / 1000000n)
  let ns = Number(totalNs % 1000000n)
  let ms = base + msDelta
  if (ns < 0) {
    ns += 1e6
    ms -= 1
  }
  const nd = new Date(ms)
  const fields = {
    h: nd.getUTCHours(),
    mi: nd.getUTCMinutes(),
    s: nd.getUTCSeconds(),
    ns: nd.getUTCMilliseconds() * 1e6 + ns,
  }
  if (t.hasDate()) Object.assign(fields, { y: nd.getUTCFullYear(), mo: nd.getUTCMonth() + 1, d: nd.getUTCDate() })
  return t.with(t.kind, fields)
}

export function diffTemporal(a, b) {
  // Date minus Date is a Duration in the engine: it prints as PT336H, not P14D, and .days still gives 14.
  if (a.kind === 'Date' && b.kind === 'Date') return new DwPeriod(0, 0, 0, Math.round((a.localMillis() - b.localMillis()) / 86400000) * 86400)
  const ns = (a.epochMillis() - b.epochMillis()) * 1e6 + ((a.ns % 1e6) - (b.ns % 1e6))
  return new DwPeriod(0, 0, 0, ns / 1e9)
}

// Java DateTimeFormatter patterns: split into [letter run | literal] tokens.
function patternTokens(pattern) {
  const out = []
  let i = 0
  while (i < pattern.length) {
    const c = pattern[i]
    if (c === "'") {
      let j = i + 1
      let lit = ''
      while (j < pattern.length) {
        if (pattern[j] === "'") {
          if (pattern[j + 1] === "'") {
            lit += "'"
            j += 2
            continue
          }
          break
        }
        lit += pattern[j++]
      }
      out.push({ lit: i + 1 === j && pattern[j] === "'" ? "'" : lit })
      i = j + 1
    } else if (/[A-Za-z]/.test(c)) {
      let j = i
      while (pattern[j] === c) j++
      out.push({ ch: c, n: j - i })
      i = j
    } else if (c === '[' || c === ']') {
      i++ // optional sections: printed when the field exists, which for our values is always
    } else {
      out.push({ lit: c })
      i++
    }
  }
  return out
}

function need(t, ok, field) {
  if (!ok) throw new DwError(`Unsupported field: ${field} for a ${t.kind}`)
}

export function formatTemporal(t, pattern) {
  let out = ''
  for (const tok of patternTokens(pattern)) {
    if (tok.lit !== undefined) {
      out += tok.lit
      continue
    }
    const { ch, n } = tok
    switch (ch) {
      case 'y':
      case 'u':
        need(t, t.hasDate(), 'YearOfEra')
        out += n === 2 ? pad(t.y % 100) : pad(t.y, n)
        break
      case 'M':
      case 'L':
        need(t, t.hasDate(), 'MonthOfYear')
        out += n >= 4 ? MONTHS[t.mo - 1] : n === 3 ? MONTHS[t.mo - 1].slice(0, 3) : pad(t.mo, n)
        break
      case 'd':
        need(t, t.hasDate(), 'DayOfMonth')
        out += pad(t.d, n)
        break
      case 'D':
        need(t, t.hasDate(), 'DayOfYear')
        out += pad(t.field('dayOfYear'), n)
        break
      case 'E': {
        need(t, t.hasDate(), 'DayOfWeek')
        const name = DAYS[new Date(Date.UTC(t.y, t.mo - 1, t.d)).getUTCDay()]
        out += n >= 4 ? name : name.slice(0, 3)
        break
      }
      case 'a':
        need(t, t.hasTime(), 'AmPmOfDay')
        out += t.h < 12 ? 'AM' : 'PM'
        break
      case 'H':
        need(t, t.hasTime(), 'HourOfDay')
        out += pad(t.h, n)
        break
      case 'k':
        need(t, t.hasTime(), 'ClockHourOfDay')
        out += pad(t.h === 0 ? 24 : t.h, n)
        break
      case 'h':
        need(t, t.hasTime(), 'ClockHourOfAmPm')
        out += pad(t.h % 12 === 0 ? 12 : t.h % 12, n)
        break
      case 'K':
        need(t, t.hasTime(), 'HourOfAmPm')
        out += pad(t.h % 12, n)
        break
      case 'm':
        need(t, t.hasTime(), 'MinuteOfHour')
        out += pad(t.mi, n)
        break
      case 's':
        need(t, t.hasTime(), 'SecondOfMinute')
        out += pad(t.s, n)
        break
      case 'S':
        need(t, t.hasTime(), 'NanoOfSecond')
        out += String(t.ns).padStart(9, '0').slice(0, n).padEnd(n, '0')
        break
      case 'n':
        out += String(t.ns)
        break
      case 'A':
        out += String(t.h * 3600000 + t.mi * 60000 + t.s * 1000 + Math.floor(t.ns / 1e6))
        break
      case 'X':
      case 'x':
      case 'Z': {
        need(t, t.hasOffset(), 'OffsetSeconds')
        const full = offsetText(t.off, ch === 'X')
        if (full === 'Z') out += 'Z'
        else if (ch === 'Z') out += n >= 5 ? full : full.replace(':', '')
        else if (n === 1) out += full.slice(0, 3) + (t.off % 3600 ? full.slice(4) : '')
        else if (n === 2 || n === 4) out += full.replace(':', '')
        else out += full
        break
      }
      case 'z':
      case 'V':
      case 'O':
        need(t, t.hasOffset(), 'ZoneId')
        out += t.zone || (t.off === 0 ? (ch === 'O' ? 'GMT' : 'Z') : offsetText(t.off))
        break
      case 'G':
        out += 'AD'
        break
      default:
        throw new DwError(`Unknown pattern letter '${ch}' in "${pattern}"`)
    }
  }
  return out
}

// Parse text with a Java pattern into the requested kind.
export function parseTemporal(text, pattern, kind) {
  const groups = []
  let re = '^'
  for (const tok of patternTokens(pattern)) {
    if (tok.lit !== undefined) {
      re += tok.lit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      continue
    }
    const { ch, n } = tok
    let part
    if ('yu'.includes(ch)) part = n === 2 ? '(\\d{2})' : n >= 4 ? '([+-]?\\d{4,})' : '(\\d+)'
    else if ('ML'.includes(ch)) part = n >= 4 ? '([A-Za-z]+)' : n === 3 ? '([A-Za-z]{3})' : n === 2 ? '(\\d{2})' : '(\\d{1,2})'
    else if ('dHhkKms'.includes(ch)) part = n === 2 ? '(\\d{2})' : '(\\d{1,2})'
    else if (ch === 'D') part = '(\\d{1,3})'
    else if (ch === 'S') part = `(\\d{${n}})`
    else if (ch === 'n') part = '(\\d+)'
    else if (ch === 'a') part = '([AaPp][Mm])'
    else if (ch === 'E') part = '([A-Za-z]+)'
    else if ('XxZ'.includes(ch)) part = '(Z|[+-]\\d{2}(?::?\\d{2})?)'
    else if ('zVO'.includes(ch)) part = '([A-Za-z_/+\\-0-9:]+)'
    else throw new DwError(`Unknown pattern letter '${ch}' in "${pattern}"`)
    re += part
    groups.push(tok)
  }
  const m = new RegExp(re + '$').exec(String(text))
  if (!m) throw new DwError(`Cannot coerce String ("${text}") to ${kind} with format "${pattern}"`)
  const f = {}
  let pm = null
  let zone = null
  groups.forEach((tok, i) => {
    const v = m[i + 1]
    switch (tok.ch) {
      case 'y':
      case 'u':
        f.y = tok.n === 2 ? 2000 + Number(v) : Number(v)
        break
      case 'M':
      case 'L':
        if (/^\d+$/.test(v)) f.mo = Number(v)
        else {
          const idx = MONTHS.findIndex((mm) => mm.toLowerCase().startsWith(v.toLowerCase().slice(0, 3)))
          if (idx < 0) throw new DwError(`Cannot parse month "${v}"`)
          f.mo = idx + 1
        }
        break
      case 'd':
        f.d = Number(v)
        break
      case 'H':
      case 'k':
        f.h = Number(v) % 24
        break
      case 'h':
      case 'K':
        f.h = Number(v) % 12
        break
      case 'm':
        f.mi = Number(v)
        break
      case 's':
        f.s = Number(v)
        break
      case 'S':
        f.ns = Number(v.padEnd(9, '0'))
        break
      case 'n':
        f.ns = Number(v)
        break
      case 'a':
        pm = v.toUpperCase() === 'PM'
        break
      case 'X':
      case 'x':
      case 'Z':
        f.off = offsetSeconds(v)
        zone = zone ?? null
        break
      case 'z':
      case 'V':
      case 'O':
        zone = v
        break
    }
  })
  if (pm !== null) f.h = (f.h % 12) + (pm ? 12 : 0)
  if (f.mo !== undefined && (f.mo < 1 || f.mo > 12)) throw new DwError(`Invalid month in "${text}"`)
  if (f.d !== undefined && (f.d < 1 || f.d > 31)) throw new DwError(`Invalid date "${text}"`)
  // Like Java's smart resolver: a day that exists in some month but not this one moves to the month's last day.
  if (f.d !== undefined && f.y !== undefined && f.mo !== undefined) f.d = Math.min(f.d, daysInMonth(f.y, f.mo))
  if (zone && f.off === undefined) {
    f.off = zoneOffset(zone, Date.UTC(f.y ?? 1970, (f.mo ?? 1) - 1, f.d ?? 1, f.h ?? 0, f.mi ?? 0, f.s ?? 0))
    f.zone = zone
  }
  const t = new DwTemporal(kind, f)
  // The JSON writer prints a value parsed with a format in that format again. Arithmetic (with()) drops it.
  t.fmt = pattern
  return t
}
