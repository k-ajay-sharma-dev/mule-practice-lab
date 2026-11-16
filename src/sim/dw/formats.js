// Readers and writers for the formats the simulator supports: JSON, CSV, XML, text, URL-encoded forms, and DataWeave
// notation for display. Readers build the evaluator's value model (order and repeated keys kept).
import { DwError, SimUnsupported } from '../errors.js'
import { DwTemporal, DwPeriod } from './dates.js'
import {
  DwKey, DwBinary, DwFn, makeObject, entriesOf, entry, isPlainObject, unwrap, numberToString, bytesToBase64, typeOf,
  AS_STRING,
} from './values.js'

export function baseMime(mime) {
  return String(mime || 'application/json').split(';')[0].trim().toLowerCase()
}

function textOf(input) {
  input = unwrap(input)
  if (input instanceof DwBinary) return new TextDecoder().decode(input.bytes)
  if (typeof input === 'string') return input
  return null
}

// read(): parse text in a format. A value that is not text is returned as it is (it was already read).
export function readValue(input, mime, options = {}) {
  const text = textOf(input)
  const m = baseMime(mime)
  if (text === null) {
    if (input === null || input === undefined) throw new DwError(`Cannot read Null as ${m}`)
    return input
  }
  if (m === 'application/json' || m.endsWith('+json')) return readJson(text)
  if (m === 'application/csv' || m === 'text/csv') return readCsv(text, options)
  if (m === 'application/xml' || m === 'text/xml' || m.endsWith('+xml')) return readXml(text)
  if (m === 'text/plain' || m === 'text/html') return text
  if (m === 'application/x-www-form-urlencoded') return readUrlEncoded(text)
  if (m === 'application/java' || m === 'application/octet-stream') return text
  if (m === 'application/yaml' || m === 'application/x-yaml' || m === 'text/yaml') return readYaml(text)
  throw new SimUnsupported(`reading the ${m} format`)
}

// Block-style YAML: nested maps and lists, flow lists/maps of scalars, comments. No anchors or block scalars.
export function readYaml(text) {
  const lines = []
  for (const raw of text.replace(/\r\n/g, '\n').split('\n')) {
    const noComment = raw.replace(/(^|\s)#(?=(?:[^"']|"[^"]*"|'[^']*')*$).*$/, '')
    if (!noComment.trim() || /^(---|\.\.\.)\s*$/.test(noComment.trim())) continue
    if (/^\s*[&*!]|:\s*[|>][-+]?\s*$/.test(noComment)) throw new SimUnsupported('YAML anchors, tags and block scalars')
    lines.push({ indent: noComment.length - noComment.trimStart().length, text: noComment.trim() })
  }
  let i = 0
  const scalar = (s) => {
    s = s.trim()
    if (s.startsWith('[') && s.endsWith(']')) return s.slice(1, -1).trim() ? splitFlow(s.slice(1, -1)).map(scalar) : []
    if (s.startsWith('{') && s.endsWith('}')) {
      return makeObject(s.slice(1, -1).trim() ? splitFlow(s.slice(1, -1)).map((p) => {
        const k = p.indexOf(':')
        return entry(unquote(p.slice(0, k).trim()), scalar(p.slice(k + 1)))
      }) : [])
    }
    if (/^"/.test(s)) return JSON.parse(s)
    if (/^'/.test(s)) return s.slice(1, -1).replace(/''/g, "'")
    if (s === '' || s === '~' || s === 'null' || s === 'Null' || s === 'NULL') return null
    if (/^(true|True|TRUE)$/.test(s)) return true
    if (/^(false|False|FALSE)$/.test(s)) return false
    if (/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) return Number(s)
    return s
  }
  const unquote = (k) => (/^["']/.test(k) ? scalar(k) : k)
  const keyOf = (t) => /^((?:"[^"]*"|'[^']*'|[^\s"'{[][^:]*?))\s*:(\s+|$)(.*)$/.exec(t)
  const block = (indent) => (lines[i].text === '-' || lines[i].text.startsWith('- ') ? seq(indent) : map(indent))
  const seq = (indent) => {
    const out = []
    while (i < lines.length && lines[i].indent === indent && (lines[i].text === '-' || lines[i].text.startsWith('- '))) {
      const rest = lines[i].text.slice(1).trimStart()
      if (!rest) {
        i++
        out.push(i < lines.length && lines[i].indent > indent ? block(lines[i].indent) : null)
      } else if (keyOf(rest) && !/^["'[{]/.test(rest)) {
        const col = indent + lines[i].text.length - rest.length
        lines[i] = { indent: col, text: rest }
        out.push(map(col))
      } else {
        out.push(scalar(rest))
        i++
      }
    }
    return out
  }
  const map = (indent) => {
    const es = []
    while (i < lines.length && lines[i].indent === indent && !lines[i].text.startsWith('- ')) {
      const m = keyOf(lines[i].text)
      if (!m) throw new DwError(`Invalid YAML at "${lines[i].text}"`)
      i++
      let value
      if (m[3].trim()) value = scalar(m[3])
      else if (i < lines.length && lines[i].indent > indent) value = block(lines[i].indent)
      else if (i < lines.length && lines[i].indent === indent && lines[i].text.startsWith('-')) value = seq(indent)
      else value = null
      es.push(entry(unquote(m[1].trim()), value))
    }
    return makeObject(es)
  }
  if (!lines.length) return null
  if (lines.length === 1 && !keyOf(lines[0].text) && !lines[0].text.startsWith('- ')) return scalar(lines[0].text)
  return block(lines[0].indent)
}

function splitFlow(s) {
  const out = []
  let cur = ''
  let depth = 0
  let q = null
  for (const c of s) {
    if (q) {
      if (c === q) q = null
    } else if (c === '"' || c === "'") q = c
    else if (c === '[' || c === '{') depth++
    else if (c === ']' || c === '}') depth--
    else if (c === ',' && depth === 0) {
      out.push(cur)
      cur = ''
      continue
    }
    cur += c
  }
  if (cur.trim()) out.push(cur)
  return out
}

export function readJson(text) {
  let i = 0
  const s = text
  const ws = () => {
    while (i < s.length && ' \t\n\r﻿'.includes(s[i])) i++
  }
  const fail = (msg) => {
    throw new DwError(`Invalid JSON input: ${msg} at position ${i}`)
  }
  const value = () => {
    ws()
    const c = s[i]
    if (c === '{') {
      i++
      const es = []
      ws()
      if (s[i] === '}') {
        i++
        return makeObject(es)
      }
      for (;;) {
        ws()
        if (s[i] !== '"') fail('expected a key')
        const k = str()
        ws()
        if (s[i] !== ':') fail("expected ':'")
        i++
        es.push(entry(k, value()))
        ws()
        if (s[i] === ',') {
          i++
          continue
        }
        if (s[i] === '}') {
          i++
          return makeObject(es)
        }
        fail("expected ',' or '}'")
      }
    }
    if (c === '[') {
      i++
      const arr = []
      ws()
      if (s[i] === ']') {
        i++
        return arr
      }
      for (;;) {
        arr.push(value())
        ws()
        if (s[i] === ',') {
          i++
          continue
        }
        if (s[i] === ']') {
          i++
          return arr
        }
        fail("expected ',' or ']'")
      }
    }
    if (c === '"') return str()
    const m = /^-?\d+(\.\d+)?([eE][+-]?\d+)?/.exec(s.slice(i, i + 64))
    if (m) {
      i += m[0].length
      return Number(m[0])
    }
    for (const [w, v] of [['true', true], ['false', false], ['null', null]]) {
      if (s.startsWith(w, i)) {
        i += w.length
        return v
      }
    }
    fail('unexpected character')
  }
  const str = () => {
    let out = ''
    i++
    while (i < s.length && s[i] !== '"') {
      if (s[i] === '\\') {
        const e = s[i + 1]
        if (e === 'u') {
          out += String.fromCharCode(parseInt(s.slice(i + 2, i + 6), 16))
          i += 6
          continue
        }
        out += { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', '/': '/', '\\': '\\', '"': '"' }[e] ?? e
        i += 2
        continue
      }
      out += s[i++]
    }
    if (s[i] !== '"') fail('unterminated string')
    i++
    return out
  }
  ws()
  if (i >= s.length) return null
  const v = value()
  ws()
  if (i < s.length) fail('unexpected trailing content')
  return v
}

export function readCsv(text, options = {}) {
  const sep = options.separator ?? ','
  const quote = options.quote ?? '"'
  const escape = options.escape ?? '"'
  const header = options.header !== false && options.header !== 'false'
  const rows = []
  let row = []
  let cell = ''
  let i = 0
  let quoted = false
  let any = false
  while (i < text.length) {
    const c = text[i]
    if (quoted) {
      if ((c === escape || c === '\\') && text[i + 1] === quote && (escape !== quote || c === quote)) {
        cell += quote
        i += 2
        continue
      }
      if (c === quote) {
        quoted = false
        i++
        continue
      }
      cell += c
      i++
      continue
    }
    if (c === quote && cell === '') {
      quoted = true
      any = true
      i++
      continue
    }
    if (text.startsWith(sep, i)) {
      row.push(cell)
      cell = ''
      any = true
      i += sep.length
      continue
    }
    if (c === '\r' || c === '\n') {
      if (any || cell !== '' || row.length) {
        row.push(cell)
        rows.push(row)
      }
      row = []
      cell = ''
      any = false
      i += c === '\r' && text[i + 1] === '\n' ? 2 : 1
      continue
    }
    cell += c
    any = true
    i++
  }
  if (any || cell !== '' || row.length) {
    row.push(cell)
    rows.push(row)
  }
  if (!header) return rows.map((r) => makeObject(r.map((v, j) => entry(`column_${j}`, v))))
  const [head, ...data] = rows
  if (!head) return []
  return data.map((r) => makeObject(head.map((h, j) => entry(h, r[j] ?? null))))
}

export function readUrlEncoded(text) {
  const es = []
  for (const part of text.split('&')) {
    if (!part) continue
    const [k, v = ''] = part.split('=')
    const dec = (x) => decodeURIComponent(x.replace(/\+/g, ' '))
    es.push(entry(dec(k), dec(v)))
  }
  return makeObject(es)
}

const XML_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

function decodeXml(s) {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|\w+);/g, (m, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10))
    return XML_ENTITIES[e] ?? m
  })
}

// XML → { root: ... }: text-only elements become strings, elements with children become objects, empty elements null.
// Attributes and namespaces live on the entry of the element's key.
export function readXml(text) {
  let i = 0
  const s = text
  const fail = (msg) => {
    throw new DwError(`Invalid XML input: ${msg} at position ${i}`)
  }
  const skipMisc = () => {
    for (;;) {
      while (i < s.length && /\s/.test(s[i])) i++
      if (s.startsWith('<?', i)) i = s.indexOf('?>', i) + 2
      else if (s.startsWith('<!--', i)) i = s.indexOf('-->', i) + 3
      else if (s.startsWith('<!DOCTYPE', i)) i = s.indexOf('>', i) + 1
      else return
      if (i < 2) fail('unterminated declaration')
    }
  }
  const splitName = (qn) => {
    const k = qn.indexOf(':')
    return k < 0 ? { prefix: null, local: qn } : { prefix: qn.slice(0, k), local: qn.slice(k + 1) }
  }
  const element = (nsScope) => {
    if (s[i] !== '<') fail("expected '<'")
    i++
    const nm = /^[^\s/>]+/.exec(s.slice(i, i + 200))
    if (!nm) fail('expected an element name')
    const qname = nm[0]
    i += qname.length
    const rawAttrs = []
    for (;;) {
      while (/\s/.test(s[i])) i++
      if (s[i] === '/' || s[i] === '>') break
      const am = /^([^\s=/>]+)\s*=\s*("([^"]*)"|'([^']*)')/.exec(s.slice(i))
      if (!am) fail('bad attribute')
      rawAttrs.push([am[1], decodeXml(am[3] ?? am[4])])
      i += am[0].length
    }
    const scope = { ...nsScope }
    for (const [k, v] of rawAttrs) {
      if (k === 'xmlns') scope[''] = v
      else if (k.startsWith('xmlns:')) scope[k.slice(6)] = v
    }
    const attrEntries = rawAttrs.filter(([k]) => k !== 'xmlns' && !k.startsWith('xmlns:')).map(([k, v]) => entry(splitName(k).local, v))
    const attrs = attrEntries.length ? makeObject(attrEntries) : null
    const { prefix, local } = splitName(qname)
    const uri = scope[prefix ?? '']
    const ns = uri ? { prefix, uri } : null
    if (s[i] === '/') {
      i += 2
      return entry(local, null, attrs, ns)
    }
    i++
    const children = []
    let txt = ''
    let hadContent = false
    for (;;) {
      if (i >= s.length) fail(`unclosed <${qname}>`)
      if (s.startsWith('</', i)) {
        const end = s.indexOf('>', i)
        i = end + 1
        break
      }
      if (s.startsWith('<!--', i)) {
        i = s.indexOf('-->', i) + 3
        continue
      }
      if (s.startsWith('<![CDATA[', i)) {
        const end = s.indexOf(']]>', i)
        txt += s.slice(i + 9, end)
        hadContent = true
        i = end + 3
        continue
      }
      if (s.startsWith('<?', i)) {
        i = s.indexOf('?>', i) + 2
        continue
      }
      if (s[i] === '<') {
        children.push(element(scope))
        continue
      }
      const next = s.indexOf('<', i)
      txt += decodeXml(s.slice(i, next < 0 ? s.length : next))
      hadContent = true
      i = next < 0 ? s.length : next
    }
    let value
    if (children.length) value = makeObject(children)
    else value = hadContent ? txt : null
    return entry(local, value, attrs, ns)
  }
  skipMisc()
  if (i >= s.length) return null
  const root = element({})
  skipMisc()
  return makeObject([root])
}

// ---------- writers ----------

// Writer options come from `options` or from parameters on the mime: 'application/csv; separator=";"'.
export function mimeOptions(mime) {
  const out = {}
  for (const part of String(mime || '').split(';').slice(1)) {
    const m = /^\s*([\w.]+)\s*=\s*(.*?)\s*$/.exec(part)
    if (!m) continue
    let v = m[2].replace(/^(["'])(.*)\1$/, '$2')
    if (v === 'true' || v === 'false') v = v === 'true'
    out[m[1]] = v
  }
  return out
}

export function render(value, mime, options = {}) {
  options = { ...mimeOptions(mime), ...(options || {}) }
  const m = baseMime(mime)
  if (m === 'application/json' || m.endsWith('+json')) return writeJson(value, options)
  if (m === 'text/plain' || m === 'text/html') return writeText(value)
  if (m === 'application/csv' || m === 'text/csv') return writeCsv(value, options)
  if (m === 'application/xml' || m === 'text/xml' || m.endsWith('+xml')) return writeXml(value, options)
  if (m === 'application/x-www-form-urlencoded') return writeUrlEncoded(value)
  if (m === 'application/java' || m === 'application/dw' || m === '*/*') return writeDw(value)
  throw new SimUnsupported(`writing the ${m} format`)
}

function scalarText(v) {
  v = unwrap(v)
  if (v === null || v === undefined) return null
  if (typeof v === 'string') return v
  if (typeof v === 'number') return numberToString(v)
  if (typeof v === 'boolean') return String(v)
  if (v instanceof DwKey) return v.name
  if (v instanceof DwTemporal || v instanceof DwPeriod) return v.toString()
  if (v instanceof DwBinary) return bytesToBase64(v.bytes)
  if (v instanceof RegExp) return v.source
  if (isPlainObject(v) && v[AS_STRING] !== undefined) return v[AS_STRING]
  return undefined
}

export function writeJson(value, options = {}) {
  const indent = options.indent === false || options.indent === 'false' ? '' : '  '
  const skipNull = options.skipNullOn
  const nl = indent ? '\n' : ''
  // DataWeave's compact JSON keeps the space after a colon: {"a": 1,"b": 2}
  const colon = ': '
  const w = (v, depth) => {
    v = unwrap(v)
    if (v === null || v === undefined) return 'null'
    if (typeof v === 'number') return Number.isFinite(v) ? numberToString(v).replace('E', 'e') : 'null'
    if (typeof v === 'boolean') return String(v)
    if (v instanceof DwFn) throw new DwError('Cannot write a Function as JSON')
    const pad = indent.repeat(depth + 1)
    const end = indent.repeat(depth)
    if (Array.isArray(v)) {
      let items = v
      if (skipNull === 'arrays' || skipNull === 'everywhere') items = items.filter((x) => unwrap(x) !== null)
      if (!items.length) return '[]'
      return '[' + nl + items.map((x) => pad + w(x, depth + 1)).join(',' + nl) + nl + end + ']'
    }
    if (isPlainObject(v) && v[AS_STRING] === undefined) {
      let es = entriesOf(v)
      if (skipNull === 'objects' || skipNull === 'everywhere') es = es.filter((e) => unwrap(e.value) !== null)
      if (!es.length) return '{}'
      return '{' + nl + es.map((e) => pad + JSON.stringify(e.key) + colon + w(e.value, depth + 1)).join(',' + nl) + nl + end + '}'
    }
    const t = scalarText(v)
    if (t === undefined) throw new DwError(`Cannot write ${typeOf(v)} as JSON`)
    return JSON.stringify(t)
  }
  return w(value, 0)
}

function writeText(value) {
  const t = scalarText(value)
  if (t === null) return ''
  if (t === undefined) throw new DwError(`The text/plain writer cannot write ${typeOf(value)}; it only writes String, Number, Boolean or dates`)
  return t
}

export function writeCsv(value, options = {}) {
  value = unwrap(value)
  if (value === null) return ''
  const rows = Array.isArray(value) ? value.map(unwrap) : [value]
  if (rows.some((r) => !isPlainObject(r))) throw new DwError('The CSV writer needs an Array of Objects')
  const sep = options.separator ?? ','
  const quote = options.quote ?? '"'
  const escape = options.escape ?? '\\'
  const header = options.header !== false && options.header !== 'false'
  const quoteAll = options.quoteValues === true || options.quoteValues === 'true'
  const lineSep = options.lineSeparator ?? '\n'
  const cell = (v, force) => {
    const t = scalarText(v)
    if (t === undefined) throw new DwError(`The CSV writer cannot write ${typeOf(v)} in a cell`)
    const s = t ?? ''
    if (force || s.includes(sep) || s.includes(quote) || s.includes('\n') || s.includes('\r')) {
      return quote + s.split(quote).join(escape + quote) + quote
    }
    return s
  }
  if (!rows.length) return ''
  const keys = entriesOf(rows[0]).map((e) => e.key)
  const lines = []
  if (header) lines.push(keys.map((k) => cell(k, options.quoteHeader === true || options.quoteHeader === 'true')).join(sep))
  for (const r of rows) {
    const es = entriesOf(r)
    lines.push(es.map((e) => cell(e.value, quoteAll)).join(sep))
  }
  return lines.join(lineSep)
}

const xmlEsc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const attrEsc = (s) => xmlEsc(s).replace(/"/g, '&quot;')

export function writeXml(value, options = {}) {
  value = unwrap(value)
  if (!isPlainObject(value)) throw new DwError(`The XML writer needs an Object with one root key, not ${typeOf(value)}`)
  const roots = entriesOf(value)
  if (roots.length !== 1) throw new DwError(`The XML writer needs exactly one root element, found ${roots.length}`)
  const indent = options.indent === false || options.indent === 'false' ? '' : '  '
  const nl = indent ? '\n' : ''
  const out = []
  const el = (e, depth, scope) => {
    const v = unwrap(e.value)
    if (Array.isArray(v)) {
      for (const item of v) el({ ...e, value: item }, depth, scope)
      return
    }
    const pad = indent.repeat(depth)
    let name = e.key
    let decl = ''
    const inner = { ...scope }
    if (e.ns) {
      name = e.ns.prefix ? `${e.ns.prefix}:${e.key}` : e.key
      const p = e.ns.prefix ?? ''
      if (inner[p] !== e.ns.uri) {
        decl += p ? ` xmlns:${p}="${attrEsc(e.ns.uri)}"` : ` xmlns="${attrEsc(e.ns.uri)}"`
        inner[p] = e.ns.uri
      }
    }
    let attrs = ''
    if (e.attrs) {
      for (const a of entriesOf(e.attrs)) {
        const t = scalarText(a.value)
        if (t === null || t === undefined) continue
        let an = a.key
        if (a.ns && a.ns.prefix) {
          an = `${a.ns.prefix}:${a.key}`
          if (inner[a.ns.prefix] !== a.ns.uri) {
            decl += ` xmlns:${a.ns.prefix}="${attrEsc(a.ns.uri)}"`
            inner[a.ns.prefix] = a.ns.uri
          }
        }
        attrs += ` ${an}="${attrEsc(t)}"`
      }
    }
    const open = `<${name}${decl}${attrs}`
    if (v === null || v === undefined) {
      out.push(`${pad}${open}/>`)
      return
    }
    if (isPlainObject(v) && v[AS_STRING] === undefined) {
      const kids = entriesOf(v)
      if (!kids.length) {
        out.push(`${pad}${open}/>`)
        return
      }
      out.push(`${pad}${open}>`)
      for (const k of kids) el(k, depth + 1, inner)
      out.push(`${pad}</${name}>`)
      return
    }
    const t = scalarText(v)
    if (t === undefined) throw new DwError(`The XML writer cannot write ${typeOf(v)}`)
    out.push(`${pad}${open}>${xmlEsc(t)}</${name}>`)
  }
  el(roots[0], 0, {})
  const decl = options.writeDeclaration === false || options.writeDeclaration === 'false' ? '' : `<?xml version='1.0' encoding='${options.encoding || 'UTF-8'}'?>` + nl
  return decl + out.join(nl)
}

function writeUrlEncoded(value) {
  value = unwrap(value)
  if (!isPlainObject(value)) throw new DwError('The URL-encoded writer needs an Object')
  const enc = (s) => encodeURIComponent(s).replace(/%20/g, '+')
  const parts = []
  for (const e of entriesOf(value)) {
    const vs = Array.isArray(unwrap(e.value)) ? unwrap(e.value) : [e.value]
    for (const v of vs) {
      const t = scalarText(v)
      if (t === undefined) throw new DwError(`The URL-encoded writer cannot write ${typeOf(v)}`)
      parts.push(t === null ? enc(e.key) : `${enc(e.key)}=${enc(t)}`)
    }
  }
  return parts.join('&')
}

// DataWeave notation, used to display application/java and application/dw values.
export function writeDw(value) {
  const w = (v, depth) => {
    v = unwrap(v)
    const pad = '  '.repeat(depth + 1)
    const end = '  '.repeat(depth)
    if (v === null || v === undefined) return 'null'
    if (typeof v === 'string') return JSON.stringify(v)
    if (typeof v === 'number') return numberToString(v)
    if (typeof v === 'boolean') return String(v)
    if (v instanceof DwTemporal || v instanceof DwPeriod) return `|${v}|`
    if (v instanceof DwFn) return '(...) -> ???'
    if (Array.isArray(v)) return v.length ? '[\n' + v.map((x) => pad + w(x, depth + 1)).join(',\n') + '\n' + end + ']' : '[]'
    if (isPlainObject(v)) {
      if (v[AS_STRING] !== undefined) return JSON.stringify(v[AS_STRING])
      const es = entriesOf(v)
      if (!es.length) return '{}'
      return (
        '{\n' +
        es.map((e) => pad + (/^[A-Za-z_]\w*$/.test(e.key) ? e.key : JSON.stringify(e.key)) + ': ' + w(e.value, depth + 1)).join(',\n') +
        '\n' + end + '}'
      )
    }
    const t = scalarText(v)
    return t === undefined ? typeOf(v) : JSON.stringify(t)
  }
  return w(value, 0)
}

