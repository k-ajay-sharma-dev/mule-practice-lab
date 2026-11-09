// Lays out JSON text with one entry per line and two-space indents, so long rows are easy to read.
// Plain functions, so scripts/check-json-format.js can test them.
//
// It works on the text, not on JSON.parse, so every value stays exactly as written: 10.50 stays 10.50 and a
// 20-digit id keeps all its digits. Anything that isn't a complete JSON value comes back unchanged.

const TOKEN = /\s*("(?:[^"\\\n]|\\.)*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null|[{}[\]:,])/y
const SHORT = 60 // a list of plain values this long or shorter stays on one line

function tokenize(text) {
  const tokens = []
  TOKEN.lastIndex = 0
  while (TOKEN.lastIndex < text.length) {
    const start = TOKEN.lastIndex
    const m = TOKEN.exec(text)
    if (!m) return /^\s*$/.test(text.slice(start)) ? tokens : null
    tokens.push(m[1])
  }
  return tokens
}

// { list: [items] } for arrays, { entries: [[key, value]] } for objects, a string for a plain value
function parse(tokens) {
  let i = 0
  function value() {
    const t = tokens[i++]
    if (t === '[') {
      const list = []
      if (tokens[i] === ']') return i++, { list }
      for (;;) {
        list.push(value())
        const sep = tokens[i++]
        if (sep === ']') return { list }
        if (sep !== ',') throw 0
      }
    }
    if (t === '{') {
      const entries = []
      if (tokens[i] === '}') return i++, { entries }
      for (;;) {
        const key = tokens[i++]
        if (key?.[0] !== '"' || tokens[i++] !== ':') throw 0
        entries.push([key, value()])
        const sep = tokens[i++]
        if (sep === '}') return { entries }
        if (sep !== ',') throw 0
      }
    }
    if (t === undefined || '{}[]:,'.includes(t)) throw 0
    return t
  }
  try {
    const root = value()
    return i === tokens.length ? root : null
  } catch {
    return null
  }
}

const plain = (node) => typeof node === 'string'

function print(node, indent) {
  if (plain(node)) return node
  const inner = indent + '  '
  if (node.list) {
    if (!node.list.length) return '[]'
    const oneLine = `[${node.list.join(', ')}]`
    if (node.list.every(plain) && oneLine.length <= SHORT) return oneLine
    return `[\n${node.list.map((v) => inner + print(v, inner)).join(',\n')}\n${indent}]`
  }
  if (!node.entries.length) return '{}'
  return `{\n${node.entries.map(([k, v]) => `${inner}${k}: ${print(v, inner)}`).join(',\n')}\n${indent}}`
}

export function formatJson(text) {
  if (typeof text !== 'string' || !/^\s*[[{]/.test(text)) return text
  const tokens = tokenize(text)
  const root = tokens && parse(tokens)
  return root ? print(root, '') : text
}
