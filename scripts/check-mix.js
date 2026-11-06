// Rules for choosing several topics or levels: even mixing, no repeats, and what an empty choice means.
import assert from 'node:assert/strict'
import { choiceLabel, DEFAULT_LEVELS, evenMix, fitsLevels, LEVEL_OPTIONS } from '../src/study/mix.js'

const p = (id, level = 'BEGINNER') => ({ id, level })
const big = ['a', 'b', 'c', 'd', 'e'].map((id) => p(id))
const small = [p('x')]

// a small topic comes up early, not after the big one runs out
assert.deepEqual(evenMix([big, small]).slice(0, 3).map((x) => x.id), ['a', 'x', 'b'])
assert.equal(evenMix([big, small]).length, 6)

// a problem in two topics counts once
assert.deepEqual(evenMix([[p('a'), p('b')], [p('a'), p('c')]]).map((x) => x.id), ['a', 'b', 'c'])

// the order function is applied to each list, and nothing chosen gives nothing to mix
assert.deepEqual(evenMix([big], (l) => [...l].reverse())[0].id, 'e')
// order gets only the list, so a shuffle with an optional second argument works
assert.deepEqual(evenMix([big, small], (l, extra) => (assert.equal(extra, undefined), l)).length, 6)
assert.deepEqual(evenMix([]), [])
assert.deepEqual(evenMix([[], []]), [])

// levels: nothing chosen means every level
assert.equal(fitsLevels([])(p('a', 'EXPERT')), true)
assert.equal(fitsLevels(['BEGINNER', 'EXPERT'])(p('a', 'EXPERT')), true)
assert.equal(fitsLevels(['BEGINNER', 'EXPERT'])(p('a', 'ADVANCED')), false)
for (const level of DEFAULT_LEVELS) assert.ok(LEVEL_OPTIONS.some((o) => o.value === level))

// labels
assert.equal(choiceLabel([]), 'Everything')
assert.equal(choiceLabel([], 'Any level'), 'Any level')
assert.equal(choiceLabel(['Kafka', 'Security']), 'Kafka, Security')
assert.equal(choiceLabel(['Kafka', 'Security', 'Testing', 'Files']), 'Kafka, Security +2 more')

console.log('All mix checks pass.')
