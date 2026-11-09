import { NODE_TYPES } from './catalog.js'

// Rule-based checks for Architecture Designer diagrams.
//
// A node matcher is a type ('system-api'), a list of types (['erp', 'legacy']) or
// { type, label } where label is a case-insensitive "contains" (string or list of alternatives).
//
// Rules:
//   { type: 'node', match, min = 1, max }            how many matching nodes exist
//   { type: 'edge', from, to, kind, min = 1 }         direct connections (kind 'sync' | 'async' optional)
//   { type: 'path', from, to, via, kind, min = 1 }    a directed route exists (optionally through `via`, or using only
//                                                     `kind` lines), reaching at least `min` different `to` nodes
//   { type: 'no-path', from, to, kind, ifDrawn, unless }  both exist but no route joins them (using only `kind` lines, if
//                                                     given); with `ifDrawn`, `to` may be left out of the diagram; with
//                                                     `unless`, routes through those boxes are allowed (every route must
//                                                     pass one of them)
//   { type: 'only-via', target, from }                target is reached, and only from `from` nodes
//   { type: 'no-edge', from, to, ifDrawn }            both exist but are never directly connected (`ifDrawn`: `to` may be absent)
//   { type: 'each', of, edgeTo | edgeFrom, kind, count = 1, max, some }
//                                                     every `of` node (at least `min`) has from `count` to `max` such
//                                                     connections; with `some`, at least one of them does
//   { type: 'link', from, to }                        a line joins them in either direction, for when both directions are right
//   { type: 'lines', from, to | touching, kind }      every such line that is drawn has this kind (none drawn is fine)
// Every rule needs something drawn to pass, so an empty canvas never satisfies a check.

const asList = (v) => (Array.isArray(v) ? v : [v])

export function matches(node, matcher) {
  if (!matcher) return true
  if (typeof matcher === 'string' || Array.isArray(matcher)) return asList(matcher).includes(node.type)
  if (matcher.type && !asList(matcher.type).includes(node.type)) return false
  if (matcher.label) {
    const label = (node.label || '').toLowerCase()
    if (!asList(matcher.label).some((l) => label.includes(String(l).toLowerCase()))) return false
  }
  return true
}

function graph(diagram) {
  const byId = new Map(diagram.nodes.map((n) => [n.id, n]))
  const edges = diagram.edges.filter((e) => byId.has(e.from) && byId.has(e.to))
  const find = (m) => diagram.nodes.filter((n) => matches(n, m))
  const edgeMatches = (e, from, to, kind) =>
    matches(byId.get(e.from), from) && matches(byId.get(e.to), to) && (!kind || e.kind === kind)
  // stop: boxes a route may not pass through, so nothing is reached beyond them.
  const reachable = (startIds, kind, stop = () => false) => {
    const open = startIds.filter((id) => !stop(id))
    const seen = new Set(open)
    const queue = [...open]
    while (queue.length) {
      const id = queue.shift()
      for (const e of edges) if (e.from === id && (!kind || e.kind === kind) && !seen.has(e.to) && !stop(e.to)) seen.add(e.to), queue.push(e.to)
    }
    return seen
  }
  // Everything reachable in at least one hop from these nodes.
  const after = (ids, kind, stop) => reachable(edges.filter((e) => ids.includes(e.from) && (!kind || e.kind === kind)).map((e) => e.to), kind, stop)
  return { byId, edges, find, edgeMatches, after }
}

const RULES = {
  node(g, r) {
    const n = g.find(r.match).length
    return n >= (r.min ?? 1) && (r.max == null || n <= r.max)
  },
  edge(g, r) {
    return g.edges.filter((e) => g.edgeMatches(e, r.from, r.to, r.kind)).length >= (r.min ?? 1)
  },
  path(g, r) {
    const fromStart = g.after(g.find(r.from).map((n) => n.id), r.kind)
    const reached = new Set()
    if (!r.via) for (const id of fromStart) reached.add(id)
    else for (const v of g.find(r.via)) if (fromStart.has(v.id)) for (const id of g.after([v.id], r.kind)) reached.add(id)
    return g.find(r.to).filter((t) => reached.has(t.id)).length >= (r.min ?? 1)
  },
  'no-path'(g, r) {
    const starts = g.find(r.from).map((n) => n.id)
    const targets = g.find(r.to)
    if (!starts.length || (!targets.length && !r.ifDrawn)) return false
    // unless: routes through these boxes are allowed, so the search stops at them.
    const seen = r.unless ? g.after(starts, r.kind, (id) => matches(g.byId.get(id), r.unless)) : g.after(starts, r.kind)
    return !targets.some((t) => seen.has(t.id))
  },
  'only-via'(g, r) {
    const incoming = g.edges.filter((e) => matches(g.byId.get(e.to), r.target))
    return incoming.length > 0 && incoming.every((e) => matches(g.byId.get(e.from), r.from))
  },
  'no-edge'(g, r) {
    if (!g.find(r.from).length || (!g.find(r.to).length && !r.ifDrawn)) return false
    return !g.edges.some((e) => g.edgeMatches(e, r.from, r.to))
  },
  each(g, r) {
    const nodes = g.find(r.of)
    if (nodes.length < (r.min ?? 1)) return false
    const lines = (n) =>
      g.edges.filter((e) =>
        r.edgeTo
          ? e.from === n.id && matches(g.byId.get(e.to), r.edgeTo) && (!r.kind || e.kind === r.kind)
          : e.to === n.id && matches(g.byId.get(e.from), r.edgeFrom) && (!r.kind || e.kind === r.kind),
      ).length
    const fits = (n) => lines(n) >= (r.count ?? 1) && (r.max == null || lines(n) <= r.max)
    // some: one such node is enough, such as a single Process API shared by every channel.
    return r.some ? nodes.some(fits) : nodes.every(fits)
  },
  link(g, r) {
    return g.edges.some((e) => g.edgeMatches(e, r.from, r.to) || g.edgeMatches(e, r.to, r.from))
  },
  lines(g, r) {
    const covered = (e) =>
      r.touching
        ? matches(g.byId.get(e.from), r.touching) || matches(g.byId.get(e.to), r.touching)
        : g.edgeMatches(e, r.from, r.to)
    return g.edges.length > 0 && g.edges.every((e) => !covered(e) || e.kind === r.kind)
  },
}

export const RULE_TYPES = Object.keys(RULES)

// The same rule with its direction flipped, for spotting arrows drawn the wrong way round.
function reversedRule(r) {
  if (r.type === 'edge' || r.type === 'path') return { ...r, from: r.to, to: r.from }
  if (r.type === 'each' && r.edgeTo) return { ...r, edgeTo: undefined, edgeFrom: r.edgeTo }
  if (r.type === 'each' && r.edgeFrom) return { ...r, edgeFrom: undefined, edgeTo: r.edgeFrom }
  return null
}

export function runDiagramChecks(diagram, checks) {
  const g = graph(diagram)
  return checks.map((c) => {
    const pass = Boolean(RULES[c.rule.type]?.(g, c.rule))
    const rev = !pass && reversedRule(c.rule)
    return { label: c.label, pass, reversed: Boolean(rev && RULES[rev.type](g, rev)) }
  })
}

// Names a check expects, so a failed check can tell the learner what to call their components.
export function labelHints(rule) {
  return [rule.match, rule.from, rule.to, rule.via, rule.target, rule.of, rule.edgeTo, rule.edgeFrom, rule.touching]
    .filter((m) => m && typeof m === 'object' && !Array.isArray(m) && m.label)
    .map((m) => asList(m.label))
}

const typeNames = (types) => asList(types).map((t) => NODE_TYPES[t]?.label ?? t).join(' or ')

function matcherName(m) {
  if (!m) return 'any box'
  if (typeof m === 'string' || Array.isArray(m)) return typeNames(m)
  const label = m.label ? asList(m.label).map((l) => `“${l}”`).join(' or ') : ''
  if (m.type && label) return `${typeNames(m.type)} with ${label} in its name`
  return m.type ? typeNames(m.type) : `a box with ${label} in its name`
}

const kindName = (kind) => (kind === 'async' ? 'async message' : kind === 'sync' ? 'sync call' : 'line')
const aKind = (kind) => `${kind === 'async' ? 'an' : 'a'} ${kindName(kind)}`

// Says in plain words what a failing check still needs, reading the diagram so it can name what is already there.
export function diagramHint(diagram, rule) {
  const g = graph(diagram)
  const from = matcherName(rule.from)
  const to = matcherName(rule.to)
  switch (rule.type) {
    case 'node': {
      const have = g.find(rule.match).length
      const min = rule.min ?? 1
      if (rule.max != null && have > rule.max) return `Use at most ${rule.max} of ${matcherName(rule.match)}. You have ${have}.`
      return min > 1 ? `Add at least ${min} of ${matcherName(rule.match)}. You have ${have}.` : `Add ${matcherName(rule.match)}.`
    }
    case 'edge': {
      const anyKind = g.edges.filter((e) => g.edgeMatches(e, rule.from, rule.to)).length
      const min = rule.min ?? 1
      if (rule.kind && anyKind >= min) return `Change the line from ${from} to ${to} into ${aKind(rule.kind)}.`
      return min > 1
        ? `Draw at least ${min} ${kindName(rule.kind)}s from ${from} to ${to}.`
        : `Draw ${aKind(rule.kind)} from ${from} to ${to}.`
    }
    case 'path': {
      const through = rule.via ? ` through ${matcherName(rule.via)}` : ''
      const using = rule.kind ? `, using only ${kindName(rule.kind)}s` : ''
      const target = (rule.min ?? 1) > 1 ? `at least ${rule.min} of ${to}` : to
      return `Connect ${from} to ${target}${through}${using}. It can take several lines.`
    }
    case 'no-path':
      if (!g.find(rule.from).length) return `Add ${from}.`
      if (!g.find(rule.to).length) return `Add both ${from} and ${to}, and keep them apart.`
      if (rule.unless) return `Every route from ${from} to ${to} must pass through ${matcherName(rule.unless)}. Remove the route that goes around it.`
      return rule.kind
        ? `Break the chain of ${kindName(rule.kind)}s from ${from} to ${to}. Put a queue or topic in the route.`
        : `Remove the route from ${from} to ${to}.`
    case 'link':
      return `Join ${from} and ${to} with a line.`
    case 'lines': {
      const which = rule.touching ? `to or from ${matcherName(rule.touching)}` : `from ${from} to ${to}`
      return `Make every line ${which} ${aKind(rule.kind)}.`
    }
    case 'only-via':
      return `Draw a line into ${matcherName(rule.target)} from ${matcherName(rule.from)}, and remove any other line into it.`
    case 'no-edge':
      if (!g.find(rule.from).length) return `Add ${from}, with no direct line to ${to}.`
      return g.find(rule.to).length || rule.ifDrawn
        ? `Remove the direct line from ${from} to ${to}.`
        : `Add both ${from} and ${to}, with no direct line between them.`
    case 'each': {
      const target = matcherName(rule.edgeTo ?? rule.edgeFrom)
      const dir = rule.edgeTo ? 'to' : 'from'
      const count = rule.count ?? 1
      const kind = count > 1 ? `${count} ${kindName(rule.kind)}s` : aKind(rule.kind)
      const most = rule.max != null ? `, and no more than ${rule.max}` : ''
      const needs = count === 0 && rule.max != null ? `at most ${rule.max} ${kindName(rule.kind)}${rule.max === 1 ? '' : 's'} ${dir} ${target}` : `${kind} ${dir} ${target}${most}`
      if (rule.some) return `At least one ${matcherName(rule.of)} needs ${needs}.`
      const have = (rule.min ?? 1) > 1 ? `Have at least ${rule.min} of ${matcherName(rule.of)}. Each one` : `Every ${matcherName(rule.of)}`
      return `${have} needs ${needs}.`
    }
    default:
      return 'Check this requirement against the scenario.'
  }
}

// Every node type a matcher refers to, for validating content against the catalog.
export function matcherTypes(m) {
  if (!m) return []
  if (typeof m === 'string' || Array.isArray(m)) return asList(m)
  return m.type ? asList(m.type) : []
}
