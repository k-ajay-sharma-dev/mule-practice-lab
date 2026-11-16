// DataWeave 2.0 subset evaluator for the in-browser flow simulator.
//
// evalValue(text, ctx)   a Mule setting: '#[expr]' is evaluated, other text is literal with ${prop} placeholders filled.
// evalScript(script, ctx) a Transform Message script → { value, mime }.
// render(value, mime)    serialise a value as that mime type would.
//
// ctx = { payload, attributes, vars, error, correlationId, properties, now, flowName, uuidSeed?, inputs? }
// Errors: DwError when the script would fail in Mule, SimUnsupported for valid DataWeave the simulator cannot run.
import { DwError } from '../errors.js'
import { parseScript } from './parser.js'
import { runAst } from './interpreter.js'
import { render as renderValue, readValue } from './formats.js'
import { exportValue, coerceString, unwrap, isPlainObject } from './values.js'

const cache = new Map()

function parseCached(src) {
  let ast = cache.get(src)
  if (!ast) {
    ast = parseScript(src)
    if (cache.size > 500) cache.clear()
    cache.set(src, ast)
  }
  return ast
}

function run(src, ctx) {
  const ast = parseCached(src)
  const value = runAst(ast, ctx || {})
  const out = ast.header.output
  return { value: exportValue(value), mime: out ? out.mime : 'application/json', options: out ? out.options : {} }
}

export function evalScript(script, ctx) {
  const r = run(String(script), ctx)
  return { value: r.value, mime: r.mime, options: r.options }
}

// ${key} placeholders resolve before anything else, as Mule resolves them when the app deploys.
function fillPlaceholders(text, ctx) {
  return text.replace(/\$\{([^}]+)\}/g, (m, key) => {
    const props = (ctx && ctx.properties) || {}
    const k = key.trim()
    if (Object.prototype.hasOwnProperty.call(props, k)) return String(props[k])
    throw new DwError(`Couldn't find configuration property value for key \${${k}}`)
  })
}

// Index just past the ']' closing the '#[' at `start`, skipping strings.
function closeOfExpression(text, start) {
  let depth = 0
  for (let i = start + 1; i < text.length; i++) {
    const c = text[i]
    if (c === '"' || c === "'") {
      for (i++; i < text.length && text[i] !== c; i++) if (text[i] === '\\') i++
      continue
    }
    if (c === '[') depth++
    else if (c === ']' && --depth === 0) return i + 1
  }
  throw new DwError(`Unclosed #[ in "${text}"`)
}

export function evalValue(text, ctx) {
  if (typeof text !== 'string') return text ?? null
  const filled = fillPlaceholders(text, ctx)
  const trimmed = filled.trim()
  if (trimmed.startsWith('#[') && closeOfExpression(trimmed, 0) === trimmed.length) {
    return run(trimmed.slice(2, -1), ctx).value
  }
  if (!filled.includes('#[')) return filled
  // Literal text with embedded expressions: each one is evaluated and written as text.
  let out = ''
  let i = 0
  while (i < filled.length) {
    const at = filled.indexOf('#[', i)
    if (at < 0) {
      out += filled.slice(i)
      break
    }
    out += filled.slice(i, at)
    const end = closeOfExpression(filled, at)
    const v = unwrap(run(filled.slice(at + 2, end - 1), ctx).value)
    if (v === null) out += ''
    else if (Array.isArray(v) || isPlainObject(v)) out += renderValue(v, 'application/json', { indent: false })
    else out += coerceString(v)
    i = end
  }
  return out
}

export function render(value, mime = 'application/json', options = {}) {
  return renderValue(value, mime, options)
}

// Parse text of a mime type into a value, as a Mule connector or the DataWeave reader would.
export function read(text, mime = 'application/json', options = {}) {
  return exportValue(readValue(text, mime, options))
}
