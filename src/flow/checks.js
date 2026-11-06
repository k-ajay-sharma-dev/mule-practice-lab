import { COMPONENTS } from './catalog.js'
import { walk } from './model.js'

// Design checks for flow problems. Each check is { label, rule } and passes or fails
// against the user's design. Rules:
//   { type: 'source',  component, where? }              a flow is triggered by this source
//   { type: 'exists',  component, where?, min? }        component used (at least `min` times)
//   { type: 'absent',  component }                      component must not be used
//   { type: 'routes',  component, min }                 a router with at least `min` routes
//   { type: 'inside',  component, within, where? }      component placed inside a `within` scope/router
//   { type: 'before',  first, then }                    `first` appears before `then` in the same flow
//   { type: 'handler', component, errorType?, within? } error handler (optionally for an error type / inside a scope)
//   { type: 'flows',   kind, min }                      number of flows / sub-flows
//   { type: 'refs' }                                    every Flow Reference points to an existing flow
// `component` may be a string or an array of alternatives.
// `where` matches config values: strings are case-insensitive "contains", numbers are exact,
// { gte }, { lte } compare numbers, { set: true } requires a non-empty value.

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

function matchesWhere(config = {}, where = {}) {
  return Object.entries(where).every(([key, want]) => {
    const have = config[key]
    if (want && typeof want === 'object') {
      if ('set' in want) return want.set ? have !== undefined && String(have).trim() !== '' : !have
      const n = Number(have)
      if ('gte' in want && !(n >= want.gte)) return false
      if ('lte' in want && !(n <= want.lte)) return false
      return true
    }
    if (typeof want === 'number') return Number(have) === want
    return String(have ?? '').toLowerCase().includes(String(want).toLowerCase())
  })
}

const errorTypeMatches = (configured = '', wanted) =>
  configured
    .split(/[,\s]+/)
    .map((t) => t.trim().toUpperCase())
    .some((t) => t === wanted.toUpperCase() || t === 'ANY')

function evaluate(rule, nodes, design) {
  const of = (component, where) =>
    nodes.filter((e) => anyOf(component).includes(e.node.type) && matchesWhere(e.node.config, where))

  switch (rule.type) {
    case 'source':
      return of(rule.component, rule.where).some((e) => e.slot === 'source')
    case 'exists':
      return of(rule.component, rule.where).length >= (rule.min ?? 1)
    case 'absent':
      return of(rule.component).length === 0
    case 'routes':
      return of(rule.component).some((e) => (e.node.routes?.length ?? 0) >= rule.min)
    case 'inside':
      return of(rule.component, rule.where).some((e) => e.ancestors.some((a) => anyOf(rule.within).includes(a.type)))
    case 'before':
      return of(rule.first).some((a) => of(rule.then).some((b) => b.flow === a.flow && b.order > a.order))
    case 'handler':
      return of(rule.component).some(
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
    default:
      return false
  }
}

export function runChecks(design, checks = []) {
  const nodes = index(design)
  return checks.map((c) => ({ label: c.label, pass: evaluate(c.rule, nodes, design) }))
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
      'gte' in want ? `of at least ${want.gte}` : '',
      'lte' in want ? `of at most ${want.lte}` : '',
    ].filter(Boolean).join(' and ')
  }
  return typeof want === 'number' ? `set to ${want}` : `containing “${want}”`
}

const whereText = (component, where) =>
  Object.entries(where)
    .map(([key, want]) => `${fieldLabel(component, key)} ${wantedValue(want)}`)
    .join(' and ')

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
      return `Remove ${names(rule.component)}. This design should not use it.`
    case 'routes':
      return of(rule.component).length
        ? `Give ${names(rule.component)} at least ${rule.min} routes.`
        : `Add ${names(rule.component)} with at least ${rule.min} routes.`
    case 'inside':
      if (!of(rule.component, rule.where).length) return `${addOrFix(rule.component, rule.where)} Place it inside ${names(rule.within)}.`
      return `Move ${names(rule.component)} inside ${names(rule.within)}.`
    case 'before':
      if (!of(rule.first).length) return `Add ${names(rule.first)}, before ${names(rule.then)} in the same flow.`
      if (!of(rule.then).length) return `Add ${names(rule.then)}, after ${names(rule.first)} in the same flow.`
      return `Put ${names(rule.first)} before ${names(rule.then)}, and keep both in the same flow.`
    case 'handler': {
      const type = rule.errorType ? ` for error type ${rule.errorType}` : ''
      const within = rule.within ? ` inside ${names(rule.within)}` : ''
      return of(rule.component).length
        ? `Your ${names(rule.component)} needs to be${within || ' set up'}${type}.`
        : `Add ${names(rule.component)}${type}${within}.`
    }
    case 'flows':
      return `Use at least ${rule.min} ${rule.kind === 'sub-flow' ? 'sub-flows' : 'flows'}. Add more with the toolbar buttons.`
    case 'refs':
      return of('flow-ref').length
        ? 'Every Flow Reference must name a flow that exists. Check the spelling.'
        : 'Add a Flow Reference and point it at a flow that exists.'
    default:
      return 'Check this requirement against the scenario.'
  }
}
