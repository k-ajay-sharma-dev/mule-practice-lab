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

// Every node type a matcher refers to, for validating content against the catalog.
export function matcherTypes(m) {
  if (!m) return []
  if (typeof m === 'string' || Array.isArray(m)) return asList(m)
  return m.type ? asList(m.type) : []
}
