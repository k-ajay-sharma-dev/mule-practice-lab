import { COMPONENTS } from './catalog.js'
import { walk } from './model.js'

// Design checks for flow problems. Each check is { label, rule } and passes or fails
// against the user's design. Rules:
//   { type: 'source',  component, where? }              a flow is triggered by this source
//   { type: 'exists',  component, where?, min? }        component used (at least `min` times)
//   { type: 'absent',  component, where?, inFlowWith?, within? }
//                                                       component must not be used (in a flow holding { component, where },
//                                                       or inside `within`)
//   { type: 'routes',  component, min }                 a router with at least `min` routes
//   { type: 'inside',  component, within, where?, withinWhere?, routeWhere?, min? }
//                                                       component placed inside a `within` scope/router/handler. withinWhere
//                                                       matches that parent's config, routeWhere the route it sits on.
//                                                       A Flow Reference counts: a called flow sits where the call sits.
//   { type: 'before',  first, then, firstWhere?, thenWhere?, every?, outside? }
//                                                       `first` appears before `then` in the same flow. every: all of them
//                                                       do. outside: `then` is on the main path, so not nested
//                                                       inside `first` and not in an error handler.
//   { type: 'handler', component, errorType?, within?, where? } error handler (optionally for an error type / inside a scope)
//   { type: 'flows',   kind, min }                      number of flows / sub-flows
//   { type: 'refs' }                                    every Flow Reference points to an existing flow
//   { type: 'any',     rules }                          one of these passes, for designs with more than one right answer
//   { type: 'all',     rules }                          all of these pass, under one label
//   { type: 'complete' }                                nothing is left blank or as a placeholder (see designChecks)
// `component` may be a string or an array of alternatives.
// `where` matches config values: strings are case-insensitive "contains", numbers are exact,
// { gte }, { lte } compare numbers, { set: true } requires a non-empty value,
// { oneOf: [...] } contains one of these, { not } must not contain this.

function index(design) {
  const nodes = []
  let order = 0
  walk(design, (item, ctx) => {
    if (ctx.isFlow || ctx.isRoute) return
    nodes.push({ node: item, flow: ctx.flow, ancestors: ctx.ancestors, order: order++, slot: ctx.slot })
  })
  return nodes
}

const anyOf = (component) => (Array.isArray(component) ? component : [component])

const contains = (have, want) => String(have ?? '').toLowerCase().includes(String(want).toLowerCase())

function matchesWhere(config = {}, where = {}) {
  return Object.entries(where).every(([key, want]) => {
    const have = config[key]
    if (want && typeof want === 'object') {
      if ('set' in want) return want.set ? have !== undefined && String(have).trim() !== '' : !have
      const n = Number(have)
      if ('gte' in want && !(n >= want.gte)) return false
      if ('lte' in want && !(n <= want.lte)) return false
      if ('oneOf' in want && !want.oneOf.some((w) => contains(have, w))) return false
      if ('not' in want && contains(have, want.not)) return false
      return true
    }
    if (typeof want === 'number') return Number(have) === want
    return contains(have, want)
  })
}

const errorTypeMatches = (configured = '', wanted) =>
  configured
    .split(/[,\s]+/)
    .map((t) => t.trim().toUpperCase())
    .some((t) => t === wanted.toUpperCase() || t === 'ANY')

// Everything a component sits inside, following Flow References up to the callers.
function allAncestors(entry, nodes, seen = new Set([entry.flow])) {
  const out = [...entry.ancestors]
  for (const ref of nodes) {
    if (ref.node.type !== 'flow-ref' || ref.node.config.name !== entry.flow.name || seen.has(ref.flow)) continue
    seen.add(ref.flow)
    out.push(...allAncestors(ref, nodes, seen))
  }
  return out
}

function placedInside(entry, rule, nodes) {
  const around = allAncestors(entry, nodes)
  const parent = around.some((a) => anyOf(rule.within).includes(a.type) && matchesWhere(a.config, rule.withinWhere))
  // Routes are the ancestors with no component type of their own.
  return parent && (!rule.routeWhere || around.some((a) => !a.type && matchesWhere(a.config, rule.routeWhere)))
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
      return !of(rule.component, rule.where).some(
        (e) => (!holders || holders.includes(e.flow)) && (!rule.within || placedInside(e, rule, nodes)),
      )
    }
    case 'routes':
      return of(rule.component).some((e) => (e.node.routes?.length ?? 0) >= rule.min)
    case 'inside':
      return of(rule.component, rule.where).filter((e) => placedInside(e, rule, nodes)).length >= (rule.min ?? 1)
    case 'before': {
      const pairs = of(rule.first, rule.firstWhere).flatMap((a) =>
        of(rule.then, rule.thenWhere).filter((b) => b.flow === a.flow).map((b) => [a, b]),
      )
      const onMainPath = (a, b) => !b.ancestors.some((x) => x === a.node || COMPONENTS[x.type]?.kind === 'handler')
      const inOrder = ([a, b]) => b.order > a.order && (!rule.outside || onMainPath(a, b))
      return rule.every ? pairs.length > 0 && pairs.every(inOrder) : pairs.some(inOrder)
    }
    case 'handler':
      return of(rule.component, rule.where).some(
        (e) =>
          (!rule.errorType || errorTypeMatches(e.node.config.type, rule.errorType)) &&
          (!rule.within || e.ancestors.some((a) => anyOf(rule.within).includes(a.type))),
      )
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
    default:
      return false
  }
}

export function runChecks(design, checks = []) {
  const nodes = index(design)
  return checks.map((c) => ({ label: c.label, pass: evaluate(c.rule, nodes, design) }))
}

// A problem's own checks, plus the one check every problem shares. Self-assessed problems have none.
export const designChecks = (problem) =>
  problem.flowChecks?.length
    ? [...problem.flowChecks, { label: 'Nothing is left blank or as a placeholder', rule: { type: 'complete' } }]
    : []

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
        : `Remove ${names(rule.component)}${withText(rule.component, rule.where)}${rule.within ? ` from ${names(rule.within)}` : ''}. This design should not use it.`
    case 'routes':
      return of(rule.component).length
        ? `Give ${names(rule.component)} at least ${rule.min} routes.`
        : `Add ${names(rule.component)} with at least ${rule.min} routes.`
    case 'inside': {
      const place = `${names(rule.within)}${withText(rule.within, rule.withinWhere)}${rule.routeWhere ? `, on a route whose condition mentions “${rule.routeWhere.expression}”` : ''}`
      const min = rule.min ?? 1
      if (min > 1) return `Use ${names(rule.component)}${withText(rule.component, rule.where)} at least ${min} times inside ${place}.`
      if (!of(rule.component, rule.where).length) return `${addOrFix(rule.component, rule.where)} Place it inside ${place}.`
      return `Move ${names(rule.component)} inside ${place}.`
    }
    case 'before': {
      const first = `${names(rule.first)}${withText(rule.first, rule.firstWhere)}`
      const then = `${names(rule.then)}${withText(rule.then, rule.thenWhere)}`
      if (!of(rule.first, rule.firstWhere).length) return `Add ${first}, before ${then} in the same flow.`
      if (!of(rule.then, rule.thenWhere).length) return `Add ${then}, after ${first} in the same flow.`
      if (rule.every) return `Every ${first} must come before every ${then}, in the same flow.`
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
