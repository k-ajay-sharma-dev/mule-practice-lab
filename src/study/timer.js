// Problem timer rules. Plain functions with no page or storage code, so scripts/check-timer.js can test them.
//
// entry.timer   { firstStartedAt, startedAt, minutes, resets, pauses, pausedAt?, held?, idle? }: the attempt in progress
// entry.timeLog [{ at, seconds, totalSeconds, minutes, resets, pauses }]: finished attempts, oldest first
//
// The clock only runs while the problem is open. Leaving sets pausedAt, and coming back moves the start times forward
// by the time away, so every sum below stays the same. A reset restarts the countdown but keeps firstStartedAt, so
// totalSeconds always shows the real time spent on the problem. Pauses stay on record, as resets do.
// held marks a pause made with the button: it lasts until the button resumes it, even if you leave and come back.
// idle marks a pause made after a minute without activity. It starts at the last activity, so that minute is given back,
// and it ends at the next activity. It is not counted in pauses: you did not choose it.

export const BLINK_MS = 60000 // under a minute left
export const LOW_MS = 5 * 60000
const STALE_MS = 12 * 3600000 // an attempt this old was abandoned, not still being worked on
const LOG_SIZE = 20
export const IDLE_MS = 60000 // no key, mouse or touch for this long means you stepped away
export const BRIEF_MS = 5000 // a page reload pauses too, and that is not stepping away

export const startTimer = (minutes, now) => ({ firstStartedAt: now, startedAt: now, minutes, resets: 0, pauses: 0 })

// A reset while paused stays paused, at the full time. The pause so far is taken out of the total, as a resume would do.
export function resetTimer(timer, now) {
  const next = { ...timer, startedAt: now, resets: timer.resets + 1 }
  if (!timer.pausedAt) return next
  const away = Math.max(0, Date.parse(now) - Date.parse(timer.pausedAt))
  return { ...next, pausedAt: now, firstStartedAt: new Date(Date.parse(timer.firstStartedAt) + away).toISOString() }
}

// A saved attempt keeps the target it started with. When the problem's estimate changes later, the attempt moves to
// the new target and keeps the time already spent, so the clock and the estimate on the page always agree.
export const retargetTimer = (timer, minutes) => (minutes > 0 && timer.minutes !== minutes ? { ...timer, minutes } : timer)

export const pauseTimer = (timer, now, held = false) => (timer.pausedAt ? timer : { ...timer, pausedAt: now, ...(held && { held }) })

// Stops the clock when nothing has happened since lastMs. The same timer comes back when there is nothing to do.
export function idleTimer(timer, lastMs, nowMs) {
  if (timer.pausedAt || nowMs - lastMs < IDLE_MS) return timer
  const from = Math.max(lastMs, Date.parse(timer.startedAt)) // never before the attempt began
  return { ...pauseTimer(timer, new Date(Math.min(from, nowMs)).toISOString()), idle: true }
}

export function resumeTimer(timer, now) {
  if (!timer.pausedAt) return timer
  const { pausedAt, held, idle, ...rest } = timer
  const away = Math.max(0, Date.parse(now) - Date.parse(pausedAt))
  const later = (iso) => new Date(Date.parse(iso) + away).toISOString()
  return {
    ...rest,
    startedAt: later(timer.startedAt),
    firstStartedAt: later(timer.firstStartedAt),
    pauses: (timer.pauses ?? 0) + (held || (!idle && away >= BRIEF_MS) ? 1 : 0),
  }
}

export function validTimer(t) {
  if (!t || typeof t !== 'object') return null
  const dated = (v) => typeof v === 'string' && !isNaN(Date.parse(v))
  if (!dated(t.startedAt) || !dated(t.firstStartedAt) || !(t.minutes > 0) || !Number.isInteger(t.resets)) return null
  if (t.pausedAt != null && !dated(t.pausedAt)) return null
  return t
}

const stoppedAt = (timer, nowMs) => (timer.pausedAt ? Date.parse(timer.pausedAt) : nowMs)

// Negative once time is up.
export const remainingMs = (timer, nowMs) => Date.parse(timer.startedAt) + timer.minutes * 60000 - stoppedAt(timer, nowMs)

// A paused attempt is waiting for you, however long you are away.
export const isStale = (timer, nowMs) => !timer.pausedAt && nowMs - Date.parse(timer.startedAt) > STALE_MS

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
  if (isStale(timer, Date.parse(now))) return { timer: null }
  const end = stoppedAt(timer, Date.parse(now))
  const seconds = Math.max(0, Math.round((end - Date.parse(timer.startedAt)) / 1000))
  const totalSeconds = Math.max(seconds, Math.round((end - Date.parse(timer.firstStartedAt)) / 1000))
  const log = Array.isArray(entry.timeLog) ? entry.timeLog : []
  const record = { at: now, seconds, totalSeconds, minutes: timer.minutes, resets: timer.resets, pauses: timer.pauses ?? 0 }
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
