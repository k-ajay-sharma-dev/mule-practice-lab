// Voice recording helpers: format choice, file names, durations and microphone errors.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { AUDIO_BITS, clipName, expired, KEEP_RECORDINGS, MAX_SAVED_BYTES, micProblem, pickFormat, saveProblem, speakingTime } from '../src/study/recording.js'

const supports = (...types) => (t) => types.includes(t)

assert.equal(pickFormat(supports('audio/webm;codecs=opus', 'audio/mp4')), 'audio/webm;codecs=opus') // Chrome
assert.equal(pickFormat(supports('audio/mp4')), 'audio/mp4') // Safari
assert.equal(pickFormat(supports('audio/ogg;codecs=opus')), 'audio/ogg;codecs=opus')
assert.equal(pickFormat(() => false), '')

assert.equal(clipName(3, 'audio/webm;codecs=opus'), 'interview-answer-3.webm')
assert.equal(clipName(1, 'audio/mp4'), 'interview-answer-1.m4a')
assert.equal(clipName(2, 'audio/ogg'), 'interview-answer-2.ogg')
assert.equal(clipName(4, ''), 'interview-answer-4.webm')

assert.equal(speakingTime(0), '0:00')
assert.equal(speakingTime(7.4), '0:07')
assert.equal(speakingTime(59.6), '1:00')
assert.equal(speakingTime(125), '2:05')
assert.equal(speakingTime(-3), '0:00')

assert.match(micProblem('NotAllowedError'), /blocked/)
assert.match(micProblem('SecurityError'), /blocked/)
assert.match(micProblem('NotFoundError'), /No microphone/)
assert.match(micProblem('NotReadableError'), /Another app/)
assert.match(micProblem('Whatever'), /couldn't be started/)

// the longest answer the site allows must fit, with room for the variation real encoders produce
const longest = (180 * AUDIO_BITS) / 8
assert.ok(longest * 1.5 < MAX_SAVED_BYTES, `${longest} bytes`)
assert.ok(MAX_SAVED_BYTES < 1048576)

// the rules must enforce the same limit as the page
assert.ok(readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8').includes(`size() <= ${MAX_SAVED_BYTES}`))

// only what is past the limit is deleted, and the newest are kept
const list = Array.from({ length: KEEP_RECORDINGS + 2 }, (_, i) => i)
assert.deepEqual(expired(list), [KEEP_RECORDINGS, KEEP_RECORDINGS + 1])
assert.deepEqual(expired([1, 2]), [])

assert.match(saveProblem({ code: 'permission-denied' }), /publish the new rules/)
assert.match(saveProblem(new Error('signed-out')), /sign in/)
assert.match(saveProblem(new Error('x')), /connection/)

console.log('All recording checks pass.')
