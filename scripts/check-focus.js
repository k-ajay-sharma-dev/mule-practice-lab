// Focus session rules: the clock, leaving, what counts as finished, the daily goal, the streak and stored-data checks.
import assert from 'node:assert/strict'
import {
  addRecord,
  comeBack,
  countsToGoal,
  coverageGains,
  currentId,
  finishSession,
  focusStreak,
  isLastItem,
  minutesToCount,
  moveOn,
  sessionLeftMs,
  sessionsOn,
  solvedInSession,
  startSession,
  stepAway,
  validRecord,
  validSession,
} from '../src/study/focus.js'

const START = '2026-11-05T10:00:00.000Z'
const at = (minutes, seconds = 0) => new Date(Date.parse(START) + minutes * 60000 + seconds * 1000).toISOString()
const dayOf = (iso) => iso.slice(0, 10)
const keyOf = (d) => d.toISOString().slice(0, 10)
const fresh = (minutes = 25, queue = ['a', 'b', 'c']) => startSession({ minutes, queue, solved: { dw: 3 }, now: START })
const finish = (s, now, reason = 'time', progress = {}) => finishSession(s, { now, reason, progress, goal: 2, dayOf })

// the clock runs from the start and walks through the queue in order
const s = fresh()
assert.equal(sessionLeftMs(s, Date.parse(at(5))), 20 * 60000)
assert.equal(currentId(s), 'a')
assert.equal(currentId(moveOn(s)), 'b')
assert.equal(isLastItem(s), false)
assert.equal(isLastItem(moveOn(moveOn(s))), true)

// stepping away doesn't stop the clock, and a second "away" keeps the first time
const away = stepAway(s, at(1))
assert.equal(sessionLeftMs(away, Date.parse(at(5))), 20 * 60000)
assert.equal(stepAway(away, at(2)).awaySince, at(1))

// a real absence counts as leaving, a reload doesn't, and both come off the time on task
const back = comeBack(away, at(3))
assert.deepEqual([back.leaves, back.awayMs, 'awaySince' in back], [1, 120000, false])
const reload = comeBack(stepAway(s, at(1)), at(1, 2))
assert.deepEqual([reload.leaves, reload.awayMs], [0, 2000])
assert.equal(comeBack(s, at(1)), s)

// only a solve made during the session counts
const progress = { a: { solvedAt: at(4) }, b: { solvedAt: '2026-11-01T10:00:00.000Z' } }
assert.equal(solvedInSession('a', s, progress), true)
assert.equal(solvedInSession('b', s, progress), false)
assert.equal(solvedInSession('c', s, progress), false)

// the record: finished, moved past without solving, and time on task
const done = finish(moveOn(moveOn(comeBack(stepAway(s, at(10)), at(12)))), at(25), 'time', progress)
assert.deepEqual(done.record.finished, ['a'])
assert.equal(done.record.passed, 1)
assert.equal(done.record.seconds, 23 * 60)
assert.equal(done.record.leaves, 1)
assert.equal(done.record.day, '2026-11-05')

// coming back long after the end stops at the session's own end, and the absence is still counted
const late = finish(stepAway(s, at(10)), at(600))
assert.equal(late.endedAt, at(25))
assert.equal(late.record.seconds, 10 * 60)
assert.equal(late.record.leaves, 1)
assert.equal('awaySince' in late, false)

// time away can never make the time on task negative
assert.equal(finish({ ...s, awayMs: 99 * 60000 }, at(25)).record.seconds, 0)

// a session counts after 60% of its time, or by clearing the whole plan
assert.deepEqual([minutesToCount(25), minutesToCount(50)], [15, 30])
const rec = (seconds, extra = {}) => ({ day: '2026-11-05', minutes: 25, seconds, leaves: 0, finished: [], passed: 0, reason: 'ended', goal: 2, ...extra })
assert.equal(countsToGoal(rec(15 * 60)), true)
assert.equal(countsToGoal(rec(15 * 60 - 1)), false)
assert.equal(countsToGoal(rec(60, { reason: 'plan', finished: ['a'] })), true)
assert.equal(countsToGoal(rec(60, { reason: 'plan', finished: ['a'], passed: 1 })), false, 'skipping to the end is not clearing the plan')
assert.equal(countsToGoal(rec(60, { reason: 'plan' })), false)

// only sessions that count, on that day
assert.equal(sessionsOn([rec(1000), rec(10), rec(1000, { day: '2026-11-04' })], '2026-11-05').length, 1)

// the streak needs the goal reached, and survives until today is over
const day = (d, n, goal = 2) => Array.from({ length: n }, () => rec(1000, { day: d, goal }))
const today = new Date('2026-11-05T12:00:00.000Z')
assert.equal(focusStreak([], 2, keyOf, today), 0)
assert.equal(focusStreak([...day('2026-11-03', 2), ...day('2026-11-04', 2)], 2, keyOf, today), 2, 'today still open')
assert.equal(focusStreak([...day('2026-11-04', 2), ...day('2026-11-05', 2)], 2, keyOf, today), 2)
assert.equal(focusStreak([...day('2026-11-04', 2), ...day('2026-11-05', 1)], 2, keyOf, today), 1, 'today short of the goal')
assert.equal(focusStreak([...day('2026-11-03', 1), ...day('2026-11-04', 2)], 2, keyOf, today), 1, 'a short day breaks it')
assert.equal(focusStreak(day('2026-11-03', 2), 2, keyOf, today), 0, 'a missed day breaks it')

// past days keep the goal of their day, and today follows the goal set now
assert.equal(focusStreak(day('2026-11-04', 1, 1), 3, keyOf, today), 1)
assert.equal(focusStreak(day('2026-11-05', 1, 2), 1, keyOf, today), 1)

// the history stays bounded, oldest out first
const long = Array.from({ length: 200 }, (_, i) => rec(i))
assert.equal(addRecord(long, rec(999)).length, 200)
assert.equal(addRecord(long, rec(999)).at(-1).seconds, 999)
assert.equal(addRecord(long, rec(999))[0].seconds, 1)

// only areas that moved are shown; a review of old work adds nothing
const areas = [
  { slug: 'dw', label: 'DataWeave', solved: 5, total: 20 },
  { slug: 'ms', label: 'MuleSoft', solved: 7, total: 10 },
]
assert.deepEqual(coverageGains(areas, { dw: 3, ms: 7 }).map((a) => [a.label, a.gained, a.percent]), [['DataWeave', 2, 25]])
assert.deepEqual(coverageGains(areas, {}), [])

// stored data: a good session survives, anything bad is dropped so it can't trap you in focus mode
const known = (id) => ['a', 'b', 'c'].includes(id)
assert.equal(validSession(s, known), s)
assert.equal(validSession(stepAway(s, at(1)), known)?.awaySince, at(1))
assert.ok(validSession(finish(s, at(25)), known))
for (const bad of [
  null,
  'x',
  {},
  { ...s, queue: [] },
  { ...s, queue: ['a', 'gone'] },
  { ...s, startedAt: 'never' },
  { ...s, minutes: 0 },
  { ...s, at: 3 },
  { ...s, at: -1 },
  { ...s, leaves: 'x' },
  { ...s, awayMs: null },
  { ...s, solved: null },
  { ...s, awaySince: 'never' },
  { ...s, endedAt: at(5) },
  { ...s, endedAt: 'never', record: rec(1) },
]) {
  assert.equal(validSession(bad, known), null)
}
assert.equal(validRecord(rec(10)), true)
for (const bad of [null, {}, rec(NaN), rec(1, { finished: 'a' }), rec(1, { day: 3 }), rec(1, { passed: null })]) {
  assert.equal(validRecord(bad), false)
}

console.log('focus session rules: all checks pass')
