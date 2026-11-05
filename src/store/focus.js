import { useSyncExternalStore } from 'react'
import { problemById } from '../data/problems.js'
import { addRecord, DEFAULT_GOAL, finishSession, FOCUS_GOALS, startSession, validRecord, validSession } from '../study/focus.js'
import { writeLocal } from './local.js'
import { todayKey } from './progress.js'

// The running session stays on this device: it belongs to the browser it runs in. Its history and the goal are synced.
const CURRENT_KEY = 'pl.focus.current'
const HISTORY_KEY = 'pl.focus.history'
const GOAL_KEY = 'pl.focus.goal'

const listeners = new Set()

function readSession() {
  try {
    return validSession(JSON.parse(localStorage.getItem(CURRENT_KEY)), (id) => problemById.has(id))
  } catch {
    return null
  }
}

let session = readSession()

function save(next) {
  session = next
  try {
    if (next) localStorage.setItem(CURRENT_KEY, JSON.stringify(next))
    else localStorage.removeItem(CURRENT_KEY)
  } catch {
    // storage blocked: the session lasts for this visit
  }
  listeners.forEach((l) => l())
}

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const useFocusSession = () => useSyncExternalStore(subscribe, () => session)

export const beginFocus = (options) => save(startSession({ ...options, now: new Date().toISOString() }))

export function updateFocus(change) {
  if (!session) return
  const next = change(session)
  if (next !== session) save(next)
}

export function finishFocus(progress, reason) {
  if (!session || session.endedAt) return
  const goal = readFocusGoal()
  const ended = finishSession(session, {
    now: new Date().toISOString(),
    reason,
    progress,
    goal,
    dayOf: (iso) => todayKey(new Date(iso)),
  })
  writeLocal(HISTORY_KEY, JSON.stringify(addRecord(readFocusHistory(), ended.record)))
  save(ended)
}

export const closeFocus = () => save(null)

export function readFocusHistory() {
  try {
    const list = JSON.parse(localStorage.getItem(HISTORY_KEY))
    return Array.isArray(list) ? list.filter(validRecord) : []
  } catch {
    return []
  }
}

export function readFocusGoal() {
  try {
    const goal = Number(localStorage.getItem(GOAL_KEY))
    return FOCUS_GOALS.includes(goal) ? goal : DEFAULT_GOAL
  } catch {
    return DEFAULT_GOAL
  }
}

export const saveFocusGoal = (goal) => writeLocal(GOAL_KEY, String(goal))
