import { problemById } from './problems.js'
import { trackProblems, TRACKS } from './tracks.js'
import { problemOfCard } from '../store/flash.js'

// Builds the weak-area report from what is already recorded; nothing here is stored.
// A problem "needs work" when you flagged it, it is on the review schedule, you missed it in a recent mock
// interview, or you missed one of its cards (box 1). Each reason adds to its weight, so repeat misses rank first.
const WEIGHTS = { revisit: 3, review: 2, mock: 2, card: 1 }
const REASONS = { revisit: 'Marked Revisit', review: 'On review', mock: 'Missed in mock', card: 'Missed card' }
const RECENT_MOCKS = 10
const MAX_CARDS = 3

function collectSignals({ progress, review, boxes, mocks }) {
  const signals = new Map() // id -> { weight, reasons: Set }
  const add = (id, reason, times = 1) => {
    if (!problemById.has(id)) return
    const s = signals.get(id) ?? { weight: 0, reasons: new Set() }
    s.weight += WEIGHTS[reason] * times
    s.reasons.add(REASONS[reason])
    signals.set(id, s)
  }

  for (const [id, entry] of Object.entries(progress)) if (entry?.status === 'revisit') add(id, 'revisit')
  for (const id of Object.keys(review)) add(id, 'review')

  // a problem solved since the mock no longer counts against you
  for (const m of mocks.slice(-RECENT_MOCKS))
    for (const r of m.results) if (!r.solved && progress[r.id]?.status !== 'solved') add(r.id, 'mock')

  const missedCards = new Map()
  for (const [card, box] of Object.entries(boxes)) {
    if (box !== 1) continue
    const id = problemOfCard(card)
    missedCards.set(id, (missedCards.get(id) ?? 0) + 1)
  }
  for (const [id, n] of missedCards) add(id, 'card', Math.min(n, MAX_CARDS))
  return signals
}

export function weakAreaReport(data) {
  const signals = collectSignals(data)
  const weakest = (list) =>
    list
      .filter((p) => signals.has(p.id))
      .sort((a, b) => signals.get(b.id).weight - signals.get(a.id).weight || a.id.localeCompare(b.id, undefined, { numeric: true }))

  const topics = TRACKS.map((track) => {
    const list = trackProblems(track)
    const touched = list.filter((p) => signals.has(p.id) || (data.progress[p.id]?.status ?? 'not-started') !== 'not-started')
    return {
      track,
      total: list.length,
      touched: touched.length,
      solved: list.filter((p) => data.progress[p.id]?.status === 'solved').length,
      weight: list.reduce((sum, p) => sum + (signals.get(p.id)?.weight ?? 0), 0),
      problems: weakest(list),
    }
  })

  return {
    signals,
    needWork: weakest([...signals.keys()].map((id) => problemById.get(id))),
    weak: topics.filter((t) => t.weight > 0).sort((a, b) => b.weight - a.weight),
    untouched: topics.filter((t) => t.total > 0 && t.touched === 0),
  }
}
