// The users and systems an architecture problem's landscape already has, taken from its reference diagram: the apps
// and partners on one side, the systems of record on the other. On a real project these are given; what you design
// is everything between them (API layers, queues, gateways), so those are never listed. Caches and monitoring are
// design choices too, so they are left out.
import { NODE_TYPES } from './catalog.js'

const GROUPS = [
  { lane: 'consumers', title: 'Who uses it' },
  { lane: 'backends', title: 'Systems of record and data' },
]
const CHOSEN = new Set(['cache', 'monitoring'])

// [{ title, items: [{ label, kind }] }], only groups that have something
export function landscapeOf(reference) {
  const nodes = reference?.nodes ?? []
  return GROUPS.map(({ lane, title }) => {
    const seen = new Set()
    const items = nodes
      .filter((n) => NODE_TYPES[n.type]?.lane === lane && !CHOSEN.has(n.type))
      .map((n) => ({ label: (n.label || NODE_TYPES[n.type].label).trim(), kind: NODE_TYPES[n.type].label }))
      .filter((i) => !seen.has(i.label) && seen.add(i.label))
    return { title, items }
  }).filter((g) => g.items.length)
}
