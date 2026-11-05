// Problem timer rules: the countdown, resets that cannot hide time, what gets recorded, and bad stored data.
import assert from 'node:assert/strict'
import { BLINK_MS, clock, finishTimer, inTime, isStale, LOW_MS, remainingMs, resetTimer, startTimer, timerLevel, validTimer } from '../src/study/timer.js'

const at = (minutes) => new Date(Date.parse('2026-11-05T10:00:00.000Z') + minutes * 60000).toISOString()
const ms = (minutes) => Date.parse(at(minutes))
const t = startTimer(30, at(0))

// countdown
assert.equal(remainingMs(t, ms(0)), 30 * 60000)
assert.equal(remainingMs(t, ms(10)), 20 * 60000)
assert.equal(remainingMs(t, ms(32)), -2 * 60000)

// levels, including the exact edges
assert.equal(timerLevel(LOW_MS), 'ok')
assert.equal(timerLevel(LOW_MS - 1), 'low')
assert.equal(timerLevel(BLINK_MS), 'low')
assert.equal(timerLevel(BLINK_MS - 1), 'last')
assert.equal(timerLevel(1), 'last')
assert.equal(timerLevel(0), 'over')
assert.equal(timerLevel(-5000), 'over')

// the clock
assert.equal(clock(30 * 60000), '30:00')
assert.equal(clock(59001), '01:00')
assert.equal(clock(59000), '00:59')
assert.equal(clock(0), '00:00')
assert.equal(clock(-135000), '02:15')
assert.equal(clock(3725000), '1:02:05')

// a clean solve is recorded and stops the timer
const clean = finishTimer({ timer: t }, at(12.5))
assert.equal(clean.timer, null)
assert.deepEqual(clean.timeLog, [{ at: at(12.5), seconds: 750, totalSeconds: 750, minutes: 30, resets: 0 }])
assert.ok(inTime(clean.timeLog[0]))

// a reset restarts the countdown but cannot hide the time: the total and the count stay on record
const reset = resetTimer(t, at(25))
assert.equal(remainingMs(reset, ms(25)), 30 * 60000)
assert.equal(reset.firstStartedAt, at(0))
const afterReset = finishTimer({ timer: resetTimer(reset, at(40)) }, at(50)).timeLog[0]
assert.equal(afterReset.seconds, 600)
assert.equal(afterReset.totalSeconds, 3000)
assert.equal(afterReset.resets, 2)
assert.equal(inTime(afterReset), false) // 10 minutes since the reset, but 50 in total against a 30 minute target
assert.ok(inTime(finishTimer({ timer: resetTimer(t, at(5)) }, at(20)).timeLog[0])) // a reset that hid nothing

// over time is still recorded, and marked
const late = finishTimer({ timer: t }, at(31)).timeLog[0]
assert.equal(inTime(late), false)
assert.ok(inTime(finishTimer({ timer: t }, at(30)).timeLog[0]))

// earlier attempts are kept, and the log has a limit
const old = Array.from({ length: 25 }, (_, i) => ({ at: at(i), seconds: i, totalSeconds: i, minutes: 30, resets: 0 }))
const log = finishTimer({ timer: t, timeLog: old }, at(5)).timeLog
assert.equal(log.length, 20)
assert.equal(log.at(-1).seconds, 300)

// no timer running: nothing changes, so a re-solve keeps the history as it is
assert.deepEqual(finishTimer({}, at(1)), {})
assert.deepEqual(finishTimer({ timer: null, timeLog: old }, at(1)), {})
assert.deepEqual(finishTimer(undefined, at(1)), {})

// an abandoned attempt is dropped, not recorded as a 13-hour solve
assert.equal(isStale(t, ms(11 * 60)), false)
assert.equal(isStale(t, ms(13 * 60)), true)
assert.deepEqual(finishTimer({ timer: t }, at(13 * 60)), { timer: null })

// a clock moved backwards must not record a negative time
assert.equal(finishTimer({ timer: t }, at(-5)).timeLog[0].seconds, 0)

// bad stored data is ignored
for (const bad of [null, 'x', {}, { ...t, startedAt: 'nope' }, { ...t, firstStartedAt: 3 }, { ...t, minutes: 0 }, { ...t, resets: 'a' }]) {
  assert.equal(validTimer(bad), null)
  assert.deepEqual(finishTimer({ timer: bad }, at(1)), {})
}
assert.deepEqual(validTimer(t), t)

console.log('All timer checks pass.')
