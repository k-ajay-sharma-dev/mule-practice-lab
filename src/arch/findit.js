// "Find it" for one failing architecture check: what is wrong, the boxes it is about, and how they and their lines
// differ from the same boxes in the reference. Only the parts this check is about are shown.
import { NODE_TYPES } from './catalog.js'
import { diagramHint, matches } from './checks.js'
import { configOf, settingsOf } from './settings.js'

const MATCHER_KEYS = ['match', 'from', 'to', 'via', 'target', 'of', 'edgeTo', 'edgeFrom', 'touching', 'unless']
const typeName = (t) => NODE_TYPES[t]?.label ?? t
const words = (s) => new Set(String(s ?? '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1))
const kindName = (k) => (k === 'async' ? 'async message' : 'sync call')
const nameOf = (n) => n.label || typeName(n.type)

// how alike two names are: shared words, so "sys-sap-order-api" pairs with "sap order system api"
function likeness(a, b) {
  const wa = words(a.label)
  const wb = words(b.label)
  let n = 0
  for (const w of wa) if (wb.has(w)) n++
  return n
}

// → { hint, clues: [], mine: [{ id, label }], pairs: [{ id, label, diffs, rename }], extra, unused, lines }
export function archFindIt(diagram, reference, check) {
  const rule = check.rule
  const hint = diagramHint(diagram, rule)
  const run = rule.type === 'runs'
  const matchers = run ? [] : MATCHER_KEYS.map((k) => rule[k]).filter(Boolean)
  const about = (n) => run || matchers.some((m) => matches(n, m))
  const ref = reference ?? { nodes: [], edges: [] }
  const mineNodes = diagram.nodes.filter(about)
  const refNodes = ref.nodes.filter(about)

  // pair each reference box with the closest box of yours of the same type
  const pairOf = new Map() // ref id → my node
  const used = new Set()
  // every box is paired (a line's far end may be a box this check does not name), same names first
  const order = [...ref.nodes].sort((x, y) => Number(diagram.nodes.some((m) => m.label && m.label === y.label)) - Number(diagram.nodes.some((m) => m.label && m.label === x.label)))
  for (const r of order) {
    let best = null
    for (const m of diagram.nodes) {
      if (used.has(m.id) || m.type !== r.type) continue
      const score = (m.label && m.label === r.label ? 100 : 0) + likeness(m, r)
      if (!best || score > best.score) best = { m, score }
    }
    if (best) {
      used.add(best.m.id)
      pairOf.set(r.id, best.m)
    }
  }

  const pairs = []
  const extra = []
  for (const r of refNodes) {
    const m = pairOf.get(r.id)
    if (!m) {
      extra.push({ label: nameOf(r), kind: typeName(r.type) })
      continue
    }
    const mine = configOf(m)
    const want = configOf(r)
    const diffs = settingsOf(r.type)
      .filter((f) => String(mine[f.key]) !== String(want[f.key]))
      .map((f) => ({ field: f.label, mine: mine[f.key], ref: want[f.key] }))
    // a check that looks for a name: the reference's name passes it and yours does not
    const needsName = matchers.some((x) => x && typeof x === 'object' && !Array.isArray(x) && x.label && matches(r, x) && !matches(m, x))
    if (needsName) diffs.unshift({ field: 'Name', mine: m.label || '(none)', ref: r.label })
    if (diffs.length) pairs.push({ id: m.id, label: nameOf(m), diffs })
  }

  // the lines: the reference's lines between the boxes this check is about, against yours
  const myId = (refId) => pairOf.get(refId)?.id
  const inRef = new Set(refNodes.map((n) => n.id))
  const refById = new Map(ref.nodes.map((n) => [n.id, n]))
  const mineById = new Map(diagram.nodes.map((n) => [n.id, n]))
  const missing = []
  const wrongKind = []
  const matchedEdges = new Set()
  for (const e of ref.edges ?? []) {
    if (!run && !(inRef.has(e.from) || inRef.has(e.to))) continue
    const a = myId(e.from)
    const b = myId(e.to)
    const text = `${nameOf(refById.get(e.from))} → ${nameOf(refById.get(e.to))} (${kindName(e.kind)})`
    const have = a && b ? diagram.edges.find((x) => x.from === a && x.to === b) : null
    if (!have) {
      const back = a && b ? diagram.edges.find((x) => x.from === b && x.to === a) : null
      missing.push(back ? `${text}: yours points the other way` : text)
    } else {
      matchedEdges.add(have.id ?? `${have.from}>${have.to}`)
      if (have.kind !== e.kind) wrongKind.push(`${text}: yours is ${aKind(have.kind)}`)
    }
  }
  // your lines into or out of these boxes that the reference does not draw (for "keep these apart" checks)
  const aboutMine = new Set(mineNodes.map((n) => n.id))
  const extraLines = run
    ? []
    : diagram.edges
        .filter((x) => (aboutMine.has(x.from) || aboutMine.has(x.to)) && !matchedEdges.has(x.id ?? `${x.from}>${x.to}`))
        .filter((x) => !(ref.edges ?? []).some((e) => myId(e.from) === x.from && myId(e.to) === x.to))
        .map((x) => `${nameOf(mineById.get(x.from) ?? {})} → ${nameOf(mineById.get(x.to) ?? {})} (${kindName(x.kind)})`)

  const outline = new Set(run ? pairs.map((p) => p.id) : mineNodes.map((n) => n.id))
  return {
    hint,
    clues: [],
    mine: [...outline].map((id) => ({ id, label: nameOf(mineById.get(id)) })),
    pairs,
    extra,
    unused: [],
    lines: { missing: missing.slice(0, 8), wrongKind: wrongKind.slice(0, 8), extra: extraLines.slice(0, 8) },
  }
}

function aKind(k) {
  return k === 'async' ? 'an async message' : 'a sync call'
}

// After solving: the boxes that met a check, for saying out loud why the design works.
export function archMetBy(diagram, check) {
  const rule = check.rule
  if (rule.type === 'runs') return { run: true, parts: [] }
  const matchers = MATCHER_KEYS.map((k) => rule[k]).filter(Boolean)
  const parts = diagram.nodes.filter((n) => matchers.some((m) => matches(n, m))).map(nameOf)
  return { run: false, parts: [...new Set(parts)].slice(0, 5) }
}
