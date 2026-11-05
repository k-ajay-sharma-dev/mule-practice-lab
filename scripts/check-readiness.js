// Readiness rules: an area must earn "ready" with evidence, and nothing here may flatter the result.
import assert from 'node:assert/strict'
import { RETAKE_FOCUS } from '../src/quiz/exam.js'
import { areaReport, collectAnswers, latestTimes, MIN_ANSWERS, MIN_TIMED, overview, sortAreas, topicSpeed } from '../src/study/readiness.js'

const today = '2026-11-05'
const quizItems = Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, exercise: 'quiz' }))
const codeItems = quizItems.map((p) => ({ ...p, exercise: 'code' }))
const solvedFirst = (n) => Object.fromEntries(quizItems.slice(0, n).map((p) => [p.id, { status: 'solved' }]))
const answers = (right, wrong) => [
  ...Array.from({ length: right }, () => ({ id: 'p0', ok: true })),
  ...Array.from({ length: wrong }, () => ({ id: 'p0', ok: false })),
]
const record = (seconds, minutes = 10) => ({ seconds, totalSeconds: seconds, minutes, resets: 0 })
const fastTimes = (n, seconds = 300) => new Map(quizItems.slice(0, n).map((p) => [p.id, record(seconds)]))
const area = (over = {}) =>
  areaReport({ slug: 's', label: 'L', items: quizItems, progress: {}, review: {}, answers: [], times: new Map(), today, ...over })

// nothing done
assert.equal(area().level, 'not-started')
assert.equal(area().accuracy, null)
assert.equal(area().inTime, null)

// everything in place
const full = { progress: solvedFirst(6), answers: answers(8, 2), times: fastTimes(5) }
assert.equal(area(full).level, 'ready')
assert.deepEqual(area(full).gaps, [])

// each missing piece of evidence blocks "ready" on its own
assert.notEqual(area({ ...full, progress: solvedFirst(5) }).level, 'ready')
assert.notEqual(area({ ...full, answers: answers(MIN_ANSWERS - 1, 0) }).level, 'ready')
assert.notEqual(area({ ...full, times: fastTimes(MIN_TIMED - 1) }).level, 'ready')

// a small sample is reported as unknown, never as a score: 9 of 9 right is not 100%
assert.equal(area({ answers: answers(9, 0) }).accuracy, null)
assert.equal(area({ answers: answers(10, 0) }).accuracy, 100)

// weak results block it, at the exact edges
assert.equal(area({ ...full, answers: answers(7, 3) }).level, 'ready')
assert.equal(area({ ...full, answers: answers(13, 7) }).level, 'close') // 65%
assert.equal(area({ ...full, answers: answers(4, 6) }).level, 'building') // 40%: coverage can't rescue it
const slow = new Map(quizItems.slice(0, 5).map((p, i) => [p.id, record(i < 3 ? 300 : 900)])) // 3 of 5 in time
assert.equal(area({ ...full, times: slow }).inTime, 60)
assert.notEqual(area({ ...full, times: slow }).level, 'ready')

// a pile of overdue reviews blocks it, but reviews due today are not overdue
const dueOn = (date, n) => Object.fromEntries(quizItems.slice(0, n).map((p) => [p.id, { due: date }]))
assert.equal(area({ ...full, review: dueOn('2026-11-01', 3) }).level, 'ready')
assert.equal(area({ ...full, review: dueOn('2026-11-01', 4) }).overdue, 4)
assert.notEqual(area({ ...full, review: dueOn('2026-11-01', 4) }).level, 'ready')
assert.equal(area({ ...full, review: dueOn(today, 9) }).overdue, 0)

// an area with no quizzes isn't asked for exam evidence it could never get
const code = { items: codeItems, progress: solvedFirst(6), times: fastTimes(5) }
assert.equal(area(code).examined, false)
assert.equal(area(code).level, 'ready')

// weak results are the first thing to fix, ahead of missing evidence
assert.equal(area({ progress: solvedFirst(1), answers: answers(5, 5) }).gaps[0].kind, 'accuracy')
assert.match(area({ progress: solvedFirst(1) }).gaps[0].text, /Solve 5 more/)

// answers: retakes are left out, recent ones only, and both histories count
const exam = (id) => ({ focus: 'Everything', results: [{ id, ok: true }] })
const collected = collectAnswers(
  [{ focus: RETAKE_FOCUS, results: [{ id: 'retake', ok: true }] }, ...Array.from({ length: 12 }, (_, i) => exam(`e${i}`))],
  [{ results: [{ id: 'm', solved: false }] }],
)
assert.equal(collected.length, 11)
assert.ok(!collected.some((a) => a.id === 'retake' || a.id === 'e10'))
assert.deepEqual(collected.at(-1), { id: 'm', ok: false })

// times: the latest attempt counts, and bad data is skipped
const times = latestTimes({
  a: { timeLog: [record(900), record(100)] },
  b: { timeLog: [] },
  c: { timeLog: 'x' },
  d: { timeLog: [{ seconds: 1 }] },
  e: null,
  f: {},
})
assert.deepEqual([...times.keys()], ['a'])
assert.equal(times.get('a').totalSeconds, 100)

// topic speed: slowest first, thin topics left out, and a reset can't flatter the pace
const reset = { seconds: 60, totalSeconds: 1200, minutes: 10, resets: 1 }
const speed = topicSpeed(
  [
    { slug: 'quick', title: 'Q', ids: new Set(['a', 'b', 'c']) },
    { slug: 'slow', title: 'S', ids: new Set(['d', 'e', 'f']) },
    { slug: 'thin', title: 'T', ids: new Set(['g', 'h']) },
  ],
  new Map([['a', record(300)], ['b', record(300)], ['c', record(300)], ['d', reset], ['e', reset], ['f', reset], ['g', record(1)], ['h', record(1)]]),
)
assert.deepEqual(speed.map((t) => [t.slug, t.pace, t.inTime]), [['slow', 200, 0], ['quick', 50, 100]])

// sorting and the summary
const sorted = sortAreas([area(full), area(), area({ progress: solvedFirst(3) })])
assert.deepEqual(sorted.map((a) => a.level), ['not-started', 'close', 'ready'])
const summary = overview([area(full), area()], answers(8, 2), fastTimes(5))
assert.deepEqual(summary, { ready: 1, total: 2, accuracy: 80, inTime: 100, overdue: 0 })
assert.equal(overview([], answers(1, 0), new Map()).accuracy, null)

console.log('All readiness checks pass.')
