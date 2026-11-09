// Deleting past exams and interview rounds: which reviews go with them.
import assert from 'node:assert/strict'
import { MISSED, reviewsToRemove, splitHistory } from '../src/study/history.js'

const day = (iso) => new Date(iso).toLocaleDateString('en-CA')
const MON = '2026-11-02T10:00:00.000Z'
const TUE = '2026-11-03T10:00:00.000Z'

// which problems each kind of round sent to review
const exam = { date: MON, results: [{ id: 'a', ok: false, answered: true }, { id: 'b', ok: true }, { id: 'c', ok: false, answered: false }] }
assert.deepEqual(MISSED.exam(exam), ['a'])
// older results don't say whether a question was answered: a wrong one counts as missed
assert.deepEqual(MISSED.exam({ date: MON, results: [{ id: 'a', ok: false }, { id: 'b', ok: true }] }), ['a'])
assert.deepEqual(MISSED.mock({ date: MON, results: [{ id: 'a', solved: true }, { id: 'b', solved: false }] }), ['b'])
assert.deepEqual(MISSED.interview({ date: MON, missedIds: ['x'] }), ['x'])
assert.deepEqual(MISSED.interview({ date: MON, total: 5, missed: 2 }), [])

// a review the round added goes; one added on another day came from somewhere else and stays
const review = { a: { step: 0, due: '2026-11-03', added: day(MON) }, b: { step: 1, due: '2026-11-05', added: day(TUE) } }
assert.deepEqual(reviewsToRemove([exam], [], review, MISSED.exam), ['a'])
const both = { date: MON, results: [{ id: 'a', ok: false }, { id: 'b', ok: false }] }
assert.deepEqual(reviewsToRemove([both], [], review, MISSED.exam), ['a'])
// a review that has moved on a step still came from the round
assert.deepEqual(reviewsToRemove([exam], [], { a: { ...review.a, step: 2 } }, MISSED.exam), ['a'])
// no review left, nothing to take back
assert.deepEqual(reviewsToRemove([exam], [], {}, MISSED.exam), [])
// another kept round missed it too, so the review stays
const later = { date: TUE, results: [{ id: 'a', ok: false }] }
assert.deepEqual(reviewsToRemove([exam], [later], review, MISSED.exam), [])
// deleting both rounds takes it back
assert.deepEqual(reviewsToRemove([exam, later], [], review, MISSED.exam), ['a'])

// splitting a history by date
const history = [later, exam]
assert.deepEqual(splitHistory(history, [MON]), { removed: [exam], kept: [later] })
assert.deepEqual(splitHistory(history, history.map((h) => h.date)), { removed: history, kept: [] })
assert.deepEqual(splitHistory(history, []), { removed: [], kept: history })

console.log('All history checks pass.')
