// Answer check rules, tried on made-up answers and on every follow-up on the site.
import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { checkAnswer, pointsOf, speechProblem } from '../src/study/answer-check.js'

// points
assert.deepEqual(pointsOf('First point here. Second point there.'), ['First point here', 'Second point there'])
assert.deepEqual(pointsOf('Use a retry, e.g. with backoff. Then stop.').length, 2)
assert.deepEqual(pointsOf('- one idea\n- other idea'), ['one idea', 'other idea'])
assert.deepEqual(pointsOf('It is. Retries help.'), ['Retries help'])
assert.deepEqual(pointsOf('Read config.yaml first.'), ['Read config.yaml first'])

// matching
const question = 'Why does zip hide a data problem?'
const answer = 'If one list is short, the extra items disappear without an error. Compare lengths first.'
assert.deepEqual(checkAnswer('', question, answer).covered, 0)
assert.equal(checkAnswer('extra items disappear because one list is short', question, answer).covered, 1)
assert.equal(checkAnswer(answer, question, answer).covered, 2)
// the words of the question earn nothing
assert.equal(checkAnswer('zip hides a data problem', question, 'Zip hides a data problem when the list is short.').covered, 0)
// spoken forms meet written ones
assert.equal(checkAnswer('merge with overwrites keys', 'q', 'Use `mergeWith` to overwrite keys.').covered, 1)
assert.equal(checkAnswer('it retried the request', 'q', 'Retries repeat a request.').covered, 1)

assert.match(speechProblem('not-allowed'), /blocked/)
assert.match(speechProblem('network'), /connection/)
assert.equal(speechProblem('no-speech'), null)
assert.equal(speechProblem('aborted'), null)

// real content: the model answer earns every point, nothing earns none, and someone else's answer earns few
const cards = []
for (const category of readdirSync('src/content')) {
  for (const file of readdirSync(`src/content/${category}`)) {
    const p = (await import(pathToFileURL(resolve('src/content', category, file)).href)).default
    cards.push(...(p.followUps ?? []))
  }
}
let points = 0
let wrongCovered = 0
cards.forEach((card, i) => {
  const own = checkAnswer(card.a, card.q, card.a)
  assert.ok(own.total > 0, `no points in: ${card.a}`)
  assert.equal(own.covered, own.total, `model answer misses a point: ${card.a}`)
  assert.equal(checkAnswer('', card.q, card.a).covered, 0)
  const other = cards[(i + 97) % cards.length]
  wrongCovered += checkAnswer(other.a, card.q, card.a).covered
  points += own.total
})
const share = Math.round((wrongCovered / points) * 1000) / 10
assert.ok(share < 5, `an unrelated answer covers ${share}% of points`)

console.log(`All answer checks pass (${cards.length} follow-ups, ${points} points, unrelated answers cover ${share}%).`)
