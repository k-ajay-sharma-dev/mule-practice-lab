import { COMPONENTS } from './catalog.js'
import { createFlow, createNode, createRoute } from './model.js'
import { nodeXml } from './xml.js'
import { parseXml } from './xml-parse.js'

// Turns Mule configuration XML, such as a Studio Configuration XML tab, into a design.
//
// The element and attribute names aren't listed here. They are worked out from xml.js: each component is written with
// a marker in every field, and wherever a marker lands is where that field lives. So the two directions can't drift
// apart, and a new component imports as soon as it can export. Structure (routes, scopes, errors) is handled below.

const marker = (key) => `@@${key}@@`
const NUMBER_MARK = 987654
const isText = (field) => ['text', 'expression', 'textarea'].includes(field.type)

// Two components write this element, and this is the one a reader means.
const PREFERRED = { 'file:rename': 'file-rename', 'json:validate-schema': 'json-validate' }
// Studio writes these where the simplified export doesn't.
const STUDIO_NAMES = { 'apikit:router': { 'config-ref': 'config' }, 'http:request': { url: 'path' } }
const DB_CONNECTIONS = {
  'db:oracle-connection': 'Oracle',
  'db:mssql-connection': 'SQL Server',
  'db:my-sql-connection': 'MySQL',
}

const written = (type, config) => {
  const node = createNode(type)
  node.config = config
  return parseXml(nodeXml(node, 0))[0]
}

// Every place a marker or a chosen option appears: { path, attr, field }. attr is null for an element's text.
function placesIn(element, marks, path = []) {
  const found = []
  const field = (value) => marks.find((m) => value === m.value || (m.partial && value.includes(m.value)))?.key
  for (const [attr, value] of Object.entries(element.attrs)) {
    const key = field(value)
    if (key) found.push({ path, attr, field: key })
  }
  if (element.text && field(element.text)) found.push({ path, attr: null, field: field(element.text) })
  for (const child of element.children) found.push(...placesIn(child, marks, [...path, child.name]))
  return found
}

function learnType(type, def, table) {
  const fields = def.fields ?? []
  const defaults = createNode(type).config
  const marked = { ...defaults }
  const marks = []
  fields.forEach((f, i) => {
    if (isText(f)) {
      marked[f.key] = marker(f.key)
      marks.push({ key: f.key, value: marked[f.key], partial: true })
    } else if (f.type === 'number') {
      marked[f.key] = NUMBER_MARK + i
      marks.push({ key: f.key, value: String(marked[f.key]) })
    }
  })

  const entryFor = (tag, main) => {
    const taken = table.get(tag)
    if (taken?.type === type) return taken
    const wins = PREFERRED[tag] ? PREFERRED[tag] === type : !taken || (main && !taken.main)
    if (!wins) return null
    const entry = { type, main, constants: {}, places: [], keepDefault: new Set() }
    table.set(tag, entry)
    return entry
  }
  const record = (element, extra, main, constants = {}) => {
    const entry = entryFor(element.name, main)
    if (!entry) return
    Object.assign(entry.constants, constants)
    for (const place of placesIn(element, [...marks, ...extra])) {
      const same = (p) => p.attr === place.attr && p.field === place.field && p.path.join() === place.path.join()
      if (!entry.places.some(same)) entry.places.push(place)
    }
  }

  const base = written(type, marked)
  if (!base) return
  record(base, [], true)

  // a field left empty, or an option chosen, can change which element is written
  for (const f of fields) {
    if (isText(f)) {
      const element = written(type, { ...marked, [f.key]: '' })
      if (element && element.name !== base.name) record(element, [], false)
    }
    for (const option of f.options ?? []) {
      const element = written(type, { ...marked, [f.key]: option })
      if (!element) continue
      const moved = element.name !== base.name
      record(element, [{ key: f.key, value: option }], !moved, moved ? { [f.key]: option } : {})
    }
  }

  // a field the export leaves out at its default value still has that value when the attribute is missing
  const plain = written(type, defaults)
  const entry = table.get(base.name)
  if (plain && entry?.type === type) {
    for (const f of fields) {
      const places = entry.places.filter((p) => p.field === f.key)
      if (isText(f) && defaults[f.key] && places.length && !read(plain, places).length) entry.keepDefault.add(f.key)
    }
  }
}

let learned
function table() {
  if (!learned) {
    learned = new Map()
    for (const [type, def] of Object.entries(COMPONENTS)) learnType(type, def, learned)
  }
  return learned
}

function atPath(element, path) {
  let found = [element]
  for (const name of path) found = found.flatMap((e) => e.children.filter((c) => c.name === name))
  return found
}

const read = (element, places) =>
  places.flatMap(({ path, attr }) =>
    atPath(element, path)
      .map((e) => (attr ? e.attrs[attr] : e.text))
      .filter((v) => v !== undefined && v !== ''),
  )

// A number field can hold an expression, so only real numbers become numbers.
const valueFor = (field, value) => (field?.type === 'number' && value !== '' && !isNaN(value) ? Number(value) : value)

function configure(element, entry, ctx) {
  const def = COMPONENTS[entry.type]
  const node = createNode(entry.type)
  const config = { ...node.config, ...entry.constants }
  const fields = new Map((def.fields ?? []).map((f) => [f.key, f]))

  for (const f of fields.values()) {
    if (isText(f) && !entry.keepDefault.has(f.key)) config[f.key] = ''
    const places = entry.places.filter((p) => p.field === f.key)
    const values = read(element, places)
    if (values.length) config[f.key] = valueFor(f, values.join(', '))
  }
  for (const [attr, value] of Object.entries(element.attrs)) {
    const key = STUDIO_NAMES[element.name]?.[attr] ?? attr
    if (fields.has(key) && !entry.places.some((p) => p.attr === attr && !p.path.length)) config[key] = valueFor(fields.get(key), value)
  }

  if (fields.has('postAction')) {
    const { autoDelete } = element.attrs
    config.postAction = autoDelete === 'true' ? 'delete' : config.moveTo ? 'move' : config.renameTo ? 'rename' : 'none'
  }
  if (fields.has('database')) config.database = ctx.databases.get(element.attrs['config-ref']) ?? 'Generic JDBC'
  node.config = config
  return node
}

// ---------- Structure ----------

function skip(ctx, name) {
  ctx.skipped.set(name, (ctx.skipped.get(name) ?? 0) + 1)
}

const child = (element, name) => element.children.find((c) => c.name === name)
const descendants = (element, name) =>
  element.children.flatMap((c) => [...(c.name === name ? [c] : []), ...descendants(c, name)])

// Studio keeps the payload and variables of one Transform together. The canvas has one target each, so one node each.
function transforms(element, ctx) {
  const script = (e) => e.text || (e.attrs.resource ? `// Script kept in ${e.attrs.resource}` : '')
  const make = (config) => {
    const node = createNode('transform')
    node.config = { ...node.config, ...config }
    return node
  }
  const nodes = [
    ...descendants(element, 'ee:set-payload').map((e) => make({ target: 'payload', script: script(e) })),
    ...descendants(element, 'ee:set-variable').map((e) =>
      make({ target: 'variable', variableName: e.attrs.variableName ?? '', script: script(e) }),
    ),
  ]
  if (!nodes.length) skip(ctx, 'ee:transform without a script')
  return nodes
}

function scheduler(element) {
  const node = createNode('scheduler')
  const strategy = child(element, 'scheduling-strategy')
  const cron = strategy && child(strategy, 'cron')
  const fixed = strategy && child(strategy, 'fixed-frequency')
  if (cron) node.config = { ...node.config, strategy: 'cron', expression: cron.attrs.expression ?? '' }
  if (fixed) {
    node.config = {
      ...node.config,
      strategy: 'fixed-frequency',
      frequency: valueFor({ type: 'number' }, fixed.attrs.frequency ?? 1000),
      timeUnit: fixed.attrs.timeUnit ?? 'MILLISECONDS',
    }
  }
  return node
}

const routeOf = (router, config, steps) => {
  const route = createRoute(router)
  return { ...route, config: { ...route.config, ...config }, steps }
}

function errorHandlers(element, ctx) {
  return element.children
    .filter((c) => c.name === 'error-handler')
    .flatMap((handler) => {
      if (handler.attrs.ref) skip(ctx, `error-handler ref="${handler.attrs.ref}"`)
      return handler.children.flatMap((c) => {
        if (c.name === 'on-error-propagate' || c.name === 'on-error-continue') return nodesFrom(c, ctx)
        skip(ctx, c.name)
        return []
      })
    })
}

const stepsIn = (elements, ctx) => elements.filter((e) => e.name !== 'error-handler').flatMap((e) => nodesFrom(e, ctx))

function nodesFrom(element, ctx) {
  if (element.name === 'ee:transform') return transforms(element, ctx)
  if (element.name === 'scheduler') return [scheduler(element)]

  const entry = table().get(element.name)
  if (!entry) {
    skip(ctx, element.name)
    return []
  }
  const node = configure(element, entry, ctx)
  const { kind } = COMPONENTS[entry.type]

  if (entry.type === 'choice') {
    node.routes = element.children
      .filter((c) => c.name === 'when')
      .map((c) => routeOf('choice', { expression: c.attrs.expression ?? '' }, stepsIn(c.children, ctx)))
    const otherwise = child(element, 'otherwise')
    node.otherwise = otherwise ? stepsIn(otherwise.children, ctx) : []
  } else if (entry.type === 'batch-job') {
    const records = child(element, 'batch:process-records')
    node.routes = (records?.children ?? [])
      .filter((c) => c.name === 'batch:step')
      .map((c) => routeOf('batch-job', { name: c.attrs.name ?? '', ...(c.attrs.acceptPolicy && { acceptPolicy: c.attrs.acceptPolicy }) }, stepsIn(c.children, ctx)))
    const complete = child(element, 'batch:on-complete')
    node.onComplete = complete ? stepsIn(complete.children, ctx) : []
  } else if (kind === 'router') {
    node.routes = element.children.filter((c) => c.name === 'route').map((c) => routeOf(entry.type, {}, stepsIn(c.children, ctx)))
  } else if (kind === 'scope' || kind === 'handler') {
    node.steps = stepsIn(element.children, ctx)
    if (node.errorHandlers) node.errorHandlers = errorHandlers(element, ctx)
  }
  return [node]
}

function fillFlow(flow, elements, element, ctx) {
  const nodes = stepsIn(elements, ctx)
  const isSource = (n) => COMPONENTS[n.type].kind === 'source'
  if (flow.kind === 'flow') {
    flow.source = nodes.find(isSource) ?? null
    flow.errorHandlers = errorHandlers(element, ctx)
  }
  flow.steps = nodes.filter((n) => !isSource(n))
  return flow
}

function databasesIn(elements) {
  const found = new Map()
  for (const config of elements.filter((e) => e.name === 'db:config')) {
    const connection = config.children[0]
    const postgres = connection?.attrs.url?.startsWith('jdbc:postgresql')
    const name = postgres ? 'PostgreSQL' : DB_CONNECTIONS[connection?.name]
    if (name) found.set(config.attrs.name, name)
  }
  return found
}

const count = (nodes) =>
  nodes.reduce(
    (sum, n) =>
      sum +
      1 +
      count(n.steps ?? []) +
      count(n.otherwise ?? []) +
      count(n.errorHandlers ?? []) +
      count(n.onComplete ?? []) +
      (n.routes ?? []).reduce((inner, r) => inner + count(r.steps), 0),
    0,
  )

export const looksLikeMuleXml = (text) => /<(mule|flow|sub-flow)[\s>]/.test(text)

// Returns { design, flows, components, skipped: [{ name, count }] }. Throws an Error with a readable message.
export function fromXml(text) {
  const parsed = parseXml(text.replace(/^﻿/, ''))
  const none = 'No flows found. Paste the XML that contains your <flow> elements.'
  if (!parsed.length) throw new Error(none)
  const wrapped = parsed.length === 1 && parsed[0].name === 'mule'
  const top = wrapped ? parsed[0].children : parsed
  const ctx = { skipped: new Map(), databases: databasesIn(top) }

  const flows = top
    .filter((e) => e.name === 'flow' || e.name === 'sub-flow')
    .map((e, i) => fillFlow(createFlow(e.name, e.attrs.name || `${e.name}-${i + 1}`), e.children, e, ctx))

  // a piece copied from inside a flow has no flow around it
  const piece = !flows.length && !wrapped
  if (piece) flows.push(fillFlow(createFlow('flow'), parsed, { children: parsed }, ctx))
  if (!flows.length) throw new Error(none)
  for (const e of top) if (e.name === 'error-handler') skip(ctx, 'shared error-handler')

  const components = flows.reduce((sum, f) => sum + count([...(f.source ? [f.source] : []), ...f.steps, ...(f.errorHandlers ?? [])]), 0)
  if (piece && !components) throw new Error(none)
  return { design: { flows }, flows: flows.length, components, skipped: [...ctx.skipped].map(([name, n]) => ({ name, count: n })) }
}
