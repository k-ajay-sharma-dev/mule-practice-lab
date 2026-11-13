import { useSyncExternalStore } from 'react'
import { finishTimer } from '../study/timer.js'
import { writeLocal } from './local.js'
import { noteSolve } from './solves.js'

// Local progress store. Each entry is keyed by problem id:
// { status, code, answer, notes, checkedPoints, revealed, updatedAt }
// Activity is a per-day log for the dashboard: { 'YYYY-MM-DD': { actions, solved } }
const STORAGE_KEY = 'pl.progress'
const ACTIVITY_KEY = 'pl.activity'
const EMPTY = Object.freeze({})

let state = load(STORAGE_KEY)
let activity = load(ACTIVITY_KEY)
const listeners = new Set()

// a function declaration, not a const: load() below runs during module start-up, above this line
function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

// Anything that is not a plain object (old format, hand-edited, corrupt) starts fresh rather than crashing.
function load(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key))
    return isPlainObject(value) ? value : {}
  } catch {
    return {}
  }
}

function save(key, value) {
  writeLocal(key, JSON.stringify(value))
}

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const getSnapshot = () => state
const getActivitySnapshot = () => activity

export const todayKey = (d = new Date()) => d.toLocaleDateString('en-CA')

// `graded` marks a real success (tests passed, checks passed, all answers right, rated Solved). Autosaves of an
// already-solved problem also send status 'solved', but they must not count as solving it again.
export function updateEntry(id, patch, { graded = false } = {}) {
  const prev = isPlainObject(state[id]) ? state[id] : {}
  const now = new Date().toISOString()
  const solvedNow = graded && patch.status === 'solved'
  // solvedAt marks each graded solve, so a mock interview can tell what was solved during the session
  const solvedAt = solvedNow ? { solvedAt: now } : {}
  // every kind of solve passes through here, so this is where the time gets recorded
  const timed = solvedNow ? finishTimer(prev, now) : {}
  state = { ...state, [id]: { ...prev, ...patch, ...solvedAt, ...timed, updatedAt: now } }
  save(STORAGE_KEY, state)

  // Flagging a problem puts it on the review schedule; solving it again when due moves it along.
  if (patch.status === 'revisit') scheduleReview(id, false)
  else if (solvedNow && review[id] && review[id].due <= todayKey()) reviewOutcome(id, true, false)

  const day = todayKey()
  const today = activity[day] || { actions: 0, solved: 0 }
  const newlySolved = patch.status === 'solved' && prev.status !== 'solved'
  if (solvedNow && newlySolved) noteSolve('Problem solved', id)
  activity = { ...activity, [day]: { actions: today.actions + 1, solved: today.solved + (newlySolved ? 1 : 0) } }
  save(ACTIVITY_KEY, activity)

  listeners.forEach((l) => l())
}

// Saved apart from updateEntry, because opening a problem starts the clock and that must not count as practice.
export function setTimer(id, timer) {
  const prev = isPlainObject(state[id]) ? state[id] : {}
  state = { ...state, [id]: { ...prev, timer, updatedAt: new Date().toISOString() } }
  save(STORAGE_KEY, state)
  listeners.forEach((l) => l())
}

export function useActivity() {
  return useSyncExternalStore(subscribe, getActivitySnapshot)
}

export function getEntry(id) {
  return isPlainObject(state[id]) ? state[id] : EMPTY
}

// Editing a problem marks it attempted, but never downgrades solved/revisit.
export function workedStatus(id) {
  const current = getEntry(id).status
  return current === 'solved' || current === 'revisit' ? current : 'attempted'
}

export function useProgress() {
  return useSyncExternalStore(subscribe, getSnapshot)
}

export function useEntry(id) {
  const entry = useProgress()[id]
  return isPlainObject(entry) ? entry : EMPTY
}

export function statusOf(entry) {
  return (isPlainObject(entry) && entry.status) || 'not-started'
}

// ---------- Spaced review ----------
// pl.review: { id: { step, due: 'YYYY-MM-DD', added } }. A miss (wrong answer, Partial, Revisit) brings a
// problem back tomorrow; each success when due pushes it further out, and after the last step it graduates.
const REVIEW_KEY = 'pl.review'
export const REVIEW_INTERVALS = [1, 3, 7, 21]

// Keeps only well-formed entries, so one bad value can't break the review list or the nav badge.
const DAY = /^\d{4}-\d{2}-\d{2}$/
const loadReview = () =>
  Object.fromEntries(
    Object.entries(load(REVIEW_KEY)).filter(
      ([, r]) => isPlainObject(r) && typeof r.due === 'string' && DAY.test(r.due) && Number.isInteger(r.step),
    ),
  )
let review = loadReview()
const getReviewSnapshot = () => review

// Re-reads everything from storage and refreshes the screen — used after cloud sync brings in changes
// made on another device.
export function reloadFromStorage() {
  state = load(STORAGE_KEY)
  activity = load(ACTIVITY_KEY)
  review = loadReview()
  listeners.forEach((l) => l())
}

function addDays(n) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return todayKey(d)
}

function saveReview(next, notify = true) {
  review = next
  save(REVIEW_KEY, review)
  if (notify) listeners.forEach((l) => l())
}

// Puts a problem (back) at the start of the schedule: due tomorrow.
export function scheduleReview(id, notify = true) {
  saveReview({ ...review, [id]: { step: 0, due: addDays(REVIEW_INTERVALS[0]), added: review[id]?.added ?? todayKey() } }, notify)
}

export function removeReview(id) {
  removeReviews([id])
}

export function removeReviews(ids) {
  if (!ids.length) return
  saveReview(Object.fromEntries(Object.entries(review).filter(([id]) => !ids.includes(id))))
}

export const getReview = () => review

// Records a review: success moves to the next interval (or graduates), a miss starts over.
export function reviewOutcome(id, success, notify = true) {
  const item = review[id]
  if (!success) return scheduleReview(id, notify)
  // kept on the entry because a finished review leaves the schedule, and today's plan still has to count it
  const now = new Date().toISOString()
  state = { ...state, [id]: { ...(isPlainObject(state[id]) ? state[id] : {}), reviewedAt: now, updatedAt: now } }
  save(STORAGE_KEY, state)
  const step = (item?.step ?? -1) + 1
  if (step >= REVIEW_INTERVALS.length) {
    const { [id]: _, ...rest } = review
    return saveReview(rest, notify)
  }
  saveReview({ ...review, [id]: { ...item, step, due: addDays(REVIEW_INTERVALS[step]) } }, notify)
}

export function useReview() {
  return useSyncExternalStore(subscribe, getReviewSnapshot)
}
