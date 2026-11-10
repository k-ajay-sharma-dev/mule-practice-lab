// Compares runner output with an expected value, ignoring formatting differences.
export function outputsMatch(actual, expected, mime = '') {
  if (mime.includes('json')) {
    try {
      return deepEqual(JSON.parse(actual), JSON.parse(expected))
    } catch {
      // Not valid JSON on one side; fall back to text comparison.
    }
  }
  if (mime.includes('xml')) {
    return normalizeXml(actual) === normalizeXml(expected)
  }
  return normalizeText(actual) === normalizeText(expected)
}

const normalizeText = (s) =>
  s.replace(/\r\n/g, '\n').split('\n').map((l) => l.trimEnd()).join('\n').trim()

// Attribute order (namespace declarations included) carries no meaning in XML, so sort each tag's attributes.
const ATTR = /([^\s=/>]+)\s*=\s*("[^"]*"|'[^']*')/g
const sortAttributes = (xml) =>
  xml.replace(/<([A-Za-z_][\w.:-]*)(\s[^<>]*?)?(\/?)>/g, (tag, name, attrs = '', selfClose) => {
    const list = [...attrs.matchAll(ATTR)].map(([, k, v]) => `${k}="${v.slice(1, -1)}"`).sort()
    return `<${name}${list.map((a) => ` ${a}`).join('')}${selfClose}>`
  })

const normalizeXml = (s) =>
  sortAttributes(normalizeText(s).replace(/^<\?xml[^>]*\?>/, '').replace(/>\s+</g, '><').trim())

function deepEqual(a, b) {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a)) return a.length === b.length && a.every((x, i) => deepEqual(x, b[i]))
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  return keysA.length === keysB.length && keysA.every((k) => Object.hasOwn(b, k) && deepEqual(a[k], b[k]))
}

// Where a JSON result differs from the expected one, as short lines such as
// "parcelCount: expected 0, got null". Empty when the output is not JSON or nothing can be pointed at.
export function jsonDifferences(actual, expected, limit = 6) {
  let a, b
  try {
    a = JSON.parse(actual)
    b = JSON.parse(expected)
  } catch {
    return []
  }
  const found = []
  const show = (v) => (v === undefined ? 'nothing' : JSON.stringify(v).slice(0, 80))
  const walk = (x, y, path) => {
    if (found.length >= limit || deepEqual(x, y)) return
    const here = path || 'the whole output'
    const bothObjects = x && y && typeof x === 'object' && typeof y === 'object' && Array.isArray(x) === Array.isArray(y)
    if (!bothObjects) return found.push(`${here}: expected ${show(y)}, got ${show(x)}`)
    if (Array.isArray(y)) {
      const items = (n) => `${n} item${n === 1 ? '' : 's'}`
      if (x.length !== y.length) found.push(`${here}: expected ${items(y.length)}, got ${items(x.length)}`)
      for (let i = 0; i < Math.min(x.length, y.length); i++) walk(x[i], y[i], `${path}[${i}]`)
      return
    }
    for (const k of Object.keys(y)) {
      if (!Object.hasOwn(x, k)) found.length < limit && found.push(`${path ? `${path}.` : ''}${k}: missing from your output`)
      else walk(x[k], y[k], path ? `${path}.${k}` : k)
    }
    for (const k of Object.keys(x)) {
      if (!Object.hasOwn(y, k) && found.length < limit) found.push(`${path ? `${path}.` : ''}${k}: not expected`)
    }
  }
  walk(a, b, '')
  return found
}

export function mimeToLanguage(mime = '') {
  if (mime.includes('json')) return 'json'
  if (mime.includes('xml')) return 'xml'
  return 'plaintext'
}
