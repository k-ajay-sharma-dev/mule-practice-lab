// Turns DataWeave source into tokens. Each token keeps its source offsets so the parser can read header directives
// (output, input, ns) as raw text up to the end of their line.
import { DwError } from '../errors.js'

// Words after which a `/` starts a regex rather than a division.
const REGEX_AFTER_WORD = new Set(['replace', 'with', 'matches', 'match', 'splitBy', 'contains', 'scan', 'case', 'startsWith', 'endsWith', 'find', 'if', 'else', 'and', 'or', 'not', 'default', 'is', 'return'])
const VALUE_END = new Set(['ident', 'number', 'string', 'date', 'regex'])

const OPERATORS = ['---', '...', '->', '==', '!=', '~=', '>=', '<=', '>>', '<<', '++', '--', '::', '..', '+', '-', '*', '/', '>', '<', '=', '!', '?', '.', ',', ':', ';', '(', ')', '[', ']', '{', '}', '@', '#', '%', '^', '&', '|', '$']

const DATE_BODY = /^[0-9TPWYMDHSZ:+\-.,[\]/A-Za-z_]+$/

export function tokenize(src) {
  const tokens = []
  let i = 0
  let nl = true
  const n = src.length
  const prev = () => tokens[tokens.length - 1]
  const push = (t) => {
    t.nl = nl
    nl = false
    tokens.push(t)
  }

  while (i < n) {
    const c = src[i]
    if (c === '\n') {
      nl = true
      i++
      continue
    }
    if (c === ' ' || c === '\t' || c === '\r') {
      i++
      continue
    }
    if (c === '/' && src[i + 1] === '/') {
      while (i < n && src[i] !== '\n') i++
      continue
    }
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2)
      i = end < 0 ? n : end + 2
      continue
    }
    const start = i

    if (/[A-Za-z_]/.test(c)) {
      let j = i + 1
      while (j < n && /[A-Za-z0-9_]/.test(src[j])) j++
      push({ type: 'ident', value: src.slice(i, j), start, end: j })
      i = j
      continue
    }

    if (/[0-9]/.test(c)) {
      let j = i
      while (j < n && /[0-9]/.test(src[j])) j++
      if (src[j] === '.' && /[0-9]/.test(src[j + 1] || '')) {
        j++
        while (j < n && /[0-9]/.test(src[j])) j++
      }
      if (/[eE]/.test(src[j] || '') && /[0-9+-]/.test(src[j + 1] || '')) {
        let k = j + 1
        if (src[k] === '+' || src[k] === '-') k++
        if (/[0-9]/.test(src[k] || '')) {
          j = k
          while (j < n && /[0-9]/.test(src[j])) j++
        }
      }
      push({ type: 'number', value: Number(src.slice(i, j)), text: src.slice(i, j), start, end: j })
      i = j
      continue
    }

    if (c === '"' || c === "'" || c === '`') {
      const r = readString(src, i)
      push({ type: 'string', parts: r.parts, quote: c, start, end: r.end })
      i = r.end
      continue
    }

    if (c === '$') {
      let j = i
      while (src[j] === '$') j++
      if (j - i <= 3 && !/[A-Za-z0-9_]/.test(src[j] || '')) {
        push({ type: 'ident', value: src.slice(i, j), start, end: j })
        i = j
        continue
      }
    }

    if (c === '|') {
      const end = src.indexOf('|', i + 1)
      const body = end > 0 ? src.slice(i + 1, end) : ''
      const isZone = /^(Z|UTC|GMT|[A-Za-z]+\/[A-Za-z_]+(\/[A-Za-z_]+)?)$/.test(body)
      if (end > 0 && !body.includes('\n') && DATE_BODY.test(body) && (/^[-+0-9P]/.test(body) || isZone)) {
        push({ type: 'date', value: body, start, end: end + 1 })
        i = end + 1
        continue
      }
    }

    if (c === '/') {
      const p = prev()
      const isRegex = !p || !(VALUE_END.has(p.type) || (p.type === 'op' && [')', ']', '}'].includes(p.value))) || (p.type === 'ident' && REGEX_AFTER_WORD.has(p.value))
      if (isRegex) {
        const r = readRegex(src, i)
        if (r) {
          push({ type: 'regex', value: r.source, flags: r.flags, start, end: r.end })
          i = r.end
          continue
        }
      }
    }

    const op = OPERATORS.find((o) => src.startsWith(o, i))
    if (!op) throw new DwError(`Unexpected character '${c}' at ${lineCol(src, i)}`)
    push({ type: 'op', value: op, start, end: i + op.length })
    i += op.length
  }
  tokens.push({ type: 'eof', value: '<end>', start: n, end: n, nl: true })
  return tokens
}

export function lineCol(src, pos) {
  const before = src.slice(0, pos)
  const line = before.split('\n').length
  const col = pos - before.lastIndexOf('\n')
  return `line ${line}, column ${col}`
}

function readRegex(src, i) {
  let j = i + 1
  let inClass = false
  while (j < src.length) {
    const c = src[j]
    if (c === '\n') return null
    if (c === '\\') {
      j += 2
      continue
    }
    if (c === '[') inClass = true
    else if (c === ']') inClass = false
    else if (c === '/' && !inClass) break
    j++
  }
  if (j >= src.length) return null
  let k = j + 1
  while (k < src.length && /[gimsux]/.test(src[k])) k++
  return { source: src.slice(i + 1, j), flags: src.slice(j + 1, k), end: k }
}

// A string literal becomes parts: plain text and the source of each $(...) or $name interpolation.
function readString(src, i) {
  const q = src[i]
  const parts = []
  let text = ''
  let j = i + 1
  const flush = () => {
    if (text) parts.push({ text })
    text = ''
  }
  while (j < src.length && src[j] !== q) {
    const c = src[j]
    if (c === '\\') {
      const e = src[j + 1]
      const map = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', '"': '"', "'": "'", '\\': '\\', '/': '/', $: '$', '`': '`' }
      if (e === 'u') {
        text += String.fromCharCode(parseInt(src.slice(j + 2, j + 6), 16))
        j += 6
        continue
      }
      text += map[e] ?? '\\' + e
      j += 2
      continue
    }
    if (c === '$' && q !== '`') {
      if (src[j + 1] === '(') {
        const end = matchParen(src, j + 1)
        flush()
        parts.push({ expr: src.slice(j + 2, end), offset: j + 2 })
        j = end + 1
        continue
      }
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(j + 1))
      if (m) {
        flush()
        parts.push({ expr: m[0], offset: j + 1 })
        j += 1 + m[0].length
        continue
      }
    }
    text += c
    j++
  }
  if (j >= src.length) throw new DwError(`Unterminated string starting at ${lineCol(src, i)}`)
  flush()
  return { parts, end: j + 1 }
}

// Index of the parenthesis closing the one at `open`, skipping strings.
function matchParen(src, open) {
  let depth = 0
  for (let j = open; j < src.length; j++) {
    const c = src[j]
    if (c === '"' || c === "'") {
      j = readString(src, j).end - 1
      continue
    }
    if (c === '(') depth++
    else if (c === ')' && --depth === 0) return j
  }
  throw new DwError('Unclosed $( in a string')
}
