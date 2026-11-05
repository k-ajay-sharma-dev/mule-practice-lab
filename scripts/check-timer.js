// Problem timer rules: the countdown, resets that cannot hide time, what gets recorded, and bad stored data.
import assert from 'node:assert/strict'
import { BLINK_MS, clock, finishTimer, inTime, isStale, LOW_MS, pauseTimer, remainingMs, resetTimer, resumeTimer, startTimer, timerLevel, validTimer } from '../src/study/timer.js'

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
assert.deepEqual(clean.timeLog, [{ at: at(12.5), seconds: 750, totalSeconds: 750, minutes: 30, resets: 0, pauses: 0 }])
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

// leaving stops the clock: the time away counts for nothing, on the countdown or the total
const away = pauseTimer(t, at(10))
assert.equal(remainingMs(away, ms(10)), 20 * 60000)
assert.equal(remainingMs(away, ms(500)), 20 * 60000)
assert.equal(pauseTimer(away, at(20)).pausedAt, at(10)) // pausing twice keeps the first time
const back = resumeTimer(away, at(100))
assert.equal(back.pausedAt, undefined)
assert.equal(back.pauses, 1)
assert.equal(remainingMs(back, ms(100)), 20 * 60000)
assert.equal(remainingMs(back, ms(105)), 15 * 60000)
assert.deepEqual(finishTimer({ timer: back }, at(105)).timeLog[0], { at: at(105), seconds: 900, totalSeconds: 900, minutes: 30, resets: 0, pauses: 1 })
assert.equal(resumeTimer(t, at(5)), t) // already running
assert.equal(resumeTimer(pauseTimer(t, at(10)), at(10.05)).pauses, 0) // a page reload is not a pause

// a reset still keeps the real total across a pause
const both = resetTimer(resumeTimer(pauseTimer(t, at(10)), at(60)), at(70))
const bothLog = finishTimer({ timer: both }, at(75)).timeLog[0]
assert.equal(bothLog.seconds, 300)
assert.equal(bothLog.totalSeconds, 1500) // 10 + 10 + 5 minutes on the problem, not the 50 away
assert.equal(bothLog.resets, 1)

// a paused attempt waits, however long, and a solve while paused stops at the moment you left
assert.equal(isStale(away, ms(48 * 60)), false)
assert.equal(finishTimer({ timer: away }, at(48 * 60)).timeLog[0].seconds, 600)
assert.equal(remainingMs(resumeTimer(away, at(48 * 60)), ms(48 * 60)), 20 * 60000)

// the pause button holds until resumed, and always counts, however short
const held = pauseTimer(t, at(10), true)
assert.equal(held.held, true)
assert.equal(remainingMs(held, ms(90)), 20 * 60000)
assert.equal(isStale(held, ms(48 * 60)), false)
const released = resumeTimer(held, at(10.01))
assert.equal(released.held, undefined)
assert.equal(released.pauses, 1)
assert.equal(pauseTimer(held, at(20)), held)

// a timer saved before pausing existed still works
const { pauses: _, ...oldTimer } = t
assert.equal(finishTimer({ timer: oldTimer }, at(1)).timeLog[0].pauses, 0)
assert.equal(resumeTimer(pauseTimer(oldTimer, at(1)), at(9)).pauses, 1)

// bad stored data is ignored
for (const bad of [null, 'x', {}, { ...t, pausedAt: 'nope' }, { ...t, startedAt: 'nope' }, { ...t, firstStartedAt: 3 }, { ...t, minutes: 0 }, { ...t, resets: 'a' }]) {
  assert.equal(validTimer(bad), null)
  assert.deepEqual(finishTimer({ timer: bad }, at(1)), {})
}
assert.deepEqual(validTimer(t), t)

console.log('All timer checks pass.')
