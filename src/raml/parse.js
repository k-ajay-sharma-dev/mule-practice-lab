import { LineCounter, isMap, isSeq, parseDocument } from 'yaml'

// Reads one RAML 1.0 API file. YAML alone would accept almost anything, so this also applies the RAML rules that
// catch real mistakes: unknown keys, broken type, trait and scheme references, and examples that do not fit their type.
// It is not a full RAML parser. !include is accepted but its file is not read, since a problem is a single file.

const METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch']
const ROOT_KEYS = ['title', 'description', 'version', 'baseUri', 'baseUriParameters', 'protocols', 'mediaType', 'documentation', 'schemas', 'types', 'traits', 'resourceTypes', 'annotationTypes', 'securitySchemes', 'securedBy', 'uses']
const RESOURCE_KEYS = ['displayName', 'description', 'is', 'type', 'securedBy', 'uriParameters', ...METHODS]
const METHOD_KEYS = ['displayName', 'description', 'queryParameters', 'headers', 'queryString', 'responses', 'body', 'protocols', 'is', 'securedBy']
const RESPONSE_KEYS = ['description', 'headers', 'body']
const TYPE_KEYS = ['type', 'schema', 'default', 'example', 'examples', 'displayName', 'description', 'facets', 'xml', 'enum', 'properties', 'minProperties', 'maxProperties', 'additionalProperties', 'discriminator', 'discriminatorValue', 'items', 'minItems', 'maxItems', 'uniqueItems', 'pattern', 'minLength', 'maxLength', 'minimum', 'maximum', 'format', 'multipleOf', 'fileTypes', 'required']
const BUILT_IN = ['any', 'object', 'array', 'string', 'number', 'integer', 'boolean', 'date-only', 'time-only', 'datetime-only', 'datetime', 'file', 'nil']

export const isObject = (x) => x !== null && typeof x === 'object' && !Array.isArray(x)
const obj = (x) => (isObject(x) ? x : {})
const list = (x) => (x === undefined || x === null ? [] : Array.isArray(x) ? x : [x])
const isAnnotation = (key) => key.startsWith('(') && key.endsWith(')')
const refName = (x) => (isObject(x) ? Object.keys(x)[0] : x)

const include = { tag: '!include', resolve: (value) => ({ $include: value }) }

// ---------- Types ----------

// A declaration in its long form. RAML allows `page: integer` and a bare `page:` as well.
export function declOf(value) {
  if (typeof value === 'string') return { type: value }
  if (Array.isArray(value)) return { type: value }
  if (!isObject(value)) return { type: 'string' }
  if (value.type === undefined && value.schema !== undefined) return { ...value, type: value.schema }
  if (value.type === undefined) return { ...value, type: value.properties ? 'object' : value.items ? 'array' : 'string' }
  return value
}

// Parameters and properties as a list. `page?` means optional, and everything else is required unless it says otherwise.
export function entriesOf(map) {
  return Object.entries(obj(map)).map(([key, value]) => {
    const optional = key.endsWith('?')
    const decl = declOf(value)
    return { name: optional ? key.slice(0, -1) : key, required: decl.required ?? !optional, decl: { ...decl, required: decl.required ?? !optional } }
  })
}

// `array` with `items: Order` is the same type as `Order[]`, so both read the same here.
export function typeText(decl) {
  const d = declOf(decl)
  if (d.type === 'array' && d.items !== undefined) return `${typeof d.items === 'string' ? d.items : declOf(d.items).type}[]`
  return Array.isArray(d.type) ? d.type.join(', ') : String(d.type ?? '')
}

const namesIn = (expr) => String(expr).replace(/\[\]/g, ' ').match(/[A-Za-z_][\w.-]*/g) ?? []
const isInline = (expr) => /^\s*[{<]/.test(String(expr))

// A body with no type of its own is any, not string.
export function bodyDecl(value) {
  const plain = isObject(value) && value.type === undefined && value.schema === undefined && !value.properties && !value.items
  return plain ? { ...value, type: 'any' } : value
}

// Every property of a type, including what it inherits.
export function propertiesOf(decl, types, seen = new Set()) {
  const d = declOf(decl)
  const out = new Map()
  for (const parent of list(d.type)) {
    if (typeof parent !== 'string' || !types[parent] || seen.has(parent)) continue
    seen.add(parent)
    for (const p of propertiesOf(types[parent], types, seen)) out.set(p.name, p)
  }
  for (const p of entriesOf(d.properties)) out.set(p.name, p)
  return [...out.values()]
}

function validPattern(pattern) {
  try {
    new RegExp(pattern)
    return true
  } catch {
    return false
  }
}

// A pattern that does not compile is reported on its own line, and says nothing about the example.
function matchesPattern(value, pattern) {
  try {
    return new RegExp(pattern).test(value)
  } catch {
    return true
  }
}

const looksLike = {
  'date-only': /^\d{4}-\d{2}-\d{2}$/,
  'time-only': /^\d{2}:\d{2}:\d{2}/,
  'datetime-only': /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/,
  datetime: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/,
}

// Why a value does not fit a declaration, or null when it fits.
function misfit(value, decl, types, where, depth = 0) {
  if (depth > 12) return null
  const d = declOf(decl)
  const expr = Array.isArray(d.type) ? null : String(d.type).replace(/\s/g, '')
  if (expr?.endsWith('?')) return value === null ? null : misfit(value, { ...d, type: expr.slice(0, -1) }, types, where, depth + 1)
  if (expr?.includes('|')) {
    const fits = expr.replace(/[()]/g, '').split('|').some((t) => !misfit(value, t, types, where, depth + 1))
    return fits ? null : `${where} does not fit ${expr}`
  }
  if (expr?.endsWith('[]') || expr === 'array') {
    if (!Array.isArray(value)) return `${where} must be an array`
    const item = expr === 'array' ? d.items : expr.slice(0, -2)
    if (d.minItems !== undefined && value.length < d.minItems) return `${where} needs at least ${d.minItems} items`
    if (d.maxItems !== undefined && value.length > d.maxItems) return `${where} has more than ${d.maxItems} items`
    if (item === undefined) return null
    for (const [i, v] of value.entries()) {
      const bad = misfit(v, item, types, `${where}[${i}]`, depth + 1)
      if (bad) return bad
    }
    return null
  }
  if (d.enum && !d.enum.includes(value)) return `${where} must be one of ${d.enum.join(', ')}`
  switch (expr) {
    case 'string':
      if (typeof value !== 'string') return `${where} must be a string`
      if (d.minLength !== undefined && value.length < d.minLength) return `${where} is shorter than ${d.minLength}`
      if (d.maxLength !== undefined && value.length > d.maxLength) return `${where} is longer than ${d.maxLength}`
      return d.pattern && !matchesPattern(value, d.pattern) ? `${where} does not match the pattern` : null
    case 'number':
    case 'integer':
      if (typeof value !== 'number' || (expr === 'integer' && !Number.isInteger(value))) return `${where} must be ${expr === 'integer' ? 'an integer' : 'a number'}`
      if (d.minimum !== undefined && value < d.minimum) return `${where} is below ${d.minimum}`
      if (d.maximum !== undefined && value > d.maximum) return `${where} is above ${d.maximum}`
      return null
    case 'boolean':
      return typeof value === 'boolean' ? null : `${where} must be true or false`
    case 'date-only':
    case 'time-only':
    case 'datetime-only':
    case 'datetime':
      return typeof value === 'string' && looksLike[expr].test(value) ? null : `${where} is not a valid ${expr}`
    case 'any':
    case 'file':
      return null
    case 'nil':
      return value === null ? null : `${where} must be null`
  }
  if (expr !== null && expr !== 'object' && !types[expr]) return null // a library type or inline schema: nothing to compare with
  const whole = expr && expr !== 'object' ? { ...declOf(types[expr]), ...(d.properties ? { properties: d.properties } : {}) } : d
  // A named type that is not an object, such as a string with an enum.
  const base = declOf(whole).type
  if (expr && types[expr] && !propertiesOf(whole, types).length && base !== 'object') return misfit(value, whole, types, where, depth + 1)
  if (!isObject(value)) return `${where} must be an object`
  const props = propertiesOf(d, types)
  for (const p of props) {
    if (value[p.name] === undefined) {
      if (p.required) return `${where} is missing “${p.name}”`
      continue
    }
    const bad = misfit(value[p.name], p.decl, types, `${where}.${p.name}`, depth + 1)
    if (bad) return bad
  }
  if (declOf(whole).additionalProperties === false) {
    const extra = Object.keys(value).find((k) => !props.some((p) => p.name === k))
    if (extra) return `${where} has “${extra}”, which the type does not allow`
  }
  return null
}

// ---------- Checking the file ----------

function lint(root, report) {
  const types = obj(root.types)
  const uses = obj(root.uses)
  const traits = obj(root.traits)
  const resourceTypes = obj(root.resourceTypes)
  const schemes = obj(root.securitySchemes)
  const open = Object.values(types).some((t) => isObject(t) && t.facets) // custom facets may add keys of their own
  const hasParam = (x) => JSON.stringify(x ?? '').includes('<<')
  const fromLibrary = (name) => name.includes('.') && uses[name.split('.')[0]] !== undefined

  const unknownKeys = (node, allowed, path, what) => {
    for (const key of Object.keys(node)) {
      if (!allowed.includes(key) && !isAnnotation(key)) report(`Unknown key “${key}” on ${what}. Allowed here: ${allowed.filter((k) => !METHODS.includes(k)).join(', ')}.`, [...path, key])
    }
  }

  const typeRef = (expr, path) => {
    if (isObject(expr) || isInline(expr) || hasParam(expr)) return
    for (const name of namesIn(expr)) {
      if (BUILT_IN.includes(name) || types[name] !== undefined || fromLibrary(name)) continue
      if (name === 'date') report('RAML 1.0 has no type “date”. Use date-only, time-only, datetime-only or datetime.', path)
      else if (name === 'int' || name === 'long' || name === 'float' || name === 'double') report(`RAML has no type “${name}”. Use integer or number, with format: ${name}.`, path)
      else report(`Type “${name}” is not declared. Add it under types, or use a built-in type.`, path)
    }
  }

  const example = (decl, path) => {
    const check = (raw, at) => {
      const wrapped = isObject(raw) && 'value' in raw && Object.keys(raw).every((k) => ['value', 'strict', 'displayName', 'description'].includes(k) || isAnnotation(k))
      if (wrapped && raw.strict === false) return
      let value = wrapped ? raw.value : raw
      const text = typeText(decl)
      if (typeof value === 'string' && text !== 'string' && /^\s*[[{]/.test(value)) {
        try {
          value = JSON.parse(value)
        } catch {
          return report('This example is not valid JSON.', at)
        }
      }
      if (isObject(value) && value.$include) return
      if (typeof value === 'string' && /^\s*</.test(value)) return // XML examples are not compared
      const bad = misfit(value, decl, types, 'The example')
      if (bad) report(`${bad}.`, at)
    }
    if (hasParam(decl)) return
    if (decl.example !== undefined) check(decl.example, [...path, 'example'])
    for (const [name, value] of Object.entries(obj(decl.examples))) check(value, [...path, 'examples', name])
  }

  const typeDecl = (value, path) => {
    if (value === null || value === undefined) return
    if (typeof value === 'string') return typeRef(value, path)
    if (Array.isArray(value)) return value.forEach((t, i) => typeRef(t, [...path, i]))
    if (!isObject(value) || value.$include) return
    if (!open) unknownKeys(value, TYPE_KEYS, path, 'this type')
    for (const t of list(value.type)) typeRef(t, [...path, 'type'])
    if (value.schema !== undefined) typeRef(value.schema, [...path, 'schema'])
    if (value.items !== undefined) typeDecl(value.items, [...path, 'items'])
    for (const [key, p] of Object.entries(obj(value.properties))) typeDecl(p, [...path, 'properties', key])
    const d = declOf(value)
    if (d.enum !== undefined && !Array.isArray(d.enum)) report('enum must be a list of values.', [...path, 'enum'])
    if (d.pattern !== undefined && !validPattern(d.pattern)) report('This pattern is not a valid regular expression.', [...path, 'pattern'])
    example(d, path)
  }

  const parameters = (map, path) => {
    for (const [key, value] of Object.entries(obj(map))) typeDecl(value, [...path, key])
  }

  const body = (value, path) => {
    if (typeof value === 'string' || !isObject(value)) return typeDecl(value, path)
    const media = Object.keys(value).filter((k) => k.includes('/'))
    if (!media.length) {
      if (!root.mediaType) report('This body has no media type. Add mediaType at the top of the file, or a key such as application/json.', path)
      return typeDecl(bodyDecl(value), path)
    }
    for (const key of Object.keys(value)) {
      if (key.includes('/')) typeDecl(bodyDecl(value[key]), [...path, key])
      else if (!isAnnotation(key)) report(`“${key}” sits beside media types in this body. Put it under one media type.`, [...path, key])
    }
  }

  const usesRef = (value, known, what, path) => {
    for (const [i, item] of list(value).entries()) {
      if (item === null) continue
      const name = refName(item)
      if (typeof name !== 'string' || hasParam(name)) continue
      if (known[name] === undefined && !fromLibrary(name)) report(`${what} “${name}” is not declared.`, [...path, ...(Array.isArray(value) ? [i] : [])])
    }
  }

  const method = (node, path, what, inFragment = false) => {
    if (node === null || node === undefined) return
    if (!isObject(node)) return report(`${what} must hold keys, not a plain value.`, path)
    unknownKeys(node, inFragment ? [...METHOD_KEYS, 'usage'] : METHOD_KEYS, path, what)
    parameters(node.queryParameters, [...path, 'queryParameters'])
    parameters(node.headers, [...path, 'headers'])
    if (node.body !== undefined) body(node.body, [...path, 'body'])
    usesRef(node.is, traits, 'Trait', [...path, 'is'])
    usesRef(node.securedBy, schemes, 'Security scheme', [...path, 'securedBy'])
    for (const [code, response] of Object.entries(obj(node.responses))) {
      const at = [...path, 'responses', code]
      if (!/^[1-5]\d\d$/.test(code) && !hasParam(code)) report(`“${code}” is not an HTTP status code.`, at)
      if (response === null) continue
      if (!isObject(response)) {
        report(`Response ${code} must hold keys such as description and body.`, at)
        continue
      }
      unknownKeys(response, RESPONSE_KEYS, at, `response ${code}`)
      parameters(response.headers, [...at, 'headers'])
      if (response.body !== undefined) body(response.body, [...at, 'body'])
    }
    if (node.responses !== undefined && node.responses !== null && !isObject(node.responses)) report('responses must hold status codes.', [...path, 'responses'])
  }

  const resource = (node, path, name, inFragment = false) => {
    if (node === null || node === undefined) return
    if (!isObject(node)) return report(`Resource ${name} must hold keys, not a plain value.`, path)
    for (const key of Object.keys(node)) {
      const plain = key.replace(/\?$/, '')
      if (key.startsWith('/')) {
        if (!inFragment) resource(node[key], [...path, key], `${name}${key}`)
      } else if (METHODS.includes(plain) && (inFragment || plain === key)) {
        method(node[key], [...path, key], `${plain.toUpperCase()} ${name}`, inFragment)
      } else if (METHODS.includes(key.toLowerCase())) {
        report(`Methods are lower case in RAML: use ${key.toLowerCase()}.`, [...path, key])
      } else if (!RESOURCE_KEYS.includes(key) && !isAnnotation(key) && !(inFragment && key === 'usage')) {
        report(`Unknown key “${key}” on ${name}. A nested resource starts with a slash, and methods are get, post, put, patch and delete.`, [...path, key])
      }
    }
    parameters(node.uriParameters, [...path, 'uriParameters'])
    usesRef(node.is, traits, 'Trait', [...path, 'is'])
    usesRef(node.type, resourceTypes, 'Resource type', [...path, 'type'])
    usesRef(node.securedBy, schemes, 'Security scheme', [...path, 'securedBy'])
  }

  const annotations = (node, path) => {
    if (Array.isArray(node)) return node.forEach((x, i) => annotations(x, [...path, i]))
    if (!isObject(node)) return
    for (const [key, value] of Object.entries(node)) {
      if (key === 'example' || key === 'examples') continue
      if (isAnnotation(key)) {
        const name = key.slice(1, -1)
        if (obj(root.annotationTypes)[name] === undefined && !fromLibrary(name)) report(`Annotation ${key} is not declared. Add it under annotationTypes.`, [...path, key])
      } else annotations(value, [...path, key])
    }
  }
  annotations(root, [])

  if (root.title === undefined || root.title === null || String(root.title).trim() === '') report('Every RAML file needs a title.', ['title'])
  if (String(root.baseUri ?? '').includes('{version}') && root.version === undefined) report('baseUri uses {version}, so the file needs a version key.', ['baseUri'])
  for (const key of Object.keys(root)) {
    if (!key.startsWith('/') && !ROOT_KEYS.includes(key) && !isAnnotation(key)) report(`Unknown key “${key}” at the top of the file. A resource starts with a slash.`, [key])
    if (key.startsWith('/')) resource(root[key], [key], key)
  }
  for (const [key, value] of Object.entries(types)) typeDecl(value, ['types', key])
  for (const [key, value] of Object.entries(traits)) method(value, ['traits', key], `trait ${key}`, true)
  for (const [key, value] of Object.entries(resourceTypes)) resource(value, ['resourceTypes', key], `resource type ${key}`, true)
  usesRef(root.securedBy, schemes, 'Security scheme', ['securedBy'])
}

// ---------- Traits and resource types ----------

const inflect = (value, fn) => {
  const name = fn.replace('!', '').trim().toLowerCase()
  if (name === 'singularize') return value.replace(/ies$/, 'y').replace(/s$/, '')
  if (name === 'pluralize') return value.endsWith('s') ? value : `${value}s`
  if (name === 'uppercase') return value.toUpperCase()
  if (name === 'lowercase') return value.toLowerCase()
  if (name === 'uppercamelcase') return value.replace(/[-_ ]+(.)/g, (_, x) => x.toUpperCase()).replace(/^./, (x) => x.toUpperCase())
  if (name === 'lowercamelcase') return value.replace(/[-_ ]+(.)/g, (_, x) => x.toUpperCase()).replace(/^./, (x) => x.toLowerCase())
  return value
}

function fill(node, params) {
  const text = (s) =>
    s.replace(/<<\s*([\w-]+)\s*((?:\|\s*![\w-]+\s*)*)>>/g, (all, name, fns) => {
      if (params[name] === undefined) return all
      return fns.split('|').filter((f) => f.trim()).reduce(inflect, String(params[name]))
    })
  if (typeof node === 'string') return text(node)
  if (Array.isArray(node)) return node.map((x) => fill(x, params))
  if (isObject(node)) return Object.fromEntries(Object.entries(node).map(([k, v]) => [text(k), fill(v, params)]))
  return node
}

// `own` wins over `extra`, and `page?` from a trait never doubles a `page` that is already there.
function merge(own, extra) {
  if (!isObject(own) || !isObject(extra)) return own === undefined || own === null ? extra : own
  const out = { ...own }
  for (const [key, value] of Object.entries(extra)) {
    if (key === 'usage') continue
    const plain = key.replace(/\?$/, '')
    const twin = [key, plain, `${plain}?`].find((k) => k in out)
    if (twin) out[twin] = merge(out[twin], value)
    else out[key] = value
  }
  return out
}

function applyTraits(method, traits, base, inherited) {
  let out = obj(method)
  for (const item of [...list(out.is), ...inherited]) {
    const name = refName(item)
    const trait = traits[name]
    if (isObject(trait)) out = merge(out, fill(trait, { ...base, ...(isObject(item) ? obj(item[name]) : {}) }))
  }
  return out
}

function collect(root) {
  const traits = obj(root.traits)
  const resourceTypes = obj(root.resourceTypes)
  const resources = []
  const visit = (node, path) => {
    const own = obj(node)
    const segments = path.split('/').filter((s) => s && !s.startsWith('{'))
    const base = { resourcePath: path, resourcePathName: segments.at(-1) ?? '' }
    let merged = own
    const typeItem = own.type
    const typeName = refName(typeItem)
    if (typeof typeName === 'string' && isObject(resourceTypes[typeName])) {
      const filled = fill(resourceTypes[typeName], { ...base, ...(isObject(typeItem) ? obj(typeItem[typeName]) : {}) })
      merged = { ...own }
      for (const [key, value] of Object.entries(filled)) {
        if (key === 'usage') continue
        const plain = key.replace(/\?$/, '')
        if (METHODS.includes(plain)) {
          if (key.endsWith('?') && !(plain in own)) continue
          merged[plain] = merge(obj(own[plain]), obj(value))
        } else {
          merged[key] = merge(merged[key], value)
        }
      }
    }
    const methods = {}
    for (const m of METHODS) {
      if (!(m in merged)) continue
      const full = applyTraits(merged[m], traits, { ...base, methodName: m }, list(merged.is))
      methods[m] = { ...full, securedBy: full.securedBy ?? merged.securedBy ?? root.securedBy, traits: [...list(full.is), ...list(merged.is)].map(refName) }
    }
    resources.push({ path, type: typeof typeName === 'string' ? typeName : undefined, uriParameters: merged.uriParameters, methods })
    for (const key of Object.keys(own)) if (key.startsWith('/')) visit(own[key], `${path}${key}`)
  }
  for (const key of Object.keys(root)) if (key.startsWith('/')) visit(root[key], key)
  return resources
}

// ---------- The result ----------

function findKey(doc, path) {
  let node = doc.contents
  let found = null
  for (const part of path) {
    if (isMap(node)) {
      const pair = node.items.find((p) => String(p.key?.value ?? p.key) === String(part))
      if (!pair) break
      found = pair.key
      node = pair.value
    } else if (isSeq(node)) {
      const item = node.items[part]
      if (!item) break
      found = item
      node = item
    } else break
  }
  return found
}

export function parseRaml(text) {
  const errors = []
  const header = String(text ?? '').split(/\r?\n/, 1)[0].trim()
  if (header !== '#%RAML 1.0') {
    const fragment = /^#%RAML 1\.0 \S/.test(header)
    errors.push({ line: 1, message: fragment ? 'Write a full API here, so the first line is exactly #%RAML 1.0.' : 'The first line must be exactly #%RAML 1.0.' })
  }
  const lines = new LineCounter()
  const doc = parseDocument(text ?? '', { lineCounter: lines, customTags: [include], prettyErrors: false })
  for (const e of doc.errors) errors.push({ line: lines.linePos(e.pos[0]).line, message: e.message })
  if (doc.errors.length) return { errors, model: null }
  const root = doc.toJS()
  if (!isObject(root)) return { errors: [...errors, { line: 1, message: 'The file needs keys such as title and resources.' }], model: null }
  const report = (message, path) => {
    const node = findKey(doc, path)
    errors.push({ line: node?.range ? lines.linePos(node.range[0]).line : 1, message })
  }
  lint(root, report)
  errors.sort((a, b) => a.line - b.line)
  return { errors, model: { root, resources: collect(root), types: obj(root.types), traits: obj(root.traits), resourceTypes: obj(root.resourceTypes), schemes: obj(root.securitySchemes) } }
}
