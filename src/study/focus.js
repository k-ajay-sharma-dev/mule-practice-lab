import { BRIEF_MS } from './timer.js'

// Focus session rules. Plain functions with no page or storage code, so scripts/check-focus.js can test them.
//
// A session is { startedAt, minutes, queue, at, leaves, awayMs, awaySince?, solved, endedAt?, reason?, record? }.
// queue holds the plan's problem ids and at points to the open one. solved holds the solved count per category at the
// start, so the summary can show what the session added. The clock is a fixed block: stepping away does not stop it.
// A record is the finished session as kept in the history, oldest first.

export const FOCUS_MINUTES = [25, 50]
export const BREAK_MINUTES = 5
export const FOCUS_GOALS = [1, 2, 3, 4]
export const DEFAULT_GOAL = 2
export const NEXT_DELAY_SECONDS = 6 // long enough to read the result before the next problem opens
const COUNT_SHARE = 0.6 // a session stopped sooner than this doesn't count towards the goal
const HISTORY_SIZE = 200

export const startSession = ({ minutes, queue, solved, now }) => ({
  startedAt: now,
  minutes,
  queue,
  at: 0,
  leaves: 0,
  awayMs: 0,
  solved,
})

const endMs = (session) => Date.parse(session.startedAt) + session.minutes * 60000

export const sessionLeftMs = (session, nowMs) => endMs(session) - nowMs

export const currentId = (session) => session.queue[session.at]

export const isLastItem = (session) => session.at >= session.queue.length - 1

export const moveOn = (session) => ({ ...session, at: session.at + 1 })

export const stepAway = (session, now) => (session.awaySince ? session : { ...session, awaySince: now })

// A reload or a glance at another tab isn't leaving, so only a real absence is counted. All of it comes off the time on task.
export function comeBack(session, now) {
  if (!session.awaySince) return session
  const { awaySince, ...rest } = session
  const away = Math.max(0, Date.parse(now) - Date.parse(awaySince))
  return { ...rest, awayMs: session.awayMs + away, leaves: session.leaves + (away >= BRIEF_MS ? 1 : 0) }
}

// Only a solve made during the session counts, so a problem solved yesterday can't finish itself.
export function solvedInSession(id, session, progress) {
  const at = progress[id]?.solvedAt
  return typeof at === 'string' && Date.parse(at) >= Date.parse(session.startedAt)
}

// The session can't end later than its own clock, even if you come back to it the next day.
export function finishSession(session, { now, reason, progress, goal, dayOf }) {
  const endedAt = new Date(Math.min(Date.parse(now), endMs(session))).toISOString()
  const closed = comeBack(session, endedAt)
  const finished = session.queue.filter((id) => solvedInSession(id, session, progress))
  const worked = Date.parse(endedAt) - Date.parse(session.startedAt) - closed.awayMs
  const record = {
    at: session.startedAt,
    day: dayOf(session.startedAt),
    minutes: session.minutes,
    seconds: Math.max(0, Math.round(worked / 1000)),
    leaves: closed.leaves,
    finished,
    passed: session.queue.slice(0, session.at).filter((id) => !finished.includes(id)).length,
    reason,
    goal,
  }
  return { ...closed, endedAt, reason, record }
}

export const minutesToCount = (minutes) => Math.ceil(minutes * COUNT_SHARE)

// Clearing the whole plan counts however quick it was: there was nothing left to do.
export function countsToGoal(record) {
  if (record.reason === 'plan' && record.finished.length > 0 && record.passed === 0) return true
  return record.seconds >= minutesToCount(record.minutes) * 60
}

export const sessionsOn = (history, day) => history.filter((r) => r.day === day && countsToGoal(r))

export const addRecord = (history, record) => [...history, record].slice(-HISTORY_SIZE)

// Days in a row with the goal reached, ending today, or yesterday while today is still open. Each past day is judged by
// the goal set at the time, so raising the goal doesn't erase a streak.
export function focusStreak(history, goal, keyOf, date = new Date()) {
  const reached = (day, target) => {
    const list = sessionsOn(history, day)
    return list.length > 0 && list.length >= (target ?? list.at(-1).goal)
  }
  const day = new Date(date)
  let n = 0
  if (reached(keyOf(day), goal)) n++
  day.setDate(day.getDate() - 1)
  while (reached(keyOf(day))) {
    n++
    day.setDate(day.getDate() - 1)
  }
  return n
}

// areas are [{ slug, label, solved, total }] as they stand now. Only areas that moved are returned.
export function coverageGains(areas, before) {
  return areas
    .map((a) => ({ ...a, gained: a.solved - (before[a.slug] ?? a.solved), percent: Math.round((a.solved / a.total) * 100) }))
    .filter((a) => a.gained > 0)
}

// Stored data is checked before use: an old or corrupt session is dropped rather than trapping you in focus mode.
export function validSession(s, isKnown) {
  if (!s || typeof s !== 'object' || !Array.isArray(s.queue) || !s.queue.length || !s.queue.every(isKnown)) return null
  const dated = (v) => typeof v === 'string' && !isNaN(Date.parse(v))
  if (!dated(s.startedAt) || !(s.minutes > 0) || !Number.isInteger(s.at) || s.at < 0 || s.at >= s.queue.length) return null
  if (!Number.isInteger(s.leaves) || !Number.isFinite(s.awayMs) || !s.solved || typeof s.solved !== 'object') return null
  if (s.awaySince != null && !dated(s.awaySince)) return null
  if (s.endedAt != null && !(dated(s.endedAt) && validRecord(s.record))) return null
  return s
}

export const validRecord = (r) =>
  Boolean(r) &&
  typeof r.day === 'string' &&
  r.minutes > 0 &&
  Number.isFinite(r.seconds) &&
  Number.isInteger(r.leaves) &&
  Array.isArray(r.finished) &&
  Number.isInteger(r.passed)
