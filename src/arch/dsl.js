// Compact notation for reference diagrams in content files:
//
//   diagram(
//     { mob: ['mobile-app', 'Mobile app'], exp: ['experience-api', 'exp-mobile-api'], q: ['queue', 'order-events'] },
//     ['mob -> exp', 'exp -> prc', 'prc ~> q'],   // '->' synchronous call, '~>' asynchronous message/event
//   )

export function diagram(nodes, edges = []) {
  const ids = new Set(Object.keys(nodes))
  return {
    nodes: Object.entries(nodes).map(([id, [type, label]]) => ({ id, type, label: label ?? type })),
    edges: edges.map((spec, i) => {
      const m = /^\s*([\w-]+)\s*(->|~>)\s*([\w-]+)\s*$/.exec(spec)
      if (!m || !ids.has(m[1]) || !ids.has(m[3])) throw new Error(`Bad diagram edge "${spec}"`)
      return { id: `e${i}`, from: m[1], to: m[3], kind: m[2] === '~>' ? 'async' : 'sync' }
    }),
  }
}
