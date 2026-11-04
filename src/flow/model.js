import { COMPONENTS, defaultsFor } from './catalog.js'

// A design is { flows: [Flow] }.
//   Flow  = { id, kind: 'flow' | 'sub-flow', name, source: Node | null, steps: [Node], errorHandlers: [Node] }
//   Node  = { id, type, config, steps?, routes?, otherwise?, errorHandlers?, onComplete? }
//   Route = { id, config, steps }
// Lists of steps are addressed by a container key "<ownerId>:<slot>", e.g. "f1:steps", "n4:otherwise".

const SLOTS = ['steps', 'otherwise', 'errorHandlers', 'onComplete']

let counter = 0
export const newId = (prefix = 'n') => `${prefix}${Date.now().toString(36)}${(counter++).toString(36)}`

export function createNode(type) {
  const def = COMPONENTS[type]
  if (!def) throw new Error(`Unknown component: ${type}`)
  const node = { id: newId(), type, config: defaultsFor(def.fields) }
  if (def.kind === 'scope' || def.kind === 'handler') node.steps = []
  if (def.kind === 'router') {
    node.routes = Array.from({ length: def.defaultRoutes ?? 2 }, () => createRoute(type))
  }
  if (def.otherwise) node.otherwise = []
  if (def.errorHandlers) node.errorHandlers = []
  if (def.onComplete) node.onComplete = []
  return node
}

export function createRoute(routerType) {
  return { id: newId('r'), config: defaultsFor(COMPONENTS[routerType].routeFields), steps: [] }
}

export function createFlow(kind = 'flow', name = kind === 'flow' ? 'main-flow' : 'sub-flow') {
  return kind === 'flow'
    ? { id: newId('f'), kind, name, source: null, steps: [], errorHandlers: [] }
    : { id: newId('f'), kind, name, steps: [] }
}

export const emptyDesign = () => ({ flows: [createFlow('flow')] })

// A saved design may predate a catalog change: drop components that no longer exist (with what they contain)
// so the problem still opens. Anything that isn't a design at all starts over.
export function restoreDesign(saved) {
  if (!saved || !Array.isArray(saved.flows) || !saved.flows.length) return emptyDesign()
  const known = (n) => n && typeof n === 'object' && COMPONENTS[n.type]
  const list = (l) => (Array.isArray(l) ? l.filter(known).map(node) : [])
  function node(n) {
    const out = { ...n, config: n.config && typeof n.config === 'object' ? n.config : {} }
    for (const slot of SLOTS) if (n[slot] !== undefined) out[slot] = list(n[slot])
    if (n.routes !== undefined)
      out.routes = (Array.isArray(n.routes) ? n.routes : [])
        .filter((r) => r && typeof r === 'object')
        .map((r) => ({ ...r, config: r.config ?? {}, steps: list(r.steps) }))
    return out
  }
  const flows = saved.flows
    .filter((f) => f && typeof f === 'object' && typeof f.id === 'string')
    .map((f) => ({
      ...f,
      source: known(f.source) ? node(f.source) : f.kind === 'flow' ? null : undefined,
      steps: list(f.steps),
      ...(f.errorHandlers !== undefined && { errorHandlers: list(f.errorHandlers) }),
    }))
  return flows.length ? { ...saved, flows } : emptyDesign()
}

// ---------- Traversal ----------

// Calls visit(item, ctx) for every flow, node and route, depth first in document order.
export function walk(design, visit) {
  const visitList = (list, ctx) => list.forEach((n) => visitNode(n, ctx))
  function visitNode(node, ctx) {
    visit(node, ctx)
    const inner = { ...ctx, ancestors: [...ctx.ancestors, node] }
    for (const slot of SLOTS) if (node[slot]) visitList(node[slot], { ...inner, slot })
    node.routes?.forEach((route) => {
      visit(route, { ...inner, isRoute: true, parent: node })
      visitList(route.steps, { ...inner, ancestors: [...inner.ancestors, route], slot: 'steps' })
    })
  }
  for (const flow of design.flows) {
    visit(flow, { flow, ancestors: [], isFlow: true })
    const ctx = { flow, ancestors: [] }
    if (flow.source) visitNode(flow.source, { ...ctx, slot: 'source' })
    visitList(flow.steps, { ...ctx, slot: 'steps' })
    if (flow.errorHandlers) visitList(flow.errorHandlers, { ...ctx, slot: 'errorHandlers' })
  }
}

export function findItem(design, id) {
  let found = null
  walk(design, (item, ctx) => {
    if (!found && item.id === id) found = { item, ctx }
  })
  return found
}

function ownerById(design, ownerId) {
  return design.flows.find((f) => f.id === ownerId) ?? findItem(design, ownerId)?.item
}

export function getContainer(design, key) {
  const [ownerId, slot] = key.split(':')
  return ownerById(design, ownerId)?.[slot] ?? null
}

// Which component kinds a container accepts.
export function acceptsKind(key, kind) {
  const slot = key.split(':')[1]
  if (slot === 'source') return kind === 'source'
  if (slot === 'errorHandlers') return kind === 'handler'
  return kind === 'processor' || kind === 'scope' || kind === 'router'
}

function locate(design, nodeId) {
  for (const flow of design.flows) {
    if (flow.source?.id === nodeId) return { flow, isSource: true }
  }
  let result = null
  walk(design, (item) => {
    if (result) return
    for (const slot of SLOTS) {
      const i = item[slot]?.findIndex?.((n) => n.id === nodeId) ?? -1
      if (i >= 0) result = { list: item[slot], index: i }
    }
  })
  return result
}

function subtreeIds(node) {
  const ids = new Set()
  walk({ flows: [{ id: '_', steps: [node] }] }, (item) => ids.add(item.id))
  ids.delete('_')
  return ids
}

// ---------- Mutations (all return a new design) ----------

const clone = (design) => structuredClone(design)

export function insertNode(design, key, index, node) {
  const next = clone(design)
  const [ownerId, slot] = key.split(':')
  if (slot === 'source') {
    next.flows.find((f) => f.id === ownerId).source = node
    return next
  }
  getContainer(next, key)?.splice(index, 0, node)
  return next
}

export function removeNode(design, nodeId) {
  const next = clone(design)
  const loc = locate(next, nodeId)
  if (!loc) return design
  if (loc.isSource) loc.flow.source = null
  else loc.list.splice(loc.index, 1)
  return next
}

export function moveNode(design, nodeId, key, index) {
  const found = findItem(design, nodeId)
  if (!found) return design
  const node = found.item
  const [ownerId] = key.split(':')
  if (subtreeIds(node).has(ownerId)) return design // can't drop a node inside itself

  // Adjust the index when moving down within the same list.
  const loc = locate(design, nodeId)
  const sameList = loc && !loc.isSource && loc.list === getContainer(design, key)
  const target = sameList && loc.index < index ? index - 1 : index
  return insertNode(removeNode(design, nodeId), key, target, node)
}

export function shiftNode(design, nodeId, delta) {
  const next = clone(design)
  const loc = locate(next, nodeId)
  if (!loc || loc.isSource) return design
  const to = loc.index + delta
  if (to < 0 || to >= loc.list.length) return design
  const [node] = loc.list.splice(loc.index, 1)
  loc.list.splice(to, 0, node)
  return next
}

export function updateConfig(design, id, patch) {
  const next = clone(design)
  const found = findItem(next, id)
  if (!found) return design
  if (found.ctx.isFlow) Object.assign(found.item, patch)
  else found.item.config = { ...found.item.config, ...patch }
  return next
}

export function addRoute(design, routerId) {
  const next = clone(design)
  const router = findItem(next, routerId)?.item
  router?.routes.push(createRoute(router.type))
  return next
}

export function removeRoute(design, routeId) {
  const next = clone(design)
  walk(next, (item) => {
    if (item.routes && item.routes.length > 1) item.routes = item.routes.filter((r) => r.id !== routeId)
  })
  return next
}

export function addFlow(design, kind) {
  const taken = new Set(design.flows.map((f) => f.name))
  let n = 1
  const base = kind === 'flow' ? 'flow' : 'sub-flow'
  while (taken.has(`${base}-${n}`)) n++
  return { ...design, flows: [...design.flows, createFlow(kind, `${base}-${n}`)] }
}

export function removeFlow(design, flowId) {
  if (design.flows.length <= 1) return design
  return { ...design, flows: design.flows.filter((f) => f.id !== flowId) }
}

export function countComponents(design) {
  let n = 0
  walk(design, (item, ctx) => {
    if (!ctx.isFlow && !ctx.isRoute) n++
  })
  return n
}
