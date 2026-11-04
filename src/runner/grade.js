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

export function mimeToLanguage(mime = '') {
  if (mime.includes('json')) return 'json'
  if (mime.includes('xml')) return 'xml'
  return 'plaintext'
}
