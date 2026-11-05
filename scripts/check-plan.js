// Daily plan rules: priorities, the time budget, what counts as done, and stored-plan checks.
import assert from 'node:assert/strict'
import { currentStage, PHASES } from '../src/data/roadmap.js'
import { autoDone, buildPlan, interleave, itemDone, planTime, REVIEW_MINUTES, validPlan } from '../src/study/plan.js'

const c = (id, estMinutes = 20) => ({ id, estMinutes, note: id })
const many = (prefix, n, min) => Array.from({ length: n }, (_, i) => c(`${prefix}${i}`, min))
const ids = (items) => items.map((i) => i.id)

// priority order, and each item says why it is there
const mixed = buildPlan({ due: [c('r1', 30)], weak: [c('w1', 15)], fresh: [c('n1', 15)], minutes: 45 })
assert.deepEqual(mixed.map((i) => [i.id, i.kind]), [['r1', 'review'], ['w1', 'weak'], ['n1', 'new']])

// a review is costed as a review, not as the first attempt
assert.equal(mixed[0].minutes, REVIEW_MINUTES)
assert.equal(buildPlan({ due: [c('r', 5)], weak: [], fresh: [], minutes: 45 })[0].minutes, 5)

// a backlog of reviews takes half the time at most, and new work still gets in
const backlog = buildPlan({ due: many('r', 40), weak: [], fresh: many('n', 5, 20), minutes: 60 })
assert.equal(backlog.filter((i) => i.kind === 'review').length, 3)
assert.ok(backlog.some((i) => i.kind === 'new'))
assert.ok(planTime(backlog) <= 60)

// the budget holds at every length, and a long problem is passed over for one that fits
for (const minutes of [30, 45, 60, 90]) {
  const plan = buildPlan({ due: many('r', 9), weak: many('w', 3, 25), fresh: many('n', 30, 25), minutes })
  assert.ok(planTime(plan) <= minutes, `${minutes}: ${planTime(plan)}`)
  assert.ok(plan.length > 0)
}
assert.deepEqual(ids(buildPlan({ due: [], weak: [], fresh: [c('long', 60), c('short', 20)], minutes: 30 })), ['short'])

// less time than anything needs: still one thing to do, and the budget of nothing gives nothing
assert.deepEqual(ids(buildPlan({ due: [], weak: [], fresh: [c('long', 60)], minutes: 30 })), ['long'])
assert.deepEqual(buildPlan({ due: [c('r')], weak: [], fresh: [c('n')], minutes: 0 }), [])

// nothing appears twice, and excluded problems stay out
const twice = buildPlan({ due: [c('a', 10)], weak: [c('a', 10), c('b', 10)], fresh: [c('a', 10), c('b', 10), c('c', 10)], minutes: 60 })
assert.deepEqual(ids(twice), ['a', 'b', 'c'])
assert.deepEqual(ids(buildPlan({ due: [c('a', 10)], weak: [], fresh: [c('b', 10)], minutes: 60, exclude: new Set(['a']) })), ['b'])

// empty site or everything solved
assert.deepEqual(buildPlan({ due: [], weak: [], fresh: [], minutes: 45 }), [])

// interleave keeps every item, keeps the first first, and alternates
const list = [{ k: 'a', n: 1 }, { k: 'a', n: 2 }, { k: 'a', n: 3 }, { k: 'b', n: 4 }, { k: 'c', n: 5 }]
assert.deepEqual(interleave(list, (x) => x.k).map((x) => x.n), [1, 4, 5, 2, 3])
assert.deepEqual(interleave([], (x) => x), [])

// what counts as done
const today = '2026-11-05'
const dayOf = (iso) => iso.slice(0, 10)
const base = { ticked: [], review: {}, progress: {}, today, dayOf }
const review = { id: 'r', kind: 'review' }
const fresh = { id: 'n', kind: 'new' }
assert.equal(autoDone(review, { ...base, review: { r: { due: today } } }), false)
assert.equal(autoDone(review, { ...base, review: { r: { due: '2026-11-01' } } }), false)
assert.equal(autoDone(review, { ...base, review: { r: { due: '2026-11-06' } } }), true)
assert.equal(autoDone(review, base), true) // graduated or removed
assert.equal(autoDone(fresh, base), false)
assert.equal(autoDone(fresh, { ...base, progress: { n: { solvedAt: '2026-11-05T09:00:00.000Z' } } }), true)
assert.equal(autoDone(fresh, { ...base, progress: { n: { solvedAt: '2026-11-04T09:00:00.000Z' } } }), false)
assert.equal(autoDone(fresh, { ...base, progress: { n: { status: 'solved' } } }), false)
assert.equal(itemDone(fresh, { ...base, ticked: ['n'] }), true)

// stored plans
const known = (id) => id === 'a'
const stored = { date: today, minutes: 45, items: [{ id: 'a', kind: 'new', minutes: 20 }, { id: 'gone', kind: 'new', minutes: 20 }, { id: 'a', kind: 'odd', minutes: 1 }, null] }
const plan = validPlan(stored, known)
assert.deepEqual(ids(plan.items), ['a'])
assert.deepEqual(plan.ticked, [])
for (const bad of [null, 'x', [], { ...stored, items: 'x' }, { ...stored, date: 3 }, { ...stored, minutes: 0 }]) assert.equal(validPlan(bad, known), null)

// stages: you move on by finishing one, whatever the date
const stage = (n, done, total) => ({ stage: n, done, list: Array(total) })
assert.equal(currentStage([stage(1, 3, 10), stage(2, 0, 10)]).stage, 1)
assert.equal(currentStage([stage(1, 10, 10), stage(2, 4, 10)]).stage, 2)
assert.equal(currentStage([stage(1, 9, 10), stage(2, 10, 10), stage(3, 0, 5)]).stage, 1) // skipping ahead doesn't move you on
assert.equal(currentStage([stage(1, 0, 0), stage(2, 0, 3)]).stage, 2) // an empty stage is nothing to finish
assert.equal(currentStage([stage(1, 10, 10)]), null)
assert.equal(PHASES.length, 6)
assert.ok(PHASES.every((ph, i) => ph.stage === i + 1))

console.log('All plan checks pass.')
