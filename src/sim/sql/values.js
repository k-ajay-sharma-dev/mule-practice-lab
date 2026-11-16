// How values behave: comparison, arithmetic, dates and the built-in functions. Values are plain JavaScript values;
// dates travel as ISO strings, and an INTERVAL is { interval: true, ms, months }.
import { SqlError, SimUnsupported } from '../errors.js'

export const DEFAULT_NOW = '2026-11-13T10:00:00Z'

const DATE_RE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?\s*(Z|[+-]\d{2}(:?\d{2})?)?)?$/
export const isDate = (v) => typeof v === 'string' && DATE_RE.test(v)
const isDateOnly = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
const isInterval = (v) => v !== null && typeof v === 'object' && v.interval === true

// A timestamp with no zone is read as UTC, so the result never depends on the learner's time zone.
export function dateMs(v) {
  let s = v.trim().replace(' ', 'T')
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s += 'T00:00:00Z'
  else if (!/(Z|[+-]\d{2}(:?\d{2})?)$/.test(s)) s += 'Z'
  else s = s.replace(/([+-]\d{2})(\d{2})$/, '$1:$2')
  return Date.parse(s)
}
export const isoOf = (ms) => new Date(ms).toISOString().replace('.000Z', 'Z')

const tidy = (n) => (Number.isFinite(n) && !Number.isInteger(n) ? parseFloat(n.toPrecision(15)) : n)

export function toNumber(v, what = 'value') {
  if (typeof v === 'number') return v
  if (typeof v === 'boolean') return v ? 1 : 0
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v)
  throw new SqlError(`Invalid number: the ${what} ${JSON.stringify(v)} is not a number`)
}
const numeric = (v) => typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)))

// -1, 0, 1, or null when either side is null (SQL's unknown)
export function compare(a, b) {
  if (a === null || a === undefined || b === null || b === undefined) return null
  if (typeof a === 'number' && typeof b === 'number') return Math.sign(a - b)
  if (typeof a === 'boolean' || typeof b === 'boolean') {
    const bool = (v) => (typeof v === 'boolean' ? v : typeof v === 'number' ? v !== 0 : /^(true|t|1|y|yes)$/i.test(String(v)))
    return Math.sign(Number(bool(a)) - Number(bool(b)))
  }
  if ((typeof a === 'number' && numeric(b)) || (typeof b === 'number' && numeric(a))) return Math.sign(Number(a) - Number(b))
  if (isDate(a) && isDate(b)) return Math.sign(dateMs(a) - dateMs(b))
  if (typeof a === 'object' || typeof b === 'object') {
    const sa = JSON.stringify(a)
    const sb = JSON.stringify(b)
    return sa === sb ? 0 : sa < sb ? -1 : 1
  }
  const sa = String(a)
  const sb = String(b)
  return sa === sb ? 0 : sa < sb ? -1 : 1
}

// three-valued truth: true, false or null
export function truth(v, where = 'WHERE') {
  if (v === null || v === undefined) return null
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return v !== 0
  throw new SqlError(`The ${where} condition must be true or false, but it gives ${JSON.stringify(v)}`)
}

function addToDate(date, delta, sign) {
  const ms = dateMs(date)
  if (Number.isNaN(ms)) throw new SqlError(`Invalid date ${JSON.stringify(date)}`)
  if (isInterval(delta)) {
    const d = new Date(ms + sign * delta.ms)
    if (delta.months) d.setUTCMonth(d.getUTCMonth() + sign * delta.months)
    const out = isoOf(d.getTime())
    return isDateOnly(date) && delta.ms % 8.64e7 === 0 ? out.slice(0, 10) : out
  }
  const days = toNumber(delta, 'number of days')
  const out = isoOf(ms + sign * days * 8.64e7)
  return isDateOnly(date) && Number.isInteger(days) ? out.slice(0, 10) : out
}

export function arith(op, a, b) {
  if (op === '||') return (a ?? '') === '' && (b ?? '') === '' && (a === null || b === null) ? null : `${text(a)}${text(b)}`
  if (a === null || a === undefined || b === null || b === undefined) return null
  if (op === '+' || op === '-') {
    const sign = op === '+' ? 1 : -1
    if (isDate(a) && (isInterval(b) || numeric(b))) return addToDate(a, b, sign)
    if (op === '+' && isDate(b) && (isInterval(a) || numeric(a))) return addToDate(b, a, 1)
    if (op === '-' && isDate(a) && isDate(b)) return tidy((dateMs(a) - dateMs(b)) / 8.64e7) // Oracle: days between
    if (isInterval(a) && isInterval(b)) return { interval: true, ms: a.ms + sign * b.ms, months: a.months + sign * b.months }
  }
  if (isInterval(a) || isInterval(b)) throw new SqlError(`Cannot apply ${op} to an INTERVAL and ${JSON.stringify(isInterval(a) ? b : a)}`)
  const x = toNumber(a)
  const y = toNumber(b)
  switch (op) {
    case '+': return tidy(x + y)
    case '-': return tidy(x - y)
    case '*': return tidy(x * y)
    case '/': if (y === 0) throw new SqlError('Division by zero'); return tidy(x / y)
    case '%': if (y === 0) throw new SqlError('Division by zero'); return tidy(x % y)
  }
  throw new SqlError(`Unknown operator ${op}`)
}

const text = (v) => (v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v))

export function likeToRegex(pattern, escape, ci) {
  let re = ''
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]
    if (escape && c === escape && i + 1 < pattern.length) { re += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); continue }
    if (c === '%') re += '[\\s\\S]*'
    else if (c === '_') re += '[\\s\\S]'
    else re += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${re}$`, ci ? 'i' : '')
}

export function cast(v, type) {
  if (v === null || v === undefined) return null
  const base = type.split(' ')[0]
  if (['INT', 'INTEGER', 'BIGINT', 'SMALLINT', 'TINYINT', 'INT2', 'INT4', 'INT8'].includes(base)) return Math.trunc(toNumber(v))
  if (['NUMBER', 'NUMERIC', 'DECIMAL', 'FLOAT', 'REAL', 'DOUBLE', 'MONEY', 'FLOAT4', 'FLOAT8'].includes(base)) return toNumber(v)
  if (['VARCHAR', 'VARCHAR2', 'NVARCHAR', 'NVARCHAR2', 'CHAR', 'NCHAR', 'TEXT', 'CLOB', 'NCLOB', 'CHARACTER', 'STRING'].includes(base)) return text(v)
  if (base === 'DATE') {
    if (!isDate(v)) throw new SqlError(`Invalid date ${JSON.stringify(v)}`)
    return v.slice(0, 10)
  }
  if (base === 'TIMESTAMP' || base === 'DATETIME' || base === 'DATETIME2' || base === 'TIMESTAMPTZ') {
    if (!isDate(v)) throw new SqlError(`Invalid timestamp ${JSON.stringify(v)}`)
    return isoOf(dateMs(v))
  }
  if (base === 'BOOLEAN' || base === 'BOOL' || base === 'BIT') return compare(v, true) === 0
  if (base === 'JSON' || base === 'JSONB' || base === 'XML' || base === 'XMLTYPE' || base === 'UUID') return v
  throw new SimUnsupported(`CAST to ${type}`)
}

function regexpSubstr(src, pattern, position = 1, occurrence = 1) {
  if (src === null || pattern === null) return null
  const s = text(src).slice(toNumber(position) - 1)
  const re = new RegExp(pattern, 'g')
  let m
  let n = 0
  while ((m = re.exec(s))) {
    if (m[0] === '') { re.lastIndex++; continue }
    if (++n === toNumber(occurrence)) return m[0]
  }
  return null
}

// Scalar functions by upper-case name. now is the fixed time the run uses.
export function callFunction(name, args, now) {
  const a = args
  const nullIn = (...xs) => xs.some((x) => x === null || x === undefined)
  switch (name) {
    case 'NOW': case 'GETDATE': case 'GETUTCDATE': case 'SYSUTCDATETIME': case 'SYSDATETIME': case 'CURRENT_TIMESTAMP':
    case 'LOCALTIMESTAMP': case 'SYSTIMESTAMP': case 'CLOCK_TIMESTAMP': case 'TRANSACTION_TIMESTAMP': case 'STATEMENT_TIMESTAMP':
    case 'UTC_TIMESTAMP':
      return now
    case 'CURDATE': case 'CURRENT_DATE': return now.slice(0, 10)
    case 'UPPER': case 'UCASE': return nullIn(a[0]) ? null : text(a[0]).toUpperCase()
    case 'LOWER': case 'LCASE': return nullIn(a[0]) ? null : text(a[0]).toLowerCase()
    case 'TRIM': case 'BTRIM': return nullIn(a[0]) ? null : text(a[0]).trim()
    case 'LTRIM': return nullIn(a[0]) ? null : text(a[0]).trimStart()
    case 'RTRIM': return nullIn(a[0]) ? null : text(a[0]).trimEnd()
    case 'LENGTH': case 'LEN': case 'CHAR_LENGTH': case 'CHARACTER_LENGTH': return nullIn(a[0]) ? null : text(a[0]).length
    case 'SUBSTR': case 'SUBSTRING': {
      if (nullIn(a[0], a[1])) return null
      const s = text(a[0])
      let start = toNumber(a[1])
      if (start < 0) start = s.length + start + 1 // Oracle counts from the end
      if (start === 0) start = 1
      return a[2] === undefined ? s.slice(start - 1) : s.substr(start - 1, Math.max(0, toNumber(a[2])))
    }
    case 'LEFT': return nullIn(a[0], a[1]) ? null : text(a[0]).slice(0, toNumber(a[1]))
    case 'RIGHT': return nullIn(a[0], a[1]) ? null : toNumber(a[1]) <= 0 ? '' : text(a[0]).slice(-toNumber(a[1]))
    case 'REPLACE': return nullIn(a[0]) ? null : text(a[0]).split(text(a[1])).join(text(a[2] ?? ''))
    case 'CONCAT': return a.map(text).join('')
    case 'INSTR': case 'STRPOS': return nullIn(a[0], a[1]) ? null : text(a[0]).indexOf(text(a[1])) + 1
    case 'LPAD': case 'RPAD': {
      if (nullIn(a[0], a[1])) return null
      const s = text(a[0])
      const n = toNumber(a[1])
      const pad = a[2] === undefined ? ' ' : text(a[2])
      if (s.length >= n) return s.slice(0, n)
      return name === 'LPAD' ? s.padStart(n, pad) : s.padEnd(n, pad)
    }
    case 'COALESCE': case 'NVL': case 'IFNULL': case 'ISNULL':
      return a.find((x) => x !== null && x !== undefined) ?? null
    case 'NVL2': return a[0] !== null && a[0] !== undefined ? a[1] : a[2]
    case 'NULLIF': return compare(a[0], a[1]) === 0 ? null : a[0]
    case 'GREATEST': case 'LEAST': {
      if (a.some((x) => x === null || x === undefined)) return null
      return a.reduce((best, x) => ((name === 'GREATEST' ? compare(x, best) > 0 : compare(x, best) < 0) ? x : best))
    }
    case 'ABS': return nullIn(a[0]) ? null : Math.abs(toNumber(a[0]))
    case 'CEIL': case 'CEILING': return nullIn(a[0]) ? null : Math.ceil(toNumber(a[0]))
    case 'FLOOR': return nullIn(a[0]) ? null : Math.floor(toNumber(a[0]))
    case 'ROUND': {
      if (nullIn(a[0])) return null
      const f = 10 ** (a[1] === undefined ? 0 : toNumber(a[1]))
      const x = toNumber(a[0])
      return tidy((Math.sign(x) * Math.round(Math.abs(x) * f)) / f)
    }
    case 'MOD': return nullIn(a[0], a[1]) ? null : arith('%', a[0], a[1])
    case 'POWER': return nullIn(a[0], a[1]) ? null : tidy(toNumber(a[0]) ** toNumber(a[1]))
    case 'SQRT': return nullIn(a[0]) ? null : Math.sqrt(toNumber(a[0]))
    case 'SIGN': return nullIn(a[0]) ? null : Math.sign(toNumber(a[0]))
    case 'TRUNC': {
      if (nullIn(a[0])) return null
      if (isDate(a[0])) return isoOf(Math.floor(dateMs(a[0]) / 8.64e7) * 8.64e7)
      const f = 10 ** (a[1] === undefined ? 0 : toNumber(a[1]))
      return tidy(Math.trunc(toNumber(a[0]) * f) / f)
    }
    case 'TO_NUMBER': return nullIn(a[0]) ? null : toNumber(a[0])
    case 'TO_CHAR': {
      if (nullIn(a[0])) return null
      if (a[1] !== undefined && isDate(a[0])) return formatDate(a[0], text(a[1]))
      return text(a[0])
    }
    case 'TO_DATE': case 'TO_TIMESTAMP': {
      if (nullIn(a[0])) return null
      if (!isDate(a[0])) throw new SimUnsupported(`${name} with a non-ISO date text (${JSON.stringify(a[0])})`)
      return a[0]
    }
    case 'DATE': return nullIn(a[0]) ? null : cast(a[0], 'DATE')
    case 'EXTRACT': {
      if (nullIn(a[1])) return null
      const d = new Date(dateMs(text(a[1])))
      const parts = { YEAR: d.getUTCFullYear(), MONTH: d.getUTCMonth() + 1, DAY: d.getUTCDate(), HOUR: d.getUTCHours(), MINUTE: d.getUTCMinutes(), SECOND: d.getUTCSeconds() }
      if (!(a[0] in parts)) throw new SimUnsupported(`EXTRACT(${a[0]} ...)`)
      return parts[a[0]]
    }
    case 'STRING_TO_ARRAY': return nullIn(a[0]) ? null : text(a[0]).split(text(a[1]))
    case 'REGEXP_SUBSTR': return regexpSubstr(...a)
    case 'REGEXP_LIKE': return nullIn(a[0], a[1]) ? null : new RegExp(text(a[1]), /i/.test(a[2] ?? '') ? 'i' : '').test(text(a[0]))
    case 'REGEXP_REPLACE': return nullIn(a[0], a[1]) ? null : text(a[0]).replace(new RegExp(text(a[1]), 'g'), text(a[2] ?? ''))
    case 'GEN_RANDOM_UUID': case 'UUID': case 'NEWID': case 'SYS_GUID':
      return '00000000-0000-4000-8000-000000000001'
    case 'DECODE': {
      for (let i = 1; i + 1 < a.length; i += 2) if (compare(a[0], a[i]) === 0 || (a[0] === null && a[i] === null)) return a[i + 1]
      return a.length % 2 === 0 ? a[a.length - 1] : null
    }
  }
  throw new SimUnsupported(`the SQL function ${name}()`)
}

function formatDate(v, fmt) {
  const d = new Date(dateMs(v))
  const pad = (n, w = 2) => String(n).padStart(w, '0')
  const map = {
    YYYY: d.getUTCFullYear(), MM: pad(d.getUTCMonth() + 1), DD: pad(d.getUTCDate()),
    HH24: pad(d.getUTCHours()), MI: pad(d.getUTCMinutes()), SS: pad(d.getUTCSeconds()),
  }
  return fmt.replace(/YYYY|MM|DD|HH24|MI|SS/g, (k) => map[k])
}
