// Numbers for the Dashboard page, worked out from what the stores already keep:
//   pl.progress  entry.solvedAt (last graded solve) and entry.timeLog [{ at, totalSeconds, minutes }] (each timed solve)
//   pl.activity  { 'YYYY-MM-DD': { actions, solved } }, where solved counts problems solved for the first time that day
// Plain functions with no page code, so a script can test them on their own.
import { problemById } from '../data/problems.js'

export const dayKey = (d) => d.toLocaleDateString('en-CA')
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)

// Every graded solve with a time, oldest first. A timed solve writes solvedAt and a timeLog record with the same time,
// so solvedAt only adds an event when the log does not already hold it.
export function solveEvents(progress) {
  const events = []
  for (const [id, e] of Object.entries(progress)) {
    if (!e || typeof e !== 'object' || !problemById.has(id)) continue
    const seen = new Set()
    for (const r of Array.isArray(e.timeLog) ? e.timeLog : []) {
      if (typeof r?.at !== 'string') continue
      seen.add(r.at)
      events.push({
        id,
        at: r.at,
        seconds: Number(r.totalSeconds) || 0,
        inTime: r.minutes > 0 ? r.totalSeconds <= r.minutes * 60 : null,
      })
    }
    if (typeof e.solvedAt === 'string' && !seen.has(e.solvedAt)) events.push({ id, at: e.solvedAt, seconds: 0, inTime: null })
  }
  for (const ev of events) ev.day = dayKey(new Date(ev.at))
  return events.sort((a, b) => a.at.localeCompare(b.at))
}

// Time on attempts not finished yet: problems opened and worked on but not solved, and "Time it again" runs not
// solved yet. The clock only runs while the problem is open, so the time from the first start to the pause (or to now,
// while it is open) is the time spent. An attempt left running for over 12 hours was abandoned, as in study/timer.js.
const STALE_MS = 12 * 3600000
export function openAttempts(progress, from, to = null, nowMs = Date.now()) {
  let seconds = 0
  let count = 0
  for (const [id, e] of Object.entries(progress)) {
    const t = e?.timer
    if (!t || !problemById.has(id) || typeof t.firstStartedAt !== 'string' || typeof t.startedAt !== 'string') continue
    const first = Date.parse(t.firstStartedAt)
    const startDay = isNaN(first) ? null : dayKey(new Date(first))
    if (!startDay || (from && startDay < from) || (to && startDay > to)) continue
    if (!t.pausedAt && nowMs - Date.parse(t.startedAt) > STALE_MS) continue
    const end = t.pausedAt ? Date.parse(t.pausedAt) : nowMs
    const s = Math.max(0, Math.round((end - first) / 1000))
    if (s > 0) {
      seconds += s
      count++
    }
  }
  return { seconds, count }
}

// The first day each problem was solved
export function firstSolves(events) {
  const first = new Map()
  for (const ev of events) if (!first.has(ev.id)) first.set(ev.id, ev.day)
  return first
}

export const PERIODS = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'all', label: 'All time' },
  { key: 'custom', label: 'Custom' },
]

// The first day of a period, as a day key; null means from the start. Weeks start on Monday.
export function periodStart(key, now = new Date()) {
  const today = startOfDay(now)
  if (key === 'today') return dayKey(today)
  if (key === 'week') return dayKey(addDays(today, -((today.getDay() + 6) % 7)))
  if (key === 'month') return dayKey(new Date(today.getFullYear(), today.getMonth(), 1))
  return null
}

// Totals for one period, from and to as day keys (either may be null for an open end)
export function periodSummary({ events, activity, first, from, to = null }) {
  const inRange = (day) => (!from || day >= from) && (!to || day <= to)
  const evs = events.filter((e) => inRange(e.day))
  const ids = new Set(evs.map((e) => e.id))
  let firstTime = 0
  for (const day of first.values()) if (inRange(day)) firstTime++
  let actions = 0
  let activeDays = 0
  let activitySolved = 0
  for (const [day, a] of Object.entries(activity)) {
    if (!inRange(day) || !a) continue
    actions += a.actions || 0
    activitySolved += a.solved || 0
    if (a.actions > 0 || a.solved > 0) activeDays++
  }
  const timed = evs.filter((e) => e.seconds > 0)
  const seconds = timed.reduce((s, e) => s + e.seconds, 0)
  const judged = evs.filter((e) => e.inTime !== null)
  const newCount = Math.max(firstTime, activitySolved)
  return {
    // older solves may only be counted in the activity log, so take whichever is higher
    solved: Math.max(ids.size, newCount),
    firstTime: newCount,
    again: Math.max(0, ids.size - firstTime),
    actions,
    activeDays,
    seconds,
    avgSeconds: timed.length ? Math.round(seconds / timed.length) : 0,
    inTimePct: judged.length ? Math.round((judged.filter((e) => e.inTime).length / judged.length) * 100) : null,
    ids,
    events: evs,
  }
}

// Buckets for the charts: days, weeks or months, with how many problems were solved in each and the running total of
// problems solved at least once by the end of it. `base` counts solved problems that carry no date at all.
export function buckets({ period, events, activity, first, base, from = null, to = null, now = new Date() }) {
  const today = startOfDay(now)
  let list = []
  if (period === 'custom' && from && to) {
    // a day per bar up to about a month, then a week per bar up to half a year, then a month per bar
    const a = new Date(`${from}T00:00:00`)
    const b = new Date(`${to}T00:00:00`)
    const days = Math.round((b - a) / 86400000) + 1
    if (days <= 35) {
      for (let i = 0; i < days; i++) {
        const d = addDays(a, i)
        list.push({ from: dayKey(d), to: dayKey(d), label: d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }), unit: 'day' })
      }
    } else if (days <= 190) {
      for (let d = a; d <= b; d = addDays(d, 7)) {
        const end = addDays(d, 6) > b ? b : addDays(d, 6)
        list.push({ from: dayKey(d), to: dayKey(end), label: d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }), unit: 'week' })
      }
    } else {
      for (let m = new Date(a.getFullYear(), a.getMonth(), 1); m <= b; m = new Date(m.getFullYear(), m.getMonth() + 1, 1)) {
        const start = m < a ? a : m
        const endOfMonth = new Date(m.getFullYear(), m.getMonth() + 1, 0)
        const end = endOfMonth > b ? b : endOfMonth
        list.push({ from: dayKey(start), to: dayKey(end), label: `${m.toLocaleDateString(undefined, { month: 'short' })} '${String(m.getFullYear()).slice(2)}`, unit: 'month' })
      }
    }
  } else if (period === 'today' || period === 'week') {
    const n = period === 'today' ? 14 : 28
    for (let i = n - 1; i >= 0; i--) {
      const d = addDays(today, -i)
      list.push({ from: dayKey(d), to: dayKey(d), label: d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }), unit: 'day' })
    }
  } else if (period === 'month') {
    const monday = addDays(today, -((today.getDay() + 6) % 7))
    for (let i = 12; i >= 0; i--) {
      const d = addDays(monday, -7 * i)
      list.push({ from: dayKey(d), to: dayKey(addDays(d, 6)), label: d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }), unit: 'week' })
    }
  } else {
    const days = [...Object.keys(activity), ...events.map((e) => e.day)].sort()
    const last = new Date(today.getFullYear(), today.getMonth(), 1)
    // at least six months, so a new learner still sees a shape
    let m = new Date(last.getFullYear(), last.getMonth() - 5, 1)
    if (days.length) {
      const start = new Date(`${days[0]}T00:00:00`)
      const s = new Date(start.getFullYear(), start.getMonth(), 1)
      if (s < m) m = s
    }
    while (m <= last) {
      const end = new Date(m.getFullYear(), m.getMonth() + 1, 0)
      list.push({ from: dayKey(m), to: dayKey(end), label: `${m.toLocaleDateString(undefined, { month: 'short' })} '${String(m.getFullYear()).slice(2)}`, unit: 'month' })
      m = new Date(m.getFullYear(), m.getMonth() + 1, 1)
    }
    list = list.slice(-24)
  }
  const firstDays = [...first.values()].sort()
  for (const b of list) {
    const ids = new Set(events.filter((e) => e.day >= b.from && e.day <= b.to).map((e) => e.id))
    let fromActivity = 0
    for (const [day, a] of Object.entries(activity)) if (day >= b.from && day <= b.to) fromActivity += a?.solved || 0
    b.solved = Math.max(ids.size, fromActivity)
    b.total = base + firstDays.filter((d) => d <= b.to).length
  }
  return list
}

export function formatDuration(seconds) {
  if (!seconds) return '0 min'
  const m = Math.round(seconds / 60)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  return `${h} h ${m % 60} min`
}
