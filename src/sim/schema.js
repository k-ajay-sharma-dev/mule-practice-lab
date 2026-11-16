// A small JSON Schema checker for the JSON module's Validate schema step. It covers the keywords interview schemas
// use: type, required, properties, additionalProperties, items, enum, const, minimum, maximum, exclusiveMinimum,
// exclusiveMaximum, minLength, maxLength, pattern, minItems, maxItems, format (email, date, date-time) and
// allOf / anyOf / oneOf. It returns the list of problems, empty when the value honours the schema.
import { deepEqual, isObject } from './values.js'

const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v)
const typeOk = (v, t) => [].concat(t).some((x) => x === typeOf(v) || (x === 'number' && typeof v === 'number'))
const FORMATS = {
  email: (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s),
  date: (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)),
  'date-time': (s) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s) && !Number.isNaN(Date.parse(s)),
}

export function schemaProblems(value, schema, path = '#') {
  if (!isObject(schema)) return []
  const out = []
  const at = (p) => `${path}${p}`
  if (schema.type !== undefined && !typeOk(value, schema.type)) {
    return [`${path}: expected type ${[].concat(schema.type).join(' or ')}, found ${typeOf(value)}`]
  }
  if (schema.enum && !schema.enum.some((e) => deepEqual(e, value))) out.push(`${path}: ${JSON.stringify(value)} is not one of ${JSON.stringify(schema.enum)}`)
  if ('const' in schema && !deepEqual(schema.const, value)) out.push(`${path}: must be ${JSON.stringify(schema.const)}`)
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) out.push(`${path}: ${value} is less than the minimum ${schema.minimum}`)
    if (schema.maximum !== undefined && value > schema.maximum) out.push(`${path}: ${value} is more than the maximum ${schema.maximum}`)
    if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) out.push(`${path}: ${value} must be more than ${schema.exclusiveMinimum}`)
    if (schema.exclusiveMaximum !== undefined && value >= schema.exclusiveMaximum) out.push(`${path}: ${value} must be less than ${schema.exclusiveMaximum}`)
  }
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) out.push(`${path}: shorter than ${schema.minLength} characters`)
    if (schema.maxLength !== undefined && value.length > schema.maxLength) out.push(`${path}: longer than ${schema.maxLength} characters`)
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) out.push(`${path}: does not match the pattern ${schema.pattern}`)
    if (schema.format && FORMATS[schema.format] && !FORMATS[schema.format](value)) out.push(`${path}: is not a valid ${schema.format}`)
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) out.push(`${path}: fewer than ${schema.minItems} items`)
    if (schema.maxItems !== undefined && value.length > schema.maxItems) out.push(`${path}: more than ${schema.maxItems} items`)
    if (isObject(schema.items)) value.forEach((item, i) => out.push(...schemaProblems(item, schema.items, at(`/${i}`))))
  }
  if (isObject(value)) {
    for (const key of schema.required ?? []) if (!(key in value)) out.push(`${path}: the required property ${key} is missing`)
    for (const [key, sub] of Object.entries(schema.properties ?? {})) if (key in value) out.push(...schemaProblems(value[key], sub, at(`/${key}`)))
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) if (!(key in (schema.properties ?? {}))) out.push(`${path}: the property ${key} is not allowed`)
    }
  }
  for (const sub of schema.allOf ?? []) out.push(...schemaProblems(value, sub, path))
  if (schema.anyOf && !schema.anyOf.some((s) => !schemaProblems(value, s, path).length)) out.push(`${path}: matches none of the allowed shapes`)
  if (schema.oneOf && schema.oneOf.filter((s) => !schemaProblems(value, s, path).length).length !== 1) out.push(`${path}: must match exactly one of the allowed shapes`)
  return out
}
