// Problem timer rules. Plain functions with no page or storage code, so scripts/check-timer.js can test them.
//
// entry.timer   { firstStartedAt, startedAt, minutes, resets }: the attempt in progress
// entry.timeLog [{ at, seconds, totalSeconds, minutes, resets }]: finished attempts, oldest first
//
// The clock runs on real time from when the problem opened, so leaving the page does not stop it. A reset restarts
// the countdown but keeps firstStartedAt, so totalSeconds always shows the real time spent.

export const BLINK_MS = 60000 // under a minute left
export const LOW_MS = 5 * 60000
const STALE_MS = 12 * 3600000 // an attempt this old was abandoned, not still being worked on
const LOG_SIZE = 20

export const startTimer = (minutes, now) => ({ firstStartedAt: now, startedAt: now, minutes, resets: 0 })

export const resetTimer = (timer, now) => ({ ...timer, startedAt: now, resets: timer.resets + 1 })

export function validTimer(t) {
  if (!t || typeof t !== 'object') return null
  const dated = (v) => typeof v === 'string' && !isNaN(Date.parse(v))
  if (!dated(t.startedAt) || !dated(t.firstStartedAt) || !(t.minutes > 0) || !Number.isInteger(t.resets)) return null
  return t
}

// Negative once time is up.
export const remainingMs = (timer, nowMs) => Date.parse(timer.startedAt) + timer.minutes * 60000 - nowMs

export const isStale = (timer, nowMs) => nowMs - Date.parse(timer.startedAt) > STALE_MS

export function timerLevel(remaining) {
  if (remaining <= 0) return 'over'
  if (remaining < BLINK_MS) return 'last'
  if (remaining < LOW_MS) return 'low'
  return 'ok'
}

// Stops the attempt when a problem is solved and returns what to merge into the entry.
// A stale attempt is dropped unrecorded: a 40-hour "solve" would only mean the problem was left open.
export function finishTimer(entry, now) {
  const timer = validTimer(entry?.timer)
  if (!timer) return {}
  const end = Date.parse(now)
  if (isStale(timer, end)) return { timer: null }
  const seconds = Math.max(0, Math.round((end - Date.parse(timer.startedAt)) / 1000))
  const totalSeconds = Math.max(seconds, Math.round((end - Date.parse(timer.firstStartedAt)) / 1000))
  const log = Array.isArray(entry.timeLog) ? entry.timeLog : []
  const record = { at: now, seconds, totalSeconds, minutes: timer.minutes, resets: timer.resets }
  return { timer: null, timeLog: [...log, record].slice(-LOG_SIZE) }
}

// Judged on the total, or resetting just before solving would turn any overrun into a pass.
export const inTime = (record) => record.totalSeconds <= record.minutes * 60

// Rounds up, so the display reaches 00:00 exactly when the time is gone rather than a second early.
export function clock(ms) {
  const total = Math.ceil(Math.abs(ms) / 1000)
  const hours = Math.floor(total / 3600)
  const pad = (n) => String(n).padStart(2, '0')
  const rest = `${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`
  return hours ? `${hours}:${rest}` : rest
}
