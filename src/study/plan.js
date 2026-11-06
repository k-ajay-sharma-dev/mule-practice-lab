// Daily plan rules. Plain functions with no page or storage code, so scripts/check-plan.js can test them.
// A candidate is { id, estMinutes, note }. A plan item is { id, kind: 'review' | 'weak' | 'new', note, minutes }.

export const PLAN_MINUTES = [30, 45, 60, 90]
export const DEFAULT_MINUTES = 45
// Reviewing is explaining or re-solving something you have seen, so it is quicker than a first attempt.
export const REVIEW_MINUTES = 10
const REVIEW_SHARE = 0.5 // a review backlog must not crowd out new work
const WEAK_SHARE = 0.4
const LOOK_AHEAD = 12 // how far down the roadmap to look for something that fits the time left

export const planTime = (items) => items.reduce((sum, i) => sum + i.minutes, 0)

const itemMinutes = (kind, estMinutes) => (kind === 'review' ? Math.min(REVIEW_MINUTES, estMinutes) : estMinutes)

// A saved plan keeps its problems for the day, but its times follow the current estimates.
export const currentMinutes = (items, estOf) => items.map((i) => ({ ...i, minutes: itemMinutes(i.kind, estOf(i.id)) }))

// Takes one from each group in turn, so a day mixes DataWeave, flows and the rest instead of one long run of one.
export function interleave(list, keyOf) {
  const groups = new Map()
  for (const item of list) groups.set(keyOf(item), [...(groups.get(keyOf(item)) ?? []), item])
  const queues = [...groups.values()]
  const out = []
  while (out.length < list.length) for (const queue of queues) if (queue.length) out.push(queue.shift())
  return out
}

// Order of priority: reviews that are due, then a new problem in a weak topic, then the next roadmap work.
export function buildPlan({ due, weak, fresh, minutes, exclude = new Set() }) {
  const items = []
  const used = new Set(exclude)
  const fits = (n, limit) => planTime(items) + n <= limit
  const add = (candidate, kind, n) => {
    used.add(candidate.id)
    items.push({ id: candidate.id, kind, note: candidate.note, minutes: n })
  }
  if (minutes <= 0) return items

  for (const c of due) {
    if (used.has(c.id)) continue
    const n = itemMinutes('review', c.estMinutes)
    if (fits(n, minutes * REVIEW_SHARE)) add(c, 'review', n)
  }

  const weakLimit = planTime(items) + minutes * WEAK_SHARE
  const weakPick = weak.find((c) => !used.has(c.id) && fits(c.estMinutes, Math.min(weakLimit, minutes)))
  if (weakPick) add(weakPick, 'weak', weakPick.estMinutes)

  for (const c of fresh.filter((f) => !used.has(f.id)).slice(0, LOOK_AHEAD)) {
    if (fits(c.estMinutes, minutes)) add(c, 'new', c.estMinutes)
  }

  // a day with less time than the next problem needs still gets one thing to do
  if (!items.length) {
    const first = [...due, ...weak, ...fresh].find((c) => !used.has(c.id))
    if (first) add(first, due.includes(first) ? 'review' : weak.includes(first) ? 'weak' : 'new', first.estMinutes)
  }
  return items
}

// Done means the work happened today: a graded solve, or for a review a Got it. Again or removing a review is not work
// done. The tick is for work the site can't see, such as a Partial rating.
export function itemDone(item, { ticked, progress, today, dayOf }) {
  if (ticked.includes(item.id)) return true
  return autoDone(item, { progress, today, dayOf })
}

export function autoDone(item, { progress, today, dayOf }) {
  const on = (at) => typeof at === 'string' && dayOf(at) === today
  const entry = progress[item.id]
  return on(entry?.solvedAt) || (item.kind === 'review' && on(entry?.reviewedAt))
}

// A review you took off the schedule has nothing left to do today, so it leaves the plan unless it was finished first.
export const activeItems = (items, state) => items.filter((i) => i.kind !== 'review' || state.review[i.id] || itemDone(i, state))

// Stored plans are checked before use: an old or corrupt one is dropped, and so are items whose problem was removed.
export function validPlan(p, isKnown) {
  if (!p || typeof p !== 'object' || typeof p.date !== 'string' || !Array.isArray(p.items)) return null
  if (!Number.isFinite(p.minutes) || p.minutes <= 0) return null
  const items = p.items.filter((i) => i && isKnown(i.id) && ['review', 'weak', 'new'].includes(i.kind) && Number.isFinite(i.minutes))
  return { date: p.date, minutes: p.minutes, items, ticked: Array.isArray(p.ticked) ? p.ticked : [] }
}
