// Small helpers the simulator shares: copying values, comparing them, and describing them in a line.

// A deep copy of plain data. Functions (an endpoint that answers from the request) and other objects that are not
// plain data are kept as they are, since structuredClone would refuse them and JSON would drop them.
export function copy(value) {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(copy)
  if (value instanceof Date) return new Date(value.getTime())
  // values that are not plain data (a DataWeave DateTime, a Uint8Array of bytes) are kept as they are: they are not
  // changed in place, and a structured clone would turn a DataWeave value into a plain object
  const proto = Object.getPrototypeOf(value)
  if (proto !== Object.prototype && proto !== null) return value
  // hidden keys (DataWeave's entry list and XML attributes) stay hidden in the copy
  const out = {}
  for (const k of Reflect.ownKeys(value)) {
    const d = Object.getOwnPropertyDescriptor(value, k)
    if (d.enumerable) out[k] = copy(value[k])
    else Object.defineProperty(out, k, { value: copy(value[k]), enumerable: false, writable: true, configurable: true })
  }
  return out
}

export const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

export function deepEqual(a, b) {
  if (a === b) return true
  if (typeof a === 'number' && typeof b === 'number') return Number.isNaN(a) && Number.isNaN(b)
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    return a.every((x, i) => deepEqual(x, b[i]))
  }
  if (isObject(a) && isObject(b)) {
    const ka = Object.keys(a)
    const kb = Object.keys(b)
    return ka.length === kb.length && ka.every((k) => deepEqual(a[k], b[k]))
  }
  // a number and the same number written as text count as equal: '503' set in a variable is status 503
  if ((typeof a === 'number' && typeof b === 'string') || (typeof a === 'string' && typeof b === 'number')) return String(a) === String(b)
  return false
}

// Does `have` contain everything `want` asks for? Objects match on the keys `want` names, arrays on each item of
// `want` being found in `have` (in any order), and a string in `want` that starts with ~ matches as "contains".
export function contains(have, want) {
  if (typeof want === 'string' && want.startsWith('~')) return typeof have === 'string' && have.toLowerCase().includes(want.slice(1).toLowerCase())
  if (Array.isArray(want)) return Array.isArray(have) && want.every((w) => have.some((h) => contains(h, w)))
  if (isObject(want)) return isObject(have) && Object.entries(want).every(([k, w]) => contains(have[k], w))
  return deepEqual(have, want)
}

// One short line for a value, for the trace: {"orderId":"A-1",...} or "142 rows".
export function brief(value, max = 90) {
  if (value === undefined) return 'nothing'
  if (value === null) return 'null'
  if (Array.isArray(value) && value.length > 3) return `${value.length} items`
  let text
  try {
    text = typeof value === 'string' ? JSON.stringify(value) : JSON.stringify(value)
  } catch {
    text = String(value)
  }
  if (text === undefined) text = String(value)
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

// The value at a dotted path such as "order.lines" in an object, or undefined.
export function at(value, path) {
  return String(path)
    .split('.')
    .filter(Boolean)
    .reduce((v, k) => (v == null ? undefined : v[k]), value)
}
