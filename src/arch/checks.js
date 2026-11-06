import { NODE_TYPES } from './catalog.js'

// Rule-based checks for Architecture Designer diagrams.
//
// A node matcher is a type ('system-api'), a list of types (['erp', 'legacy']) or
// { type, label } where label is a case-insensitive "contains" (string or list of alternatives).
//
// Rules:
//   { type: 'node', match, min = 1, max }            how many matching nodes exist
//   { type: 'edge', from, to, kind, min = 1 }         direct connections (kind 'sync' | 'async' optional)
//   { type: 'path', from, to, via }                   a directed route exists (optionally through `via`)
//   { type: 'only-via', target, from }                target is reached, and only from `from` nodes
//   { type: 'no-edge', from, to }                     both exist but are never directly connected
//   { type: 'each', of, edgeTo | edgeFrom, kind }     every `of` node (at least one) has such a connection
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
  const reachable = (startIds) => {
    const seen = new Set(startIds)
    const queue = [...startIds]
    while (queue.length) {
      const id = queue.shift()
      for (const e of edges) if (e.from === id && !seen.has(e.to)) seen.add(e.to), queue.push(e.to)
    }
    return seen
  }
  return { byId, edges, find, edgeMatches, reachable }
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
    const starts = g.find(r.from).map((n) => n.id)
    const targets = g.find(r.to)
    if (!r.via) {
      // a path of at least one hop
      const firstHops = g.edges.filter((e) => starts.includes(e.from)).map((e) => e.to)
      const seen = g.reachable(firstHops)
      return targets.some((t) => seen.has(t.id))
    }
    return g.find(r.via).some((v) => {
      const fromStart = g.reachable(g.edges.filter((e) => starts.includes(e.from)).map((e) => e.to))
      if (!fromStart.has(v.id)) return false
      const afterVia = g.reachable(g.edges.filter((e) => e.from === v.id).map((e) => e.to))
      return targets.some((t) => afterVia.has(t.id))
    })
  },
  'only-via'(g, r) {
    const incoming = g.edges.filter((e) => matches(g.byId.get(e.to), r.target))
    return incoming.length > 0 && incoming.every((e) => matches(g.byId.get(e.from), r.from))
  },
  'no-edge'(g, r) {
    if (!g.find(r.from).length || !g.find(r.to).length) return false
    return !g.edges.some((e) => g.edgeMatches(e, r.from, r.to))
  },
  each(g, r) {
    const nodes = g.find(r.of)
    if (nodes.length < (r.min ?? 1)) return false
    return nodes.every((n) =>
      g.edges.some((e) =>
        r.edgeTo
          ? e.from === n.id && matches(g.byId.get(e.to), r.edgeTo) && (!r.kind || e.kind === r.kind)
          : e.to === n.id && matches(g.byId.get(e.from), r.edgeFrom) && (!r.kind || e.kind === r.kind),
      ),
    )
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
  return [rule.match, rule.from, rule.to, rule.via, rule.target, rule.of, rule.edgeTo, rule.edgeFrom]
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
      if (rule.kind && anyKind >= min) return `Change the line from ${from} to ${to} into a ${kindName(rule.kind)}.`
      return min > 1
        ? `Draw at least ${min} ${kindName(rule.kind)}s from ${from} to ${to}.`
        : `Draw a ${kindName(rule.kind)} from ${from} to ${to}.`
    }
    case 'path':
      return `Connect ${from} to ${to}${rule.via ? ` through ${matcherName(rule.via)}` : ''}. It can take several lines.`
    case 'only-via':
      return `Draw a line into ${matcherName(rule.target)} from ${matcherName(rule.from)}, and remove any other line into it.`
    case 'no-edge':
      return g.find(rule.from).length && g.find(rule.to).length
        ? `Remove the direct line from ${from} to ${to}.`
        : `Add both ${from} and ${to}, with no direct line between them.`
    case 'each': {
      const target = matcherName(rule.edgeTo ?? rule.edgeFrom)
      const kind = kindName(rule.kind)
      return rule.edgeTo ? `Every ${matcherName(rule.of)} needs a ${kind} to ${target}.` : `Every ${matcherName(rule.of)} needs a ${kind} from ${target}.`
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
