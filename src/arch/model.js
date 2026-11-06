import { NODE_TYPES } from './catalog.js'

// A diagram is { nodes: [{ id, type, label }], edges: [{ id, from, to, kind: 'sync' | 'async' }] }.

export const emptyDiagram = () => ({ nodes: [], edges: [] })

// A saved diagram may predate a catalog change: drop components that no longer exist and their connections.
export function restoreDiagram(saved) {
  if (!saved || !Array.isArray(saved.nodes) || !Array.isArray(saved.edges)) return emptyDiagram()
  const nodes = saved.nodes.filter((n) => n && typeof n.id === 'string' && NODE_TYPES[n.type])
  const ids = new Set(nodes.map((n) => n.id))
  const edges = saved.edges.filter((e) => e && ids.has(e.from) && ids.has(e.to))
  return { nodes, edges }
}

const newId = (prefix) => `${prefix}${Math.random().toString(36).slice(2, 8)}`

export function addNode(diagram, type) {
  const node = { id: newId('n'), type, label: NODE_TYPES[type].label }
  return { diagram: { ...diagram, nodes: [...diagram.nodes, node] }, id: node.id }
}

// Copies a box just after the original. Its lines are not copied, because a copy usually connects differently.
export function duplicateNode(diagram, id) {
  const i = diagram.nodes.findIndex((n) => n.id === id)
  if (i < 0) return { diagram, id: null }
  const copy = { ...diagram.nodes[i], id: newId('n') }
  return { diagram: { ...diagram, nodes: [...diagram.nodes.slice(0, i + 1), copy, ...diagram.nodes.slice(i + 1)] }, id: copy.id }
}

export function updateNode(diagram, id, patch) {
  return { ...diagram, nodes: diagram.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) }
}

export function removeNode(diagram, id) {
  return {
    nodes: diagram.nodes.filter((n) => n.id !== id),
    edges: diagram.edges.filter((e) => e.from !== id && e.to !== id),
  }
}

// Adds a connection; a second connection between the same two nodes in the same direction is ignored.
export function addEdge(diagram, from, to, kind = 'sync') {
  if (from === to || diagram.edges.some((e) => e.from === from && e.to === to)) return diagram
  return { ...diagram, edges: [...diagram.edges, { id: newId('e'), from, to, kind }] }
}

export function updateEdge(diagram, id, patch) {
  return { ...diagram, edges: diagram.edges.map((e) => (e.id === id ? { ...e, ...patch } : e)) }
}

export function removeEdge(diagram, id) {
  return { ...diagram, edges: diagram.edges.filter((e) => e.id !== id) }
}

// Moves a node one place left (-1) or right (+1) among the nodes of its lane.
export function shiftNode(diagram, id, dir) {
  const node = diagram.nodes.find((n) => n.id === id)
  if (!node) return diagram
  const lane = NODE_TYPES[node.type]?.lane
  const sameLane = diagram.nodes.filter((n) => NODE_TYPES[n.type]?.lane === lane)
  const pos = sameLane.indexOf(node)
  const swap = sameLane[pos + dir]
  if (!swap) return diagram
  const nodes = [...diagram.nodes]
  const a = nodes.indexOf(node)
  const b = nodes.indexOf(swap)
  ;[nodes[a], nodes[b]] = [nodes[b], nodes[a]]
  return { ...diagram, nodes }
}
