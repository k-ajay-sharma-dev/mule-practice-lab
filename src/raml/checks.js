import { bodyDecl, declOf, entriesOf, isObject, parseRaml, propertiesOf, typeText } from './parse.js'

// Checks for RAML problems. Each check is { label, rule } and passes or fails against the parsed file. Rules:
//   { type: 'valid' }                                   the file has no errors (every problem gets this one)
//   { type: 'root', key, want? }                        a top-level key is set (want: see below)
//   { type: 'resource', path }                          a resource exists. `{}` matches any URI parameter name
//   { type: 'noResource', path }                        a resource must not exist
//   { type: 'method', path, method }                    a method exists on a resource
//   { type: 'noMethod', path, method }                  a method must not exist on a resource
//   { type: 'param', path, method?, in, name?, want? }  a parameter, with in: 'query' | 'header' | 'uri'
//   { type: 'body', path, method, media?, typeIs? }     a request body
//   { type: 'response', path, method, status, media?, typeIs?, example?, header?, noBody? }
//                                                       example: true also accepts the named type's example. 'own' does not
//   { type: 'typeDecl', name, want?, extends? }         a named type
//   { type: 'noType', name }                            a named type must not exist
//   { type: 'prop', typeName, prop, want? }             a property of a type, inherited ones included
//   { type: 'noProp', typeName, prop }                  a property must not be on a type
//   { type: 'trait', name, has? }                       a trait is declared. has: 'queryParameters.page' style key path
//   { type: 'applied', path, method, trait }            a method uses a trait, on the method or from its resource
//   { type: 'resourceType', name, has? }                a resource type is declared
//   { type: 'typed', path, resourceType, provides? }    a resource uses a resource type. provides: key paths that must come
//                                                       from the resource type and not be written on the resource
//   { type: 'annotationType', name, want? }             an annotation type is declared
//   { type: 'annotated', name, value?, path?, method?, typeName?, prop? } an annotation is used on that place (the API if none)
//   { type: 'library', prefix, file? }                  uses brings in a library. Its names read as prefix.Name in other rules
//   { type: 'included', file }                          a file is brought in with !include
//   { type: 'scheme', schemeType?, name?, has? }        a security scheme is declared. has: key paths such as 'describedBy.headers.client_id'
//   { type: 'secured', path, method, scheme, scopes? }  a method is secured, on the method, its resource or the whole API
//   { type: 'any', rules } / { type: 'all', rules }
// Traits and resource types are applied first, so a page parameter that comes from a trait counts on the method.
// `want` is a value or a map of values: strings are case-insensitive "contains", numbers and booleans are exact,
// an array must all be present, { exactly: [...] } allows nothing else, { accepts, rejects } runs a pattern on samples,
// and { gte }, { lte }, { set }, { oneOf }, { not } work as in flow checks.

const contains = (have, want) =>
  Array.isArray(have) ? have.some((h) => contains(h, want)) : String(have ?? '').toLowerCase().includes(String(want).toLowerCase())

// Runs a pattern on sample values, since two regexes can look different and mean the same.
function runsPattern(have, { accepts = [], rejects = [] }) {
  try {
    const pattern = new RegExp(have)
    return accepts.every((v) => pattern.test(v)) && !rejects.some((v) => pattern.test(v))
  } catch {
    return false
  }
}

function matches(have, want) {
  if (want === undefined) return have !== undefined && have !== null
  if (typeof want === 'boolean') return have === want
  if (typeof want === 'number') return Number(have) === want
  if (Array.isArray(want)) return want.every((w) => contains(have, w))
  if (isObject(want)) {
    if ('set' in want) return want.set === (have !== undefined && have !== null && String(have).trim() !== '')
    if ('accepts' in want || 'rejects' in want) return runsPattern(have, want)
    if ('exactly' in want) return Array.isArray(have) && have.length === want.exactly.length && want.exactly.every((w) => have.includes(w))
    const n = Number(have)
    if ('gte' in want && !(n >= want.gte)) return false
    if ('lte' in want && !(n <= want.lte)) return false
    if ('oneOf' in want && !want.oneOf.some((w) => contains(have, w))) return false
    if ('not' in want && contains(have, want.not)) return false
    return true
  }
  return contains(have, want)
}

// A facet may sit on the named type a declaration points at, such as an enum moved into its own type.
function facet(decl, key, types, seen = new Set()) {
  if (decl[key] !== undefined) return decl[key]
  const parent = typeof decl.type === 'string' ? decl.type.replace(/\?$/, '') : null
  if (!parent || !types[parent] || seen.has(parent)) return undefined
  seen.add(parent)
  return facet(declOf(types[parent]), key, types, seen)
}

const fits = (decl, want = {}, types = {}) =>
  Object.entries(want).every(([key, w]) => matches(key === 'type' ? typeText(decl) : key === 'required' ? decl.required : facet(decl, key, types), w))

const shape = (path) => path.replace(/\{[^}]*\}/g, '{}').replace(/\/$/, '')
const findResource = (model, path) => model.resources.find((r) => shape(r.path) === shape(path))
const findMethod = (model, path, method) => findResource(model, path)?.methods[method]

function bodies(body, model) {
  if (body === undefined || body === null) return []
  if (isObject(body) && Object.keys(body).some((k) => k.includes('/'))) {
    return Object.entries(body).filter(([k]) => k.includes('/')).map(([media, decl]) => ({ media, decl: declOf(bodyDecl(decl)) }))
  }
  return [{ media: String(model.root.mediaType ?? ''), decl: declOf(bodyDecl(body)) }]
}

const bodyFits = (list, rule) =>
  list.some((b) => (!rule.media || contains(b.media, rule.media)) && (!rule.typeIs || typeText(b.decl) === rule.typeIs))

function paramsOf(model, rule) {
  if (rule.in === 'uri') {
    // A declaration only counts if its name is a placeholder in the path.
    const resource = findResource(model, rule.path)
    return entriesOf(resource?.uriParameters).filter((p) => resource.path.includes(`{${p.name}}`))
  }
  const method = findMethod(model, rule.path, rule.method)
  return entriesOf(rule.in === 'header' ? method?.headers : method?.queryParameters)
}

const hasKeyPath = (node, path) => path.split('.').reduce((n, k) => (isObject(n) ? n[k] ?? n[`${k}?`] : undefined), node) !== undefined

const list = (x) => [x].flat()

function secured(method, scheme, scopes) {
  return list(method?.securedBy).some((s) => {
    if (s === null || s === undefined) return false
    const name = isObject(s) ? Object.keys(s)[0] : s
    return contains(name, scheme) && (!scopes || scopes.every((w) => contains(s[name]?.scopes, w)))
  })
}

// The node an annotation rule looks at: the whole API, a resource, a method, a type or a property.
function annotationAt(model, { path, method, typeName, prop }) {
  if (method) return findMethod(model, path, method)
  if (path) return findResource(model, path)?.raw
  if (prop) return propertiesOf(model.types[typeName] ?? {}, model.types).find((p) => p.name === prop)?.decl
  return typeName ? declOf(model.types[typeName]) : model.root
}

function evaluate(rule, parsed) {
  const { model, errors } = parsed
  if (rule.type === 'valid') return errors.length === 0
  if (!model) return false
  switch (rule.type) {
    case 'root':
      return matches(model.root[rule.key], rule.want)
    case 'resource':
      return Boolean(findResource(model, rule.path))
    case 'noResource':
      return !findResource(model, rule.path)
    case 'method':
      return Boolean(findMethod(model, rule.path, rule.method))
    case 'noMethod':
      return !findMethod(model, rule.path, rule.method)
    case 'param':
      return paramsOf(model, rule).some((p) => (!rule.name || p.name.toLowerCase() === rule.name.toLowerCase()) && fits(p.decl, rule.want, model.types))
    case 'body':
      return bodyFits(bodies(findMethod(model, rule.path, rule.method)?.body, model), rule)
    case 'response': {
      const r = findMethod(model, rule.path, rule.method)?.responses?.[rule.status]
      if (r === undefined) return false
      const bodyList = bodies(r?.body, model)
      if (rule.noBody && bodyList.length) return false
      if ((rule.media || rule.typeIs) && !bodyFits(bodyList, rule)) return false
      if (rule.example) {
        const own = bodyList.some((b) => b.decl.example !== undefined || b.decl.examples !== undefined)
        const named = rule.example !== 'own' && bodyList.some((b) => { const t = model.types[typeText(b.decl).replace('[]', '')]; return isObject(t) && (t.example !== undefined || t.examples !== undefined) })
        if (!own && !named) return false
      }
      return !rule.header || entriesOf(r?.headers).some((h) => h.name.toLowerCase() === rule.header.toLowerCase())
    }
    case 'typeDecl': {
      const t = model.types[rule.name]
      if (t === undefined) return false
      const d = declOf(t)
      return fits(d, rule.want, model.types) && (!rule.extends || [d.type].flat().includes(rule.extends))
    }
    case 'prop': {
      const t = model.types[rule.typeName]
      if (t === undefined) return false
      return propertiesOf(t, model.types).some((p) => p.name === rule.prop && fits(p.decl, rule.want, model.types))
    }
    case 'noType':
      return model.types[rule.name] === undefined
    case 'noProp':
      return !propertiesOf(model.types[rule.typeName] ?? {}, model.types).some((p) => p.name === rule.prop)
    case 'trait': {
      const t = model.traits[rule.name]
      return t !== undefined && (!rule.has || hasKeyPath(t, rule.has))
    }
    case 'applied':
      return Boolean(findMethod(model, rule.path, rule.method)?.traits.includes(rule.trait))
    case 'resourceType':
      return model.resourceTypes[rule.name] !== undefined && list(rule.has ?? []).every((k) => hasKeyPath(model.resourceTypes[rule.name], k))
    case 'typed': {
      const r = findResource(model, rule.path)
      if (r?.type !== rule.resourceType) return false
      // provides: these come from the resource type, so writing them by hand on the resource does not count.
      return list(rule.provides ?? []).every((k) => hasKeyPath(model.resourceTypes[rule.resourceType], k) && !hasKeyPath(r.raw, k))
    }
    case 'annotationType': {
      const t = model.annotationTypes[rule.name]
      return t !== undefined && fits(declOf(t), rule.want, model.types)
    }
    case 'annotated':
      return matches(annotationAt(model, rule)?.[`(${rule.name})`], rule.value)
    case 'included':
      return model.included.includes(rule.file)
    case 'library':
      return model.libraries.some((l) => l.prefix === rule.prefix && (!rule.file || l.path === rule.file))
    case 'scheme':
      return Object.entries(model.schemes).some(
        ([name, s]) => (!rule.name || name === rule.name) && (!rule.schemeType || contains(s?.type, rule.schemeType)) && list(rule.has ?? []).every((k) => hasKeyPath(s, k)),
      )
    case 'secured':
      return secured(findMethod(model, rule.path, rule.method), rule.scheme, rule.scopes)
    case 'any':
      return rule.rules.some((r) => evaluate(r, parsed))
    case 'all':
      return rule.rules.every((r) => evaluate(r, parsed))
    default:
      return false
  }
}

export function runRamlChecks(parsed, checks = []) {
  return checks.map((c) => ({ label: c.label, pass: evaluate(c.rule, parsed) }))
}

// A problem's checks, led by the one every problem shares.
export const ramlChecks = (problem) => [{ label: 'The file is valid RAML 1.0', rule: { type: 'valid' } }, ...(problem.ramlChecks ?? [])]

const wanted = (want) => {
  if (want === undefined) return ''
  if (typeof want === 'boolean' || typeof want === 'number') return String(want)
  if (Array.isArray(want)) return want.join(', ')
  if (isObject(want)) {
    return [
      'set' in want ? (want.set ? 'set' : 'not set') : '',
      'exactly' in want ? `exactly ${want.exactly.join(', ')}` : '',
      'accepts' in want ? `one that accepts ${want.accepts.join(', ')}` : '',
      'rejects' in want ? `one that rejects ${want.rejects.join(', ')}` : '',
      'gte' in want ? `at least ${want.gte}` : '',
      'lte' in want ? `at most ${want.lte}` : '',
      'oneOf' in want ? want.oneOf.join(' or ') : '',
      'not' in want ? `not ${want.not}` : '',
    ].filter(Boolean).join(' and ')
  }
  return want
}
const wantText = (want) => (want ? ` with ${Object.entries(want).map(([k, w]) => `${k}: ${wanted(w)}`).join(', ')}` : '')
const on = (rule) => `${rule.method.toUpperCase()} ${rule.path.replace(/\{\}/g, '{id}')}`
const pathText = (path) => path.replace(/\{\}/g, '{id}')

// Says in plain words what a failing check still needs.
export function ramlHint(parsed, rule) {
  const { errors, model } = parsed
  if (rule.type === 'valid') {
    const first = errors[0]
    return first ? `${first.file ? `${first.file}, line` : 'Line'} ${first.line}: ${first.message}` : 'The file has no errors.'
  }
  if (!model) return 'Fix the errors in the file first.'
  const noMethod = rule.method && rule.path && !findMethod(model, rule.path, rule.method)
  switch (rule.type) {
    case 'root':
      return `Add ${rule.key} at the top of the file${rule.want === undefined ? '' : `, with ${wanted(rule.want)}`}.`
    case 'resource':
      return `Add the resource ${pathText(rule.path)}.`
    case 'noResource':
      return `Remove ${pathText(rule.path)}. It does not belong in this API.`
    case 'method':
      return findResource(model, rule.path) ? `Add ${rule.method} under ${pathText(rule.path)}.` : `Add the resource ${pathText(rule.path)} with ${rule.method} under it.`
    case 'noMethod':
      return `Remove ${on(rule)}. It should not be offered.`
    case 'param': {
      if (rule.in !== 'uri' && noMethod) return `Add ${on(rule)} first.`
      const block = { query: 'queryParameters', header: 'headers', uri: 'uriParameters' }[rule.in]
      const where = rule.in === 'uri' ? pathText(rule.path) : on(rule)
      return `Under ${block} on ${where}, add ${rule.name ?? 'the parameter'}${wantText(rule.want)}.`
    }
    case 'body':
      if (noMethod) return `Add ${on(rule)} first.`
      return `Give ${on(rule)} a body${rule.media ? ` of ${rule.media}` : ''}${rule.typeIs ? ` with type ${rule.typeIs}` : ''}.`
    case 'response': {
      if (noMethod) return `Add ${on(rule)} first.`
      if (rule.noBody && findMethod(model, rule.path, rule.method)?.responses?.[rule.status] !== undefined) return `Remove the body from the ${rule.status} response on ${on(rule)}.`
      const bits = [rule.media && `body ${rule.media}`, rule.typeIs && `type ${rule.typeIs}`, rule.example && 'an example', rule.header && `header ${rule.header}`].filter(Boolean)
      return `Give ${on(rule)} a ${rule.status} response${bits.length ? ` with ${bits.join(', ')}` : ''}.`
    }
    case 'typeDecl':
      return `Under types, declare ${rule.name}${rule.extends ? ` with type: ${rule.extends}` : ''}${wantText(rule.want)}.`
    case 'prop':
      return model.types[rule.typeName] === undefined ? `Declare the type ${rule.typeName} first.` : `Give ${rule.typeName} the property ${rule.prop}${wantText(rule.want)}.`
    case 'noType':
      return `Remove the type ${rule.name}. It does not belong in this contract.`
    case 'noProp':
      return `Remove ${rule.prop} from ${rule.typeName}. It does not belong in this contract.`
    case 'trait':
      return `Under traits, declare ${rule.name}${rule.has ? ` with ${rule.has}` : ''}.`
    case 'applied':
      return noMethod ? `Add ${on(rule)} first.` : `Apply the trait with is: [ ${rule.trait} ] on ${on(rule)} or its resource.`
    case 'resourceType':
      return `Under resourceTypes, declare ${rule.name}${rule.has ? ` with ${list(rule.has).join(', ')}` : ''}.`
    case 'typed':
      if (findResource(model, rule.path)?.type === rule.resourceType) return `Move ${list(rule.provides).join(', ')} into the resource type ${rule.resourceType}, so ${pathText(rule.path)} gets it from there.`
      return `Add type: ${rule.resourceType} on ${pathText(rule.path)}.`
    case 'annotationType':
      return `Under annotationTypes, declare ${rule.name}${wantText(rule.want)}.`
    case 'annotated': {
      const place = rule.prop ? `${rule.typeName}.${rule.prop}` : rule.typeName ?? (rule.method ? on(rule) : rule.path ? pathText(rule.path) : 'the top of the file')
      return `Add (${rule.name})${rule.value === undefined ? '' : ` with the value ${wanted(rule.value)}`} on ${place}.`
    }
    case 'included':
      return `Bring in ${rule.file} with !include.`
    case 'library':
      return `Under uses, add ${rule.prefix}${rule.file ? `: ${rule.file}` : ''}.`
    case 'scheme':
      return `Under securitySchemes, declare ${rule.name ?? 'a scheme'}${rule.schemeType ? ` of type ${rule.schemeType}` : ''}${rule.has ? ` with ${list(rule.has).join(', ')}` : ''}.`
    case 'secured':
      return noMethod ? `Add ${on(rule)} first.` : `Add securedBy: [ ${rule.scheme}${rule.scopes ? `: { scopes: [ ${rule.scopes.join(', ')} ] }` : ''} ] on ${on(rule)}, its resource or the whole API.`
    case 'any':
      return `${ramlHint(parsed, rule.rules[0])} Other ways of doing this also pass.`
    case 'all': {
      const failing = rule.rules.find((r) => !evaluate(r, parsed))
      return failing ? ramlHint(parsed, failing) : 'Check this requirement against the scenario.'
    }
    default:
      return 'Check this requirement against the scenario.'
  }
}

export { parseRaml }
