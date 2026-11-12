import { COMPONENTS } from './catalog.js'
import { walk } from './model.js'
import { missingSystems, systemUsesIn, useText } from './systems.js'

// Design checks for flow problems. Each check is { label, rule } and passes or fails
// against the user's design. Rules:
//   { type: 'source',  component, where? }              a flow is triggered by this source
//   { type: 'exists',  component, where?, min? }        component used (at least `min` times)
//   { type: 'absent',  component, where?, inFlowWith?, within? }
//                                                       component must not be used (in a flow holding { component, where },
//                                                       or inside `within`)
//   { type: 'routes',  component, min?, where?, routeWhere? }
//                                                       a router with at least `min` routes, one of them matching routeWhere
//   { type: 'inside',  component, within?, where?, withinWhere?, routeWhere?, inSlot?, min? }
//                                                       component placed inside a `within` scope/router/handler. withinWhere
//                                                       matches that parent's config, routeWhere the route it sits on, and
//                                                       inSlot a slot on the way down, such as 'onComplete' or 'otherwise'.
//                                                       A Flow Reference counts: a called flow sits where each call sits.
//                                                       absent takes routeWhere and inSlot too.
//   { type: 'before',  first, then, firstWhere?, thenWhere?, every?, outside? }
//                                                       `first` appears before `then` in the same flow. every: all of them
//                                                       do. outside: `then` is on the main path, so not nested
//                                                       inside `first` and not in an error handler. samePath: only
//                                                       pairs that can run in one pass count, so two different routes,
//                                                       or a route and the otherwise branch, are never compared.
//   { type: 'handler', component, errorType?, within?, where? } error handler (optionally for an error type / inside a scope)
//   { type: 'linked',  from: { component, where?, key }, to: { component, where?, key, holding? }, as? }
//                                                       a setting on one component names the same thing as a setting
//                                                       on another, such as a publish destination and a listener's
//                                                       queue. as: 'errorType' ties a raised error to the handler
//                                                       that names it (ANY does not count). holding: { component,
//                                                       where } the `to` component must contain, such as the status.
//   { type: 'flows',   kind, min }                      number of flows / sub-flows
//   { type: 'refs' }                                    every Flow Reference points to an existing flow
//   { type: 'any',     rules }                          one of these passes, for designs with more than one right answer
//   { type: 'all',     rules }                          all of these pass, under one label
//   { type: 'complete' }                                nothing is left blank or as a placeholder (see designChecks)
// `component` may be a string or an array of alternatives.
// `where` matches config values: strings are case-insensitive "contains", numbers are exact,
// { gte }, { lte } compare numbers, { set: true } requires a non-empty value,
// { oneOf: [...] } contains one of these, { not } must not contain this, { all: [...] } contains each of these,
// { is } equals this exactly (case aside). For an error handler's type, ANY is a whole word and also matches
// a handler with no type, since both catch everything.
// Order follows the canvas: steps, then routes, then otherwise, On Complete and error handlers.

function index(design) {
  const nodes = []
  let order = 0
  walk(design, (item, ctx) => {
    if (ctx.isFlow || ctx.isRoute) return
    nodes.push({ node: item, flow: ctx.flow, ancestors: ctx.ancestors, order: order++, slot: ctx.slot, slots: ctx.slots })
  })
  return nodes
}

const anyOf = (component) => (Array.isArray(component) ? component : [component])

const contains = (have, want) => String(have ?? '').toLowerCase().includes(String(want).toLowerCase())

// An error handler with type ANY, or with no type at all, catches everything. "Contains ANY" would also match
// ANYPOINT-MQ:CONNECTIVITY or HTTP:TOO_MANY_REQUESTS, so ANY in a type is read as a whole word.
const catchesAll = (type) => String(type ?? '').trim() === '' || String(type).toUpperCase().split(/[,\s]+/).includes('ANY')
const has = (key, have, want) => (key === 'type' && String(want).toUpperCase() === 'ANY' ? catchesAll(have) : contains(have, want))
const same = (have, want) => String(have ?? '').trim().toLowerCase() === String(want).trim().toLowerCase()

function matchesWhere(config = {}, where = {}) {
  return Object.entries(where).every(([key, want]) => {
    const have = config[key]
    if (want && typeof want === 'object') {
      if ('set' in want) return want.set ? have !== undefined && String(have).trim() !== '' : !have
      const n = Number(have)
      if ('is' in want && !same(have, want.is)) return false
      if ('all' in want && !want.all.every((w) => has(key, have, w))) return false
      if ('gte' in want && !(n >= want.gte)) return false
      if ('lte' in want && !(n <= want.lte)) return false
      if ('oneOf' in want && !want.oneOf.some((w) => has(key, have, w))) return false
      if ('not' in want && has(key, have, want.not)) return false
      return true
    }
    if (typeof want === 'number') return Number(have) === want
    return has(key, have, want)
  })
}

const errorTypeMatches = (configured = '', wanted) =>
  configured
    .split(/[,\s]+/)
    .map((t) => t.trim().toUpperCase())
    .some((t) => t === wanted.toUpperCase() || t === 'ANY')

// Two settings name the same thing: a queue a publish sends to and a listener reads, or an error a Raise Error
// throws and a handler catches. DataWeave wrapping and quotes are ignored. For error types every token of the
// raised type must be named by the handler: ANY does not count, since it says nothing about the link.
const bare = (value) => String(value ?? '').trim().replace(/^#\[\s*(.*?)\s*\]$/s, '$1').replace(/^(["'])(.*)\1$/s, '$2').trim().toLowerCase()
function linkedValues(a, b, as) {
  if (as === 'errorType') {
    const caught = bare(b).toUpperCase().split(/[,\s]+/).filter(Boolean)
    return bare(a).toUpperCase().split(/[,\s]+/).filter(Boolean).every((t) => caught.includes(t))
  }
  return bare(a) !== '' && bare(a) === bare(b)
}

// Every place a component sits: its own chain of parents, and one chain for each Flow Reference that calls
// its flow, so a sub-flow called from a handler and from a route sits in both. Each entry is
// { ancestors, slots }, outermost first.
function placements(entry, nodes, seen = new Set()) {
  const own = { ancestors: entry.ancestors, slots: entry.slots ?? [] }
  const out = [own]
  for (const ref of nodes) {
    if (ref.node.type !== 'flow-ref' || ref.node.config.name !== entry.flow.name || seen.has(ref)) continue
    for (const above of placements(ref, nodes, new Set([...seen, ref]))) {
      out.push({ ancestors: [...above.ancestors, ref.node, ...own.ancestors], slots: [...above.slots, ...own.slots] })
    }
  }
  return out
}

// The branch a step takes under each component it sits in: a route's id, or the slot (steps, otherwise,
// errorHandlers, onComplete). slots holds one entry per list on the way down, so slot k+1 sits under the
// k-th ancestor that is a component (routes are ancestors with no type and add a list of their own).
function branches(entry) {
  const out = new Map()
  const slots = entry.slots ?? []
  let depth = 0
  entry.ancestors.forEach((a, i) => {
    if (!a.type) return
    depth++
    const next = entry.ancestors[i + 1]
    out.set(a.id, next && !next.type ? `route:${next.id}` : slots[depth] ?? 'steps')
  })
  return out
}

function samePath(a, b) {
  const left = branches(a)
  for (const [id, branch] of branches(b)) if (left.has(id) && left.get(id) !== branch) return false
  return true
}

// One placement must hold the whole rule: the scope, the route and the slot, so a match is never pieced
// together from two different call sites.
function placedInside(entry, rule, nodes) {
  return placements(entry, nodes).some(({ ancestors, slots }) => {
    const parent = !rule.within || ancestors.some((a) => anyOf(rule.within).includes(a.type) && matchesWhere(a.config, rule.withinWhere))
    // Routes are the ancestors with no component type of their own.
    const route = !rule.routeWhere || ancestors.some((a) => !a.type && matchesWhere(a.config, rule.routeWhere))
    return parent && route && (!rule.inSlot || slots.includes(rule.inSlot))
  })
}

// Settings a component cannot work without. Optional settings are left out, and so is an error handler's
// type, because a handler with no type catches everything.
const REQUIRED = {
  'set-variable': ['variableName', 'value'],
  'set-payload': ['value'],
  logger: ['message'],
  transform: ['script'],
  'http-listener': ['path'],
  'http-request': ['path'],
  'flow-ref': ['name'],
  'raise-error': ['type'],
  validation: ['expression'],
  'db-select': ['sql'],
  'db-insert': ['sql'],
  'db-update': ['sql'],
  'db-delete': ['sql'],
  'mq-publish': ['destination'],
  'mq-subscriber': ['destination'],
  'jms-publish': ['destination'],
  'jms-listener': ['destination'],
  'jms-consume': ['destination'],
}

const blank = (value) => String(value ?? '').trim() === ''

// What is still unfinished in a design, in plain words. A value the palette fills in is a placeholder only
// when it could never be the real answer.
function unfinished(design, nodes) {
  const out = []
  const names = new Set(design.flows.map((f) => f.name))
  for (const { node } of nodes) {
    const label = componentLabel(node.type)
    for (const key of REQUIRED[node.type] ?? []) {
      if (blank(node.config[key])) out.push(`${label} needs ${fieldLabel(node.type, key)}`)
    }
    if (node.type === 'set-variable' && node.config.variableName === 'myVar') out.push('Set Variable still has the name myVar')
    if (node.type === 'http-request' && node.config.path === '/') out.push('HTTP Request still has the path /')
    if (node.type === 'transform' && node.config.target === 'variable' && blank(node.config.variableName)) out.push('Transform Message needs a variable name')
    if (node.type === 'flow-ref' && !blank(node.config.name) && !names.has(node.config.name)) out.push(`Flow Reference points at “${node.config.name}”, which is not on the canvas`)
    if (node.type === 'choice') {
      for (const route of node.routes ?? []) {
        if (blank(route.config.expression) || route.config.expression === '#[true]') out.push('A Choice route still needs its own condition')
      }
    }
  }
  return [...new Set(out)]
}

function evaluate(rule, nodes, design) {
  const of = (component, where) =>
    nodes.filter((e) => anyOf(component).includes(e.node.type) && matchesWhere(e.node.config, where))

  switch (rule.type) {
    case 'source':
      return of(rule.component, rule.where).some((e) => e.slot === 'source')
    case 'exists':
      return of(rule.component, rule.where).length >= (rule.min ?? 1)
    case 'absent': {
      const holders = rule.inFlowWith && of(rule.inFlowWith.component, rule.inFlowWith.where).map((e) => e.flow)
      const placed = rule.within || rule.routeWhere || rule.inSlot
      return !of(rule.component, rule.where).some(
        (e) => (!holders || holders.includes(e.flow)) && (!placed || placedInside(e, rule, nodes)),
      )
    }
    case 'routes':
      return of(rule.component, rule.where).some(
        (e) => (e.node.routes?.length ?? 0) >= (rule.min ?? 1) && (!rule.routeWhere || e.node.routes.some((r) => matchesWhere(r.config, rule.routeWhere))),
      )
    case 'inside':
      return of(rule.component, rule.where).filter((e) => placedInside(e, rule, nodes)).length >= (rule.min ?? 1)
    case 'before': {
      const pairs = of(rule.first, rule.firstWhere).flatMap((a) =>
        of(rule.then, rule.thenWhere).filter((b) => b.flow === a.flow).map((b) => [a, b]),
      )
      const onMainPath = (a, b) => !b.ancestors.some((x) => x === a.node || COMPONENTS[x.type]?.kind === 'handler')
      const inOrder = ([a, b]) => b.order > a.order && (!rule.outside || onMainPath(a, b))
      // samePath: steps on two different branches of one router never run one after the other, so skip them.
      const counted = rule.samePath ? pairs.filter(([a, b]) => samePath(a, b)) : pairs
      return rule.every ? counted.length > 0 && counted.every(inOrder) : counted.some(inOrder)
    }
    case 'handler':
      return of(rule.component, rule.where).some(
        (e) =>
          (!rule.errorType || errorTypeMatches(e.node.config.type, rule.errorType)) &&
          (!rule.within || e.ancestors.some((a) => anyOf(rule.within).includes(a.type))),
      )
    case 'linked': {
      const { from, to } = rule
      const sources = of(from.component, from.where).filter((e) => !blank(e.node.config[from.key]))
      const targets = of(to.component, to.where).filter((e) => !to.holding || nodes.some((n) => n.ancestors.includes(e.node) && anyOf(to.holding.component).includes(n.node.type) && matchesWhere(n.node.config, to.holding.where)))
      return sources.some((a) => targets.some((b) => linkedValues(a.node.config[from.key], b.node.config[to.key], rule.as)))
    }
    case 'flows':
      return design.flows.filter((f) => f.kind === rule.kind).length >= rule.min
    case 'refs': {
      const names = new Set(design.flows.map((f) => f.name))
      const refs = of('flow-ref')
      return refs.length > 0 && refs.every((e) => names.has(e.node.config.name))
    }
    case 'any':
      return rule.rules.some((r) => evaluate(r, nodes, design))
    case 'all':
      return rule.rules.every((r) => evaluate(r, nodes, design))
    case 'complete':
      return nodes.length > 0 && unfinished(design, nodes).length === 0
    case 'systems':
      return missingSystems(rule.want, design).length === 0
    default:
      return false
  }
}

export function runChecks(design, checks = []) {
  const nodes = index(design)
  return checks.map((c) => ({ label: c.label, pass: evaluate(c.rule, nodes, design) }))
}

// A problem's own checks, plus the checks every problem shares: the design uses every system the scenario lists
// (a problem's own checks test the key ideas, so without this a whole endpoint or query could be left out), and
// nothing is left blank. Self-assessed problems have none.
export function designChecks(problem) {
  if (!problem.flowChecks?.length) return []
  const want = systemUsesIn(problem.referenceFlow)
  return [
    ...problem.flowChecks,
    ...(want.length ? [{ label: 'Makes every call, read and write the scenario needs (see "Systems you can call")', rule: { type: 'systems', want } }] : []),
    { label: 'Nothing is left blank or as a placeholder', rule: { type: 'complete' } },
  ]
}

// Human-readable name for a component type, used in authoring tools and messages.
export const componentLabel = (type) => COMPONENTS[type]?.label ?? type

const names = (component) => anyOf(component).map(componentLabel).join(' or ')

function fieldLabel(component, key) {
  for (const type of anyOf(component)) {
    const field = COMPONENTS[type]?.fields?.find((f) => f.key === key)
    if (field) return field.label
  }
  return key
}

function wantedValue(want) {
  if (want && typeof want === 'object') {
    if ('set' in want) return want.set ? 'filled in' : 'left empty'
    return [
      'is' in want ? `set to “${want.is}”` : '',
      'all' in want ? `containing ${want.all.map((w) => `“${w}”`).join(' and ')}` : '',
      'gte' in want ? `of at least ${want.gte}` : '',
      'lte' in want ? `of at most ${want.lte}` : '',
      'oneOf' in want ? `containing ${want.oneOf.map((w) => `“${w}”`).join(' or ')}` : '',
      'not' in want ? `not containing “${want.not}”` : '',
    ].filter(Boolean).join(' and ')
  }
  return typeof want === 'number' ? `set to ${want}` : `containing “${want}”`
}

const whereText = (component, where) =>
  Object.entries(where)
    .map(([key, want]) => `${fieldLabel(component, key)} ${wantedValue(want)}`)
    .join(' and ')

const withText = (component, where) => (where ? ` with ${whereText(component, where)}` : '')

// Where a rule places a component: the scope, the route (by the router's own route fields) and the slot.
function placeText(rule) {
  const routeLabel = (key) => anyOf(rule.within ?? []).map((t) => COMPONENTS[t]?.routeFields?.find((f) => f.key === key)?.label).find(Boolean) ?? key
  const route = rule.routeWhere ? `, on a route with ${Object.entries(rule.routeWhere).map(([k, w]) => `${routeLabel(k)} ${wantedValue(w)}`).join(' and ')}` : ''
  const slot = rule.inSlot ? `, in its ${SLOT_NAMES[rule.inSlot] ?? rule.inSlot}` : ''
  return `${rule.within ? names(rule.within) : 'the flow'}${withText(rule.within, rule.withinWhere)}${route}${slot}`
}
const SLOT_NAMES = { onComplete: 'On Complete phase', otherwise: 'otherwise branch', errorHandlers: 'error handling' }

// Says in plain words what a failing check still needs, reading the design so it can name what is already there.
export function missingHint(design, rule) {
  const nodes = index(design)
  const of = (component, where) =>
    nodes.filter((e) => anyOf(component).includes(e.node.type) && matchesWhere(e.node.config, where))
  const addOrFix = (component, where) => {
    if (!where) return `Add ${names(component)}.`
    const text = whereText(component, where)
    return of(component).length ? `Your ${names(component)} needs ${text}.` : `Add ${names(component)} with ${text}.`
  }

  switch (rule.type) {
    case 'source':
      if (of(rule.component).some((e) => e.slot === 'source')) return addOrFix(rule.component, rule.where)
      return `Put ${names(rule.component)} in the source slot at the top of a flow${rule.where ? `, with ${whereText(rule.component, rule.where)}` : ''}.`
    case 'exists': {
      const min = rule.min ?? 1
      if (min > 1) return `Use ${names(rule.component)} at least ${min} times${rule.where ? `, with ${whereText(rule.component, rule.where)}` : ''}. You have ${of(rule.component, rule.where).length}.`
      return addOrFix(rule.component, rule.where)
    }
    case 'absent':
      return rule.inFlowWith
        ? `Remove ${names(rule.component)} from the flow with ${names(rule.inFlowWith.component)}${withText(rule.inFlowWith.component, rule.inFlowWith.where)}.`
        : `Remove ${names(rule.component)}${withText(rule.component, rule.where)}${rule.within || rule.routeWhere || rule.inSlot ? ` from ${placeText(rule)}` : ''}. This design should not use it.`
    case 'routes': {
      const route = rule.routeWhere ? `, one of them with ${Object.entries(rule.routeWhere).map(([k, w]) => `${COMPONENTS[anyOf(rule.component)[0]]?.routeFields?.find((f) => f.key === k)?.label ?? k} ${wantedValue(w)}`).join(' and ')}` : ''
      const min = rule.min ?? 1
      return of(rule.component).length
        ? `Give ${names(rule.component)}${withText(rule.component, rule.where)} at least ${min} ${min === 1 ? 'route' : 'routes'}${route}.`
        : `Add ${names(rule.component)}${withText(rule.component, rule.where)} with at least ${min} ${min === 1 ? 'route' : 'routes'}${route}.`
    }
    case 'inside': {
      const place = placeText(rule)
      const min = rule.min ?? 1
      if (min > 1) return `Use ${names(rule.component)}${withText(rule.component, rule.where)} at least ${min} times inside ${place}.`
      if (!of(rule.component, rule.where).length) return `${addOrFix(rule.component, rule.where)} Place it inside ${place}.`
      return `Move ${names(rule.component)} inside ${place}.`
    }
    case 'before': {
      const first = `${names(rule.first)}${withText(rule.first, rule.firstWhere)}`
      const then = `${names(rule.then)}${withText(rule.then, rule.thenWhere)}`
      // A step that is there with the wrong settings needs fixing, not adding.
      const missing = (component, where, other, word) =>
        of(component).length && where ? `Your ${names(component)} needs ${whereText(component, where)}, ${word} ${other} in the same flow.` : `Add ${names(component)}${withText(component, where)}, ${word} ${other} in the same flow.`
      if (!of(rule.first, rule.firstWhere).length) return missing(rule.first, rule.firstWhere, then, 'before')
      if (!of(rule.then, rule.thenWhere).length) return missing(rule.then, rule.thenWhere, first, 'after')
      if (rule.every) return `Every ${first} must come before every ${then}, in the same flow${rule.samePath ? ', on each path through it' : ''}.`
      if (rule.samePath) return `Put ${first} before ${then} on the same path, in the same route when they sit in a router.`
      if (rule.outside) return `Put ${then} after ${first} on the main path, not inside it or in an error handler.`
      return `Put ${first} before ${then}, and keep both in the same flow.`
    }
    case 'handler': {
      const type = rule.errorType ? ` for error type ${rule.errorType}` : ''
      const within = rule.within ? ` inside ${names(rule.within)}` : ''
      return of(rule.component).length
        ? `Your ${names(rule.component)} needs to be${within || ' set up'}${type}${withText(rule.component, rule.where)}.`
        : `Add ${names(rule.component)}${type}${within}${withText(rule.component, rule.where)}.`
    }
    case 'linked': {
      const { from, to } = rule
      const paren = (c, w) => (w ? ` (${whereText(c, w)})` : '')
      const holding = to.holding ? ` that holds ${names(to.holding.component)}${paren(to.holding.component, to.holding.where)}` : ''
      const target = `${names(to.component)}${paren(to.component, to.where)}${holding}`
      const source = `${names(from.component)}${paren(from.component, from.where)}`
      if (rule.as === 'errorType') return `The ${target} must name the error type that ${source} raises.`
      return `${fieldLabel(from.component, from.key)} on ${source} must match ${fieldLabel(to.component, to.key)} on ${target}.`
    }
    case 'flows':
      return `Use at least ${rule.min} ${rule.kind === 'sub-flow' ? 'sub-flows' : 'flows'}. Add more with the toolbar buttons.`
    case 'refs':
      return of('flow-ref').length
        ? 'Every Flow Reference must name a flow that exists. Check the spelling.'
        : 'Add a Flow Reference and point it at a flow that exists.'
    case 'any':
      return `${missingHint(design, rule.rules[0])} Other ways of doing this also pass.`
    case 'all': {
      const failing = rule.rules.find((r) => !evaluate(r, nodes, design))
      return failing ? missingHint(design, failing) : 'Check this requirement against the scenario.'
    }
    case 'systems': {
      const left = missingSystems(rule.want, design).map(useText)
      const more = left.length > 3 ? `, and ${left.length - 3} more` : ''
      return `Your design still needs to ${left.slice(0, 3).join('; ')}${more}.`
    }
    case 'complete': {
      if (!nodes.length) return 'Build the design first, then fill in each component.'
      const left = unfinished(design, nodes)
      const more = left.length > 3 ? ` And ${left.length - 3} more.` : ''
      return `${left.slice(0, 3).join('. ')}.${more}`
    }
    default:
      return 'Check this requirement against the scenario.'
  }
}
