// Practice exam rules: question choice, scoring, the pass mark, topic scores and stored-session checks.
import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { chooseQuestions, examSummary, itemKey, PASS_MARK, scoreExam, seenInHistory, topicScores, validSession } from '../src/quiz/exam.js'

const single = { type: 'single', prompt: 'p', options: ['a', 'b'], answer: 1, explain: 'e' }
const multi = { type: 'multi', prompt: 'p', options: ['a', 'b', 'c'], answer: [0, 2], explain: 'e' }
const order = { type: 'order', prompt: 'p', items: ['a', 'b', 'c'], explain: 'e' }
const match = { type: 'match', prompt: 'p', pairs: [['a', '1'], ['b', '2'], ['c', '3']], explain: 'e' }
const problem = (id, n) => ({ id, quiz: Array.from({ length: n }, () => single) })

// spread: every problem is used once before any is used twice
const five = ['a', 'b', 'c', 'd', 'e'].map((id) => problem(id, 4))
const spread = chooseQuestions(five, 5)
assert.equal(new Set(spread.map((i) => i.id)).size, 5)

// a small pool goes round again, never repeats a question, and stops when it runs out
const small = chooseQuestions([problem('a', 3), problem('b', 2)], 20)
assert.equal(small.length, 5)
assert.equal(new Set(small.map(itemKey)).size, 5)

// recent questions are avoided while fresh ones remain
const seen = new Set(['a:0', 'a:1', 'a:2'])
assert.deepEqual(chooseQuestions([problem('a', 4)], 1, seen), [{ id: 'a', q: 3 }])
assert.equal(chooseQuestions([problem('a', 4)], 4, seen).length, 4)

// scoring
const questions = [single, multi, order, match]
const items = questions.map((_, q) => ({ id: 'x', q }))
const questionOf = (item) => questions[item.q]
const right = { 'x:0': 1, 'x:1': [2, 0], 'x:2': [0, 1, 2], 'x:3': { 0: 0, 1: 1, 2: 2 } }
assert.ok(scoreExam(items, right, questionOf).every((r) => r.ok && r.answered))
const blank = scoreExam(items, {}, questionOf)
assert.ok(blank.every((r) => !r.ok && !r.answered))
const partial = { 'x:0': 0, 'x:1': [0], 'x:2': [1, 0, 2], 'x:3': { 0: 0, 1: 1 } }
assert.ok(scoreExam(items, partial, questionOf).every((r) => !r.ok && r.answered))

// the pass mark uses the exact figure, not the rounded one
const results = (correct, total) => Array.from({ length: total }, (_, i) => ({ id: 'x', q: i, ok: i < correct }))
assert.equal(PASS_MARK, 70)
assert.deepEqual(examSummary(results(14, 20)), { correct: 14, total: 20, pct: 70, passed: true })
assert.equal(examSummary(results(13, 20)).passed, false)
const nearly = examSummary(results(39, 56)) // 69.64%
assert.equal(nearly.pct, 70)
assert.equal(nearly.passed, false)
assert.deepEqual(examSummary([]), { correct: 0, total: 0, pct: 0, passed: false })

// topics: weakest first, and a topic with one question is left out
const topics = [
  { slug: 'strong', ids: new Set(['a']) },
  { slug: 'weak', ids: new Set(['b']) },
  { slug: 'thin', ids: new Set(['c']) },
]
const mixed = [
  { id: 'a', ok: true }, { id: 'a', ok: true },
  { id: 'b', ok: false }, { id: 'b', ok: true },
  { id: 'c', ok: false },
]
assert.deepEqual(topicScores(mixed, topics).map((t) => [t.slug, t.pct]), [['weak', 50], ['strong', 100]])

assert.deepEqual([...seenInHistory([{ results: [{ id: 'a', q: 1 }] }, { results: [{ id: 'b', q: 0 }] }])], ['a:1', 'b:0'])

// stored sessions
const known = (id) => id === 'a'
const stored = { items: [{ id: 'a', q: 0 }, { id: 'gone', q: 0 }, { id: 'a', q: -1 }, null], startedIso: '2026-11-05T10:00:00.000Z', minutes: 40, current: 9 }
const session = validSession(stored, known)
assert.deepEqual(session.items, [{ id: 'a', q: 0 }])
assert.equal(session.current, 0)
assert.deepEqual(session.responses, {})
assert.deepEqual(session.flagged, [])
for (const bad of [null, 'x', [], { items: [] }, { ...stored, startedIso: 'nope' }, { ...stored, minutes: 0 }, { ...stored, finishedIso: stored.startedIso }])
  assert.equal(validSession(bad, known), null)

// real content: every quiz question must grade right when answered right, or an exam could mark a correct answer wrong
const root = new URL('../src/content/', import.meta.url)
let checked = 0
for (const category of readdirSync(root)) {
  for (const file of readdirSync(new URL(`${category}/`, root))) {
    const { default: p } = await import(pathToFileURL(new URL(`${category}/${file}`, root).pathname.slice(1)))
    if (!p.quiz) continue
    const list = p.quiz.map((_, q) => ({ id: p.id, q }))
    const answers = Object.fromEntries(
      p.quiz.map((q, i) => [
        `${p.id}:${i}`,
        q.type === 'order' ? q.items.map((_, n) => n) : q.type === 'match' ? Object.fromEntries(q.pairs.map((_, n) => [n, n])) : q.answer,
      ]),
    )
    const scored = scoreExam(list, answers, (item) => p.quiz[item.q])
    assert.ok(scored.every((r) => r.ok), p.id)
    checked += scored.length
  }
}

console.log(`All exam checks pass (${checked} real questions graded).`)
