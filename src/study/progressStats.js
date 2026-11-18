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
// Each unfinished attempt as { start, end } in milliseconds, kept when its first start falls in the range
function openSpans(progress, from, to, nowMs) {
  const spans = []
  for (const [id, e] of Object.entries(progress)) {
    const t = e?.timer
    if (!t || !problemById.has(id) || typeof t.firstStartedAt !== 'string' || typeof t.startedAt !== 'string') continue
    const first = Date.parse(t.firstStartedAt)
    const startDay = isNaN(first) ? null : dayKey(new Date(first))
    if (!startDay || (from && startDay < from) || (to && startDay > to)) continue
    if (!t.pausedAt && nowMs - Date.parse(t.startedAt) > STALE_MS) continue
    const end = t.pausedAt ? Date.parse(t.pausedAt) : nowMs
    if (end > first) spans.push({ start: first, end })
  }
  return spans
}

export function openAttempts(progress, from, to = null, nowMs = Date.now()) {
  let seconds = 0
  let count = 0
  for (const s of openSpans(progress, from, to, nowMs)) {
    const sec = Math.round((s.end - s.start) / 1000)
    if (sec > 0) {
      seconds += sec
      count++
    }
  }
  return { seconds, count }
}

// Today hour by hour: minutes practised in each hour, problems solved in it, and the running time so far.
// A solve keeps only its total time, and attempts can overlap when two problems are open, so each piece of time is
// packed into the free minutes before it ended: before the solve, or before the pause (or now) for an unfinished
// attempt. No hour holds more than 60 minutes. Time that does not fit after midnight goes in the first hour shown, so
// the running total ends on the same number as the Time practised card.
export function hourBuckets({ events, progress, day: dayKeyIn = null, now = new Date() }) {
  const day = dayKeyIn ? new Date(`${dayKeyIn}T00:00:00`) : startOfDay(now)
  const isToday = dayKey(day) === dayKey(now)
  const dayMs = day.getTime()
  const today = dayKey(day)
  const nowMs = now.getTime()
  const seconds = new Array(24).fill(0)
  const solved = new Array(24).fill(0)
  const free = new Array(24 * 60).fill(60) // seconds still free in each minute of today
  let early = 0
  const items = []
  const seen = new Set()
  for (const ev of events) {
    if (ev.day !== today) continue
    const at = Date.parse(ev.at)
    if (!seen.has(ev.id)) {
      seen.add(ev.id)
      solved[new Date(at).getHours()]++
    }
    if (ev.seconds > 0) items.push({ end: at, sec: ev.seconds })
  }
  for (const s of openSpans(progress, today, today, nowMs)) items.push({ end: s.end, sec: (s.end - s.start) / 1000 })
  for (const it of items.sort((a, b) => a.end - b.end)) {
    let left = it.sec
    let m = Math.min(24 * 60, Math.ceil((it.end - dayMs) / 60000)) - 1
    for (; m >= 0 && left > 0; m--) {
      const take = Math.min(free[m], left)
      free[m] -= take
      seconds[Math.floor(m / 60)] += take
      left -= take
    }
    early += left
  }
  // a past day runs to its last active hour, today to the current hour
  let last = isToday ? now.getHours() : 23
  if (!isToday) {
    while (last > 5 && !seconds[last] && !solved[last]) last--
  }
  // from the first hour with anything in it, showing at least six hours
  let start = Math.max(0, last - 5)
  for (let h = 0; h < last; h++) if (seconds[h] > 0 || solved[h] > 0) { start = Math.min(start, h); break }
  seconds[start] += early
  const label = (h) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), h).toLocaleTimeString(undefined, { hour: 'numeric' })
  const list = []
  let run = 0
  for (let h = start; h <= last; h++) {
    run += seconds[h]
    list.push({ from: `h${h}`, to: `h${h}`, label: label(h), unit: 'hour', seconds: Math.round(seconds[h]), solved: solved[h], runSeconds: Math.round(run) })
  }
  return list
}

// Problems solved and seconds practised on each day, as counted by the Today view: solves with their time, the
// first solves the activity log holds, and unfinished attempts on the day they started.
export function dayTotals({ events, activity, progress, nowMs = Date.now() }) {
  const days = new Map()
  const get = (day) => {
    if (!days.has(day)) days.set(day, { ids: new Set(), logged: 0, seconds: 0 })
    return days.get(day)
  }
  for (const ev of events) {
    const d = get(ev.day)
    d.ids.add(ev.id)
    d.seconds += ev.seconds
  }
  for (const [day, a] of Object.entries(activity)) if (a?.solved) get(day).logged += a.solved
  for (const s of openSpans(progress, null, null, nowMs)) get(dayKey(new Date(s.start))).seconds += (s.end - s.start) / 1000
  const out = new Map()
  for (const [day, d] of days) out.set(day, { solved: Math.max(d.ids.size, d.logged), seconds: Math.round(d.seconds) })
  return out
}

// A day meets the goal when both targets are reached. The streak counts back from today, or from yesterday while
// today is still in progress.
export const goalMet = (t, goal) => !!t && t.solved >= goal.solved && t.seconds >= goal.minutes * 60
export function goalStreak(totals, goal, now = new Date()) {
  let d = startOfDay(now)
  if (!goalMet(totals.get(dayKey(d)), goal)) d = addDays(d, -1)
  let n = 0
  while (goalMet(totals.get(dayKey(d)), goal)) {
    n++
    d = addDays(d, -1)
  }
  return n
}

// The first day each problem was solved
export function firstSolves(events) {
  const first = new Map()
  for (const ev of events) if (!first.has(ev.id)) first.set(ev.id, ev.day)
  return first
}

export const PERIODS = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'all', label: 'All time' },
  { key: 'custom', label: 'Custom' },
]

// The first day of a period, as a day key; null means from the start. Weeks start on Monday.
export function periodStart(key, now = new Date()) {
  const today = startOfDay(now)
  if (key === 'today') return dayKey(today)
  if (key === 'yesterday') return dayKey(addDays(today, -1))
  if (key === 'week') return dayKey(addDays(today, -((today.getDay() + 6) % 7)))
  if (key === 'month') return dayKey(new Date(today.getFullYear(), today.getMonth(), 1))
  return null
}

// The last day of a period, as a day key; null means up to today
export const periodEnd = (key, now = new Date()) => (key === 'yesterday' ? dayKey(addDays(startOfDay(now), -1)) : null)

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
